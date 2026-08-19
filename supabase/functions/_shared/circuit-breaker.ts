/**
 * CIRCUIT BREAKER - Resilience Pattern
 * 
 * Implements the circuit breaker pattern for external service calls.
 * Prevents cascading failures by temporarily blocking requests to failing services.
 * 
 * States:
 * - CLOSED: Normal operation, requests flow through
 * - OPEN: Service is failing, requests are blocked
 * - HALF_OPEN: Testing if service recovered
 * 
 * @module _shared/circuit-breaker
 */

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

export type CircuitState = 'closed' | 'open' | 'half_open';

export interface CircuitBreakerConfig {
  /** Unique identifier for this circuit */
  circuitId: string;
  /** Number of failures before opening circuit */
  failureThreshold: number;
  /** Time in ms to wait before trying again (half-open) */
  recoveryTimeMs: number;
  /** Number of successful calls in half-open to close circuit */
  successThreshold: number;
  /** Optional: Time window to count failures (ms) */
  failureWindowMs?: number;
}

export interface CircuitStatus {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureAt: string | null;
  lastSuccessAt: string | null;
  openedAt: string | null;
  nextRetryAt: string | null;
}

interface CircuitRecord {
  circuit_id: string;
  state: CircuitState;
  failure_count: number;
  success_count: number;
  last_failure_at: string | null;
  last_success_at: string | null;
  opened_at: string | null;
  config: CircuitBreakerConfig;
  updated_at: string;
}

// ═══════════════════════════════════════════════════════════════
// IN-MEMORY CACHE
// ═══════════════════════════════════════════════════════════════

const circuitCache = new Map<string, { status: CircuitStatus; timestamp: number }>();
const CACHE_TTL_MS = 5000; // 5 seconds

// ═══════════════════════════════════════════════════════════════
// DEFAULT CONFIGS
// ═══════════════════════════════════════════════════════════════

export const DEFAULT_CIRCUIT_CONFIGS: Record<string, Partial<CircuitBreakerConfig>> = {
  bitrix24: {
    failureThreshold: 5,
    recoveryTimeMs: 60 * 1000, // 1 minute
    successThreshold: 2,
    failureWindowMs: 5 * 60 * 1000, // 5 minute window
  },
  zapi: {
    failureThreshold: 3,
    recoveryTimeMs: 30 * 1000, // 30 seconds
    successThreshold: 1,
    failureWindowMs: 2 * 60 * 1000,
  },
  llm: {
    failureThreshold: 3,
    recoveryTimeMs: 10 * 1000, // 10 seconds (LLM recovers fast)
    successThreshold: 1,
    failureWindowMs: 60 * 1000,
  },
  proposal_generation: {
    failureThreshold: 3,
    recoveryTimeMs: 120 * 1000, // 2 minutes
    successThreshold: 2,
    failureWindowMs: 10 * 60 * 1000,
  },
};

// ═══════════════════════════════════════════════════════════════
// CORE FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Creates or gets a circuit breaker configuration
 */
export function createCircuitBreaker(
  circuitId: string,
  customConfig?: Partial<CircuitBreakerConfig>
): CircuitBreakerConfig {
  const defaultConfig = DEFAULT_CIRCUIT_CONFIGS[circuitId] || {};
  
  return {
    circuitId,
    failureThreshold: customConfig?.failureThreshold ?? defaultConfig.failureThreshold ?? 5,
    recoveryTimeMs: customConfig?.recoveryTimeMs ?? defaultConfig.recoveryTimeMs ?? 60000,
    successThreshold: customConfig?.successThreshold ?? defaultConfig.successThreshold ?? 2,
    failureWindowMs: customConfig?.failureWindowMs ?? defaultConfig.failureWindowMs ?? 300000,
  };
}

/**
 * Gets the current status of a circuit from database
 */
export async function getCircuitStatus(
  supabase: SupabaseClient,
  circuitId: string,
  config?: CircuitBreakerConfig
): Promise<CircuitStatus> {
  // Check cache first
  const cached = circuitCache.get(circuitId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.status;
  }

  const { data, error } = await supabase
    .from('circuit_breaker_state')
    .select('*')
    .eq('circuit_id', circuitId)
    .maybeSingle();

  if (error) {
    console.warn(`[circuit-breaker] Error fetching circuit ${circuitId}:`, error.message);
    // Return default closed state on error
    return {
      state: 'closed',
      failures: 0,
      successes: 0,
      lastFailureAt: null,
      lastSuccessAt: null,
      openedAt: null,
      nextRetryAt: null,
    };
  }

  if (!data) {
    // Initialize circuit if not exists
    const defaultConfig = config || createCircuitBreaker(circuitId);
    const now = new Date().toISOString();
    
    await supabase.from('circuit_breaker_state').insert({
      circuit_id: circuitId,
      state: 'closed',
      failure_count: 0,
      success_count: 0,
      config: defaultConfig,
      updated_at: now,
    });

    const status: CircuitStatus = {
      state: 'closed',
      failures: 0,
      successes: 0,
      lastFailureAt: null,
      lastSuccessAt: null,
      openedAt: null,
      nextRetryAt: null,
    };

    circuitCache.set(circuitId, { status, timestamp: Date.now() });
    return status;
  }

  const record = data as CircuitRecord;
  const recordConfig = record.config || createCircuitBreaker(circuitId);

  // Check if circuit should transition from OPEN to HALF_OPEN
  let currentState = record.state;
  if (currentState === 'open' && record.opened_at) {
    const openedAt = new Date(record.opened_at).getTime();
    const recoveryTime = recordConfig.recoveryTimeMs || 60000;
    
    if (Date.now() >= openedAt + recoveryTime) {
      // Transition to half-open
      currentState = 'half_open';
      await supabase
        .from('circuit_breaker_state')
        .update({ state: 'half_open', success_count: 0, updated_at: new Date().toISOString() })
        .eq('circuit_id', circuitId);
    }
  }

  const status: CircuitStatus = {
    state: currentState,
    failures: record.failure_count,
    successes: record.success_count,
    lastFailureAt: record.last_failure_at,
    lastSuccessAt: record.last_success_at,
    openedAt: record.opened_at,
    nextRetryAt: record.opened_at && currentState === 'open'
      ? new Date(new Date(record.opened_at).getTime() + (recordConfig.recoveryTimeMs || 60000)).toISOString()
      : null,
  };

  circuitCache.set(circuitId, { status, timestamp: Date.now() });
  return status;
}

/**
 * Checks if the circuit allows a request to pass through
 */
export async function canExecute(
  supabase: SupabaseClient,
  circuitId: string
): Promise<{ allowed: boolean; state: CircuitState; reason?: string }> {
  const status = await getCircuitStatus(supabase, circuitId);

  switch (status.state) {
    case 'closed':
      return { allowed: true, state: 'closed' };

    case 'half_open':
      // Allow limited requests in half-open
      return { allowed: true, state: 'half_open' };

    case 'open':
      return {
        allowed: false,
        state: 'open',
        reason: `Circuit open until ${status.nextRetryAt}`,
      };

    default:
      return { allowed: true, state: 'closed' };
  }
}

/**
 * Records a successful call
 */
export async function recordSuccess(
  supabase: SupabaseClient,
  circuitId: string,
  config?: CircuitBreakerConfig
): Promise<void> {
  const now = new Date().toISOString();
  const status = await getCircuitStatus(supabase, circuitId, config);
  const circuitConfig = config || createCircuitBreaker(circuitId);

  // Clear cache
  circuitCache.delete(circuitId);

  if (status.state === 'half_open') {
    const newSuccessCount = status.successes + 1;
    
    if (newSuccessCount >= circuitConfig.successThreshold) {
      // Close the circuit - service recovered
      console.log(`[circuit-breaker] ✅ Circuit ${circuitId} CLOSED - service recovered`);
      
      await supabase
        .from('circuit_breaker_state')
        .update({
          state: 'closed',
          failure_count: 0,
          success_count: 0,
          last_success_at: now,
          opened_at: null,
          updated_at: now,
        })
        .eq('circuit_id', circuitId);
    } else {
      // Increment success count
      await supabase
        .from('circuit_breaker_state')
        .update({
          success_count: newSuccessCount,
          last_success_at: now,
          updated_at: now,
        })
        .eq('circuit_id', circuitId);
    }
  } else {
    // Just record the success
    await supabase
      .from('circuit_breaker_state')
      .update({
        last_success_at: now,
        updated_at: now,
      })
      .eq('circuit_id', circuitId);
  }
}

/**
 * Records a failed call
 */
export async function recordFailure(
  supabase: SupabaseClient,
  circuitId: string,
  config?: CircuitBreakerConfig,
  errorMessage?: string
): Promise<{ circuitOpened: boolean }> {
  const now = new Date().toISOString();
  const status = await getCircuitStatus(supabase, circuitId, config);
  const circuitConfig = config || createCircuitBreaker(circuitId);

  // Clear cache
  circuitCache.delete(circuitId);

  // If in half-open, a failure immediately opens the circuit
  if (status.state === 'half_open') {
    console.log(`[circuit-breaker] 🔴 Circuit ${circuitId} OPENED (failed in half-open)`);
    
    await supabase
      .from('circuit_breaker_state')
      .update({
        state: 'open',
        failure_count: status.failures + 1,
        success_count: 0,
        last_failure_at: now,
        opened_at: now,
        updated_at: now,
      })
      .eq('circuit_id', circuitId);

    return { circuitOpened: true };
  }

  // Check if failures are within the window
  let effectiveFailures = status.failures;
  if (circuitConfig.failureWindowMs && status.lastFailureAt) {
    const lastFailureTime = new Date(status.lastFailureAt).getTime();
    if (Date.now() - lastFailureTime > circuitConfig.failureWindowMs) {
      // Reset failure count if outside window
      effectiveFailures = 0;
    }
  }

  const newFailureCount = effectiveFailures + 1;

  // Check if we should open the circuit
  if (newFailureCount >= circuitConfig.failureThreshold) {
    console.log(`[circuit-breaker] 🔴 Circuit ${circuitId} OPENED (${newFailureCount} failures)`);
    
    await supabase
      .from('circuit_breaker_state')
      .update({
        state: 'open',
        failure_count: newFailureCount,
        last_failure_at: now,
        opened_at: now,
        updated_at: now,
      })
      .eq('circuit_id', circuitId);

    return { circuitOpened: true };
  }

  // Just record the failure
  await supabase
    .from('circuit_breaker_state')
    .update({
      failure_count: newFailureCount,
      last_failure_at: now,
      updated_at: now,
    })
    .eq('circuit_id', circuitId);

  return { circuitOpened: false };
}

/**
 * Manually resets a circuit to closed state
 */
export async function resetCircuit(
  supabase: SupabaseClient,
  circuitId: string
): Promise<void> {
  circuitCache.delete(circuitId);
  
  await supabase
    .from('circuit_breaker_state')
    .update({
      state: 'closed',
      failure_count: 0,
      success_count: 0,
      opened_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('circuit_id', circuitId);

  console.log(`[circuit-breaker] 🔄 Circuit ${circuitId} manually reset to CLOSED`);
}

/**
 * Gets all circuit states for monitoring
 */
export async function getAllCircuitStates(
  supabase: SupabaseClient
): Promise<CircuitStatus[]> {
  const { data, error } = await supabase
    .from('circuit_breaker_state')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error || !data) {
    return [];
  }

  return (data as CircuitRecord[]).map((record) => ({
    state: record.state,
    failures: record.failure_count,
    successes: record.success_count,
    lastFailureAt: record.last_failure_at,
    lastSuccessAt: record.last_success_at,
    openedAt: record.opened_at,
    nextRetryAt: null,
  }));
}

// ═══════════════════════════════════════════════════════════════
// WRAPPER FUNCTION
// ═══════════════════════════════════════════════════════════════

/**
 * Wraps a function with circuit breaker protection
 */
export async function withCircuitBreaker<T>(
  supabase: SupabaseClient,
  circuitId: string,
  fn: () => Promise<T>,
  config?: CircuitBreakerConfig
): Promise<{ result?: T; blocked: boolean; error?: Error; circuitState: CircuitState }> {
  const circuitConfig = config || createCircuitBreaker(circuitId);
  
  // Check if circuit allows execution
  const { allowed, state, reason } = await canExecute(supabase, circuitId);
  
  if (!allowed) {
    console.log(`[circuit-breaker] ⛔ Request blocked for ${circuitId}: ${reason}`);
    return {
      blocked: true,
      circuitState: state,
      error: new Error(reason || 'Circuit is open'),
    };
  }

  try {
    const result = await fn();
    await recordSuccess(supabase, circuitId, circuitConfig);
    return { result, blocked: false, circuitState: state };
  } catch (error) {
    const { circuitOpened } = await recordFailure(
      supabase,
      circuitId,
      circuitConfig,
      error instanceof Error ? error.message : String(error)
    );
    
    return {
      blocked: false,
      circuitState: circuitOpened ? 'open' : state,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}
