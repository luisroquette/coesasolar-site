/**
 * Metrics Aggregator
 * Agrega e persiste métricas de múltiplas fontes
 * 
 * Fontes:
 * - Phase Metrics (latência por fase)
 * - Passive Context Metrics (AGENTS.md-style)
 * - Rule Memory Metrics (eficácia de regras)
 * - RAG Quality Metrics (qualidade de busca)
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.90.0';
import { LOG_PREFIX, RETENTION_DAYS } from './constants.ts';
import { PhaseMetricsCollector } from './phase-metrics-collector.ts';
import { 
  getSessionRuleAggregates, 
  formatRuleMemoryReport,
  type AggregatedRuleStats 
} from './rule-memory-metrics.ts';
import { 
  getRAGQualityStats, 
  formatRAGQualityReport, 
  checkRAGQualityAlerts,
  type RAGQualityStats 
} from './rag-quality-metrics.ts';
import {
  getSessionAggregatedMetrics,
  formatMetricsReport,
  type AggregatedMetrics
} from '../../passive-context-metrics.ts';

// =============================================================================
// TYPES
// =============================================================================

export interface AggregatedObservabilityReport {
  generatedAt: Date;
  period: 'session' | 'hour' | 'day' | 'week';
  
  // Sumário executivo
  summary: {
    totalMessages: number;
    overallHealthScore: number; // 0-100
    criticalAlerts: number;
    warningAlerts: number;
  };
  
  // Métricas por domínio
  passiveContext: Partial<AggregatedMetrics>;
  ruleMemory: Partial<AggregatedRuleStats>;
  ragQuality: Partial<RAGQualityStats>;
  phaseLatency: {
    avgTotalMs: number;
    p95TotalMs: number;
    bottleneckPhases: string[];
  };
  
  // Alertas consolidados
  alerts: {
    source: 'passive_context' | 'rule_memory' | 'rag_quality' | 'phase_latency';
    type: string;
    message: string;
    severity: 'info' | 'warning' | 'critical';
  }[];
  
  // Targets vs Actual
  targetComparison: {
    metric: string;
    target: string;
    actual: string;
    status: 'passed' | 'warning' | 'failed';
  }[];
}

export interface PersistenceResult {
  success: boolean;
  recordsInserted: number;
  error?: string;
}

// =============================================================================
// AGGREGATION
// =============================================================================

/**
 * Gera relatório consolidado de todas as métricas
 */
export function generateAggregatedReport(): AggregatedObservabilityReport {
  const passiveContext = getSessionAggregatedMetrics();
  const ruleMemory = getSessionRuleAggregates();
  const ragQuality = getRAGQualityStats();
  const ragAlerts = checkRAGQualityAlerts();
  
  // Alertas consolidados
  const alerts: AggregatedObservabilityReport['alerts'] = [];
  
  // Alertas de RAG
  for (const alert of ragAlerts.alerts) {
    alerts.push({
      source: 'rag_quality',
      type: alert.type,
      message: alert.message,
      severity: alert.severity,
    });
  }
  
  // Alertas de Rule Memory
  if ((ruleMemory.avgComplianceRate || 100) < 90) {
    alerts.push({
      source: 'rule_memory',
      type: 'LOW_COMPLIANCE',
      message: `Taxa de conformidade está em ${ruleMemory.avgComplianceRate?.toFixed(1)}% (esperado: >95%)`,
      severity: (ruleMemory.avgComplianceRate || 100) < 80 ? 'critical' : 'warning',
    });
  }
  
  // Alertas de Passive Context
  if ((passiveContext.ruleAdherenceRate || 100) < 95) {
    alerts.push({
      source: 'passive_context',
      type: 'LOW_RULE_ADHERENCE',
      message: `Aderência a regras está em ${passiveContext.ruleAdherenceRate?.toFixed(1)}% (target: 95%+)`,
      severity: (passiveContext.ruleAdherenceRate || 100) < 85 ? 'critical' : 'warning',
    });
  }
  
  if ((passiveContext.avgPromptSizeChars || 0) > 7000) {
    alerts.push({
      source: 'passive_context',
      type: 'LARGE_PROMPT',
      message: `Tamanho médio de prompt está em ${((passiveContext.avgPromptSizeChars || 0) / 1024).toFixed(1)}KB (target: ≤6KB)`,
      severity: 'warning',
    });
  }
  
  if ((passiveContext.avgLLMLatencyMs || 0) > 2000) {
    alerts.push({
      source: 'passive_context',
      type: 'HIGH_LLM_LATENCY',
      message: `Latência LLM está em ${passiveContext.avgLLMLatencyMs?.toFixed(0)}ms (target: ≤1800ms)`,
      severity: (passiveContext.avgLLMLatencyMs || 0) > 3000 ? 'critical' : 'warning',
    });
  }
  
  // Target comparison
  const targetComparison: AggregatedObservabilityReport['targetComparison'] = [
    {
      metric: 'Aderência a Regras',
      target: '≥95%',
      actual: `${(passiveContext.ruleAdherenceRate || 0).toFixed(1)}%`,
      status: (passiveContext.ruleAdherenceRate || 0) >= 95 ? 'passed' : 
              (passiveContext.ruleAdherenceRate || 0) >= 85 ? 'warning' : 'failed',
    },
    {
      metric: 'Tamanho Prompt',
      target: '≤6KB',
      actual: `${((passiveContext.avgPromptSizeChars || 0) / 1024).toFixed(1)}KB`,
      status: (passiveContext.avgPromptSizeChars || 0) <= 6000 ? 'passed' : 
              (passiveContext.avgPromptSizeChars || 0) <= 7500 ? 'warning' : 'failed',
    },
    {
      metric: 'Latência LLM',
      target: '≤1800ms',
      actual: `${(passiveContext.avgLLMLatencyMs || 0).toFixed(0)}ms`,
      status: (passiveContext.avgLLMLatencyMs || 0) <= 1800 ? 'passed' : 
              (passiveContext.avgLLMLatencyMs || 0) <= 2500 ? 'warning' : 'failed',
    },
    {
      metric: 'Taxa Fast-Path',
      target: '≥60%',
      actual: `${(passiveContext.fastPathRate || 0).toFixed(1)}%`,
      status: (passiveContext.fastPathRate || 0) >= 60 ? 'passed' : 
              (passiveContext.fastPathRate || 0) >= 40 ? 'warning' : 'failed',
    },
    {
      metric: 'RAG Cache Hit',
      target: '≥50%',
      actual: `${(ragQuality.cacheHitRate || 0).toFixed(1)}%`,
      status: (ragQuality.cacheHitRate || 0) >= 50 ? 'passed' : 
              (ragQuality.cacheHitRate || 0) >= 30 ? 'warning' : 'failed',
    },
    {
      metric: 'Conformidade Regras',
      target: '≥95%',
      actual: `${(ruleMemory.avgComplianceRate || 0).toFixed(1)}%`,
      status: (ruleMemory.avgComplianceRate || 0) >= 95 ? 'passed' : 
              (ruleMemory.avgComplianceRate || 0) >= 85 ? 'warning' : 'failed',
    },
  ];
  
  // Calcula health score (0-100)
  const passedTargets = targetComparison.filter(t => t.status === 'passed').length;
  const warningTargets = targetComparison.filter(t => t.status === 'warning').length;
  const healthScore = Math.round(
    (passedTargets * 100 + warningTargets * 50) / targetComparison.length
  );
  
  return {
    generatedAt: new Date(),
    period: 'session',
    
    summary: {
      totalMessages: passiveContext.totalMessages || 0,
      overallHealthScore: healthScore,
      criticalAlerts: alerts.filter(a => a.severity === 'critical').length,
      warningAlerts: alerts.filter(a => a.severity === 'warning').length,
    },
    
    passiveContext,
    ruleMemory,
    ragQuality,
    phaseLatency: {
      avgTotalMs: passiveContext.avgTotalResponseTimeMs || 0,
      p95TotalMs: 0, // Seria calculado do PhaseMetricsCollector
      bottleneckPhases: [],
    },
    
    alerts,
    targetComparison,
  };
}

/**
 * Formata relatório completo para log
 */
export function formatFullObservabilityReport(): string {
  const report = generateAggregatedReport();
  
  const targetLines = report.targetComparison
    .map(t => {
      const icon = t.status === 'passed' ? '✅' : t.status === 'warning' ? '⚠️' : '❌';
      return `║ ${icon} ${t.metric.padEnd(22)} │ ${t.target.padEnd(10)} │ ${t.actual.padEnd(12)} ║`;
    })
    .join('\n');
  
  const alertLines = report.alerts.length > 0
    ? report.alerts.map(a => {
        const icon = a.severity === 'critical' ? '🚨' : '⚠️';
        return `  ${icon} [${a.source}] ${a.message}`;
      }).join('\n')
    : '  ✅ Nenhum alerta ativo';
  
  return `
╔══════════════════════════════════════════════════════════════╗
║     OBSERVABILITY REPORT - AGENTS.md-Style Architecture     ║
╠══════════════════════════════════════════════════════════════╣
║ SUMÁRIO EXECUTIVO                                            ║
║   Total Mensagens: ${report.summary.totalMessages}
║   Health Score: ${report.summary.overallHealthScore}/100
║   Alertas Críticos: ${report.summary.criticalAlerts}
║   Alertas Warning: ${report.summary.warningAlerts}
╠══════════════════════════════════════════════════════════════╣
║ TARGETS vs ACTUAL                                            ║
╠────────────────────────────┬────────────┬──────────────╣
║ Métrica                    │ Target     │ Atual        ║
╠────────────────────────────┼────────────┼──────────────╣
${targetLines}
╠══════════════════════════════════════════════════════════════╣
║ ALERTAS ATIVOS                                               ║
${alertLines}
╚══════════════════════════════════════════════════════════════╝

${formatMetricsReport(report.passiveContext)}

${formatRuleMemoryReport(report.ruleMemory)}

${formatRAGQualityReport(report.ragQuality)}
`.trim();
}

// =============================================================================
// PERSISTENCE
// =============================================================================

/**
 * Persiste métricas agregadas no banco
 */
export async function persistAggregatedMetrics(
  supabase: SupabaseClient,
  agentId: string
): Promise<PersistenceResult> {
  const report = generateAggregatedReport();
  
  try {
    const { error } = await supabase
      .from('observability_snapshots')
      .insert({
        agent_id: agentId,
        period: report.period,
        generated_at: report.generatedAt.toISOString(),
        summary: report.summary,
        passive_context: report.passiveContext,
        rule_memory: report.ruleMemory,
        rag_quality: report.ragQuality,
        phase_latency: report.phaseLatency,
        alerts: report.alerts,
        target_comparison: report.targetComparison,
      });
    
    if (error) {
      console.error(`${LOG_PREFIX}[METRICS_AGGREGATOR] Persistence error:`, error);
      return { success: false, recordsInserted: 0, error: error.message };
    }
    
    console.log(`${LOG_PREFIX}[METRICS_AGGREGATOR] ✅ Metrics persisted successfully`);
    return { success: true, recordsInserted: 1 };
    
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`${LOG_PREFIX}[METRICS_AGGREGATOR] Exception:`, message);
    return { success: false, recordsInserted: 0, error: message };
  }
}

/**
 * Limpa métricas antigas (retention policy)
 */
export async function cleanupOldMetrics(
  supabase: SupabaseClient,
  retentionDays: number = RETENTION_DAYS
): Promise<{ deleted: number; error?: string }> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  
  try {
    const { data, error } = await supabase
      .from('observability_snapshots')
      .delete()
      .lt('generated_at', cutoffDate.toISOString())
      .select('id');
    
    if (error) {
      return { deleted: 0, error: error.message };
    }
    
    const count = data?.length || 0;
    if (count > 0) {
      console.log(`${LOG_PREFIX}[METRICS_AGGREGATOR] Cleaned up ${count} old snapshots`);
    }
    
    return { deleted: count };
    
  } catch (err) {
    return { deleted: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Busca snapshots para análise
 */
export async function getMetricsSnapshots(
  supabase: SupabaseClient,
  options: {
    agentId?: string;
    period?: 'session' | 'hour' | 'day' | 'week';
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }
): Promise<{ snapshots: AggregatedObservabilityReport[]; error?: string }> {
  try {
    let query = supabase
      .from('observability_snapshots')
      .select('*')
      .order('generated_at', { ascending: false })
      .limit(options.limit || 100);
    
    if (options.agentId) {
      query = query.eq('agent_id', options.agentId);
    }
    
    if (options.period) {
      query = query.eq('period', options.period);
    }
    
    if (options.startDate) {
      query = query.gte('generated_at', options.startDate.toISOString());
    }
    
    if (options.endDate) {
      query = query.lte('generated_at', options.endDate.toISOString());
    }
    
    const { data, error } = await query;
    
    if (error) {
      return { snapshots: [], error: error.message };
    }
    
    return { snapshots: data || [] };
    
  } catch (err) {
    return { snapshots: [], error: err instanceof Error ? err.message : String(err) };
  }
}
