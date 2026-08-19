/**
 * JAIME AGENT ADAPTER
 * 
 * Adapter for jaimE - the technical support agent.
 * Handles technical issues, installation support, and appointment scheduling.
 * 
 * @module _shared/sofia-orchestrator/adapters/jaime-adapter
 */

import {
  BaseAgentAdapter,
  createField,
} from './base-adapter.ts';
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
  EscalationRule,
  EscalationContext,
  EscalationDecision,
} from './types.ts';

// ═══════════════════════════════════════════════════════════════
// JAIME FIELD DEFINITIONS
// ═══════════════════════════════════════════════════════════════

const JAIME_REQUIRED_FIELDS: FieldDefinition[] = [
  createField('numeroContrato', 'Número do contrato', 'text', {
    required: true,
    priority: 1,
    promptTemplate: 'Qual o número do seu contrato ou CPF/CNPJ cadastrado?',
    alternatives: ['contrato', 'cpf', 'cnpj'],
  }),
  createField('tipoProblema', 'Tipo de problema', 'select', {
    required: true,
    priority: 2,
    promptTemplate: 'Qual o tipo de problema que está enfrentando?\n1️⃣ Instalação\n2️⃣ Geração baixa\n3️⃣ Inversor\n4️⃣ Medidor\n5️⃣ Outro',
    alternatives: ['problema', 'tipo_chamado'],
  }),
];

const JAIME_OPTIONAL_FIELDS: FieldDefinition[] = [
  createField('descricaoProblema', 'Descrição do problema', 'text', {
    required: false,
    priority: 10,
    promptTemplate: 'Pode descrever o problema com mais detalhes?',
    alternatives: ['descricao', 'detalhe'],
  }),
  createField('dataOcorrencia', 'Data de ocorrência', 'date', {
    required: false,
    priority: 11,
    promptTemplate: 'Quando o problema começou?',
    alternatives: ['quando_comecou', 'inicio_problema'],
  }),
  createField('disponibilidadeVisita', 'Disponibilidade para visita', 'text', {
    required: false,
    priority: 12,
    promptTemplate: 'Qual sua disponibilidade para uma visita técnica?',
    alternatives: ['disponibilidade', 'melhor_horario'],
  }),
  createField('endereco', 'Endereço da instalação', 'text', {
    required: false,
    priority: 13,
    alternatives: ['local', 'endereco_instalacao'],
  }),
];

// ═══════════════════════════════════════════════════════════════
// JAIME FAST-PATHS
// ═══════════════════════════════════════════════════════════════

const JAIME_FAST_PATHS: FastPathHandler[] = [
  // Technical support handlers
  'technical_issue',
  'appointment_scheduling',
  'installation_status',
  // Common handlers
  'greeting_handler',
  'human_escalation',
  'out_of_scope',
];

// ═══════════════════════════════════════════════════════════════
// JAIME OPERATOR COMMANDS
// ═══════════════════════════════════════════════════════════════

const JAIME_ADDITIONAL_COMMANDS: OperatorCommandDefinition[] = [
  {
    command: '#VISITA',
    aliases: ['#AGENDAR', '#TECNICO'],
    description: 'Agenda visita técnica',
    handler: 'handleScheduleVisit',
    requiredRole: ['support'],
    parameters: [
      {
        name: 'data',
        type: 'date',
        required: true,
        description: 'Data da visita (DD/MM/AAAA)',
      },
      {
        name: 'periodo',
        type: 'string',
        required: false,
        description: 'Período (manhã/tarde)',
      },
    ],
  },
  {
    command: '#CHAMADO',
    aliases: ['#TICKET', '#OS'],
    description: 'Abre chamado técnico',
    handler: 'handleOpenTicket',
    requiredRole: ['support'],
    parameters: [
      {
        name: 'tipo',
        type: 'string',
        required: true,
        description: 'Tipo de chamado',
      },
      {
        name: 'prioridade',
        type: 'string',
        required: false,
        description: 'Prioridade (baixa/media/alta)',
      },
    ],
  },
  {
    command: '#URGENTE',
    aliases: ['#EMERGENCIA'],
    description: 'Escala para suporte urgente',
    handler: 'handleUrgentEscalation',
    requiredRole: ['support'],
  },
  {
    command: '#SAC',
    aliases: ['#MARIA'],
    description: 'Redireciona para SAC',
    handler: 'handleSacRedirect',
    requiredRole: ['support'],
  },
  {
    command: '#MANUAL',
    aliases: ['#INSTRUCOES'],
    description: 'Envia manual/instruções técnicas',
    handler: 'handleSendManual',
    requiredRole: ['support'],
    parameters: [
      {
        name: 'tipo',
        type: 'string',
        required: true,
        description: 'Tipo de manual (inversor/medidor/geral)',
      },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════
// JAIME CONTEXT INJECTIONS
// ═══════════════════════════════════════════════════════════════

const JAIME_CONTEXT_INJECTIONS: ContextInjection[] = [
  {
    id: 'installation_info',
    priority: 1,
    condition: (ctx) => !!ctx.instalacaoId,
    template: `
## Dados da Instalação
Instalação: #{{instalacaoId}}
Tipo: {{tipoInstalacao}}
Potência: {{potenciaKwp}} kWp
Inversor: {{modeloInversor}}
Data instalação: {{dataInstalacao}}
    `.trim(),
    variables: ['instalacaoId', 'tipoInstalacao', 'potenciaKwp', 'modeloInversor', 'dataInstalacao'],
  },
  {
    id: 'generation_data',
    priority: 2,
    condition: (ctx) => !!ctx.hasGenerationData,
    template: `
## Dados de Geração
Geração último mês: {{geracaoUltimoMes}} kWh
Média esperada: {{mediaEsperada}} kWh
Performance: {{performanceRatio}}%
Último monitoramento: {{ultimoMonitoramento}}
    `.trim(),
    variables: ['geracaoUltimoMes', 'mediaEsperada', 'performanceRatio', 'ultimoMonitoramento'],
  },
  {
    id: 'open_tickets',
    priority: 3,
    condition: (ctx) => (ctx.openTicketsCount as number || 0) > 0,
    template: `
## Chamados Abertos
Total: {{openTicketsCount}}
Mais recente: #{{recentTicketId}} - {{recentTicketStatus}}
Descrição: {{recentTicketDescription}}
    `.trim(),
    variables: ['openTicketsCount', 'recentTicketId', 'recentTicketStatus', 'recentTicketDescription'],
  },
];

// ═══════════════════════════════════════════════════════════════
// JAIME ESCALATION RULES
// ═══════════════════════════════════════════════════════════════

const JAIME_ESCALATION_RULES: EscalationRule[] = [
  {
    id: 'safety_issue',
    triggerPatterns: ['fogo', 'incêndio', 'choque', 'faísca', 'queimando', 'fumaça'],
    priority: 1,
    targetQueue: 'emergency',
    notifyOperator: true,
    autoMessage: '⚠️ ATENÇÃO: Desligue o disjuntor imediatamente e se afaste do equipamento. Estou acionando nossa equipe de emergência.',
  },
  {
    id: 'complete_outage',
    triggerPatterns: ['não está gerando nada', 'geração zero', 'sistema parado', 'inversor desligado'],
    priority: 2,
    targetQueue: 'technical_urgent',
    notifyOperator: true,
  },
  {
    id: 'warranty_claim',
    triggerPatterns: ['garantia', 'defeito de fábrica', 'trocar equipamento'],
    priority: 3,
    targetQueue: 'warranty',
    notifyOperator: true,
  },
];

// ═══════════════════════════════════════════════════════════════
// JAIME ADAPTER CLASS
// ═══════════════════════════════════════════════════════════════

export class JaimeAdapter extends BaseAgentAdapter {
  readonly agentId = 'jaime';
  readonly displayName = 'jaimE';
  readonly role: AgentRole = 'support';
  readonly pipelineMode: PipelineMode = 'service_desk';
  
  // ─────────────────────────────────────────────────────────────
  // FAST-PATHS
  // ─────────────────────────────────────────────────────────────
  
  override getEnabledFastPaths(): FastPathHandler[] {
    return JAIME_FAST_PATHS;
  }
  
  override getFastPathConfig(): FastPathConfig {
    return {
      enabledHandlers: JAIME_FAST_PATHS,
      disabledHandlers: [
        // Disable sales-specific handlers
        'document_collection',
        'proposal_flow',
        'discount_objection',
        'simulation_request',
        // Disable SAC-specific handlers
        'contract_status',
        'billing_inquiry',
        // Disable collections handlers
        'payment_promise',
        'negotiation_flow',
      ],
      priorityOverrides: {
        'technical_issue': 1,
        'appointment_scheduling': 2,
        'installation_status': 3,
      },
    };
  }
  
  // ─────────────────────────────────────────────────────────────
  // DATA COLLECTION
  // ─────────────────────────────────────────────────────────────
  
  override getRequiredFields(): FieldDefinition[] {
    return JAIME_REQUIRED_FIELDS;
  }
  
  override getOptionalFields(): FieldDefinition[] {
    return JAIME_OPTIONAL_FIELDS;
  }
  
  // ─────────────────────────────────────────────────────────────
  // TRIAGE (disabled for technical support)
  // ─────────────────────────────────────────────────────────────
  
  override shouldTriggerTriage(_context: TriageContext): TriageDecision {
    return {
      shouldTriage: false,
      skipReason: 'Suporte técnico - sem triagem de vendas',
    };
  }
  
  override getTriageRedirectAgent(): string | null {
    return null;
  }
  
  override shouldSkipTriage(_context: TriageContext): boolean {
    return true;
  }
  
  // ─────────────────────────────────────────────────────────────
  // PIPELINE
  // ─────────────────────────────────────────────────────────────
  
  override shouldUsePipelineV2(): boolean {
    return false; // Keep simpler pipeline for support
  }
  
  override getPipelineConfig(): PipelineConfig {
    return {
      usePipelineV2: false,
      enabledPhases: [
        'operator',
        'greeting',
        'media',
        'data_collection',
        'context',
        'llm',
        'guardrails',
        'response',
      ],
      disabledPhases: [
        'triage', // No sales triage
        'fast_path', // Limited fast-paths
      ],
      phaseTimeouts: {
        media: 30000,
        llm: 30000,
        context: 10000,
      },
      maxRetries: 2,
      enableMetrics: true,
      enableLogging: true,
    };
  }
  
  override getMetricsConfig(): MetricsConfig {
    return {
      enabled: true,
      sampleRate: 1.0,
      detailedTiming: false,
      logLevel: 'info',
    };
  }
  
  // ─────────────────────────────────────────────────────────────
  // OPERATOR COMMANDS
  // ─────────────────────────────────────────────────────────────
  
  override getAdditionalCommands(): OperatorCommandDefinition[] {
    return JAIME_ADDITIONAL_COMMANDS;
  }
  
  // ─────────────────────────────────────────────────────────────
  // LLM CONTEXT
  // ─────────────────────────────────────────────────────────────
  
  override getContextInjections(): ContextInjection[] {
    return JAIME_CONTEXT_INJECTIONS;
  }
  
  override buildSystemPromptAdditions(context: Record<string, unknown>): string {
    const baseAdditions = super.buildSystemPromptAdditions(context);
    
    const technicalPrompt = `
## Diretrizes de Suporte Técnico (jaimE)

Você é o jaimE, especialista em suporte técnico da Coesa Energia.

### Abordagem
1. Priorize a segurança do cliente
2. Faça diagnóstico passo a passo
3. Use linguagem simples, evite jargões
4. Sempre confirme se o problema foi resolvido

### Fluxo de Atendimento
1. Identifique o cliente (contrato/CPF)
2. Entenda o problema
3. Faça diagnóstico remoto quando possível
4. Agende visita técnica se necessário

### Problemas Comuns
- **Geração baixa**: Verificar sujeira, sombreamento, clima
- **Inversor offline**: Verificar disjuntores, conexão WiFi
- **Erro no app**: Verificar credenciais, atualização
- **Fatura alta**: Explicar compensação, bandeiras

### Segurança (CRÍTICO)
⚠️ Se o cliente mencionar:
- Fogo, fumaça, faísca → Emergência imediata
- Choque elétrico → Chamar ambulância
- Vazamento → Desligar disjuntor

### Escalação
Transfira para humano se:
- Problema de segurança
- Falha total do sistema
- Cliente muito frustrado
- Necessidade de garantia
    `.trim();
    
    return baseAdditions ? `${baseAdditions}\n\n${technicalPrompt}` : technicalPrompt;
  }
  
  // ─────────────────────────────────────────────────────────────
  // GREETING
  // ─────────────────────────────────────────────────────────────
  
  override shouldSendGreeting(context: TriageContext): boolean {
    return context.totalMessages === 0;
  }
  
  override getGreetingTemplate(context: TriageContext): string | null {
    const name = context.clienteNome || '';
    const greeting = name 
      ? `Olá, ${name}! 👋`
      : 'Olá! 👋';
    
    return `${greeting}

Sou o jaimE, assistente virtual de suporte técnico da Coesa Energia.

Como posso ajudá-lo com sua instalação solar hoje?

Para agilizar o atendimento, pode me informar:
📋 Número do contrato ou CPF
🔧 Tipo de problema que está enfrentando`;
  }
  
  // ─────────────────────────────────────────────────────────────
  // ESCALATION
  // ─────────────────────────────────────────────────────────────
  
  override getEscalationRules(): EscalationRule[] {
    return JAIME_ESCALATION_RULES;
  }
  
  override shouldEscalate(context: EscalationContext): EscalationDecision {
    // Check for safety issues (HIGHEST PRIORITY)
    const safetyPatterns = /fogo|inc[eê]ndio|choque|fa[ií]sca|queimando|fuma[çc]a|pegando\s*fogo/i;
    if (safetyPatterns.test(context.messageText)) {
      return {
        shouldEscalate: true,
        reason: 'EMERGÊNCIA - Risco de segurança detectado',
        targetQueue: 'emergency',
        priority: 'critical',
      };
    }
    
    // Check for complete system outage
    const outagePatterns = /n[aã]o\s*est[aá]\s*gerando|gera[çc][aã]o\s*zero|sistema\s*parado|inversor\s*desligado/i;
    if (outagePatterns.test(context.messageText)) {
      return {
        shouldEscalate: true,
        reason: 'Sistema completamente inoperante',
        targetQueue: 'technical_urgent',
        priority: 'high',
      };
    }
    
    // Check for warranty claims
    const warrantyPatterns = /garantia|defeito\s*de\s*f[aá]brica|trocar\s*equipamento|produto\s*com\s*defeito/i;
    if (warrantyPatterns.test(context.messageText)) {
      return {
        shouldEscalate: true,
        reason: 'Solicitação de garantia',
        targetQueue: 'warranty',
        priority: 'medium',
      };
    }
    
    // Check for consecutive failures
    if (context.consecutiveFailures >= 2) {
      return {
        shouldEscalate: true,
        reason: 'Múltiplas tentativas de resolução sem sucesso',
        targetQueue: 'technical_l2',
        priority: 'medium',
      };
    }
    
    return {
      shouldEscalate: false,
    };
  }
}
