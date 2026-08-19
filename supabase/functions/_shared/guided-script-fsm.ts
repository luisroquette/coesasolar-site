/**
 * Guided Script FSM (Finite State Machine)
 * Strict funnel flow control for Sofia with validated transitions
 * 
 * States follow the COESA sales process:
 * TRIAGEM → QUALIFICACAO → COLETA_DADOS → PROPOSTA_INICIAL → 
 * DOCS_PLATAFORMA → PROPOSTA_DEFINITIVA → ASSINATURA → FECHADO
 * 
 * Off-script attempts are intercepted and redirected back to the current step
 */

import { getRenderedTemplate, type MessageTemplate } from './message-templates.ts';
import type { ExtractedClientData } from './data-extraction.ts';

// ═══════════════════════════════════════════════════════════════
// TYPES & ENUMS
// ═══════════════════════════════════════════════════════════════

export enum FunnelState {
  TRIAGEM = 'triagem',
  QUALIFICACAO = 'qualificacao',
  COLETA_DADOS = 'coleta_dados',
  PROPOSTA_INICIAL = 'proposta_inicial',
  DOCS_PLATAFORMA = 'docs_plataforma',
  PROPOSTA_DEFINITIVA = 'proposta_definitiva',
  ASSINATURA = 'assinatura',
  FECHADO = 'fechado',
  // Terminal states
  DESCARTADO = 'descartado',
  SAC_REDIRECT = 'sac_redirect',
  PAUSADO = 'paused_for_human',
}

export interface TransitionConditions {
  triagem_concluida: boolean;
  valor_minimo_ok: boolean;
  is_gd1: boolean;
  has_nome: boolean;
  has_email: boolean;
  has_distribuidora: boolean;
  has_valor: boolean;
  proposta_link_sent: boolean;
  all_docs_complete: boolean;
  contrato_url_ready: boolean;
  contrato_assinado: boolean;
}

export interface FSMContext {
  currentState: FunnelState;
  conditions: TransitionConditions;
  clienteNome: string | null;
  proposalUrl: string | null;
  contractUrl: string | null;
  conversaId: string | null;
}

export interface TransitionResult {
  allowed: boolean;
  newState: FunnelState;
  blockedReason?: string;
  redirectMessage?: string;
  missingConditions: string[];
}

export interface OffScriptDetection {
  isOffScript: boolean;
  intendedAction: string | null;
  patternMatched: string | null;
}

export interface AutoTransitionResult {
  shouldTransition: boolean;
  newState: FunnelState;
  reason: string | null;
}

// ═══════════════════════════════════════════════════════════════
// TRANSITION MATRIX
// Defines valid transitions and their required conditions
// ═══════════════════════════════════════════════════════════════

interface TransitionConfig {
  nextState: FunnelState;
  requiredConditions: (keyof TransitionConditions)[];
  redirectTemplate: string;
}

const TRANSITION_MATRIX: Partial<Record<FunnelState, TransitionConfig>> = {
  [FunnelState.TRIAGEM]: {
    nextState: FunnelState.QUALIFICACAO,
    requiredConditions: ['triagem_concluida'],
    redirectTemplate: 'triagem_required',
  },
  [FunnelState.QUALIFICACAO]: {
    nextState: FunnelState.COLETA_DADOS,
    requiredConditions: ['valor_minimo_ok'],
    redirectTemplate: 'qualification_required',
  },
  [FunnelState.COLETA_DADOS]: {
    nextState: FunnelState.PROPOSTA_INICIAL,
    requiredConditions: ['has_nome', 'has_email', 'has_distribuidora', 'has_valor'],
    redirectTemplate: 'data_required',
  },
  [FunnelState.PROPOSTA_INICIAL]: {
    nextState: FunnelState.DOCS_PLATAFORMA,
    requiredConditions: ['proposta_link_sent'],
    redirectTemplate: 'proposal_pending',
  },
  [FunnelState.DOCS_PLATAFORMA]: {
    nextState: FunnelState.PROPOSTA_DEFINITIVA,
    requiredConditions: ['all_docs_complete'],
    redirectTemplate: 'docs_required',
  },
  [FunnelState.PROPOSTA_DEFINITIVA]: {
    nextState: FunnelState.ASSINATURA,
    requiredConditions: ['contrato_url_ready'],
    redirectTemplate: 'contract_pending',
  },
  [FunnelState.ASSINATURA]: {
    nextState: FunnelState.FECHADO,
    requiredConditions: ['contrato_assinado'],
    redirectTemplate: 'signature_pending',
  },
};

// ═══════════════════════════════════════════════════════════════
// OFF-SCRIPT PATTERNS
// Detects when client tries to skip steps or act outside current stage
// ═══════════════════════════════════════════════════════════════

const OFF_SCRIPT_PATTERNS: Partial<Record<FunnelState, { pattern: RegExp; action: string }[]>> = {
  [FunnelState.TRIAGEM]: [
    { pattern: /manda\s*(?:a|minha)\s*proposta/i, action: 'request_proposal_in_triage' },
    { pattern: /quero\s*(?:ver|receber)\s*(?:o\s*)?contrato/i, action: 'request_contract_in_triage' },
  ],
  [FunnelState.QUALIFICACAO]: [
    { pattern: /pode\s*(?:gerar|fazer)\s*(?:a|minha)?\s*proposta/i, action: 'request_proposal_without_qualification' },
    { pattern: /quero\s*assinar/i, action: 'request_signature_in_qualification' },
  ],
  [FunnelState.COLETA_DADOS]: [
    { pattern: /manda\s*(?:a|minha)\s*proposta/i, action: 'request_proposal_without_data' },
    { pattern: /quero\s*(?:ver|receber)\s*(?:o\s*)?contrato/i, action: 'request_contract_without_data' },
    { pattern: /pode\s*(?:gerar|fazer)\s*(?:a|minha)?\s*proposta/i, action: 'request_proposal_without_email' },
    { pattern: /como\s*(?:faço|faz)\s*(?:pra|para)\s*assinar/i, action: 'request_signature_without_data' },
  ],
  [FunnelState.PROPOSTA_INICIAL]: [
    // Trying to send docs via WhatsApp instead of platform
    { pattern: /(?:enviar|mandar|anexar)\s*(?:meus?\s*)?(?:documentos?|rg|cnh)/i, action: 'send_docs_via_whatsapp' },
    { pattern: /(?:aqui|segue)\s*(?:o|meu|minha)\s*(?:rg|cnh|documento)/i, action: 'send_docs_via_whatsapp' },
    { pattern: /vou\s*(?:te\s*)?(?:mandar|enviar)\s*(?:o|meu|minha)?\s*(?:rg|cnh|documento)/i, action: 'send_docs_via_whatsapp' },
    { pattern: /posso\s*(?:te\s*)?(?:mandar|enviar)\s*(?:o|meu|minha)?\s*(?:documento|rg|cnh)/i, action: 'send_docs_via_whatsapp' },
  ],
  [FunnelState.DOCS_PLATAFORMA]: [
    // Trying to get contract before docs are complete
    { pattern: /quero\s*(?:ver|receber)\s*(?:o\s*)?contrato/i, action: 'request_contract_without_docs' },
    { pattern: /(?:gera|manda)\s*(?:o\s*)?contrato/i, action: 'request_contract_without_docs' },
    { pattern: /quando\s*(?:vem|chega)\s*(?:o\s*)?contrato/i, action: 'request_contract_without_docs' },
    { pattern: /cadê\s*(?:o\s*)?(?:meu\s*)?contrato/i, action: 'request_contract_without_docs' },
    { pattern: /preciso\s*(?:do|de um)\s*contrato/i, action: 'request_contract_without_docs' },
    // Still trying to send docs via WhatsApp
    { pattern: /(?:enviar|mandar|anexar)\s*(?:meus?\s*)?(?:documentos?|rg|cnh)/i, action: 'send_docs_via_whatsapp' },
    { pattern: /(?:aqui|segue)\s*(?:o|meu|minha)\s*(?:rg|cnh|documento)/i, action: 'send_docs_via_whatsapp' },
  ],
  [FunnelState.PROPOSTA_DEFINITIVA]: [
    // Impatience about signature
    { pattern: /por\s*que\s*(?:não|nao)\s*(?:posso|consigo)\s*assinar/i, action: 'signature_confusion' },
  ],
  [FunnelState.ASSINATURA]: [
    // Asking about next steps after signature is available
    { pattern: /o\s*que\s*(?:falta|precisa)/i, action: 'signature_confusion' },
  ],
};

// ═══════════════════════════════════════════════════════════════
// CURRENT STEP ACTIONS (for redirect messages)
// ═══════════════════════════════════════════════════════════════

const CURRENT_STEP_ACTIONS: Partial<Record<FunnelState, string>> = {
  [FunnelState.TRIAGEM]: 'me conte um pouco sobre você para eu entender melhor como posso ajudar',
  [FunnelState.QUALIFICACAO]: 'me informe o *valor médio* da sua conta de luz',
  [FunnelState.COLETA_DADOS]: 'me informe seu *e-mail* e o *valor médio* da sua conta de luz',
  [FunnelState.PROPOSTA_INICIAL]: 'acesse o link da proposta que enviei',
  [FunnelState.DOCS_PLATAFORMA]: 'envie seus documentos pelo link da proposta',
  [FunnelState.PROPOSTA_DEFINITIVA]: 'aguarde a geração do seu contrato',
  [FunnelState.ASSINATURA]: 'assine o contrato no link que enviei',
};

// ═══════════════════════════════════════════════════════════════
// FSM CONTEXT BUILDER
// ═══════════════════════════════════════════════════════════════

export interface BuildFSMContextParams {
  conversa: {
    id: string;
    proposta_id?: string | null;
    proposta_link_sent_at?: string | null;
    event_proposal_sent?: boolean | null;
    all_docs_complete_at?: string | null;
    contrato_enviado_at?: string | null;
    contrato_assinado_at?: string | null;
    dados_coletados?: Record<string, unknown> | null;
    sofia_mode?: string | null;
    bitrix24_stage?: string | null;
  } | null;
  dadosColetados: ExtractedClientData | null;
  proposalUrl: string | null;
  contractUrl?: string | null;
  clienteNome: string | null;
}

export function buildFSMContext(params: BuildFSMContextParams): FSMContext {
  const { conversa, dadosColetados, proposalUrl, contractUrl, clienteNome } = params;
  
  const dados = dadosColetados || {};
  const existingDados = (conversa?.dados_coletados as ExtractedClientData) || {};
  const mergedDados = { ...existingDados, ...dados };
  
  // Build conditions from available data
  const conditions: TransitionConditions = {
    triagem_concluida: !!(mergedDados as any).triagem_concluida || 
                       !!(mergedDados as any).is_new_client !== undefined ||
                       !!(mergedDados.valorFatura || mergedDados.consumo || mergedDados.email),
    valor_minimo_ok: (mergedDados.valorFatura && mergedDados.valorFatura >= 300) ||
                     (mergedDados.consumo && mergedDados.consumo >= 150) ||
                     false,
    is_gd1: !!(mergedDados as any).is_gd1 || !!(mergedDados as any).concorrente_detectado,
    has_nome: !!(mergedDados.nome && mergedDados.nome.trim().length >= 2),
    has_email: !!(mergedDados.email && mergedDados.email.includes('@')),
    has_distribuidora: !!(mergedDados.distribuidora),
    has_valor: !!(mergedDados.valorFatura || mergedDados.consumo),
    proposta_link_sent: !!(conversa?.proposta_link_sent_at || conversa?.event_proposal_sent),
    all_docs_complete: !!(conversa?.all_docs_complete_at),
    contrato_url_ready: !!(conversa?.contrato_enviado_at || contractUrl),
    contrato_assinado: !!(conversa?.contrato_assinado_at),
  };
  
  // Determine current state from conditions
  const currentState = determineCurrentState(conditions, conversa);
  
  return {
    currentState,
    conditions,
    clienteNome,
    proposalUrl,
    contractUrl: contractUrl || null,
    conversaId: conversa?.id || null,
  };
}

/**
 * Determines current funnel state based on conditions
 */
function determineCurrentState(
  conditions: TransitionConditions,
  conversa: BuildFSMContextParams['conversa']
): FunnelState {
  // Check terminal states first
  if (conversa?.sofia_mode === 'paused_for_human') return FunnelState.PAUSADO;
  if (conversa?.sofia_mode === 'sac_redirect') return FunnelState.SAC_REDIRECT;
  if ((conversa?.dados_coletados as any)?.descartado) return FunnelState.DESCARTADO;
  
  // Progress through stages based on achievements
  if (conditions.contrato_assinado) return FunnelState.FECHADO;
  if (conditions.contrato_url_ready) return FunnelState.ASSINATURA;
  if (conditions.all_docs_complete) return FunnelState.PROPOSTA_DEFINITIVA;
  if (conditions.proposta_link_sent) return FunnelState.DOCS_PLATAFORMA;
  
  // Check if ready for proposal
  if (conditions.has_nome && conditions.has_email && conditions.has_distribuidora && conditions.has_valor) {
    return FunnelState.PROPOSTA_INICIAL;
  }
  
  // Check if qualification passed
  if (conditions.valor_minimo_ok && !conditions.is_gd1) {
    return FunnelState.COLETA_DADOS;
  }
  
  // Check if triage is done
  if (conditions.triagem_concluida) {
    return FunnelState.QUALIFICACAO;
  }
  
  return FunnelState.TRIAGEM;
}

// ═══════════════════════════════════════════════════════════════
// TRANSITION VALIDATION
// ═══════════════════════════════════════════════════════════════

/**
 * Validates if a transition to target state is allowed
 */
export function validateTransition(
  ctx: FSMContext,
  targetState: FunnelState
): TransitionResult {
  const currentConfig = TRANSITION_MATRIX[ctx.currentState];
  
  // No config = terminal state or no transitions defined
  if (!currentConfig) {
    return {
      allowed: false,
      newState: ctx.currentState,
      blockedReason: 'no_transitions_from_state',
      missingConditions: [],
    };
  }
  
  // Check if target is valid next state
  if (targetState !== currentConfig.nextState && targetState !== ctx.currentState) {
    return {
      allowed: false,
      newState: ctx.currentState,
      blockedReason: 'invalid_transition_target',
      redirectMessage: buildRedirectMessage(ctx, 'skip_attempt'),
      missingConditions: [],
    };
  }
  
  // Check required conditions
  const missingConditions = currentConfig.requiredConditions.filter(
    cond => !ctx.conditions[cond]
  );
  
  if (missingConditions.length > 0) {
    return {
      allowed: false,
      newState: ctx.currentState,
      blockedReason: 'missing_conditions',
      redirectMessage: buildRedirectMessage(ctx, currentConfig.redirectTemplate),
      missingConditions,
    };
  }
  
  return {
    allowed: true,
    newState: targetState,
    missingConditions: [],
  };
}

/**
 * Checks if auto-transition should happen based on current conditions
 */
export function checkAutoTransition(ctx: FSMContext): AutoTransitionResult {
  const currentConfig = TRANSITION_MATRIX[ctx.currentState];
  
  if (!currentConfig) {
    return { shouldTransition: false, newState: ctx.currentState, reason: null };
  }
  
  const missingConditions = currentConfig.requiredConditions.filter(
    cond => !ctx.conditions[cond]
  );
  
  if (missingConditions.length === 0) {
    return {
      shouldTransition: true,
      newState: currentConfig.nextState,
      reason: `All conditions met for ${ctx.currentState} → ${currentConfig.nextState}`,
    };
  }
  
  return { shouldTransition: false, newState: ctx.currentState, reason: null };
}

// ═══════════════════════════════════════════════════════════════
// OFF-SCRIPT DETECTION
// ═══════════════════════════════════════════════════════════════

/**
 * Detects if message attempts to skip current funnel step
 */
export function detectOffScriptIntent(
  message: string,
  currentState: FunnelState
): OffScriptDetection {
  const patterns = OFF_SCRIPT_PATTERNS[currentState] || [];
  
  for (const { pattern, action } of patterns) {
    if (pattern.test(message)) {
      return {
        isOffScript: true,
        intendedAction: action,
        patternMatched: pattern.source,
      };
    }
  }
  
  return { isOffScript: false, intendedAction: null, patternMatched: null };
}

// ═══════════════════════════════════════════════════════════════
// REDIRECT MESSAGE BUILDER
// ═══════════════════════════════════════════════════════════════

// Fallback messages when templates not loaded
const FALLBACK_MESSAGES: Record<string, string> = {
  'off_script_redirect': '{cliente_nome}, ótima pergunta! Vou guardar essa dúvida para responder daqui a pouco. 😊\n\nAntes, preciso que você {current_step_action}. Assim consigo avançar com sua proposta!',
  'email_required': '{cliente_nome}, para preparar sua proposta personalizada, preciso primeiro do seu *e-mail*! 📧\n\nAssim você recebe todos os detalhes da economia. Qual é o seu e-mail?',
  'docs_platform_required': '{cliente_nome}, para sua *segurança*, os documentos devem ser enviados pelo link da proposta! 🔒\n\n📎 Acesse aqui: {proposal_url}\n\nClique em "Solicitar Contrato" para anexar os arquivos.\n\n⚠️ OBS: Esta mensagem só é enviada APÓS o link da proposta ser disponibilizado.',
  'contract_pending_docs': '{cliente_nome}, para gerar seu contrato, preciso primeiro que você envie os documentos pelo link! 📋\n\n📎 Acesse: {proposal_url}\n\nAssim que receber tudo, preparo seu contrato rapidinho! 😊',
  'proposal_first': '{cliente_nome}, primeiro vou preparar sua *proposta inicial* com a simulação de economia! 📊\n\nPara isso, preciso saber: qual o *valor médio* da sua conta de luz e qual a sua *distribuidora*?',
  'signature_pending': '{cliente_nome}, seu contrato já está pronto! 📋\n\n📎 Acesse aqui para assinar: {contract_url}\n\nQualquer dúvida antes de assinar, estou aqui! 😊',
  'skip_attempt': '{cliente_nome}, ótima pergunta! 😊 Mas antes de avançar, preciso que você {current_step_action}.\n\nAssim garanto que sua proposta fique perfeita!',
  'data_required': '{cliente_nome}, para preparar sua proposta, preciso de algumas informações:\n\n📧 Seu e-mail\n💡 Valor médio da conta de luz\n⚡ Sua distribuidora de energia\n\nPode me passar?',
  'docs_required': '{cliente_nome}, para gerar sua proposta definitiva, preciso que você envie os documentos pelo link! 📋\n\n📎 Acesse: {proposal_url}',
  'qualification_required': '{cliente_nome}, me conta: qual é o valor médio da sua conta de luz? 💡\n\nAssim consigo calcular sua economia!',
  'triagem_required': 'Olá! 👋 Sou a sofIA, assistente virtual da COESA. Você já é cliente ou está conhecendo nosso serviço de energia por assinatura?',
  'proposal_pending': '{cliente_nome}, sua proposta está sendo preparada! ✨\n\nAssim que o link estiver pronto, te envio aqui. Aguarde só mais um pouquinho! 😊',
  'contract_pending': '{cliente_nome}, estamos preparando seu contrato! 📝\n\nAssim que estiver pronto, te envio o link para assinatura. Aguarde! 😊',
};

/**
 * Builds redirect message for off-script attempts
 */
export function buildRedirectMessage(
  ctx: FSMContext,
  templateKey: string,
  templates?: Map<string, MessageTemplate>
): string {
  const firstName = ctx.clienteNome?.split(' ')[0] || '';
  const currentAction = CURRENT_STEP_ACTIONS[ctx.currentState] || 'continue no fluxo atual';
  
  const variables = {
    cliente_nome: firstName,
    current_step_action: currentAction,
    proposal_url: ctx.proposalUrl || '[link em geração]',
    contract_url: ctx.contractUrl || '[link em geração]',
  };
  
  // Try to get from templates cache first
  if (templates) {
    const template = templates.get(`guided_script:${templateKey}`);
    if (template?.template_text) {
      return renderTemplate(template.template_text, variables);
    }
  }
  
  // Use fallback
  const fallback = FALLBACK_MESSAGES[templateKey] || FALLBACK_MESSAGES['off_script_redirect'];
  return renderTemplate(fallback, variables);
}

/**
 * Simple template renderer
 */
function renderTemplate(template: string, variables: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value || '');
  }
  // Clean up empty names at start
  result = result.replace(/^,\s*/, '').replace(/^\s+/, '');
  return result;
}

// ═══════════════════════════════════════════════════════════════
// SPECIFIC REDIRECT MESSAGES BY ACTION
// ═══════════════════════════════════════════════════════════════

/**
 * Gets specific redirect message based on detected off-script action
 */
export function getRedirectMessageForAction(
  ctx: FSMContext,
  intendedAction: string,
  templates?: Map<string, MessageTemplate>
): string {
  const firstName = ctx.clienteNome?.split(' ')[0] || '';
  
  // ═══════════════════════════════════════════════════════════════
  // GATE: NÃO mencionar documentos se proposta ainda não foi enviada
  // Erro identificado: mensagens sobre docs apareciam antes do link
  // ═══════════════════════════════════════════════════════════════
  const proposalNotReady = !ctx.proposalUrl || ctx.proposalUrl === '[link em geração]';
  
  if (intendedAction === 'send_docs_via_whatsapp' && proposalNotReady) {
    // Cliente tentou enviar docs mas proposta ainda não foi gerada
    // Redirecionar para "aguarde a proposta" em vez de "envie pelo link"
    console.log(`[FSM] ⚠️ Doc redirect blocked - proposal not ready yet`);
    return buildRedirectMessage(ctx, 'proposal_pending', templates);
  }
  
  // Map actions to specific template keys
  const actionTemplateMap: Record<string, string> = {
    'send_docs_via_whatsapp': 'docs_platform_required',
    'request_contract_without_docs': 'contract_pending_docs',
    'request_proposal_without_data': 'data_required',
    'request_proposal_without_email': 'email_required',
    'request_proposal_in_triage': 'proposal_first',
    'request_contract_in_triage': 'proposal_first',
    'request_contract_without_data': 'proposal_first',
    'signature_confusion': 'signature_pending',
  };
  
  const templateKey = actionTemplateMap[intendedAction] || 'off_script_redirect';
  return buildRedirectMessage(ctx, templateKey, templates);
}

// ═══════════════════════════════════════════════════════════════
// FSM ORCHESTRATOR
// Main entry point for FSM validation in webhook
// ═══════════════════════════════════════════════════════════════

export interface FSMCheckParams {
  supabase: any;
  messageText: string;
  fsmContext: FSMContext;
  templates?: Map<string, MessageTemplate>;
  agentId?: string;
}

export interface FSMCheckResult {
  shouldBlock: boolean;
  isOffScript: boolean;
  redirectMessage: string | null;
  currentState: FunnelState;
  intendedAction: string | null;
  autoTransition: AutoTransitionResult;
}

/**
 * Main FSM check - call before LLM processing
 */
export function executeFSMCheck(params: FSMCheckParams): FSMCheckResult {
  const { messageText, fsmContext, templates } = params;
  
  // Skip FSM for terminal states
  const terminalStates = [FunnelState.FECHADO, FunnelState.DESCARTADO, FunnelState.SAC_REDIRECT, FunnelState.PAUSADO];
  if (terminalStates.includes(fsmContext.currentState)) {
    return {
      shouldBlock: false,
      isOffScript: false,
      redirectMessage: null,
      currentState: fsmContext.currentState,
      intendedAction: null,
      autoTransition: { shouldTransition: false, newState: fsmContext.currentState, reason: null },
    };
  }
  
  // Check for off-script intent
  const offScriptCheck = detectOffScriptIntent(messageText, fsmContext.currentState);
  
  if (offScriptCheck.isOffScript) {
    const redirectMessage = getRedirectMessageForAction(
      fsmContext,
      offScriptCheck.intendedAction || 'off_script_redirect',
      templates
    );
    
    return {
      shouldBlock: true,
      isOffScript: true,
      redirectMessage,
      currentState: fsmContext.currentState,
      intendedAction: offScriptCheck.intendedAction,
      autoTransition: { shouldTransition: false, newState: fsmContext.currentState, reason: null },
    };
  }
  
  // Check for auto-transition
  const autoTransition = checkAutoTransition(fsmContext);
  
  return {
    shouldBlock: false,
    isOffScript: false,
    redirectMessage: null,
    currentState: fsmContext.currentState,
    intendedAction: null,
    autoTransition,
  };
}

// ═══════════════════════════════════════════════════════════════
// STATE LABELS (for display)
// ═══════════════════════════════════════════════════════════════

export const FSM_STATE_LABELS: Record<FunnelState, string> = {
  [FunnelState.TRIAGEM]: 'Triagem',
  [FunnelState.QUALIFICACAO]: 'Qualificação',
  [FunnelState.COLETA_DADOS]: 'Coleta de Dados',
  [FunnelState.PROPOSTA_INICIAL]: 'Proposta Inicial',
  [FunnelState.DOCS_PLATAFORMA]: 'Aguardando Documentos',
  [FunnelState.PROPOSTA_DEFINITIVA]: 'Proposta Definitiva',
  [FunnelState.ASSINATURA]: 'Aguardando Assinatura',
  [FunnelState.FECHADO]: 'Fechado',
  [FunnelState.DESCARTADO]: 'Descartado',
  [FunnelState.SAC_REDIRECT]: 'Redirecionado SAC',
  [FunnelState.PAUSADO]: 'Atendimento Humano',
};
