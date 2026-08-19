// ═══════════════════════════════════════════════════════════════════════════
// LLM COST MONITOR - Budget Tracking & Alerts
// ═══════════════════════════════════════════════════════════════════════════
// Monitora custos de LLM em tempo real e dispara alertas quando:
// - Custo diário excede threshold
// - Taxa de uso anormal detectada
// - Projeção mensal excede budget
// ═══════════════════════════════════════════════════════════════════════════

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface LLMCostConfig {
  // Custo por 1K tokens de input (USD)
  costPer1kInputTokens: Record<string, number>;
  // Custo por 1K tokens de output (USD)
  costPer1kOutputTokens: Record<string, number>;
  // Budget diário (USD)
  dailyBudgetUsd: number;
  // Budget mensal (USD)
  monthlyBudgetUsd: number;
  // Threshold para alerta (% do budget)
  alertThresholdPercent: number;
  // Threshold crítico (% do budget)
  criticalThresholdPercent: number;
  // Habilitar alertas
  alertsEnabled: boolean;
}

export interface UsageRecord {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  timestamp: Date;
  agentId: string;
  conversaId: string | null;
}

export interface CostSummary {
  todayUsd: number;
  monthUsd: number;
  todayCalls: number;
  monthCalls: number;
  avgCostPerCall: number;
  topModels: { model: string; cost: number; calls: number }[];
  projectedMonthlyUsd: number;
  budgetStatus: 'ok' | 'warning' | 'critical' | 'exceeded';
  percentOfDailyBudget: number;
  percentOfMonthlyBudget: number;
}

export interface CostAlert {
  type: 'daily_warning' | 'daily_critical' | 'monthly_warning' | 'monthly_critical' | 'spike_detected';
  message: string;
  currentCost: number;
  threshold: number;
  timestamp: Date;
}

// ═══════════════════════════════════════════════════════════════
// DEFAULT CONFIG - Model Pricing (approximate)
// ═══════════════════════════════════════════════════════════════

const DEFAULT_COST_CONFIG: LLMCostConfig = {
  costPer1kInputTokens: {
    'google/gemini-3-flash-preview': 0.0001,
    'google/gemini-2.5-flash': 0.00015,
    'google/gemini-2.5-pro': 0.00125,
    'openai/gpt-5': 0.005,
    'openai/gpt-5-mini': 0.00015,
    'openai/gpt-5-nano': 0.0001,
    'default': 0.0002,
  },
  costPer1kOutputTokens: {
    'google/gemini-3-flash-preview': 0.0004,
    'google/gemini-2.5-flash': 0.0006,
    'google/gemini-2.5-pro': 0.005,
    'openai/gpt-5': 0.015,
    'openai/gpt-5-mini': 0.0006,
    'openai/gpt-5-nano': 0.0004,
    'default': 0.0008,
  },
  dailyBudgetUsd: 50,
  monthlyBudgetUsd: 1000,
  alertThresholdPercent: 80,
  criticalThresholdPercent: 95,
  alertsEnabled: true,
};

// In-memory tracking (per instance)
let dailyUsage: UsageRecord[] = [];
let monthlyTotals = { calls: 0, costUsd: 0 };
let lastDayReset = new Date().toDateString();
let lastMonthReset = new Date().toISOString().slice(0, 7); // YYYY-MM
let configCache: LLMCostConfig | null = null;

// ═══════════════════════════════════════════════════════════════
// CONFIG LOADING
// ═══════════════════════════════════════════════════════════════

/**
 * Load cost config from database
 */
export async function loadCostConfig(supabase: SupabaseClient): Promise<LLMCostConfig> {
  if (configCache) return configCache;

  try {
    const { data, error } = await supabase
      .from('configuracoes_sistema')
      .select('chave, valor')
      .in('chave', [
        'llm_daily_budget_usd',
        'llm_monthly_budget_usd',
        'llm_alert_threshold_percent',
        'llm_critical_threshold_percent',
        'llm_alerts_enabled',
      ]);

    if (error || !data) {
      return DEFAULT_COST_CONFIG;
    }

    const configMap = new Map<string, string>();
    for (const row of data) {
      configMap.set(row.chave, row.valor);
    }

    configCache = {
      ...DEFAULT_COST_CONFIG,
      dailyBudgetUsd: parseFloat(configMap.get('llm_daily_budget_usd') || '') || DEFAULT_COST_CONFIG.dailyBudgetUsd,
      monthlyBudgetUsd: parseFloat(configMap.get('llm_monthly_budget_usd') || '') || DEFAULT_COST_CONFIG.monthlyBudgetUsd,
      alertThresholdPercent: parseInt(configMap.get('llm_alert_threshold_percent') || '') || DEFAULT_COST_CONFIG.alertThresholdPercent,
      criticalThresholdPercent: parseInt(configMap.get('llm_critical_threshold_percent') || '') || DEFAULT_COST_CONFIG.criticalThresholdPercent,
      alertsEnabled: configMap.get('llm_alerts_enabled') !== 'false',
    };

    return configCache;
  } catch (err) {
    console.warn('[LLM_COST] Failed to load config:', err);
    return DEFAULT_COST_CONFIG;
  }
}

// ═══════════════════════════════════════════════════════════════
// COST CALCULATION
// ═══════════════════════════════════════════════════════════════

/**
 * Calculate cost for a specific LLM call
 */
export function calculateCallCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  config: LLMCostConfig = DEFAULT_COST_CONFIG
): number {
  const inputCostPer1k = config.costPer1kInputTokens[model] || config.costPer1kInputTokens['default'];
  const outputCostPer1k = config.costPer1kOutputTokens[model] || config.costPer1kOutputTokens['default'];

  const inputCost = (inputTokens / 1000) * inputCostPer1k;
  const outputCost = (outputTokens / 1000) * outputCostPer1k;

  return inputCost + outputCost;
}

/**
 * Estimate tokens from text (rough approximation)
 */
export function estimateTokens(text: string): number {
  // Rough estimate: ~4 chars per token for Portuguese
  return Math.ceil(text.length / 4);
}

// ═══════════════════════════════════════════════════════════════
// USAGE TRACKING
// ═══════════════════════════════════════════════════════════════

/**
 * Reset daily tracking if day changed
 */
function checkDayReset(): void {
  const today = new Date().toDateString();
  if (today !== lastDayReset) {
    console.log('[LLM_COST] Day changed, resetting daily usage');
    dailyUsage = [];
    lastDayReset = today;
  }
}

/**
 * Reset monthly tracking if month changed
 */
function checkMonthReset(): void {
  const currentMonth = new Date().toISOString().slice(0, 7);
  if (currentMonth !== lastMonthReset) {
    console.log('[LLM_COST] Month changed, resetting monthly totals');
    monthlyTotals = { calls: 0, costUsd: 0 };
    lastMonthReset = currentMonth;
  }
}

/**
 * Record an LLM call usage
 */
export async function recordLLMUsage(
  supabase: SupabaseClient,
  model: string,
  inputTokens: number,
  outputTokens: number,
  agentId: string = 'sofia',
  conversaId: string | null = null
): Promise<{ cost: number; alert: CostAlert | null }> {
  checkDayReset();
  checkMonthReset();

  const config = await loadCostConfig(supabase);
  const costUsd = calculateCallCost(model, inputTokens, outputTokens, config);

  const record: UsageRecord = {
    model,
    inputTokens,
    outputTokens,
    costUsd,
    timestamp: new Date(),
    agentId,
    conversaId,
  };

  // Update in-memory tracking
  dailyUsage.push(record);
  monthlyTotals.calls++;
  monthlyTotals.costUsd += costUsd;

  // Persist to database (non-blocking)
  persistUsageRecord(supabase, record).catch(err => {
    console.warn('[LLM_COST] Failed to persist usage:', err);
  });

  // Check for alerts
  const alert = await checkAndTriggerAlerts(supabase, config);

  return { cost: costUsd, alert };
}

/**
 * Persist usage record to database
 */
async function persistUsageRecord(
  supabase: SupabaseClient,
  record: UsageRecord
): Promise<void> {
  try {
    await supabase.from('llm_usage_log').insert({
      model: record.model,
      input_tokens: record.inputTokens,
      output_tokens: record.outputTokens,
      cost_usd: record.costUsd,
      agent_id: record.agentId,
      conversa_id: record.conversaId,
      created_at: record.timestamp.toISOString(),
    });
  } catch (err) {
    console.warn('[LLM_COST] Failed to persist record:', err);
  }
}

// ═══════════════════════════════════════════════════════════════
// COST SUMMARY & ANALYTICS
// ═══════════════════════════════════════════════════════════════

/**
 * Get current cost summary
 */
export async function getCostSummary(supabase: SupabaseClient): Promise<CostSummary> {
  checkDayReset();
  checkMonthReset();

  const config = await loadCostConfig(supabase);

  // Calculate today's totals from in-memory
  const todayUsd = dailyUsage.reduce((sum, r) => sum + r.costUsd, 0);
  const todayCalls = dailyUsage.length;

  // Try to get accurate monthly data from database
  let monthUsd = monthlyTotals.costUsd;
  let monthCalls = monthlyTotals.calls;

  try {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('llm_usage_log')
      .select('cost_usd')
      .gte('created_at', startOfMonth.toISOString());

    if (!error && data) {
      monthUsd = data.reduce((sum, r) => sum + (r.cost_usd || 0), 0);
      monthCalls = data.length;
    }
  } catch (err) {
    console.warn('[LLM_COST] Failed to load monthly data:', err);
  }

  // Calculate model breakdown
  const modelMap = new Map<string, { cost: number; calls: number }>();
  for (const record of dailyUsage) {
    const existing = modelMap.get(record.model) || { cost: 0, calls: 0 };
    modelMap.set(record.model, {
      cost: existing.cost + record.costUsd,
      calls: existing.calls + 1,
    });
  }

  const topModels = Array.from(modelMap.entries())
    .map(([model, data]) => ({ model, ...data }))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 5);

  // Project monthly based on current day's rate
  const dayOfMonth = new Date().getDate();
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const projectedMonthlyUsd = (monthUsd / dayOfMonth) * daysInMonth;

  // Determine budget status
  const percentOfDailyBudget = (todayUsd / config.dailyBudgetUsd) * 100;
  const percentOfMonthlyBudget = (monthUsd / config.monthlyBudgetUsd) * 100;

  let budgetStatus: 'ok' | 'warning' | 'critical' | 'exceeded' = 'ok';
  if (percentOfDailyBudget >= 100 || percentOfMonthlyBudget >= 100) {
    budgetStatus = 'exceeded';
  } else if (percentOfDailyBudget >= config.criticalThresholdPercent || percentOfMonthlyBudget >= config.criticalThresholdPercent) {
    budgetStatus = 'critical';
  } else if (percentOfDailyBudget >= config.alertThresholdPercent || percentOfMonthlyBudget >= config.alertThresholdPercent) {
    budgetStatus = 'warning';
  }

  return {
    todayUsd,
    monthUsd,
    todayCalls,
    monthCalls,
    avgCostPerCall: todayCalls > 0 ? todayUsd / todayCalls : 0,
    topModels,
    projectedMonthlyUsd,
    budgetStatus,
    percentOfDailyBudget,
    percentOfMonthlyBudget,
  };
}

// ═══════════════════════════════════════════════════════════════
// ALERTING SYSTEM
// ═══════════════════════════════════════════════════════════════

// Track last alert to avoid spam
let lastAlertType: string | null = null;
let lastAlertTime = 0;
const ALERT_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes between same alert type

/**
 * Check and trigger alerts if thresholds exceeded
 */
async function checkAndTriggerAlerts(
  supabase: SupabaseClient,
  config: LLMCostConfig
): Promise<CostAlert | null> {
  if (!config.alertsEnabled) return null;

  const summary = await getCostSummary(supabase);
  const now = Date.now();

  let alert: CostAlert | null = null;

  // Check daily critical
  if (summary.percentOfDailyBudget >= config.criticalThresholdPercent) {
    if (shouldTriggerAlert('daily_critical', now)) {
      alert = {
        type: 'daily_critical',
        message: `🚨 CRÍTICO: Custo diário LLM atingiu ${summary.percentOfDailyBudget.toFixed(1)}% do budget ($${summary.todayUsd.toFixed(2)}/$${config.dailyBudgetUsd})`,
        currentCost: summary.todayUsd,
        threshold: config.dailyBudgetUsd,
        timestamp: new Date(),
      };
    }
  }
  // Check daily warning
  else if (summary.percentOfDailyBudget >= config.alertThresholdPercent) {
    if (shouldTriggerAlert('daily_warning', now)) {
      alert = {
        type: 'daily_warning',
        message: `⚠️ ALERTA: Custo diário LLM atingiu ${summary.percentOfDailyBudget.toFixed(1)}% do budget ($${summary.todayUsd.toFixed(2)}/$${config.dailyBudgetUsd})`,
        currentCost: summary.todayUsd,
        threshold: config.dailyBudgetUsd,
        timestamp: new Date(),
      };
    }
  }

  // Check monthly critical
  if (!alert && summary.percentOfMonthlyBudget >= config.criticalThresholdPercent) {
    if (shouldTriggerAlert('monthly_critical', now)) {
      alert = {
        type: 'monthly_critical',
        message: `🚨 CRÍTICO: Custo mensal LLM atingiu ${summary.percentOfMonthlyBudget.toFixed(1)}% do budget ($${summary.monthUsd.toFixed(2)}/$${config.monthlyBudgetUsd})`,
        currentCost: summary.monthUsd,
        threshold: config.monthlyBudgetUsd,
        timestamp: new Date(),
      };
    }
  }

  // Send alert if triggered
  if (alert) {
    await sendCostAlert(supabase, alert);
    lastAlertType = alert.type;
    lastAlertTime = now;
  }

  return alert;
}

/**
 * Check if alert should be triggered (respects cooldown)
 */
function shouldTriggerAlert(alertType: string, now: number): boolean {
  if (lastAlertType === alertType && (now - lastAlertTime) < ALERT_COOLDOWN_MS) {
    return false;
  }
  return true;
}

/**
 * Send cost alert notification
 */
async function sendCostAlert(supabase: SupabaseClient, alert: CostAlert): Promise<void> {
  console.warn(`[LLM_COST] ${alert.message}`);

  try {
    // Insert admin notification
    await supabase.from('admin_notifications').insert({
      title: alert.type.includes('critical') ? '🚨 Alerta Crítico LLM' : '⚠️ Alerta de Custo LLM',
      message: alert.message,
      type: 'llm_cost_alert',
      entity_type: 'system',
      created_at: alert.timestamp.toISOString(),
    });
  } catch (err) {
    console.error('[LLM_COST] Failed to create alert notification:', err);
  }
}

// ═══════════════════════════════════════════════════════════════
// HELPER FOR LLM-CLIENT INTEGRATION
// ═══════════════════════════════════════════════════════════════

/**
 * Wrapper to record usage after LLM call
 * Call this from llm-client.ts after successful response
 */
export async function recordLLMCallFromResponse(
  supabase: SupabaseClient,
  model: string,
  usage: { prompt_tokens?: number; completion_tokens?: number } | undefined,
  agentId: string = 'sofia',
  conversaId: string | null = null
): Promise<void> {
  if (!usage) return;

  const inputTokens = usage.prompt_tokens || 0;
  const outputTokens = usage.completion_tokens || 0;

  if (inputTokens === 0 && outputTokens === 0) return;

  const { cost, alert } = await recordLLMUsage(
    supabase,
    model,
    inputTokens,
    outputTokens,
    agentId,
    conversaId
  );

  console.log(`[LLM_COST] Recorded: ${model} - ${inputTokens}+${outputTokens} tokens = $${cost.toFixed(6)}`);

  if (alert) {
    console.warn(`[LLM_COST] Alert triggered: ${alert.type}`);
  }
}
