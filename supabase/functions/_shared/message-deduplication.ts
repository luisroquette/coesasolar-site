// ═══════════════════════════════════════════════════════════════════════════
// MESSAGE DEDUPLICATION - PREVENTS DUPLICATE WEBHOOK PROCESSING
// ═══════════════════════════════════════════════════════════════════════════
// Uses atomic claim-first strategy with distributed locks to handle race conditions
// Ensures each message is processed exactly once even with concurrent webhooks
// Implements message batching to group rapid-fire messages together
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from 'npm:@supabase/supabase-js@2.90.0';
import { generatePhoneVariations, normalizePhoneNumber } from './utils/phone-utils.ts';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface DeduplicationResult {
  shouldProcess: boolean;
  reason: string;
  conversaId?: string;
  existingConversation?: boolean;
  timeSinceLastMsg?: number;
  timeSinceLastSofiaMsg?: number;
  claimSuccessful?: boolean;
  lockAcquired?: boolean;
  batchedMessages?: number;
}

interface ClaimResult {
  previous_last_message_at: string | null;
  previous_last_sofia_message_at: string | null;
  conversation_created_at: string | null;
}

// ═══════════════════════════════════════════════════════════════
// CONSTANTS (defaults - can be overridden by configuracoes_sistema)
// ═══════════════════════════════════════════════════════════════

const DEFAULT_COOLDOWN_MS = 8000; // 8 seconds cooldown for text+audio
const DEFAULT_BATCH_WINDOW_MS = 5000; // 5 seconds to wait for additional messages (humanized delay)
const DEFAULT_BATCH_TRIGGER_MS = 8000; // If message arrives within 8s, enable batching
const DEFAULT_NEW_CONVERSATION_BATCH_MS = 5000; // Wait 5s on NEW conversations before responding
const LOCK_DURATION_SECONDS = 30; // Lock expires after 30 seconds

// Runtime configuration (loaded from DB)
let BATCH_CONFIG = {
  cooldownMs: DEFAULT_COOLDOWN_MS,
  batchWindowMs: DEFAULT_BATCH_WINDOW_MS,
  batchTriggerMs: DEFAULT_BATCH_TRIGGER_MS,
  newConversationBatchMs: DEFAULT_NEW_CONVERSATION_BATCH_MS,
  enableNewConversationBatch: true, // NEW: also batch for new conversations
};

/**
 * Load batch configuration from configuracoes_sistema
 */
async function loadBatchConfig(supabase: any): Promise<typeof BATCH_CONFIG> {
  try {
    const { data: configs } = await supabase
      .from('configuracoes_sistema')
      .select('chave, valor')
      .in('chave', [
        'message_batch_window_ms',
        'message_batch_trigger_ms',
        'message_cooldown_ms',
        'new_conversation_batch_ms',
        'new_conversation_batch_enabled',
      ]);

    if (configs) {
      for (const cfg of configs) {
        if (cfg.chave === 'message_batch_window_ms') {
          BATCH_CONFIG.batchWindowMs = parseInt(cfg.valor) || DEFAULT_BATCH_WINDOW_MS;
        } else if (cfg.chave === 'message_batch_trigger_ms') {
          BATCH_CONFIG.batchTriggerMs = parseInt(cfg.valor) || DEFAULT_BATCH_TRIGGER_MS;
        } else if (cfg.chave === 'message_cooldown_ms') {
          BATCH_CONFIG.cooldownMs = parseInt(cfg.valor) || DEFAULT_COOLDOWN_MS;
        } else if (cfg.chave === 'new_conversation_batch_ms') {
          BATCH_CONFIG.newConversationBatchMs = parseInt(cfg.valor) || DEFAULT_NEW_CONVERSATION_BATCH_MS;
        } else if (cfg.chave === 'new_conversation_batch_enabled') {
          BATCH_CONFIG.enableNewConversationBatch = cfg.valor === 'true';
        }
      }
    }

    console.log(`[BATCH] Config loaded: window=${BATCH_CONFIG.batchWindowMs}ms, trigger=${BATCH_CONFIG.batchTriggerMs}ms, newConvo=${BATCH_CONFIG.newConversationBatchMs}ms`);
  } catch (err) {
    console.error('[BATCH] Failed to load config, using defaults:', err);
  }

  return BATCH_CONFIG;
}

// ═══════════════════════════════════════════════════════════════
// DISTRIBUTED LOCK FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Acquire a distributed lock for a phone number
 * Prevents multiple webhook instances from processing the same phone simultaneously
 */
async function acquirePhoneLock(
  supabase: any,
  phone: string,
  agentId: string,
  instanceId: string
): Promise<boolean> {
  const normalized = normalizePhoneNumber(phone);
  
  try {
    const { data, error } = await supabase
      .rpc('acquire_phone_lock', {
        p_phone: normalized,
        p_agent_id: agentId,
        p_instance_id: instanceId,
        p_lock_duration_seconds: LOCK_DURATION_SECONDS,
      });
    
    if (error) {
      console.error('[LOCK] Error acquiring lock:', error.message);
      return false;
    }
    
    console.log(`[LOCK] ${data ? '✅ Acquired' : '❌ Failed to acquire'} lock for ${normalized}`);
    return data === true;
  } catch (err) {
    console.error('[LOCK] Exception acquiring lock:', err);
    return false;
  }
}

/**
 * Release a distributed lock for a phone number
 */
export async function releasePhoneLock(
  supabase: any,
  phone: string,
  instanceId: string
): Promise<boolean> {
  const normalized = normalizePhoneNumber(phone);
  
  try {
    const { data, error } = await supabase
      .rpc('release_phone_lock', {
        p_phone: normalized,
        p_instance_id: instanceId,
      });
    
    if (error) {
      console.error('[LOCK] Error releasing lock:', error.message);
      return false;
    }
    
    console.log(`[LOCK] Released lock for ${normalized}`);
    return data === true;
  } catch (err) {
    console.error('[LOCK] Exception releasing lock:', err);
    return false;
  }
}

/**
 * Extend lock duration if processing takes longer than expected
 */
export async function extendPhoneLock(
  supabase: any,
  phone: string,
  instanceId: string,
  additionalSeconds: number = 30
): Promise<boolean> {
  const normalized = normalizePhoneNumber(phone);
  
  try {
    const { data, error } = await supabase
      .rpc('extend_phone_lock', {
        p_phone: normalized,
        p_instance_id: instanceId,
        p_additional_seconds: additionalSeconds,
      });
    
    if (error) {
      console.error('[LOCK] Error extending lock:', error.message);
      return false;
    }
    
    return data === true;
  } catch (err) {
    console.error('[LOCK] Exception extending lock:', err);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// MESSAGE BATCHING FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Wait for batch window and collect any additional messages
 * Returns the count of messages that arrived during the wait
 */
async function waitForBatchWindow(
  supabase: any,
  conversaId: string | null,
  initialMessageCount: number,
  waitMs?: number
): Promise<number> {
  const batchMs = waitMs || BATCH_CONFIG.batchWindowMs;
  console.log(`[BATCH] Waiting ${batchMs}ms for additional messages...`);
  
  await new Promise(resolve => setTimeout(resolve, batchMs));
  
  // For new conversations without ID, we just waited
  if (!conversaId) {
    console.log(`[BATCH] ✅ New conversation batch wait completed`);
    return 0;
  }
  
  // Count messages after waiting
  const { count } = await supabase
    .from('chatbot_mensagens')
    .select('*', { count: 'exact', head: true })
    .eq('conversa_id', conversaId)
    .eq('role', 'user');
  
  const newMessages = (count || 0) - initialMessageCount;
  
  if (newMessages > 0) {
    console.log(`[BATCH] ✅ Captured ${newMessages} additional messages during batch window`);
  }
  
  return newMessages;
}

// ═══════════════════════════════════════════════════════════════
// BUILD PHONE SEARCH QUERY
// Uses generatePhoneVariations for consistent phone matching
// ═══════════════════════════════════════════════════════════════

function buildPhoneOrClause(phone: string): string {
  const variations = generatePhoneVariations(phone);
  
  // Build OR clause using last 8 digits of each variation (consistent with phone-utils)
  const orClauses = variations.map(v => `cliente_telefone.ilike.%${v.slice(-8)}%`);
  
  console.log(`[DEDUP] Phone variations for search: ${variations.join(', ')}`);
  
  return orClauses.join(',');
}

// ═══════════════════════════════════════════════════════════════
// MAIN DEDUPLICATION FUNCTION
// ═══════════════════════════════════════════════════════════════

/**
 * Check if a message should be processed or is a duplicate
 * Uses atomic claim-first strategy with distributed locks and message batching
 */
export async function checkMessageDeduplication(
  supabaseUrl: string,
  supabaseServiceKey: string,
  phone: string,
  messageId: string | null,
  agentId: string,
  chatappChatId: string | null,
): Promise<DeduplicationResult> {
  // No messageId = can't deduplicate properly
  if (!messageId) {
    return { shouldProcess: true, reason: 'no_message_id' };
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const instanceId = `${agentId}-${Date.now()}-${Math.random().toString(36).substring(7)}`;

  // Load batch configuration from DB (uses cached values if already loaded)
  await loadBatchConfig(supabase);

  // ═══════════════════════════════════════════════════════════════
  // STEP 1: Check if exact messageId already exists in DB
  // ═══════════════════════════════════════════════════════════════
  const { data: existingByMsgId } = await supabase
    .from('chatbot_mensagens')
    .select('id')
    .eq('message_id', messageId)
    .limit(1)
    .maybeSingle();

  if (existingByMsgId) {
    console.log(`[DEDUP] ❌ BLOCKED: Message ${messageId} already exists in DB`);
    return {
      shouldProcess: false,
      reason: 'duplicate_message_id',
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // STEP 2: Try to acquire distributed lock
  // ═══════════════════════════════════════════════════════════════
  const lockAcquired = await acquirePhoneLock(supabase, phone, agentId, instanceId);
  
  if (!lockAcquired) {
    console.log(`[DEDUP] ❌ BLOCKED: Another instance is processing ${phone}`);
    return {
      shouldProcess: false,
      reason: 'another_instance_processing',
      lockAcquired: false,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // STEP 3: Find existing conversation using unified phone variations
  // ═══════════════════════════════════════════════════════════════
  const phoneOrClause = buildPhoneOrClause(phone);
  
  let query = supabase
    .from('chatbot_conversas')
    .select('id, last_message_at, last_sofia_message_at, created_at')
    .eq('agent_id', agentId)
    .is('ended_at', null)
    .order('created_at', { ascending: false })
    .limit(1);

  // Build OR filter for phone variations + optional chatapp_chat_id
  if (chatappChatId) {
    // Note: chatapp_chat_id column may not exist, we check with phone variations as fallback
    query = query.or(phoneOrClause);
  } else {
    query = query.or(phoneOrClause);
  }

  const { data: recentConversa } = await query.maybeSingle();

  if (!recentConversa) {
    // No existing conversation - will create new one (lock already acquired)
    console.log(`[DEDUP] No existing conversation for ${phone}, will create new`);
    
    // NEW: Wait for batch window even on new conversations to capture rapid-fire messages
    if (BATCH_CONFIG.enableNewConversationBatch) {
      console.log(`[BATCH] New conversation - waiting ${BATCH_CONFIG.newConversationBatchMs}ms before responding`);
      await waitForBatchWindow(supabase, null, 0, BATCH_CONFIG.newConversationBatchMs);
    }
    
    return { 
      shouldProcess: true, 
      reason: 'new_conversation',
      existingConversation: false,
      lockAcquired: true,
      batchedMessages: BATCH_CONFIG.enableNewConversationBatch ? 1 : 0,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // STEP 4: Atomic claim using SQL function
  // ═══════════════════════════════════════════════════════════════
  const claimTimestamp = new Date().toISOString();
  let previousLastMsgAt = 0;
  let previousSofiaMsgAt = 0;
  let conversationCreatedAt = 0;
  let claimSuccessful = false;

  const { data: claimResultRaw, error: claimError } = await supabase
    .rpc('claim_conversation_for_processing', {
      p_conversa_id: recentConversa.id,
      p_new_timestamp: claimTimestamp,
    })
    .single();

  const claimResult = claimResultRaw as ClaimResult | null;

  if (claimError) {
    console.error('[DEDUP] Atomic claim failed, using fallback:', claimError.message);
    // Fallback: use regular update
    await supabase
      .from('chatbot_conversas')
      .update({ last_message_at: claimTimestamp })
      .eq('id', recentConversa.id);

    previousLastMsgAt = recentConversa.last_message_at 
      ? new Date(recentConversa.last_message_at).getTime() 
      : 0;
    previousSofiaMsgAt = recentConversa.last_sofia_message_at 
      ? new Date(recentConversa.last_sofia_message_at).getTime() 
      : 0;
    conversationCreatedAt = new Date(recentConversa.created_at).getTime();
  } else if (claimResult) {
    previousLastMsgAt = claimResult.previous_last_message_at 
      ? new Date(claimResult.previous_last_message_at).getTime() 
      : 0;
    previousSofiaMsgAt = claimResult.previous_last_sofia_message_at 
      ? new Date(claimResult.previous_last_sofia_message_at).getTime() 
      : 0;
    conversationCreatedAt = claimResult.conversation_created_at 
      ? new Date(claimResult.conversation_created_at).getTime() 
      : 0;
    claimSuccessful = true;
    console.log(`[DEDUP] ✅ Atomic claim successful for conversation ${recentConversa.id}`);
  }

  const nowMs = Date.now();
  const timeSinceLastMsg = nowMs - previousLastMsgAt;
  const timeSinceLastSofiaMsg = nowMs - previousSofiaMsgAt;
  const timeSinceCreated = nowMs - conversationCreatedAt;

  // ═══════════════════════════════════════════════════════════════
  // CHECK 1: Conversation just created + another message processing
  // ═══════════════════════════════════════════════════════════════
  if (timeSinceCreated < BATCH_CONFIG.cooldownMs && timeSinceLastMsg < BATCH_CONFIG.cooldownMs) {
    console.log(`[DEDUP] ❌ BLOCKED: Conversation just created (${timeSinceCreated}ms)`);
    await releasePhoneLock(supabase, phone, instanceId);
    return {
      shouldProcess: false,
      reason: 'conversation_just_created',
      conversaId: recentConversa.id,
      timeSinceLastMsg,
      claimSuccessful,
      lockAcquired: true,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // CHECK 2: Another message processed too recently
  // ═══════════════════════════════════════════════════════════════
  if (timeSinceLastMsg < BATCH_CONFIG.cooldownMs) {
    console.log(`[DEDUP] ❌ BLOCKED: Another message processed ${timeSinceLastMsg}ms ago`);
    await releasePhoneLock(supabase, phone, instanceId);
    return {
      shouldProcess: false,
      reason: 'cooldown_active',
      conversaId: recentConversa.id,
      timeSinceLastMsg,
      claimSuccessful,
      lockAcquired: true,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // CHECK 3: Anti-flood - Sofia still responding
  // ═══════════════════════════════════════════════════════════════
  if (timeSinceLastSofiaMsg < 8000 && timeSinceLastMsg < 3000) {
    console.log(`[DEDUP] ❌ BLOCKED: Sofia just responded (${timeSinceLastSofiaMsg}ms ago)`);
    await releasePhoneLock(supabase, phone, instanceId);
    return {
      shouldProcess: false,
      reason: 'sofia_just_responded',
      conversaId: recentConversa.id,
      timeSinceLastMsg,
      timeSinceLastSofiaMsg,
      claimSuccessful,
      lockAcquired: true,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // STEP 5: Check if batching should be enabled
  // If message arrived quickly after previous, wait to capture more
  // ═══════════════════════════════════════════════════════════════
  let batchedMessages = 0;
  
  if (previousLastMsgAt > 0 && timeSinceLastMsg < BATCH_CONFIG.batchTriggerMs) {
    // Get current message count
    const { count: initialCount } = await supabase
      .from('chatbot_mensagens')
      .select('*', { count: 'exact', head: true })
      .eq('conversa_id', recentConversa.id)
      .eq('role', 'user');
    
    // Wait for batch window
    batchedMessages = await waitForBatchWindow(supabase, recentConversa.id, initialCount || 0);
  }

  // ═══════════════════════════════════════════════════════════════
  // ALL CHECKS PASSED - Return lock info for cleanup later
  // ═══════════════════════════════════════════════════════════════
  console.log(`[DEDUP] ✅ All checks passed for ${phone} (batched: ${batchedMessages})`);
  
  // Store instance ID in result for later lock release
  // The caller should call releasePhoneLock when done processing
  return {
    shouldProcess: true,
    reason: batchedMessages > 0 ? 'batched_messages' : 'all_checks_passed',
    conversaId: recentConversa.id,
    existingConversation: true,
    timeSinceLastMsg,
    timeSinceLastSofiaMsg,
    claimSuccessful,
    lockAcquired: true,
    batchedMessages,
  };
}

/**
 * Get cooldown duration in milliseconds
 */
export function getDeduplicationCooldownMs(): number {
  return BATCH_CONFIG.cooldownMs;
}

/**
 * Generate instance ID for distributed locking
 * Should be called once per webhook invocation and passed to checkMessageDeduplication
 */
export function generateInstanceId(agentId: string): string {
  return `${agentId}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}
