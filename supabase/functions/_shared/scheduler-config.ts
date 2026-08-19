// ═══════════════════════════════════════════════════════════════════════════
// SCHEDULER CONFIG LOADER
// Centraliza carregamento dinâmico de configurações dos schedulers
// ═══════════════════════════════════════════════════════════════════════════

// Cache para configurações
let cachedConfig: SchedulerConfig | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

export interface NudgeDelays {
  1: number;
  2: number;
  3: number;
  [key: number]: number;
}

export interface ContractNudgeDelays {
  1: number;
  2: number;
  3: number;
  [key: number]: number;
}

export interface DocumentNudgeDelays {
  1: number;
  2: number;
  3: number;
  4: number;
  5: number;
  6: number;
  [key: number]: number;
}

export interface RescueSchedule {
  [attempt: number]: { delay_minutes: number; urgency: 'low' | 'medium' | 'high' | 'critical' };
}

export interface SchedulerConfig {
  // Nudge delays (ms)
  nudgeDelays: NudgeDelays;
  nudgeMaxCount: number;
  
  // Contract nudge delays (ms)
  contractNudgeDelays: ContractNudgeDelays;
  contractNudgeMaxCount: number;
  
  // Document nudge delays (ms)
  documentNudgeDelays: DocumentNudgeDelays;
  documentNudgeMaxCount: number;
  
  // Followup intervals (ms)
  followupHighScoreInterval: number;
  followupMediumHighInterval: number;
  followupMediumInterval: number;
  followupMinScore: number;
  
  // Message retry
  retryDelayMinutes: number[];
  retryMaxAttempts: number;
  retryBatchSize: number;
  retryAgentBlockReschedule: number;
  
  // Rescue scheduler
  rescueMaxAttempts: number;
  rescueSchedule: RescueSchedule;
  rescueBatchSize: number;
  rescueInactivityThreshold: number;
  
  // Rate limiting
  rateLimitBaseDelay: number;
  rateLimitBurstDelay: number;
  
  // Batch sizes
  nudgeBatchSize: number;
  followupBatchSize: number;
  messageDelayBetween: number;
}

// Fallbacks (valores originais hardcoded)
const DEFAULT_CONFIG: SchedulerConfig = {
  nudgeDelays: {
    1: 10 * 60 * 1000,  // 10 min
    2: 30 * 60 * 1000,  // 30 min
    3: 120 * 60 * 1000, // 2 hours
  },
  nudgeMaxCount: 3,
  
  contractNudgeDelays: {
    1: 2 * 60 * 60 * 1000,   // 2 hours
    2: 24 * 60 * 60 * 1000,  // 24 hours
    3: 48 * 60 * 60 * 1000,  // 48 hours
  },
  contractNudgeMaxCount: 3,
  
  documentNudgeDelays: {
    1: 5 * 60 * 1000,    // 5 min
    2: 10 * 60 * 1000,   // 10 min
    3: 15 * 60 * 1000,   // 15 min
    4: 25 * 60 * 1000,   // 25 min
    5: 60 * 60 * 1000,   // 1 hour
    6: 4 * 60 * 60 * 1000, // 4 hours
  },
  documentNudgeMaxCount: 6,
  
  followupHighScoreInterval: 24 * 60 * 60 * 1000,  // 24h
  followupMediumHighInterval: 48 * 60 * 60 * 1000, // 48h
  followupMediumInterval: 72 * 60 * 60 * 1000,     // 72h
  followupMinScore: 30,
  
  retryDelayMinutes: [5, 15, 30, 60, 120],
  retryMaxAttempts: 10,
  retryBatchSize: 20,
  retryAgentBlockReschedule: 30 * 60 * 1000, // 30 min
  
  rescueMaxAttempts: 7,
  rescueSchedule: {
    1: { delay_minutes: 30, urgency: 'low' },
    2: { delay_minutes: 60, urgency: 'low' },
    3: { delay_minutes: 120, urgency: 'medium' },
    4: { delay_minutes: 240, urgency: 'medium' },
    5: { delay_minutes: 24 * 60, urgency: 'high' },
    6: { delay_minutes: 72 * 60, urgency: 'high' },
    7: { delay_minutes: 168 * 60, urgency: 'critical' },
  },
  rescueBatchSize: 25,
  rescueInactivityThreshold: 30,
  
  rateLimitBaseDelay: 500,
  rateLimitBurstDelay: 2000,
  
  nudgeBatchSize: 50,
  followupBatchSize: 50,
  messageDelayBetween: 500,
};

/**
 * Carrega configurações dos schedulers do banco de dados
 * Usa cache de 5 minutos para performance
 */
export async function loadSchedulerConfig(supabase: any): Promise<SchedulerConfig> {
  const now = Date.now();
  
  // Usar cache se válido
  if (cachedConfig && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedConfig;
  }
  
  try {
    const { data, error } = await supabase
      .from('configuracoes_sistema')
      .select('chave, valor')
      .like('chave', 'scheduler_%');
    
    if (error) throw error;
    
    const configMap = new Map<string, string>();
    data?.forEach((item: { chave: string; valor: string }) => {
      configMap.set(item.chave, item.valor);
    });
    
    const parseInt = (key: string, fallback: number): number => {
      const val = configMap.get(key);
      if (!val) return fallback;
      const parsed = Number(val);
      return isNaN(parsed) ? fallback : Math.floor(parsed);
    };
    
    const parseJSON = <T>(key: string, fallback: T): T => {
      const val = configMap.get(key);
      if (!val) return fallback;
      try {
        return JSON.parse(val);
      } catch {
        return fallback;
      }
    };
    
    // Construir rescue schedule dinamicamente
    const rescueSchedule: RescueSchedule = {};
    for (let i = 1; i <= 7; i++) {
      const delay = parseInt(`scheduler_rescue_delay_${i}`, DEFAULT_CONFIG.rescueSchedule[i]?.delay_minutes || 30);
      let urgency: 'low' | 'medium' | 'high' | 'critical' = 'low';
      if (i >= 5) urgency = i === 7 ? 'critical' : 'high';
      else if (i >= 3) urgency = 'medium';
      rescueSchedule[i] = { delay_minutes: delay, urgency };
    }
    
    const config: SchedulerConfig = {
      nudgeDelays: {
        1: parseInt('scheduler_nudge_delay_1', DEFAULT_CONFIG.nudgeDelays[1]),
        2: parseInt('scheduler_nudge_delay_2', DEFAULT_CONFIG.nudgeDelays[2]),
        3: parseInt('scheduler_nudge_delay_3', DEFAULT_CONFIG.nudgeDelays[3]),
      },
      nudgeMaxCount: parseInt('scheduler_nudge_max_count', DEFAULT_CONFIG.nudgeMaxCount),
      
      contractNudgeDelays: {
        1: parseInt('scheduler_contract_nudge_delay_1', DEFAULT_CONFIG.contractNudgeDelays[1]),
        2: parseInt('scheduler_contract_nudge_delay_2', DEFAULT_CONFIG.contractNudgeDelays[2]),
        3: parseInt('scheduler_contract_nudge_delay_3', DEFAULT_CONFIG.contractNudgeDelays[3]),
      },
      contractNudgeMaxCount: parseInt('scheduler_contract_nudge_max_count', DEFAULT_CONFIG.contractNudgeMaxCount),
      
      documentNudgeDelays: {
        1: parseInt('scheduler_doc_nudge_delay_1', DEFAULT_CONFIG.documentNudgeDelays[1]),
        2: parseInt('scheduler_doc_nudge_delay_2', DEFAULT_CONFIG.documentNudgeDelays[2]),
        3: parseInt('scheduler_doc_nudge_delay_3', DEFAULT_CONFIG.documentNudgeDelays[3]),
        4: parseInt('scheduler_doc_nudge_delay_4', DEFAULT_CONFIG.documentNudgeDelays[4]),
        5: parseInt('scheduler_doc_nudge_delay_5', DEFAULT_CONFIG.documentNudgeDelays[5]),
        6: parseInt('scheduler_doc_nudge_delay_6', DEFAULT_CONFIG.documentNudgeDelays[6]),
      },
      documentNudgeMaxCount: parseInt('scheduler_doc_nudge_max_count', DEFAULT_CONFIG.documentNudgeMaxCount),
      
      followupHighScoreInterval: parseInt('scheduler_followup_high_score_interval', DEFAULT_CONFIG.followupHighScoreInterval),
      followupMediumHighInterval: parseInt('scheduler_followup_medium_high_interval', DEFAULT_CONFIG.followupMediumHighInterval),
      followupMediumInterval: parseInt('scheduler_followup_medium_interval', DEFAULT_CONFIG.followupMediumInterval),
      followupMinScore: parseInt('scheduler_followup_min_score', DEFAULT_CONFIG.followupMinScore),
      
      retryDelayMinutes: parseJSON('scheduler_retry_delay_minutes', DEFAULT_CONFIG.retryDelayMinutes),
      retryMaxAttempts: parseInt('scheduler_retry_max_attempts', DEFAULT_CONFIG.retryMaxAttempts),
      retryBatchSize: parseInt('scheduler_retry_batch_size', DEFAULT_CONFIG.retryBatchSize),
      retryAgentBlockReschedule: parseInt('scheduler_retry_agent_block_reschedule', DEFAULT_CONFIG.retryAgentBlockReschedule),
      
      rescueMaxAttempts: parseInt('scheduler_rescue_max_attempts', DEFAULT_CONFIG.rescueMaxAttempts),
      rescueSchedule,
      rescueBatchSize: parseInt('scheduler_rescue_batch_size', DEFAULT_CONFIG.rescueBatchSize),
      rescueInactivityThreshold: parseInt('scheduler_rescue_inactivity_threshold', DEFAULT_CONFIG.rescueInactivityThreshold),
      
      rateLimitBaseDelay: parseInt('scheduler_rate_limit_base_delay', DEFAULT_CONFIG.rateLimitBaseDelay),
      rateLimitBurstDelay: parseInt('scheduler_rate_limit_burst_delay', DEFAULT_CONFIG.rateLimitBurstDelay),
      
      nudgeBatchSize: parseInt('scheduler_nudge_batch_size', DEFAULT_CONFIG.nudgeBatchSize),
      followupBatchSize: parseInt('scheduler_followup_batch_size', DEFAULT_CONFIG.followupBatchSize),
      messageDelayBetween: parseInt('scheduler_message_delay_between', DEFAULT_CONFIG.messageDelayBetween),
    };
    
    cachedConfig = config;
    cacheTimestamp = now;
    
    console.log('[scheduler-config] ✅ Loaded dynamic config from database');
    return config;
    
  } catch (err) {
    console.error('[scheduler-config] ❌ Error loading config, using defaults:', err);
    return DEFAULT_CONFIG;
  }
}

/**
 * Retorna config do cache ou defaults (síncrono)
 */
export function getCachedSchedulerConfig(): SchedulerConfig {
  return cachedConfig || DEFAULT_CONFIG;
}

/**
 * Limpa cache para forçar reload
 */
export function clearSchedulerConfigCache(): void {
  cachedConfig = null;
  cacheTimestamp = 0;
}

// Exporta defaults para uso como fallback
export { DEFAULT_CONFIG as DEFAULT_SCHEDULER_CONFIG };
