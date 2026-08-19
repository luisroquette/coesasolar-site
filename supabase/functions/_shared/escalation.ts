/**
 * Escalation Module
 * Centralized escalation logic for WhatsApp notifications and human handoff
 * Extracted from sofia-webhook/index.ts for reuse across Edge Functions
 * 
 * ZERO HARDCODE: All message templates loaded from sofia_message_templates table
 */

import type { ExtractedClientData } from './data-extraction.ts';
import type { FullAgentConfig } from './ai-gym-config.ts';
import { 
  getRenderedTemplate, 
  getTemplateCache,
  type MessageTemplate 
} from './message-templates.ts';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface EscalationParams {
  conversaId: string;
  clienteNome: string | null;
  clienteTelefone: string;
  ultimaMensagem: string;
  dadosColetados: ExtractedClientData | null;
  leadScore: number;
  escalationReason: string;
  totalMessages: number;
  agentConfig?: FullAgentConfig | null;
}

export interface EscalationResult {
  success: boolean;
  notifiedAttendants: string[];
  method: 'supervisor' | 'attendants' | 'legacy' | 'none';
  error?: string;
}

// ═══════════════════════════════════════════════════════════════
// ESCALATION MESSAGE BUILDER - Database-driven templates
// ═══════════════════════════════════════════════════════════════

/**
 * Build data summary for escalation message using templates
 */
function buildDataSummary(
  dadosColetados: ExtractedClientData | null,
  templates?: Map<string, MessageTemplate> | null
): string {
  if (!dadosColetados) {
    return getRenderedTemplate('escalation', 'no_data_collected', {}, templates || undefined, '(nenhum dado coletado)');
  }

  const lines: string[] = [];
  
  if (dadosColetados.email) {
    lines.push(getRenderedTemplate('escalation', 'email_line', { value: dadosColetados.email }, templates || undefined, `📧 ${dadosColetados.email}`));
  }
  if (dadosColetados.distribuidora) {
    lines.push(getRenderedTemplate('escalation', 'distribuidora_line', { value: dadosColetados.distribuidora }, templates || undefined, `⚡ ${dadosColetados.distribuidora}`));
  }
  if (dadosColetados.valorFatura) {
    lines.push(getRenderedTemplate('escalation', 'valor_fatura_line', { value: dadosColetados.valorFatura }, templates || undefined, `💰 R$ ${dadosColetados.valorFatura}`));
  }
  if (dadosColetados.consumo) {
    lines.push(getRenderedTemplate('escalation', 'consumo_line', { value: dadosColetados.consumo }, templates || undefined, `📊 ${dadosColetados.consumo} kWh`));
  }

  return lines.length > 0 
    ? lines.join('\n') 
    : getRenderedTemplate('escalation', 'no_data_collected', {}, templates || undefined, '(nenhum dado coletado)');
}

/**
 * Builds escalation notification message for attendants
 * Uses database templates with fallback
 */
export function buildEscalationMessage(params: EscalationParams): string {
  const {
    clienteNome,
    clienteTelefone,
    ultimaMensagem,
    dadosColetados,
    leadScore,
    escalationReason,
    totalMessages,
    agentConfig,
  } = params;

  const templates = getTemplateCache();
  const agentName = agentConfig?.name || 'IA';
  const dadosSummary = buildDataSummary(dadosColetados, templates);
  const truncatedMessage = ultimaMensagem.substring(0, 200) + (ultimaMensagem.length > 200 ? '...' : '');

  // Try database template first
  const rendered = getRenderedTemplate(
    'escalation',
    'attendant_notification',
    {
      agent_name: agentName,
      cliente_nome: clienteNome || 'Não identificado',
      cliente_telefone: clienteTelefone,
      lead_score: leadScore,
      total_messages: totalMessages,
      dados_summary: dadosSummary,
      escalation_reason: escalationReason,
      ultima_mensagem: truncatedMessage,
    },
    templates || undefined
  );

  // If template found and rendered, return it
  if (rendered) {
    return rendered;
  }

  // Fallback to inline template
  return `🚨 *ESCALAÇÃO - ${agentName}*

👤 *Cliente:* ${clienteNome || 'Não identificado'}
📞 *Telefone:* ${clienteTelefone}

📊 *Lead Score:* ${leadScore}/100
💬 *Total de mensagens:* ${totalMessages}

📋 *Dados coletados:*
${dadosSummary}

⚠️ *Motivo:*
${escalationReason}

💬 *Última mensagem:*
"${truncatedMessage}"

_Responda #ASSUMIR para assumir o atendimento._`;
}

/**
 * Builds client farewell message for escalation
 * Uses database templates with fallback
 */
export function buildEscalationFarewellMessage(
  clienteNome: string | null,
  supervisorNome?: string | null
): string {
  const templates = getTemplateCache();
  const nome = clienteNome?.split(' ')[0] || '';
  const supervisor = supervisorNome || 'nossa equipe';
  
  if (nome) {
    const rendered = getRenderedTemplate(
      'escalation',
      'farewell_with_name',
      { cliente_nome: nome, supervisor_nome: supervisor },
      templates || undefined
    );
    if (rendered) return rendered;
    return `${nome}, vou te passar para ${supervisor} que vai te ajudar pessoalmente, tá? Só um instante! 🙏`;
  }
  
  const rendered = getRenderedTemplate(
    'escalation',
    'farewell_anonymous',
    { supervisor_nome: supervisor },
    templates || undefined
  );
  if (rendered) return rendered;
  return `Vou te passar para ${supervisor} que vai te ajudar pessoalmente. Só um instante! 🙏`;
}

// ═══════════════════════════════════════════════════════════════
// MAIN ESCALATION FUNCTION
// ═══════════════════════════════════════════════════════════════

/**
 * Sends escalation notifications to attendants based on configured mode
 * PRIORITY: Agent's supervisor config > whatsapp_atendentes > legacy config
 */
export async function sendEscalationToAttendants(
  supabase: any,
  params: EscalationParams,
  sendMessage: (phone: string, message: string) => Promise<void>
): Promise<EscalationResult> {
  const { conversaId, agentConfig } = params;
  const notifiedAttendants: string[] = [];

  try {
    const escalationMessage = buildEscalationMessage(params);

    // ═══════════════════════════════════════════════════════════════
    // PRIORITY 1: Check if agent has supervisor configured
    // ═══════════════════════════════════════════════════════════════
    const supervisorNome = agentConfig?.guardrails?.supervisor_nome;
    const supervisorTelefone = agentConfig?.guardrails?.supervisor_telefone;

    if (supervisorNome && supervisorTelefone?.trim()) {
      console.log(`[ESCALATION] Using agent's configured supervisor: ${supervisorNome}`);

      let formattedPhone = supervisorTelefone.replace(/\D/g, '');
      if (!formattedPhone.startsWith('55')) {
        formattedPhone = '55' + formattedPhone;
      }

      try {
        await sendMessage(formattedPhone, escalationMessage);
        notifiedAttendants.push(supervisorNome);
        console.log(`[ESCALATION] ✅ Notified supervisor: ${supervisorNome}`);

        // Update conversation with notified attendant info
        await supabase
          .from('chatbot_conversas')
          .update({
            atendente_notificado_nome: supervisorNome,
            atendente_notificado_at: new Date().toISOString(),
          })
          .eq('id', conversaId);

        return {
          success: true,
          notifiedAttendants,
          method: 'supervisor',
        };
      } catch (sendError) {
        console.error(`[ESCALATION] Failed to notify supervisor:`, sendError);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // PRIORITY 2: Try whatsapp_atendentes table
    // ═══════════════════════════════════════════════════════════════
    const { data: atendentes } = await supabase
      .from('whatsapp_atendentes')
      .select('id, nome, telefone, is_active, receive_escalations, notification_mode')
      .eq('is_active', true)
      .eq('receive_escalations', true);

    if (atendentes?.length > 0) {
      console.log(`[ESCALATION] Found ${atendentes.length} active attendants`);

      for (const atendente of atendentes) {
        if (!atendente.telefone) continue;

        let formattedPhone = atendente.telefone.replace(/\D/g, '');
        if (!formattedPhone.startsWith('55')) {
          formattedPhone = '55' + formattedPhone;
        }

        try {
          await sendMessage(formattedPhone, escalationMessage);
          notifiedAttendants.push(atendente.nome);
          console.log(`[ESCALATION] ✅ Notified attendant: ${atendente.nome}`);
        } catch (sendError) {
          console.error(`[ESCALATION] Failed to notify ${atendente.nome}:`, sendError);
        }
      }

      if (notifiedAttendants.length > 0) {
        await supabase
          .from('chatbot_conversas')
          .update({
            atendente_notificado_nome: notifiedAttendants.join(', '),
            atendente_notificado_at: new Date().toISOString(),
          })
          .eq('id', conversaId);

        return {
          success: true,
          notifiedAttendants,
          method: 'attendants',
        };
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // PRIORITY 3: Legacy config fallback
    // ═══════════════════════════════════════════════════════════════
    const { data: legacyConfig } = await supabase
      .from('configuracoes_sistema')
      .select('valor')
      .eq('chave', 'atendente_plantao_telefone')
      .single();

    if (legacyConfig?.valor?.trim()) {
      const legacyPhone = legacyConfig.valor.trim().replace(/\D/g, '');
      const formattedPhone = legacyPhone.startsWith('55') ? legacyPhone : '55' + legacyPhone;

      try {
        await sendMessage(formattedPhone, escalationMessage);
        notifiedAttendants.push('Atendente de Plantão');
        console.log(`[ESCALATION] ✅ Notified legacy attendant`);

        await supabase
          .from('chatbot_conversas')
          .update({
            atendente_notificado_nome: 'Atendente de Plantão',
            atendente_notificado_at: new Date().toISOString(),
          })
          .eq('id', conversaId);

        return {
          success: true,
          notifiedAttendants,
          method: 'legacy',
        };
      } catch (sendError) {
        console.error(`[ESCALATION] Failed to notify legacy attendant:`, sendError);
      }
    }

    console.warn(`[ESCALATION] No attendants configured or all notifications failed`);
    return {
      success: false,
      notifiedAttendants: [],
      method: 'none',
      error: 'No attendants available',
    };

  } catch (error) {
    console.error(`[ESCALATION] Exception:`, error);
    return {
      success: false,
      notifiedAttendants: [],
      method: 'none',
      error: String(error),
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// FULL ESCALATION FLOW - Orchestrator (Phase 19 extraction)
// Combines: DB update + admin notification + attendant notification
// Sofia continues responding while humans are notified
// ═══════════════════════════════════════════════════════════════

export interface FullEscalationContext {
  supabase: any;
  conversaId: string;
  phone: string;
  clienteNome: string | null;
  messageText: string;
  dadosColetados: Record<string, unknown> | null;
  newScore: number;
  totalMessages: number;
  agentConfig?: FullAgentConfig | null;
  sendMessage: (phone: string, message: string) => Promise<void>;
}

export interface FullEscalationResult {
  success: boolean;
  dbUpdated: boolean;
  adminNotified: boolean;
  attendantsNotified: boolean;
  notifiedAttendants: string[];
  method: 'supervisor' | 'attendants' | 'legacy' | 'none';
}

/**
 * Complete escalation flow orchestrator
 * 1. Updates DB (needs_human_fallback=true, escalated_at, escalation_reason)
 * 2. Creates admin notification in-app
 * 3. Sends WhatsApp notifications to attendants
 * 
 * IMPORTANT: Sofia continues responding - we only set needs_human_fallback for visibility
 */
export async function orchestrateFullEscalation(
  ctx: FullEscalationContext
): Promise<FullEscalationResult> {
  const {
    supabase,
    conversaId,
    phone,
    clienteNome,
    messageText,
    dadosColetados,
    newScore,
    totalMessages,
    agentConfig,
    sendMessage,
  } = ctx;

  let dbUpdated = false;
  let adminNotified = false;
  let attendantsNotified = false;
  let notifiedAttendants: string[] = [];
  let method: 'supervisor' | 'attendants' | 'legacy' | 'none' = 'none';

  console.log(`[escalation] Sofia detected situation needing human attention (but continues responding)`);

  try {
    // ═══════════════════════════════════════════════════════════════
    // STEP 1: Update DB - Mark as needing attention (but DON'T pause Sofia)
    // ═══════════════════════════════════════════════════════════════
    const { error: updateError } = await supabase
      .from('chatbot_conversas')
      .update({
        needs_human_fallback: true,
        // DO NOT SET: sofia_mode: 'paused_for_human' - Sofia continues!
        escalated_at: new Date().toISOString(),
        escalation_reason: messageText.substring(0, 500),
      })
      .eq('id', conversaId);

    if (!updateError) {
      dbUpdated = true;
      console.log(`[escalation] DB updated: needs_human_fallback=true`);
    } else {
      console.error(`[escalation] Failed to update DB:`, updateError);
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 2: Create admin notification in-app
    // ═══════════════════════════════════════════════════════════════
    const agentName = agentConfig?.name || 'IA';
    const truncatedMessage = messageText.substring(0, 100) + (messageText.length > 100 ? '...' : '');

    const { error: notifError } = await supabase.from('admin_notifications').insert({
      admin_user_id: null,
      title: '⚠️ Atendimento pode precisar de supervisão',
      message: `Cliente ${clienteNome || phone} pode precisar de ajuda humana. ${agentName} continua atendendo. Use #ASSUMIR no chat se quiser assumir. Última mensagem: "${truncatedMessage}"`,
      type: 'human_escalation',
      entity_type: 'chatbot_conversa',
      entity_id: conversaId,
      created_by_nome: agentName,
    });

    if (!notifError) {
      adminNotified = true;
      console.log(`[escalation] Admin notification created`);
    } else {
      console.error(`[escalation] Failed to create admin notification:`, notifError);
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 3: Send WhatsApp notifications to attendants
    // ═══════════════════════════════════════════════════════════════
    const escalationParams: EscalationParams = {
      conversaId,
      clienteNome: clienteNome || 'Não identificado',
      clienteTelefone: phone,
      ultimaMensagem: messageText,
      dadosColetados: dadosColetados as ExtractedClientData | null,
      leadScore: newScore,
      escalationReason: `⚠️ ${agentName} continua atendendo, mas pode precisar de suporte. Use #ASSUMIR para assumir.`,
      totalMessages,
      agentConfig,
    };

    const attendantResult = await sendEscalationToAttendants(supabase, escalationParams, sendMessage);

    if (attendantResult.success) {
      attendantsNotified = true;
      notifiedAttendants = attendantResult.notifiedAttendants;
      method = attendantResult.method;
      console.log(`[escalation] Attendants notified: ${notifiedAttendants.join(', ')}`);
    }

    console.log(`[escalation] ✅ Notification sent to admins, Sofia continues responding to ${clienteNome || phone}`);

    return {
      success: dbUpdated && adminNotified,
      dbUpdated,
      adminNotified,
      attendantsNotified,
      notifiedAttendants,
      method,
    };

  } catch (error) {
    console.error(`[escalation] Exception in orchestrateFullEscalation:`, error);
    return {
      success: false,
      dbUpdated,
      adminNotified,
      attendantsNotified,
      notifiedAttendants,
      method,
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// CONVERSATION UPDATE HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Marks conversation as escalated and needing human intervention
 */
export async function markConversationEscalated(
  supabase: any,
  conversaId: string,
  reason: string,
  pauseSofia: boolean = true
): Promise<void> {
  const updateData: Record<string, any> = {
    needs_human_fallback: true,
    escalated_at: new Date().toISOString(),
    escalation_reason: reason,
  };

  if (pauseSofia) {
    updateData.sofia_mode = 'paused_for_human';
  }

  await supabase
    .from('chatbot_conversas')
    .update(updateData)
    .eq('id', conversaId);

  console.log(`[ESCALATION] Conversation ${conversaId} marked as escalated (paused: ${pauseSofia})`);
}

/**
 * Creates admin notification for escalation
 */
export async function createEscalationNotification(
  supabase: any,
  conversaId: string,
  title: string,
  message: string,
  agentName?: string
): Promise<void> {
  await supabase.from('admin_notifications').insert({
    admin_user_id: null,
    title,
    message,
    type: 'human_escalation',
    entity_type: 'chatbot_conversa',
    entity_id: conversaId,
    created_by_nome: agentName ? `${agentName} (Sistema)` : 'IA (Sistema)',
  });
}
