import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getStrictCorsHeaders, handleCorsPrelight, errorResponse } from '../_shared/security-helpers.ts';
import { validateAneelBandeiras } from '../_shared/zod-schemas.ts';

// ═══════════════════════════════════════════════════════════════
// ZERO HARDCODE - Config loaded from database
// ═══════════════════════════════════════════════════════════════
const FALLBACK_API_URL = 'https://dadosabertos.aneel.gov.br/api/3/action/datastore_search_sql';
const FALLBACK_RESOURCE_ID = '0591b8f6-fe54-437b-b72b-1aa2efd46e42';
const FALLBACK_TIMEOUT_MS = 60000;
const FALLBACK_MAX_RETRIES = 3;
const FALLBACK_RETRY_DELAY_BASE_MS = 2000;

// Mapeamento de bandeiras (fallback - também pode vir do DB)
const FALLBACK_BANDEIRA_MAP: Record<string, string> = {
  'verde': 'verde',
  'amarela': 'amarela',
  'vermelha 1': 'vermelha1',
  'vermelha patamar 1': 'vermelha1',
  'vermelha 2': 'vermelha2',
  'vermelha patamar 2': 'vermelha2',
  'escassez hídrica': 'escassez',
};

interface AneelBandeirasConfig {
  apiUrl: string;
  resourceId: string;
  timeoutMs: number;
  maxRetries: number;
  retryDelayBaseMs: number;
  bandeiraMap: Record<string, string>;
}

let cachedConfig: AneelBandeirasConfig | null = null;
let configLoadedAt = 0;
const CONFIG_CACHE_TTL_MS = 5 * 60 * 1000;

async function loadConfig(supabase: any): Promise<AneelBandeirasConfig> {
  const now = Date.now();
  if (cachedConfig && (now - configLoadedAt) < CONFIG_CACHE_TTL_MS) {
    return cachedConfig;
  }

  try {
    const { data } = await supabase
      .from('configuracoes_sistema')
      .select('chave, valor')
      .in('chave', [
        'aneel_bandeiras_api_url',
        'aneel_bandeiras_resource_id',
        'aneel_bandeiras_timeout_ms',
        'aneel_bandeiras_max_retries',
        'aneel_bandeiras_retry_delay_base_ms',
        'aneel_bandeiras_map',
      ]);

    const configMap = new Map<string, string>();
    for (const row of data || []) {
      configMap.set(row.chave, row.valor);
    }

    let bandeiraMap = FALLBACK_BANDEIRA_MAP;
    const mapStr = configMap.get('aneel_bandeiras_map');
    if (mapStr) {
      try {
        bandeiraMap = JSON.parse(mapStr);
      } catch (parseErr) {
        console.warn('[aneel-bandeiras] Failed to parse bandeira map, using fallback:', parseErr);
        // Keep using FALLBACK_BANDEIRA_MAP
      }
    }

    cachedConfig = {
      apiUrl: configMap.get('aneel_bandeiras_api_url') || FALLBACK_API_URL,
      resourceId: configMap.get('aneel_bandeiras_resource_id') || FALLBACK_RESOURCE_ID,
      timeoutMs: parseInt(configMap.get('aneel_bandeiras_timeout_ms') || '', 10) || FALLBACK_TIMEOUT_MS,
      maxRetries: parseInt(configMap.get('aneel_bandeiras_max_retries') || '', 10) || FALLBACK_MAX_RETRIES,
      retryDelayBaseMs: parseInt(configMap.get('aneel_bandeiras_retry_delay_base_ms') || '', 10) || FALLBACK_RETRY_DELAY_BASE_MS,
      bandeiraMap,
    };
    configLoadedAt = now;
    console.log('[aneel-bandeiras] Config loaded from DB');
    return cachedConfig;
  } catch (err) {
    console.warn('[aneel-bandeiras] Failed to load config, using fallbacks:', err);
    return {
      apiUrl: FALLBACK_API_URL,
      resourceId: FALLBACK_RESOURCE_ID,
      timeoutMs: FALLBACK_TIMEOUT_MS,
      maxRetries: FALLBACK_MAX_RETRIES,
      retryDelayBaseMs: FALLBACK_RETRY_DELAY_BASE_MS,
      bandeiraMap: FALLBACK_BANDEIRA_MAP,
    };
  }
}

function normalizeBandeira(nome: string, bandeiraMap: Record<string, string>): string {
  const normalized = nome.toLowerCase().trim();
  return bandeiraMap[normalized] || normalized.replace(/\s+/g, '');
}

function parseValor(valorStr: string): number {
  // Valor vem em R$/MWh, precisamos converter para R$/kWh
  // Formato pode ser "18,85" ou "18.85"
  const valorMWh = parseFloat(valorStr.replace(',', '.'));
  return valorMWh / 1000; // Converter para R$/kWh
}

function formatAnoMes(dataStr: string): string {
  // DatCompetencia vem como "2026-01-01" ou similar
  const date = new Date(dataStr);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

async function fetchWithRetry(url: string, config: AneelBandeirasConfig): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    try {
      console.log(`Attempt ${attempt}/${config.maxRetries} - Fetching ANEEL API...`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);
      
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'COESA-EnergySystem/1.0',
        },
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        return response;
      }
      
      lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
      console.log(`Attempt ${attempt} failed: ${lastError.message}`);
      
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.log(`Attempt ${attempt} failed: ${lastError.message}`);
    }
    
    if (attempt < config.maxRetries) {
      await new Promise(resolve => setTimeout(resolve, config.retryDelayBaseMs * attempt));
    }
  }
  
  throw lastError || new Error('Failed to fetch after retries');
}

serve(async (req) => {
  const corsHeaders = getStrictCorsHeaders(req);
  
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return handleCorsPrelight(req, { mode: 'strict' });
  }

  try {
    // Initialize Supabase client and load config
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const config = await loadConfig(supabase);

    // ═══════════════════════════════════════════════════════════════
    // INPUT VALIDATION
    // ═══════════════════════════════════════════════════════════════
    let params: {
      sync?: boolean;
      anoMes?: string;
      apenasVigente?: boolean;
      limite?: number;
    } = {};

    if (req.method === 'GET') {
      const url = new URL(req.url);
      params = {
        sync: url.searchParams.get('sync') === 'true',
        anoMes: url.searchParams.get('anoMes') || undefined,
        apenasVigente: url.searchParams.get('apenasVigente') === 'true',
        limite: parseInt(url.searchParams.get('limite') || '50'),
      };
    } else if (req.method === 'POST') {
      let rawBody: unknown;
      try {
        rawBody = await req.json();
      } catch {
        return errorResponse('Invalid JSON body', 400, req);
      }
      
      const validation = validateAneelBandeiras(rawBody);
      if (!validation.success) {
        const errorMsg = validation.errors?.map(e => `${e.field}: ${e.message}`).join(', ');
        console.warn('[aneel-bandeiras] Validation failed:', errorMsg);
        return errorResponse(`Validation failed: ${errorMsg}`, 400, req);
      }
      params = validation.data!;
    }

    const { sync = false, anoMes, apenasVigente = false, limite = 50 } = params;

    console.log('=== ANEEL Bandeiras Tarifárias ===');
    console.log('Params:', { sync, anoMes, apenasVigente, limite });

    // Build SQL query using config
    let sqlQuery = `SELECT * FROM "${config.resourceId}"`;
    
    if (anoMes) {
      // Buscar mês específico (formato YYYY-MM)
      sqlQuery += ` WHERE "DatCompetencia" LIKE '${anoMes}%'`;
    } else if (apenasVigente) {
      // Buscar apenas a bandeira mais recente
      const now = new Date();
      const currentAnoMes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      sqlQuery += ` WHERE "DatCompetencia" LIKE '${currentAnoMes}%'`;
    }
    
    sqlQuery += ` ORDER BY "DatCompetencia" DESC LIMIT ${limite}`;

    console.log('SQL Query:', sqlQuery);

    const apiUrl = `${config.apiUrl}?sql=${encodeURIComponent(sqlQuery)}`;
    
    const response = await fetchWithRetry(apiUrl, config);
    const data = await response.json();

    if (!data.success) {
      throw new Error(`ANEEL API error: ${data.error?.message || 'Unknown error'}`);
    }

    const records = data.result?.records || [];
    console.log(`Found ${records.length} records from ANEEL`);

    // Process records using config's bandeiraMap
    const bandeiras = records.map((record: any) => ({
      anoMes: formatAnoMes(record.DatCompetencia),
      dataCompetencia: record.DatCompetencia,
      bandeira: normalizeBandeira(record.NomBandeiraAcionada, config.bandeiraMap),
      bandeiraOriginal: record.NomBandeiraAcionada,
      valorKwh: parseValor(record.VlrAdicionalBandeira || '0'),
      valorMwhOriginal: record.VlrAdicionalBandeira,
    }));

    console.log('Processed bandeiras:', bandeiras.length);

    // Se modo sync, salvar no banco
    if (sync && bandeiras.length > 0) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

      if (!supabaseUrl || !supabaseKey) {
        throw new Error('Missing Supabase credentials for sync');
      }

      const supabase = createClient(supabaseUrl, supabaseKey);

      let inserted = 0;
      let updated = 0;
      let errors = 0;

      for (const bandeira of bandeiras) {
        try {
          // Check if exists
          const { data: existing } = await supabase
            .from('bandeiras_tarifarias')
            .select('id, valor_kwh')
            .eq('ano_mes', bandeira.anoMes)
            .maybeSingle();

          if (existing) {
            // Update if value changed
            if (existing.valor_kwh !== bandeira.valorKwh) {
              const { error: updateError } = await supabase
                .from('bandeiras_tarifarias')
                .update({
                  bandeira: bandeira.bandeira,
                  valor_kwh: bandeira.valorKwh,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', existing.id);

              if (updateError) {
                console.error(`Error updating ${bandeira.anoMes}:`, updateError);
                errors++;
              } else {
                updated++;
              }
            }
          } else {
            // Insert new
            const { error: insertError } = await supabase
              .from('bandeiras_tarifarias')
              .insert({
                ano_mes: bandeira.anoMes,
                bandeira: bandeira.bandeira,
                valor_kwh: bandeira.valorKwh,
              });

            if (insertError) {
              console.error(`Error inserting ${bandeira.anoMes}:`, insertError);
              errors++;
            } else {
              inserted++;
            }
          }
        } catch (err) {
          console.error(`Error processing ${bandeira.anoMes}:`, err);
          errors++;
        }
      }

      console.log(`Sync complete: ${inserted} inserted, ${updated} updated, ${errors} errors`);

      return new Response(
        JSON.stringify({
          success: true,
          sync: true,
          bandeiras,
          stats: {
            total: bandeiras.length,
            inserted,
            updated,
            errors,
          },
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Se apenasVigente, retornar apenas a mais recente
    if (apenasVigente && bandeiras.length > 0) {
      const vigente = bandeiras[0];
      
      return new Response(
        JSON.stringify({
          success: true,
          vigente: true,
          bandeira: vigente,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        bandeiras,
        total: bandeiras.length,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('Error in aneel-bandeiras:', errorMessage);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
