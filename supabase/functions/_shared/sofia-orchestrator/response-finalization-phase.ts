/**
 * RESPONSE FINALIZATION PHASE
 * 
 * Handles AI response processing, guardrails flow, and race condition checks
 * Extracted from sofia-webhook/index.ts lines 2745-2859
 * 
 * @module _shared/sofia-orchestrator/response-finalization-phase
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.90.0';
import { corsHeaders } from '../webhook-types.ts';
import {
  processAIResponse,
  type FullResponseProcessingContext,
  type FullResponseProcessingResult,
} from '../response-processing.ts';
import {
  orchestrateGuardrailsFlow,
  type GuardrailsFlowContext,
  type GuardrailsFlowResult,
} from '../llm-guardrails.ts';
import { getPatternCache } from '../detection-patterns.ts';
import type { FullAgentConfig } from '../ai-gym-config.ts';

// ═══════════════════════════════════════════════════════════════
// STALE EMAIL ASK GUARD (Out-of-order media vs text)
// ═══════════════════════════════════════════════════════════════

function isLikelyAskingForEmail(text: string): boolean {
  const lower = text.toLowerCase();
  // Common PT-BR ways Sofia asks for email
  const hasEmailWord = /\be-?mail\b|\bemail\b/.test(lower);
  if (!hasEmailWord) return false;

  // Strong indicators of a request/ask (avoid matching “enviei no e-mail ...”)
  const askVerbs = /(poderia|pode|consegue|me informa|me informe|me passar|me passa|qual(\s+é)?|preciso do|me diga)/;
  const hasAskVerb = askVerbs.test(lower);

  const cantSeeClaim = /(não consigo visualizar|não consigo ver|não consigo acessar).*(e-?mail|email)/.test(lower);
  return hasAskVerb || cantSeeClaim;
}

function isLikelyAskingForBillValue(text: string): boolean {
  const lower = text.toLowerCase();
  
  // ═══════════════════════════════════════════════════════════════
  // PHASE "CASO EDSON": Aggressive detection of redundant value requests
  // Match: "valor exato", "média de consumo em kWh", "último mês", etc.
  // EXPANDED: "me confirma", "certinho", "costuma pagar", "gasta", "vem na conta"
  // ═══════════════════════════════════════════════════════════════
  const hasValueKeywords =
    /valor\s+m[eé]dio|valor\s+da\s+conta|m[eé]dia\s+da\s+conta|quanto\s+v(o|ô)c[eê]\s+paga|conta\s+de\s+luz.*(r\$|reais)|valor\s+m[eê]nsal|consumo\s+m[eé]dio|valor\s+exato|m[eé]dia\s+de\s+consumo|[uú]ltim[oa]\s+(?:fatura|conta)|kwh|quilowatt|costuma\s+pagar|costuma\s+gastar|vem\s+na\s+conta|certinho|valor\s+certinho|gasta\s+(?:de\s+)?luz|paga\s+(?:de\s+)?energia/.test(lower);
  if (!hasValueKeywords) return false;

  // Ask indicators - EXPANDED: "me confirma", "fala pra mim", "pode confirmar"
  const askVerbs = /(qual(\s+é)?|me diga|me fala|pode|poderia|consegue|me informa|me informe|me passar|me passa|s[oó]\s+falta|preciso do|preciso saber|preciso que|você sabe|sabe me dizer|me confirma|fala\s+pra\s+mim|pode\s+confirmar|confirma\s+pra\s+mim)/;
  const looksLikeQuestion = /\?/.test(text);
  return askVerbs.test(lower) || looksLikeQuestion;
}

function hasValidEmailInState(conversaEmail: unknown, dadosColetados: Record<string, unknown> | null | undefined): boolean {
  const emailFromColumn = typeof conversaEmail === 'string' ? conversaEmail : '';
  const emailFromDados = typeof (dadosColetados as any)?.email === 'string' ? String((dadosColetados as any).email) : '';
  const candidate = (emailFromColumn || emailFromDados).trim();
  return candidate.includes('@') && candidate.includes('.') && candidate.length >= 6;
}

function hasBillValueInState(dadosColetados: Record<string, unknown> | null | undefined): boolean {
  if (!dadosColetados) return false;
  const v = (dadosColetados as any)?.valorFatura ?? 
            (dadosColetados as any)?.valorConta ?? 
            (dadosColetados as any)?.valor_fatura ??
            (dadosColetados as any)?.valorLowerBound ??
            (dadosColetados as any)?.valorTotalEstimado;
  const c = (dadosColetados as any)?.consumo;
  const hasV = typeof v === 'number' ? v > 0 : typeof v === 'string' ? v.trim().length > 0 : false;
  const hasC = typeof c === 'number' ? c > 0 : typeof c === 'string' ? c.trim().length > 0 : false;
  return hasV || hasC;
}

function stripEmailRequestSentences(text: string): string {
  // Split by line breaks first (WhatsApp style), then by sentence-ish punctuation.
  const lines = text.split(/\n+/g);
  const keptLines: string[] = [];

  for (const line of lines) {
    const parts = line.split(/(?<=[.!?])\s+/g);
    const keptParts = parts.filter((p) => !isLikelyAskingForEmail(p));
    const rebuilt = keptParts.join(' ').trim();
    if (rebuilt) keptLines.push(rebuilt);
  }

  return keptLines.join('\n').trim();
}

function stripBillValueRequestSentences(text: string): string {
  const lines = text.split(/\n+/g);
  const keptLines: string[] = [];

  for (const line of lines) {
    const parts = line.split(/(?<=[.!?])\s+/g);
    const keptParts = parts.filter((p) => !isLikelyAskingForBillValue(p));
    const rebuilt = keptParts.join(' ').trim();
    if (rebuilt) keptLines.push(rebuilt);
  }

  return keptLines.join('\n').trim();
}

// ═══════════════════════════════════════════════════════════════
// MESSAGE DEDUPLICATION HELPER
// Prevents parallel webhooks from sending duplicate fallback messages
// ═══════════════════════════════════════════════════════════════

async function isSimilarMessageRecentlySent(
  supabase: SupabaseClient,
  conversaId: string,
  windowMs: number = 30000
): Promise<boolean> {
  try {
    const since = new Date(Date.now() - windowMs).toISOString();
    
    const { data } = await supabase
      .from('chatbot_mensagens')
      .select('content')
      .eq('conversa_id', conversaId)
      .eq('role', 'assistant')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (!data) return false;
    
    // ═══════════════════════════════════════════════════════════════
    // PHASE "CASO NAZARENO": Expanded deduplication patterns
    // Block duplicate greetings, previews, and proposal promises
    // ═══════════════════════════════════════════════════════════════
    for (const msg of data) {
      const content = msg.content || '';
      if (
        content.includes('tenho todos os dados') || 
        content.includes('proposta está sendo gerada') ||
        content.includes('proposta personalizada está sendo gerada') ||
        // NEW: Preview-related patterns
        content.includes('estimativa de economia') ||
        content.includes('aqui vai uma estimativa') ||
        content.includes('Como você está na área') ||
        // NEW: Greeting pattern "Perfeito, {Nome}!"
        /Perfeito,?\s+\w+!/i.test(content)
      ) {
        console.log('[DEDUP] ⚠️ Duplicate pattern detected:', content.substring(0, 50));
        return true;
      }
    }
    
    return false;
  } catch (err) {
    console.warn('[STALE_GUARD] Failed to check for duplicate messages:', err);
    return false;
  }
}

async function applyStaleEmailAskGuard(
  supabase: SupabaseClient,
  conversaId: string,
  cleanMessage: string
): Promise<{ cleanMessage: string; modified: boolean }> {
  try {
    if (!cleanMessage || !isLikelyAskingForEmail(cleanMessage)) {
      return { cleanMessage, modified: false };
    }

    // Re-read latest state (prevents out-of-order media processing replies)
    const { data: fresh } = await supabase
      .from('chatbot_conversas')
      .select('cliente_email, dados_coletados')
      .eq('id', conversaId)
      .single();

    const dadosColetados = (fresh as any)?.dados_coletados as Record<string, unknown> | null | undefined;
    const emailAlreadyKnown = hasValidEmailInState((fresh as any)?.cliente_email, dadosColetados);
    if (!emailAlreadyKnown) {
      return { cleanMessage, modified: false };
    }

    const stripped = stripEmailRequestSentences(cleanMessage);
    if (stripped && stripped !== cleanMessage) {
      console.log('[STALE_GUARD] ✅ Removed redundant email request from message');
      return { cleanMessage: stripped, modified: true };
    }

    // Deterministic fallback to appropriate next step
    const hasValor = !!(dadosColetados as any)?.valorFatura || !!(dadosColetados as any)?.consumo;
    const hasDistribuidora = !!(dadosColetados as any)?.distribuidora || !!(dadosColetados as any)?.distribuidoraInformada;
    const hasNome = !!(dadosColetados as any)?.nome;
    const previewSent = !!(dadosColetados as any)?.economy_preview_sent;

    // ═══════════════════════════════════════════════════════════════
    // FASE 4: Improved fallbacks after email collection
    // ═══════════════════════════════════════════════════════════════
    let fallback: string;
    
    if (!hasNome) {
      fallback = 'Perfeito — já tenho seu e-mail! 📧 Agora me conta: *qual o seu nome* para eu preparar sua proposta?';
    } else if (!hasValor) {
      fallback = 'Perfeito — já tenho seu e-mail aqui! Agora me diga o *valor médio (R$)* da sua conta de luz por mês para eu calcular sua economia. 💡';
    } else if (!hasDistribuidora) {
      fallback = 'Perfeito — já tenho seu e-mail! Agora só me confirme qual é a sua *distribuidora* (ex: CEMIG, Energisa MG) para eu gerar sua proposta. ⚡';
    } else if (previewSent) {
      // All data complete AND preview already sent - check for recent duplicate
      const isDuplicate = await isSimilarMessageRecentlySent(supabase, conversaId);
      if (isDuplicate) {
        console.log('[STALE_GUARD] ⚠️ Duplicate fallback blocked - similar message sent recently');
        return { cleanMessage, modified: false };
      }
      fallback = `Perfeito — tenho todos os dados! 🎉

Sua proposta está sendo gerada agora. Em instantes você receberá o link aqui! 📄✨`;
    } else {
      // All data complete but no preview yet - check for duplicate
      const isDuplicate = await isSimilarMessageRecentlySent(supabase, conversaId);
      if (isDuplicate) {
        console.log('[STALE_GUARD] ⚠️ Duplicate fallback blocked - similar message sent recently');
        return { cleanMessage, modified: false };
      }
      fallback = `Perfeito — já tenho seu e-mail aqui! 🎉

Com base nos seus dados, vou calcular sua economia agora e já te envio uma prévia dos descontos disponíveis! 📊✨`;
    }

    console.log('[STALE_GUARD] ✅ Replaced redundant email request with fallback next-step');
    return { cleanMessage: fallback, modified: true };
  } catch (err) {
    console.warn('[STALE_GUARD] Failed to apply stale email ask guard:', err);
    return { cleanMessage, modified: false };
  }
}

async function applyStaleBillValueAskGuard(
  supabase: SupabaseClient,
  conversaId: string,
  cleanMessage: string
): Promise<{ cleanMessage: string; modified: boolean }> {
  try {
    if (!cleanMessage || !isLikelyAskingForBillValue(cleanMessage)) {
      return { cleanMessage, modified: false };
    }

    const { data: fresh } = await supabase
      .from('chatbot_conversas')
      .select('cliente_email, dados_coletados')
      .eq('id', conversaId)
      .single();

    const dadosColetados = (fresh as any)?.dados_coletados as Record<string, unknown> | null | undefined;
    const valueAlreadyKnown = hasBillValueInState(dadosColetados);
    if (!valueAlreadyKnown) {
      return { cleanMessage, modified: false };
    }

    const stripped = stripBillValueRequestSentences(cleanMessage);
    if (stripped && stripped !== cleanMessage) {
      console.log('[STALE_GUARD] ✅ Removed redundant bill value request from message');
      return { cleanMessage: stripped, modified: true };
    }

    // Deterministic fallback to next missing field
    const hasEmail = hasValidEmailInState((fresh as any)?.cliente_email, dadosColetados);
    const hasDistribuidora = !!(dadosColetados as any)?.distribuidora || !!(dadosColetados as any)?.distribuidoraInformada;
    const hasNome = !!(dadosColetados as any)?.nome;
    const previewSent = !!(dadosColetados as any)?.economy_preview_sent;

    // ═══════════════════════════════════════════════════════════════
    // FASE 4: Improved fallbacks after bill value collection
    // ═══════════════════════════════════════════════════════════════
    let fallback: string;
    
    if (!hasNome) {
      fallback = 'Perfeito — já tenho o valor médio da sua conta! 📊 Agora me conta: *qual o seu nome*?';
    } else if (!hasEmail) {
      fallback = 'Perfeito — já tenho o valor médio da sua conta aqui! Agora me informe seu *e-mail* para eu te enviar a proposta detalhada. 📧';
    } else if (!hasDistribuidora) {
      fallback = 'Perfeito — já tenho o valor médio da sua conta! Agora só me confirme qual é a sua *distribuidora* (ex: CEMIG, Energisa MG) para eu gerar sua proposta. ⚡';
    } else if (previewSent) {
      // All data complete AND preview already sent - check for duplicate
      const isDuplicate = await isSimilarMessageRecentlySent(supabase, conversaId);
      if (isDuplicate) {
        console.log('[STALE_GUARD] ⚠️ Duplicate fallback blocked - similar message sent recently');
        return { cleanMessage, modified: false };
      }
      fallback = `Perfeito — tenho todos os dados! 🎉

Sua proposta personalizada está sendo gerada. Aguarde o link! 📄✨`;
    } else {
      // All data complete but no preview yet - check for duplicate
      const isDuplicate = await isSimilarMessageRecentlySent(supabase, conversaId);
      if (isDuplicate) {
        console.log('[STALE_GUARD] ⚠️ Duplicate fallback blocked - similar message sent recently');
        return { cleanMessage, modified: false };
      }
      fallback = `Perfeito — já tenho o valor médio da sua conta aqui! 🎉

Vou calcular sua economia agora e já te envio uma prévia dos descontos! 📊✨`;
    }

    console.log('[STALE_GUARD] ✅ Replaced redundant bill value request with fallback next-step');
    return { cleanMessage: fallback, modified: true };
  } catch (err) {
    console.warn('[STALE_GUARD] Failed to apply bill value stale guard:', err);
    return { cleanMessage, modified: false };
  }
}

// ═══════════════════════════════════════════════════════════════
// RETROACTIVE VALOR FATURA PERSISTENCE
// Prevents the 📊 emoji bug: if Sofia's response mentions a bill value
// but dados_coletados doesn't have it, persist it retroactively
// ═══════════════════════════════════════════════════════════════

async function retroactivePersistValorFatura(
  supabase: SupabaseClient,
  conversaId: string,
  cleanMessage: string
): Promise<void> {
  try {
    // Check if response mentions a monetary value in context of "conta" or "economia"
    const valueInResponse = cleanMessage.match(
      /(?:R\$\s*|conta\s+de\s+R?\$?\s*)(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+)/i
    );
    if (!valueInResponse) return;

    // Read current dados_coletados
    const { data: fresh } = await supabase
      .from('chatbot_conversas')
      .select('dados_coletados')
      .eq('id', conversaId)
      .single();

    const dados = (fresh?.dados_coletados || {}) as Record<string, unknown>;
    
    // If valorFatura already exists, skip
    if (dados.valorFatura || dados.consumo) return;

    // Parse the value from the response
    const rawValue = valueInResponse[1].replace(/\./g, '').replace(',', '.');
    const numericValue = parseFloat(rawValue);
    
    if (isNaN(numericValue) || numericValue < 50 || numericValue > 50000) return;

    console.log(`[RETROACTIVE_PERSIST] 🔧 Sofia mentioned R$ ${numericValue} in response but dados_coletados has no valorFatura — persisting retroactively`);
    
    const updatedDados = { ...dados, valorFatura: numericValue };
    await supabase
      .from('chatbot_conversas')
      .update({ dados_coletados: updatedDados })
      .eq('id', conversaId);
    
    console.log(`[RETROACTIVE_PERSIST] ✅ valorFatura=${numericValue} persisted retroactively`);
  } catch (err) {
    console.warn(`[RETROACTIVE_PERSIST] Failed:`, err);
  }
}

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface ResponseFinalizationContext {
  supabase: SupabaseClient;
  conversaId: string;
  phone: string;
  clienteNome?: string | null;
  messageText: string;
  assistantMessage: string;
  agentConfig?: FullAgentConfig | null;
  conversa?: ResponseFinalizationConversaData | null;
  existingDados: Record<string, unknown>;
  extractedData: Record<string, unknown>;
  proposalUrl?: string | null;
  sendWhatsAppMessage: (phone: string, message: string) => Promise<void>;
}

export interface ResponseFinalizationResult {
  handled: boolean;
  response?: Response;
  cleanMessage: string;
  aiFailedCompletely: boolean;
  needsHumanEscalation: boolean;
  masterOfferDetected: boolean;
  updatedExtractedData?: Record<string, unknown>;
  guardrailsApplied: boolean;
  raceConditionBlocked: boolean;
}

export interface ResponseFinalizationConversaData {
  id: string;
  total_messages?: number;
  event_proposal_sent?: boolean;
  proposta_link_sent_at?: string | null;
  dados_coletados?: Record<string, unknown> | null;
}

// ═══════════════════════════════════════════════════════════════
// AI RESPONSE PROCESSING
// ═══════════════════════════════════════════════════════════════

/**
 * Process AI response with context and error handling
 */
export async function processAIResponseWithContext(
  ctx: ResponseFinalizationContext
): Promise<{
  result: FullResponseProcessingResult;
  earlyReturn?: Response;
}> {
  const {
    supabase,
    conversaId,
    phone,
    clienteNome,
    messageText,
    assistantMessage,
    agentConfig,
    existingDados,
    extractedData,
    proposalUrl,
    sendWhatsAppMessage,
  } = ctx;
  
  const responseProcessingCtx: FullResponseProcessingContext = {
    supabase,
    conversaId,
    phone,
    clienteNome: clienteNome || null,
    messageText,
    assistantMessage,
    existingDados,
    extractedData,
    agentName: agentConfig?.name || 'sofIA',
    proposalUrl: typeof proposalUrl === 'string' ? proposalUrl : null,
    sendWhatsAppMessage,
  };
  
  const responseResult = await processAIResponse(responseProcessingCtx);
  
  // Handle AI failure with contextual fallback
  if (responseResult.aiFailedCompletely && responseResult.messageSentDirectly) {
    console.log(`[RESPONSE_FINALIZATION] ✅ AI failure handled - contextual fallback sent, Sofia continues operating`);
    
    // Save the contextual fallback in chat history
    await supabase.from('chatbot_mensagens').insert({
      conversa_id: conversaId,
      role: 'assistant',
      content: responseResult.cleanMessage,
    });
    
    // Update conversation timestamps (Sofia continues operating - NOT pausing)
    await supabase
      .from('chatbot_conversas')
      .update({
        last_sofia_message_at: new Date().toISOString(),
        total_messages: (ctx.conversa?.total_messages || 0) + 2,
      })
      .eq('id', conversaId);
    
    return {
      result: responseResult,
      earlyReturn: new Response(JSON.stringify({
        status: 'ai_failure_fallback_sent',
        conversaId,
        fallbackSent: true,
        continuedOperating: true,
        fallbackType: 'contextual_education',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }),
    };
  }
  
  return { result: responseResult };
}

// ═══════════════════════════════════════════════════════════════
// GUARDRAILS FLOW
// ═══════════════════════════════════════════════════════════════

/**
 * Apply LLM guardrails to clean message
 */
export async function applyGuardrailsFlow(
  supabase: SupabaseClient,
  conversaId: string,
  cleanMessage: string,
  clienteNome: string | null,
  extractedData: Record<string, unknown>,
  agentName: string,
  conversa?: ResponseFinalizationConversaData | null
): Promise<{ cleanMessage: string; modified: boolean }> {
  const guardrailsFlowCtx: GuardrailsFlowContext = {
    supabase,
    conversaId,
    conversa,
    cleanMessage,
    clienteNome,
    extractedData,
    agentName,
    patterns: getPatternCache()?.patterns,
  };
  
  const guardrailsResult = await orchestrateGuardrailsFlow(guardrailsFlowCtx);
  
  return {
    cleanMessage: guardrailsResult.cleanMessage,
    modified: guardrailsResult.cleanMessage !== cleanMessage,
  };
}

// ═══════════════════════════════════════════════════════════════
// RACE CONDITION CHECK
// ═══════════════════════════════════════════════════════════════

/**
 * Final race condition check for proposal sent during LLM processing
 */
export async function checkRaceCondition(
  supabase: SupabaseClient,
  conversaId: string,
  cleanMessage: string
): Promise<{ blocked: boolean; response?: Response }> {
  const { data: finalRaceCheck } = await supabase
    .from('chatbot_conversas')
    .select('event_proposal_sent, proposta_link_sent_at')
    .eq('id', conversaId)
    .single();
  
  if (finalRaceCheck?.event_proposal_sent === true || finalRaceCheck?.proposta_link_sent_at) {
    // Check if the cleanMessage is empty or blocked
    if (!cleanMessage || cleanMessage.trim() === '') {
      console.log('[RACE_CONDITION] ⚠️ Proposal sent DURING processing + empty message - skipping send');
      
      return {
        blocked: true,
        response: new Response(JSON.stringify({
          status: 'blocked_by_race_condition',
          reason: 'Proposal was sent during LLM processing - message was blocked',
          conversaId,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }),
      };
    }
    
    console.log('[RACE_CONDITION] ℹ️ Proposal sent during processing, but message passed guardrails - allowing');
  }
  
  return { blocked: false };
}

// ═══════════════════════════════════════════════════════════════
// PROPOSAL URL EXTRACTION
// ═══════════════════════════════════════════════════════════════

/**
 * Extract proposal URL from multiple possible sources
 */
export function extractProposalUrl(
  extractedData: Record<string, unknown>,
  existingDados: Record<string, unknown>
): string | null {
  return (
    (extractedData as any)?.proposal_url ||
    (extractedData as any)?.public_proposal_url ||
    (extractedData as any)?.proposta_url ||
    (existingDados as any)?.proposal_url ||
    (existingDados as any)?.public_proposal_url ||
    (existingDados as any)?.proposta_url || 
    null
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN EXECUTION FUNCTION
// ═══════════════════════════════════════════════════════════════

/**
 * Execute response finalization phase
 * Processes AI response, applies guardrails, checks race conditions
 */
export async function executeResponseFinalizationPhase(
  ctx: ResponseFinalizationContext
): Promise<ResponseFinalizationResult> {
  const {
    supabase,
    conversaId,
    clienteNome,
    agentConfig,
    conversa,
    extractedData,
  } = ctx;
  
  // Step 1: Process AI response
  const { result: responseResult, earlyReturn } = await processAIResponseWithContext(ctx);
  
  if (earlyReturn) {
    return {
      handled: true,
      response: earlyReturn,
      cleanMessage: responseResult.cleanMessage,
      aiFailedCompletely: true,
      needsHumanEscalation: false,
      masterOfferDetected: false,
      guardrailsApplied: false,
      raceConditionBlocked: false,
    };
  }
  
  let cleanMessage = responseResult.cleanMessage;
  
  // Step 2: Update extractedData if master offer was detected
  let updatedExtractedData: Record<string, unknown> | undefined;
  if (responseResult.masterOfferDetected) {
    updatedExtractedData = { ...extractedData, ...responseResult.updatedExtractedData };
  }
  
  // Step 3: Apply guardrails
  const guardrailsResult = await applyGuardrailsFlow(
    supabase,
    conversaId,
    cleanMessage,
    clienteNome || null,
    updatedExtractedData || extractedData,
    agentConfig?.name || 'sofIA',
    conversa
  );
  cleanMessage = guardrailsResult.cleanMessage;

  // Step 3.5: Guard against stale/out-of-order responses asking for email after it was already collected
  const staleEmailGuard = await applyStaleEmailAskGuard(supabase, conversaId, cleanMessage);
  cleanMessage = staleEmailGuard.cleanMessage;

  // Step 3.6: Guard against stale/out-of-order responses asking for bill value after it was already collected
  const staleBillValueGuard = await applyStaleBillValueAskGuard(supabase, conversaId, cleanMessage);
  cleanMessage = staleBillValueGuard.cleanMessage;

  // Step 3.7: RETROACTIVE valorFatura persistence
  // If Sofia's response mentions "R$ X de conta" but dados_coletados has no valorFatura,
  // extract and persist it retroactively to prevent the 📊 emoji bug
  await retroactivePersistValorFatura(supabase, conversaId, cleanMessage);
  
  // Step 4: Final race condition check
  const raceCheck = await checkRaceCondition(supabase, conversaId, cleanMessage);
  
  if (raceCheck.blocked) {
    return {
      handled: true,
      response: raceCheck.response,
      cleanMessage,
      aiFailedCompletely: false,
      needsHumanEscalation: responseResult.needsHumanEscalation,
      masterOfferDetected: responseResult.masterOfferDetected,
      updatedExtractedData,
      guardrailsApplied: guardrailsResult.modified,
      raceConditionBlocked: true,
    };
  }
  
  // All checks passed - continue with response phase
  return {
    handled: false,
    cleanMessage,
    aiFailedCompletely: responseResult.aiFailedCompletely,
    needsHumanEscalation: responseResult.needsHumanEscalation,
    masterOfferDetected: responseResult.masterOfferDetected,
    updatedExtractedData,
    guardrailsApplied: guardrailsResult.modified || staleEmailGuard.modified || staleBillValueGuard.modified,
    raceConditionBlocked: false,
  };
}
