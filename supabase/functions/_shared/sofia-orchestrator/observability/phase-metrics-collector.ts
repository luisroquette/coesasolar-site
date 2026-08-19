/**
 * Phase Metrics Collector
 * 
 * Collects timing and result metrics for each phase of the orchestrator pipeline.
 * Designed to be instantiated per-request and persisted at the end.
 */

import type {
  PhaseMetric,
  PhaseEndResult,
  TraceContext,
  MetricsSummary,
  PhaseBottleneck,
  MetricsConfig,
} from './types.ts';
import { PHASE_THRESHOLDS, BOTTLENECK_THRESHOLD_MS, STATUS_SYMBOLS, LOG_PREFIX } from './constants.ts';
import { logPhaseWithThreshold, logTraceSummary, createContextLogger } from './structured-logger.ts';

export class PhaseMetricsCollector {
  private readonly traceContext: TraceContext;
  private readonly metrics: Map<string, PhaseMetric> = new Map();
  private readonly phaseOrder: string[] = [];
  private currentPhase: string | null = null;
  private readonly startTime: number;
  private readonly config: MetricsConfig;
  private readonly logger: ReturnType<typeof createContextLogger>;

  constructor(context: TraceContext, config: MetricsConfig = {}) {
    this.traceContext = context;
    this.startTime = Date.now();
    this.config = config;
    this.logger = createContextLogger(context);
  }

  /**
   * Starts tracking a new phase
   */
  startPhase(phaseName: string, phaseIndex: number): void {
    // End previous phase if still running
    if (this.currentPhase && this.metrics.get(this.currentPhase)?.status === 'started') {
      this.endPhase(this.currentPhase, { handled: false });
    }

    this.currentPhase = phaseName;
    this.phaseOrder.push(phaseName);

    const metric: PhaseMetric = {
      phaseName,
      phaseIndex,
      startedAt: new Date(),
      status: 'started',
      handled: false,
      skipped: false,
    };

    this.metrics.set(phaseName, metric);
    this.logger.phaseStart(phaseName, phaseIndex);
  }

  /**
   * Ends a phase with success
   */
  endPhase(phaseName: string, result: PhaseEndResult = {}): void {
    const metric = this.metrics.get(phaseName);
    if (!metric) {
      console.warn(`${LOG_PREFIX.WARN} Attempted to end unknown phase: ${phaseName}`);
      return;
    }

    if (metric.status !== 'started') {
      console.warn(`${LOG_PREFIX.WARN} Phase ${phaseName} already ended with status: ${metric.status}`);
      return;
    }

    const endedAt = new Date();
    const durationMs = endedAt.getTime() - metric.startedAt.getTime();

    Object.assign(metric, {
      endedAt,
      durationMs,
      status: 'completed',
      handled: result.handled ?? false,
      action: result.action,
      responseSummary: result.responseSummary,
      metadata: result.metadata,
    });

    this.logger.phaseEnd(phaseName, durationMs, result.handled ?? false);

    // Check thresholds
    const threshold = this.getThreshold(phaseName);
    if (threshold) {
      logPhaseWithThreshold(phaseName, durationMs, threshold, this.traceContext);
    }

    // Clear current phase if this was it
    if (this.currentPhase === phaseName) {
      this.currentPhase = null;
    }
  }

  /**
   * Marks a phase as skipped
   */
  skipPhase(phaseName: string, reason: string, phaseIndex: number): void {
    const now = new Date();
    
    this.metrics.set(phaseName, {
      phaseName,
      phaseIndex,
      startedAt: now,
      endedAt: now,
      durationMs: 0,
      status: 'skipped',
      handled: false,
      skipped: true,
      skipReason: reason,
    });

    this.phaseOrder.push(phaseName);
    this.logger.phaseSkip(phaseName, reason);
  }

  /**
   * Marks a phase as failed
   */
  failPhase(phaseName: string, error: Error): void {
    const metric = this.metrics.get(phaseName);
    if (!metric) {
      // Create a new metric for the failed phase
      this.metrics.set(phaseName, {
        phaseName,
        phaseIndex: -1,
        startedAt: new Date(),
        endedAt: new Date(),
        durationMs: 0,
        status: 'failed',
        handled: false,
        skipped: false,
        errorType: error.name,
        errorMessage: error.message,
      });
    } else {
      const endedAt = new Date();
      Object.assign(metric, {
        endedAt,
        durationMs: endedAt.getTime() - metric.startedAt.getTime(),
        status: 'failed',
        errorType: error.name,
        errorMessage: error.message,
      });
    }

    this.logger.phaseFail(phaseName, error);

    if (this.currentPhase === phaseName) {
      this.currentPhase = null;
    }
  }

  /**
   * Adds metadata to an existing phase
   */
  addPhaseMetadata(phaseName: string, metadata: Record<string, unknown>): void {
    const metric = this.metrics.get(phaseName);
    if (metric) {
      metric.metadata = { ...metric.metadata, ...metadata };
    }
  }

  /**
   * Gets the threshold for a phase (custom or default)
   */
  private getThreshold(phaseName: string): { warning: number; critical: number } | null {
    // Check custom thresholds first
    const customThreshold = this.config.customThresholds?.[phaseName];
    if (customThreshold) {
      return customThreshold;
    }

    // Fall back to default thresholds
    return PHASE_THRESHOLDS[phaseName] ?? null;
  }

  /**
   * Generates a summary of all metrics
   */
  getSummary(): MetricsSummary {
    const allMetrics = [...this.metrics.values()];
    const executed = allMetrics.filter(m => !m.skipped);
    const failed = executed.filter(m => m.status === 'failed');
    const handled = executed.filter(m => m.handled);
    const skipped = allMetrics.filter(m => m.skipped);

    const durations: PhaseBottleneck[] = executed
      .filter(m => m.durationMs !== undefined)
      .map(m => ({ phase: m.phaseName, durationMs: m.durationMs! }))
      .sort((a, b) => b.durationMs - a.durationMs);

    const bottlenecks = durations.filter(d => d.durationMs > BOTTLENECK_THRESHOLD_MS);

    // Log bottlenecks
    for (const bottleneck of bottlenecks) {
      this.logger.bottleneck(bottleneck.phase, bottleneck.durationMs);
    }

    return {
      totalDurationMs: Date.now() - this.startTime,
      phasesExecuted: executed.length,
      phasesSkipped: skipped.length,
      phasesHandled: handled.length,
      phasesFailed: failed.length,
      slowestPhase: durations[0] ?? null,
      bottlenecks,
      phaseOrder: this.phaseOrder,
    };
  }

  /**
   * Returns all metrics for persistence
   */
  getAllMetrics(): PhaseMetric[] {
    return [...this.metrics.values()];
  }

  /**
   * Returns the trace context
   */
  getTraceContext(): TraceContext {
    return this.traceContext;
  }

  /**
   * Returns the config (for adapter integration)
   */
  getConfig(): MetricsConfig {
    return this.config;
  }

  /**
   * Gets a specific phase metric
   */
  getPhaseMetric(phaseName: string): PhaseMetric | undefined {
    return this.metrics.get(phaseName);
  }

  /**
   * Checks if a phase was already executed
   */
  hasPhase(phaseName: string): boolean {
    return this.metrics.has(phaseName);
  }

  /**
   * Gets the current running phase
   */
  getCurrentPhase(): string | null {
    return this.currentPhase;
  }

  /**
   * Logs the final trace summary
   */
  logSummary(): void {
    const summary = this.getSummary();
    logTraceSummary(
      this.traceContext,
      summary.totalDurationMs,
      summary.phasesExecuted,
      summary.phasesHandled,
      summary.phasesFailed > 0
    );
  }

  /**
   * Finalizes collection (ends any running phases)
   */
  finalize(): MetricsSummary {
    // End any still-running phase
    if (this.currentPhase) {
      const metric = this.metrics.get(this.currentPhase);
      if (metric?.status === 'started') {
        this.endPhase(this.currentPhase, { handled: false });
      }
    }

    this.logSummary();
    return this.getSummary();
  }
}

/**
 * Creates a new PhaseMetricsCollector instance
 */
export function createMetricsCollector(
  context: TraceContext,
  config?: MetricsConfig
): PhaseMetricsCollector {
  return new PhaseMetricsCollector(context, config);
}

/**
 * Generates a new trace ID
 */
export function generateTraceId(): string {
  return crypto.randomUUID();
}
