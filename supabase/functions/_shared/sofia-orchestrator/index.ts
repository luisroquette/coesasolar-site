/**
 * SOFIA ORCHESTRATOR - MODULE INDEX
 * 
 * Exports all orchestrator phases for use in sofia-webhook
 * Each phase is isolated and testable independently
 * 
 * @module _shared/sofia-orchestrator
 */

// Phase 1: Operator Commands (RESET, STATUS, PING, ASSUMIR, RESOLVIDO, etc.)
export {
  executeOperatorPhase,
  isOperatorCommandMessage,
  type OperatorPhaseContext,
  type OperatorPhaseResult,
} from './operator-phase.ts';

// Phase 2: Triage (Existing client detection, MarIA flow, department routing)
export {
  executeTriagePhase,
  shouldExecuteTriagePhase,
  type TriagePhaseContext,
  type TriagePhaseResult,
  type TriagePhaseConversaData,
} from './triage-phase.ts';

// Phase 3: Data Collection (FSM-guided data extraction and persistence)
export {
  executeDataCollectionPhase,
  shouldExecuteDataCollectionPhase,
  type DataCollectionPhaseContext,
  type DataCollectionPhaseResult,
  type DataCollectionConversaData,
  type MediaAnalysisResult,
} from './data-collection-phase.ts';

// Phase 4: LLM (RAG + prompt building + LLM call)
export {
  executeLLMPhase,
  shouldExecuteLLMPhase,
  type LLMPhaseContext,
  type LLMPhaseResult,
  type LLMPhaseConversaData,
} from './llm-phase.ts';

// Phase 5: Response (Humanization + final message delivery)
export {
  executeResponsePhase,
  shouldExecuteResponsePhase,
  type ResponsePhaseContext,
  type ResponsePhaseResult,
  type ResponsePhaseConversaData,
  type MessageFunctions,
  type SyncFunctions,
} from './response-phase.ts';

// Phase 6: Context Building (Funnel stage, score, hesitation, pre-AI flows)
export {
  executeContextBuildingPhase,
  shouldExecuteContextBuildingPhase,
  type ContextBuildingPhaseContext,
  type ContextBuildingPhaseResult,
  type ContextBuildingConversaData,
} from './context-building-phase.ts';

// Phase 7: Fast-Path (Document flow, confirmations, audio preference)
export {
  executeFastPathPhase,
  shouldExecuteFastPathPhase,
  type FastPathPhaseContext,
  type FastPathPhaseResult,
  type FastPathConversaData,
  type MediaAnalysisData,
} from './fast-path-phase.ts';

// Phase 8: Validation (Distributor, typo, disqualification)
export {
  executeValidationPhase,
  shouldExecuteValidationPhase,
  type ValidationPhaseContext,
  type ValidationPhaseResult,
  type ValidationConversaData,
} from './validation-phase.ts';

// ═══════════════════════════════════════════════════════════════
// NEW PHASES - Webhook Reduction (Phase 74+)
// ═══════════════════════════════════════════════════════════════

// Phase 9: Webhook Initialization (Parsing, format detection, msgData construction)
export {
  executeWebhookInitialization,
  parseWebhookBody,
  logWebhookEvent,
  type WebhookInitializationContext,
  type WebhookInitializationResult,
  type ParsedWebhookData,
} from './webhook-initialization-phase.ts';

// Phase 10: Agent Lock (Real-time status check, cross-webhook locking)
export {
  executeAgentLockPhase,
  checkAgentStatusRealtime,
  acquireCrossWebhookLock,
  acquireCrossWebhookLockWithRetry,
  releaseCrossWebhookLock,
  saveMessageWhileInactive,
  type AgentLockPhaseContext,
  type AgentLockPhaseResult,
  type AgentStatusCheck,
  type CrossLockInfo,
} from './agent-lock-phase.ts';

// Phase 11: Conversation Lifecycle (Search, duplicates, pauses, takeover detection)
export {
  executeConversationLifecyclePhase,
  needsHumanFallbackLog,
  type ConversationLifecycleContext,
  type ConversationLifecycleResult,
  type ConversaData,
} from './conversation-lifecycle-phase.ts';

// Phase 12: Lead Processing (Hot lead detection, message saving with media context)
export {
  executeLeadProcessingPhase,
  processHotLeadFlow,
  saveIncomingMessageWithContext,
  getMediaMessagePrefix,
  shouldCreateBitrixLead,
  type LeadProcessingPhaseContext,
  type LeadProcessingPhaseResult,
  type LeadProcessingConversaData,
  type SaveMessageOptions as LeadSaveMessageOptions,
  type BitrixLeadTrigger,
} from './lead-processing-phase.ts';

// Phase 13: Funnel Context (Score calculation, proposal fetching, stage/mode determination)
export {
  executeFunnelContextPhase,
  calculateScores,
  fetchProposalContext,
  determineFunnelContext,
  executeHesitationFlow,
  type FunnelContextPhaseContext,
  type FunnelContextPhaseResult,
  type FunnelContextConversaData,
} from './funnel-context-phase.ts';

// Phase 14: Response Finalization (AI response processing, guardrails, race condition checks)
export {
  executeResponseFinalizationPhase,
  processAIResponseWithContext,
  applyGuardrailsFlow,
  checkRaceCondition,
  extractProposalUrl,
  type ResponseFinalizationContext,
  type ResponseFinalizationResult,
  type ResponseFinalizationConversaData,
} from './response-finalization-phase.ts';
// Phase 15: Global Pause (Sofia disabled check)
export {
  executeGlobalPausePhase,
  checkGlobalPauseStatus,
  type GlobalPauseContext,
  type GlobalPauseResult,
} from './global-pause-phase.ts';

// Phase 16: Greeting (First contact welcome)
export {
  executeGreetingPhase,
  isFirstContactMessage,
  type GreetingPhaseContext,
  type GreetingPhaseResult,
} from './greeting-phase.ts';

// Phase 17: Message Buffer (Humanized message accumulation)
export {
  executeMessageBufferPhase,
  type MessageBufferContext,
  type MessageBufferResult,
} from './message-buffer-phase.ts';

// Phase 18: Media Processing (Audio/Image/PDF analysis)
export {
  executeMediaProcessingPhase,
  type MediaProcessingContext,
  type MediaProcessingPhaseResult,
} from './media-processing-phase.ts';

// Phase 19: Intake Layer (GUARANTEED message persistence - MUST be first)
export {
  executeIntakeLayer,
  findOrCreateConversation,
  getMediaPrefix,
  persistOutboundMessage,
  validateMessagePersisted,
  getIntakeMetrics,
  type IntakeContext,
  type IntakeResult,
  type ExistingConversaData,
  type OutboundIntakeContext,
  type IntakeMetrics,
} from './intake-layer.ts';

// SHARED HELPERS (centralized utilities)
// ═══════════════════════════════════════════════════════════════

export {
  jsonResponse,
  successResponse,
  errorResponse,
  webhookAck,
  validationError,
  unauthorizedResponse,
  forbiddenResponse,
  notFoundResponse,
  rateLimitResponse,
} from '../response-helpers.ts';

export {
  saveMessage,
  saveUserMessage,
  saveAssistantMessage,
  getMessageHistory,
  type SaveMessageOptions,
  type HistoryMessage,
} from '../message-helpers.ts';

export {
  acquireLock,
  releaseLock,
  releaseLockSilent,
  withLock,
  isLocked,
  type LockAcquisitionResult,
  type LockPurpose,
} from '../lock-helpers.ts';

// ═══════════════════════════════════════════════════════════════
// AGENT ADAPTERS (Multi-agent behavior customization)
// ═══════════════════════════════════════════════════════════════

export {
  resolveAgentAdapter,
  getRegisteredAgentIds,
  hasAdapter,
  BaseAgentAdapter,
  CommonValidators,
  BaseOperatorCommands,
  createField,
  mergePipelineConfig,
  SofiaAdapter,
  MariaAdapter,
  JuliaAdapter,
  IagoAdapter,
  JaimeAdapter,
  type AgentAdapter,
  type AgentRole,
  type PipelineMode,
  type FastPathHandler,
  type FastPathConfig,
  type FieldDefinition,
  type FieldValidator,
  type FieldValidationResult,
  type TriageContext,
  type TriageDecision,
  type PipelineConfig,
  type MetricsConfig,
  type OperatorCommandDefinition,
  type ContextInjection,
  type PromptOverride,
  type EscalationRule,
  type EscalationContext,
  type EscalationDecision,
  type AdapterRegistry,
  type AdapterConfigOverride,
  type OverridableConfigKey,
} from './adapters/index.ts';

// ═══════════════════════════════════════════════════════════════
// OBSERVABILITY (Phase metrics, logging, persistence)
// ═══════════════════════════════════════════════════════════════

export {
  // Types
  type PhaseStatus,
  type PhaseMetric,
  type PhaseEndResult,
  type TraceContext,
  type PhaseTimer,
  type PhaseBottleneck,
  type MetricsSummary,
  type LogLevel,
  type StructuredLogEntry,
  type PhaseThreshold,
  type PhaseLogRecord,
  
  // Constants
  PHASE_THRESHOLDS,
  RETENTION_DAYS,
  LOG_BATCH_SIZE,
  BOTTLENECK_THRESHOLD_MS,
  PHASE_INDICES,
  LOG_PREFIX,
  STATUS_SYMBOLS,
  
  // Timer utilities
  PhaseTimerImpl,
  createPhaseTimer,
  measureAsync,
  measureSync,
  
  // Logging utilities
  structuredLog,
  createContextLogger,
  logPhaseWithThreshold,
  formatTraceId,
  logTraceSummary,
  
  // Metrics Collector
  PhaseMetricsCollector,
  createMetricsCollector,
  generateTraceId,
  
  // Persistence
  persistPhaseMetrics,
  persistMetricsSummary,
  persistAllMetrics,
  persistMetricsAsync,
  persistMetricsWithTimeout,
  getSlowPhases,
  getTraceById,
  
  // Factory function
  initializeObservability,
  withPhaseMetrics,
} from './observability/index.ts';
