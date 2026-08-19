/**
 * SOFIA HOT LEAD ALERT - Alerta de Lead Quente
 * 
 * Recebe webhook com dados do lead e envia alerta via WhatsApp
 * para os destinatários configurados na tabela daily_report_recipients.
 * 
 * Substitui o workflow do n8n "Sofia - Alerta Lead Quente".
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.90.0";
import { getStrictCorsHeaders, handleCorsPrelight, errorResponse } from '../_shared/security-helpers.ts';
import { validateHotLeadAlert } from '../_shared/zod-schemas.ts';

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ZAPI_INSTANCE_ID = Deno.env.get("ZAPI_INSTANCE_ID")!;
const ZAPI_TOKEN = Deno.env.get("ZAPI_TOKEN")!;
const ZAPI_SECURITY_TOKEN = Deno.env.get("ZAPI_SECURITY_TOKEN");

interface HotLeadPayload {
  nome: string;
  telefone: string;
  email?: string;
  cidade?: string;
  distribuidora?: string;
  valor_conta?: number;
  economia_estimada?: number;
  lead_score?: number;
  origem?: string;
  bitrix_lead_id?: string;
  conversa_id?: string;
  alert_type?: 'hot_lead' | 'big_account';
}

function formatBigAccountAlert(lead: HotLeadPayload): string {
  // Format phone for WhatsApp link (remove any non-digits)
  const phoneDigits = lead.telefone.replace(/\D/g, '');
  const whatsappLink = `https://wa.me/${phoneDigits}`;
  
  const valorContaStr = lead.valor_conta 
    ? `R$ ${lead.valor_conta.toLocaleString("pt-BR")}` 
    : "Valor não informado";
  
  return `💰 *GRANDE CONTA DETECTADA!* 💰

Valor mensal: *${valorContaStr}*

👤 Cliente: ${lead.nome}
📱 ${lead.telefone}

🔗 *Clique para ir à conversa:*
${whatsappLink}

⚠️ Auxilie a Sofia para fecharmos a venda!`;
}

function formatHotLeadAlert(lead: HotLeadPayload): string {
  const economiaStr = lead.economia_estimada 
    ? `R$ ${lead.economia_estimada.toLocaleString("pt-BR")}/ano` 
    : "A calcular";
  
  const valorContaStr = lead.valor_conta 
    ? `R$ ${lead.valor_conta.toLocaleString("pt-BR")}` 
    : "Não informado";
  
  const scoreEmoji = (lead.lead_score || 0) >= 80 ? "🔥🔥🔥" 
    : (lead.lead_score || 0) >= 60 ? "🔥🔥" 
    : "🔥";
  
  return `${scoreEmoji} *LEAD QUENTE!* ${scoreEmoji}

👤 *${lead.nome}*
📱 ${lead.telefone}
${lead.email ? `📧 ${lead.email}` : ""}
${lead.cidade ? `📍 ${lead.cidade}` : ""}
${lead.distribuidora ? `⚡ ${lead.distribuidora}` : ""}

💰 *Valor da conta:* ${valorContaStr}
💚 *Economia estimada:* ${economiaStr}
${lead.lead_score ? `📊 *Lead Score:* ${lead.lead_score}/100` : ""}
${lead.origem ? `🎯 *Origem:* ${lead.origem}` : ""}
${lead.bitrix_lead_id ? `\n🔗 Bitrix Lead #${lead.bitrix_lead_id}` : ""}

_Alerta gerado automaticamente pela Sofia_`;
}

function formatAlert(lead: HotLeadPayload): string {
  // Use appropriate format based on alert type
  if (lead.alert_type === 'big_account') {
    return formatBigAccountAlert(lead);
  }
  return formatHotLeadAlert(lead);
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
      console.error(`[hot-lead-alert] Z-API error for ${phone}: ${response.status} - ${errorText}`);
      return false;
    }
    
    console.log(`[hot-lead-alert] ✅ Alert sent to ${phone}`);
    return true;
  } catch (error) {
    console.error(`[hot-lead-alert] Network error for ${phone}:`, error);
    return false;
  }
}

serve(async (req) => {
  const corsHeaders = getStrictCorsHeaders(req);
  
  if (req.method === "OPTIONS") {
    return handleCorsPrelight(req, { mode: 'strict' });
  }
  
  const startTime = Date.now();
  
  try {
    // Parse and validate incoming lead data
    const body = await req.json();
    const validation = validateHotLeadAlert(body);
    
    if (!validation.success) {
      const errorMessages = validation.errors?.map(e => `${e.field}: ${e.message}`).join(', ');
      return new Response(JSON.stringify({
        success: false,
        error: `Validation failed: ${errorMessages}`,
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    const leadData = validation.data!;
    
    console.log("[hot-lead-alert] Received lead:", leadData.nome, leadData.telefone);
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // Format alert message
    const alertMessage = formatAlert(leadData);
    
    // Determine notification type based on alert_type
    const notificationType = leadData.alert_type === 'big_account' ? 'big_account' : 'hot_lead';
    
    console.log(`[hot-lead-alert] Fetching recipients for notification type: ${notificationType}`);
    
    // Fetch recipients configured for the appropriate alert type
    const { data: recipients, error: recipientsError } = await supabase
      .from("daily_report_recipients")
      .select("*")
      .eq("is_active", true)
      .contains("notification_types", [notificationType]);
    
    if (recipientsError) {
      throw new Error(`Failed to fetch recipients: ${recipientsError.message}`);
    }
    
    if (!recipients || recipients.length === 0) {
      console.log("[hot-lead-alert] No active recipients configured for hot_lead alerts");
      return new Response(JSON.stringify({
        success: true,
        lead: leadData,
        sent_to: 0,
        message: "No active recipients configured for hot_lead alerts",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // Send to each recipient
    const results: { name: string; phone: string; success: boolean }[] = [];
    
    for (const recipient of recipients) {
      if (recipient.notify_via?.includes("whatsapp") && recipient.telefone) {
        const success = await sendViaZApi(recipient.telefone, alertMessage);
        results.push({ name: recipient.nome, phone: recipient.telefone, success });
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    const duration = Date.now() - startTime;
    
    console.log(`[hot-lead-alert] Completed in ${duration}ms. Sent to ${successCount}/${results.length} recipients`);
    
    // Log the alert
    await supabase.from("activity_logs").insert({
      action: "sofia_hot_lead_alert",
      entity_type: "notification",
      entity_id: leadData.conversa_id || leadData.bitrix_lead_id || null,
      entity_name: leadData.nome,
      details: {
        lead: leadData,
        sent_count: successCount,
        failed_count: results.length - successCount,
        recipients: results,
        duration_ms: duration,
      },
    });
    
    return new Response(JSON.stringify({
      success: true,
      lead: leadData,
      alert_message: alertMessage,
      sent_to: successCount,
      results,
      duration_ms: duration,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
    
  } catch (error) {
    console.error("[hot-lead-alert] Error:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
