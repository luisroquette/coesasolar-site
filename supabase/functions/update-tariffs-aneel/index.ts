/**
 * UPDATE TARIFFS - ANEEL MONITORING & MANUAL UPDATE
 * 
 * Two modes:
 * 1. CHECK: Monitors if tariffs are outdated (> 6 months) and sends alerts
 * 2. UPDATE: Manually update tariffs via API call with new values
 * 
 * The ANEEL website uses heavy JavaScript that's difficult to scrape reliably.
 * This hybrid approach ensures tariffs stay updated through admin alerts.
 * 
 * Usage:
 * - GET: Check tariff freshness and send alerts if outdated
 * - POST with body {updates: [{nome, tarifa_media, tarifa_com_impostos}]}: Update tariffs
 * 
 * @module supabase/functions/update-tariffs-aneel
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Distribuidoras atendidas (baseado na tabela concessionarias)
const DISTRIBUIDORAS_MONITORADAS = ['CEMIG-D'];

// Threshold for considering tariffs outdated (6 months)
const OUTDATED_THRESHOLD_DAYS = 180;

// Links úteis para atualização manual
const ANEEL_LINKS = {
  'CEMIG-D': 'https://www.aneel.gov.br/ranking-das-tarifas',
  'Energisa MG': 'https://www.aneel.gov.br/ranking-das-tarifas',
};

interface TariffUpdate {
  nome: string;
  tarifa_media?: number;
  tarifa_com_impostos?: number;
  te?: number;
  tusd?: number;
  pis_cofins?: number;
  vigencia_inicio?: string;
}

interface CheckResult {
  distribuidora: string;
  status: 'current' | 'outdated' | 'missing';
  lastUpdate: string | null;
  daysSinceUpdate: number | null;
  tarifaMedia: number | null;
  tarifaComImpostos: number | null;
}

interface UpdateResult {
  distribuidora: string;
  status: 'updated' | 'failed' | 'not_found';
  oldValue: number | null;
  newValue: number | null;
  error?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // POST = Manual update with new values
    if (req.method === 'POST') {
      const body = await req.json();
      
      // If body has updates array, process manual updates
      if (body.updates && Array.isArray(body.updates)) {
        return await handleManualUpdate(supabase, body.updates);
      }
    }

    // GET or POST without updates = Check freshness and alert
    return await handleFreshnessCheck(supabase);

  } catch (error) {
    console.error('[TARIFF_MONITOR] Critical error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * Check if tariffs are outdated and send alerts
 */
async function handleFreshnessCheck(
  supabase: any
): Promise<Response> {
  console.log('[TARIFF_MONITOR] Checking tariff freshness...');
  
  const results: CheckResult[] = [];
  const outdatedDistribuidoras: string[] = [];
  
  for (const nome of DISTRIBUIDORAS_MONITORADAS) {
    const { data, error } = await supabase
      .from('concessionarias')
      .select('nome, tarifa_media, tarifa_com_impostos, ultima_atualizacao')
      .ilike('nome', `%${nome}%`)
      .single();
    
    if (error || !data) {
      results.push({
        distribuidora: nome,
        status: 'missing',
        lastUpdate: null,
        daysSinceUpdate: null,
        tarifaMedia: null,
        tarifaComImpostos: null,
      });
      outdatedDistribuidoras.push(nome);
      continue;
    }
    
    const record = data as any;
    const lastUpdate = record.ultima_atualizacao ? new Date(record.ultima_atualizacao) : null;
    const daysSinceUpdate = lastUpdate 
      ? Math.floor((Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24))
      : null;
    
    const isOutdated = daysSinceUpdate === null || daysSinceUpdate > OUTDATED_THRESHOLD_DAYS;
    
    if (isOutdated) {
      outdatedDistribuidoras.push(nome);
    }
    
    results.push({
      distribuidora: record.nome,
      status: isOutdated ? 'outdated' : 'current',
      lastUpdate: record.ultima_atualizacao,
      daysSinceUpdate,
      tarifaMedia: record.tarifa_media,
      tarifaComImpostos: record.tarifa_com_impostos,
    });
  }
  
  // Send alert if any tariffs are outdated
  if (outdatedDistribuidoras.length > 0) {
    await sendOutdatedAlert(supabase, results.filter(r => r.status !== 'current'));
  }
  
  const hasOutdated = outdatedDistribuidoras.length > 0;
  
  return new Response(
    JSON.stringify({
      success: true,
      mode: 'check',
      hasOutdated,
      outdatedCount: outdatedDistribuidoras.length,
      results,
      message: hasOutdated 
        ? `${outdatedDistribuidoras.length} distribuidora(s) com tarifa desatualizada`
        : 'Todas as tarifas estão atualizadas',
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

/**
 * Handle manual tariff updates
 */
async function handleManualUpdate(
  supabase: any,
  updates: TariffUpdate[]
): Promise<Response> {
  console.log('[TARIFF_MONITOR] Processing manual updates:', updates.length);
  
  const results: UpdateResult[] = [];
  
  for (const update of updates) {
    if (!update.nome) {
      results.push({
        distribuidora: 'unknown',
        status: 'failed',
        oldValue: null,
        newValue: null,
        error: 'Nome da distribuidora é obrigatório',
      });
      continue;
    }
    
    // Get current value
    const { data } = await supabase
      .from('concessionarias')
      .select('tarifa_media, tarifa_com_impostos')
      .ilike('nome', `%${update.nome}%`)
      .single();
    
    const current = data as any;
    
    if (!current) {
      results.push({
        distribuidora: update.nome,
        status: 'not_found',
        oldValue: null,
        newValue: null,
        error: 'Distribuidora não encontrada',
      });
      continue;
    }
    
    // Build update object
    const updateData: Record<string, unknown> = {
      ultima_atualizacao: new Date().toISOString(),
    };
    
    if (update.tarifa_media !== undefined) {
      updateData.tarifa_media = update.tarifa_media;
    }
    if (update.tarifa_com_impostos !== undefined) {
      updateData.tarifa_com_impostos = update.tarifa_com_impostos;
    }
    if (update.te !== undefined) {
      updateData.te = update.te;
    }
    if (update.tusd !== undefined) {
      updateData.tusd = update.tusd;
    }
    if (update.pis_cofins !== undefined) {
      updateData.pis_cofins = update.pis_cofins;
    }
    if (update.vigencia_inicio !== undefined) {
      updateData.vigencia_inicio = update.vigencia_inicio;
    }
    
    // If only tarifa_media provided, calculate tarifa_com_impostos
    if (update.tarifa_media && !update.tarifa_com_impostos) {
      const pisCofins = update.pis_cofins || 0.0365;
      const icms = 0.18; // MG
      updateData.tarifa_com_impostos = parseFloat(
        (update.tarifa_media / (1 - pisCofins - icms)).toFixed(4)
      );
    }
    
    // Update database
    const { error: updateError } = await supabase
      .from('concessionarias')
      .update(updateData)
      .ilike('nome', `%${update.nome}%`);
    
    if (updateError) {
      results.push({
        distribuidora: update.nome,
        status: 'failed',
        oldValue: current.tarifa_media,
        newValue: update.tarifa_media || null,
        error: updateError.message,
      });
      continue;
    }
    
    console.log(`[TARIFF_MONITOR] ✅ Updated ${update.nome}:`, updateData);
    
    results.push({
      distribuidora: update.nome,
      status: 'updated',
      oldValue: current.tarifa_media,
      newValue: update.tarifa_media || null,
    });
    
    // Log the update for audit
    await supabase.from('activity_logs').insert({
      action: 'tariff_manual_update',
      entity_type: 'concessionaria',
      entity_name: update.nome,
      details: {
        old_tarifa_media: current.tarifa_media,
        new_tarifa_media: update.tarifa_media,
        old_tarifa_com_impostos: current.tarifa_com_impostos,
        new_tarifa_com_impostos: updateData.tarifa_com_impostos,
        source: 'manual_api',
      },
    });
  }
  
  const updatedCount = results.filter(r => r.status === 'updated').length;
  
  return new Response(
    JSON.stringify({
      success: true,
      mode: 'update',
      results,
      summary: {
        total: updates.length,
        updated: updatedCount,
        failed: results.filter(r => r.status === 'failed').length,
        notFound: results.filter(r => r.status === 'not_found').length,
      },
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

/**
 * Send alert to admins about outdated tariffs
 */
async function sendOutdatedAlert(
  supabase: any,
  outdated: CheckResult[]
) {
  try {
    const lines = outdated.map(r => {
      const dias = r.daysSinceUpdate ? `${r.daysSinceUpdate} dias` : 'nunca atualizada';
      return `• *${r.distribuidora}*: última atualização há ${dias}`;
    });
    
    const message = `⚠️ *ALERTA: Tarifas Desatualizadas*

As seguintes distribuidoras precisam de atualização:

${lines.join('\n')}

📋 *Ação necessária:*
1. Acesse o ranking ANEEL: https://www.aneel.gov.br/ranking-das-tarifas
2. Busque as tarifas atualizadas
3. Atualize via painel admin ou API

_Este alerta é enviado mensalmente quando tarifas têm mais de 6 meses._`;

    // Create admin notification
    await supabase.from('admin_notifications').insert({
      title: 'Tarifas Desatualizadas - Ação Necessária',
      message,
      type: 'tariff_alert',
      entity_type: 'concessionaria',
    } as any);

    console.log('[TARIFF_MONITOR] ⚠️ Outdated alert sent for:', outdated.map(r => r.distribuidora));
    
    // Try to send WhatsApp to admins
    const { data: recipients } = await supabase
      .from('daily_report_recipients')
      .select('telefone, nome')
      .eq('is_active', true);
    
    if (recipients && recipients.length > 0) {
      // Log for now - could integrate with Z-API later
      console.log(`[TARIFF_MONITOR] Would notify ${recipients.length} admins via WhatsApp`);
    }

  } catch (error) {
    console.error('[TARIFF_MONITOR] Failed to send alert:', error);
  }
}
