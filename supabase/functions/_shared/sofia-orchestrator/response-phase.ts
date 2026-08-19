/**
 * RESPONSE PHASE - Sofia Orchestrator Module
 * 
 * Handles the final response delivery with humanization:
 * 1. Humanized delay (typing indicator + latency)
 * 2. Audio orchestration (text/audio decision)
 * 3. Proposal promise flow detection
 * 4. Escalation flow (notify humans)
 * 5. Rejection fallback detection
 * 6. Post-response updates (nudge, score, CRM)
 * 7. Self-evaluation (async)
 * 8. Cleanup (lock release, buffer clear)
 * 
 * @module _shared/sofia-orchestrator/response-phase
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.90.0';

// Humanization
import { 
  loadLatencyConfig, 
  applyFullHumanization,
  type LatencyConfig,
} from '../humanized-latency.ts';

// Audio
import { 
  orchestrateAudioSending, 
  type AudioOrchestrationContext, 
  type AudioOrchestrationResult,
  type SofiaAudioSettings,
} from '../audio-handler.ts';

// Proposal Promise
import { 
  handleProposalPromiseFlow, 
  type ProposalPromiseContext, 
  type ProposalPromiseResult,
} from '../proposal-promise-flow.ts';

// Escalation
import { 
  orchestrateFullEscalation, 
  type FullEscalationContext,
} from '../escalation.ts';

// Rejection Fallback
import { 
  handleRejectionFallback, 
  type RejectionFallbackContext, 
  type RejectionFallbackResult,
  type RejectionType,
} from '../rejection-fallback.ts';

// Conversation Update
import { 
  updateConversationAfterResponse, 
  type ConversationUpdateContext,
  type ConversationUpdateResult,
} from '../conversation-update.ts';

// Buffer
import { clearBuffer } from '../message-buffer.ts';

// Deduplication
import { checkDuplicateResponse } from './post-human-resume-handler.ts';

// CORS
import { corsHeaders } from '../webhook-types.ts';

// AI Gym Config
import type { FullAgentConfig } from '../ai-gym-config.ts';

// Eligibility Check
import { 
  checkMinimumBillEligibility, 
  type EligibilityDadosColetados 
} from '../eligibility-check.ts';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * Conversa data subset needed for Response Phase
 */
export interface ResponsePhaseConversaData {
  id: string;
  cliente_nome?: string | null;
  cliente_email?: string | null;
  dados_coletados?: Record<string, unknown> | null;
  proposta_id?: string | null;
  bitrix24_lead_id?: string | null;
  bitrix24_stage?: string | null;
  sofia_mode?: string | null;
  audio_oferecido?: boolean | null;
  total_messages?: number | null;
}

/**
 * Message-related functions grouped for cleaner interface
 */
export interface MessageFunctions {
  sendText: (phone: string, msg: string) => Promise<boolean | void>;
  sendAudio: (phone: string, text: string) => Promise<boolean | void>;
  safeSend: (supabase: SupabaseClient, conversaId: string, phone: string, msg: string) => Promise<boolean | void>;
  sendTypingIndicator: (phone: string, config: FullAgentConfig | null) => Promise<void>;
}

/**
 * Sync-related functions grouped for cleaner interface
 * Using 'any' types for flexibility with different implementations
 */
export interface SyncFunctions {
  syncToBitrix: (
    supabase: any,
    conversaId: string,
    phone: string,
    clienteNome: string | null,
    dadosColetados: any,
    newFile: any,
    forcarMovimentacao: boolean
  ) => Promise<{ success: boolean; stageUpdated?: boolean; newStage?: string; error?: string }>;
  setPendingTask: (supabase: any, conversaId: string, taskType: any) => Promise<void>;
  saveContactToWhatsApp: (phone: string, name: string) => Promise<boolean>;
  syncContactToCRM: (supabase: any, data: any) => Promise<boolean>;
}

/**
 * Context for executing Response Phase
 */
export interface ResponsePhaseContext {
  supabase: SupabaseClient;
  conversaId: string;
  phone: string;
  clienteNome: string | null;
  messageText: string;
  effectiveMessageText: string;
  agentId: string;
  
  // LLM Phase results
  cleanMessage: string;
  assistantMessage: string | null;
  usedModel: string | null;
  agentConfig: FullAgentConfig | null;
  
  // Data context
  conversa: ResponsePhaseConversaData | null;
  existingDados: Record<string, unknown>;
  extractedData: Record<string, unknown>;
  
  // Flags
  needsHumanEscalation: boolean;
  aiFailedCompletely: boolean;
  isTranscribedAudio: boolean;
  
  // Scoring & mode
  newScore: number;
  finalMode: string;
  totalMessages: number;
  detectedObjection: string | null;
  nextFollowupAt: string | Date | null;
  funnelStage: string | null;
  detectedSentiment: string | null;
  
  // Audio context
  audioSettings: SofiaAudioSettings;
  clienteAceitaAudio: boolean | null;
  audioPreferenceJustSet: boolean;
  handleDirectAudioRequest: boolean;
  
  // Buffer context
  bufferId?: string | null;
  
  // Dependencies (injected functions)
  messageFns: MessageFunctions;
  syncFns: SyncFunctions;
  
  // Additional helpers
  isAudioGloballyEnabled: (supabase: SupabaseClient) => Promise<boolean>;
  evaluateResponseLegacy: (
    conversaId: string,
    agentId: string,
    userMessage: string,
    assistantMessage: string,
    funnelStage: string | null,
    sentiment: string | null
  ) => Promise<any>;
}

/**
 * Result from Response Phase execution
 */
export interface ResponsePhaseResult {
  handled: boolean;           // Se a fase retornou early
  response?: Response;        // Response HTTP se handled=true
  
  // Status
  success: boolean;
  blockedByTakeover: boolean;
  rejectionHandled: boolean;
  rejectionType?: RejectionType | null;
  
  // Audio results
  audioSent: boolean;
  audioOffered: boolean;
  
  // Final message sent
  finalMessage: string;
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Release Lock Safely
// ═══════════════════════════════════════════════════════════════

async function releaseLockSafely(
  supabase: SupabaseClient,
  phone: string
): Promise<void> {
  try {
    await supabase.rpc('release_cross_webhook_lock', {
      p_phone: phone,
      p_locked_by: 'sofia-webhook',
    });
    console.log(`[CROSS_LOCK] 🔓 Released lock for ${phone}`);
  } catch (err) {
    console.warn('[CROSS_LOCK] Failed to release lock:', err);
  }
}

// ═══════════════════════════════════════════════════════════════
// MAIN FUNCTION
// ═══════════════════════════════════════════════════════════════

/**
 * Check if Response Phase should execute
 * Always returns true if we have a message to send
 */
export function shouldExecuteResponsePhase(cleanMessage: string | null): boolean {
  return !!cleanMessage && cleanMessage.trim().length > 0;
}

/**
 * Execute the Response Phase
 * 
 * Handles humanization, audio, proposal promise, escalation,
 * rejection fallback, post-response updates, and cleanup.
 */
export async function executeResponsePhase(
  ctx: ResponsePhaseContext
): Promise<ResponsePhaseResult> {
  const {
    supabase,
    conversaId,
    phone,
    clienteNome,
    messageText,
    effectiveMessageText,
    agentId,
    agentConfig,
    conversa,
    existingDados,
    extractedData,
    needsHumanEscalation,
    aiFailedCompletely,
    isTranscribedAudio,
    newScore,
    finalMode,
    totalMessages,
    detectedObjection,
    nextFollowupAt,
    funnelStage,
    detectedSentiment,
    audioSettings,
    clienteAceitaAudio,
    audioPreferenceJustSet,
    handleDirectAudioRequest,
    bufferId,
    messageFns,
    syncFns,
    isAudioGloballyEnabled,
    evaluateResponseLegacy,
  } = ctx;

  let cleanMessage = ctx.cleanMessage;
  
  console.log(`[RESPONSE_PHASE] Starting for conversa ${conversaId}`);
  
  // ═══════════════════════════════════════════════════════════════
  // STEP 0A (NEW): GUARDRAIL - BLOCK SIMULATION FOR INELIGIBLE LEADS
  // If cleanMessage contains economy/simulation values AND lead is below minimum,
  // replace with the "ask about other accounts" question instead
  // ═══════════════════════════════════════════════════════════════
  const economyPatterns = [
    /economia\s*(de|mensal|anual)/i,
    /desconto\s*(de)?\s*\d+/i,
    /economizar\s*(até|cerca de)?\s*R?\$?\s*\d+/i,
    /R\$\s*\d{2,}.*economia/i,
    /\d+%\s*(de)?\s*(desconto|economia)/i,
  ];
  
  const hasEconomySimulation = economyPatterns.some(p => p.test(cleanMessage));
  
  if (hasEconomySimulation) {
    const valorFatura = (ctx.existingDados?.valorFatura as number) || 
                        (extractedData?.valorFatura as number) || 0;
    
    if (valorFatura > 0) {
      const eligibilityData: EligibilityDadosColetados = {
        valorFatura,
        valorTotalEstimado: ctx.existingDados?.valorTotalEstimado as number | undefined,
        already_asked_multiple_units: !!ctx.existingDados?.already_asked_multiple_units,
        awaiting_multiple_units_response: !!ctx.existingDados?.awaiting_multiple_units_response,
        multiple_units_confirmed_no: !!ctx.existingDados?.multiple_units_confirmed_no,
      };
      
      const eligibilityResult = await checkMinimumBillEligibility(
        supabase,
        valorFatura,
        eligibilityData
      );
      
      if (!eligibilityResult.isEligible && eligibilityResult.shouldAskMultipleUnits) {
        console.log(`[RESPONSE_PHASE] 🚫 GUARDRAIL: Blocking economy simulation for ineligible lead (R$ ${valorFatura} < R$ ${eligibilityResult.minimumThreshold})`);
        console.log(`[RESPONSE_PHASE] Replacing with multiple units question`);
        
        // Replace the simulation message with the question about other accounts
        cleanMessage = eligibilityResult.askMultipleUnitsMessage || cleanMessage;
        
        // Update dados_coletados to mark we asked
        await supabase
          .from('chatbot_conversas')
          .update({
            dados_coletados: {
              ...ctx.existingDados,
              already_asked_multiple_units: true,
              awaiting_multiple_units_response: true,
            },
          })
          .eq('id', conversaId);
        
        console.log(`[RESPONSE_PHASE] ✅ Flags updated: already_asked_multiple_units=true, awaiting_multiple_units_response=true`);
      } else if (!eligibilityResult.isEligible && eligibilityResult.awaitingMultipleUnitsResponse) {
        // Still awaiting response, don't send simulation
        console.log(`[RESPONSE_PHASE] ⏳ Lead still below minimum and awaiting multiple units response - blocking simulation`);
        
        // Keep the LLM message but strip any economy promises
        cleanMessage = cleanMessage.replace(/economia\s*(de|mensal|anual)?\s*R?\$?\s*\d+[.,]?\d*/gi, '');
        cleanMessage = cleanMessage.replace(/desconto\s*(de)?\s*\d+\s*%/gi, '');
        cleanMessage = cleanMessage.replace(/economizar\s*(até|cerca de)?\s*R?\$?\s*\d+[.,]?\d*/gi, '');
        cleanMessage = cleanMessage.trim();
      }
    }
  }
  
  // ═══════════════════════════════════════════════════════════════
  // STEP 0 (NEW): PRE-SEND PROPOSAL PROMISE CHECK
  // Check if Sofia is promising proposal without minimum data BEFORE sending
  // This prevents empty promises from ever reaching the client
  // ═══════════════════════════════════════════════════════════════
  const preSendProposalCheck: ProposalPromiseContext = {
    supabase,
    conversaId,
    phone,
    clienteNome,
    cleanMessage,
    existingDados: ctx.existingDados,
    extractedData,
    needsHumanEscalation,
    aiFailedCompletely,
    syncToBitrixFn: syncFns.syncToBitrix,
    setPendingTaskFn: syncFns.setPendingTask,
  };
  
  const preSendResult: ProposalPromiseResult = await handleProposalPromiseFlow(preSendProposalCheck);
  
  // If Sofia was about to promise without data, replace her message BEFORE sending
  if (preSendResult.detected && !preSendResult.hasMinimumData && preSendResult.replacementMessage) {
    console.log(`[RESPONSE_PHASE] 🛑 PRE-SEND BLOCK: Replacing empty promise with data collection message`);
    console.log(`[RESPONSE_PHASE] Missing fields: ${preSendResult.missingFields?.join(', ')}`);
    cleanMessage = preSendResult.replacementMessage;
  }
  
  // ═══════════════════════════════════════════════════════════════
  // STEP 0B: FINAL DEDUPLICATION GUARD
  // Prevents sending any duplicate/similar message within 5min window
  // ═══════════════════════════════════════════════════════════════
  const dupCheck = await checkDuplicateResponse(supabase, conversaId, cleanMessage);
  
  if (dupCheck.isDuplicate) {
    console.log(`[RESPONSE_PHASE] ⛔ DEDUP GUARD: Blocked duplicate response. Last similar sent at ${dupCheck.lastSentAt}`);
    
    // Release lock and return silently
    await releaseLockSafely(supabase, phone);
    if (bufferId) {
      await clearBuffer(supabase, bufferId);
    }
    
    return {
      handled: true,
      response: new Response(JSON.stringify({
        status: 'duplicate_blocked',
        reason: 'identical_message_sent_recently',
        conversaId,
        lastSentAt: dupCheck.lastSentAt,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }),
      success: false,
      blockedByTakeover: false,
      rejectionHandled: false,
      audioSent: false,
      audioOffered: false,
      finalMessage: cleanMessage,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // STEP 1: HUMANIZED RESPONSE DELAY
  // ═══════════════════════════════════════════════════════════════
  try {
    const latencyConfig = await loadLatencyConfig(supabase);
    
    if (latencyConfig.typingIndicatorEnabled) {
      await applyFullHumanization({
        responseText: cleanMessage,
        sendTypingIndicator: async () => {
          await messageFns.sendTypingIndicator(phone, agentConfig);
        },
        config: latencyConfig,
      });
      console.log(`[HUMANIZE] ✅ Applied typing indicator and delay for response`);
    }
  } catch (humanizeError) {
    console.warn('[HUMANIZE] ⚠️ Humanization failed, proceeding without delay:', humanizeError);
  }

  // ═══════════════════════════════════════════════════════════════
  // STEP 2: AUDIO ORCHESTRATION
  // ═══════════════════════════════════════════════════════════════
  const audioGloballyEnabled = await isAudioGloballyEnabled(supabase);
  
  const audioOrchestrationCtx: AudioOrchestrationContext = {
    supabaseClient: supabase,
    conversaId,
    phone,
    cleanMessage,
    isTranscribedAudio,
    messageTextLength: effectiveMessageText.length,
    audioSettings,
    handleDirectAudioRequest,
    clienteAceitaAudio,
    audioOferecido: conversa?.audio_oferecido ?? null,
    audioPreferenceJustSet,
    needsHumanEscalation,
    aiFailedCompletely,
    audioGloballyEnabled,
    sendTextFn: async (p: string, m: string) => {
      await messageFns.safeSend(supabase, conversaId, p, m);
      return true;
    },
    sendAudioFn: async (p: string, t: string) => {
      await messageFns.sendAudio(p, t);
      return true;
    },
  };
  
  const audioResult: AudioOrchestrationResult = await orchestrateAudioSending(audioOrchestrationCtx);
  
  // If blocked by takeover, exit early
  if (audioResult.blockedByTakeover) {
    console.log(`[RACE_BLOCKED] Sofia response blocked - conversation was paused during processing`);
    return {
      handled: true,
      response: new Response(JSON.stringify({
        status: 'blocked_by_takeover',
        reason: 'Conversation was paused by #ASSUMIR during processing',
        conversaId,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }),
      success: false,
      blockedByTakeover: true,
      rejectionHandled: false,
      audioSent: false,
      audioOffered: false,
      finalMessage: cleanMessage,
    };
  }
  
  // Update with orchestration results
  const { audioSent, messageSent } = audioResult;
  cleanMessage = audioResult.finalMessage;

  // Save assistant message and update last_sofia_message_at
  const { error: saveError } = await supabase.from('chatbot_mensagens').insert({
    conversa_id: conversaId,
    role: 'assistant',
    content: audioSent ? `${cleanMessage}\n\n[🎧 Áudio também enviado]` : cleanMessage,
  });
  
  if (saveError) {
    console.error(`[RESPONSE_PHASE] ❌ Failed to save assistant message:`, saveError);
  } else {
    // CRITICAL: Update last_sofia_message_at to prevent unanswered-message-detector loops
    await supabase
      .from('chatbot_conversas')
      .update({ 
        last_sofia_message_at: new Date().toISOString(),
        last_message_at: new Date().toISOString(),
      })
      .eq('id', conversaId);
    console.log(`[RESPONSE_PHASE] ✅ Assistant message saved, last_sofia_message_at updated`);
  }

  // ═══════════════════════════════════════════════════════════════
  // STEP 3: PROPOSAL PROMISE SYNC (only if minimum data is complete)
  // The message replacement already happened in STEP 0, so here we just
  // handle the Bitrix sync for valid proposals
  // ═══════════════════════════════════════════════════════════════
  
  // Use preSendResult from Step 0 for logging (avoid duplicate call)
  if (preSendResult.detected && preSendResult.hasMinimumData) {
    console.log(`[RESPONSE_PHASE] Proposal promise with data: syncSuccess=${preSendResult.syncSuccess}, newStage=${preSendResult.newStage || 'unchanged'}`);
  } else if (preSendResult.detected && !preSendResult.hasMinimumData) {
    console.log(`[RESPONSE_PHASE] Empty promise blocked - message was replaced to collect: ${preSendResult.missingFields?.join(', ')}`);
  }

  // ═══════════════════════════════════════════════════════════════
  // STEP 4: ESCALATION FLOW
  // ═══════════════════════════════════════════════════════════════
  if (needsHumanEscalation) {
    const escalationCtx: FullEscalationContext = {
      supabase,
      conversaId,
      phone,
      clienteNome,
      messageText,
      // Use ctx.existingDados (merged) for escalation context
      dadosColetados: ctx.existingDados || null,
      newScore,
      totalMessages,
      agentConfig,
      sendMessage: async (p: string, m: string) => {
        await messageFns.sendText(p, m);
      },
    };
    
    await orchestrateFullEscalation(escalationCtx);
    console.log(`[RESPONSE_PHASE] Escalation executed`);
  }

  // ═══════════════════════════════════════════════════════════════
  // STEP 5: REJECTION FALLBACK
  // ═══════════════════════════════════════════════════════════════
  const rejectionFallbackCtx: RejectionFallbackContext = {
    supabase,
    conversaId,
    cleanMessage,
    currentMode: conversa?.sofia_mode ?? null,
    existingDados,
    extractedData,
    bitrixLeadId: conversa?.bitrix24_lead_id ?? null,
  };
  
  const rejectionResult: RejectionFallbackResult = await handleRejectionFallback(rejectionFallbackCtx);
  
  if (rejectionResult.handled) {
    // Cleanup before returning
    await releaseLockSafely(supabase, phone);
    if (bufferId) {
      try {
        await clearBuffer(supabase, phone, agentId);
      } catch (e) {
        console.warn('[BUFFER] Failed to clear on rejection:', e);
      }
    }
    
    return {
      handled: true,
      response: new Response(
        JSON.stringify({
          success: true,
          message: `Lead descartado: ${rejectionResult.rejectionLabel}`,
          mode: 'descartado',
          motivoDescarte: rejectionResult.rejectionType,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      ),
      success: true,
      blockedByTakeover: false,
      rejectionHandled: true,
      rejectionType: rejectionResult.rejectionType,
      audioSent,
      audioOffered: audioResult.audioOffered,
      finalMessage: cleanMessage,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // STEP 6: POST-RESPONSE UPDATE
  // ═══════════════════════════════════════════════════════════════
  const conversationUpdateCtx: ConversationUpdateContext = {
    supabase,
    conversaId,
    phone,
    // CRITICAL: Override conversa.dados_coletados with ctx.existingDados (merged data)
    // This ensures updateConversationAfterResponse uses the fresh merged state
    conversa: conversa ? {
      id: conversaId,
      cliente_nome: conversa.cliente_nome ?? null,
      cliente_email: conversa.cliente_email ?? null,
      dados_coletados: ctx.existingDados ?? null,  // Use merged data from context
      proposta_id: conversa.proposta_id ?? null,
      bitrix24_lead_id: conversa.bitrix24_lead_id ?? null,
      bitrix24_stage: conversa.bitrix24_stage ?? null,
    } : null,
    clienteNome,
    extractedData: extractedData as any,
    newScore,
    finalMode,
    totalMessages,
    detectedObjection: detectedObjection ?? null,
    nextFollowupAt: nextFollowupAt ? new Date(nextFollowupAt) : null,
    nudgeDelayMinutes: 10,
    saveContactToWhatsAppFn: syncFns.saveContactToWhatsApp,
    syncContactToCRMFn: syncFns.syncContactToCRM as any,
  };

  const updateResult: ConversationUpdateResult = await updateConversationAfterResponse(conversationUpdateCtx);
  console.log(`[RESPONSE_PHASE] Conversation update: success=${updateResult.success}, name=${updateResult.nomeParaSalvar}`);

  // ═══════════════════════════════════════════════════════════════
  // STEP 7: SELF-EVALUATION (async, non-blocking)
  // ═══════════════════════════════════════════════════════════════
  evaluateResponseLegacy(
    conversaId,
    agentId,
    messageText,
    cleanMessage,
    funnelStage,
    detectedSentiment
  ).catch(err => console.warn('[SELF_EVAL] Failed:', err));

  // ═══════════════════════════════════════════════════════════════
  // STEP 8: CLEANUP
  // ═══════════════════════════════════════════════════════════════
  await releaseLockSafely(supabase, phone);
  
  if (bufferId) {
    try {
      await clearBuffer(supabase, phone, agentId);
      console.log(`[BUFFER] 🧹 Buffer cleared for ${phone}`);
    } catch (clearErr) {
      console.warn('[BUFFER] Failed to clear buffer:', clearErr);
    }
  }

  console.log(`[RESPONSE_PHASE] ✅ Completed for conversa ${conversaId}`);
  
  return {
    handled: false,
    success: true,
    blockedByTakeover: false,
    rejectionHandled: false,
    audioSent,
    audioOffered: audioResult.audioOffered,
    finalMessage: cleanMessage,
  };
}
