/**
 * SOFIA DAILY STATS - Relatório Diário de Estatísticas
 * 
 * Calcula métricas do dia e envia para os destinatários configurados via Z-API.
 * 
 * Métricas incluídas:
 * - Leads atendidos (novos)
 * - Follow-ups disparados
 * - Follow-ups respondidos
 * - Propostas iniciais emitidas
 * - Propostas definitivas emitidas
 * - Contratos emitidos
 * - Contratos assinados
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getStrictCorsHeaders, jsonResponse, errorResponse } from "../_shared/security-helpers.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ZAPI_INSTANCE_ID = Deno.env.get("ZAPI_INSTANCE_ID")!;
const ZAPI_TOKEN = Deno.env.get("ZAPI_TOKEN")!;
const ZAPI_SECURITY_TOKEN = Deno.env.get("ZAPI_SECURITY_TOKEN");

interface DailyStats {
  date: string;
  leads_atendidos: number;
  fups_disparados: number;
  fups_respondidos: number;
  propostas_iniciais: number;
  propostas_definitivas: number;
  contratos_emitidos: number;
  contratos_assinados: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function calculateDailyStats(supabase: any): Promise<DailyStats> {
  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
  const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
  
  const startISO = startOfDay.toISOString();
  const endISO = endOfDay.toISOString();
  
  console.log(`[sofia-daily-stats] Calculating stats for ${startISO} to ${endISO}`);
  
  // 1. Leads atendidos (novos leads com conversa iniciada hoje)
  const { count: leadsAtendidos } = await supabase
    .from("chatbot_conversas")
    .select("*", { count: "exact", head: true })
    .gte("created_at", startISO)
    .lte("created_at", endISO)
    .not("bitrix24_lead_id", "is", null);
  
  // 2. Follow-ups disparados hoje
  const { count: fupsDisparados } = await supabase
    .from("chatbot_followups")
    .select("*", { count: "exact", head: true })
    .gte("created_at", startISO)
    .lte("created_at", endISO)
    .eq("status", "sent");
  
  // 3. Follow-ups respondidos (FUPs enviados que tiveram resposta do cliente)
  // Um FUP é considerado "respondido" se a conversa teve mensagem após o FUP
  const { data: fupsEnviados } = await supabase
    .from("chatbot_followups")
    .select("conversa_id, sent_at")
    .gte("created_at", startISO)
    .lte("created_at", endISO)
    .eq("status", "sent")
    .not("sent_at", "is", null);
  
  let fupsRespondidos = 0;
  if (fupsEnviados && fupsEnviados.length > 0) {
    for (const fup of fupsEnviados) {
      // Verifica se houve mensagem do cliente após o FUP
      const { count: respostas } = await supabase
        .from("chatbot_mensagens")
        .select("*", { count: "exact", head: true })
        .eq("conversa_id", fup.conversa_id)
        .eq("role", "user")
        .gt("created_at", fup.sent_at);
      
      if (respostas && respostas > 0) {
        fupsRespondidos++;
      }
    }
  }
  
  // 4. Propostas iniciais emitidas (link de proposta enviado)
  const { count: propostasIniciais } = await supabase
    .from("chatbot_conversas")
    .select("*", { count: "exact", head: true })
    .gte("proposta_link_sent_at", startISO)
    .lte("proposta_link_sent_at", endISO);
  
  // 5. Propostas definitivas emitidas (propostas com documentos completos)
  // Verificamos propostas criadas hoje que têm status diferente de 'rascunho'
  const { count: propostasDefinitivas } = await supabase
    .from("propostas_assinantes")
    .select("*", { count: "exact", head: true })
    .gte("created_at", startISO)
    .lte("created_at", endISO)
    .neq("status", "rascunho");
  
  // 6. Contratos emitidos (contrato enviado hoje)
  const { count: contratosEmitidos } = await supabase
    .from("chatbot_conversas")
    .select("*", { count: "exact", head: true })
    .gte("contrato_enviado_at", startISO)
    .lte("contrato_enviado_at", endISO);
  
  // 7. Contratos assinados hoje
  const { count: contratosAssinados } = await supabase
    .from("chatbot_conversas")
    .select("*", { count: "exact", head: true })
    .gte("contrato_assinado_at", startISO)
    .lte("contrato_assinado_at", endISO)
    .eq("contrato_assinado", true);
  
  return {
    date: today.toLocaleDateString("pt-BR"),
    leads_atendidos: leadsAtendidos || 0,
    fups_disparados: fupsDisparados || 0,
    fups_respondidos: fupsRespondidos,
    propostas_iniciais: propostasIniciais || 0,
    propostas_definitivas: propostasDefinitivas || 0,
    contratos_emitidos: contratosEmitidos || 0,
    contratos_assinados: contratosAssinados || 0,
  };
}

function formatReport(stats: DailyStats): string {
  // Calcular taxa de conversão de FUPs
  const taxaFupResposta = stats.fups_disparados > 0 
    ? Math.round((stats.fups_respondidos / stats.fups_disparados) * 100) 
    : 0;
  
  // Calcular taxa de assinatura
  const taxaAssinatura = stats.contratos_emitidos > 0 
    ? Math.round((stats.contratos_assinados / stats.contratos_emitidos) * 100) 
    : 0;
  
  return `📊 *RELATÓRIO DIÁRIO SOFIA*
📅 ${stats.date}

👥 *LEADS*
• Atendidos: ${stats.leads_atendidos}

📨 *FOLLOW-UPS*
• Disparados: ${stats.fups_disparados}
• Respondidos: ${stats.fups_respondidos} (${taxaFupResposta}%)

📄 *PROPOSTAS*
• Iniciais: ${stats.propostas_iniciais}
• Definitivas: ${stats.propostas_definitivas}

📝 *CONTRATOS*
• Emitidos: ${stats.contratos_emitidos}
• Assinados: ${stats.contratos_assinados} (${taxaAssinatura}%)

_Relatório automático - Sofia IA_`;
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
      console.error(`[sofia-daily-stats] Z-API error for ${phone}: ${response.status} - ${errorText}`);
      return false;
    }
    
    console.log(`[sofia-daily-stats] ✅ Sent to ${phone}`);
    return true;
  } catch (error) {
    console.error(`[sofia-daily-stats] Network error for ${phone}:`, error);
    return false;
  }
}

serve(async (req) => {
  const corsHeaders = getStrictCorsHeaders(req);
  
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  
  const startTime = Date.now();
  
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    console.log("[sofia-daily-stats] Starting daily stats calculation...");
    
    // 1. Calcular estatísticas
    const stats = await calculateDailyStats(supabase);
    console.log("[sofia-daily-stats] Stats calculated:", stats);
    
    // 2. Formatar relatório
    const report = formatReport(stats);
    console.log("[sofia-daily-stats] Report formatted");
    
    // 3. Buscar destinatários ativos
    const { data: recipients, error: recipientsError } = await supabase
      .from("daily_report_recipients")
      .select("*")
      .eq("is_active", true);
    
    if (recipientsError) {
      throw new Error(`Failed to fetch recipients: ${recipientsError.message}`);
    }
    
    if (!recipients || recipients.length === 0) {
      console.log("[sofia-daily-stats] No active recipients found");
      return new Response(JSON.stringify({ 
        success: true, 
        stats, 
        report, 
        sent_to: 0,
        message: "No active recipients configured" 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // 4. Enviar para cada destinatário
    const results: { name: string; phone: string; success: boolean }[] = [];
    
    for (const recipient of recipients) {
      if (recipient.notify_via?.includes("whatsapp") && recipient.telefone) {
        const success = await sendViaZApi(recipient.telefone, report);
        results.push({ name: recipient.nome, phone: recipient.telefone, success });
      }
      // TODO: Add email support later if needed
    }
    
    const successCount = results.filter(r => r.success).length;
    const duration = Date.now() - startTime;
    
    console.log(`[sofia-daily-stats] Completed in ${duration}ms. Sent to ${successCount}/${results.length} recipients`);
    
    // 5. Log execution
    await supabase.from("activity_logs").insert({
      action: "sofia_daily_report",
      entity_type: "notification",
      details: {
        stats,
        sent_count: successCount,
        failed_count: results.length - successCount,
        recipients: results,
        duration_ms: duration,
      },
    });
    
    return new Response(JSON.stringify({
      success: true,
      stats,
      report,
      sent_to: successCount,
      results,
      duration_ms: duration,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
    
  } catch (error) {
    console.error("[sofia-daily-stats] Error:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
