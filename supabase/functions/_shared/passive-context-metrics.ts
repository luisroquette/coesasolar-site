/**
 * Passive Context Metrics
 * Rastreia métricas de sucesso da arquitetura AGENTS.md-Style
 * 
 * Métricas Alvo:
 * - Aderência a regras: 95%+
 * - Tamanho médio prompt: ~6KB
 * - Taxa de alucinação: <5%
 * - Latência LLM: ~1.8s
 * - Custo tokens/msg: ~2500
 */

export interface PassiveContextMetrics {
  // Identificação
  conversaId: string;
  agentId: string;
  timestamp: Date;
  
  // Métricas de Prompt
  promptSizeChars: number;
  promptSizeTokensEstimate: number;
  compressionRatio: number;
  
  // Métricas de Contexto Passivo
  sofiaCoreSizeChars: number;
  ruleMemoryInjected: number;
  ruleMemorySizeChars: number;
  passiveRagChunks: number;
  passiveRagSizeChars: number;
  
  // Métricas de Performance
  contextBuildTimeMs: number;
  llmLatencyMs: number;
  totalResponseTimeMs: number;
  
  // Métricas de Qualidade
  rulesApplied: string[];
  rulesViolated: string[];
  guardrailTriggered: boolean;
  fastPathUsed: boolean;
  fastPathBlockedByRule: boolean;
  
  // Métricas de RAG
  ragMode: 'passive' | 'active' | 'hybrid';
  ragCacheHit: boolean;
  ragSearchTimeMs: number;
}

export interface AggregatedMetrics {
  period: 'hour' | 'day' | 'week';
  periodStart: Date;
  periodEnd: Date;
  
  // Contadores
  totalMessages: number;
  totalLLMCalls: number;
  totalFastPaths: number;
  
  // Médias
  avgPromptSizeChars: number;
  avgPromptSizeTokens: number;
  avgCompressionRatio: number;
  avgContextBuildTimeMs: number;
  avgLLMLatencyMs: number;
  avgTotalResponseTimeMs: number;
  avgRulesInjected: number;
  avgRagChunks: number;
  
  // Taxas
  ruleAdherenceRate: number;      // % de msgs sem violações
  fastPathRate: number;            // % de msgs via fast-path
  fastPathBlockRate: number;       // % de fast-paths bloqueados por regras
  ragCacheHitRate: number;         // % de cache hits RAG
  guardrailTriggerRate: number;    // % de msgs com guardrail acionado
  
  // Distribuição de Modos RAG
  ragModeDistribution: {
    passive: number;
    active: number;
    hybrid: number;
  };
}

// Tracking em memória para a sessão atual
let sessionMetrics: PassiveContextMetrics[] = [];
const MAX_SESSION_METRICS = 100;

/**
 * Registra métricas de uma interação
 */
export function trackPassiveContextMetrics(metrics: PassiveContextMetrics): void {
  sessionMetrics.push(metrics);
  
  // Limitar tamanho em memória
  if (sessionMetrics.length > MAX_SESSION_METRICS) {
    sessionMetrics = sessionMetrics.slice(-MAX_SESSION_METRICS);
  }
  
  // Log estruturado para análise
  console.log('[PASSIVE_CONTEXT_METRICS]', JSON.stringify({
    conversaId: metrics.conversaId,
    promptSize: metrics.promptSizeChars,
    compressionRatio: metrics.compressionRatio.toFixed(2),
    rulesInjected: metrics.ruleMemoryInjected,
    ragChunks: metrics.passiveRagChunks,
    ragMode: metrics.ragMode,
    contextBuildMs: metrics.contextBuildTimeMs,
    llmLatencyMs: metrics.llmLatencyMs,
    rulesViolated: metrics.rulesViolated.length,
    guardrailTriggered: metrics.guardrailTriggered,
  }));
}

/**
 * Calcula métricas agregadas da sessão
 */
export function getSessionAggregatedMetrics(): Partial<AggregatedMetrics> {
  if (sessionMetrics.length === 0) {
    return { totalMessages: 0 };
  }
  
  const llmCalls = sessionMetrics.filter(m => !m.fastPathUsed);
  const fastPaths = sessionMetrics.filter(m => m.fastPathUsed);
  const blockedFastPaths = sessionMetrics.filter(m => m.fastPathBlockedByRule);
  const withViolations = sessionMetrics.filter(m => m.rulesViolated.length > 0);
  const cacheHits = sessionMetrics.filter(m => m.ragCacheHit);
  const guardrailTriggered = sessionMetrics.filter(m => m.guardrailTriggered);
  
  const avg = (arr: number[]) => arr.length > 0 
    ? arr.reduce((a, b) => a + b, 0) / arr.length 
    : 0;
  
  return {
    totalMessages: sessionMetrics.length,
    totalLLMCalls: llmCalls.length,
    totalFastPaths: fastPaths.length,
    
    avgPromptSizeChars: avg(sessionMetrics.map(m => m.promptSizeChars)),
    avgPromptSizeTokens: avg(sessionMetrics.map(m => m.promptSizeTokensEstimate)),
    avgCompressionRatio: avg(sessionMetrics.map(m => m.compressionRatio)),
    avgContextBuildTimeMs: avg(sessionMetrics.map(m => m.contextBuildTimeMs)),
    avgLLMLatencyMs: avg(llmCalls.map(m => m.llmLatencyMs)),
    avgTotalResponseTimeMs: avg(sessionMetrics.map(m => m.totalResponseTimeMs)),
    avgRulesInjected: avg(sessionMetrics.map(m => m.ruleMemoryInjected)),
    avgRagChunks: avg(sessionMetrics.map(m => m.passiveRagChunks)),
    
    ruleAdherenceRate: ((sessionMetrics.length - withViolations.length) / sessionMetrics.length) * 100,
    fastPathRate: (fastPaths.length / sessionMetrics.length) * 100,
    fastPathBlockRate: fastPaths.length > 0 
      ? (blockedFastPaths.length / fastPaths.length) * 100 
      : 0,
    ragCacheHitRate: (cacheHits.length / sessionMetrics.length) * 100,
    guardrailTriggerRate: (guardrailTriggered.length / sessionMetrics.length) * 100,
    
    ragModeDistribution: {
      passive: sessionMetrics.filter(m => m.ragMode === 'passive').length,
      active: sessionMetrics.filter(m => m.ragMode === 'active').length,
      hybrid: sessionMetrics.filter(m => m.ragMode === 'hybrid').length,
    },
  };
}

/**
 * Estima tokens a partir de caracteres (aproximação)
 */
export function estimateTokens(chars: number): number {
  // Aproximação: 1 token ≈ 4 caracteres para português
  return Math.ceil(chars / 4);
}

/**
 * Cria objeto de métricas vazio para preenchimento
 */
export function createMetricsTracker(conversaId: string, agentId: string): PassiveContextMetrics {
  return {
    conversaId,
    agentId,
    timestamp: new Date(),
    
    promptSizeChars: 0,
    promptSizeTokensEstimate: 0,
    compressionRatio: 1,
    
    sofiaCoreSizeChars: 0,
    ruleMemoryInjected: 0,
    ruleMemorySizeChars: 0,
    passiveRagChunks: 0,
    passiveRagSizeChars: 0,
    
    contextBuildTimeMs: 0,
    llmLatencyMs: 0,
    totalResponseTimeMs: 0,
    
    rulesApplied: [],
    rulesViolated: [],
    guardrailTriggered: false,
    fastPathUsed: false,
    fastPathBlockedByRule: false,
    
    ragMode: 'passive',
    ragCacheHit: false,
    ragSearchTimeMs: 0,
  };
}

/**
 * Verifica se métricas atendem aos targets do plano AGENTS.md
 */
export function checkMetricsTargets(metrics: AggregatedMetrics): {
  passed: boolean;
  results: { metric: string; target: string; actual: string; passed: boolean }[];
  agentsMdCompliance: number; // 0-100%
} {
  const results = [
    {
      metric: 'Aderência a Regras',
      target: '≥95%',
      actual: `${metrics.ruleAdherenceRate.toFixed(1)}%`,
      passed: metrics.ruleAdherenceRate >= 95,
    },
    {
      metric: 'Tamanho Médio Prompt',
      target: '≤8KB', // Updated AGENTS.md target
      actual: `${(metrics.avgPromptSizeChars / 1024).toFixed(1)}KB`,
      passed: metrics.avgPromptSizeChars <= 8000,
    },
    {
      metric: 'Taxa de Guardrail',
      target: '≤5%',
      actual: `${metrics.guardrailTriggerRate.toFixed(1)}%`,
      passed: metrics.guardrailTriggerRate <= 5,
    },
    {
      metric: 'Latência LLM',
      target: '≤1800ms',
      actual: `${metrics.avgLLMLatencyMs.toFixed(0)}ms`,
      passed: metrics.avgLLMLatencyMs <= 1800,
    },
    {
      metric: 'Tokens Médio',
      target: '≤2000', // AGENTS.md compressed target
      actual: `${metrics.avgPromptSizeTokens.toFixed(0)}`,
      passed: metrics.avgPromptSizeTokens <= 2000,
    },
    {
      metric: 'Taxa Fast-Path',
      target: '≥60%',
      actual: `${metrics.fastPathRate.toFixed(1)}%`,
      passed: metrics.fastPathRate >= 60,
    },
    {
      metric: 'RAG Cache Hit',
      target: '≥50%',
      actual: `${metrics.ragCacheHitRate.toFixed(1)}%`,
      passed: metrics.ragCacheHitRate >= 50,
    },
    {
      metric: 'Compressão Ratio',
      target: '≥40%',
      actual: `${((1 - metrics.avgCompressionRatio) * 100).toFixed(1)}%`,
      passed: (1 - metrics.avgCompressionRatio) >= 0.4,
    },
  ];
  
  const passedCount = results.filter(r => r.passed).length;
  const agentsMdCompliance = Math.round((passedCount / results.length) * 100);
  
  return {
    passed: results.every(r => r.passed),
    results,
    agentsMdCompliance,
  };
}

/**
 * Formata relatório de métricas para log
 */
export function formatMetricsReport(metrics: Partial<AggregatedMetrics>): string {
  if (!metrics.totalMessages) {
    return '[PASSIVE_CONTEXT_REPORT] Sem dados suficientes';
  }
  
  return `
╔══════════════════════════════════════════════════════════════╗
║           PASSIVE-FIRST ARCHITECTURE METRICS                 ║
╠══════════════════════════════════════════════════════════════╣
║ Total Mensagens: ${metrics.totalMessages?.toString().padEnd(5)} │ LLM: ${metrics.totalLLMCalls?.toString().padEnd(5)} │ Fast-Path: ${metrics.totalFastPaths?.toString().padEnd(5)}║
╠──────────────────────────────────────────────────────────────╣
║ PROMPT                                                       ║
║   Tamanho Médio: ${((metrics.avgPromptSizeChars || 0) / 1024).toFixed(1)}KB (${metrics.avgPromptSizeTokens?.toFixed(0)} tokens)
║   Compressão: ${((1 - (metrics.avgCompressionRatio || 1)) * 100).toFixed(0)}%
║   Regras Injetadas: ${metrics.avgRulesInjected?.toFixed(1)} média
║   RAG Chunks: ${metrics.avgRagChunks?.toFixed(1)} média
╠──────────────────────────────────────────────────────────────╣
║ PERFORMANCE                                                  ║
║   Context Build: ${metrics.avgContextBuildTimeMs?.toFixed(0)}ms
║   LLM Latência: ${metrics.avgLLMLatencyMs?.toFixed(0)}ms
║   Total Resposta: ${metrics.avgTotalResponseTimeMs?.toFixed(0)}ms
╠──────────────────────────────────────────────────────────────╣
║ QUALIDADE                                                    ║
║   Aderência Regras: ${metrics.ruleAdherenceRate?.toFixed(1)}%
║   Fast-Path Rate: ${metrics.fastPathRate?.toFixed(1)}%
║   RAG Cache Hit: ${metrics.ragCacheHitRate?.toFixed(1)}%
║   Guardrail Rate: ${metrics.guardrailTriggerRate?.toFixed(1)}%
╠──────────────────────────────────────────────────────────────╣
║ RAG MODE DISTRIBUTION                                        ║
║   Passive: ${metrics.ragModeDistribution?.passive} │ Active: ${metrics.ragModeDistribution?.active} │ Hybrid: ${metrics.ragModeDistribution?.hybrid}
╚══════════════════════════════════════════════════════════════╝
`.trim();
}

/**
 * Limpa métricas da sessão
 */
export function clearSessionMetrics(): void {
  sessionMetrics = [];
}
