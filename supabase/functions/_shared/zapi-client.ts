// ═══════════════════════════════════════════════════════════════
// Z-API CLIENT - Centralized WhatsApp messaging via Z-API
// Consolidates send functions, retry logic, and credential management
// Zero Hardcode: All limits and retry configs loaded from configuracoes_sistema
// ═══════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// Use unified config loader for hierarchical config resolution
import { getConfigNumber, getConfigValue } from './unified-config-loader.ts';

// ═══════════════════════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════

export interface ZApiCredentials {
  instanceId: string;
  token: string;
  securityToken?: string | null;
}

export interface ZApiSendResult {
  success: boolean;
  data?: unknown;
  error?: string;
  statusCode?: number;
}

export interface AgentZApiConfig {
  zapi_instance_id?: string | null;
  zapi_token?: string | null;
  zapi_security_token?: string | null;
  agent_id?: string;
}

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION - Dynamic with fallbacks
// ═══════════════════════════════════════════════════════════════

// Fallback values (used if config not loaded)
const MAX_MESSAGE_LENGTH_FALLBACK = 4000;
const MAX_RETRIES_FALLBACK = 3;
const RETRY_DELAYS_FALLBACK = [1000, 2000, 4000];
const RETRYABLE_STATUS_CODES_FALLBACK = [400, 429, 500, 502, 503, 504];
const PAUSED_MODES_FALLBACK = ['paused_for_human', 'human_takeover', 'paused', 'manual'];

/**
 * Get max message length from config or fallback
 */
function getMaxMessageLength(configCache?: Map<string, string>): number {
  return getConfigNumber('zapi_max_message_length', MAX_MESSAGE_LENGTH_FALLBACK, configCache);
}

/**
 * Get max retries from config or fallback
 */
function getMaxRetries(configCache?: Map<string, string>): number {
  return getConfigNumber('zapi_max_retries', MAX_RETRIES_FALLBACK, configCache);
}

/**
 * Get retry delays from config or fallback
 */
function getRetryDelays(configCache?: Map<string, string>): number[] {
  const raw = getConfigValue('zapi_retry_delays', '', configCache);
  if (raw && raw.trim()) {
    return raw.split(',').map(d => parseInt(d.trim(), 10)).filter(n => !isNaN(n));
  }
  return RETRY_DELAYS_FALLBACK;
}

/**
 * Get retryable status codes from config or fallback
 */
function getRetryableStatusCodes(configCache?: Map<string, string>): number[] {
  const raw = getConfigValue('zapi_retryable_status_codes', '', configCache);
  if (raw && raw.trim()) {
    return raw.split(',').map(c => parseInt(c.trim(), 10)).filter(n => !isNaN(n));
  }
  return RETRYABLE_STATUS_CODES_FALLBACK;
}

/**
 * Get paused modes from config or fallback
 */
export function getPausedModes(configCache?: Map<string, string>): string[] {
  const raw = getConfigValue('zapi_paused_modes', '', configCache);
  if (raw && raw.trim()) {
    return raw.split(',').map(m => m.trim().toLowerCase());
  }
  return PAUSED_MODES_FALLBACK;
}

// ═══════════════════════════════════════════════════════════════
// CREDENTIAL MANAGEMENT
// ═══════════════════════════════════════════════════════════════

/**
 * Get Z-API credentials for an agent (from config or fallback to env vars)
 * NOTE: "Client-Token" (account security token) is often global at the account level.
 * If an agent has instanceId/token but no security token, we fallback to the global env token.
 */
export function getZApiCredentials(agentConfig?: AgentZApiConfig | null): ZApiCredentials {
  const envInstanceId = Deno.env.get('ZAPI_INSTANCE_ID') || '';
  const envToken = Deno.env.get('ZAPI_TOKEN') || '';
  const envSecurityToken = Deno.env.get('ZAPI_SECURITY_TOKEN') || null;

  // Z-API fields may be on agent config or raw DB object
  const agentInstanceId = agentConfig?.zapi_instance_id?.trim() || '';
  const agentToken = agentConfig?.zapi_token?.trim() || '';
  const agentSecurityToken = agentConfig?.zapi_security_token?.trim() || '';

  // Prefer agent instance/token when present.
  // Security token falls back per-field to env (so agent can omit it if it's account-level).
  if (agentInstanceId && agentToken) {
    console.log(`[Z-API] Using agent-specific instance credentials for: ${agentConfig?.agent_id || 'unknown'}`);
    return {
      instanceId: agentInstanceId,
      token: agentToken,
      securityToken: agentSecurityToken || envSecurityToken,
    };
  }

  // Fallback to global env vars (backward compatibility)
  console.log('[Z-API] Using global credentials from env vars');
  return {
    instanceId: envInstanceId,
    token: envToken,
    securityToken: envSecurityToken,
  };
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Sanitizes a message for WhatsApp - uses dynamic config
 * - Truncates to max length from config
 * - Removes problematic control characters
 * - Ensures proper encoding
 */
export function sanitizeMessage(message: string, configCache?: Map<string, string>): string {
  if (!message) return '';
  
  const maxLength = getMaxMessageLength(configCache);
  
  // Remove problematic control characters (keeping newlines, tabs)
  let sanitized = message.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  
  // Truncate if too long
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength - 3) + '...';
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
 * Normalize Brazilian phone number to E.164 format
 */
export function normalizePhoneNumber(phone: string): string {
  let normalized = phone.replace(/\D/g, '');
  
  if (normalized.startsWith('0')) {
    normalized = normalized.substring(1);
  }
  
  if (normalized.length === 11 && normalized[2] === '9') {
    normalized = '55' + normalized;
  } else if (normalized.length === 10) {
    normalized = '55' + normalized.substring(0, 2) + '9' + normalized.substring(2);
  } else if (normalized.length === 12 && !normalized.startsWith('55')) {
    console.warn('[Z-API] Phone with non-Brazil country code:', normalized.substring(0, 2));
  }
  
  return normalized;
}

// ═══════════════════════════════════════════════════════════════
// CORE SEND FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Send text message via Z-API with retry logic - uses dynamic config
 */
export async function sendTextMessageWithRetry(
  phone: string, 
  message: string,
  creds: ZApiCredentials,
  configCache?: Map<string, string>
): Promise<ZApiSendResult> {
  const url = `https://api.z-api.io/instances/${creds.instanceId}/token/${creds.token}/send-text`;
  
  // Get dynamic config values
  const maxRetries = getMaxRetries(configCache);
  const retryDelays = getRetryDelays(configCache);
  const retryableStatusCodes = getRetryableStatusCodes(configCache);
  
  // Sanitize the message before sending
  const sanitizedMessage = sanitizeMessage(message, configCache);
  
  if (!sanitizedMessage) {
    return { success: false, error: 'Empty message after sanitization', statusCode: 400 };
  }
  
  const baseHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const headersWithToken: Record<string, string> = {
    ...baseHeaders,
    ...(creds.securityToken ? { 'Client-Token': creds.securityToken } : {}),
  };

  const body = JSON.stringify({ phone, message: sanitizedMessage });

  const attempt = async (headers: Record<string, string>) => {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body,
    });

    if (res.ok) {
      return { ok: true as const, data: await res.json() };
    }

    const errorText = await res.text();
    return { ok: false as const, status: res.status, errorText };
  };

  let lastResult: { ok: false; status: number; errorText: string } | { ok: true; data: unknown } | null = null;
  
  for (let retryCount = 0; retryCount <= maxRetries; retryCount++) {
    // 1) Try with Client-Token when configured
    let result = await attempt(headersWithToken);

    // 2) If the account rejects Client-Token (common misconfig), retry without it
    if (
      !result.ok &&
      result.status === 403 &&
      creds.securityToken &&
      (result.errorText || '').toLowerCase().includes('client-token')
    ) {
      console.warn('[Z-API] Client-Token rejected (403). Retrying without Client-Token...');
      result = await attempt(baseHeaders);
    }

    if (result.ok) {
      console.log('[Z-API] Message sent successfully:', result.data);
      return { success: true, data: result.data, statusCode: 200 };
    }
    
    lastResult = result;
    
    // Check if error is retryable (dynamic from config)
    const isRetryable = retryableStatusCodes.includes(result.status);
    
    if (!isRetryable || retryCount === maxRetries) {
      break;
    }
    
    const delay = retryDelays[retryCount] || 4000;
    console.warn(`[Z-API] Transient error ${result.status}. Retry ${retryCount + 1}/${maxRetries} after ${delay}ms...`);
    console.warn(`[Z-API] Error details: ${result.errorText?.substring(0, 200)}`);
    await sleep(delay);
  }

  // All retries exhausted
  console.error('[Z-API] Send message error after retries:', lastResult?.status, lastResult?.errorText);
  return { 
    success: false, 
    error: `Z-API error: ${lastResult?.status} - ${lastResult?.errorText?.substring(0, 200)}`,
    statusCode: lastResult?.status || 500 
  };
}

/**
 * Send audio message via Z-API with retry logic - uses dynamic config
 */
export async function sendAudioMessageWithRetry(
  phone: string, 
  audioData: string, // Can be base64 or URL
  creds: ZApiCredentials,
  format: 'mp3' | 'ogg' = 'ogg',
  configCache?: Map<string, string>
): Promise<ZApiSendResult> {
  const url = `https://api.z-api.io/instances/${creds.instanceId}/token/${creds.token}/send-audio`;
  
  // Get dynamic config values
  const maxRetries = getMaxRetries(configCache);
  const retryDelays = getRetryDelays(configCache);
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  if (creds.securityToken) {
    headers['Client-Token'] = creds.securityToken;
  }
  
  // Format base64 according to Z-API documentation if needed
  const mimeType = format === 'ogg' ? 'audio/ogg' : 'audio/mpeg';
  const audioPayload = audioData.startsWith('data:') || audioData.startsWith('http') 
    ? audioData 
    : `data:${mimeType};base64,${audioData}`;
  
  let lastError: string | null = null;
  let lastStatusCode: number | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`[Z-API] Attempt ${attempt}/${maxRetries} sending audio to ${phone}...`);
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ 
          phone: phone,
          audio: audioPayload,
          waveform: true, // Show audio waveform like voice message
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
      
      // 403 Client-Token error: try without token
      if (response.status === 403 && responseText.includes('Client-Token') && creds.securityToken) {
        console.log('[Z-API] 🔄 Audio: Client-Token rejected (403). Retrying WITHOUT Client-Token...');
        
        const headersWithoutToken: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        
        const fallbackResponse = await fetch(url, {
          method: 'POST',
          headers: headersWithoutToken,
          body: JSON.stringify({ 
            phone: phone,
            audio: audioPayload,
            waveform: true,
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
        break;
      }
      
      // Don't retry on client errors
      if (response.status >= 400 && response.status < 500 && response.status !== 429 && response.status !== 400) {
        return { success: false, error: lastError, statusCode: response.status };
      }
      
      if (attempt < maxRetries) {
        const delay = retryDelays[attempt - 1] || 4000;
        await sleep(delay);
      }
      
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown network error';
      lastError = `Network error: ${errorMsg}`;
      console.error(`[Z-API] ❌ Audio attempt ${attempt} network error:`, errorMsg);
      
      if (attempt < maxRetries) {
        const delay = retryDelays[attempt - 1] || 4000;
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

// ═══════════════════════════════════════════════════════════════
// HIGH-LEVEL SEND FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Send WhatsApp text message with agent credentials
 * Throws error on failure for backward compatibility with sofia-webhook
 */
export async function sendWhatsAppMessage(
  phone: string, 
  message: string, 
  agentConfig?: AgentZApiConfig | null
): Promise<unknown> {
  const creds = getZApiCredentials(agentConfig);
  
  console.log(`[Z-API] Sending message to ${phone}...`);
  
  const result = await sendTextMessageWithRetry(phone, message, creds);
  
  if (result.success) {
    return result.data;
  }
  
  throw new Error(result.error || 'Z-API send failed');
}

/**
 * Send WhatsApp audio message with agent credentials
 */
export async function sendWhatsAppAudio(
  phone: string, 
  audioBase64: string, 
  format: 'mp3' | 'ogg' = 'ogg',
  agentConfig?: AgentZApiConfig | null
): Promise<boolean> {
  const creds = getZApiCredentials(agentConfig);
  
  console.log(`[Z-API] === AUDIO SEND START ===`);
  console.log(`[Z-API] Phone: ${phone}`);
  console.log(`[Z-API] Audio base64 length: ${audioBase64.length} chars`);
  console.log(`[Z-API] Audio format: ${format}`);
  
  const result = await sendAudioMessageWithRetry(phone, audioBase64, creds, format);
  
  if (result.success) {
    console.log('[Z-API] ✅ Audio sent successfully');
    return true;
  }
  
  console.error('[Z-API] ❌ Audio send failed:', result.error);
  return false;
}

// ═══════════════════════════════════════════════════════════════
// TYPING INDICATOR (Humanization)
// ═══════════════════════════════════════════════════════════════

/**
 * Send "typing" indicator to simulate human-like behavior
 * Shows "Sofia está digitando..." in the WhatsApp chat
 * 
 * Z-API Endpoint: POST /instances/{instanceId}/token/{token}/modify-chat
 * Body: { "phone": "5531999001122", "action": "composing" }
 */
export async function sendTypingIndicator(
  phone: string,
  creds: ZApiCredentials
): Promise<boolean> {
  const url = `https://api.z-api.io/instances/${creds.instanceId}/token/${creds.token}/modify-chat`;
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  if (creds.securityToken) {
    headers['Client-Token'] = creds.securityToken;
  }
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        phone: phone,
        action: 'composing', // Shows "typing..." indicator
      }),
    });
    
    if (response.ok) {
      console.log(`[Z-API] ✅ Typing indicator sent to ${phone}`);
      return true;
    }
    
    // If Client-Token rejected, retry without it
    if (response.status === 403 && creds.securityToken) {
      console.warn('[Z-API] Client-Token rejected (403) for typing. Retrying without...');
      
      const fallbackResponse = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phone,
          action: 'composing',
        }),
      });
      
      if (fallbackResponse.ok) {
        console.log(`[Z-API] ✅ Typing indicator sent (without Client-Token)`);
        return true;
      }
    }
    
    const errorText = await response.text();
    console.warn(`[Z-API] Typing indicator failed: ${response.status} - ${errorText.substring(0, 100)}`);
    return false;
  } catch (err) {
    console.warn('[Z-API] Typing indicator error:', err instanceof Error ? err.message : String(err));
    return false;
  }
}

/**
 * Send typing indicator using agent config
 * High-level wrapper for use in webhooks
 */
export async function sendTypingIndicatorWithAgent(
  phone: string,
  agentConfig?: AgentZApiConfig | null
): Promise<boolean> {
  const creds = getZApiCredentials(agentConfig);
  return sendTypingIndicator(phone, creds);
}

/**
 * Clear typing indicator (show "online" or stop typing)
 * Action: 'available' clears the composing status
 */
export async function clearTypingIndicator(
  phone: string,
  creds: ZApiCredentials
): Promise<boolean> {
  const url = `https://api.z-api.io/instances/${creds.instanceId}/token/${creds.token}/modify-chat`;
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  if (creds.securityToken) {
    headers['Client-Token'] = creds.securityToken;
  }
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        phone: phone,
        action: 'available', // Clears typing indicator
      }),
    });
    
    return response.ok;
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// RACE CONDITION PREVENTION
// ═══════════════════════════════════════════════════════════════

/**
 * Check if conversation is still active (not paused for human) - uses dynamic config
 * Prevents race conditions where #ASSUMIR arrives while processing
 */
export async function checkConversationStillActive(
  supabaseUrl: string,
  supabaseKey: string,
  conversaId: string,
  configCache?: Map<string, string>
): Promise<boolean> {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const { data, error } = await supabase
      .from('chatbot_conversas')
      .select('sofia_mode')
      .eq('id', conversaId)
      .single();
    
    if (error || !data) {
      console.log('[RACE_CHECK] Failed to verify conversation state, defaulting to blocked');
      return false;
    }
    
    // Block for ANY pause mode (dynamic from config)
    const pausedModes = getPausedModes(configCache);
    if (pausedModes.includes(data.sofia_mode)) {
      console.log(`[RACE_CHECK] ⚠️ Conversation ${conversaId} is paused (mode=${data.sofia_mode}) - BLOCKING message`);
      return false;
    }
    
    return true;
  } catch (err) {
    console.error('[RACE_CHECK] Error checking conversation state:', err);
    return false;
  }
}

/**
 * Safe send message - checks if conversation is still active before sending
 * CAMADA C INTEGRADA: Agora inclui Outbound Guard (circuit breaker)
 */
export async function safeSendWhatsAppMessage(
  supabaseUrl: string,
  supabaseKey: string,
  conversaId: string, 
  phone: string, 
  message: string,
  agentConfig?: AgentZApiConfig | null,
  configCache?: Map<string, string>
): Promise<boolean> {
  const stillActive = await checkConversationStillActive(supabaseUrl, supabaseKey, conversaId, configCache);
  
  if (!stillActive) {
    console.log(`[RACE_BLOCKED] ❌ Message blocked due to conversation pause: "${message.substring(0, 50)}..."`);
    return false;
  }
  
  try {
    // ═══════════════════════════════════════════════════════════════
    // CAMADA C: OUTBOUND GUARD (Circuit Breaker)
    // Verifica se esta mensagem já foi enviada recentemente
    // ═══════════════════════════════════════════════════════════════
    const agentId = agentConfig?.agent_id || 'sofia';
    
    // Dynamic import to avoid circular dependency
    const { checkOutboundMessage, pauseConversationForLoop } = await import('./outbound-guard.ts');
    
    const guardResult = await checkOutboundMessage(
      supabaseUrl,
      supabaseKey,
      phone,
      agentId,
      message,
      configCache
    );
    
    if (!guardResult.allowed) {
      console.log(`[OUTBOUND_GUARD] ⛔ Message BLOCKED by circuit breaker: reason=${guardResult.reason}, hits=${guardResult.hitCount}`);
      
      // If we should pause the conversation due to too many duplicates
      if (guardResult.shouldPause) {
        await pauseConversationForLoop(
          supabaseUrl,
          supabaseKey,
          conversaId,
          `${guardResult.hitCount} mensagens duplicadas bloqueadas em poucos segundos`
        );
      }
      
      return false;
    }
    
    // ═══════════════════════════════════════════════════════════════
    // CRITICAL: GLOBAL UNRESOLVED PLACEHOLDER GUARD (WhatsApp layer)
    // Ensures NO outbound message is sent containing placeholders like
    // [PROPOSTA_LINK] / {proposal_url} even if it didn't pass through
    // sofia-webhook guards (e.g., schedulers, retries, other senders).
    // ═══════════════════════════════════════════════════════════════
    const unresolvedPlaceholderPattern = /\[(PROPOSTA_LINK|LINK|URL|EMAIL|NOME|VALOR)\]|\{(proposta_url|proposal_url|link|email|nome|valor)\}/gi;
    const unresolvedMatches = (message || '').match(unresolvedPlaceholderPattern);

    let finalMessage = message;

    if (unresolvedMatches && unresolvedMatches.length > 0) {
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { data: conversaData } = await supabase
        .from('chatbot_conversas')
        .select('cliente_nome, dados_coletados')
        .eq('id', conversaId)
        .maybeSingle();

      const clienteNome = (conversaData as any)?.cliente_nome as string | null;
      const dados = ((conversaData as any)?.dados_coletados as any) || {};
      const proposalUrlCandidate =
        dados?.proposal_url ||
        dados?.public_proposal_url ||
        dados?.proposta_url ||
        dados?.publicProposalUrl ||
        dados?.propostaUrl;
      const proposalUrl =
        typeof proposalUrlCandidate === 'string' && /^https?:\/\//i.test(proposalUrlCandidate)
          ? proposalUrlCandidate
          : null;

      if (proposalUrl) {
        finalMessage = finalMessage.replace(unresolvedPlaceholderPattern, proposalUrl);
        console.log(`[Z-API] ✅ Placeholder replaced before sending (conversa=${conversaId})`);
      } else {
        const firstName = (clienteNome || '').split(' ')[0].trim();
        finalMessage = firstName
          ? `${firstName}, estou finalizando a geração da sua proposta personalizada! ✅\n\nAssim que o link estiver pronto, te envio aqui no WhatsApp. Aguarde só mais um pouquinho! 😊`
          : `Estou finalizando a geração da sua proposta personalizada! ✅\n\nAssim que o link estiver pronto, te envio aqui no WhatsApp. Aguarde só mais um pouquinho! 😊`;

        // Best-effort audit
        try {
          await supabase.from('admin_notifications').insert({
            admin_user_id: null,
            title: '⚠️ Placeholder bloqueado no envio (WhatsApp)',
            message: `Mensagem outbound continha placeholder literal (${unresolvedMatches.join(', ')}). Envio foi corrigido automaticamente para evitar promessa vazia. conversa_id=${conversaId}`,
            type: 'warning',
            entity_type: 'chatbot_conversa',
            entity_id: conversaId,
            created_by_nome: (agentConfig as any)?.agent_id || 'system',
          });
        } catch (e) {
          console.log('[Z-API] Failed to log placeholder block:', e);
        }
      }
    }

    await sendWhatsAppMessage(phone, finalMessage, agentConfig);
    console.log(`[Z-API] ✅ Message sent successfully after all guards passed`);
    return true;
  } catch (err) {
    console.error('[Z-API] ❌ Send failed:', err);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// CONTACT MANAGEMENT
// ═══════════════════════════════════════════════════════════════

/**
 * Save contact to WhatsApp's contact list using Z-API
 */
export async function saveContactToWhatsApp(
  supabaseUrl: string,
  phone: string, 
  fullName: string
): Promise<boolean> {
  try {
    console.log(`[CONTACT_SAVE] Attempting to save contact: ${fullName} (${phone})`);
    
    const response = await fetch(`${supabaseUrl}/functions/v1/z-api-add-contact`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phone: phone,
        firstName: fullName,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[CONTACT_SAVE] Failed to save contact: ${response.status} - ${errorText}`);
      return false;
    }
    
    const result = await response.json();
    console.log(`[CONTACT_SAVE] Contact saved successfully:`, result);
    return result.success === true;
  } catch (error) {
    console.error(`[CONTACT_SAVE] Error saving contact:`, error);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// AUDIO HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Upload audio to Supabase Storage and return public URL
 */
export async function uploadAudioToStorage(
  supabaseUrl: string,
  supabaseKey: string,
  audioBase64: string, 
  format: 'mp3' | 'ogg' = 'ogg'
): Promise<string | null> {
  try {
    // Convert base64 to binary
    const binaryString = atob(audioBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    // Generate unique filename
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const filename = `voice_${timestamp}_${randomSuffix}.${format}`;
    const mimeType = format === 'ogg' ? 'audio/ogg' : 'audio/mpeg';
    
    console.log(`[VOICE] Uploading audio to Storage: ${filename} (${bytes.length} bytes)`);
    
    const uploadUrl = `${supabaseUrl}/storage/v1/object/sofia-audio/${filename}`;
    
    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': mimeType,
        'x-upsert': 'true',
      },
      body: bytes,
    });
    
    if (!uploadResponse.ok) {
      const errText = await uploadResponse.text();
      console.error(`[VOICE] Storage upload failed: HTTP ${uploadResponse.status} - ${errText.substring(0, 300)}`);
      return null;
    }
    
    const publicUrl = `${supabaseUrl}/storage/v1/object/public/sofia-audio/${filename}`;
    console.log(`[VOICE] ✅ Audio uploaded successfully: ${publicUrl}`);
    
    return publicUrl;
  } catch (error) {
    console.error('[VOICE] Exception uploading audio:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

/**
 * Strip audio announcement text from AI response
 * Removes lines like "te mando um áudio" before generating TTS
 * Uses patterns from database (audio_announcement category)
 */
export function stripAudioAnnouncement(
  text: string,
  announcementKeywords?: string[]
): string {
  const original = text.trim();
  const lines = original.split('\n');

  const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Default keywords as fallback
  const defaultKeywords = [
    'te mando',
    'vou mandar',
    'vou te mandar',
    'te envio',
    'vou enviar',
    'enviando',
    'mandando',
    'gravando',
  ];
  
  const keywords = announcementKeywords || defaultKeywords;

  const isAnnouncementLine = (line: string) => {
    const l = normalize(line);
    const mentionsAudio = l.includes('audio');
    const mentionsSend = keywords.some(kw => l.includes(normalize(kw)));
    return mentionsAudio && mentionsSend;
  };

  const filtered = lines.filter((line, idx) => !(idx <= 1 && isAnnouncementLine(line)));
  const cleaned = filtered.join('\n').trim();
  return cleaned || original;
}

/**
 * Load audio announcement keywords from database config
 */
export async function loadAudioAnnouncementKeywords(supabaseClient: any): Promise<string[]> {
  try {
    const { data, error } = await supabaseClient
      .from('configuracoes_sistema')
      .select('valor')
      .eq('chave', 'zapi_audio_announcement_keywords')
      .single();
    
    if (error || !data?.valor) {
      return [];
    }
    
    return JSON.parse(data.valor);
  } catch {
    return [];
  }
}
