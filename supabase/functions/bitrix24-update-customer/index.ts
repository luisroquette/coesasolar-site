import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  getCorsHeaders,
  handleCorsPrelight,
  jsonResponse,
  errorResponse,
  sanitizeForLog,
} from '../_shared/security-helpers.ts';
import { validateBitrix24UpdateCustomer, parseAndValidate } from '../_shared/zod-schemas.ts';

/**
 * BITRIX24 UPDATE CUSTOMER DATA
 * 
 * Atualiza dados do cliente no CRM Bitrix24 (Lead e/ou Contato)
 * após confirmação de retificação pelo cliente.
 * 
 * Usado pelos agentes de SAC (marIA) após identificar divergências
 * e obter confirmação do cliente.
 * 
 * SECURITY: Uses strict CORS + Zod validation
 */

Deno.serve(async (req) => {
  // CORS: This is an internal API - use strict CORS
  if (req.method === 'OPTIONS') {
    return handleCorsPrelight(req, { mode: 'strict' });
  }

  const corsHeaders = getCorsHeaders(req, { mode: 'strict' });

  try {
    // Validate and parse request body
    const parseResult = await parseAndValidate(req, validateBitrix24UpdateCustomer);
    
    if (!parseResult.success) {
      console.warn('[bitrix24-update-customer] Validation failed:', parseResult.error);
      return new Response(
        JSON.stringify({ error: parseResult.error }),
        { status: parseResult.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = parseResult.data;
    console.log('[bitrix24-update-customer] Request:', JSON.stringify(sanitizeForLog(body), null, 2));

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Buscar configuração do Bitrix24
    const { data: configData } = await supabase
      .from('configuracoes_sistema')
      .select('chave, valor')
      .in('chave', [
        'bitrix24_webhook_url',
        'bitrix24_enabled',
        'bitrix24_custom_field_cpf_cnpj',
        'bitrix24_contact_field_cpf_cnpj',
      ]);

    const config: Record<string, string> = {};
    configData?.forEach((c) => {
      config[c.chave] = c.valor;
    });

    const bitrix24Url = config.bitrix24_webhook_url;
    const bitrix24Enabled = config.bitrix24_enabled === 'true';
    const leadCpfCnpjFieldId = config.bitrix24_custom_field_cpf_cnpj || 'UF_CRM_1755711898';
    const contactCpfCnpjFieldId = config.bitrix24_contact_field_cpf_cnpj || 'UF_CRM_1751997517';

    if (!bitrix24Url || !bitrix24Enabled) {
      return new Response(
        JSON.stringify({ error: 'Integração Bitrix24 não configurada ou desabilitada' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Buscar bitrix24_user_id do agente se agent_id foi fornecido
    let agentBitrixUserId: string | null = null;
    let agentName = 'SAC';
    if (body.agent_id) {
      const { data: agentData } = await supabase
        .from('ai_agents')
        .select('bitrix24_user_id, name')
        .eq('agent_id', body.agent_id)
        .single();
      
      if (agentData) {
        agentBitrixUserId = agentData.bitrix24_user_id;
        agentName = agentData.name || 'SAC';
        console.log(`[bitrix24-update-customer] Agent ${body.agent_id} Bitrix24 user ID: ${agentBitrixUserId}`);
      }
    }

    const results = {
      lead_updated: false,
      contact_updated: false,
      deal_updated: false,
      timeline_comment_added: false,
      errors: [] as string[],
    };

    // =====================================================
    // 1. ATUALIZAR LEAD
    // =====================================================
    if (body.lead_id) {
      console.log(`[bitrix24-update-customer] Atualizando lead ${body.lead_id}...`);
      
      const leadFields: Record<string, string> = {};
      
      if (body.updates.nome) {
        leadFields['NAME'] = body.updates.nome;
      }
      if (body.updates.email) {
        leadFields['EMAIL[0][VALUE]'] = body.updates.email;
        leadFields['EMAIL[0][VALUE_TYPE]'] = 'WORK';
      }
      if (body.updates.telefone) {
        leadFields['PHONE[0][VALUE]'] = body.updates.telefone;
        leadFields['PHONE[0][VALUE_TYPE]'] = 'MOBILE';
      }
      if (body.updates.cpf_cnpj) {
        leadFields[leadCpfCnpjFieldId] = body.updates.cpf_cnpj;
      }
      if (body.updates.endereco) {
        leadFields['ADDRESS'] = body.updates.endereco;
      }
      if (body.updates.cidade) {
        leadFields['ADDRESS_CITY'] = body.updates.cidade;
      }
      if (body.updates.uf) {
        leadFields['ADDRESS_PROVINCE'] = body.updates.uf;
      }
      if (body.updates.cep) {
        leadFields['ADDRESS_POSTAL_CODE'] = body.updates.cep;
      }
      
      if (Object.keys(leadFields).length > 0) {
        const updatePayload = new URLSearchParams({ id: body.lead_id });
        for (const [key, value] of Object.entries(leadFields)) {
          updatePayload.append(`fields[${key}]`, value);
        }
        
        try {
          const updateResponse = await fetch(`${bitrix24Url}/crm.lead.update`, {
            method: 'POST',
            body: updatePayload,
          });
          const updateResult = await updateResponse.json();
          
          if (updateResult.result) {
            results.lead_updated = true;
            console.log(`[bitrix24-update-customer] Lead ${body.lead_id} atualizado com sucesso`);
          } else {
            results.errors.push(`Lead update error: ${updateResult.error_description || 'Unknown error'}`);
          }
        } catch (err) {
          results.errors.push(`Lead update exception: ${err}`);
        }
      }
      
      // Adicionar comentário na timeline
      if (body.add_timeline_comment !== false) {
        const commentText = body.comment_text || 
          `📝 Dados atualizados via ${agentName}\n\nCampos alterados: ${Object.keys(body.updates).join(', ')}\n\nDados retificados após confirmação do cliente.`;
        
        const commentPayload = new URLSearchParams({
          'fields[ENTITY_ID]': body.lead_id,
          'fields[ENTITY_TYPE]': 'lead',
          'fields[COMMENT]': commentText,
        });
        
        if (agentBitrixUserId) {
          commentPayload.append('fields[AUTHOR_ID]', agentBitrixUserId);
        }

        try {
          await fetch(`${bitrix24Url}/crm.timeline.comment.add`, {
            method: 'POST',
            body: commentPayload,
          });
          results.timeline_comment_added = true;
        } catch (err) {
          console.warn('[bitrix24-update-customer] Timeline comment error:', err);
        }
      }
    }

    // =====================================================
    // 2. ATUALIZAR CONTATO
    // =====================================================
    if (body.contact_id) {
      console.log(`[bitrix24-update-customer] Atualizando contato ${body.contact_id}...`);
      
      const contactFields: Record<string, string> = {};
      
      if (body.updates.nome) {
        const nameParts = body.updates.nome.split(' ');
        contactFields['NAME'] = nameParts[0];
        if (nameParts.length > 1) {
          contactFields['LAST_NAME'] = nameParts.slice(1).join(' ');
        }
      }
      if (body.updates.email) {
        contactFields['EMAIL[0][VALUE]'] = body.updates.email;
        contactFields['EMAIL[0][VALUE_TYPE]'] = 'WORK';
      }
      if (body.updates.telefone) {
        contactFields['PHONE[0][VALUE]'] = body.updates.telefone;
        contactFields['PHONE[0][VALUE_TYPE]'] = 'MOBILE';
      }
      if (body.updates.cpf_cnpj) {
        contactFields[contactCpfCnpjFieldId] = body.updates.cpf_cnpj;
      }
      if (body.updates.endereco) {
        contactFields['ADDRESS'] = body.updates.endereco;
      }
      if (body.updates.cidade) {
        contactFields['ADDRESS_CITY'] = body.updates.cidade;
      }
      if (body.updates.uf) {
        contactFields['ADDRESS_PROVINCE'] = body.updates.uf;
      }
      if (body.updates.cep) {
        contactFields['ADDRESS_POSTAL_CODE'] = body.updates.cep;
      }
      
      if (Object.keys(contactFields).length > 0) {
        const updatePayload = new URLSearchParams({ id: body.contact_id });
        for (const [key, value] of Object.entries(contactFields)) {
          updatePayload.append(`fields[${key}]`, value);
        }
        
        try {
          const updateResponse = await fetch(`${bitrix24Url}/crm.contact.update`, {
            method: 'POST',
            body: updatePayload,
          });
          const updateResult = await updateResponse.json();
          
          if (updateResult.result) {
            results.contact_updated = true;
            console.log(`[bitrix24-update-customer] Contato ${body.contact_id} atualizado com sucesso`);
          } else {
            results.errors.push(`Contact update error: ${updateResult.error_description || 'Unknown error'}`);
          }
        } catch (err) {
          results.errors.push(`Contact update exception: ${err}`);
        }
      }
    }

    // =====================================================
    // 3. ATUALIZAR DEAL
    // =====================================================
    if (body.deal_id) {
      console.log(`[bitrix24-update-customer] Atualizando deal ${body.deal_id}...`);
      
      const { data: dealCpfFieldConfig } = await supabase
        .from('configuracoes_sistema')
        .select('valor')
        .eq('chave', 'bitrix24_deal_field_cpf_cnpj')
        .maybeSingle();
      
      const dealCpfCnpjFieldId = dealCpfFieldConfig?.valor || leadCpfCnpjFieldId;
      
      const dealFields: Record<string, string> = {};
      
      if (body.updates.nome) {
        dealFields['TITLE'] = body.updates.nome;
      }
      if (body.updates.cpf_cnpj) {
        dealFields[dealCpfCnpjFieldId] = body.updates.cpf_cnpj;
      }
      
      if (Object.keys(dealFields).length > 0) {
        const updatePayload = new URLSearchParams({ id: body.deal_id });
        for (const [key, value] of Object.entries(dealFields)) {
          updatePayload.append(`fields[${key}]`, value);
        }
        
        try {
          const updateResponse = await fetch(`${bitrix24Url}/crm.deal.update`, {
            method: 'POST',
            body: updatePayload,
          });
          const updateResult = await updateResponse.json();
          
          if (updateResult.result) {
            results.deal_updated = true;
            console.log(`[bitrix24-update-customer] Deal ${body.deal_id} atualizado com sucesso`);
          } else {
            results.errors.push(`Deal update error: ${updateResult.error_description || 'Unknown error'}`);
          }
        } catch (err) {
          results.errors.push(`Deal update exception: ${err}`);
        }
      }
      
      // Adicionar comentário na timeline do Deal
      if (body.add_timeline_comment !== false) {
        const commentText = body.comment_text || 
          `📝 Dados atualizados via ${agentName}\n\nCampos alterados: ${Object.keys(body.updates).join(', ')}\n\nDados retificados após confirmação do cliente.`;
        
        const commentPayload = new URLSearchParams({
          'fields[ENTITY_ID]': body.deal_id,
          'fields[ENTITY_TYPE]': 'deal',
          'fields[COMMENT]': commentText,
        });
        
        if (agentBitrixUserId) {
          commentPayload.append('fields[AUTHOR_ID]', agentBitrixUserId);
        }

        try {
          await fetch(`${bitrix24Url}/crm.timeline.comment.add`, {
            method: 'POST',
            body: commentPayload,
          });
          results.timeline_comment_added = true;
        } catch (err) {
          console.warn('[bitrix24-update-customer] Deal timeline comment error:', err);
        }
      }
    }

    console.log('[bitrix24-update-customer] Results:', JSON.stringify(results, null, 2));

    return new Response(
      JSON.stringify({
        success: results.lead_updated || results.contact_updated || results.deal_updated,
        ...results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[bitrix24-update-customer] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...getCorsHeaders(req, { mode: 'strict' }), 'Content-Type': 'application/json' } }
    );
  }
});