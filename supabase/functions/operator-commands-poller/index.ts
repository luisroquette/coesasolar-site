import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getStrictCorsHeaders, handleCorsPrelight, errorResponse } from '../_shared/security-helpers.ts';

// Operator commands that can be detected
const PAUSE_COMMANDS = ['#ASSUMIR', '#MEU', '#TAKEOVER'];
const RESUME_COMMANDS = ['#RESOLVIDO', '#DEVOLVER', '#SOFIA'];

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * ROBUST COMMAND DETECTION (SAFE):
 * - Allows emojis/punctuation BEFORE the command (e.g. "✅ #ASSUMIR")
 * - Allows arguments AFTER the command (e.g. "#ASSUMIR agora")
 * - Does NOT match when the command appears inside a sentence (e.g. "Use #RESOLVIDO...")
 */
function detectOperatorCommand(text: string): { command: string | null; isPause: boolean; isResume: boolean } {
  const raw = (text || "").trim();
  if (!raw) return { command: null, isPause: false, isResume: false };

  const prefix = String.raw`^[^\p{L}\p{N}#]*\s*`;

  for (const cmd of PAUSE_COMMANDS) {
    const re = new RegExp(`${prefix}${escapeRegex(cmd)}(\\s|$)`, "iu");
    if (re.test(raw)) return { command: cmd, isPause: true, isResume: false };
  }

  for (const cmd of RESUME_COMMANDS) {
    const re = new RegExp(`${prefix}${escapeRegex(cmd)}(\\s|$)`, "iu");
    if (re.test(raw)) return { command: cmd, isPause: false, isResume: true };
  }

  return { command: null, isPause: false, isResume: false };
}

interface ZApiMessage {
  messageId: string;
  momment: number;
  phone: string;
  fromMe: boolean;
  body?: {
    text?: string;
  };
  text?: {
    message?: string;
  };
  type?: string;
}

/**
 * ROBUST TEXT EXTRACTION: Try multiple fields to ensure command is found
 * Mirrors the logic in z-api-webhook for consistency
 */
function extractTextFromMessage(msg: any): string {
  const candidates = [
    msg.body?.text,
    msg.text?.message,
    typeof msg.text === 'string' ? msg.text : null,
    msg.message,
    msg.caption,
    msg.body,
  ];
  
  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }
  return '';
}

serve(async (req) => {
  const corsHeaders = getStrictCorsHeaders(req);
  
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return handleCorsPrelight(req, { mode: 'strict' });
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  console.log('[operator-commands-poller] Starting polling cycle...');

  try {
    // Get all active conversations that haven't ended
    const { data: activeConversations, error: fetchError } = await supabase
      .from('chatbot_conversas')
      .select('id, session_id, cliente_telefone, cliente_nome, sofia_mode, last_processed_command_id, human_agent_id, human_agent_nome, agent_id')
      .is('ended_at', null)
      .not('cliente_telefone', 'is', null)
      .order('last_message_at', { ascending: false })
      .limit(50); // Process max 50 conversations per cycle

    if (fetchError) {
      console.error('[operator-commands-poller] Error fetching conversations:', fetchError);
      throw fetchError;
    }

    if (!activeConversations || activeConversations.length === 0) {
      console.log('[operator-commands-poller] No active conversations found');
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No active conversations',
        processed: 0 
      }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    console.log(`[operator-commands-poller] Found ${activeConversations.length} active conversations`);

    let processedCount = 0;
    let commandsFound = 0;

    for (const conversa of activeConversations) {
      try {
        // Format phone for Z-API (remove non-digits, ensure proper format)
        let phone = conversa.cliente_telefone?.replace(/\D/g, '') || '';
        
        // Ensure phone has country code
        if (phone.length === 11 && phone.startsWith('0')) {
          phone = '55' + phone.substring(1);
        } else if (phone.length === 10 || phone.length === 11) {
          phone = '55' + phone;
        }

        if (!phone) {
          console.log(`[operator-commands-poller] Skipping conversation ${conversa.id}: no valid phone`);
          continue;
        }

        // Fetch agent-specific Z-API credentials from database
        const agentId = conversa.agent_id || 'sofia';
        const { data: agentData, error: agentError } = await supabase
          .from('ai_agents')
          .select('zapi_instance_id, zapi_token, zapi_security_token')
          .eq('agent_id', agentId)
          .single();
        
        if (agentError || !agentData?.zapi_instance_id || !agentData?.zapi_token) {
          console.log(`[operator-commands-poller] Skipping conversation ${conversa.id}: no Z-API credentials for agent ${agentId}`);
          continue;
        }

        const ZAPI_INSTANCE_ID = agentData.zapi_instance_id;
        const ZAPI_TOKEN = agentData.zapi_token;
        
        // CRITICAL: Client-Token resolution with GLOBAL FALLBACK
        // Priority 1: Agent-specific security token from database
        // Priority 2: Global environment variable ZAPI_SECURITY_TOKEN
        const rawSecurityToken = agentData.zapi_security_token;
        const GLOBAL_SECURITY_TOKEN = Deno.env.get('ZAPI_SECURITY_TOKEN');
        
        const ZAPI_SECURITY_TOKEN = (rawSecurityToken && typeof rawSecurityToken === 'string' && rawSecurityToken.trim().length > 0) 
          ? rawSecurityToken.trim() 
          : (GLOBAL_SECURITY_TOKEN && GLOBAL_SECURITY_TOKEN.trim().length > 0)
            ? GLOBAL_SECURITY_TOKEN.trim()
            : null;

        // Fetch recent messages from Z-API (official endpoint)
        // Docs: GET /chat-messages/{phone}?amount=10&lastMessageId=...
        const params = new URLSearchParams({ amount: '15' });
        if (conversa.last_processed_command_id) {
          params.set('lastMessageId', conversa.last_processed_command_id);
        }

        const zapiUrl = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/chat-messages/${phone}?${params.toString()}`;

        console.log(`[operator-commands-poller] Fetching messages for ${phone} using agent ${agentId} credentials (security token: ${ZAPI_SECURITY_TOKEN ? 'configured' : 'NOT SET - will likely fail'}${ZAPI_SECURITY_TOKEN && !rawSecurityToken ? ' (from global)' : ''})`);

        // Build headers - ONLY include Client-Token if we have a valid, non-empty security token
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (ZAPI_SECURITY_TOKEN) {
          headers['Client-Token'] = ZAPI_SECURITY_TOKEN;
        }

        const messagesResponse = await fetch(zapiUrl, {
          method: 'GET',
          headers,
        });

        if (!messagesResponse.ok) {
          const errorText = await messagesResponse.text();
          
          // MULTI-DEVICE DETECTION: Skip gracefully when instance doesn't support history fetch
          if (messagesResponse.status === 400 && errorText.toLowerCase().includes('multi device')) {
            // Don't spam logs - just skip silently for multi-device instances
            // The main webhook flow handles commands directly for these instances
            console.log(`[operator-commands-poller] ⚠️ Agent ${agentId} is multi-device (no history API). Commands are handled via webhook instead.`);
            continue;
          }
          
          // Specific handling for Client-Token errors
          if (messagesResponse.status === 400 && errorText.toLowerCase().includes('client-token')) {
            console.error(`[operator-commands-poller] ❌ Z-API Client-Token error for agent ${agentId}: Token is REQUIRED but not configured. Please set 'Token de Segurança (Client-Token)' in AI Gym for this agent, or configure ZAPI_SECURITY_TOKEN as a global secret.`);
          } else {
            console.error(`[operator-commands-poller] Z-API error for ${phone}: ${messagesResponse.status} - ${errorText}`);
          }
          continue;
        }

        const payload = await messagesResponse.json();
        const result = await processMessages(payload, conversa, supabase, phone, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, agentId);

        if (result.commandProcessed) {
          commandsFound++;
        }
        processedCount++;

      } catch (convError) {
        console.error(`[operator-commands-poller] Error processing conversation ${conversa.id}:`, convError);
      }
    }

    console.log(`[operator-commands-poller] Cycle complete. Processed: ${processedCount}, Commands found: ${commandsFound}`);

    return new Response(JSON.stringify({ 
      success: true, 
      processed: processedCount,
      commandsFound,
      totalConversations: activeConversations.length
    }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[operator-commands-poller] Fatal error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: errorMessage 
    }), { 
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});

async function processMessages(
  payload: unknown,
  conversa: any,
  supabase: any,
  phone: string,
  supabaseUrl: string,
  supabaseServiceKey: string,
  agentId: string = 'sofia'
): Promise<{ commandProcessed: boolean }> {
  const messages = Array.isArray(payload)
    ? payload
    : (payload && typeof payload === 'object' && Array.isArray((payload as any).messages))
      ? (payload as any).messages
      : (payload && typeof payload === 'object' && Array.isArray((payload as any).data))
        ? (payload as any).data
        : [];

  if (!messages.length) {
    const keys = payload && typeof payload === 'object' ? Object.keys(payload as any).slice(0, 20) : [];
    console.log(`[operator-commands-poller] No messages for conversation ${conversa.id}. Payload keys: ${keys.join(', ')}`);
    return { commandProcessed: false };
  }

  // Sort messages by timestamp (newest first)
  const sortedMessages = messages.sort((a: any, b: any) => (b.momment || b.timestamp || 0) - (a.momment || a.timestamp || 0));

  // Look for operator commands in recent messages (only fromMe = true)
  for (const msg of sortedMessages.slice(0, 15)) { // Check last 15 messages
    // Skip if not from the operator (fromMe must be true)
    if (!msg.fromMe) continue;

    // ROBUST TEXT EXTRACTION: Use dedicated function that tries multiple fields
    const messageText = extractTextFromMessage(msg);
    const messageId = msg.messageId || msg.id;

    // Skip if already processed
    if (conversa.last_processed_command_id === messageId) {
      console.log(`[operator-commands-poller] Message ${messageId} already processed, skipping`);
      continue;
    }

    // Log extracted text for debugging
    if (messageText) {
      console.log(`[operator-commands-poller] Extracted text from message ${messageId}: "${messageText.substring(0, 60)}"`);
    }

    // ROBUST COMMAND DETECTION
    const { command: detectedCommand, isPause: isPauseCommand, isResume: isReactivateCommand } = detectOperatorCommand(messageText);

    if (isPauseCommand || isReactivateCommand) {
      console.log(`[operator-commands-poller] 🎯 Found command "${detectedCommand}" in message ${messageId}: "${messageText.substring(0, 50)}"`);


      const clientName = conversa.cliente_nome || 'Cliente';
      const firstName = clientName.split(' ')[0];

      if (isPauseCommand && conversa.sofia_mode !== 'paused_for_human') {
        // Execute pause command
        console.log(`[operator-commands-poller] Executing PAUSE for conversation ${conversa.id}`);

        const nowIso = new Date().toISOString();

        // Update conversation status with HARD STOP (clear ALL pending automations)
        const { error: updateError } = await supabase
          .from('chatbot_conversas')
          .update({
            sofia_mode: 'paused_for_human',
            needs_human_fallback: true,
            escalated_at: nowIso,
            escalation_reason: `Atendente assumiu via comando ${detectedCommand} (polling)`,
            human_agent_id: null, // Can be updated later if we identify the operator
            human_agent_nome: 'Operador',
            last_processed_command_id: messageId,
            // HARD STOP: Clear ALL pending automations
            next_followup_at: null,
            next_nudge_at: null,
            next_rescue_at: null,
            next_contract_nudge_at: null,
            pending_task: null,
            pending_task_retries: 0,
          })
          .eq('id', conversa.id);

        if (updateError) {
          console.error(`[operator-commands-poller] Error updating conversation:`, updateError);
          continue;
        }

        // Send combined message via Z-API
        const agentDisplayName = agentId === 'sofia' ? 'sofIA' : 
                                 agentId === 'maria' ? 'marIA' :
                                 agentId === 'julia' ? 'julIA' :
                                 agentId === 'iago' ? 'iagO' :
                                 agentId === 'jaime' ? 'jaimE' : 'IA';
        
        const confirmationMessage = `✅ *Atendimento assumido por humano*\n\n${firstName}, vou transferir seu atendimento para um especialista da equipe. Você está em boas mãos! 😊\n\n_${agentDisplayName} pausada. Use #RESOLVIDO para reativar._`;
        
        await sendZApiMessage(phone, confirmationMessage, supabaseUrl, supabaseServiceKey, agentId);

        // Log the command
        await supabase.from('operator_command_logs').insert({
          command: detectedCommand,
          operator_phone: null,
          operator_name: 'Operador (via polling)',
          client_phone: phone,
          client_name: clientName,
          conversa_id: conversa.id,
          action_result: `success - ${agentDisplayName} paused (polling)`,
        });

        console.log(`[operator-commands-poller] ✅ Successfully paused ${agentDisplayName} for ${phone}`);
        return { commandProcessed: true };

      } else if (isReactivateCommand && conversa.sofia_mode === 'paused_for_human') {
        // Execute reactivate command
        console.log(`[operator-commands-poller] Executing REACTIVATE for conversation ${conversa.id}`);

        // Calculate human resolution time if we have the pause timestamp
        let humanResolutionTime = null;
        if (conversa.escalated_at) {
          const pausedAt = new Date(conversa.escalated_at);
          const now = new Date();
          humanResolutionTime = Math.floor((now.getTime() - pausedAt.getTime()) / 1000);
        }

        // Update conversation status
        const { error: updateError } = await supabase
          .from('chatbot_conversas')
          .update({
            sofia_mode: 'standard',
            needs_human_fallback: false,
            human_resolved_at: new Date().toISOString(),
            human_resolution_time_seconds: humanResolutionTime,
            last_processed_command_id: messageId,
          })
          .eq('id', conversa.id);

        if (updateError) {
          console.error(`[operator-commands-poller] Error updating conversation:`, updateError);
          continue;
        }

        // Send return message via Z-API
        const agentDisplayName = agentId === 'sofia' ? 'sofIA' : 
                                 agentId === 'maria' ? 'marIA' :
                                 agentId === 'julia' ? 'julIA' :
                                 agentId === 'iago' ? 'iagO' :
                                 agentId === 'jaime' ? 'jaimE' : 'IA';
        
        const confirmationMessage = `✅ *Atendimento automático reativado*\n\n${firstName}, estou de volta! 😊 Como posso te ajudar?\n\n_${agentDisplayName} ativa novamente._`;
        
        await sendZApiMessage(phone, confirmationMessage, supabaseUrl, supabaseServiceKey, agentId);

        // Log the command
        await supabase.from('operator_command_logs').insert({
          command: detectedCommand,
          operator_phone: null,
          operator_name: 'Operador (via polling)',
          client_phone: phone,
          client_name: clientName,
          conversa_id: conversa.id,
          action_result: `success - ${agentDisplayName} reactivated (resolution: ${humanResolutionTime}s, polling)`,
        });

        console.log(`[operator-commands-poller] ✅ Successfully reactivated ${agentDisplayName} for ${phone}`);
        return { commandProcessed: true };
      }
    }
  }

  return { commandProcessed: false };
}

async function sendZApiMessage(phone: string, message: string, supabaseUrl: string, supabaseServiceKey: string, agentId: string = 'sofia'): Promise<void> {
  try {
    // Use the existing z-api-send-message function with agentId for correct credentials
    const response = await fetch(`${supabaseUrl}/functions/v1/z-api-send-message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        phone,
        message,
        agentId, // Pass agentId so z-api-send-message can fetch correct credentials
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[operator-commands-poller] Failed to send message for agent ${agentId}: ${response.status} - ${errorText}`);
    } else {
      console.log(`[operator-commands-poller] Message sent successfully to ${phone} using agent ${agentId}`);
    }
  } catch (error) {
    console.error(`[operator-commands-poller] Error sending message:`, error);
  }
}
