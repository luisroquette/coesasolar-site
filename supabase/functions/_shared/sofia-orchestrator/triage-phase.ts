/**
 * SOFIA ORCHESTRATOR - TRIAGE PHASE
 * 
 * Extracted from sofia-webhook/index.ts (Phase 2 of modular refactoring)
 * Handles client triage: detection of existing clients, department routing,
 * MarIA identification flow, and contextual lookup.
 * 
 * @module _shared/sofia-orchestrator/triage-phase
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.90.0';
import {
  handleTriageFlow,
  checkTriageLock,
  handleMariaToSofiaRedirect,
  shouldSkipTriageCheck,
  checkAgentTriageRules,
  startTriageFlow,
  handleContextualResponse,
  type TriageFlowParams,
  type TriageFlowResult,
  type TriageLockResult,
  type StartTriageParams,
  type StartTriageResult,
  type TriageSkipCheckParams,
  type TriageSkipResult,
} from '../triage-flow.ts';

import {
  detectExistingClientIntentFull,
  resolveContextualIntent,
  generateClarificationQuestion,
  getCoesaContact,
  formatWhatsAppLink,
  type TriagemState,
  type ExistingClientDetection,
  type ContextualResolution,
} from '../maria-triage.ts';

import {
  handleMariaIdentificationFlow,
  type MariaIdentificationState,
  type MariaIdentificationResult,
  type MariaTriageConfig,
} from '../maria-sac-flow.ts';

import { loadDetectionPatterns, matchesPatternCategory, detectPoliteDeclineWithAlternative, type PatternEntry } from '../detection-patterns.ts';
import { getABVariant } from '../funnel-stage.ts';
import { extractDataFromText, type ExtractedClientData } from '../data-extraction.ts';
import { CRMLeadContext } from '../crm-precheck.ts';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface TriagePhaseContext {
  supabase: SupabaseClient;
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceKey: string;
  phone: string;
  messageText: string;
  messageId: string | null;
  clienteNome: string | null;
  /**
   * Full agent config from AI Gym (passed through from sofia-webhook)
   * Required for MarIA identification flow
   */
  fullAgentConfig?: any | null;
  conversa: TriagePhaseConversaData | null;
  agentId: string;
  /**
   * Simplified agent config for triage/logging purposes
   */
  agentConfig?: {
    name?: string;
    role?: string;
    triage_config?: MariaTriageConfig;
  } | null;
  crmContext?: CRMLeadContext;
  detectionPatterns?: Map<string, PatternEntry>;
  sendWhatsAppMessage: (phone: string, message: string) => Promise<void>;
  /**
   * Phase 89: Pre-extracted data from DATA_COLLECTION phase
   * CRITICAL: Allows triage to use fresh data instead of stale DB data
   */
  preExtractedData?: ExtractedClientData;
}

export interface TriagePhaseConversaData {
  id: string;
  dados_coletados?: Record<string, any> | null;
  proposta_id?: string | null;
  bitrix24_stage?: string | null;
  bitrix24_lead_id?: string | null;
  cliente_nome?: string | null;
  cliente_email?: string | null;
  cliente_telefone?: string | null;
  // CRITICAL FIX: Added fields for shouldSkipTriageCheck
  last_sofia_message_at?: string | null;
  event_proposal_sent?: boolean | null;
  proposta_link_sent_at?: string | null;
}

export interface TriagePhaseResult {
  handled: boolean;
  response?: Response;
  action?: string;
  status?: string;
  shouldContinue?: boolean;
  extractedData?: any;
  isNewClient?: boolean;
  conversaId?: string;
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Detect waiting/hold messages (prevents false triage)
// Cliente pedindo tempo para verificar algo - NÃO ativar triagem
// ═══════════════════════════════════════════════════════════════

const WAIT_MESSAGE_PATTERNS = [
  /um\s*momento/i,
  /aguarde/i,
  /j[aá]\s*volto/i,
  /estou\s*(verificando|conferindo|olhando|vendo)/i,
  /deixa\s*eu\s*ver/i,
  /s[oó]\s*um\s*(instante|segundo|minuto)/i,
  /vou\s*(conferir|verificar|olhar|ver)/i,
  /espera\s*(a[ií]|um\s*pouco)?/i,
  /perai/i,
  /momento\s*que/i,
  /to\s*(vendo|olhando|conferindo)/i,
  /deix[ao]\s*eu\s*(olhar|conferir|ver)/i,
  /preciso\s*(ver|conferir|olhar)/i,
];

export function isWaitingMessage(text: string): boolean {
  return WAIT_MESSAGE_PATTERNS.some(p => p.test(text));
}

export interface WaitingMessageResult {
  isWaiting: boolean;
  response?: string;
}

/**
 * Check if client is asking for time to respond
 * Returns a simple acknowledgment instead of triggering complex flows
 */
export function checkWaitingMessage(text: string, clienteNome?: string | null): WaitingMessageResult {
  if (!isWaitingMessage(text)) {
    return { isWaiting: false };
  }
  
  const nome = clienteNome?.split(' ')[0] || '';
  const responses = [
    `Sem pressa${nome ? `, ${nome}` : ''}! 😊 Fico aguardando.`,
    `Claro${nome ? `, ${nome}` : ''}, sem problemas! Aguardo você.`,
    `Tranquilo! Pode verificar com calma, estou aqui. 👍`,
    `Sem pressa! Quando puder, é só me chamar.`,
  ];
  
  return {
    isWaiting: true,
    response: responses[Math.floor(Math.random() * responses.length)],
  };
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Detect discount objection (prevents false triage)
// ═══════════════════════════════════════════════════════════════

function detectDiscountObjection(
  message: string,
  patterns?: Map<string, PatternEntry>
): boolean {
  if (patterns && matchesPatternCategory(message, 'discount_objection', patterns)) {
    return true;
  }
  
  // Fallback patterns for discount objection
  const discountObjectionPatterns = [
    /\b(s[oó]\s*)?(\d{1,2}|dez|cinco|quinze|vinte|trinta)\s*(%|por\s*cento)/i,
    /\b(muito\s+)?pouco\s+(desconto|economia)/i,
    /\bnao\s+(vale|compensa|acho\s+que\s+vale)/i,
    /\b(achei|acho)\s+(pouco|baixo|fraco)/i,
    /\b(tem\s+)?desconto\s+maior/i,
    /\bconcorrente\s+(oferece|da|tem)/i,
  ];
  
  return discountObjectionPatterns.some(p => p.test(message));
}

// ═══════════════════════════════════════════════════════════════
// CORS HEADERS (import from centralized security-helpers)
// ═══════════════════════════════════════════════════════════════

import { corsHeaders } from '../security-helpers.ts';

// ═══════════════════════════════════════════════════════════════
// MAIN TRIAGE PHASE EXECUTOR
// ═══════════════════════════════════════════════════════════════

/**
 * Execute the complete triage phase of sofia-webhook
 * 
 * This phase handles:
 * 1. Triage lock check (skip if lead in active sales flow)
 * 2. CRM pre-check skip
 * 3. Active triage flow processing (handleTriageFlow)
 * 4. MarIA identification flow (for maria agent)
 * 5. Discount objection fast-path (skip triage)
 * 6. Existing client detection (keywords + AI)
 * 7. Contextual lookup (for patterns like "andamento")
 * 8. Start new triage flow
 * 
 * @returns TriagePhaseResult with handled flag and optional response
 */
export async function executeTriagePhase(
  ctx: TriagePhaseContext
): Promise<TriagePhaseResult> {
  const {
    supabase,
    supabaseUrl,
    supabaseAnonKey,
    supabaseServiceKey,
    phone,
    messageText,
    messageId,
    clienteNome,
    conversa,
    agentId,
    agentConfig,
    fullAgentConfig,
    crmContext,
    detectionPatterns,
    sendWhatsAppMessage,
    preExtractedData,
  } = ctx;

  const currentTriagemState = (conversa?.dados_coletados as any)?.triagem_state as TriagemState || null;
  const existingDados = (conversa?.dados_coletados as any) || {};
  
  // Phase 89: Merge pre-extracted data with existing data for accurate checks
  const mergedDados = { ...existingDados, ...(preExtractedData || {}) };

  // ═══════════════════════════════════════════════════════════════
  // CHECK 0: WAITING MESSAGE (Cliente pedindo tempo para responder)
  // CRITICAL: Must come BEFORE any triage logic to prevent false triggers
  // ═══════════════════════════════════════════════════════════════
  const waitCheck = checkWaitingMessage(messageText, clienteNome);
  
  if (waitCheck.isWaiting) {
    console.log(`[TRIAGE_PHASE] ⏳ WAITING MESSAGE detected: "${messageText.slice(0, 50)}"`);
    
    // Send simple acknowledgment
    if (waitCheck.response) {
      await sendWhatsAppMessage(phone, waitCheck.response);
    }
    
    // Save message to conversation if exists
    if (conversa?.id) {
      await supabase.from('chatbot_mensagens').insert([
        { conversa_id: conversa.id, role: 'user', content: messageText, message_id: messageId },
        { conversa_id: conversa.id, role: 'assistant', content: waitCheck.response || 'Aguardando...', handler_type: 'waiting_ack' },
      ]);
      
      await supabase
        .from('chatbot_conversas')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', conversa.id);
    }
    
    return {
      handled: true,
      action: 'waiting_message_detected',
      status: 'waiting_message_acknowledged',
      response: new Response(JSON.stringify({
        status: 'waiting_message_acknowledged',
        message: 'Client asked for time, simple acknowledgment sent',
        triageBlocked: true,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }),
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // CHECK 1: Triage lock (skip if lead in active sales flow)
  // ═══════════════════════════════════════════════════════════════
  const triageLockResult = checkTriageLock(conversa);
  const shouldSkipTriageByCRM = crmContext?.shouldSkipTriage === true;

  // ═══════════════════════════════════════════════════════════════
  // CRITICAL FIX: BYPASS LOCKS WHEN TRIAGE STATE IS ACTIVE
  // Locks should only block START of triage, not continuation of active flow
  // This ensures clients are NEVER left without response mid-triage
  // ═══════════════════════════════════════════════════════════════
  const bypassLocksForActiveTriage = !!currentTriagemState;
  
  if (bypassLocksForActiveTriage) {
    console.log(`[TRIAGE_PHASE] 🔓 BYPASS LOCKS: Active triage state "${currentTriagemState}" - continuing flow regardless of lock/CRM status`);
  } else {
    if (triageLockResult.skip) {
      console.log(`[TRIAGE_PHASE] ⛔ Locked: ${triageLockResult.reason}`);
    }
    if (shouldSkipTriageByCRM) {
      console.log(`[TRIAGE_PHASE] ⛔ Skipping by CRM pre-check: Stage ${crmContext?.stageName || crmContext?.stage}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // CHECK 2: Process active triage flow (if state exists)
  // ENHANCED: Bypass lock checks when triage is already in progress
  // ═══════════════════════════════════════════════════════════════
  const shouldProcessTriage = bypassLocksForActiveTriage || 
    (!triageLockResult.skip && !shouldSkipTriageByCRM);
    
  if (shouldProcessTriage && currentTriagemState && conversa?.id) {
    console.log(`[TRIAGE_PHASE] Current state: ${currentTriagemState} - delegating to handleTriageFlow`);

    const triageResult = await handleTriageFlow({
      supabase,
      conversaId: conversa.id,
      phone,
      clienteNome,
      messageText,
      messageId,
      conversa: {
        id: conversa.id,
        dados_coletados: conversa.dados_coletados || null,
        proposta_id: conversa.proposta_id || undefined,
        bitrix24_stage: conversa.bitrix24_stage || undefined,
      },
      agentConfig,
      sendMessage: sendWhatsAppMessage,
      extractDataFromText: (text: string, dados: any) => extractDataFromText(text, dados),
    });

    if (triageResult.handled) {
      console.log(`[TRIAGE_PHASE] ✅ Handled by handleTriageFlow: ${triageResult.status}`);
      
      return {
        handled: true,
        action: 'triage_flow',
        status: triageResult.status,
        conversaId: triageResult.conversaId,
        isNewClient: triageResult.isNewClient,
        extractedData: triageResult.extractedData,
        response: new Response(JSON.stringify({
          status: triageResult.status,
          conversaId: triageResult.conversaId,
          department: triageResult.department,
          isNewClient: triageResult.isNewClient,
          extractedData: triageResult.extractedData,
          contactFound: triageResult.contactFound,
          attempts: triageResult.attempts,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }),
      };
    }
    
    // ═══════════════════════════════════════════════════════════════
    // CRITICAL ALERT: Active triage state but NOT handled!
    // This should NEVER happen - log detailed context for debugging
    // ═══════════════════════════════════════════════════════════════
    console.error(`[TRIAGE_PHASE] ❌ ALERT: Active state "${currentTriagemState}" NOT HANDLED!`, {
      conversaId: conversa.id,
      phone,
      messageText: messageText.slice(0, 100),
      triageResultStatus: triageResult.status,
      triageLockSkip: triageLockResult.skip,
      triageLockReason: triageLockResult.reason,
      crmSkip: shouldSkipTriageByCRM,
      bypassApplied: bypassLocksForActiveTriage,
    });
    
    // Fall through to FALLBACK handling below
  }

  // ═══════════════════════════════════════════════════════════════
  // CHECK 3: MarIA identification flow (for maria agent only)
  // ═══════════════════════════════════════════════════════════════
  const isMariaAgent = agentId === 'maria';
  const mariaTriageConfig = agentConfig?.triage_config;
  const mariaTriageEnabled = mariaTriageConfig?.enabled === true;
  const identificationCompleted = existingDados.identification_completed === true;

  if (isMariaAgent && mariaTriageEnabled && !identificationCompleted) {
    console.log(`[TRIAGE_PHASE] Starting MarIA identification flow`);

    const mariaResult = await handleMariaIdentificationFlow({
      supabase,
      supabaseUrl,
      supabaseAnonKey,
      supabaseServiceKey,
      phone,
      messageText,
      messageId,
      clienteNome,
      conversa,
      agentConfig: fullAgentConfig || null, // Use full agent config for MarIA
      agentId,
      triageConfig: mariaTriageConfig!,
      sendMessage: sendWhatsAppMessage,
      getCoesaContact,
      formatWhatsAppLink,
    });

    if (mariaResult.handled) {
      console.log(`[TRIAGE_PHASE] ✅ Handled by MarIA identification: ${mariaResult.status}`);
      
      return {
        handled: true,
        action: 'maria_identification',
        status: mariaResult.status,
        conversaId: mariaResult.conversaId,
        response: new Response(JSON.stringify({
          status: mariaResult.status,
          conversaId: mariaResult.conversaId,
          ...mariaResult.data,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }),
      };
    }
    // If not handled, fall through
  }

  // ═══════════════════════════════════════════════════════════════
  // CHECK 4: Skip check (already in sales flow, has data, etc.)
  // ═══════════════════════════════════════════════════════════════
  // Phase 89: Pass preExtractedData to check FRESH data, not just stale DB data
  // Phase 95: Pass messageText for wait/pause intent detection
  const skipCheck = shouldSkipTriageCheck({
    conversa: conversa ? {
      id: conversa.id,
      dados_coletados: existingDados,
      proposta_id: conversa.proposta_id,
      bitrix24_stage: conversa.bitrix24_stage,
    } : null,
    existingDados,
    extractedData: preExtractedData, // CRITICAL: Pass fresh extracted data
    messageText, // Phase 95: Enable wait/pause intent detection
  });

  if (skipCheck.shouldSkip) {
    console.log(`[TRIAGE_PHASE] SKIP - reason: ${skipCheck.reason} (with preExtractedData: ${!!preExtractedData})`);
    return {
      handled: false,
      shouldContinue: true,
      action: 'skip',
      status: skipCheck.reason || 'skip_check_triggered',
      extractedData: preExtractedData, // Return extracted data for downstream use
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // CHECK 5: Agent-specific triage rules
  // ═══════════════════════════════════════════════════════════════
  const agentTriageRules = checkAgentTriageRules(agentId, messageText);

  if (agentId === 'maria' && !agentTriageRules.isMariaRedirect) {
    console.log(`[TRIAGE_PHASE] MarIA handling directly (identification: ${existingDados.identification_completed ? 'OK' : 'pendente'})`);
  }

  // ═══════════════════════════════════════════════════════════════
  // CHECK 6: Polite decline with competitor/alternative detection
  // CRITICAL: Must check BEFORE existing client detection to prevent
  // false triage triggers when client chooses solar panels, financing, etc.
  // ═══════════════════════════════════════════════════════════════
  const politeDeclineResult = detectPoliteDeclineWithAlternative(messageText, detectionPatterns, conversa?.proposta_id);
  
  if (politeDeclineResult.detected) {
    console.log(`[TRIAGE_PHASE] 💔 POLITE DECLINE detected: "${politeDeclineResult.alternative}" | Has proposta: ${!!conversa?.proposta_id}`);
    
    // Update dados_coletados to mark as definitive refusal
    if (conversa?.id) {
      await supabase
        .from('chatbot_conversas')
        .update({
          dados_coletados: {
            ...existingDados,
            recusa_definitiva: true,
            recusa_motivo: politeDeclineResult.reason,
            recusa_alternativa: politeDeclineResult.alternative,
            recusa_at: new Date().toISOString(),
          },
        })
        .eq('id', conversa.id);
    }
    
    // CRITICAL: Do NOT trigger triage - let LLM handle with empathy via rule_memory
    return {
      handled: false,
      shouldContinue: true,
      action: 'polite_decline_with_alternative',
      status: 'competitor_chosen',
      extractedData: {
        recusa_definitiva: true,
        recusa_motivo: politeDeclineResult.reason,
        recusa_alternativa: politeDeclineResult.alternative,
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // CHECK 6b: Discount objection fast-path (skip triage)
  // ═══════════════════════════════════════════════════════════════
  const isDiscountObjection = detectDiscountObjection(messageText, detectionPatterns);
  
  if (isDiscountObjection) {
    console.log(`[TRIAGE_PHASE] ⚠️ Discount objection detected - skipping triage`);
    
    // Mark em_negociacao if conversa exists
    if (conversa?.id) {
      await supabase
        .from('chatbot_conversas')
        .update({
          dados_coletados: {
            ...existingDados,
            em_negociacao: true,
            discount_objection_detected: true,
            discount_objection_at: new Date().toISOString(),
          },
        })
        .eq('id', conversa.id);
    }
    
    return {
      handled: false,
      shouldContinue: true,
      action: 'discount_objection_bypass',
      status: 'discount_objection_detected',
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // CHECK 7: Existing client detection (keywords + AI)
  // ═══════════════════════════════════════════════════════════════
  if (!skipCheck.shouldSkip && agentTriageRules.shouldTriggerTriage && !isDiscountObjection) {
    
    // MarIA redirect (new sale intent)
    if (agentTriageRules.isMariaRedirect) {
      const redirectResult = await handleMariaToSofiaRedirect({
        supabase,
        conversaId: conversa?.id || null,
        phone,
        clienteNome,
        messageText,
        messageId,
        existingDados,
        sendMessage: sendWhatsAppMessage,
      });

      return {
        handled: true,
        action: 'maria_to_sofia_redirect',
        status: redirectResult.status,
        response: new Response(JSON.stringify({
          status: redirectResult.status,
          reason: 'new_sale_intent',
          contactFound: redirectResult.contactFound,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }),
      };
    }

    // Full intent detection (keywords + AI for subtle cases)
    const intentDetection = await detectExistingClientIntentFull(messageText, existingDados);

    if (intentDetection.detected) {
      console.log(`[TRIAGE_PHASE] Intent detected: ${intentDetection.source} | Category: ${intentDetection.category}`);

      // ═══════════════════════════════════════════════════════════════
      // CHECK 7a: Contextual lookup (for patterns like "andamento")
      // ═══════════════════════════════════════════════════════════════
      if (intentDetection.needsContextLookup) {
        console.log(`[TRIAGE_PHASE] Pattern needs contextual lookup`);

        const patterns = detectionPatterns || await loadDetectionPatterns(supabase);
        const contextResolution = await resolveContextualIntent(
          supabase,
          phone,
          conversa ? {
            proposta_id: conversa.proposta_id,
            dados_coletados: conversa.dados_coletados || null,
            bitrix24_stage: conversa.bitrix24_stage,
          } : null,
          patterns
        );

        console.log(`[TRIAGE_PHASE] Context resolution: needsClarification=${contextResolution.needsClarification}, inferredContext=${contextResolution.inferredContext}`);

        if (!contextResolution.needsClarification) {
          // Context found - respond directly without full triage
          const contextualResult = await handleContextualResponse({
            supabase,
            conversa: conversa ? {
              id: conversa.id,
              dados_coletados: conversa.dados_coletados || null,
              proposta_id: conversa.proposta_id,
              bitrix24_stage: conversa.bitrix24_stage,
            } : null,
            phone,
            clienteNome,
            contextResolution,
            sendMessage: sendWhatsAppMessage,
          });

          if (contextualResult.handled) {
            return {
              handled: true,
              action: 'contextual_response',
              status: contextualResult.status,
              response: new Response(JSON.stringify({
                status: contextualResult.status,
                detectionSource: 'contextual_lookup',
                inferredContext: contextResolution.inferredContext,
                reason: contextResolution.reason,
              }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              }),
            };
          }
        }

        // Needs clarification - ask clarification question
        console.log(`[TRIAGE_PHASE] Starting clarification flow`);
        const clarificationMessage = generateClarificationQuestion(clienteNome);
        await sendWhatsAppMessage(phone, clarificationMessage);

        // Update/create conversation with aguardando_clarificacao state
        if (conversa?.id) {
          await supabase.from('chatbot_mensagens').insert([
            { conversa_id: conversa.id, role: 'user', content: messageText, message_id: messageId },
            { conversa_id: conversa.id, role: 'assistant', content: clarificationMessage },
          ]);
        // CRITICAL FIX: Merge existingDados with preExtractedData to preserve collected data
        // This prevents losing valorFatura, email, distribuidora when entering triage
        const mergedDadosForUpdate = {
          ...existingDados,
          ...(preExtractedData || {}),
          triagem_state: 'aguardando_clarificacao',
          triagem_trigger_keyword: intentDetection.triggerKeyword,
          triagem_original_message: messageText,
        };
        
        console.log(`[TRIAGE_PHASE] Preserving data during clarification: valorFatura=${mergedDadosForUpdate.valorFatura}, email=${mergedDadosForUpdate.email}, distribuidora=${mergedDadosForUpdate.distribuidora}`);
        
        await supabase
            .from('chatbot_conversas')
            .update({
              dados_coletados: mergedDadosForUpdate,
              last_message_at: new Date().toISOString(),
              last_sofia_message_at: new Date().toISOString(),
            })
            .eq('id', conversa.id);
        } else {
          // Create new conversation for clarification
          // CRITICAL FIX: Include preExtractedData to preserve any data from the first message
          const sessionId = crypto.randomUUID();
          const initialDados = {
            ...(preExtractedData || {}),
            triagem_state: 'aguardando_clarificacao',
            triagem_trigger_keyword: intentDetection.triggerKeyword,
            triagem_original_message: messageText,
          };
          
          console.log(`[TRIAGE_PHASE] Creating conversation with extracted data: valorFatura=${initialDados.valorFatura}, email=${initialDados.email}, distribuidora=${initialDados.distribuidora}`);
          
          await supabase.from('chatbot_conversas').insert({
            session_id: sessionId,
            cliente_telefone: phone,
            cliente_nome: clienteNome,
            agent_id: agentId,
            lead_source: 'whatsapp_inbound',
            whatsapp_provider: 'zapi',
            ab_variant: getABVariant(sessionId),
            dados_coletados: initialDados,
          });
        }

        return {
          handled: true,
          action: 'contextual_clarification',
          status: 'contextual_clarification_asked',
          response: new Response(JSON.stringify({
            status: 'contextual_clarification_asked',
            detectionSource: 'contextual_lookup',
            needsClarification: true,
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }),
        };
      }

      // ═══════════════════════════════════════════════════════════════
      // CHECK 7b: Standard triage flow (non-contextual patterns)
      // ═══════════════════════════════════════════════════════════════
      const extractedEnergyData = extractDataFromText(messageText, existingDados);
      console.log(`[TRIAGE_PHASE] Extracted energy data:`, extractedEnergyData);

      const startTriageResult = await startTriageFlow({
        supabase,
        phone,
        clienteNome,
        messageText,
        messageId,
        conversa: conversa ? {
          id: conversa.id,
          dados_coletados: conversa.dados_coletados || null,
          proposta_id: conversa.proposta_id,
          bitrix24_stage: conversa.bitrix24_stage,
        } : null,
        intentDetection,
        extractedEnergyData,
        agentId,
        sendMessage: sendWhatsAppMessage,
        getABVariant,
      });

      if (startTriageResult.handled) {
        return {
          handled: true,
          action: 'start_triage',
          status: startTriageResult.status,
          conversaId: startTriageResult.conversaId,
          response: new Response(JSON.stringify({
            status: startTriageResult.status,
            conversaId: startTriageResult.conversaId,
            detectionSource: intentDetection.source,
            category: intentDetection.category,
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }),
        };
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // NO TRIAGE NEEDED - Continue to next phase
  // ═══════════════════════════════════════════════════════════════
  console.log(`[TRIAGE_PHASE] No triage action needed - continuing to next phase`);
  
  return {
    handled: false,
    shouldContinue: true,
    action: 'pass_through',
    status: 'no_triage_needed',
  };
}

/**
 * Check if triage phase should be executed
 * Quick pre-check without full execution
 */
export function shouldExecuteTriagePhase(
  conversa: TriagePhaseConversaData | null,
  crmContext?: CRMLeadContext
): { shouldExecute: boolean; reason: string } {
  // Has active triage state
  const triageState = (conversa?.dados_coletados as any)?.triagem_state;
  if (triageState) {
    return { shouldExecute: true, reason: 'has_active_triage_state' };
  }

  // CRM says skip
  if (crmContext?.shouldSkipTriage) {
    return { shouldExecute: false, reason: 'crm_skip_triage' };
  }

  // Has commercial data (triage not needed)
  const dados = (conversa?.dados_coletados as any) || {};
  if (dados.distribuidora || dados.valorFatura || conversa?.proposta_id) {
    return { shouldExecute: false, reason: 'has_commercial_context' };
  }

  // Default: should check for triage triggers
  return { shouldExecute: true, reason: 'needs_detection' };
}
