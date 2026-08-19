/**
 * Batch Processor - Rate-Limited Concurrent Processing
 * 
 * Provides utilities for processing large datasets with controlled concurrency
 * Designed to avoid API rate limits while maximizing throughput
 * 
 * Created as part of Performance Sprint 3
 */

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface BatchProcessorOptions {
  /** Items per batch (default: 10) */
  batchSize: number;
  /** Maximum concurrent batches (default: 3) */
  maxConcurrent: number;
  /** Optional delay between batch groups in ms (default: 0) */
  delayBetweenGroups?: number;
  /** Optional callback for progress tracking */
  onProgress?: (processed: number, total: number) => void;
}

export interface ProcessResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  index: number;
}

export interface BatchResult<T> {
  results: ProcessResult<T>[];
  succeeded: number;
  failed: number;
  totalTime: number;
}

// ═══════════════════════════════════════════════════════════════
// CORE BATCH PROCESSOR
// ═══════════════════════════════════════════════════════════════

/**
 * Process items in batches with controlled concurrency
 * 
 * Example: 100 chunks with batchSize=10, maxConcurrent=3
 * - Creates 10 batches of 10 items each
 * - Processes 3 batches in parallel at a time
 * - Result: 4 rounds × ~2s = ~8s (vs 20 batches × 2s = ~40s sequential)
 * 
 * @param items - Array of items to process
 * @param processor - Async function to process each item
 * @param options - Batch configuration
 * @returns Aggregated results with success/failure counts
 */
export async function processBatchWithConcurrency<T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  options: Partial<BatchProcessorOptions> = {}
): Promise<BatchResult<R>> {
  const {
    batchSize = 10,
    maxConcurrent = 3,
    delayBetweenGroups = 0,
    onProgress,
  } = options;

  const startTime = Date.now();
  const results: ProcessResult<R>[] = [];
  let succeeded = 0;
  let failed = 0;
  let processed = 0;

  // Create batches
  const batches: { item: T; index: number }[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(
      items.slice(i, i + batchSize).map((item, j) => ({
        item,
        index: i + j,
      }))
    );
  }

  // Process batches in groups of maxConcurrent
  for (let i = 0; i < batches.length; i += maxConcurrent) {
    const concurrentBatches = batches.slice(i, i + maxConcurrent);

    // Process all batches in this group concurrently
    const groupResults = await Promise.all(
      concurrentBatches.map(async (batch) => {
        // Process items within each batch concurrently
        return Promise.all(
          batch.map(async ({ item, index }) => {
            try {
              const data = await processor(item, index);
              return { success: true, data, index } as ProcessResult<R>;
            } catch (error) {
              return {
                success: false,
                error: error instanceof Error ? error : new Error(String(error)),
                index,
              } as ProcessResult<R>;
            }
          })
        );
      })
    );

    // Aggregate results
    for (const batchResults of groupResults) {
      for (const result of batchResults) {
        results.push(result);
        processed++;
        if (result.success) {
          succeeded++;
        } else {
          failed++;
        }
      }
    }

    // Progress callback
    if (onProgress) {
      onProgress(processed, items.length);
    }

    // Optional delay between groups (for rate limiting)
    if (delayBetweenGroups > 0 && i + maxConcurrent < batches.length) {
      await new Promise((r) => setTimeout(r, delayBetweenGroups));
    }
  }

  return {
    results,
    succeeded,
    failed,
    totalTime: Date.now() - startTime,
  };
}

// ═══════════════════════════════════════════════════════════════
// SIMPLE BATCH PROCESSOR (for simpler use cases)
// ═══════════════════════════════════════════════════════════════

/**
 * Simple batch processor - processes batches and returns flattened results
 * Throws on first error (use processBatchWithConcurrency for error handling)
 * 
 * @param items - Array of items to process
 * @param batchSize - Items per batch
 * @param maxConcurrent - Concurrent batches
 * @param processor - Function to process a batch of items
 * @returns Flattened array of results
 */
export async function processInBatches<T, R>(
  items: T[],
  batchSize: number,
  maxConcurrent: number,
  processor: (batch: T[]) => Promise<R[]>
): Promise<R[]> {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }

  const results: R[] = [];
  for (let i = 0; i < batches.length; i += maxConcurrent) {
    const concurrentBatches = batches.slice(i, i + maxConcurrent);
    const batchResults = await Promise.all(
      concurrentBatches.map((batch) => processor(batch))
    );
    results.push(...batchResults.flat());
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════
// EXPONENTIAL BACKOFF
// ═══════════════════════════════════════════════════════════════

export interface BackoffOptions {
  /** Initial delay in ms (default: 100) */
  initialMs: number;
  /** Maximum delay in ms (default: 30000) */
  maxMs: number;
  /** Multiplier per attempt (default: 2) */
  multiplier: number;
  /** Add random jitter (default: true) */
  jitter?: boolean;
}

/**
 * Creates a backoff controller for retry logic
 * 
 * Usage:
 * ```ts
 * const backoff = createBackoff({ initialMs: 100, maxMs: 5000, multiplier: 2 });
 * 
 * while (retries < maxRetries) {
 *   try {
 *     await apiCall();
 *     break;
 *   } catch (err) {
 *     await backoff.wait();
 *   }
 * }
 * ```
 */
export function createBackoff(options: Partial<BackoffOptions> = {}) {
  const { initialMs = 100, maxMs = 30000, multiplier = 2, jitter = true } = options;
  let attempt = 0;

  return {
    /** Wait for the calculated delay */
    async wait(): Promise<void> {
      let delay = Math.min(initialMs * Math.pow(multiplier, attempt), maxMs);

      // Add jitter (±20%)
      if (jitter) {
        const jitterFactor = 0.2;
        delay = delay * (1 + (Math.random() * 2 - 1) * jitterFactor);
      }

      attempt++;
      await new Promise((r) => setTimeout(r, Math.floor(delay)));
    },

    /** Get the next delay without waiting */
    getNextDelay(): number {
      return Math.min(initialMs * Math.pow(multiplier, attempt), maxMs);
    },

    /** Reset the backoff counter */
    reset(): void {
      attempt = 0;
    },

    /** Get current attempt number */
    getAttempt(): number {
      return attempt;
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// RATE LIMITER
// ═══════════════════════════════════════════════════════════════

export interface RateLimiterOptions {
  /** Maximum concurrent operations */
  maxConcurrent: number;
  /** Minimum delay between operations in ms */
  minDelayMs?: number;
}

/**
 * Simple rate limiter for controlling concurrent API calls
 * 
 * Usage:
 * ```ts
 * const limiter = createRateLimiter({ maxConcurrent: 5 });
 * 
 * const results = await Promise.all(
 *   items.map(item => limiter.execute(() => processItem(item)))
 * );
 * ```
 */
export function createRateLimiter(options: RateLimiterOptions) {
  const { maxConcurrent, minDelayMs = 0 } = options;
  let running = 0;
  const queue: (() => void)[] = [];

  const tryNext = () => {
    if (running < maxConcurrent && queue.length > 0) {
      running++;
      const next = queue.shift();
      next?.();
    }
  };

  return {
    async execute<T>(fn: () => Promise<T>): Promise<T> {
      // Wait for slot
      if (running >= maxConcurrent) {
        await new Promise<void>((resolve) => queue.push(resolve));
      } else {
        running++;
      }

      try {
        // Optional minimum delay
        if (minDelayMs > 0) {
          await new Promise((r) => setTimeout(r, minDelayMs));
        }
        return await fn();
      } finally {
        running--;
        tryNext();
      }
    },

    /** Get current number of running operations */
    getRunning(): number {
      return running;
    },

    /** Get number of queued operations */
    getQueueLength(): number {
      return queue.length;
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// PARALLEL FOLDER PROCESSOR (for OneDrive sync)
// ═══════════════════════════════════════════════════════════════

/**
 * Process folders in parallel without fixed delays
 * Replaces: for (folder) { await process(); await delay(500); }
 * 
 * @param folders - Array of folders to process
 * @param processor - Async function to process each folder
 * @param concurrency - Number of concurrent folder operations (default: 2)
 * @returns Array of results or errors
 */
export async function processFoldersParallel<T, R>(
  folders: T[],
  processor: (folder: T, index: number) => Promise<R>,
  concurrency: number = 2
): Promise<{ results: R[]; errors: Error[] }> {
  const results: R[] = [];
  const errors: Error[] = [];

  for (let i = 0; i < folders.length; i += concurrency) {
    const batch = folders.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map((folder, j) => processor(folder, i + j))
    );

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        errors.push(
          result.reason instanceof Error
            ? result.reason
            : new Error(String(result.reason))
        );
      }
    }
  }

  return { results, errors };
}
