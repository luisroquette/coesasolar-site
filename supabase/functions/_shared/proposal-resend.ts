/**
 * Proposal Resend Module
 * Handles detection and resending of existing proposals to returning clients
 * Phase: Critical Fix - Proposal Link Resending
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface ProposalResendContext {
  supabase: SupabaseClient;
  conversaId: string;
  bitrixLeadId: string | null;
  phone: string;
  clienteNome: string | null;
  messageText: string;
  agentName?: string;
}

export interface ProposalResendResult {
  handled: boolean;
  message?: string;
  propostaId?: string;
  propostaUrl?: string;
  reason?: string;
}

// ═══════════════════════════════════════════════════════════════
// DETECTION PATTERNS
// ═══════════════════════════════════════════════════════════════

const REQUEST_PROPOSAL_PATTERNS = [
  /j[aá]\s*simul(ei|ou)/i,
  /quero\s*(a\s*)?(minha\s*)?proposta/i,
  /onde\s*est[aá]\s*(o\s*)?link/i,
  /n[aã]o\s*recebi\s*(o\s*)?link/i,
  /pode\s*enviar\s*(de\s*novo|novamente)/i,
  /manda\s*(de\s*novo|o\s*link)/i,
  /cadê\s*(o\s*)?(meu\s*)?link/i,
  /reenvia\s*(o\s*)?link/i,
  /enviar\s*novamente/i,
  /meu\s*link/i,
  /proposta\s*pronta/i,
  /j[aá]\s*tenho\s*proposta/i,
];

/**
 * Detect if user is requesting their existing proposal
 */
export function isRequestingExistingProposal(messageText: string): boolean {
  return REQUEST_PROPOSAL_PATTERNS.some(pattern => pattern.test(messageText));
}

// ═══════════════════════════════════════════════════════════════
// URL CONFIGURATION
// ═══════════════════════════════════════════════════════════════

interface URLConfig {
  publicAppUrl: string;
  cacheBust?: string;
}

async function fetchURLConfig(supabase: SupabaseClient): Promise<URLConfig> {
  const defaultUrl = 'https://coesa-propose-craft.lovable.app';
  
  try {
    const { data: configs } = await supabase
      .from('configuracoes_sistema')
      .select('chave, valor')
      .in('chave', ['public_app_url', 'public_cache_bust']);
    
    const publicAppUrl = configs?.find(c => c.chave === 'public_app_url')?.valor || defaultUrl;
    const cacheBust = configs?.find(c => c.chave === 'public_cache_bust')?.valor;
    
    return { publicAppUrl, cacheBust };
  } catch (error) {
    console.error('[PROPOSAL_RESEND] Error fetching URL config:', error);
    return { publicAppUrl: defaultUrl };
  }
}

function buildProposalUrl(
  config: URLConfig,
  propostaId: string,
  tipoProposta: 'inicial' | 'definitiva' = 'inicial'
): string {
  const baseUrl = config.publicAppUrl.replace(/\/$/, '');
  const routePath = tipoProposta === 'definitiva' ? 'proposta-definitiva' : 'proposta-inicial';
  
  const params = new URLSearchParams();
  if (config.cacheBust) {
    params.set('v', config.cacheBust);
  }
  
  const queryString = params.toString();
  return `${baseUrl}/${routePath}/${propostaId}${queryString ? `?${queryString}` : ''}`;
}

// ═══════════════════════════════════════════════════════════════
// MAIN FUNCTION
// ═══════════════════════════════════════════════════════════════

/**
 * Check if proposal exists and resend link to returning client
 * 
 * Returns handled: true if we found a proposal and should respond
 * Returns handled: false if no proposal found, continue with normal flow
 */
export async function checkAndResendExistingProposal(
  ctx: ProposalResendContext
): Promise<ProposalResendResult> {
  const { supabase, conversaId, bitrixLeadId, clienteNome, agentName } = ctx;
  
  console.log(`[PROPOSAL_RESEND] Checking for existing proposal - conversaId: ${conversaId}, bitrixLeadId: ${bitrixLeadId}`);
  
  // 1. Buscar proposta pela conversa (proposta_id vinculado)
  const { data: conversa } = await supabase
    .from('chatbot_conversas')
    .select('proposta_id, proposta_link_sent_at, bitrix24_lead_id')
    .eq('id', conversaId)
    .maybeSingle();
  
  let propostaId = conversa?.proposta_id;
  let tipoProposta: 'inicial' | 'definitiva' = 'inicial';
  const effectiveBitrixLeadId = bitrixLeadId || conversa?.bitrix24_lead_id;
  
  // 2. Se não tem proposta_id na conversa, buscar por bitrix_lead_id
  if (!propostaId && effectiveBitrixLeadId) {
    console.log(`[PROPOSAL_RESEND] No proposta_id in conversation, searching by bitrix_lead_id: ${effectiveBitrixLeadId}`);
    
    const { data: proposta } = await supabase
      .from('propostas_assinantes')
      .select('id, tipo_proposta')
      .eq('bitrix24_lead_id', effectiveBitrixLeadId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (proposta) {
      propostaId = proposta.id;
      tipoProposta = proposta.tipo_proposta === 'definitiva' ? 'definitiva' : 'inicial';
      
      // CRITICAL: Vincular proposta_id à conversa para futuras consultas
      await supabase
        .from('chatbot_conversas')
        .update({ proposta_id: propostaId })
        .eq('id', conversaId);
      
      console.log(`[PROPOSAL_RESEND] Found proposal ${propostaId} by bitrix_lead_id, linked to conversation`);
    }
  }
  
  if (!propostaId) {
    console.log('[PROPOSAL_RESEND] No existing proposal found');
    return { handled: false, reason: 'no_proposal_found' };
  }
  
  // 3. Verificar cooldown de reenvio (1 hora)
  const RESEND_COOLDOWN_MS = 3600000; // 1 hora
  const lastSentAt = conversa?.proposta_link_sent_at 
    ? new Date(conversa.proposta_link_sent_at).getTime() 
    : 0;
  const timeSinceLastSend = Date.now() - lastSentAt;
  const withinCooldown = timeSinceLastSend < RESEND_COOLDOWN_MS;
  
  // 4. Buscar URL config e construir link
  const urlConfig = await fetchURLConfig(supabase);
  const propostaUrl = buildProposalUrl(urlConfig, propostaId, tipoProposta);
  
  // 5. Gerar mensagem apropriada
  const nome = clienteNome?.split(' ')[0] || '';
  const agentSignature = agentName ? `\n\n${agentName} ☀️` : '';
  
  let message: string;
  
  if (withinCooldown && lastSentAt > 0) {
    const minAgo = Math.round(timeSinceLastSend / 60000);
    message = `Oi${nome ? `, ${nome}` : ''}! Eu já enviei o link da sua proposta há ${minAgo} minutos. 😊\n\n` +
      `📋 Aqui está novamente: ${propostaUrl}\n\n` +
      `Qualquer dúvida, estou por aqui!${agentSignature}`;
  } else {
    message = `Oi${nome ? `, ${nome}` : ''}! Sua proposta já está pronta! 🎉\n\n` +
      `📋 Acesse aqui: ${propostaUrl}\n\n` +
      `Qualquer dúvida, é só me chamar!${agentSignature}`;
  }
  
  // 6. Atualizar timestamp de envio na conversa
  await supabase
    .from('chatbot_conversas')
    .update({
      proposta_link_sent_at: new Date().toISOString(),
      last_sofia_message_at: new Date().toISOString(),
    })
    .eq('id', conversaId);
  
  console.log(`[PROPOSAL_RESEND] ✅ Resending proposal ${propostaId} (${tipoProposta}) to returning client`);
  
  return {
    handled: true,
    message,
    propostaId,
    propostaUrl,
    reason: withinCooldown ? 'within_cooldown_resend' : 'normal_resend',
  };
}
