// ═══════════════════════════════════════════════════════════════
// HUMANIZED LATENCY MODULE
// Adds realistic typing delays before sending responses
// Simulates human-like response times based on message length
// ═══════════════════════════════════════════════════════════════

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
// Use unified config loader for hierarchical config resolution
import { getConfigNumber, getConfigValue } from './unified-config-loader.ts';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface LatencyConfig {
  shortMsgSeconds: number;      // Delay for short messages (<100 chars)
  mediumMsgSeconds: number;     // Delay for medium messages (100-300 chars)
  longMsgSeconds: number;       // Delay for long messages (>300 chars)
  randomVariation: number;      // Random variation (±seconds)
  typingIndicatorEnabled: boolean;
}

export interface LatencyCalculation {
  baseDelaySeconds: number;
  variationSeconds: number;
  totalDelaySeconds: number;
  totalDelayMs: number;
  category: 'short' | 'medium' | 'long';
  responseLength: number;
}

// ═══════════════════════════════════════════════════════════════
// DEFAULT CONFIGURATION
// ═══════════════════════════════════════════════════════════════

const DEFAULT_LATENCY_CONFIG: LatencyConfig = {
  shortMsgSeconds: 2.0,      // Short responses need more "thinking time"
  mediumMsgSeconds: 1.5,     // Medium responses
  longMsgSeconds: 1.0,       // Long responses (typing takes more time anyway)
  randomVariation: 0.3,      // ±0.3 seconds random variation
  typingIndicatorEnabled: true,
};

// Thresholds for message categories
const SHORT_MSG_THRESHOLD = 100;   // < 100 chars
const MEDIUM_MSG_THRESHOLD = 300;  // 100-300 chars
// > 300 chars = long

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION LOADING
// ═══════════════════════════════════════════════════════════════

/**
 * Load latency configuration from configuracoes_sistema
 */
export async function loadLatencyConfig(
  supabase: SupabaseClient,
  configCache?: Map<string, string>
): Promise<LatencyConfig> {
  try {
    const shortMsgSeconds = getConfigNumber('latency_short_msg_seconds', DEFAULT_LATENCY_CONFIG.shortMsgSeconds, configCache);
    const mediumMsgSeconds = getConfigNumber('latency_medium_msg_seconds', DEFAULT_LATENCY_CONFIG.mediumMsgSeconds, configCache);
    const longMsgSeconds = getConfigNumber('latency_long_msg_seconds', DEFAULT_LATENCY_CONFIG.longMsgSeconds, configCache);
    const randomVariation = getConfigNumber('latency_random_variation', DEFAULT_LATENCY_CONFIG.randomVariation, configCache);
    
    const typingEnabledRaw = getConfigValue('typing_indicator_enabled', 'true', configCache);
    const typingIndicatorEnabled = typingEnabledRaw === 'true' || typingEnabledRaw === '1';

    return {
      shortMsgSeconds,
      mediumMsgSeconds,
      longMsgSeconds,
      randomVariation,
      typingIndicatorEnabled,
    };
  } catch (err) {
    console.warn('[LATENCY] Failed to load config, using defaults:', err);
    return DEFAULT_LATENCY_CONFIG;
  }
}

// ═══════════════════════════════════════════════════════════════
// LATENCY CALCULATION
// ═══════════════════════════════════════════════════════════════

/**
 * Calculate humanized latency based on response length
 * 
 * Logic:
 * - Short responses (<100 chars): 2.0-2.5s (person "thinks" before short answer)
 * - Medium responses (100-300 chars): 1.5-2.0s 
 * - Long responses (>300 chars): 1.0-1.3s (typing takes time anyway)
 * 
 * Adds random variation for naturalness
 */
export function calculateHumanizedLatency(
  responseText: string,
  config: LatencyConfig = DEFAULT_LATENCY_CONFIG
): LatencyCalculation {
  const length = (responseText || '').length;
  
  let baseDelaySeconds: number;
  let category: 'short' | 'medium' | 'long';
  
  if (length < SHORT_MSG_THRESHOLD) {
    baseDelaySeconds = config.shortMsgSeconds;
    category = 'short';
  } else if (length < MEDIUM_MSG_THRESHOLD) {
    baseDelaySeconds = config.mediumMsgSeconds;
    category = 'medium';
  } else {
    baseDelaySeconds = config.longMsgSeconds;
    category = 'long';
  }
  
  // Add random variation (-variation to +variation)
  const variationSeconds = (Math.random() * 2 - 1) * config.randomVariation;
  const totalDelaySeconds = Math.max(0.5, baseDelaySeconds + variationSeconds); // Min 0.5s
  const totalDelayMs = Math.round(totalDelaySeconds * 1000);
  
  console.log(`[LATENCY] Response ${length} chars (${category}): base=${baseDelaySeconds}s, variation=${variationSeconds.toFixed(2)}s, total=${totalDelaySeconds.toFixed(2)}s`);
  
  return {
    baseDelaySeconds,
    variationSeconds,
    totalDelaySeconds,
    totalDelayMs,
    category,
    responseLength: length,
  };
}

/**
 * Sleep for the calculated latency duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Apply humanized latency - wait before sending response
 * Returns the actual wait time applied
 */
export async function applyHumanizedLatency(
  responseText: string,
  config?: LatencyConfig
): Promise<LatencyCalculation> {
  const effectiveConfig = config || DEFAULT_LATENCY_CONFIG;
  const calculation = calculateHumanizedLatency(responseText, effectiveConfig);
  
  console.log(`[LATENCY] Waiting ${calculation.totalDelayMs}ms before sending...`);
  await sleep(calculation.totalDelayMs);
  
  return calculation;
}

// ═══════════════════════════════════════════════════════════════
// TYPING INDICATOR SIMULATION
// ═══════════════════════════════════════════════════════════════

/**
 * Calculate recommended typing indicator duration
 * This is typically shown BEFORE the latency wait
 * Simulates "Sofia is typing..."
 */
export function getTypingIndicatorDuration(
  responseLength: number,
  config: LatencyConfig = DEFAULT_LATENCY_CONFIG
): number {
  if (!config.typingIndicatorEnabled) {
    return 0;
  }
  
  // Typing indicator should be shown for part of the latency period
  // Short: show for ~1.5s
  // Medium: show for ~1.0s
  // Long: show for ~0.7s (we'll type for a while anyway)
  
  if (responseLength < SHORT_MSG_THRESHOLD) {
    return 1500;
  } else if (responseLength < MEDIUM_MSG_THRESHOLD) {
    return 1000;
  } else {
    return 700;
  }
}

// ═══════════════════════════════════════════════════════════════
// FULL HUMANIZATION FLOW
// ═══════════════════════════════════════════════════════════════

export interface HumanizationContext {
  responseText: string;
  sendTypingIndicator: () => Promise<void>;
  config?: LatencyConfig;
}

export interface HumanizationResult {
  typingDurationMs: number;
  latencyDurationMs: number;
  totalWaitMs: number;
}

/**
 * Complete humanization flow:
 * 1. Send typing indicator
 * 2. Wait for typing duration
 * 3. Apply humanized latency
 * 
 * Returns total wait time applied
 */
export async function applyFullHumanization(
  ctx: HumanizationContext
): Promise<HumanizationResult> {
  const config = ctx.config || DEFAULT_LATENCY_CONFIG;
  const typingDurationMs = getTypingIndicatorDuration(ctx.responseText.length, config);
  
  // Step 1: Send typing indicator
  if (config.typingIndicatorEnabled && typingDurationMs > 0) {
    try {
      await ctx.sendTypingIndicator();
      console.log(`[HUMANIZE] Typing indicator sent, waiting ${typingDurationMs}ms`);
    } catch (err) {
      console.warn('[HUMANIZE] Failed to send typing indicator:', err);
    }
    
    // Step 2: Wait for typing indicator duration
    await sleep(typingDurationMs);
  }
  
  // Step 3: Apply humanized latency
  const latencyCalc = await applyHumanizedLatency(ctx.responseText, config);
  
  const totalWaitMs = typingDurationMs + latencyCalc.totalDelayMs;
  console.log(`[HUMANIZE] Total humanization: typing=${typingDurationMs}ms + latency=${latencyCalc.totalDelayMs}ms = ${totalWaitMs}ms`);
  
  return {
    typingDurationMs,
    latencyDurationMs: latencyCalc.totalDelayMs,
    totalWaitMs,
  };
}
