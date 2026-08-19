/**
 * Audio Handler Module
 * Centralized audio preference detection and voice message management
 * Extracted from sofia-webhook/index.ts for reuse across Edge Functions
 */

import { matchesPatternCategory, type PatternEntry } from './detection-patterns.ts';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface SofiaAudioSettings {
  enabled: boolean;
  congruenceEnabled: boolean;
  offerOnDoubtsEnabled: boolean;
  minCharsForCongruence: number;
  minCharsForAudioOffer: number;
}

export interface AudioOfferResult {
  shouldOffer: boolean;
  reason: 'long_response' | 'multiple_doubts' | 'complex_topic' | null;
}

// ═══════════════════════════════════════════════════════════════
// CONSTANTS - Now loaded from database via detection patterns
// Categories: 'complex_topic', 'multiple_doubts'
// ═══════════════════════════════════════════════════════════════

// Default settings
export const DEFAULT_AUDIO_SETTINGS: SofiaAudioSettings = {
  enabled: true,
  congruenceEnabled: true,
  offerOnDoubtsEnabled: true,
  minCharsForCongruence: 100,
  minCharsForAudioOffer: 350,
};

// Cache for settings
let audioSettingsCache: { data: SofiaAudioSettings | null; timestamp: number } = { data: null, timestamp: 0 };
const AUDIO_SETTINGS_CACHE_TTL_MS = 60 * 1000; // 1 minute

// ═══════════════════════════════════════════════════════════════
// SETTINGS MANAGEMENT
// ═══════════════════════════════════════════════════════════════

/**
 * Fetches audio-specific settings from system settings
 */
export async function getSofiaAudioSettings(supabaseClient: any): Promise<SofiaAudioSettings> {
  const now = Date.now();
  
  // Return cached if still valid
  if (audioSettingsCache.data && (now - audioSettingsCache.timestamp) < AUDIO_SETTINGS_CACHE_TTL_MS) {
    return audioSettingsCache.data;
  }
  
  try {
    const { data, error } = await supabaseClient
      .from('configuracoes_sistema')
      .select('chave, valor')
      .in('chave', [
        'sofia_audio_enabled',
        'sofia_audio_congruence_enabled',
        'sofia_audio_offer_doubts_enabled',
        'sofia_audio_min_chars_congruence',
        'sofia_audio_min_chars_offer',
      ]);
    
    if (error) {
      console.error('[getSofiaAudioSettings] Error loading settings:', error);
      return DEFAULT_AUDIO_SETTINGS;
    }
    
    // Build settings from database values
    const configMap: Record<string, string> = {};
    if (data) {
      for (const row of data) {
        configMap[row.chave] = row.valor;
      }
    }
    
    const settings: SofiaAudioSettings = {
      enabled: configMap.sofia_audio_enabled !== 'false',
      congruenceEnabled: configMap.sofia_audio_congruence_enabled !== 'false',
      offerOnDoubtsEnabled: configMap.sofia_audio_offer_doubts_enabled !== 'false',
      minCharsForCongruence: parseInt(configMap.sofia_audio_min_chars_congruence || '100', 10),
      minCharsForAudioOffer: parseInt(configMap.sofia_audio_min_chars_offer || '350', 10),
    };
    
    audioSettingsCache = { data: settings, timestamp: now };
    console.log('[getSofiaAudioSettings] Loaded audio settings:', settings);
    
    return settings;
  } catch (err) {
    console.error('[getSofiaAudioSettings] Exception:', err);
    return DEFAULT_AUDIO_SETTINGS;
  }
}

/**
 * Clear audio settings cache
 */
export function clearAudioSettingsCache(): void {
  audioSettingsCache = { data: null, timestamp: 0 };
}

// ═══════════════════════════════════════════════════════════════
// DETECTION FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Detects if client is accepting audio offer (response to our offer)
 * Uses dynamic patterns from database
 */
export function detectAudioAcceptance(
  message: string,
  patterns: Map<string, PatternEntry>
): boolean | null {
  // Check for acceptance using dynamic patterns
  if (matchesPatternCategory(message, 'audio_accept', patterns)) {
    console.log('[AUDIO] Audio acceptance detected in message');
    return true;
  }
  
  // Check for rejection using dynamic patterns
  if (matchesPatternCategory(message, 'audio_reject', patterns)) {
    console.log('[AUDIO] Audio rejection detected in message');
    return false;
  }
  
  return null;
}

/**
 * Detects if client is PROACTIVELY requesting audio (not just accepting an offer)
 * Uses dynamic patterns from database
 */
export function detectDirectAudioRequest(
  message: string,
  patterns: Map<string, PatternEntry>
): boolean {
  if (matchesPatternCategory(message, 'audio_request', patterns)) {
    console.log('[AUDIO] Direct audio request detected in message');
    return true;
  }
  
  return false;
}

/**
 * Detects if client has expressed having multiple doubts/questions
 * Uses dynamic patterns from database (category: 'multiple_doubts')
 */
export function hasMultipleDoubts(message: string, patterns?: Map<string, PatternEntry>): boolean {
  return matchesPatternCategory(message, 'multiple_doubts', patterns);
}

/**
 * Detects if message contains complex topic keywords
 * Uses dynamic patterns from database (category: 'complex_topic')
 */
export function hasComplexTopic(message: string, patterns?: Map<string, PatternEntry>): boolean {
  return matchesPatternCategory(message, 'complex_topic', patterns);
}

// ═══════════════════════════════════════════════════════════════
// DECISION FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Determines if Sofia should respond with audio (congruence rule)
 * Rule: If client sent audio → respond with audio
 */
export function shouldRespondWithCongruence(
  isTranscribedAudio: boolean,
  responseLength: number,
  settings: SofiaAudioSettings
): boolean {
  if (!settings.enabled || !settings.congruenceEnabled) {
    return false;
  }
  
  // Congruence: if client sent audio AND response is substantial
  if (isTranscribedAudio && responseLength >= settings.minCharsForCongruence) {
    console.log('[AUDIO] Congruence rule triggered: client sent audio');
    return true;
  }
  
  return false;
}

/**
 * Determines if Sofia should offer audio for this response
 * Uses dynamic patterns from database for detection
 */
export function shouldOfferAudio(
  responseText: string,
  clientMessage: string,
  audioJaOferecido: boolean | null,
  clienteAceitaAudio: boolean | null,
  settings: SofiaAudioSettings,
  patterns?: Map<string, PatternEntry>
): AudioOfferResult {
  // Don't offer if disabled or already offered/decided
  if (!settings.enabled || audioJaOferecido || clienteAceitaAudio !== null) {
    return { shouldOffer: false, reason: null };
  }
  
  // Check if response is long enough
  if (responseText.length >= settings.minCharsForAudioOffer) {
    console.log('[AUDIO] Long response detected, offering audio');
    return { shouldOffer: true, reason: 'long_response' };
  }
  
  // Check if client expressed multiple doubts (uses DB patterns)
  if (settings.offerOnDoubtsEnabled && hasMultipleDoubts(clientMessage, patterns)) {
    console.log('[AUDIO] Multiple doubts detected, offering audio');
    return { shouldOffer: true, reason: 'multiple_doubts' };
  }
  
  // Check if topic is complex (uses DB patterns)
  if (hasComplexTopic(clientMessage, patterns)) {
    console.log('[AUDIO] Complex topic detected, offering audio');
    return { shouldOffer: true, reason: 'complex_topic' };
  }
  
  return { shouldOffer: false, reason: null };
}

/**
 * Get the audio offer message based on reason
 */
import { getRenderedTemplate } from './message-templates.ts';

/**
 * Get the audio offer message based on reason - from database
 */
export function getAudioOfferMessage(reason: 'long_response' | 'multiple_doubts' | 'complex_topic'): string {
  const templateKey = `audio_offer_${reason}`;
  const fallbacks: Record<string, string> = {
    'multiple_doubts': '💡 _Vi que você tem várias dúvidas! Quer que eu te explique por áudio?_',
    'complex_topic': '💡 _Esse assunto é técnico. Quer que eu explique por áudio?_',
    'long_response': '💡 _Quer que eu te explique por áudio?_',
  };
  const message = getRenderedTemplate('audio', templateKey, {}, undefined, fallbacks[reason] || fallbacks['long_response']);
  return '\n\n' + message;
}

// ═══════════════════════════════════════════════════════════════
// SAFE SEND WITH RACE CONDITION CHECK
// ═══════════════════════════════════════════════════════════════

/**
 * Check if conversation is still active before sending audio
 * Prevents race condition where Sofia sends audio after human takes over
 */
export async function safeSendWhatsAppAudio(
  supabaseClient: any,
  conversaId: string,
  phone: string,
  text: string,
  sendAudioFn: (phone: string, text: string) => Promise<boolean>
): Promise<boolean> {
  // Re-check conversation status before sending
  const { data: conversa } = await supabaseClient
    .from('chatbot_conversas')
    .select('sofia_mode')
    .eq('id', conversaId)
    .single();
  
  if (conversa?.sofia_mode === 'paused_for_human') {
    console.log('[AUDIO] Blocked: conversation paused for human');
    return false;
  }
  
  // Send audio
  return await sendAudioFn(phone, text);
}

// ═══════════════════════════════════════════════════════════════
// TEXT PROCESSING FOR AUDIO
// ═══════════════════════════════════════════════════════════════

import { getPatternCache } from './detection-patterns.ts';

/**
 * Strip audio announcement prefix from text
 * Uses dynamic patterns from database (category: audio_announcement_strip)
 */
export function stripAudioAnnouncement(text: string): string {
  const cache = getPatternCache();
  const stripPatterns = cache?.patterns?.get('audio_announcement_strip');
  
  if (stripPatterns?.regexPatterns?.length) {
    for (const rx of stripPatterns.regexPatterns) {
      text = text.replace(rx, '');
    }
  } else {
    // Fallback patterns if DB not loaded
    const fallbackPatterns = [
      /^vou te (?:mandar|enviar) (?:um )?[áa]udio[\.!\?]?\s*/i,
      /^segue (?:o )?[áa]udio[\.!\?]?\s*/i,
      /^te mand(?:o|ando|ei) (?:um )?[áa]udio[\.!\?]?\s*/i,
    ];
    for (const pattern of fallbackPatterns) {
      text = text.replace(pattern, '');
    }
  }
  
  return text.trim();
}

// ═══════════════════════════════════════════════════════════════
// TTS SUITABILITY CHECK - Uses dynamic config
// ═══════════════════════════════════════════════════════════════

interface TTSSuitabilityConfig {
  minTextLength: number;
  linkRatioThreshold: number;
  emojiRatioThreshold: number;
}

const FALLBACK_TTS_SUITABILITY: TTSSuitabilityConfig = {
  minTextLength: 50,
  linkRatioThreshold: 0.5,
  emojiRatioThreshold: 0.2,
};

let ttsSuitabilityCache: { data: TTSSuitabilityConfig | null; timestamp: number } = { data: null, timestamp: 0 };

/**
 * Load TTS suitability config from database
 */
export async function loadTTSSuitabilityConfig(supabaseClient: any): Promise<TTSSuitabilityConfig> {
  const now = Date.now();
  const settings = await getSofiaAudioSettings(supabaseClient);
  
  if (ttsSuitabilityCache.data && (now - ttsSuitabilityCache.timestamp) < AUDIO_SETTINGS_CACHE_TTL_MS) {
    return ttsSuitabilityCache.data;
  }
  
  try {
    const { data, error } = await supabaseClient
      .from('configuracoes_sistema')
      .select('chave, valor')
      .in('chave', [
        'audio_min_text_length_tts',
        'audio_link_ratio_threshold',
        'audio_emoji_ratio_threshold',
      ]);
    
    if (error) {
      return FALLBACK_TTS_SUITABILITY;
    }
    
    const configMap: Record<string, string> = {};
    for (const row of data || []) {
      configMap[row.chave] = row.valor;
    }
    
    const config: TTSSuitabilityConfig = {
      minTextLength: parseInt(configMap.audio_min_text_length_tts || '50', 10),
      linkRatioThreshold: parseFloat(configMap.audio_link_ratio_threshold || '0.5'),
      emojiRatioThreshold: parseFloat(configMap.audio_emoji_ratio_threshold || '0.2'),
    };
    
    ttsSuitabilityCache = { data: config, timestamp: now };
    return config;
  } catch {
    return FALLBACK_TTS_SUITABILITY;
  }
}

function getTTSSuitabilityConfig(): TTSSuitabilityConfig {
  return ttsSuitabilityCache.data || FALLBACK_TTS_SUITABILITY;
}

/**
 * Check if text is suitable for TTS
 * Uses dynamic config from database
 */
export function isSuitableForTTS(text: string): boolean {
  const config = getTTSSuitabilityConfig();
  
  // Too short
  if (text.length < config.minTextLength) {
    return false;
  }
  
  // Contains mostly links or special characters
  const linkPattern = /https?:\/\/[^\s]+/g;
  const withoutLinks = text.replace(linkPattern, '');
  if (withoutLinks.length < text.length * config.linkRatioThreshold) {
    return false;
  }
  
  // Mostly emojis
  const emojiPattern = /[\u{1F300}-\u{1F9FF}]/gu;
  const emojis = text.match(emojiPattern) || [];
  if (emojis.length > text.length * config.emojiRatioThreshold) {
    return false;
  }
  
  return true;
}

// ═══════════════════════════════════════════════════════════════
// AUDIO ORCHESTRATION - Complete flow for audio/text decision
// Extracted from sofia-webhook/index.ts (Phase 17)
// ═══════════════════════════════════════════════════════════════

import { getAudioOfferMessage as getAudioOfferMessageFromTemplates } from './message-templates.ts';

export interface AudioOrchestrationContext {
  supabaseClient: any;
  conversaId: string;
  phone: string;
  cleanMessage: string;
  isTranscribedAudio: boolean;
  messageTextLength: number;
  audioSettings: SofiaAudioSettings;
  handleDirectAudioRequest: boolean;
  clienteAceitaAudio: boolean | null;
  audioOferecido: boolean | null;
  audioPreferenceJustSet: boolean;
  needsHumanEscalation: boolean;
  aiFailedCompletely: boolean;
  audioGloballyEnabled: boolean;
  sendTextFn: (phone: string, message: string) => Promise<boolean>;
  sendAudioFn: (phone: string, text: string) => Promise<boolean>;
}

export interface AudioOrchestrationResult {
  messageSent: boolean;
  audioSent: boolean;
  audioOffered: boolean;
  finalMessage: string;
  blockedByTakeover: boolean;
}

/**
 * Orchestrate audio/text sending decision
 * Consolidates all audio logic: congruence, preference, offer, fallback
 */
export async function orchestrateAudioSending(
  ctx: AudioOrchestrationContext
): Promise<AudioOrchestrationResult> {
  const {
    supabaseClient,
    conversaId,
    phone,
    isTranscribedAudio,
    messageTextLength,
    audioSettings,
    handleDirectAudioRequest,
    clienteAceitaAudio,
    audioOferecido,
    audioPreferenceJustSet,
    needsHumanEscalation,
    aiFailedCompletely,
    audioGloballyEnabled,
    sendTextFn,
    sendAudioFn,
  } = ctx;
  
  let cleanMessage = ctx.cleanMessage;
  let audioSent = false;
  let audioOffered = false;
  let messageSent = false;
  
  // Only process audio if no escalation, no AI failure, and audio globally enabled
  const shouldProcessAudio = !needsHumanEscalation && !aiFailedCompletely && audioGloballyEnabled;
  
  if (shouldProcessAudio) {
    // Congruence rule: If client sent audio → respond with audio
    const shouldRespondWithAudioCongruenceResult = shouldRespondWithCongruence(
      isTranscribedAudio,
      messageTextLength,
      audioSettings
    );
    
    // If client directly requested audio OR already accepted audio OR sent audio (congruence)
    if ((handleDirectAudioRequest || clienteAceitaAudio === true || shouldRespondWithAudioCongruenceResult) && cleanMessage.length >= 50) {
      cleanMessage = stripAudioAnnouncement(cleanMessage);
      
      const audioReason = shouldRespondWithAudioCongruenceResult ? 'congruence (client sent audio)' : 
                          handleDirectAudioRequest ? 'direct request' : 'preference accepted';
      console.log(`[audio-orchestration] Sending voice message (${cleanMessage.length} chars) - reason: ${audioReason}`);
      
      // AUDIO-ONLY: do NOT send the same content by text and then read it
      const voiceSent = await safeSendWhatsAppAudio(supabaseClient, conversaId, phone, cleanMessage, sendAudioFn);
      
      if (voiceSent) {
        audioSent = true;
        messageSent = true;
        console.log('[audio-orchestration] Voice message sent successfully');
        
        // If congruence response, set audio preference for future messages
        if (shouldRespondWithAudioCongruenceResult && clienteAceitaAudio === null) {
          await supabaseClient
            .from('chatbot_conversas')
            .update({ cliente_aceita_audio: true, audio_oferecido: true })
            .eq('id', conversaId);
          console.log('[audio-orchestration] Set audio preference to true due to congruence');
        }
      } else {
        audioSent = false;
        console.log('[audio-orchestration] Voice message failed/blocked, falling back to text');
        
        const fallbackText = `Ops, não consegui enviar o áudio 😅\n\n${cleanMessage}`;
        messageSent = await sendTextFn(phone, fallbackText);
        cleanMessage = fallbackText;
      }
    }
    // Check if we should offer audio (only if no preference set yet)
    else if (!audioPreferenceJustSet) {
      const audioOfferResult = shouldOfferAudio(cleanMessage, '', audioOferecido, clienteAceitaAudio, audioSettings);
      
      if (audioOfferResult.shouldOffer && audioOfferResult.reason) {
        console.log(`[audio-orchestration] Offering audio to client - reason: ${audioOfferResult.reason}`);
        
        // Append audio offer message
        cleanMessage = cleanMessage + getAudioOfferMessageFromTemplates(audioOfferResult.reason);
        audioOffered = true;
        
        messageSent = await sendTextFn(phone, cleanMessage);
        
        if (messageSent) {
          await supabaseClient
            .from('chatbot_conversas')
            .update({ audio_oferecido: true })
            .eq('id', conversaId);
        }
      } else {
        // Normal flow - just send text
        messageSent = await sendTextFn(phone, cleanMessage);
      }
    } else {
      // Normal flow - just send text
      messageSent = await sendTextFn(phone, cleanMessage);
    }
  } else {
    // Normal send for escalation or just-set preference
    messageSent = await sendTextFn(phone, cleanMessage);
  }
  
  return {
    messageSent,
    audioSent,
    audioOffered,
    finalMessage: cleanMessage,
    blockedByTakeover: !messageSent,
  };
}

// ═══════════════════════════════════════════════════════════════
// VOICE MESSAGE SEND FUNCTIONS (Phase 21 - moved from webhook)
// Functions: uploadAudioToStorage, sendWhatsAppAudio, sendVoiceMessage
// ═══════════════════════════════════════════════════════════════

import { generateVoiceAudio as generateVoiceAudioFromTTS } from './tts-client.ts';

export interface ZApiCredentials {
  instanceId: string;
  token: string;
  securityToken?: string;
}

/**
 * Upload audio to Supabase Storage
 */
export async function uploadAudioToStorage(
  audioBase64: string,
  format: 'mp3' | 'ogg',
  supabaseUrl: string,
  supabaseServiceKey: string
): Promise<string | null> {
  try {
    // Convert base64 to binary
    const binaryString = atob(audioBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    // Generate unique filename with timestamp
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const filename = `voice_${timestamp}_${randomSuffix}.${format}`;
    const mimeType = format === 'ogg' ? 'audio/ogg' : 'audio/mpeg';
    
    console.log(`[VOICE] Uploading audio to Storage: ${filename} (${bytes.length} bytes)`);
    
    // Upload to Supabase Storage using REST API
    const uploadUrl = `${supabaseUrl}/storage/v1/object/sofia-audio/${filename}`;
    
    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
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
    
    // Generate public URL
    const publicUrl = `${supabaseUrl}/storage/v1/object/public/sofia-audio/${filename}`;
    console.log(`[VOICE] ✅ Audio uploaded successfully: ${publicUrl}`);
    
    return publicUrl;
  } catch (error) {
    console.error('[VOICE] Exception uploading audio:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

/**
 * Send audio via WhatsApp using Z-API
 */
export async function sendWhatsAppAudioViaZApi(
  phone: string,
  audioBase64: string,
  format: 'mp3' | 'ogg',
  credentials: ZApiCredentials,
  supabaseUrl: string,
  supabaseServiceKey: string
): Promise<boolean> {
  console.log(`[VOICE] === AUDIO SEND START (Z-API Direct Base64) ===`);
  console.log(`[VOICE] Phone: ${phone}`);
  console.log(`[VOICE] Audio base64 length: ${audioBase64.length} chars`);
  console.log(`[VOICE] Audio format: ${format}`);
  
  // Z-API send-audio endpoint
  const sendAudioUrl = `https://api.z-api.io/instances/${credentials.instanceId}/token/${credentials.token}/send-audio`;
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  if (credentials.securityToken) {
    headers['Client-Token'] = credentials.securityToken;
  }
  
  // Format base64 according to Z-API documentation
  const mimeType = format === 'ogg' ? 'audio/ogg' : 'audio/mpeg';
  const base64WithPrefix = audioBase64.startsWith('data:') 
    ? audioBase64 
    : `data:${mimeType};base64,${audioBase64}`;
  
  try {
    // Strategy 1: Send audio directly via base64 (most reliable)
    console.log('[VOICE] Strategy 1: Sending audio directly via base64 to Z-API');
    
    const response1 = await fetch(sendAudioUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        phone: phone,
        audio: base64WithPrefix,
        waveform: true,
      }),
    });

    if (response1.ok) {
      const result = await response1.json();
      console.log('[VOICE] ✅ Z-API audio sent successfully via base64:', JSON.stringify(result).substring(0, 200));
      return true;
    }

    const error1Text = await response1.text();
    console.log(`[VOICE] Strategy 1 failed (${response1.status}): ${error1Text.substring(0, 300)}`);
    
    // Strategy 2: Try uploading to Storage and sending URL (fallback)
    console.log('[VOICE] Strategy 2: Trying upload to Storage + URL');
    
    const audioUrl = await uploadAudioToStorage(audioBase64, format, supabaseUrl, supabaseServiceKey);
    
    if (audioUrl) {
      console.log(`[VOICE] Audio URL for Z-API: ${audioUrl}`);
      
      const response2 = await fetch(sendAudioUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          phone: phone,
          audio: audioUrl,
          waveform: true,
        }),
      });

      if (response2.ok) {
        const result = await response2.json();
        console.log('[VOICE] ✅ Z-API audio sent via URL:', JSON.stringify(result).substring(0, 200));
        return true;
      }

      const error2Text = await response2.text();
      console.log(`[VOICE] Strategy 2 failed (${response2.status}): ${error2Text.substring(0, 300)}`);
    } else {
      console.log('[VOICE] Strategy 2 skipped: Storage upload failed');
    }
    
    // All strategies failed
    console.error('[VOICE] ❌ All Z-API audio send strategies failed');
    return false;
    
  } catch (error) {
    console.error('[VOICE] Exception sending audio via Z-API:', error instanceof Error ? error.message : String(error));
    return false;
  }
}

/**
 * Complete voice message flow: generate TTS → send via WhatsApp
 */
export async function sendVoiceMessageComplete(
  phone: string,
  text: string,
  credentials: ZApiCredentials,
  supabaseUrl: string,
  supabaseServiceKey: string
): Promise<boolean> {
  console.log(`[VOICE] === VOICE MESSAGE START ===`);
  console.log(`[VOICE] Phone: ${phone}`);
  console.log(`[VOICE] Text length: ${text.length} chars`);
  console.log(`[VOICE] Text preview: "${text.substring(0, 80)}..."`);
  
  // Generate voice audio using TTS client
  const audioResult = await generateVoiceAudioFromTTS(text, {
    supabaseUrl,
    supabaseKey: supabaseServiceKey,
  });
  
  if (!audioResult) {
    console.log('[VOICE] Could not generate audio (TTS failed), returning false');
    return false;
  }
  
  console.log(`[VOICE] Audio generated: ${audioResult.size} bytes (${audioResult.format})`);
  
  // Send audio via WhatsApp with correct format
  const success = await sendWhatsAppAudioViaZApi(
    phone,
    audioResult.audioBase64,
    audioResult.format,
    credentials,
    supabaseUrl,
    supabaseServiceKey
  );
  
  if (success) {
    console.log(`[VOICE] ✅ Voice message sent successfully to ${phone}`);
  } else {
  console.log(`[VOICE] ❌ Failed to send voice message to ${phone}`);
  }
  
  return success;
}

// ═══════════════════════════════════════════════════════════════
// SOFIA CAPABILITIES (Phase 27)
// ═══════════════════════════════════════════════════════════════

/**
 * Sofia Capabilities - all configurable features
 */
export interface SofiaCapabilities {
  leituraImagens: boolean;
  leituraPdfs: boolean;
  transcricaoAudio: boolean;
  envioAudio: boolean;
  gerarPropostas: boolean;
  enviarLinks: boolean;
  modoCloser: boolean;
  followups: boolean;
  ofertaMaster: boolean;
}

// Default capabilities
export function getDefaultCapabilities(): SofiaCapabilities {
  return {
    leituraImagens: true,
    leituraPdfs: true,
    transcricaoAudio: true,
    envioAudio: true,
    gerarPropostas: true,
    enviarLinks: true,
    modoCloser: true,
    followups: true,
    ofertaMaster: true,
  };
}

// Cache for capabilities
let capabilitiesCache: { data: SofiaCapabilities | null; timestamp: number } = { data: null, timestamp: 0 };
const CAPABILITIES_CACHE_TTL_MS = 60 * 1000; // 1 minute

/**
 * Fetch Sofia capabilities from system settings
 */
export async function getSofiaCapabilities(supabaseClient: any): Promise<SofiaCapabilities> {
  const now = Date.now();
  if (capabilitiesCache.data && (now - capabilitiesCache.timestamp) < CAPABILITIES_CACHE_TTL_MS) {
    return capabilitiesCache.data;
  }
  
  try {
    const { data, error } = await supabaseClient
      .from('configuracoes_sistema')
      .select('chave, valor')
      .like('chave', 'sofia_%_enabled');

    if (error) {
      console.error('[CAPABILITIES] Error fetching capabilities:', error);
      return getDefaultCapabilities();
    }

    const capabilities: SofiaCapabilities = getDefaultCapabilities();
    const capMap: Record<string, keyof SofiaCapabilities> = {
      'sofia_leitura_imagens_enabled': 'leituraImagens',
      'sofia_leitura_pdfs_enabled': 'leituraPdfs',
      'sofia_transcricao_audio_enabled': 'transcricaoAudio',
      'sofia_audio_enabled': 'envioAudio',
      'sofia_gerar_propostas_enabled': 'gerarPropostas',
      'sofia_enviar_links_enabled': 'enviarLinks',
      'sofia_modo_closer_enabled': 'modoCloser',
      'sofia_followups_enabled': 'followups',
      'sofia_oferta_master_enabled': 'ofertaMaster',
    };

    for (const config of data || []) {
      const key = capMap[config.chave];
      if (key) capabilities[key] = config.valor !== 'false';
    }

    capabilitiesCache = { data: capabilities, timestamp: now };
    return capabilities;
  } catch (err) {
    console.error('[CAPABILITIES] Exception:', err);
    return getDefaultCapabilities();
  }
}

/**
 * Check if audio is globally enabled
 */
export async function isAudioGloballyEnabled(supabaseClient: any): Promise<boolean> {
  return (await getSofiaCapabilities(supabaseClient)).envioAudio;
}

/**
 * Clear capabilities cache (useful for testing or forced refresh)
 */
export function clearCapabilitiesCache(): void {
  capabilitiesCache = { data: null, timestamp: 0 };
}

// ═══════════════════════════════════════════════════════════════
// AUDIO PREFERENCE HANDLER - Phase 37 Extraction
// Handles client audio preference detection and processing
// ═══════════════════════════════════════════════════════════════

export interface AudioPreferenceContext {
  supabase: any;
  conversaId: string;
  phone: string;
  messageText: string;
  conversa: any;
  detectionPatterns: Map<string, PatternEntry>;
  sendWhatsAppMessage: (phone: string, message: string) => Promise<void>;
  sendVoiceMessage: (phone: string, text: string) => Promise<boolean>;
}

export interface AudioPreferenceResult {
  handled: boolean;
  clienteAceitaAudio: boolean | null;
  audioPreferenceJustSet: boolean;
  handleDirectAudioRequest: boolean;
  response?: {
    status: string;
    conversaId: string;
    audioSent?: boolean;
    action?: string;
  };
}

/**
 * Process audio preference from client messages
 * Handles direct audio requests, acceptance, and rejection
 */
export async function processAudioPreference(
  ctx: AudioPreferenceContext
): Promise<AudioPreferenceResult> {
  const existingAudioPref = ctx.conversa?.cliente_aceita_audio as boolean | null;
  const audioOferecido = ctx.conversa?.audio_oferecido as boolean || false;
  
  // Check for DIRECT audio request from client
  const directAudioRequest = detectDirectAudioRequest(ctx.messageText, ctx.detectionPatterns);
  
  let clienteAceitaAudio = existingAudioPref;
  let audioPreferenceJustSet = false;
  let handleDirectAudioRequest = false;
  
  // Check if audio is globally enabled
  const audioGloballyEnabled = await isAudioGloballyEnabled(ctx.supabase);
  
  // Handle DIRECT audio request from client
  if (directAudioRequest && audioGloballyEnabled) {
    console.log('[AUDIO_PREF] Client directly requested audio');
    
    clienteAceitaAudio = true;
    audioPreferenceJustSet = true;
    handleDirectAudioRequest = true;
    
    await ctx.supabase
      .from('chatbot_conversas')
      .update({ cliente_aceita_audio: true, audio_oferecido: true })
      .eq('id', ctx.conversaId);
    
    return {
      handled: false, // Continue processing - don't early return
      clienteAceitaAudio,
      audioPreferenceJustSet,
      handleDirectAudioRequest,
    };
  }
  
  // Check for audio acceptance if we offered audio and don't have preference yet
  if (audioOferecido && existingAudioPref === null) {
    const audioDecision = detectAudioAcceptance(ctx.messageText, ctx.detectionPatterns);
    
    if (audioDecision !== null) {
      clienteAceitaAudio = audioDecision;
      audioPreferenceJustSet = true;
      
      console.log(`[AUDIO_PREF] Audio preference detected: ${audioDecision ? 'ACCEPTED' : 'REJECTED'}`);
      
      // Save the preference immediately
      await ctx.supabase
        .from('chatbot_conversas')
        .update({ cliente_aceita_audio: audioDecision })
        .eq('id', ctx.conversaId);
      
      // If client accepted audio, send the previous response as audio now
      if (audioDecision) {
        // Get the last assistant message to resend as audio
        const { data: lastMessages } = await ctx.supabase
          .from('chatbot_mensagens')
          .select('content')
          .eq('conversa_id', ctx.conversaId)
          .eq('role', 'assistant')
          .order('created_at', { ascending: false })
          .limit(1);
        
        if (lastMessages && lastMessages.length > 0) {
          const lastAssistantContent = lastMessages[0].content;
          // Remove the audio offer part before sending as audio
          const contentForAudioRaw = lastAssistantContent.replace(/\n\n💡 _Percebi que essa explicação ficou.*$/s, '').trim();
          const contentForAudio = stripAudioAnnouncement(contentForAudioRaw);
          
          console.log(`[AUDIO_PREF] Sending previous response as audio (${contentForAudio.length} chars)`);
          
          // Try to send audio - CHECK THE RESULT
          const audioSentSuccess = await ctx.sendVoiceMessage(ctx.phone, contentForAudio);
          
          if (audioSentSuccess) {
            await ctx.supabase.from('chatbot_mensagens').insert({
              conversa_id: ctx.conversaId,
              role: 'assistant',
              content: '[🎧 Áudio enviado com sucesso]',
            });
            console.log('[AUDIO_PREF] Audio sent successfully after acceptance');
          } else {
            console.log('[AUDIO_PREF] Audio FAILED after acceptance, sending text fallback');
            
            const fallbackMessage = `Ops, não consegui enviar o áudio! 😅 Vou te passar por escrito:\n\n${contentForAudio}`;
            
            await ctx.sendWhatsAppMessage(ctx.phone, fallbackMessage);
            
            await ctx.supabase.from('chatbot_mensagens').insert({
              conversa_id: ctx.conversaId,
              role: 'assistant',
              content: `[⚠️ Áudio falhou - enviado por texto]\n\n${contentForAudio}`,
            });
          }
          
          // Update conversation state
          await ctx.supabase
            .from('chatbot_conversas')
            .update({
              last_message_at: new Date().toISOString(),
              last_sofia_message_at: new Date().toISOString(),
            })
            .eq('id', ctx.conversaId);
          
          const action = audioSentSuccess ? 'audio_sent_on_acceptance' : 'audio_failed_on_acceptance';
          
          return {
            handled: true,
            clienteAceitaAudio,
            audioPreferenceJustSet,
            handleDirectAudioRequest,
            response: {
              status: 'success',
              conversaId: ctx.conversaId,
              audioSent: audioSentSuccess,
              action,
            },
          };
        }
      } else {
        // Client rejected audio, acknowledge and continue
        await ctx.sendWhatsAppMessage(ctx.phone, 'Sem problemas! 📝 Vou continuar por texto mesmo.');
        
        await ctx.supabase.from('chatbot_mensagens').insert({
          conversa_id: ctx.conversaId,
          role: 'assistant',
          content: 'Sem problemas! 📝 Vou continuar por texto mesmo.',
        });
        
        // Continue with normal processing - don't return, let the conversation flow
      }
    }
  }
  
  return {
    handled: false,
    clienteAceitaAudio,
    audioPreferenceJustSet,
    handleDirectAudioRequest,
  };
}