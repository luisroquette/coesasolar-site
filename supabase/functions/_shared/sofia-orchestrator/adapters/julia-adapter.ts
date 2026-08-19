/**
 * JULIA AGENT ADAPTER
 * Adapter for julIA - the collections agent.
 * @module _shared/sofia-orchestrator/adapters/julia-adapter
 */

import { BaseAgentAdapter, createField } from './base-adapter.ts';
import type { AgentRole, PipelineMode, FastPathHandler, FastPathConfig, FieldDefinition, TriageContext, TriageDecision, PipelineConfig, MetricsConfig, OperatorCommandDefinition, ContextInjection, EscalationRule, EscalationContext, EscalationDecision } from './types.ts';

const JULIA_REQUIRED_FIELDS: FieldDefinition[] = [
  createField('valorDebito', 'Valor do débito', 'currency', { required: true, priority: 1, alternatives: ['debito', 'divida'] }),
  createField('diasAtraso', 'Dias em atraso', 'number', { required: true, priority: 2, alternatives: ['atraso_dias'] }),
];

const JULIA_OPTIONAL_FIELDS: FieldDefinition[] = [
  createField('propostaAcordo', 'Proposta de acordo', 'currency', { required: false, priority: 10 }),
  createField('numeroParcelas', 'Número de parcelas', 'number', { required: false, priority: 11 }),
  createField('dataPagamento', 'Data de pagamento', 'date', { required: false, priority: 12 }),
];

const JULIA_FAST_PATHS: FastPathHandler[] = ['payment_promise', 'negotiation_flow', 'partial_payment', 'payment_plan', 'debt_acknowledgment', 'greeting_handler', 'human_escalation', 'out_of_scope'];

const JULIA_ADDITIONAL_COMMANDS: OperatorCommandDefinition[] = [
  { command: '#ACORDO', aliases: ['#NEGOCIAR'], description: 'Registra proposta de acordo', handler: 'handlePaymentAgreement', requiredRole: ['collections'], parameters: [{ name: 'valor', type: 'number', required: true, description: 'Valor do acordo' }] },
  { command: '#PROMESSA', aliases: ['#PROMISE'], description: 'Registra promessa de pagamento', handler: 'handlePaymentPromise', requiredRole: ['collections'], parameters: [{ name: 'data', type: 'date', required: true, description: 'Data prometida' }] },
  { command: '#BOLETO', aliases: ['#2VIA'], description: 'Envia segunda via do boleto', handler: 'handleSendBoleto', requiredRole: ['collections'] },
];

const JULIA_CONTEXT_INJECTIONS: ContextInjection[] = [
  { id: 'debt_summary', priority: 1, template: '## Resumo da Dívida\nValor: R$ {{valorAtualizado}}\nDias em atraso: {{diasAtraso}}', variables: ['valorAtualizado', 'diasAtraso'] },
  { id: 'collection_rules', priority: 2, template: '## Regras de Negociação\nDesconto máximo: {{descontoMaximo}}%\nParcelas máximas: {{parcelasMaximas}}x', variables: ['descontoMaximo', 'parcelasMaximas'] },
];

const JULIA_ESCALATION_RULES: EscalationRule[] = [
  { id: 'legal_threat', triggerPatterns: ['advogado', 'processo', 'serasa', 'spc'], priority: 1, targetQueue: 'collections_legal', notifyOperator: true },
  { id: 'financial_hardship', triggerPatterns: ['desempregado', 'sem renda', 'dificuldade'], priority: 2, targetQueue: 'collections_social', notifyOperator: true },
];

export class JuliaAdapter extends BaseAgentAdapter {
  readonly agentId = 'julia';
  readonly displayName = 'julIA';
  readonly role: AgentRole = 'collections';
  readonly pipelineMode: PipelineMode = 'collections';
  
  override getEnabledFastPaths(): FastPathHandler[] { return JULIA_FAST_PATHS; }
  override getFastPathConfig(): FastPathConfig { return { enabledHandlers: JULIA_FAST_PATHS, disabledHandlers: ['document_collection', 'proposal_flow', 'contract_status', 'billing_inquiry'], priorityOverrides: { 'payment_promise': 1, 'negotiation_flow': 2 } }; }
  override getRequiredFields(): FieldDefinition[] { return JULIA_REQUIRED_FIELDS; }
  override getOptionalFields(): FieldDefinition[] { return JULIA_OPTIONAL_FIELDS; }
  override shouldTriggerTriage(): TriageDecision { return { shouldTriage: false, skipReason: 'Agente outbound - sem triagem' }; }
  override getTriageRedirectAgent(): string | null { return null; }
  override shouldSkipTriage(): boolean { return true; }
  override shouldUsePipelineV2(): boolean { return false; }
  override getPipelineConfig(): PipelineConfig { return { usePipelineV2: false, enabledPhases: ['operator', 'media', 'data_collection', 'fast_path', 'context', 'llm', 'guardrails', 'response'], disabledPhases: ['greeting', 'triage'], phaseTimeouts: { media: 20000, llm: 30000 }, maxRetries: 2, enableMetrics: true, enableLogging: true }; }
  override getMetricsConfig(): MetricsConfig { return { enabled: true, sampleRate: 1.0, detailedTiming: true, logLevel: 'info' }; }
  override getAdditionalCommands(): OperatorCommandDefinition[] { return JULIA_ADDITIONAL_COMMANDS; }
  override getContextInjections(): ContextInjection[] { return JULIA_CONTEXT_INJECTIONS; }
  override buildSystemPromptAdditions(context: Record<string, unknown>): string { const base = super.buildSystemPromptAdditions(context); return base + '\n\n## Diretrizes de Cobrança\nSeja empática mas objetiva. Foque na solução. Evite termos como "dívida" - use "pendência" ou "valor em aberto".'; }
  override shouldSendGreeting(): boolean { return false; }
  override getGreetingTemplate(): string | null { return null; }
  override getEscalationRules(): EscalationRule[] { return JULIA_ESCALATION_RULES; }
  override shouldEscalate(context: EscalationContext): EscalationDecision { if (/advogado|processo|serasa|spc/i.test(context.messageText)) return { shouldEscalate: true, reason: 'Menção legal', targetQueue: 'collections_legal', priority: 'high' }; return { shouldEscalate: false }; }
}
