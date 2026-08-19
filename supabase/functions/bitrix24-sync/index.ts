import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  getCorsHeaders,
  handleCorsPrelight,
  sanitizeForLog,
} from '../_shared/security-helpers.ts';
import { validateBitrix24Sync, parseAndValidate } from '../_shared/zod-schemas.ts';

/**
 * BITRIX24 SYNC
 * 
 * Sincroniza status de propostas com o Bitrix24 CRM.
 * 
 * SECURITY: Uses strict CORS + Zod validation
 */

Deno.serve(async (req) => {
  console.log('[bitrix24-sync] Function called:', req.method);

  // CORS: This is an internal API - use strict CORS
  if (req.method === 'OPTIONS') {
    return handleCorsPrelight(req, { mode: 'strict' });
  }

  const corsHeaders = getCorsHeaders(req, { mode: 'strict' });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate and parse request body
    const parseResult = await parseAndValidate(req, validateBitrix24Sync);
    
    if (!parseResult.success) {
      console.warn('[bitrix24-sync] Validation failed:', parseResult.error);
      return new Response(
        JSON.stringify({ error: parseResult.error }),
        { status: parseResult.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = parseResult.data;
    console.log('[bitrix24-sync] Request:', JSON.stringify(sanitizeForLog(body), null, 2));

    // Get Bitrix24 configuration
    const { data: configData } = await supabase
      .from('configuracoes_sistema')
      .select('chave, valor')
      .in('chave', [
        'bitrix24_webhook_url', 
        'bitrix24_enabled', 
        'bitrix24_stage_fechado', 
        'bitrix24_stage_perdido',
        'bitrix24_stage_aguardando_assinatura'
      ]);

    const config: Record<string, string> = {};
    configData?.forEach((c) => {
      config[c.chave] = c.valor;
    });

    const bitrix24Url = config.bitrix24_webhook_url;

    if (!bitrix24Url) {
      return new Response(
        JSON.stringify({ error: 'Bitrix24 webhook URL not configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Test connection
    if (body.action === 'test_connection') {
      try {
        const testResponse = await fetch(`${bitrix24Url}/crm.lead.list?select[]=ID&limit=1`);
        const testData = await testResponse.json();

        if (testData.result) {
          return new Response(
            JSON.stringify({ success: true, message: 'Conexão estabelecida com sucesso!' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } else {
          return new Response(
            JSON.stringify({ success: false, error: testData.error_description || 'Erro desconhecido' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } catch (testError) {
        const errorMessage = testError instanceof Error ? testError.message : 'Unknown error';
        return new Response(
          JSON.stringify({ success: false, error: errorMessage }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Update status in Bitrix24
    if (body.action === 'update_status' && body.proposalId && body.status) {
      // Get proposal with Bitrix24 lead ID
      const { data: proposal } = await supabase
        .from('propostas_assinantes')
        .select('bitrix24_lead_id, cliente_nome, economia_mensal, tipo_proposta')
        .eq('id', body.proposalId)
        .single();

      if (!proposal?.bitrix24_lead_id) {
        return new Response(
          JSON.stringify({ error: 'Proposal not linked to Bitrix24' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Map COESA status to Bitrix24 stage
      let stageId: string | undefined;
      let statusText: string;

      switch (body.status) {
        case 'aceita':
          stageId = config.bitrix24_stage_aguardando_assinatura || 'UC_XIM123';
          statusText = 'ACEITA pelo cliente - Aguardando assinatura ClickSign';
          console.log('[bitrix24-sync] Proposta aceita - movendo para Aguardando Assinatura ClickSign:', stageId);
          break;
        case 'recusada':
          stageId = config.bitrix24_stage_perdido || 'LOSE';
          statusText = 'RECUSADA pelo cliente';
          break;
        default:
          statusText = `Status: ${body.status}`;
      }

      // Update lead status in Bitrix24
      const updatePayload = new URLSearchParams({
        id: proposal.bitrix24_lead_id,
        'fields[STATUS_ID]': stageId || 'IN_PROCESS',
      });

      await fetch(`${bitrix24Url}/crm.lead.update`, {
        method: 'POST',
        body: updatePayload,
      });

      // Add timeline comment
      const economia = proposal.economia_mensal
        ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(proposal.economia_mensal)
        : 'N/A';

      let commentText: string;
      if (body.status === 'aceita') {
        commentText = `🖊️ CONTRATO SOLICITADO\n\n` +
          `Cliente: ${proposal.cliente_nome}\n` +
          `Economia mensal: ${economia}\n\n` +
          `⏳ Lead movido para etapa de Aguardando Assinatura ClickSign.\n` +
          `📝 O contrato será enviado automaticamente para assinatura.`;
      } else {
        commentText = `📋 Proposta ${statusText}\n\nCliente: ${proposal.cliente_nome}\nEconomia mensal: ${economia}`;
      }

      const commentPayload = new URLSearchParams({
        'fields[ENTITY_ID]': proposal.bitrix24_lead_id,
        'fields[ENTITY_TYPE]': 'lead',
        'fields[COMMENT]': commentText,
      });

      await fetch(`${bitrix24Url}/crm.timeline.comment.add`, {
        method: 'POST',
        body: commentPayload,
      });

      // Log the sync
      await supabase.from('bitrix24_sync_logs').insert({
        proposta_id: body.proposalId,
        bitrix24_lead_id: proposal.bitrix24_lead_id,
        action: 'status_updated',
        status: 'success',
        request_data: { status: body.status, stageId, tipo_proposta: proposal.tipo_proposta },
      });

      console.log('[bitrix24-sync] Status updated in Bitrix24 for lead:', proposal.bitrix24_lead_id, 'Stage:', stageId);

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Status atualizado no Bitrix24',
          stageId
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[bitrix24-sync] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...getCorsHeaders(req, { mode: 'strict' }), 'Content-Type': 'application/json' } }
    );
  }
});