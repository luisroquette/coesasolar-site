/**
 * POST-GREETING HANDLER
 * 
 * Handles the transition after the initial greeting
 * FASE 2: Now expects NAME as first response, then proceeds to value collection
 * 
 * Flow:
 * 1. Greeting asks for name
 * 2. Client responds with name
 * 3. Sofia saves name and asks for bill value
 * 4. Continue with distribuidora → email flow
 * 
 * This ensures the Formulário Livre Guiado continues flowing after greeting
 * 
 * @module _shared/sofia-orchestrator/post-greeting-handler
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.90.0';
import { corsHeaders } from '../webhook-types.ts';
import {
  syncToBitrix,
} from '../bitrix-sync.ts';

// ═══════════════════════════════════════════════════════════════
// NAME EXTRACTION PATTERNS
// ═══════════════════════════════════════════════════════════════

/**
 * Extract name from user message
 * Handles various formats: "João", "Meu nome é João", "Sou o João", "Maria Silva", etc.
 */
function extractNameFromMessage(message: string): string | null {
  const normalized = message.trim();
  
  // Skip if message is too short or too long for a name
  if (normalized.length < 2 || normalized.length > 100) return null;
  
  // Skip if message contains obvious non-name content
  if (/\d{3,}|@|\.com|r\$|reais|cemig|cpfl|enel|conta|luz|energia/i.test(normalized)) {
    return null;
  }
  
  // Pattern 1: "Meu nome é X" / "Me chamo X" / "Sou o/a X"
  const explicitPatterns = [
    /(?:meu\s+nome\s+[eé]|me\s+chamo|sou\s+[oa]?\s*)\s*([A-ZÀ-Úa-zà-ú][A-ZÀ-Úa-zà-ú\s]+)/i,
    /(?:[eé]\s+)?([A-ZÀ-Úa-zà-ú][A-ZÀ-Úa-zà-ú\s]+)\s*(?:mesmo|aqui|sim)/i,
  ];
  
  for (const pattern of explicitPatterns) {
    const match = normalized.match(pattern);
    if (match && match[1]) {
      const name = match[1].trim();
      if (name.length >= 2 && name.length <= 60) {
        return name;
      }
    }
  }
  
  // Pattern 2: Simple name response (just the name, 1-4 words)
  const words = normalized.split(/\s+/).filter(w => w.length >= 2);
  if (words.length >= 1 && words.length <= 4) {
    // Check if all words look like name parts (start with capital or are common name particles)
    const nameParticles = ['de', 'da', 'do', 'dos', 'das', 'e'];
    const allLooksLikeName = words.every(w => 
      /^[A-ZÀ-Ú]/.test(w) || nameParticles.includes(w.toLowerCase())
    );
    
    if (allLooksLikeName) {
      return normalized;
    }
    
    // Also accept lowercase simple names (e.g., "joão")
    if (words.length <= 2 && /^[a-zà-ú]{2,}/i.test(words[0])) {
      // Capitalize first letter
      return words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    }
  }
  
  return null;
}

// ═══════════════════════════════════════════════════════════════
// ORPHANED STATE DETECTION
// ═══════════════════════════════════════════════════════════════

/**
 * Detect if a conversation is in an "orphaned" state where:
 * - The greeting was sent (found in message history)
 * - But dados_coletados doesn't have greeting_sent or awaiting_nome_response
 * 
 * This can happen if the update failed silently or the conversation was created
 * before the greeting-phase was properly updating the state.
 */
export async function detectOrphanedGreetingState(
  supabase: SupabaseClient,
  conversaId: string,
  dadosColetados: Record<string, unknown>
): Promise<boolean> {
  // If already has the correct state, not orphaned
  if (dadosColetados?.greeting_sent || dadosColetados?.awaiting_nome_response || dadosColetados?.awaiting_clausula_petrea_response) {
    return false;
  }
  
  // Check for greeting message in history
  const { data: greetingMsg } = await supabase
    .from('chatbot_mensagens')
    .select('id, content')
    .eq('conversa_id', conversaId)
    .eq('role', 'assistant')
    .or('content.ilike.%energia por assinatura%,content.ilike.%Você já conhece%')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  
  // If found greeting in history but dados_coletados doesn't reflect it
  const isOrphaned = !!greetingMsg;
  
  if (isOrphaned) {
    console.log(`[POST_GREETING] 🔍 Detected orphaned state for conversa ${conversaId}:`, {
      foundGreetingMsg: !!greetingMsg,
      greetingContent: greetingMsg?.content?.substring(0, 50),
      dadosColetados_greeting_sent: dadosColetados?.greeting_sent,
      dadosColetados_awaiting: dadosColetados?.awaiting_clausula_petrea_response,
    });
  }
  
  return isOrphaned;
}

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface PostGreetingContext {
  supabase: SupabaseClient;
  conversaId: string;
  phone: string;
  clienteNome: string | null;
  messageText: string;
  messageId: string | null;
  dadosColetados: Record<string, unknown>;
  sendWhatsAppMessage: (phone: string, message: string) => Promise<void>;
}

export interface PostGreetingResult {
  handled: boolean;
  response?: Response;
  action?: string;
  transitionedToQualification?: boolean;
  extractedName?: string;
}

// ═══════════════════════════════════════════════════════════════
// DIRECT QUESTION DETECTION
// If client asks a question/requests info, DON'T force funnel - let LLM answer
// ═══════════════════════════════════════════════════════════════

const DIRECT_QUESTION_INDICATORS = [
  '?',
  'quero saber', 'como funciona', 'quanto custa', 'qual plano',
  'explica', 'me fala', 'me conta', 'o que é', 'o que seria',
  'planos', 'desconto', 'golpe', 'fraude', 'cancelar',
  'mudar', 'boleto', 'instalar', 'funciona', 'regulament',
  'aneel', 'não entendi', 'como assim', 'dúvida', 'duvida',
  'qual a diferença', 'qual o valor', 'como faço', 'como faco',
  'é confiável', 'e confiavel', 'é seguro', 'vocês são', 'voces sao',
  'como é o', 'preciso instalar', 'tem taxa', 'tem multa',
  'pode explicar', 'quero entender', 'me explique',
];

/**
 * Check if message is a direct question/info request that should bypass funnel
 */
export function isDirectQuestion(message: string): boolean {
  const lower = message.toLowerCase().trim();
  // Don't consider very short messages (1-2 words) as questions unless they have '?'
  if (lower.length < 10 && !lower.includes('?')) return false;
  return DIRECT_QUESTION_INDICATORS.some(q => lower.includes(q));
}

// ═══════════════════════════════════════════════════════════════
// RESPONSE PATTERNS (kept for backward compatibility with old flow)
// ═══════════════════════════════════════════════════════════════

const AFFIRMATIVE_PATTERNS = [
  /^sim$/i,
  /^s$/i,
  /^ss+$/i,
  /^simmm+$/i,
  /^sim,?\s*(conheço|sei|já)/i,
  /^já$/i,
  /^já\s*(conheço|sei|ouvi)/i,
  /^conheço/i,
  /^sei\s*(sim)?$/i,
  /^claro/i,
  /^com\s*certeza/i,
  /^positivo/i,
  /^uhum/i,
  /^aham/i,
  /^ok$/i,
  /^beleza$/i,
  /^blz$/i,
  /^top$/i,
  /^pode\s*ser$/i,
  /^bora$/i,
];

const NEGATIVE_PATTERNS = [
  /^não$/i,
  /^nao$/i,
  /^n$/i,
  /^nn+$/i,
  /^não,?\s*(conheço|sei)/i,
  /^nao,?\s*(conheço|sei)/i,
  /^nunca\s*(ouvi|vi)/i,
  /^o\s*que\s*(é|seria)/i,
  /^como\s*(funciona|é)/i,
  /^me\s*explica/i,
  /^pode\s*explicar/i,
  /^desconheço/i,
];

// Pattern to detect if message contains potential data (value, distributor, etc.)
const DATA_INDICATORS = [
  /r\$\s*\d+/i,
  /\d{3,}/,  // Numbers 3+ digits (potential value)
  /cemig|cpfl|enel|energisa|coelba|celpe|light|copel|celesc|equatorial|neoenergia/i,
  /@/,  // Email indicator
];

// ═══════════════════════════════════════════════════════════════
// RESPONSE TEMPLATES
// ═══════════════════════════════════════════════════════════════

function getNameConfirmationResponse(extractedName: string): string {
  return `Prazer, ${extractedName}! 😊

Para calcular sua economia, me conta: *qual é o valor médio da sua conta de luz* por mês? 💡`;
}

function getNameNotUnderstoodResponse(): string {
  return `Desculpa, não consegui entender seu nome. 😅

Pode me falar *só seu nome* para eu te chamar direto? Por exemplo: "Maria" ou "João Silva"`;
}

function getAffirmativeResponse(clienteNome: string | null): string {
  const firstName = clienteNome?.split(' ')[0] || '';
  const greeting = firstName ? `Ótimo, ${firstName}! ` : 'Ótimo! ';
  
  return `${greeting}Então vamos direto ao ponto! 🎯

Para calcular sua economia, preciso saber: qual é o *valor médio* da sua conta de luz? 💡`;
}

function getNegativeResponse(clienteNome: string | null): string {
  const firstName = clienteNome?.split(' ')[0] || '';
  const greeting = firstName ? `${firstName}, ` : '';
  
  return `${greeting}deixa eu te explicar rapidinho! 😊

A *energia por assinatura* é simples: você assina um plano de energia solar e recebe *desconto na sua conta de luz* todo mês. Sem precisar instalar nada! ☀️

É como uma assinatura de streaming, só que para economizar na energia. 📱➡️💡

Para calcular sua economia, me conta: qual é o *valor médio* da sua conta de luz?`;
}

function getDataExtractionResponse(clienteNome: string | null): string {
  const firstName = clienteNome?.split(' ')[0] || '';
  const greeting = firstName ? `Legal, ${firstName}! ` : 'Legal! ';
  
  return `${greeting}Vi que você já trouxe algumas informações, obrigada! 📝

Para completar sua simulação, preciso confirmar: qual é o *valor médio* da sua conta de luz? 💡`;
}

// ═══════════════════════════════════════════════════════════════
// PATTERN MATCHING
// ═══════════════════════════════════════════════════════════════

function matchesAffirmative(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return AFFIRMATIVE_PATTERNS.some(pattern => pattern.test(normalized));
}

function matchesNegative(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return NEGATIVE_PATTERNS.some(pattern => pattern.test(normalized));
}

function containsDataIndicators(message: string): boolean {
  return DATA_INDICATORS.some(pattern => pattern.test(message));
}

// ═══════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════

/**
 * Check if we're awaiting a post-greeting response (name or confirmation)
 */
export function isAwaitingPostGreetingResponse(dadosColetados: Record<string, unknown>): boolean {
  return (
    dadosColetados?.greeting_sent === true &&
    (
      dadosColetados?.awaiting_nome_response === true ||
      dadosColetados?.awaiting_clausula_petrea_response === true // backward compat
    )
  );
}

/**
 * Handle the response after greeting
 * FASE 2: Now processes NAME as first expected response
 */
export async function handlePostGreetingResponse(
  ctx: PostGreetingContext
): Promise<PostGreetingResult> {
  const {
    supabase,
    conversaId,
    phone,
    clienteNome,
    messageText,
    messageId,
    dadosColetados,
    sendWhatsAppMessage,
  } = ctx;
  
  // Check if we're in post-greeting state (normal path)
  if (isAwaitingPostGreetingResponse(dadosColetados)) {
    console.log(`[POST_GREETING] Processing response after greeting: "${messageText.substring(0, 50)}..."`);
    return processPostGreetingInternal(ctx, dadosColetados);
  }
  
  // NEW: Check for orphaned greeting state and recover if needed
  const isOrphaned = await detectOrphanedGreetingState(supabase, conversaId, dadosColetados);
  
  if (isOrphaned) {
    console.log(`[POST_GREETING] 🔧 Recovering orphaned greeting state for conversa ${conversaId}`);
    
    // Repair the state
    const repairedDados: Record<string, unknown> = {
      ...dadosColetados,
      greeting_sent: true,
      awaiting_nome_response: true,
      state_repaired_at: new Date().toISOString(),
      state_repair_reason: 'orphaned_greeting_detected',
    };
    
    // Persist the repaired state
    const { error: repairError } = await supabase
      .from('chatbot_conversas')
      .update({ dados_coletados: repairedDados })
      .eq('id', conversaId);
    
    if (repairError) {
      console.error(`[POST_GREETING] ❌ Failed to repair orphaned state:`, repairError);
      return { handled: false };
    }
    
    console.log(`[POST_GREETING] ✅ State repaired, processing as normal post-greeting response`);
    
    // Process with repaired state
    return processPostGreetingInternal(ctx, repairedDados);
  }
  
  return { handled: false };
}

/**
 * Internal function to process the post-greeting response
 * FASE 2: First tries to extract NAME, then falls back to old logic
 */
async function processPostGreetingInternal(
  ctx: PostGreetingContext,
  effectiveDados: Record<string, unknown>
): Promise<PostGreetingResult> {
  const {
    supabase,
    conversaId,
    phone,
    clienteNome,
    messageText,
    messageId,
    sendWhatsAppMessage,
  } = ctx;
  
  let responseMessage: string;
  let responseType: string;
  let extractedName: string | null = null;
  let finalClienteName = clienteNome;
  
  // ═══════════════════════════════════════════════════════════════
  // FASE 2: Try to extract NAME first (new primary flow)
  // ═══════════════════════════════════════════════════════════════
  const isAwaitingName = effectiveDados?.awaiting_nome_response === true;
  
  if (isAwaitingName || !clienteNome) {
    // ═══════════════════════════════════════════════════════════════
    // CRITICAL FIX: Check for DIRECT QUESTION before trying to extract name
    // A real seller would answer "quero saber sobre os planos" before asking for name
    // ═══════════════════════════════════════════════════════════════
    if (isDirectQuestion(messageText)) {
      console.log(`[POST_GREETING] 🔍 DIRECT QUESTION detected, bypassing funnel: "${messageText.substring(0, 60)}..."`);
      
      // Transition to qualification but DON'T intercept - let LLM+RAG answer
      const updatedDados = {
        ...effectiveDados,
        awaiting_nome_response: false,
        awaiting_clausula_petrea_response: false,
        direct_question_bypass: true,
        direct_question_at: new Date().toISOString(),
      };
      
      await supabase
        .from('chatbot_conversas')
        .update({
          dados_coletados: updatedDados,
          fsm_expected_field: 'valor',
        })
        .eq('id', conversaId);
      
      // Return NOT handled - let the message flow to LLM+RAG
      return {
        handled: false,
        action: 'direct_question_bypass',
        transitionedToQualification: false,
      };
    }
    
    // Try to extract name from message
    extractedName = extractNameFromMessage(messageText);
    
    if (extractedName) {
      // SUCCESS: Got the name!
      responseMessage = getNameConfirmationResponse(extractedName);
      responseType = 'name_extracted';
      finalClienteName = extractedName;
      console.log(`[POST_GREETING] ✅ Extracted name: "${extractedName}"`);
      
      // Update lead in CRM with real name
      try {
        await syncToBitrix(
          supabase,
          conversaId,
          phone,
          extractedName,
          {
            ...effectiveDados,
            nome: extractedName,
            lead_provisorio: false, // No longer provisional
            nome_confirmado_at: new Date().toISOString(),
          } as any,
          undefined,
          false
        );
        console.log(`[POST_GREETING] ✅ Updated CRM with real name: ${extractedName}`);
      } catch (err) {
        console.error(`[POST_GREETING] ⚠️ Failed to update CRM with name:`, err);
      }
    } else if (matchesAffirmative(messageText) && clienteNome) {
      // Client confirmed their WhatsApp name
      extractedName = clienteNome;
      responseMessage = getNameConfirmationResponse(clienteNome);
      responseType = 'name_confirmed';
      console.log(`[POST_GREETING] ✅ Client confirmed name: "${clienteNome}"`);
    } else if (containsDataIndicators(messageText)) {
      // Client provided data instead of name - proceed with data collection
      responseMessage = getDataExtractionResponse(clienteNome);
      responseType = 'data_provided_early';
      console.log(`[POST_GREETING] Client provided data early → Continue collection`);
    } else {
      // Couldn't extract name - ask again more clearly
      responseMessage = getNameNotUnderstoodResponse();
      responseType = 'name_not_understood';
      console.log(`[POST_GREETING] ⚠️ Could not extract name from: "${messageText}"`);
      
      // Don't transition yet - keep waiting for name
      await supabase.from('chatbot_mensagens').insert({
        conversa_id: conversaId,
        role: 'user',
        content: messageText,
        message_id: messageId || null,
      });
      
      await sendWhatsAppMessage(phone, responseMessage);
      
      await supabase.from('chatbot_mensagens').insert({
        conversa_id: conversaId,
        role: 'assistant',
        content: responseMessage,
        handler_type: 'post_greeting_handler',
      });
      
      // Keep waiting for name
      await supabase
        .from('chatbot_conversas')
        .update({
          last_sofia_message_at: new Date().toISOString(),
          last_message_at: new Date().toISOString(),
        })
        .eq('id', conversaId);
      
      return {
        handled: true,
        action: responseType,
        transitionedToQualification: false,
        response: new Response(JSON.stringify({
          status: 'post_greeting_name_retry',
          conversaId,
          action: responseType,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }),
      };
    }
  } else {
    // ═══════════════════════════════════════════════════════════════
    // OLD FLOW: Backward compatibility with Cláusula Pétrea responses
    // ═══════════════════════════════════════════════════════════════
    if (matchesAffirmative(messageText)) {
      responseMessage = getAffirmativeResponse(clienteNome);
      responseType = 'affirmative_knows_subscription';
      console.log(`[POST_GREETING] Client knows about subscription energy → Direct to value collection`);
    } else if (matchesNegative(messageText)) {
      responseMessage = getNegativeResponse(clienteNome);
      responseType = 'negative_needs_explanation';
      console.log(`[POST_GREETING] Client doesn't know → Brief explanation + value collection`);
    } else if (containsDataIndicators(messageText)) {
      responseMessage = getDataExtractionResponse(clienteNome);
      responseType = 'data_provided_early';
      console.log(`[POST_GREETING] Client provided data early → Acknowledge + continue collection`);
    } else {
      responseMessage = getAffirmativeResponse(clienteNome);
      responseType = 'ambiguous_assume_interested';
      console.log(`[POST_GREETING] Ambiguous response → Assume interested, proceed to value collection`);
    }
  }
  
  // Save user message
  await supabase.from('chatbot_mensagens').insert({
    conversa_id: conversaId,
    role: 'user',
    content: messageText,
    message_id: messageId || null,
  });
  
  // Send response
  await sendWhatsAppMessage(phone, responseMessage);
  
  // Save assistant message
  await supabase.from('chatbot_mensagens').insert({
    conversa_id: conversaId,
    role: 'assistant',
    content: responseMessage,
    handler_type: 'post_greeting_handler',
  });
  
  // Update conversation state - TRANSITION to QUALIFICAÇÃO
  // Mark triagem as completed, clear awaiting state, set expected field to valor
  const updatedDados = {
    ...effectiveDados,
    awaiting_nome_response: false,
    awaiting_clausula_petrea_response: false,
    triagem_concluida: true,
    is_new_client: true,
    post_greeting_response: responseType,
    post_greeting_responded_at: new Date().toISOString(),
    // Save extracted/confirmed name
    ...(extractedName ? { nome: extractedName, nome_confirmado: true } : {}),
  };
  
  // Also update cliente_nome column if we extracted name
  const updatePayload: Record<string, unknown> = {
    dados_coletados: updatedDados,
    fsm_expected_field: 'valor', // NOW expecting the bill value
    last_sofia_message_at: new Date().toISOString(),
    last_message_at: new Date().toISOString(),
  };
  
  if (extractedName) {
    updatePayload.cliente_nome = extractedName;
  }
  
  await supabase
    .from('chatbot_conversas')
    .update(updatePayload)
    .eq('id', conversaId);
  
  console.log(`[POST_GREETING] ✅ Transitioned to QUALIFICAÇÃO. FSM expected field: valor. Name: ${extractedName || finalClienteName || 'not extracted'}`);
  
  return {
    handled: true,
    action: responseType,
    transitionedToQualification: true,
    extractedName: extractedName || undefined,
    response: new Response(JSON.stringify({
      status: 'post_greeting_handled',
      conversaId,
      action: responseType,
      nextExpectedField: 'valor',
      transitionedToQualification: true,
      extractedName: extractedName || null,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }),
  };
}
