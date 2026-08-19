/**
 * FUNNEL CONTEXT PHASE
 * 
 * Handles score calculation, proposal info fetching, funnel stage determination,
 * and hesitation flow orchestration
 * Extracted from sofia-webhook/index.ts lines 2569-2638
 * 
 * @module _shared/sofia-orchestrator/funnel-context-phase
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.90.0';
import {
  determineFunnelStage,
  determineSofiaMode,
  fetchProposalInfo,
  fetchDocsSubmittedViaPage,
  calculateMessageScore,
  calculateNextFollowup,
  type FunnelStage,
  type SofiaMode,
  type ProposalInfo,
  type DocsSubmittedViaPage,
  type ScoreBreakdown,
} from '../funnel-stage.ts';
import {
  orchestrateHesitationFlow,
  detectHesitationFull,
  type HesitationFlowContext,
  type HesitationFlowResult,
  type HesitationType,
  type HesitationDetection,
} from '../hesitation.ts';
import { detectObjection, hasHighIntent, type PatternEntry } from '../detection-patterns.ts';
import { DEFAULT_MODELS } from '../llm-client.ts';
import type { FullAgentConfig } from '../ai-gym-config.ts';
import type { ExtractedClientData } from '../data-extraction.ts';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface FunnelContextPhaseContext {
  supabase: SupabaseClient;
  conversaId: string;
  phone: string;
  clienteNome?: string | null;
  messageText: string;
  agentId: string;
  agentConfig?: FullAgentConfig | null;
  conversa?: FunnelContextConversaData | null;
  extractedData: ExtractedClientData;
  currentScore: number;
  currentMode: SofiaMode;
  currentObjection?: string | null;
  detectionPatterns: Map<string, PatternEntry>;
  apiKey?: string;
  sofiaCapabilities?: {
    modoCloser?: boolean;
  };
}

export interface FunnelContextPhaseResult {
  funnelStage: FunnelStage;
  sofiaMode: SofiaMode;
  newScore: number;
  scoreBreakdown: ScoreBreakdown;
  nextFollowupAt: Date | null;
  propostaInfo: ProposalInfo | null;
  docsSubmittedViaPage: DocsSubmittedViaPage;
  hesitationDetected: boolean;
  hesitationResult?: HesitationFlowResult;
  detectedObjection?: string | null;
  hasExplicitIntent: boolean;
}

export interface FunnelContextConversaData {
  id: string;
  proposta_id?: string | null;
  bitrix24_lead_id?: string | null;
  bitrix24_stage?: string | null;
  contrato_enviado_at?: string | null;
  sofia_mode?: string | null;
  lead_score?: number;
  dados_coletados?: Record<string, unknown> | null;
}

// ═══════════════════════════════════════════════════════════════
// SCORE CALCULATION
// ═══════════════════════════════════════════════════════════════

/**
 * Calculate message score and new total score
 */
export function calculateScores(
  messageText: string,
  currentScore: number
): { scoreBreakdown: ScoreBreakdown; messageScore: number; newScore: number } {
  const scoreBreakdown = calculateMessageScore(messageText, currentScore);
  const messageScore = Object.values(scoreBreakdown).reduce((sum, val) => sum + val, 0);
  const newScore = Math.min(currentScore + messageScore, 100);
  
  return { scoreBreakdown, messageScore, newScore };
}

// ═══════════════════════════════════════════════════════════════
// PROPOSAL AND DOCS FETCHING
// ═══════════════════════════════════════════════════════════════

/**
 * Fetch proposal info and submitted documents
 */
export async function fetchProposalContext(
  supabase: SupabaseClient,
  propostaId: string | null,
  bitrixLeadId: string | null
): Promise<{ propostaInfo: ProposalInfo | null; docsSubmittedViaPage: DocsSubmittedViaPage }> {
  const propostaInfo = await fetchProposalInfo(supabase, propostaId, bitrixLeadId);
  const docsSubmittedViaPage = await fetchDocsSubmittedViaPage(supabase, propostaInfo?.id || null);
  
  return { propostaInfo, docsSubmittedViaPage };
}

// ═══════════════════════════════════════════════════════════════
// FUNNEL STAGE DETERMINATION
// ═══════════════════════════════════════════════════════════════

/**
 * Determine funnel stage based on extracted data and proposal info
 */
export function determineFunnelContext(
  extractedData: ExtractedClientData,
  propostaInfo: ProposalInfo | null,
  contratoEnviado: boolean
): FunnelStage {
  return determineFunnelStage(
    extractedData,
    propostaInfo?.id || null,
    propostaInfo?.tipo_proposta || null,
    contratoEnviado
  );
}

// ═══════════════════════════════════════════════════════════════
// HESITATION FLOW
// ═══════════════════════════════════════════════════════════════

/**
 * Execute hesitation detection flow
 */
export async function executeHesitationFlow(
  supabase: SupabaseClient,
  conversaId: string,
  phone: string,
  clienteNome: string | null,
  messageText: string,
  funnelStage: FunnelStage,
  currentMode: SofiaMode,
  agentName: string,
  apiKey: string,
  detectionPatterns: Map<string, PatternEntry>
): Promise<{ detected: boolean; result: HesitationFlowResult }> {
  const hesitationFlowCtx: HesitationFlowContext = {
    supabase,
    conversaId,
    messageText,
    funnelStage,
    currentMode,
    clienteNome,
    phone,
    agentName,
    apiKey,
    defaultModel: DEFAULT_MODELS[1],
    patterns: detectionPatterns,
  };
  
  const hesitationFlowResult = await orchestrateHesitationFlow(hesitationFlowCtx);
  
  return {
    detected: hesitationFlowResult.detected,
    result: hesitationFlowResult,
  };
}

// ═══════════════════════════════════════════════════════════════
// MAIN EXECUTION FUNCTION
// ═══════════════════════════════════════════════════════════════

/**
 * Execute funnel context phase
 * Calculates score, fetches proposal info, determines stage/mode, handles hesitation
 */
export async function executeFunnelContextPhase(
  ctx: FunnelContextPhaseContext
): Promise<FunnelContextPhaseResult> {
  const {
    supabase,
    conversaId,
    phone,
    clienteNome,
    messageText,
    agentConfig,
    conversa,
    extractedData,
    currentScore,
    currentMode,
    currentObjection,
    detectionPatterns,
    apiKey = '',
    sofiaCapabilities,
  } = ctx;
  
  // Step 1: Detect objection and explicit intent
  const detectedObjection = detectObjection(messageText) || currentObjection;
  const hasExplicitIntent = hasHighIntent(messageText);
  
  // Step 2: Calculate scores
  const { scoreBreakdown, messageScore, newScore } = calculateScores(messageText, currentScore);
  
  // Step 3: Fetch proposal info and docs
  const { propostaInfo, docsSubmittedViaPage } = await fetchProposalContext(
    supabase,
    conversa?.proposta_id || null,
    conversa?.bitrix24_lead_id || null
  );
  
  // Step 4: Determine funnel stage
  const contratoEnviado = !!conversa?.contrato_enviado_at;
  const funnelStage = determineFunnelContext(extractedData, propostaInfo, contratoEnviado);
  
  console.log('[FUNNEL_CONTEXT] Funnel Stage:', funnelStage, {
    hasProposal: !!propostaInfo,
    propostaTipo: propostaInfo?.tipo_proposta,
    contratoEnviado,
    docsViaPage: docsSubmittedViaPage.hasSubmission,
  });
  
  // Step 5: Execute hesitation flow
  const hesitationResult = await executeHesitationFlow(
    supabase,
    conversaId,
    phone,
    clienteNome || null,
    messageText,
    funnelStage,
    currentMode,
    agentConfig?.name || 'sofIA',
    apiKey,
    detectionPatterns
  );
  
  // Step 6: Calculate next followup and final mode
  const nextFollowupAt = calculateNextFollowup(newScore);
  const sofiaMode = determineSofiaMode(
    currentMode,
    newScore,
    hasExplicitIntent,
    funnelStage,
    sofiaCapabilities?.modoCloser || false,
    hesitationResult.detected
  );
  
  console.log('[FUNNEL_CONTEXT] Lead Scoring:', {
    currentScore,
    messageScore,
    newScore,
    sofiaMode,
    funnelStage,
    detectedObjection,
    hesitationDetected: hesitationResult.detected,
  });
  
  return {
    funnelStage,
    sofiaMode,
    newScore,
    scoreBreakdown,
    nextFollowupAt,
    propostaInfo,
    docsSubmittedViaPage,
    hesitationDetected: hesitationResult.detected,
    hesitationResult: hesitationResult.result,
    detectedObjection,
    hasExplicitIntent,
  };
}
