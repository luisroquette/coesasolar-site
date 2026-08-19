/**
 * BASE AGENT ADAPTER
 * 
 * Abstract base class with default implementations for all adapter methods.
 * Specific agents extend this class and override only what they need.
 * 
 * @module _shared/sofia-orchestrator/adapters/base-adapter
 */

import type {
  AgentAdapter,
  AgentRole,
  PipelineMode,
  FastPathHandler,
  FastPathConfig,
  FieldDefinition,
  FieldValidator,
  TriageContext,
  TriageDecision,
  PipelineConfig,
  MetricsConfig,
  OperatorCommandDefinition,
  ContextInjection,
  PromptOverride,
  EscalationRule,
  EscalationContext,
  EscalationDecision,
  PassiveContextConfig,
  FunnelStage,
  RAGCategory,
  StageToRAGMapping,
} from './types.ts';

// ═══════════════════════════════════════════════════════════════
// COMMON FIELD VALIDATORS
// ═══════════════════════════════════════════════════════════════

/**
 * Common validators shared across adapters
 */
export const CommonValidators: Record<string, FieldValidator> = {
  email: (value: string) => {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    const isValid = emailRegex.test(value.trim());
    return {
      isValid,
      normalizedValue: isValid ? value.trim().toLowerCase() : undefined,
      errorMessage: isValid ? undefined : 'Por favor, informe um e-mail válido.',
    };
  },
  
  cpf: (value: string) => {
    const digits = value.replace(/\D/g, '');
    const isValid = digits.length === 11;
    return {
      isValid,
      normalizedValue: isValid ? digits : undefined,
      errorMessage: isValid ? undefined : 'CPF deve ter 11 dígitos.',
    };
  },
  
  cnpj: (value: string) => {
    const digits = value.replace(/\D/g, '');
    const isValid = digits.length === 14;
    return {
      isValid,
      normalizedValue: isValid ? digits : undefined,
      errorMessage: isValid ? undefined : 'CNPJ deve ter 14 dígitos.',
    };
  },
  
  phone: (value: string) => {
    const digits = value.replace(/\D/g, '');
    const isValid = digits.length >= 10 && digits.length <= 13;
    return {
      isValid,
      normalizedValue: isValid ? digits : undefined,
      errorMessage: isValid ? undefined : 'Telefone inválido.',
    };
  },
  
  currency: (value: string) => {
    const cleaned = value.replace(/[R$\s.]/g, '').replace(',', '.');
    const num = parseFloat(cleaned);
    const isValid = !isNaN(num) && num > 0;
    return {
      isValid,
      normalizedValue: isValid ? num : undefined,
      errorMessage: isValid ? undefined : 'Valor inválido.',
    };
  },
  
  text: (value: string) => {
    const trimmed = value.trim();
    const isValid = trimmed.length >= 2;
    return {
      isValid,
      normalizedValue: isValid ? trimmed : undefined,
      errorMessage: isValid ? undefined : 'Texto muito curto.',
    };
  },
  
  date: (value: string) => {
    // Supports DD/MM/YYYY or YYYY-MM-DD
    const dateRegex = /^(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})$/;
    const isValid = dateRegex.test(value.trim());
    return {
      isValid,
      normalizedValue: isValid ? value.trim() : undefined,
      errorMessage: isValid ? undefined : 'Data inválida. Use DD/MM/AAAA.',
    };
  },
};

// ═══════════════════════════════════════════════════════════════
// BASE OPERATOR COMMANDS
// ═══════════════════════════════════════════════════════════════

/**
 * Base operator commands available to all agents
 */
export const BaseOperatorCommands: OperatorCommandDefinition[] = [
  {
    command: '#ASSUMIR',
    aliases: ['#TAKEOVER', '#MANUAL'],
    description: 'Assume controle manual da conversa',
    handler: 'handleTakeover',
  },
  {
    command: '#RESOLVIDO',
    aliases: ['#DEVOLVER', '#RETURN'],
    description: 'Devolve conversa para automação',
    handler: 'handleReturn',
  },
  {
    command: '#SAC',
    aliases: ['#SUPORTE'],
    description: 'Redireciona para SAC (marIA)',
    handler: 'handleSacRedirect',
  },
  {
    command: '#PAUSAR',
    aliases: ['#PAUSE'],
    description: 'Pausa automação temporariamente',
    handler: 'handlePause',
  },
];

// ═══════════════════════════════════════════════════════════════
// DEFAULT PASSIVE-FIRST CONFIGURATION (AGENTS.md-Style)
// ═══════════════════════════════════════════════════════════════

/**
 * Default stage-to-RAG category mapping
 */
const DEFAULT_STAGE_TO_RAG_MAPPING: StageToRAGMapping = {
  'triagem': ['faq_geral', 'processo'],
  'qualificacao': ['energia_solar', 'faq_geral'],
  'coleta_dados': ['processo', 'financeiro'],
  'proposta_inicial_criada': ['financeiro', 'objecoes'],
  'proposta_inicial_enviada': ['objecoes', 'contrato'],
  'docs_plataforma': ['processo', 'documentos'],
  'proposta_definitiva': ['contrato', 'financeiro'],
  'assinatura': ['contrato', 'objecoes'],
  'fechado': ['pos_venda'],
};

/**
 * Default passive context configuration
 */
const DEFAULT_PASSIVE_CONTEXT_CONFIG: PassiveContextConfig = {
  stageToRAGMapping: DEFAULT_STAGE_TO_RAG_MAPPING,
  ruleMemory: {
    enabled: true,
    maxRulesPerStage: 5,
    priorityOrder: ['guardrail', 'policy', 'suggestion', 'learning'],
    minPriority: 50,
    cacheTTLSeconds: 300,
  },
  passiveRAG: {
    enabled: true,
    maxChunksPerCategory: 3,
    minSimilarity: 0.4,
    compressionEnabled: true,
    compressionTargetChars: 2000,
  },
  compression: {
    enabled: true,
    targetChars: 6000,
    protectedSections: ['CLÁUSULAS PÉTREAS', 'RETRIEVAL-LED', 'REGRAS ABSOLUTAS'],
    aggressiveness: 'medium',
  },
  constitution: {
    constitutionPath: '_shared/SOFIA.md',
    alwaysIncludeSections: ['identity', 'petreas', 'anti_hallucination'],
    conditionalSections: {
      'coleta_dados': ['fsm'],
      'proposta_inicial_criada': ['fsm', 'reasoning'],
      'assinatura': ['reasoning'],
    },
  },
  enableRetrievalLedReasoning: true,
  enablePassiveFirst: true,
};

// ═══════════════════════════════════════════════════════════════
// DEFAULT PIPELINE CONFIG
// ═══════════════════════════════════════════════════════════════

const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  usePipelineV2: false,
  enabledPhases: [
    'operator',
    'greeting',
    'media',
    'triage',
    'data_collection',
    'fast_path',
    'context',
    'llm',
    'guardrails',
    'response',
  ],
  disabledPhases: [],
  phaseTimeouts: {
    media: 30000,
    llm: 45000,
    context: 10000,
  },
  maxRetries: 3,
  enableMetrics: true,
  enableLogging: true,
};

const DEFAULT_METRICS_CONFIG: MetricsConfig = {
  enabled: true,
  sampleRate: 1.0,
  detailedTiming: true,
  logLevel: 'info',
};

// ═══════════════════════════════════════════════════════════════
// BASE ADAPTER CLASS
// ═══════════════════════════════════════════════════════════════

/**
 * Base Agent Adapter
 * 
 * Provides default implementations for all adapter methods.
 * Extend this class and override methods as needed.
 */
export abstract class BaseAgentAdapter implements AgentAdapter {
  // ─────────────────────────────────────────────────────────────
  // ABSTRACT PROPERTIES (must be implemented)
  // ─────────────────────────────────────────────────────────────
  
  abstract readonly agentId: string;
  abstract readonly displayName: string;
  abstract readonly role: AgentRole;
  abstract readonly pipelineMode: PipelineMode;
  
  // ─────────────────────────────────────────────────────────────
  // PASSIVE-FIRST CONTEXT (AGENTS.md-Style)
  // ─────────────────────────────────────────────────────────────
  
  getPassiveContextConfig(): PassiveContextConfig {
    return { ...DEFAULT_PASSIVE_CONTEXT_CONFIG };
  }
  
  getRAGCategoriesForStage(stage: FunnelStage): RAGCategory[] {
    const config = this.getPassiveContextConfig();
    return config.stageToRAGMapping[stage] || ['faq_geral'];
  }
  
  isPassiveFirstEnabled(): boolean {
    return this.getPassiveContextConfig().enablePassiveFirst;
  }
  
  getConstitutionPath(): string {
    return this.getPassiveContextConfig().constitution.constitutionPath;
  }
  
  getProtectedSections(): string[] {
    return this.getPassiveContextConfig().compression.protectedSections;
  }
  
  // ─────────────────────────────────────────────────────────────
  // FAST-PATHS (default: common handlers only)
  // ─────────────────────────────────────────────────────────────
  
  getEnabledFastPaths(): FastPathHandler[] {
    return [
      'greeting_handler',
      'human_escalation',
      'out_of_scope',
    ];
  }
  
  shouldSkipFastPath(handlerName: FastPathHandler): boolean {
    const enabledHandlers = this.getEnabledFastPaths();
    return !enabledHandlers.includes(handlerName);
  }
  
  getFastPathConfig(): FastPathConfig {
    return {
      enabledHandlers: this.getEnabledFastPaths(),
      disabledHandlers: [],
    };
  }
  
  // ─────────────────────────────────────────────────────────────
  // DATA COLLECTION (default: empty - override in subclasses)
  // ─────────────────────────────────────────────────────────────
  
  getRequiredFields(): FieldDefinition[] {
    return [];
  }
  
  getOptionalFields(): FieldDefinition[] {
    return [];
  }
  
  getAllFields(): FieldDefinition[] {
    return [...this.getRequiredFields(), ...this.getOptionalFields()];
  }
  
  getFieldValidators(): Record<string, FieldValidator> {
    const validators: Record<string, FieldValidator> = {};
    
    for (const field of this.getAllFields()) {
      if (field.validator) {
        validators[field.name] = field.validator;
      } else {
        // Use common validator based on field type
        const commonValidator = CommonValidators[field.type];
        if (commonValidator) {
          validators[field.name] = commonValidator;
        }
      }
    }
    
    return validators;
  }
  
  isDataCollectionComplete(dados: Record<string, unknown>): boolean {
    const requiredFields = this.getRequiredFields();
    
    for (const field of requiredFields) {
      const value = dados[field.name];
      if (value === undefined || value === null || value === '') {
        return false;
      }
    }
    
    return true;
  }
  
  getNextFieldToCollect(dados: Record<string, unknown>): FieldDefinition | null {
    const allFields = this.getAllFields().sort((a, b) => a.priority - b.priority);
    
    for (const field of allFields) {
      if (field.required) {
        const value = dados[field.name];
        if (value === undefined || value === null || value === '') {
          return field;
        }
      }
    }
    
    // All required fields collected, check optional
    for (const field of allFields) {
      if (!field.required) {
        const value = dados[field.name];
        if (value === undefined || value === null || value === '') {
          return field;
        }
      }
    }
    
    return null;
  }
  
  // ─────────────────────────────────────────────────────────────
  // TRIAGE (default: no triage)
  // ─────────────────────────────────────────────────────────────
  
  shouldTriggerTriage(_context: TriageContext): TriageDecision {
    return {
      shouldTriage: false,
      skipReason: 'Triage not configured for this agent',
    };
  }
  
  getTriageRedirectAgent(): string | null {
    return null;
  }
  
  shouldSkipTriage(_context: TriageContext): boolean {
    return true;
  }
  
  // ─────────────────────────────────────────────────────────────
  // PIPELINE (default: V1, all phases enabled)
  // ─────────────────────────────────────────────────────────────
  
  shouldUsePipelineV2(): boolean {
    return false;
  }
  
  getPipelineConfig(): PipelineConfig {
    return { ...DEFAULT_PIPELINE_CONFIG };
  }
  
  getMetricsConfig(): MetricsConfig {
    return { ...DEFAULT_METRICS_CONFIG };
  }
  
  // ─────────────────────────────────────────────────────────────
  // OPERATOR COMMANDS (default: base commands only)
  // ─────────────────────────────────────────────────────────────
  
  getAdditionalCommands(): OperatorCommandDefinition[] {
    return [];
  }
  
  getAllCommands(): OperatorCommandDefinition[] {
    return [...BaseOperatorCommands, ...this.getAdditionalCommands()];
  }
  
  // ─────────────────────────────────────────────────────────────
  // LLM CONTEXT (default: no injections or overrides)
  // ─────────────────────────────────────────────────────────────
  
  getContextInjections(): ContextInjection[] {
    return [];
  }
  
  getPromptOverrides(): PromptOverride[] {
    return [];
  }
  
  buildSystemPromptAdditions(_context: Record<string, unknown>): string {
    const injections = this.getContextInjections();
    
    if (injections.length === 0) {
      return '';
    }
    
    const sortedInjections = injections.sort((a, b) => a.priority - b.priority);
    const parts: string[] = [];
    
    for (const injection of sortedInjections) {
      if (!injection.condition || injection.condition(_context)) {
        parts.push(injection.template);
      }
    }
    
    return parts.join('\n\n');
  }
  
  // ─────────────────────────────────────────────────────────────
  // GREETING (default: no automatic greeting)
  // ─────────────────────────────────────────────────────────────
  
  shouldSendGreeting(_context: TriageContext): boolean {
    return false;
  }
  
  getGreetingTemplate(_context: TriageContext): string | null {
    return null;
  }
  
  // ─────────────────────────────────────────────────────────────
  // ESCALATION (default: no auto-escalation)
  // ─────────────────────────────────────────────────────────────
  
  getEscalationRules(): EscalationRule[] {
    return [];
  }
  
  shouldEscalate(_context: EscalationContext): EscalationDecision {
    return {
      shouldEscalate: false,
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Create a field definition with common defaults
 */
export function createField(
  name: string,
  displayName: string,
  type: FieldDefinition['type'],
  options: Partial<FieldDefinition> = {}
): FieldDefinition {
  return {
    name,
    displayName,
    type,
    required: options.required ?? false,
    priority: options.priority ?? 100,
    validator: options.validator,
    promptTemplate: options.promptTemplate,
    errorTemplate: options.errorTemplate,
    alternatives: options.alternatives,
  };
}

/**
 * Merge two pipeline configs
 */
export function mergePipelineConfig(
  base: PipelineConfig,
  overrides: Partial<PipelineConfig>
): PipelineConfig {
  return {
    ...base,
    ...overrides,
    phaseTimeouts: {
      ...base.phaseTimeouts,
      ...overrides.phaseTimeouts,
    },
  };
}
