// ═══════════════════════════════════════════════════════════════
// MESSAGE BUFFER MODULE - Humanized Message Batching System
// Accumulates rapid-fire messages and processes them as a single context
// ═══════════════════════════════════════════════════════════════

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
// Use unified config loader for hierarchical config resolution
import { getConfigNumber, getConfigValue } from './unified-config-loader.ts';
import { normalizePhoneNumber } from './utils/phone-utils.ts';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface BufferedMessage {
  text: string;
  message_id: string | null;
  timestamp: number; // Unix timestamp in milliseconds
}

export interface BufferAddResult {
  bufferId: string;
  messageCount: number;
  sessionStartedAt: Date;
  isNewSession: boolean;
}

export interface BufferReadyResult {
  isReady: boolean;
  bufferId: string | null;
  messages: BufferedMessage[];
  messageCount: number;
  msSinceLastMessage: number;
  sessionStartedAt: Date | null;
}

export interface BufferClaimResult {
  claimed: boolean;
  bufferId: string | null;
  messages: BufferedMessage[];
  messageCount: number;
}

export interface MergedMessageResult {
  mergedText: string;
  originalCount: number;
  phantomEnterDetected: boolean;
  phantomEnterCount: number;
}

export interface BufferConfig {
  waitWindowMs: number;
  sessionTimeoutMs: number;
  maxMessages: number;
  phantomEnterChars: number;
}

// ═══════════════════════════════════════════════════════════════
// DEFAULT CONFIGURATION
// ═══════════════════════════════════════════════════════════════

const DEFAULT_BUFFER_CONFIG: BufferConfig = {
  waitWindowMs: 4000,        // Wait 4s of silence before processing
  sessionTimeoutMs: 5000,    // Reset buffer after 5s gap
  maxMessages: 10,           // Max messages in buffer
  phantomEnterChars: 10,     // Messages < 10 chars may be "phantom enter"
};

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION LOADING
// ═══════════════════════════════════════════════════════════════

/**
 * Load buffer configuration from configuracoes_sistema
 */
export async function loadBufferConfig(
  supabase: SupabaseClient,
  configCache?: Map<string, string>
): Promise<BufferConfig> {
  try {
    // Try to use config-loader if available
    const waitWindowMs = getConfigNumber('buffer_wait_window_ms', DEFAULT_BUFFER_CONFIG.waitWindowMs, configCache);
    const sessionTimeoutMs = getConfigNumber('buffer_session_timeout_ms', DEFAULT_BUFFER_CONFIG.sessionTimeoutMs, configCache);
    const maxMessages = getConfigNumber('buffer_max_messages', DEFAULT_BUFFER_CONFIG.maxMessages, configCache);
    const phantomEnterChars = getConfigNumber('buffer_phantom_enter_chars', DEFAULT_BUFFER_CONFIG.phantomEnterChars, configCache);

    return {
      waitWindowMs,
      sessionTimeoutMs,
      maxMessages,
      phantomEnterChars,
    };
  } catch (err) {
    console.warn('[BUFFER] Failed to load config, using defaults:', err);
    return DEFAULT_BUFFER_CONFIG;
  }
}

// ═══════════════════════════════════════════════════════════════
// BUFFER MANAGEMENT FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Add a message to the buffer for a given phone number
 * Creates new buffer if none exists, or appends to existing
 */
export async function addToBuffer(
  supabase: SupabaseClient,
  phone: string,
  agentId: string,
  messageText: string,
  messageId: string | null = null,
  timestamp: Date = new Date()
): Promise<BufferAddResult | null> {
  const normalizedPhone = normalizePhoneNumber(phone);
  
  // Define interface for RPC result
  interface AddBufferRpcResult {
    buffer_id: string;
    message_count: number;
    session_started_at: string;
    is_new_session: boolean;
  }
  
  try {
    const { data, error } = await supabase
      .rpc('add_to_message_buffer', {
        p_phone: normalizedPhone,
        p_agent_id: agentId,
        p_message_text: messageText,
        p_message_id: messageId,
        p_timestamp: timestamp.toISOString(),
      })
      .single();

    if (error) {
      console.error('[BUFFER] Error adding to buffer:', error.message);
      return null;
    }

    if (!data) {
      return null;
    }

    const result = data as AddBufferRpcResult;
    console.log(`[BUFFER] Added message to buffer: phone=${normalizedPhone}, count=${result.message_count}, newSession=${result.is_new_session}`);

    return {
      bufferId: result.buffer_id,
      messageCount: result.message_count,
      sessionStartedAt: new Date(result.session_started_at),
      isNewSession: result.is_new_session,
    };
  } catch (err) {
    console.error('[BUFFER] Exception adding to buffer:', err);
    return null;
  }
}

/**
 * Check if buffer is ready to process (silence period reached)
 */
export async function checkBufferReady(
  supabase: SupabaseClient,
  phone: string,
  agentId: string,
  silenceWindowMs?: number
): Promise<BufferReadyResult> {
  const normalizedPhone = normalizePhoneNumber(phone);
  const windowMs = silenceWindowMs || DEFAULT_BUFFER_CONFIG.waitWindowMs;

  // Define interface for RPC result
  interface CheckBufferRpcResult {
    is_ready: boolean;
    buffer_id: string | null;
    messages: BufferedMessage[] | null;
    message_count: number;
    ms_since_last_message: number;
    session_started_at: string | null;
  }

  try {
    const { data, error } = await supabase
      .rpc('check_buffer_ready', {
        p_phone: normalizedPhone,
        p_agent_id: agentId,
        p_silence_window_ms: windowMs,
      })
      .single();

    if (error) {
      console.error('[BUFFER] Error checking buffer ready:', error.message);
      return {
        isReady: false,
        bufferId: null,
        messages: [],
        messageCount: 0,
        msSinceLastMessage: 0,
        sessionStartedAt: null,
      };
    }

    const result = data as CheckBufferRpcResult | null;
    const messages: BufferedMessage[] = result?.messages 
      ? (Array.isArray(result.messages) ? result.messages : [])
      : [];

    return {
      isReady: result?.is_ready || false,
      bufferId: result?.buffer_id || null,
      messages,
      messageCount: result?.message_count || 0,
      msSinceLastMessage: result?.ms_since_last_message || 0,
      sessionStartedAt: result?.session_started_at ? new Date(result.session_started_at) : null,
    };
  } catch (err) {
    console.error('[BUFFER] Exception checking buffer ready:', err);
    return {
      isReady: false,
      bufferId: null,
      messages: [],
      messageCount: 0,
      msSinceLastMessage: 0,
      sessionStartedAt: null,
    };
  }
}

/**
 * Claim buffer for processing (atomically sets is_processing = true)
 * Returns null if already being processed by another instance
 */
export async function claimBuffer(
  supabase: SupabaseClient,
  phone: string,
  agentId: string
): Promise<BufferClaimResult> {
  const normalizedPhone = normalizePhoneNumber(phone);

  // Define interface for RPC result
  interface ClaimBufferRpcResult {
    claimed: boolean;
    buffer_id: string | null;
    messages: BufferedMessage[] | null;
    message_count: number;
  }

  try {
    const { data, error } = await supabase
      .rpc('claim_message_buffer', {
        p_phone: normalizedPhone,
        p_agent_id: agentId,
      })
      .single();

    if (error) {
      console.error('[BUFFER] Error claiming buffer:', error.message);
      return { claimed: false, bufferId: null, messages: [], messageCount: 0 };
    }

    const result = data as ClaimBufferRpcResult | null;
    const messages: BufferedMessage[] = result?.messages 
      ? (Array.isArray(result.messages) ? result.messages : [])
      : [];

    if (result?.claimed) {
      console.log(`[BUFFER] ✅ Claimed buffer for processing: phone=${normalizedPhone}, count=${result.message_count}`);
    } else {
      console.log(`[BUFFER] ❌ Buffer already being processed: phone=${normalizedPhone}`);
    }

    return {
      claimed: result?.claimed || false,
      bufferId: result?.buffer_id || null,
      messages,
      messageCount: result?.message_count || 0,
    };
  } catch (err) {
    console.error('[BUFFER] Exception claiming buffer:', err);
    return { claimed: false, bufferId: null, messages: [], messageCount: 0 };
  }
}

/**
 * Clear buffer after processing
 */
export async function clearBuffer(
  supabase: SupabaseClient,
  phone: string,
  agentId: string
): Promise<boolean> {
  const normalizedPhone = normalizePhoneNumber(phone);

  try {
    const { data, error } = await supabase
      .rpc('clear_message_buffer', {
        p_phone: normalizedPhone,
        p_agent_id: agentId,
      });

    if (error) {
      console.error('[BUFFER] Error clearing buffer:', error.message);
      return false;
    }

    console.log(`[BUFFER] Buffer cleared: phone=${normalizedPhone}`);
    return data === true;
  } catch (err) {
    console.error('[BUFFER] Exception clearing buffer:', err);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// MESSAGE MERGING LOGIC
// ═══════════════════════════════════════════════════════════════

/**
 * Detect if a message is likely a "phantom enter" (accidental short message)
 * User pressed Enter in the middle of typing
 */
function isPhantomEnter(
  message: BufferedMessage,
  previousMessage: BufferedMessage | null,
  phantomEnterChars: number
): boolean {
  if (!previousMessage) return false;
  
  // Check if message is very short
  const isShort = message.text.trim().length < phantomEnterChars;
  
  // Check if it arrived very quickly after the previous message (< 3 seconds)
  const timeDiff = message.timestamp - previousMessage.timestamp;
  const isRapid = timeDiff < 3000;
  
  return isShort && isRapid;
}

/**
 * Merge buffered messages into a single coherent text
 * Handles "phantom enter" detection - joining fragmented messages
 */
export function mergeBufferedMessages(
  messages: BufferedMessage[],
  config: BufferConfig = DEFAULT_BUFFER_CONFIG
): MergedMessageResult {
  if (!messages || messages.length === 0) {
    return {
      mergedText: '',
      originalCount: 0,
      phantomEnterDetected: false,
      phantomEnterCount: 0,
    };
  }

  if (messages.length === 1) {
    return {
      mergedText: messages[0].text.trim(),
      originalCount: 1,
      phantomEnterDetected: false,
      phantomEnterCount: 0,
    };
  }

  // Sort by timestamp to ensure correct order
  const sorted = [...messages].sort((a, b) => a.timestamp - b.timestamp);
  
  const mergedParts: string[] = [];
  let phantomEnterCount = 0;
  
  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i];
    const previous = i > 0 ? sorted[i - 1] : null;
    
    const isPhantom = isPhantomEnter(current, previous, config.phantomEnterChars);
    
    if (isPhantom && mergedParts.length > 0) {
      // Join with previous (likely user pressed Enter mid-sentence)
      const lastIndex = mergedParts.length - 1;
      const lastPart = mergedParts[lastIndex];
      
      // Smart joining: don't add space if last char is punctuation or current starts lowercase
      const needsSpace = !lastPart.match(/[.!?,;:\s]$/) && 
                         !current.text.match(/^[.!?,;:\s]/);
      
      mergedParts[lastIndex] = lastPart + (needsSpace ? ' ' : '') + current.text.trim();
      phantomEnterCount++;
    } else {
      // New logical message
      mergedParts.push(current.text.trim());
    }
  }
  
  // Join all parts with space
  const mergedText = mergedParts.join(' ').trim();
  
  console.log(`[BUFFER] Merged ${messages.length} messages → "${mergedText.substring(0, 100)}${mergedText.length > 100 ? '...' : ''}" (phantomEnter=${phantomEnterCount})`);
  
  return {
    mergedText,
    originalCount: messages.length,
    phantomEnterDetected: phantomEnterCount > 0,
    phantomEnterCount,
  };
}

// ═══════════════════════════════════════════════════════════════
// BUFFER ORCHESTRATION (Main Entry Point)
// ═══════════════════════════════════════════════════════════════

export interface BufferOrchestrationContext {
  supabaseUrl: string;
  supabaseKey: string;
  phone: string;
  agentId: string;
  messageText: string;
  messageId: string | null;
  timestamp?: Date;
  configCache?: Map<string, string>;
}

export interface BufferOrchestrationResult {
  shouldProcess: boolean;
  reason: string;
  mergedText: string | null;
  originalMessages: BufferedMessage[];
  messageCount: number;
  phantomEnterDetected: boolean;
  bufferId: string | null;
  waitTimeMs: number;
}

/**
 * Main orchestration function for message buffering
 * 
 * Flow:
 * 1. Add incoming message to buffer
 * 2. Check if silence window has been reached
 * 3. If not ready, return shouldProcess: false (caller should return early)
 * 4. If ready, claim buffer and return merged messages
 */
export async function orchestrateMessageBuffer(
  ctx: BufferOrchestrationContext
): Promise<BufferOrchestrationResult> {
  const supabase = createClient(ctx.supabaseUrl, ctx.supabaseKey);
  const timestamp = ctx.timestamp || new Date();
  
  // Load configuration
  const config = await loadBufferConfig(supabase, ctx.configCache);
  
  // Step 1: Add message to buffer
  const addResult = await addToBuffer(
    supabase,
    ctx.phone,
    ctx.agentId,
    ctx.messageText,
    ctx.messageId,
    timestamp
  );
  
  if (!addResult) {
    // Failed to add to buffer, fall through to normal processing
    console.warn('[BUFFER] Failed to add to buffer, proceeding with single message');
    return {
      shouldProcess: true,
      reason: 'buffer_add_failed',
      mergedText: ctx.messageText,
      originalMessages: [{ text: ctx.messageText, message_id: ctx.messageId, timestamp: timestamp.getTime() }],
      messageCount: 1,
      phantomEnterDetected: false,
      bufferId: null,
      waitTimeMs: 0,
    };
  }
  
  // Step 2: Check if buffer hit max messages (force process)
  if (addResult.messageCount >= config.maxMessages) {
    console.log(`[BUFFER] Max messages reached (${addResult.messageCount}), forcing processing`);
    
    const claimResult = await claimBuffer(supabase, ctx.phone, ctx.agentId);
    
    if (!claimResult.claimed) {
      return {
        shouldProcess: false,
        reason: 'already_processing',
        mergedText: null,
        originalMessages: [],
        messageCount: 0,
        phantomEnterDetected: false,
        bufferId: null,
        waitTimeMs: 0,
      };
    }
    
    const merged = mergeBufferedMessages(claimResult.messages, config);
    
    return {
      shouldProcess: true,
      reason: 'max_messages_reached',
      mergedText: merged.mergedText,
      originalMessages: claimResult.messages,
      messageCount: claimResult.messageCount,
      phantomEnterDetected: merged.phantomEnterDetected,
      bufferId: claimResult.bufferId,
      waitTimeMs: 0,
    };
  }
  
  // Step 3: Check if silence window reached
  const readyResult = await checkBufferReady(supabase, ctx.phone, ctx.agentId, config.waitWindowMs);
  
  if (!readyResult.isReady) {
    // Not ready yet - caller should return early and wait
    console.log(`[BUFFER] Not ready yet: ${readyResult.msSinceLastMessage}ms < ${config.waitWindowMs}ms window`);
    
    return {
      shouldProcess: false,
      reason: 'waiting_for_silence',
      mergedText: null,
      originalMessages: readyResult.messages,
      messageCount: readyResult.messageCount,
      phantomEnterDetected: false,
      bufferId: readyResult.bufferId,
      waitTimeMs: config.waitWindowMs - readyResult.msSinceLastMessage,
    };
  }
  
  // Step 4: Ready to process - claim buffer
  const claimResult = await claimBuffer(supabase, ctx.phone, ctx.agentId);
  
  if (!claimResult.claimed) {
    return {
      shouldProcess: false,
      reason: 'already_processing',
      mergedText: null,
      originalMessages: [],
      messageCount: 0,
      phantomEnterDetected: false,
      bufferId: null,
      waitTimeMs: 0,
    };
  }
  
  // Step 5: Merge messages
  const merged = mergeBufferedMessages(claimResult.messages, config);
  
  console.log(`[BUFFER] ✅ Ready to process: ${claimResult.messageCount} messages → "${merged.mergedText.substring(0, 50)}..."`);
  
  return {
    shouldProcess: true,
    reason: 'silence_window_reached',
    mergedText: merged.mergedText,
    originalMessages: claimResult.messages,
    messageCount: claimResult.messageCount,
    phantomEnterDetected: merged.phantomEnterDetected,
    bufferId: claimResult.bufferId,
    waitTimeMs: 0,
  };
}

/**
 * Wait for buffer silence window using polling
 * Used when initial check shows buffer not ready
 */
export async function waitForBufferReady(
  supabaseUrl: string,
  supabaseKey: string,
  phone: string,
  agentId: string,
  maxWaitMs: number = 20000, // Max 20 seconds total
  pollIntervalMs: number = 500
): Promise<BufferOrchestrationResult> {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const config = await loadBufferConfig(supabase);
  const startTime = Date.now();
  
  console.log(`[BUFFER] Starting wait loop: maxWait=${maxWaitMs}ms, poll=${pollIntervalMs}ms`);
  
  while (Date.now() - startTime < maxWaitMs) {
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    
    const readyResult = await checkBufferReady(supabase, phone, agentId, config.waitWindowMs);
    
    if (readyResult.isReady) {
      // Ready! Claim and return
      const claimResult = await claimBuffer(supabase, phone, agentId);
      
      if (claimResult.claimed) {
        const merged = mergeBufferedMessages(claimResult.messages, config);
        
        return {
          shouldProcess: true,
          reason: 'silence_window_reached_after_wait',
          mergedText: merged.mergedText,
          originalMessages: claimResult.messages,
          messageCount: claimResult.messageCount,
          phantomEnterDetected: merged.phantomEnterDetected,
          bufferId: claimResult.bufferId,
          waitTimeMs: Date.now() - startTime,
        };
      } else {
        // Someone else claimed it
        return {
          shouldProcess: false,
          reason: 'claimed_by_another_instance',
          mergedText: null,
          originalMessages: [],
          messageCount: 0,
          phantomEnterDetected: false,
          bufferId: null,
          waitTimeMs: Date.now() - startTime,
        };
      }
    }
    
    // Buffer updated (new message arrived), reset wait
    if (readyResult.msSinceLastMessage < pollIntervalMs) {
      console.log(`[BUFFER] New message detected, continuing wait...`);
    }
  }
  
  // Timeout - force process whatever we have
  console.log(`[BUFFER] Wait timeout reached, forcing process`);
  
  const claimResult = await claimBuffer(supabase, phone, agentId);
  
  if (!claimResult.claimed) {
    return {
      shouldProcess: false,
      reason: 'timeout_already_processing',
      mergedText: null,
      originalMessages: [],
      messageCount: 0,
      phantomEnterDetected: false,
      bufferId: null,
      waitTimeMs: maxWaitMs,
    };
  }
  
  const merged = mergeBufferedMessages(claimResult.messages, config);
  
  return {
    shouldProcess: true,
    reason: 'timeout_force_process',
    mergedText: merged.mergedText,
    originalMessages: claimResult.messages,
    messageCount: claimResult.messageCount,
    phantomEnterDetected: merged.phantomEnterDetected,
    bufferId: claimResult.bufferId,
    waitTimeMs: maxWaitMs,
  };
}
