/**
 * WEBHOOK WRAPPERS MODULE
 * 
 * Consolidates wrapper functions used by sofia-webhook
 * Reduces inline logic by centralizing common operations
 * 
 * @module _shared/webhook-wrappers
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { callAIWithModelLegacy } from './llm-client.ts';
import { 
  sendWhatsAppMessage as sendWhatsAppMessageZApi,
  getZApiCredentials,
  type AgentZApiConfig,
} from './zapi-client.ts';
import {
  uploadAudioToStorage as uploadAudioToStorageShared,
  sendWhatsAppAudioViaZApi,
  sendVoiceMessageComplete as sendVoiceMessageCompleteShared,
} from './audio-handler.ts';
import { generateVoiceAudio as generateVoiceAudioShared, type TTSResult } from './tts-client.ts';
import type { FullAgentConfig } from './ai-gym-config.ts';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface WebhookWrappersConfig {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  lovableApiKey?: string;
}

export interface AICallResult {
  text: string;
  model: string;
}

export interface ConversationCheckResult {
  isActive: boolean;
  mode?: string;
  reason?: string;
}

export interface ContactSaveResult {
  success: boolean;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════
// AI CALL WRAPPER
// ═══════════════════════════════════════════════════════════════

/**
 * Call AI with a specific model using the legacy interface
 * Wraps callAIWithModelLegacy with default max tokens
 */
export async function callAIWithModel(
  model: string, 
  messages: Array<{ role: string; content: string }>,
  lovableApiKey: string = '',
  maxTokens: number = 500
): Promise<AICallResult> {
  return callAIWithModelLegacy(model, messages, lovableApiKey, maxTokens);
}

/**
 * Factory to create a bound callAIWithModel function
 */
export function createAICallWrapper(lovableApiKey: string): (
  model: string, 
  messages: Array<{ role: string; content: string }>
) => Promise<AICallResult> {
  return (model, messages) => callAIWithModel(model, messages, lovableApiKey);
}

// ═══════════════════════════════════════════════════════════════
// WHATSAPP MESSAGE WRAPPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Send WhatsApp message using Z-API
 * Simple wrapper around shared function
 */
export async function sendWhatsAppMessage(
  phone: string, 
  message: string, 
  agentConfig?: FullAgentConfig | null
): Promise<void> {
  await sendWhatsAppMessageZApi(phone, message, agentConfig as AgentZApiConfig);
}

/**
 * Check if conversation is still active (not paused/taken over)
 * Used to prevent race conditions where Sofia sends during human takeover
 */
export async function checkConversationStillActive(
  supabase: SupabaseClient, 
  conversaId: string
): Promise<ConversationCheckResult> {
  const { data } = await supabase
    .from('chatbot_conversas')
    .select('sofia_mode')
    .eq('id', conversaId)
    .single();
  
  const pausedModes = ['paused_for_human', 'human_takeover', 'paused', 'manual'];
  
  if (!data || pausedModes.includes(data.sofia_mode)) {
    console.log(`[RACE_CHECK] Conversation ${conversaId} is paused - BLOCKING`);
    return { 
      isActive: false, 
      mode: data?.sofia_mode,
      reason: 'conversation_paused' 
    };
  }
  
  return { isActive: true, mode: data.sofia_mode };
}

/**
 * Safe send WhatsApp message - checks conversation state first
 * Prevents sending during human takeover
 */
export async function safeSendWhatsAppMessage(
  supabase: SupabaseClient, 
  conversaId: string, 
  phone: string, 
  message: string,
  agentConfig?: FullAgentConfig | null
): Promise<boolean> {
  const checkResult = await checkConversationStillActive(supabase, conversaId);
  
  if (!checkResult.isActive) {
    console.log(`[SAFE_SEND] Blocked message to ${phone} - conversation ${conversaId} is ${checkResult.mode}`);
    return false;
  }
  
  await sendWhatsAppMessage(phone, message, agentConfig);
  return true;
}

/**
 * Create a bound safeSendWhatsAppMessage for use in callbacks
 */
export function createSafeSendWrapper(
  supabase: SupabaseClient,
  agentConfig?: FullAgentConfig | null
): (conversaId: string, phone: string, message: string) => Promise<boolean> {
  return (conversaId, phone, message) => 
    safeSendWhatsAppMessage(supabase, conversaId, phone, message, agentConfig);
}

// ═══════════════════════════════════════════════════════════════
// CONTACT MANAGEMENT
// ═══════════════════════════════════════════════════════════════

/**
 * Save contact to WhatsApp using Z-API add-contact endpoint
 */
export async function saveContactToWhatsApp(
  phone: string, 
  fullName: string,
  supabaseUrl: string
): Promise<ContactSaveResult> {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/z-api-add-contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, firstName: fullName }),
    });
    
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }
    
    const result = await response.json();
    return { success: result.success === true };
  } catch (error) {
    console.warn('[SAVE_CONTACT] Failed to save contact:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// AUDIO WRAPPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Generate voice audio using TTS
 */
export async function generateVoiceAudio(
  text: string,
  supabaseUrl: string,
  supabaseServiceRoleKey: string
): Promise<TTSResult | null> {
  return generateVoiceAudioShared(text, { 
    supabaseUrl, 
    supabaseKey: supabaseServiceRoleKey 
  });
}

/**
 * Upload audio to Supabase storage
 */
export async function uploadAudioToStorage(
  audioBase64: string, 
  format: 'mp3' | 'ogg',
  supabaseUrl: string,
  supabaseServiceRoleKey: string
): Promise<string | null> {
  return uploadAudioToStorageShared(audioBase64, format, supabaseUrl, supabaseServiceRoleKey);
}

/**
 * Send WhatsApp audio message via Z-API
 */
export async function sendWhatsAppAudio(
  phone: string, 
  audioBase64: string, 
  format: 'mp3' | 'ogg' = 'ogg',
  agentConfig: FullAgentConfig | null,
  supabaseUrl: string,
  supabaseServiceRoleKey: string
): Promise<boolean> {
  const creds = getZApiCredentials(agentConfig);
  
  const result = await sendWhatsAppAudioViaZApi(
    phone, 
    audioBase64, 
    format, 
    { 
      instanceId: creds.instanceId, 
      token: creds.token, 
      securityToken: creds.securityToken || undefined 
    }, 
    supabaseUrl, 
    supabaseServiceRoleKey
  );
  
  return result;
}

/**
 * Send complete voice message (generate + send)
 */
export async function sendVoiceMessage(
  phone: string, 
  text: string,
  agentConfig: FullAgentConfig | null,
  supabaseUrl: string,
  supabaseServiceRoleKey: string
): Promise<boolean> {
  const creds = getZApiCredentials(agentConfig);
  
  return sendVoiceMessageCompleteShared(
    phone, 
    text, 
    { 
      instanceId: creds.instanceId, 
      token: creds.token, 
      securityToken: creds.securityToken || undefined 
    }, 
    supabaseUrl, 
    supabaseServiceRoleKey
  );
}

// ═══════════════════════════════════════════════════════════════
// CROSS-WEBHOOK LOCK HELPERS
// ═══════════════════════════════════════════════════════════════

export interface CrossLockResult {
  acquired: boolean;
  existingLockBy?: string;
  existingLockPurpose?: string;
}

/**
 * Acquire cross-webhook lock to prevent simultaneous processing
 */
export async function acquireCrossWebhookLock(
  supabase: SupabaseClient,
  phone: string,
  lockedBy: string = 'sofia-webhook',
  purpose: string = 'message_processing',
  durationSeconds: number = 45
): Promise<CrossLockResult> {
  const { data, error } = await supabase.rpc('acquire_cross_webhook_lock', {
    p_phone: phone,
    p_lead_id: null,
    p_locked_by: lockedBy,
    p_purpose: purpose,
    p_lock_duration_seconds: durationSeconds,
  });

  if (error) {
    console.error('[CROSS_LOCK] Error acquiring lock:', error);
    return { acquired: true }; // Fail open - don't block on lock errors
  }

  if (data && data.length > 0 && !data[0].acquired) {
    return {
      acquired: false,
      existingLockBy: data[0].existing_lock_by,
      existingLockPurpose: data[0].existing_lock_purpose,
    };
  }

  return { acquired: true };
}

/**
 * Release cross-webhook lock
 */
export async function releaseCrossWebhookLock(
  supabase: SupabaseClient,
  phone: string,
  lockedBy: string = 'sofia-webhook'
): Promise<void> {
  try {
    await supabase.rpc('release_cross_webhook_lock', { 
      p_phone: phone, 
      p_locked_by: lockedBy 
    });
    console.log(`[CROSS_LOCK] 🔓 Released lock for ${phone} (${lockedBy})`);
  } catch (err) {
    console.warn('[CROSS_LOCK] Failed to release lock:', err);
  }
}

/**
 * Acquire lock with retry for bitrix24-link-webhook conflicts
 */
export async function acquireCrossWebhookLockWithRetry(
  supabase: SupabaseClient,
  phone: string,
  lockedBy: string = 'sofia-webhook',
  purpose: string = 'message_processing',
  durationSeconds: number = 45,
  retryDelayMs: number = 2000
): Promise<CrossLockResult> {
  const firstAttempt = await acquireCrossWebhookLock(supabase, phone, lockedBy, purpose, durationSeconds);
  
  if (firstAttempt.acquired) {
    console.log(`[CROSS_LOCK] 🔒 Lock acquired for ${phone} (${lockedBy})`);
    return firstAttempt;
  }
  
  console.log(`[CROSS_LOCK] ⏳ Lock held by ${firstAttempt.existingLockBy} - waiting ${retryDelayMs}ms...`);
  
  // If bitrix24-link-webhook has the lock, wait and retry once
  if (firstAttempt.existingLockBy === 'bitrix24-link-webhook') {
    await new Promise(resolve => setTimeout(resolve, retryDelayMs));
    
    const retryAttempt = await acquireCrossWebhookLock(supabase, phone, lockedBy, purpose, durationSeconds);
    
    if (!retryAttempt.acquired) {
      console.log(`[CROSS_LOCK] ⚠️ Still locked by ${retryAttempt.existingLockBy} after retry - proceeding anyway`);
    } else {
      console.log(`[CROSS_LOCK] ✅ Lock acquired after retry`);
    }
    
    return retryAttempt;
  }
  
  return firstAttempt;
}

// ═══════════════════════════════════════════════════════════════
// FACTORY FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Create all wrapper functions with bound configuration
 * Returns a complete set of wrappers for use in webhook handler
 */
export function createWebhookWrappers(config: WebhookWrappersConfig) {
  const { supabaseUrl, supabaseServiceRoleKey, lovableApiKey = '' } = config;
  
  return {
    callAI: createAICallWrapper(lovableApiKey),
    
    sendMessage: (phone: string, message: string, agentConfig?: FullAgentConfig | null) =>
      sendWhatsAppMessage(phone, message, agentConfig),
    
    saveContact: (phone: string, fullName: string) =>
      saveContactToWhatsApp(phone, fullName, supabaseUrl),
    
    generateVoice: (text: string) =>
      generateVoiceAudio(text, supabaseUrl, supabaseServiceRoleKey),
    
    uploadAudio: (audioBase64: string, format: 'mp3' | 'ogg') =>
      uploadAudioToStorage(audioBase64, format, supabaseUrl, supabaseServiceRoleKey),
    
    sendAudio: (phone: string, audioBase64: string, format: 'mp3' | 'ogg', agentConfig: FullAgentConfig | null) =>
      sendWhatsAppAudio(phone, audioBase64, format, agentConfig, supabaseUrl, supabaseServiceRoleKey),
    
    sendVoice: (phone: string, text: string, agentConfig: FullAgentConfig | null) =>
      sendVoiceMessage(phone, text, agentConfig, supabaseUrl, supabaseServiceRoleKey),
  };
}
