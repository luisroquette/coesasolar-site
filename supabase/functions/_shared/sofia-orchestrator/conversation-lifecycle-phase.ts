/**
 * CONVERSATION LIFECYCLE PHASE
 * 
 * Handles conversation search, duplicate cleanup, pause verification, and takeover detection
 * Extracted from sofia-webhook/index.ts lines 1349-1492
 * 
 * @module _shared/sofia-orchestrator/conversation-lifecycle-phase
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.90.0';
import { 
  findConversationByPhoneVariations, 
  checkForDiscardedLead, 
  cleanupDuplicateConversations,
  type DiscardedLeadCheck,
  type CleanupResult,
} from '../utils/phone-utils.ts';
import { 
  handlePausedConversationMessage, 
  checkFreshConversationState, 
  detectTakeoverByHistory,
  type TakeoverDetectionResult,
  type PauseCheckResult,
} from '../operator-commands.ts';
import {
  isHumanTakeoverActive,
  normalizeTakeoverPhone,
} from '../human-takeover.ts';
import { getZApiCredentials } from '../zapi-client.ts';
import { corsHeaders } from '../webhook-types.ts';
import type { FullAgentConfig } from '../ai-gym-config.ts';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface ConversationLifecycleContext {
  supabase: SupabaseClient;
  phone: string;
  agentId: string;
  clienteNome?: string | null;
  messageText: string;
  messageId?: string;
  agentConfig?: FullAgentConfig | null;
  sendWhatsAppMessage: (phone: string, message: string) => Promise<void>;
  templateCache?: any;
}

export interface ConversationLifecycleResult {
  handled: boolean;
  response?: Response;
  conversa?: ConversaData | null;
  wasDiscarded?: boolean;
  wasPaused?: boolean;
  wasTakenOver?: boolean;
}

export interface ConversaData {
  id: string;
  cliente_telefone?: string | null;
  cliente_nome?: string | null;
  sofia_mode?: string | null;
  needs_human_fallback?: boolean;
  human_agent_id?: string | null;
  human_agent_nome?: string | null;
  dados_coletados?: Record<string, any>;
  bitrix24_lead_id?: string | null;
  bitrix24_stage?: string | null;
  proposta_id?: string | null;
  lead_score?: number;
  ab_variant?: string;
  agent_id?: string;
  // Additional fields as needed
  [key: string]: any;
}

// ═══════════════════════════════════════════════════════════════
// DISCARDED LEAD CHECK
// ═══════════════════════════════════════════════════════════════

/**
 * Check if this phone was recently discarded and block new conversation
 */
async function handleDiscardedLeadCheck(
  supabase: SupabaseClient,
  phone: string,
  agentId: string,
  messageText: string,
  messageId?: string
): Promise<{ blocked: boolean; response?: Response }> {
  const discardedCheck = await checkForDiscardedLead(supabase, phone, agentId);
  
  if (!discardedCheck.isDiscarded) {
    return { blocked: false };
  }
  
  console.log(`[DISCARDED_BLOCK] ⛔ Blocking new conversation for discarded lead: ${phone}`);
  console.log(`[DISCARDED_BLOCK] Motivo: ${discardedCheck.motivoDescarte}, Distribuidora: ${discardedCheck.distribuidora}, Descartado em: ${discardedCheck.discardedAt}`);
  
  // Save the message to the original discarded conversation for audit trail
  if (discardedCheck.discardedConversaId) {
    await supabase.from('chatbot_mensagens').insert({
      conversa_id: discardedCheck.discardedConversaId,
      role: 'user',
      content: messageText,
      message_id: messageId || null,
    });
    
    // Fetch current reopening_attempts count and increment
    const { data: currentConversa } = await supabase
      .from('chatbot_conversas')
      .select('dados_coletados')
      .eq('id', discardedCheck.discardedConversaId)
      .single();
    
    const currentDados = (currentConversa?.dados_coletados as any) || {};
    const currentAttempts = currentDados.reopening_attempts || 0;
    
    await supabase
      .from('chatbot_conversas')
      .update({
        last_message_at: new Date().toISOString(),
        dados_coletados: {
          ...currentDados,
          reopening_attempts: currentAttempts + 1,
          last_reopening_attempt: new Date().toISOString(),
        },
      })
      .eq('id', discardedCheck.discardedConversaId);
  }
  
  // DO NOT send any message - lead was already rejected with explanation
  return {
    blocked: true,
    response: new Response(JSON.stringify({
      status: 'discarded_lead_blocked',
      reason: `Lead was discarded: ${discardedCheck.motivoDescarte}`,
      discardedConversaId: discardedCheck.discardedConversaId,
      distribuidora: discardedCheck.distribuidora,
      discardedAt: discardedCheck.discardedAt,
      message: 'New conversation creation blocked for recently discarded lead',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }),
  };
}

// ═══════════════════════════════════════════════════════════════
// PAUSE STATE CHECKS
// ═══════════════════════════════════════════════════════════════

/**
 * Check if conversation is paused and handle message saving
 */
async function handlePausedConversation(
  supabase: SupabaseClient,
  conversa: ConversaData,
  messageText: string,
  messageId?: string
): Promise<{ isPaused: boolean; response?: Response }> {
  if (conversa.sofia_mode !== 'paused_for_human') {
    return { isPaused: false };
  }
  
  console.log(`[IMMEDIATE_PAUSE_CHECK] ⛔ Conversation ${conversa.id} is paused - blocking all AI processing`);
  
  const pauseResult = await handlePausedConversationMessage(supabase, conversa.id, messageText, messageId || null);
  
  return {
    isPaused: true,
    response: new Response(JSON.stringify({
      status: 'paused_for_human',
      reason: pauseResult.reason,
      conversaId: conversa.id,
      message_saved: pauseResult.messageSaved,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }),
  };
}

/**
 * Re-verify pause state after other checks (race condition protection)
 */
async function handleFreshStateCheck(
  supabase: SupabaseClient,
  conversaId: string,
  messageText: string,
  messageId?: string
): Promise<{ isPaused: boolean; response?: Response }> {
  const freshState = await checkFreshConversationState(supabase, conversaId);
  
  if (!freshState.isPaused) {
    return { isPaused: false };
  }
  
  console.log(`[FRESH_STATE_CHECK] ⛔ Conversation ${conversaId} was paused during processing - BLOCKING`);
  const pauseResult = await handlePausedConversationMessage(supabase, conversaId, messageText, messageId || null);
  
  return {
    isPaused: true,
    response: new Response(JSON.stringify({
      status: 'paused_during_processing',
      reason: 'Conversation was paused during processing',
      conversaId,
      message_saved: pauseResult.messageSaved,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }),
  };
}

// ═══════════════════════════════════════════════════════════════
// TAKEOVER DETECTION
// ═══════════════════════════════════════════════════════════════

/**
 * Detect #ASSUMIR in conversation history
 */
async function handleTakeoverDetection(
  supabase: SupabaseClient,
  phone: string,
  conversa: ConversaData,
  clienteNome: string | null,
  messageText: string,
  messageId: string | null,
  agentConfig: FullAgentConfig | null,
  sendWhatsAppMessage: (phone: string, message: string) => Promise<void>,
  templateCache?: any
): Promise<{ detected: boolean; response?: Response }> {
  if (!conversa || conversa.sofia_mode === 'paused_for_human') {
    return { detected: false };
  }
  
  const creds = getZApiCredentials(agentConfig);
  
  const takeoverResult = await detectTakeoverByHistory(supabase, phone, {
    conversaId: conversa.id,
    clienteNome: conversa.cliente_nome || clienteNome || null,
    clienteTelefone: conversa.cliente_telefone || null,
    messageText,
    messageId,
    instanceId: creds.instanceId,
    token: creds.token,
    securityToken: creds.securityToken || undefined,
    agentName: agentConfig?.name,
    sendMessage: sendWhatsAppMessage,
    templateCache,
  });
  
  if (!takeoverResult.detected) {
    return { detected: false };
  }
  
  return {
    detected: true,
    response: new Response(JSON.stringify({
      success: true,
      status: 'takeover_detected_by_history',
      conversaId: conversa.id,
      confirmation_sent: takeoverResult.confirmationSent,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }),
  };
}

// ═══════════════════════════════════════════════════════════════
// DUPLICATE CLEANUP
// ═══════════════════════════════════════════════════════════════

/**
 * Cleanup duplicate conversations in background
 */
function triggerDuplicateCleanup(
  supabase: SupabaseClient,
  phone: string,
  agentId: string,
  activeConversaId: string
): void {
  cleanupDuplicateConversations(supabase, phone, agentId, activeConversaId)
    .then(result => {
      if (result.merged > 0 || result.deleted.length > 0) {
        console.log(`[CLEANUP_DUPLICATES] Merged ${result.merged} messages, closed ${result.deleted.length} duplicates`);
      }
    })
    .catch(err => console.warn('[CLEANUP_DUPLICATES] Background cleanup failed:', err));
}

// ═══════════════════════════════════════════════════════════════
// MAIN EXECUTION FUNCTION
// ═══════════════════════════════════════════════════════════════

/**
 * Execute conversation lifecycle phase
 * Finds or validates conversation, checks for discarded leads, handles pauses
 */
export async function executeConversationLifecyclePhase(
  ctx: ConversationLifecycleContext
): Promise<ConversationLifecycleResult> {
  const { 
    supabase, 
    phone, 
    agentId, 
    clienteNome, 
    messageText, 
    messageId,
    agentConfig,
    sendWhatsAppMessage,
    templateCache,
  } = ctx;

  // HARD STOP: explicit human takeover list (phone-based)
  const phoneNormalized = normalizeTakeoverPhone(phone);
  if (phoneNormalized) {
    const takeoverActive = await isHumanTakeoverActive(supabase, {
      agentId,
      whatsappProvider: 'zapi',
      phoneNormalized,
    });

    if (takeoverActive) {
      console.log(`[HUMAN_TAKEOVER] ⛔ Active takeover for ${phoneNormalized} (agent=${agentId}) - blocking all automation`);
      // Do not create new conversation; if an active one exists, save message for audit.
      const conversaExisting = await findConversationByPhoneVariations(supabase, phone, agentId) as ConversaData | null;
      if (conversaExisting) {
        await handlePausedConversationMessage(supabase, conversaExisting.id, messageText, messageId || null);
      }

      return {
        handled: true,
        response: new Response(JSON.stringify({
          status: 'human_takeover_active',
          phone: phoneNormalized,
          agentId,
          message_saved: !!conversaExisting,
          conversaId: conversaExisting?.id || null,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }),
        conversa: conversaExisting,
        wasPaused: true,
      };
    }
  }
  
  // Step 1: Find existing conversation by phone variations
  let conversa = await findConversationByPhoneVariations(supabase, phone, agentId) as ConversaData | null;
  
  // Step 2: Check for discarded leads (BEFORE creating new conversation)
  if (!conversa) {
    const discardedResult = await handleDiscardedLeadCheck(supabase, phone, agentId, messageText, messageId);
    
    if (discardedResult.blocked) {
      return {
        handled: true,
        response: discardedResult.response,
        wasDiscarded: true,
      };
    }
  }
  
  // Step 3: Trigger duplicate cleanup in background
  if (conversa) {
    triggerDuplicateCleanup(supabase, phone, agentId, conversa.id);
  }
  
  // Step 4: Immediate pause check
  if (conversa) {
    const pauseResult = await handlePausedConversation(supabase, conversa, messageText, messageId);
    
    if (pauseResult.isPaused) {
      return {
        handled: true,
        response: pauseResult.response,
        conversa,
        wasPaused: true,
      };
    }
  }
  
  // Step 5: Detect takeover by history
  if (conversa && conversa.sofia_mode !== 'paused_for_human') {
    const takeoverResult = await handleTakeoverDetection(
      supabase,
      phone,
      conversa,
      clienteNome || null,
      messageText,
      messageId || null,
      agentConfig || null,
      sendWhatsAppMessage,
      templateCache
    );
    
    if (takeoverResult.detected) {
      return {
        handled: true,
        response: takeoverResult.response,
        conversa,
        wasTakenOver: true,
      };
    }
  }
  
  // Step 6: Fresh state check (race condition protection)
  if (conversa) {
    const freshResult = await handleFreshStateCheck(supabase, conversa.id, messageText, messageId);
    
    if (freshResult.isPaused) {
      return {
        handled: true,
        response: freshResult.response,
        conversa,
        wasPaused: true,
      };
    }
  }
  
  // All checks passed - continue processing
  return {
    handled: false,
    conversa,
  };
}

/**
 * Utility to check if conversation requires human fallback
 */
export function needsHumanFallbackLog(conversa: ConversaData | null): void {
  if (conversa?.needs_human_fallback && conversa?.sofia_mode !== 'paused_for_human') {
    console.log(`[NEEDS_HUMAN] ℹ️ Conversation ${conversa.id} has needs_human_fallback=true but sofia_mode=${conversa.sofia_mode} - Sofia continues (requires explicit #ASSUMIR)`);
  }
}
