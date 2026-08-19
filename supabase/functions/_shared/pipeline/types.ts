/**
 * SOFIA PIPELINE 2.0 - TYPE DEFINITIONS
 * 
 * Arquitetura de Pipeline Estrutural de Dados
 * Todas as interfaces e tipos para o fluxo de 6 estágios
 */

// ============================================
// STAGE 1: INTAKE LAYER - Input Normalization
// ============================================

export type MediaType = 'text' | 'audio' | 'image' | 'document' | 'video' | 'sticker' | 'location' | 'contact';

export type IntentCategory = 
  | 'greeting'
  | 'farewell'
  | 'discount_inquiry'
  | 'economy_simulation'
  | 'document_submission'
  | 'objection'
  | 'confirmation'
  | 'denial'
  | 'clarification'
  | 'escalation_request'
  | 'support_request'
  | 'billing_question'
  | 'contract_status'
  | 'data_correction'
  | 'plan_selection'
  | 'generic_question'
  | 'noise'
  | 'unknown';

export type UrgencyLevel = 'low' | 'medium' | 'high' | 'critical';

export type SentimentScore = -1 | -0.5 | 0 | 0.5 | 1; // -1 negative, 1 positive

export interface ExtractedEntity {
  type: 'name' | 'email' | 'phone' | 'cpf' | 'cnpj' | 'value' | 'distributor' | 'date' | 'address' | 'document_type' | 'plan' | 'tipoCliente' | 'custom';
  value: string;
  normalized?: string;
  confidence: number;
  source: 'regex' | 'llm' | 'pattern';
}

export interface IntentPayload {
  // Metadata
  messageId: string;
  conversaId: string;
  phone: string;
  timestamp: Date;
  turnNumber: number;
  
  // Content
  mediaType: MediaType;
  rawContent: string;
  transcribedContent?: string; // For audio
  extractedText?: string; // For images/documents
  
  // Analysis
  intent: IntentCategory;
  intentConfidence: number;
  subIntent?: string;
  entities: ExtractedEntity[];
  sentiment: SentimentScore;
  urgency: UrgencyLevel;
  
  // Flags
  isOperatorCommand: boolean;
  commandType?: string;
  requiresHumanReview: boolean;
  
  // Processing metadata
  intakeProcessedAt: Date;
  intakeDurationMs: number;
}

// ============================================
// STAGE 2: CONTEXT LAYER - Memory & State
// ============================================

export type MemoryType = 'fact' | 'rule' | 'preference' | 'commitment' | 'objection' | 'context';

export type MemorySource = 'user' | 'inferred' | 'operator' | 'system' | 'extraction' | 'rag';

export interface WorkingMemoryItem {
  id: string;
  conversaId: string;
  memoryType: MemoryType;
  key: string;
  value: unknown;
  confidence: number;
  source: MemorySource;
  validUntil?: Date;
  turnNumber: number;
  createdAt: Date;
}

export type RuleType = 'hard_constraint' | 'soft_preference' | 'learned_pattern' | 'guardrail' | 'fallback';

export interface RuleCondition {
  field: string;
  operator: 'equals' | 'contains' | 'greater_than' | 'less_than' | 'exists' | 'not_exists' | 'matches_pattern' | 'in_list';
  value: unknown;
  caseSensitive?: boolean;
}

export interface RuleAction {
  type: 'respond' | 'block' | 'escalate' | 'save_fact' | 'trigger_tool' | 'modify_response' | 'skip_llm';
  parameters: Record<string, unknown>;
}

export interface RuleMemoryItem {
  id: string;
  agentId: string;
  ruleType: RuleType;
  name: string;
  description?: string;
  conditions: RuleCondition[];
  actions: RuleAction[];
  priority: number;
  isActive: boolean;
  learnedFrom?: string;
  confidence: number;
  timesApplied: number;
  lastAppliedAt?: Date;
}

export interface BehavioralProfile {
  technical: number;    // 0-1: Quão técnico
  objective: number;    // 0-1: Quão direto ao ponto
  skeptical: number;    // 0-1: Quão desconfiado
  confused: number;     // 0-1: Quão confuso
  elderly: number;      // 0-1: Probabilidade de idoso
}

export type DominantProfileType = 'technical' | 'objective' | 'skeptical' | 'confused' | 'elderly' | 'balanced';

export interface ClientProfile {
  phone: string;
  name?: string;
  email?: string;
  cpfCnpj?: string;
  distribuidora?: string;
  valorFatura?: number;
  consumoKwh?: number;
  tipoInstalacao?: string;
  
  // Behavioral (Legacy)
  preferredTone?: 'formal' | 'informal' | 'technical' | 'simple';
  responseSpeed?: 'fast' | 'normal' | 'slow';
  objectionHistory: string[];
  
  // Behavioral Profile (NEW - Sistema de Perfil Comportamental)
  behavioralProfile?: BehavioralProfile;
  dominantProfile?: DominantProfileType;
  profileConfidence?: number;
  
  // Funnel
  currentStage: string;
  leadScore: number;
  proposalId?: string;
  bitrixLeadId?: string;
  
  // Interaction
  totalMessages: number;
  lastInteraction?: Date;
  conversationCount: number;
}

export interface RAGContextItem {
  chunkId: string;
  documentId: string;
  content: string;
  category: string;
  similarity: number;
  metadata?: Record<string, unknown>;
}

export interface FunnelState {
  stage: string;
  mode: string;
  hasSimulation: boolean;
  hasProposal: boolean;
  proposalType?: 'initial' | 'definitive';
  documentsReceived: string[];
  documentsPending: string[];
  isQualified: boolean;
  disqualificationReason?: string;
}

export interface FullContext {
  // Input
  intake: IntentPayload;
  
  // Memory
  workingMemory: WorkingMemoryItem[];
  activeRules: RuleMemoryItem[];
  clientProfile: ClientProfile;
  
  // Knowledge
  ragContext: RAGContextItem[];
  ragCacheHit: boolean;
  
  // State
  funnelState: FunnelState;
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string; timestamp: Date }>;
  
  // Metadata
  contextLoadedAt: Date;
  contextDurationMs: number;
  memoryItemsLoaded: number;
  rulesLoaded: number;
  
  // Extended metadata (for delayed responses, etc.)
  metadata?: {
    isDelayedResponse?: boolean;
    delayedSince?: string;
    hoursDelayed?: number;
    triggeredBy?: string;
    [key: string]: unknown;
  };
}

// ============================================
// STAGE 3: REASONING LAYER - LLM Decision
// ============================================

export type ToolName = 
  | 'send_message'
  | 'save_fact'
  | 'request_clarification'
  | 'escalate'
  | 'collect_document'
  | 'calculate_economy'
  | 'generate_proposal'
  | 'update_crm'
  | 'schedule_followup'
  | 'send_proposal_link'
  | 'mark_disqualified'
  | 'transfer_to_sac'
  | 'set_expected_field';

export interface ToolCall {
  id: string;
  name: ToolName;
  parameters: Record<string, unknown>;
  result?: unknown;
  success?: boolean;
  error?: string;
}

export interface NewFact {
  key: string;
  value: unknown;
  confidence: number;
  source: MemorySource;
  validUntilHours?: number;
}

export type DecisionType = 
  | 'respond'
  | 'clarify'
  | 'escalate'
  | 'block'
  | 'collect'
  | 'calculate'
  | 'close'
  | 'disqualify'
  | 'wait';

export interface ReasoningResult {
  // Decision
  decision: DecisionType;
  decisionConfidence: number;
  reasoning: string; // Brief explanation for logging
  
  // Response
  responseText?: string;
  responseTone: 'empathetic' | 'professional' | 'enthusiastic' | 'calm' | 'urgent';
  
  // Tool calls
  toolCalls: ToolCall[];
  
  // Learning
  newFacts: NewFact[];
  updatedFacts: Array<{ key: string; newValue: unknown }>;
  
  // Metadata
  modelUsed: string;
  tokensIn: number;
  tokensOut: number;
  reasoningDurationMs: number;
}

// ============================================
// STAGE 4: ACTION LAYER - Execution
// ============================================

export interface ActionExecution {
  toolCall: ToolCall;
  executedAt: Date;
  durationMs: number;
  success: boolean;
  result?: unknown;
  error?: string;
  sideEffects: string[];
}

export interface ActionResult {
  executedActions: ActionExecution[];
  failedActions: ActionExecution[];
  messageSent: boolean;
  messageId?: string;
  crmUpdated: boolean;
  sideEffects: string[];
  actionDurationMs: number;
}

// ============================================
// STAGE 5: VALIDATION LAYER - Guardrails
// ============================================

export type ValidationCheckType = 
  | 'contradiction_check'
  | 'rule_compliance'
  | 'hallucination_detection'
  | 'tone_check'
  | 'sensitive_data_check'
  | 'promise_guard'
  | 'url_guard'
  | 'length_check'
  // Hard stop checks (deterministic business rules)
  | 'document_request_whatsapp'
  | 'proposal_without_email'
  | 'minimum_bill_ignored'
  | 'triage_after_commercial_data'
  // Database guardrails (Phase 47)
  | `db_guardrail_${string}`;

export interface ValidationCheck {
  type: ValidationCheckType;
  passed: boolean;
  message?: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  autoFixed?: boolean;
  fixApplied?: string;
}

export interface ValidationResult {
  overallPassed: boolean;
  checks: ValidationCheck[];
  blockedReason?: string;
  modifiedResponse?: string;
  escalationRequired: boolean;
  escalationReason?: string;
  validationDurationMs: number;
}

// ============================================
// STAGE 6: LEARNING LAYER - Memory Persistence
// ============================================

export interface LearningUpdate {
  factsSaved: NewFact[];
  factsUpdated: Array<{ key: string; oldValue: unknown; newValue: unknown }>;
  patternsIdentified: string[];
  rulesRefined: string[];
}

export interface LearningResult {
  updates: LearningUpdate;
  memoryItemsCreated: number;
  memoryItemsUpdated: number;
  patternsUpdated: number;
  learningDurationMs: number;
}

// ============================================
// PIPELINE ORCHESTRATION
// ============================================

export interface PipelineConfig {
  enabled: boolean;
  rolloutPercentage: number;
  testPhones: string[];
  memoryTtlHours: number;
  maxFactsPerConversation: number;
  ragEnabled: boolean;
  learningEnabled: boolean;
  debugMode: boolean;
}

export interface PipelineExecutionLog {
  id: string;
  conversaId: string;
  messageId: string;
  pipelineVersion: string;
  
  // Each stage result
  intake?: IntentPayload;
  context?: Partial<FullContext>;
  reasoning?: ReasoningResult;
  action?: ActionResult;
  validation?: ValidationResult;
  learning?: LearningResult;
  
  // Totals
  totalDurationMs: number;
  success: boolean;
  errorMessage?: string;
  errorStage?: 'intake' | 'context' | 'reasoning' | 'action' | 'validation' | 'learning';
  
  createdAt: Date;
}

export interface PipelineResult {
  success: boolean;
  messageSent: boolean;
  messageId?: string;
  responseText?: string;
  
  // For debugging
  executionLog: PipelineExecutionLog;
  
  // For fallback
  shouldFallbackToLegacy: boolean;
  fallbackReason?: string;
}

// ============================================
// HELPER TYPES
// ============================================

export interface PipelineError {
  stage: 'intake' | 'context' | 'reasoning' | 'action' | 'validation' | 'learning';
  code: string;
  message: string;
  details?: unknown;
  recoverable: boolean;
}

export type PipelineStage = 'intake' | 'deterministic_router' | 'context' | 'reasoning' | 'action' | 'validation' | 'learning';

export interface StageMetrics {
  stage: PipelineStage;
  startedAt: Date;
  completedAt?: Date;
  durationMs?: number;
  success: boolean;
  error?: string;
}
