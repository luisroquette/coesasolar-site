import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsPrelight, errorResponse, successResponse } from '../_shared/security-helpers.ts';
import { validateContractSent, parseAndValidate } from '../_shared/zod-schemas.ts';

// MESSAGE BUS - Unified persistence layer
import { publishAssistantMessage } from '../_shared/message-bus.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CHATAPP_LICENSE_ID = Deno.env.get('CHATAPP_LICENSE_ID')!

// deno-lint-ignore no-explicit-any
async function getValidAccessToken(supabase: any): Promise<string | null> {
  const { data: tokenConfig } = await supabase
    .from('configuracoes_sistema')
    .select('valor')
    .eq('chave', 'chatapp_access_token')
    .single();
  
  if (tokenConfig?.valor) {
    return tokenConfig.valor as string;
  }
  
  return Deno.env.get('CHATAPP_ACCESS_TOKEN') || null;
}

function formatWhatsAppNumber(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('0')) cleaned = cleaned.substring(1);
  if (!cleaned.startsWith('55')) cleaned = '55' + cleaned;
  return cleaned;
}

async function sendWhatsAppMessage(phone: string, message: string, accessToken: string): Promise<boolean> {
  const formattedPhone = formatWhatsAppNumber(phone);
  
  console.log(`[contract-sent] Sending message to ${formattedPhone}`);
  
  const response = await fetch(`https://api.chatapp.online/v1/licenses/${CHATAPP_LICENSE_ID}/messengers/grWhatsApp/chats/${formattedPhone}/messages/text`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text: message }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[contract-sent] ChatApp API error:`, response.status, errorText);
    return false;
  }

  return true;
}

// deno-lint-ignore no-explicit-any
async function getContractNudgeDelay(supabase: any, nudgeNum: number): Promise<number> {
  const { data: config } = await supabase
    .from('configuracoes_sistema')
    .select('valor')
    .eq('chave', `contract_nudge_${nudgeNum}_delay_hours`)
    .single();
  
  const defaultDelays: Record<number, number> = { 1: 2, 2: 24, 3: 48 };
  const hours = config?.valor ? parseInt(config.valor) : defaultDelays[nudgeNum] || 2;
  return hours * 60 * 60 * 1000; // Convert to milliseconds
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req, { mode: 'auto' });
  
  if (req.method === 'OPTIONS') {
    return handleCorsPrelight(req);
  }

  console.log('[contract-sent] Processing contract sent webhook...');

  try {
    // Validate payload
    const validation = await parseAndValidate(req, validateContractSent);
    if (!validation.success) {
      return errorResponse(validation.error, validation.status, req);
    }
    
    const { cliente_telefone, bitrix24_lead_id, proposta_id, desconto_percentual } = validation.data;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Find the conversation with optimized fields
    let query = supabase.from('chatbot_conversas').select(`
      id,
      cliente_telefone,
      cliente_nome,
      cliente_email,
      sofia_mode,
      agent_id,
      bitrix24_lead_id,
      proposta_id,
      contrato_enviado_at,
      contrato_assinado,
      contrato_assinado_at,
      contract_nudge_count,
      next_contract_nudge_at,
      last_message_at,
      whatsapp_provider
    `);
    
    if (cliente_telefone) {
      const formattedPhone = formatWhatsAppNumber(cliente_telefone);
      query = query.or(`cliente_telefone.eq.${formattedPhone},cliente_telefone.eq.${cliente_telefone}`);
    } else if (bitrix24_lead_id) {
      query = query.eq('bitrix24_lead_id', bitrix24_lead_id);
    } else if (proposta_id) {
      query = query.eq('proposta_id', proposta_id);
    }
    
    query = query.is('ended_at', null).order('created_at', { ascending: false }).limit(1);
    
    const { data: conversas, error: fetchError } = await query;
    
    if (fetchError) {
      console.error('[contract-sent] Error fetching conversation:', fetchError);
      throw fetchError;
    }
    
    if (!conversas || conversas.length === 0) {
      console.log('[contract-sent] No active conversation found');
      return new Response(JSON.stringify({ 
        error: 'No active conversation found for this client',
        searched: { cliente_telefone, bitrix24_lead_id, proposta_id }
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    const conversa = conversas[0];
    const conversaId = conversa.id;
    const clienteNome = conversa.cliente_nome;
    const clienteTelefone = conversa.cliente_telefone;
    
    console.log(`[contract-sent] Found conversation: ${conversaId} for ${clienteNome || clienteTelefone}`);
    
    // Check if contract already sent
    if (conversa.contrato_enviado_at) {
      console.log(`[contract-sent] Contract already sent at ${conversa.contrato_enviado_at}`);
      return new Response(JSON.stringify({ 
        status: 'already_sent',
        conversaId,
        contrato_enviado_at: conversa.contrato_enviado_at
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // Get access token for sending WhatsApp message
    const accessToken = await getValidAccessToken(supabase);
    if (!accessToken) {
      console.error('[contract-sent] No access token available');
      return new Response(JSON.stringify({ error: 'No access token configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // Calculate first contract nudge time
    const now = new Date();
    const firstNudgeDelay = await getContractNudgeDelay(supabase, 1);
    const nextContractNudgeAt = new Date(now.getTime() + firstNudgeDelay);
    
    // Update conversation to contract_closer mode
    const { error: updateError } = await supabase
      .from('chatbot_conversas')
      .update({
        contrato_enviado_at: now.toISOString(),
        contrato_assinado: false,
        sofia_mode: 'contract_closer',
        contract_nudge_count: 0,
        next_contract_nudge_at: nextContractNudgeAt.toISOString(),
        // Also reset regular nudge state
        awaiting_response: true,
        nudge_count: 0,
        next_nudge_at: null, // Disable regular nudges in favor of contract nudges
      })
      .eq('id', conversaId);
    
    if (updateError) {
      console.error('[contract-sent] Error updating conversation:', updateError);
      throw updateError;
    }
    
    // Build proactive message
    const firstName = clienteNome ? clienteNome.split(' ')[0] : null;
    const desconto = desconto_percentual || 20;
    
    const proactiveMessages = [
      `Oi${firstName ? `, ${firstName}` : ''}! Vi que o contrato foi enviado pro seu e-mail. Recebeu direitinho? Qualquer dúvida sobre as cláusulas, é só me perguntar! 😊`,
      `${firstName ? `${firstName}, ` : ''}seu contrato com ${desconto}% de desconto foi enviado! Dá uma olhada no e-mail. Se quiser, posso resumir os pontos principais pra você!`,
      `O contrato chegou! ${firstName ? firstName + ', ' : ''}dá uma conferida no e-mail. Tô aqui se precisar tirar qualquer dúvida antes de assinar! 💚`,
    ];
    
    const proactiveMessage = proactiveMessages[Math.floor(Math.random() * proactiveMessages.length)];
    
    // Send proactive message
    const messageSent = await sendWhatsAppMessage(clienteTelefone, proactiveMessage, accessToken);
    
    if (!messageSent) {
      console.error('[contract-sent] Failed to send proactive message');
    }
    
    // Use Message Bus for unified persistence (handles timestamps automatically)
    await publishAssistantMessage(supabase, conversaId, `[CONTRACT_CLOSER] ${proactiveMessage}`, 'contract_sent');
    
    console.log(`[contract-sent] Successfully activated contract_closer mode for ${conversaId}`);
    
    return new Response(JSON.stringify({
      status: 'success',
      conversaId,
      sofia_mode: 'contract_closer',
      contrato_enviado_at: now.toISOString(),
      next_contract_nudge_at: nextContractNudgeAt.toISOString(),
      proactive_message_sent: messageSent,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    console.error('[contract-sent] Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
