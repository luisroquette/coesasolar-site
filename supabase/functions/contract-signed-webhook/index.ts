import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'npm:@supabase/supabase-js@2.90.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CHATAPP_LICENSE_ID = Deno.env.get('CHATAPP_LICENSE_ID')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function formatPhone(phone: string): string {
  let c = phone.replace(/\D/g, '');
  if (c.startsWith('0')) c = c.substring(1);
  if (!c.startsWith('55')) c = '55' + c;
  return c;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  console.log('[contract-signed] Processing...');

  try {
    const body = await req.json();
    const { cliente_telefone, bitrix24_lead_id, proposta_id } = body;

    if (!cliente_telefone && !bitrix24_lead_id && !proposta_id) {
      return new Response(JSON.stringify({ error: 'Missing identifier' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Find conversation
    let query = supabase.from('chatbot_conversas').select(
      'id, cliente_telefone, cliente_nome, cliente_email, sofia_mode, bitrix24_lead_id, proposta_id, contrato_assinado, contrato_assinado_at, whatsapp_provider'
    );

    if (cliente_telefone) {
      const fp = formatPhone(cliente_telefone);
      query = query.or(`cliente_telefone.eq.${fp},cliente_telefone.eq.${cliente_telefone}`);
    } else if (bitrix24_lead_id) {
      query = query.eq('bitrix24_lead_id', bitrix24_lead_id);
    } else if (proposta_id) {
      query = query.eq('proposta_id', proposta_id);
    }

    query = query.is('ended_at', null).order('created_at', { ascending: false }).limit(1);
    const { data: conversas, error: fetchError } = await query;

    if (fetchError) throw fetchError;
    if (!conversas?.length) {
      return new Response(JSON.stringify({ error: 'No active conversation found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const c = conversas[0];
    if (c.contrato_assinado && c.contrato_assinado_at) {
      return new Response(JSON.stringify({ status: 'already_signed', conversaId: c.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const now = new Date().toISOString();

    // Update conversation
    await supabase.from('chatbot_conversas').update({
      contrato_assinado: true,
      contrato_assinado_at: now,
      sofia_mode: 'onboarding',
      contract_nudge_count: 0,
      next_contract_nudge_at: null,
      nudge_count: 0,
      next_nudge_at: null,
      awaiting_response: false,
    }).eq('id', c.id);

    // Load welcome message
    const { data: msgConfig } = await supabase
      .from('configuracoes_sistema').select('valor')
      .eq('chave', 'onboarding_welcome_message').single();

    const firstName = c.cliente_nome?.split(' ')[0] || 'Assinante';
    const welcomeMsg = msgConfig?.valor
      ? (msgConfig.valor as string).replace('Olá!', `Olá, ${firstName}!`)
      : `Prezado(a) ${firstName}, seja bem-vindo(a) à Coesa Energia ⚡\n\nVocê começará a receber seu desconto na conta de energia!\n\n📧 Boletos por e-mail e WhatsApp.\n📞 Suporte: (31) 98440-0889`;

    // Send WhatsApp
    let messageSent = false;
    const { data: tokenCfg } = await supabase
      .from('configuracoes_sistema').select('valor')
      .eq('chave', 'chatapp_access_token').single();
    const token = tokenCfg?.valor || Deno.env.get('CHATAPP_ACCESS_TOKEN');

    if (token && c.cliente_telefone) {
      const fp = formatPhone(c.cliente_telefone);
      const resp = await fetch(
        `https://api.chatapp.online/v1/licenses/${CHATAPP_LICENSE_ID}/messengers/grWhatsApp/chats/${fp}/messages/text`,
        { method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ text: welcomeMsg }) }
      );
      messageSent = resp.ok;
      if (!resp.ok) console.error('[contract-signed] WhatsApp error:', resp.status);
    }

    // Persist message
    await supabase.from('chatbot_mensagens').insert({
      conversa_id: c.id,
      role: 'assistant',
      content: `[ONBOARDING_WELCOME] ${welcomeMsg}`,
      handler_type: 'contract_signed',
    });

    // Update timestamps
    await supabase.from('chatbot_conversas').update({
      last_message_at: now,
      last_sofia_message_at: now,
    }).eq('id', c.id);

    // Bitrix24 (non-blocking)
    try {
      const { data: bCfg } = await supabase
        .from('configuracoes_sistema').select('chave, valor')
        .in('chave', ['bitrix24_webhook_url', 'bitrix24_enabled']);
      const cm: Record<string, string> = {};
      bCfg?.forEach((r: any) => { cm[r.chave] = r.valor; });

      if (cm.bitrix24_enabled === 'true' && cm.bitrix24_webhook_url && c.bitrix24_lead_id) {
        await fetch(`${cm.bitrix24_webhook_url}crm.lead.update`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: c.bitrix24_lead_id, fields: { STATUS_ID: 'WON' } }),
        });
      }
    } catch (e) { console.error('[contract-signed] Bitrix error:', e); }

    console.log(`[contract-signed] ✅ Done: ${c.id} → onboarding`);
    return new Response(JSON.stringify({
      status: 'success', conversaId: c.id, sofia_mode: 'onboarding',
      contrato_assinado_at: now, welcome_message_sent: messageSent,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('[contract-signed] Error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
