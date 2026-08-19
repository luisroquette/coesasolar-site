/**
 * Observability Module Index
 * 
 * Central export point for all observability utilities
 * 
 * Modules:
 * - Phase Metrics: Latency tracking per pipeline phase
 * - Rule Memory Metrics: Rule application and compliance
 * - RAG Quality Metrics: Search quality and cache performance
 * - Metrics Aggregator: Unified reporting and persistence
 */

// Types
export type {
  PhaseStatus,
  PhaseMetric,
  PhaseEndResult,
  TraceContext,
  PhaseTimer,
  PhaseBottleneck,
  MetricsSummary,
  LogLevel,
  StructuredLogEntry,
  PhaseThreshold,
  MetricsConfig,
  PhaseLogRecord,
} from './types.ts';

// Constants
export {
  PHASE_THRESHOLDS,
  RETENTION_DAYS,
  LOG_BATCH_SIZE,
  BOTTLENECK_THRESHOLD_MS,
  PHASE_INDICES,
  LOG_PREFIX,
  STATUS_SYMBOLS,
} from './constants.ts';

// Phase Timer
export {
  PhaseTimerImpl,
  createPhaseTimer,
  measureAsync,
  measureSync,
} from './phase-timer.ts';

// Structured Logger
export {
  structuredLog,
  createContextLogger,
  logPhaseWithThreshold,
  formatTraceId,
  logTraceSummary,
} from './structured-logger.ts';

// Metrics Collector
export {
  PhaseMetricsCollector,
  createMetricsCollector,
  generateTraceId,
} from './phase-metrics-collector.ts';

// Metrics Persister
export {
  persistPhaseMetrics,
  persistMetricsSummary,
  persistAllMetrics,
  persistMetricsAsync,
  persistMetricsWithTimeout,
  getSlowPhases,
  getTraceById,
} from './metrics-persister.ts';

// Rule Memory Metrics
export {
  createRuleTracker,
  trackRuleApplication,
  finalizeRuleStats,
  getSessionRuleAggregates,
  formatRuleMemoryReport,
  clearSessionRuleStats,
  type RuleApplication,
  type RuleMemoryStats,
  type AggregatedRuleStats,
} from './rule-memory-metrics.ts';

// RAG Quality Metrics
export {
  createRAGSearchResult,
  finalizeRAGResult,
  getRAGQualityStats,
  formatRAGQualityReport,
  checkRAGQualityAlerts,
  clearSessionRAGResults,
  type RAGSearchResult,
  type RAGQualityStats,
} from './rag-quality-metrics.ts';

// Metrics Aggregator
export {
  generateAggregatedReport,
  formatFullObservabilityReport,
  persistAggregatedMetrics,
  cleanupOldMetrics,
  getMetricsSnapshots,
  type AggregatedObservabilityReport,
  type PersistenceResult,
} from './metrics-aggregator.ts';

// Prompt Size Metrics
export {
  PromptSizeCollector,
  createPromptSizeCollector,
  measurePromptSize,
  logPromptSize,
  formatSectionsForStorage,
  DEFAULT_THRESHOLDS as PROMPT_SIZE_THRESHOLDS,
  type PromptSizeMetrics,
  type PromptSectionSize,
  type PromptSizeThresholds,
} from './prompt-size-metrics.ts';

// =============================================================================
// CONVENIENCE FACTORY
// =============================================================================

import type { TraceContext, MetricsConfig } from './types.ts';
import { PhaseMetricsCollector } from './phase-metrics-collector.ts';
import { generateTraceId } from './phase-metrics-collector.ts';
import { createRuleTracker, type RuleMemoryStats } from './rule-memory-metrics.ts';
import { createRAGSearchResult, type RAGSearchResult } from './rag-quality-metrics.ts';

/**
 * Creates a fully initialized observability context for a request
 */
export function initializeObservability(
  options: {
    conversaId?: string;
    messageId?: string;
    agentId: string;
    adapterClass?: string;
    config?: MetricsConfig;
  }
): {
  collector: PhaseMetricsCollector;
  traceId: string;
  context: TraceContext;
  ruleTracker: RuleMemoryStats;
} {
  const traceId = generateTraceId();
  
  const context: TraceContext = {
    traceId,
    conversaId: options.conversaId,
    messageId: options.messageId,
    agentId: options.agentId,
    adapterClass: options.adapterClass,
  };

  const collector = new PhaseMetricsCollector(context, options.config);
  const ruleTracker = createRuleTracker(options.conversaId || '', options.agentId);

  return {
    collector,
    traceId,
    context,
    ruleTracker,
  };
}

/**
 * Creates a RAG search tracker
 */
export function initializeRAGTracker(
  conversaId: string,
  agentId: string,
  query: string
): RAGSearchResult {
  return createRAGSearchResult(conversaId, agentId, query);
}

/**
 * Helper to wrap a phase execution with automatic metrics collection
 */
export async function withPhaseMetrics<T>(
  collector: PhaseMetricsCollector | undefined,
  phaseName: string,
  phaseIndex: number,
  fn: () => Promise<{ handled: boolean; [key: string]: unknown }>
): Promise<T> {
  collector?.startPhase(phaseName, phaseIndex);

  try {
    const result = await fn();
    
    collector?.endPhase(phaseName, {
      handled: result.handled,
      action: result.action as string | undefined,
      metadata: result.metadata as Record<string, unknown> | undefined,
    });

    return result as T;
  } catch (error) {
    collector?.failPhase(phaseName, error as Error);
    throw error;
  }
}
