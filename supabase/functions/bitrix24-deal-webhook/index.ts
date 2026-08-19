import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getNotificationAuthorName } from '../_shared/agent-identity.ts';
import {
  getCorsHeaders,
  handleCorsPrelight,
  errorResponse,
  jsonResponse,
} from '../_shared/security-helpers.ts';
import { validateBitrixDeal } from '../_shared/zod-schemas.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/**
 * Webhook for Bitrix24 Deal updates (ONCRMDEALDUPDATE)
 * 
 * This webhook detects when a deal moves to "Contrato Assinado" stage
 * and updates the chatbot_conversas table to mark the contract as signed.
 * 
 * The ClickSign integration in Bitrix24 automatically moves the deal
 * to this stage when the contract is signed.
 */
Deno.serve(async (req) => {
  // CORS: Public webhook endpoint (Bitrix24 external calls)
  const corsHeaders = getCorsHeaders(req, { mode: 'permissive' });
  
  console.log('[bitrix24-deal-webhook] Function called:', req.method);

  if (req.method === 'OPTIONS') {
    return handleCorsPrelight(req, { mode: 'permissive' });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Parse request - Bitrix24 sends data as form-urlencoded
    let dealId: string | null = null;

    const contentType = req.headers.get('content-type') || '';
    
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await req.formData();
      const rawId = formData.get('data[FIELDS][ID]')?.toString() || 
               formData.get('DEAL_ID')?.toString() ||
               formData.get('data[DEAL_ID]')?.toString();
      dealId = rawId || null;
      
      // Log all form fields for debugging
      const formEntries: Record<string, string> = {};
      formData.forEach((value, key) => {
        formEntries[key] = value.toString();
      });
      console.log('[bitrix24-deal-webhook] Form data:', JSON.stringify(formEntries, null, 2));
    } else {
      const body = await req.json();
      const rawId = body.data?.FIELDS?.ID || body.DEAL_ID || body.data?.DEAL_ID;
      dealId = rawId || null;
      console.log('[bitrix24-deal-webhook] JSON body:', JSON.stringify(body, null, 2));
    }

    // Validate dealId
    const validation = validateBitrixDeal(dealId);
    if (!validation.success) {
      console.log('[bitrix24-deal-webhook] No deal ID found in request');
      return jsonResponse({ status: 'ignored', reason: 'no_deal_id' }, 200, req, { mode: 'permissive' });
    }
    
    dealId = validation.data!.dealId;

    console.log(`[bitrix24-deal-webhook] Processing deal ID: ${dealId}`);

    // Get Bitrix24 configuration
    const { data: configData } = await supabase
      .from('configuracoes_sistema')
      .select('chave, valor')
      .in('chave', [
        'bitrix24_webhook_url',
        'bitrix24_deal_stage_contrato_assinado'
      ]);

    const config: Record<string, string> = {};
    configData?.forEach((c) => {
      config[c.chave] = c.valor;
    });

    const bitrix24Url = config.bitrix24_webhook_url;
    const contratoAssinadoStage = config.bitrix24_deal_stage_contrato_assinado || 'WON';

    if (!bitrix24Url) {
      console.error('[bitrix24-deal-webhook] Bitrix24 webhook URL not configured');
      return new Response(
        JSON.stringify({ error: 'Bitrix24 not configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch deal details from Bitrix24
    console.log(`[bitrix24-deal-webhook] Fetching deal ${dealId} from Bitrix24`);
    const dealResponse = await fetch(`${bitrix24Url}/crm.deal.get?id=${dealId}`);
    const dealResult = await dealResponse.json();

    if (!dealResult.result) {
      console.error('[bitrix24-deal-webhook] Failed to fetch deal:', dealResult);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch deal', details: dealResult }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const deal = dealResult.result;
    const stageId = deal.STAGE_ID;
    const leadId = deal.LEAD_ID;
    const contactId = deal.CONTACT_ID;

    console.log(`[bitrix24-deal-webhook] Deal ${dealId} - Stage: ${stageId}, Lead: ${leadId}, Contact: ${contactId}`);

    // Check if deal is in "Contrato Assinado" stage
    if (stageId !== contratoAssinadoStage) {
      console.log(`[bitrix24-deal-webhook] Deal not in target stage. Current: ${stageId}, Target: ${contratoAssinadoStage}`);
      return new Response(
        JSON.stringify({ 
          status: 'ignored', 
          reason: 'not_target_stage',
          currentStage: stageId,
          targetStage: contratoAssinadoStage
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[bitrix24-deal-webhook] Deal ${dealId} is in Contrato Assinado stage!`);

    // Find conversation by bitrix24_lead_id or contact phone
    let conversa = null;

    // First try by lead ID
    if (leadId) {
      const { data: conversaByLead } = await supabase
        .from('chatbot_conversas')
        .select('*')
        .eq('bitrix24_lead_id', leadId.toString())
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (conversaByLead) {
        conversa = conversaByLead;
        console.log(`[bitrix24-deal-webhook] Found conversation by lead_id: ${conversa.id}`);
      }
    }

    // If not found, try by contact phone
    if (!conversa && contactId) {
      // Get contact details to find phone
      const contactResponse = await fetch(`${bitrix24Url}/crm.contact.get?id=${contactId}`);
      const contactResult = await contactResponse.json();

      if (contactResult.result?.PHONE?.[0]?.VALUE) {
        const phone = contactResult.result.PHONE[0].VALUE.replace(/\D/g, '');
        const phoneVariants = [
          phone,
          phone.startsWith('55') ? phone.substring(2) : `55${phone}`,
          phone.length === 11 ? phone : (phone.length === 10 ? `${phone.substring(0, 2)}9${phone.substring(2)}` : phone)
        ];

        for (const variant of phoneVariants) {
          const { data: conversaByPhone } = await supabase
            .from('chatbot_conversas')
            .select('*')
            .eq('cliente_telefone', variant)
            .eq('contrato_assinado', false)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          if (conversaByPhone) {
            conversa = conversaByPhone;
            console.log(`[bitrix24-deal-webhook] Found conversation by phone ${variant}: ${conversa.id}`);
            break;
          }
        }
      }
    }

    if (!conversa) {
      console.log('[bitrix24-deal-webhook] No active conversation found for this deal');
      return new Response(
        JSON.stringify({ 
          status: 'ignored', 
          reason: 'no_conversation_found',
          dealId,
          leadId,
          contactId
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update conversation - contract signed!
    const now = new Date().toISOString();
    
    const { error: updateError } = await supabase
      .from('chatbot_conversas')
      .update({
        contrato_assinado: true,
        contrato_assinado_at: now,
        sofia_mode: 'standard', // Exit contract_closer mode
        event_conversion: true, // Mark as conversion
        next_contract_nudge_at: null, // Cancel scheduled nudges
        bitrix24_stage: contratoAssinadoStage,
      })
      .eq('id', conversa.id);

    if (updateError) {
      console.error('[bitrix24-deal-webhook] Error updating conversation:', updateError);
      throw updateError;
    }

    console.log(`[bitrix24-deal-webhook] Conversation ${conversa.id} marked as contract signed`);

    // Notify admins - usando identidade do agente da conversa
    const conversaAgentId = conversa?.agent_id || 'sofia';
    await supabase.from('admin_notifications').insert({
      admin_user_id: null,
      title: '🎉 Contrato Assinado!',
      message: `${conversa.cliente_nome || 'Cliente'} assinou o contrato! Conversão concluída com sucesso.`,
      type: 'contract_signed',
      entity_type: 'chatbot_conversa',
      entity_id: conversa.id,
      created_by_nome: getNotificationAuthorName(conversaAgentId, null, 'Webhook Contrato'),
    });

    // Send congratulations message via WhatsApp
    const CHATAPP_LICENSE_ID = Deno.env.get('CHATAPP_LICENSE_ID');
    if (CHATAPP_LICENSE_ID && conversa.cliente_telefone) {
      // Get fresh access token
      const { data: tokenData } = await supabase
        .from('chatapp_tokens')
        .select('access_token')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      if (tokenData?.access_token) {
        const congratsMessage = `🎉 *Parabéns, ${conversa.cliente_nome || 'você'}!*\n\n` +
          `Seu contrato foi assinado com sucesso! ✅\n\n` +
          `A partir de agora você faz parte da família COESA e já está economizando com energia limpa e sustentável. 💚\n\n` +
          `Em até 90 dias você começará a ver a economia na sua fatura de luz.\n\n` +
          `Qualquer dúvida, estou por aqui! 😊`;

        try {
          const phone = conversa.cliente_telefone.startsWith('55') 
            ? conversa.cliente_telefone 
            : `55${conversa.cliente_telefone}`;

          const response = await fetch(`https://api.chatapp.online/v1/licenses/${CHATAPP_LICENSE_ID}/messengers/whatsapp/chats/${phone}@c.us/messages/text`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${tokenData.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ text: congratsMessage }),
          });

          if (response.ok) {
            console.log(`[bitrix24-deal-webhook] Congratulations message sent to ${phone}`);

            // Save message in conversation history
            await supabase.from('chatbot_mensagens').insert({
              conversa_id: conversa.id,
              role: 'assistant',
              content: congratsMessage,
            });
          } else {
            console.error('[bitrix24-deal-webhook] Failed to send WhatsApp message:', await response.text());
          }
        } catch (whatsappError) {
          console.error('[bitrix24-deal-webhook] Error sending WhatsApp message:', whatsappError);
        }
      }
    }

    // Log sync
    await supabase.from('bitrix24_sync_logs').insert({
      proposta_id: conversa.proposta_id,
      bitrix24_lead_id: leadId?.toString() || conversa.bitrix24_lead_id,
      action: 'contract_signed_detected',
      status: 'success',
      request_data: { dealId, stageId, conversaId: conversa.id },
    });

    return new Response(
      JSON.stringify({ 
        status: 'success', 
        message: 'Contract signed detected and processed',
        conversaId: conversa.id,
        clienteNome: conversa.cliente_nome
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[bitrix24-deal-webhook] Error:', error);
    return errorResponse(error instanceof Error ? error.message : 'Unknown error', 500, req);
  }
});