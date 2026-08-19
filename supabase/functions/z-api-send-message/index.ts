import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { isBlacklisted, canSendMessage, incrementDailyCount } from '../_shared/anti-spam.ts';
import { checkOutboundMessage, pauseConversationForLoop } from '../_shared/outbound-guard.ts';
import {
  getCorsHeaders,
  getStrictCorsHeaders,
  jsonResponse,
  errorResponse,
  sanitizeString,
  sanitizePhone,
  corsHeaders,
} from '../_shared/security-helpers.ts';
import { validateSendMessage, parseAndValidate } from '../_shared/zod-schemas.ts';

// MESSAGE BUS - Unified persistence layer
import { publishAssistantMessage } from '../_shared/message-bus.ts';

// CORS: Using centralized corsHeaders from security-helpers (permissive mode)

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ZAPI_INSTANCE_ID = Deno.env.get('ZAPI_INSTANCE_ID')!;
const ZAPI_TOKEN = Deno.env.get('ZAPI_TOKEN')!;
const ZAPI_SECURITY_TOKEN = Deno.env.get('ZAPI_SECURITY_TOKEN');

// ═══════════════════════════════════════════════════════════════
// ZERO HARDCODE: Config loaded from database with fallbacks
// ═══════════════════════════════════════════════════════════════

// Fallback values (loaded dynamically below)
let MAX_MESSAGE_LENGTH = 4000;
let MAX_RETRIES = 3;
let INITIAL_DELAY_MS = 1000;
let RETRY_QUEUE_DELAY_MINUTES = 5;

/**
 * Load Z-API config from database
 */
async function loadZApiConfig(supabase: any): Promise<void> {
  try {
    const { data } = await supabase
      .from('configuracoes_sistema')
      .select('chave, valor')
      .in('chave', ['zapi_max_message_length', 'zapi_max_retries', 'zapi_initial_delay_ms', 'zapi_retry_queue_delay_minutes']);
    
    if (data && data.length > 0) {
      const configMap = new Map<string, string>(data.map((r: any) => [r.chave, r.valor]));
      MAX_MESSAGE_LENGTH = parseInt(configMap.get('zapi_max_message_length') || '4000');
      MAX_RETRIES = parseInt(configMap.get('zapi_max_retries') || '3');
      INITIAL_DELAY_MS = parseInt(configMap.get('zapi_initial_delay_ms') || '1000');
      RETRY_QUEUE_DELAY_MINUTES = parseInt(configMap.get('zapi_retry_queue_delay_minutes') || '5');
      console.log(`[Z-API] Config loaded: maxLen=${MAX_MESSAGE_LENGTH}, retries=${MAX_RETRIES}, delay=${INITIAL_DELAY_MS}ms`);
    }
  } catch (err) {
    console.warn('[Z-API] Error loading config, using defaults:', err);
  }
}

interface SendMessageRequest {
  phone: string;
  message: string;
  conversaId?: string;
  agentId?: string;
  // If true, queue for async retry on permanent failure
  enableAsyncRetry?: boolean;
}

interface SendResult {
  success: boolean;
  data?: unknown;
  error?: string;
  statusCode?: number;
}

/**
 * Sanitizes a message for WhatsApp:
 * - Truncates to MAX_MESSAGE_LENGTH
 * - Removes problematic control characters
 * - Ensures proper encoding
 */
function sanitizeMessage(message: string): string {
  if (!message) return '';
  
  // Remove problematic control characters (keeping newlines, tabs)
  let sanitized = message.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  
  // Truncate if too long
  if (sanitized.length > MAX_MESSAGE_LENGTH) {
    sanitized = sanitized.substring(0, MAX_MESSAGE_LENGTH - 3) + '...';
    console.log(`[Z-API] Message truncated from ${message.length} to ${sanitized.length} chars`);
  }
  
  return sanitized.trim();
}

/**
 * Sleep helper for backoff delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Send text message via Z-API with retry logic
 */
async function sendTextMessageWithRetry(
  phone: string, 
  message: string,
  instanceId: string = ZAPI_INSTANCE_ID,
  token: string = ZAPI_TOKEN,
  securityToken?: string
): Promise<SendResult> {
  const url = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`;
  
  // Sanitize the message before sending
  const sanitizedMessage = sanitizeMessage(message);
  
  if (!sanitizedMessage) {
    return { success: false, error: 'Empty message after sanitization', statusCode: 400 };
  }
  
  let lastError: string | null = null;
  let lastStatusCode: number | null = null;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    console.log(`[Z-API] Attempt ${attempt}/${MAX_RETRIES} sending to ${phone}...`);
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    // Add security token if configured
    const effectiveSecurityToken = securityToken || ZAPI_SECURITY_TOKEN;
    if (effectiveSecurityToken) {
      headers['Client-Token'] = effectiveSecurityToken;
    }
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ 
          phone: phone,
          message: sanitizedMessage 
        }),
      });

      const responseText = await response.text();
      lastStatusCode = response.status;
      
      if (response.ok) {
        try {
          const data = JSON.parse(responseText);
          console.log(`[Z-API] ✅ Message sent successfully on attempt ${attempt}:`, data);
          return { success: true, data, statusCode: response.status };
        } catch {
          console.log(`[Z-API] ✅ Message sent (non-JSON response) on attempt ${attempt}`);
          return { success: true, data: { raw: responseText }, statusCode: response.status };
        }
      }
      
      // Handle specific error cases
      lastError = `${response.status} - ${responseText}`;
      
      // Log detailed error info
      console.error(`[Z-API] ❌ Attempt ${attempt} failed:`, {
        status: response.status,
        error: responseText.substring(0, 500),
        phone,
        messageLength: sanitizedMessage.length,
        messagePreview: sanitizedMessage.substring(0, 100),
      });
      
      // 403 Client-Token error: try IMMEDIATELY without token (fallback)
      if (response.status === 403 && responseText.includes('Client-Token') && effectiveSecurityToken) {
        console.log('[Z-API] 🔄 Client-Token rejected (403). Retrying WITHOUT Client-Token immediately...');
        
        try {
          const headersWithoutToken: Record<string, string> = {
            'Content-Type': 'application/json',
          };
          
          const fallbackResponse = await fetch(url, {
            method: 'POST',
            headers: headersWithoutToken,
            body: JSON.stringify({ 
              phone: phone,
              message: sanitizedMessage 
            }),
          });
          
          const fallbackText = await fallbackResponse.text();
          
          if (fallbackResponse.ok) {
            try {
              const data = JSON.parse(fallbackText);
              console.log(`[Z-API] ✅ Message sent successfully WITHOUT Client-Token (403 fallback):`, data);
              return { success: true, data, statusCode: fallbackResponse.status };
            } catch {
              console.log(`[Z-API] ✅ Message sent (non-JSON) WITHOUT Client-Token (403 fallback)`);
              return { success: true, data: { raw: fallbackText }, statusCode: fallbackResponse.status };
            }
          }
          
          // Fallback also failed, continue with normal error handling
          console.error(`[Z-API] ❌ 403 fallback also failed: ${fallbackResponse.status} - ${fallbackText.substring(0, 200)}`);
          lastError = `403 fallback failed: ${fallbackResponse.status} - ${fallbackText}`;
          lastStatusCode = fallbackResponse.status;
        } catch (fallbackErr) {
          console.error(`[Z-API] ❌ 403 fallback network error:`, fallbackErr);
          lastError = `403 fallback network error: ${fallbackErr instanceof Error ? fallbackErr.message : 'Unknown'}`;
        }
        
        // Don't continue retrying after 403 fallback attempt
        break;
      }
      
      // Don't retry on 4xx client errors (except 429 rate limit)
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        // Special case: 400 might be transient, retry once
        if (response.status === 400 && attempt < MAX_RETRIES) {
          console.log('[Z-API] Got 400, will retry after backoff...');
        } else if (response.status !== 400) {
          console.error(`[Z-API] Client error ${response.status}, not retrying`);
          return { success: false, error: lastError, statusCode: response.status };
        }
      }
      
      // Backoff before retry
      if (attempt < MAX_RETRIES) {
        const delay = INITIAL_DELAY_MS * Math.pow(2, attempt - 1);
        console.log(`[Z-API] Waiting ${delay}ms before retry...`);
        await sleep(delay);
      }
      
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown network error';
      lastError = `Network error: ${errorMsg}`;
      console.error(`[Z-API] ❌ Attempt ${attempt} network error:`, errorMsg);
      
      // Backoff before retry
      if (attempt < MAX_RETRIES) {
        const delay = INITIAL_DELAY_MS * Math.pow(2, attempt - 1);
        console.log(`[Z-API] Waiting ${delay}ms before retry...`);
        await sleep(delay);
      }
    }
  }
  
  console.error(`[Z-API] ❌ All ${MAX_RETRIES} attempts failed for ${phone}`);
  return { 
    success: false, 
    error: lastError || 'All retry attempts failed', 
    statusCode: lastStatusCode || 500 
  };
}

/**
 * Send audio message via Z-API with retry logic
 */
async function sendAudioMessageWithRetry(
  phone: string, 
  audioUrl: string,
  instanceId: string = ZAPI_INSTANCE_ID,
  token: string = ZAPI_TOKEN,
  securityToken?: string
): Promise<SendResult> {
  const url = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-audio`;
  
  let lastError: string | null = null;
  let lastStatusCode: number | null = null;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    console.log(`[Z-API] Attempt ${attempt}/${MAX_RETRIES} sending audio to ${phone}...`);
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    const effectiveSecurityToken = securityToken || ZAPI_SECURITY_TOKEN;
    if (effectiveSecurityToken) {
      headers['Client-Token'] = effectiveSecurityToken;
    }
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ 
          phone: phone,
          audio: audioUrl 
        }),
      });

      const responseText = await response.text();
      lastStatusCode = response.status;
      
      if (response.ok) {
        try {
          const data = JSON.parse(responseText);
          console.log(`[Z-API] ✅ Audio sent successfully on attempt ${attempt}`);
          return { success: true, data, statusCode: response.status };
        } catch {
          return { success: true, data: { raw: responseText }, statusCode: response.status };
        }
      }
      
      lastError = `${response.status} - ${responseText}`;
      console.error(`[Z-API] ❌ Audio attempt ${attempt} failed: ${response.status}`);
      
      // 403 Client-Token error: try IMMEDIATELY without token (fallback)
      if (response.status === 403 && responseText.includes('Client-Token') && effectiveSecurityToken) {
        console.log('[Z-API] 🔄 Audio: Client-Token rejected (403). Retrying WITHOUT Client-Token immediately...');
        
        try {
          const headersWithoutToken: Record<string, string> = {
            'Content-Type': 'application/json',
          };
          
          const fallbackResponse = await fetch(url, {
            method: 'POST',
            headers: headersWithoutToken,
            body: JSON.stringify({ 
              phone: phone,
              audio: audioUrl 
            }),
          });
          
          const fallbackText = await fallbackResponse.text();
          
          if (fallbackResponse.ok) {
            try {
              const data = JSON.parse(fallbackText);
              console.log(`[Z-API] ✅ Audio sent successfully WITHOUT Client-Token (403 fallback)`);
              return { success: true, data, statusCode: fallbackResponse.status };
            } catch {
              return { success: true, data: { raw: fallbackText }, statusCode: fallbackResponse.status };
            }
          }
          
          console.error(`[Z-API] ❌ Audio 403 fallback also failed: ${fallbackResponse.status}`);
          lastError = `403 fallback failed: ${fallbackResponse.status} - ${fallbackText}`;
          lastStatusCode = fallbackResponse.status;
        } catch (fallbackErr) {
          console.error(`[Z-API] ❌ Audio 403 fallback network error:`, fallbackErr);
          lastError = `403 fallback network error: ${fallbackErr instanceof Error ? fallbackErr.message : 'Unknown'}`;
        }
        
        // Don't continue retrying after 403 fallback attempt
        break;
      }
      
      // Don't retry on client errors
      if (response.status >= 400 && response.status < 500 && response.status !== 429 && response.status !== 400) {
        return { success: false, error: lastError, statusCode: response.status };
      }
      
      if (attempt < MAX_RETRIES) {
        const delay = INITIAL_DELAY_MS * Math.pow(2, attempt - 1);
        await sleep(delay);
      }
      
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown network error';
      lastError = `Network error: ${errorMsg}`;
      console.error(`[Z-API] ❌ Audio attempt ${attempt} network error:`, errorMsg);
      
      if (attempt < MAX_RETRIES) {
        const delay = INITIAL_DELAY_MS * Math.pow(2, attempt - 1);
        await sleep(delay);
      }
    }
  }
  
  return { 
    success: false, 
    error: lastError || 'All retry attempts failed', 
    statusCode: lastStatusCode || 500 
  };
}

/**
 * Queue a failed message for async retry
 */
async function queueForRetry(
  supabase: any,
  phone: string,
  message: string,
  conversaId: string | undefined,
  agentId: string,
  errorMsg: string,
  statusCode: number | undefined
): Promise<void> {
  try {
    const retryDelayMs = RETRY_QUEUE_DELAY_MINUTES * 60 * 1000;
    const { error } = await supabase.from('chatbot_mensagens_pendentes').insert({
      telefone: phone,
      mensagem: message,
      conversa_id: conversaId || null,
      agent_id: agentId,
      tentativas: MAX_RETRIES, // Already tried MAX_RETRIES times
      ultimo_erro: errorMsg,
      ultimo_status_code: statusCode,
      retry_at: new Date(Date.now() + retryDelayMs).toISOString(),
    });
    
    if (error) {
      console.error('[Z-API] Failed to queue message for retry:', error);
    } else {
      console.log(`[Z-API] Message queued for async retry in ${RETRY_QUEUE_DELAY_MINUTES} minutes: ${phone}`);
    }
  } catch (err) {
    console.error('[Z-API] Error queueing message for retry:', err);
  }
}

/**
 * Notify operators about delivery failure
 */
async function notifyDeliveryFailure(
  supabase: any,
  phone: string,
  conversaId: string | undefined,
  errorMsg: string
): Promise<void> {
  try {
    // Get client name from conversation if available
    let clientName = 'Cliente';
    if (conversaId) {
      const { data } = await supabase
        .from('chatbot_conversas')
        .select('cliente_nome')
        .eq('id', conversaId)
        .single();
      if (data?.cliente_nome) {
        clientName = data.cliente_nome;
      }
    }
    
    await supabase.from('admin_notifications').insert({
      title: '⚠️ Falha no envio de mensagem',
      message: `Não foi possível enviar mensagem para ${clientName} (${phone}). Erro: ${errorMsg?.substring(0, 100)}`,
      type: 'delivery_failure',
      entity_type: 'chatbot_conversa',
      entity_id: conversaId || null,
    });
    
    console.log('[Z-API] Delivery failure notification created');
  } catch (err) {
    console.error('[Z-API] Failed to create notification:', err);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  // Load dynamic config from database
  await loadZApiConfig(supabase);

  try {
    // Parse and validate request body
    const parseResult = await parseAndValidate(req, validateSendMessage);
    
    if (!parseResult.success) {
      console.error('[Z-API] Validation failed:', parseResult.error);
      return new Response(
        JSON.stringify({ error: parseResult.error }),
        { status: parseResult.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const validatedBody = parseResult.data;
    
    // Extract fields from validated body
    const phone = validatedBody.phone;
    const message = validatedBody.message;
    const conversaId = validatedBody.conversaId;
    const audioUrl = validatedBody.audioUrl;
    const skipAntiSpam = validatedBody.skipAntiSpam;
    const agentId = validatedBody.agentId || 'sofia';
    const enableAsyncRetry = validatedBody.enableAsyncRetry !== false;
    const zapiInstanceId = validatedBody.zapiInstanceId;
    const zapiToken = validatedBody.zapiToken;
    const zapiSecurityToken = validatedBody.zapiSecurityToken;

    // Phone validation already done by schema, but double-check
    if (!phone) {
      return new Response(
        JSON.stringify({ error: 'phone is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!message && !audioUrl) {
      return new Response(
        JSON.stringify({ error: 'message or audioUrl is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Normalize phone number
    let normalizedPhone = phone.replace(/\D/g, '');
    
    if (normalizedPhone.startsWith('0')) {
      normalizedPhone = normalizedPhone.substring(1);
    }
    
    if (normalizedPhone.length === 11 && normalizedPhone[2] === '9') {
      normalizedPhone = '55' + normalizedPhone;
    } else if (normalizedPhone.length === 10) {
      normalizedPhone = '55' + normalizedPhone.substring(0, 2) + '9' + normalizedPhone.substring(2);
    } else if (normalizedPhone.length === 12 && !normalizedPhone.startsWith('55')) {
      console.warn('[Z-API] Phone with non-Brazil country code:', normalizedPhone.substring(0, 2));
    }

    console.log(`[Z-API] Normalized phone: ${phone} -> ${normalizedPhone}`);

    // Anti-spam checks
    if (!skipAntiSpam) {
      const blacklistCheck = await isBlacklisted(supabase, normalizedPhone);
      if (blacklistCheck.blocked) {
        console.log(`[Z-API] 🚫 BLOCKED: Phone ${normalizedPhone} is blacklisted: ${blacklistCheck.reason}`);
        return new Response(JSON.stringify({ 
          success: false, 
          blocked: true,
          reason: `Número na blacklist: ${blacklistCheck.reason}` 
        }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const warmupCheck = await canSendMessage(supabase);
      if (!warmupCheck.allowed) {
        console.log(`[Z-API] 🚫 BLOCKED: Daily warm-up limit reached: ${warmupCheck.reason}`);
        return new Response(JSON.stringify({ 
          success: false, 
          blocked: true,
          reason: warmupCheck.reason,
          warmupStatus: warmupCheck.status
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // CIRCUIT BREAKER - Outbound Guard to prevent duplicate messages
    // This blocks messages that were already sent in the last 90 seconds
    // ═══════════════════════════════════════════════════════════════
    if (message) {
      console.log(`[Z-API] 🛡️ Checking Outbound Guard for ${normalizedPhone}...`);
      const guardResult = await checkOutboundMessage(
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
        normalizedPhone,
        agentId,
        message,
      );
      
      if (!guardResult.allowed) {
        console.log(`[Z-API] ⛔ BLOCKED by Outbound Guard: ${guardResult.reason} (hit count: ${guardResult.hitCount})`);
        
        // If should pause, pause the conversation
        if (guardResult.shouldPause && conversaId) {
          await pauseConversationForLoop(
            SUPABASE_URL,
            SUPABASE_SERVICE_ROLE_KEY,
            conversaId,
            `Duplicate message blocked ${guardResult.hitCount} times`
          );
        }
        
        return new Response(JSON.stringify({
          success: false,
          blocked: true,
          reason: guardResult.reason,
          hitCount: guardResult.hitCount,
          phone: normalizedPhone,
          message: `Message blocked by circuit breaker: ${guardResult.reason}`,
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      console.log(`[Z-API] ✅ Outbound Guard passed - message allowed`);
    }

    // ═══════════════════════════════════════════════════════════════
    // DAILY LIMIT CHECK - Max messages per lead per day
    // ═══════════════════════════════════════════════════════════════
    if (conversaId) {
      const today = new Date().toISOString().split('T')[0];
      const { count: todayCount, error: countError } = await supabase
        .from('chatbot_mensagens')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'assistant')
        .eq('conversa_id', conversaId)
        .gte('created_at', today);
      
      if (!countError) {
        // Load max messages per day from config
        const { data: configData } = await supabase
          .from('configuracoes_sistema')
          .select('valor')
          .eq('chave', 'max_messages_per_lead_per_day')
          .maybeSingle();
        
        const maxMessagesPerDay = parseInt(configData?.valor || '10');
        
        if ((todayCount || 0) >= maxMessagesPerDay) {
          console.log(`[Z-API] ⛔ BLOCKED: Lead ${normalizedPhone} already received ${todayCount} messages today (max: ${maxMessagesPerDay})`);
          return new Response(JSON.stringify({
            success: false,
            blocked: true,
            reason: 'daily_limit_exceeded',
            count: todayCount,
            maxAllowed: maxMessagesPerDay,
            phone: normalizedPhone,
          }), {
            status: 429,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        console.log(`[Z-API] Daily limit check: ${todayCount}/${maxMessagesPerDay} messages today`);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // OUTBOUND KILL SWITCH - Check agent status BEFORE sending any message
    // This blocks ALL outgoing messages (direct, followups, nudges, retries) when agent is paused
    // ═══════════════════════════════════════════════════════════════
    console.log(`[Z-API] Checking agent status for: ${agentId}`);
    const { data: agentData, error: agentError } = await supabase
      .from('ai_agents')
      .select('status, name, zapi_instance_id, zapi_token, zapi_security_token')
      .eq('agent_id', agentId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (agentError) {
      console.error(`[Z-API] Error fetching agent data for ${agentId}:`, agentError);
    }
    
    const agentStatus = agentData?.status || 'unknown';
    const agentName = agentData?.name || agentId;
    
    // KILL SWITCH: Block if agent is not active
    if (agentStatus !== 'active') {
      console.log(`[AGENT_STATUS] ⛔ BLOCK_OUTBOUND: Agent ${agentId} (${agentName}) status="${agentStatus}" - message NOT sent to ${normalizedPhone}`);
      return new Response(JSON.stringify({
        success: false,
        blocked: true,
        reason: 'agent_not_active',
        agentId,
        agentStatus,
        agentName,
        phone: normalizedPhone,
        message: `Agent "${agentName}" is not active (status: ${agentStatus}). Message blocked.`,
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    console.log(`[Z-API] Agent ${agentId} is ACTIVE - proceeding with send`);

    // Use agent-specific credentials if provided, otherwise use from database
    let effectiveInstanceId = zapiInstanceId || agentData?.zapi_instance_id || ZAPI_INSTANCE_ID;
    let effectiveToken = zapiToken || agentData?.zapi_token || ZAPI_TOKEN;
    let effectiveSecurityToken = zapiSecurityToken || agentData?.zapi_security_token || ZAPI_SECURITY_TOKEN;

    // Validate we have required credentials
    if (!effectiveInstanceId || !effectiveToken) {
      console.error(`[Z-API] No valid Z-API credentials available for agent ${agentId}`);
      return new Response(
        JSON.stringify({ 
          error: `No Z-API credentials configured for agent ${agentId}`,
          success: false 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`[Z-API] Using credentials for ${agentId}: instance=${effectiveInstanceId?.substring(0, 8)}...`);

    let result: SendResult;
    
    if (audioUrl) {
      result = await sendAudioMessageWithRetry(
        normalizedPhone, 
        audioUrl,
        effectiveInstanceId,
        effectiveToken,
        effectiveSecurityToken
      );
    } else {
      result = await sendTextMessageWithRetry(
        normalizedPhone, 
        message!,
        effectiveInstanceId,
        effectiveToken,
        effectiveSecurityToken
      );
    }

    if (!result.success) {
      // Queue for async retry if enabled
      if (enableAsyncRetry && message) {
        await queueForRetry(
          supabase,
          normalizedPhone,
          message,
          conversaId,
          agentId,
          result.error || 'Unknown error',
          result.statusCode
        );
        
        // Notify operators about the failure
        await notifyDeliveryFailure(
          supabase,
          normalizedPhone,
          conversaId,
          result.error || 'Unknown error'
        );
      }
      
      return new Response(
        JSON.stringify({ 
          error: result.error,
          statusCode: result.statusCode,
          queued: enableAsyncRetry 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Increment daily counter for warm-up tracking
    if (!skipAntiSpam) {
      await incrementDailyCount(supabase);
    }

    // Save the message to conversation if conversaId provided
    // Use Message Bus for unified persistence
    if (conversaId && message) {
      const content = audioUrl ? `[Áudio enviado]\n${message}` : message;
      await publishAssistantMessage(supabase, conversaId, content, 'fast_path');
    }

    return new Response(JSON.stringify({
      success: true,
      phone: normalizedPhone,
      data: result.data,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[Z-API] Error sending message:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
