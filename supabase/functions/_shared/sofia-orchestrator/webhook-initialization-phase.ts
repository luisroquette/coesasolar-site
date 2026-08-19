/**
 * WEBHOOK INITIALIZATION PHASE
 * 
 * Handles initial webhook parsing, format detection, and message data construction
 * Extracted from sofia-webhook/index.ts lines 506-800
 * 
 * @module _shared/sofia-orchestrator/webhook-initialization-phase
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.90.0';
import { normalizePhoneNumber, isLidPhone, saveLidPhoneMapping } from '../utils/phone-utils.ts';
import { corsHeaders, type WebhookEventData, type MessageData, type WebhookPayload, type LegacyPayload } from '../webhook-types.ts';
import { validateSofiaWebhook, validateZApiWebhook } from '../zod-schemas.ts';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface WebhookInitializationContext {
  req: Request;
  bodyText: string;
  supabase: SupabaseClient;
}

export interface WebhookInitializationResult {
  handled: boolean;
  response?: Response;
  msgData?: MessageData;
  phone?: string;
  clienteNome?: string | null;
  chatappChatId?: string;
  messageId?: string;
  isLegacyFormat?: boolean;
  webhookPayload?: WebhookPayload | null;
  legacyPayload?: LegacyPayload | null;
  agentId?: string;
}

export interface ParsedWebhookData {
  webhookPayload: WebhookPayload | null;
  legacyPayload: LegacyPayload | null;
  isLegacyFormat: boolean;
  parseError: string | null;
}

// ═══════════════════════════════════════════════════════════════
// WEBHOOK LOGGING HELPER
// ═══════════════════════════════════════════════════════════════

async function logWebhookEvent(
  supabase: SupabaseClient,
  eventData: WebhookEventData
): Promise<void> {
  try {
    await supabase.from('whatsapp_webhook_events').insert({
      provider: 'zapi',
      ...eventData,
      body_raw: eventData.body_raw.substring(0, 10000),
      message_preview: eventData.message_preview?.substring(0, 500),
      processing_status: eventData.processing_status || 'received',
    });
  } catch (e) {
    console.error('[WEBHOOK_LOG] Failed:', e);
  }
}

// ═══════════════════════════════════════════════════════════════
// GET REQUEST HANDLER
// ═══════════════════════════════════════════════════════════════

async function handleGetRequest(
  supabase: SupabaseClient,
  contentType: string | null
): Promise<Response> {
  console.log('Received GET request - webhook validation');
  
  await logWebhookEvent(supabase, {
    request_method: 'GET',
    content_type: contentType,
    body_raw: '',
    body_parsed: null,
    parsed_ok: true,
    event_type: 'ping',
    processing_status: 'validation_ok',
  });
  
  return new Response(JSON.stringify({ status: 'ok', message: 'Webhook is active' }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ═══════════════════════════════════════════════════════════════
// EMPTY BODY HANDLER
// ═══════════════════════════════════════════════════════════════

async function handleEmptyBody(
  supabase: SupabaseClient,
  method: string,
  contentType: string | null,
  bodyText: string
): Promise<Response> {
  console.log('Received validation ping (empty body)');
  
  await logWebhookEvent(supabase, {
    request_method: method,
    content_type: contentType,
    body_raw: bodyText || '(empty)',
    body_parsed: null,
    parsed_ok: true,
    event_type: 'ping',
    processing_status: 'validation_ok',
  });
  
  return new Response(JSON.stringify({ status: 'ok', message: 'Webhook validated successfully' }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ═══════════════════════════════════════════════════════════════
// BODY PARSING
// ═══════════════════════════════════════════════════════════════

function parseWebhookBody(bodyText: string): ParsedWebhookData {
  try {
    const parsed = JSON.parse(bodyText);
    
    // Check if this is the legacy format (has customer_phone/channel_id)
    if (parsed.customer_phone || parsed.channel_id || (parsed.text && !parsed.data)) {
      console.log('[WEBHOOK] Detected LEGACY format');
      
      // Validate legacy payload with Z-API schema
      const legacyValidation = validateZApiWebhook(parsed);
      if (!legacyValidation.success) {
        console.warn('[WEBHOOK] Legacy validation warnings:', 
          legacyValidation.errors?.map(e => `${e.field}: ${e.message}`).join(', '));
      }
      
      return {
        webhookPayload: null,
        legacyPayload: parsed as LegacyPayload,
        isLegacyFormat: true,
        parseError: null,
      };
    }
    
    // Standard API format with data array
    const sofiaValidation = validateSofiaWebhook(parsed);
    if (!sofiaValidation.success) {
      console.warn('[WEBHOOK] Sofia payload validation warnings:', 
        sofiaValidation.errors?.map(e => `${e.field}: ${e.message}`).join(', '));
    }
    
    return {
      webhookPayload: sofiaValidation.success ? sofiaValidation.data! : parsed as WebhookPayload,
      legacyPayload: null,
      isLegacyFormat: false,
      parseError: null,
    };
  } catch (error) {
    return {
      webhookPayload: null,
      legacyPayload: null,
      isLegacyFormat: false,
      parseError: error instanceof Error ? error.message : 'JSON parse failed',
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// LEGACY FORMAT PROCESSING
// ═══════════════════════════════════════════════════════════════

async function processLegacyFormat(
  supabase: SupabaseClient,
  legacyPayload: LegacyPayload,
  method: string,
  contentType: string | null,
  bodyText: string
): Promise<WebhookInitializationResult> {
  console.log('[WEBHOOK] Processing LEGACY payload:', JSON.stringify(legacyPayload).substring(0, 500));
  
  const legacyPhone = legacyPayload.customer_phone || '';
  const legacyText = legacyPayload.text || '';
  const legacySenderName = legacyPayload.sender_name || null;
  const legacyChatId = legacyPayload.channel_id || legacyPhone;
  
  // Log the legacy message
  await logWebhookEvent(supabase, {
    request_method: method,
    content_type: contentType,
    body_raw: bodyText,
    body_parsed: legacyPayload as unknown as Record<string, unknown>,
    parsed_ok: true,
    event_type: 'message',
    phone: legacyPhone,
    chat_id: legacyChatId,
    message_preview: legacyText || '[legacy message]',
    processing_status: 'processing_legacy',
  });
  
  if (!legacyPhone) {
    console.log('[WEBHOOK] Legacy format: No phone number found');
    return {
      handled: true,
      response: new Response(JSON.stringify({ status: 'error', reason: 'no phone in legacy format' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }),
    };
  }
  
  // Create synthetic msgData for unified processing
  const msgData: MessageData = {
    id: legacyPayload.message_id || `legacy_${Date.now()}`,
    fromMe: false,
    side: 'in',
    type: 'text',
    message: { text: legacyText },
    fromUser: {
      id: legacyPhone,
      phone: legacyPhone,
      name: legacySenderName || undefined,
    },
    chat: {
      id: legacyChatId,
      phone: legacyPhone,
      name: legacySenderName || undefined,
      type: 'private',
    },
  };
  
  console.log(`[WEBHOOK] Legacy message from ${legacyPhone}: "${legacyText.substring(0, 100)}"`);
  
  return {
    handled: false,
    msgData,
    phone: legacyPhone,
    clienteNome: legacySenderName,
    chatappChatId: legacyChatId,
    messageId: msgData.id,
    isLegacyFormat: true,
    legacyPayload,
    webhookPayload: null,
  };
}

// ═══════════════════════════════════════════════════════════════
// STANDARD FORMAT PROCESSING
// ═══════════════════════════════════════════════════════════════

async function processStandardFormat(
  supabase: SupabaseClient,
  webhookPayload: WebhookPayload,
  method: string,
  contentType: string | null,
  bodyText: string
): Promise<WebhookInitializationResult> {
  console.log('Received ChatApp webhook (standard format):', JSON.stringify(webhookPayload).substring(0, 500));
  
  // Handle empty data array
  if (!webhookPayload.data || !Array.isArray(webhookPayload.data) || webhookPayload.data.length === 0) {
    console.log('Received validation or empty data payload');
    
    await logWebhookEvent(supabase, {
      request_method: method,
      content_type: contentType,
      body_raw: bodyText,
      body_parsed: webhookPayload as unknown as Record<string, unknown>,
      parsed_ok: true,
      event_type: 'empty_data',
      processing_status: 'no_messages',
    });
    
    return {
      handled: true,
      response: new Response(JSON.stringify({ status: 'ok', message: 'Validation received' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }),
    };
  }
  
  // Process first message in the data array
  const msgData = webhookPayload.data[0];
  console.log('Processing message data:', JSON.stringify(msgData).substring(0, 500));
  
  // Extract phone and basic info for logging
  const logPhone = msgData.fromUser?.phone || msgData.chat?.phone || '';
  const logChatId = msgData.chat?.id || msgData.fromUser?.id || '';
  const logMessageText = msgData.message?.text || msgData.message?.caption || '';
  
  // Ignore outgoing messages
  if (msgData.fromMe || msgData.fromApi || msgData.side === 'out') {
    console.log('Ignoring outgoing message');
    
    await logWebhookEvent(supabase, {
      request_method: method,
      content_type: contentType,
      body_raw: bodyText,
      body_parsed: webhookPayload as unknown as Record<string, unknown>,
      parsed_ok: true,
      event_type: 'outgoing',
      phone: logPhone,
      chat_id: logChatId,
      message_preview: logMessageText,
      processing_status: 'ignored_outgoing',
    });
    
    return {
      handled: true,
      response: new Response(JSON.stringify({ status: 'ignored', reason: 'outgoing message' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }),
    };
  }
  
  // Ignore group messages
  if (msgData.groupId || msgData.chat?.type === 'group') {
    console.log('Ignoring group message');
    
    await logWebhookEvent(supabase, {
      request_method: method,
      content_type: contentType,
      body_raw: bodyText,
      body_parsed: webhookPayload as unknown as Record<string, unknown>,
      parsed_ok: true,
      event_type: 'group',
      phone: logPhone,
      chat_id: logChatId,
      processing_status: 'ignored_group',
    });
    
    return {
      handled: true,
      response: new Response(JSON.stringify({ status: 'ignored', reason: 'group message' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }),
    };
  }
  
  // Log incoming message that will be processed
  await logWebhookEvent(supabase, {
    request_method: method,
    content_type: contentType,
    body_raw: bodyText,
    body_parsed: webhookPayload as unknown as Record<string, unknown>,
    parsed_ok: true,
    event_type: 'message',
    phone: logPhone,
    chat_id: logChatId,
    message_preview: logMessageText || `[${msgData.type || 'unknown'}]`,
    processing_status: 'processing',
  });
  
  // Normalize phone number
  const rawPhone = msgData.fromUser?.phone || msgData.chat?.phone || '';
  const phone = normalizePhoneNumber(rawPhone);
  
  if (rawPhone !== phone) {
    console.log(`[PHONE_NORMALIZE] Raw: ${rawPhone} → Normalized: ${phone}`);
  }
  
  const clienteNome = msgData.fromUser?.name || msgData.chat?.name || null;
  const chatappChatId = msgData.chat?.id || msgData.fromUser?.id || '';
  const messageId = msgData.id;
  
  if (!phone) {
    console.log('No phone number found in message');
    return {
      handled: true,
      response: new Response(JSON.stringify({ status: 'error', reason: 'no phone number' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }),
    };
  }
  
  return {
    handled: false,
    msgData,
    phone,
    clienteNome,
    chatappChatId,
    messageId,
    isLegacyFormat: false,
    webhookPayload,
    legacyPayload: null,
  };
}

// ═══════════════════════════════════════════════════════════════
// MAIN EXECUTION FUNCTION
// ═══════════════════════════════════════════════════════════════

/**
 * Execute webhook initialization phase
 * Parses webhook body, detects format, and extracts message data
 */
export async function executeWebhookInitialization(
  ctx: WebhookInitializationContext
): Promise<WebhookInitializationResult> {
  const { req, bodyText, supabase } = ctx;
  const contentType = req.headers.get('content-type');
  
  // Handle OPTIONS request (CORS preflight)
  if (req.method === 'OPTIONS') {
    return {
      handled: true,
      response: new Response(null, { headers: corsHeaders }),
    };
  }
  
  // Handle GET request (webhook validation)
  if (req.method === 'GET') {
    const response = await handleGetRequest(supabase, contentType);
    return { handled: true, response };
  }
  
  // Handle empty body
  if (!bodyText || bodyText.trim() === '' || bodyText === '{}') {
    const response = await handleEmptyBody(supabase, req.method, contentType, bodyText);
    return { handled: true, response };
  }
  
  console.log('Received webhook body:', bodyText.substring(0, 500));
  
  // Parse webhook body
  const parsed = parseWebhookBody(bodyText);
  
  if (parsed.parseError) {
    console.log('Could not parse body as JSON - treating as validation:', bodyText.substring(0, 100));
    
    await logWebhookEvent(supabase, {
      request_method: req.method,
      content_type: contentType,
      body_raw: bodyText,
      body_parsed: null,
      parsed_ok: false,
      event_type: 'unknown',
      error_message: 'JSON parse failed',
      processing_status: 'parse_error',
    });
    
    return {
      handled: true,
      response: new Response(JSON.stringify({ status: 'ok', message: 'Webhook active' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }),
    };
  }
  
  // Log validation warnings for standard format
  if (!parsed.isLegacyFormat && parsed.webhookPayload) {
    const sofiaValidation = validateSofiaWebhook(parsed.webhookPayload);
    if (!sofiaValidation.success) {
      const validationErrors = sofiaValidation.errors?.map(e => `${e.field}: ${e.message}`).join(', ');
      
      await logWebhookEvent(supabase, {
        request_method: req.method,
        content_type: contentType,
        body_raw: bodyText,
        body_parsed: parsed.webhookPayload as unknown as Record<string, unknown>,
        parsed_ok: false,
        event_type: 'validation_warning',
        error_message: validationErrors,
        processing_status: 'validation_warning',
      });
    }
  }
  
  // Process based on format
  let result: WebhookInitializationResult;
  
  if (parsed.isLegacyFormat && parsed.legacyPayload) {
    result = await processLegacyFormat(supabase, parsed.legacyPayload, req.method, contentType, bodyText);
  } else if (parsed.webhookPayload) {
    result = await processStandardFormat(supabase, parsed.webhookPayload, req.method, contentType, bodyText);
  } else {
    // Fallback - should not happen
    return {
      handled: true,
      response: new Response(JSON.stringify({ status: 'error', reason: 'invalid payload structure' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }),
    };
  }
  
  // Extract agent ID and handle LID mapping if processing continues
  if (!result.handled && result.phone) {
    const payload = result.webhookPayload || result.legacyPayload;
    const requestAgentId = (payload as any)?._agentId || 'sofia';
    result.agentId = requestAgentId;
    
    console.log(`[sofia-webhook] Agent ID from payload: ${requestAgentId}`);
    
    // Save LID mapping if available
    const chatLid = (payload as any)?.chatLid || (result.msgData as any)?.chatLid || null;
    if (chatLid && result.phone && !isLidPhone(result.phone)) {
      await saveLidPhoneMapping(supabase, chatLid, result.phone, requestAgentId);
    }
  }
  
  return result;
}

// ═══════════════════════════════════════════════════════════════
// UTILITY EXPORTS
// ═══════════════════════════════════════════════════════════════

export { parseWebhookBody, logWebhookEvent };
