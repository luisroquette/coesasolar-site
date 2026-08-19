/**
 * UNANSWERED MESSAGE DETECTOR
 * 
 * Scheduler que roda a cada 5 minutos para detectar conversas onde:
 * 1. A última mensagem é do cliente (role='user')
 * 2. A Sofia deveria ter respondido mas não respondeu
 * 3. Não está em modo manual (#ASSUMIR)
 * 
 * ⚠️ IMPORTANTE: Este sistema inclui uma TRIAGEM INTELIGENTE que analisa
 * o contexto da conversa antes de agir. NÃO reprocessa mensagens quando:
 * - Cliente pediu tempo para pensar/avaliar
 * - Cliente demonstrou desinteresse claro
 * - Cliente está aguardando ação externa (ex: consultar cônjuge)
 * - Conversa chegou a um ponto de pausa natural
 * 
 * CRON: A cada 5 minutos
 * SECURITY: Internal API only
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getStrictCorsHeaders, handleCorsPrelight } from "../_shared/security-helpers.ts";
import {
  isPhoneBlockedByTakeover,
  normalizeTakeoverPhone,
} from '../_shared/human-takeover.ts';

// MESSAGE BUS - Unified persistence layer
import { publishAssistantMessage } from '../_shared/message-bus.ts';

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

// Configurações - ANTI-SPAM CRÍTICO
const DEFAULT_DETECTION_WINDOW_MINUTES = 15;
const DEFAULT_MAX_DETECTION_WINDOW_MINUTES = 60;
const DEFAULT_BATCH_SIZE = 30;
const DEFAULT_COOLDOWN_MINUTES = 60;  // ⚠️ Aumentado para 60 minutos para evitar spam
const MAX_FALLBACKS_PER_DAY = 1;       // Máximo de 1 fallback por conversa por dia

// Padrões de exclusão rápida (antes da análise LLM)
const QUICK_EXCLUSION_PATTERNS = [
  /vou\s*(pensar|avaliar|analisar|ver|consultar)/i,
  /preciso\s*(pensar|de\s*tempo|conversar|consultar)/i,
  /depois\s*(eu\s*)?(falo|respondo|volto|entro\s*em\s*contato)/i,
  /não\s*(tenho\s*)?interesse/i,
  /não\s*quero/i,
  /obrigad[oa],?\s*(mas\s*)?não/i,
  /agora\s*não\s*(dá|posso|consigo)/i,
  /me\s*liga\s*(depois|amanhã|outro\s*dia)/i,
  /vou\s*falar\s*com\s*(meu|minha)\s*(marido|esposa|esposo|cônjuge|sócio)/i,
  /deixa\s*eu\s*(pensar|ver|analisar)/i,
  /tchau/i,
  /até\s*(mais|logo|depois)/i,
];

interface UnansweredConversation {
  id: string;
  cliente_telefone: string;
  cliente_nome: string | null;
  agent_id: string;
  last_message_at: string;
  last_sofia_message_at: string | null;
  sofia_mode: string | null;
  last_user_message: {
    id: string;
    content: string;
    message_id: string | null;
    created_at: string;
  } | null;
  recent_history?: Array<{ role: string; content: string }>;
}

interface ProcessingResult {
  phone: string;
  conversaId: string;
  action: 'reprocessed' | 'fallback_sent' | 'skipped_by_triage' | 'skipped' | 'error';
  message?: string;
  error?: string;
  triageReason?: string;
}

interface TriageResult {
  shouldProcess: boolean;
  reason: string;
  confidence: number;
  category: 'waiting_response' | 'thinking_time' | 'disinterest' | 'external_action' | 'natural_pause' | 'technical_failure';
}

Deno.serve(async (req) => {
  // Internal API - strict CORS
  if (req.method === "OPTIONS") {
    return handleCorsPrelight(req, { mode: 'strict' });
  }

  const corsHeaders = getStrictCorsHeaders(req);
  const startTime = Date.now();
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  console.log("[unanswered-message-detector] ▶️ Starting scan...");
  
  try {
    // 1. Verificar se detector está habilitado
    const { data: configEnabled } = await supabase
      .from('configuracoes_sistema')
      .select('valor')
      .eq('chave', 'unanswered_message_detector_enabled')
      .maybeSingle();
    
    if (configEnabled?.valor === 'false') {
      console.log("[unanswered-message-detector] ⏸️ Detector disabled");
      return jsonResponse({ skipped: true, reason: "detector_disabled" }, corsHeaders);
    }
    
    // 2. Carregar configurações
    const config = await loadConfig(supabase);
    
    // 3. Verificar quiet hours
    const isQuietHour = await checkQuietHours(supabase);
    if (isQuietHour) {
      console.log("[unanswered-message-detector] 🌙 Quiet hours active, skipping");
      return jsonResponse({ skipped: true, reason: "quiet_hours_active" }, corsHeaders);
    }
    
    // 4. Buscar conversas com mensagens não respondidas
    const unansweredConversations = await findUnansweredConversations(supabase, config);
    
    console.log(`[unanswered-message-detector] 🔍 Found ${unansweredConversations.length} unanswered conversations`);
    
    if (unansweredConversations.length === 0) {
      return jsonResponse({ 
        success: true, 
        processed: 0, 
        message: "No unanswered conversations found",
        duration_ms: Date.now() - startTime
      }, corsHeaders);
    }
    
    // 5. Processar cada conversa
    const results: ProcessingResult[] = [];
    
    for (const conversa of unansweredConversations) {
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
          console.log(`[unanswered-message-detector] 🛑 BLOCKED: ${conversa.cliente_telefone} - Active human takeover`);
          results.push({
            phone: conversa.cliente_telefone,
            conversaId: conversa.id,
            action: 'skipped',
            message: 'Active human takeover'
          });
          continue;
        }
        
        const result = await processUnansweredConversation(supabase, conversa, config);
        results.push(result);
        
        // Delay entre processamentos
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (err) {
        console.error(`[unanswered-message-detector] ❌ Error processing ${conversa.cliente_telefone}:`, err);
        results.push({
          phone: conversa.cliente_telefone,
          conversaId: conversa.id,
          action: 'error',
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }
    
    // 6. Log summary
    const reprocessed = results.filter(r => r.action === 'reprocessed').length;
    const fallbackSent = results.filter(r => r.action === 'fallback_sent').length;
    const skippedByTriage = results.filter(r => r.action === 'skipped_by_triage').length;
    const errors = results.filter(r => r.action === 'error').length;
    
    console.log(`[unanswered-message-detector] ✅ Completed: ${reprocessed} reprocessed, ${fallbackSent} fallbacks, ${skippedByTriage} skipped by triage, ${errors} errors`);
    
    // 7. Registrar execução para monitoramento
    await logDetectorRun(supabase, {
      found: unansweredConversations.length,
      reprocessed,
      fallbackSent,
      skippedByTriage,
      errors,
      duration_ms: Date.now() - startTime
    });
    
    return jsonResponse({
      success: true,
      processed: unansweredConversations.length,
      reprocessed,
      fallbackSent,
      skippedByTriage,
      errors,
      duration_ms: Date.now() - startTime,
      results
    }, corsHeaders);
    
  } catch (error) {
    console.error("[unanswered-message-detector] 💥 Fatal error:", error);
    
    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }, corsHeaders, 500);
  }
});

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════

interface DetectorConfig {
  detectionWindowMinutes: number;
  maxDetectionWindowMinutes: number;
  batchSize: number;
  cooldownMinutes: number;
  enableReprocessing: boolean;
  enableFallback: boolean;
  enableIntelligentTriage: boolean;
}

// deno-lint-ignore no-explicit-any
async function loadConfig(supabase: any): Promise<DetectorConfig> {
  const configs = await Promise.all([
    supabase.from('configuracoes_sistema').select('valor').eq('chave', 'unanswered_detection_window_minutes').maybeSingle(),
    supabase.from('configuracoes_sistema').select('valor').eq('chave', 'unanswered_max_window_minutes').maybeSingle(),
    supabase.from('configuracoes_sistema').select('valor').eq('chave', 'unanswered_batch_size').maybeSingle(),
    supabase.from('configuracoes_sistema').select('valor').eq('chave', 'unanswered_cooldown_minutes').maybeSingle(),
    supabase.from('configuracoes_sistema').select('valor').eq('chave', 'unanswered_enable_reprocessing').maybeSingle(),
    supabase.from('configuracoes_sistema').select('valor').eq('chave', 'unanswered_enable_fallback').maybeSingle(),
    supabase.from('configuracoes_sistema').select('valor').eq('chave', 'unanswered_enable_intelligent_triage').maybeSingle(),
  ]);
  
  return {
    detectionWindowMinutes: parseInt(configs[0].data?.valor || String(DEFAULT_DETECTION_WINDOW_MINUTES), 10),
    maxDetectionWindowMinutes: parseInt(configs[1].data?.valor || String(DEFAULT_MAX_DETECTION_WINDOW_MINUTES), 10),
    batchSize: parseInt(configs[2].data?.valor || String(DEFAULT_BATCH_SIZE), 10),
    cooldownMinutes: parseInt(configs[3].data?.valor || String(DEFAULT_COOLDOWN_MINUTES), 10),
    enableReprocessing: configs[4].data?.valor !== 'false',
    enableFallback: configs[5].data?.valor !== 'false',
    enableIntelligentTriage: configs[6].data?.valor !== 'false', // Habilitado por padrão
  };
}

// ═══════════════════════════════════════════════════════════════
// DETECTION LOGIC
// ═══════════════════════════════════════════════════════════════

// deno-lint-ignore no-explicit-any
async function findUnansweredConversations(
  supabase: any,
  config: DetectorConfig
): Promise<UnansweredConversation[]> {
  const now = Date.now();
  
  // Janela de detecção: mensagens entre X e Y minutos atrás
  const minTime = new Date(now - config.maxDetectionWindowMinutes * 60 * 1000).toISOString();
  const maxTime = new Date(now - config.detectionWindowMinutes * 60 * 1000).toISOString();
  
  console.log(`[unanswered-message-detector] Scanning window: ${config.detectionWindowMinutes}-${config.maxDetectionWindowMinutes} minutes ago`);
  
  // Query para encontrar conversas onde:
  // 1. Conversa não está encerrada
  // 2. Não está em modo manual (paused_for_human)
  // 3. Última mensagem está na janela de detecção
  const { data: conversas, error } = await supabase
    .from('chatbot_conversas')
    .select(`
      id, 
      cliente_telefone, 
      cliente_nome, 
      agent_id, 
      last_message_at, 
      last_sofia_message_at, 
      sofia_mode
    `)
    .is('ended_at', null)
    .not('sofia_mode', 'in', '("paused_for_human","descartado","sac_redirect")')
    .gt('last_message_at', minTime)
    .lt('last_message_at', maxTime)
    .order('last_message_at', { ascending: true })
    .limit(config.batchSize);
  
  if (error) {
    console.error("[unanswered-message-detector] Query error:", error);
    throw error;
  }
  
  if (!conversas || conversas.length === 0) {
    return [];
  }
  
  // Filtrar conversas onde a última mensagem é do cliente e não foi respondida
  const unanswered: UnansweredConversation[] = [];
  
  for (const conv of conversas) {
    // Verificar se última mensagem é do cliente
    const lastMsgIsFromClient = await checkLastMessageIsFromClient(supabase, conv);
    
    if (lastMsgIsFromClient.isFromClient) {
      // Verificar se já não tentamos recentemente (com todas as proteções anti-spam)
      const recentCheck = await checkRecentProcessingAttempt(
        supabase, 
        conv.id, 
        config.cooldownMinutes,
        lastMsgIsFromClient.message?.message_id || lastMsgIsFromClient.message?.id
      );
      
      if (!recentCheck.hasRecent) {
        unanswered.push({
          ...conv,
          last_user_message: lastMsgIsFromClient.message
        });
      } else {
        console.log(`[unanswered-message-detector] ⏭️ Skipping ${conv.cliente_telefone}: ${recentCheck.reason}`);
      }
    }
  }
  
  return unanswered;
}

// deno-lint-ignore no-explicit-any
async function checkLastMessageIsFromClient(
  supabase: any,
  conv: { id: string; last_message_at: string; last_sofia_message_at: string | null }
): Promise<{ isFromClient: boolean; message: UnansweredConversation['last_user_message'] }> {
  
  // Se nunca respondeu, última é do cliente
  if (!conv.last_sofia_message_at) {
    const { data: lastUserMsg } = await supabase
      .from('chatbot_mensagens')
      .select('id, content, message_id, created_at')
      .eq('conversa_id', conv.id)
      .eq('role', 'user')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    return { 
      isFromClient: !!lastUserMsg, 
      message: lastUserMsg 
    };
  }
  
  // Comparar timestamps
  const lastMsg = new Date(conv.last_message_at).getTime();
  const lastSofia = new Date(conv.last_sofia_message_at).getTime();
  
  if (lastMsg > lastSofia) {
    // Última mensagem é do cliente - buscar conteúdo
    const { data: lastUserMsg } = await supabase
      .from('chatbot_mensagens')
      .select('id, content, message_id, created_at')
      .eq('conversa_id', conv.id)
      .eq('role', 'user')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    return { 
      isFromClient: !!lastUserMsg, 
      message: lastUserMsg 
    };
  }
  
  return { isFromClient: false, message: null };
}

// deno-lint-ignore no-explicit-any
async function checkRecentProcessingAttempt(
  supabase: any,
  conversaId: string,
  cooldownMinutes: number,
  messageId?: string | null
): Promise<{ hasRecent: boolean; reason?: string }> {
  const cooldownTime = new Date(Date.now() - cooldownMinutes * 60 * 1000).toISOString();
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  
  // ════════════════════════════════════════════════════════════════
  // PROTEÇÃO 1: Verificar se já processamos ESTA MENSAGEM ESPECÍFICA
  // ════════════════════════════════════════════════════════════════
  if (messageId) {
    const { data: sameMessageAttempt } = await supabase
      .from('unanswered_detection_attempts')
      .select('id, result')
      .eq('conversa_id', conversaId)
      .eq('message_id', messageId)
      .limit(1)
      .maybeSingle();
    
    if (sameMessageAttempt) {
      return { hasRecent: true, reason: `same_message_already_processed (${sameMessageAttempt.result})` };
    }
  }
  
  // ════════════════════════════════════════════════════════════════
  // PROTEÇÃO 2: Limite de fallbacks por dia (anti-spam)
  // ════════════════════════════════════════════════════════════════
  const { data: fallbacksToday, count: fallbackCount } = await supabase
    .from('unanswered_detection_attempts')
    .select('id', { count: 'exact' })
    .eq('conversa_id', conversaId)
    .in('result', ['fallback_sent', 'reprocessed'])
    .gt('created_at', last24h);
  
  if (fallbackCount && fallbackCount >= MAX_FALLBACKS_PER_DAY) {
    return { hasRecent: true, reason: `max_fallbacks_reached (${fallbackCount}/${MAX_FALLBACKS_PER_DAY} today)` };
  }
  
  // ════════════════════════════════════════════════════════════════
  // PROTEÇÃO 3: Verificar se há mensagem do assistant após o cooldown
  // ════════════════════════════════════════════════════════════════
  const { data: recentResponse } = await supabase
    .from('chatbot_mensagens')
    .select('id')
    .eq('conversa_id', conversaId)
    .eq('role', 'assistant')
    .gt('created_at', cooldownTime)
    .limit(1)
    .maybeSingle();
  
  if (recentResponse) {
    return { hasRecent: true, reason: 'recent_assistant_message' };
  }
  
  // ════════════════════════════════════════════════════════════════
  // PROTEÇÃO 4: Verificar tentativa de detecção recente (qualquer resultado)
  // ════════════════════════════════════════════════════════════════
  const { data: recentAttempt } = await supabase
    .from('unanswered_detection_attempts')
    .select('id, result')
    .eq('conversa_id', conversaId)
    .gt('created_at', cooldownTime)
    .limit(1)
    .maybeSingle();
  
  if (recentAttempt) {
    return { hasRecent: true, reason: `recent_attempt (${recentAttempt.result})` };
  }
  
  return { hasRecent: false };
}

// ═══════════════════════════════════════════════════════════════
// INTELLIGENT TRIAGE - Análise de contexto antes de agir
// ═══════════════════════════════════════════════════════════════

/**
 * Busca o histórico recente da conversa para análise de contexto
 */
// deno-lint-ignore no-explicit-any
async function fetchRecentHistory(supabase: any, conversaId: string, limit = 10): Promise<Array<{ role: string; content: string }>> {
  const { data } = await supabase
    .from('chatbot_mensagens')
    .select('role, content')
    .eq('conversa_id', conversaId)
    .order('created_at', { ascending: false })
    .limit(limit);
  
  return (data || []).reverse();
}

/**
 * Triagem rápida via padrões regex (sem custo de LLM)
 */
function quickPatternTriage(lastMessage: string, history: Array<{ role: string; content: string }>): TriageResult | null {
  const lowerMessage = lastMessage.toLowerCase();
  
  // Verificar padrões de exclusão na última mensagem do cliente
  for (const pattern of QUICK_EXCLUSION_PATTERNS) {
    if (pattern.test(lowerMessage)) {
      return {
        shouldProcess: false,
        reason: `Padrão detectado: cliente indicou pausa/desinteresse`,
        confidence: 0.9,
        category: lowerMessage.includes('tchau') || lowerMessage.includes('até') 
          ? 'natural_pause' 
          : lowerMessage.includes('pensar') || lowerMessage.includes('avaliar')
            ? 'thinking_time'
            : lowerMessage.includes('interesse') || lowerMessage.includes('não quero')
              ? 'disinterest'
              : 'external_action'
      };
    }
  }
  
  // Verificar contexto nas últimas mensagens da Sofia
  const lastSofiaMessage = history.filter(m => m.role === 'assistant').pop();
  if (lastSofiaMessage) {
    const sofiaLower = lastSofiaMessage.content.toLowerCase();
    
    // Se a Sofia perguntou algo e o cliente respondeu, é resposta pendente
    const sofiaAskedQuestion = sofiaLower.includes('?') || 
      sofiaLower.includes('qual') || 
      sofiaLower.includes('quanto') ||
      sofiaLower.includes('pode me');
    
    if (sofiaAskedQuestion) {
      return {
        shouldProcess: true,
        reason: 'Sofia fez uma pergunta e cliente respondeu - resposta pendente',
        confidence: 0.85,
        category: 'waiting_response'
      };
    }
  }
  
  return null; // Precisa análise LLM
}

/**
 * Triagem inteligente via LLM para casos ambíguos
 */
// deno-lint-ignore no-explicit-any
async function intelligentLLMTriage(
  history: Array<{ role: string; content: string }>,
  lastUserMessage: string
): Promise<TriageResult> {
  
  if (!LOVABLE_API_KEY) {
    console.warn("[unanswered-message-detector] No LOVABLE_API_KEY, defaulting to process");
    return {
      shouldProcess: true,
      reason: 'Sem API key para triagem, processando por segurança',
      confidence: 0.5,
      category: 'technical_failure'
    };
  }
  
  // Montar contexto para o LLM
  const historyText = history
    .slice(-6) // Últimas 6 mensagens
    .map(m => `${m.role === 'user' ? 'Cliente' : 'Sofia'}: ${m.content}`)
    .join('\n');
  
  const prompt = `Você é um sistema de triagem que decide se devemos reprocessar uma mensagem não respondida.

CONTEXTO DA CONVERSA:
${historyText}

ÚLTIMA MENSAGEM DO CLIENTE (não respondida):
"${lastUserMessage}"

ANALISE e responda APENAS com um JSON válido:
{
  "shouldProcess": boolean,
  "reason": "explicação curta",
  "category": "waiting_response" | "thinking_time" | "disinterest" | "external_action" | "natural_pause" | "technical_failure",
  "confidence": 0.0 a 1.0
}

REGRAS DE DECISÃO:
- shouldProcess=true SE: cliente fez pergunta, pediu informação, está engajado, respondeu algo que merece continuação
- shouldProcess=false SE: cliente pediu tempo para pensar, disse que vai avaliar, demonstrou desinteresse claro, despediu-se, disse que vai consultar alguém

Categorias:
- waiting_response: Cliente está esperando resposta da Sofia (PROCESSAR)
- thinking_time: Cliente pediu tempo para pensar/avaliar (NÃO PROCESSAR)
- disinterest: Cliente demonstrou não ter interesse (NÃO PROCESSAR)
- external_action: Cliente precisa fazer algo externo (consultar cônjuge, etc) (NÃO PROCESSAR)
- natural_pause: Conversa chegou a pausa natural/despedida (NÃO PROCESSAR)
- technical_failure: Sofia deveria ter respondido mas falhou (PROCESSAR)

Responda APENAS o JSON:`;

  try {
    const response = await fetch('https://api.lovable.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LOVABLE_API_KEY}`
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 200
      })
    });
    
    if (!response.ok) {
      throw new Error(`LLM API error: ${response.status}`);
    }
    
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    // Extrair JSON da resposta
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        shouldProcess: parsed.shouldProcess ?? true,
        reason: parsed.reason || 'Análise LLM',
        confidence: parsed.confidence || 0.7,
        category: parsed.category || 'technical_failure'
      };
    }
    
    throw new Error('No JSON in LLM response');
    
  } catch (err) {
    console.error("[unanswered-message-detector] LLM triage error:", err);
    // Em caso de erro, processar por segurança (Cláusula Pétrea)
    return {
      shouldProcess: true,
      reason: 'Erro na triagem LLM, processando por segurança',
      confidence: 0.5,
      category: 'technical_failure'
    };
  }
}

/**
 * Executa triagem completa (padrões + LLM se necessário)
 */
// deno-lint-ignore no-explicit-any
async function performIntelligentTriage(
  supabase: any,
  conversa: UnansweredConversation,
  config: DetectorConfig
): Promise<TriageResult> {
  
  // 1. Buscar histórico
  const history = await fetchRecentHistory(supabase, conversa.id, 10);
  const lastMessage = conversa.last_user_message?.content || '';
  
  // 2. Triagem rápida via padrões
  const quickResult = quickPatternTriage(lastMessage, history);
  if (quickResult) {
    console.log(`[unanswered-message-detector] Quick triage: ${quickResult.category} - ${quickResult.reason}`);
    return quickResult;
  }
  
  // 3. Triagem via LLM para casos ambíguos
  console.log(`[unanswered-message-detector] Running LLM triage for ambiguous case...`);
  return await intelligentLLMTriage(history, lastMessage);
}

// ═══════════════════════════════════════════════════════════════
// PROCESSING LOGIC
// ═══════════════════════════════════════════════════════════════

// deno-lint-ignore no-explicit-any
async function processUnansweredConversation(
  supabase: any,
  conversa: UnansweredConversation,
  config: DetectorConfig
): Promise<ProcessingResult> {
  const { id, cliente_telefone, cliente_nome, agent_id, last_user_message } = conversa;
  
  console.log(`[unanswered-message-detector] 🔄 Processing ${cliente_telefone}...`);
  
  if (!last_user_message) {
    return {
      phone: cliente_telefone,
      conversaId: id,
      action: 'skipped',
      message: 'No user message found'
    };
  }
  
  // ════════════════════════════════════════════════════════════════
  // NEW: VERIFICAÇÃO DE RESPOSTA EXISTENTE APÓS MENSAGEM DO USUÁRIO
  // Evita reprocessamento se a Sofia já respondeu esta mensagem específica
  // ════════════════════════════════════════════════════════════════
  const { data: responseAfterUserMsg } = await supabase
    .from('chatbot_mensagens')
    .select('id, created_at')
    .eq('conversa_id', id)
    .eq('role', 'assistant')
    .gt('created_at', last_user_message.created_at)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  
  if (responseAfterUserMsg) {
    console.log(`[unanswered-message-detector] ⏭️ Already responded at ${responseAfterUserMsg.created_at} - skipping`);
    return {
      phone: cliente_telefone,
      conversaId: id,
      action: 'skipped',
      message: 'Already responded after user message'
    };
  }
  
  // ════════════════════════════════════════════════════════════════
  // NEW: DEBOUNCE - Verificar tentativa bem-sucedida nos últimos 10 min
  // Evita múltiplas execuções do detector processando a mesma conversa
  // ════════════════════════════════════════════════════════════════
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: recentSuccess } = await supabase
    .from('unanswered_detection_attempts')
    .select('created_at, result')
    .eq('conversa_id', id)
    .in('result', ['reprocessed', 'fallback_sent'])
    .gt('created_at', tenMinutesAgo)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  
  if (recentSuccess) {
    console.log(`[unanswered-message-detector] ⏭️ Recent ${recentSuccess.result} at ${recentSuccess.created_at} - debouncing`);
    return {
      phone: cliente_telefone,
      conversaId: id,
      action: 'skipped',
      message: `Recent successful attempt (${recentSuccess.result}) - 10min debounce`
    };
  }
  
  // ════════════════════════════════════════════════════════════════
  // TRIAGEM INTELIGENTE - Verificar se devemos processar
  // ════════════════════════════════════════════════════════════════
  
  if (config.enableIntelligentTriage) {
    const triageResult = await performIntelligentTriage(supabase, conversa, config);
    
    console.log(`[unanswered-message-detector] 🎯 Triage result: shouldProcess=${triageResult.shouldProcess}, category=${triageResult.category}, confidence=${triageResult.confidence}`);
    
    if (!triageResult.shouldProcess) {
      // Registrar tentativa com resultado da triagem
      await supabase.from('unanswered_detection_attempts').insert({
        conversa_id: id,
        agent_id,
        message_id: last_user_message.message_id || last_user_message.id, // ⚠️ ANTI-SPAM: track specific message
        message_content: last_user_message.content.substring(0, 500),
        message_created_at: last_user_message.created_at,
        detection_delay_seconds: Math.floor((Date.now() - new Date(last_user_message.created_at).getTime()) / 1000),
        result: 'skipped_by_triage',
        result_details: `${triageResult.category}: ${triageResult.reason} (confidence: ${triageResult.confidence})`,
        processed_at: new Date().toISOString()
      });
      
      console.log(`[unanswered-message-detector] ⏭️ Skipped by triage: ${triageResult.reason}`);
      
      return {
        phone: cliente_telefone,
        conversaId: id,
        action: 'skipped_by_triage',
        message: triageResult.reason,
        triageReason: `${triageResult.category}: ${triageResult.reason}`
      };
    }
  }
  
  await supabase.from('unanswered_detection_attempts').insert({
    conversa_id: id,
    agent_id,
    message_id: last_user_message.message_id || last_user_message.id, // ⚠️ ANTI-SPAM: track specific message
    message_content: last_user_message.content.substring(0, 500),
    message_created_at: last_user_message.created_at,
    detection_delay_seconds: Math.floor((Date.now() - new Date(last_user_message.created_at).getTime()) / 1000)
  });
  
  // Calcular tempo desde a mensagem
  const minutesSinceMessage = Math.floor(
    (Date.now() - new Date(last_user_message.created_at).getTime()) / (1000 * 60)
  );
  
  console.log(`[unanswered-message-detector] Message from ${minutesSinceMessage} minutes ago: "${last_user_message.content.substring(0, 50)}..."`);
  
  // Estratégia 1: Tentar reprocessar via webhook
  if (config.enableReprocessing) {
    try {
      const reprocessResult = await reprocessViaWebhook(supabase, conversa, last_user_message);
      
      if (reprocessResult.success) {
        console.log(`[unanswered-message-detector] ✅ Reprocessing succeeded for ${cliente_telefone}`);
        
        // Atualizar tentativa como sucesso
        await updateAttemptResult(supabase, id, 'reprocessed', reprocessResult.message);
        
        return {
          phone: cliente_telefone,
          conversaId: id,
          action: 'reprocessed',
          message: reprocessResult.message
        };
      }
    } catch (err) {
      console.error(`[unanswered-message-detector] Reprocessing failed:`, err);
    }
  }
  
  // Estratégia 2: Enviar fallback da Cláusula Pétrea
  if (config.enableFallback) {
    try {
      const fallbackResult = await sendClausulaPetreaFallback(supabase, conversa);
      
      if (fallbackResult.success) {
        console.log(`[unanswered-message-detector] ✅ Fallback sent for ${cliente_telefone}`);
        
        // Atualizar tentativa
        await updateAttemptResult(supabase, id, 'fallback_sent', 'Clausula Petrea fallback');
        
        return {
          phone: cliente_telefone,
          conversaId: id,
          action: 'fallback_sent',
          message: 'Fallback message sent'
        };
      }
    } catch (err) {
      console.error(`[unanswered-message-detector] Fallback failed:`, err);
    }
  }
  
  // Se nada funcionou
  await updateAttemptResult(supabase, id, 'failed', 'All strategies failed');
  
  return {
    phone: cliente_telefone,
    conversaId: id,
    action: 'error',
    error: 'All processing strategies failed'
  };
}

// deno-lint-ignore no-explicit-any
async function reprocessViaWebhook(
  supabase: any,
  conversa: UnansweredConversation,
  message: NonNullable<UnansweredConversation['last_user_message']>
): Promise<{ success: boolean; message?: string }> {
  
  // Chamar o webhook da Sofia para reprocessar
  const webhookResult = await supabase.functions.invoke('sofia-webhook', {
    body: {
      phone: conversa.cliente_telefone,
      text: message.content,
      messageId: message.message_id || message.id,
      fromMe: false,
      isReprocessing: true,
      triggeredBy: 'unanswered-message-detector',
      originalMessageAt: message.created_at
    }
  });
  
  if (webhookResult.error) {
    throw new Error(`Webhook error: ${webhookResult.error.message}`);
  }
  
  // Verificar se resposta foi enviada
  if (webhookResult.data?.success || webhookResult.data?.message_sent) {
    return { success: true, message: 'Reprocessed via webhook' };
  }
  
  return { success: false };
}

// deno-lint-ignore no-explicit-any
async function sendClausulaPetreaFallback(
  supabase: any,
  conversa: UnansweredConversation
): Promise<{ success: boolean }> {
  
  // Buscar credenciais Z-API
  const { data: agent } = await supabase
    .from('ai_agents')
    .select('zapi_instance_id, zapi_token, zapi_security_token')
    .eq('agent_id', conversa.agent_id)
    .maybeSingle();
  
  if (!agent?.zapi_instance_id || !agent?.zapi_token) {
    console.error(`[unanswered-message-detector] No Z-API credentials for agent ${conversa.agent_id}`);
    return { success: false };
  }
  
  // Mensagem de fallback personalizada
  const nome = conversa.cliente_nome?.split(' ')[0] || '';
  const fallbackMessage = nome 
    ? `${nome}, desculpa! Tive um problema técnico e não consegui te responder antes. 😅 Pode repetir o que você disse?`
    : `Oi! Desculpa pela demora, tive um problema técnico. 😅 Pode repetir sua mensagem?`;
  
  // Enviar via Z-API
  const sendResult = await supabase.functions.invoke('z-api-send-message', {
    body: {
      phone: conversa.cliente_telefone,
      message: fallbackMessage,
      instanceId: agent.zapi_instance_id,
      token: agent.zapi_token,
      securityToken: agent.zapi_security_token
    }
  });
  
  if (sendResult.error) {
    throw new Error(`Send error: ${sendResult.error.message}`);
  }
  
  // Use Message Bus for unified persistence (handles timestamps automatically)
  await publishAssistantMessage(supabase, conversa.id, fallbackMessage, 'unanswered_detector');
  
  return { success: true };
}

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

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
  } catch {
    return false;
  }
}

// deno-lint-ignore no-explicit-any
async function updateAttemptResult(
  supabase: any,
  conversaId: string,
  result: string,
  details?: string
): Promise<void> {
  await supabase
    .from('unanswered_detection_attempts')
    .update({ 
      result,
      result_details: details,
      processed_at: new Date().toISOString()
    })
    .eq('conversa_id', conversaId)
    .is('processed_at', null)
    .order('created_at', { ascending: false })
    .limit(1);
}

// deno-lint-ignore no-explicit-any
async function logDetectorRun(
  supabase: any,
  stats: {
    found: number;
    reprocessed: number;
    fallbackSent: number;
    skippedByTriage: number;
    errors: number;
    duration_ms: number;
  }
): Promise<void> {
  try {
    await supabase.from('scheduler_execution_logs').insert({
      scheduler_name: 'unanswered-message-detector',
      status: 'completed',
      stats,
      executed_at: new Date().toISOString()
    });
  } catch (err) {
    console.warn("[unanswered-message-detector] Failed to log run:", err);
  }
}

// deno-lint-ignore no-explicit-any
function jsonResponse(data: any, headers: Record<string, string>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, "Content-Type": "application/json" }
  });
}
