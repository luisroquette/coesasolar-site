/**
 * Lock Helpers Module
 * Centralized lock management utilities for cross-webhook coordination
 * 
 * Eliminates ~10 duplicate lock release patterns across the codebase
 * 
 * @module lock-helpers
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface LockAcquisitionResult {
  acquired: boolean;
  lockId?: string;
  existingLockedBy?: string;
  error?: string;
}

export interface LockReleaseResult {
  released: boolean;
  error?: string;
}

export type LockPurpose = 
  | 'message_processing' 
  | 'bitrix_sync' 
  | 'proposal_generation'
  | 'document_processing'
  | 'followup_sending'
  | 'status_transition';

// ═══════════════════════════════════════════════════════════════
// LOCK ACQUISITION
// ═══════════════════════════════════════════════════════════════

/**
 * Acquire a cross-webhook lock for a phone number
 * 
 * @param phone Normalized phone number
 * @param lockedBy Identifier of the acquiring service (e.g., 'sofia-webhook')
 * @param purpose Optional purpose for debugging
 * @param ttlSeconds Lock TTL in seconds (default 30)
 */
export async function acquireLock(
  supabase: SupabaseClient,
  phone: string,
  lockedBy: string,
  purpose?: LockPurpose,
  ttlSeconds = 30
): Promise<LockAcquisitionResult> {
  try {
    const { data, error } = await supabase.rpc('acquire_cross_webhook_lock', {
      p_phone: phone,
      p_locked_by: lockedBy,
      p_purpose: purpose || 'message_processing',
      p_ttl_seconds: ttlSeconds,
    });

    if (error) {
      console.error(`[LOCK_HELPERS] Failed to acquire lock for ${phone}:`, error);
      return { acquired: false, error: error.message };
    }

    // RPC returns the lock record if acquired, or null if already locked
    if (data) {
      return { acquired: true, lockId: data.id };
    }

    // Try to get info about existing lock
    const { data: existingLock } = await supabase
      .from('cross_webhook_locks')
      .select('locked_by')
      .eq('phone_normalized', phone)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    return { 
      acquired: false, 
      existingLockedBy: existingLock?.locked_by,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[LOCK_HELPERS] Exception acquiring lock for ${phone}:`, errorMsg);
    return { acquired: false, error: errorMsg };
  }
}

/**
 * Try to acquire lock with retries
 */
export async function acquireLockWithRetry(
  supabase: SupabaseClient,
  phone: string,
  lockedBy: string,
  options: {
    purpose?: LockPurpose;
    ttlSeconds?: number;
    maxRetries?: number;
    retryDelayMs?: number;
  } = {}
): Promise<LockAcquisitionResult> {
  const {
    purpose,
    ttlSeconds = 30,
    maxRetries = 3,
    retryDelayMs = 500,
  } = options;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const result = await acquireLock(supabase, phone, lockedBy, purpose, ttlSeconds);
    
    if (result.acquired) {
      return result;
    }

    if (attempt < maxRetries) {
      console.log(`[LOCK_HELPERS] Lock attempt ${attempt}/${maxRetries} failed for ${phone}, retrying...`);
      await new Promise(resolve => setTimeout(resolve, retryDelayMs * attempt));
    }
  }

  console.warn(`[LOCK_HELPERS] Failed to acquire lock for ${phone} after ${maxRetries} attempts`);
  return { acquired: false, error: 'Max retries exceeded' };
}

// ═══════════════════════════════════════════════════════════════
// LOCK RELEASE
// ═══════════════════════════════════════════════════════════════

/**
 * Release a cross-webhook lock
 * 
 * @param phone Normalized phone number
 * @param lockedBy Identifier of the service that acquired the lock
 */
export async function releaseLock(
  supabase: SupabaseClient,
  phone: string,
  lockedBy: string
): Promise<LockReleaseResult> {
  try {
    const { error } = await supabase.rpc('release_cross_webhook_lock', {
      p_phone: phone,
      p_locked_by: lockedBy,
    });

    if (error) {
      console.warn(`[LOCK_HELPERS] Failed to release lock for ${phone}:`, error);
      return { released: false, error: error.message };
    }

    return { released: true };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.warn(`[LOCK_HELPERS] Exception releasing lock for ${phone}:`, errorMsg);
    return { released: false, error: errorMsg };
  }
}

/**
 * Release lock with silent failure (for cleanup in finally blocks)
 * 
 * @example
 * try {
 *   // ... processing
 * } finally {
 *   await releaseLockSilent(supabase, phone, 'sofia-webhook');
 * }
 */
export async function releaseLockSilent(
  supabase: SupabaseClient,
  phone: string,
  lockedBy: string
): Promise<void> {
  try {
    await supabase.rpc('release_cross_webhook_lock', {
      p_phone: phone,
      p_locked_by: lockedBy,
    });
  } catch {
    // Intentionally silent - used in cleanup
  }
}

// ═══════════════════════════════════════════════════════════════
// LOCK UTILITIES
// ═══════════════════════════════════════════════════════════════

/**
 * Check if a phone number is currently locked
 */
export async function isLocked(
  supabase: SupabaseClient,
  phone: string
): Promise<{ locked: boolean; lockedBy?: string; expiresAt?: string }> {
  try {
    const { data } = await supabase
      .from('cross_webhook_locks')
      .select('locked_by, expires_at')
      .eq('phone_normalized', phone)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (data) {
      return { 
        locked: true, 
        lockedBy: data.locked_by,
        expiresAt: data.expires_at,
      };
    }

    return { locked: false };
  } catch (err) {
    console.warn(`[LOCK_HELPERS] Exception checking lock for ${phone}:`, err);
    return { locked: false };
  }
}

/**
 * Extend an existing lock's TTL
 */
export async function extendLock(
  supabase: SupabaseClient,
  phone: string,
  lockedBy: string,
  additionalSeconds = 30
): Promise<boolean> {
  try {
    const newExpiry = new Date(Date.now() + additionalSeconds * 1000).toISOString();
    
    const { error } = await supabase
      .from('cross_webhook_locks')
      .update({ expires_at: newExpiry })
      .eq('phone_normalized', phone)
      .eq('locked_by', lockedBy)
      .gt('expires_at', new Date().toISOString());

    if (error) {
      console.warn(`[LOCK_HELPERS] Failed to extend lock for ${phone}:`, error);
      return false;
    }

    return true;
  } catch (err) {
    console.warn(`[LOCK_HELPERS] Exception extending lock for ${phone}:`, err);
    return false;
  }
}

/**
 * Force release all expired locks (cleanup utility)
 */
export async function cleanupExpiredLocks(
  supabase: SupabaseClient
): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('cross_webhook_locks')
      .delete()
      .lt('expires_at', new Date().toISOString())
      .select('id');

    if (error) {
      console.error('[LOCK_HELPERS] Failed to cleanup expired locks:', error);
      return 0;
    }

    const count = data?.length || 0;
    if (count > 0) {
      console.log(`[LOCK_HELPERS] Cleaned up ${count} expired locks`);
    }

    return count;
  } catch (err) {
    console.error('[LOCK_HELPERS] Exception cleaning up locks:', err);
    return 0;
  }
}

// ═══════════════════════════════════════════════════════════════
// SCOPED LOCK (with automatic cleanup)
// ═══════════════════════════════════════════════════════════════

/**
 * Execute a function with automatic lock acquisition and release
 * 
 * @example
 * const result = await withLock(supabase, phone, 'sofia-webhook', async () => {
 *   // ... your processing logic
 *   return processedData;
 * });
 */
export async function withLock<T>(
  supabase: SupabaseClient,
  phone: string,
  lockedBy: string,
  fn: () => Promise<T>,
  options: {
    purpose?: LockPurpose;
    ttlSeconds?: number;
    maxRetries?: number;
  } = {}
): Promise<{ success: boolean; result?: T; error?: string }> {
  const lockResult = await acquireLockWithRetry(supabase, phone, lockedBy, options);

  if (!lockResult.acquired) {
    return { 
      success: false, 
      error: `Failed to acquire lock: ${lockResult.error || 'already locked by ' + lockResult.existingLockedBy}`,
    };
  }

  try {
    const result = await fn();
    return { success: true, result };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { success: false, error: errorMsg };
  } finally {
    await releaseLockSilent(supabase, phone, lockedBy);
  }
}
