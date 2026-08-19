// ═══════════════════════════════════════════════════════════════════════════
// ENTRY POINT RATE LIMITER - First Line of Defense
// ═══════════════════════════════════════════════════════════════════════════
// Protege o webhook de entrada contra:
// - Flood de mensagens do mesmo número
// - Spam/bot attacks
// - Loops infinitos
// ═══════════════════════════════════════════════════════════════════════════

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface EntryRateLimitConfig {
  // Max requests per phone per minute
  maxRequestsPerMinute: number;
  // Max requests per phone in sliding window (5 minutes)
  maxRequestsPerWindow: number;
  // Window size in seconds
  windowSizeSeconds: number;
  // Global max requests per minute (all phones)
  globalMaxPerMinute: number;
  // Enable/disable rate limiting
  enabled: boolean;
  // Soft limit (warn but allow)
  softLimitPerMinute: number;
}

export interface RateLimitCheckResult {
  allowed: boolean;
  reason: string;
  requestsInWindow: number;
  requestsInMinute: number;
  remainingInMinute: number;
  isSoftLimited: boolean;
  msUntilReset: number;
}

export interface RateLimitStats {
  phone: string;
  requestsLastMinute: number;
  requestsLastWindow: number;
  lastRequestAt: Date;
  isBlocked: boolean;
  blockedUntil: Date | null;
}

// ═══════════════════════════════════════════════════════════════
// DEFAULT CONFIG
// ═══════════════════════════════════════════════════════════════

const DEFAULT_CONFIG: EntryRateLimitConfig = {
  maxRequestsPerMinute: 30,      // Max 30 msgs/min per phone
  maxRequestsPerWindow: 100,     // Max 100 msgs/5min per phone
  windowSizeSeconds: 300,        // 5 minute window
  globalMaxPerMinute: 500,       // Max 500 msgs/min total
  enabled: true,
  softLimitPerMinute: 20,        // Warn after 20/min
};

// In-memory cache for rate limits (ephemeral per instance)
const phoneRequestCache = new Map<string, { timestamps: number[]; blocked?: boolean; blockedUntil?: number }>();
let globalRequestTimestamps: number[] = [];
let configCache: EntryRateLimitConfig | null = null;
let configLoadedAt = 0;
const CONFIG_TTL_MS = 60 * 1000; // 1 minute

// ═══════════════════════════════════════════════════════════════
// CONFIG LOADING
// ═══════════════════════════════════════════════════════════════

/**
 * Load rate limit config from database
 */
export async function loadEntryRateLimitConfig(
  supabase: SupabaseClient
): Promise<EntryRateLimitConfig> {
  const now = Date.now();
  
  if (configCache && (now - configLoadedAt) < CONFIG_TTL_MS) {
    return configCache;
  }

  try {
    const { data, error } = await supabase
      .from('configuracoes_sistema')
      .select('chave, valor')
      .in('chave', [
        'entry_rate_limit_enabled',
        'entry_rate_limit_max_per_minute',
        'entry_rate_limit_max_per_window',
        'entry_rate_limit_window_seconds',
        'entry_rate_limit_global_max_per_minute',
        'entry_rate_limit_soft_limit_per_minute',
      ]);

    if (error || !data || data.length === 0) {
      console.log('[ENTRY_RATE_LIMIT] Using default config');
      return DEFAULT_CONFIG;
    }

    const configMap = new Map<string, string>();
    for (const row of data) {
      configMap.set(row.chave, row.valor);
    }

    configCache = {
      enabled: configMap.get('entry_rate_limit_enabled') !== 'false',
      maxRequestsPerMinute: parseInt(configMap.get('entry_rate_limit_max_per_minute') || '') || DEFAULT_CONFIG.maxRequestsPerMinute,
      maxRequestsPerWindow: parseInt(configMap.get('entry_rate_limit_max_per_window') || '') || DEFAULT_CONFIG.maxRequestsPerWindow,
      windowSizeSeconds: parseInt(configMap.get('entry_rate_limit_window_seconds') || '') || DEFAULT_CONFIG.windowSizeSeconds,
      globalMaxPerMinute: parseInt(configMap.get('entry_rate_limit_global_max_per_minute') || '') || DEFAULT_CONFIG.globalMaxPerMinute,
      softLimitPerMinute: parseInt(configMap.get('entry_rate_limit_soft_limit_per_minute') || '') || DEFAULT_CONFIG.softLimitPerMinute,
    };

    configLoadedAt = now;
    console.log('[ENTRY_RATE_LIMIT] Config loaded from DB');
    return configCache;
  } catch (err) {
    console.warn('[ENTRY_RATE_LIMIT] Failed to load config:', err);
    return DEFAULT_CONFIG;
  }
}

// ═══════════════════════════════════════════════════════════════
// CORE RATE LIMITING LOGIC
// ═══════════════════════════════════════════════════════════════

/**
 * Clean old timestamps from cache
 */
function cleanOldTimestamps(timestamps: number[], maxAgeMs: number): number[] {
  const cutoff = Date.now() - maxAgeMs;
  return timestamps.filter(ts => ts > cutoff);
}

/**
 * Check if a phone number is rate limited
 */
export async function checkEntryRateLimit(
  supabase: SupabaseClient,
  phone: string,
  agentId: string = 'sofia'
): Promise<RateLimitCheckResult> {
  const config = await loadEntryRateLimitConfig(supabase);
  
  if (!config.enabled) {
    return {
      allowed: true,
      reason: 'rate_limiting_disabled',
      requestsInWindow: 0,
      requestsInMinute: 0,
      remainingInMinute: config.maxRequestsPerMinute,
      isSoftLimited: false,
      msUntilReset: 0,
    };
  }

  const now = Date.now();
  const oneMinuteAgo = now - 60 * 1000;
  const windowAgo = now - config.windowSizeSeconds * 1000;

  // Get or create phone entry
  let phoneEntry = phoneRequestCache.get(phone);
  if (!phoneEntry) {
    phoneEntry = { timestamps: [] };
    phoneRequestCache.set(phone, phoneEntry);
  }

  // Check if phone is blocked
  if (phoneEntry.blocked && phoneEntry.blockedUntil && phoneEntry.blockedUntil > now) {
    const msUntilReset = phoneEntry.blockedUntil - now;
    return {
      allowed: false,
      reason: 'phone_temporarily_blocked',
      requestsInWindow: phoneEntry.timestamps.length,
      requestsInMinute: 0,
      remainingInMinute: 0,
      isSoftLimited: true,
      msUntilReset,
    };
  }

  // Clean old timestamps
  phoneEntry.timestamps = cleanOldTimestamps(phoneEntry.timestamps, config.windowSizeSeconds * 1000);
  globalRequestTimestamps = cleanOldTimestamps(globalRequestTimestamps, 60 * 1000);

  // Count requests
  const requestsInMinute = phoneEntry.timestamps.filter(ts => ts > oneMinuteAgo).length;
  const requestsInWindow = phoneEntry.timestamps.length;
  const globalRequestsInMinute = globalRequestTimestamps.length;

  // Check global limit
  if (globalRequestsInMinute >= config.globalMaxPerMinute) {
    console.warn(`[ENTRY_RATE_LIMIT] 🚨 Global limit reached: ${globalRequestsInMinute}/${config.globalMaxPerMinute}`);
    return {
      allowed: false,
      reason: 'global_rate_limit_exceeded',
      requestsInWindow,
      requestsInMinute,
      remainingInMinute: 0,
      isSoftLimited: false,
      msUntilReset: 60 * 1000,
    };
  }

  // Check per-phone minute limit
  if (requestsInMinute >= config.maxRequestsPerMinute) {
    console.warn(`[ENTRY_RATE_LIMIT] ⚠️ Phone ${phone} exceeded minute limit: ${requestsInMinute}/${config.maxRequestsPerMinute}`);
    
    // Block phone for 1 minute
    phoneEntry.blocked = true;
    phoneEntry.blockedUntil = now + 60 * 1000;
    
    // Log to database for analytics
    await logRateLimitViolation(supabase, phone, agentId, 'minute_limit', requestsInMinute);
    
    return {
      allowed: false,
      reason: 'phone_minute_limit_exceeded',
      requestsInWindow,
      requestsInMinute,
      remainingInMinute: 0,
      isSoftLimited: false,
      msUntilReset: 60 * 1000,
    };
  }

  // Check per-phone window limit
  if (requestsInWindow >= config.maxRequestsPerWindow) {
    console.warn(`[ENTRY_RATE_LIMIT] ⚠️ Phone ${phone} exceeded window limit: ${requestsInWindow}/${config.maxRequestsPerWindow}`);
    
    // Block phone for rest of window
    phoneEntry.blocked = true;
    phoneEntry.blockedUntil = now + (config.windowSizeSeconds * 1000);
    
    await logRateLimitViolation(supabase, phone, agentId, 'window_limit', requestsInWindow);
    
    return {
      allowed: false,
      reason: 'phone_window_limit_exceeded',
      requestsInWindow,
      requestsInMinute,
      remainingInMinute: 0,
      isSoftLimited: false,
      msUntilReset: config.windowSizeSeconds * 1000,
    };
  }

  // Check soft limit (warn but allow)
  const isSoftLimited = requestsInMinute >= config.softLimitPerMinute;
  if (isSoftLimited) {
    console.log(`[ENTRY_RATE_LIMIT] 📊 Phone ${phone} near limit: ${requestsInMinute}/${config.maxRequestsPerMinute}`);
  }

  // Record this request
  phoneEntry.timestamps.push(now);
  globalRequestTimestamps.push(now);

  return {
    allowed: true,
    reason: 'allowed',
    requestsInWindow,
    requestsInMinute: requestsInMinute + 1,
    remainingInMinute: config.maxRequestsPerMinute - requestsInMinute - 1,
    isSoftLimited,
    msUntilReset: 0,
  };
}

// ═══════════════════════════════════════════════════════════════
// LOGGING & ANALYTICS
// ═══════════════════════════════════════════════════════════════

/**
 * Log rate limit violation for analytics
 */
async function logRateLimitViolation(
  supabase: SupabaseClient,
  phone: string,
  agentId: string,
  violationType: string,
  requestCount: number
): Promise<void> {
  try {
    await supabase.from('rate_limit_violations').insert({
      phone,
      agent_id: agentId,
      violation_type: violationType,
      request_count: requestCount,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    // Non-blocking - don't fail the request if logging fails
    console.warn('[ENTRY_RATE_LIMIT] Failed to log violation:', err);
  }
}

/**
 * Get rate limit stats for a phone
 */
export function getRateLimitStats(phone: string): RateLimitStats | null {
  const entry = phoneRequestCache.get(phone);
  if (!entry) return null;

  const now = Date.now();
  const oneMinuteAgo = now - 60 * 1000;

  return {
    phone,
    requestsLastMinute: entry.timestamps.filter(ts => ts > oneMinuteAgo).length,
    requestsLastWindow: entry.timestamps.length,
    lastRequestAt: new Date(entry.timestamps[entry.timestamps.length - 1] || 0),
    isBlocked: entry.blocked || false,
    blockedUntil: entry.blockedUntil ? new Date(entry.blockedUntil) : null,
  };
}

/**
 * Clear rate limit for a phone (manual unblock)
 */
export function clearPhoneRateLimit(phone: string): void {
  phoneRequestCache.delete(phone);
  console.log(`[ENTRY_RATE_LIMIT] Cleared rate limit for: ${phone}`);
}

/**
 * Get global rate limit stats
 */
export function getGlobalRateLimitStats(): {
  requestsLastMinute: number;
  uniquePhonesActive: number;
  blockedPhones: number;
} {
  const now = Date.now();
  const oneMinuteAgo = now - 60 * 1000;

  let blockedCount = 0;
  phoneRequestCache.forEach(entry => {
    if (entry.blocked && entry.blockedUntil && entry.blockedUntil > now) {
      blockedCount++;
    }
  });

  return {
    requestsLastMinute: globalRequestTimestamps.filter(ts => ts > oneMinuteAgo).length,
    uniquePhonesActive: phoneRequestCache.size,
    blockedPhones: blockedCount,
  };
}

// ═══════════════════════════════════════════════════════════════
// MIDDLEWARE FOR WEBHOOK
// ═══════════════════════════════════════════════════════════════

/**
 * Middleware function for webhook entry point
 * Returns null if allowed, or Response if blocked
 */
export async function rateLimitMiddleware(
  supabase: SupabaseClient,
  phone: string,
  agentId: string = 'sofia'
): Promise<Response | null> {
  const result = await checkEntryRateLimit(supabase, phone, agentId);

  if (!result.allowed) {
    console.warn(`[ENTRY_RATE_LIMIT] 🚫 Blocked request from ${phone}: ${result.reason}`);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: 'rate_limited',
        reason: result.reason,
        retryAfterMs: result.msUntilReset,
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(Math.ceil(result.msUntilReset / 1000)),
        },
      }
    );
  }

  // Log soft limit warning
  if (result.isSoftLimited) {
    console.log(`[ENTRY_RATE_LIMIT] ⚠️ Soft limit warning for ${phone}: ${result.requestsInMinute} requests/min`);
  }

  return null; // Allow request
}
