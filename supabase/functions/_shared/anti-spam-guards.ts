/**
 * Anti-Spam Guards Module
 * 
 * Centralized guards to prevent spam across all automation schedulers:
 * 1. Daily Message Limit: Max N assistant messages per conversation per 24h
 * 2. Cross-Conversation Takeover: Blocks automation if ANY phone variation has active takeover
 * 
 * These guards are designed to be called from any scheduler BEFORE sending a message.
 */

import { normalizeTakeoverPhone } from './human-takeover.ts';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface DailyLimitResult {
  blocked: boolean;
  count: number;
  limit: number;
  reason?: string;
}

export interface CrossConvTakeoverResult {
  blocked: boolean;
  blockingConversaId?: string;
  blockingMode?: string;
  reason?: string;
}

// ═══════════════════════════════════════════════════════════════
// CONFIG DEFAULTS
// ═══════════════════════════════════════════════════════════════

const DEFAULT_DAILY_MESSAGE_LIMIT = 3;

// ═══════════════════════════════════════════════════════════════
// 1. DAILY MESSAGE LIMIT
// Counts assistant messages in the last 24h for a conversation.
// If >= limit, blocks the automation.
// ═══════════════════════════════════════════════════════════════

export async function checkDailyMessageLimit(
  supabase: any,
  conversaId: string,
  configLimit?: number
): Promise<DailyLimitResult> {
  const limit = configLimit ?? DEFAULT_DAILY_MESSAGE_LIMIT;
  
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    const { count, error } = await supabase
      .from('chatbot_mensagens')
      .select('id', { count: 'exact', head: true })
      .eq('conversa_id', conversaId)
      .eq('role', 'assistant')
      .gte('created_at', twentyFourHoursAgo);
    
    if (error) {
      console.error('[ANTI_SPAM_GUARD] Error checking daily limit:', error);
      // Fail open to avoid blocking legitimate messages
      return { blocked: false, count: 0, limit };
    }
    
    const msgCount = count ?? 0;
    
    if (msgCount >= limit) {
      return {
        blocked: true,
        count: msgCount,
        limit,
        reason: `DAILY_LIMIT_REACHED: ${msgCount}/${limit} msgs in 24h`,
      };
    }
    
    return { blocked: false, count: msgCount, limit };
  } catch (err) {
    console.error('[ANTI_SPAM_GUARD] Exception checking daily limit:', err);
    return { blocked: false, count: 0, limit };
  }
}

// ═══════════════════════════════════════════════════════════════
// 2. CROSS-CONVERSATION TAKEOVER CHECK
// Given a phone number, generates variations (with/without digit 9)
// and checks if ANY other conversation for those phone variations
// has an active human takeover (paused_for_human or human_agent_id).
// ═══════════════════════════════════════════════════════════════

/**
 * Generate phone variations for cross-conversation lookup.
 * Brazilian mobile numbers can appear with or without the 9th digit.
 * E.g., 5534984363000 ↔ 553484363000
 */
export function getPhoneVariations(phone: string): string[] {
  if (!phone) return [];
  
  const digits = phone.replace(/\D/g, '');
  const variations = new Set<string>();
  variations.add(digits);
  
  // Normalized form (always with 9)
  const normalized = normalizeTakeoverPhone(digits);
  if (normalized) variations.add(normalized);
  
  // If the phone has 13 digits (55 + DD + 9 + 8digits), create variant without 9
  if (digits.length === 13 && digits.startsWith('55') && digits[4] === '9') {
    const without9 = digits.slice(0, 4) + digits.slice(5);
    variations.add(without9);
  }
  
  // If the phone has 12 digits (55 + DD + 8digits), create variant with 9
  if (digits.length === 12 && digits.startsWith('55')) {
    const with9 = digits.slice(0, 4) + '9' + digits.slice(4);
    variations.add(with9);
  }
  
  return Array.from(variations);
}

export async function checkCrossConversationTakeover(
  supabase: any,
  conversaId: string,
  phone: string
): Promise<CrossConvTakeoverResult> {
  if (!phone) {
    return { blocked: false };
  }
  
  try {
    const phoneVariations = getPhoneVariations(phone);
    
    if (phoneVariations.length === 0) {
      return { blocked: false };
    }
    
    // Search for any conversation with the same phone (any variation) 
    // that has active human takeover — excluding current conversation
    const { data, error } = await supabase
      .from('chatbot_conversas')
      .select('id, sofia_mode, human_agent_id, cliente_telefone')
      .in('cliente_telefone', phoneVariations)
      .neq('id', conversaId)
      .or('sofia_mode.eq.paused_for_human,human_agent_id.not.is.null')
      .limit(1);
    
    if (error) {
      console.error('[ANTI_SPAM_GUARD] Error checking cross-conv takeover:', error);
      return { blocked: false };
    }
    
    if (data && data.length > 0) {
      const blocking = data[0];
      return {
        blocked: true,
        blockingConversaId: blocking.id,
        blockingMode: blocking.sofia_mode || `agent:${blocking.human_agent_id}`,
        reason: `CROSS_CONV_TAKEOVER: phone ${phone} blocked by conversa ${blocking.id} (${blocking.sofia_mode || 'human_agent'})`,
      };
    }
    
    return { blocked: false };
  } catch (err) {
    console.error('[ANTI_SPAM_GUARD] Exception checking cross-conv takeover:', err);
    return { blocked: false };
  }
}

// ═══════════════════════════════════════════════════════════════
// 3. SCHEDULER MESSAGE SANITIZER (LGPD COMPLIANCE)
// Safety net: detects document requests in scheduler messages
// and replaces them with platform link redirects.
// ═══════════════════════════════════════════════════════════════

const DOCUMENT_REQUEST_PATTERNS_SCHEDULER = [
  /\b(envi[ae]|mand[ae]|anexe|anexar?).{0,30}(documento|rg|cnh|identidade|fatura|conta de luz|contrato|comprovante)/i,
  /\b(documento|rg|cnh|identidade|foto).{0,30}(aqui|no\s+whatsapp|por\s+aqui|nessa\s+conversa)/i,
  /\bpreciso\s+(de|que).{0,30}(documento|rg|cnh|foto|scan|digitaliza)/i,
  /\bpode\s+enviar.{0,30}(documento|rg|cnh|foto|pdf)/i,
  /\baguardando.{0,30}(documento|foto|pdf|comprovante)/i,
  /\btir[ae]\s+uma\s+foto.{0,20}(rg|cnh|documento|conta|fatura)/i,
  /\bfoto\s+(do|da|de)\s+(rg|cnh|documento|conta|fatura|contrato)/i,
  /\bmanda.{0,15}(foto|imagem|scan).{0,15}(rg|cnh|documento|conta|fatura)/i,
];

/**
 * Sanitize scheduler message for LGPD compliance.
 * If the message requests documents via WhatsApp, replace with platform redirect.
 * This is a SAFETY NET for any template that accidentally asks for docs.
 */
export function sanitizeSchedulerMessage(
  message: string,
  proposalUrl: string | null
): string {
  const hasDocRequest = DOCUMENT_REQUEST_PATTERNS_SCHEDULER.some(p => p.test(message));
  
  if (!hasDocRequest) return message;
  
  console.warn('[ANTI_SPAM_GUARD] ⚠️ LGPD SANITIZER: Document request detected in scheduler message, replacing');
  
  if (proposalUrl) {
    return `Para sua segurança, os documentos devem ser enviados através do link da sua proposta! 🔒\n\n📎 Acesse: ${proposalUrl}\n\nClique em *"Solicitar Contrato"* para anexar os arquivos de forma segura. Seus dados ficam protegidos! 💚`;
  }
  
  return `Os documentos devem ser enviados de forma segura através da plataforma! 🔒\n\nAssim que sua proposta estiver pronta, você receberá um link exclusivo para anexar os documentos com total segurança. Aguarde! 💚`;
}

// ═══════════════════════════════════════════════════════════════
// COMBINED CHECK - Convenience function for schedulers
// ═══════════════════════════════════════════════════════════════

export interface AntiSpamGuardResult {
  allowed: boolean;
  reason?: string;
  dailyLimit?: DailyLimitResult;
  crossConvTakeover?: CrossConvTakeoverResult;
}

/**
 * Run all anti-spam guards for a conversation.
 * Call this BEFORE sending any automated message.
 */
export async function runAntiSpamGuards(
  supabase: any,
  conversaId: string,
  phone: string,
  dailyLimit?: number
): Promise<AntiSpamGuardResult> {
  // Run both checks in parallel
  const [dailyResult, crossConvResult] = await Promise.all([
    checkDailyMessageLimit(supabase, conversaId, dailyLimit),
    checkCrossConversationTakeover(supabase, conversaId, phone),
  ]);
  
  if (dailyResult.blocked) {
    return {
      allowed: false,
      reason: dailyResult.reason,
      dailyLimit: dailyResult,
      crossConvTakeover: crossConvResult,
    };
  }
  
  if (crossConvResult.blocked) {
    return {
      allowed: false,
      reason: crossConvResult.reason,
      dailyLimit: dailyResult,
      crossConvTakeover: crossConvResult,
    };
  }
  
  return {
    allowed: true,
    dailyLimit: dailyResult,
    crossConvTakeover: crossConvResult,
  };
}
