/**
 * Media Handler - Centralized media processing for WhatsApp
 * Handles audio transcription, image analysis, and PDF analysis via Gemini
 * 
 * ZERO HARDCODE: All configs, patterns and prompts loaded from database
 * 
 * Used by: sofia-webhook, maria-webhook, and other agent webhooks
 */

import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { getPatternCache, loadDetectionPatterns } from './detection-patterns.ts';
import { getRenderedTemplate, loadMessageTemplates } from './message-templates.ts';

// Re-export types for consumers
export interface MediaAnalysisResult {
  analysis: string;
  base64Data: string;
  mimeType: string;
  isInvoice: boolean;
  /** Indicates if GD1/compensation was detected (competitor) */
  hasGD1Compensation?: boolean;
  /** Detected GD1/compensation terms */
  gd1DetectedTerms?: string[];
  /** Detected competitor company name */
  competitorName?: string | null;
}

export interface TranscriptionResult {
  success: boolean;
  transcription: string | null;
  isInaudible: boolean;
}

// ============ DYNAMIC CONFIG ============
interface MediaConfig {
  gatewayUrl: string;
  transcriptionModel: string;
  transcriptionFallbackModel: string;
  analysisModel: string;
  imageMaxSizeMB: number;
  pdfMaxSizeMB: number;
  audioMaxTokens: number;
  imageMaxTokens: number;
  pdfMaxTokens: number;
  transcriptionTimeoutMs: number;
  transcriptionMaxRetries: number;
}

let cachedMediaConfig: MediaConfig | null = null;
let mediaConfigLoadedAt = 0;
const CONFIG_CACHE_TTL_MS = 5 * 60 * 1000;

// Fallback defaults
const FALLBACK_MEDIA_CONFIG: MediaConfig = {
  gatewayUrl: 'https://openrouter.ai/api/v1/chat/completions',
  transcriptionModel: 'google/gemini-2.5-flash',
  transcriptionFallbackModel: 'openai/gpt-5-mini', // Fallback model for retry
  analysisModel: 'google/gemini-2.5-flash',
  imageMaxSizeMB: 15,
  pdfMaxSizeMB: 10,
  audioMaxTokens: 1000,
  imageMaxTokens: 1500,
  pdfMaxTokens: 2000,
  transcriptionTimeoutMs: 30000, // 30 seconds default timeout
  transcriptionMaxRetries: 3,
};

/**
 * Load media config from database
 */
export async function loadMediaConfig(supabase: any): Promise<MediaConfig> {
  const now = Date.now();
  if (cachedMediaConfig && (now - mediaConfigLoadedAt) < CONFIG_CACHE_TTL_MS) {
    return cachedMediaConfig;
  }

  try {
    const { data, error } = await supabase
      .from('configuracoes_sistema')
      .select('chave, valor')
      .in('chave', [
        'ai_gateway_url',
        'media_transcription_model',
        'media_transcription_fallback_model',
        'media_analysis_model',
        'media_image_max_size_mb',
        'media_pdf_max_size_mb',
        'media_audio_max_tokens',
        'media_image_max_tokens',
        'media_pdf_max_tokens',
        'media_transcription_timeout_ms',
        'media_transcription_max_retries',
      ]);

    if (error) {
      console.warn('[MEDIA] Error loading config:', error.message);
      return FALLBACK_MEDIA_CONFIG;
    }

    const configMap = new Map<string, string>();
    for (const row of data || []) {
      configMap.set(row.chave, row.valor);
    }

    cachedMediaConfig = {
      gatewayUrl: configMap.get('ai_gateway_url') || FALLBACK_MEDIA_CONFIG.gatewayUrl,
      transcriptionModel: configMap.get('media_transcription_model') || FALLBACK_MEDIA_CONFIG.transcriptionModel,
      transcriptionFallbackModel: configMap.get('media_transcription_fallback_model') || FALLBACK_MEDIA_CONFIG.transcriptionFallbackModel,
      analysisModel: configMap.get('media_analysis_model') || FALLBACK_MEDIA_CONFIG.analysisModel,
      imageMaxSizeMB: parseInt(configMap.get('media_image_max_size_mb') || '', 10) || FALLBACK_MEDIA_CONFIG.imageMaxSizeMB,
      pdfMaxSizeMB: parseInt(configMap.get('media_pdf_max_size_mb') || '', 10) || FALLBACK_MEDIA_CONFIG.pdfMaxSizeMB,
      audioMaxTokens: parseInt(configMap.get('media_audio_max_tokens') || '', 10) || FALLBACK_MEDIA_CONFIG.audioMaxTokens,
      imageMaxTokens: parseInt(configMap.get('media_image_max_tokens') || '', 10) || FALLBACK_MEDIA_CONFIG.imageMaxTokens,
      pdfMaxTokens: parseInt(configMap.get('media_pdf_max_tokens') || '', 10) || FALLBACK_MEDIA_CONFIG.pdfMaxTokens,
      transcriptionTimeoutMs: parseInt(configMap.get('media_transcription_timeout_ms') || '', 10) || FALLBACK_MEDIA_CONFIG.transcriptionTimeoutMs,
      transcriptionMaxRetries: parseInt(configMap.get('media_transcription_max_retries') || '', 10) || FALLBACK_MEDIA_CONFIG.transcriptionMaxRetries,
    };

    mediaConfigLoadedAt = now;
    console.log('[MEDIA] Config loaded from DB');
    return cachedMediaConfig;
  } catch (err) {
    console.warn('[MEDIA] Failed to load config:', err);
    return FALLBACK_MEDIA_CONFIG;
  }
}

/**
 * Get cached media config (sync)
 */
export function getMediaConfig(): MediaConfig {
  return cachedMediaConfig || FALLBACK_MEDIA_CONFIG;
}

/**
 * Extract assistant text from AI response
 */
function extractAssistantText(data: any): string | null {
  if (!data?.choices?.[0]?.message?.content) return null;
  const content = data.choices[0].message.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    const textPart = content.find((p: any) => p.type === 'text');
    return textPart?.text?.trim() || null;
  }
  return null;
}

/**
 * Get hallucination patterns from cache or fallback
 */
function getHallucinationPatterns(): RegExp[] {
  const cache = getPatternCache();
  if (cache) {
    const entry = cache.patterns.get('audio_hallucination');
    if (entry && entry.regexPatterns.length > 0) {
      return entry.regexPatterns;
    }
  }
  
  // Fallback patterns
  return [
    /^\(música\)/i,
    /^para responder/i,
    /^eu te amo/i,
    /^obrigado por assistir/i,
    /^inscreva-se/i,
    /^legendas/i,
  ];
}

/**
 * Get invoice detection keywords from cache or fallback
 */
function getInvoiceKeywords(): string[] {
  const cache = getPatternCache();
  if (cache) {
    const entry = cache.patterns.get('invoice_detection');
    if (entry && entry.keywords.length > 0) {
      return entry.keywords;
    }
  }
  
  // Fallback keywords
  return [
    'fatura de energia', 'conta de luz', 'kwh', 'consumo de energia', 'tarifa de energia',
    'distribuidora', 'cemig', 'copel', 'cpfl', 'enel', 'energisa', 'equatorial',
    'coelba', 'celpe', 'eletropaulo', 'light', 'instalação', 'tusd', 'te ',
    'bandeira tarifária', 'pis/cofins', 'icms',
  ];
}

/**
 * Get document detection keywords from cache
 */
function getDocumentKeywords(category: string): string[] {
  const cache = getPatternCache();
  if (cache) {
    const entry = cache.patterns.get(category);
    if (entry && entry.keywords.length > 0) {
      return entry.keywords;
    }
  }
  return [];
}

/**
 * Detect if analysis indicates an energy invoice
 */
export function isEnergyInvoice(analysis: string): boolean {
  const lowerAnalysis = analysis.toLowerCase();
  const invoiceKeywords = getInvoiceKeywords();
  return invoiceKeywords.some(keyword => lowerAnalysis.includes(keyword));
}

/**
 * GD1/Compensation keywords for competitor detection
 */
const GD1_COMPENSATION_KEYWORDS = [
  'energia compensada gd',
  'energia compensada gdi',
  'energia compensada gd1',
  'energia compensada gdii',
  'energia compensada gd2',
  'compensação de energia',
  'compensação gd',
  'sistema de compensação',
  'unidade faz parte de sistema de compensação',
  'crédito de energia',
  'créditos de energia',
  'energia injetada',
  'geração distribuída',
  'autoconsumo remoto',
  'quota parte',
  'quota-parte',
  'saldo anterior gd',
  'saldo a expirar',
];

/**
 * Known competitor company names
 */
const COMPETITOR_COMPANY_NAMES = [
  'órigo', 'origo', 'órigo energia',
  'engie', 'engie brasil',
  'flora energia', 'flora',
  'sun mobi', 'sunmobi',
  'reverde', 'reverde energia',
  'nexway', 'nexway energia',
  'raízen', 'raizen',
  'copel gd', 'copel energia solar',
  'enel x', 'enelx',
  'sungrow', 'sun grow',
  'ecori', 'ecori energia',
  'solatio', 'solatio energia',
  'atlas renewable', 'atlas',
  'canadian solar',
  'omega energia', 'omega',
  'voltalia',
  'statkraft',
  'comerc',
  'tradener',
  'power curva',
];

/**
 * Detect if invoice analysis indicates GD1/compensation (client already in another company's system)
 */
export function detectGD1Compensation(analysis: string): {
  hasGD1: boolean;
  detectedTerms: string[];
  competitorName: string | null;
} {
  if (!analysis) return { hasGD1: false, detectedTerms: [], competitorName: null };
  
  const lowerAnalysis = analysis.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  
  const detectedTerms: string[] = [];
  let competitorName: string | null = null;
  
  // Check for GD1/compensation keywords
  for (const keyword of GD1_COMPENSATION_KEYWORDS) {
    const normalizedKeyword = keyword.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    
    if (lowerAnalysis.includes(normalizedKeyword)) {
      detectedTerms.push(keyword);
    }
  }
  
  // Check for competitor company names
  for (const company of COMPETITOR_COMPANY_NAMES) {
    const normalizedCompany = company.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    
    if (lowerAnalysis.includes(normalizedCompany)) {
      competitorName = company;
      break;
    }
  }
  
  // Also check for explicit AI detection markers
  if (lowerAnalysis.includes('energia compensada detectada') || 
      lowerAnalysis.includes('concorrente detectado') ||
      lowerAnalysis.includes('⚠️ energia compensada') ||
      lowerAnalysis.includes('⚠️ concorrente')) {
    if (!detectedTerms.includes('energia compensada gd')) {
      detectedTerms.push('energia compensada gd');
    }
  }
  
  const hasGD1 = detectedTerms.length > 0 || competitorName !== null;
  
  if (hasGD1) {
    console.log(`[MEDIA] GD1/Compensation detected! Terms: ${detectedTerms.join(', ')}, Competitor: ${competitorName || 'none'}`);
  }
  
  return { hasGD1, detectedTerms, competitorName };
}

/**
 * Get inaudible message from templates
 */
function getInaudibleMessage(): string {
  return getRenderedTemplate('media_analysis', 'audio_inaudible', {}) || '[ÁUDIO INAUDÍVEL]';
}

/**
 * Sleep helper for retry backoff
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch with timeout support
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Call transcription API with a specific model
 * Returns { success, transcription, error }
 */
async function callTranscriptionAPI(
  config: MediaConfig,
  model: string,
  base64Audio: string,
  mimeType: string,
  transcriptionPrompt: string,
  apiKey: string,
  attemptNumber: number
): Promise<{ success: boolean; transcription: string | null; error?: string }> {
  const startTime = Date.now();
  
  try {
    console.log(`[AUDIO] Attempt ${attemptNumber} with model: ${model} (timeout: ${config.transcriptionTimeoutMs}ms)`);
    
    const response = await fetchWithTimeout(
      config.gatewayUrl,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: transcriptionPrompt,
                },
                {
                  type: 'file',
                  file: {
                    file_data: `data:${mimeType.split(';')[0].trim()};base64,${base64Audio}`,
                  },
                },
              ],
            },
          ],
          max_completion_tokens: config.audioMaxTokens,
        }),
      },
      config.transcriptionTimeoutMs
    );

    const elapsed = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[AUDIO] API error (${model}, ${elapsed}ms): ${response.status} - ${errorText.substring(0, 300)}`);
      return { success: false, transcription: null, error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    const transcription = extractAssistantText(data);
    
    console.log(`[AUDIO] API response received (${model}, ${elapsed}ms)`);
    return { success: true, transcription };
    
  } catch (error: any) {
    const elapsed = Date.now() - startTime;
    const isTimeout = error.name === 'AbortError' || error.message?.includes('abort');
    const errorType = isTimeout ? 'TIMEOUT' : 'ERROR';
    
    console.error(`[AUDIO] ${errorType} (${model}, ${elapsed}ms):`, error.message || error);
    return { 
      success: false, 
      transcription: null, 
      error: isTimeout ? 'timeout' : (error.message || 'unknown error')
    };
  }
}

/**
 * Transcribe audio using AI Gateway with retry and fallback
 * 
 * RETRY STRATEGY:
 * 1. Try primary model (Gemini) with exponential backoff
 * 2. On persistent failure/timeout, switch to fallback model (GPT)
 * 3. Return inaudible message only after all retries exhausted
 * 
 * Returns transcription text or '[ÁUDIO INAUDÍVEL]' if failed
 */
export async function transcribeAudio(
  audioUrl: string,
  options?: {
    zapiSecurityToken?: string;
    lovableApiKey?: string;
  }
): Promise<string | null> {
  const config = getMediaConfig();
  const LOVABLE_API_KEY = Deno.env.get('COESASOLAR_OPENROUTER_API_KEY');
  const ZAPI_SECURITY_TOKEN = options?.zapiSecurityToken || Deno.env.get('ZAPI_SECURITY_TOKEN');
  const inaudibleMsg = getInaudibleMessage();
  const hallucinationPatterns = getHallucinationPatterns();

  if (!LOVABLE_API_KEY) {
    console.error('[AUDIO] LOVABLE_API_KEY not configured');
    return inaudibleMsg;
  }

  // ═══════════════════════════════════════════════════════════════
  // STEP 1: Download audio file
  // ═══════════════════════════════════════════════════════════════
  let base64Audio: string;
  let mimeType: string;
  
  try {
    const downloadHeaders: Record<string, string> = {};
    if (ZAPI_SECURITY_TOKEN && audioUrl.includes('api.z-api.io')) {
      downloadHeaders['Client-Token'] = ZAPI_SECURITY_TOKEN;
    }

    console.log('[AUDIO] Downloading audio for transcription...');

    const audioResponse = await fetch(audioUrl, {
      headers: downloadHeaders,
      redirect: 'follow',
    });

    if (!audioResponse.ok) {
      console.error('[AUDIO] Failed to download audio:', audioResponse.status);
      return inaudibleMsg;
    }

    const audioBuffer = await audioResponse.arrayBuffer();
    base64Audio = base64Encode(audioBuffer);

    console.log(`[AUDIO] Audio downloaded, size: ${audioBuffer.byteLength} bytes`);

    // Determine mime type
    const contentType = audioResponse.headers.get('content-type') || '';
    mimeType = 'audio/ogg; codecs=opus';

    if (contentType.includes('audio/')) {
      mimeType = contentType;
      if (contentType.includes('opus')) mimeType = 'audio/ogg; codecs=opus';
    } else if (audioUrl.includes('.mp3')) {
      mimeType = 'audio/mpeg';
    } else if (audioUrl.includes('.m4a')) {
      mimeType = 'audio/mp4';
    } else if (audioUrl.includes('.wav')) {
      mimeType = 'audio/wav';
    } else if (audioUrl.includes('.webm')) {
      mimeType = 'audio/webm';
    }
  } catch (downloadError) {
    console.error('[AUDIO] Error downloading audio:', downloadError);
    return inaudibleMsg;
  }

  // ═══════════════════════════════════════════════════════════════
  // STEP 2: Get transcription prompt
  // ═══════════════════════════════════════════════════════════════
  const transcriptionPrompt = getRenderedTemplate('media_analysis', 'audio_transcription_prompt', {}) ||
    'Transcreva este áudio em português brasileiro. Retorne APENAS a transcrição literal do que foi dito, sem comentários, interpretações ou texto adicional. Se o áudio estiver inaudível, ilegível ou com ruídos, responda EXATAMENTE: [ÁUDIO INAUDÍVEL]';

  // ═══════════════════════════════════════════════════════════════
  // STEP 3: Retry loop with primary model
  // ═══════════════════════════════════════════════════════════════
  const maxRetries = config.transcriptionMaxRetries;
  const primaryModel = config.transcriptionModel;
  const fallbackModel = config.transcriptionFallbackModel;
  
  let lastError = '';
  let usedFallback = false;
  
  // Try primary model first
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const result = await callTranscriptionAPI(
      config,
      primaryModel,
      base64Audio,
      mimeType,
      transcriptionPrompt,
      LOVABLE_API_KEY,
      attempt
    );
    
    if (result.success && result.transcription) {
      const normalized = result.transcription.trim();
      const isHallucination = hallucinationPatterns.some((pattern) => pattern.test(normalized));
      
      if (!normalized.includes('[ÁUDIO INAUDÍVEL]') && normalized.length >= 3 && !isHallucination) {
        console.log(`[AUDIO] ✅ Transcription successful (${primaryModel}, attempt ${attempt}): "${normalized.substring(0, 100)}..."`);
        return normalized;
      }
      
      console.log(`[AUDIO] Transcription invalid/hallucination (attempt ${attempt}): "${normalized.substring(0, 80)}"`);
    }
    
    lastError = result.error || 'empty response';
    
    // Exponential backoff before retry (1s, 2s, 4s)
    if (attempt < maxRetries) {
      const backoffMs = Math.pow(2, attempt - 1) * 1000;
      console.log(`[AUDIO] Retry ${attempt}/${maxRetries} failed (${lastError}). Waiting ${backoffMs}ms before next attempt...`);
      await sleep(backoffMs);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // STEP 4: Fallback to secondary model
  // ═══════════════════════════════════════════════════════════════
  if (fallbackModel && fallbackModel !== primaryModel) {
    console.log(`[AUDIO] ⚠️ Primary model (${primaryModel}) exhausted after ${maxRetries} attempts. Trying fallback: ${fallbackModel}`);
    usedFallback = true;
    
    // Single attempt with fallback model (longer timeout)
    const fallbackConfig = { ...config, transcriptionTimeoutMs: config.transcriptionTimeoutMs * 1.5 };
    
    const fallbackResult = await callTranscriptionAPI(
      fallbackConfig,
      fallbackModel,
      base64Audio,
      mimeType,
      transcriptionPrompt,
      LOVABLE_API_KEY,
      1
    );
    
    if (fallbackResult.success && fallbackResult.transcription) {
      const normalized = fallbackResult.transcription.trim();
      const isHallucination = hallucinationPatterns.some((pattern) => pattern.test(normalized));
      
      if (!normalized.includes('[ÁUDIO INAUDÍVEL]') && normalized.length >= 3 && !isHallucination) {
        console.log(`[AUDIO] ✅ Transcription successful via FALLBACK (${fallbackModel}): "${normalized.substring(0, 100)}..."`);
        return normalized;
      }
    }
    
    lastError = fallbackResult.error || 'fallback failed';
  }

  // ═══════════════════════════════════════════════════════════════
  // STEP 5: All attempts exhausted - return inaudible
  // ═══════════════════════════════════════════════════════════════
  console.error(`[AUDIO] ❌ All transcription attempts failed. Primary: ${primaryModel} (${maxRetries} retries)${usedFallback ? `, Fallback: ${fallbackModel}` : ''}. Last error: ${lastError}`);
  return inaudibleMsg;
}

/**
 * Analyze image using Gemini via Lovable AI Gateway
 * Returns analysis result with invoice detection
 */
export async function analyzeImage(
  imageUrl: string,
  caption?: string,
  options?: {
    lovableApiKey?: string;
  }
): Promise<MediaAnalysisResult | null> {
  try {
    const config = getMediaConfig();
    const LOVABLE_API_KEY = Deno.env.get('COESASOLAR_OPENROUTER_API_KEY');

    if (!LOVABLE_API_KEY) {
      console.error('[IMAGE] LOVABLE_API_KEY not configured');
      return null;
    }

    console.log('Downloading image from:', imageUrl);
    
    // Download image file - Z-API provides public URLs
    const imageResponse = await fetch(imageUrl);

    if (!imageResponse.ok) {
      console.error('Failed to download image:', imageResponse.status);
      return null;
    }

    const imageBuffer = await imageResponse.arrayBuffer();
    const imageBytes = new Uint8Array(imageBuffer);
    
    // Check size limit
    const maxSizeBytes = config.imageMaxSizeMB * 1024 * 1024;
    if (imageBytes.length > maxSizeBytes) {
      console.log('Image too large:', imageBytes.length);
      const tooLargeMsg = getRenderedTemplate('media_analysis', 'image_too_large', {}) ||
        '[Imagem muito grande para análise. Por favor, envie uma imagem menor.]';
      return {
        analysis: tooLargeMsg,
        base64Data: '',
        mimeType: 'image/jpeg',
        isInvoice: false,
      };
    }
    
    // Convert to base64
    let binary = '';
    for (let i = 0; i < imageBytes.length; i++) {
      binary += String.fromCharCode(imageBytes[i]);
    }
    const base64Image = btoa(binary);
    
    console.log(`Image downloaded, size: ${imageBytes.length} bytes`);

    // Determine mime type
    let mimeType = 'image/jpeg';
    if (imageUrl.includes('.png')) mimeType = 'image/png';
    else if (imageUrl.includes('.webp')) mimeType = 'image/webp';
    else if (imageUrl.includes('.gif')) mimeType = 'image/gif';

    // Build contextualized prompt from templates
    // CRITICAL: Always include instruction to extract tipoInstalacao for energy invoices
    // CRITICAL: Always include instruction to detect GD1/compensation (competitor detection)
    const invoiceExtractionInstructions = `

IMPORTANTE: Se esta for uma FATURA DE ENERGIA, você DEVE identificar e extrair:

1. TIPO DE INSTALAÇÃO:
- Procure por termos como: "Monofásico", "Bifásico", "Trifásico", "MONO", "BI", "TRI", "1F", "2F", "3F"
- Geralmente aparece próximo a "Classe/Subclasse", "Tensão", "Modalidade" ou "Tipo de Fornecimento"
- Retorne no formato: "Tipo de Instalação: [Monofásico/Bifásico/Trifásico]"

2. ENERGIA COMPENSADA / GERAÇÃO DISTRIBUÍDA (GD):
- Procure por termos como: "Energia Compensada GD", "GD1", "GDII", "Sistema de Compensação", "Créditos de Energia", "Autoconsumo Remoto"
- Se encontrar, retorne: "⚠️ ENERGIA COMPENSADA DETECTADA: [transcreva o texto encontrado]"
- Também procure por nome de empresas como: Órigo, Engie, Flora, Sun Mobi, Reverde, Nexway, etc.
- Se encontrar empresa de energia solar/GD, retorne: "⚠️ CONCORRENTE DETECTADO: [nome da empresa]"
`;

    let analysisPrompt: string;
    if (caption) {
      analysisPrompt = (getRenderedTemplate('media_analysis', 'image_analysis_with_caption', { caption }) ||
        `O cliente enviou esta imagem com a legenda: "${caption}". Analise a imagem e o contexto.`) + invoiceExtractionInstructions;
    } else {
      analysisPrompt = (getRenderedTemplate('media_analysis', 'image_analysis_no_caption', {}) ||
        'O cliente enviou esta imagem sem legenda. Analise e descreva o conteúdo.') + invoiceExtractionInstructions;
    }

    // Call Gemini via Lovable AI
    console.log('Sending image to Gemini for analysis...');
    
    const response = await fetch(config.gatewayUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.analysisModel,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: analysisPrompt },
            { 
              type: 'image_url', 
              image_url: { 
                url: `data:${mimeType};base64,${base64Image}` 
              }
            }
          ]
        }],
        max_completion_tokens: config.imageMaxTokens,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini image analysis error:', response.status, errorText.substring(0, 500));
      return null;
    }

    const data = await response.json();
    const analysis = extractAssistantText(data);
    
    if (analysis) {
      console.log(`Image analyzed: "${analysis.substring(0, 100)}..."`);
      
      // Detect GD1/compensation for competitor detection
      const gd1Result = detectGD1Compensation(analysis);
      
      return {
        analysis,
        base64Data: base64Image,
        mimeType,
        isInvoice: isEnergyInvoice(analysis),
        hasGD1Compensation: gd1Result.hasGD1,
        gd1DetectedTerms: gd1Result.detectedTerms,
        competitorName: gd1Result.competitorName,
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error analyzing image:', error);
    return null;
  }
}

/**
 * Analyze PDF using Gemini via Lovable AI Gateway
 * Returns analysis result with invoice/contract detection
 */
export async function analyzePDF(
  pdfUrl: string,
  fileName?: string,
  options?: {
    lovableApiKey?: string;
  }
): Promise<MediaAnalysisResult | null> {
  try {
    const config = getMediaConfig();
    const LOVABLE_API_KEY = Deno.env.get('COESASOLAR_OPENROUTER_API_KEY');

    if (!LOVABLE_API_KEY) {
      console.error('[PDF] LOVABLE_API_KEY not configured');
      return null;
    }

    console.log('Downloading PDF from:', pdfUrl);
    
    // Download PDF file - Z-API provides public URLs
    const pdfResponse = await fetch(pdfUrl);

    if (!pdfResponse.ok) {
      console.error('Failed to download PDF:', pdfResponse.status);
      return null;
    }

    const pdfBuffer = await pdfResponse.arrayBuffer();
    const pdfBytes = new Uint8Array(pdfBuffer);
    
    // Check size limit
    const maxSizeBytes = config.pdfMaxSizeMB * 1024 * 1024;
    if (pdfBytes.length > maxSizeBytes) {
      console.log('PDF too large:', pdfBytes.length);
      const tooLargeMsg = getRenderedTemplate('media_analysis', 'pdf_too_large', {}) ||
        '[PDF muito grande para análise. Por favor, envie um arquivo menor ou as páginas principais como imagens.]';
      return {
        analysis: tooLargeMsg,
        base64Data: '',
        mimeType: 'application/pdf',
        isInvoice: false,
      };
    }
    
    // Convert to base64
    let binary = '';
    for (let i = 0; i < pdfBytes.length; i++) {
      binary += String.fromCharCode(pdfBytes[i]);
    }
    const base64PDF = btoa(binary);
    
    console.log(`PDF downloaded, size: ${pdfBytes.length} bytes`);

    // Build contextualized prompt from templates
    // CRITICAL: Always include instruction to extract tipoInstalacao for energy invoices
    // CRITICAL: Always include instruction to detect GD1/compensation (competitor detection)
    const invoiceExtractionInstructions = `

IMPORTANTE: Se este for uma FATURA DE ENERGIA ou documento de concessionária, você DEVE identificar e extrair:

1. TIPO DE INSTALAÇÃO:
- Procure por termos como: "Monofásico", "Bifásico", "Trifásico", "MONO", "BI", "TRI", "1F", "2F", "3F"
- Geralmente aparece próximo a "Classe/Subclasse", "Tensão", "Modalidade" ou "Tipo de Fornecimento"
- Retorne no formato: "Tipo de Instalação: [Monofásico/Bifásico/Trifásico]"

2. ENERGIA COMPENSADA / GERAÇÃO DISTRIBUÍDA (GD):
- Procure por termos como: "Energia Compensada GD", "GD1", "GDII", "Sistema de Compensação", "Créditos de Energia", "Autoconsumo Remoto"
- Se encontrar, retorne: "⚠️ ENERGIA COMPENSADA DETECTADA: [transcreva o texto encontrado]"
- Também procure por nome de empresas como: Órigo, Engie, Flora, Sun Mobi, Reverde, Nexway, etc.
- Se encontrar empresa de energia solar/GD, retorne: "⚠️ CONCORRENTE DETECTADO: [nome da empresa]"
`;

    const fileContext = fileName ? ` chamado "${fileName}"` : '';
    const analysisPrompt = (getRenderedTemplate('media_analysis', 'pdf_analysis_prompt', { file_context: fileContext }) ||
      `O cliente enviou um documento PDF${fileContext}. Analise o conteúdo do documento.`) + invoiceExtractionInstructions;

    // Call Gemini via Lovable AI
    console.log('Sending PDF to Gemini for analysis...');
    
    const response = await fetch(config.gatewayUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.analysisModel,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: analysisPrompt },
            { 
              type: 'file',
              file: {
                file_data: `data:application/pdf;base64,${base64PDF}`
              }
            }
          ]
        }],
        max_completion_tokens: config.pdfMaxTokens,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini PDF analysis error:', response.status, errorText.substring(0, 500));
      return null;
    }

    const data = await response.json();
    const analysis = extractAssistantText(data);
    
    if (analysis) {
      console.log(`PDF analyzed: "${analysis.substring(0, 100)}..."`);
      
      // Detect GD1/compensation for competitor detection
      const gd1Result = detectGD1Compensation(analysis);
      
      return {
        analysis,
        base64Data: base64PDF,
        mimeType: 'application/pdf',
        isInvoice: isEnergyInvoice(analysis),
        hasGD1Compensation: gd1Result.hasGD1,
        gd1DetectedTerms: gd1Result.detectedTerms,
        competitorName: gd1Result.competitorName,
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error analyzing PDF:', error);
    return null;
  }
}

/**
 * Detect document type from analysis content
 */
export function detectDocumentTypeFromAnalysis(analysis: string): 'fatura' | 'documento_identidade' | 'contrato_social' | 'unknown' {
  const lowerAnalysis = analysis.toLowerCase();
  
  // Check for invoice indicators
  if (isEnergyInvoice(analysis)) {
    return 'fatura';
  }
  
  // Check for identity document indicators (from patterns or fallback)
  let identityKeywords = getDocumentKeywords('identity_document');
  if (identityKeywords.length === 0) {
    identityKeywords = [
      'rg', 'cnh', 'carteira de identidade', 'carteira nacional de habilitação',
      'documento de identidade', 'cpf', 'registro geral', 'carteira de motorista',
      'foto 3x4', 'assinatura do portador', 'data de nascimento', 'filiação',
    ];
  }
  if (identityKeywords.some(k => lowerAnalysis.includes(k))) {
    return 'documento_identidade';
  }
  
  // Check for social contract indicators (from patterns or fallback)
  let contractKeywords = getDocumentKeywords('social_contract');
  if (contractKeywords.length === 0) {
    contractKeywords = [
      'contrato social', 'ato constitutivo', 'estatuto social', 'razão social',
      'objeto social', 'capital social', 'sócio', 'administrador', 'junta comercial',
      'nire', 'cnpj', 'natureza jurídica', 'quadro societário',
    ];
  }
  if (contractKeywords.some(k => lowerAnalysis.includes(k))) {
    return 'contrato_social';
  }
  
  return 'unknown';
}

/**
 * Clear cached config (for testing or forced refresh)
 */
export function clearMediaConfigCache(): void {
  cachedMediaConfig = null;
  mediaConfigLoadedAt = 0;
}
