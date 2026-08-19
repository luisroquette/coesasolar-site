// ═══════════════════════════════════════════════════════════════
// PENDING TASK MANAGER - Phase 47
// Extracted from sofia-webhook/index.ts (~275 lines)
// Tracks promises Sofia makes and ensures they are fulfilled
// ═══════════════════════════════════════════════════════════════

import { type FullAgentConfig } from './ai-gym-config.ts';
import { 
  getMissingDataQuestion, 
  getTimeoutMessage, 
  getAudioTimeoutFallback,
  type MessageTemplate,
} from './message-templates.ts';
import { 
  isClarificationQuestion, 
  detectPaymentClarification,
  detectBillingEducationQuestion,
} from './billing-education.ts';

// deno-lint-ignore no-explicit-any
type TemplatesCache = any;

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type PendingTaskType = 'proposta_inicial' | 'enviar_link' | 'verificar_proposta' | 'enviar_audio' | null;

export interface ExtractedClientDataForTask {
  nome?: string;
  email?: string;
  valorFatura?: number | string;
  consumo?: number | string;
  distribuidora?: string;
  // Allow additional fields without strict index signature
}

export interface PendingTaskConversation {
  id: string;
  cliente_telefone: string;
  cliente_nome: string | null;
  pending_task: PendingTaskType;
  pending_task_retries: number;
  pending_task_created_at?: string | null;
  created_at?: string;
  // deno-lint-ignore no-explicit-any
  dados_coletados: any;
}

export interface PendingTaskTimeoutResult {
  actionTaken: boolean;
  escalated: boolean;
  message?: string;
}

export interface PendingTaskConfig {
  timeoutMs: number;
  maxRetries: number;
}

// ═══════════════════════════════════════════════════════════════
// DEFAULT CONSTANTS
// ═══════════════════════════════════════════════════════════════

const DEFAULT_PENDING_TASK_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes (120s)
const DEFAULT_MAX_TASK_RETRIES = 2;

// ═══════════════════════════════════════════════════════════════
// CONFIG GETTERS
// ═══════════════════════════════════════════════════════════════

/**
 * Get pending task timeout from config or use default
 */
export function getDefaultPendingTaskTimeoutMs(): number {
  return DEFAULT_PENDING_TASK_TIMEOUT_MS;
}

/**
 * Get max task retries default
 */
export function getDefaultMaxTaskRetries(): number {
  return DEFAULT_MAX_TASK_RETRIES;
}

// ═══════════════════════════════════════════════════════════════
// MISSING DATA IDENTIFICATION
// ═══════════════════════════════════════════════════════════════

/**
 * Identifies what data is missing for a pending task
 */
// deno-lint-ignore no-explicit-any
export function identifyMissingDataForTask(
  task: PendingTaskType,
  dadosColetados: any,
  templates?: TemplatesCache
): { field: string; question: string } | null {
  if (task !== 'proposta_inicial') return null;
  
  const dados = dadosColetados || {};
  
  // Check for missing name
  if (!dados.nome || String(dados.nome).trim().length < 2) {
    return {
      field: 'nome',
      question: getMissingDataQuestion('nome', templates),
    };
  }
  
  // Check for missing email
  if (!dados.email || !String(dados.email).includes('@')) {
    return {
      field: 'email',
      question: getMissingDataQuestion('email', templates),
    };
  }
  
  // Check for missing bill value/consumption
  if (!dados.valorFatura && !dados.consumo) {
    return {
      field: 'valorFatura',
      question: getMissingDataQuestion('valorFatura', templates),
    };
  }
  
  // Check for missing distributor
  if (!dados.distribuidora) {
    return {
      field: 'distribuidora',
      question: getMissingDataQuestion('distribuidora', templates),
    };
  }
  
  return null;
}

// ═══════════════════════════════════════════════════════════════
// PENDING TASK TIMEOUT HANDLER
// ═══════════════════════════════════════════════════════════════

export interface PendingTaskTimeoutOptions {
  userMessage?: string; // Current user message to check for clarification
}

/**
 * Handles timeout of a pending task - either asks for missing data or notifies
 * Sofia NEVER stops automatically - only #ASSUMIR command pauses her
 * 
 * IMPORTANT: If user message is a clarification question, we SKIP the timeout
 * to allow normal LLM processing of their question.
 */
export async function handlePendingTaskTimeout(
  supabase: any,
  conversa: PendingTaskConversation,
  sendMessage: (phone: string, message: string) => Promise<void>,
  config: {
    getMaxRetries: () => number;
    getTemplates: () => TemplatesCache;
    agentConfig?: FullAgentConfig | null;
  },
  options?: PendingTaskTimeoutOptions
): Promise<PendingTaskTimeoutResult> {
  const { id: conversaId, cliente_telefone: phone, cliente_nome, pending_task, pending_task_retries } = conversa;
  const retries = pending_task_retries || 0;
  const maxRetries = config.getMaxRetries();
  const templates = config.getTemplates();
  
  console.log(`[handlePendingTaskTimeout] Task "${pending_task}" timed out. Retries: ${retries}/${maxRetries}`);
  
  // ═══════════════════════════════════════════════════════════════
  // CLARIFICATION BYPASS - Don't intercept legitimate questions
  // If user is asking a clarification question, let LLM handle it
  // ═══════════════════════════════════════════════════════════════
  if (options?.userMessage) {
    const userMsg = options.userMessage;
    
    // Check if this is a clarification/educational question
    if (isClarificationQuestion(userMsg)) {
      console.log(`[handlePendingTaskTimeout] ⏩ BYPASS: User asking clarification question: "${userMsg.substring(0, 50)}..."`);
      return { actionTaken: false, escalated: false };
    }
    
    // Check for billing education questions
    const billingDetection = detectBillingEducationQuestion(userMsg);
    if (billingDetection.detected) {
      console.log(`[handlePendingTaskTimeout] ⏩ BYPASS: Billing education question detected: ${billingDetection.category}`);
      return { actionTaken: false, escalated: false };
    }
    
    // Check for payment clarification specifically
    if (detectPaymentClarification(userMsg)) {
      console.log(`[handlePendingTaskTimeout] ⏩ BYPASS: Payment clarification question: "${userMsg.substring(0, 50)}..."`);
      return { actionTaken: false, escalated: false };
    }
  }
  
  // Special handling for audio promise timeout
  if (pending_task === 'enviar_audio') {
    console.log('[handlePendingTaskTimeout] Audio promise not fulfilled, sending text fallback');
    
    const fallbackMessage = getAudioTimeoutFallback(templates);
    
    await sendMessage(phone, fallbackMessage);
    
    // Save message
    await supabase.from('chatbot_mensagens').insert({
      conversa_id: conversaId,
      role: 'assistant',
      content: fallbackMessage,
    });
    
    // Clear the task
    await supabase
      .from('chatbot_conversas')
      .update({
        pending_task: null,
        pending_task_created_at: null,
        pending_task_retries: 0,
      })
      .eq('id', conversaId);
    
    return { actionTaken: true, escalated: false, message: fallbackMessage };
  }
  
  // If max retries reached, NOTIFY but keep Sofia responding
  // Sofia only stops with explicit #ASSUMIR command
  if (retries >= maxRetries) {
    console.log('[handlePendingTaskTimeout] Max retries reached - notifying admins but Sofia continues');
    
    // Mark for visibility in panel but DO NOT pause Sofia
    await supabase
      .from('chatbot_conversas')
      .update({
        needs_human_fallback: true,
        // DO NOT SET sofia_mode: 'paused_for_human' - Sofia continues!
        escalated_at: new Date().toISOString(),
        escalation_reason: `Tarefa não completada: ${pending_task} após ${retries} tentativas. Sofia continua atendendo.`,
        pending_task: null,
        pending_task_created_at: null,
        pending_task_retries: 0,
      })
      .eq('id', conversaId);
    
    // Notify admins - they can use #ASSUMIR if needed
    await supabase.from('admin_notifications').insert({
      admin_user_id: null,
      title: '⚠️ Tarefa não concluída - Atenção sugerida',
      message: `Cliente ${cliente_nome || phone} aguardava "${pending_task}" que não foi concluída. Sofia CONTINUA atendendo. Use #ASSUMIR se quiser assumir.`,
      type: 'human_escalation',
      entity_type: 'chatbot_conversa',
      entity_id: conversaId,
      created_by_nome: config.agentConfig?.name ? `${config.agentConfig.name} (Sistema)` : 'IA (Sistema)',
    });
    
    // Sofia sends a helpful message and continues
    const continuationMessage = getTimeoutMessage('continuation', templates);
    await sendMessage(phone, continuationMessage);
    
    // Save message
    await supabase.from('chatbot_mensagens').insert({
      conversa_id: conversaId,
      role: 'assistant',
      content: continuationMessage,
    });
    
    return { actionTaken: true, escalated: false, message: continuationMessage };
  }
  
  // Try to identify missing data
  const missingData = identifyMissingDataForTask(pending_task, conversa.dados_coletados, templates);
  
  if (missingData) {
    console.log(`[handlePendingTaskTimeout] Missing data: ${missingData.field}, asking again`);
    
    // Increment retries
    await supabase
      .from('chatbot_conversas')
      .update({
        pending_task_retries: retries + 1,
        pending_task_created_at: new Date().toISOString(), // Reset timer
      })
      .eq('id', conversaId);
    
    // Ask for missing data
    await sendMessage(phone, missingData.question);
    
    // Save message
    await supabase.from('chatbot_mensagens').insert({
      conversa_id: conversaId,
      role: 'assistant',
      content: missingData.question,
    });
    
    return { actionTaken: true, escalated: false, message: missingData.question };
  }
  
  // ═══════════════════════════════════════════════════════════════
  // PROPOSAL DELAY HANDLER - Specific handling for proposta_inicial
  // When all data is present but proposal hasn't been delivered yet
  // ═══════════════════════════════════════════════════════════════
  if (pending_task === 'proposta_inicial') {
    // GUARD: Don't fire timeout on recently created/reset conversations (< 60s)
    const conversaCreatedAt = conversa.created_at ? new Date(conversa.created_at).getTime() : 0;
    const conversaAgeMs = Date.now() - conversaCreatedAt;
    if (conversaAgeMs < 60_000) {
      console.log(`[handlePendingTaskTimeout] ⏩ SKIP: Conversa too young (${Math.round(conversaAgeMs / 1000)}s) - likely post-reset`);
      // Clear stale pending task from reset
      await supabase
        .from('chatbot_conversas')
        .update({ pending_task: null, pending_task_created_at: null, pending_task_retries: 0 })
        .eq('id', conversaId);
      return { actionTaken: false, escalated: false };
    }
    
    console.log('[handlePendingTaskTimeout] 🕐 Proposta delay detected - all data present, sending reassurance');
    
    const delayMessage = 'Oi! Vi que estávamos conversando e não consegui te responder. Posso te ajudar com alguma dúvida?';
    
    await sendMessage(phone, delayMessage);
    
    // Save message
    await supabase.from('chatbot_mensagens').insert({
      conversa_id: conversaId,
      role: 'assistant',
      content: delayMessage,
    });
    
    // Notify operators
    await supabase.from('admin_notifications').insert({
      admin_user_id: null,
      title: '🕐 Proposta demorando - Cliente aguardando',
      message: `Cliente ${cliente_nome || phone} está aguardando proposta há mais de 2 minutos. Dados completos. Verifique integração com Bitrix24.`,
      type: 'proposal_delay',
      entity_type: 'chatbot_conversa',
      entity_id: conversaId,
      created_by_nome: config.agentConfig?.name ? `${config.agentConfig.name} (Sistema)` : 'IA (Sistema)',
    });
    
    // Increment retries and reset timer (allows escalation on next timeout)
    await supabase
      .from('chatbot_conversas')
      .update({
        pending_task_retries: retries + 1,
        pending_task_created_at: new Date().toISOString(),
      })
      .eq('id', conversaId);
    
    return { actionTaken: true, escalated: false, message: delayMessage };
  }
  
  // Has all data but task still not completed - likely a system issue
  console.log('[handlePendingTaskTimeout] Has all data but task not completed - notifying but Sofia continues');
  
  await supabase
    .from('chatbot_conversas')
    .update({
      needs_human_fallback: true,
      escalated_at: new Date().toISOString(),
      escalation_reason: `Dados completos mas ${pending_task} não foi concluída (possível erro do sistema). Sofia continua atendendo.`,
      pending_task: null,
      pending_task_created_at: null,
      pending_task_retries: 0,
    })
    .eq('id', conversaId);
  
  await supabase.from('admin_notifications').insert({
    admin_user_id: null,
    title: '⚠️ Erro de sistema - Proposta não gerada',
    message: `Cliente ${cliente_nome || phone} tem todos os dados mas a proposta não foi gerada. Sofia CONTINUA atendendo. Verifique integração com Bitrix24. Use #ASSUMIR se necessário.`,
    type: 'system_error',
    entity_type: 'chatbot_conversa',
    entity_id: conversaId,
    created_by_nome: config.agentConfig?.name ? `${config.agentConfig.name} (Sistema)` : 'IA (Sistema)',
  });
  
  const retryMessage = getTimeoutMessage('retry', templates);
  await sendMessage(phone, retryMessage);
  
  await supabase.from('chatbot_mensagens').insert({
    conversa_id: conversaId,
    role: 'assistant',
    content: retryMessage,
  });
  
  return { actionTaken: true, escalated: false, message: retryMessage };
}

// ═══════════════════════════════════════════════════════════════
// TASK STATE MANAGEMENT
// ═══════════════════════════════════════════════════════════════

/**
 * Clears pending task when it's successfully completed
 */
export async function clearPendingTask(
  supabase: any,
  conversaId: string
): Promise<void> {
  await supabase
    .from('chatbot_conversas')
    .update({
      pending_task: null,
      pending_task_created_at: null,
      pending_task_retries: 0,
    })
    .eq('id', conversaId);
  console.log(`[clearPendingTask] Cleared pending task for conversation ${conversaId}`);
}

/**
 * Sets a new pending task when Sofia promises something
 */
export async function setPendingTask(
  supabase: any,
  conversaId: string,
  task: PendingTaskType
): Promise<void> {
  await supabase
    .from('chatbot_conversas')
    .update({
      pending_task: task,
      pending_task_created_at: new Date().toISOString(),
      pending_task_retries: 0,
    })
    .eq('id', conversaId);
  console.log(`[setPendingTask] Set pending task "${task}" for conversation ${conversaId}`);
}

/**
 * Checks if a pending task has timed out
 */
export function isPendingTaskTimedOut(
  pendingTaskCreatedAt: string | null,
  timeoutMs: number
): boolean {
  if (!pendingTaskCreatedAt) return false;
  
  const createdAt = new Date(pendingTaskCreatedAt).getTime();
  const now = Date.now();
  
  return (now - createdAt) > timeoutMs;
}

/**
 * Detects if Sofia's response contains a promise to send something
 */
export function detectPendingTaskFromResponse(
  responseText: string
): PendingTaskType {
  const lowerResponse = responseText.toLowerCase();
  
  // Detect proposal promise
  if (
    lowerResponse.includes('vou preparar') ||
    lowerResponse.includes('vou gerar') ||
    lowerResponse.includes('gerando sua proposta') ||
    lowerResponse.includes('proposta sendo gerada') ||
    lowerResponse.includes('já estou preparando')
  ) {
    return 'proposta_inicial';
  }
  
  // Detect link promise
  if (
    lowerResponse.includes('vou enviar o link') ||
    lowerResponse.includes('enviarei o link') ||
    lowerResponse.includes('segue o link')
  ) {
    return 'enviar_link';
  }
  
  // Detect audio promise
  if (
    lowerResponse.includes('vou te enviar um áudio') ||
    lowerResponse.includes('enviando um áudio') ||
    lowerResponse.includes('gravarei um áudio')
  ) {
    return 'enviar_audio';
  }
  
  return null;
}
