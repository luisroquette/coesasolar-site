/**
 * INFRA MONITOR SCHEDULER
 * Sprint 1 - Escalabilidade Sofia Bot
 * 
 * Monitora e alerta sobre:
 * - DB Connection Pool usage
 * - Rate limit status
 * - Lock contention
 * - API quota consumption
 * 
 * Execução: A cada 5 minutos via cron
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getGlobalRateLimitStats } from '../_shared/entry-point-rate-limiter.ts';
import { getStrictCorsHeaders, jsonResponse, errorResponse } from '../_shared/security-helpers.ts';

// ═══════════════════════════════════════════════════════════════
// THRESHOLDS
// ═══════════════════════════════════════════════════════════════

interface Thresholds {
  dbPoolWarning: number;      // % of pool usage
  dbPoolCritical: number;
  rateLimitWarning: number;   // % of global limit
  rateLimitCritical: number;
  locksWarning: number;       // Active locks count
  locksCritical: number;
  blockedPhonesWarning: number;
  blockedPhonesCritical: number;
}

const DEFAULT_THRESHOLDS: Thresholds = {
  dbPoolWarning: 70,
  dbPoolCritical: 90,
  rateLimitWarning: 70,
  rateLimitCritical: 90,
  locksWarning: 10,
  locksCritical: 50,
  blockedPhonesWarning: 5,
  blockedPhonesCritical: 20,
};

// ═══════════════════════════════════════════════════════════════
// METRICS COLLECTION
// ═══════════════════════════════════════════════════════════════

interface MetricResult {
  name: string;
  value: number;
  thresholdWarning: number;
  thresholdCritical: number;
  status: 'ok' | 'warning' | 'critical';
  metadata?: Record<string, unknown>;
}

/**
 * Collect DB connection pool metrics
 */
async function collectDBPoolMetrics(supabase: any): Promise<MetricResult> {
  try {
    // Query pg_stat_activity for connection count
    const { data, error } = await supabase.rpc('get_db_connection_stats');
    
    if (error) {
      // Fallback: just count active queries
      const { count } = await supabase
        .from('chatbot_conversas')
        .select('id', { count: 'exact', head: true })
        .limit(0);
      
      return {
        name: 'db_pool_usage',
        value: 0, // Can't determine without RPC
        thresholdWarning: DEFAULT_THRESHOLDS.dbPoolWarning,
        thresholdCritical: DEFAULT_THRESHOLDS.dbPoolCritical,
        status: 'ok',
        metadata: { note: 'RPC not available, using fallback' },
      };
    }

    const poolUsage = data?.usage_percent || 0;
    
    return {
      name: 'db_pool_usage',
      value: poolUsage,
      thresholdWarning: DEFAULT_THRESHOLDS.dbPoolWarning,
      thresholdCritical: DEFAULT_THRESHOLDS.dbPoolCritical,
      status: poolUsage >= DEFAULT_THRESHOLDS.dbPoolCritical 
        ? 'critical' 
        : poolUsage >= DEFAULT_THRESHOLDS.dbPoolWarning 
          ? 'warning' 
          : 'ok',
      metadata: data,
    };
  } catch (err) {
    console.error('[INFRA_MONITOR] DB pool metrics error:', err);
    return {
      name: 'db_pool_usage',
      value: -1,
      thresholdWarning: DEFAULT_THRESHOLDS.dbPoolWarning,
      thresholdCritical: DEFAULT_THRESHOLDS.dbPoolCritical,
      status: 'ok',
      metadata: { error: String(err) },
    };
  }
}

/**
 * Collect rate limit metrics from in-memory stats
 */
function collectRateLimitMetrics(): MetricResult {
  const stats = getGlobalRateLimitStats();
  const globalLimit = 500; // From DEFAULT_CONFIG
  const usagePercent = (stats.requestsLastMinute / globalLimit) * 100;
  
  return {
    name: 'rate_limit_usage',
    value: usagePercent,
    thresholdWarning: DEFAULT_THRESHOLDS.rateLimitWarning,
    thresholdCritical: DEFAULT_THRESHOLDS.rateLimitCritical,
    status: usagePercent >= DEFAULT_THRESHOLDS.rateLimitCritical 
      ? 'critical' 
      : usagePercent >= DEFAULT_THRESHOLDS.rateLimitWarning 
        ? 'warning' 
        : 'ok',
    metadata: {
      requestsLastMinute: stats.requestsLastMinute,
      uniquePhonesActive: stats.uniquePhonesActive,
      blockedPhones: stats.blockedPhones,
      globalLimit,
    },
  };
}

/**
 * Collect blocked phones metric
 */
function collectBlockedPhonesMetric(): MetricResult {
  const stats = getGlobalRateLimitStats();
  
  return {
    name: 'blocked_phones',
    value: stats.blockedPhones,
    thresholdWarning: DEFAULT_THRESHOLDS.blockedPhonesWarning,
    thresholdCritical: DEFAULT_THRESHOLDS.blockedPhonesCritical,
    status: stats.blockedPhones >= DEFAULT_THRESHOLDS.blockedPhonesCritical 
      ? 'critical' 
      : stats.blockedPhones >= DEFAULT_THRESHOLDS.blockedPhonesWarning 
        ? 'warning' 
        : 'ok',
    metadata: { count: stats.blockedPhones },
  };
}

/**
 * Collect active locks metric
 */
async function collectLocksMetric(supabase: any): Promise<MetricResult> {
  try {
    const { count, error } = await supabase
      .from('cross_webhook_locks')
      .select('id', { count: 'exact', head: true })
      .gt('expires_at', new Date().toISOString());
    
    if (error) throw error;
    
    const locksCount = count || 0;
    
    return {
      name: 'active_locks',
      value: locksCount,
      thresholdWarning: DEFAULT_THRESHOLDS.locksWarning,
      thresholdCritical: DEFAULT_THRESHOLDS.locksCritical,
      status: locksCount >= DEFAULT_THRESHOLDS.locksCritical 
        ? 'critical' 
        : locksCount >= DEFAULT_THRESHOLDS.locksWarning 
          ? 'warning' 
          : 'ok',
      metadata: { count: locksCount },
    };
  } catch (err) {
    console.error('[INFRA_MONITOR] Locks metrics error:', err);
    return {
      name: 'active_locks',
      value: 0,
      thresholdWarning: DEFAULT_THRESHOLDS.locksWarning,
      thresholdCritical: DEFAULT_THRESHOLDS.locksCritical,
      status: 'ok',
      metadata: { error: String(err) },
    };
  }
}

/**
 * Collect pending messages queue size
 */
async function collectPendingMessagesMetric(supabase: any): Promise<MetricResult> {
  try {
    const { count, error } = await supabase
      .from('chatbot_mensagens_pendentes')
      .select('id', { count: 'exact', head: true })
      .is('resolved_at', null);
    
    if (error) throw error;
    
    const pendingCount = count || 0;
    
    return {
      name: 'pending_messages',
      value: pendingCount,
      thresholdWarning: 50,
      thresholdCritical: 200,
      status: pendingCount >= 200 
        ? 'critical' 
        : pendingCount >= 50 
          ? 'warning' 
          : 'ok',
      metadata: { count: pendingCount },
    };
  } catch (err) {
    console.error('[INFRA_MONITOR] Pending messages metrics error:', err);
    return {
      name: 'pending_messages',
      value: 0,
      thresholdWarning: 50,
      thresholdCritical: 200,
      status: 'ok',
      metadata: { error: String(err) },
    };
  }
}

/**
 * Collect active conversations count
 */
async function collectActiveConversationsMetric(supabase: any): Promise<MetricResult> {
  try {
    const { count, error } = await supabase
      .from('chatbot_conversas')
      .select('id', { count: 'exact', head: true })
      .is('ended_at', null);
    
    if (error) throw error;
    
    const activeCount = count || 0;
    
    return {
      name: 'active_conversations',
      value: activeCount,
      thresholdWarning: 500,
      thresholdCritical: 800,
      status: activeCount >= 800 
        ? 'critical' 
        : activeCount >= 500 
          ? 'warning' 
          : 'ok',
      metadata: { count: activeCount },
    };
  } catch (err) {
    console.error('[INFRA_MONITOR] Active conversations metrics error:', err);
    return {
      name: 'active_conversations',
      value: 0,
      thresholdWarning: 500,
      thresholdCritical: 800,
      status: 'ok',
      metadata: { error: String(err) },
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// ALERTING
// ═══════════════════════════════════════════════════════════════

/**
 * Send alert to admins via WhatsApp
 */
async function sendAlert(
  supabase: any,
  title: string,
  message: string,
  severity: 'warning' | 'critical'
): Promise<void> {
  try {
    // Get admin recipients
    const { data: recipients } = await supabase
      .from('daily_report_recipients')
      .select('telefone, nome')
      .eq('is_active', true)
      .contains('notification_types', ['infra_alerts']);
    
    if (!recipients || recipients.length === 0) {
      console.log('[INFRA_MONITOR] No recipients configured for infra alerts');
      return;
    }

    const emoji = severity === 'critical' ? '🚨' : '⚠️';
    const fullMessage = `${emoji} *ALERTA INFRAESTRUTURA*\n\n*${title}*\n\n${message}\n\n_${new Date().toLocaleString('pt-BR')}_`;

    // Send to each recipient
    for (const recipient of recipients) {
      try {
        const response = await fetch(
          `${Deno.env.get('SUPABASE_URL')}/functions/v1/z-api-send-message`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
            },
            body: JSON.stringify({
              phone: recipient.telefone,
              message: fullMessage,
              agentId: 'system',
            }),
          }
        );
        
        if (!response.ok) {
          console.warn(`[INFRA_MONITOR] Failed to send alert to ${recipient.nome}`);
        }
      } catch (err) {
        console.warn(`[INFRA_MONITOR] Error sending alert to ${recipient.nome}:`, err);
      }
    }
  } catch (err) {
    console.error('[INFRA_MONITOR] Alert sending error:', err);
  }
}

// ═══════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  const corsHeaders = getStrictCorsHeaders(req);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('[INFRA_MONITOR] Starting metrics collection...');

    // Collect all metrics in parallel
    const [
      dbPoolMetric,
      locksMetric,
      pendingMessagesMetric,
      activeConversationsMetric,
    ] = await Promise.all([
      collectDBPoolMetrics(supabase),
      collectLocksMetric(supabase),
      collectPendingMessagesMetric(supabase),
      collectActiveConversationsMetric(supabase),
    ]);

    // Collect in-memory metrics (sync)
    const rateLimitMetric = collectRateLimitMetrics();
    const blockedPhonesMetric = collectBlockedPhonesMetric();

    const allMetrics = [
      dbPoolMetric,
      rateLimitMetric,
      blockedPhonesMetric,
      locksMetric,
      pendingMessagesMetric,
      activeConversationsMetric,
    ];

    // Store metrics in database
    const metricsToInsert = allMetrics.map(m => ({
      metric_name: m.name,
      metric_value: m.value,
      threshold_warning: m.thresholdWarning,
      threshold_critical: m.thresholdCritical,
      metadata: {
        status: m.status,
        ...m.metadata,
      },
    }));

    const { error: insertError } = await supabase
      .from('infra_metrics')
      .insert(metricsToInsert);

    if (insertError) {
      console.error('[INFRA_MONITOR] Failed to insert metrics:', insertError);
    }

    // Check for alerts
    const criticalMetrics = allMetrics.filter(m => m.status === 'critical');
    const warningMetrics = allMetrics.filter(m => m.status === 'warning');

    // Send critical alerts
    for (const metric of criticalMetrics) {
      await sendAlert(
        supabase,
        `${metric.name.toUpperCase()} - CRÍTICO`,
        `Valor: ${metric.value.toFixed(1)}%\nLimite: ${metric.thresholdCritical}%\n\n${JSON.stringify(metric.metadata, null, 2)}`,
        'critical'
      );
    }

    // Send warning alerts (batch)
    if (warningMetrics.length > 0) {
      const warningList = warningMetrics
        .map(m => `• ${m.name}: ${m.value.toFixed(1)}% (limite: ${m.thresholdWarning}%)`)
        .join('\n');
      
      await sendAlert(
        supabase,
        'Métricas em Warning',
        warningList,
        'warning'
      );
    }

    // Cleanup old metrics (run periodically)
    const cleanupResult = await supabase.rpc('cleanup_old_infra_metrics');
    if (cleanupResult.data) {
      console.log(`[INFRA_MONITOR] Cleaned up ${cleanupResult.data} old metrics`);
    }

    const duration = Date.now() - startTime;
    
    console.log(`[INFRA_MONITOR] Completed in ${duration}ms`, {
      metrics: allMetrics.length,
      critical: criticalMetrics.length,
      warning: warningMetrics.length,
    });

    return jsonResponse({
      success: true,
      metrics: allMetrics,
      summary: {
        critical: criticalMetrics.length,
        warning: warningMetrics.length,
        ok: allMetrics.filter(m => m.status === 'ok').length,
      },
      durationMs: duration,
    }, 200, req);
  } catch (err) {
    console.error('[INFRA_MONITOR] Error:', err);
    return errorResponse(
      err instanceof Error ? err.message : String(err),
      500,
      req
    );
  }
});
