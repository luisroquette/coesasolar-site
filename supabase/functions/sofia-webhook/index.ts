import { createClient } from "npm:@supabase/supabase-js@2.90.0";
import { loadAgentPromptModules, buildModularPrompt, orchestrateModularPrompts, type ModularPromptContext, type ModularPromptResult } from '../_shared/prompt-modules.ts';
import { extractAssistantText } from '../_shared/text-extraction.ts';
import {
  normalizePhoneNumber, generatePhoneVariations, findConversationByPhoneVariations,
  cleanupDuplicateConversations, checkForDiscardedLead, formatPhoneForDisplay, extractPhoneFromText,
  isLidPhone, saveLidPhoneMapping,
  type DiscardedLeadCheck, type CleanupResult,
} from '../_shared/utils/phone-utils.ts';
import {
  buildSystemPrompt as buildSystemPromptShared, buildSystemPromptLegacy,
  detectClientProfile, buildClientProfilePromptBlock, orchestrateClientProfileDetection,
  type ClientProfile, type ClientProfileScore, type RAGContext, type SystemPromptParams,
  type ClientProfileFlowContext, type ClientProfileFlowResult,
} from '../_shared/system-prompt-builder.ts';
import {
  handleMariaIdentificationFlow, extractCpfCnpjFromMessage, detectEscalationKeywords,
  detectNewSaleIntent, formatCpfCnpjForDisplay,
  type MariaIdentificationState, type MariaIdentificationResult, type MariaTriageConfig, type DivergenceEntry,
} from '../_shared/maria-sac-flow.ts';
import {
  transcribeAudio as transcribeAudioShared, analyzeImage as analyzeImageShared,
  analyzePDF as analyzePDFShared, isEnergyInvoice as isEnergyInvoiceFromMedia,
  type MediaAnalysisResult as MediaAnalysisResultFromMedia,
} from '../_shared/media-handler.ts';
import {
  processMediaMessage,
  type MediaProcessingResult, type SofiaCapabilities as MediaSofiaCapabilities,
} from '../_shared/media-message-processor.ts';
import { 
  loadDetectionPatterns as loadDetectionPatternsShared, matchesPatternCategory, hasHighIntent,
  detectObjection, getPatternCache, getObjectionResponseText, getABClosingPhrase,
  type PatternEntry, type ObjectionType
} from '../_shared/detection-patterns.ts';
import {
  detectHotLead, processHotLeadDetection, buildHotLeadPayload,
  type HotLeadDetectionResult, type HotLeadAlertPayload,
} from '../_shared/hot-lead-detection.ts';
import { getModelsForAgent, DEFAULT_MODELS, callAIWithModelLegacy, callAIWithModels, buildMessagesForLLM, orchestrateLLMFlow, type MediaContext, type LLMFlowContext, type LLMFlowResult } from '../_shared/llm-client.ts';
import { loadDisqualificationMessages, getClientMessage, buildCRMComment } from '../_shared/disqualification-messages.ts';
import { detectGrupoA, detectTarifaSocial } from '../_shared/disqualification-rules.ts';
import {
  loadFullAgentConfig as loadFullAgentConfigShared, buildKnowledgeBasePrompt,
  buildPersonaPrompt, buildGuardrailsPrompt, buildCollectionRulesPrompt, buildFullAIGymPrompt, isToolEnabled,
  type FullAgentConfig, type KBSource, type PersonaConfig, type GuardrailsConfig, type ToolConfig, type CollectionRules, type TriageConfig,
} from '../_shared/ai-gym-config.ts';
import { checkMessageDeduplication, type DeduplicationResult } from '../_shared/message-deduplication.ts';
import {
  executePreLLMHardStops,
  handleDiscardFromHardStop,
  interceptDocumentRequest,
  type HardStopResult,
  type HardStopContext,
} from '../_shared/pre-llm-hard-stops.ts';

// Phase 74+ Orchestrator modules (webhook reduction)
import {
  executeWebhookInitialization,
  parseWebhookBody,
  type WebhookInitializationContext,
  type WebhookInitializationResult,
} from '../_shared/sofia-orchestrator/webhook-initialization-phase.ts';
import {
  executeAgentLockPhase,
  checkAgentStatusRealtime,
  acquireCrossWebhookLockWithRetry,
  releaseCrossWebhookLock,
  saveMessageWhileInactive,
  type AgentLockPhaseContext,
  type AgentLockPhaseResult,
} from '../_shared/sofia-orchestrator/agent-lock-phase.ts';
import {
  executeConversationLifecyclePhase,
  needsHumanFallbackLog,
  type ConversationLifecycleContext,
  type ConversationLifecycleResult,
  type ConversaData,
} from '../_shared/sofia-orchestrator/conversation-lifecycle-phase.ts';
import {
  executeGlobalPausePhase,
  checkGlobalPauseStatus,
  type GlobalPauseContext,
  type GlobalPauseResult,
} from '../_shared/sofia-orchestrator/global-pause-phase.ts';
import {
  executeGreetingPhase,
  isFirstContactMessage,
  type GreetingPhaseContext,
  type GreetingPhaseResult,
} from '../_shared/sofia-orchestrator/greeting-phase.ts';
import {
  handlePostGreetingResponse,
  isAwaitingPostGreetingResponse,
  type PostGreetingContext,
  type PostGreetingResult,
} from '../_shared/sofia-orchestrator/post-greeting-handler.ts';
import {
  executeMessageBufferPhase,
  type MessageBufferContext,
  type MessageBufferResult,
} from '../_shared/sofia-orchestrator/message-buffer-phase.ts';
import {
  executeMediaProcessingPhase,
  type MediaProcessingContext,
  type MediaProcessingPhaseResult,
} from '../_shared/sofia-orchestrator/media-processing-phase.ts';
import {
  executeLeadProcessingPhase,
  processHotLeadFlow,
  saveIncomingMessageWithContext,
  getMediaMessagePrefix,
  shouldCreateBitrixLead,
  type LeadProcessingPhaseContext,
  type LeadProcessingPhaseResult,
} from '../_shared/sofia-orchestrator/lead-processing-phase.ts';
import {
  executeIntakeLayer,
  persistOutboundMessage,
  type IntakeContext,
  type IntakeResult,
} from '../_shared/sofia-orchestrator/intake-layer.ts';
import {
  executeFunnelContextPhase,
  calculateScores,
  fetchProposalContext,
  determineFunnelContext,
  executeHesitationFlow,
  type FunnelContextPhaseContext,
  type FunnelContextPhaseResult,
} from '../_shared/sofia-orchestrator/funnel-context-phase.ts';
import {
  executeResponseFinalizationPhase,
  processAIResponseWithContext,
  applyGuardrailsFlow,
  checkRaceCondition,
  extractProposalUrl,
  type ResponseFinalizationContext,
  type ResponseFinalizationResult,
} from '../_shared/sofia-orchestrator/response-finalization-phase.ts';
import {
  buildFSMContext, executeFSMCheck, FunnelState, FSM_STATE_LABELS,
  type FSMContext, type FSMCheckResult, type TransitionConditions,
} from '../_shared/guided-script-fsm.ts';
import {
  createFSMObserver,
  logFSMConditionsSnapshot,
  type FSMObserver,
} from '../_shared/fsm-observability.ts';
import {
  handleHumanCooldown, handleDiscountObjectionFlow, handleEconomyConfirmationFlow,
  orchestratePreAIFlows,
  type HumanCooldownContext, type DiscountObjectionContext, type EconomyConfirmationContext,
  type PreAIFlowContext, type PreAIFlowResult,
} from '../_shared/confirmation-handlers.ts';
import {
  injectAllContextSections, type FullContextInjection,
  type PostHumanContext, type AssistedModeContext, type HesitationModeContext,
} from '../_shared/prompt-context-injector.ts';
import {
  processAIResponse, appendProposalUrlIfMissing,
  type FullResponseProcessingContext, type FullResponseProcessingResult,
} from '../_shared/response-processing.ts';
import {
  isValidCPF, isValidCNPJ, detectMalformedEmail, checkEmailConfirmation, removeNonNumeric,
  type MalformedEmailResult,
} from '../_shared/validation-utils.ts';
import {
  detectProposalDelayComplaint, detectTechnicalIssue as detectTechnicalIssueShared, handleTechnicalIssueFlow,
  type TechnicalIssueType, type TechIssueFlowResult,
} from '../_shared/technical-issues.ts';
import { type BillingCategory } from '../_shared/billing-education.ts';
import { type SimulationResult } from '../_shared/economy-simulator.ts';
import {
  detectHesitationFull, detectFeedbackSentiment as detectFeedbackSentimentShared,
  orchestrateHesitationFlow,
  type HesitationType, type HesitationDetection, type FeedbackSentiment,
  type HesitationFlowContext, type HesitationFlowResult,
} from '../_shared/hesitation.ts';
import { handleMasterOfferFlow, type MasterOfferContext, type MasterOfferFlowResult } from '../_shared/master-offer-handler.ts';
import { handleDisqualificationFlow, type DisqualificationFlowResult } from '../_shared/disqualification-flow.ts';
import { applyAllGuards, orchestrateGuardrailsFlow, type GuardContext, type GuardResult, type GuardrailsFlowContext, type GuardrailsFlowResult } from '../_shared/llm-guardrails.ts';
import { handleRejectionFallback, fetchRejectionHistory, type RejectionFallbackContext, type RejectionHistory, type RejectionType } from '../_shared/rejection-fallback.ts';
import { orchestrateFullEscalation, type FullEscalationContext } from '../_shared/escalation.ts';
import {
  orchestrateAudioSending, processAudioPreference,
  uploadAudioToStorage as uploadAudioToStorageShared, sendWhatsAppAudioViaZApi, sendVoiceMessageComplete,
  getSofiaAudioSettings, getSofiaCapabilities, isAudioGloballyEnabled,
  type AudioOrchestrationContext, type AudioOrchestrationResult,
  type AudioPreferenceContext, type AudioPreferenceResult,
  type SofiaAudioSettings, type SofiaCapabilities,
} from '../_shared/audio-handler.ts';
import {
  handleProposalPromiseFlow, type ProposalPromiseContext, type ProposalPromiseResult,
} from '../_shared/proposal-promise-flow.ts';
import {
  updateConversationAfterResponse, type ConversationUpdateContext, type CRMContactData as ConversationCRMContactData,
} from '../_shared/conversation-update.ts';
import {
  checkAndResendExistingProposal, isRequestingExistingProposal,
  type ProposalResendResult,
} from '../_shared/proposal-resend.ts';
import {
  detectTriagemCategory, detectExistingClientIntent, detectNonCommercialIntentAI, detectExistingClientIntentFull,
  checkTriagemResponse, getDepartmentContactId, getDepartmentDisplayName, getCoesaContact, formatWhatsAppLink,
  generateDepartmentSelectionMessage, generateReturnToCommercialMessage, generateRedirectToMariaMessage,
  resolveContextualIntent, generateClarificationQuestion,
  type TriagemState, type TriagemDepartment, type TriagemCategory, type TriagemContext,
  type ExistingClientDetection, type TriagemResponse, type CoesaContact,
} from '../_shared/maria-triage.ts';

import {
  getZApiCredentials, sendWhatsAppMessage as sendWhatsAppMessageShared,
  sendWhatsAppAudio as sendWhatsAppAudioShared, checkConversationStillActive as checkConversationStillActiveShared,
  safeSendWhatsAppMessage as safeSendWhatsAppMessageShared, saveContactToWhatsApp as saveContactToWhatsAppShared,
  stripAudioAnnouncement, sendTypingIndicatorWithAgent,
  type ZApiCredentials, type AgentZApiConfig,
} from '../_shared/zapi-client.ts';
import {
  orchestrateMessageBuffer,
  waitForBufferReady,
  clearBuffer,
  type BufferOrchestrationResult,
} from '../_shared/message-buffer.ts';
import {
  loadLatencyConfig,
  applyFullHumanization,
  type LatencyConfig,
} from '../_shared/humanized-latency.ts';
import {
  generateVoiceAudio as generateVoiceAudioShared, sanitizeTextForTTS, shortenForTTS,
  arrayBufferToBase64, registerElevenLabsFallback, type TTSResult, type TTSConfig,
} from '../_shared/tts-client.ts';
import {
  RESET_COMMAND, STATUS_COMMAND, PING_COMMAND, VOICE_COMMAND, HELP_COMMAND,
  RETURN_TO_SOFIA_COMMANDS, TAKEOVER_COMMANDS, HUMAN_COOLDOWN_MS,
  parseOperatorCommand, isOperatorCommand, isFromOperator as isFromOperatorShared,
  generateHelpMessage, generateTakeoverConfirmation, generateReturnConfirmation, generateBulkReturnConfirmation,
  generateFarewellMessage, generateReturnMessage, generateNotFoundMessage, generateNoEscalatedMessage,
  generateSupervisorNotification, preserveContextAfterHumanIntervention, calculateResolutionTime, isInHumanCooldown,
  buildPingResponse, buildVoiceTestText, buildVoiceSuccessMessage, buildVoiceFailureMessage, buildHelpMessage,
  executeTakeoverDbUpdates, executeReturnToSofiaDbUpdates, updateAttendantResolutionMetrics, logOperatorCommand,
  handlePausedConversationMessage, checkFreshConversationState, detectTakeoverByHistory,
  getOperatorTakeoverMessage as getOperatorTakeoverMessageFromCommands,
  executeResetCommand, executeStatusCommand,
  // Phase 59: Consolidated phone-based command flows
  executeTakeoverByPhone, executeReturnByPhone, executeBulkReturn, executeTakeoverInChat,
  type OperatorCommand, type OperatorCommandType, type AttendantInfo, type CommandResult,
  type PingContext, type TakeoverContext, type ReturnToSofiaContext, type ResetCommandResult, type StatusCommandResult,
  type TakeoverDetectionParams, type TakeoverDetectionResult, type PauseCheckResult,
  type TakeoverByPhoneResult, type ReturnByPhoneResult, type BulkReturnResult, type TakeoverInChatResult,
} from '../_shared/operator-commands.ts';
import {
  detectDocumentType, isEnergyInvoice, verificarDocumentosCompletos, getDocumentReceivedMessage,
  createDocTrackingEntry, updateDocsReceivedWhatsApp, getMimeTypeFromUrl, validateDocumentSize, getOversizedDocumentMessage,
  type DocumentType, type FileType, type DocumentCheckResult, type MediaAnalysisResult,
  type DocsSubmittedViaPage as DocsSubmittedViaPageHandler, type DocsReceivedWhatsApp,
} from '../_shared/document-handler.ts';
import {
  processDocumentCollectionFlow, handleTipoInstalacaoResponse, isInDocumentCollectionStage,
  compararDadosExtraidos, gerarMensagemDivergencias, formatDivergenceValue, detectTipoInstalacao, getTipoInstalacaoQuestion,
  type DocumentCollectionParams, type DocumentCollectionResult, type TipoInstalacaoResult,
  type ConversaDocumentData, type DadoDivergente,
} from '../_shared/document-collection-flow.ts';
import {
  extractBillValue, extractConsumption, extractCPF, extractCNPJ, extractName, extractEmail, extractCEP,
  detectAmbiguousValue, checkValueConfirmation, parseInvoiceAnalysis, extractDataFromText, extractInstallationType,
  type ExtractedClientData, type AmbiguityType, type AmbiguousValueResult,
  type PendingValueConfirmation, type PendingEmailConfirmation,
} from '../_shared/data-extraction.ts';
import {
  determineFunnelStage, determineSofiaMode, hasMinimumDataForProposal, getMissingDataForProposal,
  getABVariant, calculateNextFollowup, detectProposalPromise, detectProposalAcceptance,
  fetchProposalInfo, fetchDocsSubmittedViaPage, calculateMessageScore,
  FUNNEL_STAGE_LABELS, SOFIA_MODE_LABELS,
  type FunnelStage, type SofiaMode, type ProposalInfo, type DocsSubmittedViaPage, type ScoreBreakdown,
} from '../_shared/funnel-stage.ts';
import {
  syncToBitrix, handleProposalDelayComplaint as handleProposalDelayComplaintShared, syncContactToCRM,
  buildCRMContactData, SOFIA_SYSTEM_USER_ID, orchestrateBitrixSyncFlow,
  type SyncToBitrixResult, type AutoRescueResult, type CRMContactData, type BitrixSyncFlowContext,
} from '../_shared/bitrix-sync.ts';

import {
  handleTriageFlow, checkTriageLock as checkTriageLockShared, NEW_SALE_KEYWORDS, wantsNewSale,
  checkAgentTriageRules, handleMariaToSofiaRedirect, shouldSkipTriageCheck, startTriageFlow,
  handleContextualResponse,
  type TriageFlowParams, type TriageFlowResult, type TriageLockResult, type AgentTriageRulesResult,
  type MariaRedirectParams, type MariaRedirectResult, type TriageSkipCheckParams, type TriageSkipResult,
  type StartTriageParams, type StartTriageResult,
} from '../_shared/triage-flow.ts';
import {
  createConversation, getOrCreateConversation, resetNudgeState, saveIncomingMessage, buildConversaSnapshot,
  type ConversaSnapshot, type CreateConversationParams, type CreateConversationResult, type GetOrCreateResult,
  type SofiaMode as ConversationSofiaMode, type ABVariant as ConversationABVariant,
} from '../_shared/conversation-manager.ts';
import {
  persistCriticalFields, logSpecialDetections, resetPauseFollowupIfNeeded, inferValueFromNumericMessage, CRITICAL_FIELDS,
  type ExtractedClientData as PersistenceExtractedData, type CriticalPersistenceResult,
} from '../_shared/data-persistence.ts';
import { processAllFastPaths, type FastPathContext, type FastPathResult, handleCRMStageFastPath } from '../_shared/fast-path-handlers.ts';
import { executeCRMPreCheck, CRMLeadContext, getBitrixWebhookUrl } from '../_shared/crm-precheck.ts';
import { processAllConfirmations, type ConfirmationContext, type ConfirmationResult } from '../_shared/confirmation-handlers.ts';
import { sendProposalLink, handleProposalCreated, type ProposalLinkContext } from '../_shared/proposal-link-sender.ts';
import {
  fetchAndPrepareHistory, sanitizeMessage, prepareHistoryFromMessages, type ConversationMessage,
} from '../_shared/history-sanitizer.ts';
import {
  loadContinuousImprovementConfig,
  detectBehavioralProfileLegacy,
  buildProfilePromptBlockLegacy,
  persistBehavioralProfileLegacy,
  loadPersistedProfileLegacy,
  captureTakeoverFeedbackLegacy,
  parseCorrectionCommandLegacy,
  handleCorrectionCommandLegacy,
  evaluateResponseLegacy,
  orchestrateContinuousImprovement,
  type LegacyBehavioralProfile,
  type ProfilePromptBlock,
  type ContinuousImprovementConfig,
} from '../_shared/continuous-improvement.ts';
import {
  orchestrateTypoFlow, processContextAnalysisResult,
  type TypoFlowContext, type TypoFlowResult, type ContextAnalysisResult,
} from '../_shared/typo-confirmation.ts';
import {
  generateGreeting, detectSpamPattern, buildContextProtectionPrompt, detectInfoRequest,
  type GreetingContext, type GreetingResult, type SpamDetectionContext, type SpamDetectionResult,
} from '../_shared/greeting-handler.ts';

import {
  loadMessageTemplates, getTemplateCache, getRenderedTemplate,
  getTriageRedirectMessage as getTriageRedirectMessageFromTemplates,
  getTriageFallbackMessage as getTriageFallbackMessageFromTemplates,
  getExistingClientPrompt as getExistingClientPromptFromTemplates,
  getEscalationMessage as getEscalationMessageFromTemplates,
  getAudioOfferMessage as getAudioOfferMessageFromTemplates,
  getAudioTimeoutFallback, getValidationFallback, buildPromptRulesBlock, getMissingDataQuestion,
  getDivergenceIntro, getDivergenceField, getDivergenceClosing, getTimeoutMessage, getStatusNotFoundMessage,
  loadRAGCategoryLabels, formatRAGCategories, loadSystemConstants, getSystemConstant,
  getMediaCapabilityMessage, getDelayIntentAcknowledgment, buildRAGFirstSection, getOperatorTakeoverMessage,
  type MessageTemplate,
} from '../_shared/message-templates.ts';

import {
  type WebhookPayload, type LegacyPayload, type MessageData,
  type MessageContent, type UserInfo, type ChatInfo,
  type WebhookEventData,
  corsHeaders,
} from '../_shared/webhook-types.ts';
import { validateSofiaWebhook, validateZApiWebhook, type ValidationResult } from '../_shared/zod-schemas.ts';

// corsHeaders imported from _shared/webhook-types.ts (Phase 73)

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const LOVABLE_API_KEY = Deno.env.get('Deep_Seek') || Deno.env.get('LOVABLE_API_KEY');

// Wrapper for detectTechnicalIssue that passes the API key
const detectTechnicalIssue = (message: string) => detectTechnicalIssueShared(message, LOVABLE_API_KEY || undefined);

// Extended interface for sofia-webhook specific fields (Z-API credentials)
interface SofiaAgentConfig extends FullAgentConfig {
  status: string;
  zapi_instance_id?: string | null;
  zapi_token?: string | null;
  zapi_security_token?: string | null;
}

// Cache for agent config with Z-API fields
let agentConfigCache: Record<string, { data: SofiaAgentConfig | null; timestamp: number }> = {};
const AGENT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Load agent config with sofia-specific Z-API fields
 * Wraps shared loadFullAgentConfig and adds extra fields from database
 */
async function loadFullAgentConfig(supabaseClient: any, agentId: string = 'sofia'): Promise<SofiaAgentConfig> {
  const now = Date.now();
  
  // Return cached if still valid
  const cached = agentConfigCache[agentId];
  if (cached?.data && (now - cached.timestamp) < AGENT_CACHE_TTL_MS) {
    console.log(`[AI_GYM] Using cached agent config for: ${agentId}`);
    return cached.data;
  }
  
  console.log(`[AI_GYM] Loading agent config for: ${agentId} (with Z-API fields)`);
  
  // Use shared loader first
  const baseConfig = await loadFullAgentConfigShared(supabaseClient, agentId);
  
  // Fetch Z-API specific fields
  const { data: agent } = await supabaseClient
    .from('ai_agents')
    .select('status, zapi_instance_id, zapi_token, zapi_security_token')
    .eq('agent_id', agentId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .single();
  
  const config: SofiaAgentConfig = {
    ...baseConfig,
    status: agent?.status || 'active',
    zapi_instance_id: agent?.zapi_instance_id || null,
    zapi_token: agent?.zapi_token || null,
    zapi_security_token: agent?.zapi_security_token || null,
  };
  
  agentConfigCache[agentId] = { data: config, timestamp: now };
  
  console.log(`[AI_GYM] ✅ Loaded config for ${agentId} (status: ${config.status})`);
  return config;
}

const getDetectionPatternsFromCache = () => getPatternCache()?.patterns || new Map<string, PatternEntry>();

import { orchestrateRAGSearch, type RAGSearchResult, type RAGTriggerResult, type RAGContextResult, type RAGOrchestrationContext, type RAGOrchestrationResult, type RAGPromptContext } from '../_shared/rag-search-client.ts';
import { detectDiscountObjection, detectEconomyConfirmation, generateDiscountObjectionResponse, generateEconomyConfirmationResponse, isAssistedModeQuestion, type DiscountObjectionResult } from '../_shared/discount-objection.ts';
import { hasMultipleDoubts, hasComplexTopic } from '../_shared/audio-handler.ts';
import { 
  executeOperatorPhase, 
  executeTriagePhase,
  shouldExecuteTriagePhase,
  executeDataCollectionPhase,
  shouldExecuteDataCollectionPhase,
  executeLLMPhase,
  executeResponsePhase,
  // Phase 6-8: Context Building, Fast-Path, Validation
  executeContextBuildingPhase,
  executeFastPathPhase,
  executeValidationPhase,
  type OperatorPhaseContext, 
  type OperatorPhaseResult,
  type TriagePhaseContext,
  type TriagePhaseResult,
  type DataCollectionPhaseContext,
  type DataCollectionPhaseResult,
  type LLMPhaseContext,
  type LLMPhaseResult,
  type ResponsePhaseContext,
  type ResponsePhaseResult,
  type MessageFunctions,
  type SyncFunctions,
  type ContextBuildingPhaseContext,
  type ContextBuildingPhaseResult,
  type FastPathPhaseContext,
  type FastPathPhaseResult,
  type ValidationPhaseContext,
  type ValidationPhaseResult,
} from '../_shared/sofia-orchestrator/index.ts';

const checkGuardrailsEscalation = (message: string, guardrails: GuardrailsConfig): { needed: boolean; reason: string | null } => {
  if (!guardrails) return { needed: false, reason: null };
  const lowerMsg = message.toLowerCase();
  for (const trigger of guardrails.handoff_triggers || []) if (lowerMsg.includes(trigger.toLowerCase())) return { needed: true, reason: `Handoff: ${trigger}` };
  for (const phrase of guardrails.escalation_phrases || []) if (lowerMsg.includes(phrase.toLowerCase())) return { needed: true, reason: `Escalation: ${phrase}` };
  return { needed: false, reason: null };
};

const detectMasterOfferAcceptance = (message: string, patterns?: Map<string, PatternEntry>): boolean =>
  matchesPatternCategory(message.toLowerCase().trim(), 'master_offer_accept', patterns || getDetectionPatternsFromCache());
const getAuthorizedPhones = async (supabaseClient: any): Promise<string[]> =>
  (await supabaseClient.from('whatsapp_test_phones').select('phone_number').eq('is_active', true)).data?.map((p: { phone_number: string }) => p.phone_number) || [];

// NOTE: WebhookPayload, LegacyPayload, MessageData types imported from _shared/webhook-types.ts (Phase 73)

import {
  loadDistribuidorasConfig as loadDistribuidorasConfigFromShared,
  getDistribuidoraCache as getDistribuidoraCacheFromShared,
  findDistribuidoraFromCache,
  validarDistribuidoraFromCache as validarDistribuidoraFromCacheShared,
  getAttendedasList,
  isForbiddenTypo,
  loadLearnedTypos as loadLearnedTyposFromShared,
  logTypoDetection as logTypoDetectionFromShared,
  confirmTypoSuggestion as confirmTypoSuggestionFromShared,
  analyzeDistribuidoraContext,
  // Phase 41: Distributor validation flow
  handleDistributorValidationFlow,
  handleDistributorClarificationResponse,
  type DistribuidoraConfig,
  type DistribuidoraCache,
  type DistribuidoraValidation,
  type LearnedTypo as LearnedTypoFromShared,
  type DistribuidoraContextAnalysis,
  type DistributorValidationContext,
  type DistributorValidationResult,
} from '../_shared/distribuidora-handler.ts';

// Local cache reference (populated by loadDistribuidorasConfig from shared module)
let distribuidoraCache: DistribuidoraCache | null = null;
const DISTRIBUIDORA_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Wrapper to load and cache distribuidoras config using shared module
 */
async function loadDistribuidorasConfigLocal(supabaseClient: any): Promise<DistribuidoraCache> {
  const cache = await loadDistribuidorasConfigFromShared(supabaseClient);
  distribuidoraCache = cache;
  return cache;
}

// Type alias for backward compatibility
type LearnedTypo = LearnedTypoFromShared;

// Inline validarDistribuidora using shared function with cache
const validarDistribuidora = (dist: string): DistribuidoraValidation => 
  distribuidoraCache 
    ? validarDistribuidoraFromCacheShared(dist, distribuidoraCache)
    : { atendida: false, mensagemNaoAtendida: 'Não foi possível validar a distribuidora. Por favor, tente novamente em instantes.' };


// NOTE: calculateMessageScore is now imported from _shared/funnel-stage.ts (Phase 72)

import {
  handlePendingTaskTimeout as handlePendingTaskTimeoutShared, clearPendingTask, setPendingTask,
  detectPendingTaskFromResponse, getDefaultPendingTaskTimeoutMs, getDefaultMaxTaskRetries,
  type PendingTaskType, type PendingTaskConversation, type PendingTaskTimeoutResult,
} from '../_shared/pending-task-manager.ts';
const getPendingTaskTimeoutMs = () => getSystemConstant('pending_task_timeout_ms', getDefaultPendingTaskTimeoutMs());
const getMaxTaskRetries = () => getSystemConstant('max_task_retries', getDefaultMaxTaskRetries());
const handlePendingTaskTimeout = (supabase: any, conversa: PendingTaskConversation, sendMessage: (phone: string, message: string) => Promise<void>) =>
  handlePendingTaskTimeoutShared(supabase, conversa, sendMessage, { getMaxRetries: getMaxTaskRetries, getTemplates: getTemplateCache, agentConfig: currentAgentConfig });

// escalation.ts functions already imported at top (orchestrateFullEscalation, etc.)

// callAIWithModel now uses shared llm-client.ts (Phase 62)
async function callAIWithModel(model: string, messages: Array<{ role: string; content: string }>): Promise<{ text: string; model: string }> {
  return callAIWithModelLegacy(model, messages, LOVABLE_API_KEY || '', 500);
}

// fetchRejectionHistory imported via rejection-fallback.ts above

// Direct aliases for shared functions
const buildSystemPrompt = buildSystemPromptLegacy;
const transcribeAudio = transcribeAudioShared, analyzeImage = analyzeImageShared, analyzePDF = analyzePDFShared;
const handleProposalDelayComplaint = (supabase: any, conversaId: string, phone: string, clienteNome: string | null, dadosColetados: ExtractedClientData, bitrixLeadId: string | null, bitrixStage: string | null) =>
  handleProposalDelayComplaintShared(supabase, conversaId, phone, clienteNome, dadosColetados, bitrixLeadId, bitrixStage, sendWhatsAppMessage);
import {
  searchAndRecoverDocuments, handleDocumentComplaintFallback as handleDocumentComplaintFallbackShared,
  type DocumentFallbackResult, type RecoveredDocument, type DocumentRecoveryResult,
} from '../_shared/document-recovery.ts';

let currentAgentConfig: FullAgentConfig | null = null;

async function sendWhatsAppMessage(phone: string, message: string, agentConfig?: FullAgentConfig | null): Promise<void> {
  await sendWhatsAppMessageShared(phone, message, agentConfig as AgentZApiConfig);
}

// Race-condition safe wrappers - check conversation state before sending
async function checkConversationStillActive(supabase: any, conversaId: string): Promise<boolean> {
  const { data } = await supabase.from('chatbot_conversas').select('sofia_mode').eq('id', conversaId).single();
  const pausedModes = ['paused_for_human', 'human_takeover', 'paused', 'manual'];
  if (!data || pausedModes.includes(data.sofia_mode)) {
    console.log(`[RACE_CHECK] Conversation ${conversaId} is paused - BLOCKING`);
    return false;
  }
  return true;
}

async function safeSendWhatsAppMessage(supabase: any, conversaId: string, phone: string, message: string): Promise<boolean> {
  if (!(await checkConversationStillActive(supabase, conversaId))) return false;
  await sendWhatsAppMessage(phone, message);
  return true;
}

// Save contact to WhatsApp using Z-API
async function saveContactToWhatsApp(phone: string, fullName: string): Promise<boolean> {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/z-api-add-contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, firstName: fullName }),
    });
    return response.ok && (await response.json()).success === true;
  } catch {
    return false;
  }
}

// Audio wrapper functions (imports merged at line 80-87)
const generateVoiceAudio = (text: string) => generateVoiceAudioShared(text, { supabaseUrl: SUPABASE_URL, supabaseKey: SUPABASE_SERVICE_ROLE_KEY });
const uploadAudioToStorage = (audioBase64: string, format: 'mp3' | 'ogg') => uploadAudioToStorageShared(audioBase64, format, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const sendWhatsAppAudio = (phone: string, audioBase64: string, format: 'mp3' | 'ogg' = 'ogg', agentConfig?: FullAgentConfig | null) => {
  const creds = getZApiCredentials(agentConfig || currentAgentConfig);
  return sendWhatsAppAudioViaZApi(phone, audioBase64, format, { instanceId: creds.instanceId, token: creds.token, securityToken: creds.securityToken || undefined }, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
};
const sendVoiceMessage = (phone: string, text: string) => {
  const creds = getZApiCredentials(currentAgentConfig);
  return sendVoiceMessageComplete(phone, text, { instanceId: creds.instanceId, token: creds.token, securityToken: creds.securityToken || undefined }, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Create supabase client for logging
  const supabaseForLogging = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  // ═══════════════════════════════════════════════════════════════
  // CLÁUSULA PÉTREA: Context for mandatory fallback
  // These variables are declared here so the catch block can access them
  // to ALWAYS send a response to the client, even on critical errors
  // ═══════════════════════════════════════════════════════════════
  let clausulaPetreaContext: {
    phone: string | null;
    clienteNome: string | null;
    agentConfig: FullAgentConfig | null;
    conversaId: string | null;
    responseSent: boolean;
  } = {
    phone: null,
    clienteNome: null,
    agentConfig: null,
    conversaId: null,
    responseSent: false,
  };
  
  // Helper function to log webhook events (uses shared type but local implementation for simplicity)
  const logWebhookEvent = async (eventData: WebhookEventData) => {
    try {
      await supabaseForLogging.from('whatsapp_webhook_events').insert({
        provider: 'zapi', ...eventData,
        body_raw: eventData.body_raw.substring(0, 10000),
        message_preview: eventData.message_preview?.substring(0, 500),
        processing_status: eventData.processing_status || 'received',
      });
    } catch (e) { console.error('[WEBHOOK_LOG] Failed:', e); }
  };

  return Promise.resolve().then(async () => {
    // ═══════════════════════════════════════════════════════════════
    // PHASE 9: WEBHOOK INITIALIZATION (Parsing, format detection, msgData)
    // Using executeWebhookInitialization from webhook-initialization-phase.ts
    // Replaces ~270 lines of inline parsing logic
    // ═══════════════════════════════════════════════════════════════
    const bodyText = await req.text();
    
    const initResult = await executeWebhookInitialization({
      req,
      bodyText,
      supabase: supabaseForLogging,
    });
    
    // If initialization handled the request (validation, error, etc.)
    if (initResult.handled && initResult.response) {
      return initResult.response;
    }
    
    // Extract parsed data from initialization result
    const msgData = initResult.msgData!;
    const phone = initResult.phone!;
    const clienteNome: string | null = initResult.clienteNome ?? null;
    const chatappChatId = initResult.chatappChatId || '';
    const messageId = initResult.messageId || '';
    const isLegacyFormat = initResult.isLegacyFormat || false;
    const webhookPayload = initResult.webhookPayload;
    const legacyPayload = initResult.legacyPayload;
    const requestAgentId = initResult.agentId || 'sofia';
    
    // ═══════════════════════════════════════════════════════════════
    // CLÁUSULA PÉTREA: Populate context for mandatory fallback
    // ═══════════════════════════════════════════════════════════════
    clausulaPetreaContext.phone = phone;
    clausulaPetreaContext.clienteNome = clienteNome;
    
    console.log(`[WEBHOOK_INIT] ✅ Parsed: phone=${phone}, agent=${requestAgentId}, legacy=${isLegacyFormat}`);
    
    // ═══════════════════════════════════════════════════════════════
    // PHASE 10: AGENT STATUS CHECK (NO CACHE!) - Using agent-lock-phase module
    // Replaces ~60 lines of inline status check and message save logic
    // ═══════════════════════════════════════════════════════════════
    const supabaseEarly = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    const agentStatusCheck = await checkAgentStatusRealtime(supabaseEarly, requestAgentId);
    
    // Block if agent is not active (includes paused, draft, testing, etc.)
    if (!agentStatusCheck.isActive) {
      console.log(`[AGENT_STATUS] ⛔ BLOCK_INBOUND: Agent ${requestAgentId} (${agentStatusCheck.name}) status="${agentStatusCheck.status}" - NOT ACTIVE`);
      
      // Save message for history using the module function
      const messageText = msgData?.message?.text || '[mídia/arquivo]';
      const saveResult = await saveMessageWhileInactive(supabaseEarly, phone, requestAgentId, messageText, messageId);
      
      return new Response(JSON.stringify({ 
        status: 'agent_inactive',
        agent_id: requestAgentId,
        agent_name: agentStatusCheck.name,
        agent_status: agentStatusCheck.status,
        reason: `Agent status is "${agentStatusCheck.status}" (not active) - no AI processing will occur`,
        message_saved: saveResult.saved,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // Load full agent config
    const earlyAgentConfig = await loadFullAgentConfig(supabaseEarly, requestAgentId);
    currentAgentConfig = earlyAgentConfig;
    clausulaPetreaContext.agentConfig = earlyAgentConfig; // CLÁUSULA PÉTREA: Store agent config
    console.log(`[sofia-webhook] Agent config loaded: ${earlyAgentConfig.name} (status: ${earlyAgentConfig.status}, has ZAPI creds: ${!!earlyAgentConfig.zapi_instance_id})`);
    
    if (earlyAgentConfig.status !== 'active') {
      console.warn(`[AGENT_STATUS] ⚠️ Config cache mismatch! DB says active but config says ${earlyAgentConfig.status} - blocking anyway`);
      return new Response(JSON.stringify({ 
        status: 'agent_inactive',
        agent_id: requestAgentId,
        reason: 'Agent status mismatch - blocking for safety',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // Message deduplication with distributed lock
    if (messageId) {
      const dedupResult = await checkMessageDeduplication(
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
        phone,
        messageId,
        requestAgentId,
        chatappChatId,
      );

      if (!dedupResult.shouldProcess) {
        console.log(`[DEDUP] ❌ BLOCKED: ${dedupResult.reason}`);
        return new Response(JSON.stringify({
          status: 'ignored',
          messageId,
          ...dedupResult,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log(`[DEDUP] ✅ Message ${messageId} from ${phone} - proceeding (${dedupResult.reason}, lock=${dedupResult.lockAcquired}, batched=${dedupResult.batchedMessages || 0})`);
    }

    // Buffer result will be populated after messageText is extracted from media
    let bufferResult: BufferOrchestrationResult | null = null;

    // ═══════════════════════════════════════════════════════════════
    // CROSS-WEBHOOK LOCK - Using agent-lock-phase module
    // Prevents sofia-webhook and bitrix24-link-webhook from processing simultaneously
    // ═══════════════════════════════════════════════════════════════
    const supabaseForCrossLock = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    await acquireCrossWebhookLockWithRetry(supabaseForCrossLock, phone, 'sofia-webhook', 'message_processing', 45, 2000);

    // ═══════════════════════════════════════════════════════════════
    // MEDIA PROCESSING PHASE - Using media-processing-phase module
    // Handles: Audio transcription, Image analysis, PDF analysis, Text processing
    // Replaces ~43 lines of inline logic
    // ═══════════════════════════════════════════════════════════════
    const supabaseForMedia = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const sofiaCapabilities = await getSofiaCapabilities(supabaseForMedia);
    
    const mediaPhaseResult = await executeMediaProcessingPhase({
      supabase: supabaseForMedia,
      msgData,
      phone,
      clienteNome,
      agentId: requestAgentId,
      sendWhatsAppMessage,
    });
    
    // If media processing returned early (e.g., capability disabled, no text)
    if (mediaPhaseResult.handled && mediaPhaseResult.response) {
      return mediaPhaseResult.response;
    }
    
    // CRITICAL: If messageText is empty/null after media processing, ignore silently
    // This prevents empty messages from triggering greeting loops
    if (!mediaPhaseResult.messageText || mediaPhaseResult.messageText.trim() === '') {
      console.log(`[SOFIA] ⛔ Empty messageText after media processing - ignoring silently`);
      return new Response(JSON.stringify({ 
        status: 'ignored', 
        reason: 'empty_message_text_after_media_processing' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // Extract results from media processing
    const messageText = mediaPhaseResult.messageText;
    const isTranscribedAudio = mediaPhaseResult.isTranscribedAudio;
    const isAnalyzedImage = mediaPhaseResult.isAnalyzedImage;
    const isAnalyzedDocument = mediaPhaseResult.isAnalyzedDocument;
    const detectedInvoice = mediaPhaseResult.detectedInvoice;
    const mediaAnalysisResult = mediaPhaseResult.mediaAnalysisResult;

    // ═══════════════════════════════════════════════════════════════
    // MESSAGE BUFFER PHASE - Using message-buffer-phase module
    // Handles: Operator command bypass, humanized message buffering
    // Replaces ~95 lines of inline logic
    // ═══════════════════════════════════════════════════════════════
    const isOperatorCommandMessage = isOperatorCommand(messageText);
    let effectiveMessageText: string = messageText;
    
    if (isOperatorCommandMessage) {
      console.log(`[BUFFER] ⚡ OPERATOR COMMAND DETECTED: "${messageText.substring(0, 30)}" - BYPASSING BUFFER for instant processing`);
      // Skip buffer orchestration entirely - process command immediately
      effectiveMessageText = messageText;
      // Set bufferResult to indicate bypass
      bufferResult = {
        shouldProcess: true,
        reason: 'operator_command_bypass',
        mergedText: messageText,
        messageCount: 1,
        phantomEnterDetected: false,
        bufferId: null,
        waitTimeMs: 0,
        originalMessages: [], // Empty for bypass
      };
    } else {
      // ═══════════════════════════════════════════════════════════════
      // PHASE 90: HUMANIZED MESSAGE BUFFER (Regular messages only)
      // Accumulates rapid-fire messages and processes as single context
      // Implements 4s silence window, phantom-enter detection, message merging
      // ═══════════════════════════════════════════════════════════════
      try {
        bufferResult = await orchestrateMessageBuffer({
          supabaseUrl: SUPABASE_URL,
          supabaseKey: SUPABASE_SERVICE_ROLE_KEY,
          phone,
          agentId: requestAgentId,
          messageText,
          messageId,
          timestamp: new Date(),
        });
        
        // If buffer not ready (more messages expected), wait and check again
        if (!bufferResult.shouldProcess && bufferResult.reason === 'waiting_for_silence') {
          console.log(`[BUFFER] ⏳ Waiting for silence window (${bufferResult.waitTimeMs}ms remaining)...`);
          
          // Wait for buffer to be ready (polls internally)
          const waitResult = await waitForBufferReady(
            SUPABASE_URL,
            SUPABASE_SERVICE_ROLE_KEY,
            phone,
            requestAgentId,
            20000, // Max 20s wait
            500    // Poll every 500ms
          );
          
          if (!waitResult.shouldProcess) {
            console.log(`[BUFFER] ❌ Buffer claimed by another instance or timeout: ${waitResult.reason}`);
            return new Response(JSON.stringify({
              status: 'buffer_not_processed',
              reason: waitResult.reason,
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
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
          return new Response(JSON.stringify({
            status: 'buffer_skipped',
            reason: bufferResult.reason,
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        // Use merged message for processing (replaces individual messageText)
        effectiveMessageText = bufferResult.mergedText || messageText;
        
        if (bufferResult.messageCount > 1) {
          console.log(`[BUFFER] ✅ Processing ${bufferResult.messageCount} messages as: "${effectiveMessageText.substring(0, 100)}${effectiveMessageText.length > 100 ? '...' : ''}"`);
        }
        
        if (bufferResult.phantomEnterDetected) {
          console.log(`[BUFFER] 📝 Phantom Enter detected - messages were fragmented by user`);
        }
      } catch (bufferError) {
        console.warn('[BUFFER] ⚠️ Buffer orchestration failed, proceeding with single message:', bufferError);
        // Continue with original messageText - buffer failure shouldn't block processing
        effectiveMessageText = messageText;
      }
    } // End of else block (non-operator command)

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // ═══════════════════════════════════════════════════════════════
    // PHASE 96: Pipeline v2 fallback flag - prevents double triage
    // When Pipeline v2 fails and falls back, we should NOT re-run triage
    // ═══════════════════════════════════════════════════════════════
    let pipelineV2AttemptedFallback = false;
    let pipelineV2FallbackReason: string | null = null;
    
    // ═══════════════════════════════════════════════════════════════
    // PIPELINE V2 INTEGRATION - Structural Data Pipeline
    // If enabled, delegate to the new 6-stage architecture
    // Falls back to legacy flow if pipeline fails
    // ═══════════════════════════════════════════════════════════════
    const { executePipeline, shouldUsePipelineV2 } = await import("../_shared/pipeline/index.ts");
    
    const usePipelineV2 = await shouldUsePipelineV2(phone);
    
    if (usePipelineV2) {
      console.log(`[Sofia] 🚀 Delegating to Pipeline v2 for ${phone}`);
      
      try {
        // Find or create conversation first (needed for pipeline)
        const { data: existingConversa } = await supabase
          .from('chatbot_conversas')
          .select('id')
          .eq('cliente_telefone', phone)
          .eq('agent_id', requestAgentId)
          .eq('whatsapp_provider', 'zapi')
          .is('ended_at', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        const conversaId = existingConversa?.id || null;
        
        if (conversaId) {
          // NOTE: Message will be saved by Intake Layer in main flow
          // Pipeline v2 delegates back to legacy flow which has Intake Layer
          // No need for duplicate save here
          
          // Determine media type from processing result
          const pipelineMediaType = isTranscribedAudio ? 'audio' : isAnalyzedImage ? 'image' : isAnalyzedDocument ? 'document' : 'text';
          
          const pipelineResult = await executePipeline(
            conversaId,
            messageId,
            phone,
            effectiveMessageText, // Use merged text from buffer
            pipelineMediaType,
            {
              originalPayload: webhookPayload || legacyPayload,
              clienteNome,
              isTranscribedAudio,
              isAnalyzedImage,
              isAnalyzedDocument,
              detectedInvoice,
              mediaAnalysisResult,
              agentId: requestAgentId,
            }
          );
          
          if (!pipelineResult.shouldFallbackToLegacy) {
            console.log(`[Sofia] ✅ Pipeline v2 completed successfully`);
            
            // Release cross-webhook lock after pipeline v2 completes
            try {
              await supabase.rpc('release_cross_webhook_lock', { p_phone: phone, p_locked_by: 'sofia-webhook' });
              console.log(`[CROSS_LOCK] 🔓 Released lock for ${phone} (pipeline v2)`);
            } catch (releaseLockErr) {
              console.warn('[CROSS_LOCK] Failed to release lock:', releaseLockErr);
            }
            
            return new Response(JSON.stringify({
              success: true,
              pipeline: "v2",
              messageSent: pipelineResult.messageSent,
              executionId: pipelineResult.executionLog?.id
            }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }
          
          // Fallback to legacy flow
          console.log(`[Sofia] ⚠️ Pipeline v2 fallback: ${pipelineResult.fallbackReason}`);
          
          // PHASE 96: Mark that Pipeline v2 attempted but fell back
          // This prevents legacy flow from re-running triage unnecessarily
          pipelineV2AttemptedFallback = true;
          pipelineV2FallbackReason = pipelineResult.fallbackReason || 'unknown';
          console.log(`[PIPELINE_V2] 🚫 Setting pipelineV2AttemptedFallback=true - legacy triage will be skipped`);
        } else {
          console.log(`[Sofia] No existing conversation for Pipeline v2, using legacy for creation`);
        }
      } catch (pipelineError) {
        console.error(`[Sofia] Pipeline v2 error, falling back to legacy:`, pipelineError);
        pipelineV2AttemptedFallback = true;
        pipelineV2FallbackReason = 'pipeline_error';
      }
    }
    
    // Load detection patterns and distribuidoras from database (cached for 10 minutes)
    const [detectionPatterns, _distribuidorasCache] = await Promise.all([
      loadDetectionPatternsShared(supabase),
      loadDistribuidorasConfigLocal(supabase),
    ]);

    // ═══════════════════════════════════════════════════════════════
    // PHASE 1: OPERATOR COMMANDS (Refactored to separate module)
    // Uses executeOperatorPhase from sofia-orchestrator/operator-phase.ts
    // Handles: RESET, STATUS, PING, VOICE, HELP, ASSUMIR, RESOLVIDO, CORRIGIR
    // ═══════════════════════════════════════════════════════════════
    const phoneDigits = phone.replace(/\D/g, '');
    
    const operatorPhaseResult = await executeOperatorPhase({
      supabase,
      phone,
      phoneDigits,
      messageText: effectiveMessageText,
      chatappChatId,
      clienteNome,
      agentId: requestAgentId,
      agentName: earlyAgentConfig?.name || 'sofIA',
      supervisorNome: earlyAgentConfig?.guardrails?.supervisor_nome,
      msgData: msgData as { fromMe?: boolean; fromApi?: boolean },
      sendWhatsAppMessage,
      sendVoiceMessage,
    });
    
    if (operatorPhaseResult.handled && operatorPhaseResult.response) {
      console.log(`[OPERATOR_PHASE] ✅ Command handled: ${operatorPhaseResult.action}`);
      
      // Release cross-webhook lock
      try {
        await supabase.rpc('release_cross_webhook_lock', { p_phone: phone, p_locked_by: 'sofia-webhook' });
      } catch (releaseLockErr) {
        console.warn('[CROSS_LOCK] Failed to release lock:', releaseLockErr);
      }
      
      return operatorPhaseResult.response;
    }
    
    // Load authorized phones from database (for other test commands that might still need it)
    const authorizedPhones = await getAuthorizedPhones(supabase);
    const isAuthorizedPhone = authorizedPhones.includes(phoneDigits);

    // NOTE: All operator commands (RESET, STATUS, PING, VOICE, HELP, ASSUMIR, RESOLVIDO, CORRIGIR)
    // are now handled by executeOperatorPhase above. The legacy code has been removed.
    // See: supabase/functions/_shared/sofia-orchestrator/operator-phase.ts

    // ═══════════════════════════════════════════════════════════════
    // GLOBAL PAUSE PHASE - Using global-pause-phase module
    // Checks if Sofia is globally disabled and saves message without processing
    // Replaces ~95 lines of inline logic
    // ═══════════════════════════════════════════════════════════════
    const { data: sofiaConfig } = await supabase
      .from('configuracoes_sistema')
      .select('valor')
      .eq('chave', 'sofia_whatsapp_enabled')
      .single();

    const sofiaEnabled = sofiaConfig?.valor !== 'false';

    if (!sofiaEnabled) {
      console.log(`[GLOBAL_PAUSE] ${earlyAgentConfig?.name || 'IA'} está pausada - delegating to global-pause-phase`);
      
      const globalPauseResult = await executeGlobalPausePhase({
        supabase,
        phone,
        agentId: requestAgentId,
        clienteNome,
        messageText,
        messageId,
        getABVariant,
      });
      
      if (globalPauseResult.handled && globalPauseResult.response) {
        return globalPauseResult.response;
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // PHASE 11: CONVERSATION LIFECYCLE (Refactored to separate module)
    // Uses executeConversationLifecyclePhase from conversation-lifecycle-phase.ts
    // Handles: Discarded leads, pause detection, takeover detection, duplicate cleanup
    // Replaces ~145 lines of inline logic
    // ═══════════════════════════════════════════════════════════════
    const lifecycleResult = await executeConversationLifecyclePhase({
      supabase,
      phone,
      agentId: requestAgentId,
      clienteNome,
      messageText: effectiveMessageText,
      messageId,
      agentConfig: earlyAgentConfig,
      sendWhatsAppMessage,
      templateCache: getTemplateCache() || undefined,
    });
    
    // Handle early returns from lifecycle phase
    if (lifecycleResult.handled && lifecycleResult.response) {
      console.log(`[LIFECYCLE_PHASE] ✅ Handled: discarded=${lifecycleResult.wasDiscarded}, paused=${lifecycleResult.wasPaused}, takeover=${lifecycleResult.wasTakenOver}`);
      
      // Release cross-webhook lock
      try {
        await supabase.rpc('release_cross_webhook_lock', { p_phone: phone, p_locked_by: 'sofia-webhook' });
      } catch (releaseLockErr) {
        console.warn('[CROSS_LOCK] Failed to release lock:', releaseLockErr);
      }
      
      return lifecycleResult.response;
    }
    
    // Extract conversation from lifecycle result
    let conversa = lifecycleResult.conversa;
    
    // Log if conversation needs human but Sofia continues (requires explicit #ASSUMIR)
    needsHumanFallbackLog(conversa || null);

    // ═══════════════════════════════════════════════════════════════
    // CRITICAL FIX: Check for existing proposal and resend link
    // If client returns asking about their proposal, resend existing link
    // This prevents Sofia from promising to create a new proposal
    // ═══════════════════════════════════════════════════════════════
    // PROPOSAL RESEND via WhatsApp DISABLED - Bitrix24 automations handle notifications
    // If client asks about their proposal, let the normal LLM flow handle it
    // The LLM can still mention the proposal exists based on conversation context
    if (conversa && isRequestingExistingProposal(messageText)) {
      console.log(`[PROPOSAL_RESEND] Detected proposal request intent, but WhatsApp resend DISABLED (delegated to Bitrix24). Proceeding with normal LLM flow.`);
      // Continue to normal flow - Sofia will respond conversationally
    }

    // ═══════════════════════════════════════════════════════════════
    // CRM PRE-CHECK - Mandatory before triage/LLM processing
    // Queries Bitrix24 to determine lead stage and behavior
    // ═══════════════════════════════════════════════════════════════
    let crmContext: CRMLeadContext | undefined;
    
    try {
      const crmPreCheckResult = await executeCRMPreCheck({
        supabase,
        phone,
        conversaId: conversa?.id,
      });
      
      crmContext = crmPreCheckResult.context;
      
      console.log(`[CRM_PRECHECK] Found: ${crmContext.found} | Stage: ${crmContext.stage} | SkipTriage: ${crmContext.shouldSkipTriage} | Mode: ${crmContext.recommendedMode} | Duration: ${crmContext.lookupDurationMs}ms`);
      
      // Handle blocked cases (e.g., certain discarded scenarios - though we handle most in fast-path)
      if (crmPreCheckResult.handled && crmPreCheckResult.response) {
        console.log(`[CRM_PRECHECK] ⛔ Pre-check handled response: ${crmPreCheckResult.response.status}`);
        return new Response(JSON.stringify({
          status: crmPreCheckResult.response.status,
          crmContext: {
            leadId: crmContext.leadId,
            stage: crmContext.stage,
            stageName: crmContext.stageName,
          },
          message: crmPreCheckResult.response.message,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } catch (crmErr) {
      console.warn(`[CRM_PRECHECK] ⚠️ Pre-check failed (continuing without CRM context):`, crmErr);
      // Continue without CRM context - don't block the flow
    }

    // ═══════════════════════════════════════════════════════════════
    // PHASE 89 FIX: EARLY DATA EXTRACTION (before triage)
    // CRITICAL: Extract commercial data BEFORE triage check so triagem
    // sees fresh data (distribuidora, valor, email) instead of stale DB data
    // This prevents false triage triggers when client is providing data
    // ═══════════════════════════════════════════════════════════════
    const earlyExistingDados = (conversa?.dados_coletados as ExtractedClientData) || {};
    const earlyExtractedData = extractDataFromText(messageText, earlyExistingDados);
    
    if (earlyExtractedData.distribuidora || earlyExtractedData.distribuidoraInformada || 
        earlyExtractedData.valorFatura || earlyExtractedData.email) {
      console.log(`[EARLY_EXTRACTION] Pre-triage extraction found commercial data:`, {
        distribuidora: earlyExtractedData.distribuidora || earlyExtractedData.distribuidoraInformada,
        valorFatura: earlyExtractedData.valorFatura,
        email: earlyExtractedData.email,
      });
    }
    
    // ═══════════════════════════════════════════════════════════════
    // PHASE 2: TRIAGE (Refactored to separate module)
    // Uses executeTriagePhase from sofia-orchestrator/triage-phase.ts
    // Handles: Existing client detection, MarIA flow, department routing
    // Phase 89: Now receives preExtractedData for accurate skip checks
    // PHASE 96: Skip triage entirely if Pipeline v2 already attempted and fell back
    // ═══════════════════════════════════════════════════════════════
    let triagePhaseResult: any = { handled: false };
    
    if (pipelineV2AttemptedFallback) {
      // PHASE 96: Pipeline v2 já tentou processar - NÃO re-executar triagem
      // Isso previne o "efeito dois bots" onde Pipeline v2 e fluxo legado
      // disparam respostas diferentes para a mesma mensagem
      console.log(`[TRIAGE_PHASE] ⛔ SKIP: Pipeline v2 já tentou (fallbackReason: ${pipelineV2FallbackReason}) - não re-executar triagem`);
      triagePhaseResult = {
        handled: false,
        action: 'skipped_pipeline_v2_fallback',
        status: `pipeline_v2_fallback_${pipelineV2FallbackReason}`,
      };
    } else {
      triagePhaseResult = await executeTriagePhase({
        supabase,
        supabaseUrl: SUPABASE_URL,
        supabaseAnonKey: Deno.env.get('SUPABASE_ANON_KEY') || SUPABASE_SERVICE_ROLE_KEY,
        supabaseServiceKey: SUPABASE_SERVICE_ROLE_KEY,
        phone,
        messageText,
        messageId: messageId || null,
        clienteNome,
        conversa: conversa ? {
          id: conversa.id,
          dados_coletados: conversa.dados_coletados as Record<string, any> | null,
          proposta_id: conversa.proposta_id as string | undefined,
          bitrix24_stage: conversa.bitrix24_stage as string | undefined,
          bitrix24_lead_id: conversa.bitrix24_lead_id as string | undefined,
          cliente_nome: conversa.cliente_nome as string | undefined,
          cliente_email: conversa.cliente_email as string | undefined,
          cliente_telefone: conversa.cliente_telefone as string | undefined,
          // CRITICAL FIX: Pass these fields for shouldSkipTriageCheck to work
          last_sofia_message_at: conversa.last_sofia_message_at as string | undefined,
          event_proposal_sent: conversa.event_proposal_sent as boolean | undefined,
          proposta_link_sent_at: conversa.proposta_link_sent_at as string | undefined,
        } : null,
        agentId: requestAgentId,
        agentConfig: earlyAgentConfig ? {
          name: earlyAgentConfig.name,
          role: earlyAgentConfig.role,
          triage_config: earlyAgentConfig.triage_config as any,
        } : null,
        fullAgentConfig: earlyAgentConfig,
        crmContext,
        detectionPatterns,
        sendWhatsAppMessage,
        preExtractedData: earlyExtractedData, // Phase 89: Pass early extraction results
      });
    }
    
    if (triagePhaseResult.handled && triagePhaseResult.response) {
      console.log(`[TRIAGE_PHASE] ✅ Handled: ${triagePhaseResult.action} | Status: ${triagePhaseResult.status}`);
      
      // Release cross-webhook lock
      try {
        await supabase.rpc('release_cross_webhook_lock', { p_phone: phone, p_locked_by: 'sofia-webhook' });
      } catch (releaseLockErr) {
        console.warn('[CROSS_LOCK] Failed to release lock:', releaseLockErr);
      }
      
      return triagePhaseResult.response;
    }
    
    // NOTE: All triage logic (existing client detection, MarIA flow, department routing,
    // contextual lookup, discount objection bypass) is now handled by executeTriagePhase above.
    // See: supabase/functions/_shared/sofia-orchestrator/triage-phase.ts
    
    // ═══════════════════════════════════════════════════════════════
    // TECHNICAL ISSUE AUTO-RESOLUTION - NOW HANDLED BY _shared/technical-issues.ts (Phase 11)
    // Function: handleTechnicalIssueFlow - Detects and resolves broken links, email issues, PDF problems
    // ═══════════════════════════════════════════════════════════════
    if (conversa) {
      const existingDadosForTech = (conversa.dados_coletados as Record<string, unknown>) || {};
      
      // Quick detection first
      const techIssue = await detectTechnicalIssue(messageText);
      
      if (techIssue.detected && techIssue.issueType) {
        console.log(`[TECH_ISSUE] Detected: ${techIssue.issueType} - delegating to handleTechnicalIssueFlow`);
        
        const techFlowResult = await handleTechnicalIssueFlow({
          supabase,
          conversaId: conversa.id,
          phone,
          clienteNome,
          messageText,
          messageId: messageId || null,
          propostaId: conversa.proposta_id as string | null,
          bitrixLeadId: conversa.bitrix24_lead_id as string | null,
          emailCadastrado: (existingDadosForTech.email as string) || conversa.cliente_email as string | null,
          existingDados: existingDadosForTech,
          sendMessage: sendWhatsAppMessage,
        });
        
        if (techFlowResult.handled) {
          console.log(`[TECH_ISSUE] Flow handled by handleTechnicalIssueFlow: ${techFlowResult.status}`);
          return new Response(JSON.stringify(techFlowResult), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
    }

    // Conversation management
    let conversaId: string;
    let currentScore = 0;
    let currentMode: 'standard' | 'closer_premium' = 'standard';
    let currentObjection: ObjectionType = null;
    let abVariant: 'A' | 'B' = 'A';
    let totalMessages = 0;

    if (!conversa) {
      const conversaResult = await getOrCreateConversation({
        supabase, phone, clienteNome, agentId: requestAgentId,
        leadSource: 'whatsapp_inbound', whatsappProvider: 'zapi',
        getABVariant, existingConversa: null,
      });
      
      conversaId = conversaResult.snapshot.id;
      currentScore = conversaResult.snapshot.leadScore;
      currentMode = (conversaResult.snapshot.sofiaMode as 'standard' | 'closer_premium') || 'standard';
      currentObjection = conversaResult.snapshot.detectedObjection;
      abVariant = conversaResult.snapshot.abVariant;
      totalMessages = conversaResult.snapshot.totalMessages;
      conversa = conversaResult.snapshot.raw;
      
      if (conversaResult.isNew) console.log(`[CONVERSATION_MANAGER] Created: ${conversaId}`);
      else if (conversaResult.isRaceCondition) console.log(`[CONVERSATION_MANAGER] Race condition: ${conversaId}`);
    } else {
      const snapshot = buildConversaSnapshot(conversa);
      conversaId = snapshot.id;
      currentScore = snapshot.leadScore;
      currentMode = (snapshot.sofiaMode as 'standard' | 'closer_premium') || 'standard';
      currentObjection = snapshot.detectedObjection;
      abVariant = snapshot.abVariant;
      totalMessages = snapshot.totalMessages;
      console.log(`[CONVERSATION_MANAGER] Existing: ${conversaId}`);
    }
    
    // CLÁUSULA PÉTREA: Store conversaId for error tracking
    clausulaPetreaContext.conversaId = conversaId;
    
    // ═══════════════════════════════════════════════════════════════
    // MULTI-SOURCE clienteNome EXTRACTION (Erro 4 fix: Nome ignorado)
    // Priority: dados_coletados.nome > cliente_nome > WhatsApp pushName
    // This ensures personalization is maintained across all responses
    // ═══════════════════════════════════════════════════════════════
    const effectiveClienteNome = (() => {
      const dadosNome = (conversa?.dados_coletados as any)?.nome;
      const columnNome = conversa?.cliente_nome;
      const pushName = clienteNome; // From WhatsApp API
      
      // Prefer dados_coletados.nome (most likely manually confirmed/extracted)
      if (dadosNome && typeof dadosNome === 'string' && dadosNome.trim().length > 0) {
        console.log(`[NOME_EXTRACTION] Using dados_coletados.nome: "${dadosNome}"`);
        return dadosNome.trim();
      }
      // Fallback to cliente_nome column
      if (columnNome && typeof columnNome === 'string' && columnNome.trim().length > 0) {
        console.log(`[NOME_EXTRACTION] Using cliente_nome column: "${columnNome}"`);
        return columnNome.trim();
      }
      // Fallback to WhatsApp pushName
      if (pushName && typeof pushName === 'string' && pushName.trim().length > 0) {
        console.log(`[NOME_EXTRACTION] Using WhatsApp pushName: "${pushName}"`);
        return pushName.trim();
      }
      return null;
    })();
    
    // Replace clienteNome reference for all downstream uses
    // This variable is used in all subsequent phase calls
    const clienteNomeForPhases = effectiveClienteNome;
    
    // ═══════════════════════════════════════════════════════════════
    // INTAKE LAYER - GUARANTEED MESSAGE PERSISTENCE (Phase 19)
    // CRITICAL: This MUST happen BEFORE any other processing to ensure
    // no messages are ever lost, regardless of downstream failures.
    // Single source of truth for user message persistence.
    // ═══════════════════════════════════════════════════════════════
    const intakeResult = await executeIntakeLayer({
      supabase,
      phone,
      agentId: requestAgentId,
      messageText: effectiveMessageText,
      messageId: messageId || undefined,
      clienteNome,
      isTranscribedAudio,
      isAnalyzedImage,
      isAnalyzedDocument,
      conversaId, // Pass existing conversaId to avoid duplicate creation
    });
    
    if (!intakeResult.success) {
      console.error(`[INTAKE] ❌ Message persistence failed: ${intakeResult.error}`);
      // Continue anyway - we don't want to block the flow, but log the issue
    } else {
      console.log(`[INTAKE] ✅ Message persisted (${intakeResult.isNewConversation ? 'new' : 'existing'} conversation)`);
    }
    
    // Track that intake has run - prevents duplicate saves later
    const intakeCompleted = intakeResult.success;
    // ═══════════════════════════════════════════════════════════════
    // GREETING PHASE - Using greeting-phase module
    // Sends warm welcome message on first contact
    // Replaces ~55 lines of inline logic
    // ═══════════════════════════════════════════════════════════════
    const greetingPhaseResult = await executeGreetingPhase({
      supabase,
      conversaId,
      phone,
      clienteNome,
      messageText,
      messageId,
      totalMessages,
      hasBitrixLead: !!conversa?.bitrix24_lead_id,
      agentName: currentAgentConfig?.name || 'sofIA',
      sendWhatsAppMessage,
    });
    
    if (greetingPhaseResult.handled && greetingPhaseResult.response) {
      console.log(`[GREETING_PHASE] ✅ Handled: type=${greetingPhaseResult.greetingType}, infoRequest=${greetingPhaseResult.infoRequestDetected}`);
      return greetingPhaseResult.response;
    }
    
    // ═══════════════════════════════════════════════════════════════
    // POST-GREETING HANDLER - Handles response after Cláusula Pétrea
    // Transitions from TRIAGEM → QUALIFICAÇÃO when client responds
    // ═══════════════════════════════════════════════════════════════
    const dadosForPostGreeting = (conversa?.dados_coletados as Record<string, unknown>) || {};
    
    if (isAwaitingPostGreetingResponse(dadosForPostGreeting)) {
      console.log(`[POST_GREETING] Detected awaiting_clausula_petrea_response state`);
      
      const postGreetingResult = await handlePostGreetingResponse({
        supabase,
        conversaId,
        phone,
        clienteNome: clienteNomeForPhases || clienteNome,
        messageText,
        messageId,
        dadosColetados: dadosForPostGreeting,
        sendWhatsAppMessage,
      });
      
      if (postGreetingResult.handled && postGreetingResult.response) {
        console.log(`[POST_GREETING] ✅ Handled: action=${postGreetingResult.action}, transitioned=${postGreetingResult.transitionedToQualification}`);
        return postGreetingResult.response;
      }
    }

    await resetNudgeState(supabase, conversaId);

    // Master offer flow
    const masterOfferContext: MasterOfferContext = {
      masterOfferAt: conversa?.master_offer_at as string | null,
      masterOfferExpiresAt: conversa?.master_offer_expires_at as string | null,
      masterOfferAccepted: conversa?.master_offer_accepted as boolean | null,
      existingDados: (conversa?.dados_coletados as ExtractedClientData) || {},
    };
    
    const masterOfferResult = await handleMasterOfferFlow({
      supabase,
      conversaId,
      phone,
      clienteNome,
      messageText,
      context: masterOfferContext,
      propostaId: conversa?.proposta_id as string | null,
      bitrixLeadId: conversa?.bitrix24_lead_id as string | null,
      agentName: currentAgentConfig?.name,
      detectMasterOfferAcceptance: (msg: string) => detectMasterOfferAcceptance(msg, detectionPatterns),
    });
    
    if (masterOfferResult.handled && masterOfferResult.accepted) {
      console.log(`[MASTER_OFFER] Accepted`);
      if (conversa && masterOfferResult.updatedDados) {
        conversa.master_offer_accepted = true;
        conversa.dados_coletados = masterOfferResult.updatedDados;
      }
    }
    
    if (masterOfferResult.expired) console.log(`[MASTER_OFFER] Expired`);

    // Pending task timeout
    const pendingTask = conversa?.pending_task as PendingTaskType;
    const pendingTaskCreatedAt = conversa?.pending_task_created_at as string | null;
    const pendingTaskRetries = (conversa?.pending_task_retries as number) || 0;
    
    if (pendingTask && pendingTaskCreatedAt) {
      const taskAge = Date.now() - new Date(pendingTaskCreatedAt).getTime();
      
      if (taskAge > getPendingTaskTimeoutMs()) {
        console.log(`[sofia-webhook] Pending task "${pendingTask}" has timed out (${Math.round(taskAge / 1000)}s old)`);
        
        const timeoutResult = await handlePendingTaskTimeout(
          supabase,
          {
            id: conversaId,
            cliente_telefone: phone,
            cliente_nome: clienteNome,
            pending_task: pendingTask,
            pending_task_retries: pendingTaskRetries,
            dados_coletados: (conversa?.dados_coletados as ExtractedClientData) || null,
          },
          sendWhatsAppMessage
        );
        
        if (timeoutResult.actionTaken) {
          console.log(`[sofia-webhook] Pending task timeout handled: ${timeoutResult.escalated ? 'escalated' : 'asked for data'}`);
          
          // If escalated, return early - don't process further
          if (timeoutResult.escalated) {
            return new Response(JSON.stringify({
              status: 'pending_task_timeout',
              conversaId,
              escalated: true,
              action: 'timeout_escalation',
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
          
          // If asked for missing data, also return - let the lead respond
          return new Response(JSON.stringify({
            status: 'pending_task_timeout',
            conversaId,
            escalated: false,
            action: 'asked_missing_data',
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
    }

    // NOTE: Message persistence is now handled by Intake Layer (Phase 19) above
    // The saveIncomingMessageWithContext call has been removed to avoid duplicates
    // See executeIntakeLayer() at line ~1320

    // ═══════════════════════════════════════════════════════════════
    // HOT LEAD DETECTION - Using lead-processing-phase module
    // Phase 88: Real-time alerts for leads showing purchase intent
    // ═══════════════════════════════════════════════════════════════
    const hotLeadResult = await processHotLeadFlow(
      supabase,
      messageText,
      conversa ? {
        id: conversa.id,
        cliente_nome: conversa.cliente_nome,
        cliente_telefone: conversa.cliente_telefone,
        cliente_email: conversa.cliente_email,
        bitrix24_lead_id: conversa.bitrix24_lead_id,
        proposta_id: conversa.proposta_id,
        dados_coletados: conversa.dados_coletados as Record<string, unknown>,
      } : null,
      (conversa?.dados_coletados as Record<string, unknown>) || null,
      detectionPatterns
    );
    
    if (hotLeadResult.detected) {
      console.log(`[HOT_LEAD] 🔥 Closing intent detected via module: "${hotLeadResult.pattern}"`);
    }

    // If an energy invoice was detected, create/update lead in Bitrix24
    let bitrixLeadCreated = false;
    let bitrixLeadId: string | undefined;
    
// ═══════════════════════════════════════════════════════════════
    // DATA COLLECTION PHASE - Extracted to _shared/sofia-orchestrator/data-collection-phase.ts
    // Handles: data extraction, typo analysis, media parsing, value inference,
    // critical field persistence, and FSM check
    // ═══════════════════════════════════════════════════════════════
    // CRITICAL: Use 'let' so we can propagate merged data to subsequent phases
    let existingDados = (conversa?.dados_coletados as ExtractedClientData) || {};
    
    const dataCollectionResult = await executeDataCollectionPhase({
      supabase,
      conversaId,
      phone,
      clienteNome,
      messageText,
      messageId,
      agentId: requestAgentId,
      conversa: conversa ? {
        id: conversa.id,
        cliente_email: conversa.cliente_email,
        cliente_nome: conversa.cliente_nome,
        dados_coletados: conversa.dados_coletados,
        sofia_mode: conversa.sofia_mode,
        bitrix24_stage: conversa.bitrix24_stage,
        proposta_id: conversa.proposta_id,
        proposta_link_sent_at: conversa.proposta_link_sent_at,
        event_proposal_sent: conversa.event_proposal_sent,
        all_docs_complete_at: conversa.all_docs_complete_at,
        contrato_enviado_at: conversa.contrato_enviado_at,
        contrato_assinado_at: conversa.contrato_assinado_at,
      } : null,
      existingDados,
      mediaAnalysisResult: mediaAnalysisResult ? {
        analysis: mediaAnalysisResult.analysis || '',
        base64Data: mediaAnalysisResult.base64Data,
        mimeType: mediaAnalysisResult.mimeType,
        isInvoice: mediaAnalysisResult.isInvoice,
      } : null,
      isAnalyzedImage,
      isAnalyzedDocument,
      isTranscribedAudio,
      lovableApiKey: LOVABLE_API_KEY,
      sendWhatsAppMessage,
      validarDistribuidora,
    });
    
    // Use extracted data from the phase result
    let extractedData = dataCollectionResult.extractedData;
    const persistenceResult = dataCollectionResult.persistenceResult;
    
    // ═══════════════════════════════════════════════════════════════
    // CRITICAL: PROPAGATE MERGED STATE TO ALL SUBSEQUENT PHASES
    // After data collection, update existingDados and conversa.dados_coletados
    // so that ALL downstream phases (guardrails, FSM, LLM, Response) see fresh data.
    // This prevents "repeated questions" bug where Sofia asks for data already provided.
    // ═══════════════════════════════════════════════════════════════
    const mergedDadosFromCollection = dataCollectionResult.mergedData;
    existingDados = mergedDadosFromCollection;
    if (conversa) {
      conversa.dados_coletados = mergedDadosFromCollection;
    }
    console.log(`[STATE_PROPAGATION] ✅ Updated existingDados with merged data:`, {
      nome: mergedDadosFromCollection.nome,
      email: mergedDadosFromCollection.email,
      distribuidora: mergedDadosFromCollection.distribuidora,
      valorFatura: mergedDadosFromCollection.valorFatura,
      consumo: mergedDadosFromCollection.consumo,
    });
    
    // ═══════════════════════════════════════════════════════════════
    // CRITICAL: PRE-LLM HARD STOPS - Phase 85
    // Executes deterministic business rules BEFORE LLM processing:
    // 1. Minimum Bill Threshold (R$ 300) - Discard leads below threshold
    // 2. Recent Disqualification Block - Prevent re-entry within 30 days
    // 3. Triage Context Bypass - Skip triage if commercial data exists
    // 4. Email Requirement - Block proposal generation without email
    // ═══════════════════════════════════════════════════════════════
    const hardStopCtx: HardStopContext = {
      phone,
      messageText: effectiveMessageText, // Use merged text from buffer
      conversaId: conversaId || null,
      agentId: requestAgentId,
      extractedData,
      existingDados,
      conversa: conversa ? {
        id: conversa.id,
        bitrix24_stage: conversa.bitrix24_stage as string | null,
        proposta_id: conversa.proposta_id as string | null,
        sofia_mode: conversa.sofia_mode as string | null,
        ended_at: conversa.ended_at as string | null,
        dados_coletados: conversa.dados_coletados as Record<string, unknown> | null,
      } : null,
      propostaId: (conversa?.proposta_id as string) || null,
      proposalUrl: ((existingDados as any).proposal_url as string) || ((existingDados as any).public_proposal_url as string) || null,
    };
    
    const hardStopResult = await executePreLLMHardStops(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      hardStopCtx
    );
    
    if (hardStopResult.blocked) {
      console.log(`[HARD_STOP] ⛔ ${hardStopResult.blockType}: ${hardStopResult.discardReason || 'blocked'}`);
      
      if (hardStopResult.responseMessage) {
        await sendWhatsAppMessage(phone, hardStopResult.responseMessage);
        
        await supabase.from('chatbot_mensagens').insert({
          conversa_id: conversaId,
          role: 'assistant',
          content: hardStopResult.responseMessage,
        });
      }
      
      if (hardStopResult.shouldDiscard && conversaId) {
        // Mark as discarded and cleanup automations
        await supabase
          .from('chatbot_conversas')
          .update({
            sofia_mode: 'descartado',
            ended_at: new Date().toISOString(),
            next_followup_at: null,
            next_nudge_at: null,
            next_rescue_at: null,
            next_contract_nudge_at: null,
            pending_task: null,
            awaiting_response: false,
            dados_coletados: {
              ...existingDados,
              ...extractedData,
              motivoDescarte: hardStopResult.discardReason,
            },
          })
          .eq('id', conversaId);
      }
      
      return new Response(JSON.stringify({
        status: 'hard_stop_blocked',
        blockType: hardStopResult.blockType,
        discarded: hardStopResult.shouldDiscard,
        discardReason: hardStopResult.discardReason,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // Log if triage was bypassed
    if (hardStopResult.skipTriage) {
      console.log(`[HARD_STOP] ✅ Triage bypass: ${hardStopResult.triageBypassReason}`);
    }
    
    // ═══════════════════════════════════════════════════════════════
    // GUIDED SCRIPT FSM - Strict funnel flow control
    // Intercepts off-script attempts and redirects client to current step
    // WITH FULL OBSERVABILITY LOGGING
    // ═══════════════════════════════════════════════════════════════
    const guidedScriptEnabled = await (async () => {
      const { data: cfg } = await supabase
        .from('configuracoes_sistema')
        .select('valor')
        .eq('chave', 'guided_script_enabled')
        .maybeSingle();
      return cfg?.valor !== 'false';
    })();
    
    // Initialize FSM Observer for detailed logging
    const fsmObserver = createFSMObserver({
      traceId: `fsm-${conversaId || Date.now()}`,
      conversaId,
      agentId: requestAgentId,
      phone,
      supabase,
    });
    
    if (guidedScriptEnabled && conversa && requestAgentId === 'sofia') {
      const fsmStartTime = Date.now();
      
      // Build FSM context from current conversation state
      const mergedDadosForFSM = { ...existingDados, ...extractedData } as ExtractedClientData;
      const proposalUrlForFSM = (existingDados as any).proposal_url || 
                                (existingDados as any).public_proposal_url || 
                                ((conversa?.dados_coletados as any)?.proposal_url) || null;
      
      const fsmContext = buildFSMContext({
        conversa: {
          id: conversa.id,
          proposta_id: conversa.proposta_id as string | null,
          proposta_link_sent_at: conversa.proposta_link_sent_at as string | null,
          event_proposal_sent: conversa.event_proposal_sent as boolean | null,
          all_docs_complete_at: conversa.all_docs_complete_at as string | null,
          contrato_enviado_at: conversa.contrato_enviado_at as string | null,
          contrato_assinado_at: conversa.contrato_assinado_at as string | null,
          dados_coletados: conversa.dados_coletados as Record<string, unknown> | null,
          sofia_mode: conversa.sofia_mode as string | null,
          bitrix24_stage: conversa.bitrix24_stage as string | null,
        },
        dadosColetados: mergedDadosForFSM,
        proposalUrl: proposalUrlForFSM,
        clienteNome,
      });
      
      // Log context build with conditions
      fsmObserver.logContextBuilt(fsmContext);
      logFSMConditionsSnapshot(fsmContext.currentState, fsmContext.conditions);
      
      // Log individual data collection status for each key field
      const dataFields = ['nome', 'email', 'distribuidora', 'valorFatura', 'consumo', 'cpf', 'cnpj', 'tipoInstalacao'];
      for (const field of dataFields) {
        const value = (mergedDadosForFSM as any)[field];
        if (value !== undefined) {
          fsmObserver.logDataCollected({
            currentState: fsmContext.currentState,
            field,
            value: typeof value === 'string' ? value.substring(0, 20) : value,
            source: 'extraction',
            isValid: !!value,
            conditions: fsmContext.conditions,
          });
        }
      }
      
      console.log(`[GUIDED_SCRIPT] Current state: ${fsmContext.currentState} (${FSM_STATE_LABELS[fsmContext.currentState]})`);
      
      // Execute FSM check
      const fsmResult = executeFSMCheck({
        supabase,
        messageText,
        fsmContext,
        templates: getTemplateCache() || undefined,
        agentId: requestAgentId,
      });
      
      // Log FSM check execution
      fsmObserver.logFSMCheck({
        currentState: fsmContext.currentState,
        shouldBlock: fsmResult.shouldBlock,
        isOffScript: fsmResult.isOffScript,
        autoTransitionTo: fsmResult.autoTransition.shouldTransition ? fsmResult.autoTransition.newState : undefined,
        durationMs: Date.now() - fsmStartTime,
      });
      
      if (fsmResult.shouldBlock && fsmResult.redirectMessage) {
        console.log(`[GUIDED_SCRIPT] ⚠️ Off-script detected: ${fsmResult.intendedAction} - redirecting to current step`);
        
        // Log off-script detection
        fsmObserver.logOffScript({
          currentState: fsmContext.currentState,
          intendedAction: fsmResult.intendedAction || 'unknown',
          patternMatched: 'detected',
          redirectMessage: fsmResult.redirectMessage,
          wasBlocked: true,
        });
        
        // Send redirect message
        await sendWhatsAppMessage(phone, fsmResult.redirectMessage);
        
        // Save to messages
        await supabase.from('chatbot_mensagens').insert({
          conversa_id: conversaId,
          role: 'assistant',
          content: fsmResult.redirectMessage,
        });
        
        // Log as guardrail event for monitoring
        await supabase.from('sofia_guardrail_events').insert({
          conversa_id: conversaId,
          cliente_telefone: phone,
          cliente_nome: clienteNome,
          agent_id: requestAgentId,
          category: 'triagem_indevida',
          block_type: 'guided_script_redirect',
          severity: 'info',
          original_message: messageText,
          corrected_message: fsmResult.redirectMessage,
          context: {
            currentState: fsmResult.currentState,
            intendedAction: fsmResult.intendedAction,
            stateLabel: FSM_STATE_LABELS[fsmResult.currentState],
            fsmConditions: fsmContext.conditions,
          },
          status: 'open',
        });
        
        // Update last message timestamps
        await supabase
          .from('chatbot_conversas')
          .update({
            last_message_at: new Date().toISOString(),
            last_sofia_message_at: new Date().toISOString(),
          })
          .eq('id', conversaId);
        
        // Persist FSM logs async (non-blocking)
        fsmObserver.persistAsync().catch(err => console.error('[FSM_OBS] Persist error:', err));
        
        return new Response(JSON.stringify({
          status: 'guided_script_redirect',
          currentState: fsmResult.currentState,
          stateLabel: FSM_STATE_LABELS[fsmResult.currentState],
          intendedAction: fsmResult.intendedAction,
          redirectMessage: fsmResult.redirectMessage,
          fsmSummary: fsmObserver.getSummary(),
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      // Check for auto-transition
      if (fsmResult.autoTransition.shouldTransition) {
        const previousState = fsmContext.currentState;
        const newState = fsmResult.autoTransition.newState;
        
        console.log(`[GUIDED_SCRIPT] ✅ Auto-transition: ${previousState} → ${newState}`);
        
        // Log the transition
        fsmObserver.logTransition({
          from: previousState,
          to: newState,
          trigger: 'auto',
          conditions: fsmContext.conditions,
          bitrixStage: conversa.bitrix24_stage as string | undefined,
        });
        
        // State transitions happen naturally through the webhook flow
      }
      
      // Persist FSM logs async (non-blocking)
      fsmObserver.persistAsync().catch(err => console.error('[FSM_OBS] Persist error:', err));
    }
    
    // ═══════════════════════════════════════════════════════════════
    // DOCUMENT COLLECTION FOR DEFINITIVE PROPOSAL
    // When in proposta_inicial_enviada stage and client sends image/PDF,
    // detect document type, update arquivos_anexados, and auto-advance
    // ═══════════════════════════════════════════════════════════════
    const currentBitrixStage = conversa?.bitrix24_stage as string | null;
    const hasPropostaId = !!conversa?.proposta_id;
    const hasContratoEnviado = !!conversa?.contrato_enviado_at;
    
    // ═══════════════════════════════════════════════════════════════
    // DOCUMENT COLLECTION FLOW - NOW HANDLED BY _shared/document-collection-flow.ts (Phase 5)
    // Function: processDocumentCollectionFlow
    // ═══════════════════════════════════════════════════════════════
    if ((isAnalyzedImage || isAnalyzedDocument) && mediaAnalysisResult) {
      const docFlowResult = await processDocumentCollectionFlow({
        supabase,
        conversaId,
        phone,
        clienteNome,
        messageText,
        mediaAnalysisResult: {
          analysis: mediaAnalysisResult?.analysis || '',
          base64Data: mediaAnalysisResult?.base64Data || '',
          mimeType: isAnalyzedDocument ? 'application/pdf' : 'image/jpeg',
          isInvoice: mediaAnalysisResult?.isInvoice || false,
        },
        existingDados,
        extractedData,
        conversa: conversa ? {
          id: conversaId,
          bitrix24_stage: conversa.bitrix24_stage as string | undefined,
          bitrix24_lead_id: conversa.bitrix24_lead_id as string | undefined,
          proposta_id: conversa.proposta_id as string | undefined,
          contrato_enviado_at: conversa.contrato_enviado_at as string | undefined,
          sofia_mode: conversa.sofia_mode as string | undefined,
          arquivos_anexados: conversa.arquivos_anexados as string[] | undefined,
          docs_received_whatsapp: (conversa as any)?.docs_received_whatsapp,
          docs_received_page: (conversa as any)?.docs_received_page,
          dados_coletados: conversa.dados_coletados as any,
        } : null,
        sendMessage: sendWhatsAppMessage,
        agentConfig: currentAgentConfig,
        totalMessages: totalMessages || 0,
      });
      
      if (docFlowResult.handled) {
        console.log(`[DOCUMENT_COLLECTION] Flow handled with status: ${docFlowResult.status}`);
        
        return new Response(JSON.stringify({
          status: docFlowResult.status === 'waiting_tipo_instalacao' ? 'waiting_tipo_instalacao' : 
                  docFlowResult.status === 'lead_moved' ? 'document_collected' : 'document_collected',
          conversaId,
          documentType: docFlowResult.documentType,
          documentsComplete: docFlowResult.documentsComplete,
          remaining: docFlowResult.missingDocuments,
          divergencesFound: docFlowResult.divergencesFound,
          tipoInstalacao: docFlowResult.tipoInstalacao,
          leadMoved: docFlowResult.leadMoved,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }
    
    // ═══════════════════════════════════════════════════════════════
    // PROPOSAL DELAY COMPLAINT DETECTION (Auto-Rescue)
    // Check if client is complaining about proposal delay BEFORE normal processing
    // ═══════════════════════════════════════════════════════════════
    const isProposalDelayComplaint = !isAnalyzedImage && !isAnalyzedDocument && !isTranscribedAudio && detectProposalDelayComplaint(messageText);
    
    if (isProposalDelayComplaint) {
      console.log(`[AUTO-RESCUE] Detected proposal delay complaint: "${messageText.substring(0, 100)}"`);
      
      const autoRescueResult = await handleProposalDelayComplaint(
        supabase,
        conversaId,
        phone,
        clienteNome,
        { ...existingDados, ...extractedData },
        conversa?.bitrix24_lead_id as string | null,
        conversa?.bitrix24_stage as string | null
      );
      
      if (autoRescueResult.triggered && autoRescueResult.message) {
        // Send the auto-rescue response
        await sendWhatsAppMessage(phone, autoRescueResult.message);
        
        // Save bot message
        await supabase.from('chatbot_mensagens').insert({
          conversa_id: conversaId,
          role: 'assistant',
          content: autoRescueResult.message,
        });
        
        // Update conversation metrics
        await supabase
          .from('chatbot_conversas')
          .update({
            last_sofia_message_at: new Date().toISOString(),
            total_messages: (totalMessages || 0) + 2,
          })
          .eq('id', conversaId);
        
        // If successfully rescued or escalated, return early
        if (autoRescueResult.rescued || autoRescueResult.escalated) {
          return new Response(JSON.stringify({
            status: 'auto_rescue_handled',
            conversaId,
            rescued: autoRescueResult.rescued,
            escalated: autoRescueResult.escalated,
            newStage: autoRescueResult.newStage,
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        // If we just asked for missing data, return early too
        if (autoRescueResult.missingData && autoRescueResult.missingData.length > 0) {
          return new Response(JSON.stringify({
            status: 'auto_rescue_asked_data',
            conversaId,
            missingData: autoRescueResult.missingData,
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
    }
    
    // ═══════════════════════════════════════════════════════════════
    // FAST-PATH HANDLERS - Now using _shared/fast-path-handlers.ts (Phase 36)
    // Handles billing education, economy simulation, document complaint
    // ═══════════════════════════════════════════════════════════════
    const fastPathCtx: FastPathContext = {
      supabase,
      conversaId,
      phone,
      clienteNome,
      messageText,
      existingDados,
      extractedData,
      conversa,
      totalMessages: totalMessages || 0,
      sendMessage: sendWhatsAppMessage,
      isAnalyzedImage,
      isAnalyzedDocument,
      isTranscribedAudio,
      crmContext, // NEW: Pass CRM pre-check context for stage-based fast-paths
      agentConfig: currentAgentConfig, // Phase 92: Pass agent config for typing indicator
    };
    
    const fastPathResult = await processAllFastPaths(fastPathCtx);
    
    if (fastPathResult.handled) {
      return new Response(JSON.stringify({
        status: fastPathResult.status,
        ...fastPathResult.response,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // ═══════════════════════════════════════════════════════════════
    // TIPO DE INSTALAÇÃO RESPONSE - NOW HANDLED BY _shared/document-collection-flow.ts
    // Function: handleTipoInstalacaoResponse (imported at top of file)
    // ═══════════════════════════════════════════════════════════════
    if (existingDados.aguardandoTipoInstalacao) {
      console.log(`[TIPO_INSTALACAO] Client is awaiting tipoInstalacao response. Processing message: "${messageText.substring(0, 50)}"`);
      
      const tipoResult = await handleTipoInstalacaoResponse(
        supabase,
        conversaId,
        phone,
        clienteNome,
        messageText,
        existingDados,
        conversa as any,
        sendWhatsAppMessage,
        currentAgentConfig,
        totalMessages || 0
      );
      
      // ═══════════════════════════════════════════════════════════════
      // CRITICAL FIX: Return early if handled=true, regardless of detected
      // This prevents fallthrough to generic AI response when we re-ask
      // ═══════════════════════════════════════════════════════════════
      if (tipoResult.handled) {
        if (tipoResult.detected) {
          // Successfully detected and processed
          return new Response(JSON.stringify({
            status: 'tipo_instalacao_processed',
            conversaId,
            tipoInstalacao: tipoResult.tipoInstalacao,
            leadMoved: tipoResult.leadMoved,
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } else {
          // Could not detect, but re-asked the client - DO NOT fall through to AI
          console.log(`[TIPO_INSTALACAO] ⚠️ Re-asked client for tipoInstalacao. NOT proceeding to generic AI.`);
          return new Response(JSON.stringify({
            status: 'tipo_instalacao_reask',
            conversaId,
            message: 'Re-asked client for installation type',
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
      
      // If handled=false, continue normally (shouldn't happen if aguardandoTipoInstalacao is true)
      console.log(`[TIPO_INSTALACAO] Unexpected: handled=false while aguardandoTipoInstalacao=true`);
    }
    
    // ═══════════════════════════════════════════════════════════════
    // AUDIO PREFERENCE HANDLING - Now using _shared/audio-handler.ts (Phase 37)
    // Handles direct audio requests, acceptance, and rejection
    // ═══════════════════════════════════════════════════════════════
    const audioSettings = await getSofiaAudioSettings(supabase);
    
    const audioPrefCtx: AudioPreferenceContext = {
      supabase,
      conversaId,
      phone,
      messageText,
      conversa,
      detectionPatterns,
      sendWhatsAppMessage,
      sendVoiceMessage,
    };
    
    const audioPrefResult = await processAudioPreference(audioPrefCtx);
    
    // If audio preference handling resulted in an early return
    if (audioPrefResult.handled && audioPrefResult.response) {
      return new Response(JSON.stringify(audioPrefResult.response), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // Use values from the audio preference result
    const clienteAceitaAudio = audioPrefResult.clienteAceitaAudio;
    const audioPreferenceJustSet = audioPrefResult.audioPreferenceJustSet;
    const handleDirectAudioRequest = audioPrefResult.handleDirectAudioRequest;

    // ═══════════════════════════════════════════════════════════════
    // CONFIRMATION HANDLERS - Now using _shared/confirmation-handlers.ts (Phase 38)
    // Handles bill value, email, and CPF/CNPJ confirmations
    // ═══════════════════════════════════════════════════════════════
    const confirmationCtx: ConfirmationContext = {
      supabase,
      conversaId,
      phone,
      clienteNome,
      messageText,
      existingDados,
      extractedData,
      conversa,
      sendWhatsAppMessage,
    };
    
    const confirmationResult = await processAllConfirmations(confirmationCtx);
    
    // If any confirmation handler requires early return
    if (confirmationResult.earlyReturn && confirmationResult.response) {
      return new Response(JSON.stringify(confirmationResult.response), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // Apply any updates to extractedData from confirmations
    if (confirmationResult.updatedExtractedData) {
      Object.assign(extractedData, confirmationResult.updatedExtractedData);
    }
    
    // ═══════════════════════════════════════════════════════════════
    // DISTRIBUTOR VALIDATION FLOW - Now using _shared/distribuidora-handler.ts (Phase 41)
    // Handles validation, clarification, and rejection with Bitrix JUNK update
    // ═══════════════════════════════════════════════════════════════
    const distributorValidationCtx: DistributorValidationContext = {
      supabase,
      conversaId,
      phone,
      messageText,
      existingDados,
      extractedData,
      conversa: conversa ? {
        bitrix24_lead_id: conversa.bitrix24_lead_id as string | null,
        sofia_mode: conversa.sofia_mode as string | null,
        ended_at: conversa.ended_at as string | null,
      } : null,
      sendMessage: sendWhatsAppMessage,
      validarDistribuidora,
    };
    
    // First check for clarification response (user confirming which NEOENERGIA/CPFL)
    const clarificationResult = await handleDistributorClarificationResponse(distributorValidationCtx);
    
    if (clarificationResult.handled) {
      if (clarificationResult.extractedDataUpdates) {
        Object.assign(extractedData, clarificationResult.extractedDataUpdates);
      }
      
      if (clarificationResult.response) {
        return new Response(JSON.stringify(clarificationResult.response), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      // If handled but no response, continue with updated extractedData
    }
    
    // ═══════════════════════════════════════════════════════════════
    // AUDIO TRANSCRIPTION GUARD: If distribuidora was extracted from audio,
    // do NOT auto-validate/disqualify. Mark as pending confirmation so the
    // LLM asks the client to confirm before proceeding.
    // ═══════════════════════════════════════════════════════════════
    const distribuidoraFromAudio = isTranscribedAudio && extractedData.distribuidora && !existingDados.distribuidora;
    
    if (distribuidoraFromAudio) {
      console.log(`[VALIDATION_GUARD] 🎤 Distribuidora "${extractedData.distribuidora}" veio de áudio transcrito — marcando como pendente de confirmação`);
      
      // Save as pending confirmation in dados_coletados — LLM will ask client to confirm
      await supabase.from('chatbot_conversas').update({
        dados_coletados: {
          ...(conversa?.dados_coletados as Record<string, unknown> || {}),
          distribuidora_pendente_confirmacao: extractedData.distribuidora,
          distribuidora_fonte: 'audio_transcrito',
        },
      }).eq('id', conversaId);
      
      // Remove distribuidora from extractedData so validation doesn't trigger
      const distribuidoraPendente = extractedData.distribuidora;
      delete extractedData.distribuidora;
      
      console.log(`[VALIDATION_GUARD] Distribuidora "${distribuidoraPendente}" salva como pendente — LLM perguntará ao cliente`);
    } else {
      // Normal flow: validate distributor (new or not yet validated)
      const distributorValidationResult = await handleDistributorValidationFlow(distributorValidationCtx);
      
      if (distributorValidationResult.handled) {
        if (distributorValidationResult.response) {
          return new Response(JSON.stringify(distributorValidationResult.response), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
      
      // Apply any updates from validation
      if (distributorValidationResult.extractedDataUpdates) {
        Object.assign(extractedData, distributorValidationResult.extractedDataUpdates);
      }
    }
    
    // ═══════════════════════════════════════════════════════════════
    // DISQUALIFICATION FLOW - NOW HANDLED BY _shared/disqualification-flow.ts (Phase 13)
    // Functions: handleDisqualificationFlow (Grupo A, Tarifa Social)
    // ═══════════════════════════════════════════════════════════════
    const disqualificationResult = await handleDisqualificationFlow({
      supabase,
      conversaId,
      phone,
      clienteNome,
      messageText,
      existingDados,
      extractedData,
      conversa: conversa ? {
        bitrix24_lead_id: conversa.bitrix24_lead_id as string | null,
        sofia_mode: conversa.sofia_mode as string | null,
      } : null,
      detectionPatterns,
      sendMessage: sendWhatsAppMessage,
      agentName: currentAgentConfig?.name || 'sofIA',
    });
    
    if (disqualificationResult.handled) {
      console.log(`[DISQ_FLOW] Lead disqualified: ${disqualificationResult.reason}`);
      return new Response(JSON.stringify({ 
        success: true, 
        message: `Lead disqualified: ${disqualificationResult.reason}`,
        reason: disqualificationResult.reason,
        bitrixUpdated: disqualificationResult.bitrixUpdated,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // NOTE: Clarification response handling was moved to handleDistributorClarificationResponse()
    // in _shared/distribuidora-handler.ts (Phase 41) - called above in the validation flow
    
    // ═══════════════════════════════════════════════════════════════
    // TYPO FLOW (Phase 63 - via _shared/typo-confirmation.ts)
    // Orchestrates confirmation check and detection in a single call
    // ═══════════════════════════════════════════════════════════════
    const typoFlowCtx: TypoFlowContext = {
      supabase,
      conversaId,
      phone,
      messageText,
      existingDados,
      extractedData,
      distribuidoraCache,
      validarDistribuidora,
      sendMessage: sendWhatsAppMessage,
      corsHeaders,
    };
    
    const typoFlowResult = await orchestrateTypoFlow(typoFlowCtx);
    
    if (typoFlowResult.handled && typoFlowResult.response) {
      return typoFlowResult.response;
    }
    
    // Apply any updates from typo flow
    if (typoFlowResult.extractedDataUpdates) {
      Object.assign(extractedData, typoFlowResult.extractedDataUpdates);
    }
    
    // ═══════════════════════════════════════════════════════════════
    // BITRIX SYNC FLOW - Phase 64: Now using orchestrateBitrixSyncFlow
    // Handles: hasNewData check, auto-advance, sync, proposal link
    // ═══════════════════════════════════════════════════════════════
    const bitrixSyncResult = await orchestrateBitrixSyncFlow({
      supabase,
      conversaId,
      phone,
      clienteNome,
      existingDados,
      extractedData,
      detectedInvoice,
      isAnalyzedDocument,
      isAnalyzedImage,
      mediaAnalysisResult: mediaAnalysisResult ? {
        base64Data: mediaAnalysisResult.base64Data,
        mimeType: mediaAnalysisResult.mimeType,
      } : null,
      hasMinimumDataForProposal,
      pendingTask,
    });
    
    // Update local variables from sync result
    if (bitrixSyncResult.synced) {
      bitrixLeadCreated = true;
      bitrixLeadId = bitrixSyncResult.leadId;
      
      // Handle proposal link sending
      if (bitrixSyncResult.propostaCreated && bitrixSyncResult.propostaId) {
        const proposalLinkCtx: ProposalLinkContext = {
          supabase,
          conversaId,
          phone,
          clienteNome,
          propostaId: bitrixSyncResult.propostaId,
          tipoProposta: 'inicial',
          enviarLinksEnabled: sofiaCapabilities.enviarLinks,
          sendWhatsAppMessage,
        };
        
        await handleProposalCreated(proposalLinkCtx, bitrixSyncResult, pendingTask);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // FUNNEL CONTEXT PHASE - Using funnel-context-phase module
    // Consolidates: score, proposal fetch, docs fetch, stage/mode determination, hesitation
    // ═══════════════════════════════════════════════════════════════
    const funnelContextResult = await executeFunnelContextPhase({
      supabase,
      conversaId,
      phone,
      clienteNome,
      messageText,
      agentId: requestAgentId,
      agentConfig: currentAgentConfig,
      conversa: conversa ? {
        id: conversa.id,
        proposta_id: conversa.proposta_id,
        bitrix24_lead_id: conversa.bitrix24_lead_id,
        bitrix24_stage: conversa.bitrix24_stage,
        contrato_enviado_at: conversa.contrato_enviado_at,
        sofia_mode: conversa.sofia_mode,
        lead_score: conversa.lead_score,
        dados_coletados: conversa.dados_coletados as Record<string, unknown>,
      } : null,
      extractedData,
      currentScore,
      currentMode,
      currentObjection,
      detectionPatterns,
      apiKey: LOVABLE_API_KEY || '',
      sofiaCapabilities: { modoCloser: sofiaCapabilities.modoCloser },
    });
    
    // Extract results from funnel context phase
    const funnelStage = funnelContextResult.funnelStage;
    const finalMode = funnelContextResult.sofiaMode;
    const newScore = funnelContextResult.newScore;
    const preMessageScore = Object.values(funnelContextResult.scoreBreakdown).reduce((sum, val) => sum + val, 0);
    const nextFollowupAt = funnelContextResult.nextFollowupAt;
    const propostaInfo = funnelContextResult.propostaInfo;
    const docsSubmittedViaPage = funnelContextResult.docsSubmittedViaPage;
    const hesitationDetected = funnelContextResult.hesitationDetected;
    const hesitationResult = funnelContextResult.hesitationResult;
    const detectedObjection = funnelContextResult.detectedObjection;
    const hasExplicitIntent = funnelContextResult.hasExplicitIntent;
    
    // ═══════════════════════════════════════════════════════════════
    // PRE-AI FLOWS - Phase 70: Consolidated into orchestratePreAIFlows
    // Handles: Human Cooldown + Discount Objection + Economy Confirmation
    // ═══════════════════════════════════════════════════════════════
    const preAIFlowCtx: PreAIFlowContext = {
      supabase,
      conversaId,
      phone,
      clienteNome,
      messageText: effectiveMessageText, // Use merged text from buffer
      messageId: messageId || null,
      existingDados,
      extractedData,
      conversa: conversa ? {
        last_human_message_at: conversa.last_human_message_at as string | null,
        master_offer_at: conversa.master_offer_at as string | null,
        has_simulation: conversa.has_simulation as boolean | null,
      } : null,
      propostaInfo,
      cooldownMs: HUMAN_COOLDOWN_MS,
      sendWhatsAppMessage,
      detectDiscountObjection: (msg: string) => detectDiscountObjection(msg, detectionPatterns),
      generateDiscountResponse: generateDiscountObjectionResponse,
      detectEconomyConfirmation: (msg: string) => detectEconomyConfirmation(msg, detectionPatterns),
      generateEconomyResponse: generateEconomyConfirmationResponse,
      agentName: currentAgentConfig?.name || 'sofIA',
    };
    
    const preAIFlowResult = await orchestratePreAIFlows(preAIFlowCtx);
    
    if (preAIFlowResult.earlyReturn) {
      return new Response(JSON.stringify({ 
        status: preAIFlowResult.status,
        ...preAIFlowResult.response,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // NOTE: Message persistence now guaranteed by Intake Layer (Phase 19)
    // The duplicate check/save logic has been removed - Intake Layer handles it all
    // See executeIntakeLayer() at the start of the main processing block
    // ═══════════════════════════════════════════════════════════════

    // ═══════════════════════════════════════════════════════════════
    // LLM PHASE - Delegated to orchestrator (Phase 81 refactoring)
    // Handles: History, spam, AI Gym config, RAG, prompt building, LLM call
    // ═══════════════════════════════════════════════════════════════
    const llmPhaseCtx: LLMPhaseContext = {
      supabase,
      conversaId,
      phone,
      clienteNome: clienteNomeForPhases, // Use multi-source extracted name
      messageText,
      effectiveMessageText,
      messageId: messageId || null,
      agentId: requestAgentId,
      conversa: conversa ? {
        id: conversa.id,
        dados_coletados: conversa.dados_coletados as Record<string, unknown> | null,
        sofia_mode: conversa.sofia_mode as string | null,
        proposta_id: conversa.proposta_id as string | null,
        bitrix24_stage: conversa.bitrix24_stage as string | null,
        bitrix24_lead_id: conversa.bitrix24_lead_id as string | null,
        total_messages: conversa.total_messages as number | null,
        last_human_message_at: conversa.last_human_message_at as string | null,
        master_offer_at: conversa.master_offer_at as string | null,
        has_simulation: conversa.has_simulation as boolean | null,
        escalation_reason: conversa.escalation_reason as string | null,
        human_agent_nome: conversa.human_agent_nome as string | null,
        arquivos_anexados: conversa.arquivos_anexados as unknown[] | null,
        docs_received_whatsapp: conversa.docs_received_whatsapp as unknown | null,
        audio_oferecido: conversa.audio_oferecido as boolean | null,
        needs_human_fallback: conversa.needs_human_fallback as boolean | null,
      } : null,
      existingDados: existingDados as any,
      extractedData: extractedData as any,
      propostaInfo: propostaInfo ? {
        id: propostaInfo.id,
        desconto_percentual: propostaInfo.desconto_percentual,
        public_url: (propostaInfo as any).public_url || null,
      } : null,
      finalMode,
      funnelStage,
      abVariant,
      isTranscribedAudio,
      isAnalyzedImage,
      isAnalyzedDocument,
      detectedObjection: detectedObjection as ObjectionType | null,
      hesitationDetected,
      hesitationResult: hesitationResult ? { reason: hesitationResult.result?.reason || null } : null,
      docsSubmittedViaPage: docsSubmittedViaPage !== null && typeof docsSubmittedViaPage === 'object' ? true : !!docsSubmittedViaPage,
      detectionPatterns,
      lovableApiKey: LOVABLE_API_KEY || '',
      sendWhatsAppMessage,
    };
    
    const llmPhaseResult = await executeLLMPhase(llmPhaseCtx);
    
    // If LLM phase handled the message (e.g., spam blocked), return early
    if (llmPhaseResult.handled && llmPhaseResult.response) {
      return llmPhaseResult.response;
    }
    
    const assistantMessage = llmPhaseResult.assistantMessage;
    const usedModel = llmPhaseResult.usedModel;
    
    // Update agent config from LLM phase (it loads fresh config)
    currentAgentConfig = llmPhaseResult.agentConfig;

    // ═══════════════════════════════════════════════════════════════
    // RESPONSE FINALIZATION PHASE - Using response-finalization-phase module
    // Handles: AI response processing, guardrails, race condition checks
    // ═══════════════════════════════════════════════════════════════
    const proposalUrlForProcessing = extractProposalUrl(
      extractedData as Record<string, unknown>,
      existingDados as Record<string, unknown>
    );
    
    const responseFinalizationResult = await executeResponseFinalizationPhase({
      supabase,
      conversaId,
      phone,
      clienteNome: clienteNomeForPhases, // Use multi-source extracted name
      messageText,
      assistantMessage: assistantMessage || '',
      agentConfig: currentAgentConfig,
      conversa: conversa ? {
        id: conversa.id,
        total_messages: conversa.total_messages,
        event_proposal_sent: conversa.event_proposal_sent,
        proposta_link_sent_at: conversa.proposta_link_sent_at,
        dados_coletados: conversa.dados_coletados as Record<string, unknown>,
      } : null,
      existingDados: existingDados as Record<string, unknown>,
      extractedData: extractedData as Record<string, unknown>,
      proposalUrl: proposalUrlForProcessing,
      sendWhatsAppMessage,
    });
    
    // Handle early returns from finalization phase
    if (responseFinalizationResult.handled && responseFinalizationResult.response) {
      return responseFinalizationResult.response;
    }
    
    // Extract results
    const cleanMessage = responseFinalizationResult.cleanMessage;
    const aiFailedCompletely = responseFinalizationResult.aiFailedCompletely;
    const needsHumanEscalation = responseFinalizationResult.needsHumanEscalation;
    
    // Update extractedData if master offer was detected
    if (responseFinalizationResult.masterOfferDetected && responseFinalizationResult.updatedExtractedData) {
      Object.assign(extractedData, responseFinalizationResult.updatedExtractedData);
    }
    
    // ═══════════════════════════════════════════════════════════════
    // PHASE 5: RESPONSE PHASE (Refactored to separate module)
    // Uses executeResponsePhase from sofia-orchestrator/response-phase.ts
    // Handles: Humanization, audio, proposal promise, escalation, rejection, cleanup
    // ═══════════════════════════════════════════════════════════════
    
    const messageFns: MessageFunctions = {
      sendText: async (p: string, m: string) => { await sendWhatsAppMessage(p, m); },
      sendAudio: async (p: string, t: string) => { await sendWhatsAppAudio(p, t); },
      safeSend: async (sb: any, cId: string, p: string, m: string) => { await safeSendWhatsAppMessage(sb, cId, p, m); },
      sendTypingIndicator: async (p: string, config: any) => { await sendTypingIndicatorWithAgent(p, config); },
    };
    
    const syncFns: SyncFunctions = {
      syncToBitrix: syncToBitrix,
      setPendingTask: setPendingTask,
      saveContactToWhatsApp: saveContactToWhatsApp,
      syncContactToCRM: syncContactToCRM,
    };
    
    const responsePhaseCtx: ResponsePhaseContext = {
      supabase,
      conversaId,
      phone,
      clienteNome,
      messageText,
      effectiveMessageText,
      agentId: requestAgentId,
      cleanMessage,
      assistantMessage: cleanMessage,
      usedModel,
      agentConfig: currentAgentConfig,
      conversa: conversa ? {
        id: conversaId,
        cliente_nome: conversa.cliente_nome as string | null,
        cliente_email: conversa.cliente_email as string | null,
        dados_coletados: conversa.dados_coletados as Record<string, unknown> | null,
        proposta_id: conversa.proposta_id as string | null,
        bitrix24_lead_id: conversa.bitrix24_lead_id as string | null,
        bitrix24_stage: conversa.bitrix24_stage as string | null,
        sofia_mode: conversa.sofia_mode as string | null,
        audio_oferecido: conversa.audio_oferecido as boolean | null,
        total_messages: totalMessages,
      } : null,
      existingDados: existingDados as Record<string, unknown>,  // Updated from data collection phase
      extractedData: extractedData as Record<string, unknown>,
      needsHumanEscalation,
      aiFailedCompletely,
      isTranscribedAudio,
      newScore,
      finalMode,
      totalMessages,
      detectedObjection: detectedObjection || null,
      nextFollowupAt: nextFollowupAt || null,
      funnelStage,
      detectedSentiment: null,
      audioSettings,
      clienteAceitaAudio: clienteAceitaAudio as boolean | null,
      audioPreferenceJustSet,
      handleDirectAudioRequest,
      bufferId: bufferResult?.bufferId,
      messageFns,
      syncFns,
      isAudioGloballyEnabled,
      evaluateResponseLegacy: async (cId, aId, uMsg, aMsg, stage, sent) => {
        await evaluateResponseLegacy(cId, aId, uMsg, aMsg, stage || 'unknown', sent);
      },
    };
    
    const responsePhaseResult = await executeResponsePhase(responsePhaseCtx);
    
    // CLÁUSULA PÉTREA: Mark response as sent to prevent duplicate fallback
    clausulaPetreaContext.responseSent = true;
    
    if (responsePhaseResult.handled && responsePhaseResult.response) {
      return responsePhaseResult.response;
    }

    return new Response(JSON.stringify({
      status: 'success',
      conversaId,
      leadScore: newScore,
      sofiaMode: finalMode,
      model: usedModel,
      audioSent: responsePhaseResult.audioSent,
      audioOffered: responsePhaseResult.audioOffered,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  }).catch(async (webhookError) => {
    const errorMessage = webhookError instanceof Error ? webhookError.message : 'Unknown error';
    console.error('[sofia-webhook] CRITICAL ERROR processing webhook:', webhookError);
    
    // ═══════════════════════════════════════════════════════════════
    // CLÁUSULA PÉTREA: RESPOSTA OBRIGATÓRIA
    // Sofia NUNCA pode ficar em silêncio - deve responder em TODAS circunstâncias
    // (exceto quando modo manual/#ASSUMIR estiver ativo)
    // ═══════════════════════════════════════════════════════════════
    const supabaseForError = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // Check if we have enough context to send fallback to client
    if (clausulaPetreaContext.phone && clausulaPetreaContext.agentConfig && !clausulaPetreaContext.responseSent) {
      console.log(`[CLÁUSULA_PÉTREA] ⚠️ Critical error detected - sending mandatory fallback to ${clausulaPetreaContext.phone}`);
      
      try {
        // Check if conversation is NOT in manual mode
        const { data: conversaCheck } = await supabaseForError
          .from('chatbot_conversas')
          .select('sofia_mode, id')
          .eq('cliente_telefone', clausulaPetreaContext.phone)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        
        const sofiaMode = conversaCheck?.sofia_mode || 'standard';
        const manualModes = ['paused_for_human', 'human_takeover', 'paused', 'manual'];
        
        // CLÁUSULA PÉTREA: Only send fallback if NOT in manual mode
        if (!manualModes.includes(sofiaMode)) {
          const firstName = clausulaPetreaContext.clienteNome?.split(' ')[0] || '';
          const greeting = firstName ? `${firstName}, ` : '';
          
          const fallbackMessage = `${greeting}desculpe, tive um problema técnico! 😅

Estou de volta agora - pode me contar o que você precisa? 💚

Se quiser, me passa o *valor da sua conta de luz* que eu faço uma simulação da sua economia! 😊`;
          
          // Send fallback via Z-API - load credentials fresh from database
          const { data: agentCreds } = await supabaseForError
            .from('ai_agents')
            .select('zapi_instance_id, zapi_token, zapi_security_token')
            .eq('agent_id', 'sofia')
            .single();
          
          if (agentCreds?.zapi_instance_id && agentCreds?.zapi_token) {
            const { sendWhatsAppMessage: sendFallback } = await import('../_shared/zapi-client.ts');
            await sendFallback(
              clausulaPetreaContext.phone,
              fallbackMessage,
              {
                zapi_instance_id: agentCreds.zapi_instance_id,
                zapi_token: agentCreds.zapi_token,
                zapi_security_token: agentCreds.zapi_security_token,
              }
            );
          
            console.log(`[CLÁUSULA_PÉTREA] ✅ Fallback sent successfully - Sofia continues operating`);
            
            // Save the fallback message in chat history
            if (conversaCheck?.id) {
              await supabaseForError.from('chatbot_mensagens').insert({
                conversa_id: conversaCheck.id,
                role: 'assistant',
                content: fallbackMessage,
                handler_type: 'clausula_petrea_fallback',
              });
              
              // Update conversation timestamp (Sofia continues - does NOT pause)
              await supabaseForError
                .from('chatbot_conversas')
                .update({ last_sofia_message_at: new Date().toISOString() })
                .eq('id', conversaCheck.id);
            }
            
            clausulaPetreaContext.responseSent = true;
          } else {
            console.log(`[CLÁUSULA_PÉTREA] ⚠️ No Z-API credentials available for fallback`);
          }
        } else {
          console.log(`[CLÁUSULA_PÉTREA] ⏸️ Skipping fallback - conversation in manual mode: ${sofiaMode}`);
        }
      } catch (fallbackError) {
        console.error(`[CLÁUSULA_PÉTREA] ❌ Failed to send fallback:`, fallbackError);
      }
    } else if (!clausulaPetreaContext.phone) {
      console.log(`[CLÁUSULA_PÉTREA] ⚠️ Cannot send fallback - phone not available (error occurred before parsing)`);
    } else if (clausulaPetreaContext.responseSent) {
      console.log(`[CLÁUSULA_PÉTREA] ✅ Response already sent - no additional fallback needed`);
    }
    
    // Best-effort admin notification about the error
    try {
      await supabaseForError.from('admin_notifications').insert({
        admin_user_id: null,
        title: '🚨 Erro crítico no webhook WhatsApp',
        message: `Erro não tratado: ${errorMessage}. ${clausulaPetreaContext.responseSent ? 'Fallback enviado ao cliente.' : 'NÃO foi possível enviar fallback.'}`,
        type: 'system_error',
        entity_id: clausulaPetreaContext.conversaId,
        entity_type: 'chatbot_conversa',
        created_by_nome: 'Sistema (Cláusula Pétrea)',
      });
    } catch (notifError) {
      console.error('[sofia-webhook] Failed to create error notification:', notifError);
    }
    
    return new Response(JSON.stringify({ 
      error: errorMessage,
      clausulaPetreaApplied: clausulaPetreaContext.responseSent,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  });
});
