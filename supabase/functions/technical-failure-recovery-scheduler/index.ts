/**
 * TECHNICAL FAILURE RECOVERY SCHEDULER
 * 
 * Identifica e reprocessa conversas que entraram em 'paused_for_human'
 * devido a falhas técnicas (401, timeout, etc.) e não por intervenção humana real.
 * 
 * Critérios para recuperação:
 * - sofia_mode = 'paused_for_human'
 * - Sem human_agent_id (nenhum humano assumiu)
 * - Sem comando #ASSUMIR recente
 * - Última mensagem do cliente sem resposta
 * SECURITY: Uses strict CORS (internal API)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { executePipeline } from "../_shared/pipeline/index.ts";
import {
  getStrictCorsHeaders,
  handleCorsPrelight,
} from '../_shared/security-helpers.ts';

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface RecoverableConversation {
  id: string;
  cliente_telefone: string;
  cliente_nome: string | null;
  agent_id: string;
  last_message_at: string;
  last_sofia_message_at: string | null;
  sofia_mode: string;
  human_agent_id: string | null;
  escalated_at: string | null;
  escalation_reason: string | null;
}

interface LastMessage {
  id: string;
  content: string;
  message_id: string | null;
  created_at: string;
}

Deno.serve(async (req) => {
  // Internal API - strict CORS
  if (req.method === "OPTIONS") {
    return handleCorsPrelight(req, { mode: 'strict' });
  }

  const corsHeaders = getStrictCorsHeaders(req);
  const startTime = Date.now();
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  console.log("[technical-failure-recovery] ▶️ Starting...");
  
  try {
    // 1. Verificar se scheduler está habilitado
    const { data: configEnabled } = await supabase
      .from('configuracoes_sistema')
      .select('valor')
      .eq('chave', 'technical_failure_recovery_enabled')
      .maybeSingle();
    
    if (configEnabled?.valor === 'false') {
      console.log("[technical-failure-recovery] ⏸️ Scheduler disabled");
      return new Response(JSON.stringify({ 
        skipped: true, 
        reason: "scheduler_disabled" 
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    
    // 2. Verificar quiet hours (não executar durante quiet hours)
    const isQuietHour = await checkQuietHours(supabase);
    if (isQuietHour) {
      console.log("[technical-failure-recovery] 🌙 Quiet hours active, skipping");
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
      .eq('chave', 'technical_failure_recovery_batch_size')
      .maybeSingle();
    
    const batchSize = parseInt(batchConfig?.valor || '20', 10);
    
    const { data: lookbackConfig } = await supabase
      .from('configuracoes_sistema')
      .select('valor')
      .eq('chave', 'technical_failure_recovery_lookback_hours')
      .maybeSingle();
    
    const lookbackHours = parseInt(lookbackConfig?.valor || '24', 10);
    
    // 4. Buscar conversas pausadas por falha técnica
    const recoverableConversations = await findTechnicallyPausedConversations(
      supabase, 
      lookbackHours, 
      batchSize
    );
    
    console.log(`[technical-failure-recovery] 📋 Found ${recoverableConversations.length} recoverable conversations`);
    
    if (recoverableConversations.length === 0) {
      return new Response(JSON.stringify({ 
        processed: 0, 
        success: true,
        message: "No recoverable conversations found"
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    
    // 5. Processar cada conversa
    const results: Array<{ phone: string; success: boolean; error?: string }> = [];
    
    for (const conversa of recoverableConversations) {
      try {
        const result = await recoverConversation(supabase, conversa);
        results.push({ phone: conversa.cliente_telefone, success: result });
        
        // Delay entre processamentos
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (err) {
        console.error(`[technical-failure-recovery] ❌ Error recovering ${conversa.cliente_telefone}:`, err);
        results.push({ 
          phone: conversa.cliente_telefone, 
          success: false, 
          error: err instanceof Error ? err.message : String(err) 
        });
      }
    }
    
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log(`[technical-failure-recovery] ✅ Completed: ${successful} recovered, ${failed} failed`);
    
    return new Response(JSON.stringify({
      success: true,
      processed: recoverableConversations.length,
      successful,
      failed,
      duration_ms: Date.now() - startTime,
      results
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
    
  } catch (error) {
    console.error("[technical-failure-recovery] 💥 Fatal error:", error);
    
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
      return false;
    }
    
    const startHour = parseInt(startConfig.valor, 10);
    const endHour = parseInt(endConfig.valor, 10);
    
    const now = new Date();
    const saoPauloOffset = -3;
    const saoPauloHour = (now.getUTCHours() + saoPauloOffset + 24) % 24;
    
    if (startHour > endHour) {
      return saoPauloHour >= startHour || saoPauloHour < endHour;
    } else {
      return saoPauloHour >= startHour && saoPauloHour < endHour;
    }
  } catch (err) {
    console.warn("[technical-failure-recovery] Error checking quiet hours:", err);
    return false;
  }
}

/**
 * Busca conversas que estão em paused_for_human mas sem intervenção humana real
 */
// deno-lint-ignore no-explicit-any
async function findTechnicallyPausedConversations(
  supabase: any,
  lookbackHours: number,
  limit: number
): Promise<RecoverableConversation[]> {
  const lookbackTime = new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();
  
  // Query para encontrar conversas onde:
  // 1. sofia_mode = 'paused_for_human'
  // 2. Conversa não está encerrada
  // 3. Não há human_agent_id (nenhum humano assumiu via #ASSUMIR)
  // 4. Última mensagem foi nas últimas X horas
  const { data, error } = await supabase
    .from('chatbot_conversas')
    .select(`
      id, 
      cliente_telefone, 
      cliente_nome, 
      agent_id, 
      last_message_at, 
      last_sofia_message_at, 
      sofia_mode,
      human_agent_id,
      escalated_at,
      escalation_reason
    `)
    .is('ended_at', null)
    .eq('sofia_mode', 'paused_for_human')
    .is('human_agent_id', null) // Nenhum humano assumiu
    .gt('last_message_at', lookbackTime)
    .order('last_message_at', { ascending: true })
    .limit(limit);
  
  if (error) {
    console.error("[technical-failure-recovery] Error querying:", error);
    throw error;
  }
  
  const conversations = data || [];
  
  // Filtrar conversas que parecem ser falhas técnicas
  const recoverableConversations: RecoverableConversation[] = [];
  
  for (const conv of conversations) {
    const isTechnicalFailure = await checkIfTechnicalFailure(supabase, conv);
    if (isTechnicalFailure) {
      recoverableConversations.push(conv);
    }
  }
  
  return recoverableConversations;
}

/**
 * Verifica se a conversa foi pausada por falha técnica
 */
// deno-lint-ignore no-explicit-any
async function checkIfTechnicalFailure(supabase: any, conv: RecoverableConversation): Promise<boolean> {
  // 1. Verificar se há comando #ASSUMIR nas mensagens recentes
  const { data: recentMessages } = await supabase
    .from('chatbot_mensagens')
    .select('content, role')
    .eq('conversa_id', conv.id)
    .order('created_at', { ascending: false })
    .limit(20);
  
  if (recentMessages) {
    for (const msg of recentMessages) {
      const content = msg.content?.toLowerCase() || '';
      // Se encontrar comando de takeover humano, não é falha técnica
      if (content.includes('#assumir') || 
          content.includes('#takeover') || 
          content.includes('#humano')) {
        console.log(`[technical-failure-recovery] Skipping ${conv.cliente_telefone}: human takeover command found`);
        return false;
      }
    }
  }
  
  // 2. Verificar se a razão de escalação indica falha técnica
  const technicalReasons = [
    'falha técnica',
    'technical failure',
    'api error',
    '401',
    '500',
    'timeout',
    'rate limit',
    'llm failure',
    'ai failure'
  ];
  
  if (conv.escalation_reason) {
    const reason = conv.escalation_reason.toLowerCase();
    for (const techReason of technicalReasons) {
      if (reason.includes(techReason)) {
        console.log(`[technical-failure-recovery] ${conv.cliente_telefone}: technical failure detected - ${conv.escalation_reason}`);
        return true;
      }
    }
  }
  
  // 3. Se não há human_agent_id e não há comando de takeover,
  //    provavelmente é uma falha técnica que pausou automaticamente
  // Verificar se última mensagem do usuário não foi respondida
  const { data: lastUserMsg } = await supabase
    .from('chatbot_mensagens')
    .select('created_at')
    .eq('conversa_id', conv.id)
    .eq('role', 'user')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  
  const { data: lastAssistantMsg } = await supabase
    .from('chatbot_mensagens')
    .select('created_at')
    .eq('conversa_id', conv.id)
    .eq('role', 'assistant')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  
  if (lastUserMsg && (!lastAssistantMsg || 
      new Date(lastUserMsg.created_at) > new Date(lastAssistantMsg.created_at))) {
    // Última mensagem é do usuário e não foi respondida - provável falha técnica
    console.log(`[technical-failure-recovery] ${conv.cliente_telefone}: no response to last user message, likely technical failure`);
    return true;
  }
  
  return false;
}

/**
 * Recupera uma conversa pausada por falha técnica
 */
// deno-lint-ignore no-explicit-any
async function recoverConversation(
  supabase: any,
  conversa: RecoverableConversation
): Promise<boolean> {
  console.log(`[technical-failure-recovery] 🔄 Recovering ${conversa.cliente_telefone}...`);
  
  // 1. Resetar o sofia_mode para permitir processamento
  const { error: updateError } = await supabase
    .from('chatbot_conversas')
    .update({ 
      sofia_mode: 'auto',
      escalation_reason: null,
      escalated_at: null
    })
    .eq('id', conversa.id);
  
  if (updateError) {
    console.error(`[technical-failure-recovery] Failed to reset mode for ${conversa.id}:`, updateError);
    throw updateError;
  }
  
  // 2. Buscar última mensagem do cliente
  const { data: lastMessage, error: msgError } = await supabase
    .from('chatbot_mensagens')
    .select('id, content, message_id, created_at')
    .eq('conversa_id', conversa.id)
    .eq('role', 'user')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  
  if (msgError || !lastMessage) {
    console.warn(`[technical-failure-recovery] No user message found for ${conversa.id}`);
    return true; // Consideramos sucesso pois resetamos o modo
  }
  
  const message = lastMessage as LastMessage;
  
  // 3. Calcular tempo desde a mensagem original
  const originalTime = new Date(message.created_at);
  const hoursDelayed = Math.floor((Date.now() - originalTime.getTime()) / (1000 * 60 * 60));
  
  console.log(`[technical-failure-recovery] Reprocessing message delayed by ${hoursDelayed} hours: "${message.content.substring(0, 50)}..."`);
  
  // 4. Executar Pipeline com flag de recuperação
  const result = await executePipeline(
    conversa.id,
    message.message_id || message.id,
    conversa.cliente_telefone,
    message.content,
    'text',
    {
      isDelayedResponse: true,
      delayedSince: message.created_at,
      hoursDelayed,
      agentId: conversa.agent_id,
      triggeredBy: 'technical-failure-recovery-scheduler',
      recoveredFromTechnicalFailure: true
    }
  );
  
  if (result.success && result.messageSent) {
    console.log(`[technical-failure-recovery] ✅ Successfully recovered ${conversa.cliente_telefone}`);
    return true;
  }
  
  // Se falhou novamente, reverter para paused_for_human
  if (!result.success) {
    console.warn(`[technical-failure-recovery] ⚠️ Recovery failed for ${conversa.cliente_telefone}, reverting to paused_for_human`);
    await supabase
      .from('chatbot_conversas')
      .update({ 
        sofia_mode: 'paused_for_human',
        escalation_reason: 'Falha técnica persistente após tentativa de recuperação'
      })
      .eq('id', conversa.id);
  }
  
  return result.success;
}
