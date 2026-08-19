/**
 * Observability Constants for Sofia Orchestrator
 * 
 * Defines thresholds, retention policies, and configuration
 */

import type { PhaseThreshold } from './types.ts';

// =============================================================================
// PHASE THRESHOLDS (in milliseconds)
// =============================================================================

export const PHASE_THRESHOLDS: Record<string, PhaseThreshold> = {
  // Ultra-fast phases (< 50ms expected)
  global_pause: { warning: 50, critical: 100 },
  
  // Fast phases (< 100ms expected)
  operator: { warning: 200, critical: 500 },
  greeting: { warning: 100, critical: 300 },
  blocked_stage: { warning: 100, critical: 250 },
  human_intervention: { warning: 100, critical: 250 },
  
  // Medium phases (< 500ms expected)
  triage: { warning: 500, critical: 1000 },
  fast_path: { warning: 500, critical: 1000 },
  validation: { warning: 300, critical: 700 },
  data_collection: { warning: 500, critical: 1000 },
  webhook_initialization: { warning: 300, critical: 600 },
  conversation_lookup: { warning: 200, critical: 500 },
  message_history: { warning: 300, critical: 600 },
  
  // Slow phases (LLM, RAG, external APIs)
  llm: { warning: 3000, critical: 6000 },
  context_building: { warning: 1000, critical: 2000 },
  rag_retrieval: { warning: 1500, critical: 3000 },
  response: { warning: 1500, critical: 3000 },
  response_send: { warning: 2000, critical: 4000 },
  
  // Very slow phases (media, heavy processing)
  media_processing: { warning: 5000, critical: 10000 },
  audio_transcription: { warning: 8000, critical: 15000 },
  document_analysis: { warning: 10000, critical: 20000 },
  
  // External integrations
  bitrix_sync: { warning: 2000, critical: 5000 },
  whatsapp_send: { warning: 3000, critical: 6000 },
};

// =============================================================================
// RETENTION & BATCH SETTINGS
// =============================================================================

export const RETENTION_DAYS = 14;
export const LOG_BATCH_SIZE = 50;
export const BOTTLENECK_THRESHOLD_MS = 500;

// Prompt size targets (AGENTS.md compliance)
export const PROMPT_SIZE_TARGET_CHARS = 8000;
export const PROMPT_SIZE_WARNING_CHARS = 10000;
export const PROMPT_SIZE_CRITICAL_CHARS = 12000;

// =============================================================================
// PHASE INDICES (canonical ordering)
// =============================================================================

export const PHASE_INDICES: Record<string, number> = {
  webhook_initialization: 0,
  global_pause: 1,
  operator: 2,
  blocked_stage: 3,
  human_intervention: 4,
  greeting: 5,
  triage: 6,
  conversation_lookup: 7,
  message_history: 8,
  context_building: 9,
  fast_path: 10,
  data_collection: 11,
  validation: 12,
  media_processing: 13,
  rag_retrieval: 14,
  llm: 15,
  response: 16,
  response_send: 17,
  learning: 18,
};

// =============================================================================
// LOG PREFIXES
// =============================================================================

export const LOG_PREFIX = {
  METRICS: '[METRICS]',
  TRACE: '[TRACE]',
  PHASE: '[PHASE]',
  ERROR: '[ERROR]',
  WARN: '[WARN]',
  PERF: '[PERF]',
} as const;

// =============================================================================
// STATUS SYMBOLS (for console output)
// =============================================================================

export const STATUS_SYMBOLS = {
  started: '▶',
  completed: '✓',
  failed: '✗',
  skipped: '⏭',
  warning: '⚠',
  bottleneck: '🐢',
} as const;
