/**
 * MESSAGE BUFFER PHASE
 * 
 * Handles humanized message buffering - accumulates rapid-fire messages
 * and processes them as a single context window.
 * Extracted from sofia-webhook/index.ts lines 752-846
 * 
 * @module _shared/sofia-orchestrator/message-buffer-phase
 */

import { corsHeaders } from '../webhook-types.ts';
import {
  orchestrateMessageBuffer,
  waitForBufferReady,
  type BufferOrchestrationResult,
} from '../message-buffer.ts';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface MessageBufferContext {
  supabaseUrl: string;
  supabaseKey: string;
  phone: string;
  agentId: string;
  messageText: string;
  messageId: string | null;
  isOperatorCommand: boolean;
}

export interface MessageBufferResult {
  handled: boolean;
  shouldProcess: boolean;
  effectiveMessageText: string;
  bufferResult: BufferOrchestrationResult | null;
  response?: Response;
  reason?: string;
}

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const MAX_BUFFER_WAIT_MS = 20000;
const POLL_INTERVAL_MS = 500;

// ═══════════════════════════════════════════════════════════════
// MAIN EXECUTION FUNCTION
// ═══════════════════════════════════════════════════════════════

/**
 * Execute message buffer phase
 * Handles operator command bypass and humanized message buffering
 */
export async function executeMessageBufferPhase(
  ctx: MessageBufferContext
): Promise<MessageBufferResult> {
  const {
    supabaseUrl,
    supabaseKey,
    phone,
    agentId,
    messageText,
    messageId,
    isOperatorCommand,
  } = ctx;
  
  // Operator commands bypass buffer entirely
  if (isOperatorCommand) {
    console.log(`[BUFFER] ⚡ OPERATOR COMMAND DETECTED: "${messageText.substring(0, 30)}" - BYPASSING BUFFER for instant processing`);
    
    return {
      handled: false,
      shouldProcess: true,
      effectiveMessageText: messageText,
      bufferResult: {
        shouldProcess: true,
        reason: 'operator_command_bypass',
        mergedText: messageText,
        messageCount: 1,
        phantomEnterDetected: false,
        bufferId: null,
        waitTimeMs: 0,
        originalMessages: [],
      },
    };
  }
  
  // Regular message - apply humanized buffer
  try {
    let bufferResult = await orchestrateMessageBuffer({
      supabaseUrl,
      supabaseKey,
      phone,
      agentId,
      messageText,
      messageId: messageId || null,
      timestamp: new Date(),
    });
    
    // If buffer not ready (more messages expected), wait and check again
    if (!bufferResult.shouldProcess && bufferResult.reason === 'waiting_for_silence') {
      console.log(`[BUFFER] ⏳ Waiting for silence window (${bufferResult.waitTimeMs}ms remaining)...`);
      
      // Wait for buffer to be ready (polls internally)
      const waitResult = await waitForBufferReady(
        supabaseUrl,
        supabaseKey,
        phone,
        agentId,
        MAX_BUFFER_WAIT_MS,
        POLL_INTERVAL_MS
      );
      
      if (!waitResult.shouldProcess) {
        console.log(`[BUFFER] ❌ Buffer claimed by another instance or timeout: ${waitResult.reason}`);
        return {
          handled: true,
          shouldProcess: false,
          effectiveMessageText: messageText,
          bufferResult: null,
          response: new Response(JSON.stringify({
            status: 'buffer_not_processed',
            reason: waitResult.reason,
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }),
        };
      }
      
      // Update bufferResult with wait results
      bufferResult = {
        ...bufferResult,
        shouldProcess: true,
        mergedText: waitResult.mergedText,
        messageCount: waitResult.messageCount,
        phantomEnterDetected: waitResult.phantomEnterDetected,
        bufferId: waitResult.bufferId,
        reason: waitResult.reason,
      };
    }
    
    // If buffer already processing by another instance, skip
    if (!bufferResult.shouldProcess) {
      console.log(`[BUFFER] ❌ Skipping: ${bufferResult.reason}`);
      return {
        handled: true,
        shouldProcess: false,
        effectiveMessageText: messageText,
        bufferResult: null,
        response: new Response(JSON.stringify({
          status: 'buffer_skipped',
          reason: bufferResult.reason,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }),
      };
    }
    
    // Use merged message for processing
    const effectiveMessageText = bufferResult.mergedText || messageText;
    
    if (bufferResult.messageCount > 1) {
      console.log(`[BUFFER] ✅ Processing ${bufferResult.messageCount} messages as: "${effectiveMessageText.substring(0, 100)}${effectiveMessageText.length > 100 ? '...' : ''}"`);
    }
    
    if (bufferResult.phantomEnterDetected) {
      console.log(`[BUFFER] 📝 Phantom Enter detected - messages were fragmented by user`);
    }
    
    return {
      handled: false,
      shouldProcess: true,
      effectiveMessageText,
      bufferResult,
    };
    
  } catch (bufferError) {
    console.warn('[BUFFER] ⚠️ Buffer orchestration failed, proceeding with single message:', bufferError);
    
    // Continue with original messageText - buffer failure shouldn't block processing
    return {
      handled: false,
      shouldProcess: true,
      effectiveMessageText: messageText,
      bufferResult: null,
      reason: 'buffer_error_fallback',
    };
  }
}
