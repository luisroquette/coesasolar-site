/**
 * GREETING PHASE
 * 
 * Handles first contact greeting for new conversations
 * Sends proper introduction on first message with warm welcome
 * 
 * FASE 1: Creates lead in CRM IMMEDIATELY when first message is received
 * FASE 2: Greeting asks for NAME first before proceeding
 * 
 * Extracted from sofia-webhook/index.ts lines 1324-1383
 * 
 * @module _shared/sofia-orchestrator/greeting-phase
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.90.0';
import { 
  generateGreeting, 
  type GreetingContext as BaseGreetingContext, 
  type GreetingResult 
} from '../greeting-handler.ts';
import { corsHeaders } from '../webhook-types.ts';
import {
  recoverContextFromHistory,
  applyRecoveredContext,
  type RecoveredContext,
} from '../context-recovery.ts';
import {
  syncToBitrix,
} from '../bitrix-sync.ts';

// ═══════════════════════════════════════════════════════════════
// NAME VALIDATION
// ═══════════════════════════════════════════════════════════════

const INVALID_NAME_PATTERNS = [
  /^deus/i,
  /^jesus/i,
  /^cristo/i,
  /^igreja/i,
  /^ministerio/i,
  /^assembleia/i,
  /^congreg/i,
  /amor$/i,
  /^paz\s/i,
  /^fe\s/i,
  /^dios/i,
  /^\d+$/,           // Only numbers
  /^[a-z]{1,3}$/i,   // Too short (1-3 chars like "ab", "oi", "lfr")
  /^[A-Z]{2,5}$/,    // All-caps initials/acronyms (LFR, MG, JBM, etc.)
  /^[a-z]+\d+$/i,    // Name + numbers (user123, test1)
  /^(bot|teste?|admin|suporte|sac|atendimento|usuario|user|cliente)$/i,
];

/**
 * Validate if a pushName looks like a real person name
 */
export function isValidPersonName(name: string | null | undefined): boolean {
  if (!name || name.trim().length < 2) return false;
  const trimmed = name.trim();
  if (trimmed.length > 60) return false; // Too long
  return !INVALID_NAME_PATTERNS.some(p => p.test(trimmed));
}

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface GreetingPhaseContext {
  supabase: SupabaseClient;
  conversaId: string;
  phone: string;
  clienteNome?: string | null;
  messageText: string;
  messageId?: string | null;
  totalMessages: number;
  hasBitrixLead: boolean;
  agentName: string;
  sendWhatsAppMessage: (phone: string, message: string) => Promise<void>;
}

export interface GreetingPhaseResult {
  handled: boolean;
  response?: Response;
  greetingType?: string;
  greetingSent?: boolean;
  infoRequestDetected?: boolean;
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Check if First Contact
// ═══════════════════════════════════════════════════════════════

/**
 * Determine if this is the first contact message
 */
export function isFirstContactMessage(
  totalMessages: number,
  hasBitrixLead: boolean,
  dbTotalMessages?: number
): boolean {
  const realMsgCount = dbTotalMessages ?? 0;
  
  // CRITICAL FIX: Leads from ads (Instagram/Facebook) have Bitrix lead
  // created BEFORE first WhatsApp message. Don't block greeting just
  // because a CRM lead exists — check actual message history instead.
  if (realMsgCount >= 2) return false; // Already had real conversation
  if (totalMessages > 1 && realMsgCount > 0) return false;
  
  if (hasBitrixLead && realMsgCount === 0) {
    console.log(`[GREETING_PHASE] 📢 Lead de anúncio detectado (Bitrix exists, 0 msgs) - enviando greeting normalmente`);
  }
  
  return true;
}

/**
 * Check if conversation has commercial data (should skip greeting)
 * ENHANCED: Also checks for partial data that indicates prior human or AI interaction
 * 
 * CRITICAL FIX (2026-02-04): Now also checks for valorPendente which indicates
 * the client already provided a value (even if awaiting confirmation)
 * 
 * CRITICAL FIX (2026-02-04 v2): REMOVED greeting_sent from checks!
 * greeting_sent should ONLY block duplicate greetings in the SAME session,
 * not prevent new conversations from being greeted. The duplicate check
 * is handled separately by the anti-spam check in executeGreetingPhase.
 */
export function hasCommercialDataForGreeting(
  dadosColetados: Record<string, unknown> | null | undefined
): boolean {
  if (!dadosColetados) return false;
  
  // Check for pending value confirmation - this is CRITICAL
  // If a client sent a value range like "300-400", valorPendente will be set
  // even if valorFatura is null (awaiting confirmation)
  const hasPendingValue = dadosColetados.valorPendente && 
    typeof dadosColetados.valorPendente === 'object' &&
    (dadosColetados.valorPendente as any).valor;
  
  // Check for any commercial data that indicates an ongoing sales conversation
  // This includes data collected by HUMAN agents (Chris, etc.) before Sofia takes over
  // 
  // NOTE: We intentionally do NOT check greeting_sent or triagem_concluida here
  // Those are session markers, not commercial data indicators.
  // The anti-spam duplicate check handles preventing double greetings.
  return !!(
    // Core commercial data
    dadosColetados.distribuidora ||
    dadosColetados.distribuidoraInformada ||
    dadosColetados.valorFatura ||
    dadosColetados.valor_fatura ||
    dadosColetados.consumo ||
    dadosColetados.email ||
    dadosColetados.cpf ||
    dadosColetados.cnpj ||
    dadosColetados.proposta_id ||
    
    // PENDING confirmations - these also count as commercial data!
    hasPendingValue ||
    dadosColetados.emailPendente ||
    dadosColetados.aguardandoConfirmacaoTypo ||
    dadosColetados.distribuidoraTypoDetectado ||
    
    // Human intervention markers
    dadosColetados.human_intervention_completed ||
    dadosColetados.context_restored_at ||
    dadosColetados.human_started_flow ||
    dadosColetados.started_by_human ||
    
    // ANY previous interaction with confirmed data
    dadosColetados.nome ||
    dadosColetados.cliente_confirmou_interesse
  );
}

/**
 * Check message history to detect if another agent (human) already started the conversation
 * This prevents Sofia from re-greeting when taking over from Chris/human
 */
export async function hasHumanStartedConversation(
  supabase: SupabaseClient,
  conversaId: string
): Promise<{ hasHumanStart: boolean; collectedData: Record<string, unknown> }> {
  try {
    // Get the first few assistant messages to detect if another agent started
    const { data: messages } = await supabase
      .from('chatbot_mensagens')
      .select('content, created_at, handler_type')
      .eq('conversa_id', conversaId)
      .eq('role', 'assistant')
      .order('created_at', { ascending: true })
      .limit(5);
    
    if (!messages || messages.length === 0) {
      return { hasHumanStart: false, collectedData: {} };
    }
    
    // Check if any message looks like a human agent introduction
    // Human agents often introduce themselves with their name
    const humanAgentPatterns = [
      /sou\s+[ao]?\s*(chris|cristiane|ana|joão|maria|carlos|pedro)/i,
      /aqui\s+[ée]\s+[ao]?\s*(chris|cristiane|ana|joão|maria|carlos|pedro)/i,
      /meu\s+nome\s+[ée]\s+(chris|cristiane|ana|joão|maria|carlos|pedro)/i,
    ];
    
    const collectedData: Record<string, unknown> = {};
    let hasHumanStart = false;
    
    for (const msg of messages) {
      const content = msg.content || '';
      
      // Check for human agent patterns
      for (const pattern of humanAgentPatterns) {
        if (pattern.test(content)) {
          hasHumanStart = true;
          collectedData.human_started_flow = true;
          collectedData.started_by_human = true;
          break;
        }
      }
      
      // Check if previous messages asked about distribuidora or value
      // This means the flow has already progressed
      if (/cemig|cpfl|enel|light|copel|coelba|distribuidora/i.test(content)) {
        collectedData.distribuidora_asked = true;
      }
      if (/valor|conta\s+de\s+luz|despesa|quanto\s+paga/i.test(content)) {
        collectedData.value_asked = true;
      }
    }
    
    return { hasHumanStart, collectedData };
  } catch (err) {
    console.error('[GREETING_PHASE] Error checking human start:', err);
    return { hasHumanStart: false, collectedData: {} };
  }
}

// ═══════════════════════════════════════════════════════════════
// MAIN EXECUTION FUNCTION
// ═══════════════════════════════════════════════════════════════

/**
 * Execute greeting phase
 * Sends warm welcome message on first contact
 * ENHANCED: Skip greeting if commercial data exists (returning client after human intervention)
 */
export async function executeGreetingPhase(
  ctx: GreetingPhaseContext
): Promise<GreetingPhaseResult> {
  const {
    supabase,
    conversaId,
    phone,
    clienteNome,
    messageText,
    messageId,
    totalMessages,
    hasBitrixLead,
    agentName,
    sendWhatsAppMessage,
  } = ctx;
  
  // CRITICAL: Check for existing commercial data first
  // This prevents greeting restart after human intervention
  const { data: currentConversa } = await supabase
    .from('chatbot_conversas')
    .select('dados_coletados, total_messages')
    .eq('id', conversaId)
    .single();
  
  const existingDados = (currentConversa?.dados_coletados as Record<string, unknown>) || {};
  
  // CRITICAL GUARD: If greeting was already sent in this conversation, NEVER re-greet
  if (existingDados.greeting_sent === true) {
    console.log(`[GREETING_PHASE] ⛔ Skipping - greeting_sent flag is true`);
    return { handled: false, greetingSent: false };
  }
  
  // Use REAL message count from DB instead of potentially stale total_messages column
  const { count: realMessageCount } = await supabase
    .from('chatbot_mensagens')
    .select('id', { count: 'exact', head: true })
    .eq('conversa_id', conversaId);
  const dbTotalMessages = realMessageCount ?? 0;
  
  console.log(`[GREETING_PHASE] Message count: column=${currentConversa?.total_messages || 0}, real=${dbTotalMessages}`);
  
  // Skip greeting if commercial data exists
  if (hasCommercialDataForGreeting(existingDados)) {
    console.log(`[GREETING_PHASE] ⛔ Skipping greeting - commercial data exists`, {
      hasDistribuidora: !!(existingDados.distribuidora || existingDados.distribuidoraInformada),
      hasValor: !!(existingDados.valorFatura || existingDados.valor_fatura),
      hasNome: !!existingDados.nome,
      humanIntervention: existingDados.human_intervention_completed,
    });
    return {
      handled: false,
      greetingSent: false,
    };
  }
  
  // ENHANCED CHECK: Detect if a human agent already started the conversation
  // This prevents Sofia from re-greeting when taking over from Chris/human
  const { hasHumanStart, collectedData: humanData } = await hasHumanStartedConversation(supabase, conversaId);
  
  if (hasHumanStart) {
    console.log(`[GREETING_PHASE] ⛔ Skipping greeting - human agent already started conversation`);
    
    // Try to recover any data from the conversation history
    const recoveredContext = await recoverContextFromHistory(supabase, conversaId, existingDados);
    
    // Merge human data with recovered data
    const mergedData = {
      ...existingDados,
      ...humanData,
      ...recoveredContext.recoveredDados,
      triagem_concluida: true,
      greeting_sent: true,
      awaiting_clausula_petrea_response: false,
    };
    
    // Persist the merged data
    await supabase
      .from('chatbot_conversas')
      .update({
        dados_coletados: mergedData,
        fsm_expected_field: recoveredContext.suggestedNextField || 'valor',
      })
      .eq('id', conversaId);
    
    console.log(`[GREETING_PHASE] Recovered context:`, {
      hasRecoverableData: recoveredContext.hasRecoverableData,
      suggestedNextField: recoveredContext.suggestedNextField,
      recoveredDistribuidora: recoveredContext.recoveredDados.distribuidora,
      recoveredValue: recoveredContext.recoveredDados.valorFatura,
    });
    
    return {
      handled: false,
      greetingSent: false,
    };
  }
  
  // NEW: Try to recover context if there are messages but no commercial data
  // This handles cases where data was collected but not persisted
  if (dbTotalMessages >= 2 && !hasCommercialDataForGreeting(existingDados)) {
    console.log(`[GREETING_PHASE] 🔍 Attempting context recovery for ${conversaId} (${dbTotalMessages} messages)`);
    
    const recoveredContext = await recoverContextFromHistory(supabase, conversaId, existingDados);
    
    if (recoveredContext.hasRecoverableData) {
      await applyRecoveredContext(supabase, conversaId, existingDados, recoveredContext);
      
      console.log(`[GREETING_PHASE] ✅ Context recovered - skipping greeting`);
      return {
        handled: false,
        greetingSent: false,
      };
    }
  }
  
  // Also skip if there are already multiple messages in DB (conversation progressed)
  if (dbTotalMessages >= 3) {
    console.log(`[GREETING_PHASE] ⛔ Skipping greeting - conversation already has ${dbTotalMessages} messages`);
    return {
      handled: false,
      greetingSent: false,
    };
  }
  
  // Check if this is first contact
  const isFirstContact = isFirstContactMessage(totalMessages, hasBitrixLead, dbTotalMessages);
  
  if (!isFirstContact) {
    return {
      handled: false,
      greetingSent: false,
    };
  }
  
  // ═══════════════════════════════════════════════════════════════
  // FASE 1: CREATE LEAD IN CRM IMMEDIATELY
  // Even before greeting, ensure lead exists in Bitrix24
  // This guarantees NO lead is ever lost
  // ═══════════════════════════════════════════════════════════════
  try {
    const provisionalName = clienteNome || 'Lead WhatsApp';
    console.log(`[GREETING_PHASE] 🚀 Creating IMMEDIATE lead in CRM: ${provisionalName} (${phone})`);
    
    const syncResult = await syncToBitrix(
      supabase,
      conversaId,
      phone,
      provisionalName,
      {
        origem_lead: 'whatsapp_primeiro_contato',
        lead_provisorio: !clienteNome, // Mark as provisional if no name from WhatsApp
        first_contact_at: new Date().toISOString(),
      } as any,
      undefined,
      false // Don't force stage movement yet - just create/update lead
    );
    
    if (syncResult.success) {
      console.log(`[GREETING_PHASE] ✅ IMMEDIATE lead created/updated: leadId=${syncResult.leadId}`);
    } else {
      console.log(`[GREETING_PHASE] ⚠️ Immediate lead sync failed (will retry later): ${syncResult.error}`);
    }
  } catch (err) {
    console.error(`[GREETING_PHASE] ❌ Error creating immediate lead:`, err);
    // Continue - greeting should still be sent even if CRM sync fails
  }
  
  // Validate pushName before using it - filter out non-person names
  const validatedNome = isValidPersonName(clienteNome) ? clienteNome : null;
  
  if (clienteNome && !validatedNome) {
    console.log(`[GREETING_PHASE] ⚠️ Invalid pushName filtered: "${clienteNome}"`);
  }
  
  // Build greeting context
  const greetingCtx: BaseGreetingContext = {
    conversaId,
    phone,
    clienteNome: validatedNome || null,
    totalMessages,
    isNewConversation: totalMessages === 0,
    agentName,
    userMessage: messageText,
  };
  
  // Generate greeting
  const greetingResult = generateGreeting(greetingCtx);
  
  // Check if we should send greeting
  if (!greetingResult.shouldSendGreeting || !greetingResult.greetingMessage) {
    return {
      handled: false,
      greetingSent: false,
    };
  }
  
  // ═══════════════════════════════════════════════════════════════
  // ANTI-SPAM: Check if this exact greeting was already sent recently
  // This prevents duplicate greetings when audio/media processing fails
  // ═══════════════════════════════════════════════════════════════
  const { data: recentAssistantMessages } = await supabase
    .from('chatbot_mensagens')
    .select('content, created_at')
    .eq('conversa_id', conversaId)
    .eq('role', 'assistant')
    .order('created_at', { ascending: false })
    .limit(5);
  
  if (recentAssistantMessages && recentAssistantMessages.length > 0) {
    // Normalize both messages for comparison (remove whitespace, lowercase)
    const normalizeForComparison = (text: string) => 
      text.toLowerCase().replace(/\s+/g, ' ').trim().substring(0, 200);
    
    const greetingNormalized = normalizeForComparison(greetingResult.greetingMessage);
    
    const duplicateFound = recentAssistantMessages.some(msg => {
      if (!msg.content) return false;
      return normalizeForComparison(msg.content) === greetingNormalized;
    });
    
    if (duplicateFound) {
      console.log(`[GREETING_PHASE] ⛔ ANTI-SPAM: Greeting already sent in last 5 assistant messages - skipping duplicate`);
      return {
        handled: true,
        greetingSent: false,
        response: new Response(JSON.stringify({
          status: 'greeting_skipped',
          reason: 'duplicate_greeting_blocked',
          conversaId,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }),
      };
    }
  }
  
  console.log(`[GREETING_PHASE] Sending ${greetingResult.greetingType} greeting to ${phone} (userMessage: "${messageText.substring(0, 50)}...")`);
  
  // Save user message first
  await supabase.from('chatbot_mensagens').insert({
    conversa_id: conversaId,
    role: 'user',
    content: messageText,
    message_id: messageId || null,
  });
  
  // Send greeting
  await sendWhatsAppMessage(phone, greetingResult.greetingMessage);
  
  // Save greeting as assistant message
  await supabase.from('chatbot_mensagens').insert({
    conversa_id: conversaId,
    role: 'assistant',
    content: greetingResult.greetingMessage,
  });
  
  // Update conversation metrics AND set FSM to expect NAME response first
  // FASE 2: After greeting, Sofia expects the client to respond with their name
  // Then we transition to value collection
  // NOTE: We already have existingDados from the commercial data check above
  
  // Determine expected field based on whether we have a VALID name
  const nextExpectedField = validatedNome ? 'nome_confirmacao' : 'nome';
  
  const { error: updateError } = await supabase
    .from('chatbot_conversas')
    .update({
      last_sofia_message_at: new Date().toISOString(),
      last_message_at: new Date().toISOString(),
      total_messages: (totalMessages || 0) + 2, // user + assistant greeting
      // MERGE with existing data - set FSM state to expect NAME response
      dados_coletados: {
        ...existingDados,
        greeting_sent: true,
        greeting_type: greetingResult.greetingType,
        awaiting_nome_response: true, // New: expecting name
        awaiting_clausula_petrea_response: false, // Old flag - not used anymore
        lead_criado_imediato: true, // Mark that immediate lead was created
      },
      // Set FSM expected field to trigger NAME collection first
      fsm_expected_field: nextExpectedField,
    })
    .eq('id', conversaId);
  
  if (updateError) {
    console.error(`[GREETING_PHASE] ❌ Failed to update conversation state:`, updateError);
    // Log for diagnostics but continue - the greeting was already sent
  } else {
    console.log(`[GREETING_PHASE] ✅ Successfully updated conversation state for ${conversaId}`);
  }
  
  // Return early - greeting sent, wait for user response
  return {
    handled: true,
    greetingType: greetingResult.greetingType || undefined,
    greetingSent: true,
    infoRequestDetected: greetingResult.greetingType === 'info_request',
    response: new Response(JSON.stringify({
      status: 'greeting_sent',
      conversaId,
      greetingType: greetingResult.greetingType,
      infoRequestDetected: greetingResult.greetingType === 'info_request',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }),
  };
}
