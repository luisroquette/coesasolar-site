// ═══════════════════════════════════════════════════════════════════════════
// RATE LIMITER - ANTI-SPAM PROTECTION
// ═══════════════════════════════════════════════════════════════════════════
// Impede disparos em massa que podem resultar em bloqueio pela Meta/WhatsApp
// Introduz delays progressivos entre mensagens para simular comportamento humano
// ═══════════════════════════════════════════════════════════════════════════

export interface RateLimitConfig {
  // Delay base entre mensagens (em ms) - default 3000ms (3 segundos)
  baseDelayMs: number;
  // Delay máximo entre mensagens (em ms) - default 8000ms (8 segundos)
  maxDelayMs: number;
  // Adiciona variação aleatória para parecer mais humano
  randomJitterMs: number;
  // Limite de mensagens por minuto
  maxMessagesPerMinute: number;
  // Delay adicional quando batch size é grande (ms por mensagem acima do threshold)
  batchPenaltyMs: number;
  // Threshold de batch size para aplicar penalidade
  batchThreshold: number;
}

// Configurações padrão - conservadoras para evitar bloqueio
export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  baseDelayMs: 3000,           // 3 segundos base
  maxDelayMs: 10000,           // 10 segundos máximo
  randomJitterMs: 2000,        // +/- 2 segundos de variação
  maxMessagesPerMinute: 15,    // Máximo 15 mensagens por minuto
  batchPenaltyMs: 500,         // +500ms por mensagem quando batch grande
  batchThreshold: 10,          // Aplica penalidade quando mais de 10 mensagens
};

// ═══════════════════════════════════════════════════════════════
// FALLBACK CONFIGS (loaded from DB when available)
// ZERO HARDCODE: Values come from configuracoes_sistema
// ═══════════════════════════════════════════════════════════════

// Configurações mais agressivas para situações normais
export const NORMAL_RATE_LIMIT_CONFIG: RateLimitConfig = {
  baseDelayMs: 2000,           // 2 segundos base
  maxDelayMs: 6000,            // 6 segundos máximo
  randomJitterMs: 1500,        // +/- 1.5 segundos de variação
  maxMessagesPerMinute: 20,    // Máximo 20 mensagens por minuto
  batchPenaltyMs: 300,         // +300ms por mensagem quando batch grande
  batchThreshold: 15,          // Aplica penalidade quando mais de 15 mensagens
};

// Configurações conservadoras após período offline (bot voltando à vida)
export const RECOVERY_RATE_LIMIT_CONFIG: RateLimitConfig = {
  baseDelayMs: 5000,           // 5 segundos base
  maxDelayMs: 15000,           // 15 segundos máximo
  randomJitterMs: 3000,        // +/- 3 segundos de variação
  maxMessagesPerMinute: 10,    // Máximo 10 mensagens por minuto
  batchPenaltyMs: 1000,        // +1 segundo por mensagem quando batch grande
  batchThreshold: 5,           // Aplica penalidade quando mais de 5 mensagens
};

// Large batch threshold (when to use conservative config)
let largeBatchThreshold = 20;

/**
 * Load all rate limit configs from database (including normal and recovery)
 */
export async function loadAllRateLimitConfigs(supabase: any): Promise<{
  default: RateLimitConfig;
  normal: RateLimitConfig;
  recovery: RateLimitConfig;
  largeBatchThreshold: number;
}> {
  try {
    const { data: configRows } = await supabase
      .from('configuracoes_sistema')
      .select('chave, valor')
      .in('chave', [
        // Default config
        'rate_limit_base_delay_ms',
        'rate_limit_max_delay_ms',
        'rate_limit_jitter_ms',
        'rate_limit_max_per_minute',
        'rate_limit_batch_penalty_ms',
        'rate_limit_batch_threshold',
        // Normal config
        'rate_limit_normal_base_delay_ms',
        'rate_limit_normal_max_delay_ms',
        'rate_limit_normal_jitter_ms',
        // Recovery config
        'rate_limit_recovery_base_delay_ms',
        'rate_limit_recovery_max_delay_ms',
        'rate_limit_recovery_jitter_ms',
        // Threshold
        'rate_limit_large_batch_threshold',
      ]);

    if (!configRows || configRows.length === 0) {
      return {
        default: DEFAULT_RATE_LIMIT_CONFIG,
        normal: NORMAL_RATE_LIMIT_CONFIG,
        recovery: RECOVERY_RATE_LIMIT_CONFIG,
        largeBatchThreshold: 20,
      };
    }

    const configMap: Record<string, string> = {};
    for (const row of configRows) {
      configMap[row.chave] = row.valor;
    }

    // Update module-level threshold
    largeBatchThreshold = parseInt(configMap.rate_limit_large_batch_threshold) || 20;

    return {
      default: {
        baseDelayMs: parseInt(configMap.rate_limit_base_delay_ms) || DEFAULT_RATE_LIMIT_CONFIG.baseDelayMs,
        maxDelayMs: parseInt(configMap.rate_limit_max_delay_ms) || DEFAULT_RATE_LIMIT_CONFIG.maxDelayMs,
        randomJitterMs: parseInt(configMap.rate_limit_jitter_ms) || DEFAULT_RATE_LIMIT_CONFIG.randomJitterMs,
        maxMessagesPerMinute: parseInt(configMap.rate_limit_max_per_minute) || DEFAULT_RATE_LIMIT_CONFIG.maxMessagesPerMinute,
        batchPenaltyMs: parseInt(configMap.rate_limit_batch_penalty_ms) || DEFAULT_RATE_LIMIT_CONFIG.batchPenaltyMs,
        batchThreshold: parseInt(configMap.rate_limit_batch_threshold) || DEFAULT_RATE_LIMIT_CONFIG.batchThreshold,
      },
      normal: {
        baseDelayMs: parseInt(configMap.rate_limit_normal_base_delay_ms) || NORMAL_RATE_LIMIT_CONFIG.baseDelayMs,
        maxDelayMs: parseInt(configMap.rate_limit_normal_max_delay_ms) || NORMAL_RATE_LIMIT_CONFIG.maxDelayMs,
        randomJitterMs: parseInt(configMap.rate_limit_normal_jitter_ms) || NORMAL_RATE_LIMIT_CONFIG.randomJitterMs,
        maxMessagesPerMinute: NORMAL_RATE_LIMIT_CONFIG.maxMessagesPerMinute,
        batchPenaltyMs: NORMAL_RATE_LIMIT_CONFIG.batchPenaltyMs,
        batchThreshold: NORMAL_RATE_LIMIT_CONFIG.batchThreshold,
      },
      recovery: {
        baseDelayMs: parseInt(configMap.rate_limit_recovery_base_delay_ms) || RECOVERY_RATE_LIMIT_CONFIG.baseDelayMs,
        maxDelayMs: parseInt(configMap.rate_limit_recovery_max_delay_ms) || RECOVERY_RATE_LIMIT_CONFIG.maxDelayMs,
        randomJitterMs: parseInt(configMap.rate_limit_recovery_jitter_ms) || RECOVERY_RATE_LIMIT_CONFIG.randomJitterMs,
        maxMessagesPerMinute: RECOVERY_RATE_LIMIT_CONFIG.maxMessagesPerMinute,
        batchPenaltyMs: RECOVERY_RATE_LIMIT_CONFIG.batchPenaltyMs,
        batchThreshold: RECOVERY_RATE_LIMIT_CONFIG.batchThreshold,
      },
      largeBatchThreshold,
    };
  } catch (error) {
    console.warn('[rate-limiter] Error loading all configs from database, using defaults:', error);
    return {
      default: DEFAULT_RATE_LIMIT_CONFIG,
      normal: NORMAL_RATE_LIMIT_CONFIG,
      recovery: RECOVERY_RATE_LIMIT_CONFIG,
      largeBatchThreshold: 20,
    };
  }
}

/**
 * Calcula o delay apropriado antes de enviar a próxima mensagem
 * @param messageIndex Índice da mensagem atual no batch (0-based)
 * @param totalMessages Total de mensagens no batch
 * @param config Configuração de rate limiting
 * @returns Delay em milissegundos
 */
export function calculateDelay(
  messageIndex: number,
  totalMessages: number,
  config: RateLimitConfig = DEFAULT_RATE_LIMIT_CONFIG
): number {
  // Primeira mensagem não precisa de delay
  if (messageIndex === 0) {
    return 0;
  }

  let delay = config.baseDelayMs;

  // Adiciona penalidade para batches grandes
  if (totalMessages > config.batchThreshold) {
    const extraMessages = totalMessages - config.batchThreshold;
    delay += extraMessages * config.batchPenaltyMs;
  }

  // Adiciona delay progressivo baseado na posição no batch
  // Mensagens mais ao final do batch têm delay maior
  const progressFactor = messageIndex / totalMessages;
  delay += progressFactor * config.baseDelayMs;

  // Adiciona variação aleatória (jitter) para parecer mais humano
  const jitter = (Math.random() - 0.5) * 2 * config.randomJitterMs;
  delay += jitter;

  // Garante que está dentro dos limites
  delay = Math.max(config.baseDelayMs / 2, delay);
  delay = Math.min(config.maxDelayMs, delay);

  return Math.round(delay);
}

/**
 * Aguarda o delay calculado antes de continuar
 * @param delayMs Delay em milissegundos
 */
export async function wait(delayMs: number): Promise<void> {
  if (delayMs > 0) {
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
}

/**
 * Processa um batch de mensagens com rate limiting
 * @param items Array de itens para processar
 * @param processor Função async que processa cada item
 * @param config Configuração de rate limiting
 * @param onProgress Callback opcional para progresso
 * @returns Resultados do processamento
 */
export async function processWithRateLimit<T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  config: RateLimitConfig = DEFAULT_RATE_LIMIT_CONFIG,
  onProgress?: (processed: number, total: number) => void
): Promise<R[]> {
  const results: R[] = [];
  const totalItems = items.length;

  console.log(`[rate-limiter] Starting batch of ${totalItems} items with rate limiting`);
  console.log(`[rate-limiter] Config: base=${config.baseDelayMs}ms, max=${config.maxDelayMs}ms, jitter=${config.randomJitterMs}ms`);

  for (let i = 0; i < totalItems; i++) {
    // Calcula e aplica delay antes de processar (exceto primeira)
    const delay = calculateDelay(i, totalItems, config);
    if (delay > 0) {
      console.log(`[rate-limiter] Waiting ${delay}ms before message ${i + 1}/${totalItems}`);
      await wait(delay);
    }

    // Processa o item
    try {
      const result = await processor(items[i], i);
      results.push(result);
    } catch (error) {
      console.error(`[rate-limiter] Error processing item ${i}:`, error);
      throw error;
    }

    // Callback de progresso
    if (onProgress) {
      onProgress(i + 1, totalItems);
    }
  }

  console.log(`[rate-limiter] Completed batch of ${totalItems} items`);
  return results;
}

/**
 * Determina qual configuração usar baseado no contexto
 * @param batchSize Tamanho do batch
 * @param isRecovery Se o sistema está em modo de recuperação (voltando de offline)
 * @returns Configuração de rate limiting apropriada
 */
export function getAppropriateConfig(
  batchSize: number,
  isRecovery: boolean = false
): RateLimitConfig {
  // Se está em modo recovery (ex: scheduler voltando após período offline)
  if (isRecovery) {
    console.log('[rate-limiter] Using RECOVERY config (conservative mode)');
    return RECOVERY_RATE_LIMIT_CONFIG;
  }

  // Para batches grandes, usa configuração padrão (mais conservadora)
  if (batchSize > 20) {
    console.log('[rate-limiter] Using DEFAULT config (large batch)');
    return DEFAULT_RATE_LIMIT_CONFIG;
  }

  // Para batches normais, pode ser um pouco mais rápido
  console.log('[rate-limiter] Using NORMAL config');
  return NORMAL_RATE_LIMIT_CONFIG;
}

/**
 * Carrega configuração de rate limiting do banco de dados
 * Se não houver configuração personalizada, retorna os defaults
 */
export async function loadRateLimitConfig(
  supabase: any
): Promise<RateLimitConfig> {
  try {
    const { data: configRows } = await supabase
      .from('configuracoes_sistema')
      .select('chave, valor')
      .in('chave', [
        'rate_limit_base_delay_ms',
        'rate_limit_max_delay_ms',
        'rate_limit_jitter_ms',
        'rate_limit_max_per_minute',
        'rate_limit_batch_penalty_ms',
        'rate_limit_batch_threshold',
      ]);

    if (!configRows || configRows.length === 0) {
      return DEFAULT_RATE_LIMIT_CONFIG;
    }

    const configMap: Record<string, string> = {};
    for (const row of configRows) {
      configMap[row.chave] = row.valor;
    }

    return {
      baseDelayMs: parseInt(configMap.rate_limit_base_delay_ms) || DEFAULT_RATE_LIMIT_CONFIG.baseDelayMs,
      maxDelayMs: parseInt(configMap.rate_limit_max_delay_ms) || DEFAULT_RATE_LIMIT_CONFIG.maxDelayMs,
      randomJitterMs: parseInt(configMap.rate_limit_jitter_ms) || DEFAULT_RATE_LIMIT_CONFIG.randomJitterMs,
      maxMessagesPerMinute: parseInt(configMap.rate_limit_max_per_minute) || DEFAULT_RATE_LIMIT_CONFIG.maxMessagesPerMinute,
      batchPenaltyMs: parseInt(configMap.rate_limit_batch_penalty_ms) || DEFAULT_RATE_LIMIT_CONFIG.batchPenaltyMs,
      batchThreshold: parseInt(configMap.rate_limit_batch_threshold) || DEFAULT_RATE_LIMIT_CONFIG.batchThreshold,
    };
  } catch (error) {
    console.warn('[rate-limiter] Error loading config from database, using defaults:', error);
    return DEFAULT_RATE_LIMIT_CONFIG;
  }
}
