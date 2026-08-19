/**
 * AGENT ADAPTER TYPES
 * 
 * Define interfaces and types for the multi-agent adapter system.
 * Enables different behaviors per agent without code duplication.
 * 
 * @module _shared/sofia-orchestrator/adapters/types
 */

// ═══════════════════════════════════════════════════════════════
// CORE ENUMS
// ═══════════════════════════════════════════════════════════════

/**
 * Agent roles in the system
 */
export type AgentRole = 
  | 'sales'           // sofIA - vendas inbound
  | 'sac'             // marIA - suporte ao cliente
  | 'collections'     // julIA - cobrança
  | 'outbound_sales'  // iagO - vendas outbound
  | 'support';        // jaimE - suporte técnico

/**
 * Pipeline processing modes
 */
export type PipelineMode = 
  | 'full_funnel'     // Complete sales funnel (sofIA)
  | 'service_desk'    // SAC/support flow (marIA, jaimE)
  | 'collections'     // Debt collection flow (julIA)
  | 'outbound';       // Proactive outreach (iagO)

// ═══════════════════════════════════════════════════════════════
// FIELD VALIDATION TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * Field validation result
 */
export interface FieldValidationResult {
  isValid: boolean;
  normalizedValue?: string | number | boolean;
  errorMessage?: string;
  suggestions?: string[];
}

/**
 * Field validator function signature
 */
export type FieldValidator = (
  value: string,
  context?: Record<string, unknown>
) => FieldValidationResult;

/**
 * Field definition for data collection
 */
export interface FieldDefinition {
  name: string;
  displayName: string;
  type: 'text' | 'email' | 'phone' | 'cpf' | 'cnpj' | 'currency' | 'number' | 'date' | 'select';
  required: boolean;
  priority: number; // Lower = ask first
  validator?: FieldValidator;
  promptTemplate?: string;
  errorTemplate?: string;
  alternatives?: string[]; // Field aliases
}

// ═══════════════════════════════════════════════════════════════
// TRIAGE TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * Context for triage decisions
 */
export interface TriageContext {
  messageText: string;
  phone: string;
  clienteNome?: string | null;
  conversaId?: string;
  hasBitrixLead: boolean;
  bitrixStage?: string | null;
  totalMessages: number;
  existingDados?: Record<string, unknown>;
  hasPropostaId: boolean;
}

/**
 * Triage decision result
 */
export interface TriageDecision {
  shouldTriage: boolean;
  redirectToAgent?: string;
  reason?: string;
  skipReason?: string;
}

// ═══════════════════════════════════════════════════════════════
// FAST-PATH TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * Fast-path handler identifiers
 */
export type FastPathHandler =
  // Sales (sofIA)
  | 'document_collection'
  | 'proposal_flow'
  | 'confirmation_handlers'
  | 'audio_preference'
  | 'discount_objection'
  | 'competitor_mention'
  | 'price_inquiry'
  | 'simulation_request'
  // SAC (marIA)
  | 'contract_status'
  | 'billing_inquiry'
  | 'complaint_handler'
  | 'ticket_creation'
  // Collections (julIA)
  | 'payment_promise'
  | 'negotiation_flow'
  | 'partial_payment'
  | 'payment_plan'
  | 'debt_acknowledgment'
  // Support (jaimE)
  | 'technical_issue'
  | 'appointment_scheduling'
  | 'installation_status'
  // Common
  | 'greeting_handler'
  | 'human_escalation'
  | 'out_of_scope';

/**
 * Fast-path configuration
 */
export interface FastPathConfig {
  enabledHandlers: FastPathHandler[];
  disabledHandlers: FastPathHandler[];
  priorityOverrides?: Partial<Record<FastPathHandler, number>>;
}

// ═══════════════════════════════════════════════════════════════
// OPERATOR COMMAND TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * Operator command definition
 */
export interface OperatorCommandDefinition {
  command: string;           // e.g., "#ACORDO"
  aliases?: string[];        // e.g., ["#NEGOCIAR"]
  description: string;
  requiredRole?: AgentRole[];
  handler: string;           // Handler function name
  parameters?: CommandParameter[];
}

/**
 * Command parameter definition
 */
export interface CommandParameter {
  name: string;
  type: 'string' | 'number' | 'date' | 'boolean';
  required: boolean;
  description: string;
}

// ═══════════════════════════════════════════════════════════════
// CONTEXT INJECTION TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * Context injection for LLM prompts
 */
export interface ContextInjection {
  id: string;
  priority: number;
  condition?: (ctx: Record<string, unknown>) => boolean;
  template: string;
  variables?: string[];
}

/**
 * Prompt override for specific scenarios
 */
export interface PromptOverride {
  scenario: string;
  promptTemplate: string;
  priority: number;
  replaceBase?: boolean;
}

// ═══════════════════════════════════════════════════════════════
// PIPELINE CONFIGURATION
// ═══════════════════════════════════════════════════════════════

/**
 * Pipeline configuration for the agent
 */
export interface PipelineConfig {
  usePipelineV2: boolean;
  enabledPhases: string[];
  disabledPhases: string[];
  phaseTimeouts: Record<string, number>;
  maxRetries: number;
  enableMetrics: boolean;
  enableLogging: boolean;
}

/**
 * Metrics configuration
 */
export interface MetricsConfig {
  enabled: boolean;
  sampleRate: number; // 0-1
  detailedTiming: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

// ═══════════════════════════════════════════════════════════════
// MAIN ADAPTER INTERFACE
// ═══════════════════════════════════════════════════════════════

/**
 * Agent Adapter Interface
 * 
 * Defines the contract for agent-specific behavior customization.
 * Each agent implements this interface to customize pipeline behavior.
 * 
 * Enhanced with Passive-First (AGENTS.md-Style) context methods.
 */
export interface AgentAdapter {
  // ─────────────────────────────────────────────────────────────
  // IDENTITY
  // ─────────────────────────────────────────────────────────────
  
  /** Unique agent identifier */
  readonly agentId: string;
  
  /** Display name for logs and notifications */
  readonly displayName: string;
  
  /** Agent role in the system */
  readonly role: AgentRole;
  
  /** Pipeline processing mode */
  readonly pipelineMode: PipelineMode;
  
  // ─────────────────────────────────────────────────────────────
  // PASSIVE-FIRST CONTEXT (AGENTS.md-Style)
  // ─────────────────────────────────────────────────────────────
  
  /**
   * Get complete passive context configuration for this agent
   */
  getPassiveContextConfig(): PassiveContextConfig;
  
  /**
   * Get RAG categories for a specific funnel stage
   */
  getRAGCategoriesForStage(stage: FunnelStage): RAGCategory[];
  
  /**
   * Check if passive-first architecture is enabled
   */
  isPassiveFirstEnabled(): boolean;
  
  /**
   * Get the path to this agent's constitution file
   */
  getConstitutionPath(): string;
  
  /**
   * Get protected sections that should never be compressed
   */
  getProtectedSections(): string[];
  
  // ─────────────────────────────────────────────────────────────
  // FAST-PATHS
  // ─────────────────────────────────────────────────────────────
  
  /**
   * Get enabled fast-path handlers for this agent
   */
  getEnabledFastPaths(): FastPathHandler[];
  
  /**
   * Check if a specific handler should be skipped
   */
  shouldSkipFastPath(handlerName: FastPathHandler): boolean;
  
  /**
   * Get fast-path configuration
   */
  getFastPathConfig(): FastPathConfig;
  
  // ─────────────────────────────────────────────────────────────
  // DATA COLLECTION
  // ─────────────────────────────────────────────────────────────
  
  /**
   * Get required fields for data collection
   */
  getRequiredFields(): FieldDefinition[];
  
  /**
   * Get optional fields for data collection
   */
  getOptionalFields(): FieldDefinition[];
  
  /**
   * Get all field definitions
   */
  getAllFields(): FieldDefinition[];
  
  /**
   * Get field validators mapped by field name
   */
  getFieldValidators(): Record<string, FieldValidator>;
  
  /**
   * Check if data collection is complete
   */
  isDataCollectionComplete(dados: Record<string, unknown>): boolean;
  
  /**
   * Get the next field to collect
   */
  getNextFieldToCollect(dados: Record<string, unknown>): FieldDefinition | null;
  
  // ─────────────────────────────────────────────────────────────
  // TRIAGE
  // ─────────────────────────────────────────────────────────────
  
  /**
   * Determine if triage should be triggered
   */
  shouldTriggerTriage(context: TriageContext): TriageDecision;
  
  /**
   * Get the agent to redirect to (if applicable)
   */
  getTriageRedirectAgent(): string | null;
  
  /**
   * Check if triage should be skipped entirely
   */
  shouldSkipTriage(context: TriageContext): boolean;
  
  // ─────────────────────────────────────────────────────────────
  // PIPELINE
  // ─────────────────────────────────────────────────────────────
  
  /**
   * Check if Pipeline V2 should be used
   */
  shouldUsePipelineV2(): boolean;
  
  /**
   * Get pipeline configuration overrides
   */
  getPipelineConfig(): PipelineConfig;
  
  /**
   * Get metrics configuration
   */
  getMetricsConfig(): MetricsConfig;
  
  // ─────────────────────────────────────────────────────────────
  // OPERATOR COMMANDS
  // ─────────────────────────────────────────────────────────────
  
  /**
   * Get additional operator commands for this agent
   */
  getAdditionalCommands(): OperatorCommandDefinition[];
  
  /**
   * Get all available commands (base + additional)
   */
  getAllCommands(): OperatorCommandDefinition[];
  
  // ─────────────────────────────────────────────────────────────
  // LLM CONTEXT
  // ─────────────────────────────────────────────────────────────
  
  /**
   * Get context injections for LLM prompts
   */
  getContextInjections(): ContextInjection[];
  
  /**
   * Get prompt overrides for specific scenarios
   */
  getPromptOverrides(): PromptOverride[];
  
  /**
   * Build system prompt additions for this agent
   */
  buildSystemPromptAdditions(context: Record<string, unknown>): string;
  
  // ─────────────────────────────────────────────────────────────
  // GREETING
  // ─────────────────────────────────────────────────────────────
  
  /**
   * Check if first-contact greeting should be sent
   */
  shouldSendGreeting(context: TriageContext): boolean;
  
  /**
   * Get greeting template
   */
  getGreetingTemplate(context: TriageContext): string | null;
  
  // ─────────────────────────────────────────────────────────────
  // ESCALATION
  // ─────────────────────────────────────────────────────────────
  
  /**
   * Get escalation rules for this agent
   */
  getEscalationRules(): EscalationRule[];
  
  /**
   * Check if message should trigger escalation
   */
  shouldEscalate(context: EscalationContext): EscalationDecision;
}

// ═══════════════════════════════════════════════════════════════
// ESCALATION TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * Escalation rule definition
 */
export interface EscalationRule {
  id: string;
  triggerPatterns: string[];
  priority: number;
  targetQueue: string;
  notifyOperator: boolean;
  autoMessage?: string;
}

/**
 * Context for escalation decisions
 */
export interface EscalationContext {
  messageText: string;
  consecutiveFailures: number;
  totalMessages: number;
  sentimentScore?: number;
  hasActiveComplaint: boolean;
}

/**
 * Escalation decision result
 */
export interface EscalationDecision {
  shouldEscalate: boolean;
  reason?: string;
  targetQueue?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
}

// ═══════════════════════════════════════════════════════════════
// ADAPTER FACTORY TYPE
// ═══════════════════════════════════════════════════════════════

/**
 * Factory function type for creating adapters
 */
export type AgentAdapterFactory = () => AgentAdapter;

/**
 * Adapter registry map type
 */
export type AdapterRegistry = Record<string, AgentAdapterFactory>;

// ═══════════════════════════════════════════════════════════════
// DATABASE CONFIG TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * Database-stored adapter configuration override
 */
export interface AdapterConfigOverride {
  agentId: string;
  configKey: string;
  configValue: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Configuration keys that can be overridden from database
 */
export type OverridableConfigKey =
  | 'enabled_fast_paths'
  | 'disabled_fast_paths'
  | 'required_fields'
  | 'optional_fields'
  | 'pipeline_v2_enabled'
  | 'triage_enabled'
  | 'greeting_enabled'
  | 'escalation_rules'
  | 'context_injections'
  | 'prompt_overrides'
  | 'passive_context_config';

// ═══════════════════════════════════════════════════════════════
// PASSIVE-FIRST CONTEXT TYPES (AGENTS.md-Style)
// ═══════════════════════════════════════════════════════════════

/**
 * Funnel stage identifiers for passive context mapping
 */
export type FunnelStage =
  | 'triagem'
  | 'qualificacao'
  | 'coleta_dados'
  | 'proposta_inicial_criada'
  | 'proposta_inicial_enviada'
  | 'docs_plataforma'
  | 'proposta_definitiva'
  | 'assinatura'
  | 'fechado'
  | 'descartado'
  | 'sac_redirect'
  | 'pausado';

/**
 * RAG knowledge categories for passive pre-fetching
 */
export type RAGCategory =
  | 'faq_geral'
  | 'processo'
  | 'energia_solar'
  | 'financeiro'
  | 'objecoes'
  | 'contrato'
  | 'documentos'
  | 'pos_venda'
  | 'cobranca'
  | 'suporte_tecnico'
  | 'instalacao';

/**
 * Stage-to-RAG category mapping configuration
 */
export type StageToRAGMapping = Partial<Record<FunnelStage, RAGCategory[]>>;

/**
 * Rule memory priority configuration
 */
export interface RuleMemoryConfig {
  /** Enable rule memory injection */
  enabled: boolean;
  /** Maximum rules to inject per stage */
  maxRulesPerStage: number;
  /** Priority order for rule types */
  priorityOrder: ('guardrail' | 'policy' | 'suggestion' | 'learning')[];
  /** Minimum priority threshold (0-100) */
  minPriority: number;
  /** Cache TTL in seconds */
  cacheTTLSeconds: number;
}

/**
 * Passive RAG configuration
 */
export interface PassiveRAGConfig {
  /** Enable passive RAG pre-fetching */
  enabled: boolean;
  /** Max chunks per category */
  maxChunksPerCategory: number;
  /** Minimum similarity threshold (0-1) */
  minSimilarity: number;
  /** Enable compression of fetched chunks */
  compressionEnabled: boolean;
  /** Target size in characters after compression */
  compressionTargetChars: number;
}

/**
 * Context compression configuration
 */
export interface CompressionConfig {
  /** Enable context compression */
  enabled: boolean;
  /** Target size in characters */
  targetChars: number;
  /** Sections that should never be compressed/removed */
  protectedSections: string[];
  /** Compression aggressiveness level */
  aggressiveness: 'low' | 'medium' | 'high';
}

/**
 * Core constitution configuration (SOFIA.md equivalent)
 */
export interface ConstitutionConfig {
  /** Path to the agent's constitution file */
  constitutionPath: string;
  /** Sections to always include */
  alwaysIncludeSections: string[];
  /** Sections to include conditionally by stage */
  conditionalSections: Partial<Record<FunnelStage, string[]>>;
}

/**
 * Complete Passive-First context configuration for an agent
 */
export interface PassiveContextConfig {
  /** Stage-to-RAG category mapping */
  stageToRAGMapping: StageToRAGMapping;
  /** Rule memory configuration */
  ruleMemory: RuleMemoryConfig;
  /** Passive RAG configuration */
  passiveRAG: PassiveRAGConfig;
  /** Context compression configuration */
  compression: CompressionConfig;
  /** Core constitution configuration */
  constitution: ConstitutionConfig;
  /** Enable retrieval-led reasoning block */
  enableRetrievalLedReasoning: boolean;
  /** Enable passive-first architecture */
  enablePassiveFirst: boolean;
}

/**
 * Passive context loading result
 */
export interface PassiveContextResult {
  /** Core constitution content */
  constitutionContent: string;
  /** Injected rules block */
  rulesBlock: string;
  /** Pre-fetched RAG content */
  ragContent: string;
  /** Retrieval-led reasoning instructions */
  retrievalInstructions: string;
  /** Total characters before compression */
  totalCharsRaw: number;
  /** Total characters after compression */
  totalCharsCompressed: number;
  /** Compression ratio achieved */
  compressionRatio: number;
  /** Number of rules injected */
  rulesInjected: number;
  /** Number of RAG chunks used */
  ragChunksUsed: number;
  /** Categories pre-fetched */
  categoriesFetched: RAGCategory[];
  /** Build time in milliseconds */
  buildTimeMs: number;
}
