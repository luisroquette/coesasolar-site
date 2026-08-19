/**
 * Webhook Types and Utilities Module (Phase 73)
 * Centralized types, interfaces, and helpers for webhook processing
 * Extracted from sofia-webhook/index.ts
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ═══════════════════════════════════════════════════════════════
// WEBHOOK PAYLOAD TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * Standard webhook payload (API format with data array)
 */
export interface WebhookPayload {
  data?: MessageData[];
  _agentId?: string;
}

/**
 * Legacy webhook format (backward compatibility)
 */
export interface LegacyPayload {
  channel_id?: string;
  corporate_phone?: string;
  customer_phone?: string;
  text?: string;
  sender_name?: string;
  type?: string;
  timestamp?: number;
  message_id?: string;
  _agentId?: string;
}

/**
 * Message data from webhook payload
 */
export interface MessageData {
  id: string;
  internalId?: string;
  fromMe: boolean;
  fromApi?: boolean;
  side: 'in' | 'out';
  type: string;
  subtype?: string | null;
  time?: number;
  message?: MessageContent;
  fromUser?: UserInfo;
  chat?: ChatInfo;
  groupId?: string | null;
}

/**
 * Message content structure
 */
export interface MessageContent {
  text?: string;
  caption?: string;
  url?: string;
  mimeType?: string;
  duration?: number;
  fileSize?: number;
  fileName?: string;
  pageCount?: number;
  file?: FileInfo;
}

/**
 * File info from ChatApp
 */
export interface FileInfo {
  link?: string;
  name?: string;
  contentType?: string;
}

/**
 * User info from webhook
 */
export interface UserInfo {
  id: string;
  name?: string;
  phone?: string;
}

/**
 * Chat info from webhook
 */
export interface ChatInfo {
  id: string;
  internalId?: string;
  phone?: string;
  name?: string;
  type?: 'private' | 'group';
}

// ═══════════════════════════════════════════════════════════════
// WEBHOOK LOGGING
// ═══════════════════════════════════════════════════════════════

/**
 * Webhook event log data
 */
export interface WebhookEventData {
  request_method: string;
  content_type: string | null;
  body_raw: string;
  body_parsed: Record<string, unknown> | null;
  parsed_ok: boolean;
  event_type: string;
  phone?: string;
  chat_id?: string;
  message_preview?: string;
  error_message?: string;
  processing_status?: string;
}

/**
 * Log webhook event to database
 */
export async function logWebhookEvent(
  supabase: SupabaseClient,
  eventData: WebhookEventData
): Promise<void> {
  try {
    await supabase
      .from('whatsapp_webhook_events')
      .insert({
        provider: 'zapi',
        request_method: eventData.request_method,
        content_type: eventData.content_type,
        body_raw: eventData.body_raw.substring(0, 10000),
        body_parsed: eventData.body_parsed,
        parsed_ok: eventData.parsed_ok,
        event_type: eventData.event_type,
        phone: eventData.phone,
        chat_id: eventData.chat_id,
        message_preview: eventData.message_preview?.substring(0, 500),
        error_message: eventData.error_message,
        processing_status: eventData.processing_status || 'received',
      });
  } catch (logError) {
    console.error('[WEBHOOK_LOG] Failed to log event:', logError);
  }
}

// ═══════════════════════════════════════════════════════════════
// WEBHOOK PROCESSING HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Parse webhook body and determine format
 */
export interface ParsedWebhookResult {
  webhookPayload: WebhookPayload | null;
  legacyPayload: LegacyPayload | null;
  isLegacyFormat: boolean;
  parseError: string | null;
}

export function parseWebhookBody(bodyText: string): ParsedWebhookResult {
  try {
    const parsed = JSON.parse(bodyText);
    
    // Check if this is the legacy format (has customer_phone/channel_id)
    if (parsed.customer_phone || parsed.channel_id || (parsed.text && !parsed.data)) {
      console.log('[WEBHOOK] Detected LEGACY format');
      return {
        webhookPayload: null,
        legacyPayload: parsed as LegacyPayload,
        isLegacyFormat: true,
        parseError: null,
      };
    }
    
    // Standard API format with data array
    return {
      webhookPayload: parsed as WebhookPayload,
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

/**
 * Create synthetic MessageData from legacy payload
 */
export function convertLegacyToMessageData(legacyPayload: LegacyPayload): MessageData {
  const legacyPhone = legacyPayload.customer_phone || '';
  const legacyText = legacyPayload.text || '';
  const legacySenderName = legacyPayload.sender_name || null;
  const legacyChatId = legacyPayload.channel_id || legacyPhone;
  
  return {
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
}

/**
 * Check if message should be processed (not outgoing, not group)
 */
export interface MessageFilterResult {
  shouldProcess: boolean;
  reason: string;
}

export function filterIncomingMessage(msgData: MessageData): MessageFilterResult {
  // Ignore outgoing messages
  if (msgData.fromMe || msgData.fromApi || msgData.side === 'out') {
    return { shouldProcess: false, reason: 'outgoing message' };
  }
  
  // Ignore group messages
  if (msgData.groupId || msgData.chat?.type === 'group') {
    return { shouldProcess: false, reason: 'group message' };
  }
  
  return { shouldProcess: true, reason: 'incoming private message' };
}

/**
 * Extract basic info from MessageData
 */
export interface ExtractedMessageInfo {
  phone: string;
  clienteNome: string | null;
  chatappChatId: string;
  messageId: string;
  messageText: string;
}

export function extractMessageInfo(msgData: MessageData): ExtractedMessageInfo {
  return {
    phone: msgData.fromUser?.phone || msgData.chat?.phone || '',
    clienteNome: msgData.fromUser?.name || msgData.chat?.name || null,
    chatappChatId: msgData.chat?.id || msgData.fromUser?.id || '',
    messageId: msgData.id,
    messageText: msgData.message?.text || msgData.message?.caption || '',
  };
}

// ═══════════════════════════════════════════════════════════════
// CORS HEADERS - Re-export from centralized security-helpers
// ═══════════════════════════════════════════════════════════════

export { 
  corsHeaders, 
  jsonResponse as securityJsonResponse, 
  errorResponse as securityErrorResponse 
} from './security-helpers.ts';

/**
 * Create standard JSON response
 * @deprecated Use jsonResponse from security-helpers.ts instead
 */
export function jsonResponse(
  data: Record<string, unknown>,
  status: number = 200
): Response {
  // Import corsHeaders inline to avoid circular dependency at runtime
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, client-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  };
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

/**
 * Create success response
 * @deprecated Use jsonResponse from security-helpers.ts instead
 */
export function successResponse(data: Record<string, unknown>): Response {
  return jsonResponse(data, 200);
}

/**
 * Create error response
 * @deprecated Use errorResponse from security-helpers.ts instead
 */
export function errorResponse(error: string, status: number = 500): Response {
  return jsonResponse({ error }, status);
}
