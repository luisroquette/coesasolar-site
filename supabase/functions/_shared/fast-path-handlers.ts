/**
 * Fast-Path Handlers Module
 * Centralizes detection and handling of quick-response scenarios
 * Extracted from sofia-webhook/index.ts (Phase 36 refactoring)
 * 
 * Handles:
 * - CRM Stage-based fast-paths (NEW)
 * - Billing Education questions (CIP, disponibilidade, etc.)
 * - Economy Simulation requests
 * - Document Complaint fallback
 * 
 * Phase 92: Added humanized message sending with typing indicator
 * Phase 94: PASSIVE-FIRST integration - Rule Memory checks before fast-paths
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ExtractedClientData } from './data-extraction.ts';
import { 
  detectBillingEducationQuestion, 
  generateBillingEducationResponse,
  detectPaymentClarification,
} from './billing-education.ts';
import { 
  isSimulationRequest, 
  extractSimulationInputs, 
  simularEconomia 
} from './economy-simulator.ts';
import { 
  handleDocumentComplaintFallback 
} from './document-recovery.ts';
import { 
  detectDocumentComplaint 
} from './technical-issues.ts';
import {
  getBitrixLead,
  findLeadByPhone,
} from './bitrix-client.ts';
import { CRMLeadContext } from './crm-precheck.ts';
import { 
  loadLatencyConfig, 
  applyFullHumanization,
  calculateHumanizedLatency,
  sleep,
  type LatencyConfig 
} from './humanized-latency.ts';
import { sendTypingIndicatorWithAgent } from './zapi-client.ts';

// PASSIVE-FIRST: Rule Memory integration
import { 
  getCriticalRules,
  buildInlineRuleSummary,
  type RuleMemoryEntry,
  type RuleMemoryContext,
} from './rule-memory-injector.ts';

// ═══════════════════════════════════════════════════════════════
// FEATURE FLAGS - Passive Context for Fast-Paths
// ═══════════════════════════════════════════════════════════════

const ENABLE_RULE_MEMORY_CHECK = true;  // Check rules before fast-path responses
const RULE_MEMORY_CACHE_TTL_MS = 60000; // 1 minute cache for rules

// ═══════════════════════════════════════════════════════════════
// RULE MEMORY CACHE (for fast-path efficiency)
// ═══════════════════════════════════════════════════════════════

interface CachedRules {
  rules: RuleMemoryEntry[];
  timestamp: number;
}

const fastPathRulesCache = new Map<string, CachedRules>();

/**
 * Get critical rules for fast-path validation
 * Uses short-lived cache to avoid DB hits on every message
 */
async function getFastPathRules(
  supabase: SupabaseClient,
  agentId: string
): Promise<RuleMemoryEntry[]> {
  const cacheKey = agentId;
  const now = Date.now();
  const cached = fastPathRulesCache.get(cacheKey);
  
  if (cached && (now - cached.timestamp) < RULE_MEMORY_CACHE_TTL_MS) {
    return cached.rules;
  }
  
  const rules = await getCriticalRules(supabase, agentId);
  fastPathRulesCache.set(cacheKey, { rules, timestamp: now });
  
  console.log(`[FAST_PATH_RULES] Loaded ${rules.length} critical rules for ${agentId}`);
  return rules;
}

/**
 * Check if any rule blocks the current fast-path action
 */
function checkRuleBlocksFastPath(
  rules: RuleMemoryEntry[],
  fastPathType: string,
  context: RuleMemoryContext
): { blocked: boolean; blockingRule: RuleMemoryEntry | null; reason: string | null } {
  for (const rule of rules) {
    // Check if rule applies to this fast-path type
    const conditions = rule.conditions as Record<string, unknown> | null;
    
    if (conditions?.blockedFastPaths) {
      const blockedTypes = conditions.blockedFastPaths as string[];
      if (blockedTypes.includes(fastPathType)) {
        return {
          blocked: true,
          blockingRule: rule,
          reason: `Rule "${rule.name}" blocks fast-path "${fastPathType}"`,
        };
      }
    }
    
    // Check funnel stage restrictions
    if (conditions?.funnelStages && context.funnelStage) {
      const allowedStages = conditions.funnelStages as string[];
      if (!allowedStages.includes(context.funnelStage)) {
        // Rule doesn't apply to this stage, skip
        continue;
      }
    }
    
    // Check value restrictions (e.g., minimum value rules)
    if (conditions?.minValorFatura && context.valorFatura) {
      const minValue = conditions.minValorFatura as number;
      if (context.valorFatura < minValue) {
        return {
          blocked: true,
          blockingRule: rule,
          reason: `Valor ${context.valorFatura} abaixo do mínimo ${minValue}`,
        };
      }
    }
  }
  
  return { blocked: false, blockingRule: null, reason: null };
}

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface FastPathContext {
  supabase: SupabaseClient;
  conversaId: string;
  phone: string;
  clienteNome: string | null;
  messageText: string;
  existingDados: ExtractedClientData;
  extractedData: ExtractedClientData;
  conversa: any;
  totalMessages: number;
  sendMessage: (phone: string, message: string) => Promise<void>;
  isAnalyzedImage: boolean;
  isAnalyzedDocument: boolean;
  isTranscribedAudio: boolean;
  crmContext?: CRMLeadContext; // NEW: CRM pre-check context
  agentConfig?: any; // Phase 92: Agent config for typing indicator
  latencyConfig?: LatencyConfig; // Phase 92: Pre-loaded latency config
  agentId?: string; // Phase 94: Agent ID for rule memory
  funnelStage?: string; // Phase 94: Current funnel stage for rule context
}

export interface FastPathResult {
  handled: boolean;
  status?: string;
  response?: Record<string, unknown>;
  ruleMemoryApplied?: boolean; // Phase 94: Indicates if rules were checked
}

// ═══════════════════════════════════════════════════════════════
// PHASE 92: HUMANIZED MESSAGE SENDING FOR FAST-PATHS
// Applies typing indicator + latency before sending fast-path responses
// ═══════════════════════════════════════════════════════════════

/**
 * Send a message with humanized behavior (typing indicator + delay)
 * This should be used by all fast-path handlers for consistent UX
 */
async function sendHumanizedMessage(
  ctx: FastPathContext,
  message: string
): Promise<void> {
  const startTime = Date.now();
  
  try {
    // Apply humanization if agent config is available
    if (ctx.agentConfig || ctx.latencyConfig) {
      const config = ctx.latencyConfig || await loadLatencyConfig(ctx.supabase);
      
      if (config.typingIndicatorEnabled) {
        // Send typing indicator
        if (ctx.agentConfig) {
          try {
            await sendTypingIndicatorWithAgent(ctx.phone, ctx.agentConfig);
            console.log(`[FAST_PATH_HUMANIZE] Typing indicator sent for ${ctx.phone}`);
          } catch (typingErr) {
            console.warn('[FAST_PATH_HUMANIZE] Typing indicator failed:', typingErr);
          }
        }
        
        // Calculate and apply delay
        const latencyCalc = calculateHumanizedLatency(message, config);
        await sleep(latencyCalc.totalDelayMs);
        
        console.log(`[FAST_PATH_HUMANIZE] Applied ${latencyCalc.totalDelayMs}ms delay (${latencyCalc.category})`);
      }
    }
    
    // Send the actual message
    await ctx.sendMessage(ctx.phone, message);
    
    const totalTime = Date.now() - startTime;
    console.log(`[FAST_PATH_HUMANIZE] Message sent with humanization in ${totalTime}ms`);
  } catch (err) {
    console.error('[FAST_PATH_HUMANIZE] Error during humanized send:', err);
    // Fall back to direct send
    await ctx.sendMessage(ctx.phone, message);
  }
}

// ═══════════════════════════════════════════════════════════════
// EMOTIONAL TONE DETECTION (Shared across fast-paths)
// Detects frustration/anger/distrust for empathetic responses
// ═══════════════════════════════════════════════════════════════

const NEGATIVE_TONE_PATTERNS = [
  /irritad/i, /absurd/i, /rid[ií]cul/i, /cansad/i,
  /de\s*novo/i, /j[aá]\s*falei/i, /j[aá]\s*mandei/i,
  /cad[eê]/i, /demora/i, /nunca/i, /ningu[eé]m/i,
  /mentira/i, /engana[çc][aã]o/i, /golpe/i,
  /problema/i, /reclam/i, /insatisf/i,
];

const COST_DISTRUST_PATTERNS = [
  ...NEGATIVE_TONE_PATTERNS,
  /escondid/i, /pegadinha/i, /letra\s*mi[uú]da/i,
  /surpresa/i, /depois\s*cobram/i,
];

const CANCELLATION_INTENT_PATTERNS = [
  /quero\s*cancelar/i, /quero\s*sair/i, /arrependid/i,
  /n[aã]o\s*quero\s*mais/i, /como\s*cancel[oa]/i,
];

/**
 * Detect negative emotional tone in a message
 * Returns true if frustration, anger, or distrust patterns are found
 */
function detectNegativeTone(message: string, extraPatterns?: RegExp[]): boolean {
  const patterns = extraPatterns || NEGATIVE_TONE_PATTERNS;
  const normalized = message.toLowerCase();
  return patterns.some(p => p.test(normalized));
}

/**
 * Get first name for empathetic greeting
 */
function getFirstNameOrEmpty(clienteNome: string | null): string {
  return clienteNome?.split(' ')[0] || '';
}

// ═══════════════════════════════════════════════════════════════
// COST/FEE QUESTION FAST-PATH (Zero Cost Response)
// Handles: "Tem custo?", "Esse valor tem algum custo?", "Tem taxa?"
// ═══════════════════════════════════════════════════════════════

/**
 * Detect questions about costs/fees/taxes for joining
 */
const COST_QUESTION_PATTERNS = [
  // Patterns diretos e curtos (RELAXADOS)
  /\bcusto\b/i,                              // qualquer menção a "custo"
  /\btaxa\b/i,                               // qualquer menção a "taxa"
  /\bcobra[mnr]?\b/i,                        // "cobra", "cobram", "cobrar"
  /\bpag[ao]r?\b.*\b(algo|alguma|pra|para|entrar|aderir)\b/i, // "pago algo", "pagar pra entrar"
  /\bgratu[ií]t[ao]?\b/i,                    // "gratuito", "gratuita", "grátis"
  /\bgr[aá]tis\b/i,                          // "grátis"
  /\bde\s*gra[cç]a\b/i,                      // "de graça"
  /\bmensalidade\b/i,                        // qualquer menção a "mensalidade"
  /\bades[aã]o\b/i,                          // "adesão" (custo de adesão comum)
  /\bvalor\b.*\b(entrar|aderir|assinar|participar)\b/i, // "valor pra entrar"
  /\b(entrar|aderir|assinar)\b.*\b(custo|pagar|valor)\b/i, // "pra aderir pago?"
  
  // Patterns com perguntas (originais + novos)
  /tem\s+algum\s+custo\??/i,
  /tem\s+custo\??/i,
  /tem\s+taxa\??/i,
  /tem\s+alguma\s+taxa\??/i,
  /qual\s+(?:o|é\s+o)\s+custo\??/i,
  /custa\s+alguma\s+coisa\??/i,
  /quanto\s+custa\??/i,
  /quanto\s+(?:que\s+)?é\s+(?:o|a)\s+taxa\??/i,
  /(?:esse|este|o)\s+valor\s+tem\s+(?:algum\s+)?custo\??/i,
  /(?:esse|este|o)\s+desconto\s+tem\s+(?:algum\s+)?custo\??/i,
  /(?:existe|há|tem)\s+(?:algum)?\s*(?:custo|taxa)\s+(?:de\s+)?ades[aã]o\??/i,
  /(?:tem\s+)?custo\s+(?:de\s+)?ades[aã]o\??/i,
  /(?:tem\s+)?taxa\s+(?:de\s+)?(?:ades[aã]o|inscri[cç][aã]o)\??/i,
  /preciso\s+pagar\s+(?:alguma\s+coisa|algo)\??/i,
  /pago\s+(?:alguma\s+coisa|algo)\s+(?:pra|para)\s+(?:entrar|aderir|assinar)\??/i,
  /tem\s+(?:alguma\s+)?mensalidade\??/i,
  /cobra\s+(?:alguma\s+coisa|taxa|mensalidade)\??/i,
  
  // Novos patterns relaxados (perguntas informais)
  /preciso\s+pagar/i,                        // "preciso pagar?"
  /vou\s+pagar/i,                            // "vou pagar algo?"
  /tenho\s+que\s+pagar/i,                    // "tenho que pagar?"
  /pago\s+(?:quanto|algo|alguma)/i,          // "pago quanto?", "pago algo?"
  /(?:é|e)\s+pago\b/i,                       // "é pago?" 
  /(?:quanto|qual)\s+(?:é|e)?\s*(?:o\s+)?(?:valor|custo)/i, // "quanto é o valor?"
  /(?:tem|existe)\s+(?:algum\s+)?(?:valor|custo|taxa)/i, // "existe algum valor?"
  /(?:qual|quanto)\s+(?:o\s+)?investimento/i, // "qual o investimento?"
  /investimento\s+(?:inicial|pra\s+entrar)/i, // "investimento inicial?"
  /entrada\??\s*$/i,                         // "entrada?"
  /tem\s+entrada/i,                          // "tem entrada?"
  /valor\s+(?:de\s+)?entrada/i,              // "valor de entrada?"
  /(?:é|e)\s+(?:de\s+)?gra[cç]a/i,           // "é de graça?"
  /zero\s+(?:custo|taxa)/i,                  // "zero custo?"
  /sem\s+(?:custo|taxa)/i,                   // "sem custo?"
  /n[aã]o\s+(?:pago|tem)\s+(?:nada|custo)/i, // "não pago nada?"
];

function detectCostQuestion(message: string): boolean {
  const normalized = message.toLowerCase().trim();
  return COST_QUESTION_PATTERNS.some(p => p.test(normalized));
}

/**
 * Generate zero-cost response for adhesion
 * ENHANCED: Shows specific discount when proposal exists
 */
function generateZeroCostResponse(
  clienteNome: string | null,
  descontoPercentual?: number | null
): string {
  const firstName = clienteNome?.split(' ')[0] || '';
  const greeting = firstName ? `${firstName}, ` : '';
  
  const discountText = descontoPercentual && descontoPercentual > 0
    ? `*${descontoPercentual}%*`
    : `*até 30%*`;
  
  return `${greeting}não tem nenhum custo de adesão, taxa de inscrição ou mensalidade extra.

O que você paga hoje pra concessionária, passa a pagar pra COESA com ${discountText} de desconto.

Alguma dúvida?`;
}

/**
 * Handle cost/fee questions with deterministic zero-cost response
 * This PRECEDES all other handlers for maximum priority
 * ENHANCED: Now checks for proposal discount to show specific percentage
 */
export async function handleCostQuestionFastPath(
  ctx: FastPathContext
): Promise<FastPathResult> {
  // Skip for media messages
  if (ctx.isAnalyzedImage || ctx.isAnalyzedDocument || ctx.isTranscribedAudio) {
    return { handled: false };
  }
  
  if (!detectCostQuestion(ctx.messageText)) {
    return { handled: false };
  }
  
  console.log(`[COST_FAST_PATH] Detected cost question: "${ctx.messageText.substring(0, 80)}..."`);
  
  // ═══════════════════════════════════════════════════════════════
  // CHECK FOR EXISTING PROPOSAL WITH SPECIFIC DISCOUNT
  // ═══════════════════════════════════════════════════════════════
  let descontoPercentual: number | null = null;
  
  const propostaId = ctx.conversa?.proposta_id;
  if (propostaId) {
    const { data: proposta } = await ctx.supabase
      .from('propostas_assinantes')
      .select('desconto_percentual')
      .eq('id', propostaId)
      .single();
    
    if (proposta?.desconto_percentual) {
      descontoPercentual = Number(proposta.desconto_percentual);
      console.log(`[COST_FAST_PATH] Using specific discount from proposal: ${descontoPercentual}%`);
    }
  }
  
  // ═══════════════════════════════════════════════════════════════
  // EMOTIONAL TONE DETECTION — desconfiança sobre custos ocultos
  // ═══════════════════════════════════════════════════════════════
  const isDistrust = detectNegativeTone(ctx.messageText, COST_DISTRUST_PATTERNS);
  const firstName = getFirstNameOrEmpty(ctx.clienteNome);
  let costResponse: string;
  let status = 'cost_question_handled';

  if (isDistrust) {
    console.log(`[FAST_PATH_EMPATHETIC] Cost distrust detected: "${ctx.messageText.substring(0, 80)}..."`);
    costResponse = `${firstName ? firstName + ', ' : ''}entendo a preocupação. Vou ser 100% transparente:

Não tem taxa de adesão, não tem custo de instalação (não instalamos nada), e não tem surpresa na conta.

O único compromisso é a fidelidade do plano escolhido (12 ou 24 meses). Se cancelar antes, tem multa proporcional — igual academia.

Quer que eu te mostre a simulação pra você ver exatamente os valores?`;
    status = 'cost_distrust_handled';
  } else {
    costResponse = generateZeroCostResponse(ctx.clienteNome, descontoPercentual);
  }

  // Send response with humanization (typing indicator + delay)
  await sendHumanizedMessage(ctx, costResponse);
  
  // Save bot message
  await ctx.supabase.from('chatbot_mensagens').insert({
    conversa_id: ctx.conversaId,
    role: 'assistant',
    content: costResponse,
  });
  
  // Update conversation metrics
  await ctx.supabase
    .from('chatbot_conversas')
    .update({
      last_sofia_message_at: new Date().toISOString(),
      total_messages: (ctx.totalMessages || 0) + 2,
    })
    .eq('id', ctx.conversaId);
  
  console.log(`[FAST_PATH_EMPATHETIC] ✅ Sent ${isDistrust ? 'distrust-empathetic' : 'standard'} cost response`);
  
  return {
    handled: true,
    status,
    response: {
      conversaId: ctx.conversaId,
      hasSpecificDiscount: !!descontoPercentual,
      emotionalPath: isDistrust ? 'distrust' : 'neutral',
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// PROPOSAL ALREADY SENT FAST-PATH (ANTI RACE CONDITION)
// Uses ATOMIC DATABASE LOCK to prevent race condition between
// bitrix24-link-webhook and sofia-webhook processing emails
// ═══════════════════════════════════════════════════════════════

/**
 * Detect if user message is an email
 */
function isEmailMessage(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  // Simple email pattern - just the email alone or with minimal text
  const isJustEmail = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(normalized);
  const isEmailWithContext = /^(?:meu\s+e?-?mail\s+[eé]\s*)?[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(normalized);
  return isJustEmail || isEmailWithContext;
}

/**
 * Handle case where proposal was ALREADY sent (prevent race condition)
 * Uses ATOMIC DATABASE FUNCTION with FOR UPDATE lock to guarantee consistency
 * This runs BEFORE LLM to prevent "estou preparando" messages
 */
export async function handleProposalAlreadySentFastPath(
  ctx: FastPathContext
): Promise<FastPathResult> {
  // Skip for media messages
  if (ctx.isAnalyzedImage || ctx.isAnalyzedDocument || ctx.isTranscribedAudio) {
    console.log(`[RACE_CHECK] ⏭️ Skipping atomic check for media message (conversaId=${ctx.conversaId})`);
    return { handled: false };
  }
  
  // Check if message type warrants atomic check
  const messageIsEmail = isEmailMessage(ctx.messageText);
  const messageIsThanks = /^(ok|sim|obrigad[ao]|perfeito|legal|beleza|valeu|show|ot[ií]mo)/i.test(ctx.messageText.trim());
  const messageIsConfirmation = /^(sim|ok|pode|manda|quero|beleza|bora|vamos)/i.test(ctx.messageText.trim());
  
  const messageType = messageIsEmail ? 'EMAIL' : messageIsThanks ? 'THANKS' : messageIsConfirmation ? 'CONFIRMATION' : 'OTHER';
  
  // Only run atomic check for specific message types
  if (!messageIsEmail && !messageIsThanks && !messageIsConfirmation) {
    console.log(`[RACE_CHECK] ⏭️ Skipping atomic check for message type: ${messageType} (text: "${ctx.messageText.substring(0, 40)}...")`);
    return { handled: false };
  }
  
  // ═══════════════════════════════════════════════════════════════
  // ATOMIC STATE CHECK WITH DATABASE LOCK
  // Uses claim_email_processing_if_no_proposal() with FOR UPDATE
  // This guarantees we see the LATEST state, not a stale cache
  // ═══════════════════════════════════════════════════════════════
  
  const raceCheckStart = Date.now();
  console.log(`[RACE_CHECK] 🔒 STARTING atomic lock check | conversaId=${ctx.conversaId} | phone=${ctx.phone} | messageType=${messageType}`);
  
  const { data: atomicResult, error: atomicError } = await ctx.supabase
    .rpc('claim_email_processing_if_no_proposal', {
      p_conversa_id: ctx.conversaId,
      p_message_id: `fast_path_${Date.now()}`
    });
  
  const rpcDuration = Date.now() - raceCheckStart;
  
  if (atomicError) {
    console.error(`[RACE_CHECK] ❌ RPC FAILED after ${rpcDuration}ms | conversaId=${ctx.conversaId} | error:`, atomicError);
    // Fall back to simple read on error
    const { data: freshConversa } = await ctx.supabase
      .from('chatbot_conversas')
      .select('event_proposal_sent, proposta_link_sent_at, proposta_id')
      .eq('id', ctx.conversaId)
      .single();
    
    console.log(`[RACE_CHECK] 🔄 Fallback read | event_proposal_sent=${freshConversa?.event_proposal_sent} | link_sent_at=${freshConversa?.proposta_link_sent_at}`);
    
    if (!freshConversa || !(freshConversa.event_proposal_sent === true || freshConversa.proposta_link_sent_at)) {
      console.log(`[RACE_CHECK] ✅ Fallback: NO proposal yet, allowing LLM processing`);
      return { handled: false };
    }
    console.log(`[RACE_CHECK] ⚡ Fallback: BLOCKING - proposal was already sent`);
    // Continue with fallback logic below
  } else if (atomicResult && atomicResult.length > 0) {
    const result = atomicResult[0];
    
    console.log(`[RACE_CHECK] 📊 RPC result in ${rpcDuration}ms | should_process=${result.should_process} | proposal_already_sent=${result.proposal_already_sent} | blocked_reason=${result.blocked_reason}`);
    
    if (result.should_process === true) {
      // Proposal NOT sent yet, allow normal LLM processing
      console.log(`[RACE_CHECK] ✅ ALLOW: No proposal yet, proceeding to LLM | conversaId=${ctx.conversaId}`);
      return { handled: false };
    }
    
    // Proposal was already sent! Block LLM processing
    console.log(`[RACE_CHECK] ⚡⚡⚡ INTERCEPTED RACE CONDITION! Proposal already sent | conversaId=${ctx.conversaId} | reason=${result.blocked_reason} | proposalLink=${result.proposal_link || 'N/A'}`);
    
    const proposalUrl = result.proposal_link || '';
    const firstName = ctx.clienteNome?.split(' ')[0] || '';
    
    // Build response based on what the user sent
    let response: string;
    
    if (messageIsEmail) {
      response = firstName
        ? `${firstName}, o link da sua proposta *já foi enviado aqui na conversa* há alguns instantes! 🎉\n\n${proposalUrl ? `📋 Aqui está novamente: ${proposalUrl}\n\n` : ''}Dá uma olhada e me conta o que você achou! 😊`
        : `O link da sua proposta *já foi enviado aqui na conversa* há alguns instantes! 🎉\n\n${proposalUrl ? `📋 Aqui está novamente: ${proposalUrl}\n\n` : ''}Dá uma olhada e me conta o que você achou! 😊`;
    } else if (messageIsThanks) {
      response = firstName
        ? `Disponha, ${firstName}! 😊\n\n${proposalUrl ? `O link da proposta está aqui: ${proposalUrl}\n\n` : ''}Qualquer dúvida sobre os valores ou próximos passos, é só me chamar!`
        : `Disponha! 😊\n\n${proposalUrl ? `O link da proposta está aqui: ${proposalUrl}\n\n` : ''}Qualquer dúvida sobre os valores ou próximos passos, é só me chamar!`;
    } else {
      response = firstName
        ? `${firstName}, o link da sua proposta *já está aqui na conversa*! ✅\n\n${proposalUrl ? `📋 ${proposalUrl}\n\n` : ''}Dá uma olhada e me diz o que achou. Posso te ajudar com qualquer dúvida! 😊`
        : `O link da sua proposta *já está aqui na conversa*! ✅\n\n${proposalUrl ? `📋 ${proposalUrl}\n\n` : ''}Dá uma olhada e me diz o que achou. Posso te ajudar com qualquer dúvida! 😊`;
    }
    
    // Send response with humanization
    await sendHumanizedMessage(ctx, response);
    
    // Save bot message
    await ctx.supabase.from('chatbot_mensagens').insert({
      conversa_id: ctx.conversaId,
      role: 'assistant',
      content: response,
    });
    
    // Update conversation metrics
    await ctx.supabase
      .from('chatbot_conversas')
      .update({
        last_sofia_message_at: new Date().toISOString(),
        total_messages: (ctx.totalMessages || 0) + 2,
      })
      .eq('id', ctx.conversaId);
    
    const totalDuration = Date.now() - raceCheckStart;
    console.log(`[RACE_CHECK] ✅ RACE CONDITION BLOCKED SUCCESSFULLY | conversaId=${ctx.conversaId} | messageType=${messageType} | totalTime=${totalDuration}ms | LLM_SKIPPED=true`);
    
    return {
      handled: true,
      status: 'proposal_already_sent_atomic_check',
      response: {
        conversaId: ctx.conversaId,
        proposalUrl,
        messageType: messageIsEmail ? 'email' : (messageIsThanks ? 'thanks' : 'confirmation'),
        atomicBlocked: true,
        rpcDurationMs: rpcDuration,
      },
    };
  }
  
  // No result or empty result - allow processing
  console.log(`[RACE_CHECK] ⚠️ Empty RPC result, allowing LLM processing by default | conversaId=${ctx.conversaId}`);
  return { handled: false };
}

// ═══════════════════════════════════════════════════════════════
// DISCOUNT PERCENTAGE FAST-PATH (NEW - Phase 77)
// Enhanced in Phase 150: Now checks for existing proposal discount
// ═══════════════════════════════════════════════════════════════

/**
 * Detect questions about discount percentage
 */
function detectDiscountQuestion(message: string): boolean {
  const normalized = message.toLowerCase().trim();
  const patterns = [
    /qual\s*(a|o)?\s*porcentagem/i,
    /qual\s*(a|o)?\s*desconto/i,
    /quanto\s*(de|%)?\s*desconto/i,
    /quanto\s*vou\s*economizar/i,
    /qual\s*economia/i,
    /percentual\s*(de)?\s*desconto/i,
    /quanto\s*%/i,
    /desconto\s*de\s*quantos?\s*%/i,
    /qual\s*ser[aá]\s*(o|a)?\s*desconto/i,
    // New patterns for asking about the specific proposal discount
    /qual\s*(o\s*)?(valor|percentual)\s*(em\s*)?(percentual|%)/i,
    /(?:me\s+)?(?:oferece[mn]?|aplicou|aplica)/i,
    /na\s+(?:minha\s+)?proposta/i,
  ];
  return patterns.some(p => p.test(normalized));
}

/**
 * Plan mapping: discount percentage to plan details
 */
const PLAN_INFO: Record<number, { name: string; years: number }> = {
  15: { name: 'Flex', years: 1 },
  20: { name: 'Economia', years: 2 },
  25: { name: 'Premium', years: 3 },
  30: { name: 'UNLOCK', years: 4 },
};

/**
 * Generate specific response when a proposal already exists
 * Shows the EXACT discount applied to their proposal
 */
function generateSpecificDiscountResponse(
  clienteNome: string | null,
  descontoPercentual: number,
  fidelidadeAnos: number,
  economiaMensal?: number | null,
  economiaAnual?: number | null
): string {
  const firstName = clienteNome?.split(' ')[0] || '';
  const greeting = firstName ? `${firstName}, ` : '';
  
  const plan = PLAN_INFO[descontoPercentual];
  const planName = plan?.name || 'personalizado';
  
  let response = `${greeting}na sua proposta, apliquei o plano ${planName} com *${descontoPercentual}%* de desconto, fidelidade de *${fidelidadeAnos} ano${fidelidadeAnos > 1 ? 's' : ''}*.`;
  
  if (economiaMensal && economiaMensal > 0) {
    response += `\n\nEconomia estimada: *R$ ${economiaMensal.toFixed(2).replace('.', ',')}*/mês`;
    if (economiaAnual && economiaAnual > 0) {
      response += ` (*R$ ${economiaAnual.toFixed(2).replace('.', ',')}*/ano)`;
    }
    response += `.`;
  }
  
  response += `\n\nO link da proposta já foi enviado aqui na conversa. Dá uma olhada e me diz o que achou!`;
  
  return response;
}

/**
 * Generate generic discount plans response (when no proposal exists)
 */
function generateDiscountResponse(clienteNome: string | null): string {
  const firstName = clienteNome?.split(' ')[0] || '';
  const greeting = firstName ? `${firstName}, t` : 'T';
  
  return `${greeting}rabalhamos com planos de *15%* a *30%* de desconto.

Flex (1 ano): *15%*, Economia (2 anos): *20%*, Premium (3 anos): *25%*, UNLOCK (4 anos): *30%*.

O UNLOCK (*30%*) é pra contas a partir de *R$ 600*.

Quer que eu simule a economia no seu caso? Me passa o valor da sua conta de luz!`;
}

/**
 * Handle discount percentage questions
 * ENHANCED: Now checks if a proposal exists and returns the SPECIFIC discount applied
 */
export async function handleDiscountQuestionFastPath(
  ctx: FastPathContext
): Promise<FastPathResult> {
  // Skip for media messages
  if (ctx.isAnalyzedImage || ctx.isAnalyzedDocument || ctx.isTranscribedAudio) {
    return { handled: false };
  }
  
  if (!detectDiscountQuestion(ctx.messageText)) {
    return { handled: false };
  }
  
  console.log(`[DISCOUNT_FAST_PATH] Detected discount question: "${ctx.messageText.substring(0, 80)}..."`);
  
  // ═══════════════════════════════════════════════════════════════
  // CHECK FOR EXISTING PROPOSAL WITH SPECIFIC DISCOUNT
  // If a proposal was already sent, tell the client the EXACT discount
  // ═══════════════════════════════════════════════════════════════
  
  let discountResponse: string;
  let hasSpecificDiscount = false;
  
  const propostaId = ctx.conversa?.proposta_id;
  
  if (propostaId) {
    // Fetch the proposal to get the actual discount applied
    const { data: proposta, error: propostaError } = await ctx.supabase
      .from('propostas_assinantes')
      .select('desconto_percentual, fidelidade_anos, economia_mensal, economia_anual')
      .eq('id', propostaId)
      .single();
    
    if (!propostaError && proposta && proposta.desconto_percentual) {
      console.log(`[DISCOUNT_FAST_PATH] Found proposal ${propostaId} with ${proposta.desconto_percentual}% discount`);
      
      discountResponse = generateSpecificDiscountResponse(
        ctx.clienteNome,
        Number(proposta.desconto_percentual),
        proposta.fidelidade_anos || 3,
        proposta.economia_mensal ? Number(proposta.economia_mensal) : null,
        proposta.economia_anual ? Number(proposta.economia_anual) : null
      );
      hasSpecificDiscount = true;
    } else {
      console.log(`[DISCOUNT_FAST_PATH] Proposal ${propostaId} found but no desconto_percentual, using generic response`);
      discountResponse = generateDiscountResponse(ctx.clienteNome);
    }
  } else {
    // No proposal yet, use generic discount ranges
    console.log(`[DISCOUNT_FAST_PATH] No proposal found, using generic response`);
    discountResponse = generateDiscountResponse(ctx.clienteNome);
  }
  
  // Send response with humanization
  await sendHumanizedMessage(ctx, discountResponse);
  
  // Save bot message
  await ctx.supabase.from('chatbot_mensagens').insert({
    conversa_id: ctx.conversaId,
    role: 'assistant',
    content: discountResponse,
  });
  
  // Update conversation metrics
  await ctx.supabase
    .from('chatbot_conversas')
    .update({
      last_sofia_message_at: new Date().toISOString(),
      total_messages: (ctx.totalMessages || 0) + 2,
    })
    .eq('id', ctx.conversaId);
  
  console.log(`[DISCOUNT_FAST_PATH] Sent ${hasSpecificDiscount ? 'specific proposal' : 'generic plans'} response`);
  
  return {
    handled: true,
    status: hasSpecificDiscount ? 'specific_discount_answered' : 'discount_question_handled',
    response: {
      conversaId: ctx.conversaId,
      hasSpecificDiscount,
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// BILLING EDUCATION FAST-PATH
// ═══════════════════════════════════════════════════════════════

/**
 * Handle billing education questions (CIP, taxa de disponibilidade, etc.)
 * This PRECEDES the LLM call for precise, consistent responses
 */
export async function handleBillingEducationFastPath(
  ctx: FastPathContext
): Promise<FastPathResult> {
  // Skip for media messages
  if (ctx.isAnalyzedImage || ctx.isAnalyzedDocument || ctx.isTranscribedAudio) {
    return { handled: false };
  }

  // First check for payment clarification (higher priority)
  if (detectPaymentClarification(ctx.messageText)) {
    console.log(`[PAYMENT_CLARIFICATION] Detected payment question: "${ctx.messageText.substring(0, 80)}..."`);
    return await handlePaymentClarificationFastPath(ctx);
  }

  const detection = detectBillingEducationQuestion(ctx.messageText);

  if (!detection.detected || !detection.category) {
    return { handled: false };
  }

  console.log(`[BILLING_EDUCATION] Detected question about: ${detection.category} (pattern: ${detection.matchedPattern})`);

  // Get client data for personalized response
  const mergedData = { ...ctx.existingDados, ...ctx.extractedData };
  const descontoPercentual = 
    (ctx.conversa?.dados_coletados as any)?.descontoContratado || 
    (mergedData as any)?.desconto_percentual || 
    25;
  const tipoInstalacao = mergedData.tipoInstalacao || null;

  // Generate educational response
  const educationalResponse = generateBillingEducationResponse(
    detection.category,
    ctx.clienteNome,
    descontoPercentual,
    tipoInstalacao,
    {
      distribuidora: (mergedData as any)?.distribuidora || (ctx.conversa?.dados_coletados as any)?.distribuidora,
      valorConta: (mergedData as any)?.valorConta || (ctx.conversa?.dados_coletados as any)?.valorFatura,
      consumo: (mergedData as any)?.consumo || (ctx.conversa?.dados_coletados as any)?.consumoMedio,
    }
  );

  // Send educational response with humanization
  await sendHumanizedMessage(ctx, educationalResponse);

  // Save bot message
  await ctx.supabase.from('chatbot_mensagens').insert({
    conversa_id: ctx.conversaId,
    role: 'assistant',
    content: educationalResponse,
  });

  // Update conversation metrics
  await ctx.supabase
    .from('chatbot_conversas')
    .update({
      last_sofia_message_at: new Date().toISOString(),
      total_messages: (ctx.totalMessages || 0) + 2,
    })
    .eq('id', ctx.conversaId);

  console.log(`[BILLING_EDUCATION] Sent educational response for category: ${detection.category}`);

  return {
    handled: true,
    status: 'billing_education_handled',
    response: {
      conversaId: ctx.conversaId,
      category: detection.category,
      pattern: detection.matchedPattern,
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// PAYMENT CLARIFICATION FAST-PATH
// ═══════════════════════════════════════════════════════════════

/**
 * Handle payment clarification questions
 * "Não entendi qual valor pagar", "Quanto vou pagar", etc.
 */
export async function handlePaymentClarificationFastPath(
  ctx: FastPathContext
): Promise<FastPathResult> {
  const mergedData = { ...ctx.existingDados, ...ctx.extractedData };
  const dadosColetados = ctx.conversa?.dados_coletados as any || {};
  
  const descontoPercentual = 
    dadosColetados?.descontoContratado || 
    (mergedData as any)?.desconto_percentual || 
    25;
  const tipoInstalacao = mergedData.tipoInstalacao || dadosColetados?.tipoInstalacao || null;
  const distribuidora = (mergedData as any)?.distribuidora || dadosColetados?.distribuidora || 'concessionária';
  const valorConta = (mergedData as any)?.valorConta || dadosColetados?.valorFatura || dadosColetados?.valorConta;
  const consumo = (mergedData as any)?.consumo || dadosColetados?.consumoMedio || dadosColetados?.consumo;

  // Generate payment explanation response
  const paymentResponse = generateBillingEducationResponse(
    'paymentClarification',
    ctx.clienteNome,
    descontoPercentual,
    tipoInstalacao,
    {
      distribuidora,
      valorConta,
      consumo,
    }
  );

  // Send payment explanation with humanization
  await sendHumanizedMessage(ctx, paymentResponse);

  // Save bot message
  await ctx.supabase.from('chatbot_mensagens').insert({
    conversa_id: ctx.conversaId,
    role: 'assistant',
    content: paymentResponse,
  });

  // Update conversation metrics
  await ctx.supabase
    .from('chatbot_conversas')
    .update({
      last_sofia_message_at: new Date().toISOString(),
      total_messages: (ctx.totalMessages || 0) + 2,
    })
    .eq('id', ctx.conversaId);

  console.log(`[PAYMENT_CLARIFICATION] Sent payment explanation with ${valorConta ? 'personalized' : 'generic'} data`);

  return {
    handled: true,
    status: 'payment_clarification_handled',
    response: {
      conversaId: ctx.conversaId,
      hasPersonalizedData: !!valorConta,
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// ECONOMY SIMULATION FAST-PATH
// ═══════════════════════════════════════════════════════════════

/**
 * Handle economy simulation requests
 * Detects questions like "qual seria meu desconto?" and calculates automatically
 */
export async function handleEconomySimulationFastPath(
  ctx: FastPathContext
): Promise<FastPathResult> {
  // Skip for media messages
  if (ctx.isAnalyzedImage || ctx.isAnalyzedDocument || ctx.isTranscribedAudio) {
    return { handled: false };
  }

  if (!isSimulationRequest(ctx.messageText)) {
    return { handled: false };
  }

  console.log(`[ECONOMY_SIMULATION] Detected simulation request: "${ctx.messageText.substring(0, 100)}"`);

  // Extract inputs from message and conversation context
  const mergedData = { ...ctx.existingDados, ...ctx.extractedData };
  const simInputs = extractSimulationInputs(ctx.messageText, {
    valorFatura: (mergedData as any)?.valorConta || (mergedData as any)?.valorFatura,
    consumoMedio: (mergedData as any)?.consumoMedio || (mergedData as any)?.consumo,
    distribuidora: (mergedData as any)?.distribuidora || (mergedData as any)?.concessionaria,
  });

  // Check if we have enough data to simulate
  if (simInputs.valorConta || simInputs.consumoKwh) {
    // Run simulation
    const simResult = await simularEconomia(ctx.supabase, simInputs);

    if (simResult) {
      console.log(`[ECONOMY_SIMULATION] Generated result: economia=${simResult.economiaMensal.toFixed(2)}, desconto=${simResult.descontoPercentual}%`);

      // Send simulation result with humanization
      await sendHumanizedMessage(ctx, simResult.message);

      // Save bot message
      await ctx.supabase.from('chatbot_mensagens').insert({
        conversa_id: ctx.conversaId,
        role: 'assistant',
        content: simResult.message,
      });

      // Update conversation with simulation data
      const simDados = {
        ...(ctx.conversa?.dados_coletados || {}),
        ultimaSimulacao: {
          consumo: simResult.consumoEstimado,
          valorAtual: simResult.valorAtual,
          valorComCoesa: simResult.valorComCoesa,
          economiaMensal: simResult.economiaMensal,
          descontoPercentual: simResult.descontoPercentual,
          dataSimulacao: new Date().toISOString(),
        },
      };

      await ctx.supabase
        .from('chatbot_conversas')
        .update({
          dados_coletados: simDados,
          last_sofia_message_at: new Date().toISOString(),
          total_messages: (ctx.totalMessages || 0) + 2,
        })
        .eq('id', ctx.conversaId);

      return {
        handled: true,
        status: 'economy_simulation_handled',
        response: {
          conversaId: ctx.conversaId,
          simulation: {
            consumo: simResult.consumoEstimado,
            economiaMensal: simResult.economiaMensal,
            descontoPercentual: simResult.descontoPercentual,
          },
        },
      };
    }
  }

  // Not enough data - ask for bill value
  const askValueMsg = 'Posso fazer uma simulação de economia pra você! Pra calcular direitinho, me conta: qual é o valor da sua conta de luz mensal? (ex: *R$ 350*)';

  await sendHumanizedMessage(ctx, askValueMsg);

  await ctx.supabase.from('chatbot_mensagens').insert({
    conversa_id: ctx.conversaId,
    role: 'assistant',
    content: askValueMsg,
  });

  await ctx.supabase
    .from('chatbot_conversas')
    .update({
      last_sofia_message_at: new Date().toISOString(),
      total_messages: (ctx.totalMessages || 0) + 2,
    })
    .eq('id', ctx.conversaId);

  return {
    handled: true,
    status: 'economy_simulation_need_data',
    response: {
      conversaId: ctx.conversaId,
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// DOCUMENT COMPLAINT FAST-PATH
// ═══════════════════════════════════════════════════════════════

/**
 * Handle document complaint fallback
 * Detects if client is complaining about already having sent documents
 */
export async function handleDocumentComplaintFastPath(
  ctx: FastPathContext
): Promise<FastPathResult> {
  // Skip for media messages
  if (ctx.isAnalyzedImage || ctx.isAnalyzedDocument || ctx.isTranscribedAudio) {
    return { handled: false };
  }

  if (!detectDocumentComplaint(ctx.messageText)) {
    return { handled: false };
  }

  console.log(`[DOC-FALLBACK] Detected document complaint: "${ctx.messageText.substring(0, 100)}"`);

  // ═══════════════════════════════════════════════════════════════
  // DOCUMENT COMPLAINT IS ALWAYS FRUSTRATION — empathetic response first
  // ═══════════════════════════════════════════════════════════════
  const firstName = getFirstNameOrEmpty(ctx.clienteNome);
  const empathyMessage = `${firstName ? firstName + ', ' : ''}desculpa pelo incômodo! Vou verificar o status dos seus documentos agora.

Pode me dar 1 minutinho que já te retorno com a atualização?`;

  console.log(`[FAST_PATH_EMPATHETIC] Document complaint — always empathetic path`);

  // Send empathetic acknowledgment first
  await sendHumanizedMessage(ctx, empathyMessage);
  await ctx.supabase.from('chatbot_mensagens').insert({
    conversa_id: ctx.conversaId,
    role: 'assistant',
    content: empathyMessage,
  });

  // Then try to get actual document status
  const mergedData = { ...ctx.existingDados, ...ctx.extractedData };
  const docFallbackResult = await handleDocumentComplaintFallback(
    ctx.supabase,
    ctx.conversaId,
    ctx.phone,
    ctx.clienteNome,
    ctx.conversa?.arquivos_anexados as string[] | null,
    mergedData,
    ctx.conversa?.bitrix24_lead_id as string | null
  );

  // If we got a detailed status, send it as follow-up
  if (docFallbackResult.triggered && docFallbackResult.message) {
    await sendHumanizedMessage(ctx, docFallbackResult.message);
    await ctx.supabase.from('chatbot_mensagens').insert({
      conversa_id: ctx.conversaId,
      role: 'assistant',
      content: docFallbackResult.message,
    });
  }

  // Update conversation metrics
  await ctx.supabase
    .from('chatbot_conversas')
    .update({
      last_sofia_message_at: new Date().toISOString(),
      total_messages: (ctx.totalMessages || 0) + 2,
    })
    .eq('id', ctx.conversaId);

  return {
    handled: true,
    status: 'document_complaint_empathetic_handled',
    response: {
      conversaId: ctx.conversaId,
      hasAllDocuments: docFallbackResult.hasAllDocuments,
      missingDocuments: docFallbackResult.missingDocuments,
      emotionalPath: 'always_empathetic',
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// CONTRACT/TERMO REQUEST FAST-PATH - Priority #0
// Detects clients asking for contract link when they're in contract stage
// ═══════════════════════════════════════════════════════════════

const BITRIX24_URL = Deno.env.get('BITRIX24_URL');

// Contract stage IDs (loaded from config or defaults)
const CONTRACT_STAGES = [
  'UC_JENEX5',   // Proposta Definitiva
  'UC_XIM123',   // Aguardando Assinatura
  'UC_HH1AOA',   // Termo Assinado
  'UC_GQKQX5',   // Contrato Enviado (legacy)
  'UC_59V8I1',   // Contrato Assinado (legacy)
  'WON',         // Ganho
];

/**
 * Detect if message is asking for contract/termo de adesão
 */
function detectContractRequest(message: string): boolean {
  const normalized = message.toLowerCase().trim();
  const patterns = [
    /termo\s*(de)?\s*ades[aã]o/i,
    /manda\s*(o|pra\s*mim)?\s*(o)?\s*termo/i,
    /enviar?\s*(o)?\s*termo/i,
    /contrato\s*(pra)?\s*assinar/i,
    /link\s*(do|para)?\s*contrato/i,
    /onde\s*(est[aá]|fica)?\s*(o)?\s*contrato/i,
    /n[aã]o\s*achei\s*(o)?\s*contrato/i,
    /n[aã]o\s*encontr(o|ei)\s*(o)?\s*contrato/i,
    /cadê\s*(o)?\s*contrato/i,
    /cade\s*(o)?\s*contrato/i,
    /preciso\s*(do)?\s*contrato/i,
    /quero\s*assinar/i,
    /assinar\s*(o)?\s*(termo|contrato)/i,
    /reenviar?\s*(o)?\s*(contrato|termo)/i,
    /mandar\s*(o)?\s*contrato\s*de\s*novo/i,
  ];
  return patterns.some(p => p.test(normalized));
}

/**
 * Build contract link from lead data
 */
function buildContractMessage(
  clienteNome: string | null,
  leadData: any,
  contractUrl: string | null
): string {
  const firstName = clienteNome?.split(' ')[0] || '';
  const greeting = firstName ? `${firstName}` : 'Olá';
  
  if (contractUrl) {
    return `${greeting}, encontrei seu contrato. Clique no link abaixo pra acessar e assinar:

${contractUrl}

A assinatura é 100% digital, rápida e segura. Se não encontrar no e-mail, veja spam ou promoções. Qualquer dúvida, estou por aqui!`;
  }
  
  return `${greeting}, vi que seu contrato já foi enviado pro seu e-mail. Verifique a caixa de entrada (e spam/promoções).

O Termo de Adesão é enviado pela plataforma de assinatura digital. Se não encontrar, me avisa que peço pra reenviar!`;
}

/**
 * Handle contract/termo de adesão requests
 * Checks Bitrix24 stage and sends contract link directly
 */
export async function handleContractRequestFastPath(
  ctx: FastPathContext
): Promise<FastPathResult> {
  // Skip for media messages
  if (ctx.isAnalyzedImage || ctx.isAnalyzedDocument || ctx.isTranscribedAudio) {
    return { handled: false };
  }
  
  if (!detectContractRequest(ctx.messageText)) {
    return { handled: false };
  }
  
  console.log(`[CONTRACT_FAST_PATH] Detected contract request: "${ctx.messageText.substring(0, 80)}..."`);
  
  // Check if we have Bitrix24 URL configured
  if (!BITRIX24_URL) {
    console.log(`[CONTRACT_FAST_PATH] No Bitrix24 URL configured, skipping`);
    return { handled: false };
  }
  
  try {
    // 1. Try to get lead from conversation first
    let leadData: any = null;
    let leadId = ctx.conversa?.bitrix24_lead_id;
    
    if (leadId) {
      console.log(`[CONTRACT_FAST_PATH] Fetching lead ${leadId} from Bitrix24`);
      leadData = await getBitrixLead(BITRIX24_URL, leadId);
    }
    
    // 2. If no lead in conversation, search by phone
    if (!leadData && ctx.phone) {
      console.log(`[CONTRACT_FAST_PATH] Searching lead by phone ${ctx.phone}`);
      leadData = await findLeadByPhone(BITRIX24_URL, ctx.phone);
      if (leadData) {
        leadId = leadData.ID;
        console.log(`[CONTRACT_FAST_PATH] Found lead ${leadId} by phone`);
      }
    }
    
    if (!leadData) {
      console.log(`[CONTRACT_FAST_PATH] No lead found, cannot handle contract request`);
      return { handled: false };
    }
    
    // 3. Check if lead is in contract stage
    const currentStage = leadData.STATUS_ID;
    console.log(`[CONTRACT_FAST_PATH] Lead ${leadId} is in stage: ${currentStage}`);
    
    if (!CONTRACT_STAGES.includes(currentStage)) {
      console.log(`[CONTRACT_FAST_PATH] Lead not in contract stage, skipping fast-path`);
      return { handled: false };
    }
    
    // 4. Extract contract URL from lead if available
    // Try common field names for contract URL
    const contractUrl = 
      leadData.UF_CRM_CONTRACT_URL ||
      leadData.UF_CRM_CONTRATO_URL ||
      leadData.UF_CRM_LINK_CONTRATO ||
      ctx.conversa?.dados_coletados?.contratoUrl ||
      ctx.conversa?.dados_coletados?.contract_url ||
      null;
    
    // 5. Build and send response
    const contractMessage = buildContractMessage(ctx.clienteNome, leadData, contractUrl);
    
    await sendHumanizedMessage(ctx, contractMessage);
    
    // Save bot message
    await ctx.supabase.from('chatbot_mensagens').insert({
      conversa_id: ctx.conversaId,
      role: 'assistant',
      content: `[CONTRACT_FAST_PATH] ${contractMessage}`,
    });
    
    // Update conversation - sync stage from Bitrix if different
    const updateFields: any = {
      last_sofia_message_at: new Date().toISOString(),
      total_messages: (ctx.totalMessages || 0) + 2,
    };
    
    if (ctx.conversa?.bitrix24_stage !== currentStage) {
      updateFields.bitrix24_stage = currentStage;
    }
    
    if (!ctx.conversa?.bitrix24_lead_id && leadId) {
      updateFields.bitrix24_lead_id = leadId;
    }
    
    await ctx.supabase
      .from('chatbot_conversas')
      .update(updateFields)
      .eq('id', ctx.conversaId);
    
    console.log(`[CONTRACT_FAST_PATH] ✅ Sent contract response for lead ${leadId} in stage ${currentStage}`);
    
    return {
      handled: true,
      status: 'contract_request_handled',
      response: {
        conversaId: ctx.conversaId,
        leadId,
        stage: currentStage,
        hasContractUrl: !!contractUrl,
      },
    };
    
  } catch (error) {
    console.error(`[CONTRACT_FAST_PATH] Error:`, error);
    return { handled: false };
  }
}

// ═══════════════════════════════════════════════════════════════
// MINIMUM BILL VALUE FAST-PATH (R$50)
// ═══════════════════════════════════════════════════════════════

/**
 * Detect questions about minimum bill value
 */
const MINIMUM_BILL_PATTERNS = [
  // Patterns diretos e curtos (RELAXADOS)
  /\bm[ií]nim[ao]\b/i,                       // qualquer menção a "mínimo/mínima"
  /\bpelo\s*menos\b/i,                       // "pelo menos"
  /\ba\s*partir\s*de\b/i,                    // "a partir de"
  /\bquem\s*pode\b/i,                        // "quem pode?"
  /\b(serve|vale|d[aá])\s*(?:pra|para)\b/i,  // "serve pra?", "vale pra?"
  /\bqualquer\s*conta\b/i,                   // "qualquer conta?"
  /\btoda\s*conta\b/i,                       // "toda conta?"
  
  // Patterns originais (mantidos)
  /qual\s*(?:é\s*)?(?:o|a)?\s*(?:valor\s*)?m[ií]nim[oa]/i,
  /(?:valor|conta)\s*m[ií]nim[oa]/i,
  /m[ií]nim[oa]\s*(?:de\s*)?(?:conta|fatura|valor)/i,
  /(?:tem|existe)\s*(?:um\s*)?m[ií]nim[oa]/i,
  /a\s*partir\s*de\s*quanto/i,
  /(?:quanto|qual)\s*(?:é\s*)?o\s*m[ií]nim[oa]/i,
  /conta\s*(?:de\s*)?pelo\s*menos/i,
  /precisa\s*(?:ter|pagar)\s*(?:quanto|pelo\s*menos)/i,
  /(?:atende|serve)\s*(?:pra|para)\s*(?:conta|quem\s*paga)\s*(?:de\s*)?(\d+|quanto)/i,
  /minha\s*conta\s*(?:é|[eé]\s*de)?\s*(?:uns?\s*)?\d+\s*(?:reais)?.*(?:d[aá]|vale|serve|atende)/i,
  /quem\s*(?:pode|consegue)\s*(?:aderir|entrar|participar)/i,
  /(?:qualquer|toda)\s*conta\s*(?:serve|vale|d[aá])/i,

  /\d+\s*(?:reais|r\$)\s*(?:d[aá]|serve|entra)/i, // "300 reais dá?"
  /(?:posso|consigo)\s*(?:aderir|entrar|participar)/i, // "posso aderir?"
  /(?:d[aá]|serve)\s*(?:pra|para)\s*(?:mim|eu|minha)/i, // "dá pra mim?"
  /(?:aceita|atende)\s*(?:conta|fatura)\s*(?:de\s*)?\d*/i, // "aceita conta de 200?"
  /(?:precisa|tem\s*que)\s*(?:ter|pagar|gastar)\s*(?:quanto|no\s*m[ií]nimo)/i, // "precisa gastar quanto?"
  /(?:qual|quanto)\s*(?:é|e)?\s*(?:o\s*)?requisito/i, // "qual o requisito?"
  /(?:qual|quanto)\s*(?:é|e)?\s*(?:o\s*)?valor\s*(?:pra|para)\s*(?:entrar|aderir)/i, // "qual valor pra entrar?"
  /(?:tem|existe)\s*(?:algum\s*)?(?:limite|requisito|condi[cç][aã]o)/i, // "tem algum limite?"
  /(?:conta\s*)?(?:baixa|pequena)\s*(?:d[aá]|serve|entra|pode)/i, // "conta baixa dá?"
];

/**
 * DECLARATIVE VALUE PATTERNS - capture value declarations WITHOUT interrogative
 * "Minha conta é 180 reais", "pago 200 por mês", etc.
 * These ONLY trigger for values < 250 (below minimum) to explain the cutoff.
 * For values >= 250, let the LLM handle (client wants to advance in funnel).
 */
const MINIMUM_BILL_DECLARATIVE_PATTERNS = [
  /minha\s*conta\s*(?:é|e)?\s*(?:de\s*)?(?:uns?\s*)?(?:r\$\s*)?\d+/i,
  /conta\s*(?:de\s*)?(?:r\$\s*)?\d+\s*(?:reais|real|conto)/i,
  /pago\s*(?:uns?\s*)?(?:r\$\s*)?\d+\s*(?:reais|real|por\s*m[eê]s)/i,
  /gasto\s*(?:uns?\s*)?(?:r\$\s*)?\d+\s*(?:reais|real|por\s*m[eê]s)/i,
  /(?:minha\s*)?conta\s*(?:é|e)?\s*(?:de\s*)?(?:r\$\s*)?\d+/i,
];

/**
 * Extract numeric value from a message (for minimum bill threshold check)
 */
function extractBillValue(message: string): number | null {
  const match = message.match(/(?:r\$\s*)?(\d{2,5})(?:[.,]\d{2})?/i);
  return match ? parseInt(match[1]) : null;
}

/**
 * Secondary patterns that ONLY match if there's interrogative context
 */
const MINIMUM_BILL_RELAXED_PATTERNS_WITH_DOUBT = [
  /minha\s*conta\s*(?:é|e)?\s*(?:de\s*)?\d+.*(?:d[aá]|serve|entra|consigo|posso|\?)/i,
  /conta\s*(?:de\s*)?\d+\s*(?:reais|r\$)?.*(?:d[aá]|serve|entra|consigo|posso|\?)/i,
  /pago\s*(?:uns?\s*)?\d+\s*(?:reais|r\$)?.*(?:d[aá]|serve|entra|consigo|posso|\?)/i,
  /gasto\s*(?:uns?\s*)?\d+.*(?:d[aá]|serve|entra|consigo|posso|\?)/i,
];

function detectMinimumBillQuestion(message: string): boolean {
  const normalized = message.toLowerCase().trim();
  
  // First check explicit minimum bill patterns
  if (MINIMUM_BILL_PATTERNS.some(p => p.test(normalized))) {
    return true;
  }
  
  // Check relaxed patterns that require interrogative context
  if (MINIMUM_BILL_RELAXED_PATTERNS_WITH_DOUBT.some(p => p.test(normalized))) {
    return true;
  }
  
  // Check declarative patterns (value statements) — ONLY for values < 250
  if (MINIMUM_BILL_DECLARATIVE_PATTERNS.some(p => p.test(normalized))) {
    const value = extractBillValue(normalized);
    if (value !== null && value < 250) {
      console.log(`[MINIMUM_BILL_DETECT] Declarative value ${value} < 250 detected, intercepting`);
      return true;
    }
    // Value >= 250 or no value found: let LLM handle (client likely wants to advance)
  }
  
  return false;
}

/**
 * Generate minimum bill response (R$50)
 * Now context-aware: won't ask for bill value if already known
 */
function generateMinimumBillResponse(
  clienteNome: string | null,
  existingDados?: { valorFatura?: number },
  extractedData?: { valorFatura?: number }
): string {
  const firstName = clienteNome?.split(' ')[0] || '';
  const greeting = firstName ? `${firstName}, o` : 'O';
  
  const hasValor = !!(existingDados?.valorFatura || extractedData?.valorFatura);
  const valorConhecido = existingDados?.valorFatura || extractedData?.valorFatura;
  
  if (hasValor && valorConhecido && valorConhecido >= 50) {
    return `${greeting} valor mínimo é *R$ 50*/mês.

Com sua conta de *R$ ${valorConhecido.toFixed(0)}*, você já pode aderir e começar a economizar! Quanto maior a conta, maior a economia em reais.`;
  } else if (hasValor && valorConhecido && valorConhecido < 50) {
    return `${greeting} valor mínimo é *R$ 50*/mês.

Com *R$ ${valorConhecido.toFixed(0)}* a economia fica muito pequena. Você tem outras contas de energia que somadas atinjam *R$ 50*? Podemos considerar todas juntas.`;
  }

  return `${greeting} valor mínimo é *R$ 50*/mês. A partir desse valor você já pode aderir e começar a economizar.

Quanto maior a conta, maior a economia em reais. Me conta: qual é o valor médio da sua conta de luz?`;
}

/**
 * Handle minimum bill value questions
 * CRITICAL: Always respond R$50
 */
export async function handleMinimumBillFastPath(
  ctx: FastPathContext
): Promise<FastPathResult> {
  // Skip for media messages
  if (ctx.isAnalyzedImage || ctx.isAnalyzedDocument || ctx.isTranscribedAudio) {
    return { handled: false };
  }
  
  if (!detectMinimumBillQuestion(ctx.messageText)) {
    return { handled: false };
  }
  
  console.log(`[MINIMUM_BILL_FAST_PATH] Detected minimum bill question: "${ctx.messageText.substring(0, 80)}..."`);
  
  // ═══════════════════════════════════════════════════════════════
  // EMOTIONAL TONE DETECTION — frustração com valor mínimo
  // ═══════════════════════════════════════════════════════════════
  const isNegative = detectNegativeTone(ctx.messageText);
  const firstName = getFirstNameOrEmpty(ctx.clienteNome);
  let response: string;
  let status = 'minimum_bill_handled';

  if (isNegative) {
    console.log(`[FAST_PATH_EMPATHETIC] Minimum bill frustration detected: "${ctx.messageText.substring(0, 80)}..."`);
    response = `${firstName ? firstName + ', ' : ''}entendo sua frustração. Vou ser sincera: pra contas abaixo de *R$ 50*, a economia fica muito pequena.

Se sua conta aumentar no futuro (ar condicionado, mudança de casa), me chama que aí sim faz diferença!`;
    status = 'minimum_bill_empathetic_handled';
  } else {
    response = generateMinimumBillResponse(ctx.clienteNome, ctx.existingDados, ctx.extractedData);
  }

  // Send response with humanization
  await sendHumanizedMessage(ctx, response);
  
  // Save bot message
  await ctx.supabase.from('chatbot_mensagens').insert({
    conversa_id: ctx.conversaId,
    role: 'assistant',
    content: response,
  });
  
  // Update conversation metrics
  await ctx.supabase
    .from('chatbot_conversas')
    .update({
      last_sofia_message_at: new Date().toISOString(),
      total_messages: (ctx.totalMessages || 0) + 2,
    })
    .eq('id', ctx.conversaId);
  
  console.log(`[FAST_PATH_EMPATHETIC] ✅ Sent ${isNegative ? 'empathetic' : 'standard'} minimum bill response`);
  
  return {
    handled: true,
    status,
    response: {
      conversaId: ctx.conversaId,
      emotionalPath: isNegative ? 'frustrated' : 'neutral',
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// WIN-WIN MODEL FAST-PATH (Ganha-Ganha Solar)
// ═══════════════════════════════════════════════════════════════

/**
 * Detect questions about the business model / how it works
 */
// Caminho A: Curiosidade genuína sobre o modelo
const WIN_WIN_CURIOSITY_PATTERNS = [
  /como\s*(?:é\s+que\s+)?funciona\s*(?:isso|esse\s*modelo|a\s*coesa)?/i,
  /como\s*(?:voc[eê]s|a\s*coesa)\s*(?:consegue[mn]?|faz|ganha)/i,
  /(?:de\s+)?onde\s*(?:vem|sai)\s*(?:o|esse)?\s*desconto/i,
  /(?:qual|como)\s*(?:é|funciona)\s*(?:o\s*)?modelo/i,
  /como\s*(?:isso\s*)?(?:é|ser[aá])\s*poss[ií]vel/i,
  /(?:qual|como)\s*(?:é\s+)?(?:o\s+)?neg[oó]cio\s+de\s+voc[eê]s/i,
  /(?:qual|como)\s*(?:é\s+)?(?:o\s+)?ganha[- ]?ganha/i,
  /(?:voc[eê]s\s+)?ganha[mn]?\s*(?:o\s+)?qu[eê]/i,
  /o\s*que\s*(?:a\s+coesa|voc[eê]s)\s*ganha[mn]?/i,
  /(?:por\s+)?que\s*(?:é\s+)?(?:t[aã]o\s+)?barato/i,
  /energia\s*(?:solar|limpa).*(?:como|funciona)/i,
  /explica\s*(?:esse\s*)?modelo/i,
  /(?:entender|saber)\s*(?:como|mais\s*sobre)\s*(?:funciona|o\s*modelo)/i,
];

// Caminho B: Desconfiança / medo — exige reconhecimento emocional
const WIN_WIN_DISTRUST_PATTERNS = [
  /(?:tem\s+)?algum\s*(?:golpe|fraude|pegadinha)/i,
  /(?:isso\s*)?(?:é|parece)\s*(?:golpe|fraude|pegadinha|pirâmide)/i,
  /(?:isso\s*)?funciona\s*(?:mesmo|de\s*verdade)/i,
  /(?:ser[aá]\s*que\s*)?(?:é|isso\s*é)\s*(?:verdade|real|confi[aá]vel)/i,
  /(?:n[aã]o\s*)?(?:é|parece)\s*(?:bom\s*demais|muito\s*bom)/i,
  /(?:posso|devo|da\s*pra)\s*confiar/i,
  /(?:isso\s*)?(?:é|parece)\s*(?:mesma\s*coisa|igual)/i,
];

function detectWinWinCuriosity(message: string): boolean {
  const normalized = message.toLowerCase().trim();
  return WIN_WIN_CURIOSITY_PATTERNS.some(p => p.test(normalized));
}

function detectWinWinDistrust(message: string): boolean {
  const normalized = message.toLowerCase().trim();
  return WIN_WIN_DISTRUST_PATTERNS.some(p => p.test(normalized));
}

/**
 * Generate win-win model explanation (curiosidade genuína)
 */
function generateWinWinModelResponse(clienteNome: string | null): string {
  const firstName = clienteNome?.split(' ')[0] || '';
  const greeting = firstName ? `${firstName}, ` : '';
  
  return `${greeting}a COESA investe em usinas solares de grande porte. Essa energia é injetada na rede e gera créditos que vão pra sua conta de luz, reduzindo o valor.

Você ganha desconto de *15%* a *30%*, a COESA vende a energia que produz, e o planeta ganha energia limpa.

Não tem instalação na sua casa nem custo de adesão. Quer que eu simule a economia na sua conta?`;
}

/**
 * Generate empathetic response for distrust/scam concerns
 * Respeita AGENTS.md: reconhecimento emocional antes de explicar
 */
function generateDistrustResponse(clienteNome: string | null): string {
  const firstName = clienteNome?.split(' ')[0] || '';
  const namePrefix = firstName ? `${firstName}, ` : '';

  return `${namePrefix}entendo totalmente sua preocupação. Faz muito bem em questionar, é importante ter cuidado mesmo.

A COESA é uma empresa registrada (CNPJ 49.497.098/0001-23) e o modelo que oferecemos é regulamentado pela *ANEEL* (Resolução 482). Funciona assim:

A COESA gera energia solar em usinas próprias e injeta na rede elétrica. Você recebe créditos dessa energia na sua conta de luz, pagando menos por isso.

Não tem instalação na sua casa, não tem custo de adesão, e você pode cancelar respeitando o prazo do plano.

Se quiser, posso te mostrar a simulação com o valor da sua conta pra você avaliar sem compromisso.`;
}

/**
 * Handle win-win model questions — separa curiosidade de desconfiança
 */
export async function handleWinWinModelFastPath(
  ctx: FastPathContext
): Promise<FastPathResult> {
  // Skip for media messages
  if (ctx.isAnalyzedImage || ctx.isAnalyzedDocument || ctx.isTranscribedAudio) {
    return { handled: false };
  }

  const isDistrust = detectWinWinDistrust(ctx.messageText);
  const isCuriosity = detectWinWinCuriosity(ctx.messageText);

  if (!isDistrust && !isCuriosity) {
    return { handled: false };
  }

  // Desconfiança tem prioridade — reconhecimento emocional obrigatório
  const isDistrustPath = isDistrust;
  const logTag = isDistrustPath ? 'WIN_WIN_DISTRUST_FAST_PATH' : 'WIN_WIN_MODEL_FAST_PATH';
  const status = isDistrustPath ? 'win_win_distrust_handled' : 'win_win_model_handled';

  console.log(`[${logTag}] Detected: "${ctx.messageText.substring(0, 80)}..."`);

  const response = isDistrustPath
    ? generateDistrustResponse(ctx.clienteNome)
    : generateWinWinModelResponse(ctx.clienteNome);

  // Send response with humanization
  await sendHumanizedMessage(ctx, response);

  // Save bot message
  await ctx.supabase.from('chatbot_mensagens').insert({
    conversa_id: ctx.conversaId,
    role: 'assistant',
    content: response,
  });

  // Update conversation metrics
  await ctx.supabase
    .from('chatbot_conversas')
    .update({
      last_sofia_message_at: new Date().toISOString(),
      total_messages: (ctx.totalMessages || 0) + 2,
    })
    .eq('id', ctx.conversaId);

  console.log(`[${logTag}] ✅ Sent ${isDistrustPath ? 'empathetic distrust' : 'ganha-ganha'} explanation`);

  return {
    handled: true,
    status,
    response: {
      conversaId: ctx.conversaId,
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// DISCOUNT VALIDITY FAST-PATH (Prazo de validade do desconto)
// ═══════════════════════════════════════════════════════════════

/**
 * Detect questions about discount validity/duration
 */
const DISCOUNT_VALIDITY_PATTERNS = [
  /(?:quanto\s*)?tempo\s*(?:dura|vale|tem)\s*(?:o\s*)?desconto/i,
  /(?:o\s*)?desconto\s*(?:é\s*)?(?:pra\s*)?sempre/i,
  /desconto\s*(?:dura|vale)\s*quanto\s*tempo/i,
  /(?:por\s*)?quanto\s*tempo\s*(?:tenho|fico\s*com)\s*(?:o\s*)?desconto/i,
  /validade\s*(?:do\s*)?desconto/i,
  /(?:o\s*)?desconto\s*(?:tem|é)\s*(?:prazo|validade)/i,
  /fidelidade\s*(?:é\s*)?(?:de\s*)?quanto/i,
  /(?:quanto\s*)?tempo\s*(?:de\s*)?fidelidade/i,
  /(?:quanto\s*)?tempo\s*(?:tenho\s+que\s+)?ficar\s*(?:no\s*)?(?:contrato|plano)/i,
  /posso\s*cancelar\s*quando/i,
  /(?:tem|existe)\s*multa\s*(?:se|pra)\s*cancelar/i,
  /prazo\s*(?:do\s*)?(?:contrato|plano)/i,
  /contrato\s*(?:é\s*)?(?:de\s*)?quanto\s*tempo/i,
];

function detectDiscountValidityQuestion(message: string): boolean {
  const normalized = message.toLowerCase().trim();
  return DISCOUNT_VALIDITY_PATTERNS.some(p => p.test(normalized));
}

/**
 * Generate discount validity response based on plan
 */
function generateDiscountValidityResponse(clienteNome: string | null, descontoContratado?: number): string {
  const firstName = clienteNome?.split(' ')[0] || '';
  const greeting = firstName ? `${firstName}, ` : '';
  
  if (descontoContratado) {
    const planInfo: Record<number, { name: string; years: number }> = {
      15: { name: 'Flex', years: 1 },
      20: { name: 'Economia', years: 2 },
      25: { name: 'Premium', years: 3 },
      30: { name: 'UNLOCK', years: 4 },
    };
    
    const plan = planInfo[descontoContratado];
    if (plan) {
      return `${greeting}o seu plano ${plan.name} tem *${descontoContratado}%* de desconto garantido por *${plan.years} ano${plan.years > 1 ? 's' : ''}*, fixo em contrato.

Após a fidelidade, você pode renovar, mudar de plano ou cancelar sem custo. Alguma dúvida?`;
    }
  }
  
  return `${greeting}o prazo do desconto depende do plano: Flex (*15%*, 1 ano), Economia (*20%*, 2 anos), Premium (*25%*, 3 anos), UNLOCK (*30%*, 4 anos).

O desconto é garantido em contrato durante todo o período de fidelidade. Depois, você pode renovar, mudar ou cancelar sem custo.

Qual plano te interessa mais?`;
}

/**
 * Handle discount validity questions
 */
export async function handleDiscountValidityFastPath(
  ctx: FastPathContext
): Promise<FastPathResult> {
  // Skip for media messages
  if (ctx.isAnalyzedImage || ctx.isAnalyzedDocument || ctx.isTranscribedAudio) {
    return { handled: false };
  }
  
  if (!detectDiscountValidityQuestion(ctx.messageText)) {
    return { handled: false };
  }
  
  console.log(`[DISCOUNT_VALIDITY_FAST_PATH] Detected validity question: "${ctx.messageText.substring(0, 80)}..."`);
  
  // ═══════════════════════════════════════════════════════════════
  // EMOTIONAL TONE DETECTION — intenção de cancelamento / arrependimento
  // ═══════════════════════════════════════════════════════════════
  const isCancellationIntent = CANCELLATION_INTENT_PATTERNS.some(p => p.test(ctx.messageText));
  const isNegative = isCancellationIntent || detectNegativeTone(ctx.messageText);
  const firstName = getFirstNameOrEmpty(ctx.clienteNome);
  let response: string;
  let status = 'discount_validity_handled';

  if (isNegative) {
    console.log(`[FAST_PATH_EMPATHETIC] Discount validity cancellation/negative tone detected: "${ctx.messageText.substring(0, 80)}..."`);
    response = `${firstName ? firstName + ', ' : ''}sem problemas. Vou te explicar como funciona:

O cancelamento pode ser feito a qualquer momento. Se estiver dentro do período de fidelidade, tem uma multa proporcional ao tempo que falta.

Quer que eu verifique os detalhes do seu plano específico?`;
    status = 'discount_cancellation_empathetic_handled';
  } else {
    // Get contracted discount if available
    const descontoContratado = 
      (ctx.conversa?.dados_coletados as any)?.descontoContratado ||
      (ctx.existingDados as any)?.desconto_percentual;
    response = generateDiscountValidityResponse(ctx.clienteNome, descontoContratado);
  }

  // Send response with humanization
  await sendHumanizedMessage(ctx, response);
  
  // Save bot message
  await ctx.supabase.from('chatbot_mensagens').insert({
    conversa_id: ctx.conversaId,
    role: 'assistant',
    content: response,
  });
  
  // Update conversation metrics
  await ctx.supabase
    .from('chatbot_conversas')
    .update({
      last_sofia_message_at: new Date().toISOString(),
      total_messages: (ctx.totalMessages || 0) + 2,
    })
    .eq('id', ctx.conversaId);
  
  console.log(`[FAST_PATH_EMPATHETIC] ✅ Sent ${isNegative ? 'empathetic-cancellation' : 'standard'} validity response`);
  
  return {
    handled: true,
    status,
    response: {
      conversaId: ctx.conversaId,
      emotionalPath: isNegative ? 'cancellation' : 'neutral',
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// POST-SALE / ONBOARDING FAST-PATH
// Handles existing subscribers asking about:
// - Confirmation from utility (CEMIG/Energisa)
// - How to receive invoices (boletos)
// - Customer portal / app access
// - Post-activation process
// ═══════════════════════════════════════════════════════════════

// Customer portal URL
const CUSTOMER_PORTAL_URL = 'https://cliente.coesaenergia.com.br/login';
const COESA_SAC_PHONE = '5531984400889';
const COESA_SAC_LINK = `https://wa.me/${COESA_SAC_PHONE}`;

/**
 * Patterns that indicate an existing subscriber asking about post-activation process
 */
const POST_SALE_PATTERNS = [
  // Confirmation from utility
  /confirma[çc][aã]o\s*(?:da|junto|na)?\s*(?:cemig|energisa|concession[aá]ria)/i,
  /efetiva[çc][aã]o\s*(?:da|junto|na)?\s*(?:cemig|energisa)/i,
  /(?:cemig|energisa)\s*(?:confirmou|efetivou|aprovou)/i,
  /recebi\s*(?:a\s*)?confirma[çc][aã]o/i,
  /j[aá]\s*(?:foi\s*)?efetivad[oa]/i,
  /j[aá]\s*(?:foi\s*)?ativad[oa]/i,
  /homologa[çc][aã]o\s*(?:foi\s*)?(?:aprovada|conclu[ií]da)/i,
  
  // Invoice/boleto questions from subscribers
  /como\s*(?:vou\s*)?receb(?:er|o)\s*(?:os?\s*)?boleto/i,
  /boleto[s]?\s*(?:por\s*)?(?:e-?mail|whatsapp)/i,
  /(?:onde|como)\s*(?:vou\s*)?pagar?\s*(?:os?\s*)?boleto/i,
  /quando\s*(?:vou\s*)?receb(?:er|o)\s*(?:os?\s*)?boleto/i,
  /j[aá]\s*(?:sou|somo[s]?)\s*(?:cliente|assinante)/i,
  /como\s*funciona\s*(?:agora|depois\s*da\s*ativa[çc][aã]o)/i,
  
  // Customer portal / app questions
  /(?:tem|existe)\s*(?:algum\s*)?(?:aplicativo|app|portal|[aá]rea\s*do\s*cliente)/i,
  /(?:onde|como)\s*(?:acompanho|acesso)\s*(?:minha\s*)?economia/i,
  /(?:onde|como)\s*(?:vejo|acesso)\s*(?:meus?\s*)?boleto[s]?/i,
  /[aá]rea\s*do\s*cliente/i,
  /portal\s*(?:do\s*)?cliente/i,
  /site\s*(?:para|pra)\s*(?:ver|acompanhar)/i,
  /posso\s*acessar\s*(?:onde|como)/i,
  
  // Post-sale questions from identified subscribers
  /funciona(?:mento)?\s*(?:depois|ap[oó]s|agora)/i,
  /pr[oó]ximos?\s*passo[s]?\s*(?:ap[oó]s|depois)/i,
  /o\s*que\s*acontece\s*(?:agora|depois)/i,
];

/**
 * Detect if message is a post-sale/onboarding question from a subscriber
 * Enhanced: Now detects specific onboarding categories (energy gap, portal, due date, unification)
 */
function detectPostSaleQuestion(message: string): { isPostSale: boolean; type: 'confirmation' | 'boleto' | 'portal' | 'general' | 'energy_gap' | 'unify' | 'due_date' } {
  const normalized = message.toLowerCase().trim();
  
  // ── ONBOARDING-SPECIFIC CATEGORIES (NEW) ──
  
  // Energy gap: "quando recebo energia?", "demora quanto tempo?"
  const energyGapPatterns = [
    /quando\s*(?:recebo|começ[oa]|chega)\s*(?:a\s*)?energia/i,
    /demora\s*quanto\s*tempo/i,
    /quanto\s*tempo\s*demora/i,
    /prazo\s*(?:para|pra)\s*ativa[çc][aã]o/i,
    /quando\s*ativa/i,
    /quando\s*começa\s*(?:o\s*desconto|a\s*funcionar)/i,
    /minha\s*conta\s*(?:ainda\s*)?(?:est[aá]\s*)?(?:normal|igual)/i,
    /ainda\s*n[aã]o\s*(?:chegou|recebi)\s*(?:a\s*)?energia/i,
  ];
  if (energyGapPatterns.some(p => p.test(normalized))) {
    return { isPostSale: true, type: 'energy_gap' };
  }
  
  // Unification: "unificar boleto", "boleto único"
  const unifyPatterns = [
    /unificar?\s*(?:o\s*)?(?:boleto|fatura)/i,
    /boleto\s*(?:unificad|[uú]nico)/i,
    /(?:um|1)\s*boleto\s*s[oó]/i,
    /juntar\s*(?:os?\s*)?boleto/i,
    /pagar\s*s[oó]\s*um\s*boleto/i,
    /(?:quer[oe]|queria|posso|como)\s*unificar/i,
  ];
  if (unifyPatterns.some(p => p.test(normalized))) {
    return { isPostSale: true, type: 'unify' };
  }
  
  // Due date: "mudar vencimento", "dia do boleto"
  const dueDatePatterns = [
    /(?:mudar|alterar|trocar)\s*(?:o\s*)?(?:dia\s*(?:do|de)\s*)?vencimento/i,
    /(?:dia|data)\s*(?:do|de)\s*(?:vencimento|boleto)/i,
    /vencimento\s*(?:do\s*)?boleto/i,
    /trocar\s*o\s*dia/i,
    /quando\s*vence\s*(?:o\s*)?(?:meu\s*)?boleto/i,
  ];
  if (dueDatePatterns.some(p => p.test(normalized))) {
    return { isPostSale: true, type: 'due_date' };
  }
  
  // Check for confirmation patterns
  const confirmationPatterns = [
    /confirma[çc][aã]o/i, /efetiva[çc][aã]o/i, /efetivad[oa]/i, /ativad[oa]/i,
    /homologa[çc][aã]o/i, /cemig.*confirm/i, /energisa.*confirm/i,
    /recebi.*confirma/i,
  ];
  if (confirmationPatterns.some(p => p.test(normalized))) {
    return { isPostSale: true, type: 'confirmation' };
  }
  
  // Check for portal/app patterns (enhanced)
  const portalPatterns = [
    /aplicativo/i, /\bapp\b/i, /portal/i, /[aá]rea.*cliente/i,
    /acompanho.*economia/i, /acesso.*boleto/i, /site.*acompanhar/i,
    /primeiro\s*acesso/i, /criar?\s*senha/i, /esqueci\s*(?:minha\s*)?senha/i,
    /login\s*coesa/i, /como\s*(?:fa[çc]o\s*(?:para|pra)\s*)?acesso/i,
  ];
  if (portalPatterns.some(p => p.test(normalized))) {
    return { isPostSale: true, type: 'portal' };
  }
  
  // Check for boleto patterns (first boleto question)
  const boletoPatterns = [
    /boleto/i, /como.*pagar/i, /quando.*receb.*boleto/i,
    /boleto.*email/i, /boleto.*whatsapp/i,
    /primeiro\s*boleto/i, /quando\s*(?:começo|vou)\s*(?:a\s*)?pagar/i,
    /quando\s*(?:chega|vem)\s*(?:o\s*)?boleto/i,
  ];
  if (boletoPatterns.some(p => p.test(normalized))) {
    return { isPostSale: true, type: 'boleto' };
  }
  
  // Check general post-sale patterns
  const generalPatterns = [
    /funciona.*agora/i, /funciona.*depois/i, /pr[oó]ximos?\s*passo/i,
    /o\s*que\s*acontece/i, /j[aá].*sou.*cliente/i, /j[aá].*assinante/i,
  ];
  if (generalPatterns.some(p => p.test(normalized))) {
    return { isPostSale: true, type: 'general' };
  }
  
  // Full pattern check
  if (POST_SALE_PATTERNS.some(p => p.test(normalized))) {
    return { isPostSale: true, type: 'general' };
  }
  
  return { isPostSale: false, type: 'general' };
}

/**
 * Generate welcome message for activated subscriber
 * Enhanced with full onboarding instructions
 */
function generatePostSaleWelcomeResponse(clienteNome: string | null): string {
  const firstName = clienteNome?.split(' ')[0] || '';
  const greeting = firstName ? `${firstName}, bem-vindo(a)` : 'Bem-vindo(a)';
  
  return `${greeting} à COESA Energia! Você começará a receber seu desconto na conta de energia.

Seus boletos serão enviados por e-mail e WhatsApp. As taxas fixas da concessionária (iluminação pública e disponibilidade) continuam sendo pagas normalmente, pois não recebem desconto.

Se preferir, podemos unificar os boletos pra você receber apenas um. Quer ativar essa opção?

Suporte: ${COESA_SAC_LINK}`;
}

/**
 * Generate response for energy gap questions
 */
function generateEnergyGapResponse(clienteNome: string | null): string {
  const firstName = clienteNome?.split(' ')[0] || '';
  const greeting = firstName ? `${firstName}, ` : '';
  
  return `${greeting}o prazo para a primeira injeção de energia é de até *2 meses* após a assinatura. Esse prazo é exigência da concessionária para processar a troca de geração.

Pra saber se a energia já chegou, veja sua fatura da concessionária no fim do mês. Se o valor estiver bem abaixo da sua média, é sinal de que nossa usina já começou a injetar energia.

No mês seguinte à primeira injeção, você recebe o primeiro boleto COESA. Qualquer dúvida, estou por aqui!`;
}

/**
 * Generate response for first boleto questions
 */
function generateFirstBoletoResponse(clienteNome: string | null): string {
  const firstName = clienteNome?.split(' ')[0] || '';
  const greeting = firstName ? `${firstName}, ` : '';
  
  return `${greeting}o primeiro boleto COESA chega no mês seguinte à primeira injeção de energia na sua conta.

O prazo é: assinatura, até 2 meses pra primeira injeção, e 1 mês depois chega o boleto. Seus boletos são enviados por e-mail e WhatsApp.

Alguma dúvida?`;
}

/**
 * Generate response for unification questions
 */
function generateUnifyResponse(clienteNome: string | null): string {
  const firstName = clienteNome?.split(' ')[0] || '';
  const greeting = firstName ? `${firstName}, ` : '';
  
  return `${greeting}oferecemos a opção de boleto unificado. Com ele, ao pagar o boleto COESA, sua fatura da concessionária é quitada automaticamente.

O primeiro boleto como novo cliente nunca é unificado. A partir do 2º, a opção já está disponível.

Pra ativar, acesse coesaenergia.com.br, clique em Área do Cliente (canto superior direito) e ative a opção de boleto unificado.`;
}

/**
 * Generate response for portal access questions
 */
function generateOnboardingPortalResponse(clienteNome: string | null): string {
  const firstName = clienteNome?.split(' ')[0] || '';
  const greeting = firstName ? `${firstName}, ` : '';
  
  return `${greeting}pra acessar a Área do Cliente, entre em coesaenergia.com.br, clique em Área do Cliente no canto superior direito. No primeiro acesso, use o e-mail de cadastro e clique em "Esqueci minha senha" pra criar uma senha nova.

Lá dentro você vê seus dados, segunda via de boletos e informações de consumo e economia. Qualquer dificuldade, me chama!`;
}

/**
 * Generate response for due date questions
 */
function generateDueDateResponse(clienteNome: string | null): string {
  const firstName = clienteNome?.split(' ')[0] || '';
  const greeting = firstName ? `${firstName}, ` : '';
  
  return `${greeting}pra clientes com boleto unificado, a fatura COESA vence sempre *5 dias antes* do vencimento da conta na concessionária. Exemplo: se sua conta CEMIG vence no dia 10, a COESA vence no dia 5.

Pra alterar o vencimento, mude direto na CEMIG primeiro. Nosso sistema atualiza automaticamente em seguida. Alguma dúvida?`;
}

/**
 * Generate customer portal response
 */
function generatePortalResponse(clienteNome: string | null): string {
  const firstName = clienteNome?.split(' ')[0] || '';
  const greeting = firstName ? `${firstName}, s` : 'S';
  
  return `${greeting}im! Na Área do Cliente você acompanha sua economia, vê e baixa boletos, consulta histórico de faturas e atualiza seus dados.

Acesse aqui: ${CUSTOMER_PORTAL_URL}

Alguma dúvida?`;
}

/**
 * Generate boleto explanation response
 */
function generateBoletoExplanationResponse(clienteNome: string | null): string {
  const firstName = clienteNome?.split(' ')[0] || '';
  const greeting = firstName ? `${firstName}, s` : 'S';
  
  return `${greeting}eus boletos são enviados por e-mail e WhatsApp todo mês, com o valor já com desconto aplicado.

A conta da concessionária continua chegando, mas só com as taxas fixas (iluminação pública, disponibilidade). Esse valor menor você paga direto pra concessionária.

Você também pode ver seus boletos na Área do Cliente: ${CUSTOMER_PORTAL_URL}

Prefere unificar pra receber só um boleto? É só me avisar!`;
}

/**
 * Handle post-sale questions from existing subscribers
 */
export async function handlePostSaleFastPath(
  ctx: FastPathContext
): Promise<FastPathResult> {
  // Skip for media messages
  if (ctx.isAnalyzedImage || ctx.isAnalyzedDocument || ctx.isTranscribedAudio) {
    return { handled: false };
  }
  
  const detection = detectPostSaleQuestion(ctx.messageText);
  
  if (!detection.isPostSale) {
    return { handled: false };
  }
  
  console.log(`[POST_SALE_FAST_PATH] Detected post-sale question type: ${detection.type} | message: "${ctx.messageText.substring(0, 80)}..."`);
  
  // Check if this is likely an existing subscriber (CRM stage or contract signed)
  const crmContext = ctx.crmContext;
  const isLikelySubscriber = 
    crmContext?.isContractSigned ||
    ctx.conversa?.contrato_assinado ||
    /j[aá].*(?:sou|somo[s]?).*(?:cliente|assinante)/i.test(ctx.messageText) ||
    /recebi.*confirma[çc][aã]o/i.test(ctx.messageText) ||
    /efetiva[çc][aã]o/i.test(ctx.messageText);
  
  // For confirmation type, always respond (they're telling us they got confirmed)
  // For other types, only respond if likely subscriber
  if (detection.type !== 'confirmation' && !isLikelySubscriber) {
    console.log(`[POST_SALE_FAST_PATH] Skipping - not clearly a subscriber (type: ${detection.type})`);
    return { handled: false };
  }
  
  // Determine sofia_mode based on whether client is in onboarding or post-sale
  const isOnboarding = ctx.conversa?.sofia_mode === 'onboarding' ||
    (ctx.conversa?.contrato_assinado && !ctx.conversa?.dados_coletados?._first_boleto_paid);
  
  let responses: string[] = [];
  
  // ═══════════════════════════════════════════════════════════════
  // EMOTIONAL TONE DETECTION — frustração de pós-venda
  // ═══════════════════════════════════════════════════════════════
  const isNegative = detectNegativeTone(ctx.messageText);
  const firstName = getFirstNameOrEmpty(ctx.clienteNome);
  let emotionalPath = 'neutral';

  if (isNegative) {
    console.log(`[FAST_PATH_EMPATHETIC] Post-sale frustration detected: "${ctx.messageText.substring(0, 80)}..."`);
    const empathyPrefix = `${firstName ? firstName + ', ' : ''}desculpa pelo transtorno. Vou te ajudar a resolver isso agora.\n\n`;
    emotionalPath = 'frustrated';

    // Prepend empathy to the actual response
    switch (detection.type) {
      case 'energy_gap':
        responses.push(empathyPrefix + generateEnergyGapResponse(null));
        break;
      case 'unify':
        responses.push(empathyPrefix + generateUnifyResponse(null));
        break;
      case 'due_date':
        responses.push(empathyPrefix + generateDueDateResponse(null));
        break;
      case 'portal':
        responses.push(empathyPrefix + (isOnboarding ? generateOnboardingPortalResponse(null) : generatePortalResponse(null)));
        break;
      case 'boleto':
        responses.push(empathyPrefix + (isOnboarding ? generateFirstBoletoResponse(null) : generateBoletoExplanationResponse(null)));
        break;
      case 'confirmation':
        responses.push(generatePostSaleWelcomeResponse(ctx.clienteNome));
        break;
      case 'general':
      default:
        responses.push(empathyPrefix + generatePostSaleWelcomeResponse(null));
        break;
    }
  } else {
    switch (detection.type) {
      case 'energy_gap':
        responses.push(generateEnergyGapResponse(ctx.clienteNome));
        break;
      case 'unify':
        responses.push(generateUnifyResponse(ctx.clienteNome));
        break;
      case 'due_date':
        responses.push(generateDueDateResponse(ctx.clienteNome));
        break;
      case 'portal':
        responses.push(isOnboarding 
          ? generateOnboardingPortalResponse(ctx.clienteNome) 
          : generatePortalResponse(ctx.clienteNome));
        break;
      case 'boleto':
        responses.push(isOnboarding
          ? generateFirstBoletoResponse(ctx.clienteNome)
          : generateBoletoExplanationResponse(ctx.clienteNome));
        break;
      case 'confirmation':
        responses.push(generatePostSaleWelcomeResponse(ctx.clienteNome));
        if (/(?:aplicativo|app|portal|[aá]rea)/i.test(ctx.messageText)) {
          responses.push(generateOnboardingPortalResponse(ctx.clienteNome));
        }
        break;
      case 'general':
      default:
        responses.push(generatePostSaleWelcomeResponse(ctx.clienteNome));
        break;
    }
  }
  
  // Send all responses
  for (const response of responses) {
    await sendHumanizedMessage(ctx, response);
    await saveFastPathMessage(ctx, response);
  }
  
  // Update conversation context - keep onboarding mode if applicable
  const newMode = isOnboarding ? 'onboarding' : 'pos_venda';
  await ctx.supabase
    .from('chatbot_conversas')
    .update({
      sofia_mode: newMode,
      dados_coletados: {
        ...(ctx.conversa?.dados_coletados || {}),
        _post_sale_handled: true,
        _post_sale_type: detection.type,
        _post_sale_at: new Date().toISOString(),
      },
    })
    .eq('id', ctx.conversaId);
  
  const statusValue = emotionalPath === 'frustrated' ? 'post_sale_frustrated_handled' : 'post_sale_handled';
  console.log(`[FAST_PATH_EMPATHETIC] ✅ Sent ${responses.length} ${emotionalPath} post-sale response(s) for type: ${detection.type}`);
  
  return {
    handled: true,
    status: statusValue,
    response: {
      conversaId: ctx.conversaId,
      type: detection.type,
      responsesCount: responses.length,
      emotionalPath,
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// CRM STAGE FAST-PATH (Highest Priority)
// Handles leads based on their CRM stage (WON, JUNK, Contract, etc.)
// ═══════════════════════════════════════════════════════════════

/**
 * Get COESA contact for SAC redirect
 */
async function getCoesaContact(supabase: SupabaseClient, identifier: string): Promise<{ nome: string; telefone: string; link: string } | null> {
  try {
    const { data } = await supabase
      .from('coesa_contatos')
      .select('nome, telefone')
      .eq('identificador', identifier)
      .eq('is_active', true)
      .single();
    
    if (data) {
      const link = `https://wa.me/${data.telefone.replace(/\D/g, '')}`;
      return { nome: data.nome, telefone: data.telefone, link };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Get quarantine days from config
 */
async function getQuarantineDays(supabase: SupabaseClient): Promise<number> {
  const { data } = await supabase
    .from('configuracoes_sistema')
    .select('valor')
    .eq('chave', 'crm_quarantine_days_junk')
    .single();
  
  return data?.valor ? parseInt(data.valor) : 30;
}

/**
 * Get contract URL from proposal or conversation
 */
async function getContractUrl(supabase: SupabaseClient, leadId: string | null): Promise<string | null> {
  if (!leadId) return null;
  
  try {
    // Try to find proposal with contract URL
    const { data: proposta } = await supabase
      .from('propostas_assinantes')
      .select('public_id, contrato_url')
      .eq('bitrix24_lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (proposta?.contrato_url) return proposta.contrato_url;
    if (proposta?.public_id) return `https://coesasolar.com.br/proposta/${proposta.public_id}`;
    
    return null;
  } catch {
    return null;
  }
}

/**
 * Save bot message to database
 */
async function saveFastPathMessage(ctx: FastPathContext, message: string): Promise<void> {
  await ctx.supabase.from('chatbot_mensagens').insert({
    conversa_id: ctx.conversaId,
    role: 'assistant',
    content: message,
  });
  
  await ctx.supabase
    .from('chatbot_conversas')
    .update({
      last_sofia_message_at: new Date().toISOString(),
      total_messages: (ctx.totalMessages || 0) + 2,
    })
    .eq('id', ctx.conversaId);
}

/**
 * Handle CRM stage-based fast-paths
 * Runs FIRST before any other fast-path
 */
export async function handleCRMStageFastPath(
  ctx: FastPathContext
): Promise<FastPathResult> {
  const crmContext = ctx.crmContext;
  
  if (!crmContext?.found) {
    return { handled: false };
  }
  
  const firstName = ctx.clienteNome?.split(' ')[0] || '';
  
  // CASE 1: Lead descartado - message with option to explain changes
  if (crmContext.isDiscarded) {
    const quarantineDays = await getQuarantineDays(ctx.supabase);
    const message = `${firstName ? firstName + ', ' : ''}identificamos que houve um contato anterior que não avançou. Se sua situação mudou, me conta o que aconteceu!`;
    
    await sendHumanizedMessage(ctx, message);
    await saveFastPathMessage(ctx, message);
    
    console.log(`[CRM_FAST_PATH] ⛔ Discarded lead detected | Stage: ${crmContext.stage} | Quarantine: ${quarantineDays}d`);
    
    return {
      handled: true,
      status: 'crm_discarded_lead',
      response: { 
        crmStage: crmContext.stage, 
        quarantineDays,
        leadId: crmContext.leadId,
      },
    };
  }
  
  // CASE 2: Cliente fechado - redirect to SAC
  if (crmContext.isContractSigned) {
    const sacContact = await getCoesaContact(ctx.supabase, 'Financeiro') || 
                       await getCoesaContact(ctx.supabase, 'Atendimento');
    
    const message = `${firstName ? firstName + ', ' : ''}você já é cliente COESA! Pra dúvidas sobre sua conta ou contrato, fale com nossa equipe de atendimento: ${sacContact?.link || 'https://wa.me/5531912345678'}`;
    
    await sendHumanizedMessage(ctx, message);
    await saveFastPathMessage(ctx, message);
    
    // Mark as SAC redirect
    await ctx.supabase
      .from('chatbot_conversas')
      .update({ sofia_mode: 'sac_redirect' })
      .eq('id', ctx.conversaId);
    
    console.log(`[CRM_FAST_PATH] ✅ Existing customer redirected to SAC | Stage: ${crmContext.stage}`);
    
    return {
      handled: true,
      status: 'crm_existing_customer',
      response: { 
        crmStage: crmContext.stage, 
        redirectedToSAC: true,
        leadId: crmContext.leadId,
      },
    };
  }
  
  // CASE 3: Aguardando assinatura - highest priority, send contract link
  if (crmContext.isAwaitingSignature) {
    const contractUrl = await getContractUrl(ctx.supabase, crmContext.leadId);
    
    const message = `${firstName ? firstName + ', ' : ''}seu contrato já está pronto pra assinatura! ${contractUrl ? `Acesse aqui: ${contractUrl}` : 'Vou te enviar o link agora!'} Alguma dúvida antes de assinar?`;
    
    await sendHumanizedMessage(ctx, message);
    await saveFastPathMessage(ctx, message);
    
    console.log(`[CRM_FAST_PATH] 📋 Contract pending - sent link | Stage: ${crmContext.stage}`);
    
    return {
      handled: true,
      status: 'crm_contract_pending',
      response: { 
        crmStage: crmContext.stage, 
        contractUrl,
        leadId: crmContext.leadId,
      },
    };
  }
  
  // CASE 4: Proposta já enviada - set closer mode but don't handle (continue flow)
  if (crmContext.isProposalSent) {
    console.log(`[CRM_FAST_PATH] 🔥 Hot lead detected (proposal sent) - continuing in closer mode | Stage: ${crmContext.stage}`);
    
    // Update conversation with hot lead context (but don't block flow)
    await ctx.supabase
      .from('chatbot_conversas')
      .update({
        dados_coletados: {
          ...(ctx.conversa?.dados_coletados || {}),
          _crm_hot_lead: true,
          _crm_proposal_stage: crmContext.stage,
        },
      })
      .eq('id', ctx.conversaId);
    
    return { handled: false }; // Continue with normal flow but with context
  }
  
  return { handled: false };
}

// ═══════════════════════════════════════════════════════════════
// COMBINED FAST-PATH PROCESSOR
// ═══════════════════════════════════════════════════════════════

/**
 * Process all fast-path handlers in sequence
 * Returns as soon as one handles the request
 * 
 * Phase 94: PASSIVE-FIRST integration
 * - Loads critical rules from rule_memory before processing
 * - Checks if any rule blocks specific fast-paths
 * - Logs rule application for audit
 */
export async function processAllFastPaths(
  ctx: FastPathContext
): Promise<FastPathResult> {
  // ═══════════════════════════════════════════════════════════════
  // PHASE 94: Load critical rules from rule_memory
  // ═══════════════════════════════════════════════════════════════
  let criticalRules: RuleMemoryEntry[] = [];
  let ruleMemoryApplied = false;
  
  if (ENABLE_RULE_MEMORY_CHECK) {
    const agentId = ctx.agentId || ctx.agentConfig?.agent_id || 'sofia';
    
    try {
      criticalRules = await getFastPathRules(ctx.supabase, agentId);
      ruleMemoryApplied = true;
      
      if (criticalRules.length > 0) {
        console.log(`[FAST_PATH_RULES] Loaded ${criticalRules.length} critical rules for fast-path validation`);
      }
    } catch (ruleError) {
      console.warn('[FAST_PATH_RULES] Failed to load rules, proceeding without validation:', ruleError);
    }
  }
  
  // Build rule context for validation
  const ruleContext: RuleMemoryContext = {
    funnelStage: ctx.funnelStage || ctx.conversa?.sofia_mode,
    hasProposal: !!ctx.conversa?.proposta_id,
    detectedObjection: (ctx.existingDados as Record<string, unknown>)?.detected_objection as string | undefined,
    clientDistribuidora: ctx.existingDados?.distribuidora as string | undefined,
    valorFatura: (ctx.existingDados?.valorFatura || ctx.extractedData?.valorFatura) as number | undefined,
  };
  
  // Helper to check rules before each fast-path
  const checkRules = (fastPathType: string): { blocked: boolean; reason: string | null } => {
    if (!ruleMemoryApplied || criticalRules.length === 0) {
      return { blocked: false, reason: null };
    }
    
    const result = checkRuleBlocksFastPath(criticalRules, fastPathType, ruleContext);
    if (result.blocked) {
      console.log(`[FAST_PATH_RULES] ⛔ Blocked "${fastPathType}": ${result.reason}`);
    }
    return { blocked: result.blocked, reason: result.reason };
  };
  
  // -1. CRM STAGE FAST-PATH (HIGHEST PRIORITY - based on Bitrix stage)
  if (ctx.crmContext?.found) {
    const crmRuleCheck = checkRules('crm_stage');
    if (!crmRuleCheck.blocked) {
      const crmResult = await handleCRMStageFastPath(ctx);
      if (crmResult.handled) return { ...crmResult, ruleMemoryApplied };
    }
  }
  
  // -0.5. POST-SALE / ONBOARDING FAST-PATH (HIGH PRIORITY for existing subscribers)
  // Handles: confirmation from utility, boleto questions, customer portal access
  const postSaleRuleCheck = checkRules('post_sale');
  if (!postSaleRuleCheck.blocked) {
    const postSaleResult = await handlePostSaleFastPath(ctx);
    if (postSaleResult.handled) return { ...postSaleResult, ruleMemoryApplied };
  }
  
  // 0-HIGHEST. Proposal Already Sent (ANTI RACE CONDITION - prevents "preparando proposta" after link sent)
  // Note: This fast-path should NEVER be blocked by rules (it's a safety mechanism)
  const proposalSentResult = await handleProposalAlreadySentFastPath(ctx);
  if (proposalSentResult.handled) return { ...proposalSentResult, ruleMemoryApplied };
  
  // 0. Contract Request (HIGHEST PRIORITY - hot leads asking for contract)
  const contractRuleCheck = checkRules('contract_request');
  if (!contractRuleCheck.blocked) {
    const contractResult = await handleContractRequestFastPath(ctx);
    if (contractResult.handled) return { ...contractResult, ruleMemoryApplied };
  }
  
  // 0b. Cost/Fee Question (VERY HIGH PRIORITY - "Tem custo?")
  const costRuleCheck = checkRules('cost_question');
  if (!costRuleCheck.blocked) {
    const costResult = await handleCostQuestionFastPath(ctx);
    if (costResult.handled) return { ...costResult, ruleMemoryApplied };
  }
  
  // 0c. Minimum Bill Value (VERY HIGH PRIORITY - R$50)
  const minBillRuleCheck = checkRules('minimum_bill');
  if (!minBillRuleCheck.blocked) {
    const minimumBillResult = await handleMinimumBillFastPath(ctx);
    if (minimumBillResult.handled) return { ...minimumBillResult, ruleMemoryApplied };
  }
  
  // 0d. Win-Win Model (HIGH PRIORITY - "Como funciona?")
  const winWinRuleCheck = checkRules('win_win_model');
  if (!winWinRuleCheck.blocked) {
    const winWinResult = await handleWinWinModelFastPath(ctx);
    if (winWinResult.handled) return { ...winWinResult, ruleMemoryApplied };
  }
  
  // 0e. Discount Validity (HIGH PRIORITY - "Quanto tempo dura o desconto?")
  const validityRuleCheck = checkRules('discount_validity');
  if (!validityRuleCheck.blocked) {
    const validityResult = await handleDiscountValidityFastPath(ctx);
    if (validityResult.handled) return { ...validityResult, ruleMemoryApplied };
  }
  
  // 1. Discount Question
  const discountRuleCheck = checkRules('discount_question');
  if (!discountRuleCheck.blocked) {
    const discountResult = await handleDiscountQuestionFastPath(ctx);
    if (discountResult.handled) return { ...discountResult, ruleMemoryApplied };
  }
  
  // 2. Billing Education + Payment Clarification
  const billingRuleCheck = checkRules('billing_education');
  if (!billingRuleCheck.blocked) {
    const billingResult = await handleBillingEducationFastPath(ctx);
    if (billingResult.handled) return { ...billingResult, ruleMemoryApplied };
  }

  // 3. Economy Simulation
  const simRuleCheck = checkRules('economy_simulation');
  if (!simRuleCheck.blocked) {
    const simulationResult = await handleEconomySimulationFastPath(ctx);
    if (simulationResult.handled) return { ...simulationResult, ruleMemoryApplied };
  }

  // 4. Document Complaint
  const docRuleCheck = checkRules('document_complaint');
  if (!docRuleCheck.blocked) {
    const documentResult = await handleDocumentComplaintFastPath(ctx);
    if (documentResult.handled) return { ...documentResult, ruleMemoryApplied };
  }

  return { handled: false, ruleMemoryApplied };
}

// ═══════════════════════════════════════════════════════════════
// UTILITY: Get inline rule summary for fast-path logging
// ═══════════════════════════════════════════════════════════════

/**
 * Get a quick inline summary of applied rules
 * Useful for logging and debugging fast-path decisions
 */
export async function getAppliedRulesSummary(
  supabase: SupabaseClient,
  agentId: string,
  context: RuleMemoryContext
): Promise<string> {
  if (!ENABLE_RULE_MEMORY_CHECK) return '';
  
  try {
    return await buildInlineRuleSummary(supabase, agentId, context);
  } catch (err) {
    console.warn('[FAST_PATH_RULES] Failed to build rule summary:', err);
    return '';
  }
}
