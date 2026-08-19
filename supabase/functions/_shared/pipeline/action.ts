/**
 * SOFIA PIPELINE 2.0 - ACTION LAYER
 * 
 * Fase 4a: Execução das Tool Calls
 * Transforma as decisões do Reasoning em ações concretas
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { 
  ToolCall, 
  ActionExecution, 
  ActionResult,
  ReasoningResult,
  FullContext 
} from "./types.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ============================================
// TOOL EXECUTORS
// ============================================

async function executeSendMessage(
  params: Record<string, unknown>,
  context: FullContext
): Promise<{ success: boolean; result?: unknown; error?: string; sideEffects: string[] }> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const sideEffects: string[] = [];
  
  try {
    const message = params.message as string;
    const phone = context.intake.phone;
    
    if (!message || !phone) {
      return { success: false, error: "Missing message or phone", sideEffects };
    }
    
    // Invoke z-api-send-message
    const { data, error } = await supabase.functions.invoke('z-api-send-message', {
      body: {
        phone,
        message,
        conversaId: context.intake.conversaId
      }
    });
    
    if (error) {
      return { success: false, error: error.message, sideEffects };
    }
    
    sideEffects.push(`Message sent to ${phone}`);
    
    // Save assistant message to history with LLM handler tracking
    console.log(`[action] Saving LLM message with handler_type='llm'`);
    await supabase.from('chatbot_mensagens').insert({
      conversa_id: context.intake.conversaId,
      role: 'assistant',
      content: message,
      message_id: data?.messageId,
      handler_type: 'llm'
    });
    sideEffects.push('Message saved to history (handler_type=llm)');
    
    return { 
      success: true, 
      result: { messageId: data?.messageId, zapiSuccess: data?.success },
      sideEffects 
    };
  } catch (err) {
    return { 
      success: false, 
      error: err instanceof Error ? err.message : String(err),
      sideEffects 
    };
  }
}

async function executeSaveFact(
  params: Record<string, unknown>,
  context: FullContext
): Promise<{ success: boolean; result?: unknown; error?: string; sideEffects: string[] }> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const sideEffects: string[] = [];
  
  try {
    const key = params.key as string;
    const value = params.value;
    const confidence = (params.confidence as number) || 0.8;
    const validHours = (params.valid_hours as number) || 24;
    
    if (!key) {
      return { success: false, error: "Missing fact key", sideEffects };
    }
    
    const validUntil = new Date();
    validUntil.setHours(validUntil.getHours() + validHours);
    
    // Upsert to working_memory
    const { error } = await supabase.from('working_memory').upsert({
      conversa_id: context.intake.conversaId,
      memory_type: 'fact',
      key,
      value,
      confidence,
      source: 'llm',
      valid_until: validUntil.toISOString(),
      turn_number: context.intake.turnNumber
    }, {
      onConflict: 'conversa_id,key'
    });
    
    if (error) {
      return { success: false, error: error.message, sideEffects };
    }
    
    sideEffects.push(`Fact saved: ${key}=${JSON.stringify(value)}`);
    
    return { success: true, result: { key, value }, sideEffects };
  } catch (err) {
    return { 
      success: false, 
      error: err instanceof Error ? err.message : String(err),
      sideEffects 
    };
  }
}

async function executeEscalate(
  params: Record<string, unknown>,
  context: FullContext
): Promise<{ success: boolean; result?: unknown; error?: string; sideEffects: string[] }> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const sideEffects: string[] = [];
  
  try {
    const reason = params.reason as string || 'Solicitação de escalação';
    const priority = (params.priority as 'low' | 'medium' | 'high' | 'critical') || 'medium';
    
    // Update conversation to escalated state
    const { error } = await supabase
      .from('chatbot_conversas')
      .update({
        escalated_at: new Date().toISOString(),
        escalation_reason: reason,
        sofia_mode: 'escalado',
        needs_human_fallback: true
      })
      .eq('id', context.intake.conversaId);
    
    if (error) {
      return { success: false, error: error.message, sideEffects };
    }
    
    sideEffects.push(`Escalated: ${reason} (priority: ${priority})`);
    
    // Notify human agent via notification service
    const { notifyHumanAgent } = await import("../notification-service.ts");
    const notificationResult = await notifyHumanAgent({
      conversaId: context.intake.conversaId,
      reason,
      priority,
      clienteNome: context.clientProfile?.name,
      clienteTelefone: context.intake.phone,
      currentStage: context.funnelState?.stage
    }, supabase);
    
    if (notificationResult.success) {
      sideEffects.push(`Notified agents: ${notificationResult.notifiedAgents.join(', ')}`);
    } else {
      sideEffects.push(`Notification failed: ${notificationResult.error || 'unknown'}`);
    }
    
    return { success: true, result: { reason, priority, notificationResult }, sideEffects };
  } catch (err) {
    return { 
      success: false, 
      error: err instanceof Error ? err.message : String(err),
      sideEffects 
    };
  }
}

async function executeCollectDocument(
  params: Record<string, unknown>,
  context: FullContext
): Promise<{ success: boolean; result?: unknown; error?: string; sideEffects: string[] }> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const sideEffects: string[] = [];
  
  try {
    const documentType = params.document_type as string;
    const instructions = params.instructions as string || '';
    
    if (!documentType) {
      return { success: false, error: "Missing document_type", sideEffects };
    }
    
    // Update pending task
    const { error } = await supabase
      .from('chatbot_conversas')
      .update({
        pending_task: `collect_${documentType}`,
        pending_task_created_at: new Date().toISOString(),
        pending_task_retries: 0
      })
      .eq('id', context.intake.conversaId);
    
    if (error) {
      return { success: false, error: error.message, sideEffects };
    }
    
    sideEffects.push(`Document collection started: ${documentType}`);
    
    return { 
      success: true, 
      result: { documentType, instructions },
      sideEffects 
    };
  } catch (err) {
    return { 
      success: false, 
      error: err instanceof Error ? err.message : String(err),
      sideEffects 
    };
  }
}

async function executeCalculateEconomy(
  params: Record<string, unknown>,
  context: FullContext
): Promise<{ success: boolean; result?: unknown; error?: string; sideEffects: string[] }> {
  const sideEffects: string[] = [];
  
  try {
    const valorFatura = params.valor_fatura as number;
    const distribuidora = params.distribuidora as string;
    
    if (!valorFatura) {
      return { success: false, error: "Missing valor_fatura", sideEffects };
    }
    
    // Simple economy calculation (can be enhanced with actual formulas)
    const economiaPercentual = 0.15; // 15% default economy
    const economiaValor = valorFatura * economiaPercentual;
    const economiaAnual = economiaValor * 12;
    
    sideEffects.push(`Economy calculated: R$ ${economiaValor.toFixed(2)}/month`);
    
    return { 
      success: true, 
      result: { 
        valorFatura,
        distribuidora,
        economiaPercentual,
        economiaValor,
        economiaAnual
      },
      sideEffects 
    };
  } catch (err) {
    return { 
      success: false, 
      error: err instanceof Error ? err.message : String(err),
      sideEffects 
    };
  }
}

async function executeGenerateProposal(
  params: Record<string, unknown>,
  context: FullContext
): Promise<{ success: boolean; result?: unknown; error?: string; sideEffects: string[] }> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const sideEffects: string[] = [];
  
  try {
    const proposalType = params.proposal_type as string || 'initial';
    
    // Trigger proposal generation via Bitrix sync
    if (context.clientProfile.bitrixLeadId) {
      const { error } = await supabase.functions.invoke('bitrix24-webhook', {
        body: {
          leadId: context.clientProfile.bitrixLeadId,
          forceProcess: true
        }
      });
      
      if (error) {
        sideEffects.push(`Proposal generation triggered with warning: ${error.message}`);
      } else {
        sideEffects.push(`Proposal generation triggered for lead ${context.clientProfile.bitrixLeadId}`);
      }
    }
    
    return { 
      success: true, 
      result: { proposalType, triggered: true },
      sideEffects 
    };
  } catch (err) {
    return { 
      success: false, 
      error: err instanceof Error ? err.message : String(err),
      sideEffects 
    };
  }
}

async function executeUpdateCRM(
  params: Record<string, unknown>,
  context: FullContext
): Promise<{ success: boolean; result?: unknown; error?: string; sideEffects: string[] }> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const sideEffects: string[] = [];
  
  try {
    const field = params.field as string;
    const value = params.value;
    
    if (!field) {
      return { success: false, error: "Missing field", sideEffects };
    }
    
    // Update dados_coletados in conversation
    const { data: conversa, error: fetchError } = await supabase
      .from('chatbot_conversas')
      .select('dados_coletados')
      .eq('id', context.intake.conversaId)
      .single();
    
    if (fetchError) {
      return { success: false, error: fetchError.message, sideEffects };
    }
    
    const dadosColetados = (conversa?.dados_coletados || {}) as Record<string, unknown>;
    dadosColetados[field] = value;
    
    const { error: updateError } = await supabase
      .from('chatbot_conversas')
      .update({ dados_coletados: dadosColetados })
      .eq('id', context.intake.conversaId);
    
    if (updateError) {
      return { success: false, error: updateError.message, sideEffects };
    }
    
    sideEffects.push(`CRM updated: ${field}=${JSON.stringify(value)}`);
    
    // Log the update
    await supabase.from('crm_data_updates_log').insert({
      agent_id: 'sofia',
      conversa_id: context.intake.conversaId,
      entity_type: 'chatbot_conversas',
      entity_id: context.intake.conversaId,
      field_name: field,
      new_value: String(value),
      confirmed_by_client: false
    });
    
    return { success: true, result: { field, value }, sideEffects };
  } catch (err) {
    return { 
      success: false, 
      error: err instanceof Error ? err.message : String(err),
      sideEffects 
    };
  }
}

async function executeScheduleFollowup(
  params: Record<string, unknown>,
  context: FullContext
): Promise<{ success: boolean; result?: unknown; error?: string; sideEffects: string[] }> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const sideEffects: string[] = [];
  
  try {
    const delayHours = (params.delay_hours as number) || 24;
    const reason = params.reason as string || 'follow_up';
    
    const nextFollowup = new Date();
    nextFollowup.setHours(nextFollowup.getHours() + delayHours);
    
    const { error } = await supabase
      .from('chatbot_conversas')
      .update({
        next_followup_at: nextFollowup.toISOString(),
        followup_stage: reason
      })
      .eq('id', context.intake.conversaId);
    
    if (error) {
      return { success: false, error: error.message, sideEffects };
    }
    
    sideEffects.push(`Follow-up scheduled for ${nextFollowup.toISOString()}`);
    
    return { 
      success: true, 
      result: { nextFollowup: nextFollowup.toISOString(), reason },
      sideEffects 
    };
  } catch (err) {
    return { 
      success: false, 
      error: err instanceof Error ? err.message : String(err),
      sideEffects 
    };
  }
}

async function executeSendProposalLink(
  params: Record<string, unknown>,
  context: FullContext
): Promise<{ success: boolean; result?: unknown; error?: string; sideEffects: string[] }> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const sideEffects: string[] = [];
  
  try {
    const proposalId = context.clientProfile.proposalId;
    
    if (!proposalId) {
      return { success: false, error: "No proposal ID available", sideEffects };
    }
    
    // The actual link sending is handled by bitrix24-link-webhook
    // Here we just mark the intent
    const { error } = await supabase
      .from('chatbot_conversas')
      .update({
        event_proposal_sent: true
      })
      .eq('id', context.intake.conversaId);
    
    if (error) {
      sideEffects.push(`Warning updating state: ${error.message}`);
    }
    
    sideEffects.push(`Proposal link send requested for ${proposalId}`);
    
    return { 
      success: true, 
      result: { proposalId },
      sideEffects 
    };
  } catch (err) {
    return { 
      success: false, 
      error: err instanceof Error ? err.message : String(err),
      sideEffects 
    };
  }
}

async function executeMarkDisqualified(
  params: Record<string, unknown>,
  context: FullContext
): Promise<{ success: boolean; result?: unknown; error?: string; sideEffects: string[] }> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const sideEffects: string[] = [];
  
  try {
    const reason = params.reason as string;
    
    if (!reason) {
      return { success: false, error: "Missing disqualification reason", sideEffects };
    }
    
    // Get current dados_coletados
    const { data: conversa } = await supabase
      .from('chatbot_conversas')
      .select('dados_coletados')
      .eq('id', context.intake.conversaId)
      .single();
    
    const dadosColetados = (conversa?.dados_coletados || {}) as Record<string, unknown>;
    dadosColetados.motivoDescarte = reason;
    dadosColetados.descartadoEm = new Date().toISOString();
    
    const { error } = await supabase
      .from('chatbot_conversas')
      .update({
        dados_coletados: dadosColetados,
        sofia_mode: 'descartado',
        ended_at: new Date().toISOString()
      })
      .eq('id', context.intake.conversaId);
    
    if (error) {
      return { success: false, error: error.message, sideEffects };
    }
    
    sideEffects.push(`Lead disqualified: ${reason}`);
    
    return { success: true, result: { reason }, sideEffects };
  } catch (err) {
    return { 
      success: false, 
      error: err instanceof Error ? err.message : String(err),
      sideEffects 
    };
  }
}

async function executeTransferToSAC(
  params: Record<string, unknown>,
  context: FullContext
): Promise<{ success: boolean; result?: unknown; error?: string; sideEffects: string[] }> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const sideEffects: string[] = [];
  
  try {
    const reason = params.reason as string || 'Transferência para SAC';
    
    // Update conversation mode
    const { error } = await supabase
      .from('chatbot_conversas')
      .update({
        sofia_mode: 'sac',
        escalated_at: new Date().toISOString(),
        escalation_reason: `SAC: ${reason}`
      })
      .eq('id', context.intake.conversaId);
    
    if (error) {
      return { success: false, error: error.message, sideEffects };
    }
    
    sideEffects.push(`Transferred to SAC: ${reason}`);
    
    return { success: true, result: { reason }, sideEffects };
  } catch (err) {
    return { 
      success: false, 
      error: err instanceof Error ? err.message : String(err),
      sideEffects 
    };
  }
}

async function executeRequestClarification(
  params: Record<string, unknown>,
  context: FullContext
): Promise<{ success: boolean; result?: unknown; error?: string; sideEffects: string[] }> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const sideEffects: string[] = [];
  
  try {
    const field = params.field as string;
    const question = params.question as string;
    
    // Save clarification request as pending task
    const { error } = await supabase
      .from('chatbot_conversas')
      .update({
        pending_task: `clarify_${field}`,
        pending_task_created_at: new Date().toISOString(),
        awaiting_response: true
      })
      .eq('id', context.intake.conversaId);
    
    if (error) {
      sideEffects.push(`Warning: ${error.message}`);
    }
    
    sideEffects.push(`Clarification requested for: ${field}`);
    
    return { 
      success: true, 
      result: { field, question },
      sideEffects 
    };
  } catch (err) {
    return { 
      success: false, 
      error: err instanceof Error ? err.message : String(err),
      sideEffects 
    };
  }
}

// ============================================
// SET_EXPECTED_FIELD EXECUTOR (Phase 99 - FSM Activation)
// ============================================

async function executeSetExpectedField(
  params: Record<string, unknown>,
  context: FullContext
): Promise<{ success: boolean; result?: unknown; error?: string; sideEffects: string[] }> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const sideEffects: string[] = [];
  
  try {
    const field = params.field as string;
    
    if (!field) {
      return { success: false, error: "Missing field parameter", sideEffects };
    }
    
    const validFields = ["nome", "email", "valor", "distribuidora", "cpf", "cnpj", "telefone", "endereco"];
    if (!validFields.includes(field)) {
      return { success: false, error: `Invalid field: ${field}. Must be one of: ${validFields.join(", ")}`, sideEffects };
    }
    
    // Update fsm_expected_field in chatbot_conversas
    const { error } = await supabase
      .from('chatbot_conversas')
      .update({ 
        fsm_expected_field: field,
        last_deterministic_response_at: new Date().toISOString()
      })
      .eq('id', context.intake.conversaId);
    
    if (error) {
      return { success: false, error: error.message, sideEffects };
    }
    
    sideEffects.push(`FSM expected field set to: ${field}`);
    console.log(`[action] ✅ set_expected_field: ${field} for conversa ${context.intake.conversaId}`);
    
    return { success: true, result: { field }, sideEffects };
  } catch (err) {
    return { 
      success: false, 
      error: err instanceof Error ? err.message : String(err),
      sideEffects 
    };
  }
}

// ============================================
// TOOL EXECUTOR ROUTER
// ============================================

const toolExecutors: Record<string, (
  params: Record<string, unknown>,
  context: FullContext
) => Promise<{ success: boolean; result?: unknown; error?: string; sideEffects: string[] }>> = {
  send_message: executeSendMessage,
  save_fact: executeSaveFact,
  request_clarification: executeRequestClarification,
  escalate: executeEscalate,
  collect_document: executeCollectDocument,
  calculate_economy: executeCalculateEconomy,
  generate_proposal: executeGenerateProposal,
  update_crm: executeUpdateCRM,
  schedule_followup: executeScheduleFollowup,
  send_proposal_link: executeSendProposalLink,
  mark_disqualified: executeMarkDisqualified,
  transfer_to_sac: executeTransferToSAC,
  set_expected_field: executeSetExpectedField
};

// ============================================
// AUTO-FSM PATTERNS (detects questions about specific fields)
// ============================================

interface FSMPattern {
  field: string;
  patterns: RegExp[];
}

const FSM_ACTIVATION_PATTERNS: FSMPattern[] = [
  {
    field: 'nome',
    patterns: [
      /qual\s+(?:(?:o\s+)?seu\s+)?nome/i,
      /(?:me\s+)?diz\s+(?:o\s+)?seu\s+nome/i,
      /posso\s+saber\s+(?:o\s+)?seu\s+nome/i,
      /como\s+(?:voc[eê]\s+se\s+)?chama/i,
      /seu\s+nome\s+(?:completo|por\s+favor)/i
    ]
  },
  {
    field: 'email',
    patterns: [
      /qual\s+(?:(?:o\s+)?seu\s+)?e-?mail/i,
      /(?:me\s+)?(?:passa|envia|manda)\s+(?:o\s+)?seu\s+e-?mail/i,
      /(?:me\s+)?(?:informa|diz)\s+(?:o\s+)?seu\s+e-?mail/i,
      /seu\s+e-?mail\s+(?:por\s+favor)/i
    ]
  },
  {
    field: 'valor',
    patterns: [
      /qual\s+(?:(?:o\s+)?)?valor\s+(?:da\s+)?(?:sua\s+)?(?:conta|fatura)/i,
      /quanto\s+(?:voc[eê]\s+)?paga\s+(?:de\s+)?(?:luz|energia)/i,
      /(?:me\s+)?(?:passa|informa|diz)\s+(?:o\s+)?valor\s+(?:da\s+)?(?:conta|fatura)/i,
      /valor\s+(?:m[ée]dio|mensal|da\s+fatura)/i
    ]
  },
  {
    field: 'distribuidora',
    patterns: [
      /qual\s+(?:(?:a\s+)?sua\s+)?distribuidora/i,
      /qual\s+(?:(?:a\s+)?)?concession[aá]ria/i,
      /(?:de\s+)?qual\s+(?:empresa|companhia)\s+(?:de\s+)?(?:luz|energia)/i,
      /(?:me\s+)?(?:informa|diz)\s+(?:a\s+)?(?:sua\s+)?distribuidora/i
    ]
  },
  {
    field: 'cpf',
    patterns: [
      /qual\s+(?:(?:o\s+)?seu\s+)?cpf/i,
      /(?:me\s+)?(?:passa|informa|diz)\s+(?:o\s+)?seu\s+cpf/i,
      /seu\s+cpf\s+(?:por\s+favor)/i
    ]
  },
  {
    field: 'cnpj',
    patterns: [
      /qual\s+(?:(?:o\s+)?)?cnpj/i,
      /(?:me\s+)?(?:passa|informa|diz)\s+(?:o\s+)?cnpj/i,
      /cnpj\s+(?:da\s+)?empresa/i
    ]
  }
];

/**
 * Detects if the LLM response is asking for a specific field
 * If so, automatically activates FSM by calling set_expected_field
 */
async function autoActivateFSM(
  responseText: string,
  context: FullContext,
  toolCallsExecuted: string[]
): Promise<{ activated: boolean; field?: string }> {
  // Skip if set_expected_field was already called by the LLM
  if (toolCallsExecuted.includes('set_expected_field')) {
    console.log(`[action:AutoFSM] Skipping - LLM already called set_expected_field`);
    return { activated: false };
  }
  
  // Check each pattern
  for (const { field, patterns } of FSM_ACTIVATION_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(responseText)) {
        console.log(`[action:AutoFSM] ✅ Detected question for '${field}' in response`);
        
        // Auto-activate FSM
        const result = await executeSetExpectedField({ field }, context);
        
        if (result.success) {
          console.log(`[action:AutoFSM] ✅ FSM activated: fsm_expected_field='${field}'`);
          return { activated: true, field };
        } else {
          console.error(`[action:AutoFSM] ❌ Failed to activate FSM: ${result.error}`);
          return { activated: false };
        }
      }
    }
  }
  
  console.log(`[action:AutoFSM] No FSM pattern detected in response`);
  return { activated: false };
}

// ============================================
// MAIN ACTION EXECUTOR
// ============================================

export async function executeAction(
  reasoning: ReasoningResult,
  context: FullContext
): Promise<ActionResult> {
  const startTime = Date.now();
  const executedActions: ActionExecution[] = [];
  const failedActions: ActionExecution[] = [];
  const allSideEffects: string[] = [];
  
  let messageSent = false;
  let messageId: string | undefined;
  let responseTextForAutoFSM: string | undefined;
  
  console.log(`[action] Executing ${reasoning.toolCalls.length} tool calls`);
  
  // Execute tool calls in order (some may depend on others)
  for (const toolCall of reasoning.toolCalls) {
    const executor = toolExecutors[toolCall.name];
    
    if (!executor) {
      console.warn(`[action] Unknown tool: ${toolCall.name}`);
      failedActions.push({
        toolCall: { ...toolCall, error: `Unknown tool: ${toolCall.name}` },
        executedAt: new Date(),
        durationMs: 0,
        success: false,
        error: `Unknown tool: ${toolCall.name}`,
        sideEffects: []
      });
      continue;
    }
    
    const toolStartTime = Date.now();
    
    try {
      const result = await executor(toolCall.parameters, context);
      const durationMs = Date.now() - toolStartTime;
      
      const execution: ActionExecution = {
        toolCall: {
          ...toolCall,
          result: result.result,
          success: result.success,
          error: result.error
        },
        executedAt: new Date(),
        durationMs,
        success: result.success,
        result: result.result,
        error: result.error,
        sideEffects: result.sideEffects
      };
      
      if (result.success) {
        executedActions.push(execution);
        allSideEffects.push(...result.sideEffects);
        
        // Track message sent and capture response text for auto-FSM
        if (toolCall.name === 'send_message') {
          messageSent = true;
          messageId = (result.result as { messageId?: string })?.messageId;
          responseTextForAutoFSM = toolCall.parameters.text as string || toolCall.parameters.message as string;
        }
      } else {
        failedActions.push(execution);
        console.error(`[action] Tool ${toolCall.name} failed:`, result.error);
      }
    } catch (err) {
      const durationMs = Date.now() - toolStartTime;
      const errorMsg = err instanceof Error ? err.message : String(err);
      
      failedActions.push({
        toolCall: { ...toolCall, error: errorMsg },
        executedAt: new Date(),
        durationMs,
        success: false,
        error: errorMsg,
        sideEffects: []
      });
      
      console.error(`[action] Tool ${toolCall.name} threw:`, errorMsg);
    }
  }
  
  // Check if CRM was updated
  const crmUpdated = executedActions.some(a => 
    a.toolCall.name === 'update_crm' || 
    a.toolCall.name === 'save_fact'
  );
  
  // AUTO-FSM: Detect patterns in LLM response and activate FSM if needed
  const toolCallsExecuted = executedActions.map(a => a.toolCall.name);
  if (responseTextForAutoFSM && messageSent) {
    const autoFSMResult = await autoActivateFSM(responseTextForAutoFSM, context, toolCallsExecuted);
    if (autoFSMResult.activated) {
      allSideEffects.push(`Auto-FSM activated: ${autoFSMResult.field}`);
    }
  }
  
  const actionDurationMs = Date.now() - startTime;
  
  console.log(`[action] Completed in ${actionDurationMs}ms: ${executedActions.length} success, ${failedActions.length} failed`);
  
  return {
    executedActions,
    failedActions,
    messageSent,
    messageId,
    crmUpdated,
    sideEffects: allSideEffects,
    actionDurationMs
  };
}
