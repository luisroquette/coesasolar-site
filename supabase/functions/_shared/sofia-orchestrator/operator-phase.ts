/**
 * SOFIA ORCHESTRATOR - OPERATOR PHASE
 * 
 * Extracted from sofia-webhook/index.ts (Lines 1150-1535)
 * Handles ALL operator commands in a single orchestrated phase:
 * - #RESET_TESTE, #STATUS_TESTE, #PING_TESTE, #VOZ_TESTE, #AJUDA
 * - #ASSUMIR, #ASSUMIR <phone>
 * - #RESOLVIDO, #RESOLVIDO <phone>
 * - #CORRIGIR <texto>
 * 
 * Returns early if any operator command is handled.
 * 
 * @module _shared/sofia-orchestrator/operator-phase
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.90.0';
import {
  RESET_COMMAND, STATUS_COMMAND, PING_COMMAND, VOICE_COMMAND, HELP_COMMAND,
  RETURN_TO_SOFIA_COMMANDS, TAKEOVER_COMMANDS,
  isOperatorCommand, executeResetCommand, executeStatusCommand,
  buildPingResponse, buildVoiceTestText, buildVoiceSuccessMessage, buildVoiceFailureMessage, buildHelpMessage,
  executeTakeoverByPhone, executeReturnByPhone, executeBulkReturn, executeTakeoverInChat,
  executeReturnToSofiaDbUpdates, logOperatorCommand,
  type AttendantInfo,
} from '../operator-commands.ts';
import {
  parseCorrectionCommandLegacy, handleCorrectionCommandLegacy, captureTakeoverFeedbackLegacy,
} from '../continuous-improvement.ts';
import { getTemplateCache } from '../message-templates.ts';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface OperatorPhaseContext {
  supabase: SupabaseClient;
  phone: string;
  phoneDigits: string;
  messageText: string;
  chatappChatId: string;
  clienteNome: string | null;
  agentId: string;
  agentName: string;
  supervisorNome?: string;
  msgData: { fromMe?: boolean; fromApi?: boolean };
  // Allow both Promise<boolean> and Promise<void> returns
  sendWhatsAppMessage: (phone: string, message: string) => Promise<boolean | void>;
  sendVoiceMessage: (phone: string, text: string) => Promise<boolean | void>;
}

export interface OperatorPhaseResult {
  handled: boolean;
  action?: string;
  response?: Response;
  // Metadata for logging
  conversationId?: string;
  clientName?: string;
  resolutionTimeSeconds?: number;
  error?: string;
}

// CORS headers - import from centralized security-helpers
import { corsHeaders } from '../security-helpers.ts';

// ═══════════════════════════════════════════════════════════════
// MAIN ORCHESTRATOR
// ═══════════════════════════════════════════════════════════════

/**
 * Wrap sendMessage to match expected Promise<void> signature
 */
function wrapSendMessage(fn: (phone: string, message: string) => Promise<boolean | void>): (phone: string, message: string) => Promise<void> {
  return async (phone: string, message: string): Promise<void> => {
    await fn(phone, message);
  };
}

/**
 * Execute operator phase - handles ALL operator commands
 * Returns { handled: true, response } if command was processed
 * Returns { handled: false } if no operator command detected
 */
export async function executeOperatorPhase(ctx: OperatorPhaseContext): Promise<OperatorPhaseResult> {
  const normalizedCommand = ctx.messageText.trim().toUpperCase();
  
  // Wrap sendMessage to match expected types
  const sendMessage = wrapSendMessage(ctx.sendWhatsAppMessage);
  
  // ═══════════════════════════════════════════════════════════════
  // 1. RESET COMMAND (available to everyone)
  // ═══════════════════════════════════════════════════════════════
  if (normalizedCommand === RESET_COMMAND) {
    console.log(`[OPERATOR_PHASE] RESET command from ${ctx.phone}`);
    
    const resetResult = await executeResetCommand(ctx.supabase, ctx.phone, ctx.chatappChatId);
    
    const confirmMessage = resetResult.success
      ? `✅ *RESET COMPLETO!*\n\n${resetResult.details.join('\n')}\n\n_Envie qualquer mensagem para iniciar uma nova conversa do zero._`
      : `⚠️ *RESET PARCIAL*\n\n${resetResult.details.join('\n')}`;
    
    await ctx.sendWhatsAppMessage(ctx.phone, confirmMessage);
    
    return {
      handled: true,
      action: 'reset_executed',
      response: new Response(JSON.stringify({ 
        success: true, 
        action: 'reset_executed',
        details: resetResult.details 
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }),
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // 2. STATUS COMMAND (available to everyone)
  // ═══════════════════════════════════════════════════════════════
  if (normalizedCommand === STATUS_COMMAND) {
    console.log(`[OPERATOR_PHASE] STATUS command from ${ctx.phone}`);
    
    const statusResult = await executeStatusCommand(ctx.supabase, ctx.phone, ctx.agentId);
    
    await ctx.sendWhatsAppMessage(ctx.phone, statusResult.status);
    
    return {
      handled: true,
      action: 'status_executed',
      response: new Response(JSON.stringify({ 
        success: true, 
        action: 'status_executed',
        status: statusResult.status 
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }),
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // 3. PING COMMAND
  // ═══════════════════════════════════════════════════════════════
  if (normalizedCommand === PING_COMMAND) {
    console.log(`[OPERATOR_PHASE] PING command from ${ctx.phone}`);
    
    const pingResponse = buildPingResponse({
      phone: ctx.phone,
      clienteNome: ctx.clienteNome,
      agentName: ctx.agentName,
      messageText: ctx.messageText,
    });
    
    await ctx.sendWhatsAppMessage(ctx.phone, pingResponse);
    
    return {
      handled: true,
      action: 'ping_executed',
      response: new Response(JSON.stringify({ 
        success: true, 
        action: 'ping_executed',
        phone: ctx.phone,
        clienteNome: ctx.clienteNome
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }),
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // 4. VOICE COMMAND
  // ═══════════════════════════════════════════════════════════════
  if (normalizedCommand === VOICE_COMMAND) {
    console.log(`[OPERATOR_PHASE] VOICE command from ${ctx.phone}`);
    
    const testMessage = buildVoiceTestText(ctx.agentName);
    const voiceSent = await ctx.sendVoiceMessage(ctx.phone, testMessage);
    
    if (voiceSent) {
      await ctx.sendWhatsAppMessage(ctx.phone, buildVoiceSuccessMessage(ctx.agentName, testMessage));
      return {
        handled: true,
        action: 'voice_test_executed',
        response: new Response(JSON.stringify({ 
          success: true, 
          action: 'voice_test_executed',
          voiceSent: true
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }),
      };
    } else {
      await ctx.sendWhatsAppMessage(ctx.phone, buildVoiceFailureMessage(ctx.agentName));
      return {
        handled: true,
        action: 'voice_test_failed',
        response: new Response(JSON.stringify({ 
          success: false, 
          action: 'voice_test_failed',
          voiceSent: false,
          reason: 'Audio generated but send failed'
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }),
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 5. HELP COMMAND
  // ═══════════════════════════════════════════════════════════════
  if (normalizedCommand === HELP_COMMAND) {
    console.log(`[OPERATOR_PHASE] HELP command from ${ctx.phone}`);
    
    await ctx.sendWhatsAppMessage(ctx.phone, buildHelpMessage());
    
    return {
      handled: true,
      action: 'help_executed',
      response: new Response(JSON.stringify({ 
        success: true, 
        action: 'help_executed'
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }),
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // CHECK IF SENDER IS REGISTERED ATTENDANT (or create virtual one)
  // ═══════════════════════════════════════════════════════════════
  const { data: attendantCheck } = await ctx.supabase
    .from('whatsapp_atendentes')
    .select('id, nome')
    .eq('telefone', ctx.phoneDigits)
    .eq('is_active', true)
    .single();
  
  // IMPORTANT: Anyone can send operator commands - create virtual attendant if not registered
  const isRegisteredAttendant = !!attendantCheck;
  const attendant: AttendantInfo = attendantCheck || {
    id: `virtual-${ctx.phoneDigits}`,
    nome: ctx.clienteNome || `Operador ${ctx.phoneDigits.slice(-4)}`,
  };
  
  // Log if using virtual attendant
  if (!isRegisteredAttendant) {
    console.log(`[OPERATOR_PHASE] Using virtual attendant for ${ctx.phone} (not registered)`);
  }

  // ═══════════════════════════════════════════════════════════════
  // 6. #ASSUMIR <PHONE> - Takeover by phone number
  // ═══════════════════════════════════════════════════════════════
  const takeoverWithPhoneMatch = normalizedCommand.match(/^#(ASSUMIR|MEU|TAKEOVER)\s+(\d{10,13})$/);
  
  if (takeoverWithPhoneMatch) {
    const targetClientPhone = takeoverWithPhoneMatch[2];
    console.log(`[OPERATOR_PHASE] TAKEOVER_BY_PHONE: ${targetClientPhone} by ${ctx.phone}`);
    
    const takeoverResult = await executeTakeoverByPhone({
      supabase: ctx.supabase,
      targetPhone: targetClientPhone,
      operatorPhone: ctx.phone,
      attendant,
      agentName: ctx.agentName,
      supervisorNome: ctx.supervisorNome,
      sendMessage,
      templateCache: getTemplateCache() || undefined,
    });
    
    return {
      handled: true,
      action: 'takeover_by_phone',
      conversationId: takeoverResult.conversationId,
      error: takeoverResult.error,
      response: new Response(JSON.stringify({ 
        success: takeoverResult.success, 
        action: 'takeover_by_phone', 
        conversationId: takeoverResult.conversationId,
        error: takeoverResult.error,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }),
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // 7. #RESOLVIDO <PHONE> - Return by phone number
  // ═══════════════════════════════════════════════════════════════
  const returnWithPhoneMatch = normalizedCommand.match(/^#(RESOLVIDO|DEVOLVER|RETURN)\s+(\d{10,13})$/);
  
  if (returnWithPhoneMatch) {
    const targetClientPhone = returnWithPhoneMatch[2];
    console.log(`[OPERATOR_PHASE] RETURN_BY_PHONE: ${targetClientPhone} by ${ctx.phone}`);
    
    const returnResult = await executeReturnByPhone({
      supabase: ctx.supabase,
      targetPhone: targetClientPhone,
      operatorPhone: ctx.phone,
      attendant,
      agentName: ctx.agentName,
      sendMessage,
      templateCache: getTemplateCache() || undefined,
    });
    
    return {
      handled: true,
      action: 'return_by_phone',
      conversationId: returnResult.conversationId,
      resolutionTimeSeconds: returnResult.resolutionTimeSeconds,
      error: returnResult.error,
      response: new Response(JSON.stringify({ 
        success: returnResult.success, 
        action: 'return_by_phone', 
        conversationId: returnResult.conversationId,
        resolutionTimeSeconds: returnResult.resolutionTimeSeconds,
        error: returnResult.error,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }),
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // 8. #RESOLVIDO IN CLIENT CHAT (operator typing in client's chat)
  // ═══════════════════════════════════════════════════════════════
  const isReturnCommand = RETURN_TO_SOFIA_COMMANDS.includes(normalizedCommand);
  
  if (isReturnCommand) {
    const { data: targetConversaForReturn } = await ctx.supabase
      .from('chatbot_conversas')
      .select('id, cliente_nome, cliente_telefone, chatapp_chat_id, sofia_mode, escalated_at, dados_coletados')
      .eq('chatapp_chat_id', ctx.chatappChatId)
      .is('ended_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (targetConversaForReturn && targetConversaForReturn.sofia_mode === 'paused_for_human') {
      const clientPhoneDigits = targetConversaForReturn.cliente_telefone?.replace(/\D/g, '') || '';
      const senderPhoneDigits = ctx.phone.replace(/\D/g, '');
      const isFromOperator = senderPhoneDigits !== clientPhoneDigits || 
                             ctx.msgData.fromMe === true || ctx.msgData.fromApi === true;
      
      if (isFromOperator) {
        console.log(`[OPERATOR_PHASE] RETURN_IN_CHAT: conversation ${targetConversaForReturn.id}`);
        
        const returnResult = await executeReturnToSofiaDbUpdates(ctx.supabase, {
          conversaId: targetConversaForReturn.id,
          clienteNome: targetConversaForReturn.cliente_nome,
          clienteTelefone: targetConversaForReturn.cliente_telefone,
          escalatedAt: targetConversaForReturn.escalated_at,
          preserveContext: true,
          dadosColetados: targetConversaForReturn.dados_coletados as Record<string, any>,
        });
        
        if (returnResult.success && returnResult.returnMessage) {
          await ctx.sendWhatsAppMessage(targetConversaForReturn.cliente_telefone, returnResult.returnMessage);
          await ctx.supabase.from('chatbot_mensagens').insert({
            conversa_id: targetConversaForReturn.id,
            role: 'assistant',
            content: returnResult.returnMessage,
          });
        }
        
        await logOperatorCommand(ctx.supabase, normalizedCommand, ctx.phone, 'Operador (no chat)',
          targetConversaForReturn.cliente_telefone, targetConversaForReturn.cliente_nome,
          targetConversaForReturn.id, `Conversa devolvida para ${ctx.agentName}`);
        
        return {
          handled: true,
          action: 'return_to_sofia_in_chat',
          conversationId: targetConversaForReturn.id,
          resolutionTimeSeconds: returnResult.resolutionTimeSeconds,
          response: new Response(JSON.stringify({ 
            success: true, 
            action: 'return_to_sofia_in_chat',
            conversationId: targetConversaForReturn.id,
            resolutionTimeSeconds: returnResult.resolutionTimeSeconds
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }),
        };
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 9. #RESOLVIDO FROM ATTENDANT'S OWN CHAT (bulk return)
  // ═══════════════════════════════════════════════════════════════
  if (isReturnCommand) {
    console.log(`[OPERATOR_PHASE] BULK_RETURN by ${ctx.phone}`);
    
    const bulkResult = await executeBulkReturn({
      supabase: ctx.supabase,
      operatorPhone: ctx.phone,
      attendant,
      agentName: ctx.agentName,
      sendMessage,
    });
    
    return {
      handled: true,
      action: 'return_to_sofia_bulk',
      response: new Response(JSON.stringify({ 
        success: bulkResult.success, 
        action: 'return_to_sofia',
        conversationsReturned: bulkResult.conversationsReturned,
        clients: bulkResult.clients
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }),
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // 10. #CORRIGIR <texto> - Operator correction feedback
  // ═══════════════════════════════════════════════════════════════
  const correctionParsed = parseCorrectionCommandLegacy(normalizedCommand);
  
  if (correctionParsed.isCorrection && correctionParsed.correctResponse) {
    const { data: correctionConversa } = await ctx.supabase
      .from('chatbot_conversas')
      .select('id, cliente_telefone, cliente_nome')
      .eq('chatapp_chat_id', ctx.chatappChatId)
      .is('ended_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (correctionConversa) {
      const { data: lastMsgsCorrection } = await ctx.supabase
        .from('chatbot_mensagens')
        .select('role, content')
        .eq('conversa_id', correctionConversa.id)
        .order('created_at', { ascending: false })
        .limit(4);
      
      const lastSofiaCorr = lastMsgsCorrection?.find(m => m.role === 'assistant')?.content || null;
      const lastClientCorr = lastMsgsCorrection?.find(m => m.role === 'user')?.content || null;
      
      const correctionResult = await handleCorrectionCommandLegacy(
        correctionConversa.id,
        ctx.agentId,
        ctx.phone,
        'Operador via #CORRIGIR',
        correctionParsed.correctResponse,
        lastSofiaCorr,
        lastClientCorr,
        correctionConversa.cliente_telefone,
        correctionConversa.cliente_nome
      );
      
      console.log(`[OPERATOR_PHASE] CORRECTION captured: ${correctionResult.feedbackId}`);
      
      await ctx.sendWhatsAppMessage(ctx.phone, `✅ Correção registrada! A Sofia vai aprender com esse feedback para melhorar suas respostas.`);
      
      return {
        handled: true,
        action: 'correction_captured',
        conversationId: correctionConversa.id,
        response: new Response(JSON.stringify({ 
          success: true, 
          action: 'correction_captured',
          feedbackId: correctionResult.feedbackId,
          conversationId: correctionConversa.id
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }),
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 11. #ASSUMIR IN CLIENT CHAT (operator takes over while in chat)
  // ═══════════════════════════════════════════════════════════════
  const isTakeoverCommand = TAKEOVER_COMMANDS.includes(normalizedCommand);
  
  if (isTakeoverCommand) {
    console.log(`[OPERATOR_PHASE] TAKEOVER_IN_CHAT attempt from ${ctx.phone}`);
    
    const takeoverInChatResult = await executeTakeoverInChat({
      supabase: ctx.supabase,
      chatappChatId: ctx.chatappChatId,
      senderPhone: ctx.phone,
      msgData: ctx.msgData,
      agentName: ctx.agentName,
      supervisorNome: ctx.supervisorNome,
      sendMessage,
    });
    
    if (takeoverInChatResult.handled) {
      // Capture takeover feedback for continuous improvement
      if (takeoverInChatResult.success && takeoverInChatResult.conversationId) {
        const { data: lastMsgs } = await ctx.supabase
          .from('chatbot_mensagens')
          .select('role, content')
          .eq('conversa_id', takeoverInChatResult.conversationId)
          .order('created_at', { ascending: false })
          .limit(4);
        
        const lastSofia = lastMsgs?.find(m => m.role === 'assistant')?.content || null;
        const lastClient = lastMsgs?.find(m => m.role === 'user')?.content || null;
        
        captureTakeoverFeedbackLegacy(
          takeoverInChatResult.conversationId,
          ctx.agentId,
          ctx.phone,
          'Operador via #ASSUMIR',
          '',
          ctx.phone,
          takeoverInChatResult.clientName || null,
          lastSofia,
          lastClient
        ).catch(err => console.warn('[OPERATOR_PHASE] Failed to capture takeover feedback:', err));
      }
      
      return {
        handled: true,
        action: 'takeover_in_chat',
        conversationId: takeoverInChatResult.conversationId,
        clientName: takeoverInChatResult.clientName,
        response: new Response(JSON.stringify({ 
          success: takeoverInChatResult.success, 
          action: 'takeover', 
          conversationId: takeoverInChatResult.conversationId, 
          clientName: takeoverInChatResult.clientName 
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }),
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // NO OPERATOR COMMAND DETECTED - Continue to next phase
  // ═══════════════════════════════════════════════════════════════
  return { handled: false };
}

/**
 * Quick check if message might be an operator command
 * Used for buffer bypass decision
 */
export function isOperatorCommandMessage(messageText: string): boolean {
  return isOperatorCommand(messageText);
}
