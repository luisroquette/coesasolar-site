/**
 * MARIA AGENT ADAPTER
 * 
 * Adapter for marIA - the SAC/customer support agent.
 * Handles existing client inquiries, contract status, and complaints.
 * 
 * @module _shared/sofia-orchestrator/adapters/maria-adapter
 */

import { BaseAgentAdapter, createField } from './base-adapter.ts';
import type { AgentRole, PipelineMode, FastPathHandler, FastPathConfig, FieldDefinition, TriageContext, TriageDecision, PipelineConfig, MetricsConfig, OperatorCommandDefinition, ContextInjection, EscalationRule, EscalationContext, EscalationDecision } from './types.ts';

const MARIA_REQUIRED_FIELDS: FieldDefinition[] = [
  createField('identificacao', 'Número do contrato ou CPF/CNPJ', 'text', { required: true, priority: 1, promptTemplate: 'Para localizar seu cadastro, pode me informar o número do contrato ou CPF/CNPJ?', alternatives: ['numero_contrato', 'cpf', 'cnpj', 'cpf_cnpj'] }),
];

const MARIA_OPTIONAL_FIELDS: FieldDefinition[] = [
  createField('protocolo', 'Protocolo de atendimento', 'text', { required: false, priority: 10, alternatives: ['numero_protocolo'] }),
  createField('motivoContato', 'Motivo do contato', 'text', { required: false, priority: 11, alternatives: ['motivo', 'assunto'] }),
  createField('email', 'E-mail', 'email', { required: false, priority: 12 }),
];

const MARIA_FAST_PATHS: FastPathHandler[] = ['contract_status', 'billing_inquiry', 'complaint_handler', 'ticket_creation', 'greeting_handler', 'human_escalation', 'out_of_scope'];

const MARIA_ADDITIONAL_COMMANDS: OperatorCommandDefinition[] = [
  { command: '#PROTOCOLO', aliases: ['#TICKET'], description: 'Gera novo protocolo de atendimento', handler: 'handleCreateProtocol', requiredRole: ['sac'] },
  { command: '#VENDAS', aliases: ['#SOFIA'], description: 'Redireciona para vendas (sofIA)', handler: 'handleSalesRedirect', requiredRole: ['sac'] },
  { command: '#COBRANCA', aliases: ['#JULIA'], description: 'Redireciona para cobrança (julIA)', handler: 'handleCollectionsRedirect', requiredRole: ['sac'] },
  { command: '#ESCALAR', aliases: ['#SUPERVISOR'], description: 'Escala para supervisor', handler: 'handleSupervisorEscalation', requiredRole: ['sac'] },
];

const MARIA_CONTEXT_INJECTIONS: ContextInjection[] = [
  { id: 'client_identification', priority: 1, condition: (ctx) => !!ctx.clienteIdentificado, template: '## Cliente Identificado\nNome: {{clienteNome}}\nContrato: {{numeroContrato}}\nStatus: {{statusContrato}}', variables: ['clienteNome', 'numeroContrato', 'statusContrato'] },
];

const MARIA_ESCALATION_RULES: EscalationRule[] = [
  { id: 'urgent_complaint', triggerPatterns: ['procon', 'advogado', 'processo', 'anatel'], priority: 1, targetQueue: 'sac_supervisor', notifyOperator: true, autoMessage: 'Entendo a urgência. Vou acionar nosso supervisor.' },
  { id: 'cancellation_request', triggerPatterns: ['cancelar', 'cancelamento', 'desistir'], priority: 2, targetQueue: 'retention', notifyOperator: true },
];

export class MariaAdapter extends BaseAgentAdapter {
  readonly agentId = 'maria';
  readonly displayName = 'marIA';
  readonly role: AgentRole = 'sac';
  readonly pipelineMode: PipelineMode = 'service_desk';
  
  override getEnabledFastPaths(): FastPathHandler[] { return MARIA_FAST_PATHS; }
  override getFastPathConfig(): FastPathConfig { return { enabledHandlers: MARIA_FAST_PATHS, disabledHandlers: ['document_collection', 'proposal_flow', 'payment_promise', 'negotiation_flow'], priorityOverrides: { 'contract_status': 1, 'complaint_handler': 2 } }; }
  override getRequiredFields(): FieldDefinition[] { return MARIA_REQUIRED_FIELDS; }
  override getOptionalFields(): FieldDefinition[] { return MARIA_OPTIONAL_FIELDS; }
  
  override shouldTriggerTriage(context: TriageContext): TriageDecision {
    const salesPatterns = [/quero\s*(contratar|assinar)/i, /quanto\s*(custa|fica)/i, /me\s*interessei/i];
    if (salesPatterns.some(p => p.test(context.messageText))) {
      return { shouldTriage: true, redirectToAgent: 'sofia', reason: 'Cliente quer nova venda' };
    }
    return { shouldTriage: false };
  }
  
  override getTriageRedirectAgent(): string | null { return 'sofia'; }
  override shouldSkipTriage(): boolean { return false; }
  override shouldUsePipelineV2(): boolean { return false; }
  override getPipelineConfig(): PipelineConfig { return { usePipelineV2: false, enabledPhases: ['operator', 'greeting', 'media', 'triage', 'context', 'llm', 'guardrails', 'response'], disabledPhases: ['data_collection'], phaseTimeouts: { media: 30000, llm: 30000 }, maxRetries: 2, enableMetrics: true, enableLogging: true }; }
  override getMetricsConfig(): MetricsConfig { return { enabled: true, sampleRate: 1.0, detailedTiming: false, logLevel: 'info' }; }
  override getAdditionalCommands(): OperatorCommandDefinition[] { return MARIA_ADDITIONAL_COMMANDS; }
  override getContextInjections(): ContextInjection[] { return MARIA_CONTEXT_INJECTIONS; }
  override shouldSendGreeting(context: TriageContext): boolean { return context.totalMessages === 0; }
  override getGreetingTemplate(context: TriageContext): string | null { const name = context.clienteNome || ''; return `${name ? `Olá, ${name}!` : 'Olá!'} 👋\n\nSou a marIA, assistente de atendimento da Coesa Energia.\n\nComo posso ajudá-lo hoje?`; }
  override getEscalationRules(): EscalationRule[] { return MARIA_ESCALATION_RULES; }
  override shouldEscalate(context: EscalationContext): EscalationDecision { if (/procon|advogado|processo/i.test(context.messageText)) return { shouldEscalate: true, reason: 'Menção legal', targetQueue: 'sac_supervisor', priority: 'critical' }; return { shouldEscalate: false }; }
}
