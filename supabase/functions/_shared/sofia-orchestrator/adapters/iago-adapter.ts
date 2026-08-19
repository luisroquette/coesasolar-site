/**
 * IAGO AGENT ADAPTER
 * 
 * Adapter for iagO - the outbound sales agent.
 * Handles proactive outreach for sales campaigns.
 * Inherits most behavior from Sofia but with outbound-specific adjustments.
 * 
 * @module _shared/sofia-orchestrator/adapters/iago-adapter
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

// Import Sofia's definitions as base
import { SofiaAdapter } from './sofia-adapter.ts';

// ═══════════════════════════════════════════════════════════════
// IAGO FAST-PATHS (subset of Sofia)
// ═══════════════════════════════════════════════════════════════

const IAGO_FAST_PATHS: FastPathHandler[] = [
  // Core sales fast-paths (subset)
  'confirmation_handlers',
  'audio_preference',
  'discount_objection',
  'price_inquiry',
  'simulation_request',
  // Common handlers
  'greeting_handler',
  'human_escalation',
  'out_of_scope',
];

// ═══════════════════════════════════════════════════════════════
// IAGO OPERATOR COMMANDS
// ═══════════════════════════════════════════════════════════════

const IAGO_ADDITIONAL_COMMANDS: OperatorCommandDefinition[] = [
  {
    command: '#CALLBACK',
    aliases: ['#LIGAR', '#AGENDAR'],
    description: 'Agenda callback para o lead',
    handler: 'handleScheduleCallback',
    requiredRole: ['outbound_sales'],
    parameters: [
      {
        name: 'data',
        type: 'date',
        required: true,
        description: 'Data do callback (DD/MM/AAAA)',
      },
      {
        name: 'horario',
        type: 'string',
        required: false,
        description: 'Horário preferencial',
      },
    ],
  },
  {
    command: '#REJEITAR',
    aliases: ['#NAO_INTERESSADO'],
    description: 'Marca lead como não interessado',
    handler: 'handleRejectLead',
    requiredRole: ['outbound_sales'],
    parameters: [
      {
        name: 'motivo',
        type: 'string',
        required: true,
        description: 'Motivo da rejeição',
      },
    ],
  },
  {
    command: '#TRANSFERIR',
    aliases: ['#SOFIA'],
    description: 'Transfere para Sofia (vendas inbound)',
    handler: 'handleTransferToSofia',
    requiredRole: ['outbound_sales'],
  },
];

// ═══════════════════════════════════════════════════════════════
// IAGO CONTEXT INJECTIONS
// ═══════════════════════════════════════════════════════════════

const IAGO_CONTEXT_INJECTIONS: ContextInjection[] = [
  {
    id: 'campaign_context',
    priority: 1,
    template: `
## Contexto da Campanha
Campanha: {{campaignName}}
Segmento: {{segmento}}
Oferta especial: {{ofertaEspecial}}
Validade: {{validadeOferta}}
    `.trim(),
    variables: ['campaignName', 'segmento', 'ofertaEspecial', 'validadeOferta'],
  },
  {
    id: 'lead_info',
    priority: 2,
    template: `
## Informações do Lead
Origem: {{leadOrigem}}
Score: {{leadScore}}
Último contato: {{ultimoContato}}
Tentativas anteriores: {{tentativasAnteriores}}
    `.trim(),
    variables: ['leadOrigem', 'leadScore', 'ultimoContato', 'tentativasAnteriores'],
  },
  {
    id: 'outbound_rules',
    priority: 3,
    template: `
## Regras de Abordagem Outbound
- Seja direto e objetivo
- Mencione a oferta especial logo no início
- Respeite se o lead não tiver interesse
- Não insista mais de 2x se houver resistência
    `.trim(),
  },
];

// ═══════════════════════════════════════════════════════════════
// IAGO ADAPTER CLASS
// ═══════════════════════════════════════════════════════════════

export class IagoAdapter extends BaseAgentAdapter {
  readonly agentId = 'iago';
  readonly displayName = 'iagO';
  readonly role: AgentRole = 'outbound_sales';
  readonly pipelineMode: PipelineMode = 'outbound';
  
  // Reference to Sofia adapter for inherited behavior
  private sofiaAdapter = new SofiaAdapter();
  
  // ─────────────────────────────────────────────────────────────
  // FAST-PATHS
  // ─────────────────────────────────────────────────────────────
  
  override getEnabledFastPaths(): FastPathHandler[] {
    return IAGO_FAST_PATHS;
  }
  
  override getFastPathConfig(): FastPathConfig {
    return {
      enabledHandlers: IAGO_FAST_PATHS,
      disabledHandlers: [
        // Disable document collection for outbound
        'document_collection',
        'proposal_flow',
        // Disable SAC handlers
        'contract_status',
        'billing_inquiry',
        'complaint_handler',
        // Disable collections handlers
        'payment_promise',
        'negotiation_flow',
      ],
      priorityOverrides: {
        'simulation_request': 1,
        'price_inquiry': 2,
        'discount_objection': 3,
      },
    };
  }
  
  // ─────────────────────────────────────────────────────────────
  // DATA COLLECTION (inherits from Sofia)
  // ─────────────────────────────────────────────────────────────
  
  override getRequiredFields(): FieldDefinition[] {
    // Same as Sofia but with adjusted priorities
    return this.sofiaAdapter.getRequiredFields().map(field => ({
      ...field,
      priority: field.priority + 10, // Lower priority - outbound focuses on pitch first
    }));
  }
  
  override getOptionalFields(): FieldDefinition[] {
    return this.sofiaAdapter.getOptionalFields();
  }
  
  // ─────────────────────────────────────────────────────────────
  // TRIAGE (disabled for outbound)
  // ─────────────────────────────────────────────────────────────
  
  override shouldTriggerTriage(_context: TriageContext): TriageDecision {
    return {
      shouldTriage: false,
      skipReason: 'Agente outbound - sem triagem',
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
    return true; // Same as Sofia
  }
  
  override getPipelineConfig(): PipelineConfig {
    return {
      usePipelineV2: true,
      enabledPhases: [
        'operator',
        'media',
        'data_collection',
        'fast_path',
        'context',
        'llm',
        'guardrails',
        'response',
      ],
      disabledPhases: [
        'greeting', // No auto greeting - campaign system handles it
        'triage', // No triage for outbound
      ],
      phaseTimeouts: {
        media: 20000,
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
      detailedTiming: true,
      logLevel: 'info',
    };
  }
  
  // ─────────────────────────────────────────────────────────────
  // OPERATOR COMMANDS
  // ─────────────────────────────────────────────────────────────
  
  override getAdditionalCommands(): OperatorCommandDefinition[] {
    return IAGO_ADDITIONAL_COMMANDS;
  }
  
  // ─────────────────────────────────────────────────────────────
  // LLM CONTEXT
  // ─────────────────────────────────────────────────────────────
  
  override getContextInjections(): ContextInjection[] {
    return IAGO_CONTEXT_INJECTIONS;
  }
  
  override buildSystemPromptAdditions(context: Record<string, unknown>): string {
    const baseAdditions = super.buildSystemPromptAdditions(context);
    
    const outboundPrompt = `
## Diretrizes Outbound (iagO)

Você é o iagO, especialista em vendas proativas da Coesa Energia.

### Abordagem
1. Seja direto e objetivo - o cliente não te procurou
2. Apresente a oferta especial imediatamente
3. Foque nos benefícios tangíveis (economia real em R$)
4. Respeite sinais de desinteresse

### Sequência de Abordagem
1. Cumprimento + identificação
2. Oferta especial com benefício claro
3. Pergunta de qualificação
4. Agendamento ou próximo passo

### Objeções Comuns Outbound
- "Não estou interessado" → Pergunte o motivo brevemente
- "Me liga depois" → Agende data/hora específica
- "Já tenho fornecedor" → Pergunte sobre satisfação
- "Como conseguiu meu número?" → Seja transparente sobre a fonte

### Limites
- Máximo 2 tentativas de reengajamento
- Não insista se o lead for enfático
- Registre motivo de desinteresse
    `.trim();
    
    return baseAdditions ? `${baseAdditions}\n\n${outboundPrompt}` : outboundPrompt;
  }
  
  // ─────────────────────────────────────────────────────────────
  // GREETING (handled by campaign system)
  // ─────────────────────────────────────────────────────────────
  
  override shouldSendGreeting(_context: TriageContext): boolean {
    return false; // Campaign system handles initial message
  }
  
  override getGreetingTemplate(_context: TriageContext): string | null {
    return null;
  }
  
  // ─────────────────────────────────────────────────────────────
  // ESCALATION
  // ─────────────────────────────────────────────────────────────
  
  override getEscalationRules(): EscalationRule[] {
    return [
      {
        id: 'strong_rejection',
        triggerPatterns: ['nunca mais', 'pare de ligar', 'procon', 'denunciar'],
        priority: 1,
        targetQueue: 'outbound_blocklist',
        notifyOperator: true,
        autoMessage: 'Entendo perfeitamente. Peço desculpas pelo incômodo. Não entraremos mais em contato.',
      },
      {
        id: 'qualified_lead',
        triggerPatterns: ['interessado', 'quero saber mais', 'pode me explicar'],
        priority: 2,
        targetQueue: 'sales_qualified',
        notifyOperator: false,
      },
    ];
  }
  
  override shouldEscalate(context: EscalationContext): EscalationDecision {
    // Check for strong rejection
    const rejectionPatterns = /nunca\s*mais|pare\s*de\s*ligar|procon|denunciar|bloquear|n[aã]o\s*ligue/i;
    if (rejectionPatterns.test(context.messageText)) {
      return {
        shouldEscalate: true,
        reason: 'Rejeição enfática - adicionar à blocklist',
        targetQueue: 'outbound_blocklist',
        priority: 'high',
      };
    }
    
    // Check for qualified interest
    const interestPatterns = /interessado|quero\s*saber|me\s*explica|como\s*funciona|quanto\s*economizo/i;
    if (interestPatterns.test(context.messageText)) {
      return {
        shouldEscalate: true,
        reason: 'Lead qualificado - transferir para vendas',
        targetQueue: 'sales_qualified',
        priority: 'medium',
      };
    }
    
    return {
      shouldEscalate: false,
    };
  }
}
