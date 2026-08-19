/**
 * SOFIA AGENT ADAPTER - Sales inbound agent
 * Enhanced with Passive-First (AGENTS.md-Style) context configuration
 * @module _shared/sofia-orchestrator/adapters/sofia-adapter
 */

import { BaseAgentAdapter, createField } from './base-adapter.ts';
import type { 
  AgentRole, 
  PipelineMode, 
  FastPathHandler, 
  FastPathConfig, 
  FieldDefinition, 
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
} from './types.ts';

// ═══════════════════════════════════════════════════════════════
// SOFIA-SPECIFIC PASSIVE CONTEXT CONFIGURATION
// ═══════════════════════════════════════════════════════════════

/**
 * Sofia's stage-to-RAG category mapping
 * Optimized for sales funnel progression
 */
const SOFIA_STAGE_TO_RAG_MAPPING: Partial<Record<FunnelStage, RAGCategory[]>> = {
  'triagem': ['faq_geral', 'processo', 'energia_solar', 'codigo_agente'],
  'qualificacao': ['energia_solar', 'faq_geral', 'financeiro'],
  'coleta_dados': ['processo', 'financeiro', 'energia_solar'],
  'proposta_inicial_criada': ['financeiro', 'objecoes', 'energia_solar', 'codigo_agente'],
  'proposta_inicial_enviada': ['objecoes', 'contrato', 'financeiro'],
  'docs_plataforma': ['processo', 'documentos', 'contrato'],
  'proposta_definitiva': ['contrato', 'financeiro', 'objecoes'],
  'assinatura': ['contrato', 'objecoes', 'processo'],
  'fechado': ['pos_venda', 'processo'],
};

/**
 * Sofia's complete Passive-First configuration
 */
const SOFIA_PASSIVE_CONTEXT_CONFIG: PassiveContextConfig = {
  stageToRAGMapping: SOFIA_STAGE_TO_RAG_MAPPING,
  ruleMemory: {
    enabled: true,
    maxRulesPerStage: 6,
    priorityOrder: ['guardrail', 'policy', 'suggestion', 'learning'],
    minPriority: 40,
    cacheTTLSeconds: 300,
  },
  passiveRAG: {
    enabled: true,
    maxChunksPerCategory: 4,
    minSimilarity: 0.35,
    compressionEnabled: true,
    compressionTargetChars: 2500,
  },
  compression: {
    enabled: true,
    targetChars: 6500,
    protectedSections: [
      'CLÁUSULAS PÉTREAS',
      'RETRIEVAL-LED',
      'REGRAS ABSOLUTAS',
      'LINHA DE CORTE',
      'FUNIL DE VENDAS',
    ],
    aggressiveness: 'medium',
  },
  constitution: {
    constitutionPath: '_shared/SOFIA.md',
    alwaysIncludeSections: ['identity', 'petreas', 'anti_hallucination', 'fsm'],
    conditionalSections: {
      'triagem': ['greeting'],
      'qualificacao': ['energy_benefits'],
      'coleta_dados': ['fsm', 'data_collection'],
      'proposta_inicial_criada': ['proposal', 'reasoning'],
      'proposta_inicial_enviada': ['objection_handling'],
      'docs_plataforma': ['document_instructions'],
      'assinatura': ['closing', 'reasoning'],
    },
  },
  enableRetrievalLedReasoning: true,
  enablePassiveFirst: true,
};

// ═══════════════════════════════════════════════════════════════
// SOFIA FIELD DEFINITIONS
// ═══════════════════════════════════════════════════════════════

const SOFIA_REQUIRED_FIELDS: FieldDefinition[] = [
  createField('nome', 'Nome', 'text', { required: true, priority: 1, promptTemplate: 'Para começar, qual o seu nome?', alternatives: ['nome_completo', 'cliente_nome'] }),
  createField('email', 'E-mail', 'email', { required: true, priority: 2, promptTemplate: 'Qual o seu melhor e-mail para contato?', errorTemplate: 'Hmm, esse e-mail não parece válido. Pode verificar?' }),
  createField('valorFatura', 'Valor da conta', 'currency', { required: true, priority: 3, promptTemplate: 'Qual o valor médio da sua conta de luz?', alternatives: ['valor_conta', 'conta_luz'] }),
  createField('distribuidora', 'Distribuidora', 'text', { required: true, priority: 4, promptTemplate: 'Qual a sua distribuidora de energia? (ex: CEMIG, Energisa MG)', alternatives: ['concessionaria'] }),
];

const SOFIA_OPTIONAL_FIELDS: FieldDefinition[] = [
  createField('cpf', 'CPF', 'cpf', { required: false, priority: 10, alternatives: ['cpf_cnpj'] }),
  createField('cnpj', 'CNPJ', 'cnpj', { required: false, priority: 11 }),
  createField('tipoInstalacao', 'Tipo de instalação', 'select', { required: false, priority: 12 }),
  createField('cidade', 'Cidade', 'text', { required: false, priority: 13 }),
  createField('estado', 'Estado', 'text', { required: false, priority: 14, alternatives: ['uf'] }),
  createField('consumo', 'Consumo mensal (kWh)', 'number', { required: false, priority: 15, alternatives: ['consumo_kwh'] }),
];

// ═══════════════════════════════════════════════════════════════
// SOFIA FAST-PATHS & COMMANDS
// ═══════════════════════════════════════════════════════════════

const SOFIA_FAST_PATHS: FastPathHandler[] = [
  'document_collection', 
  'proposal_flow', 
  'confirmation_handlers', 
  'audio_preference', 
  'discount_objection', 
  'competitor_mention', 
  'price_inquiry', 
  'simulation_request', 
  'greeting_handler', 
  'human_escalation', 
  'out_of_scope',
];

const SOFIA_ADDITIONAL_COMMANDS: OperatorCommandDefinition[] = [
  { 
    command: '#CORRIGIR', 
    aliases: ['#FIX'], 
    description: 'Corrige dados coletados', 
    handler: 'handleDataCorrection', 
    requiredRole: ['sales'], 
    parameters: [
      { name: 'campo', type: 'string', required: true, description: 'Campo a corrigir' }, 
      { name: 'valor', type: 'string', required: true, description: 'Novo valor' },
    ],
  },
  { 
    command: '#SIMULAR', 
    aliases: ['#PROPOSTA'], 
    description: 'Força geração de simulação', 
    handler: 'handleForceSimulation', 
    requiredRole: ['sales'],
  },
  { 
    command: '#DESCARTAR', 
    aliases: ['#DESCARTE'], 
    description: 'Marca lead como não atendido', 
    handler: 'handleDiscard', 
    requiredRole: ['sales'], 
    parameters: [
      { name: 'motivo', type: 'string', required: true, description: 'Motivo' },
    ],
  },
  { 
    command: '#CONTRATO', 
    aliases: ['#ENVIAR_CONTRATO'], 
    description: 'Força envio do contrato', 
    handler: 'handleForceContract', 
    requiredRole: ['sales'],
  },
];

// ═══════════════════════════════════════════════════════════════
// SOFIA CONTEXT INJECTIONS & ESCALATION
// ═══════════════════════════════════════════════════════════════

const SOFIA_CONTEXT_INJECTIONS: ContextInjection[] = [
  { 
    id: 'sales_funnel_stage', 
    priority: 1, 
    template: '## Estágio no Funil\nO cliente está no estágio: {{funnelStage}}.', 
    variables: ['funnelStage'],
  },
  { 
    id: 'collected_data_summary', 
    priority: 2, 
    condition: (ctx) => Object.keys(ctx.dados || {}).length > 0, 
    template: '## Dados Já Coletados\n{{dadosSummary}}\nNão peça informações que já temos.', 
    variables: ['dadosSummary'],
  },
  { 
    id: 'proposal_context', 
    priority: 3, 
    condition: (ctx) => !!ctx.propostaId, 
    template: '## Proposta Ativa\nID: {{propostaId}}\nEconomia: {{economia}}/mês', 
    variables: ['propostaId', 'economia'],
  },
  {
    id: 'passive_rag_context',
    priority: 0, // Highest priority - injected first
    condition: (ctx) => !!ctx.passiveRAGContent,
    template: '## Conhecimento Pré-Carregado (Passive RAG)\n{{passiveRAGContent}}',
    variables: ['passiveRAGContent'],
  },
];

const SOFIA_ESCALATION_RULES: EscalationRule[] = [
  { 
    id: 'complaint_escalation', 
    triggerPatterns: ['reclamar', 'procon', 'advogado', 'processo', 'anatel'], 
    priority: 1, 
    targetQueue: 'sac_urgent', 
    notifyOperator: true, 
    autoMessage: 'Entendo sua preocupação. Vou transferir para nossa equipe especializada.',
  },
];

// ═══════════════════════════════════════════════════════════════
// SOFIA ADAPTER CLASS
// ═══════════════════════════════════════════════════════════════

export class SofiaAdapter extends BaseAgentAdapter {
  readonly agentId = 'sofia';
  readonly displayName = 'sofIA';
  readonly role: AgentRole = 'sales';
  readonly pipelineMode: PipelineMode = 'full_funnel';
  
  // ─────────────────────────────────────────────────────────────
  // PASSIVE-FIRST CONTEXT OVERRIDES
  // ─────────────────────────────────────────────────────────────
  
  override getPassiveContextConfig(): PassiveContextConfig {
    return SOFIA_PASSIVE_CONTEXT_CONFIG;
  }
  
  override getRAGCategoriesForStage(stage: FunnelStage): RAGCategory[] {
    const categories = SOFIA_STAGE_TO_RAG_MAPPING[stage];
    return categories || ['faq_geral', 'energia_solar'];
  }
  
  override isPassiveFirstEnabled(): boolean {
    return true; // Sofia always uses Passive-First
  }
  
  override getConstitutionPath(): string {
    return '_shared/SOFIA.md';
  }
  
  override getProtectedSections(): string[] {
    return SOFIA_PASSIVE_CONTEXT_CONFIG.compression.protectedSections;
  }
  
  // ─────────────────────────────────────────────────────────────
  // FAST-PATH & FIELD OVERRIDES
  // ─────────────────────────────────────────────────────────────
  
  override getEnabledFastPaths(): FastPathHandler[] { 
    return SOFIA_FAST_PATHS; 
  }
  
  override getFastPathConfig(): FastPathConfig { 
    return { 
      enabledHandlers: SOFIA_FAST_PATHS, 
      disabledHandlers: ['contract_status', 'billing_inquiry', 'payment_promise', 'negotiation_flow', 'technical_issue'], 
      priorityOverrides: { 
        'document_collection': 1, 
        'proposal_flow': 2, 
        'discount_objection': 3,
      },
    }; 
  }
  
  override getRequiredFields(): FieldDefinition[] { 
    return SOFIA_REQUIRED_FIELDS; 
  }
  
  override getOptionalFields(): FieldDefinition[] { 
    return SOFIA_OPTIONAL_FIELDS; 
  }
  
  // ─────────────────────────────────────────────────────────────
  // TRIAGE OVERRIDES
  // ─────────────────────────────────────────────────────────────
  
  override shouldTriggerTriage(context: TriageContext): TriageDecision {
    if (context.hasPropostaId || Object.keys(context.existingDados || {}).length > 2) {
      return { shouldTriage: false, skipReason: 'Lead já tem proposta ou dados' };
    }
    
    const advancedStages = ['C9:NEW', 'C9:WON', 'C9:EXECUTING'];
    if (context.bitrixStage && advancedStages.includes(context.bitrixStage)) {
      return { shouldTriage: false, skipReason: 'Lead em estágio avançado' };
    }
    
    const existingClientPatterns = [
      /j[aá]\s*(sou|tenho)\s*(cliente|contrato)/i, 
      /meu\s*contrato/i, 
      /acompanhar\s*(minha\s*)?(proposta|contrato)/i,
    ];
    
    if (existingClientPatterns.some(p => p.test(context.messageText))) {
      return { shouldTriage: true, redirectToAgent: 'maria', reason: 'Cliente existente detectado' };
    }
    
    return { shouldTriage: false };
  }
  
  override getTriageRedirectAgent(): string | null { 
    return 'maria'; 
  }
  
  override shouldSkipTriage(context: TriageContext): boolean { 
    return context.hasPropostaId || context.hasBitrixLead; 
  }
  
  // ─────────────────────────────────────────────────────────────
  // PIPELINE OVERRIDES
  // ─────────────────────────────────────────────────────────────
  
  override shouldUsePipelineV2(): boolean { 
    return true; 
  }
  
  override getPipelineConfig(): PipelineConfig { 
    return { 
      usePipelineV2: true, 
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
        data_collection: 5000,
      }, 
      maxRetries: 3, 
      enableMetrics: true, 
      enableLogging: true,
    }; 
  }
  
  override getMetricsConfig(): MetricsConfig { 
    return { 
      enabled: true, 
      sampleRate: 1.0, 
      detailedTiming: true, 
      logLevel: 'info',
    }; 
  }
  
  // ─────────────────────────────────────────────────────────────
  // COMMAND & CONTEXT OVERRIDES
  // ─────────────────────────────────────────────────────────────
  
  override getAdditionalCommands(): OperatorCommandDefinition[] { 
    return SOFIA_ADDITIONAL_COMMANDS; 
  }
  
  override getContextInjections(): ContextInjection[] { 
    return SOFIA_CONTEXT_INJECTIONS; 
  }
  
  override getPromptOverrides(): PromptOverride[] { 
    return [
      { 
        scenario: 'first_contact', 
        promptTemplate: 'Você está iniciando primeiro contato. Seja acolhedora, descubra valor da conta e distribuidora.', 
        priority: 1, 
        replaceBase: false,
      }, 
      { 
        scenario: 'objection_handling', 
        promptTemplate: 'Use técnica LAER: Listen, Acknowledge, Explore, Respond.', 
        priority: 2, 
        replaceBase: false,
      },
      {
        scenario: 'passive_context_active',
        promptTemplate: 'IMPORTANTE: Consulte o conhecimento pré-carregado ANTES de formular sua resposta.',
        priority: 0,
        replaceBase: false,
      },
    ]; 
  }
  
  // ─────────────────────────────────────────────────────────────
  // GREETING OVERRIDES
  // ─────────────────────────────────────────────────────────────
  
  override shouldSendGreeting(context: TriageContext): boolean { 
    return context.totalMessages <= 1 && !context.hasBitrixLead; 
  }
  
  override getGreetingTemplate(context: TriageContext): string | null { 
    const name = context.clienteNome || ''; 
    return `${name ? `Olá, ${name}!` : 'Olá!'} 👋\n\nSou a sofIA, assistente virtual da Coesa Energia.\n\nEstou aqui para ajudar você a economizar na conta de luz com energia solar por assinatura - sem investimento inicial!\n\nPosso saber qual o valor médio da sua conta de luz? 💡`; 
  }
  
  // ─────────────────────────────────────────────────────────────
  // ESCALATION OVERRIDES
  // ─────────────────────────────────────────────────────────────
  
  override getEscalationRules(): EscalationRule[] { 
    return SOFIA_ESCALATION_RULES; 
  }
  
  override shouldEscalate(context: EscalationContext): EscalationDecision { 
    if (/reclamar|procon|advogado|processo|anatel|ouvidoria/i.test(context.messageText)) {
      return { 
        shouldEscalate: true, 
        reason: 'Menção a reclamação/órgão regulador', 
        targetQueue: 'sac_urgent', 
        priority: 'high',
      }; 
    }
    
    if (context.consecutiveFailures >= 3) {
      return { 
        shouldEscalate: true, 
        reason: 'Múltiplas falhas', 
        targetQueue: 'sales_support', 
        priority: 'medium',
      }; 
    }
    
    return { shouldEscalate: false }; 
  }
}
