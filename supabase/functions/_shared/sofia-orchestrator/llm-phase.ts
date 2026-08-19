/**
 * LLM PHASE - SOFIA ORCHESTRATOR
 * 
 * Extracted from sofia-webhook/index.ts (Phase 40 refactoring)
 * Handles: History fetch, spam detection, RAG orchestration, prompt building, LLM call
 * 
 * @module _shared/sofia-orchestrator/llm-phase
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.90.0';

// History sanitization
import { prepareHistoryFromMessages, type ConversationMessage } from '../history-sanitizer.ts';

// Spam protection (from greeting-handler)
import { 
  detectSpamPattern, 
  buildContextProtectionPrompt, 
  type SpamDetectionContext, 
  type SpamDetectionResult 
} from '../greeting-handler.ts';

// AI Gym config
import { loadFullAgentConfig, buildFullAIGymPrompt, type FullAgentConfig, type KBSource, type GuardrailsConfig } from '../ai-gym-config.ts';

// Modular prompts
import { orchestrateModularPrompts, type ModularPromptContext, type ModularPromptResult } from '../prompt-modules.ts';

// RAG
import { orchestrateRAGSearch, type RAGOrchestrationContext, type RAGOrchestrationResult, type RAGPromptContext } from '../rag-search-client.ts';

// System prompt
import { buildSystemPrompt, orchestrateClientProfileDetection, type ClientProfileFlowContext, type SystemPromptParams } from '../system-prompt-builder.ts';
import { injectFewShotExamples, type FewShotBlock } from '../few-shot-injector.ts';
import { buildRAGIndex, type RAGIndexResult } from '../rag-index-builder.ts';
import { buildRuleMemoryBlock, type InjectedRulesBlock, type RuleMemoryContext } from '../rule-memory-injector.ts';

// Funnel types
import { type SofiaMode, type FunnelStage } from '../funnel-stage.ts';

// Document handler types  
import { type DocsReceivedWhatsApp } from '../document-handler.ts';

// Context injection
import { injectAllContextSections, type FullContextInjection } from '../prompt-context-injector.ts';

// Rejection history
import { fetchRejectionHistory, type RejectionHistory } from '../rejection-fallback.ts';

// Continuous improvement
import { loadContinuousImprovementConfig, detectBehavioralProfileLegacy, buildProfilePromptBlockLegacy, persistBehavioralProfileLegacy } from '../continuous-improvement.ts';

// LLM client
import { orchestrateLLMFlow, type MediaContext, type LLMFlowContext, type LLMFlowResult } from '../llm-client.ts';

// Sentiment detection (from hesitation.ts)
import { detectFeedbackSentiment as detectFeedbackSentimentShared } from '../hesitation.ts';

// Types from detection patterns
import { type PatternEntry, type ObjectionType } from '../detection-patterns.ts';

// Webhook utilities
import { corsHeaders } from '../webhook-types.ts';

// ═══════════════════════════════════════════════════════════════
// HELPER: Check guardrails escalation
// ═══════════════════════════════════════════════════════════════

function checkGuardrailsEscalation(
  message: string, 
  guardrails: GuardrailsConfig | null
): { needed: boolean; reason: string | null } {
  if (!guardrails) return { needed: false, reason: null };
  const lowerMsg = message.toLowerCase();
  for (const trigger of guardrails.handoff_triggers || []) {
    if (lowerMsg.includes(trigger.toLowerCase())) {
      return { needed: true, reason: `Handoff: ${trigger}` };
    }
  }
  for (const phrase of guardrails.escalation_phrases || []) {
    if (lowerMsg.includes(phrase.toLowerCase())) {
      return { needed: true, reason: `Escalation: ${phrase}` };
    }
  }
  return { needed: false, reason: null };
}

export interface LLMPhaseConversaData {
  id: string;
  dados_coletados?: Record<string, unknown> | null;
  sofia_mode?: string | null;
  proposta_id?: string | null;
  bitrix24_stage?: string | null;
  bitrix24_lead_id?: string | null;
  total_messages?: number | null;
  last_human_message_at?: string | null;
  master_offer_at?: string | null;
  has_simulation?: boolean | null;
  escalation_reason?: string | null;
  human_agent_nome?: string | null;
  arquivos_anexados?: unknown[] | null;
  docs_received_whatsapp?: unknown | null;
  audio_oferecido?: boolean | null;
  needs_human_fallback?: boolean | null;
}

export interface PropostaInfo {
  id: string;
  desconto_percentual?: number | null;
  public_url?: string | null;
}

export interface ExtractedClientData {
  nome?: string | null;
  email?: string | null;
  cpf?: string | null;
  cnpj?: string | null;
  distribuidora?: string | null;
  valorFatura?: number | null;
  consumo?: number | null;
  proposal_url?: string | null;
  public_proposal_url?: string | null;
  [key: string]: unknown;
}

export interface HesitationFlowResult {
  reason?: string | null;
  [key: string]: unknown;
}

export interface ClientProfileResult {
  profile: string;
  score: { technical: number; simple: number };
  confidence: 'high' | 'medium' | 'low';
}

export interface LLMPhaseContext {
  supabase: SupabaseClient;
  conversaId: string;
  phone: string;
  clienteNome: string | null;
  messageText: string;
  effectiveMessageText: string;
  messageId: string | null;
  agentId: string;
  
  // Conversation data
  conversa: LLMPhaseConversaData | null;
  existingDados: ExtractedClientData;
  extractedData: ExtractedClientData;
  propostaInfo: PropostaInfo | null;
  
  // Mode and stage
  finalMode: string;
  funnelStage: string | null;
  abVariant: 'A' | 'B';
  
  // Media flags
  isTranscribedAudio: boolean;
  isAnalyzedImage: boolean;
  isAnalyzedDocument: boolean;
  
  // Detections
  detectedObjection: ObjectionType | null;
  hesitationDetected: boolean;
  hesitationResult: HesitationFlowResult | null;
  docsSubmittedViaPage: boolean;
  
  // Dependencies
  detectionPatterns: Map<string, PatternEntry>;
  lovableApiKey: string;
  
  // Send function
  sendWhatsAppMessage: (phone: string, msg: string) => Promise<void>;
}

export interface LLMPhaseResult {
  handled: boolean;
  response?: Response;
  
  // Results
  assistantMessage: string | null;
  usedModel: string | null;
  systemPrompt: string;
  
  // Loaded config (for downstream use)
  agentConfig: FullAgentConfig;
  history: ConversationMessage[];
  
  // State flags
  spamBlocked: boolean;
  ragUsed: boolean;
  ragCategories: string[];
  
  // Context for next phases
  lastAssistantMsg: string | null;
  clientProfileResult: ClientProfileResult | null;
  rejectionHistory: RejectionHistory | null;
  detectedSentiment: string | null;
  ragContextForPrompt: RAGPromptContext | null;
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Should execute this phase
// ═══════════════════════════════════════════════════════════════

export function shouldExecuteLLMPhase(): boolean {
  // Always execute if we reach this phase (previous phases didn't handle)
  return true;
}

// ═══════════════════════════════════════════════════════════════
// MAIN FUNCTION
// ═══════════════════════════════════════════════════════════════

export async function executeLLMPhase(ctx: LLMPhaseContext): Promise<LLMPhaseResult> {
  const {
    supabase, conversaId, phone, clienteNome, messageText, effectiveMessageText,
    agentId, conversa, existingDados, extractedData, propostaInfo,
    finalMode, funnelStage, abVariant,
    isTranscribedAudio, isAnalyzedImage, isAnalyzedDocument,
    detectedObjection, hesitationDetected, hesitationResult, docsSubmittedViaPage,
    detectionPatterns, lovableApiKey, sendWhatsAppMessage,
  } = ctx;
  
  console.log(`[LLM_PHASE] Starting for conversa: ${conversaId}`);
  
  // ═══════════════════════════════════════════════════════════════
  // 1. HISTORY FETCH + SPAM DETECTION
  // ═══════════════════════════════════════════════════════════════
  const { data: mensagens } = await supabase
    .from('chatbot_mensagens')
    .select('role, content, created_at')
    .eq('conversa_id', conversaId)
    .order('created_at', { ascending: false })
    .limit(15);
  
  const recentAssistantMessages = (mensagens || [])
    .filter((m: { role: string }) => m.role === 'assistant')
    .slice(0, 10);
  
  const spamDetectionCtx: SpamDetectionContext = {
    conversaId,
    recentAssistantMessages: recentAssistantMessages.map((m: { content: string; created_at: string }) => ({
      content: m.content,
      created_at: m.created_at,
    })),
    messageSpamThreshold: 5,
    timeWindowSeconds: 60,
  };
  
  const spamResult = detectSpamPattern(spamDetectionCtx);
  
  if (spamResult.isSpamDetected && spamResult.shouldBlockLLM) {
    console.log(`[LLM_PHASE] ⚠️ Spam detected and blocked: ${spamResult.spamCount} messages`);
    
    const cooldownMessage = 'Desculpe pela instabilidade! 😅 O sistema já está atualizando suas informações. Como posso ajudar?';
    await sendWhatsAppMessage(phone, cooldownMessage);
    
    await supabase.from('chatbot_mensagens').insert({
      conversa_id: conversaId,
      role: 'assistant',
      content: cooldownMessage,
    });
    
    return {
      handled: true,
      response: new Response(JSON.stringify({
        status: 'spam_blocked',
        conversaId,
        spamCount: spamResult.spamCount,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }),
      assistantMessage: cooldownMessage,
      usedModel: null,
      systemPrompt: '',
      agentConfig: {} as FullAgentConfig,
      history: [],
      spamBlocked: true,
      ragUsed: false,
      ragCategories: [],
      lastAssistantMsg: null,
      clientProfileResult: null,
      rejectionHistory: null,
      detectedSentiment: null,
      ragContextForPrompt: null,
    };
  }
  
  // ═══════════════════════════════════════════════════════════════
  // 2. HISTORY SANITIZATION
  // ═══════════════════════════════════════════════════════════════
  const history = prepareHistoryFromMessages(
    (mensagens || []).slice(0, 10) as Array<{ role: string; content: string }>
  );
  console.log(`[LLM_PHASE] History prepared: ${history.length} messages`);
  
  const lastAssistantMsg = recentAssistantMessages[0]?.content || null;
  
  // ═══════════════════════════════════════════════════════════════
  // 3. SENTIMENT DETECTION
  // ═══════════════════════════════════════════════════════════════
  const descontoPercentual = propostaInfo?.desconto_percentual || undefined;
  
  const detectedSentimentResult = funnelStage === 'proposta_inicial_enviada' 
    ? detectFeedbackSentimentShared(messageText, detectionPatterns) 
    : null;
  const detectedSentiment = detectedSentimentResult?.sentiment || null;
  
  if (detectedSentiment) {
    console.log(`[LLM_PHASE] Detected feedback sentiment: ${detectedSentiment}`);
  }
  
  // ═══════════════════════════════════════════════════════════════
  // 4. LOAD AI GYM CONFIG + MODULAR PROMPTS
  // ═══════════════════════════════════════════════════════════════
  const agentConfig = await loadFullAgentConfig(supabase, agentId);
  const aiGymPromptSection = buildFullAIGymPrompt(agentConfig);
  
  const modularPromptCtx: ModularPromptContext = {
    supabase,
    agentId,
    variables: {
      clienteNome: clienteNome || '',
      descontoPercentual: descontoPercentual || 20,
      distribuidora: extractedData.distribuidora || '',
      valorFatura: String(extractedData.valorFatura || ''),
      consumo: String(extractedData.consumo || ''),
      email: extractedData.email || '',
      funnelStage: funnelStage || 'coleta_dados',
      agentName: agentConfig.name || 'sofIA',
    },
  };
  
  const modularPromptResult = await orchestrateModularPrompts(modularPromptCtx);
  const modularPromptSection = modularPromptResult.promptSection;
  
  console.log(`[LLM_PHASE] Agent: ${agentId}, config: ${agentConfig.name}, KB sources: ${agentConfig.kb_sources.filter((kb: KBSource) => kb.enabled).length}`);
  
  // Check guardrails escalation
  const guardrailsEscalation = checkGuardrailsEscalation(messageText, agentConfig.guardrails);
  if (guardrailsEscalation.needed) {
    console.log(`[LLM_PHASE] ⚠️ Guardrails escalation: ${guardrailsEscalation.reason}`);
  }
  
  // ═══════════════════════════════════════════════════════════════
  // 5. RAG ORCHESTRATION
  // ═══════════════════════════════════════════════════════════════
  const ragOrchestrationCtx: RAGOrchestrationContext = {
    supabase,
    agentId,
    messageText,
    conversaId,
    detectionPatterns,
    funnelStage: funnelStage || undefined,
  };
  
  const ragOrchestrationResult: RAGOrchestrationResult = await orchestrateRAGSearch(ragOrchestrationCtx);
  const ragContextForPrompt: RAGPromptContext | null = ragOrchestrationResult.ragContextForPrompt;
  const ragUsed = !ragOrchestrationResult.skipped;
  const ragCategories = ragOrchestrationResult.coveredSections || [];
  
  // ═══════════════════════════════════════════════════════════════
  // 6. REJECTION HISTORY
  // ═══════════════════════════════════════════════════════════════
  let rejectionHistory: RejectionHistory | null = null;
  try {
    rejectionHistory = await fetchRejectionHistory(supabase, conversaId);
    if (rejectionHistory.wasRejectedBefore) {
      console.log(`[LLM_PHASE] 🚨 Rejection history: ${rejectionHistory.rejectionReason}`);
    }
  } catch (err) {
    console.warn('[LLM_PHASE] Failed to fetch rejection history:', err);
  }
  
  // ═══════════════════════════════════════════════════════════════
  // 7. CLIENT PROFILE DETECTION
  // ═══════════════════════════════════════════════════════════════
  const profileFlowCtx: ClientProfileFlowContext = {
    messageText,
    history,
    extractedData: extractedData as Record<string, unknown>,
    patterns: detectionPatterns,
  };
  
  const profileFlowResult = orchestrateClientProfileDetection(profileFlowCtx);
  const clientProfileResult: ClientProfileResult = {
    profile: profileFlowResult.profile,
    score: profileFlowResult.score,
    confidence: profileFlowResult.confidence,
  };
  Object.assign(extractedData, profileFlowResult.updatedExtractedData);
  
  if (clientProfileResult.score.technical > 0 || clientProfileResult.score.simple > 0) {
    console.log(`[LLM_PHASE] 🎯 Client profile: ${clientProfileResult.profile} (confidence: ${clientProfileResult.confidence})`);
  }
  
  // ═══════════════════════════════════════════════════════════════
  // 8. FEW-SHOT EXAMPLES INJECTION (AGENTS.md P2)
  // ═══════════════════════════════════════════════════════════════
  let fewShotBlock: FewShotBlock | null = null;
  try {
    fewShotBlock = await injectFewShotExamples(
      supabase, 
      agentId, 
      funnelStage || 'triagem',
      { maxExamples: 3, minQualityScore: 70, compactFormat: true }
    );
    if (fewShotBlock.examplesCount > 0) {
      console.log(`[LLM_PHASE] 📚 Few-shot injected: ${fewShotBlock.examplesCount} examples (${fewShotBlock.charCount} chars)`);
    }
  } catch (err) {
    console.warn('[LLM_PHASE] Failed to inject few-shot examples:', err);
  }
  
  // ═══════════════════════════════════════════════════════════════
  // 8.5. RAG INDEX (AGENTS.md P3 - Available Knowledge Categories)
  // ═══════════════════════════════════════════════════════════════
  let ragIndexResult: RAGIndexResult | null = null;
  try {
    ragIndexResult = await buildRAGIndex(supabase, agentId, {
      includeLabels: true,
      includeCounts: false, // Keep compact
      minDocsThreshold: 1,
    });
    if (ragIndexResult.categories.length > 0) {
      console.log(`[LLM_PHASE] 📚 RAG Index: ${ragIndexResult.categories.length} categories, ${ragIndexResult.totalDocs} docs (cached: ${ragIndexResult.wasCached})`);
    }
  } catch (err) {
    console.warn('[LLM_PHASE] Failed to build RAG index:', err);
  }

  // ═══════════════════════════════════════════════════════════════
  // 8.6. RULE MEMORY INJECTION (PASSIVE) — CRITICAL FOR ANTI-HALLUCINATION
  // ═══════════════════════════════════════════════════════════════
  let injectedRulesBlock: InjectedRulesBlock | null = null;
  try {
    const valorFaturaNormalized = (extractedData.valorFatura ?? (extractedData as any).valor_fatura ?? null) as number | null;

    const ruleContext: RuleMemoryContext = {
      funnelStage: funnelStage || undefined,
      hasProposal: !!(conversa?.proposta_id || propostaInfo?.id),
      detectedObjection: detectedObjection || undefined,
      clientDistribuidora: extractedData.distribuidora || undefined,
      valorFatura: valorFaturaNormalized || undefined,
    };

    injectedRulesBlock = await buildRuleMemoryBlock(supabase, agentId, ruleContext, {
      maxRules: 15,
      minPriority: 0,
      includeExpired: false,
      filterByContext: true,
      compressDescriptions: true,
      maxDescriptionLength: 80,
    });

    if (injectedRulesBlock.rulesCount > 0) {
      console.log(`[LLM_PHASE] 🧠 Rule memory injected: ${injectedRulesBlock.rulesCount} rules (${injectedRulesBlock.charCount} chars)`);
    }
  } catch (err) {
    console.warn('[LLM_PHASE] Failed to build rule memory block:', err);
  }
  
  // ═══════════════════════════════════════════════════════════════
  // 9. BUILD SYSTEM PROMPT
  // ═══════════════════════════════════════════════════════════════
  // RACE CONDITION MITIGATION: Fresh re-read of dados_coletados immediately before
  // building the prompt to ensure we have the latest data from parallel webhooks
  // This prevents Sofia from asking for data already collected in recent turns
  // ═══════════════════════════════════════════════════════════════
  let freshExistingDados = existingDados;
  try {
    const { data: freshConversaData } = await supabase
      .from('chatbot_conversas')
      .select('dados_coletados, cliente_nome')
      .eq('id', conversaId)
      .single();
    
    if (freshConversaData?.dados_coletados) {
      freshExistingDados = freshConversaData.dados_coletados as ExtractedClientData;
      console.log('[LLM_PHASE] 🔄 Fresh re-read of dados_coletados applied (race condition mitigation)');
    }
  } catch (rereadErr) {
    console.warn('[LLM_PHASE] Failed to re-read dados_coletados:', rereadErr);
  }
  
  // CRITICAL FIX: Merge fresh existingDados + extractedData for complete context
  const mergedDadosForPrompt = { ...freshExistingDados, ...extractedData };
  
  let systemPrompt = buildSystemPrompt({
    clienteNome,
    sofiaMode: finalMode,
    abVariant,
    detectedObjection,
    descontoPercentual,
    funnelStage: funnelStage || undefined,
    dadosColetados: mergedDadosForPrompt as any,  // ✅ MERGED DATA - not just extractedData
    docsSubmittedViaPage: docsSubmittedViaPage as any,
    detectedSentiment,
    agentConfig,
    ragContext: ragContextForPrompt ? {
      content: ragContextForPrompt.content || '',
      resultsCount: ragContextForPrompt.resultsCount || 0,
      categories: ragContextForPrompt.categories || [],
    } : null,
    arquivosAnexados: conversa?.arquivos_anexados as string[] | null,
    docsReceivedWhatsApp: conversa?.docs_received_whatsapp as any,
    propostaId: conversa?.proposta_id as string | null,
    rejectionHistory,
    clientProfile: { profile: clientProfileResult.profile as any, confidence: clientProfileResult.confidence },
    injectedRulesBlock,
    fewShotBlock,
    ragIndexResult,  // AGENTS.md P3: RAG categories index
  } as any);
  
  // ═══════════════════════════════════════════════════════════════
  // 9. CONTEXT INJECTION
  // ═══════════════════════════════════════════════════════════════
  const wasRecentlyResolvedByHuman = (existingDados as Record<string, unknown>).human_intervention_completed === true || 
                                      (existingDados as Record<string, unknown>).context_restored_at !== undefined;
  
  if (wasRecentlyResolvedByHuman) {
    console.log('[LLM_PHASE] Adding post-human context preservation');
  }
  
  const contextInjection: FullContextInjection = {
    postHuman: {
      wasRecentlyResolvedByHuman,
      escalationReason: conversa?.escalation_reason as string | null,
      humanAgentName: conversa?.human_agent_nome as string | null,
      existingDistribuidora: extractedData.distribuidora || (existingDados as Record<string, unknown>).concessionaria as string | null,
      existingValorFatura: extractedData.valorFatura || (existingDados as Record<string, unknown>).valorFatura as number | null,
      existingEmail: extractedData.email || (existingDados as Record<string, unknown>).email as string | null,
      existingNome: extractedData.nome || clienteNome || null,
    },
    assistedMode: {
      needsHumanFallback: conversa?.needs_human_fallback as boolean,
      sofiaMode: conversa?.sofia_mode as string | null,
    },
    hesitation: {
      hesitationDetected,
      hesitationReason: hesitationResult?.reason || null,
    },
    antiRepetition: null,
    modularPromptContent: modularPromptSection,
    aiGymPromptSection,
  };
  
  systemPrompt = injectAllContextSections(systemPrompt, contextInjection);
  
  // ═══════════════════════════════════════════════════════════════
  // 10. BEHAVIORAL PROFILE INJECTION (Continuous Improvement)
  // ═══════════════════════════════════════════════════════════════
  const ciConfig = await loadContinuousImprovementConfig();
  
  if (ciConfig.behavioralProfileEnabled && history.length > 0) {
    const behavioralProfile = detectBehavioralProfileLegacy(history);
    
    if (behavioralProfile.confidence >= 0.3) {
      const profileBlock = buildProfilePromptBlockLegacy(behavioralProfile);
      
      if (profileBlock.enabled) {
        systemPrompt = profileBlock.block + '\n' + systemPrompt;
        console.log(`[LLM_PHASE] Injected ${behavioralProfile.dominant} profile (conf: ${(behavioralProfile.confidence * 100).toFixed(0)}%)`);
        
        // Persist profile asynchronously
        persistBehavioralProfileLegacy(phone, behavioralProfile, conversaId).catch(() => {});
      }
    }
  }
  
  // ═══════════════════════════════════════════════════════════════
  // 11. SPAM CONTEXT PROTECTION
  // ═══════════════════════════════════════════════════════════════
  if (spamResult.isSpamDetected && spamResult.contextProtectionNote) {
    const contextProtectionPrompt = buildContextProtectionPrompt(spamResult, lastAssistantMsg);
    systemPrompt = contextProtectionPrompt + '\n\n' + systemPrompt;
    console.log('[LLM_PHASE] Injected spam context protection');
  }
  
  // ═══════════════════════════════════════════════════════════════
  // 12. LLM CALL
  // ═══════════════════════════════════════════════════════════════
  const mediaCtx: MediaContext = {
    isTranscribedAudio,
    isAnalyzedImage,
    isAnalyzedDocument,
    messageText: effectiveMessageText,
  };
  
  const llmFlowCtx: LLMFlowContext = {
    systemPrompt,
    history,
    mediaContext: mediaCtx,
    agentPersona: agentConfig?.persona as { llm_model?: string } | null,
    apiKey: lovableApiKey || '',
  };
  
  const llmFlowResult = await orchestrateLLMFlow(llmFlowCtx);
  
  console.log(`[LLM_PHASE] LLM call complete. Model: ${llmFlowResult.usedModel}, Response length: ${llmFlowResult.assistantMessage?.length || 0}`);
  
  return {
    handled: false,
    assistantMessage: llmFlowResult.assistantMessage,
    usedModel: llmFlowResult.usedModel,
    systemPrompt,
    agentConfig,
    history,
    spamBlocked: false,
    ragUsed,
    ragCategories,
    lastAssistantMsg,
    clientProfileResult,
    rejectionHistory,
    detectedSentiment,
    ragContextForPrompt,
  };
}
