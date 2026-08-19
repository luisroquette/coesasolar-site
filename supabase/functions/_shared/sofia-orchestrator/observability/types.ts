/**
 * Observability Types for Sofia Orchestrator
 * 
 * Defines interfaces for phase metrics collection, tracing, and logging
 */

// =============================================================================
// PHASE METRICS
// =============================================================================

export type PhaseStatus = 'started' | 'completed' | 'failed' | 'skipped';

export interface PhaseMetric {
  phaseName: string;
  phaseIndex: number;
  startedAt: Date;
  endedAt?: Date;
  durationMs?: number;
  status: PhaseStatus;
  handled: boolean;
  skipped: boolean;
  skipReason?: string;
  action?: string;
  responseSummary?: string;
  errorType?: string;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

export interface PhaseEndResult {
  handled?: boolean;
  action?: string;
  responseSummary?: string;
  metadata?: Record<string, unknown>;
}

// =============================================================================
// TRACE CONTEXT
// =============================================================================

export interface TraceContext {
  traceId: string;
  conversaId?: string;
  messageId?: string;
  agentId: string;
  adapterClass?: string;
}

// =============================================================================
// TIMER
// =============================================================================

export interface PhaseTimer {
  start(): void;
  end(): number;
  getDurationMs(): number;
  isRunning(): boolean;
}

// =============================================================================
// SUMMARY
// =============================================================================

export interface PhaseBottleneck {
  phase: string;
  durationMs: number;
}

export interface MetricsSummary {
  totalDurationMs: number;
  phasesExecuted: number;
  phasesSkipped: number;
  phasesHandled: number;
  phasesFailed: number;
  slowestPhase: PhaseBottleneck | null;
  bottlenecks: PhaseBottleneck[];
  phaseOrder: string[];
}

// =============================================================================
// LOGGING
// =============================================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface StructuredLogEntry {
  timestamp: string;
  level: LogLevel;
  phase: string;
  message: string;
  traceId: string;
  agentId: string;
  durationMs?: number;
  data?: Record<string, unknown>;
}

// =============================================================================
// THRESHOLDS
// =============================================================================

export interface PhaseThreshold {
  warning: number;
  critical: number;
}

export interface MetricsConfig {
  additionalTags?: Record<string, string>;
  customThresholds?: Record<string, PhaseThreshold>;
}

// =============================================================================
// PERSISTENCE
// =============================================================================

export interface PhaseLogRecord {
  trace_id: string;
  conversa_id: string | null;
  message_id: string | null;
  agent_id: string;
  adapter_class: string | null;
  phase_name: string;
  phase_index: number;
  started_at: string;
  ended_at: string | null;
  duration_ms: number | null;
  status: PhaseStatus;
  handled: boolean;
  skipped: boolean;
  skip_reason: string | null;
  action: string | null;
  response_summary: string | null;
  error_type: string | null;
  error_message: string | null;
  metadata: Record<string, unknown>;
}
