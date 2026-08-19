/**
 * Metrics Persister
 * 
 * Handles batch persistence of phase metrics to the database
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.90.0';
import type { PhaseLogRecord, MetricsSummary } from './types.ts';
import type { PromptSizeMetrics } from './prompt-size-metrics.ts';
import { PhaseMetricsCollector } from './phase-metrics-collector.ts';
import { LOG_PREFIX } from './constants.ts';

/**
 * Persists all phase metrics to the database
 */
export async function persistPhaseMetrics(
  supabase: SupabaseClient,
  collector: PhaseMetricsCollector
): Promise<{ success: boolean; count: number; error?: string }> {
  const context = collector.getTraceContext();
  const metrics = collector.getAllMetrics();

  if (metrics.length === 0) {
    return { success: true, count: 0 };
  }

  const records: PhaseLogRecord[] = metrics.map(m => ({
    trace_id: context.traceId,
    conversa_id: context.conversaId ?? null,
    message_id: context.messageId ?? null,
    agent_id: context.agentId,
    adapter_class: context.adapterClass ?? null,
    phase_name: m.phaseName,
    phase_index: m.phaseIndex,
    started_at: m.startedAt.toISOString(),
    ended_at: m.endedAt?.toISOString() ?? null,
    duration_ms: m.durationMs ?? null,
    status: m.status,
    handled: m.handled,
    skipped: m.skipped,
    skip_reason: m.skipReason ?? null,
    action: m.action ?? null,
    response_summary: m.responseSummary ?? null,
    error_type: m.errorType ?? null,
    error_message: m.errorMessage ?? null,
    metadata: m.metadata ?? {},
  }));

  try {
    const { error } = await supabase
      .from('orchestrator_phase_logs')
      .insert(records);

    if (error) {
      console.error(`${LOG_PREFIX.ERROR} Failed to persist phase metrics:`, error.message);
      return { success: false, count: 0, error: error.message };
    }

    console.log(`${LOG_PREFIX.METRICS} Persisted ${records.length} phase metrics for trace ${context.traceId.slice(0, 8)}`);
    return { success: true, count: records.length };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error(`${LOG_PREFIX.ERROR} Exception persisting metrics:`, errorMessage);
    return { success: false, count: 0, error: errorMessage };
  }
}

/**
 * Persists a summary metric to infra_metrics table
 */
export async function persistMetricsSummary(
  supabase: SupabaseClient,
  collector: PhaseMetricsCollector
): Promise<{ success: boolean; error?: string }> {
  const summary = collector.getSummary();
  const context = collector.getTraceContext();

  try {
    const { error } = await supabase.from('infra_metrics').insert({
      metric_name: 'orchestrator_total_duration',
      metric_value: summary.totalDurationMs,
      threshold_warning: 3000,
      threshold_critical: 5000,
      metadata: {
        trace_id: context.traceId,
        agent_id: context.agentId,
        adapter_class: context.adapterClass,
        phases_executed: summary.phasesExecuted,
        phases_skipped: summary.phasesSkipped,
        phases_handled: summary.phasesHandled,
        phases_failed: summary.phasesFailed,
        slowest_phase: summary.slowestPhase?.phase,
        slowest_phase_ms: summary.slowestPhase?.durationMs,
        bottleneck_count: summary.bottlenecks.length,
        phase_order: summary.phaseOrder,
      },
    });

    if (error) {
      console.error(`${LOG_PREFIX.ERROR} Failed to persist summary metric:`, error.message);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error(`${LOG_PREFIX.ERROR} Exception persisting summary:`, errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Persists both phase metrics and summary in a single call
 */
export async function persistAllMetrics(
  supabase: SupabaseClient,
  collector: PhaseMetricsCollector
): Promise<{ 
  phaseMetrics: { success: boolean; count: number; error?: string };
  summary: { success: boolean; error?: string };
}> {
  // Finalize collection first
  collector.finalize();

  // Persist in parallel
  const [phaseResult, summaryResult] = await Promise.all([
    persistPhaseMetrics(supabase, collector),
    persistMetricsSummary(supabase, collector),
  ]);

  return {
    phaseMetrics: phaseResult,
    summary: summaryResult,
  };
}

/**
 * Fire-and-forget persistence (non-blocking)
 * Use this when you don't want to wait for persistence
 */
export function persistMetricsAsync(
  supabase: SupabaseClient,
  collector: PhaseMetricsCollector
): void {
  // Schedule persistence without awaiting
  persistAllMetrics(supabase, collector).catch(err => {
    console.error(`${LOG_PREFIX.ERROR} Async persistence failed:`, err);
  });
}

/**
 * Safely persists metrics with timeout
 */
export async function persistMetricsWithTimeout(
  supabase: SupabaseClient,
  collector: PhaseMetricsCollector,
  timeoutMs: number = 5000
): Promise<boolean> {
  try {
    const result = await Promise.race([
      persistAllMetrics(supabase, collector),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Persistence timeout')), timeoutMs)
      ),
    ]);

    return result.phaseMetrics.success && result.summary.success;
  } catch (err) {
    console.error(`${LOG_PREFIX.ERROR} Persistence with timeout failed:`, err);
    return false;
  }
}

/**
 * Persists prompt size metrics to infra_metrics
 */
export async function persistPromptSizeMetrics(
  supabase: SupabaseClient,
  agentId: string,
  traceId: string,
  metrics: PromptSizeMetrics
): Promise<{ success: boolean; error?: string }> {
  try {
    const sectionBreakdown = metrics.sections.reduce((acc, s) => {
      acc[s.name] = { chars: s.chars, percentage: s.percentage };
      return acc;
    }, {} as Record<string, { chars: number; percentage: number }>);

    const { error } = await supabase.from('infra_metrics').insert({
      metric_name: 'prompt_size_chars',
      metric_value: metrics.totalChars,
      threshold_warning: 10000,  // 10KB warning
      threshold_critical: 12000, // 12KB critical
      metadata: {
        trace_id: traceId,
        agent_id: agentId,
        tokens_estimate: metrics.totalTokensEstimate,
        compression_ratio: metrics.compressionRatio,
        meets_target: metrics.meetsTarget,
        target_chars: metrics.targetChars,
        sections: sectionBreakdown,
      },
    });

    if (error) {
      console.error(`${LOG_PREFIX.ERROR} Failed to persist prompt size metrics:`, error.message);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error(`${LOG_PREFIX.ERROR} Exception persisting prompt size metrics:`, errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Query helper: Get recent slow phases
 */
export async function getSlowPhases(
  supabase: SupabaseClient,
  options: {
    agentId?: string;
    phaseName?: string;
    minDurationMs?: number;
    limit?: number;
  } = {}
): Promise<unknown[]> {
  const { agentId, phaseName, minDurationMs = 1000, limit = 50 } = options;

  let query = supabase
    .from('orchestrator_phase_logs')
    .select('*')
    .gt('duration_ms', minDurationMs)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (agentId) {
    query = query.eq('agent_id', agentId);
  }

  if (phaseName) {
    query = query.eq('phase_name', phaseName);
  }

  const { data, error } = await query;

  if (error) {
    console.error(`${LOG_PREFIX.ERROR} Failed to query slow phases:`, error.message);
    return [];
  }

  return data ?? [];
}

/**
 * Query helper: Get trace by ID
 */
export async function getTraceById(
  supabase: SupabaseClient,
  traceId: string
): Promise<unknown[]> {
  const { data, error } = await supabase
    .from('orchestrator_phase_logs')
    .select('*')
    .eq('trace_id', traceId)
    .order('phase_index', { ascending: true });

  if (error) {
    console.error(`${LOG_PREFIX.ERROR} Failed to query trace:`, error.message);
    return [];
  }

  return data ?? [];
}
