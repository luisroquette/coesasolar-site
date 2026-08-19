/**
 * Rule Memory Metrics
 * Rastreia eficácia das regras injetadas via Passive Context
 * 
 * Métricas:
 * - Taxa de aplicação de regras
 * - Regras mais utilizadas
 * - Regras violadas
 * - Correlação regra-sucesso
 */

import { LOG_PREFIX } from './constants.ts';

// =============================================================================
// TYPES
// =============================================================================

export interface RuleApplication {
  ruleId: string;
  ruleName: string;
  ruleCode: string;
  priority: number;
  funnelStage: string;
  applied: boolean;
  appliedAt: Date;
  violationDetected: boolean;
  violationType?: 'ignored' | 'contradicted' | 'partial';
  correctedByGuardrail: boolean;
  llmFollowedInstruction: boolean;
}

export interface RuleMemoryStats {
  conversaId: string;
  agentId: string;
  timestamp: Date;
  
  // Contadores
  rulesInjected: number;
  rulesApplied: number;
  rulesViolated: number;
  rulesCorrectedByGuardrail: number;
  
  // Taxas
  applicationRate: number;
  complianceRate: number;
  guardrailCorrectionRate: number;
  
  // Regras específicas
  ruleApplications: RuleApplication[];
  topAppliedRules: string[];
  topViolatedRules: string[];
  
  // Performance
  ruleInjectionTimeMs: number;
  ruleMatchingTimeMs: number;
}

export interface AggregatedRuleStats {
  period: 'hour' | 'day' | 'week';
  periodStart: Date;
  periodEnd: Date;
  
  // Contadores globais
  totalRulesInjected: number;
  totalRulesApplied: number;
  totalRulesViolated: number;
  
  // Taxas médias
  avgApplicationRate: number;
  avgComplianceRate: number;
  avgGuardrailCorrectionRate: number;
  
  // Top rules
  mostAppliedRules: { ruleCode: string; count: number; applicationRate: number }[];
  mostViolatedRules: { ruleCode: string; count: number; violationRate: number }[];
  mostEffectiveRules: { ruleCode: string; complianceRate: number }[];
  
  // Por estágio do funil
  rulesByFunnelStage: Record<string, {
    injected: number;
    applied: number;
    violated: number;
  }>;
}

// =============================================================================
// IN-MEMORY TRACKING
// =============================================================================

let sessionRuleStats: RuleMemoryStats[] = [];
const MAX_SESSION_STATS = 200;

// =============================================================================
// TRACKING FUNCTIONS
// =============================================================================

/**
 * Cria um tracker de regras para uma mensagem
 */
export function createRuleTracker(conversaId: string, agentId: string): RuleMemoryStats {
  return {
    conversaId,
    agentId,
    timestamp: new Date(),
    
    rulesInjected: 0,
    rulesApplied: 0,
    rulesViolated: 0,
    rulesCorrectedByGuardrail: 0,
    
    applicationRate: 0,
    complianceRate: 100,
    guardrailCorrectionRate: 0,
    
    ruleApplications: [],
    topAppliedRules: [],
    topViolatedRules: [],
    
    ruleInjectionTimeMs: 0,
    ruleMatchingTimeMs: 0,
  };
}

/**
 * Registra aplicação de uma regra
 */
export function trackRuleApplication(
  stats: RuleMemoryStats,
  application: RuleApplication
): void {
  stats.ruleApplications.push(application);
  
  if (application.applied) {
    stats.rulesApplied++;
  }
  
  if (application.violationDetected) {
    stats.rulesViolated++;
  }
  
  if (application.correctedByGuardrail) {
    stats.rulesCorrectedByGuardrail++;
  }
  
  // Recalcula taxas
  stats.applicationRate = stats.rulesInjected > 0 
    ? (stats.rulesApplied / stats.rulesInjected) * 100 
    : 0;
    
  stats.complianceRate = stats.rulesInjected > 0 
    ? ((stats.rulesInjected - stats.rulesViolated) / stats.rulesInjected) * 100 
    : 100;
    
  stats.guardrailCorrectionRate = stats.rulesViolated > 0 
    ? (stats.rulesCorrectedByGuardrail / stats.rulesViolated) * 100 
    : 0;
}

/**
 * Finaliza e persiste stats de regras
 */
export function finalizeRuleStats(stats: RuleMemoryStats): void {
  // Calcula top rules
  const appliedCounts: Record<string, number> = {};
  const violatedCounts: Record<string, number> = {};
  
  for (const app of stats.ruleApplications) {
    if (app.applied) {
      appliedCounts[app.ruleCode] = (appliedCounts[app.ruleCode] || 0) + 1;
    }
    if (app.violationDetected) {
      violatedCounts[app.ruleCode] = (violatedCounts[app.ruleCode] || 0) + 1;
    }
  }
  
  stats.topAppliedRules = Object.entries(appliedCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([code]) => code);
    
  stats.topViolatedRules = Object.entries(violatedCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([code]) => code);
  
  // Adiciona à sessão
  sessionRuleStats.push(stats);
  
  if (sessionRuleStats.length > MAX_SESSION_STATS) {
    sessionRuleStats = sessionRuleStats.slice(-MAX_SESSION_STATS);
  }
  
  // Log estruturado
  console.log(`${LOG_PREFIX}[RULE_MEMORY_METRICS]`, JSON.stringify({
    conversaId: stats.conversaId,
    rulesInjected: stats.rulesInjected,
    rulesApplied: stats.rulesApplied,
    rulesViolated: stats.rulesViolated,
    complianceRate: stats.complianceRate.toFixed(1),
    guardrailCorrectionRate: stats.guardrailCorrectionRate.toFixed(1),
    topApplied: stats.topAppliedRules.slice(0, 3),
    topViolated: stats.topViolatedRules.slice(0, 3),
  }));
}

/**
 * Retorna estatísticas agregadas da sessão
 */
export function getSessionRuleAggregates(): Partial<AggregatedRuleStats> {
  if (sessionRuleStats.length === 0) {
    return { totalRulesInjected: 0 };
  }
  
  const avg = (arr: number[]) => arr.length > 0 
    ? arr.reduce((a, b) => a + b, 0) / arr.length 
    : 0;
  
  // Contadores globais
  const totalRulesInjected = sessionRuleStats.reduce((sum, s) => sum + s.rulesInjected, 0);
  const totalRulesApplied = sessionRuleStats.reduce((sum, s) => sum + s.rulesApplied, 0);
  const totalRulesViolated = sessionRuleStats.reduce((sum, s) => sum + s.rulesViolated, 0);
  
  // Agregar regras mais aplicadas/violadas
  const appliedByRule: Record<string, number> = {};
  const violatedByRule: Record<string, number> = {};
  const byFunnelStage: Record<string, { injected: number; applied: number; violated: number }> = {};
  
  for (const stat of sessionRuleStats) {
    for (const app of stat.ruleApplications) {
      // Por regra
      if (app.applied) {
        appliedByRule[app.ruleCode] = (appliedByRule[app.ruleCode] || 0) + 1;
      }
      if (app.violationDetected) {
        violatedByRule[app.ruleCode] = (violatedByRule[app.ruleCode] || 0) + 1;
      }
      
      // Por estágio
      if (!byFunnelStage[app.funnelStage]) {
        byFunnelStage[app.funnelStage] = { injected: 0, applied: 0, violated: 0 };
      }
      byFunnelStage[app.funnelStage].injected++;
      if (app.applied) byFunnelStage[app.funnelStage].applied++;
      if (app.violationDetected) byFunnelStage[app.funnelStage].violated++;
    }
  }
  
  const mostAppliedRules = Object.entries(appliedByRule)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([ruleCode, count]) => ({
      ruleCode,
      count,
      applicationRate: totalRulesInjected > 0 ? (count / totalRulesInjected) * 100 : 0,
    }));
    
  const mostViolatedRules = Object.entries(violatedByRule)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([ruleCode, count]) => ({
      ruleCode,
      count,
      violationRate: totalRulesInjected > 0 ? (count / totalRulesInjected) * 100 : 0,
    }));
  
  return {
    totalRulesInjected,
    totalRulesApplied,
    totalRulesViolated,
    
    avgApplicationRate: avg(sessionRuleStats.map(s => s.applicationRate)),
    avgComplianceRate: avg(sessionRuleStats.map(s => s.complianceRate)),
    avgGuardrailCorrectionRate: avg(sessionRuleStats.map(s => s.guardrailCorrectionRate)),
    
    mostAppliedRules,
    mostViolatedRules,
    rulesByFunnelStage: byFunnelStage,
  };
}

/**
 * Formata relatório de regras para log
 */
export function formatRuleMemoryReport(stats: Partial<AggregatedRuleStats>): string {
  if (!stats.totalRulesInjected) {
    return `${LOG_PREFIX}[RULE_MEMORY_REPORT] Sem dados suficientes`;
  }
  
  const topApplied = stats.mostAppliedRules?.slice(0, 5)
    .map(r => `  ${r.ruleCode}: ${r.count} (${r.applicationRate.toFixed(1)}%)`)
    .join('\n') || '  N/A';
    
  const topViolated = stats.mostViolatedRules?.slice(0, 5)
    .map(r => `  ${r.ruleCode}: ${r.count} (${r.violationRate.toFixed(1)}%)`)
    .join('\n') || '  N/A';
  
  return `
╔══════════════════════════════════════════════════════════════╗
║              RULE MEMORY METRICS REPORT                      ║
╠══════════════════════════════════════════════════════════════╣
║ TOTAIS                                                       ║
║   Regras Injetadas: ${stats.totalRulesInjected}
║   Regras Aplicadas: ${stats.totalRulesApplied}
║   Regras Violadas: ${stats.totalRulesViolated}
╠──────────────────────────────────────────────────────────────╣
║ TAXAS MÉDIAS                                                 ║
║   Taxa de Aplicação: ${stats.avgApplicationRate?.toFixed(1)}%
║   Taxa de Conformidade: ${stats.avgComplianceRate?.toFixed(1)}%
║   Taxa de Correção Guardrail: ${stats.avgGuardrailCorrectionRate?.toFixed(1)}%
╠──────────────────────────────────────────────────────────────╣
║ TOP 5 REGRAS MAIS APLICADAS                                  ║
${topApplied}
╠──────────────────────────────────────────────────────────────╣
║ TOP 5 REGRAS MAIS VIOLADAS                                   ║
${topViolated}
╚══════════════════════════════════════════════════════════════╝
`.trim();
}

/**
 * Limpa estatísticas da sessão
 */
export function clearSessionRuleStats(): void {
  sessionRuleStats = [];
}
