import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getStrictCorsHeaders, handleCorsPrelight } from '../_shared/security-helpers.ts';

interface ForceUpdateLinkRequest {
  proposalId: string;
}

Deno.serve(async (req) => {
  const corsHeaders = getStrictCorsHeaders(req);
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsPrelight(req, { mode: 'strict' });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { proposalId } = await req.json() as ForceUpdateLinkRequest;

    if (!proposalId) {
      return new Response(
        JSON.stringify({ error: 'proposalId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[bitrix24-force-update-link] Starting update for proposal: ${proposalId}`);

    // 1. Fetch proposal to get bitrix24_lead_id
    const { data: proposta, error: propostaError } = await supabase
      .from('propostas_assinantes')
      .select('id, cliente_nome, bitrix24_lead_id')
      .eq('id', proposalId)
      .single();

    if (propostaError || !proposta) {
      console.error('[bitrix24-force-update-link] Proposal not found:', propostaError);
      return new Response(
        JSON.stringify({ error: 'Proposta não encontrada', details: propostaError }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!proposta.bitrix24_lead_id) {
      console.error('[bitrix24-force-update-link] Proposal has no bitrix24_lead_id');
      return new Response(
        JSON.stringify({ error: 'Proposta não tem lead do Bitrix24 associado' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[bitrix24-force-update-link] Found proposal for ${proposta.cliente_nome}, lead ${proposta.bitrix24_lead_id}`);

    // 2. Fetch Bitrix24 configurations
    const { data: configs } = await supabase
      .from('configuracoes_sistema')
      .select('chave, valor')
      .in('chave', ['bitrix24_webhook_url', 'bitrix24_link_proposta_field', 'public_app_url', 'public_cache_bust']);

    const configMap: Record<string, string> = {};
    configs?.forEach(c => { configMap[c.chave] = c.valor; });

    const webhookUrl = configMap['bitrix24_webhook_url'];
    const linkField = configMap['bitrix24_link_proposta_field'] || 'UF_CRM_1767885928302';
    const publicAppUrl = configMap['public_app_url'] || 'https://coesasolar.com.br';
    const cacheBust = configMap['public_cache_bust'];

    if (!webhookUrl) {
      return new Response(
        JSON.stringify({ error: 'Bitrix24 webhook URL não configurada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Build public URL with typed route
    // Determinar tipo de proposta da proposta existente
    const { data: propostaFull } = await supabase
      .from('propostas_assinantes')
      .select('tipo_proposta')
      .eq('id', proposalId)
      .single();
    
    const tipoProposta = propostaFull?.tipo_proposta === 'definitiva' ? 'definitiva' : 'inicial';
    const routePath = tipoProposta === 'definitiva' ? 'proposta-definitiva' : 'proposta-inicial';
    
    const baseUrl = publicAppUrl.replace(/\/$/, '');
    let proposalUrl = `${baseUrl}/${routePath}/${proposalId}`;
    if (cacheBust) {
      proposalUrl += `?v=${cacheBust}`;
    }

    console.log(`[bitrix24-force-update-link] Built URL: ${proposalUrl}`);

    // 4. Update Bitrix24 lead with the link
    const updateUrl = `${webhookUrl}/crm.lead.update`;
    const updatePayload = {
      id: proposta.bitrix24_lead_id,
      fields: {
        [linkField]: proposalUrl,
      },
    };

    console.log(`[bitrix24-force-update-link] Updating Bitrix24 lead ${proposta.bitrix24_lead_id} with field ${linkField}`);

    const updateResponse = await fetch(updateUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatePayload),
    });

    const updateResult = await updateResponse.json();

    if (!updateResult.result) {
      console.error('[bitrix24-force-update-link] Bitrix24 update failed:', updateResult);
      return new Response(
        JSON.stringify({ error: 'Falha ao atualizar Bitrix24', details: updateResult }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[bitrix24-force-update-link] Bitrix24 lead updated successfully`);

    // 5. Add timeline comment
    const commentUrl = `${webhookUrl}/crm.timeline.comment.add`;
    const commentPayload = {
      fields: {
        ENTITY_ID: proposta.bitrix24_lead_id,
        ENTITY_TYPE: 'lead',
        COMMENT: `🔗 **Link da proposta atualizado manualmente**\n\n📄 Cliente: ${proposta.cliente_nome}\n🆔 ID: ${proposalId}\n🌐 URL: ${proposalUrl}\n\n_Atualização forçada via sistema_`,
      },
    };

    await fetch(commentUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(commentPayload),
    });

    console.log(`[bitrix24-force-update-link] Timeline comment added`);

    // 6. Log the operation
    await supabase.from('bitrix24_sync_logs').insert({
      action: 'force_update_link',
      proposta_id: proposalId,
      bitrix24_lead_id: proposta.bitrix24_lead_id,
      status: 'success',
      request_data: { linkField, proposalUrl },
      response_data: updateResult,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Link atualizado com sucesso no Bitrix24',
        data: {
          proposalId,
          leadId: proposta.bitrix24_lead_id,
          clienteNome: proposta.cliente_nome,
          proposalUrl,
          linkField,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[bitrix24-force-update-link] Error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: 'Erro interno', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
