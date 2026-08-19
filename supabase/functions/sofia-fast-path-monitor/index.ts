/**
 * SOFIA FAST-PATH MONITOR - Monitor de Taxa Determinística
 * 
 * Monitora a taxa de respostas via fast-paths e deterministic router.
 * Envia alertas quando a taxa cai abaixo do threshold configurado (default: 50%).
 * 
 * Execução recomendada: a cada hora via cron
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getStrictCorsHeaders, handleCorsPrelight, errorResponse } from '../_shared/security-helpers.ts';

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ZAPI_INSTANCE_ID = Deno.env.get("ZAPI_INSTANCE_ID")!;
const ZAPI_TOKEN = Deno.env.get("ZAPI_TOKEN")!;
const ZAPI_SECURITY_TOKEN = Deno.env.get("ZAPI_SECURITY_TOKEN");

// Threshold padrão: 50%
const DEFAULT_THRESHOLD = 50;
// Período de análise em horas
const ANALYSIS_WINDOW_HOURS = 6;
// Mínimo de mensagens para análise válida
const MINIMUM_MESSAGES = 10;
// Cooldown entre alertas (evita spam)
const ALERT_COOLDOWN_HOURS = 4;

interface FastPathStats {
  period_hours: number;
  total_messages: number;
  fast_path_count: number;
  deterministic_count: number;
  llm_count: number;
  other_count: number;
  deterministic_rate: number;
  fast_path_rate: number;
  breakdown: Record<string, number>;
}

interface AlertConfig {
  threshold: number;
  cooldown_hours: number;
  enabled: boolean;
}

// deno-lint-ignore no-explicit-any
async function getAlertConfig(supabase: any): Promise<AlertConfig> {
  const { data: configs } = await supabase
    .from("configuracoes_sistema")
    .select("chave, valor")
    .in("chave", [
      "fast_path_alert_threshold",
      "fast_path_alert_cooldown_hours",
      "fast_path_alert_enabled"
    ]);
  
  const configMap = new Map<string, string>();
  configs?.forEach((c: { chave: string; valor: string }) => configMap.set(c.chave, c.valor));
  
  return {
    threshold: parseInt(configMap.get("fast_path_alert_threshold") || String(DEFAULT_THRESHOLD), 10),
    cooldown_hours: parseInt(configMap.get("fast_path_alert_cooldown_hours") || String(ALERT_COOLDOWN_HOURS), 10),
    enabled: configMap.get("fast_path_alert_enabled") !== "false",
  };
}

// deno-lint-ignore no-explicit-any
async function calculateFastPathStats(supabase: any, hours: number): Promise<FastPathStats> {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  
  console.log(`[fast-path-monitor] Analyzing messages since ${cutoff}`);
  
  // Query para obter contagem por handler_type
  const { data: messages, error } = await supabase
    .from("chatbot_mensagens")
    .select("handler_type")
    .eq("role", "assistant")
    .gte("created_at", cutoff)
    .not("handler_type", "is", null);
  
  if (error) {
    console.error("[fast-path-monitor] Query error:", error);
    throw error;
  }
  
  // Contar por tipo de handler
  const breakdown: Record<string, number> = {};
  let fastPathCount = 0;
  let deterministicCount = 0;
  let llmCount = 0;
  let otherCount = 0;
  
  for (const msg of messages || []) {
    const handlerType = msg.handler_type || "unknown";
    breakdown[handlerType] = (breakdown[handlerType] || 0) + 1;
    
    if (handlerType.startsWith("fast_path_")) {
      fastPathCount++;
    } else if (handlerType === "deterministic_router") {
      deterministicCount++;
    } else if (handlerType === "llm_reasoning") {
      llmCount++;
    } else {
      otherCount++;
    }
  }
  
  const total = messages?.length || 0;
  const totalDeterministic = fastPathCount + deterministicCount;
  
  return {
    period_hours: hours,
    total_messages: total,
    fast_path_count: fastPathCount,
    deterministic_count: deterministicCount,
    llm_count: llmCount,
    other_count: otherCount,
    deterministic_rate: total > 0 ? Math.round((totalDeterministic / total) * 100 * 10) / 10 : 0,
    fast_path_rate: total > 0 ? Math.round((fastPathCount / total) * 100 * 10) / 10 : 0,
    breakdown,
  };
}

// deno-lint-ignore no-explicit-any
async function checkAlertCooldown(supabase: any, cooldownHours: number): Promise<boolean> {
  const cutoff = new Date(Date.now() - cooldownHours * 60 * 60 * 1000).toISOString();
  
  const { count } = await supabase
    .from("admin_notifications")
    .select("*", { count: "exact", head: true })
    .eq("type", "fast_path_alert")
    .gte("created_at", cutoff);
  
  return (count || 0) === 0;
}

function formatAlertMessage(stats: FastPathStats, threshold: number): string {
  const emoji = stats.deterministic_rate < 30 ? "🚨🚨🚨" : stats.deterministic_rate < 40 ? "🚨🚨" : "⚠️";
  
  // Preparar breakdown das fast-paths
  const fastPathDetails = Object.entries(stats.breakdown)
    .filter(([key]) => key.startsWith("fast_path_"))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([key, count]) => `  • ${key.replace("fast_path_", "")}: ${count}`)
    .join("\n");
  
  return `${emoji} *ALERTA: TAXA DE FAST-PATHS BAIXA* ${emoji}

📊 *Métricas das últimas ${stats.period_hours}h:*
• Total de respostas: ${stats.total_messages}
• Taxa determinística: *${stats.deterministic_rate}%* (threshold: ${threshold}%)
• Taxa fast-paths: ${stats.fast_path_rate}%

📈 *Distribuição:*
• Fast-paths: ${stats.fast_path_count} (${stats.fast_path_rate}%)
• Router determinístico: ${stats.deterministic_count}
• LLM Reasoning: ${stats.llm_count}
• Outros: ${stats.other_count}

${fastPathDetails ? `🔍 *Top Fast-Paths:*\n${fastPathDetails}` : ""}

⚠️ *Ação recomendada:*
Verificar se os handlers de fast-path estão funcionando corretamente.
Possíveis causas: novos padrões de mensagens, bugs em detecção de intenções.

_Monitor automático da Sofia_`;
}

async function sendViaZApi(phone: string, message: string): Promise<boolean> {
  const url = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-text`;
  
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  
  if (ZAPI_SECURITY_TOKEN) {
    headers["Client-Token"] = ZAPI_SECURITY_TOKEN;
  }
  
  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ phone, message }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[fast-path-monitor] Z-API error for ${phone}: ${response.status} - ${errorText}`);
      return false;
    }
    
    console.log(`[fast-path-monitor] ✅ Alert sent to ${phone}`);
    return true;
  } catch (error) {
    console.error(`[fast-path-monitor] Network error for ${phone}:`, error);
    return false;
  }
}

// deno-lint-ignore no-explicit-any
async function sendAlerts(supabase: any, stats: FastPathStats, config: AlertConfig): Promise<number> {
  // Buscar destinatários que querem receber alertas técnicos
  const { data: recipients } = await supabase
    .from("daily_report_recipients")
    .select("nome, telefone, email, notify_via, notification_types")
    .eq("is_active", true);
  
  if (!recipients || recipients.length === 0) {
    console.log("[fast-path-monitor] No active recipients found");
    return 0;
  }
  
  const message = formatAlertMessage(stats, config.threshold);
  let sentCount = 0;
  
  for (const recipient of recipients) {
    // Verificar se o destinatário quer receber alertas técnicos
    const notificationTypes = recipient.notification_types || [];
    const notifyVia = recipient.notify_via || ["whatsapp"];
    
    // Se não tem tipos definidos ou inclui "technical" ou "all"
    const wantsTechnicalAlerts = notificationTypes.length === 0 || 
      notificationTypes.includes("technical") || 
      notificationTypes.includes("all");
    
    if (!wantsTechnicalAlerts) {
      console.log(`[fast-path-monitor] Skipping ${recipient.nome} - doesn't want technical alerts`);
      continue;
    }
    
    // Enviar via WhatsApp se configurado
    if (notifyVia.includes("whatsapp") && recipient.telefone) {
      const sent = await sendViaZApi(recipient.telefone, message);
      if (sent) sentCount++;
    }
  }
  
  // Registrar alerta no sistema
  await supabase.from("admin_notifications").insert({
    admin_user_id: null,
    title: `⚠️ Taxa Fast-Path: ${stats.deterministic_rate}%`,
    message: `Taxa determinística caiu para ${stats.deterministic_rate}% (threshold: ${config.threshold}%). ${stats.total_messages} mensagens analisadas nas últimas ${stats.period_hours}h.`,
    type: "fast_path_alert",
    entity_type: "system_health",
    is_read: false,
  });
  
  return sentCount;
}

serve(async (req) => {
  const corsHeaders = getStrictCorsHeaders(req);
  
  if (req.method === "OPTIONS") {
    return handleCorsPrelight(req, { mode: 'strict' });
  }

  const startTime = Date.now();

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // Carregar configuração
    const config = await getAlertConfig(supabase);
    console.log(`[fast-path-monitor] Config: threshold=${config.threshold}%, cooldown=${config.cooldown_hours}h, enabled=${config.enabled}`);
    
    if (!config.enabled) {
      console.log("[fast-path-monitor] Alerts disabled by configuration");
      return new Response(JSON.stringify({
        success: true,
        message: "Alerts disabled",
        enabled: false,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // Calcular estatísticas
    const stats = await calculateFastPathStats(supabase, ANALYSIS_WINDOW_HOURS);
    console.log(`[fast-path-monitor] Stats: rate=${stats.deterministic_rate}%, total=${stats.total_messages}`);
    
    // Verificar se há dados suficientes
    if (stats.total_messages < MINIMUM_MESSAGES) {
      console.log(`[fast-path-monitor] Not enough data (${stats.total_messages}/${MINIMUM_MESSAGES} messages)`);
      return new Response(JSON.stringify({
        success: true,
        message: "Not enough data for analysis",
        stats,
        alert_sent: false,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // Verificar se taxa está abaixo do threshold
    if (stats.deterministic_rate >= config.threshold) {
      console.log(`[fast-path-monitor] Rate OK (${stats.deterministic_rate}% >= ${config.threshold}%)`);
      return new Response(JSON.stringify({
        success: true,
        message: "Rate is healthy",
        stats,
        alert_sent: false,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // Verificar cooldown de alertas
    const canSendAlert = await checkAlertCooldown(supabase, config.cooldown_hours);
    if (!canSendAlert) {
      console.log(`[fast-path-monitor] Alert in cooldown period`);
      return new Response(JSON.stringify({
        success: true,
        message: "Alert suppressed (cooldown)",
        stats,
        alert_sent: false,
        cooldown_active: true,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // Enviar alertas
    console.log(`[fast-path-monitor] 🚨 Rate below threshold! Sending alerts...`);
    const alertsSent = await sendAlerts(supabase, stats, config);
    
    const duration = Date.now() - startTime;
    console.log(`[fast-path-monitor] Completed in ${duration}ms, ${alertsSent} alerts sent`);
    
    return new Response(JSON.stringify({
      success: true,
      message: `Alert sent to ${alertsSent} recipients`,
      stats,
      alert_sent: true,
      alerts_count: alertsSent,
      duration_ms: duration,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
    
  } catch (error) {
    console.error("[fast-path-monitor] Error:", error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
