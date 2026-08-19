import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getStrictCorsHeaders, handleCorsPrelight } from '../_shared/security-helpers.ts';

interface SyncClienteGDRequest {
  propostaId: string;
  dados: {
    // Dados do concorrente
    nome_concorrente: string;
    desconto_concorrente: number;
    multa_rescisoria: number;
    meses_restantes_concorrente: number;
    // Dados calculados
    payback_multa_meses: number | null;
    economia_adicional_mensal: number;
    // Dados do cliente (opcionais - para criar lead novo)
    cliente_nome?: string;
    cliente_email?: string;
    cliente_telefone?: string;
    cliente_cpf_cnpj?: string;
    cliente_endereco?: string;
    cliente_cidade?: string;
    cliente_uf?: string;
    // Dados da proposta COESA
    desconto_coesa: number;
    fidelidade_anos: number;
    consumo_medio: number;
    tarifa: number;
    concessionaria?: string;
  };
}

Deno.serve(async (req) => {
  const corsHeaders = getStrictCorsHeaders(req);
  
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return handleCorsPrelight(req, { mode: 'strict' });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { propostaId, dados }: SyncClienteGDRequest = await req.json();

    console.log(`[bitrix24-sync-cliente-gd] Processing proposal: ${propostaId}`);
    console.log(`[bitrix24-sync-cliente-gd] Data received:`, JSON.stringify(dados, null, 2));

    // 1. Fetch the proposal to check if it has a Bitrix24 lead ID
    const { data: proposta, error: propostaError } = await supabase
      .from('propostas_assinantes')
      .select('bitrix24_lead_id, cliente_nome, tipo_proposta_sub')
      .eq('id', propostaId)
      .single();

    if (propostaError || !proposta) {
      console.error(`[bitrix24-sync-cliente-gd] Proposal not found:`, propostaError);
      return new Response(
        JSON.stringify({ error: 'Proposta não encontrada', details: propostaError?.message }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Fetch Bitrix24 configurations including cache bust
    const { data: configs, error: configError } = await supabase
      .from('configuracoes_sistema')
      .select('chave, valor')
      .in('chave', ['bitrix24_webhook_url', 'bitrix24_enabled', 'public_app_url', 'public_cache_bust']);

    // Fetch custom field mappings for competitor data
    const { data: customFieldConfigs } = await supabase
      .from('configuracoes_sistema')
      .select('chave, valor')
      .like('chave', 'bitrix24_custom_field_%');

    if (configError) {
      console.error(`[bitrix24-sync-cliente-gd] Error fetching configs:`, configError);
      return new Response(
        JSON.stringify({ error: 'Erro ao buscar configurações', details: configError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const configMap: Record<string, string> = {};
    configs?.forEach(c => { configMap[c.chave] = c.valor; });

    const customFieldMap: Record<string, string> = {};
    customFieldConfigs?.forEach(c => {
      const fieldName = c.chave.replace('bitrix24_custom_field_', '');
      customFieldMap[fieldName] = c.valor;
    });

    const bitrix24Url = configMap['bitrix24_webhook_url'];
    const bitrix24Enabled = configMap['bitrix24_enabled'] === 'true';
    const publicAppUrl = configMap['public_app_url'] || '';
    const publicCacheBust = configMap['public_cache_bust'] || '';

    if (!bitrix24Enabled || !bitrix24Url) {
      console.log(`[bitrix24-sync-cliente-gd] Bitrix24 not enabled or not configured`);
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Bitrix24 não habilitado - dados salvos localmente',
          synced: false 
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Build update fields for Bitrix24
    const updateFields: Record<string, string> = {};

    // Nome do Concorrente
    if (dados.nome_concorrente && customFieldMap['nome_concorrente']) {
      updateFields[customFieldMap['nome_concorrente']] = dados.nome_concorrente;
      console.log(`[bitrix24-sync-cliente-gd] 🏢 Concorrente: ${dados.nome_concorrente}`);
    }

    // Desconto do Concorrente
    if (dados.desconto_concorrente !== undefined && customFieldMap['desconto_concorrente']) {
      updateFields[customFieldMap['desconto_concorrente']] = String(dados.desconto_concorrente);
      console.log(`[bitrix24-sync-cliente-gd] 📉 Desconto Concorrente: ${dados.desconto_concorrente}%`);
    }

    // Multa Rescisória
    if (dados.multa_rescisoria !== undefined && customFieldMap['multa_rescisoria']) {
      updateFields[customFieldMap['multa_rescisoria']] = `${dados.multa_rescisoria}|BRL`;
      console.log(`[bitrix24-sync-cliente-gd] 💸 Multa: R$ ${dados.multa_rescisoria}`);
    }

    // Meses restantes do contrato
    if (dados.meses_restantes_concorrente !== undefined && customFieldMap['meses_restantes_concorrente']) {
      updateFields[customFieldMap['meses_restantes_concorrente']] = String(dados.meses_restantes_concorrente);
    }

    // Payback da multa
    if (dados.payback_multa_meses !== null && customFieldMap['payback_multa_meses']) {
      updateFields[customFieldMap['payback_multa_meses']] = String(dados.payback_multa_meses);
      console.log(`[bitrix24-sync-cliente-gd] ⏱️ Payback: ${dados.payback_multa_meses} meses`);
    }

    // Economia adicional mensal
    if (dados.economia_adicional_mensal !== undefined && customFieldMap['economia_adicional_mensal']) {
      updateFields[customFieldMap['economia_adicional_mensal']] = `${dados.economia_adicional_mensal}|BRL`;
      console.log(`[bitrix24-sync-cliente-gd] 💰 Economia Adicional: R$ ${dados.economia_adicional_mensal}/mês`);
    }

    // Desconto COESA
    if (dados.desconto_coesa !== undefined && customFieldMap['desconto']) {
      updateFields[customFieldMap['desconto']] = String(dados.desconto_coesa);
    }

    // Fidelidade (em meses)
    if (dados.fidelidade_anos !== undefined && customFieldMap['fidelidade']) {
      updateFields[customFieldMap['fidelidade']] = String(dados.fidelidade_anos * 12);
    }

    // Consumo médio
    if (dados.consumo_medio !== undefined && customFieldMap['consumo_medio']) {
      updateFields[customFieldMap['consumo_medio']] = String(dados.consumo_medio);
    }

    // Link da proposta com cache busting
    // Cliente GD é sempre proposta inicial (migração de concorrente)
    if (publicAppUrl && customFieldMap['link_proposta']) {
      const routePath = 'proposta-inicial';
      const vParam = publicCacheBust ? `?v=${publicCacheBust}` : '';
      const propostaUrl = `${publicAppUrl}/${routePath}/${propostaId}${vParam}`;
      updateFields[customFieldMap['link_proposta']] = propostaUrl;
      console.log(`[bitrix24-sync-cliente-gd] 🔗 Link: ${propostaUrl}`);
    }

    // 4. Check if we need to create a new lead or update existing
    let leadId = proposta.bitrix24_lead_id;
    let leadCreated = false;

    if (!leadId) {
      // Create a new lead in Bitrix24
      console.log(`[bitrix24-sync-cliente-gd] Creating new Bitrix24 lead...`);
      
      const createPayload = new URLSearchParams();
      createPayload.append('fields[TITLE]', dados.cliente_nome || proposta.cliente_nome);
      if (dados.cliente_nome) createPayload.append('fields[NAME]', dados.cliente_nome.split(' ')[0]);
      if (dados.cliente_nome && dados.cliente_nome.includes(' ')) {
        createPayload.append('fields[LAST_NAME]', dados.cliente_nome.split(' ').slice(1).join(' '));
      }
      if (dados.cliente_email) createPayload.append('fields[EMAIL][0][VALUE]', dados.cliente_email);
      if (dados.cliente_telefone) createPayload.append('fields[PHONE][0][VALUE]', dados.cliente_telefone);
      createPayload.append('fields[SOURCE_ID]', 'OTHER');
      createPayload.append('fields[SOURCE_DESCRIPTION]', 'Proposta Cliente GD - Migração de Concorrente');

      // Add custom fields to create payload
      Object.entries(updateFields).forEach(([key, value]) => {
        createPayload.append(`fields[${key}]`, value);
      });

      try {
        const createResponse = await fetch(`${bitrix24Url}/crm.lead.add`, {
          method: 'POST',
          body: createPayload,
        });
        const createResult = await createResponse.json();

        if (createResult.result) {
          leadId = String(createResult.result);
          leadCreated = true;
          console.log(`[bitrix24-sync-cliente-gd] ✅ Lead created: ${leadId}`);

          // Update proposal with new lead ID
          await supabase
            .from('propostas_assinantes')
            .update({ bitrix24_lead_id: leadId })
            .eq('id', propostaId);
        } else {
          console.error(`[bitrix24-sync-cliente-gd] Failed to create lead:`, createResult);
          return new Response(
            JSON.stringify({ error: 'Erro ao criar lead no Bitrix24', details: createResult }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } catch (error) {
        console.error(`[bitrix24-sync-cliente-gd] Error creating lead:`, error);
        return new Response(
          JSON.stringify({ error: 'Erro de comunicação com Bitrix24' }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      // Update existing lead
      console.log(`[bitrix24-sync-cliente-gd] Updating lead ${leadId}...`);
      
      const updatePayload = new URLSearchParams();
      updatePayload.append('ID', leadId);
      
      Object.entries(updateFields).forEach(([key, value]) => {
        updatePayload.append(`fields[${key}]`, value);
      });

      try {
        const updateResponse = await fetch(`${bitrix24Url}/crm.lead.update`, {
          method: 'POST',
          body: updatePayload,
        });
        const updateResult = await updateResponse.json();

        if (!updateResult.result) {
          console.error(`[bitrix24-sync-cliente-gd] Failed to update lead:`, updateResult);
        } else {
          console.log(`[bitrix24-sync-cliente-gd] ✅ Lead updated successfully`);
        }
      } catch (error) {
        console.error(`[bitrix24-sync-cliente-gd] Error updating lead:`, error);
      }
    }

    // 5. Add timeline comment
    if (leadId) {
      const commentParts = [
        `📊 **PROPOSTA CLIENTE COM GD - MIGRAÇÃO**`,
        ``,
        `🏢 **Concorrente Atual:** ${dados.nome_concorrente}`,
        `📉 Desconto Concorrente: ${dados.desconto_concorrente}%`,
        `📈 Desconto COESA: ${dados.desconto_coesa}%`,
        `💰 Economia Adicional: R$ ${dados.economia_adicional_mensal.toFixed(2)}/mês`,
      ];

      if (dados.multa_rescisoria > 0) {
        commentParts.push(`💸 Multa Rescisória: R$ ${dados.multa_rescisoria.toFixed(2)}`);
        if (dados.payback_multa_meses) {
          commentParts.push(`⏱️ Payback da Multa: ${dados.payback_multa_meses} meses`);
        }
      }

      commentParts.push(
        ``,
        `⚡ Consumo Médio: ${dados.consumo_medio} kWh`,
        `📅 Fidelidade COESA: ${dados.fidelidade_anos} anos`,
        ``,
        `🔗 ${publicAppUrl}/proposta-inicial/${propostaId}${publicCacheBust ? `?v=${publicCacheBust}` : ''}`
      );

      const comment = commentParts.join('\n');

      try {
        const commentPayload = new URLSearchParams({
          'fields[ENTITY_ID]': leadId,
          'fields[ENTITY_TYPE]': 'lead',
          'fields[COMMENT]': comment,
        });
        await fetch(`${bitrix24Url}/crm.timeline.comment.add`, {
          method: 'POST',
          body: commentPayload,
        });
        console.log(`[bitrix24-sync-cliente-gd] Timeline comment added`);
      } catch (error) {
        console.error(`[bitrix24-sync-cliente-gd] Error adding comment:`, error);
      }
    }

    // 6. Log sync
    await supabase.from('bitrix24_sync_logs').insert({
      bitrix24_lead_id: leadId,
      proposta_id: propostaId,
      action: leadCreated ? 'create_cliente_gd' : 'update_cliente_gd',
      status: 'success',
      request_data: dados as any,
      response_data: { leadId, leadCreated } as any,
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        leadId,
        leadCreated,
        message: leadCreated 
          ? `Lead ${leadId} criado no Bitrix24 com sucesso` 
          : `Lead ${leadId} atualizado no Bitrix24 com sucesso`,
        synced: true 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error('[bitrix24-sync-cliente-gd] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Erro interno', details: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
