/**
 * Funnel Stage Module
 * Centralized funnel stage determination, mode management, and scoring
 * Extracted from sofia-webhook/index.ts for reuse across Edge Functions
 * 
 * Phase 72: Consolidated scoring functions
 */

import { getPatternCache, matchesPatternCategory, hasHighIntent, type PatternEntry } from './detection-patterns.ts';
import type { ExtractedClientData } from './data-extraction.ts';
// Use unified config loader for hierarchical config resolution
import { getConfigValue, getConfigNumber } from './unified-config-loader.ts';
// Name validation
import { isValidPersonName, extractCleanName } from './validation-utils.ts';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

// Funnel stages following COESA sales process (achievement-based)
export type FunnelStage = 
  | 'coleta_dados' 
  | 'proposta_inicial' 
  | 'proposta_inicial_enviada' 
  | 'proposta_definitiva' 
  | 'fechamento';

// Sofia operational modes
export type SofiaMode = 
  | 'standard' 
  | 'closer_premium' 
  | 'contract_closer' 
  | 'paused_for_human';

// ═══════════════════════════════════════════════════════════════
// FUNNEL STAGE DETERMINATION
// ═══════════════════════════════════════════════════════════════

/**
 * Determines the current funnel stage based on collected data and proposal state
 * This ensures Sofia follows the correct sales process step by step (achievements)
 * 
 * REQUISITOS MÍNIMOS PARA PROPOSTA INICIAL:
 * Nome, WhatsApp (já temos), E-mail, Concessionária, Gasto Médio (valorFatura/consumo)
 */
export function determineFunnelStage(
  dadosColetados: ExtractedClientData | null,
  propostaId: string | null,
  propostaTipo: string | null,
  contratoEnviado: boolean
): FunnelStage {
  // Achievement 4: If contract was sent, we're in final closing phase
  if (contratoEnviado) {
    return 'fechamento';
  }
  
  // Achievement 3: If we have a definitive proposal, focus on getting signature
  if (propostaId && propostaTipo === 'definitiva') {
    return 'proposta_definitiva';
  }
  
  // Achievement 2: If we have an initial proposal, wait for acceptance on the page
  // Sofia should NOT ask for documents - they are uploaded on the proposal page
  if (propostaId && propostaTipo === 'inicial') {
    return 'proposta_inicial_enviada';
  }
  
  // Check if we have ALL required data to generate initial proposal
  // CRÍTICO: Requer Nome REAL, E-mail, Distribuidora E Valor/Consumo
  // Nome REAL = não pode ser só emojis, greetings, etc.
  const hasValidNome = isValidPersonName(dadosColetados?.nome);
  const hasAllRequiredData = dadosColetados && 
    hasValidNome &&
    dadosColetados.email && dadosColetados.email.includes('@') &&
    (dadosColetados.consumo || dadosColetados.valorFatura) && 
    dadosColetados.distribuidora;
  
  // Ready to generate initial proposal ONLY if all data is complete
  if (hasAllRequiredData) {
    console.log('[determineFunnelStage] All minimum data present, stage: proposta_inicial');
    return 'proposta_inicial';
  }
  
  // Achievement 1: Default - still collecting basic data
  console.log('[determineFunnelStage] Missing data, stage: coleta_dados', {
    nome: dadosColetados?.nome,
    email: dadosColetados?.email,
    valor: dadosColetados?.valorFatura || dadosColetados?.consumo,
    distribuidora: dadosColetados?.distribuidora,
  });
  return 'coleta_dados';
}

/**
 * Checks if all minimum requirements are met for generating an initial proposal
 * REQUISITOS: Nome, E-mail, Distribuidora, Valor da Fatura (ou consumo)
 * WhatsApp já temos porque é o canal de comunicação
 * 
 * @param dadosColetados - Collected data from conversation
 * @param fallbackNome - Optional fallback name (e.g., from WhatsApp contact)
 */
export function hasMinimumDataForProposal(
  dadosColetados: ExtractedClientData | null,
  fallbackNome?: string | null
): boolean {
  if (!dadosColetados) return false;
  
  // Use fallback name if dados.nome is missing, but validate it's a REAL name
  const effectiveNome = dadosColetados.nome || fallbackNome;
  const cleanedNome = extractCleanName(effectiveNome);
  const hasNome = isValidPersonName(cleanedNome);
  const hasEmail = !!dadosColetados.email && dadosColetados.email.includes('@');
  const hasValor = !!dadosColetados.valorFatura || !!dadosColetados.consumo;
  // Also check distribuidoraInformada as fallback
  const hasDistribuidora = !!dadosColetados.distribuidora || !!(dadosColetados as any).distribuidoraInformada;
  
  const result = hasNome && hasEmail && hasValor && hasDistribuidora;
  
  console.log(`[hasMinimumDataForProposal] Check: nome=${hasNome}(${effectiveNome?.substring(0,10)} → ${cleanedNome?.substring(0,10) || 'INVALID'}), email=${hasEmail}, valor=${hasValor}, distribuidora=${hasDistribuidora} => ${result}`);
  
  return result;
}

/**
 * Get missing data fields for proposal
 */
export function getMissingDataForProposal(dadosColetados: ExtractedClientData | null): string[] {
  const missing: string[] = [];
  
  // Check for VALID name (not just any string)
  if (!isValidPersonName(dadosColetados?.nome)) {
    missing.push('nome');
  }
  if (!dadosColetados?.email || !dadosColetados.email.includes('@')) {
    missing.push('email');
  }
  if (!dadosColetados?.valorFatura && !dadosColetados?.consumo) {
    missing.push('valorFatura');
  }
  if (!dadosColetados?.distribuidora) {
    missing.push('distribuidora');
  }
  
  return missing;
}

// ═══════════════════════════════════════════════════════════════
// SOFIA MODE DETERMINATION
// ═══════════════════════════════════════════════════════════════

/**
 * Determines Sofia's operational mode based on score, intent, and funnel stage
 */
export function determineSofiaMode(
  currentMode: string,
  newScore: number,
  hasExplicitIntent: boolean,
  funnelStage: FunnelStage,
  modoCloserEnabled: boolean = true,
  hesitationDetected: boolean = false
): SofiaMode {
  // contract_closer mode is sticky until contract is signed
  if (currentMode === 'contract_closer') return 'contract_closer';
  if (currentMode === 'paused_for_human') return 'paused_for_human';
  
  // If hesitation is detected, ALWAYS revert to consultive (standard) mode
  // This ensures Sofia becomes supportive and addresses concerns rather than pushing
  if (hesitationDetected) {
    console.log('[HESITATION_MODE] Hesitation detected, forcing STANDARD (consultive) mode');
    return 'standard';
  }
  
  // Only allow CLOSER_PREMIUM in closing stage
  // Otherwise stay STANDARD (consultive) regardless of score
  if (funnelStage !== 'fechamento') {
    return 'standard'; // Stay consultive until we have definitive proposal
  }
  
  // If modoCloser capability is disabled, stay in standard mode
  if (!modoCloserEnabled) {
    console.log('[CAPABILITIES] Modo Closer disabled, staying in standard mode');
    return 'standard';
  }
  
  // In closing stage, allow aggressive mode
  if (currentMode === 'closer_premium') return 'closer_premium';
  if (newScore >= 60) return 'closer_premium';
  if (hasExplicitIntent) return 'closer_premium';
  return 'standard';
}

/**
 * Determine A/B variant for conversation
 */
export function getABVariant(conversaId: string): 'A' | 'B' {
  if (!conversaId) return 'A';
  const charCode = conversaId.charCodeAt(0);
  return charCode % 2 === 0 ? 'A' : 'B';
}

/**
 * Calculate next followup date based on lead score - uses dynamic config
 */
export function calculateNextFollowup(score: number, configCache?: Map<string, string>): Date | null {
  const now = new Date();
  
  // Get thresholds from config (with fallbacks)
  const highThreshold = getConfigNumber('followup_score_threshold_high', 80, configCache);
  const mediumThreshold = getConfigNumber('followup_score_threshold_medium', 60, configCache);
  const lowThreshold = getConfigNumber('followup_score_threshold_low', 30, configCache);
  
  // Get delays from config (in hours, with fallbacks)
  const highDelayHours = getConfigNumber('followup_delay_high_score_hours', 24, configCache);
  const mediumDelayHours = getConfigNumber('followup_delay_medium_score_hours', 48, configCache);
  const lowDelayHours = getConfigNumber('followup_delay_low_score_hours', 72, configCache);
  
  if (score >= highThreshold) return new Date(now.getTime() + highDelayHours * 60 * 60 * 1000);
  if (score >= mediumThreshold) return new Date(now.getTime() + mediumDelayHours * 60 * 60 * 1000);
  if (score >= lowThreshold) return new Date(now.getTime() + lowDelayHours * 60 * 60 * 1000);
  return null;
}

// ═══════════════════════════════════════════════════════════════
// PROPOSAL PROMISE DETECTION - Uses dynamic patterns from database
// ═══════════════════════════════════════════════════════════════

/**
 * Detects if Sofia promised to generate a proposal in her response
 * Uses dynamic patterns from database (category: proposal_promise)
 */
export function detectProposalPromise(
  responseText: string,
  patterns?: Map<string, PatternEntry>
): boolean {
  if (patterns && matchesPatternCategory(responseText, 'proposal_promise', patterns)) {
    return true;
  }
  return false;
}

/**
 * Detects if client accepted proposal generation
 * Uses dynamic patterns from database (category: proposal_acceptance)
 */
export function detectProposalAcceptance(
  message: string,
  patterns?: Map<string, PatternEntry>
): boolean {
  if (patterns && matchesPatternCategory(message, 'proposal_acceptance', patterns)) {
    return true;
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════
// FUNNEL STAGE LABELS (dynamic with fallbacks)
// ═══════════════════════════════════════════════════════════════

// Fallback labels (used when config not loaded)
const FUNNEL_STAGE_LABELS_FALLBACK: Record<FunnelStage, string> = {
  coleta_dados: 'Coleta de Dados',
  proposta_inicial: 'Pronto para Proposta',
  proposta_inicial_enviada: 'Proposta Inicial Enviada',
  proposta_definitiva: 'Proposta Definitiva',
  fechamento: 'Fechamento',
};

const SOFIA_MODE_LABELS_FALLBACK: Record<SofiaMode, string> = {
  standard: 'Consultivo',
  closer_premium: 'Closer Premium',
  contract_closer: 'Fechamento de Contrato',
  paused_for_human: 'Pausado (Atendimento Humano)',
};

/**
 * Get funnel stage label from config or fallback
 */
export function getFunnelStageLabel(stage: FunnelStage, configCache?: Map<string, string>): string {
  const configKey = `label_funnel_${stage}`;
  const cached = configCache?.get(configKey);
  if (cached) return String(cached);
  return FUNNEL_STAGE_LABELS_FALLBACK[stage] || stage;
}

/**
 * Get Sofia mode label from config or fallback
 */
export function getSofiaModeLabel(mode: SofiaMode, configCache?: Map<string, string>): string {
  const configKey = `label_mode_${mode}`;
  const cached = configCache?.get(configKey);
  if (cached) return String(cached);
  return SOFIA_MODE_LABELS_FALLBACK[mode] || mode;
}

// Export fallbacks for compatibility
export const FUNNEL_STAGE_LABELS = FUNNEL_STAGE_LABELS_FALLBACK;
export const SOFIA_MODE_LABELS = SOFIA_MODE_LABELS_FALLBACK;

// ═══════════════════════════════════════════════════════════════
// SCORE CALCULATION - Consolidated from sofia-webhook (Phase 65)
// ═══════════════════════════════════════════════════════════════

/**
 * Score breakdown for message scoring
 */
export interface ScoreBreakdown {
  baseScore: number;
  intentBonus: number;
  dataBonus: number;
  engagementBonus: number;
}

/**
 * Calculate message score based on content and patterns
 * Uses detection patterns for intent and objection detection
 */
export function calculateMessageScore(
  messageText: string,
  currentScore: number,
  patterns?: Map<string, PatternEntry>
): ScoreBreakdown {
  const breakdown: ScoreBreakdown = {
    baseScore: 5, // Every message gets base points
    intentBonus: 0,
    dataBonus: 0,
    engagementBonus: 0,
  };
  
  const lowerMessage = messageText.toLowerCase();
  
  // Intent bonus - using patterns if available
  if (patterns && matchesPatternCategory(messageText, 'high_intent', patterns)) {
    breakdown.intentBonus = 15;
  } else if (lowerMessage.includes('quero') || lowerMessage.includes('interesse') || lowerMessage.includes('aceito')) {
    breakdown.intentBonus = 10;
  }
  
  // Data provision bonus - client sharing info
  if (lowerMessage.includes('@') || // email
      /\d{3}[\.\-]?\d{3}[\.\-]?\d{3}[\.\-]?\d{2}/.test(messageText) || // CPF
      /\d{2}[\.\-]?\d{3}[\.\-]?\d{3}[\.\-\/]?\d{4}[\.\-]?\d{2}/.test(messageText) || // CNPJ
      /r\$\s*\d+/i.test(messageText)) { // money value
    breakdown.dataBonus = 10;
  }
  
  // Engagement bonus - longer messages show engagement
  if (messageText.length > 100) {
    breakdown.engagementBonus = 5;
  } else if (messageText.length > 50) {
    breakdown.engagementBonus = 3;
  }
  
  return breakdown;
}

/**
 * Proposal info structure for funnel stage determination
 */
export interface ProposalInfo {
  id: string;
  tipo_proposta: string | null;
  desconto_percentual: number | null;
}

/**
 * Fetch proposal info for a conversation
 * Returns proposal data needed for funnel stage and discount calculations
 */
export async function fetchProposalInfo(
  supabase: any,
  propostaId: string | null,
  bitrixLeadId: string | null
): Promise<ProposalInfo | null> {
  // First try by proposta_id
  if (propostaId) {
    const { data: proposta } = await supabase
      .from('propostas_assinantes')
      .select('id, tipo_proposta, desconto_percentual')
      .eq('id', propostaId)
      .single();
    
    if (proposta) return proposta;
  }
  
  // Fallback: try by bitrix lead ID
  if (bitrixLeadId) {
    const { data: proposta } = await supabase
      .from('propostas_assinantes')
      .select('id, tipo_proposta, desconto_percentual')
      .eq('bitrix24_lead_id', bitrixLeadId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (proposta) return proposta;
  }
  
  return null;
}

/**
 * Documents submitted via page structure
 */
export interface DocsSubmittedViaPage {
  hasSubmission: boolean;
  documentoIdentidade: boolean;
  fatura: boolean;
  contratoSocial: boolean;
  status: string | null;
}

/**
 * Fetch docs submitted via the proposal page
 */
export async function fetchDocsSubmittedViaPage(
  supabase: any,
  propostaId: string | null
): Promise<DocsSubmittedViaPage> {
  const emptyResult: DocsSubmittedViaPage = {
    hasSubmission: false,
    documentoIdentidade: false,
    fatura: false,
    contratoSocial: false,
    status: null,
  };
  
  if (!propostaId) return emptyResult;
  
  const { data: solicitacao } = await supabase
    .from('solicitacoes_proposta_definitiva')
    .select('documento_identificacao_url, conta_luz_url, contrato_social_url, status')
    .eq('proposta_inicial_id', propostaId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  
  if (!solicitacao) return emptyResult;
  
  return {
    hasSubmission: true,
    documentoIdentidade: !!solicitacao.documento_identificacao_url,
    fatura: !!solicitacao.conta_luz_url,
    contratoSocial: !!solicitacao.contrato_social_url,
    status: solicitacao.status,
  };
}

/**
 * Full funnel context result
 */
export interface FunnelContextResult {
  funnelStage: FunnelStage;
  finalMode: SofiaMode;
  propostaInfo: ProposalInfo | null;
  docsSubmittedViaPage: DocsSubmittedViaPage;
  newScore: number;
  scoreBreakdown: ScoreBreakdown;
  nextFollowupAt: Date | null;
}

/**
 * Orchestrate full funnel context calculation
 * Consolidates: score calculation, proposal fetch, docs fetch, stage/mode determination
 */
export async function calculateFunnelContext(params: {
  supabase: any;
  messageText: string;
  currentScore: number;
  currentMode: string;
  conversa: {
    proposta_id: string | null;
    bitrix24_lead_id: string | null;
    contrato_enviado_at: string | null;
  } | null;
  dadosColetados: ExtractedClientData | null;
  detectedObjection: string | null;
  hasExplicitIntent: boolean;
  hesitationDetected: boolean;
  modoCloserEnabled: boolean;
  patterns?: Map<string, PatternEntry>;
}): Promise<FunnelContextResult> {
  const {
    supabase,
    messageText,
    currentScore,
    currentMode,
    conversa,
    dadosColetados,
    hasExplicitIntent,
    hesitationDetected,
    modoCloserEnabled,
    patterns,
  } = params;
  
  // 1. Calculate message score
  const scoreBreakdown = calculateMessageScore(messageText, currentScore, patterns);
  const messageScore = Object.values(scoreBreakdown).reduce((sum, val) => sum + val, 0);
  const newScore = Math.min(currentScore + messageScore, 100);
  
  // 2. Fetch proposal info
  const propostaInfo = await fetchProposalInfo(
    supabase,
    conversa?.proposta_id || null,
    conversa?.bitrix24_lead_id || null
  );
  
  // 3. Fetch docs submitted via page
  const docsSubmittedViaPage = await fetchDocsSubmittedViaPage(
    supabase,
    propostaInfo?.id || null
  );
  
  // 4. Determine funnel stage
  const contratoEnviado = !!conversa?.contrato_enviado_at;
  const funnelStage = determineFunnelStage(
    dadosColetados,
    propostaInfo?.id || null,
    propostaInfo?.tipo_proposta || null,
    contratoEnviado
  );
  
  // 5. Determine final mode
  const finalMode = determineSofiaMode(
    currentMode,
    newScore,
    hasExplicitIntent,
    funnelStage,
    modoCloserEnabled,
    hesitationDetected
  );
  
  // 6. Calculate next followup
  const nextFollowupAt = calculateNextFollowup(newScore);
  
  return {
    funnelStage,
    finalMode,
    propostaInfo,
    docsSubmittedViaPage,
    newScore,
    scoreBreakdown,
    nextFollowupAt,
  };
}
