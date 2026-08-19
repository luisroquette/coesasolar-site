/**
 * RAG Quality Metrics
 * Rastreia qualidade e eficácia do sistema RAG
 * 
 * Métricas:
 * - Taxa de hits/misses
 * - Qualidade dos chunks retornados
 * - Tempo de busca
 * - Correlação com sucesso da resposta
 */

import { LOG_PREFIX } from './constants.ts';

// =============================================================================
// TYPES
// =============================================================================

export interface RAGSearchResult {
  searchId: string;
  timestamp: Date;
  conversaId: string;
  agentId: string;
  
  // Query
  query: string;
  queryTokens: number;
  categories: string[];
  funnelStage: string;
  
  // Resultados
  chunksReturned: number;
  chunksUsed: number;
  avgSimilarityScore: number;
  minSimilarityScore: number;
  maxSimilarityScore: number;
  totalCharsReturned: number;
  
  // Cache
  cacheHit: boolean;
  cacheKey?: string;
  
  // Performance
  searchTimeMs: number;
  embeddingTimeMs: number;
  rankingTimeMs: number;
  
  // Qualidade
  thresholdMet: boolean;
  belowThresholdChunks: number;
  relevanceScore: number; // 0-100, avaliação de relevância
  
  // Modo
  mode: 'passive' | 'active' | 'hybrid';
  fallbackUsed: boolean;
}

export interface RAGQualityStats {
  period: 'hour' | 'day' | 'week';
  periodStart: Date;
  periodEnd: Date;
  
  // Contadores
  totalSearches: number;
  totalCacheHits: number;
  totalChunksReturned: number;
  totalChunksUsed: number;
  
  // Taxas
  cacheHitRate: number;
  thresholdMetRate: number;
  avgChunksPerSearch: number;
  avgChunksUsedPerSearch: number;
  chunkUtilizationRate: number;
  
  // Qualidade
  avgSimilarityScore: number;
  avgRelevanceScore: number;
  lowQualitySearchRate: number; // < threshold
  
  // Performance
  avgSearchTimeMs: number;
  avgEmbeddingTimeMs: number;
  p95SearchTimeMs: number;
  
  // Por categoria
  categoryStats: Record<string, {
    searches: number;
    avgSimilarity: number;
    cacheHitRate: number;
  }>;
  
  // Por modo
  modeDistribution: {
    passive: number;
    active: number;
    hybrid: number;
  };
  
  // Por estágio
  stageStats: Record<string, {
    searches: number;
    avgChunks: number;
    avgRelevance: number;
  }>;
}

// =============================================================================
// IN-MEMORY TRACKING
// =============================================================================

let sessionRAGResults: RAGSearchResult[] = [];
const MAX_SESSION_RESULTS = 500;

// Thresholds para alertas
const SIMILARITY_THRESHOLD = 0.35; // 35%
const SEARCH_TIME_WARNING_MS = 500;
const SEARCH_TIME_CRITICAL_MS = 1000;

// =============================================================================
// TRACKING FUNCTIONS
// =============================================================================

/**
 * Cria um resultado de busca RAG
 */
export function createRAGSearchResult(
  conversaId: string,
  agentId: string,
  query: string
): RAGSearchResult {
  return {
    searchId: `rag_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date(),
    conversaId,
    agentId,
    
    query,
    queryTokens: Math.ceil(query.length / 4),
    categories: [],
    funnelStage: 'unknown',
    
    chunksReturned: 0,
    chunksUsed: 0,
    avgSimilarityScore: 0,
    minSimilarityScore: 0,
    maxSimilarityScore: 0,
    totalCharsReturned: 0,
    
    cacheHit: false,
    
    searchTimeMs: 0,
    embeddingTimeMs: 0,
    rankingTimeMs: 0,
    
    thresholdMet: true,
    belowThresholdChunks: 0,
    relevanceScore: 0,
    
    mode: 'passive',
    fallbackUsed: false,
  };
}

/**
 * Finaliza e registra resultado de busca RAG
 */
export function finalizeRAGResult(result: RAGSearchResult): void {
  // Verifica thresholds
  result.thresholdMet = result.avgSimilarityScore >= SIMILARITY_THRESHOLD;
  
  // Calcula taxa de utilização
  const utilizationRate = result.chunksReturned > 0 
    ? (result.chunksUsed / result.chunksReturned) * 100 
    : 0;
  
  // Adiciona à sessão
  sessionRAGResults.push(result);
  
  if (sessionRAGResults.length > MAX_SESSION_RESULTS) {
    sessionRAGResults = sessionRAGResults.slice(-MAX_SESSION_RESULTS);
  }
  
  // Log estruturado com alertas
  const logLevel = result.searchTimeMs > SEARCH_TIME_CRITICAL_MS ? 'warn' :
                   result.searchTimeMs > SEARCH_TIME_WARNING_MS ? 'info' : 'debug';
  
  const alerts: string[] = [];
  if (result.searchTimeMs > SEARCH_TIME_CRITICAL_MS) {
    alerts.push('SLOW_SEARCH');
  }
  if (!result.thresholdMet) {
    alerts.push('LOW_SIMILARITY');
  }
  if (result.chunksReturned === 0) {
    alerts.push('NO_RESULTS');
  }
  if (result.fallbackUsed) {
    alerts.push('FALLBACK_USED');
  }
  
  console[logLevel === 'warn' ? 'warn' : 'log'](`${LOG_PREFIX}[RAG_QUALITY_METRICS]`, JSON.stringify({
    searchId: result.searchId,
    conversaId: result.conversaId,
    mode: result.mode,
    categories: result.categories,
    chunksReturned: result.chunksReturned,
    chunksUsed: result.chunksUsed,
    avgSimilarity: result.avgSimilarityScore.toFixed(3),
    searchTimeMs: result.searchTimeMs,
    cacheHit: result.cacheHit,
    thresholdMet: result.thresholdMet,
    utilizationRate: utilizationRate.toFixed(1),
    alerts: alerts.length > 0 ? alerts : undefined,
  }));
}

/**
 * Calcula estatísticas agregadas de qualidade RAG
 */
export function getRAGQualityStats(): Partial<RAGQualityStats> {
  if (sessionRAGResults.length === 0) {
    return { totalSearches: 0 };
  }
  
  const avg = (arr: number[]) => arr.length > 0 
    ? arr.reduce((a, b) => a + b, 0) / arr.length 
    : 0;
  
  const percentile = (arr: number[], p: number) => {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  };
  
  const cacheHits = sessionRAGResults.filter(r => r.cacheHit);
  const thresholdMet = sessionRAGResults.filter(r => r.thresholdMet);
  const lowQuality = sessionRAGResults.filter(r => r.avgSimilarityScore < SIMILARITY_THRESHOLD);
  
  // Por categoria
  const categoryStats: Record<string, { searches: number; totalSimilarity: number; cacheHits: number }> = {};
  for (const result of sessionRAGResults) {
    for (const cat of result.categories) {
      if (!categoryStats[cat]) {
        categoryStats[cat] = { searches: 0, totalSimilarity: 0, cacheHits: 0 };
      }
      categoryStats[cat].searches++;
      categoryStats[cat].totalSimilarity += result.avgSimilarityScore;
      if (result.cacheHit) categoryStats[cat].cacheHits++;
    }
  }
  
  const formattedCategoryStats: Record<string, { searches: number; avgSimilarity: number; cacheHitRate: number }> = {};
  for (const [cat, stats] of Object.entries(categoryStats)) {
    formattedCategoryStats[cat] = {
      searches: stats.searches,
      avgSimilarity: stats.totalSimilarity / stats.searches,
      cacheHitRate: (stats.cacheHits / stats.searches) * 100,
    };
  }
  
  // Por estágio
  const stageStats: Record<string, { searches: number; totalChunks: number; totalRelevance: number }> = {};
  for (const result of sessionRAGResults) {
    if (!stageStats[result.funnelStage]) {
      stageStats[result.funnelStage] = { searches: 0, totalChunks: 0, totalRelevance: 0 };
    }
    stageStats[result.funnelStage].searches++;
    stageStats[result.funnelStage].totalChunks += result.chunksReturned;
    stageStats[result.funnelStage].totalRelevance += result.relevanceScore;
  }
  
  const formattedStageStats: Record<string, { searches: number; avgChunks: number; avgRelevance: number }> = {};
  for (const [stage, stats] of Object.entries(stageStats)) {
    formattedStageStats[stage] = {
      searches: stats.searches,
      avgChunks: stats.totalChunks / stats.searches,
      avgRelevance: stats.totalRelevance / stats.searches,
    };
  }
  
  const totalChunksReturned = sessionRAGResults.reduce((sum, r) => sum + r.chunksReturned, 0);
  const totalChunksUsed = sessionRAGResults.reduce((sum, r) => sum + r.chunksUsed, 0);
  
  return {
    totalSearches: sessionRAGResults.length,
    totalCacheHits: cacheHits.length,
    totalChunksReturned,
    totalChunksUsed,
    
    cacheHitRate: (cacheHits.length / sessionRAGResults.length) * 100,
    thresholdMetRate: (thresholdMet.length / sessionRAGResults.length) * 100,
    avgChunksPerSearch: avg(sessionRAGResults.map(r => r.chunksReturned)),
    avgChunksUsedPerSearch: avg(sessionRAGResults.map(r => r.chunksUsed)),
    chunkUtilizationRate: totalChunksReturned > 0 
      ? (totalChunksUsed / totalChunksReturned) * 100 
      : 0,
    
    avgSimilarityScore: avg(sessionRAGResults.map(r => r.avgSimilarityScore)),
    avgRelevanceScore: avg(sessionRAGResults.map(r => r.relevanceScore)),
    lowQualitySearchRate: (lowQuality.length / sessionRAGResults.length) * 100,
    
    avgSearchTimeMs: avg(sessionRAGResults.map(r => r.searchTimeMs)),
    avgEmbeddingTimeMs: avg(sessionRAGResults.map(r => r.embeddingTimeMs)),
    p95SearchTimeMs: percentile(sessionRAGResults.map(r => r.searchTimeMs), 95),
    
    categoryStats: formattedCategoryStats,
    stageStats: formattedStageStats,
    
    modeDistribution: {
      passive: sessionRAGResults.filter(r => r.mode === 'passive').length,
      active: sessionRAGResults.filter(r => r.mode === 'active').length,
      hybrid: sessionRAGResults.filter(r => r.mode === 'hybrid').length,
    },
  };
}

/**
 * Formata relatório de qualidade RAG
 */
export function formatRAGQualityReport(stats: Partial<RAGQualityStats>): string {
  if (!stats.totalSearches) {
    return `${LOG_PREFIX}[RAG_QUALITY_REPORT] Sem dados suficientes`;
  }
  
  const categoryLines = Object.entries(stats.categoryStats || {})
    .sort((a, b) => b[1].searches - a[1].searches)
    .slice(0, 5)
    .map(([cat, s]) => `  ${cat}: ${s.searches} buscas, sim=${(s.avgSimilarity * 100).toFixed(1)}%, cache=${s.cacheHitRate.toFixed(0)}%`)
    .join('\n') || '  N/A';
  
  return `
╔══════════════════════════════════════════════════════════════╗
║               RAG QUALITY METRICS REPORT                     ║
╠══════════════════════════════════════════════════════════════╣
║ VOLUME                                                       ║
║   Total Buscas: ${stats.totalSearches}
║   Cache Hits: ${stats.totalCacheHits} (${stats.cacheHitRate?.toFixed(1)}%)
║   Chunks Retornados: ${stats.totalChunksReturned}
║   Chunks Utilizados: ${stats.totalChunksUsed} (${stats.chunkUtilizationRate?.toFixed(1)}%)
╠──────────────────────────────────────────────────────────────╣
║ QUALIDADE                                                    ║
║   Similaridade Média: ${((stats.avgSimilarityScore || 0) * 100).toFixed(1)}%
║   Relevância Média: ${stats.avgRelevanceScore?.toFixed(1)}%
║   Taxa Threshold Met: ${stats.thresholdMetRate?.toFixed(1)}%
║   Buscas Baixa Qualidade: ${stats.lowQualitySearchRate?.toFixed(1)}%
╠──────────────────────────────────────────────────────────────╣
║ PERFORMANCE                                                  ║
║   Tempo Médio Busca: ${stats.avgSearchTimeMs?.toFixed(0)}ms
║   Tempo P95 Busca: ${stats.p95SearchTimeMs?.toFixed(0)}ms
║   Tempo Médio Embedding: ${stats.avgEmbeddingTimeMs?.toFixed(0)}ms
╠──────────────────────────────────────────────────────────────╣
║ MODE DISTRIBUTION                                            ║
║   Passive: ${stats.modeDistribution?.passive} │ Active: ${stats.modeDistribution?.active} │ Hybrid: ${stats.modeDistribution?.hybrid}
╠──────────────────────────────────────────────────────────────╣
║ TOP 5 CATEGORIAS                                             ║
${categoryLines}
╚══════════════════════════════════════════════════════════════╝
`.trim();
}

/**
 * Verifica se há alertas de qualidade RAG
 */
export function checkRAGQualityAlerts(): {
  hasAlerts: boolean;
  alerts: { type: string; message: string; severity: 'warning' | 'critical' }[];
} {
  const stats = getRAGQualityStats();
  const alerts: { type: string; message: string; severity: 'warning' | 'critical' }[] = [];
  
  if (!stats.totalSearches) {
    return { hasAlerts: false, alerts: [] };
  }
  
  // Cache hit rate muito baixa
  if ((stats.cacheHitRate || 0) < 30) {
    alerts.push({
      type: 'LOW_CACHE_HIT_RATE',
      message: `Cache hit rate está em ${stats.cacheHitRate?.toFixed(1)}% (esperado: >50%)`,
      severity: 'warning',
    });
  }
  
  // Threshold não atingido frequentemente
  if ((stats.thresholdMetRate || 0) < 70) {
    alerts.push({
      type: 'LOW_THRESHOLD_MET_RATE',
      message: `Apenas ${stats.thresholdMetRate?.toFixed(1)}% das buscas atingem threshold (esperado: >85%)`,
      severity: (stats.thresholdMetRate || 0) < 50 ? 'critical' : 'warning',
    });
  }
  
  // Tempo de busca alto
  if ((stats.p95SearchTimeMs || 0) > SEARCH_TIME_CRITICAL_MS) {
    alerts.push({
      type: 'SLOW_SEARCH_P95',
      message: `P95 de tempo de busca está em ${stats.p95SearchTimeMs?.toFixed(0)}ms (esperado: <${SEARCH_TIME_CRITICAL_MS}ms)`,
      severity: 'critical',
    });
  }
  
  // Baixa utilização de chunks
  if ((stats.chunkUtilizationRate || 0) < 40) {
    alerts.push({
      type: 'LOW_CHUNK_UTILIZATION',
      message: `Taxa de utilização de chunks está em ${stats.chunkUtilizationRate?.toFixed(1)}% (esperado: >60%)`,
      severity: 'warning',
    });
  }
  
  return {
    hasAlerts: alerts.length > 0,
    alerts,
  };
}

/**
 * Limpa resultados da sessão
 */
export function clearSessionRAGResults(): void {
  sessionRAGResults = [];
}
