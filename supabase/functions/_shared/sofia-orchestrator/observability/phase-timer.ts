/**
 * Phase Timer Utility
 * 
 * High-precision timing for phase execution measurement
 */

import type { PhaseTimer } from './types.ts';

export class PhaseTimerImpl implements PhaseTimer {
  private startTime: number | null = null;
  private endTime: number | null = null;
  private _isRunning = false;

  start(): void {
    if (this._isRunning) {
      console.warn('[PHASE_TIMER] Timer already running, resetting...');
    }
    this.startTime = performance.now();
    this.endTime = null;
    this._isRunning = true;
  }

  end(): number {
    if (!this._isRunning || this.startTime === null) {
      console.warn('[PHASE_TIMER] Timer not running');
      return 0;
    }
    
    this.endTime = performance.now();
    this._isRunning = false;
    return this.getDurationMs();
  }

  getDurationMs(): number {
    if (this.startTime === null) {
      return 0;
    }
    
    const end = this.endTime ?? performance.now();
    return Math.round(end - this.startTime);
  }

  isRunning(): boolean {
    return this._isRunning;
  }

  reset(): void {
    this.startTime = null;
    this.endTime = null;
    this._isRunning = false;
  }
}

/**
 * Creates a new phase timer instance
 */
export function createPhaseTimer(): PhaseTimer {
  return new PhaseTimerImpl();
}

/**
 * Utility to measure async function execution time
 */
export async function measureAsync<T>(
  fn: () => Promise<T>,
  label?: string
): Promise<{ result: T; durationMs: number }> {
  const timer = createPhaseTimer();
  timer.start();
  
  try {
    const result = await fn();
    const durationMs = timer.end();
    
    if (label) {
      console.log(`[TIMER] ${label}: ${durationMs}ms`);
    }
    
    return { result, durationMs };
  } catch (error) {
    const durationMs = timer.end();
    if (label) {
      console.error(`[TIMER] ${label} failed after ${durationMs}ms`);
    }
    throw error;
  }
}

/**
 * Utility to measure sync function execution time
 */
export function measureSync<T>(
  fn: () => T,
  label?: string
): { result: T; durationMs: number } {
  const timer = createPhaseTimer();
  timer.start();
  
  try {
    const result = fn();
    const durationMs = timer.end();
    
    if (label) {
      console.log(`[TIMER] ${label}: ${durationMs}ms`);
    }
    
    return { result, durationMs };
  } catch (error) {
    const durationMs = timer.end();
    if (label) {
      console.error(`[TIMER] ${label} failed after ${durationMs}ms`);
    }
    throw error;
  }
}
