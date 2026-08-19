/**
 * Hesitation Detection Module
 * Shared utilities for detecting client hesitation in messages
 * Migrated from sofia-webhook for reuse across agents
 * 100% Zero Hardcode - All configs from database
 */

import { type PatternEntry, matchesPatternCategory, getPatternCache } from './detection-patterns.ts';

// ═══════════════════════════════════════════════════════════════
// CONFIG CACHE (loaded from configuracoes_sistema)
// ═══════════════════════════════════════════════════════════════

interface HesitationAIConfig {
  model: string;
  gatewayUrl: string;
  temperature: number;
  maxTokens: number;
  minLength: number;
}

const DEFAULT_HESITATION_CONFIG: HesitationAIConfig = {
  model: 'google/gemini-2.5-flash-lite',
  gatewayUrl: 'https://ai.gateway.lovable.dev/v1/chat/completions',
  temperature: 0.1,
  maxTokens: 200,
  minLength: 30,
};

let hesitationConfigCache: { data: HesitationAIConfig | null; timestamp: number } = { data: null, timestamp: 0 };
const CONFIG_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Load hesitation AI config from database
 */
export async function loadHesitationConfig(supabaseClient: any): Promise<HesitationAIConfig> {
  const now = Date.now();
  if (hesitationConfigCache.data && (now - hesitationConfigCache.timestamp) < CONFIG_CACHE_TTL_MS) {
    return hesitationConfigCache.data;
  }
  
  try {
    const { data, error } = await supabaseClient
      .from('configuracoes_sistema')
      .select('chave, valor')
      .in('chave', [
        'hesitation_ai_model',
        'ai_gateway_url',
        'hesitation_ai_temperature',
        'hesitation_ai_max_tokens',
        'hesitation_ai_min_length',
      ]);
    
    if (error) {
      console.error('[HESITATION] Config load error:', error);
      return DEFAULT_HESITATION_CONFIG;
    }
    
    const configMap: Record<string, string> = {};
    for (const row of data || []) {
      configMap[row.chave] = row.valor;
    }
    
    const config: HesitationAIConfig = {
      model: configMap.hesitation_ai_model || DEFAULT_HESITATION_CONFIG.model,
      gatewayUrl: configMap.ai_gateway_url || DEFAULT_HESITATION_CONFIG.gatewayUrl,
      temperature: parseFloat(configMap.hesitation_ai_temperature || '0.1'),
      maxTokens: parseInt(configMap.hesitation_ai_max_tokens || '200', 10),
      minLength: parseInt(configMap.hesitation_ai_min_length || '30', 10),
    };
    
    hesitationConfigCache = { data: config, timestamp: now };
    return config;
  } catch (err) {
    console.error('[HESITATION] Config exception:', err);
    return DEFAULT_HESITATION_CONFIG;
  }
}

export function getHesitationConfig(): HesitationAIConfig {
  return hesitationConfigCache.data || DEFAULT_HESITATION_CONFIG;
}

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type HesitationType = 'strong' | 'moderate' | 'ai_detected' | null;

export interface HesitationDetection {
  detected: boolean;
  type: HesitationType;
  reason: string | null;
  shouldSwitchToConsultive: boolean;
}

// ═══════════════════════════════════════════════════════════════
// QUICK KEYWORD-BASED DETECTION
// Uses dynamic patterns from database (hesitation_strong, hesitation_moderate)
// ═══════════════════════════════════════════════════════════════

/**
 * Quick keyword-based hesitation detection
 * Uses patterns from database ONLY (categories: hesitation_strong, hesitation_moderate)
 */
export function quickDetectHesitation(
  message: string,
  patterns?: Map<string, PatternEntry>
): HesitationDetection {
  const patternsToUse = patterns || getPatternCache()?.patterns;
  const lowerMessage = message.toLowerCase().trim();
  
  // Check for strong hesitation - DATABASE ONLY
  if (patternsToUse) {
    const strongPatterns = patternsToUse.get('hesitation_strong');
    if (strongPatterns) {
      for (const kw of strongPatterns.keywords) {
        if (lowerMessage.includes(kw.toLowerCase())) {
          return {
            detected: true,
            type: 'strong',
            reason: kw,
            shouldSwitchToConsultive: true,
          };
        }
      }
      // Check regex patterns
      for (const rx of strongPatterns.regexPatterns) {
        if (rx.test(message)) {
          return {
            detected: true,
            type: 'strong',
            reason: rx.source,
            shouldSwitchToConsultive: true,
          };
        }
      }
    }
    
    // Check for moderate hesitation - DATABASE ONLY
    const moderatePatterns = patternsToUse.get('hesitation_moderate');
    if (moderatePatterns) {
      for (const kw of moderatePatterns.keywords) {
        if (lowerMessage.includes(kw.toLowerCase())) {
          return {
            detected: true,
            type: 'moderate',
            reason: kw,
            shouldSwitchToConsultive: true,
          };
        }
      }
      // Check regex patterns
      for (const rx of moderatePatterns.regexPatterns) {
        if (rx.test(message)) {
          return {
            detected: true,
            type: 'moderate',
            reason: rx.source,
            shouldSwitchToConsultive: true,
          };
        }
      }
    }
  }
  
  return {
    detected: false,
    type: null,
    reason: null,
    shouldSwitchToConsultive: false,
  };
}

// ═══════════════════════════════════════════════════════════════
// AI-BASED DETECTION
// For subtle cases where keywords don't match
// ═══════════════════════════════════════════════════════════════

import { getTemplate, getTemplateCache } from './message-templates.ts';

// Default prompt loaded from DB (fallback)
const DEFAULT_HESITATION_PROMPT = `Analise a mensagem do cliente e determine se ele está expressando HESITAÇÃO ou OBJEÇÃO sobre fechar negócio.
Responda APENAS com JSON: {"hesitating": true/false, "confidence": "high"|"medium"|"low", "reason": "descrição ou null"}`;

/**
 * Get hesitation analysis prompt from database
 */
function getHesitationPrompt(): string {
  const template = getTemplate('ai_prompts', 'hesitation_analysis_prompt', getTemplateCache() || undefined);
  return template?.template_text || DEFAULT_HESITATION_PROMPT;
}

/**
 * AI-based hesitation detection for subtle cases
 * Uses LLM to analyze message sentiment and intent
 * All configs loaded from database
 */
export async function aiDetectHesitation(
  message: string,
  apiKey: string,
  modelId?: string,
  patterns?: Map<string, PatternEntry>
): Promise<HesitationDetection> {
  const config = getHesitationConfig();
  const model = modelId || config.model;
  
  try {
    const response = await fetch(config.gatewayUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ 
          role: 'user', 
          content: `${getHesitationPrompt()}\n\nMensagem do cliente: "${message}"` 
        }],
        temperature: config.temperature,
        max_tokens: config.maxTokens,
      }),
    });

    if (!response.ok) {
      console.log('[HESITATION] AI detection failed, falling back to keywords only');
      return quickDetectHesitation(message, patterns);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return quickDetectHesitation(message, patterns);
    }
    
    const parsed = JSON.parse(jsonMatch[0]);
    
    if (parsed.hesitating && (parsed.confidence === 'high' || parsed.confidence === 'medium')) {
      return {
        detected: true,
        type: 'ai_detected',
        reason: parsed.reason || 'Hesitação detectada por IA',
        shouldSwitchToConsultive: true,
      };
    }
    
    return {
      detected: false,
      type: null,
      reason: null,
      shouldSwitchToConsultive: false,
    };
    
  } catch (error) {
    console.error('[HESITATION] AI detection error:', error);
    return quickDetectHesitation(message, patterns);
  }
}

// ═══════════════════════════════════════════════════════════════
// COMBINED DETECTION
// Quick detection first, then AI for ambiguous longer messages
// ═══════════════════════════════════════════════════════════════

/**
 * Combined hesitation detection (quick + AI for ambiguous cases)
 * Uses quick keyword detection first, then AI for longer messages without matches
 */
export async function detectHesitationFull(
  message: string,
  apiKey: string,
  modelId?: string,
  patterns?: Map<string, PatternEntry>
): Promise<HesitationDetection> {
  // First, try quick keyword detection
  const quickResult = quickDetectHesitation(message, patterns);
  
  if (quickResult.detected) {
    console.log(`[HESITATION] Quick detection found: ${quickResult.type} - "${quickResult.reason}"`);
    return quickResult;
  }
  
  // For longer messages without obvious keywords, use AI (minLength from config)
  const config = getHesitationConfig();
  if (message.length > config.minLength && apiKey) {
    const aiResult = await aiDetectHesitation(message, apiKey, modelId, patterns);
    if (aiResult.detected) {
      console.log(`[HESITATION] AI detection found: ${aiResult.reason}`);
      return aiResult;
    }
  }
  
  return {
    detected: false,
    type: null,
    reason: null,
    shouldSwitchToConsultive: false,
  };
}

// ═══════════════════════════════════════════════════════════════
// FEEDBACK SENTIMENT DETECTION
// Detect positive/neutral/negative feedback using DB patterns
// ═══════════════════════════════════════════════════════════════

export type FeedbackSentiment = 'positive' | 'neutral' | 'negative' | null;

export interface FeedbackDetection {
  sentiment: FeedbackSentiment;
  matchedKeyword: string | null;
}

/**
 * Detect feedback sentiment using database patterns
 * Categories: feedback_positive, feedback_neutral, feedback_negative
 */
export function detectFeedbackSentiment(
  message: string,
  patterns?: Map<string, PatternEntry>
): FeedbackDetection {
  const patternsToUse = patterns || getPatternCache()?.patterns;
  
  if (!patternsToUse) {
    return { sentiment: null, matchedKeyword: null };
  }
  
  // Check positive feedback
  if (matchesPatternCategory(message, 'feedback_positive', patternsToUse)) {
    const positivePatterns = patternsToUse.get('feedback_positive');
    const matchedKw = positivePatterns?.keywords.find(kw => 
      message.toLowerCase().includes(kw.toLowerCase())
    );
    return { sentiment: 'positive', matchedKeyword: matchedKw || null };
  }
  
  // Check negative feedback
  if (matchesPatternCategory(message, 'feedback_negative', patternsToUse)) {
    const negativePatterns = patternsToUse.get('feedback_negative');
    const matchedKw = negativePatterns?.keywords.find(kw => 
      message.toLowerCase().includes(kw.toLowerCase())
    );
    return { sentiment: 'negative', matchedKeyword: matchedKw || null };
  }
  
  // Check neutral feedback
  if (matchesPatternCategory(message, 'feedback_neutral', patternsToUse)) {
    const neutralPatterns = patternsToUse.get('feedback_neutral');
    const matchedKw = neutralPatterns?.keywords.find(kw => 
      message.toLowerCase().includes(kw.toLowerCase())
    );
    return { sentiment: 'neutral', matchedKeyword: matchedKw || null };
  }
  
  return { sentiment: null, matchedKeyword: null };
}

// ═══════════════════════════════════════════════════════════════
// HESITATION FLOW ORCHESTRATOR
// Handles detection + DB updates + notifications in one call
// ═══════════════════════════════════════════════════════════════

export interface HesitationFlowContext {
  supabase: any;
  conversaId: string;
  messageText: string;
  funnelStage: string;
  currentMode: string | null;
  clienteNome: string | null;
  phone: string;
  agentName: string;
  apiKey: string;
  defaultModel?: string;
  patterns?: Map<string, PatternEntry>;
}

export interface HesitationFlowResult {
  detected: boolean;
  result: HesitationDetection | null;
  modeChanged: boolean;
  notificationCreated: boolean;
}

/**
 * Orchestrates the full hesitation detection flow:
 * 1. Checks if detection is needed (funnelStage = fechamento OR currentMode = closer_premium)
 * 2. Runs detection
 * 3. Updates conversation with detected objection
 * 4. Creates admin notification if mode switch happens
 */
export async function orchestrateHesitationFlow(
  ctx: HesitationFlowContext
): Promise<HesitationFlowResult> {
  const { supabase, conversaId, messageText, funnelStage, currentMode, clienteNome, phone, agentName, apiKey, defaultModel, patterns } = ctx;

  // Only run detection in closing stages
  const shouldDetect = funnelStage === 'fechamento' || currentMode === 'closer_premium';
  
  if (!shouldDetect) {
    return {
      detected: false,
      result: null,
      modeChanged: false,
      notificationCreated: false,
    };
  }

  // Run full hesitation detection
  const hesitationResult = await detectHesitationFull(messageText, apiKey, defaultModel, patterns);
  
  if (!hesitationResult.detected) {
    return {
      detected: false,
      result: hesitationResult,
      modeChanged: false,
      notificationCreated: false,
    };
  }

  console.log(`[HESITATION] Detected (${hesitationResult.type}): "${hesitationResult.reason}"`);

  // Update conversation with detected objection
  try {
    await supabase
      .from('chatbot_conversas')
      .update({
        detected_objection: hesitationResult.reason?.substring(0, 100) || 'hesitação detectada',
      })
      .eq('id', conversaId);
  } catch (err) {
    console.error('[HESITATION] Failed to update conversation:', err);
  }

  let modeChanged = false;
  let notificationCreated = false;

  // If transitioning from closer_premium, log mode change and create notification
  if (currentMode === 'closer_premium') {
    console.log(`[HESITATION_MODE_SWITCH] Reverting from closer_premium to standard due to hesitation`);
    modeChanged = true;

    try {
      await supabase.from('admin_notifications').insert({
        admin_user_id: null,
        title: '🔄 Modo consultivo ativado automaticamente',
        message: `${clienteNome || phone} expressou hesitação ("${hesitationResult.reason?.substring(0, 50)}..."). ${agentName} mudou para modo consultivo para abordar as preocupações do cliente.`,
        type: 'info',
        entity_type: 'chatbot_conversa',
        entity_id: conversaId,
        created_by_nome: `${agentName} (Detecção de Hesitação)`,
      });
      notificationCreated = true;
    } catch (err) {
      console.error('[HESITATION] Failed to create notification:', err);
    }
  }

  return {
    detected: true,
    result: hesitationResult,
    modeChanged,
    notificationCreated,
  };
}
