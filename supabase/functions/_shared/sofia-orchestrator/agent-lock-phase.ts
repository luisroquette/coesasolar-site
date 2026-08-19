/**
 * AGENT STATUS & LOCK PHASE
 * 
 * Handles real-time agent status verification and cross-webhook locking
 * Extracted from sofia-webhook/index.ts lines 810-965
 * 
 * @module _shared/sofia-orchestrator/agent-lock-phase
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.90.0';
import { corsHeaders } from '../webhook-types.ts';
import type { MessageData } from '../webhook-types.ts';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface AgentLockPhaseContext {
  supabase: SupabaseClient;
  phone: string;
  agentId: string;
  messageId?: string;
  msgData?: MessageData;
  chatappChatId?: string;
}

export interface AgentLockPhaseResult {
  handled: boolean;
  response?: Response;
  agentStatus?: string;
  agentName?: string;
  lockAcquired?: boolean;
  lockInfo?: CrossLockInfo;
}

export interface AgentStatusCheck {
  status: string;
  name: string;
  isActive: boolean;
}

export interface CrossLockInfo {
  acquired: boolean;
  existingLockBy?: string;
  existingLockPurpose?: string;
}

// ═══════════════════════════════════════════════════════════════
// AGENT STATUS VERIFICATION
// ═══════════════════════════════════════════════════════════════

/**
 * Check agent status directly from database (bypasses cache)
 * Critical for ensuring pause takes effect immediately
 */
export async function checkAgentStatusRealtime(
  supabase: SupabaseClient,
  agentId: string
): Promise<AgentStatusCheck> {
  const { data: agentStatusData, error: statusError } = await supabase
    .from('ai_agents')
    .select('status, name')
    .eq('agent_id', agentId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  
  const status = agentStatusData?.status || 'unknown';
  const name = agentStatusData?.name || agentId;
  
  console.log(`[AGENT_STATUS] Real-time status check: agent=${agentId} status=${status} (no cache)`);
  
  return {
    status,
    name,
    isActive: status === 'active',
  };
}

/**
 * Save message to conversation when agent is inactive
 * Ensures no messages are lost even when agent is paused
 */
export async function saveMessageWhileInactive(
  supabase: SupabaseClient,
  phone: string,
  agentId: string,
  messageText: string,
  messageId?: string
): Promise<{ saved: boolean; conversaId?: string }> {
  try {
    const { data: inactiveAgentConversa } = await supabase
      .from('chatbot_conversas')
      .select('id')
      .eq('cliente_telefone', phone)
      .eq('agent_id', agentId)
      .eq('whatsapp_provider', 'zapi')
      .is('ended_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (inactiveAgentConversa) {
      await supabase.from('chatbot_mensagens').insert({
        conversa_id: inactiveAgentConversa.id,
        role: 'user',
        content: messageText,
        message_id: messageId || null,
      });
      
      await supabase
        .from('chatbot_conversas')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', inactiveAgentConversa.id);
      
      console.log(`[AGENT_STATUS] Message saved to conversation ${inactiveAgentConversa.id} (agent inactive)`);
      return { saved: true, conversaId: inactiveAgentConversa.id };
    }
    
    return { saved: false };
  } catch (saveErr) {
    console.warn('[AGENT_STATUS] Failed to save message while agent inactive:', saveErr);
    return { saved: false };
  }
}

// ═══════════════════════════════════════════════════════════════
// CROSS-WEBHOOK LOCKING
// ═══════════════════════════════════════════════════════════════

/**
 * Acquire cross-webhook lock to prevent simultaneous processing
 * Uses distributed lock with configurable timeout
 */
export async function acquireCrossWebhookLock(
  supabase: SupabaseClient,
  phone: string,
  lockedBy: string = 'sofia-webhook',
  purpose: string = 'message_processing',
  durationSeconds: number = 45
): Promise<CrossLockInfo> {
  const { data: crossLockResult, error: crossLockError } = await supabase.rpc('acquire_cross_webhook_lock', {
    p_phone: phone,
    p_lead_id: null,
    p_locked_by: lockedBy,
    p_purpose: purpose,
    p_lock_duration_seconds: durationSeconds,
  });

  if (crossLockError) {
    console.error('[CROSS_LOCK] ❌ Error acquiring lock:', crossLockError);
    // Continue processing - lock failure shouldn't block messages
    return { acquired: true };
  }

  if (crossLockResult && crossLockResult.length > 0 && !crossLockResult[0].acquired) {
    const lockInfo = crossLockResult[0];
    return {
      acquired: false,
      existingLockBy: lockInfo.existing_lock_by,
      existingLockPurpose: lockInfo.existing_lock_purpose,
    };
  }

  console.log(`[CROSS_LOCK] 🔒 Lock acquired for ${phone} (${lockedBy})`);
  return { acquired: true };
}

/**
 * Acquire lock with retry for bitrix24-link-webhook conflicts
 */
export async function acquireCrossWebhookLockWithRetry(
  supabase: SupabaseClient,
  phone: string,
  lockedBy: string = 'sofia-webhook',
  purpose: string = 'message_processing',
  durationSeconds: number = 45,
  retryDelayMs: number = 2000
): Promise<CrossLockInfo> {
  const firstAttempt = await acquireCrossWebhookLock(supabase, phone, lockedBy, purpose, durationSeconds);
  
  if (firstAttempt.acquired) {
    return firstAttempt;
  }
  
  console.log(`[CROSS_LOCK] ⏳ Lock held by ${firstAttempt.existingLockBy} (purpose: ${firstAttempt.existingLockPurpose}) - waiting...`);
  
  // If bitrix24-link-webhook has the lock, wait and retry once
  if (firstAttempt.existingLockBy === 'bitrix24-link-webhook') {
    await new Promise(resolve => setTimeout(resolve, retryDelayMs));
    
    const retryResult = await acquireCrossWebhookLock(supabase, phone, lockedBy, purpose, durationSeconds);
    
    if (!retryResult.acquired) {
      console.log(`[CROSS_LOCK] ⚠️ Still locked by ${retryResult.existingLockBy} after retry - proceeding anyway`);
    } else {
      console.log(`[CROSS_LOCK] ✅ Lock acquired after retry`);
    }
    
    return retryResult;
  }
  
  // For other lock holders, don't retry
  return firstAttempt;
}

/**
 * Release cross-webhook lock
 */
export async function releaseCrossWebhookLock(
  supabase: SupabaseClient,
  phone: string,
  lockedBy: string = 'sofia-webhook'
): Promise<void> {
  try {
    await supabase.rpc('release_cross_webhook_lock', { 
      p_phone: phone, 
      p_locked_by: lockedBy 
    });
    console.log(`[CROSS_LOCK] 🔓 Released lock for ${phone} (${lockedBy})`);
  } catch (releaseLockErr) {
    console.warn('[CROSS_LOCK] Failed to release lock:', releaseLockErr);
  }
}

// ═══════════════════════════════════════════════════════════════
// MAIN EXECUTION FUNCTION
// ═══════════════════════════════════════════════════════════════

/**
 * Execute agent status check and lock acquisition phase
 * Blocks processing if agent is not active
 * Acquires cross-webhook lock with retry for Bitrix conflicts
 */
export async function executeAgentLockPhase(
  ctx: AgentLockPhaseContext
): Promise<AgentLockPhaseResult> {
  const { supabase, phone, agentId, messageId, msgData } = ctx;
  
  // Step 1: Check agent status (no cache - instant effect)
  const statusCheck = await checkAgentStatusRealtime(supabase, agentId);
  
  // Block if agent is not active
  if (!statusCheck.isActive) {
    console.log(`[AGENT_STATUS] ⛔ BLOCK_INBOUND: Agent ${agentId} (${statusCheck.name}) status="${statusCheck.status}" - NOT ACTIVE`);
    
    // Still save the message for history
    const messageText = msgData?.message?.text || '[mídia/arquivo]';
    const saveResult = await saveMessageWhileInactive(supabase, phone, agentId, messageText, messageId);
    
    return {
      handled: true,
      response: new Response(JSON.stringify({
        status: 'agent_inactive',
        agent_id: agentId,
        agent_name: statusCheck.name,
        agent_status: statusCheck.status,
        reason: `Agent status is "${statusCheck.status}" (not active) - no AI processing will occur`,
        message_saved: saveResult.saved,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }),
      agentStatus: statusCheck.status,
      agentName: statusCheck.name,
    };
  }
  
  // Step 2: Acquire cross-webhook lock with retry
  const lockInfo = await acquireCrossWebhookLockWithRetry(
    supabase,
    phone,
    'sofia-webhook',
    'message_processing',
    45,
    2000
  );
  
  return {
    handled: false,
    agentStatus: statusCheck.status,
    agentName: statusCheck.name,
    lockAcquired: lockInfo.acquired,
    lockInfo,
  };
}

// Functions are already exported inline with 'export async function'
