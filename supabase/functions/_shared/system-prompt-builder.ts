/**
 * System Prompt Builder Module
 * 
 * Centralized prompt construction for all AI agents (sofIA, marIA, julIA)
 * Extracted from sofia-webhook/index.ts as part of Phase 2 refactoring
 * 
 * Features:
 * - PASSIVE-FIRST architecture (AGENTS.md-style)
 * - SOFIA.md core loader integration
 * - Rule Memory injection for learned rules
 * - RAG-FIRST architecture integration
 * - Client profile detection (technical vs simple)
 * - Multi-agent support via agentConfig
 * - Integrity validation alerts
 * - Objection handling blocks
 * - Rejection history awareness
 * - Competitor detection awareness
 * 
 * @module _shared/system-prompt-builder
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.90.0';
import { type FunnelStage, type SofiaMode } from './funnel-stage.ts';
import { type ObjectionType, getABClosingPhrase, matchesPatternCategory, getPatternCache, type PatternEntry } from './detection-patterns.ts';
import { type ExtractedClientData } from './data-extraction.ts';
import { type DocsSubmittedViaPage, type DocsReceivedWhatsApp } from './document-handler.ts';
import { type FullAgentConfig, buildGuardrailsPrompt, buildKnowledgeBasePrompt } from './ai-gym-config.ts';
import { getTemplateCache, type MessageTemplate } from './message-templates.ts';
import { buildCompetitorPromptBlock } from './competitor-detection.ts';
import { isValidPersonName } from './validation-utils.ts';

// PASSIVE-FIRST imports (AGENTS.md-style)
import { loadSofiaCore, getRetrievalLedReasoningBlock, buildSofiaCorePromptBlock, type SofiaCoreContent } from './sofia-core-loader.ts';
import { buildRuleMemoryBlock, type RuleMemoryContext, type InjectedRulesBlock } from './rule-memory-injector.ts';
import { prefetchPassiveRAG, getCategoriesForStage, type PassiveRAGConfig } from './passive-rag-prefetch.ts';
import { compressContext, type CompressionConfig } from './context-compressor.ts';
import { injectFewShotExamples, type FewShotBlock } from './few-shot-injector.ts';
import { buildRAGIndex, buildRAGIndexPromptBlock, type RAGIndexResult } from './rag-index-builder.ts';

// Observability import for prompt size tracking
import { createPromptSizeCollector, logPromptSize, type PromptSizeMetrics } from './sofia-orchestrator/observability/prompt-size-metrics.ts';

// FEATURE FLAGS - AGENTS.md-Style Passive Context Architecture
const ENABLE_SOFIA_CORE = true;             // SOFIA.md core constitution
const ENABLE_RULE_MEMORY_INJECTION = true;  // Rules from rule_memory table
const ENABLE_PASSIVE_RAG = true;            // Pre-fetch RAG by funnel stage
const ENABLE_CONTEXT_COMPRESSION = true;    // Compress final prompt ✅
const ENABLE_RETRIEVAL_LED_BLOCK = true;    // Retrieval-led reasoning
const ENABLE_FEW_SHOT_INJECTION = true;     // Few-shot examples injection ✅
const ENABLE_RAG_INDEX = true;              // RAG categories index ✅ P3
const PROMPT_SIZE_TARGET_CHARS = 8000;      // Target: 8KB per AGENTS.md

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type ClientProfile = 'technical' | 'simple' | 'mixed';

export interface ClientProfileScore {
  technical: number;
  simple: number;
}

export interface RejectionHistory {
  wasRejectedBefore: boolean;
  rejectionReason: string | null;
  rejectionDate: string | null;
  rejectedBy: 'sofia' | 'human' | null;
  rejectionMessage: string | null;
}

export interface RAGContext {
  content: string;
  resultsCount: number;
  categories: string[];
}

export interface SystemPromptParams {
  clienteNome: string | null;
  sofiaMode: SofiaMode;
  abVariant: 'A' | 'B';
  detectedObjection: ObjectionType;
  descontoPercentual?: number;
  funnelStage?: FunnelStage;
  dadosColetados?: ExtractedClientData;
  docsSubmittedViaPage?: DocsSubmittedViaPage;
  detectedSentiment?: 'positive' | 'neutral' | 'negative' | null;
  agentConfig?: FullAgentConfig | null;
  ragContext?: RAGContext | null;
  arquivosAnexados?: string[] | null;
  docsReceivedWhatsApp?: DocsReceivedWhatsApp[] | null;
  propostaId?: string | null;
  rejectionHistory?: RejectionHistory | null;
  clientProfile?: { profile: ClientProfile; confidence: 'high' | 'medium' | 'low' } | null;
  // PASSIVE-FIRST additions
  supabase?: SupabaseClient | null;        // For rule_memory and passive RAG
  injectedRulesBlock?: InjectedRulesBlock | null;  // Pre-loaded rules block
  passiveRAGContent?: string | null;       // Pre-fetched RAG content
  fewShotBlock?: FewShotBlock | null;      // Pre-fetched few-shot examples
  ragIndexResult?: RAGIndexResult | null;  // Pre-built RAG categories index
}

// HELPER FUNCTIONS

/**
 * Get detection patterns from cache (helper for sync access)
 */
function getDetectionPatternsFromCache(): Map<string, PatternEntry> {
  return getPatternCache()?.patterns || new Map();
}

/**
 * Map rejection reasons to human-readable labels
 */
export function getRejectionLabel(reason: string | null): string {
  const labels: Record<string, string> = {
    'tarifa_social': 'TARIFA SOCIAL (baixa renda)',
    'distribuidora_nao_atendida': 'REGIÃO NÃO ATENDIDA',
    'grupo_a': 'GRUPO A (alta tensão)',
    'consumo_baixo': 'CONSUMO MUITO BAIXO',
  };
  return labels[reason || ''] || reason || 'Motivo não especificado';
}

/**
 * Format RAG categories with labels from database or fallback
 */
function formatRAGCategories(categories: string[], labelsCache?: Map<string, string>): string {
  if (!categories || categories.length === 0) return '';
  
  const labeledCategories = categories.map(cat => {
    const label = labelsCache?.get(`rag_category_label_${cat}`) || cat;
    return label;
  });
  
  return labeledCategories.join(', ');
}

/**
 * Build RAG-FIRST prompt section
 * Ensures AI prioritizes document-based answers over hardcoded instructions
 */
function buildRAGFirstPromptSection(
  ragContent: string, 
  resultsCount: number, 
  categories: string[],
  labelsCache?: Map<string, string>
): string {
  if (!ragContent || resultsCount === 0) {
    return '';
  }

  const formattedCategories = formatRAGCategories(categories, labelsCache);
  
  // AGENTS.md-style: high signal, minimal decoration
  // ragContent already contains confidence labels from rag-search v2
  return `
## CONTEXTO RELEVANTE — ${resultsCount} docs
${formattedCategories ? `Categorias: ${formattedCategories}` : ''}

${ragContent}

Regras RAG: priorize acima; se coberto, use exatamente; se faltar, pergunte/escale; não invente.`;
}

// CLIENT PROFILE DETECTION

/**
 * Detects the client profile based on their messages
 * Returns 'technical' for analytical clients who want details
 * Returns 'simple' for practical clients who want objectivity
 * Returns 'mixed' if no clear pattern
 */
export function detectClientProfile(
  message: string, 
  conversationHistory: Array<{role: string; content: string}> | null,
  currentScore: ClientProfileScore | null,
  patterns?: Map<string, PatternEntry>
): { profile: ClientProfile; score: ClientProfileScore; confidence: 'high' | 'medium' | 'low' } {
  const patternsToUse = patterns || getDetectionPatternsFromCache();
  const cleanMessage = message.toLowerCase().trim();
  
  // Initialize or carry forward score
  const score: ClientProfileScore = currentScore ? { ...currentScore } : { technical: 0, simple: 0 };
  
  // Score current message
  if (matchesPatternCategory(cleanMessage, 'client_profile_technical', patternsToUse)) {
    score.technical += 10;
    console.log('[ClientProfile] Technical pattern matched, score:', score.technical);
  }
  
  if (matchesPatternCategory(cleanMessage, 'client_profile_simple', patternsToUse)) {
    score.simple += 10;
    console.log('[ClientProfile] Simple pattern matched, score:', score.simple);
  }
  
  // Analyze conversation history for additional signals
  if (conversationHistory && conversationHistory.length > 0) {
    const userMessages = conversationHistory.filter(m => m.role === 'user');
    const avgMessageLength = userMessages.reduce((sum, m) => sum + m.content.length, 0) / Math.max(userMessages.length, 1);
    
    // Long messages suggest analytical mindset
    if (avgMessageLength > 100) {
      score.technical += 5;
    } else if (avgMessageLength < 30) {
      score.simple += 5;
    }
    
    // Count questions with "como", "por que", "qual" (analytical)
    const analyticalQuestions = userMessages.filter(m => 
      /como.*funciona|por.*que|qual.*fórmula|qual.*formula|me.*explica/i.test(m.content)
    ).length;
    score.technical += analyticalQuestions * 3;
    
    // Count quick affirmations (practical)
    const quickResponses = userMessages.filter(m => 
      /^(ok|beleza|fechado|bora|vamos|sim|pode|certo)[.!]?$/i.test(m.content.trim())
    ).length;
    score.simple += quickResponses * 3;
  }
  
  // Determine profile and confidence
  const diff = Math.abs(score.technical - score.simple);
  const total = score.technical + score.simple;
  
  let profile: ClientProfile;
  let confidence: 'high' | 'medium' | 'low';
  
  if (total === 0) {
    profile = 'mixed';
    confidence = 'low';
  } else if (diff >= 15) {
    profile = score.technical > score.simple ? 'technical' : 'simple';
    confidence = 'high';
  } else if (diff >= 8) {
    profile = score.technical > score.simple ? 'technical' : 'simple';
    confidence = 'medium';
  } else {
    profile = 'mixed';
    confidence = 'low';
  }
  
  console.log(`[ClientProfile] Detected: ${profile} (confidence: ${confidence})`, score);
  
  return { profile, score, confidence };
}

/**
 * Builds the prompt instruction block based on client profile (AGENTS.md compact format)
 */
export function buildClientProfilePromptBlock(profile: ClientProfile, confidence: 'high' | 'medium' | 'low'): string {
  const strength = confidence === 'high' ? 'forte' : confidence === 'medium' ? 'moderado' : '';
  
  if (confidence === 'low') {
    return `🎯 PERFIL:N/D — resposta balanceada; ofereça detalhes opcionalmente`;
  }
  
  if (profile === 'technical') {
    return `🔬 PERFIL:TÉCNICO(${strength}) — cálculos completos|R$/kWh|fórmulas|passo a passo`;
  }
  
  if (profile === 'simple') {
    return `📋 PERFIL:PRÁTICO(${strength}) — direto ao ponto|resultado final|benefício>processo`;
  }
  
  return '';
}

// CLIENT PROFILE DETECTION ORCHESTRATOR

export interface ClientProfileFlowContext {
  messageText: string;
  history: Array<{ role: string; content: string }> | null;
  extractedData: Record<string, unknown>;
  patterns?: Map<string, PatternEntry>;
}

export interface ClientProfileFlowResult {
  profile: ClientProfile;
  score: ClientProfileScore;
  confidence: 'high' | 'medium' | 'low';
  updatedExtractedData: Record<string, unknown>;
}

/**
 * Orchestrates client profile detection and data persistence
 * Returns detected profile and updated extractedData with profile info
 */
export function orchestrateClientProfileDetection(
  ctx: ClientProfileFlowContext
): ClientProfileFlowResult {
  const { messageText, history, extractedData, patterns } = ctx;
  
  // Get existing profile score from dados_coletados if available
  const existingScore = (extractedData as any)?.clientProfileScore || null;
  
  const result = detectClientProfile(messageText, history, existingScore, patterns);
  
  // Create updated extractedData with profile info
  const updatedExtractedData = { ...extractedData };
  
  // Save updated profile score to dados_coletados for continuity
  if (result.score.technical > 0 || result.score.simple > 0) {
    (updatedExtractedData as any).clientProfileScore = result.score;
    (updatedExtractedData as any).clientProfile = result.profile;
  }
  
  return {
    profile: result.profile,
    score: result.score,
    confidence: result.confidence,
    updatedExtractedData,
  };
}


/**
 * Build the complete system prompt for AI agents
 * Supports PASSIVE-FIRST architecture (AGENTS.md-style) and multi-agent compatibility
 * 
 * Priority order:
 * 1. Retrieval-Led Reasoning block (forces doc-first behavior)
 * 2. SOFIA.md Core (identity + cláusulas pétreas)
 * 3. Rule Memory injection (learned rules)
 * 4. RAG Context (document-based knowledge)
 * 5. Dynamic Context (client data, funnel stage)
 */
export function buildSystemPrompt(params: SystemPromptParams): string {
  const {
    clienteNome,
    sofiaMode,
    abVariant,
    detectedObjection,
    descontoPercentual,
    funnelStage,
    dadosColetados,
    docsSubmittedViaPage,
    detectedSentiment,
    agentConfig,
    ragContext,
    arquivosAnexados,
    docsReceivedWhatsApp,
    propostaId,
    rejectionHistory,
    clientProfile,
    // PASSIVE-FIRST additions
    injectedRulesBlock,
    passiveRAGContent,
    fewShotBlock,
    ragIndexResult,
  } = params;

  const agentName = agentConfig?.name || 'sofIA';
  const agentRole = agentConfig?.role || 'vendas';
  const isNonSofiaAgent = agentConfig?.agent_id && agentConfig.agent_id !== 'sofia';
  
  // PASSIVE-FIRST CONTEXT BLOCKS
  
  // 1. Retrieval-Led Reasoning (forces doc-first behavior)
  const retrievalLedBlock = ENABLE_RETRIEVAL_LED_BLOCK 
    ? getRetrievalLedReasoningBlock() 
    : '';
  
  // 2. SOFIA.md Core (identity + cláusulas pétreas)
  const sofiaCoreBlock = ENABLE_SOFIA_CORE 
    ? buildSofiaCorePromptBlock({
        includeIdentity: true,
        includeClausulasPetreas: true,
        includeFSM: false,  // FSM state shown in context below
        includeRetrievalLed: false,  // Already added above
        includeAntiAlucinacao: true,
        includeQuickReference: false,
      })
    : '';
  
  // 3. Rule Memory (learned rules from database)
  const ruleMemoryBlock = ENABLE_RULE_MEMORY_INJECTION && injectedRulesBlock 
    ? injectedRulesBlock.content 
    : '';
  
  // 4. Few-Shot Examples (AGENTS.md P2 - examples from few_shot_examples table)
  const fewShotContent = ENABLE_FEW_SHOT_INJECTION && fewShotBlock?.content 
    ? fewShotBlock.content 
    : '';
  
  // 5. RAG Index (AGENTS.md P3 - available knowledge categories)
  const ragIndexBlock = ENABLE_RAG_INDEX && ragIndexResult 
    ? buildRAGIndexPromptBlock(ragIndexResult) 
    : '';
  
  // 6. Build RAG context section (active or passive)
  const ragFirstSection = passiveRAGContent 
    ? passiveRAGContent  // Passive RAG (pre-fetched by stage)
    : (ragContext && ragContext.resultsCount > 0 
        ? buildRAGFirstPromptSection(ragContext.content, ragContext.resultsCount, ragContext.categories)
        : '');
  
  // NON-SOFIA AGENTS: Use their own persona from AI Gym
  if (isNonSofiaAgent && agentConfig) {
    const persona = agentConfig.persona || {};
    const identityBlock = persona.system_prompt || 
      `Você é a *${agentName}*, assistente virtual da COESA Energia Inteligente.\n\n## SEU PAPEL\n${(persona as any).papel || agentRole}\n\n## SUA MISSÃO\n${(agentConfig as any).description || ''}`;
    
    const nonSofiaPrompt = `${identityBlock}

## IDENTIDADE CRÍTICA
Você é a *${agentName}*, assistente virtual da COESA.
NUNCA se identifique como sofIA ou outro nome que não seja ${agentName}.

## CONTEXTO DO CLIENTE
${clienteNome ? `Nome: ${clienteNome}` : 'Cliente via WhatsApp'}

${ragFirstSection}
${buildGuardrailsPrompt(agentConfig.guardrails)}
${buildKnowledgeBasePrompt(agentConfig.kb_sources)}`;

    console.log(`[buildSystemPrompt] ✅ NON-SOFIA agent: ${agentConfig.agent_id} (${ragContext?.resultsCount || 0} RAG docs)`);
    return nonSofiaPrompt;
  }
  
  // FOR SOFIA: RAG-FIRST sales prompt (minimal hardcoded content)
  
  // Dynamic data status (what we have vs what's missing)
  // CRITICAL: Also determine the NEXT STEP based on what's already collected
  // IMPORTANT: Validate that nome is a REAL person name (not just emoji or greeting)
  const hasNomeValido = isValidPersonName(dadosColetados?.nome);
  const hasValorOuConsumo = !!(dadosColetados?.valorFatura || dadosColetados?.consumo);
  const hasDistribuidora = !!dadosColetados?.distribuidora;
  const hasEmail = !!dadosColetados?.email;
  
  // ═══════════════════════════════════════════════════════════════
  // PHASE "CASO EDSON": Check if value came from "acima de X" expression
  // If valorLowerBound=true, we should NOT ask for exact value or kWh
  // ═══════════════════════════════════════════════════════════════
  const hasValorLowerBound = !!(dadosColetados as any)?.valorLowerBound;
  
  // AGENTS.md-style: compact next step indicator
  // Priority order: valor → distribuidora → email → nome
  let nextDataStep = '';
  if (!hasValorOuConsumo) {
    nextDataStep = `⚠️ PRÓXIMO: VALOR DA CONTA — pergunte valor médio mensal`;
  } else if (!hasDistribuidora) {
    nextDataStep = `⚠️ PRÓXIMO: DISTRIBUIDORA (já temos valor) — pergunte qual (CEMIG, CPFL, etc.)`;
  } else if (!hasEmail) {
    nextDataStep = `⚠️ PRÓXIMO: E-MAIL (já temos valor+dist) — pergunte apenas e-mail`;
  } else if (!hasNomeValido) {
    nextDataStep = `⚠️ PRÓXIMO: NOME COMPLETO (já temos tudo, falta nome válido!) — pergunte "Como posso te chamar?"`;
  }
  
  // AGENTS.md v3.4: Compact pipe-delimited format (~300 chars saved)
  // Show ❌ for nome if it's not a valid person name (emoji, greeting, etc.)
  // Show valorLowerBound indicator if applicable
  const nomeDisplay = hasNomeValido ? dadosColetados?.nome : '❌';
  const valorDisplay = dadosColetados?.valorFatura 
    ? `R$${dadosColetados.valorFatura}${hasValorLowerBound ? '+' : ''}` 
    : dadosColetados?.consumo 
      ? `${dadosColetados.consumo}kWh` 
      : '❌';
  const dataStatus = dadosColetados ? `
📊 DADOS: nome=${nomeDisplay}|email=${dadosColetados.email || (dadosColetados.emailPendente?.aguardandoConfirmacao ? `⏳${dadosColetados.emailPendente.email}` : '❌')}|valor=${valorDisplay}|dist=${dadosColetados.distribuidora || '❌'}
${nextDataStep}` : '';

  // Docs status from page submission
  const docsStatus = docsSubmittedViaPage?.hasSubmission ? `
📄 DOCUMENTOS ENVIADOS PELO LINK:
${docsSubmittedViaPage.documentoIdentidade ? '✅ RG/CNH' : '❌ RG/CNH'}
${docsSubmittedViaPage.fatura ? '✅ Fatura' : '❌ Fatura'}
${docsSubmittedViaPage.contratoSocial ? '✅ Contrato Social' : ''}
⚠️ NÃO COBRE DOCUMENTOS JÁ ENVIADOS!` : '';

  // INTEGRITY ALERTS - Prevent hallucinations
  const integrityAlerts: string[] = [];

  // Alert 1: No invoice received yet - do NOT mention invoice data
  const hasReceivedInvoice = arquivosAnexados?.some(doc => 
    doc.toLowerCase().includes('fatura') || doc.toLowerCase().includes('conta')
  ) || docsSubmittedViaPage?.fatura || docsReceivedWhatsApp?.some(d => 
    (d as any).type === 'fatura' || (d as any).tipo === 'fatura'
  );
  
  if (!hasReceivedInvoice && !dadosColetados?.valorFatura) {
    integrityAlerts.push('🚫 NENHUMA FATURA RECEBIDA ainda. NÃO mencione dados de consumo/kWh que o cliente não informou VERBALMENTE.');
  }

  // Alert 2: Proposal URLs must come from system
  if (propostaId) {
    integrityAlerts.push(`✅ PROPOSTA EXISTE no sistema (ID: ${propostaId}). O link correto já foi gerado. NUNCA invente URLs.`);
  } else {
    integrityAlerts.push('🚫 PROPOSTA NÃO GERADA ainda. NÃO mencione ou invente links de proposta.');
  }

  // Alert 3: Value consistency check
  // ═══════════════════════════════════════════════════════════════
  // PHASE "CASO EDSON": If valorLowerBound=true, NEVER ask for exact value or kWh
  // The client said "acima de X" and that's sufficient to proceed
  // ═══════════════════════════════════════════════════════════════
  if (dadosColetados?.valorFatura) {
    if ((dadosColetados as any)?.valorLowerBound) {
      integrityAlerts.push(`💰 VALOR MÍNIMO INFORMADO: R$ ${dadosColetados.valorFatura}+ (cliente disse "acima de X").
🚫 PROIBIDO PEDIR VALOR EXATO OU kWh! O valor mínimo é SUFICIENTE para gerar proposta. SIGA EM FRENTE.`);
    } else {
      integrityAlerts.push(`💰 VALOR CONFIRMADO: R$ ${dadosColetados.valorFatura}. Use APENAS este valor para cálculos e propostas.`);
    }
  }

  // Alert 4: Documents already received - do NOT request again
  const allReceivedDocs: string[] = [];
  if (arquivosAnexados && arquivosAnexados.length > 0) {
    allReceivedDocs.push(...arquivosAnexados);
  }
  if (docsSubmittedViaPage?.documentoIdentidade) allReceivedDocs.push('RG/CNH via link');
  if (docsSubmittedViaPage?.fatura) allReceivedDocs.push('Fatura via link');
  if (docsSubmittedViaPage?.contratoSocial) allReceivedDocs.push('Contrato Social via link');
  
  if (allReceivedDocs.length > 0) {
    integrityAlerts.push(`📄 DOCUMENTOS JÁ RECEBIDOS: ${allReceivedDocs.join(', ')}. NÃO PEÇA novamente!`);
  }

  // Alert 5: REJECTION HISTORY - Critical! Do not restart funnel for rejected leads
  if (rejectionHistory?.wasRejectedBefore) {
    const rejectionLabel = getRejectionLabel(rejectionHistory.rejectionReason);
    const rejectionDateFormatted = rejectionHistory.rejectionDate 
      ? new Date(rejectionHistory.rejectionDate).toLocaleDateString('pt-BR')
      : 'data desconhecida';
    
    integrityAlerts.push(`🚨 LEAD JÁ REJEITADO ANTERIORMENTE!
   📋 Motivo: ${rejectionLabel}
   📅 Data: ${rejectionDateFormatted}
   ⚠️ AÇÃO OBRIGATÓRIA: NÃO reinicie o funil de vendas!
   ⚠️ NÃO peça dados novamente (nome, email, valor, etc.)
   ⚠️ Se o cliente insistir, explique educadamente que a situação não mudou.
   ⚠️ Se a situação DO CLIENTE mudou (ex: mudou de distribuidora, não tem mais tarifa social), ofereça reavaliar.`);
  }

  const integrityBlock = integrityAlerts.length > 0
    ? `\n## INTEGRIDADE (CRÍTICO)\n${integrityAlerts.join('\n')}`
    : '';

  // Objection handling (only if detected)
  const objectionBlock = detectedObjection ? `
🎯 OBJEÇÃO DETECTADA: ${detectedObjection}
Use as técnicas de neutralização carregadas via RAG.` : '';


  // Mode-specific instructions (compact format)
  let modeBlock = '';
  if (sofiaMode === 'closer_premium') {
    modeBlock = `🔥 CLOSER_PREMIUM: Máx 2 linhas | 1 pergunta binária | "${getABClosingPhrase(abVariant)}"`;
  } else if (sofiaMode === 'contract_closer') {
    modeBlock = `📝 CONTRACT_CLOSER: Contrato ClickSign enviado | Verifique recebimento | ${descontoPercentual || 20}% desc.`;
  }

  // Sentiment adaptation (only if detected)
  const sentimentBlock = detectedSentiment ? `
🎭 SENTIMENTO: ${detectedSentiment === 'positive' ? '📗 POSITIVO - Acelere!' : detectedSentiment === 'negative' ? '📕 NEGATIVO - Resolva objeções primeiro!' : '📙 NEUTRO - Engaje mais'}` : '';

  // Client profile adaptation (technical vs simple)
  const clientProfileBlock = clientProfile ? buildClientProfilePromptBlock(clientProfile.profile, clientProfile.confidence) : '';

  // BUILD PASSIVE-FIRST PROMPT (AGENTS.md-style)
  // Order: Retrieval-Led → SOFIA Core → Rule Memory → Few-Shot → RAG → Dynamic Context
  
  const promptSections: string[] = [];
  
  // SECTION 1: Retrieval-Led Reasoning (TOP PRIORITY - forces doc-first behavior)
  if (retrievalLedBlock) {
    promptSections.push(retrievalLedBlock);
  }
  
  // SECTION 2: SOFIA Core (identity + cláusulas pétreas)
  if (sofiaCoreBlock) {
    promptSections.push(sofiaCoreBlock);
  }
  
  // SECTION 3: Rule Memory (learned rules - PASSIVE injection)
  if (ruleMemoryBlock) {
    promptSections.push(ruleMemoryBlock);
  }
  
  // SECTION 4: Few-Shot Examples (P2 - examples from database)
  if (fewShotContent) {
    promptSections.push(fewShotContent);
  }
  
  // SECTION 5: RAG Index (P3 - available knowledge categories)
  if (ragIndexBlock) {
    promptSections.push(ragIndexBlock);
  }
  
  // SECTION 6: RAG Knowledge (document-based context)
  if (ragFirstSection) {
    // ragFirstSection already includes its own minimal heading
    promptSections.push(ragFirstSection);
  }
  
  // SECTION 7: Dynamic Context (client-specific data)
  promptSections.push(`
## CONTEXTO DA CONVERSA
Cliente:${clienteNome || 'N/I'} | Canal:WhatsApp | Funil:${funnelStage?.toUpperCase() || 'COLETA_DADOS'} | Modo:${sofiaMode?.toUpperCase() || 'STANDARD'} | Desc:${descontoPercentual || 20}%
${dataStatus}
${docsStatus}
${integrityBlock}
${buildCompetitorPromptBlock((dadosColetados as Record<string, unknown>) || {})}
${objectionBlock}
${sentimentBlock}
${clientProfileBlock}
${modeBlock}`);

  // SECTION 6: Legacy fallback REMOVIDO (AGENTS.md v3.4)
  // Rule Memory e SOFIA Core já contêm as cláusulas pétreas
  // Economia: ~400 chars

  // SECTION 7: Format Rules COMPACTO (AGENTS.md v3.4)
  // Economia: ~250 chars (de 500 para 250)
  promptSections.push(`
📝 FORMATO: 2-3 linhas | Sem inventar valores | Docs só via link | Áudio→texto auto${agentConfig ? ` | ${buildGuardrailsPrompt(agentConfig.guardrails)}` : ''}

🚨 REGRA ABSOLUTA: NUNCA encerre uma mensagem sem uma pergunta engajadora!
Exemplos: "Ficou claro?", "Posso te ajudar com mais alguma coisa?", "O que você achou?", "Entendeu como funciona?"

💰 COMUNICAÇÃO DE ECONOMIA: Ao apresentar economia, NUNCA diga "20% de desconto na conta".
Diga: "com o plano Economia você economiza R$X por mês" (valor absoluto).
O desconto se aplica apenas ao consumo excedente, não ao valor total da conta.

⏸️ REGRA DE CONTINUIDADE/PAUSA: Se o cliente indicar que precisa sair ou está ocupado
(ex: "preciso dar uma saída", "estou ocupado", "depois volto", "agora não posso"),
responda com empatia: "Sem problema, {nome}! 😊 Quando você voltar, é só me chamar que continuamos de onde paramos. Sua proposta estará te esperando! 💚"`);

  // Join all sections into raw prompt
  let sofiaPrompt = promptSections.join('\n');
  
  // =======================================================================
  // AGENTS.MD COMPLIANCE: Apply context compression if enabled
  // Target: 8KB (PROMPT_SIZE_TARGET_CHARS) with 80% compression ratio
  // =======================================================================
  let compressionStats: { originalLength: number; compressedLength: number; compressionRatio: number } | null = null;
  
  if (ENABLE_CONTEXT_COMPRESSION && sofiaPrompt.length > PROMPT_SIZE_TARGET_CHARS) {
    const compressionResult = compressContext(sofiaPrompt, {
      maxChars: PROMPT_SIZE_TARGET_CHARS,
      preserveSections: ['CLÁUSULAS PÉTREAS', 'RETRIEVAL-LED', 'REGRAS ATIVAS', 'ANTI-ALUCINAÇÃO'],
      aggressiveness: sofiaPrompt.length > 12000 ? 'high' : 'medium',
      removeEmojis: false, // Keep semantic emojis
      abbreviateTerms: true,
      collapseWhitespace: true,
      removeDuplicateLines: true,
    });
    
    compressionStats = {
      originalLength: compressionResult.originalLength,
      compressedLength: compressionResult.compressedLength,
      compressionRatio: compressionResult.compressionRatio,
    };
    
    sofiaPrompt = compressionResult.compressed;
    
    console.log(`[buildSystemPrompt] 📦 AGENTS.md Compression:`, {
      original: `${(compressionResult.originalLength / 1024).toFixed(1)}KB`,
      compressed: `${(compressionResult.compressedLength / 1024).toFixed(1)}KB`,
      ratio: `${(compressionResult.compressionRatio * 100).toFixed(1)}%`,
      techniques: compressionResult.techniques,
    });
  }

  // Calculate prompt size metrics for observability using collector
  const promptSizeCollector = createPromptSizeCollector();
  
  // Record individual sections for detailed breakdown
  if (sofiaCoreBlock) promptSizeCollector.recordSection('sofia_core', sofiaCoreBlock);
  if (retrievalLedBlock) promptSizeCollector.recordSection('retrieval_led', retrievalLedBlock);
  if (ruleMemoryBlock) promptSizeCollector.recordSection('rule_memory', ruleMemoryBlock);
  if (fewShotContent) promptSizeCollector.recordSection('few_shot', fewShotContent);
  if (ragIndexBlock) promptSizeCollector.recordSection('rag_index', ragIndexBlock);
  if (ragContext?.content) promptSizeCollector.recordSection('rag_context', ragContext.content);
  if (docsStatus) promptSizeCollector.recordSection('docs_status', docsStatus);
  promptSizeCollector.measurePrompt(sofiaPrompt, 'final_prompt');
  
  // Get structured metrics
  const promptMetrics = promptSizeCollector.getMetrics();
  const agentIdForMetrics = agentConfig?.agent_id || 'sofia-default';
  
  // Log using observability module
  promptSizeCollector.logMetrics(agentIdForMetrics);
  
  // Detailed log for debugging
  console.log(`[buildSystemPrompt] ✅ PASSIVE-FIRST prompt built:`, {
    // AGENTS.md Compliance
    agentsMdCompliant: promptMetrics.meetsTarget,
    promptSizeKB: (promptMetrics.totalChars / 1024).toFixed(1),
    promptSizeChars: promptMetrics.totalChars,
    estimatedTokens: promptMetrics.totalTokensEstimate,
    targetKB: 8,
    compressionApplied: !!compressionStats,
    compressionRatio: compressionStats ? `${(compressionStats.compressionRatio * 100).toFixed(1)}%` : 'N/A',
    // Section breakdown (top 3)
    topSections: promptMetrics.sections.slice(0, 3).map(s => `${s.name}:${s.chars}`).join('|'),
    // Context components
    retrievalLedEnabled: !!retrievalLedBlock,
    sofiaCoreEnabled: !!sofiaCoreBlock,
    ruleMemoryEnabled: !!ruleMemoryBlock,
    ruleMemoryCount: injectedRulesBlock?.rulesCount || 0,
    fewShotEnabled: !!fewShotContent,
    fewShotCount: fewShotBlock?.examplesCount || 0,
    ragDocs: ragContext?.resultsCount || 0,
    funnelStage,
    sofiaMode,
    hasObjection: !!detectedObjection,
    hasSentiment: !!detectedSentiment,
    clientProfile: clientProfile?.profile || 'none',
    integrityAlerts: integrityAlerts.length,
    hasPropostaId: !!propostaId,
    docsReceived: allReceivedDocs.length,
  });

  return sofiaPrompt;
}

// LEGACY WRAPPER (backward compatibility)

/**
 * Legacy function signature for backward compatibility
 * Converts positional args to params object
 */
export function buildSystemPromptLegacy(
  clienteNome: string | null,
  sofiaMode: SofiaMode,
  abVariant: 'A' | 'B',
  detectedObjection: ObjectionType,
  descontoPercentual?: number,
  funnelStage?: FunnelStage,
  dadosColetados?: ExtractedClientData,
  docsSubmittedViaPage?: DocsSubmittedViaPage,
  detectedSentiment?: 'positive' | 'neutral' | 'negative' | null,
  agentConfig?: FullAgentConfig | null,
  ragContext?: { content: string; resultsCount: number; categories: string[] } | null,
  arquivosAnexados?: string[] | null,
  docsReceivedWhatsApp?: DocsReceivedWhatsApp[] | null,
  propostaId?: string | null,
  rejectionHistory?: RejectionHistory | null,
  clientProfile?: { profile: ClientProfile; confidence: 'high' | 'medium' | 'low' } | null
): string {
  return buildSystemPrompt({
    clienteNome,
    sofiaMode,
    abVariant,
    detectedObjection,
    descontoPercentual,
    funnelStage,
    dadosColetados,
    docsSubmittedViaPage,
    detectedSentiment,
    agentConfig,
    ragContext,
    arquivosAnexados,
    docsReceivedWhatsApp,
    propostaId,
    rejectionHistory,
    clientProfile,
  });
}
