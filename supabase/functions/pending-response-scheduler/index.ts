/**
 * PENDING RESPONSE SCHEDULER
 * 
 * Identifica e reprocessa conversas que receberam mensagens 
 * durante quiet hours ou que falharam e ficaram sem resposta.
 * 
 * Executa após o fim do quiet hour (ex: 07:05) para garantir
 * que nenhum lead fique sem resposta por mais de 12h.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { executePipeline } from "../_shared/pipeline/index.ts";
import { getStrictCorsHeaders, jsonResponse, errorResponse } from "../_shared/security-helpers.ts";
import {
  isPhoneBlockedByTakeover,
  normalizeTakeoverPhone,
} from '../_shared/human-takeover.ts';

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface PendingConversation {
  id: string;
  cliente_telefone: string;
  cliente_nome: string | null;
  agent_id: string;
  last_message_at: string;
  last_sofia_message_at: string | null;
  sofia_mode: string | null;
}

interface LastMessage {
  id: string;
  content: string;
  message_id: string | null;
}

Deno.serve(async (req) => {
  const corsHeaders = getStrictCorsHeaders(req);
  
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  console.log("[pending-response-scheduler] ▶️ Starting...");
  
  try {
    // 1. Verificar se scheduler está habilitado
    const { data: configEnabled } = await supabase
      .from('configuracoes_sistema')
      .select('valor')
      .eq('chave', 'pending_response_scheduler_enabled')
      .maybeSingle();
    
    if (configEnabled?.valor === 'false') {
      console.log("[pending-response-scheduler] ⏸️ Scheduler disabled");
      return new Response(JSON.stringify({ 
        skipped: true, 
        reason: "scheduler_disabled" 
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    
    // 2. Verificar quiet hours (não executar DURANTE quiet hour)
    const isQuietHour = await checkQuietHours(supabase);
    if (isQuietHour) {
      console.log("[pending-response-scheduler] 🌙 Still in quiet hours, skipping");
      return new Response(JSON.stringify({ 
        skipped: true, 
        reason: "quiet_hours_active" 
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    
    // 3. Carregar configurações
    const { data: batchConfig } = await supabase
      .from('configuracoes_sistema')
      .select('valor')
      .eq('chave', 'pending_response_batch_size')
      .maybeSingle();
    
    const batchSize = parseInt(batchConfig?.valor || '50', 10);
    
    const { data: lookbackConfig } = await supabase
      .from('configuracoes_sistema')
      .select('valor')
      .eq('chave', 'pending_response_lookback_hours')
      .maybeSingle();
    
    const lookbackHours = parseInt(lookbackConfig?.valor || '12', 10);
    
    // 4. Buscar conversas pendentes de resposta
    const pendingConversations = await findPendingResponses(supabase, lookbackHours, batchSize);
    
    console.log(`[pending-response-scheduler] 📋 Found ${pendingConversations.length} pending conversations`);
    
    if (pendingConversations.length === 0) {
      return new Response(JSON.stringify({ 
        processed: 0, 
        success: true,
        message: "No pending responses found"
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    
    // 5. Processar cada conversa pendente
    const results: Array<{ phone: string; success: boolean; error?: string }> = [];
    
    for (const conversa of pendingConversations) {
      try {
        // ═══════════════════════════════════════════════════════════════
        // 🛑 ABSOLUTE FIRST CHECK: Human takeover blocks EVERYTHING
        // ═══════════════════════════════════════════════════════════════
        const isBlocked = await isPhoneBlockedByTakeover(
          supabase, 
          conversa.cliente_telefone, 
          conversa.agent_id || 'sofia', 
          'zapi'
        );
        
        if (isBlocked) {
          console.log(`[pending-response-scheduler] 🛑 BLOCKED: ${conversa.cliente_telefone} - Active human takeover`);
          results.push({ phone: conversa.cliente_telefone, success: false, error: 'Active human takeover' });
          continue;
        }
        
        const result = await processDelayedResponse(supabase, conversa);
        results.push({ phone: conversa.cliente_telefone, success: result });
        
        // Delay entre processamentos para evitar sobrecarga
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (err) {
        console.error(`[pending-response-scheduler] ❌ Error processing ${conversa.cliente_telefone}:`, err);
        results.push({ 
          phone: conversa.cliente_telefone, 
          success: false, 
          error: err instanceof Error ? err.message : String(err) 
        });
      }
    }
    
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log(`[pending-response-scheduler] ✅ Completed: ${successful} successful, ${failed} failed`);
    
    return new Response(JSON.stringify({
      success: true,
      processed: pendingConversations.length,
      successful,
      failed,
      duration_ms: Date.now() - startTime,
      results
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
    
  } catch (error) {
    console.error("[pending-response-scheduler] 💥 Fatal error:", error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});

/**
 * Verifica se estamos dentro do período de quiet hours
 */
// deno-lint-ignore no-explicit-any
async function checkQuietHours(supabase: any): Promise<boolean> {
  try {
    const { data: startConfig } = await supabase
      .from('configuracoes_sistema')
      .select('valor')
      .eq('chave', 'quiet_hours_start')
      .maybeSingle();
    
    const { data: endConfig } = await supabase
      .from('configuracoes_sistema')
      .select('valor')
      .eq('chave', 'quiet_hours_end')
      .maybeSingle();
    
    if (!startConfig?.valor || !endConfig?.valor) {
      return false; // Se não configurado, não há quiet hours
    }
    
    const startHour = parseInt(startConfig.valor, 10);
    const endHour = parseInt(endConfig.valor, 10);
    
    // Horário atual em São Paulo (UTC-3)
    const now = new Date();
    const saoPauloOffset = -3;
    const saoPauloHour = (now.getUTCHours() + saoPauloOffset + 24) % 24;
    
    // Verificar se está dentro do período de quiet hours
    if (startHour > endHour) {
      // Período cruza meia-noite (ex: 22h - 7h)
      return saoPauloHour >= startHour || saoPauloHour < endHour;
    } else {
      // Período normal (ex: 2h - 6h)
      return saoPauloHour >= startHour && saoPauloHour < endHour;
    }
  } catch (err) {
    console.warn("[pending-response-scheduler] Error checking quiet hours:", err);
    return false;
  }
}

/**
 * Busca conversas que receberam mensagens mas não foram respondidas
 */
// deno-lint-ignore no-explicit-any
async function findPendingResponses(
  supabase: any,
  lookbackHours: number,
  limit: number
): Promise<PendingConversation[]> {
  const lookbackTime = new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();
  const cooldownTime = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // 5 min cooldown
  
  // Query para encontrar conversas onde:
  // 1. Conversa não está encerrada
  // 2. sofia_mode não é bloqueante (paused_for_human, descartado, sac_redirect)
  // 3. Última mensagem é do cliente (last_message_at > last_sofia_message_at)
  // 4. Mensagem foi recebida nas últimas X horas
  // 5. Não foi respondida recentemente (cooldown de 5min)
  const { data, error } = await supabase
    .from('chatbot_conversas')
    .select('id, cliente_telefone, cliente_nome, agent_id, last_message_at, last_sofia_message_at, sofia_mode')
    .is('ended_at', null)
    .in('agent_id', ['sofia']) // Por enquanto, apenas Sofia
    .not('sofia_mode', 'in', '("paused_for_human","descartado","sac_redirect")')
    .gt('last_message_at', lookbackTime)
    .order('last_message_at', { ascending: true })
    .limit(limit);
  
  if (error) {
    console.error("[pending-response-scheduler] Error querying:", error);
    throw error;
  }
  
  // Filtrar conversas onde última mensagem é do cliente
  const pendingConversations = (data || []).filter((c: PendingConversation) => {
    // Se nunca respondeu, está pendente
    if (!c.last_sofia_message_at) return true;
    
    // Se última mensagem do cliente é depois da última resposta da Sofia
    const lastMsg = new Date(c.last_message_at).getTime();
    const lastSofia = new Date(c.last_sofia_message_at).getTime();
    const cooldown = new Date(cooldownTime).getTime();
    
    // Mensagem do cliente é mais recente E a Sofia não respondeu recentemente
    return lastMsg > lastSofia && lastSofia < cooldown;
  });
  
  return pendingConversations;
}

/**
 * Processa uma conversa com resposta atrasada
 */
// deno-lint-ignore no-explicit-any
async function processDelayedResponse(
  supabase: any,
  conversa: PendingConversation
): Promise<boolean> {
  console.log(`[pending-response-scheduler] 🔄 Processing ${conversa.cliente_telefone}...`);
  
  // 1. Buscar última mensagem do cliente
  const { data: lastMessage, error: msgError } = await supabase
    .from('chatbot_mensagens')
    .select('id, content, message_id')
    .eq('conversa_id', conversa.id)
    .eq('role', 'user')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  
  if (msgError || !lastMessage) {
    console.warn(`[pending-response-scheduler] No user message found for ${conversa.id}`);
    return false;
  }
  
  const message = lastMessage as LastMessage;
  
  // 2. Calcular tempo de atraso
  const delayedSince = new Date(conversa.last_message_at);
  const hoursDelayed = Math.floor((Date.now() - delayedSince.getTime()) / (1000 * 60 * 60));
  
  console.log(`[pending-response-scheduler] Message delayed by ${hoursDelayed} hours: "${message.content.substring(0, 50)}..."`);
  
  // 3. Executar Pipeline com flag de resposta atrasada
  const result = await executePipeline(
    conversa.id,
    message.message_id || message.id,
    conversa.cliente_telefone,
    message.content,
    'text',
    {
      isDelayedResponse: true,
      delayedSince: conversa.last_message_at,
      hoursDelayed,
      agentId: conversa.agent_id,
      triggeredBy: 'pending-response-scheduler'
    }
  );
  
  if (result.success && result.messageSent) {
    console.log(`[pending-response-scheduler] ✅ Successfully responded to ${conversa.cliente_telefone}`);
    return true;
  }
  
  if (result.shouldFallbackToLegacy) {
    console.log(`[pending-response-scheduler] ⚠️ Fallback needed for ${conversa.cliente_telefone}: ${result.fallbackReason}`);
    
    // Implement fallback to legacy webhook
    try {
      const fallbackResult = await supabase.functions.invoke('sofia-webhook', {
        body: {
          phone: conversa.cliente_telefone,
          text: message.content,
          isDelayedResponse: true,
          delayedSince: conversa.last_message_at,
          fromMe: false,
          messageId: message.message_id || message.id,
          useLegacyPipeline: true,
        },
      });
      
      if (fallbackResult.data?.success) {
        console.log(`[pending-response-scheduler] ✅ Legacy fallback succeeded for ${conversa.cliente_telefone}`);
        return true;
      }
      
      console.error(`[pending-response-scheduler] ❌ Legacy fallback failed:`, fallbackResult.error);
    } catch (fallbackError) {
      console.error(`[pending-response-scheduler] ❌ Legacy fallback error:`, fallbackError);
    }
  }
  
  return result.success;
}
