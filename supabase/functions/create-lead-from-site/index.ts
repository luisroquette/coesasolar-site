import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  getCorsHeaders,
  handleCorsPrelight,
  jsonResponse,
  errorResponse,
  sanitizeString,
  sanitizePhone,
  sanitizeEmail,
} from '../_shared/security-helpers.ts';
import { validateCreateLead, parseAndValidate } from '../_shared/zod-schemas.ts';

// CORS: This is a public endpoint (site form submission) - use permissive
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LeadData {
  nome: string;
  telefone: string;
  email: string;
  valorConta: string; // R$ 1.234,56 format
  concessionaria: string;
}

// Parse R$ format to number
function parseValorConta(valor: string): number {
  // Remove "R$", spaces, dots (thousands separator) and replace comma with dot
  const cleaned = valor
    .replace(/R\$\s*/i, '')
    .replace(/\./g, '')
    .replace(',', '.');
  return parseFloat(cleaned) || 0;
}

// Format phone to international format (5531999999999)
function formatPhoneForBitrix(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');
  
  // Add country code if missing
  if (cleaned.length === 10 || cleaned.length === 11) {
    cleaned = '55' + cleaned;
  }
  
  return cleaned;
}

Deno.serve(async (req) => {
  console.log('[create-lead-from-site] Request received:', req.method);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse and validate request body
    let leadData: LeadData;
    try {
      const rawBody = await req.json();
      
      // Sanitize inputs to prevent injection attacks
      leadData = {
        nome: sanitizeString(rawBody.nome || '', 200),
        telefone: sanitizePhone(rawBody.telefone || ''),
        email: rawBody.email || '',
        valorConta: sanitizeString(rawBody.valorConta || '', 50),
        concessionaria: sanitizeString(rawBody.concessionaria || '', 100),
      };
      
      // Validate email format
      const validEmail = sanitizeEmail(leadData.email);
      if (leadData.email && !validEmail) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Formato de email inválido',
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      leadData.email = validEmail || '';
      
    } catch {
      return new Response(JSON.stringify({
        success: false,
        error: 'Dados inválidos',
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    console.log('[create-lead-from-site] Lead data (sanitized):', {
      ...leadData,
      email: leadData.email ? '***@***' : '', // Don't log full email
    });

    // Validate required fields
    if (!leadData.nome || !leadData.telefone || !leadData.email || !leadData.valorConta || !leadData.concessionaria) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Campos obrigatórios faltando',
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // Validate phone format (10-13 digits for BR numbers)
    const phoneDigits = leadData.telefone.replace(/\D/g, '');
    if (phoneDigits.length < 10 || phoneDigits.length > 15) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Telefone inválido (deve ter 10-13 dígitos)',
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // Validate nome minimum length
    if (leadData.nome.length < 2) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Nome muito curto',
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get Bitrix24 configuration
    const { data: configRows } = await supabase
      .from('configuracoes_sistema')
      .select('chave, valor')
      .in('chave', [
        'bitrix24_webhook_url',
        'bitrix24_enabled',
        'bitrix24_status_proposta_inicial',
        'bitrix24_field_valor_conta',
        'bitrix24_field_concessionaria',
      ]);

    const config: Record<string, string> = {};
    configRows?.forEach(row => {
      config[row.chave] = row.valor;
    });

    const bitrix24Url = config.bitrix24_webhook_url;
    const bitrix24Enabled = config.bitrix24_enabled === 'true';
    const statusPropostaInicial = config.bitrix24_status_proposta_inicial || 'UC_9SLRPP';
    const fieldValorConta = config.bitrix24_field_valor_conta || 'UF_CRM_1755817510';
    const fieldConcessionaria = config.bitrix24_field_concessionaria || 'UF_CRM_1759750064';

    if (!bitrix24Enabled || !bitrix24Url) {
      console.log('[create-lead-from-site] Bitrix24 not configured or disabled');
      return new Response(JSON.stringify({
        success: false,
        error: 'Bitrix24 não configurado',
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const valorContaNumeric = parseValorConta(leadData.valorConta);
    const telefoneFormatado = formatPhoneForBitrix(leadData.telefone);

    // ═══════════════════════════════════════════════════════════════
    // RESOLVE CONCESSIONARIA LIST OPTION ID
    // ═══════════════════════════════════════════════════════════════
    let concessionariaId: string | null = null;
    
    try {
      // Fetch field definition to get list options
      const fieldsResp = await fetch(`${bitrix24Url}/crm.lead.fields`);
      const fieldsResult = await fieldsResp.json();
      
      if (fieldsResult.result && fieldsResult.result[fieldConcessionaria]) {
        const fieldDef = fieldsResult.result[fieldConcessionaria];
        const items = fieldDef.items || [];
        
        // Find matching option (case-insensitive, partial match)
        const searchName = leadData.concessionaria.toLowerCase();
        const match = items.find((item: any) => {
          const itemValue = (item.VALUE || item.value || '').toLowerCase();
          return itemValue.includes(searchName) || searchName.includes(itemValue.split(' ')[0]);
        });
        
        if (match) {
          concessionariaId = String(match.ID || match.id);
          console.log(`[create-lead-from-site] Resolved concessionaria "${leadData.concessionaria}" to ID ${concessionariaId}`);
        } else {
          console.log(`[create-lead-from-site] No match found for concessionaria "${leadData.concessionaria}"`);
        }
      }
    } catch (err) {
      console.error('[create-lead-from-site] Error resolving concessionaria:', err);
    }

    // ═══════════════════════════════════════════════════════════════
    // CREATE LEAD IN BITRIX24
    // ═══════════════════════════════════════════════════════════════
    const leadPayload: Record<string, any> = {
      fields: {
        TITLE: `[Site] ${leadData.nome}`,
        NAME: leadData.nome.split(' ')[0],
        LAST_NAME: leadData.nome.split(' ').slice(1).join(' ') || '',
        PHONE: [{ VALUE: telefoneFormatado, VALUE_TYPE: 'WORK' }],
        EMAIL: [{ VALUE: leadData.email, VALUE_TYPE: 'WORK' }],
        STATUS_ID: statusPropostaInicial,
        SOURCE_ID: 'WEB',
        COMMENTS: `Lead gerado pelo site COESA.\n\nValor da conta: ${leadData.valorConta}\nConcessionária: ${leadData.concessionaria}`,
        [fieldValorConta]: valorContaNumeric,
      },
    };

    // Add concessionaria if resolved
    if (concessionariaId) {
      leadPayload.fields[fieldConcessionaria] = concessionariaId;
    }

    console.log('[create-lead-from-site] Creating lead with payload:', JSON.stringify(leadPayload, null, 2));

    const createResp = await fetch(`${bitrix24Url}/crm.lead.add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(leadPayload),
    });

    const createResult = await createResp.json();
    console.log('[create-lead-from-site] Bitrix response:', createResult);

    if (!createResult.result) {
      console.error('[create-lead-from-site] Failed to create lead:', createResult);
      return new Response(JSON.stringify({
        success: false,
        error: 'Falha ao criar lead no CRM',
        details: createResult,
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const leadId = createResult.result;
    console.log(`[create-lead-from-site] Lead created successfully: ${leadId}`);

    // ═══════════════════════════════════════════════════════════════
    // LOG THE SYNC
    // ═══════════════════════════════════════════════════════════════
    await supabase.from('bitrix24_sync_logs').insert({
      action: 'create_from_site',
      bitrix24_lead_id: String(leadId),
      status: 'success',
      request_data: leadPayload,
      response_data: createResult,
    });

    // ═══════════════════════════════════════════════════════════════
    // PROCESS LEAD IMMEDIATELY (do not rely on Bitrix24 automation)
    // This guarantees the proposal link gets created and exported.
    // ═══════════════════════════════════════════════════════════════
    let processingResult: any = null;
    try {
      const { data: processData, error: processError } = await supabase.functions.invoke('bitrix24-webhook', {
        body: {
          action: 'process_lead',
          leadId: String(leadId),
          source: 'create_lead_from_site',
        },
      });

      if (processError) {
        console.error('[create-lead-from-site] Error invoking bitrix24-webhook:', processError);
        await supabase.from('bitrix24_sync_logs').insert({
          action: 'create_from_site_trigger_processing',
          bitrix24_lead_id: String(leadId),
          status: 'error',
          error_message: processError.message,
          request_data: { leadId: String(leadId) },
        });
      } else {
        processingResult = processData;
        await supabase.from('bitrix24_sync_logs').insert({
          action: 'create_from_site_trigger_processing',
          bitrix24_lead_id: String(leadId),
          status: 'success',
          request_data: { leadId: String(leadId) },
          response_data: processData,
        });
      }
    } catch (err) {
      console.error('[create-lead-from-site] Unexpected error triggering processing:', err);
      await supabase.from('bitrix24_sync_logs').insert({
        action: 'create_from_site_trigger_processing',
        bitrix24_lead_id: String(leadId),
        status: 'error',
        error_message: err instanceof Error ? err.message : String(err),
        request_data: { leadId: String(leadId) },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      leadId: leadId,
      proposalId: processingResult?.proposalId ?? null,
      publicUrl: processingResult?.publicUrl ?? null,
      message: processingResult?.publicUrl
        ? 'Lead criado e proposta gerada! Verifique seu WhatsApp e e-mail.'
        : 'Lead criado com sucesso! Estamos processando sua proposta.',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[create-lead-from-site] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Erro interno',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
