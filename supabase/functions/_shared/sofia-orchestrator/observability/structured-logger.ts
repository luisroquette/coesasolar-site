/**
 * Structured Logger for Sofia Orchestrator
 * 
 * Provides consistent JSON-formatted logging for log aggregators
 */

import type { LogLevel, StructuredLogEntry, TraceContext } from './types.ts';
import { LOG_PREFIX, STATUS_SYMBOLS } from './constants.ts';

/**
 * Logs a structured entry with consistent formatting
 */
export function structuredLog(
  level: LogLevel,
  phase: string,
  message: string,
  context: TraceContext,
  data?: Record<string, unknown>
): void {
  const entry: StructuredLogEntry = {
    timestamp: new Date().toISOString(),
    level,
    phase,
    message,
    traceId: context.traceId,
    agentId: context.agentId,
    ...(data && { data }),
  };
  
  const prefix = `[${phase.toUpperCase()}]`;
  const formattedMessage = `${prefix} ${message}`;
  const jsonEntry = JSON.stringify(entry);
  
  switch (level) {
    case 'error':
      console.error(formattedMessage, jsonEntry);
      break;
    case 'warn':
      console.warn(formattedMessage, jsonEntry);
      break;
    case 'debug':
      console.log(formattedMessage, jsonEntry);
      break;
    default:
      console.log(formattedMessage);
  }
}

/**
 * Shorthand logging functions with context binding
 */
export function createContextLogger(context: TraceContext) {
  return {
    debug: (phase: string, message: string, data?: Record<string, unknown>) =>
      structuredLog('debug', phase, message, context, data),
      
    info: (phase: string, message: string, data?: Record<string, unknown>) =>
      structuredLog('info', phase, message, context, data),
      
    warn: (phase: string, message: string, data?: Record<string, unknown>) =>
      structuredLog('warn', phase, message, context, data),
      
    error: (phase: string, message: string, data?: Record<string, unknown>) =>
      structuredLog('error', phase, message, context, data),
      
    phaseStart: (phase: string, index: number) =>
      console.log(`${LOG_PREFIX.METRICS} ${STATUS_SYMBOLS.started} ${phase} [${index}] started`),
      
    phaseEnd: (phase: string, durationMs: number, handled: boolean) =>
      console.log(
        `${LOG_PREFIX.METRICS} ${STATUS_SYMBOLS.completed} ${phase} completed in ${durationMs}ms` +
        (handled ? ' (HANDLED)' : '')
      ),
      
    phaseSkip: (phase: string, reason: string) =>
      console.log(`${LOG_PREFIX.METRICS} ${STATUS_SYMBOLS.skipped} ${phase} skipped: ${reason}`),
      
    phaseFail: (phase: string, error: Error) =>
      console.error(`${LOG_PREFIX.METRICS} ${STATUS_SYMBOLS.failed} ${phase} failed: ${error.message}`),
      
    bottleneck: (phase: string, durationMs: number) =>
      console.warn(`${LOG_PREFIX.PERF} ${STATUS_SYMBOLS.bottleneck} Bottleneck: ${phase} took ${durationMs}ms`),
  };
}

/**
 * Log phase timing with threshold checks
 */
export function logPhaseWithThreshold(
  phase: string,
  durationMs: number,
  threshold: { warning: number; critical: number },
  context: TraceContext
): void {
  if (durationMs >= threshold.critical) {
    structuredLog('error', phase, `Critical latency: ${durationMs}ms (threshold: ${threshold.critical}ms)`, context, {
      durationMs,
      threshold: 'critical',
    });
  } else if (durationMs >= threshold.warning) {
    structuredLog('warn', phase, `Slow phase: ${durationMs}ms (threshold: ${threshold.warning}ms)`, context, {
      durationMs,
      threshold: 'warning',
    });
  }
}

/**
 * Formats trace ID for logging (shortened version)
 */
export function formatTraceId(traceId: string): string {
  if (traceId.length <= 8) return traceId;
  return `${traceId.slice(0, 4)}...${traceId.slice(-4)}`;
}

/**
 * Creates a summary log line for the entire trace
 */
export function logTraceSummary(
  context: TraceContext,
  totalDurationMs: number,
  phasesExecuted: number,
  phasesHandled: number,
  hasErrors: boolean
): void {
  const status = hasErrors ? '❌' : '✅';
  const shortTrace = formatTraceId(context.traceId);
  
  console.log(
    `${LOG_PREFIX.TRACE} ${status} [${shortTrace}] ` +
    `agent=${context.agentId} ` +
    `total=${totalDurationMs}ms ` +
    `phases=${phasesExecuted} ` +
    `handled=${phasesHandled}`
  );
}
