/**
 * Triage Flow Handler - Complete triage state machine implementation
 * Extracted from sofia-webhook/index.ts (Phase 8 refactoring)
 * 
 * Handles the complete triage flow:
 * 1. Detect existing client intent (keywords + AI)
 * 2. Ask: "Already a client" (1) or "Want to become client" (2)
 * 3. If existing: Ask department (Financeiro, Pós-venda, Fatura, Atendimento)
 * 4. Redirect to appropriate COESA contact
 * 
 * Uses maria-triage.ts for helper functions and templates
 * 
 * NOTE: This module uses the centralized Message Bus for persistence.
 * @see message-bus.ts for the unified message persistence layer
 */

import {
  checkTriagemResponse,
  getDepartmentContactId,
  getDepartmentDisplayName,
  getCoesaContact,
  formatWhatsAppLink,
  generateDepartmentSelectionMessage,
  generateReturnToCommercialMessage,
  matchesContextualPattern,
  resolveContextualIntent,
  generateClarificationQuestion,
  generateHistoricalProposalMessage,
  type TriagemState,
  type TriagemDepartment,
  type TriagemResponse,
  type CoesaContact,
  type ContextualResolution,
} from './maria-triage.ts';

import { 
  getRenderedTemplate, 
  getTemplateCache, 
  getTriageFallbackMessage,
  type MessageTemplate 
} from './message-templates.ts';

import {
  publishConversationPair,
  publishAssistantMessage,
  type HandlerType,
} from './message-bus.ts';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface TriageFlowParams {
  supabase: any;
  conversaId: string;
  phone: string;
  clienteNome: string | null;
  messageText: string;
  messageId: string | null;
  conversa: TriageConversaData | null;
  agentConfig?: { name?: string; role?: string } | null;
  sendMessage: (phone: string, msg: string) => Promise<void>;
  extractDataFromText: (text: string, existingDados: any) => any;
}

export interface TriageConversaData {
  id: string;
  dados_coletados?: Record<string, any> | null;
  proposta_id?: string | null;
  bitrix24_stage?: string | null;
}

export interface TriageFlowResult {
  handled: boolean;
  status: string;
  conversaId?: string;
  department?: TriagemDepartment;
  isNewClient?: boolean;
  extractedData?: any;
  contactFound?: boolean;
  attempts?: number;
}

export interface TriageLockResult {
  skip: boolean;
  reason: string | null;
}

// ═══════════════════════════════════════════════════════════════
// TRIAGE LOCK CHECK
// ═══════════════════════════════════════════════════════════════

/**
 * Check if triage should be skipped for this conversation
 * Prevents triage restart for leads already in sales flow
 * ENHANCED: Now checks human_intervention_completed flag
 */
export function checkTriageLock(conversa: TriageConversaData | null): TriageLockResult {
  if (!conversa) return { skip: false, reason: null };
  
  const dados = conversa.dados_coletados || {};
  
  // 0. CRITICAL: Skip if returning from human intervention
  if (dados.human_intervention_completed === true) {
    return { skip: true, reason: 'human_intervention_completed' };
  }
  
  // 0b. Skip if context was just restored
  if (dados.context_restored_at) {
    return { skip: true, reason: 'context_restored' };
  }
  
  // 1. Has proposta_id (in sales funnel)
  if (conversa.proposta_id) {
    return { skip: true, reason: 'has_proposta_id' };
  }
  
  // 2. Active Bitrix stage past initial stages
  const stage = conversa.bitrix24_stage;
  if (stage && stage !== 'NEW' && stage !== 'UC_9SLRPP') {
    return { skip: true, reason: `active_bitrix_stage:${stage}` };
  }
  
  // 3. Has significant commercial data
  if (dados.distribuidora || dados.distribuidoraInformada || dados.valorFatura || dados.valorConta || dados.valor_fatura) {
    return { skip: true, reason: 'has_commercial_data' };
  }
  
  // 4. Already completed triage
  if (dados.triagem_concluida === true) {
    return { skip: true, reason: 'triagem_already_completed' };
  }
  
  // 5. Is marked as new client
  if (dados.is_new_client === true) {
    return { skip: true, reason: 'is_new_client' };
  }
  
  return { skip: false, reason: null };
}

// ═══════════════════════════════════════════════════════════════
// MAIN TRIAGE FLOW HANDLER
// ═══════════════════════════════════════════════════════════════

/**
 * Handle the complete triage state machine
 * Returns handled:true if triage consumed the message
 */
export async function handleTriageFlow(
  params: TriageFlowParams
): Promise<TriageFlowResult> {
  const {
    supabase,
    conversaId,
    phone,
    clienteNome,
    messageText,
    messageId,
    conversa,
    agentConfig,
    sendMessage,
    extractDataFromText,
  } = params;
  
  if (!conversa) {
    return { handled: false, status: 'no_conversa' };
  }
  
  const dados = conversa.dados_coletados || {};
  const currentTriagemState = dados.triagem_state as TriagemState || null;
  const templates = getTemplateCache() || undefined;
  // CRITICAL: Active triage flows must NEVER be blocked by CRM/lock guardrails.
  // Those gates are only allowed to prevent STARTING triage, not continuing it.
  const bypassGuardsForActiveTriage = !!currentTriagemState;
  
  // ═══════════════════════════════════════════════════════════════
  // GUARDRAIL #0 (NEW): CRM Pre-Check Gate
  // Block triage if CRM context indicates advanced stage
  // ═══════════════════════════════════════════════════════════════
  const crmContext = dados._crm_context as {
    shouldSkipTriage?: boolean;
    stage?: string;
    stageName?: string;
    recommendedMode?: string;
  } | undefined;
  
  if (!bypassGuardsForActiveTriage && crmContext?.shouldSkipTriage) {
    console.log(`[TRIAGE_FLOW] ⛔ BLOCKED by CRM pre-check | Stage: ${crmContext.stageName || crmContext.stage} | Mode: ${crmContext.recommendedMode}`);
    return {
      handled: false,
      status: 'triage_skipped_by_crm',
    };
  }

  if (bypassGuardsForActiveTriage && crmContext?.shouldSkipTriage) {
    console.log(`[TRIAGE_FLOW] 🔓 BYPASS CRM gate: Active triage state="${currentTriagemState}" | Stage: ${crmContext.stageName || crmContext.stage}`);
  }
  
  // ═══════════════════════════════════════════════════════════════
  // GUARDRAIL #5: Skip triage when third-party context is detected
  // Examples: "casa do sogro", "conta da minha mãe", "na casa dele"
  // These indicate valid commercial interest, not existing client
  // ═══════════════════════════════════════════════════════════════
  const THIRD_PARTY_CONTEXT_PATTERNS = [
    /\b(casa|conta|luz|energia)\s+(do|da|de)\s+(sogro|sogra|meu\s+pai|minha\s+m[aã]e|minha\s+av[oó]|meu\s+av[oô]|marido|esposa|irm[aã]o|irm[aã])/i,
    /\b(na\s+casa|la\s+em\s+casa)\s+(dele|dela|deles|delas)/i,
    /\btem\s+na\s+casa\s+de\b/i,
    /\b(vem|fica|da)\s+(em\s+)?m[eé]dia\s+(de\s+)?r?\$?\s*\d/i,
    /\bm[eé]dia\s+de\s+r?\$\s*\d/i,
    /\ba\s+conta\s+[eé]\s+de\b/i,
    /\b(quero|gostaria|preciso)\s+(saber|conhecer|entender).{0,30}(desconto|economia|energia)/i,
    /\br?\$\s*\d{2,4}([.,]\d{2})?\s*(reais|por\s+m[eê]s)?/i,
  ];
  
  const hasThirdPartyContext = THIRD_PARTY_CONTEXT_PATTERNS.some(pattern => pattern.test(messageText));
  
  if (hasThirdPartyContext && currentTriagemState) {
    console.log(`[TRIAGE_FLOW] ✅ Third-party/commercial context detected - bypassing triage for: "${messageText.slice(0, 100)}"`);
    
    // Extract any commercial data from the message
    const extractedFromMessage = extractDataFromText(messageText, dados);
    
    // Mark triage as complete and proceed as new client
    const updatedDados = {
      ...dados,
      ...extractedFromMessage,
      triagem_state: null,
      triagem_concluida: true,
      is_new_client: true,
      triagem_resolved_by: 'third_party_context_bypass',
    };
    
    await supabase
      .from('chatbot_conversas')
      .update({ dados_coletados: updatedDados })
      .eq('id', conversaId);
    
    console.log(`[TRIAGE_FLOW] Triage bypassed - treating as new commercial lead`);
    return { 
      handled: false, 
      status: 'third_party_context_bypass',
      isNewClient: true,
      extractedData: extractedFromMessage,
    };
  }
  
  // ═══════════════════════════════════════════════════════════════
  // PHASE 4 FIX: Guard against triage when commercial context exists
  // CRITICAL: Preserve existing data context - never reset/lose data
  // ENHANCED: Also check human_intervention_completed
  // ═══════════════════════════════════════════════════════════════
  const hasCommercialContext = 
    dados.distribuidora || 
    dados.distribuidoraInformada ||
    dados.valorFatura || 
    dados.valor_fatura ||
    dados.consumo ||
    dados.email ||
    dados.cpf ||
    dados.cnpj ||
    conversa.proposta_id ||
    dados.proposta_id ||
    dados.human_intervention_completed === true ||
    dados.context_restored_at ||
    dados.is_new_client === true;
  
  if (!bypassGuardsForActiveTriage && hasCommercialContext) {
    console.log(`[TRIAGE_FLOW] ⛔ BLOCKED: Commercial/human context exists - preserving data`, {
      distribuidora: dados.distribuidora || dados.distribuidoraInformada,
      valorFatura: dados.valorFatura || dados.valor_fatura,
      proposta_id: conversa.proposta_id || dados.proposta_id,
      human_intervention_completed: dados.human_intervention_completed,
      is_new_client: dados.is_new_client,
    });
    return { handled: false, status: 'commercial_context_preserved' };
  }

  if (bypassGuardsForActiveTriage && hasCommercialContext) {
    console.log(`[TRIAGE_FLOW] 🔓 BYPASS commercial-context gate: Active triage state="${currentTriagemState}" - continuing triage`);
  }
  
  // Check triage lock (legacy check)
  // IMPORTANT: Only allowed to block START of triage, never an active flow.
  const lockResult = checkTriageLock(conversa);
  if (!bypassGuardsForActiveTriage && lockResult.skip) {
    console.log(`[TRIAGE_FLOW] ⛔ Locked: ${lockResult.reason}`);
    return { handled: false, status: 'locked', conversaId };
  }

  if (bypassGuardsForActiveTriage && lockResult.skip) {
    console.log(`[TRIAGE_FLOW] 🔓 BYPASS lock: Active triage state="${currentTriagemState}" | reason=${lockResult.reason}`);
  }
  
  // No active triage state
  if (!currentTriagemState) {
    return { handled: false, status: 'no_active_state' };
  }
  
  console.log(`[TRIAGE_FLOW] Current state: ${currentTriagemState}`);
  
  const triagemResponse = checkTriagemResponse(messageText, currentTriagemState);
  
  // ═══════════════════════════════════════════════════════════════
  // STATE: aguardando_confirmacao_cliente
  // ═══════════════════════════════════════════════════════════════
  if (currentTriagemState === 'aguardando_confirmacao_cliente') {
    // Check if client provided commercial data (implicit new client)
    const extractedFromResponse = extractDataFromText(messageText, dados);
    
    const hasCommercialData = 
      extractedFromResponse.distribuidora ||
      extractedFromResponse.valorFatura ||
      extractedFromResponse.consumo ||
      extractedFromResponse.tipoInstalacao ||
      extractedFromResponse.email;
    
    if (hasCommercialData) {
      console.log(`[TRIAGE_FLOW] ✅ Commercial data in response - treating as NEW CLIENT`);
      
      const welcomeMessage = generateReturnToCommercialMessage(messageText, clienteNome, agentConfig, templates);
      await sendMessage(phone, welcomeMessage);
      
      // Use centralized Message Bus
      await publishConversationPair(supabase, conversaId, messageText, welcomeMessage, messageId, 'triage');
      
      const updatedDados = {
        ...dados,
        ...extractedFromResponse,
        triagem_state: null,
        triagem_concluida: true,
        is_new_client: true,
        triagem_cliente_confirmou: false,
        triagem_resolved_by: 'commercial_data_implicit',
      };
      
      await supabase
        .from('chatbot_conversas')
        .update({
          dados_coletados: updatedDados,
          last_message_at: new Date().toISOString(),
          last_sofia_message_at: new Date().toISOString(),
        })
        .eq('id', conversaId);
      
      return {
        handled: true,
        status: 'triagem_new_client_implicit',
        conversaId,
        isNewClient: true,
        extractedData: extractedFromResponse,
      };
    }
    
    // Client confirmed existing
    if (triagemResponse.confirmedExisting === true) {
      console.log(`[TRIAGE_FLOW] Client confirmed existing - redirecting to SAC (direct)`);

      // IMPORTANT: Message requested by operator - keep wording exactly as specified.
      const sacPhone = '+55 31 98440-0889';
      const defaultSacMessage = `Bom dia, para atendimento para você, nosso cliente, favor entrar em contato com o SAC, clicando aqui: ${sacPhone}`;
      const sacMessage = getRenderedTemplate(
        'triage',
        'existing_client_sac_redirect',
        { sac_phone: sacPhone },
        templates,
        defaultSacMessage,
      );

      await sendMessage(phone, sacMessage);
      await publishConversationPair(supabase, conversaId, messageText, sacMessage, messageId, 'triage');

      const updatedDados = {
        ...dados,
        triagem_state: 'triagem_concluida',
        triagem_concluida: true,
        is_existing_client: true,
        triagem_cliente_confirmou: true,
        triagem_resolved_by: 'existing_client_sac_redirect',
        sac_phone: sacPhone,
      };

      await supabase
        .from('chatbot_conversas')
        .update({
          dados_coletados: updatedDados,
          last_message_at: new Date().toISOString(),
          last_sofia_message_at: new Date().toISOString(),
          sofia_mode: 'sac_redirect',
          escalation_reason: 'Cliente existente - direcionado ao SAC (fluxo automático)',
          escalated_at: new Date().toISOString(),
          next_followup_at: null,
          next_nudge_at: null,
          next_rescue_at: null,
          awaiting_response: false,
        })
        .eq('id', conversaId);

      return {
        handled: true,
        status: 'triagem_existing_client_sac_redirect',
        conversaId,
        department: 'atendimento',
        contactFound: true,
      };
    }
    
    // Client wants to be NEW client
    if (triagemResponse.confirmedExisting === false) {
      console.log(`[TRIAGE_FLOW] Client wants to be NEW client`);
      
      const originalMessage = dados.triagem_original_message || messageText;
      const welcomeMessage = generateReturnToCommercialMessage(originalMessage, clienteNome, agentConfig, templates);
      
      await sendMessage(phone, welcomeMessage);
      
      // Use centralized Message Bus
      await publishConversationPair(supabase, conversaId, messageText, welcomeMessage, messageId, 'triage');
      
      // Extract data from original message
      const extractedFromOriginal = extractDataFromText(originalMessage, dados);
      
      const updatedDados = {
        ...dados,
        ...extractedFromOriginal,
        triagem_state: null,
        triagem_concluida: true,
        is_new_client: true,
        triagem_cliente_confirmou: false,
      };
      
      await supabase
        .from('chatbot_conversas')
        .update({
          dados_coletados: updatedDados,
          last_message_at: new Date().toISOString(),
          last_sofia_message_at: new Date().toISOString(),
        })
        .eq('id', conversaId);
      
      return {
        handled: true,
        status: 'triagem_new_client',
        conversaId,
        isNewClient: true,
      };
    }
    
    // Ambiguous response - re-ask
    console.log(`[TRIAGE_FLOW] Ambiguous response - re-asking`);
    
    const firstName = (clienteNome || '').split(' ')[0];
    const clarificationMessage = `${firstName ? firstName + ', desculpa' : 'Desculpa'}, não entendi bem! 😅

Você *já é cliente* da COESA Energia ou *quer conhecer* nosso desconto na conta de luz?

1️⃣ Já sou cliente
2️⃣ Quero ser cliente`;
    
    await sendMessage(phone, clarificationMessage);
    
    // Use centralized Message Bus
    await publishConversationPair(supabase, conversaId, messageText, clarificationMessage, messageId, 'triage');
    
    const triageAttempts = (dados.triagem_attempts || 0) + 1;
    
    // After 1 attempt, assume new client (was 2 - reduced to prevent loop)
    if (triageAttempts >= 1) {
      console.log(`[TRIAGE_FLOW] 1+ attempts - assuming NEW CLIENT (anti-loop fix)`);
      
      const assumeNewMessage = `Entendi! Vou te ajudar a conhecer nosso desconto na conta de luz! 💚

Me conta: qual é a sua *distribuidora* (ex: CEMIG, CPFL) e o *valor médio* da sua conta de luz hoje?`;
      
      await sendMessage(phone, assumeNewMessage);
      
      // Use centralized Message Bus
      await publishAssistantMessage(supabase, conversaId, assumeNewMessage, 'triage');
      
      const updatedDados = {
        ...dados,
        triagem_state: null,
        triagem_concluida: true,
        is_new_client: true,
        triagem_resolved_by: 'ambiguous_assume_new',
      };
      
      await supabase
        .from('chatbot_conversas')
        .update({
          dados_coletados: updatedDados,
          last_message_at: new Date().toISOString(),
          last_sofia_message_at: new Date().toISOString(),
        })
        .eq('id', conversaId);
      
      return {
        handled: true,
        status: 'triagem_assume_new_client',
        conversaId,
        isNewClient: true,
        attempts: triageAttempts,
      };
    }
    
    // Increment attempts
    await supabase
      .from('chatbot_conversas')
      .update({
        dados_coletados: { ...dados, triagem_attempts: triageAttempts },
        last_message_at: new Date().toISOString(),
        last_sofia_message_at: new Date().toISOString(),
      })
      .eq('id', conversaId);
    
    return {
      handled: true,
      status: 'triagem_clarification_asked',
      conversaId,
      attempts: triageAttempts,
    };
  }
  
  // ═══════════════════════════════════════════════════════════════
  // STATE: aguardando_departamento
  // ═══════════════════════════════════════════════════════════════
  if (currentTriagemState === 'aguardando_departamento') {
    const dept = triagemResponse.departmentSelected;
    
    if (dept) {
      console.log(`[TRIAGE_FLOW] Department selected: ${dept}`);
      
      const contactId = getDepartmentContactId(dept);
      const contact = await getCoesaContact(supabase, contactId);
      const deptDisplayName = getDepartmentDisplayName(dept);
      
      let redirectMessage: string;
      
      if (contact) {
        const waLink = formatWhatsAppLink(contact.telefone);
        
        const specificTemplate = getRenderedTemplate('triage', dept, { 
          contact_name: contact.nome, 
          whatsapp_link: waLink 
        }, templates);
        
        if (specificTemplate) {
          redirectMessage = specificTemplate;
        } else {
          redirectMessage = getRenderedTemplate('triage', 'default', { 
            contact_name: contact.nome, 
            whatsapp_link: waLink 
          }, templates) ||
            `Entendido! 📞\n\nVou te transferir para nosso *${contact.nome}*.\n\n📞 Clique aqui para ser atendido:\n${waLink}`;
        }
      } else {
        // Fallback if contact not configured - use dynamic template
        redirectMessage = getTriageFallbackMessage(deptDisplayName, templates) ||
          `Para atendimento ${deptDisplayName}, por favor aguarde enquanto direcionamos sua solicitação. Um de nossos atendentes entrará em contato em breve! 💚`;
      }
      
      await sendMessage(phone, redirectMessage);
      
      await publishConversationPair(supabase, conversaId, messageText, redirectMessage, messageId, 'triage');
      
      const updatedDados = {
        ...dados,
        triagem_state: 'triagem_concluida',
        triagem_concluida: true,
        is_existing_client: true,
        departamento_redirecionado: dept,
        departamento_contact_id: contactId,
      };
      
      await supabase
        .from('chatbot_conversas')
        .update({
          dados_coletados: updatedDados,
          last_message_at: new Date().toISOString(),
          last_sofia_message_at: new Date().toISOString(),
          sofia_mode: 'sac_redirect',
          escalation_reason: `Cliente existente redirecionado para ${deptDisplayName}`,
          escalated_at: new Date().toISOString(),
          next_followup_at: null,
          next_nudge_at: null,
          next_rescue_at: null,
          awaiting_response: false,
        })
        .eq('id', conversaId);
      
      return {
        handled: true,
        status: 'triagem_redirect_complete',
        conversaId,
        department: dept,
        contactFound: !!contact,
      };
    }
    
    // No department selected - fall through to AI processing
    return { handled: false, status: 'no_department_selected' };
  }
  
  // ═══════════════════════════════════════════════════════════════
  // STATE: aguardando_clarificacao (PHASE: Error #1 - Contextual clarification)
  // Client was asked about their context (proposal vs contract vs other)
  // ═══════════════════════════════════════════════════════════════
  if (currentTriagemState === 'aguardando_clarificacao') {
    const msgLower = messageText.toLowerCase().trim();
    
    // Check response: 1 = proposal, 2 = contract, 3 = other
    if (msgLower === '1' || msgLower.includes('proposta') || msgLower.includes('comercial')) {
      console.log(`[TRIAGE_FLOW] Clarification: Client chose PROPOSAL context`);
      
      // Check if we have a proposal to show
      const proposalUrl = dados.historical_proposal_url || dados.proposal_url;
      
      let responseMessage: string;
      if (proposalUrl) {
        responseMessage = `Perfeito! 📋\n\nAqui está o link da sua proposta:\n${proposalUrl}\n\nSe tiver alguma dúvida sobre os valores ou condições, é só me perguntar! 😊`;
      } else {
        responseMessage = `Entendi! Vou verificar o status da sua proposta.\n\nPode me informar o e-mail ou CPF cadastrado para eu localizar? 📧`;
      }
      
      await sendMessage(phone, responseMessage);
      
      await publishConversationPair(supabase, conversaId, messageText, responseMessage, messageId, 'triage');
      
      const updatedDados = {
        ...dados,
        triagem_state: null,
        triagem_concluida: true,
        clarification_response: 'proposal',
      };
      
      await supabase
        .from('chatbot_conversas')
        .update({
          dados_coletados: updatedDados,
          last_message_at: new Date().toISOString(),
          last_sofia_message_at: new Date().toISOString(),
        })
        .eq('id', conversaId);
      
      return {
        handled: true,
        status: 'clarification_proposal',
        conversaId,
      };
    }
    
    if (msgLower === '2' || msgLower.includes('contrato') || msgLower.includes('homologação') || msgLower.includes('homologacao')) {
      console.log(`[TRIAGE_FLOW] Clarification: Client chose CONTRACT context - redirect to pos_venda`);
      
      // Redirect to pos_venda department
      const contactId = getDepartmentContactId('pos_venda');
      const contact = await getCoesaContact(supabase, contactId);
      
      let redirectMessage: string;
      if (contact) {
        const waLink = formatWhatsAppLink(contact.telefone);
        redirectMessage = `Entendido! Para acompanhamento do seu contrato, vou te transferir para o Pós-Venda. 📞\n\nClique aqui: ${waLink}\n(${contact.nome})`;
      } else {
        redirectMessage = `Entendido! Para acompanhamento do seu contrato, nossa equipe de Pós-Venda vai te ajudar. Aguarde um momento que vamos te direcionar! 💚`;
      }
      
      await sendMessage(phone, redirectMessage);
      
      await publishConversationPair(supabase, conversaId, messageText, redirectMessage, messageId, 'triage');
      
      const updatedDados = {
        ...dados,
        triagem_state: 'triagem_concluida',
        triagem_concluida: true,
        is_existing_client: true,
        clarification_response: 'contract',
        departamento_redirecionado: 'pos_venda',
      };
      
      await supabase
        .from('chatbot_conversas')
        .update({
          dados_coletados: updatedDados,
          last_message_at: new Date().toISOString(),
          last_sofia_message_at: new Date().toISOString(),
          sofia_mode: 'sac_redirect',
          escalation_reason: 'Cliente existente - acompanhamento de contrato',
          escalated_at: new Date().toISOString(),
        })
        .eq('id', conversaId);
      
      return {
        handled: true,
        status: 'clarification_contract_redirect',
        conversaId,
        department: 'pos_venda',
        contactFound: !!contact,
      };
    }
    
    if (msgLower === '3' || msgLower.includes('outra') || msgLower.includes('outro') || msgLower.includes('pagamento') || msgLower.includes('suporte')) {
      console.log(`[TRIAGE_FLOW] Clarification: Client chose OTHER context - show department menu`);
      
      const departmentMessage = generateDepartmentSelectionMessage(templates);
      await sendMessage(phone, departmentMessage);
      
      await publishConversationPair(supabase, conversaId, messageText, departmentMessage, messageId, 'triage');
      
      const updatedDados = {
        ...dados,
        triagem_state: 'aguardando_departamento',
        clarification_response: 'other',
        triagem_cliente_confirmou: true,
      };
      
      await supabase
        .from('chatbot_conversas')
        .update({
          dados_coletados: updatedDados,
          last_message_at: new Date().toISOString(),
          last_sofia_message_at: new Date().toISOString(),
        })
        .eq('id', conversaId);
      
      return {
        handled: true,
        status: 'clarification_other_to_department',
        conversaId,
      };
    }
    
    // Unclear response - repeat clarification
    const firstName = (clienteNome || '').split(' ')[0];
    const repeatMessage = `${firstName ? firstName + ', desculpa' : 'Desculpa'}, não entendi! 😅

Você quer saber sobre:

1️⃣ Uma *proposta comercial*
2️⃣ Seu *contrato* (homologação, créditos)
3️⃣ *Outra questão* (pagamentos, suporte)

_Digite 1, 2 ou 3!_`;
    
    await sendMessage(phone, repeatMessage);
    
    await publishConversationPair(supabase, conversaId, messageText, repeatMessage, messageId, 'triage');
    
    return {
      handled: true,
      status: 'clarification_repeat',
      conversaId,
    };
  }
  
  // ═══════════════════════════════════════════════════════════════
  // CRITICAL: FALLBACK FOR ACTIVE TRIAGE STATES NOT HANDLED
  // This is the "cláusula pétrea" - NEVER leave client without response
  // ═══════════════════════════════════════════════════════════════
  if (currentTriagemState) {
    console.error(`[TRIAGE_FLOW] ⚠️ FALLBACK TRIGGERED: State "${currentTriagemState}" not processed - escalating to human`, {
      conversaId,
      phone,
      messageText: messageText.slice(0, 100),
      dados: JSON.stringify(dados).slice(0, 200),
    });
    
    // Send fallback message to client
    const firstName = (clienteNome || '').split(' ')[0];
    const fallbackMessage = getRenderedTemplate('triage', 'state_not_handled_fallback', {}, templates) ||
      `${firstName ? firstName + ', desculpa' : 'Desculpa'}, não consegui processar sua resposta. 😅\n\nVou te transferir para um atendente humano que vai te ajudar melhor! Aguarde um momento... 💚`;
    
    await sendMessage(phone, fallbackMessage);
    
    // Log the fallback message
    await publishConversationPair(supabase, conversaId, messageText, fallbackMessage, messageId, 'triage');
    
    // Escalate to human - mark as failed triage
    const updatedDados = {
      ...dados,
      triagem_state: null,
      triagem_falhou: true,
      triagem_fallback_reason: `Estado "${currentTriagemState}" não processado`,
      triagem_fallback_at: new Date().toISOString(),
      triagem_fallback_message: messageText.slice(0, 200),
    };
    
    await supabase
      .from('chatbot_conversas')
      .update({
        dados_coletados: updatedDados,
        escalation_reason: `Triagem não processada no estado ${currentTriagemState}`,
        escalated_at: new Date().toISOString(),
        sofia_mode: 'paused_for_human',
        last_message_at: new Date().toISOString(),
        last_sofia_message_at: new Date().toISOString(),
        awaiting_response: false,
        // Clear scheduled follow-ups
        next_followup_at: null,
        next_nudge_at: null,
        next_rescue_at: null,
      })
      .eq('id', conversaId);
    
    return { 
      handled: true, 
      status: 'triagem_fallback_escalation',
      conversaId,
    };
  }
  
  return { handled: false, status: 'unhandled_state' };
}

// ═══════════════════════════════════════════════════════════════
// AGENT-SPECIFIC TRIAGE RULES - Phase 33
// ═══════════════════════════════════════════════════════════════

/**
 * Keywords that indicate client wants NEW SALE (not SAC/Financial support)
 */
export const NEW_SALE_KEYWORDS = [
  'quero ser cliente', 'quero aderir', 'quero contratar', 'quero assinar',
  'como funciona o desconto', 'como economizar', 'quero economizar',
  'quero conhecer', 'quero saber mais', 'nova proposta', 'fazer proposta',
  'simular', 'simulação', 'simulacao', 'me interessei', 'tenho interesse',
  'quero o desconto', 'quero desconto na conta', 'quero reduzir minha conta',
  'novo cliente', 'virar cliente', 'tornar cliente', 'me tornar cliente',
  'quanto posso economizar', 'qual o desconto', 'fazer adesão', 'fazer adesao',
  'proposta comercial', 'proposta de desconto', 'quero uma proposta',
];

/**
 * Check if message indicates intent to become a new client
 */
export function wantsNewSale(messageText: string): boolean {
  const lower = messageText.toLowerCase();
  return NEW_SALE_KEYWORDS.some(kw => lower.includes(kw));
}

export interface AgentTriageRulesResult {
  shouldTriggerTriage: boolean;
  isMariaRedirect: boolean;
  reason: string;
}

/**
 * Check agent-specific triage rules
 * - sofIA (vendas): Normal triage for non-commercial intents
 * - marIA (SAC): Only triage when client wants NEW SALE → redirect to sofIA
 * - julIA (cobrança): No triage (outbound)
 */
export function checkAgentTriageRules(
  agentId: string,
  messageText: string
): AgentTriageRulesResult {
  const isMariaAgent = agentId === 'maria';
  const isSofiaAgent = agentId === 'sofia';
  const wantsNew = wantsNewSale(messageText);
  
  // marIA: Only trigger triage when client wants NEW SALE
  if (isMariaAgent) {
    if (wantsNew) {
      return {
        shouldTriggerTriage: true,
        isMariaRedirect: true,
        reason: 'maria_new_sale_redirect',
      };
    }
    // marIA handles SAC directly - no triage
    return {
      shouldTriggerTriage: false,
      isMariaRedirect: false,
      reason: 'maria_direct_sac',
    };
  }
  
  // sofIA: Normal triage detection
  if (isSofiaAgent) {
    return {
      shouldTriggerTriage: true,
      isMariaRedirect: false,
      reason: 'sofia_normal_triage',
    };
  }
  
  // Other agents (julIA etc): No triage
  return {
    shouldTriggerTriage: false,
    isMariaRedirect: false,
    reason: 'other_agent_no_triage',
  };
}

export interface MariaRedirectParams {
  supabase: any;
  conversaId: string | null;
  phone: string;
  clienteNome: string | null;
  messageText: string;
  messageId: string | null;
  existingDados: Record<string, any>;
  sendMessage: (phone: string, msg: string) => Promise<void>;
}

export interface MariaRedirectResult {
  handled: boolean;
  status: string;
  conversaId?: string;
  contactFound?: boolean;
}

/**
 * Handle marIA redirect to sofIA when client wants new sale
 */
export async function handleMariaToSofiaRedirect(
  params: MariaRedirectParams
): Promise<MariaRedirectResult> {
  const {
    supabase,
    conversaId,
    phone,
    clienteNome,
    messageText,
    messageId,
    existingDados,
    sendMessage,
  } = params;
  
  console.log(`[TRIAGEM/MARIA] Cliente quer NOVA VENDA - redirecionando para sofIA`);
  
  // Get sofIA contact
  const sofiaContact = await getCoesaContact(supabase, 'comercial');
  
  let redirectMessage: string;
  if (sofiaContact) {
    const whatsappLink = formatWhatsAppLink(sofiaContact.telefone);
    redirectMessage = `Que ótimo que você quer conhecer nosso desconto na conta de luz! 💚

Para te atender sobre *novas adesões e propostas comerciais*, vou te transferir para a *sofIA*, nossa especialista comercial.

📞 Clique aqui para falar com ela:
${whatsappLink}

_Ela vai te explicar tudo e preparar uma simulação personalizada!_`;
  } else {
    redirectMessage = `Que ótimo que você quer conhecer nosso desconto! 💚

Vou te transferir para nossa equipe comercial que vai preparar uma proposta personalizada pra você.

_Em instantes você será atendido!_`;
  }
  
  await sendMessage(phone, redirectMessage);
  
  // Save messages and update conversation if exists
  if (conversaId) {
    await publishConversationPair(supabase, conversaId, messageText, redirectMessage, messageId, 'triage');
    
    // Mark as redirected
    const updatedDados = {
      ...existingDados,
      redirected_to_sofia: true,
      redirected_reason: 'nova_venda',
      redirected_at: new Date().toISOString(),
    };
    
    await supabase
      .from('chatbot_conversas')
      .update({
        dados_coletados: updatedDados,
        last_message_at: new Date().toISOString(),
        last_sofia_message_at: new Date().toISOString(),
        sofia_mode: 'paused_for_redirect',
        escalation_reason: 'Cliente quer nova venda - redirecionado para sofIA',
        escalated_at: new Date().toISOString(),
      })
      .eq('id', conversaId);
  }
  
  return {
    handled: true,
    status: 'maria_redirect_to_sofia',
    conversaId: conversaId || undefined,
    contactFound: !!sofiaContact,
  };
}

export interface TriageSkipCheckParams {
  conversa: TriageConversaData | null;
  existingDados: Record<string, any>;
}

export interface TriageSkipResult {
  shouldSkip: boolean;
  reason: string;
}

// ═══════════════════════════════════════════════════════════════
// START TRIAGE FLOW - Phase 60 + Triage Fix Error #3 & #5
// Consolidated from sofia-webhook/index.ts (lines 1883-1993)
// Added: Historical lookup and media context support
// ═══════════════════════════════════════════════════════════════

export interface MediaContext {
  isAudio: boolean;
  audioTranscription?: string | null;
  isImage: boolean;
  isDocument: boolean;
  transcriptionFailed?: boolean;
}

export interface StartTriageParams {
  supabase: any;
  phone: string;
  clienteNome: string | null;
  messageText: string;
  messageId: string | null;
  conversa: TriageConversaData | null;
  intentDetection: {
    detected: boolean;
    source: string;
    triggerKeyword: string | null;
    category: string;
    confidence: number;
  };
  extractedEnergyData: Record<string, any>;
  agentId: string;
  sendMessage: (phone: string, msg: string) => Promise<void>;
  getABVariant: (sessionId: string) => 'A' | 'B';
  mediaContext?: MediaContext; // PHASE: Error #5 - Audio integration
}

export interface StartTriageResult {
  handled: boolean;
  status: string;
  conversaId?: string;
  error?: string;
}

/**
 * Check for active commercial history for this phone (Error #3 fix)
 * Returns historical proposal info if exists
 */
export async function hasActiveCommercialHistory(
  supabase: any,
  phone: string
): Promise<{
  hasHistory: boolean;
  lastPropostaId: string | null;
  lastStage: string | null;
  lastActivity: string | null;
  proposalUrl: string | null;
}> {
  try {
    // Buscar conversas anteriores (incluindo encerradas) com proposta
    const { data: historicalConversas } = await supabase
      .from('chatbot_conversas')
      .select('proposta_id, bitrix24_stage, last_message_at, dados_coletados')
      .eq('cliente_telefone', phone)
      .not('proposta_id', 'is', null)
      .order('last_message_at', { ascending: false })
      .limit(1);
    
    if (historicalConversas && historicalConversas.length > 0) {
      const last = historicalConversas[0];
      const proposalUrl = last.dados_coletados?.proposal_url || 
                          last.dados_coletados?.public_proposal_url || null;
      console.log(`[TRIAGE_HISTORY] Found historical proposal: ${last.proposta_id}`);
      return {
        hasHistory: true,
        lastPropostaId: last.proposta_id,
        lastStage: last.bitrix24_stage,
        lastActivity: last.last_message_at,
        proposalUrl,
      };
    }
  } catch (err) {
    console.error('[TRIAGE_HISTORY] Error checking history:', err);
  }
  
  return { hasHistory: false, lastPropostaId: null, lastStage: null, lastActivity: null, proposalUrl: null };
}

// ═══════════════════════════════════════════════════════════════
// CONTEXTUAL RESPONSE HANDLER (PLAN: Lookup contextual)
// Responds directly when context is found, avoiding full triage
// ═══════════════════════════════════════════════════════════════

export interface HandleContextualResponseParams {
  supabase: any;
  conversa: TriageConversaData | null;
  phone: string;
  clienteNome: string | null;
  contextResolution: ContextualResolution;
  sendMessage: (phone: string, msg: string) => Promise<void>;
}

export interface HandleContextualResponseResult {
  handled: boolean;
  status: string;
}

/**
 * Handle direct response when contextual pattern has clear context
 * (PLAN: Error #1 & #2 fix - respond with context instead of generic triage)
 */
export async function handleContextualResponse(
  params: HandleContextualResponseParams
): Promise<HandleContextualResponseResult> {
  const { supabase, conversa, phone, clienteNome, contextResolution, sendMessage } = params;
  const templates = getTemplateCache() || undefined;
  
  if (contextResolution.inferredContext === 'proposal') {
    // Found proposal - send link if available
    if (contextResolution.historicalProposalUrl) {
      const message = generateHistoricalProposalMessage(
        clienteNome,
        contextResolution.historicalProposalUrl,
        templates
      );
      await sendMessage(phone, message);
      
      // Save message and update conversation
      if (conversa?.id) {
        await publishAssistantMessage(supabase, conversa.id, message, 'triage');
        await supabase
          .from('chatbot_conversas')
          .update({ 
            last_sofia_message_at: new Date().toISOString(),
            dados_coletados: {
              ...(conversa.dados_coletados || {}),
              contextual_lookup_resolved: true,
              contextual_lookup_context: 'proposal',
              contextual_lookup_reason: contextResolution.reason,
            },
          })
          .eq('id', conversa.id);
      }
      
      console.log(`[CONTEXTUAL_RESPONSE] ✅ Responded with historical proposal URL`);
      return { handled: true, status: 'contextual_proposal_found' };
    } else {
      // Proposal exists but no link - ask for identification
      const message = `Encontrei uma proposta no seu cadastro! 📋

Para te mostrar os detalhes, pode me confirmar o e-mail ou CPF cadastrado?`;
      await sendMessage(phone, message);
      
      if (conversa?.id) {
        await publishAssistantMessage(supabase, conversa.id, message, 'triage');
        await supabase
          .from('chatbot_conversas')
          .update({ 
            last_sofia_message_at: new Date().toISOString(),
            dados_coletados: {
              ...(conversa.dados_coletados || {}),
              contextual_lookup_resolved: true,
              contextual_lookup_context: 'proposal',
              contextual_lookup_needs_id: true,
            },
          })
          .eq('id', conversa.id);
      }
      
      console.log(`[CONTEXTUAL_RESPONSE] ✅ Proposal found but needs ID confirmation`);
      return { handled: true, status: 'contextual_proposal_needs_id' };
    }
  }
  
  if (contextResolution.inferredContext === 'contract') {
    // Client has contract - redirect to post-sales
    const contact = await getCoesaContact(supabase, 'pos_venda');
    let message: string;
    
    if (contact) {
      const waLink = formatWhatsAppLink(contact.telefone);
      message = `Pelo seu histórico, você já tem contrato conosco! 💚

Para acompanhar homologação, créditos ou status do contrato, fale com nosso Pós-Venda:
${waLink}`;
    } else {
      message = `Pelo seu histórico, você já tem contrato conosco! 💚

Nossa equipe de Pós-Venda vai te ajudar com isso. Aguarde um momento!`;
    }
    
    await sendMessage(phone, message);
    
    if (conversa?.id) {
      await publishAssistantMessage(supabase, conversa.id, message, 'triage');
      await supabase
        .from('chatbot_conversas')
        .update({ 
          last_sofia_message_at: new Date().toISOString(),
          sofia_mode: 'sac_redirect',
          escalation_reason: 'Cliente existente - contrato detectado via contextual lookup',
          escalated_at: new Date().toISOString(),
          dados_coletados: {
            ...(conversa.dados_coletados || {}),
            contextual_lookup_resolved: true,
            contextual_lookup_context: 'contract',
            is_existing_client: true,
          },
        })
        .eq('id', conversa.id);
    }
    
    console.log(`[CONTEXTUAL_RESPONSE] ✅ Contract detected - redirected to pos_venda`);
    return { handled: true, status: 'contextual_contract_redirect' };
  }
  
  // Fallback - should not reach here if needsClarification=false
  console.log(`[CONTEXTUAL_RESPONSE] ⚠️ Fallback - context was ${contextResolution.inferredContext}`);
  return { handled: false, status: 'contextual_unknown' };
}

/**
 * Start a new triage flow when existing client intent is detected
 * Creates conversation if needed and sets triage state
 * PHASE: Error #5 - Added mediaContext support for audio fallback
 */
export async function startTriageFlow(params: StartTriageParams): Promise<StartTriageResult> {
  const {
    supabase,
    phone,
    clienteNome,
    messageText,
    messageId,
    conversa,
    intentDetection,
    extractedEnergyData,
    agentId,
    sendMessage,
    getABVariant,
    mediaContext, // PHASE: Error #5 - Audio context
  } = params;
  
  if (!intentDetection.detected) {
    return { handled: false, status: 'no_intent_detected' };
  }
  
  console.log(`[TRIAGE_START] Detected existing client intent via ${intentDetection.source}: "${intentDetection.triggerKeyword}" (category: ${intentDetection.category}, confidence: ${intentDetection.confidence})`);
  
  // PHASE: Error #5 - Log audio context for debugging
  if (mediaContext?.isAudio) {
    console.log(`[TRIAGE_START] Audio context: transcription=${mediaContext.audioTranscription ? 'success' : 'failed'}, failed=${mediaContext.transcriptionFailed}`);
  }
  
  const templates = getTemplateCache() || undefined;
  const clientFirstName = (clienteNome || '').split(' ')[0];
  
  // Get template for existing client prompt
  let fallbackMessage = `Olá${clientFirstName ? ` ${clientFirstName}` : ''}! 👋

Percebi que você já pode ser nosso cliente. Para te direcionar melhor:

*1️⃣ Já sou cliente* - dúvidas sobre fatura, contrato ou suporte
*2️⃣ Quero ser cliente* - conhecer o desconto e fazer proposta

_Digite 1 ou 2 para continuar_`;

  // PHASE: Error #5 - Add audio fallback message if transcription failed
  if (mediaContext?.isAudio && mediaContext.transcriptionFailed) {
    const audioFallbackTemplate = getRenderedTemplate('triage', 'audio_fallback', {}, templates, 
      '\n\n_Percebi que você enviou um áudio. Pode repetir por texto para eu entender melhor?_ 🎤');
    fallbackMessage += audioFallbackTemplate;
    console.log(`[TRIAGE_START] Added audio fallback message due to transcription failure`);
  }

  const triagemMessage = getRenderedTemplate('triage', 'existing_client_prompt', { nome: clientFirstName || '' }, templates, fallbackMessage);
  
  await sendMessage(phone, triagemMessage);
  
  let newConversaId = conversa?.id;
  const existingDados = conversa?.dados_coletados || {};
  
  if (!conversa) {
    // Create new conversation with triage state
    const sessionId = crypto.randomUUID();
    const { data: newConversa, error: createError } = await supabase
      .from('chatbot_conversas')
      .insert({
        session_id: sessionId,
        cliente_telefone: phone,
        cliente_nome: clienteNome,
        agent_id: agentId,
        lead_source: 'whatsapp_inbound',
        lead_score: 10,
        sofia_mode: 'standard',
        ab_variant: getABVariant(sessionId),
        whatsapp_provider: 'zapi',
        total_messages: 2,
        dados_coletados: { 
          ...extractedEnergyData,
          triagem_state: 'aguardando_confirmacao_cliente',
          triagem_trigger_keyword: intentDetection.triggerKeyword,
          triagem_categoria_detectada: intentDetection.category,
          triagem_confianca: intentDetection.confidence,
          triagem_source: intentDetection.source,
          triagem_original_message: messageText,
        },
      })
      .select('id')
      .single();
    
    // Handle race condition
    if (createError && (createError.code === '23505' || createError.message?.includes('unique'))) {
      console.log('[TRIAGE_START] Race condition - fetching existing conversation');
      const { data: existingRace } = await supabase
        .from('chatbot_conversas')
        .select('id')
        .eq('cliente_telefone', phone)
        .eq('agent_id', agentId)
        .eq('whatsapp_provider', 'zapi')
        .is('ended_at', null)
        .limit(1)
        .single();
      newConversaId = existingRace?.id;
    } else {
      newConversaId = newConversa?.id;
    }
  } else {
    // Update existing conversation
    const updatedDados = { 
      ...existingDados,
      ...extractedEnergyData,
      triagem_state: 'aguardando_confirmacao_cliente',
      triagem_trigger_keyword: intentDetection.triggerKeyword,
      triagem_categoria_detectada: intentDetection.category,
      triagem_confianca: intentDetection.confidence,
      triagem_source: intentDetection.source,
      triagem_original_message: messageText,
    };
    
    await supabase
      .from('chatbot_conversas')
      .update({ 
        dados_coletados: updatedDados,
        last_message_at: new Date().toISOString(),
        last_sofia_message_at: new Date().toISOString(),
        total_messages: ((conversa as any)?.total_messages || 0) + 2,
      })
      .eq('id', conversa.id);
  }
  
  // Save messages
  if (newConversaId) {
    await publishConversationPair(supabase, newConversaId, messageText, triagemMessage, messageId, 'triage');
  }
  
  return {
    handled: true,
    status: 'triagem_started',
    conversaId: newConversaId,
  };
}

// ═══════════════════════════════════════════════════════════════
// WAIT/PAUSE INTENT PATTERNS - Phase 95
// Detects when client is asking for time, prevents triage activation
// Examples: "preciso sair", "estou ocupado", "depois te respondo"
// ═══════════════════════════════════════════════════════════════
const WAIT_PAUSE_PATTERNS = [
  // Portuguese wait/pause patterns
  /\b(preciso|vou|tenho\s+que)\s+(dar\s+uma\s+)?sa[ií]r?\b/i,
  /\bestou\s+(ocupad[oa]|em\s+reuni[aã]o|trabalhando|dirigindo|no\s+trabalho)\b/i,
  /\b(depois|daqui\s+a\s+pouco|mais\s+tarde|agora\s+n[aã]o)\s+(te\s+)?(respondo|falo|retorno)\b/i,
  /\b(me\s+d[aá]|preciso\s+de?)\s+(um\s+)?(tempo|minuto|momento)\b/i,
  /\bj[aá]\s+(te\s+)?retorno\b/i,
  /\bvolto\s+(j[aá]|depois|logo|em\s+breve)\b/i,
  /\bagora\s+n[aã]o\s+(posso|d[aá]|consigo)\b/i,
  /\b(espera|aguarda)\s+(um\s+)?(pouco|minuto|momento|instante)\b/i,
  /\bto\s+(ocupad[oa]|sem\s+tempo|correndo)\b/i,
  /\bn[aã]o\s+(posso|consigo)\s+(agora|no\s+momento)\b/i,
  /\bvou\s+almo[cç]ar\b/i,
  /\bestou\s+(entrando|saindo|chegando)\b/i,
  /\bvou\s+te\s+chamar\s+(depois|mais\s+tarde)\b/i,
  /\bte\s+chamo\s+(depois|mais\s+tarde|daqui\s+a\s+pouco)\b/i,
  /\bpreciso\s+resolver\s+(uma\s+coisa|algo)\b/i,
  /\bestou\s+na\s+(rua|correria)\b/i,
];

/**
 * Detect if message indicates client is asking for wait/pause time
 * CRITICAL: This prevents false triage activation when client just needs a break
 */
export function detectWaitPauseIntent(message: string): { detected: boolean; pattern: string | null } {
  const normalized = message.toLowerCase().trim();
  
  for (const pattern of WAIT_PAUSE_PATTERNS) {
    if (pattern.test(normalized)) {
      const match = normalized.match(pattern);
      console.log(`[TRIAGE_WAIT_DETECT] ⏸️ Wait/pause intent detected: "${match?.[0]}" in "${message.substring(0, 60)}..."`);
      return { detected: true, pattern: match?.[0] || null };
    }
  }
  
  return { detected: false, pattern: null };
}

/**
 * Check if triage should be skipped (comprehensive check)
 * PHASE 2 FIX: Expanded to cover ALL conditions that should prevent triage
 * PLAN FIX: Added em_negociacao and recent Sofia interaction checks
 * Phase 95: Added wait/pause intent detection
 * 
 * Combines: triagem_concluida, significant data, proposal context, human intervention,
 * event flags, Bitrix24 stages, commercial negotiation context, AND wait/pause intents
 */
export function shouldSkipTriageCheck(params: TriageSkipCheckParams & { extractedData?: Record<string, any>; messageText?: string }): TriageSkipResult {
  const { conversa, existingDados, extractedData } = params;
  const messageText = (params as any).messageText || '';
  
  // ═══════════════════════════════════════════════════════════════
  // -2. WAIT/PAUSE INTENT CHECK - Phase 95: Client asking for time = SKIP
  // CRITICAL: Prevents triage from activating when client says "preciso sair"
  // ═══════════════════════════════════════════════════════════════
  if (messageText) {
    const waitPauseCheck = detectWaitPauseIntent(messageText);
    if (waitPauseCheck.detected) {
      console.log(`[TRIAGE_SKIP] ⏸️ Wait/pause intent detected: "${waitPauseCheck.pattern}" - letting Sofia respond empathetically`);
      return { shouldSkip: true, reason: 'wait_pause_intent' };
    }
  }
  
  // ═══════════════════════════════════════════════════════════════
  // -1. MERGED DATA CHECK - Phase 89: Check BOTH existing AND newly extracted data
  // CRITICAL FIX: Triagem was ignoring just-extracted data because it only
  // looked at existingDados (from DB) not extractedData (from current message)
  // ═══════════════════════════════════════════════════════════════
  const mergedDados = { ...existingDados, ...(extractedData || {}) };
  
  // ═══════════════════════════════════════════════════════════════
  // 0. ACTIVE COLLECTION FIELD - CRITICAL: Sofia asked for specific data = SKIP
  // Phase 89: Block triage when Sofia is waiting for email/distribuidora/valor
  // ═══════════════════════════════════════════════════════════════
  if (existingDados.active_collection_field) {
    console.log(`[TRIAGE_SKIP] ⛔ active_collection_field = "${existingDados.active_collection_field}" - Sofia is waiting for specific data`);
    return { shouldSkip: true, reason: `waiting_for_${existingDados.active_collection_field}` };
  }
  
  // Check FSM expected field as well
  if (existingDados.fsm_expected_field || (conversa as any)?.fsm_expected_field) {
    const expectedField = existingDados.fsm_expected_field || (conversa as any)?.fsm_expected_field;
    console.log(`[TRIAGE_SKIP] ⛔ fsm_expected_field = "${expectedField}" - FSM is waiting for specific data`);
    return { shouldSkip: true, reason: `fsm_waiting_for_${expectedField}` };
  }
  
  // ═══════════════════════════════════════════════════════════════
  // 0. COMMERCIAL NEGOTIATION FLAG - CRITICAL: Active negotiation = SKIP
  // ═══════════════════════════════════════════════════════════════
  if (mergedDados.em_negociacao === true) {
    console.log(`[TRIAGE_SKIP] ⛔ em_negociacao = true - client is in active commercial negotiation`);
    return { shouldSkip: true, reason: 'em_negociacao' };
  }
  
  // ═══════════════════════════════════════════════════════════════
  // 0.5. RECENT SOFIA INTERACTION - Within 10 min = assume commercial context
  // ═══════════════════════════════════════════════════════════════
  if (conversa && (conversa as any).last_sofia_message_at) {
    const lastSofiaMessageAt = new Date((conversa as any).last_sofia_message_at);
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    
    if (lastSofiaMessageAt > tenMinutesAgo) {
      console.log(`[TRIAGE_SKIP] ⛔ Recent Sofia message (within 10min) - assuming commercial context`);
      return { shouldSkip: true, reason: 'recent_sofia_interaction' };
    }
  }
  
  // ═══════════════════════════════════════════════════════════════
  // 1. EXPLICIT TRIAGE COMPLETION FLAGS
  // ═══════════════════════════════════════════════════════════════
  if (existingDados.triagem_concluida === true) {
    return { shouldSkip: true, reason: 'triagem_already_completed' };
  }
  
  if (existingDados.human_intervention_completed === true) {
    return { shouldSkip: true, reason: 'human_intervention_completed' };
  }
  
  // ═══════════════════════════════════════════════════════════════
  // 2. PROPOSAL CONTEXT - CRITICAL: Any proposal = SKIP
  // ═══════════════════════════════════════════════════════════════
  if (conversa?.proposta_id) {
    console.log(`[TRIAGE_SKIP] ⛔ proposta_id exists on conversa: ${conversa.proposta_id}`);
    return { shouldSkip: true, reason: 'has_proposta_id_conversa' };
  }
  
  if (existingDados.proposta_id) {
    console.log(`[TRIAGE_SKIP] ⛔ proposta_id exists in dados: ${existingDados.proposta_id}`);
    return { shouldSkip: true, reason: 'has_proposta_id_dados' };
  }
  
  // ═══════════════════════════════════════════════════════════════
  // 3. EVENT FLAGS - Proposal already sent = SKIP
  // CRITICAL FIX: Check BOTH dados_coletados AND conversa columns
  // ═══════════════════════════════════════════════════════════════
  if (existingDados.proposta_link_sent === true) {
    console.log(`[TRIAGE_SKIP] ⛔ proposta_link_sent = true (in dados)`);
    return { shouldSkip: true, reason: 'proposta_link_sent' };
  }
  
  // CRITICAL FIX: Check conversa.proposta_link_sent_at directly
  if ((conversa as any)?.proposta_link_sent_at) {
    console.log(`[TRIAGE_SKIP] ⛔ proposta_link_sent_at exists on conversa: ${(conversa as any).proposta_link_sent_at}`);
    return { shouldSkip: true, reason: 'proposta_link_sent_conversa' };
  }
  
  if (existingDados.event_proposal_sent === true) {
    console.log(`[TRIAGE_SKIP] ⛔ event_proposal_sent = true (in dados)`);
    return { shouldSkip: true, reason: 'event_proposal_sent' };
  }
  
  // CRITICAL FIX: Check conversa.event_proposal_sent directly
  if ((conversa as any)?.event_proposal_sent === true) {
    console.log(`[TRIAGE_SKIP] ⛔ event_proposal_sent = true (on conversa)`);
    return { shouldSkip: true, reason: 'event_proposal_sent_conversa' };
  }
  
  if (existingDados.proposal_url) {
    console.log(`[TRIAGE_SKIP] ⛔ proposal_url exists`);
    return { shouldSkip: true, reason: 'has_proposal_url' };
  }
  
  // ═══════════════════════════════════════════════════════════════
  // 4. BITRIX24 STAGE - Advanced stages = SKIP
  // ═══════════════════════════════════════════════════════════════
  const stage = conversa?.bitrix24_stage;
  const advancedStages = [
    'UC_9SLRPP',   // Proposta Inicial
    'UC_21Q2WQ',  // Análise Documentos
    'UC_K58GPN',  // Proposta Definitiva
    'UC_GQKQX5',  // Contrato Enviado
    'UC_59V8I1',  // Contrato Assinado
    'WON',        // Ganho
  ];
  
  if (stage && advancedStages.includes(stage)) {
    console.log(`[TRIAGE_SKIP] ⛔ Bitrix stage is advanced: ${stage}`);
    return { shouldSkip: true, reason: `bitrix_stage_${stage}` };
  }
  
  // ═══════════════════════════════════════════════════════════════
  // 5. COMMERCIAL DATA - Any significant data = SKIP
  // Phase 89: Now checks MERGED data (existing + extracted)
  // ═══════════════════════════════════════════════════════════════
  const commercialFields = [
    'distribuidora',
    'distribuidoraInformada',
    'valorFatura',
    'valor_fatura',
    'consumo',
    'consumo_medio',
    'email',
    'cpf',
    'cnpj',
  ];
  
  for (const field of commercialFields) {
    // Check BOTH existing and newly extracted data
    if (mergedDados[field]) {
      console.log(`[TRIAGE_SKIP] ⛔ Commercial field exists: ${field} = ${mergedDados[field]} (merged check)`);
      return { shouldSkip: true, reason: `has_${field}` };
    }
  }
  
  // Legacy fields check (also on merged data)
  if (mergedDados.concessionaria || mergedDados.has_simulation || mergedDados.cliente_nome) {
    return { shouldSkip: true, reason: 'has_legacy_significant_data' };
  }
  
  console.log(`[TRIAGE_SKIP] ✅ No skip conditions found - triage CAN proceed`);
  return { shouldSkip: false, reason: 'none' };
}
