/**
 * SOFIA WEEKLY STATS - Relatório Semanal de Estatísticas
 * 
 * Calcula métricas da semana anterior e envia para os destinatários configurados.
 * Substitui o workflow do n8n "Sofia - Resumo Semanal".
 * 
 * Executado toda segunda-feira às 9h (BRT).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getStrictCorsHeaders, handleCorsPrelight } from "../_shared/security-helpers.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ZAPI_INSTANCE_ID = Deno.env.get("ZAPI_INSTANCE_ID")!;
const ZAPI_TOKEN = Deno.env.get("ZAPI_TOKEN")!;
const ZAPI_SECURITY_TOKEN = Deno.env.get("ZAPI_SECURITY_TOKEN");

interface WeeklyStats {
  week_start: string;
  week_end: string;
  leads_atendidos: number;
  fups_disparados: number;
  fups_respondidos: number;
  propostas_iniciais: number;
  propostas_definitivas: number;
  contratos_emitidos: number;
  contratos_assinados: number;
  taxa_proposta_inicial: number;
  taxa_contrato_assinado: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function calculateWeeklyStats(supabase: any): Promise<WeeklyStats> {
  const today = new Date();
  
  // Calculate last week (Monday to Sunday)
  const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, ...
  const daysToLastMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  
  const endOfLastWeek = new Date(today);
  endOfLastWeek.setDate(today.getDate() - daysToLastMonday);
  endOfLastWeek.setHours(0, 0, 0, 0);
  
  const startOfLastWeek = new Date(endOfLastWeek);
  startOfLastWeek.setDate(endOfLastWeek.getDate() - 7);
  
  const endOfLastWeekEnd = new Date(endOfLastWeek);
  endOfLastWeekEnd.setMilliseconds(-1); // End of Sunday
  
  const startISO = startOfLastWeek.toISOString();
  const endISO = endOfLastWeekEnd.toISOString();
  
  console.log(`[sofia-weekly-stats] Calculating stats for ${startISO} to ${endISO}`);
  
  // 1. Leads atendidos (conversas com bitrix24_lead_id)
  const { count: leadsAtendidos } = await supabase
    .from("chatbot_conversas")
    .select("*", { count: "exact", head: true })
    .gte("created_at", startISO)
    .lte("created_at", endISO)
    .not("bitrix24_lead_id", "is", null);
  
  // 2. Follow-ups disparados
  const { count: fupsDisparados } = await supabase
    .from("chatbot_followups")
    .select("*", { count: "exact", head: true })
    .gte("created_at", startISO)
    .lte("created_at", endISO)
    .eq("status", "sent");
  
  // 3. Follow-ups respondidos (fups que tiveram resposta do usuário após envio)
  const { data: fupsSent } = await supabase
    .from("chatbot_followups")
    .select("id, conversa_id, sent_at")
    .gte("created_at", startISO)
    .lte("created_at", endISO)
    .eq("status", "sent")
    .not("sent_at", "is", null);
  
  let fupsRespondidos = 0;
  if (fupsSent && fupsSent.length > 0) {
    for (const fup of fupsSent) {
      const { count } = await supabase
        .from("chatbot_mensagens")
        .select("*", { count: "exact", head: true })
        .eq("conversa_id", fup.conversa_id)
        .eq("role", "user")
        .gt("created_at", fup.sent_at);
      if (count && count > 0) {
        fupsRespondidos++;
      }
    }
  }
  
  // 4. Propostas Iniciais (conversas com proposta_link_sent_at)
  const { count: propostasIniciais } = await supabase
    .from("chatbot_conversas")
    .select("*", { count: "exact", head: true })
    .gte("created_at", startISO)
    .lte("created_at", endISO)
    .not("proposta_link_sent_at", "is", null);
  
  // 5. Propostas Definitivas (propostas_assinantes com status != rascunho)
  const { count: propostasDefinitivas } = await supabase
    .from("propostas_assinantes")
    .select("*", { count: "exact", head: true })
    .gte("created_at", startISO)
    .lte("created_at", endISO)
    .neq("status", "rascunho");
  
  // 6. Contratos Emitidos
  const { count: contratosEmitidos } = await supabase
    .from("chatbot_conversas")
    .select("*", { count: "exact", head: true })
    .gte("contrato_enviado_at", startISO)
    .lte("contrato_enviado_at", endISO);
  
  // 7. Contratos Assinados
  const { count: contratosAssinados } = await supabase
    .from("chatbot_conversas")
    .select("*", { count: "exact", head: true })
    .gte("contrato_assinado_at", startISO)
    .lte("contrato_assinado_at", endISO)
    .eq("contrato_assinado", true);
  
  // Calculate rates
  const leads = leadsAtendidos || 0;
  const taxaPropostaInicial = leads > 0 
    ? Math.round(((propostasIniciais || 0) / leads) * 100 * 10) / 10 
    : 0;
  const taxaContratoAssinado = leads > 0 
    ? Math.round(((contratosAssinados || 0) / leads) * 100 * 10) / 10 
    : 0;
  
  return {
    week_start: startOfLastWeek.toLocaleDateString("pt-BR"),
    week_end: new Date(endOfLastWeekEnd.getTime() - 1).toLocaleDateString("pt-BR"),
    leads_atendidos: leadsAtendidos || 0,
    fups_disparados: fupsDisparados || 0,
    fups_respondidos: fupsRespondidos,
    propostas_iniciais: propostasIniciais || 0,
    propostas_definitivas: propostasDefinitivas || 0,
    contratos_emitidos: contratosEmitidos || 0,
    contratos_assinados: contratosAssinados || 0,
    taxa_proposta_inicial: taxaPropostaInicial,
    taxa_contrato_assinado: taxaContratoAssinado,
  };
}

function formatWeeklyReport(stats: WeeklyStats): string {
  const taxaFupResp = stats.fups_disparados > 0 
    ? Math.round((stats.fups_respondidos / stats.fups_disparados) * 100) 
    : 0;
  
  return `📊 *RESUMO SEMANAL SOFIA*
📅 ${stats.week_start} a ${stats.week_end}

👥 *LEADS*
• Atendidos: ${stats.leads_atendidos}

📨 *FOLLOW-UPS*
• Disparados: ${stats.fups_disparados}
• Respondidos: ${stats.fups_respondidos} (${taxaFupResp}%)

📄 *PROPOSTAS*
• Iniciais: ${stats.propostas_iniciais} (${stats.taxa_proposta_inicial}% dos leads)
• Definitivas: ${stats.propostas_definitivas}

📝 *CONTRATOS*
• Emitidos: ${stats.contratos_emitidos}
• Assinados: ${stats.contratos_assinados} (${stats.taxa_contrato_assinado}% dos leads)

_Relatório semanal gerado automaticamente pela Sofia_`;
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
      console.error(`[sofia-weekly-stats] Z-API error for ${phone}: ${response.status} - ${errorText}`);
      return false;
    }
    
    console.log(`[sofia-weekly-stats] ✅ Sent to ${phone}`);
    return true;
  } catch (error) {
    console.error(`[sofia-weekly-stats] Network error for ${phone}:`, error);
    return false;
  }
}

serve(async (req) => {
  const corsHeaders = getStrictCorsHeaders(req);
  
  const preflightResponse = handleCorsPrelight(req);
  if (preflightResponse) return preflightResponse;
  
  const startTime = Date.now();
  
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    console.log("[sofia-weekly-stats] Starting weekly stats calculation...");
    
    // 1. Calculate weekly stats
    const stats = await calculateWeeklyStats(supabase);
    console.log("[sofia-weekly-stats] Stats calculated:", stats);
    
    // 2. Format report
    const report = formatWeeklyReport(stats);
    console.log("[sofia-weekly-stats] Report formatted");
    
    // 3. Fetch recipients for weekly_report
    const { data: recipients, error: recipientsError } = await supabase
      .from("daily_report_recipients")
      .select("*")
      .eq("is_active", true)
      .contains("notification_types", ["weekly_report"]);
    
    if (recipientsError) {
      throw new Error(`Failed to fetch recipients: ${recipientsError.message}`);
    }
    
    if (!recipients || recipients.length === 0) {
      console.log("[sofia-weekly-stats] No active recipients found");
      return new Response(JSON.stringify({ 
        success: true, 
        stats, 
        report, 
        sent_to: 0,
        message: "No active recipients configured for weekly_report" 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // 4. Send to each recipient
    const results: { name: string; phone: string; success: boolean }[] = [];
    
    for (const recipient of recipients) {
      if (recipient.notify_via?.includes("whatsapp") && recipient.telefone) {
        const success = await sendViaZApi(recipient.telefone, report);
        results.push({ name: recipient.nome, phone: recipient.telefone, success });
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    const duration = Date.now() - startTime;
    
    console.log(`[sofia-weekly-stats] Completed in ${duration}ms. Sent to ${successCount}/${results.length} recipients`);
    
    // 5. Log execution
    await supabase.from("activity_logs").insert({
      action: "sofia_weekly_report",
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
    console.error("[sofia-weekly-stats] Error:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
