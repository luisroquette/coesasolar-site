/**
 * FSM OBSERVABILITY - Logging detalhado para o Formulário Livre Guiado
 * 
 * Módulo centralizado para instrumentação do FSM de vendas da Sofia.
 * Registra transições, detecções off-script, coleta de dados e sincronização Bitrix.
 * 
 * @module _shared/fsm-observability
 */

import { FunnelState, FSM_STATE_LABELS, type FSMContext, type TransitionConditions } from './guided-script-fsm.ts';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type FSMEventType =
  | 'state_transition'
  | 'off_script_detected'
  | 'off_script_redirected'
  | 'data_collected'
  | 'data_validated'
  | 'data_validation_failed'
  | 'condition_met'
  | 'condition_blocked'
  | 'bitrix_sync_triggered'
  | 'bitrix_sync_success'
  | 'bitrix_sync_failed'
  | 'auto_transition'
  | 'manual_transition'
  | 'fsm_context_built'
  | 'fsm_check_executed';

export interface FSMLogEntry {
  timestamp: string;
  traceId: string;
  conversaId: string | null;
  agentId: string;
  phone: string | null;
  eventType: FSMEventType;
  currentState: FunnelState;
  previousState?: FunnelState;
  targetState?: FunnelState;
  conditions: Partial<TransitionConditions>;
  details: Record<string, unknown>;
  durationMs?: number;
}

export interface FSMTransitionLog {
  from: FunnelState;
  to: FunnelState;
  trigger: 'auto' | 'manual' | 'condition_met';
  conditionsMet: string[];
  conditionsBlocked: string[];
  bitrixStage?: string;
}

export interface FSMDataCollectionLog {
  field: string;
  value: string | number | null;
  source: 'extraction' | 'manual' | 'confirmation' | 'fallback';
  isValid: boolean;
  validationError?: string;
  alternatives?: string[];
}

export interface FSMOffScriptLog {
  intendedAction: string;
  patternMatched: string;
  currentStep: string;
  redirectMessage: string;
  wasBlocked: boolean;
}

// ═══════════════════════════════════════════════════════════════
// LOGGER CLASS
// ═══════════════════════════════════════════════════════════════

const LOG_PREFIX = '[FSM_OBS]';
const LOG_SYMBOLS = {
  state_transition: '🔄',
  off_script_detected: '⚠️',
  off_script_redirected: '🚫',
  data_collected: '📥',
  data_validated: '✅',
  data_validation_failed: '❌',
  condition_met: '✓',
  condition_blocked: '✗',
  bitrix_sync_triggered: '🔗',
  bitrix_sync_success: '✅',
  bitrix_sync_failed: '💥',
  auto_transition: '⚡',
  manual_transition: '👆',
  fsm_context_built: '🏗️',
  fsm_check_executed: '🔍',
};

export class FSMObserver {
  private traceId: string;
  private conversaId: string | null;
  private agentId: string;
  private phone: string | null;
  private logs: FSMLogEntry[] = [];
  private startTime: number;
  private supabase: any;

  constructor(params: {
    traceId: string;
    conversaId: string | null;
    agentId: string;
    phone: string | null;
    supabase?: any;
  }) {
    this.traceId = params.traceId;
    this.conversaId = params.conversaId;
    this.agentId = params.agentId;
    this.phone = params.phone;
    this.startTime = Date.now();
    this.supabase = params.supabase;
  }

  // ─────────────────────────────────────────────────────────────
  // CORE LOGGING METHODS
  // ─────────────────────────────────────────────────────────────

  /**
   * Log a state transition
   */
  logTransition(params: {
    from: FunnelState;
    to: FunnelState;
    trigger: 'auto' | 'manual' | 'condition_met';
    conditions: TransitionConditions;
    bitrixStage?: string;
  }): void {
    const conditionsMet = Object.entries(params.conditions)
      .filter(([_, v]) => v)
      .map(([k]) => k);
    const conditionsBlocked = Object.entries(params.conditions)
      .filter(([_, v]) => !v)
      .map(([k]) => k);

    const entry = this.createEntry('state_transition', params.from, {
      previousState: params.from,
      targetState: params.to,
      details: {
        trigger: params.trigger,
        conditionsMet,
        conditionsBlocked,
        bitrixStage: params.bitrixStage,
        fromLabel: FSM_STATE_LABELS[params.from],
        toLabel: FSM_STATE_LABELS[params.to],
      },
      conditions: params.conditions,
    });

    this.log(entry, `${FSM_STATE_LABELS[params.from]} → ${FSM_STATE_LABELS[params.to]} (${params.trigger})`);
  }

  /**
   * Log off-script detection
   */
  logOffScript(params: {
    currentState: FunnelState;
    intendedAction: string;
    patternMatched: string;
    redirectMessage: string;
    wasBlocked: boolean;
  }): void {
    const eventType = params.wasBlocked ? 'off_script_redirected' : 'off_script_detected';
    
    const entry = this.createEntry(eventType, params.currentState, {
      details: {
        intendedAction: params.intendedAction,
        patternMatched: params.patternMatched,
        currentStep: FSM_STATE_LABELS[params.currentState],
        redirectMessage: params.redirectMessage.substring(0, 100),
        wasBlocked: params.wasBlocked,
      },
    });

    this.log(entry, `Off-script: ${params.intendedAction} (blocked: ${params.wasBlocked})`);
  }

  /**
   * Log data collection event
   */
  logDataCollected(params: {
    currentState: FunnelState;
    field: string;
    value: string | number | null;
    source: 'extraction' | 'manual' | 'confirmation' | 'fallback';
    isValid: boolean;
    validationError?: string;
    conditions?: Partial<TransitionConditions>;
  }): void {
    const eventType = params.isValid ? 'data_validated' : 'data_validation_failed';
    
    const entry = this.createEntry(eventType, params.currentState, {
      details: {
        field: params.field,
        valueType: typeof params.value,
        valueLength: String(params.value || '').length,
        source: params.source,
        isValid: params.isValid,
        validationError: params.validationError,
        // Don't log actual values for privacy
        hasValue: !!params.value,
      },
      conditions: params.conditions || {},
    });

    const status = params.isValid ? '✓' : '✗';
    this.log(entry, `${params.field} ${status} (source: ${params.source})`);
  }

  /**
   * Log condition status change
   */
  logCondition(params: {
    currentState: FunnelState;
    condition: keyof TransitionConditions;
    met: boolean;
    reason?: string;
    conditions: Partial<TransitionConditions>;
  }): void {
    const eventType = params.met ? 'condition_met' : 'condition_blocked';
    
    const entry = this.createEntry(eventType, params.currentState, {
      details: {
        condition: params.condition,
        met: params.met,
        reason: params.reason,
      },
      conditions: params.conditions,
    });

    const status = params.met ? '✓' : '✗';
    this.log(entry, `Condition ${params.condition} ${status}`);
  }

  /**
   * Log Bitrix24 sync event
   */
  logBitrixSync(params: {
    currentState: FunnelState;
    action: 'triggered' | 'success' | 'failed';
    leadId?: string;
    fromStage?: string;
    toStage?: string;
    error?: string;
    durationMs?: number;
  }): void {
    const eventTypeMap = {
      triggered: 'bitrix_sync_triggered',
      success: 'bitrix_sync_success',
      failed: 'bitrix_sync_failed',
    } as const;
    
    const entry = this.createEntry(eventTypeMap[params.action], params.currentState, {
      details: {
        leadId: params.leadId,
        fromStage: params.fromStage,
        toStage: params.toStage,
        error: params.error,
      },
      durationMs: params.durationMs,
    });

    const detail = params.toStage ? `→ ${params.toStage}` : (params.error || 'unknown');
    this.log(entry, `Bitrix ${params.action}: ${detail}`);
  }

  /**
   * Log FSM context build
   */
  logContextBuilt(ctx: FSMContext): void {
    const entry = this.createEntry('fsm_context_built', ctx.currentState, {
      details: {
        currentStateLabel: FSM_STATE_LABELS[ctx.currentState],
        hasProposalUrl: !!ctx.proposalUrl,
        hasContractUrl: !!ctx.contractUrl,
        hasClienteName: !!ctx.clienteNome,
      },
      conditions: ctx.conditions,
    });

    this.log(entry, `Context built: ${FSM_STATE_LABELS[ctx.currentState]}`);
  }

  /**
   * Log FSM check execution
   */
  logFSMCheck(params: {
    currentState: FunnelState;
    shouldBlock: boolean;
    isOffScript: boolean;
    autoTransitionTo?: FunnelState;
    durationMs: number;
  }): void {
    const entry = this.createEntry('fsm_check_executed', params.currentState, {
      details: {
        shouldBlock: params.shouldBlock,
        isOffScript: params.isOffScript,
        autoTransitionTo: params.autoTransitionTo ? FSM_STATE_LABELS[params.autoTransitionTo] : null,
      },
      durationMs: params.durationMs,
    });

    const result = params.shouldBlock ? 'BLOCKED' : (params.autoTransitionTo ? `AUTO→${FSM_STATE_LABELS[params.autoTransitionTo]}` : 'PASS');
    this.log(entry, `Check: ${result} (${params.durationMs}ms)`);
  }

  // ─────────────────────────────────────────────────────────────
  // SUMMARY & PERSISTENCE
  // ─────────────────────────────────────────────────────────────

  /**
   * Get summary of all FSM events in this trace
   */
  getSummary(): {
    totalEvents: number;
    transitions: number;
    offScriptBlocked: number;
    dataFieldsCollected: number;
    bitrixSyncs: number;
    totalDurationMs: number;
    finalState: FunnelState | null;
  } {
    const transitions = this.logs.filter(l => l.eventType === 'state_transition').length;
    const offScriptBlocked = this.logs.filter(l => l.eventType === 'off_script_redirected').length;
    const dataFieldsCollected = this.logs.filter(l => l.eventType === 'data_validated').length;
    const bitrixSyncs = this.logs.filter(l => l.eventType.startsWith('bitrix_sync')).length;
    const lastLog = this.logs[this.logs.length - 1];

    return {
      totalEvents: this.logs.length,
      transitions,
      offScriptBlocked,
      dataFieldsCollected,
      bitrixSyncs,
      totalDurationMs: Date.now() - this.startTime,
      finalState: lastLog?.currentState || null,
    };
  }

  /**
   * Get all logs
   */
  getLogs(): FSMLogEntry[] {
    return [...this.logs];
  }

  /**
   * Persist logs to database (async, non-blocking)
   */
  async persistAsync(): Promise<void> {
    if (!this.supabase || this.logs.length === 0) return;

    try {
      const summary = this.getSummary();
      
      await this.supabase.from('fsm_trace_logs').insert({
        trace_id: this.traceId,
        conversa_id: this.conversaId,
        agent_id: this.agentId,
        phone: this.phone,
        events: this.logs,
        summary,
        created_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error(`${LOG_PREFIX} Failed to persist FSM logs:`, err);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ─────────────────────────────────────────────────────────────

  private createEntry(
    eventType: FSMEventType,
    currentState: FunnelState,
    extra: Partial<Omit<FSMLogEntry, 'timestamp' | 'traceId' | 'conversaId' | 'agentId' | 'phone' | 'eventType' | 'currentState'>>
  ): FSMLogEntry {
    return {
      timestamp: new Date().toISOString(),
      traceId: this.traceId,
      conversaId: this.conversaId,
      agentId: this.agentId,
      phone: this.phone,
      eventType,
      currentState,
      conditions: {},
      details: {},
      ...extra,
    };
  }

  private log(entry: FSMLogEntry, message: string): void {
    this.logs.push(entry);
    
    const symbol = LOG_SYMBOLS[entry.eventType] || '•';
    const stateLabel = FSM_STATE_LABELS[entry.currentState];
    const duration = entry.durationMs ? ` (${entry.durationMs}ms)` : '';
    
    console.log(`${LOG_PREFIX} ${symbol} [${stateLabel}] ${message}${duration}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// FACTORY FUNCTION
// ═══════════════════════════════════════════════════════════════

/**
 * Create a new FSM observer for a conversation
 */
export function createFSMObserver(params: {
  traceId: string;
  conversaId: string | null;
  agentId: string;
  phone: string | null;
  supabase?: any;
}): FSMObserver {
  return new FSMObserver(params);
}

// ═══════════════════════════════════════════════════════════════
// STANDALONE LOGGING FUNCTIONS (for quick logs without observer)
// ═══════════════════════════════════════════════════════════════

export function logFSMEvent(
  eventType: FSMEventType,
  state: FunnelState,
  message: string,
  details?: Record<string, unknown>
): void {
  const symbol = LOG_SYMBOLS[eventType] || '•';
  const stateLabel = FSM_STATE_LABELS[state];
  const detailStr = details ? ` | ${JSON.stringify(details)}` : '';
  
  console.log(`${LOG_PREFIX} ${symbol} [${stateLabel}] ${message}${detailStr}`);
}

export function logFSMTransitionQuick(
  from: FunnelState,
  to: FunnelState,
  trigger: string
): void {
  console.log(`${LOG_PREFIX} 🔄 [TRANSITION] ${FSM_STATE_LABELS[from]} → ${FSM_STATE_LABELS[to]} (${trigger})`);
}

export function logFSMConditionsSnapshot(
  state: FunnelState,
  conditions: TransitionConditions
): void {
  const met = Object.entries(conditions).filter(([_, v]) => v).map(([k]) => k);
  const blocked = Object.entries(conditions).filter(([_, v]) => !v).map(([k]) => k);
  
  console.log(`${LOG_PREFIX} 📊 [CONDITIONS] State: ${FSM_STATE_LABELS[state]}`);
  console.log(`${LOG_PREFIX}    ✓ Met: ${met.join(', ') || 'none'}`);
  console.log(`${LOG_PREFIX}    ✗ Blocked: ${blocked.join(', ') || 'none'}`);
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════

export {
  FunnelState,
  FSM_STATE_LABELS,
} from './guided-script-fsm.ts';
