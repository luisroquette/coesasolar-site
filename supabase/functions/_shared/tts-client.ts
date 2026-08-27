/**
 * TTS Client - Shared Text-to-Speech module
 * 
 * ZERO HARDCODE: All configs loaded from configuracoes_sistema
 * 
 * Provides unified TTS generation with:
 * - ElevenLabs primary (multilingual_v2)
 * - OpenAI fallback (tts-1)
 * - Automatic fallback tracking and auto-disable
 * - Text sanitization for voice output
 * 
 * @module _shared/tts-client
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface TTSResult {
  audioBase64: string;
  size: number;
  format: 'ogg' | 'mp3';
}

export interface TTSConfig {
  elevenLabsApiKey?: string | null;
  openaiApiKey?: string | null;
  voiceId?: string;
  supabaseUrl?: string;
  supabaseKey?: string;
}

export interface FallbackEvent {
  reason: 'quota_exceeded' | 'api_error' | 'timeout';
  provider: 'elevenlabs';
  timestamp: string;
}

// ═══════════════════════════════════════════════════════════════
// DYNAMIC CONFIG
// ═══════════════════════════════════════════════════════════════

interface TTSConfigDynamic {
  defaultVoiceId: string;
  outputFormat: string;
  fallbackThreshold: number;
  fallbackWindowMinutes: number;
  primaryModel: string;
  turboModel: string;
  openaiModel: string;
  openaiVoice: string;
  minTextLength: number;
  shortenMaxLength: number;
  stability: number;
  similarityBoost: number;
  style: number;
  useSpeakerBoost: boolean;
}

let cachedTTSConfig: TTSConfigDynamic | null = null;
let ttsConfigLoadedAt = 0;
const CONFIG_CACHE_TTL_MS = 5 * 60 * 1000;

// Fallback defaults
const FALLBACK_TTS_CONFIG: TTSConfigDynamic = {
  defaultVoiceId: 'EXAVITQu4vr4xnSDxMaL',
  outputFormat: 'mp3_44100_128',
  fallbackThreshold: 2,
  fallbackWindowMinutes: 30,
  primaryModel: 'eleven_multilingual_v2',
  turboModel: 'eleven_turbo_v2_5',
  openaiModel: 'tts-1',
  openaiVoice: 'nova',
  minTextLength: 10,
  shortenMaxLength: 120,
  stability: 0.5,
  similarityBoost: 0.75,
  style: 0.3,
  useSpeakerBoost: true,
};

/**
 * Load TTS config from database
 */
export async function loadTTSConfig(supabase: any): Promise<TTSConfigDynamic> {
  const now = Date.now();
  if (cachedTTSConfig && (now - ttsConfigLoadedAt) < CONFIG_CACHE_TTL_MS) {
    return cachedTTSConfig;
  }

  try {
    const { data, error } = await supabase
      .from('configuracoes_sistema')
      .select('chave, valor')
      .in('chave', [
        'tts_default_voice_id',
        'tts_elevenlabs_output_format',
        'tts_fallback_threshold',
        'tts_fallback_window_minutes',
        'tts_elevenlabs_primary_model',
        'tts_elevenlabs_turbo_model',
        'tts_openai_model',
        'tts_openai_voice',
        'tts_min_text_length',
        'tts_shorten_max_length',
        'tts_stability',
        'tts_similarity_boost',
        'tts_style',
        'tts_use_speaker_boost',
      ]);

    if (error) {
      console.warn('[TTS] Error loading config:', error.message);
      return FALLBACK_TTS_CONFIG;
    }

    const configMap = new Map<string, string>();
    for (const row of data || []) {
      configMap.set(row.chave, row.valor);
    }

    cachedTTSConfig = {
      defaultVoiceId: configMap.get('tts_default_voice_id') || FALLBACK_TTS_CONFIG.defaultVoiceId,
      outputFormat: configMap.get('tts_elevenlabs_output_format') || FALLBACK_TTS_CONFIG.outputFormat,
      fallbackThreshold: parseInt(configMap.get('tts_fallback_threshold') || '', 10) || FALLBACK_TTS_CONFIG.fallbackThreshold,
      fallbackWindowMinutes: parseInt(configMap.get('tts_fallback_window_minutes') || '', 10) || FALLBACK_TTS_CONFIG.fallbackWindowMinutes,
      primaryModel: configMap.get('tts_elevenlabs_primary_model') || FALLBACK_TTS_CONFIG.primaryModel,
      turboModel: configMap.get('tts_elevenlabs_turbo_model') || FALLBACK_TTS_CONFIG.turboModel,
      openaiModel: configMap.get('tts_openai_model') || FALLBACK_TTS_CONFIG.openaiModel,
      openaiVoice: configMap.get('tts_openai_voice') || FALLBACK_TTS_CONFIG.openaiVoice,
      minTextLength: parseInt(configMap.get('tts_min_text_length') || '', 10) || FALLBACK_TTS_CONFIG.minTextLength,
      shortenMaxLength: parseInt(configMap.get('tts_shorten_max_length') || '', 10) || FALLBACK_TTS_CONFIG.shortenMaxLength,
      stability: parseFloat(configMap.get('tts_stability') || '') || FALLBACK_TTS_CONFIG.stability,
      similarityBoost: parseFloat(configMap.get('tts_similarity_boost') || '') || FALLBACK_TTS_CONFIG.similarityBoost,
      style: parseFloat(configMap.get('tts_style') || '') || FALLBACK_TTS_CONFIG.style,
      useSpeakerBoost: configMap.get('tts_use_speaker_boost') !== 'false',
    };

    ttsConfigLoadedAt = now;
    console.log('[TTS] Config loaded from DB');
    return cachedTTSConfig;
  } catch (err) {
    console.warn('[TTS] Failed to load config:', err);
    return FALLBACK_TTS_CONFIG;
  }
}

/**
 * Get cached TTS config (sync)
 */
export function getTTSConfig(): TTSConfigDynamic {
  return cachedTTSConfig || FALLBACK_TTS_CONFIG;
}

/**
 * Clear cached config
 */
export function clearTTSConfigCache(): void {
  cachedTTSConfig = null;
  ttsConfigLoadedAt = 0;
}

// ═══════════════════════════════════════════════════════════════
// TEXT SANITIZATION
// ═══════════════════════════════════════════════════════════════

/**
 * Sanitize text for TTS - remove markdown and special characters
 */
export function sanitizeTextForTTS(text: string): string {
  return text
    .replace(/\*([^*]+)\*/g, '$1') // Remove bold markdown
    .replace(/_([^_]+)_/g, '$1') // Remove italic markdown
    .replace(/~([^~]+)~/g, '$1') // Remove strikethrough
    .replace(/```[^`]+```/g, '') // Remove code blocks
    .replace(/\[ESCALAR_HUMANO\]/gi, '') // Remove escalation tags
    .replace(/\[.*?\]/g, '') // Remove other tags
    .replace(/https?:\/\/[^\s]+/g, '') // Remove URLs
    .trim();
}

/**
 * Shorten text for TTS while preserving natural sentence boundaries
 */
export function shortenForTTS(input: string, maxLength?: number): string {
  const config = getTTSConfig();
  const max = maxLength || config.shortenMaxLength;
  
  if (input.length <= max) return input;
  
  const slice = input.slice(0, max);
  
  // Try to cut at sentence boundary
  const lastStop = Math.max(
    slice.lastIndexOf('.'),
    slice.lastIndexOf('!'),
    slice.lastIndexOf('?')
  );
  if (lastStop >= 40) return slice.slice(0, lastStop + 1).trim();
  
  // Try to cut at clause boundary
  const lastComma = Math.max(
    slice.lastIndexOf(','),
    slice.lastIndexOf(';')
  );
  if (lastComma >= 40) return slice.slice(0, lastComma + 1).trim();
  
  return slice.trim();
}

// ═══════════════════════════════════════════════════════════════
// ARRAY BUFFER TO BASE64
// ═══════════════════════════════════════════════════════════════

/**
 * Convert ArrayBuffer to base64 string
 * Uses chunked processing to avoid stack overflow on large buffers
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 8192;
  
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  
  return btoa(binary);
}

// ═══════════════════════════════════════════════════════════════
// FALLBACK TRACKING
// ═══════════════════════════════════════════════════════════════

/**
 * Register ElevenLabs fallback event in database for admin alerting.
 * Auto-disables audio after threshold failures within time window.
 */
export async function registerElevenLabsFallback(
  supabaseUrl: string,
  supabaseKey: string
): Promise<void> {
  try {
    const config = getTTSConfig();
    const supabaseAdmin = createClient(supabaseUrl, supabaseKey);
    const now = new Date();
    const nowIso = now.toISOString();
    
    // Fetch current fallback state
    const { data: configs } = await supabaseAdmin
      .from('configuracoes_sistema')
      .select('chave, valor')
      .in('chave', ['elevenlabs_fallback_count', 'elevenlabs_fallback_window_start', 'sofia_audio_enabled']);
    
    const countConfig = configs?.find((c: { chave: string; valor: string }) => c.chave === 'elevenlabs_fallback_count');
    const windowStartConfig = configs?.find((c: { chave: string; valor: string }) => c.chave === 'elevenlabs_fallback_window_start');
    const audioEnabledConfig = configs?.find((c: { chave: string; valor: string }) => c.chave === 'sofia_audio_enabled');
    
    let currentCount = parseInt(countConfig?.valor || '0', 10) || 0;
    const windowStart = windowStartConfig?.valor ? new Date(windowStartConfig.valor) : null;
    
    // Check if we're within the time window
    const windowExpired = !windowStart || (now.getTime() - windowStart.getTime() > config.fallbackWindowMinutes * 60 * 1000);
    
    if (windowExpired) {
      // Start new window
      currentCount = 1;
      console.log(`[TTS] Starting new fallback window. Count: ${currentCount}`);
      
      await supabaseAdmin
        .from('configuracoes_sistema')
        .update({ valor: nowIso, updated_at: nowIso })
        .eq('chave', 'elevenlabs_fallback_window_start');
    } else {
      // Increment count within window
      currentCount++;
      console.log(`[TTS] Fallback within window. Count: ${currentCount}/${config.fallbackThreshold}`);
    }
    
    // Update count
    await supabaseAdmin
      .from('configuracoes_sistema')
      .update({ valor: currentCount.toString(), updated_at: nowIso })
      .eq('chave', 'elevenlabs_fallback_count');
    
    // Update fallback timestamp
    await supabaseAdmin
      .from('configuracoes_sistema')
      .update({ valor: nowIso, updated_at: nowIso })
      .eq('chave', 'elevenlabs_fallback_at');
    
    // Check if threshold reached - auto-disable audio
    if (currentCount >= config.fallbackThreshold) {
      console.log(`[TTS] ⚠️ Fallback threshold reached (${currentCount}/${config.fallbackThreshold}). Auto-disabling audio.`);
      
      // Only disable if currently enabled
      if (audioEnabledConfig?.valor !== 'false') {
        await supabaseAdmin
          .from('configuracoes_sistema')
          .update({ valor: 'false', updated_at: nowIso })
          .eq('chave', 'sofia_audio_enabled');
        
        console.log('[TTS] ✅ Audio auto-disabled to prevent further failed attempts');
      }
      
      // Set fallback active flag for admin alert
      await supabaseAdmin
        .from('configuracoes_sistema')
        .update({ valor: 'true', updated_at: nowIso })
        .eq('chave', 'elevenlabs_fallback_active');
      
      // Reset count after auto-disable
      await supabaseAdmin
        .from('configuracoes_sistema')
        .update({ valor: '0', updated_at: nowIso })
        .eq('chave', 'elevenlabs_fallback_count');
      
      // Send email notification to admins
      try {
        console.log('[TTS] Sending email notification to admins about audio auto-disable');
        await fetch(`${supabaseUrl}/functions/v1/send-notification-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({
            title: '⚠️ Áudio Automático Desativado',
            message: `O envio de áudio da sofIA foi desativado automaticamente após ${config.fallbackThreshold} falhas do ElevenLabs em ${config.fallbackWindowMinutes} minutos. Possível falta de créditos. Verifique o painel ElevenLabs e reative manualmente quando os créditos forem recarregados.`,
            type: 'warning',
            entity_type: 'sistema',
          }),
        });
        console.log('[TTS] ✅ Admin email notification sent');
      } catch (emailError) {
        console.error('[TTS] Failed to send admin email notification:', emailError);
      }
    }
    
    console.log('[TTS] Registered ElevenLabs fallback event in database');
  } catch (error) {
    console.error('[TTS] Failed to register fallback event:', error instanceof Error ? error.message : String(error));
  }
}

// ═══════════════════════════════════════════════════════════════
// TTS PROVIDERS
// ═══════════════════════════════════════════════════════════════

/**
 * Generate audio using OpenAI TTS API
 */
async function generateOpenAIAudio(
  text: string,
  apiKey: string
): Promise<ArrayBuffer | null> {
  const config = getTTSConfig();
  console.log(`[TTS] Trying OpenAI TTS for ${text.length} chars`);
  
  try {
    const response = await fetch('https://openrouter.ai/api/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.openaiModel.includes('/') ? config.openaiModel : `openai/${config.openaiModel}`,
        input: text,
        voice: config.openaiVoice,
        response_format: 'mp3',
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[TTS] OpenAI TTS error: HTTP ${response.status} - ${errText.substring(0, 300)}`);
      return null;
    }

    const audioData = await response.arrayBuffer();
    console.log(`[TTS] OpenAI TTS success: ${audioData.byteLength} bytes`);
    return audioData;
  } catch (err) {
    console.error('[TTS] OpenAI TTS exception:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * Generate audio using ElevenLabs TTS API
 */
async function generateElevenLabsAudio(
  text: string,
  apiKey: string,
  voiceId: string,
  modelId?: string
): Promise<{ data: ArrayBuffer | null; error?: string; isQuotaError?: boolean }> {
  const config = getTTSConfig();
  const model = modelId || config.primaryModel;
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=${config.outputFormat}`;
  
  console.log(`[TTS] ElevenLabs request URL: ${url}`);
  console.log(`[TTS] ElevenLabs model: ${model}, text length: ${text.length}`);
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: model,
        voice_settings: {
          stability: config.stability,
          similarity_boost: config.similarityBoost,
          style: config.style,
          use_speaker_boost: config.useSpeakerBoost,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[TTS] ElevenLabs API error: HTTP ${response.status} - ${errorText.substring(0, 500)}`);
      
      const isQuotaExceeded = errorText.includes('quota_exceeded') || 
                              errorText.includes('credits remaining') || 
                              response.status === 401;
      
      return { 
        data: null, 
        error: errorText.substring(0, 300),
        isQuotaError: isQuotaExceeded 
      };
    }

    const audioBuffer = await response.arrayBuffer();
    
    if (!audioBuffer || audioBuffer.byteLength === 0) {
      console.error('[TTS] ElevenLabs returned empty audio buffer');
      return { data: null, error: 'Empty audio buffer' };
    }
    
    console.log(`[TTS] ✅ ElevenLabs audio: ${audioBuffer.byteLength} bytes`);
    return { data: audioBuffer };
  } catch (err) {
    console.error('[TTS] ElevenLabs exception:', err instanceof Error ? err.message : String(err));
    return { data: null, error: err instanceof Error ? err.message : String(err) };
  }
}

// ═══════════════════════════════════════════════════════════════
// MAIN TTS FUNCTION
// ═══════════════════════════════════════════════════════════════

/**
 * Generate voice audio from text using ElevenLabs (primary) or OpenAI (fallback)
 * 
 * @param text - Text to convert to speech
 * @param configInput - TTS configuration (API keys, voice ID, etc.)
 * @returns TTSResult with base64 audio, size, and format, or null if generation failed
 */
export async function generateVoiceAudio(
  text: string,
  configInput: TTSConfig = {}
): Promise<TTSResult | null> {
  const config = getTTSConfig();
  console.log('[TTS] === AUDIO GENERATION START ===');
  console.log(`[TTS] Input text length: ${text.length} chars`);
  
  const elevenLabsApiKey = configInput.elevenLabsApiKey || Deno.env.get('ELEVENLABS_API_KEY');
  const openaiApiKey = configInput.openaiApiKey || Deno.env.get('COESASOLAR_OPENROUTER_API_KEY') || Deno.env.get('OPENROUTER_API_KEY');
  const voiceId = configInput.voiceId || Deno.env.get('SOFIA_VOICE_ID') || config.defaultVoiceId;
  const supabaseUrl = configInput.supabaseUrl || Deno.env.get('SUPABASE_URL');
  const supabaseKey = configInput.supabaseKey || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  
  console.log(`[TTS] ELEVENLABS_API_KEY configured: ${!!elevenLabsApiKey}`);
  console.log(`[TTS] OpenRouter key configured: ${!!openaiApiKey}`);
  console.log(`[TTS] Voice ID: ${voiceId}`);
  
  if (!elevenLabsApiKey && !openaiApiKey) {
    console.log('[TTS] ❌ No TTS API keys configured (ElevenLabs or OpenAI), skipping voice generation');
    return null;
  }
  
  // Sanitize text for TTS
  const sanitizedText = sanitizeTextForTTS(text);
  
  if (!sanitizedText || sanitizedText.length < config.minTextLength) {
    console.log('[TTS] Text too short after sanitization, skipping audio generation');
    return null;
  }
  
  console.log(`[TTS] Sanitized text (${sanitizedText.length} chars): "${sanitizedText.substring(0, 100)}..."`);
  
  try {
    // If ElevenLabs not configured, try OpenAI directly
    if (!elevenLabsApiKey) {
      console.log('[TTS] ElevenLabs not configured, trying OpenAI TTS directly');
      const openaiAudio = await generateOpenAIAudio(sanitizedText, openaiApiKey!);
      if (openaiAudio) {
        return { 
          audioBase64: arrayBufferToBase64(openaiAudio), 
          size: openaiAudio.byteLength, 
          format: 'mp3' 
        };
      }
      console.log('[TTS] OpenAI TTS failed, no audio generated');
      return null;
    }
    
    // Try ElevenLabs first with best quality model
    let result = await generateElevenLabsAudio(
      sanitizedText,
      elevenLabsApiKey,
      voiceId,
      config.primaryModel
    );
    
    // Handle quota errors with retry
    if (!result.data && result.isQuotaError) {
      // Try shorter text with turbo model
      const shortText = shortenForTTS(sanitizedText);
      if (shortText.length < sanitizedText.length) {
        console.log(`[TTS] Quota exceeded; retrying with shorter text (${shortText.length} chars)`);
        result = await generateElevenLabsAudio(
          shortText,
          elevenLabsApiKey,
          voiceId,
          config.turboModel
        );
      }
    }
    
    // If ElevenLabs succeeded, return the audio
    if (result.data) {
      return {
        audioBase64: arrayBufferToBase64(result.data),
        size: result.data.byteLength,
        format: 'mp3'
      };
    }
    
    // ElevenLabs failed - register fallback and try OpenAI
    console.log('[TTS] ElevenLabs failed, falling back to OpenAI TTS');
    
    if (supabaseUrl && supabaseKey) {
      await registerElevenLabsFallback(supabaseUrl, supabaseKey);
    }
    
    if (openaiApiKey) {
      const openaiAudio = await generateOpenAIAudio(sanitizedText, openaiApiKey);
      if (openaiAudio) {
        console.log(`[TTS] OpenAI fallback audio: ${openaiAudio.byteLength} bytes (MP3)`);
        return {
          audioBase64: arrayBufferToBase64(openaiAudio),
          size: openaiAudio.byteLength,
          format: 'mp3'
        };
      }
    }
    
    console.log('[TTS] All TTS providers failed, no audio generated');
    return null;
  } catch (error) {
    console.error('[TTS] Error generating audio:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// CONVENIENCE EXPORTS
// ═══════════════════════════════════════════════════════════════

// Legacy exports for backward compatibility
export const DEFAULT_VOICE_ID = FALLBACK_TTS_CONFIG.defaultVoiceId;
export const ELEVENLABS_OUTPUT_FORMAT = FALLBACK_TTS_CONFIG.outputFormat;
export const FALLBACK_THRESHOLD = FALLBACK_TTS_CONFIG.fallbackThreshold;
export const FALLBACK_WINDOW_MINUTES = FALLBACK_TTS_CONFIG.fallbackWindowMinutes;
