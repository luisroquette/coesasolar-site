/**
 * Outbound Guard - Circuit Breaker de Saída
 * Camada C do plano de defesa contra mensagens duplicadas
 * 
 * Funcionalidades:
 * - Calcula hash de mensagens de saída (phone + agent + content)
 * - Verifica se já foi enviada na janela de tempo configurável
 * - Bloqueia envio e registra evento se duplicada
 * - Pausa conversa automaticamente após N bloqueios (configurável)
 * - Cria notificação para admin quando detecta loop
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// Use unified config loader for hierarchical config resolution
import { getConfigValue, getConfigNumber, getConfigBool } from './unified-config-loader.ts';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface OutboundGuardResult {
  allowed: boolean;
  reason: 'new' | 'duplicate_blocked' | 'circuit_breaker_disabled';
  hitCount: number;
  shouldPause: boolean;
}

export interface OutboundGuardConfig {
  enabled: boolean;
  windowMs: number;
  maxHits: number;
  pauseOnMaxHits: boolean;
}

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════

const DEFAULT_WINDOW_MS = 90000; // 90 segundos
const DEFAULT_MAX_HITS = 2;

/**
 * Load outbound guard configuration from database
 */
export function getOutboundGuardConfig(configCache?: Map<string, string>): OutboundGuardConfig {
  return {
    enabled: getConfigBool('outbound_circuit_breaker_enabled', true, configCache),
    windowMs: getConfigNumber('outbound_dedupe_window_ms', DEFAULT_WINDOW_MS, configCache),
    maxHits: getConfigNumber('outbound_dedupe_max_hits', DEFAULT_MAX_HITS, configCache),
    pauseOnMaxHits: getConfigBool('outbound_circuit_breaker_pause', true, configCache),
  };
}

// ═══════════════════════════════════════════════════════════════
// HASH GENERATION
// ═══════════════════════════════════════════════════════════════

/**
 * Normalize message content for hashing
 * - Lowercase
 * - Remove extra whitespace
 * - Remove emojis (they can vary between sends)
 * - Trim
 */
function normalizeForHash(content: string): string {
  return content
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F700}-\u{1F77F}]|[\u{1F780}-\u{1F7FF}]|[\u{1F800}-\u{1F8FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '')
    .trim();
}

/**
 * Generate a simple hash for the message content
 * Uses a fast string hash (djb2 algorithm)
 */
function simpleHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Generate content hash for deduplication
 */
export function generateContentHash(phone: string, agentId: string, message: string): string {
  const normalized = normalizeForHash(message);
  const combined = `${phone}|${agentId}|${normalized}`;
  return simpleHash(combined);
}

// ═══════════════════════════════════════════════════════════════
// CORE GUARD FUNCTION
// ═══════════════════════════════════════════════════════════════

/**
 * Check if an outbound message should be allowed
 * Returns result with allowed status and reason
 */
export async function checkOutboundMessage(
  supabaseUrl: string,
  supabaseKey: string,
  phone: string,
  agentId: string,
  message: string,
  configCache?: Map<string, string>
): Promise<OutboundGuardResult> {
  const config = getOutboundGuardConfig(configCache);
  
  // If circuit breaker is disabled, allow everything
  if (!config.enabled) {
    console.log('[OUTBOUND_GUARD] Circuit breaker disabled, allowing message');
    return { allowed: true, reason: 'circuit_breaker_disabled', hitCount: 0, shouldPause: false };
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  const contentHash = generateContentHash(phone, agentId, message);
  const windowStart = new Date(Date.now() - config.windowMs).toISOString();
  
  console.log(`[OUTBOUND_GUARD] Checking hash ${contentHash} for ${phone}/${agentId} (window: ${config.windowMs}ms)`);
  
  try {
    // Check if this hash was sent recently
    const { data: existingHashes, error: selectError } = await supabase
      .from('outbound_message_hashes')
      .select('id, blocked_count')
      .eq('phone_normalized', phone)
      .eq('agent_id', agentId)
      .eq('content_hash', contentHash)
      .gte('sent_at', windowStart)
      .order('sent_at', { ascending: false })
      .limit(1);
    
    if (selectError) {
      console.error('[OUTBOUND_GUARD] Error checking hashes:', selectError.message);
      // On error, allow to avoid blocking legitimate messages
      return { allowed: true, reason: 'new', hitCount: 0, shouldPause: false };
    }
    
    if (existingHashes && existingHashes.length > 0) {
      // Duplicate detected! Increment blocked_count
      const existing = existingHashes[0];
      const newBlockedCount = (existing.blocked_count || 0) + 1;
      
      await supabase
        .from('outbound_message_hashes')
        .update({ blocked_count: newBlockedCount })
        .eq('id', existing.id);
      
      console.log(`[OUTBOUND_GUARD] ⛔ DUPLICATE BLOCKED! Hash ${contentHash} hit count: ${newBlockedCount}`);
      
      const shouldPause = config.pauseOnMaxHits && newBlockedCount >= config.maxHits;
      
      // Log to admin if approaching threshold
      if (newBlockedCount >= config.maxHits - 1) {
        await createLoopDetectedNotification(supabase, phone, agentId, newBlockedCount, message);
      }
      
      return {
        allowed: false,
        reason: 'duplicate_blocked',
        hitCount: newBlockedCount,
        shouldPause,
      };
    }
    
    // New message - record the hash
    const preview = message.substring(0, 100);
    await supabase
      .from('outbound_message_hashes')
      .insert({
        phone_normalized: phone,
        agent_id: agentId,
        content_hash: contentHash,
        message_preview: preview,
        sent_at: new Date().toISOString(),
        blocked_count: 0,
      });
    
    console.log(`[OUTBOUND_GUARD] ✅ New message allowed, hash ${contentHash} recorded`);
    return { allowed: true, reason: 'new', hitCount: 0, shouldPause: false };
    
  } catch (err) {
    console.error('[OUTBOUND_GUARD] Unexpected error:', err);
    // On error, allow to avoid blocking legitimate messages
    return { allowed: true, reason: 'new', hitCount: 0, shouldPause: false };
  }
}

/**
 * Pause conversation and notify admin when loop is detected
 */
async function createLoopDetectedNotification(
  supabase: any,
  phone: string,
  agentId: string,
  hitCount: number,
  message: string
): Promise<void> {
  try {
    // Create admin notification
    await supabase.from('admin_notifications').insert({
      admin_user_id: null, // All admins
      title: '🔄 Loop de mensagens detectado',
      message: `O agente ${agentId} tentou enviar a mesma mensagem ${hitCount}x para ${phone} em poucos segundos. Mensagem: "${message.substring(0, 80)}..."`,
      type: 'warning',
      entity_type: 'outbound_guard',
      entity_id: null,
      created_by_nome: 'Sistema (Circuit Breaker)',
    });
    
    console.log(`[OUTBOUND_GUARD] Admin notification created for loop on ${phone}`);
  } catch (err) {
    console.error('[OUTBOUND_GUARD] Failed to create notification:', err);
  }
}

/**
 * Pause conversation when circuit breaker triggers
 */
export async function pauseConversationForLoop(
  supabaseUrl: string,
  supabaseKey: string,
  conversaId: string,
  reason: string
): Promise<void> {
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  try {
    await supabase
      .from('chatbot_conversas')
      .update({
        sofia_mode: 'paused_for_human',
        needs_human_fallback: true,
        escalation_reason: `Circuit breaker: ${reason}`,
        escalated_at: new Date().toISOString(),
      })
      .eq('id', conversaId);
    
    console.log(`[OUTBOUND_GUARD] Conversation ${conversaId} paused due to loop detection`);
    
    // Create notification for the pause
    await supabase.from('admin_notifications').insert({
      admin_user_id: null,
      title: '⚠️ Conversa pausada automaticamente',
      message: `A conversa ${conversaId} foi pausada pelo circuit breaker: ${reason}`,
      type: 'error',
      entity_type: 'chatbot_conversa',
      entity_id: conversaId,
      created_by_nome: 'Sistema (Circuit Breaker)',
    });
    
  } catch (err) {
    console.error('[OUTBOUND_GUARD] Failed to pause conversation:', err);
  }
}
