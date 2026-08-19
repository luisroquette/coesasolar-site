/**
 * CONTEXT BUILDING PHASE - SOFIA ORCHESTRATOR
 * 
 * Extracted from sofia-webhook/index.ts (Refactoring Phase)
 * Handles: Funnel stage calculation, proposal fetch, score calculation, hesitation, pre-AI flows
 * Phase 4: Integrated passive RAG prefetch for AGENTS.md-style context injection
 * 
 * @module _shared/sofia-orchestrator/context-building-phase
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.90.0';

// Funnel stage utilities
import {
  determineFunnelStage, determineSofiaMode, calculateMessageScore,
  fetchProposalInfo, fetchDocsSubmittedViaPage, calculateNextFollowup,
  type FunnelStage, type SofiaMode, type ProposalInfo, type DocsSubmittedViaPage, type ScoreBreakdown,
} from '../funnel-stage.ts';

// Detection patterns
import {
  detectObjection, hasHighIntent, getPatternCache,
  type PatternEntry, type ObjectionType,
} from '../detection-patterns.ts';

// Hesitation detection
import {
  orchestrateHesitationFlow,
  type HesitationFlowContext, type HesitationFlowResult,
} from '../hesitation.ts';

// Pre-AI flows (human cooldown, discount objection, economy confirmation)
import {
  orchestratePreAIFlows,
  type PreAIFlowContext, type PreAIFlowResult,
} from '../confirmation-handlers.ts';

// Passive RAG prefetch (Phase 4)
import {
  prefetchPassiveRAG,
  type PassiveRAGResult,
} from '../passive-rag-prefetch.ts';

// Data extraction types
import { type ExtractedClientData } from '../data-extraction.ts';

// CORS headers
import { corsHeaders } from '../webhook-types.ts';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface ContextBuildingConversaData {
  id: string;
  proposta_id?: string | null;
  bitrix24_lead_id?: string | null;
  contrato_enviado_at?: string | null;
  dados_coletados?: Record<string, unknown> | null;
  total_messages?: number | null;
  last_human_message_at?: string | null;
  master_offer_at?: string | null;
  has_simulation?: boolean | null;
  lead_score?: number | null;
  sofia_mode?: string | null;
}

export interface ContextBuildingPhaseContext {
  supabase: SupabaseClient;
  conversaId: string;
  phone: string;
  clienteNome: string | null;
  messageText: string;
  effectiveMessageText: string;
  agentId: string;
  agentName: string;
  
  // Conversation data
  conversa: ContextBuildingConversaData | null;
  existingDados: ExtractedClientData;
  extractedData: ExtractedClientData;
  
  // Detection patterns
  detectionPatterns: Map<string, PatternEntry>;
  
  // Config
  lovableApiKey: string;
  humanCooldownMs: number;
  defaultModel: string;
  
  // PropostaInfo for discount response
  propostaInfo?: ProposalInfo | null;
  
  // Functions
  sendWhatsAppMessage: (phone: string, message: string) => Promise<void>;
  detectDiscountObjection: (msg: string) => boolean;
  generateDiscountResponse: (consumo: number | null, valorFatura: number | null, descontoAtual: number, clienteNome: string | null, ofertaMasterJaFeita: boolean) => { response: string; shouldOfferMaster: boolean };
  detectEconomyConfirmation: (msg: string) => boolean;
  generateEconomyResponse: (descontoPercentual: number, valorFatura: number | null, clienteNome: string | null) => string;
}

export interface ContextBuildingPhaseResult {
  // Early return handling
  handled: boolean;
  response?: Response;
  status?: string;
  
  // Calculated context
  propostaInfo: ProposalInfo | null;
  docsSubmittedViaPage: DocsSubmittedViaPage;
  funnelStage: FunnelStage | null;
  finalMode: SofiaMode;
  
  // Score calculation
  currentScore: number;
  messageScore: number;
  newScore: number;
  nextFollowupAt: Date | null;
  
  // Detections
  detectedObjection: ObjectionType | null;
  hasExplicitIntent: boolean;
  hesitationDetected: boolean;
  hesitationResult: HesitationFlowResult['result'] | null;
  
  // Passive RAG (Phase 4)
  passiveRAGResult: PassiveRAGResult | null;
}

// ═══════════════════════════════════════════════════════════════
// FEATURE FLAGS
// ═══════════════════════════════════════════════════════════════

const ENABLE_PASSIVE_RAG_PREFETCH = true;

// ═══════════════════════════════════════════════════════════════
// HELPER: Should execute this phase
// ═══════════════════════════════════════════════════════════════

export function shouldExecuteContextBuildingPhase(): boolean {
  // Always execute if we reach this phase
  return true;
}

// ═══════════════════════════════════════════════════════════════
// MAIN FUNCTION
// ═══════════════════════════════════════════════════════════════

export async function executeContextBuildingPhase(
  ctx: ContextBuildingPhaseContext
): Promise<ContextBuildingPhaseResult> {
  const {
    supabase, conversaId, phone, clienteNome, messageText, effectiveMessageText,
    agentId, agentName, conversa, existingDados, extractedData,
    detectionPatterns, lovableApiKey, humanCooldownMs, defaultModel,
    sendWhatsAppMessage, detectDiscountObjection, generateDiscountResponse,
    detectEconomyConfirmation, generateEconomyResponse,
  } = ctx;
  
  console.log(`[CONTEXT_BUILDING_PHASE] Starting for conversa: ${conversaId}`);
  
  // ═══════════════════════════════════════════════════════════════
  // 1. OBJECTION AND INTENT DETECTION
  // ═══════════════════════════════════════════════════════════════
  const currentObjection = (existingDados as Record<string, unknown>).detected_objection as ObjectionType | null;
  const detectedObjection = detectObjection(messageText) || currentObjection;
  const hasExplicitIntent = hasHighIntent(messageText);
  
  if (detectedObjection) {
    console.log(`[CONTEXT_BUILDING_PHASE] Detected objection: ${detectedObjection}`);
  }
  
  // ═══════════════════════════════════════════════════════════════
  // 2. SCORE CALCULATION
  // ═══════════════════════════════════════════════════════════════
  const currentScore = conversa?.lead_score || 10;
  const scoreBreakdown = calculateMessageScore(messageText, currentScore);
  const messageScore = Object.values(scoreBreakdown).reduce((sum, val) => sum + val, 0);
  const newScore = Math.min(currentScore + messageScore, 100);
  
  // ═══════════════════════════════════════════════════════════════
  // 3. FETCH PROPOSAL INFO
  // ═══════════════════════════════════════════════════════════════
  const propostaInfo = await fetchProposalInfo(
    supabase,
    conversa?.proposta_id || null,
    conversa?.bitrix24_lead_id || null
  );
  
  if (propostaInfo) {
    console.log(`[CONTEXT_BUILDING_PHASE] Proposal found: ${propostaInfo.id}`);
  }
  
  // ═══════════════════════════════════════════════════════════════
  // 4. FETCH DOCS SUBMITTED VIA PAGE
  // ═══════════════════════════════════════════════════════════════
  const docsSubmittedViaPage = await fetchDocsSubmittedViaPage(
    supabase,
    propostaInfo?.id || null
  );
  
  // ═══════════════════════════════════════════════════════════════
  // 5. DETERMINE FUNNEL STAGE
  // ═══════════════════════════════════════════════════════════════
  const contratoEnviado = !!conversa?.contrato_enviado_at;
  const funnelStage = determineFunnelStage(
    extractedData,
    propostaInfo?.id || null,
    propostaInfo?.tipo_proposta || null,
    contratoEnviado
  );
  
  console.log(`[CONTEXT_BUILDING_PHASE] Funnel stage: ${funnelStage}`);
  
  // ═══════════════════════════════════════════════════════════════
  // 6. HESITATION DETECTION
  // ═══════════════════════════════════════════════════════════════
  const currentMode = conversa?.sofia_mode as SofiaMode || 'standard';
  
  const hesitationFlowCtx: HesitationFlowContext = {
    supabase,
    conversaId,
    messageText,
    funnelStage,
    currentMode,
    clienteNome,
    phone,
    agentName,
    apiKey: lovableApiKey,
    defaultModel,
    patterns: detectionPatterns,
  };
  
  const hesitationFlowResult = await orchestrateHesitationFlow(hesitationFlowCtx);
  const hesitationDetected = hesitationFlowResult.detected;
  const hesitationResult = hesitationFlowResult.result;
  
  if (hesitationDetected) {
    console.log(`[CONTEXT_BUILDING_PHASE] Hesitation detected: ${hesitationResult?.reason || 'unknown'}`);
  }
  
  // ═══════════════════════════════════════════════════════════════
  // 7. CALCULATE NEXT FOLLOWUP
  // ═══════════════════════════════════════════════════════════════
  const nextFollowupAt = calculateNextFollowup(newScore);
  
  // ═══════════════════════════════════════════════════════════════
  // 8. DETERMINE FINAL MODE
  // ═══════════════════════════════════════════════════════════════
  // Note: modoCloser capability needs to be passed from caller
  const modoCloserEnabled = false; // Default - caller should override
  const finalMode = determineSofiaMode(
    currentMode,
    newScore,
    hasExplicitIntent,
    funnelStage,
    modoCloserEnabled,
    hesitationDetected
  );
  
  console.log(`[CONTEXT_BUILDING_PHASE] Mode: ${currentMode} → ${finalMode}, Score: ${currentScore} + ${messageScore} = ${newScore}`);
  
  // ═══════════════════════════════════════════════════════════════
  // 9. PRE-AI FLOWS (Human Cooldown, Discount Objection, Economy Confirmation)
  // ═══════════════════════════════════════════════════════════════
  const preAIFlowCtx: PreAIFlowContext = {
    supabase,
    conversaId,
    phone,
    clienteNome,
    messageText: effectiveMessageText,
    messageId: null,
    existingDados,
    extractedData,
    conversa: conversa ? {
      last_human_message_at: conversa.last_human_message_at || null,
      master_offer_at: conversa.master_offer_at || null,
      has_simulation: conversa.has_simulation || null,
    } : null,
    propostaInfo,
    cooldownMs: humanCooldownMs,
    sendWhatsAppMessage,
    detectDiscountObjection,
    generateDiscountResponse,
    detectEconomyConfirmation,
    generateEconomyResponse,
    agentName,
  };
  
  const preAIFlowResult = await orchestratePreAIFlows(preAIFlowCtx);
  
  if (preAIFlowResult.earlyReturn) {
    console.log(`[CONTEXT_BUILDING_PHASE] Pre-AI flow handled: ${preAIFlowResult.status}`);
    
return {
      handled: true,
      response: new Response(JSON.stringify({
        status: preAIFlowResult.status,
        ...preAIFlowResult.response,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }),
      status: preAIFlowResult.status,
      propostaInfo,
      docsSubmittedViaPage,
      funnelStage,
      finalMode,
      currentScore,
      messageScore,
      newScore,
      nextFollowupAt,
      detectedObjection,
      hasExplicitIntent,
      hesitationDetected,
      hesitationResult,
      passiveRAGResult: null,
    };
  }
  
  // ═══════════════════════════════════════════════════════════════
  // 10. PASSIVE RAG PREFETCH (Phase 4)
  // ═══════════════════════════════════════════════════════════════
  let passiveRAGResult: PassiveRAGResult | null = null;
  
  if (ENABLE_PASSIVE_RAG_PREFETCH && funnelStage) {
    try {
      console.log(`[CONTEXT_BUILDING_PHASE] Prefetching passive RAG for stage: ${funnelStage}`);
      
      passiveRAGResult = await prefetchPassiveRAG(
        supabase,
        agentId,
        funnelStage,
        {
          categories: [], // Will use stage mapping
          maxChunksPerCategory: 3,
          compressionEnabled: true,
          maxTotalChars: 2000,
          prioritizeExemplars: true,
        }
      );
      
      if (passiveRAGResult.chunksUsed > 0) {
        console.log(`[CONTEXT_BUILDING_PHASE] Passive RAG: ${passiveRAGResult.chunksUsed} chunks, ${passiveRAGResult.charCount} chars`);
      }
    } catch (ragError) {
      console.warn('[CONTEXT_BUILDING_PHASE] Passive RAG prefetch failed:', ragError);
    }
  }
  
  // ═══════════════════════════════════════════════════════════════
  // 11. RETURN CONTEXT
  // ═══════════════════════════════════════════════════════════════
  return {
    handled: false,
    propostaInfo,
    docsSubmittedViaPage,
    funnelStage,
    finalMode,
    currentScore,
    messageScore,
    newScore,
    nextFollowupAt,
    detectedObjection,
    hasExplicitIntent,
    hesitationDetected,
    hesitationResult,
    passiveRAGResult,
  };
}
