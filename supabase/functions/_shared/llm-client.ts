/**
 * LLM Client Utilities
 * Shared helpers for calling LLM APIs with fallback support
 * 
 * ZERO HARDCODE: All configs loaded from configuracoes_sistema
 * COST MONITORING: Integrated with llm-cost-monitor for budget tracking
 */

import { extractAssistantText } from './text-extraction.ts';
import { recordLLMCallFromResponse } from './llm-cost-monitor.ts';

// ============ DYNAMIC CONFIG ============
interface LLMConfig {
  defaultModels: string[];
  gatewayUrl: string;
  defaultTemperature: number;
  defaultMaxTokens: number;
  defaultTimeoutMs: number;
  tokenCharRatio: number;
}

let cachedConfig: LLMConfig | null = null;
let configLoadedAt = 0;
const CONFIG_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Fallback defaults (used only if DB unavailable)
// 'deepseek-v4-flash' é o substituto oficial de 'deepseek-chat' (não-thinking) — a
// DeepSeek desativou o nome legado 'deepseek-chat' em 2026-07-24 (mesma causa raiz do
// fix em src/lib/blog/deepseek.ts). Sem isso, este fallback (usado quando a config do
// banco está indisponível ou vazia) chama um model id morto.
const FALLBACK_CONFIG: LLMConfig = {
  defaultModels: ['deepseek-v4-flash'],
  gatewayUrl: 'https://openrouter.ai/api/v1/chat/completions',
  defaultTemperature: 0.7,
  defaultMaxTokens: 4096,
  defaultTimeoutMs: 30000,
  tokenCharRatio: 4,
};

/**
 * Load LLM config from database
 */
export async function loadLLMConfig(supabase: any): Promise<LLMConfig> {
  const now = Date.now();
  if (cachedConfig && (now - configLoadedAt) < CONFIG_CACHE_TTL_MS) {
    return cachedConfig;
  }

  try {
    const { data, error } = await supabase
      .from('configuracoes_sistema')
      .select('chave, valor')
      .in('chave', [
        'llm_default_models',
        'ai_gateway_url',
        'llm_default_temperature',
        'llm_default_max_tokens',
        'llm_default_timeout_ms',
        'llm_token_char_ratio',
      ]);

    if (error) {
      console.warn('[LLM] Error loading config:', error.message);
      return FALLBACK_CONFIG;
    }

    const configMap = new Map<string, string>();
    for (const row of data || []) {
      configMap.set(row.chave, row.valor);
    }

    const modelsStr = configMap.get('llm_default_models') || '';
    const models = modelsStr ? modelsStr.split(',').map(m => m.trim()).filter(Boolean) : FALLBACK_CONFIG.defaultModels;

    cachedConfig = {
      defaultModels: models.length > 0 ? models : FALLBACK_CONFIG.defaultModels,
      gatewayUrl: configMap.get('ai_gateway_url') || FALLBACK_CONFIG.gatewayUrl,
      defaultTemperature: parseFloat(configMap.get('llm_default_temperature') || '') || FALLBACK_CONFIG.defaultTemperature,
      defaultMaxTokens: parseInt(configMap.get('llm_default_max_tokens') || '', 10) || FALLBACK_CONFIG.defaultMaxTokens,
      defaultTimeoutMs: parseInt(configMap.get('llm_default_timeout_ms') || '', 10) || FALLBACK_CONFIG.defaultTimeoutMs,
      tokenCharRatio: parseInt(configMap.get('llm_token_char_ratio') || '', 10) || FALLBACK_CONFIG.tokenCharRatio,
    };

    configLoadedAt = now;
    console.log('[LLM] Config loaded from DB');
    return cachedConfig;
  } catch (err) {
    console.warn('[LLM] Failed to load config:', err);
    return FALLBACK_CONFIG;
  }
}

/**
 * Get cached config (sync) - returns fallback if not loaded
 */
export function getLLMConfig(): LLMConfig {
  return cachedConfig || FALLBACK_CONFIG;
}

/**
 * Get default models list (sync access to cached config)
 */
export function getDefaultModels(): string[] {
  return getLLMConfig().defaultModels;
}

// Legacy export for backward compatibility
export const DEFAULT_MODELS = FALLBACK_CONFIG.defaultModels;

function openRouterModel(model: string): string {
  return model.includes('/') ? model : `deepseek/${model}`;
}

function openRouterKey(): string {
  const key = Deno.env.get('COESA_PROPOSTAS_OPENROUTER_API_KEY');
  if (!key) throw new Error('COESA_PROPOSTAS_OPENROUTER_API_KEY not configured');
  return key;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}

export interface LLMRequestOptions {
  model?: string;
  models?: string[];
  temperature?: number;
  max_tokens?: number;
  timeout?: number;
}

export interface LLMResponse {
  success: boolean;
  content: string | null;
  model: string | null;
  error?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

/**
 * Get models list, using agent's configured model as primary if available
 */
export function getModelsForAgent(configuredModel?: string | null): string[] {
  const defaultModels = getDefaultModels();
  if (configuredModel) {
    // Use configured model first, then fallback to defaults
    return [configuredModel, ...defaultModels.filter(m => m !== configuredModel)];
  }
  return defaultModels;
}

/**
 * Call LLM with automatic model fallback
 * Now includes cost tracking via llm-cost-monitor
 */
export async function callLLMWithFallback(
  messages: LLMMessage[],
  apiKey: string,
  options: LLMRequestOptions = {},
  trackingContext?: { supabase?: any; agentId?: string; conversaId?: string }
): Promise<LLMResponse> {
  const config = getLLMConfig();
  
  const {
    models = config.defaultModels,
    temperature = config.defaultTemperature,
    max_tokens = config.defaultMaxTokens,
    timeout = config.defaultTimeoutMs,
  } = options;

  let lastError: string | null = null;
  let usedModel: string | null = null;

  for (const model of models) {
    try {
      console.log(`[LLM] Trying model: ${model}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openRouterKey()}`,
        },
        body: JSON.stringify({
          model: openRouterModel(model),
          messages,
          temperature,
          max_tokens,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`[LLM] Model ${model} returned ${response.status}: ${errorText}`);
        
        // Handle rate limits and model-specific errors
        if (response.status === 429 || response.status === 503) {
          lastError = `Rate limited or unavailable: ${response.status}`;
          continue; // Try next model
        }
        
        lastError = `HTTP ${response.status}: ${errorText}`;
        continue;
      }

      const data = await response.json();
      const content = extractAssistantText(data);

      if (content) {
        usedModel = model;
        console.log(`[LLM] Success with model: ${model}`);
        
        // Track LLM cost if supabase client provided
        if (trackingContext?.supabase && data.usage) {
          recordLLMCallFromResponse(
            trackingContext.supabase,
            model,
            data.usage,
            trackingContext.agentId || 'sofia',
            trackingContext.conversaId || null
          ).catch(err => console.warn('[LLM] Cost tracking failed:', err));
        }
        
        return {
          success: true,
          content,
          model: usedModel,
          usage: data.usage,
        };
      } else {
        lastError = 'Empty response from model';
        continue;
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[LLM] Error with model ${model}:`, errorMsg);
      lastError = errorMsg;
      
      // If aborted (timeout), try next model
      if (errorMsg.includes('aborted') || errorMsg.includes('timeout')) {
        continue;
      }
      
      // For other errors, also try next model
      continue;
    }
  }

  return {
    success: false,
    content: null,
    model: null,
    error: lastError || 'All models failed',
  };
}

/**
 * Call LLM with single model (no fallback)
 */
export async function callLLM(
  messages: LLMMessage[],
  model: string,
  apiKey: string,
  options: Omit<LLMRequestOptions, 'model' | 'models'> = {}
): Promise<LLMResponse> {
  return callLLMWithFallback(messages, apiKey, { ...options, models: [model] });
}

/**
 * Build a simple chat message array
 */
export function buildChatMessages(
  systemPrompt: string,
  userMessage: string,
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
): LLMMessage[] {
  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
  ];

  if (conversationHistory) {
    for (const msg of conversationHistory) {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  messages.push({ role: 'user', content: userMessage });

  return messages;
}

/**
 * Estimate token count (rough approximation)
 */
export function estimateTokens(text: string): number {
  const config = getLLMConfig();
  return Math.ceil(text.length / config.tokenCharRatio);
}

/**
 * Truncate conversation history to fit token limit
 */
export function truncateHistory(
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  maxTokens: number
): Array<{ role: 'user' | 'assistant'; content: string }> {
  let totalTokens = 0;
  const result: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  // Process from most recent to oldest
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    const msgTokens = estimateTokens(msg.content);
    
    if (totalTokens + msgTokens <= maxTokens) {
      result.unshift(msg);
      totalTokens += msgTokens;
    } else {
      break;
    }
  }

  return result;
}

/**
 * Clear cached config (for testing or forced refresh)
 */
export function clearLLMConfigCache(): void {
  cachedConfig = null;
  configLoadedAt = 0;
}

// ═══════════════════════════════════════════════════════════════
// CONVERSATION CONTEXT HELPERS
// Phase 62: Media context injection and message preparation
// ═══════════════════════════════════════════════════════════════

export interface MediaContext {
  isTranscribedAudio: boolean;
  isAnalyzedImage: boolean;
  isAnalyzedDocument: boolean;
  messageText: string;
}

/**
 * Get media context prefix for user message
 */
export function getMediaContextPrefix(ctx: MediaContext): string | null {
  if (ctx.isTranscribedAudio) return `[O cliente enviou um áudio dizendo]: ${ctx.messageText}`;
  if (ctx.isAnalyzedImage) return `[O cliente enviou uma imagem - análise]: ${ctx.messageText}`;
  if (ctx.isAnalyzedDocument) return `[O cliente enviou um documento PDF - análise]: ${ctx.messageText}`;
  return null;
}

/**
 * Apply media context to conversation history
 */
export function applyMediaContextToHistory(
  history: Array<{ role: string; content: string }>,
  mediaCtx: MediaContext
): Array<{ role: string; content: string }> {
  const mediaContext = getMediaContextPrefix(mediaCtx);
  
  if (!mediaContext || history.length === 0) {
    return history;
  }
  
  return history.map((m, i) => 
    i === history.length - 1 && m.role === 'user'
      ? { ...m, content: mediaContext }
      : m
  );
}

/**
 * Build full messages array for LLM call
 */
export function buildMessagesForLLM(
  systemPrompt: string,
  history: Array<{ role: string; content: string }>,
  mediaCtx?: MediaContext
): Array<{ role: string; content: string }> {
  const historyWithMedia = mediaCtx 
    ? applyMediaContextToHistory(history, mediaCtx)
    : history;
  
  return [
    { role: 'system', content: systemPrompt },
    ...historyWithMedia,
  ];
}

// ═══════════════════════════════════════════════════════════════
// LEGACY WRAPPER - For backward compatibility with callAIWithModel
// Phase 62: Consolidated LLM calling
// ═══════════════════════════════════════════════════════════════

export interface LegacyAIResult {
  text: string;
  model: string;
}

/**
 * Call AI with model (legacy wrapper for callLLMWithFallback)
 * Compatible with existing callAIWithModel usage in sofia-webhook
 */
export async function callAIWithModelLegacy(
  model: string,
  messages: Array<{ role: string; content: string }>,
  apiKey: string,
  maxTokens: number = 500
): Promise<LegacyAIResult> {
  const config = getLLMConfig();
  
  console.log(`Calling AI gateway with model: ${model}`);
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.defaultTimeoutMs);
  
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: openRouterModel(model),
        messages,
        max_completion_tokens: maxTokens,
      }),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`AI API HTTP error (${model}):`, response.status, errorText.substring(0, 500));
      throw new Error(`AI API error: ${response.status}`);
    }
    
    const data = await response.json();
    const text = extractAssistantText(data);
    
    if (!text) {
      throw new Error(`Could not extract text from ${model} response`);
    }
    
    return { text, model };
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * Call AI with fallback models (consolidated)
 * Uses configured models list and tries each in order
 */
export async function callAIWithModels(
  messages: Array<{ role: string; content: string }>,
  apiKey: string,
  models: string[],
  maxTokens: number = 500
): Promise<{ text: string; model: string } | null> {
  for (const model of models) {
    try {
      const result = await callAIWithModelLegacy(model, messages, apiKey, maxTokens);
      console.log(`Got response from ${model}`);
      return result;
    } catch (error) {
      console.error(`Model ${model} failed:`, error);
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// ORCHESTRATE LLM FLOW (Phase 71)
// Consolidates: messages build + model call with fallbacks
// ═══════════════════════════════════════════════════════════════

export interface LLMFlowContext {
  systemPrompt: string;
  history: Array<{ role: string; content: string }>;
  mediaContext: MediaContext;
  agentPersona: { llm_model?: string } | null;
  apiKey: string;
}

export interface LLMFlowResult {
  success: boolean;
  assistantMessage: string | null;
  usedModel: string | null;
  failed: boolean;
}

/**
 * Orchestrate LLM call with message building and fallbacks
 */
export async function orchestrateLLMFlow(ctx: LLMFlowContext): Promise<LLMFlowResult> {
  const { systemPrompt, history, mediaContext, agentPersona, apiKey } = ctx;

  // Build messages for LLM
  const messages = buildMessagesForLLM(systemPrompt, history, mediaContext);

  // Get models to try
  const configuredModel = agentPersona?.llm_model;
  const modelsToTry = getModelsForAgent(configuredModel);
  
  console.log(`[LLM_FLOW] Using models: ${modelsToTry.join(', ')} (configured: ${configuredModel || 'none'})`);

  // Use callAIWithModels which already handles fallbacks
  const result = await callAIWithModels(messages, apiKey, modelsToTry, 500);
  
  if (result) {
    return {
      success: true,
      assistantMessage: result.text,
      usedModel: result.model,
      failed: false,
    };
  }

  return {
    success: false,
    assistantMessage: null,
    usedModel: null,
    failed: true,
  };
}
