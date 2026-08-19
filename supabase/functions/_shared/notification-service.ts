/**
 * NOTIFICATION SERVICE
 * 
 * Serviço centralizado para notificações de escalação e alertas.
 * Usado pelo pipeline para notificar operadores humanos quando necessário.
 * 
 * @module _shared/notification-service
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

export type EscalationPriority = 'low' | 'medium' | 'high' | 'critical';

export interface EscalationContext {
  conversaId: string;
  reason: string;
  priority: EscalationPriority;
  clienteNome?: string;
  clienteTelefone?: string;
  currentStage?: string;
  additionalContext?: Record<string, unknown>;
}

export interface NotificationResult {
  success: boolean;
  notifiedAgents: string[];
  error?: string;
}

export interface AvailableAgent {
  id: string;
  telefone: string;
  nome: string;
  lastAssignment?: string;
}

// ═══════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const PRIORITY_EMOJIS: Record<EscalationPriority, string> = {
  low: '📋',
  medium: '⚠️',
  high: '🔴',
  critical: '🚨',
};

const MAX_AGENTS_TO_NOTIFY = 3;

// ═══════════════════════════════════════════════════════
// MAIN FUNCTIONS
// ═══════════════════════════════════════════════════════

/**
 * Notifica operadores humanos sobre uma escalação.
 * Busca os atendentes disponíveis e envia mensagem de alerta via WhatsApp.
 * 
 * @param context - Contexto da escalação
 * @param supabaseClient - Cliente Supabase opcional (cria novo se não fornecido)
 * @returns Resultado da notificação
 */
export async function notifyHumanAgent(
  context: EscalationContext,
  supabaseClient?: SupabaseClient
): Promise<NotificationResult> {
  const supabase = supabaseClient || createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const notifiedAgents: string[] = [];
  
  try {
    console.log(`[notification-service] Escalating: ${context.reason} (priority: ${context.priority})`);
    
    // 1. Buscar atendentes disponíveis
    const agents = await getAvailableAgents(supabase);
    
    if (agents.length === 0) {
      console.warn('[notification-service] No available agents found');
      
      // Fallback: salvar na tabela de notificações pendentes
      await savePendingNotification(supabase, context);
      
      return {
        success: false,
        notifiedAgents: [],
        error: 'No available agents'
      };
    }
    
    // 2. Buscar contexto adicional da conversa se não fornecido
    const enrichedContext = await enrichContext(supabase, context);
    
    // 3. Montar mensagem de alerta
    const alertMessage = buildAlertMessage(enrichedContext);
    
    // 4. Enviar para os primeiros N atendentes disponíveis
    const agentsToNotify = agents.slice(0, MAX_AGENTS_TO_NOTIFY);
    
    for (const agent of agentsToNotify) {
      const sent = await sendAlertToAgent(supabase, agent, alertMessage, enrichedContext);
      if (sent) {
        notifiedAgents.push(agent.nome);
      }
    }
    
    // 5. Atualizar conversa com info de notificação
    await updateConversationWithNotification(supabase, context.conversaId, notifiedAgents);
    
    // 6. Registrar log de escalação
    await logEscalation(supabase, context, notifiedAgents);
    
    console.log(`[notification-service] Notified ${notifiedAgents.length} agents: ${notifiedAgents.join(', ')}`);
    
    return {
      success: notifiedAgents.length > 0,
      notifiedAgents
    };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[notification-service] Error:', errorMessage);
    
    return {
      success: false,
      notifiedAgents,
      error: errorMessage
    };
  }
}

/**
 * Notifica sobre validação de guardrail acionada.
 * Versão simplificada para alertas de guardrails.
 */
export async function notifyGuardrailTriggered(
  conversaId: string,
  guardrailName: string,
  blockedContent: string,
  supabaseClient?: SupabaseClient
): Promise<NotificationResult> {
  return notifyHumanAgent({
    conversaId,
    reason: `Guardrail ${guardrailName} acionado`,
    priority: 'high',
    additionalContext: {
      guardrail: guardrailName,
      blockedContent: blockedContent.substring(0, 200)
    }
  }, supabaseClient);
}

// ═══════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════

async function getAvailableAgents(supabase: SupabaseClient): Promise<AvailableAgent[]> {
  const { data, error } = await supabase
    .from('whatsapp_atendentes')
    .select('id, telefone, nome, last_assignment')
    .eq('is_active', true)
    .order('last_assignment', { ascending: true, nullsFirst: true })
    .limit(MAX_AGENTS_TO_NOTIFY * 2); // Busca mais para ter fallback
  
  if (error) {
    console.error('[notification-service] Error fetching agents:', error.message);
    return [];
  }
  
  return (data || []).map(a => ({
    id: a.id,
    telefone: a.telefone,
    nome: a.nome,
    lastAssignment: a.last_assignment
  }));
}

async function enrichContext(
  supabase: SupabaseClient, 
  context: EscalationContext
): Promise<EscalationContext> {
  if (context.clienteNome && context.clienteTelefone && context.currentStage) {
    return context;
  }
  
  const { data: conversa } = await supabase
    .from('chatbot_conversas')
    .select('cliente_nome, cliente_telefone, sofia_mode, bitrix24_stage, dados_coletados')
    .eq('id', context.conversaId)
    .single();
  
  if (!conversa) {
    return context;
  }
  
  return {
    ...context,
    clienteNome: context.clienteNome || conversa.cliente_nome || 'Não identificado',
    clienteTelefone: context.clienteTelefone || conversa.cliente_telefone || 'N/A',
    currentStage: context.currentStage || conversa.bitrix24_stage || conversa.sofia_mode || 'N/A'
  };
}

function buildAlertMessage(context: EscalationContext): string {
  const emoji = PRIORITY_EMOJIS[context.priority];
  const priorityLabel = context.priority.toUpperCase();
  
  let message = `${emoji} *Escalação ${priorityLabel}*\n\n`;
  message += `*Cliente:* ${context.clienteNome || 'Não identificado'}\n`;
  message += `*Telefone:* ${context.clienteTelefone || 'N/A'}\n`;
  message += `*Estágio:* ${context.currentStage || 'N/A'}\n`;
  message += `*Motivo:* ${context.reason}\n`;
  
  if (context.additionalContext) {
    const additionalInfo = Object.entries(context.additionalContext)
      .filter(([_, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `*${k}:* ${String(v).substring(0, 100)}`)
      .join('\n');
    
    if (additionalInfo) {
      message += `\n${additionalInfo}\n`;
    }
  }
  
  message += `\n_Responda #ASSUMIR ${context.clienteTelefone} para atender._`;
  
  return message;
}

async function sendAlertToAgent(
  supabase: SupabaseClient,
  agent: AvailableAgent,
  message: string,
  context: EscalationContext
): Promise<boolean> {
  try {
    // Usar z-api-send-message via invoke
    const { error } = await supabase.functions.invoke('z-api-send-message', {
      body: {
        phone: agent.telefone,
        message,
        agentId: 'sofia', // Usar credenciais da Sofia
        skipGuards: true  // Não aplicar guardrails em alertas
      }
    });
    
    if (error) {
      console.warn(`[notification-service] Failed to notify ${agent.nome}:`, error.message);
      return false;
    }
    
    // Atualizar last_assignment do atendente
    await supabase
      .from('whatsapp_atendentes')
      .update({ last_assignment: new Date().toISOString() })
      .eq('id', agent.id);
    
    return true;
    
  } catch (err) {
    console.error(`[notification-service] Exception notifying ${agent.nome}:`, err);
    return false;
  }
}

async function updateConversationWithNotification(
  supabase: SupabaseClient,
  conversaId: string,
  notifiedAgents: string[]
): Promise<void> {
  try {
    await supabase
      .from('chatbot_conversas')
      .update({
        atendente_notificado_at: new Date().toISOString(),
        atendente_notificado_nome: notifiedAgents.join(', '),
        needs_human_fallback: true
      })
      .eq('id', conversaId);
  } catch (err) {
    console.warn('[notification-service] Failed to update conversation:', err);
  }
}

async function logEscalation(
  supabase: SupabaseClient,
  context: EscalationContext,
  notifiedAgents: string[]
): Promise<void> {
  try {
    await supabase
      .from('activity_logs')
      .insert({
        action: 'escalation_triggered',
        entity_type: 'chatbot_conversas',
        entity_id: context.conversaId,
        entity_name: context.clienteNome || 'Unknown',
        details: {
          reason: context.reason,
          priority: context.priority,
          notifiedAgents,
          timestamp: new Date().toISOString()
        }
      });
  } catch (err) {
    console.warn('[notification-service] Failed to log escalation:', err);
  }
}

async function savePendingNotification(
  supabase: SupabaseClient,
  context: EscalationContext
): Promise<void> {
  try {
    await supabase
      .from('admin_notifications')
      .insert({
        title: `Escalação: ${context.reason}`,
        message: `Cliente ${context.clienteNome || 'não identificado'} (${context.clienteTelefone || 'N/A'}) precisa de atendimento humano. Motivo: ${context.reason}`,
        type: context.priority === 'critical' ? 'error' : 'warning',
        entity_type: 'chatbot_conversas',
        entity_id: context.conversaId
      });
  } catch (err) {
    console.warn('[notification-service] Failed to save pending notification:', err);
  }
}

// ═══════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════

export default {
  notifyHumanAgent,
  notifyGuardrailTriggered
};
