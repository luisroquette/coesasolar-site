/**
 * Confirmation Handlers Module
 * Centralizes handling of value, email, and document (CPF/CNPJ) confirmations
 * Extracted from sofia-webhook/index.ts (Phase 38 refactoring)
 * 
 * Handles:
 * - Bill value confirmation/correction
 * - Email confirmation/correction
 * - CPF/CNPJ validation feedback
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ExtractedClientData } from './data-extraction.ts';
import { 
  detectAmbiguousValue, 
  checkValueConfirmation 
} from './data-extraction.ts';
import { syncToBitrix } from './bitrix-sync.ts';
import { syncContactToCRM } from './crm-sync.ts';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface ConfirmationContext {
  supabase: SupabaseClient;
  conversaId: string;
  phone: string;
  clienteNome: string | null;
  messageText: string;
  existingDados: ExtractedClientData;
  extractedData: ExtractedClientData;
  conversa: any;
  sendWhatsAppMessage: (phone: string, message: string) => Promise<void>;
}

export interface ConfirmationResult {
  handled: boolean;
  earlyReturn: boolean;
  response?: {
    success: boolean;
    message: string;
    [key: string]: unknown;
  };
  updatedExtractedData?: ExtractedClientData;
}

// ═══════════════════════════════════════════════════════════════
// BILL VALUE CONFIRMATION
// ═══════════════════════════════════════════════════════════════

/**
 * Handle pending bill value confirmation
 */
export async function handleBillValueConfirmation(
  ctx: ConfirmationContext
): Promise<ConfirmationResult> {
  const { supabase, conversaId, phone, existingDados, extractedData, sendWhatsAppMessage } = ctx;
  
  if (!existingDados.valorPendente?.aguardandoConfirmacao) {
    return { handled: false, earlyReturn: false };
  }
  
  const pendingValue = existingDados.valorPendente.valor;
  const confirmation = checkValueConfirmation(ctx.messageText, pendingValue);
  
  console.log(`[CONFIRMATION] Checking value confirmation for R$ ${pendingValue}: ${confirmation.status}`);
  
  if (confirmation.status === 'confirmed') {
    extractedData.valorFatura = pendingValue;
    extractedData.valorPendente = undefined;
    console.log(`[CONFIRMATION] Client CONFIRMED value R$ ${pendingValue}`);
    
    await supabase
      .from('chatbot_conversas')
      .update({
        dados_coletados: { ...existingDados, ...extractedData, valorPendente: null },
        last_message_at: new Date().toISOString(),
      })
      .eq('id', conversaId);
    
    const ackMessage = `Perfeito, anotei! 📝`;
    await sendWhatsAppMessage(phone, ackMessage);
    
    await supabase.from('chatbot_mensagens').insert({
      conversa_id: conversaId,
      role: 'assistant',
      content: ackMessage,
    });
    
    return { handled: true, earlyReturn: false, updatedExtractedData: extractedData };
    
  } else if (confirmation.status === 'corrected' && confirmation.newValue) {
    extractedData.valorFatura = confirmation.newValue;
    extractedData.valorPendente = undefined;
    console.log(`[CONFIRMATION] Client CORRECTED value to R$ ${confirmation.newValue}`);
    
    await supabase
      .from('chatbot_conversas')
      .update({
        dados_coletados: { ...existingDados, ...extractedData, valorPendente: null },
        last_message_at: new Date().toISOString(),
      })
      .eq('id', conversaId);
    
    const correctionAck = `Anotei, *R$ ${confirmation.newValue}*! 📝`;
    await sendWhatsAppMessage(phone, correctionAck);
    
    await supabase.from('chatbot_mensagens').insert({
      conversa_id: conversaId,
      role: 'assistant',
      content: correctionAck,
    });
    
    return { handled: true, earlyReturn: false, updatedExtractedData: extractedData };
  }
  
  // ═══════════════════════════════════════════════════════════════
  // CRITICAL FIX (2026-02-04): Auto-accept pending value after 'unclear' response
  // If the client is providing OTHER data (email, distribuidora) instead of
  // confirming the value, accept the pending value automatically.
  // This prevents the conversation from getting stuck.
  // ═══════════════════════════════════════════════════════════════
  
  // Check if client is providing meaningful data instead of confirming
  const isProvidingEmail = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(ctx.messageText);
  const isProvidingDistribuidora = /cemig|energisa|cpfl|light|enel|copel|coelba|equatorial/i.test(ctx.messageText);
  const messageLength = ctx.messageText.trim().length;
  const isSubstantiveResponse = messageLength > 5 && !/^(ok|sim|n[ãa]o|hmm|hm)$/i.test(ctx.messageText.trim());
  
  if (confirmation.status === 'unclear' && (isProvidingEmail || isProvidingDistribuidora || isSubstantiveResponse)) {
    console.log(`[CONFIRMATION] 🔄 Auto-accepting pending value R$ ${pendingValue} - client is providing other data`);
    extractedData.valorFatura = pendingValue;
    extractedData.valorPendente = undefined;
    
    await supabase
      .from('chatbot_conversas')
      .update({
        dados_coletados: { ...existingDados, ...extractedData, valorPendente: null, valorFatura: pendingValue },
        last_message_at: new Date().toISOString(),
      })
      .eq('id', conversaId);
    
    // Don't send acknowledgment - just accept silently and continue
    return { handled: false, earlyReturn: false, updatedExtractedData: extractedData };
  }
  
  // If 'unclear' and not providing other data, continue with normal AI processing
  return { handled: false, earlyReturn: false };
}

/**
 * Handle ambiguous bill value detection
 */
export async function handleAmbiguousValueDetection(
  ctx: ConfirmationContext
): Promise<ConfirmationResult> {
  const { supabase, conversaId, phone, existingDados, extractedData, messageText, sendWhatsAppMessage } = ctx;
  
  // Only check if we don't already have valorFatura
  if (extractedData.valorFatura || extractedData.valorPendente || existingDados.valorFatura) {
    return { handled: false, earlyReturn: false };
  }
  
  const ambiguityCheck = detectAmbiguousValue(messageText);
  
  if (!ambiguityCheck.isAmbiguous || !ambiguityCheck.extractedValue || !ambiguityCheck.confirmationMessage) {
    return { handled: false, earlyReturn: false };
  }
  
  console.log(`[CONFIRMATION] Ambiguous value detected: "${ambiguityCheck.originalText}" -> R$ ${ambiguityCheck.extractedValue} (${ambiguityCheck.ambiguityType})`);
  
  extractedData.valorPendente = {
    valor: ambiguityCheck.extractedValue,
    textoOriginal: ambiguityCheck.originalText,
    tipoAmbiguidade: ambiguityCheck.ambiguityType,
    aguardandoConfirmacao: true,
  };
  
  await supabase
    .from('chatbot_conversas')
    .update({
      dados_coletados: { ...existingDados, ...extractedData },
      last_message_at: new Date().toISOString(),
    })
    .eq('id', conversaId);
  
  await sendWhatsAppMessage(phone, ambiguityCheck.confirmationMessage);
  
  await supabase.from('chatbot_mensagens').insert({
    conversa_id: conversaId,
    role: 'assistant',
    content: ambiguityCheck.confirmationMessage,
  });
  
  console.log(`[CONFIRMATION] Sent value confirmation request, awaiting client response`);
  
  return {
    handled: true,
    earlyReturn: true,
    response: {
      success: true,
      message: 'Value confirmation requested',
      pendingValue: ambiguityCheck.extractedValue,
      ambiguityType: ambiguityCheck.ambiguityType,
    },
    updatedExtractedData: extractedData,
  };
}

// ═══════════════════════════════════════════════════════════════
// EMAIL CONFIRMATION
// ═══════════════════════════════════════════════════════════════

interface EmailConfirmationResult {
  status: 'confirmed' | 'corrected' | 'unclear';
  newEmail?: string;
}

function checkEmailConfirmation(message: string, pendingEmail: string): EmailConfirmationResult {
  const msgLower = message.toLowerCase().trim();
  
  // Check for confirmation
  const confirmPatterns = [
    /^s+$/i, /^sim$/i, /^isso$/i, /^correto$/i, /^exato$/i, /^isso mesmo$/i,
    /^é isso$/i, /^tá certo$/i, /^tá ok$/i, /^pode ser$/i, /^é esse$/i,
    /^esse mesmo$/i, /^isso ai$/i, /^ok$/i, /^blz$/i, /^beleza$/i,
  ];
  
  for (const pattern of confirmPatterns) {
    if (pattern.test(msgLower)) {
      return { status: 'confirmed' };
    }
  }
  
  // Check for new email
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  const match = message.match(emailRegex);
  if (match) {
    const newEmail = match[0].toLowerCase();
    if (newEmail !== pendingEmail.toLowerCase()) {
      return { status: 'corrected', newEmail };
    }
    return { status: 'confirmed' };
  }
  
  return { status: 'unclear' };
}

/**
 * Handle pending email confirmation
 */
export async function handleEmailConfirmation(
  ctx: ConfirmationContext
): Promise<ConfirmationResult> {
  const { supabase, conversaId, phone, clienteNome, existingDados, extractedData, messageText, sendWhatsAppMessage } = ctx;
  
  if (!existingDados.emailPendente?.aguardandoConfirmacao) {
    return { handled: false, earlyReturn: false };
  }
  
  const pendingEmail = existingDados.emailPendente.email;
  const emailConfirmation = checkEmailConfirmation(messageText, pendingEmail);
  
  console.log(`[CONFIRMATION] Checking email confirmation for ${pendingEmail}: ${emailConfirmation.status}`);
  
  if (emailConfirmation.status === 'confirmed') {
    extractedData.email = pendingEmail;
    extractedData.emailPendente = undefined;
    console.log(`[CONFIRMATION] Client CONFIRMED email: ${pendingEmail}`);
    
    const updatedDadosEmail = {
      ...existingDados,
      ...extractedData,
      emailPendente: undefined,
      email: pendingEmail,
    };
    
    await supabase
      .from('chatbot_conversas')
      .update({
        dados_coletados: updatedDadosEmail,
        cliente_email: pendingEmail,
        last_message_at: new Date().toISOString(),
      })
      .eq('id', conversaId);
    
    const ackMessage = `Perfeito, anotei o e-mail *${pendingEmail}*! 📧`;
    await sendWhatsAppMessage(phone, ackMessage);
    
    await supabase.from('chatbot_mensagens').insert({
      conversa_id: conversaId,
      role: 'assistant',
      content: ackMessage,
    });
    
    // Force sync to Bitrix
    console.log(`[CONFIRMATION] Syncing confirmed email to Bitrix...`);
    await syncToBitrix(supabase, conversaId, phone, clienteNome, updatedDadosEmail, undefined, false);
    
    return { handled: true, earlyReturn: false, updatedExtractedData: extractedData };
    
  } else if (emailConfirmation.status === 'corrected' && emailConfirmation.newEmail) {
    extractedData.email = emailConfirmation.newEmail;
    extractedData.emailPendente = undefined;
    console.log(`[CONFIRMATION] Client PROVIDED new email: ${emailConfirmation.newEmail}`);
    
    const updatedDadosNewEmail = {
      ...existingDados,
      ...extractedData,
      emailPendente: undefined,
      email: emailConfirmation.newEmail,
    };
    
    await supabase
      .from('chatbot_conversas')
      .update({
        dados_coletados: updatedDadosNewEmail,
        cliente_email: emailConfirmation.newEmail,
        last_message_at: new Date().toISOString(),
      })
      .eq('id', conversaId);
    
    const correctionAck = `Anotei, *${emailConfirmation.newEmail}*! 📧`;
    await sendWhatsAppMessage(phone, correctionAck);
    
    await supabase.from('chatbot_mensagens').insert({
      conversa_id: conversaId,
      role: 'assistant',
      content: correctionAck,
    });
    
    // Sync to Bitrix
    console.log(`[CONFIRMATION] Syncing corrected email to Bitrix...`);
    await syncToBitrix(supabase, conversaId, phone, clienteNome, updatedDadosNewEmail, undefined, false);
    
    return { handled: true, earlyReturn: false, updatedExtractedData: extractedData };
  }
  
  return { handled: false, earlyReturn: false };
}

/**
 * Handle malformed email that needs confirmation
 */
export async function handleMalformedEmailDetection(
  ctx: ConfirmationContext
): Promise<ConfirmationResult> {
  const { supabase, conversaId, phone, existingDados, extractedData, sendWhatsAppMessage } = ctx;
  
  // Only if we detected a malformed email AND we're not already waiting for confirmation
  if (!extractedData.emailPendente?.aguardandoConfirmacao ||
      existingDados.emailPendente?.aguardandoConfirmacao) {
    return { handled: false, earlyReturn: false };
  }
  
  const pendingEmailInfo = extractedData.emailPendente;
  
  console.log(`[CONFIRMATION] Malformed email detected: "${pendingEmailInfo.textoOriginal}" -> ${pendingEmailInfo.email}`);
  
  await supabase
    .from('chatbot_conversas')
    .update({
      dados_coletados: { ...existingDados, ...extractedData },
      last_message_at: new Date().toISOString(),
    })
    .eq('id', conversaId);
  
  const confirmationMessage = `Hmm, você digitou "*${pendingEmailInfo.textoOriginal}*"... O correto é *${pendingEmailInfo.email}*? 📧`;
  await sendWhatsAppMessage(phone, confirmationMessage);
  
  await supabase.from('chatbot_mensagens').insert({
    conversa_id: conversaId,
    role: 'assistant',
    content: confirmationMessage,
  });
  
  console.log(`[CONFIRMATION] Sent email confirmation request, awaiting client response`);
  
  return {
    handled: true,
    earlyReturn: true,
    response: {
      success: true,
      message: 'Email confirmation requested',
      pendingEmail: pendingEmailInfo.email,
      originalText: pendingEmailInfo.textoOriginal,
    },
    updatedExtractedData: extractedData,
  };
}

// ═══════════════════════════════════════════════════════════════
// CPF/CNPJ VALIDATION FEEDBACK
// ═══════════════════════════════════════════════════════════════

/**
 * Handle CPF/CNPJ validation feedback
 */
export async function handleDocumentValidationFeedback(
  ctx: ConfirmationContext
): Promise<ConfirmationResult> {
  const { supabase, conversaId, phone, clienteNome, existingDados, extractedData, conversa, sendWhatsAppMessage } = ctx;
  
  let validationFeedbackSent = false;
  
  if (extractedData.cpfInvalido && !existingDados.cpfInvalido) {
    console.log(`[CONFIRMATION] Invalid CPF detected, sending feedback: ${extractedData.cpfInvalido}`);
    const feedbackMessage = `⚠️ *Atenção:* Notei que o CPF informado (${extractedData.cpfInvalido}) parece ter algum erro de digitação.\n\nPor favor, verifique e me envie novamente o número correto do CPF. Preciso dele para montar sua proposta! 📋`;
    await sendWhatsAppMessage(phone, feedbackMessage);
    validationFeedbackSent = true;
    
    await supabase.from('chatbot_mensagens').insert({
      conversa_id: conversaId,
      role: 'assistant',
      content: feedbackMessage,
    });
  }
  
  if (extractedData.cnpjInvalido && !existingDados.cnpjInvalido) {
    console.log(`[CONFIRMATION] Invalid CNPJ detected, sending feedback: ${extractedData.cnpjInvalido}`);
    const feedbackMessage = `⚠️ *Atenção:* Notei que o CNPJ informado (${extractedData.cnpjInvalido}) parece ter algum erro de digitação.\n\nPor favor, verifique e me envie novamente o número correto do CNPJ. Preciso dele para montar sua proposta! 📋`;
    await sendWhatsAppMessage(phone, feedbackMessage);
    validationFeedbackSent = true;
    
    await supabase.from('chatbot_mensagens').insert({
      conversa_id: conversaId,
      role: 'assistant',
      content: feedbackMessage,
    });
  }
  
  // Update dados_coletados with validation flags (merge existing to avoid data loss)
  if (extractedData.cpfInvalido || extractedData.cnpjInvalido) {
    await supabase
      .from('chatbot_conversas')
      .update({
        dados_coletados: { ...existingDados, ...extractedData },
        last_message_at: new Date().toISOString(),
      })
      .eq('id', conversaId);
  }
  
  if (!validationFeedbackSent) {
    return { handled: false, earlyReturn: false };
  }
  
  console.log('[CONFIRMATION] Validation feedback sent, skipping AI response');
  
  // Sync contact to CRM even on validation feedback
  const nomeParaSalvar = extractedData.nome as string || clienteNome || conversa?.cliente_nome || null;
  if (nomeParaSalvar) {
    const mergedDados: Record<string, unknown> = { ...existingDados, ...extractedData };
    
    let endereco: string | null = null;
    if (mergedDados.logradouro || mergedDados.endereco) {
      const parts = [
        mergedDados.logradouro || mergedDados.endereco,
        mergedDados.numero,
        mergedDados.complemento,
        mergedDados.bairro,
      ].filter(Boolean);
      endereco = parts.join(', ') || null;
    }
    
    let observacoes: string | null = null;
    if (mergedDados.distribuidora || mergedDados.consumo || mergedDados.valorFatura) {
      const obsArray: string[] = [];
      if (mergedDados.distribuidora) obsArray.push(`Distribuidora: ${mergedDados.distribuidora}`);
      if (mergedDados.consumo) obsArray.push(`Consumo: ${mergedDados.consumo} kWh`);
      if (mergedDados.valorFatura) obsArray.push(`Valor fatura: R$ ${mergedDados.valorFatura}`);
      observacoes = `Via WhatsApp/sofIA - ${obsArray.join(' | ')}`;
    }
    
    syncContactToCRM(supabase, {
      nome: nomeParaSalvar,
      telefone: phone,
      email: (mergedDados.email as string) || null,
      cpfCnpj: (mergedDados.cpf as string) || (mergedDados.cnpj as string) || null,
      endereco,
      cidade: (mergedDados.cidade as string) || null,
      uf: (mergedDados.uf as string) || null,
      cep: (mergedDados.cep as string) || null,
      valorPotencial: null,
      propostaId: conversa?.proposta_id as string || null,
      bitrixLeadId: conversa?.bitrix24_lead_id as string || null,
      bitrixStage: conversa?.bitrix24_stage as string || null,
      observacoes,
    }).then(success => {
      if (success) {
        console.log(`[CRM_SYNC] ✅ Contact synced (validation flow): ${nomeParaSalvar}`);
      }
    }).catch(err => {
      console.error(`[CRM_SYNC] Error syncing (validation flow):`, err);
    });
  }
  
  return {
    handled: true,
    earlyReturn: true,
    response: {
      success: true,
      message: 'Validation feedback sent',
      validationFeedbackSent: true,
    },
    updatedExtractedData: extractedData,
  };
}

// ═══════════════════════════════════════════════════════════════
// PHASE 3: TEMPORARY DESISTANCE OBJECTION HANDLER
// Handles "neste momento não", "agora não", etc.
// ═══════════════════════════════════════════════════════════════

import { matchesPatternCategory, getPatternResponse } from './detection-patterns.ts';

/**
 * Detect temporary desistance objection
 * When client says "neste momento não", "agora não", etc.
 */
export function detectDesistenciaTemporaria(messageText: string): boolean {
  const lower = messageText.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  
  // Check database patterns first (via cache)
  if (matchesPatternCategory(messageText, 'objection_desistencia_temporaria')) {
    return true;
  }
  
  // Hardcoded fallback patterns for immediate detection
  const desistenciaPatterns = [
    /neste momento n[aã]o/i,
    /no momento n[aã]o/i,
    /agora n[aã]o( vou)?/i,
    /n[aã]o quero agora/i,
    /n[aã]o vou agora/i,
    /depois ve(jo|mos)/i,
    /outra hora/i,
    /n[aã]o por agora/i,
    /^n[aã]o[,.]?\s*(obrigad|valeu|vlw)/i,
    /vou pensar/i,
    /deixa (pra|para) depois/i,
    /n[aã]o (estou|tou) (interessad[oa]|afim)/i,
  ];
  
  return desistenciaPatterns.some(pattern => pattern.test(lower));
}

export interface DesistenciaContext {
  supabase: SupabaseClient;
  conversaId: string;
  phone: string;
  clienteNome: string | null;
  messageText: string;
  messageId: string | null;
  existingDados: ExtractedClientData;
  sendWhatsAppMessage: (phone: string, message: string) => Promise<void>;
}

export interface DesistenciaResult {
  handled: boolean;
  earlyReturn: boolean;
  response?: {
    success: boolean;
    message: string;
    [key: string]: unknown;
  };
}

/**
 * Handle temporary desistance objection
 * Sets lead_postponed flag and responds empathetically WITHOUT triggering triage or resetting data
 */
export async function handleDesistenciaTemporaria(
  ctx: DesistenciaContext
): Promise<DesistenciaResult> {
  const { supabase, conversaId, phone, clienteNome, messageText, messageId, existingDados, sendWhatsAppMessage } = ctx;
  
  if (!detectDesistenciaTemporaria(messageText)) {
    return { handled: false, earlyReturn: false };
  }
  
  console.log(`[DESISTENCIA] ⏸️ Detected temporary desistance: "${messageText}"`);
  
  // Get response from database or use fallback
  const dbResponse = getPatternResponse('objection_desistencia_temporaria');
  const firstName = (clienteNome || '').split(' ')[0];
  
  const empathyResponse = dbResponse || 
    `Sem problemas${firstName ? `, ${firstName}` : ''}! 💚\n\nFico aqui quando precisar. É só mandar um "oi" que a gente retoma! 😊`;
  
  await sendWhatsAppMessage(phone, empathyResponse);
  
  // CRITICAL: Preserve ALL existing data - only add postponed flag
  const updatedDados = {
    ...existingDados,  // MERGE, never overwrite
    lead_postponed: true,
    lead_postponed_at: new Date().toISOString(),
    lead_postponed_message: messageText,
    // DO NOT reset triagem_state or any commercial data
  };
  
  await supabase
    .from('chatbot_conversas')
    .update({
      dados_coletados: updatedDados,
      last_message_at: new Date().toISOString(),
      last_sofia_message_at: new Date().toISOString(),
      awaiting_response: false,
      // Cancel scheduled nudges/followups
      next_nudge_at: null,
      next_followup_at: null,
      next_rescue_at: null,
    })
    .eq('id', conversaId);
  
  await supabase.from('chatbot_mensagens').insert([
    { conversa_id: conversaId, role: 'user', content: messageText, message_id: messageId },
    { conversa_id: conversaId, role: 'assistant', content: empathyResponse },
  ]);
  
  console.log(`[DESISTENCIA] ✅ Lead postponed - data preserved, nudges cancelled`);
  
  return {
    handled: true,
    earlyReturn: true,
    response: {
      success: true,
      message: 'Temporary desistance handled with empathy',
      lead_postponed: true,
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// COMBINED CONFIRMATION PROCESSOR
// ═══════════════════════════════════════════════════════════════

/**
 * Process all confirmation handlers in sequence
 * Returns as soon as one requires an early return
 */
export async function processAllConfirmations(
  ctx: ConfirmationContext
): Promise<ConfirmationResult> {
  // 0. PHASE 3: Desistance check FIRST (before any triage can trigger)
  const desistenciaResult = await handleDesistenciaTemporaria({
    supabase: ctx.supabase,
    conversaId: ctx.conversaId,
    phone: ctx.phone,
    clienteNome: ctx.clienteNome,
    messageText: ctx.messageText,
    messageId: null,
    existingDados: ctx.existingDados,
    sendWhatsAppMessage: ctx.sendWhatsAppMessage,
  });
  if (desistenciaResult.earlyReturn) {
    return { 
      handled: true, 
      earlyReturn: true, 
      response: desistenciaResult.response as any 
    };
  }
  
  // 1. Bill value confirmation (pending)
  const valueConfResult = await handleBillValueConfirmation(ctx);
  if (valueConfResult.handled && valueConfResult.updatedExtractedData) {
    ctx.extractedData = valueConfResult.updatedExtractedData;
  }
  
  // 2. Ambiguous value detection (new)
  const ambiguousResult = await handleAmbiguousValueDetection(ctx);
  if (ambiguousResult.earlyReturn) return ambiguousResult;
  if (ambiguousResult.handled && ambiguousResult.updatedExtractedData) {
    ctx.extractedData = ambiguousResult.updatedExtractedData;
  }
  
  // 3. Email confirmation (pending)
  const emailConfResult = await handleEmailConfirmation(ctx);
  if (emailConfResult.handled && emailConfResult.updatedExtractedData) {
    ctx.extractedData = emailConfResult.updatedExtractedData;
  }
  
  // 4. Malformed email detection (new)
  const malformedEmailResult = await handleMalformedEmailDetection(ctx);
  if (malformedEmailResult.earlyReturn) return malformedEmailResult;
  if (malformedEmailResult.handled && malformedEmailResult.updatedExtractedData) {
    ctx.extractedData = malformedEmailResult.updatedExtractedData;
  }
  
  // 5. CPF/CNPJ validation feedback
  const docValidationResult = await handleDocumentValidationFeedback(ctx);
  if (docValidationResult.earlyReturn) return docValidationResult;
  
  return { handled: false, earlyReturn: false };
}

// ═══════════════════════════════════════════════════════════════
// HUMAN COOLDOWN HANDLER (Phase 42)
// Prevents AI from responding immediately after #RESOLVIDO
// ═══════════════════════════════════════════════════════════════

export interface HumanCooldownContext {
  supabase: SupabaseClient;
  conversaId: string;
  messageText: string;
  messageId: string | null;
  existingDados: ExtractedClientData;
  conversa: {
    last_human_message_at?: string | null;
  } | null;
  cooldownMs: number;
}

export interface HumanCooldownResult {
  isActive: boolean;
  waitTimeRemaining?: number;
}

/**
 * Check and handle human intervention cooldown
 * Returns isActive=true if cooldown is still active
 */
export async function handleHumanCooldown(
  ctx: HumanCooldownContext
): Promise<HumanCooldownResult> {
  const { supabase, conversaId, messageText, messageId, existingDados, conversa, cooldownMs } = ctx;
  
  const lastHumanMsgAt = conversa?.last_human_message_at;
  const wasHumanInterventionCompleted = (existingDados as any).human_intervention_completed === true;
  
  if (!lastHumanMsgAt || !wasHumanInterventionCompleted) {
    return { isActive: false };
  }
  
  const timeSinceHumanMsg = Date.now() - new Date(lastHumanMsgAt).getTime();
  
  if (timeSinceHumanMsg >= cooldownMs) {
    return { isActive: false };
  }
  
  const waitTimeRemaining = Math.round((cooldownMs - timeSinceHumanMsg) / 1000);
  console.log(`[HUMAN_COOLDOWN] Aguardando ${waitTimeRemaining}s antes de responder (cooldown pós-intervenção humana)`);
  
  // Clear the flag after first message from client
  await supabase
    .from('chatbot_conversas')
    .update({
      dados_coletados: { 
        ...existingDados, 
        human_intervention_completed: false,
        cooldown_cleared_at: new Date().toISOString(),
      },
    })
    .eq('id', conversaId);
  
  // Save the user message but don't respond yet
  await supabase.from('chatbot_mensagens').insert({
    conversa_id: conversaId,
    role: 'user',
    content: messageText,
    message_id: messageId || null,
  });
  
  return { isActive: true, waitTimeRemaining };
}

// ═══════════════════════════════════════════════════════════════
// DISCOUNT OBJECTION HANDLER (Phase 42)
// Handles "Carta na Manga" / Master Offer flow
// ═══════════════════════════════════════════════════════════════

export interface DiscountObjectionContext {
  supabase: SupabaseClient;
  conversaId: string;
  phone: string;
  clienteNome: string | null;
  messageText: string;
  existingDados: ExtractedClientData;
  extractedData: ExtractedClientData;
  conversa: {
    master_offer_at?: string | null;
  } | null;
  propostaInfo: {
    desconto_percentual?: number | null;
  } | null;
  sendWhatsAppMessage: (phone: string, message: string) => Promise<void>;
  detectDiscountObjection: (message: string) => boolean;
  generateResponse: (consumo: number | null, valorFatura: number | null, descontoAtual: number, clienteNome: string | null, ofertaMasterJaFeita: boolean) => { response: string; shouldOfferMaster: boolean };
  agentName: string;
}

export interface DiscountObjectionResult {
  handled: boolean;
  offeredMaster?: boolean;
}

/**
 * Handle discount objection with "Carta na Manga" (Master Offer)
 */
export async function handleDiscountObjectionFlow(
  ctx: DiscountObjectionContext
): Promise<DiscountObjectionResult> {
  const { 
    supabase, conversaId, phone, clienteNome, messageText, 
    existingDados, extractedData, conversa, propostaInfo,
    sendWhatsAppMessage, detectDiscountObjection, generateResponse, agentName 
  } = ctx;
  
  const isDiscountObjection = detectDiscountObjection(messageText);
  const ofertaMasterJaFeita = (existingDados as any).master_offer_made === true || conversa?.master_offer_at !== null;
  
  if (!isDiscountObjection || ofertaMasterJaFeita) {
    return { handled: false };
  }
  
  console.log(`[DISCOUNT_OBJECTION] Detected discount objection - checking if can offer MASTER`);
  
  const consumoMedioVal = extractedData.consumo || (existingDados as any).consumo_medio || null;
  const valorFaturaVal = extractedData.valorFatura || (existingDados as any).valorFatura || null;
  const descontoAtual = propostaInfo?.desconto_percentual || 25;
  
  const objectionResult = generateResponse(
    consumoMedioVal as number | null,
    valorFaturaVal as number | null,
    descontoAtual,
    clienteNome,
    ofertaMasterJaFeita
  );
  
  // If should offer MASTER, update conversation
  if (objectionResult.shouldOfferMaster) {
    console.log(`[DISCOUNT_OBJECTION] 🎯 Acionando carta na manga - Plano UNLOCK 30%`);
    
    await supabase
      .from('chatbot_conversas')
      .update({
        dados_coletados: { 
          ...existingDados, 
          ...extractedData,
          master_offer_made: true,
          master_offer_at: new Date().toISOString(),
        },
        master_offer_at: new Date().toISOString(),
        master_offer_expires_at: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(), // 12h
        last_message_at: new Date().toISOString(),
        last_sofia_message_at: new Date().toISOString(),
      })
      .eq('id', conversaId);
    
    // Notify admin about MASTER offer
    await supabase.from('admin_notifications').insert({
      admin_user_id: null,
      title: '🎯 Carta na Manga acionada (30%)',
      message: `Cliente ${clienteNome || phone} recebeu oferta do Plano UNLOCK (30%). Consumo estimado: ${consumoMedioVal || 'N/A'} kWh.`,
      type: 'info',
      entity_type: 'chatbot_conversa',
      entity_id: conversaId,
      created_by_nome: agentName || 'sofIA',
    });
  }
  
  // Send objection response
  await sendWhatsAppMessage(phone, objectionResult.response);
  
  await supabase.from('chatbot_mensagens').insert([
    { conversa_id: conversaId, role: 'user', content: messageText },
    { conversa_id: conversaId, role: 'assistant', content: objectionResult.response },
  ]);
  
  return { handled: true, offeredMaster: objectionResult.shouldOfferMaster };
}

// ═══════════════════════════════════════════════════════════════
// ECONOMY CONFIRMATION HANDLER (Phase 42)
// Handles client confirming economy calculation
// ═══════════════════════════════════════════════════════════════

export interface EconomyConfirmationContext {
  supabase: SupabaseClient;
  conversaId: string;
  phone: string;
  clienteNome: string | null;
  messageText: string;
  existingDados: ExtractedClientData;
  extractedData: ExtractedClientData;
  conversa: {
    has_simulation?: boolean | null;
  } | null;
  propostaInfo: {
    desconto_percentual?: number | null;
  } | null;
  sendWhatsAppMessage: (phone: string, message: string) => Promise<void>;
  detectEconomyConfirmation: (message: string) => boolean;
  generateResponse: (descontoPercentual: number, valorFatura: number | null, clienteNome: string | null) => string;
}

export interface EconomyConfirmationResult {
  handled: boolean;
}

/**
 * Handle economy confirmation from client
 */
export async function handleEconomyConfirmationFlow(
  ctx: EconomyConfirmationContext
): Promise<EconomyConfirmationResult> {
  const { 
    supabase, conversaId, phone, clienteNome, messageText, 
    existingDados, extractedData, conversa, propostaInfo,
    sendWhatsAppMessage, detectEconomyConfirmation, generateResponse 
  } = ctx;
  
  const hasSimulationFlag = (existingDados as any).has_simulation || conversa?.has_simulation;
  const isEconomyConfirmation = detectEconomyConfirmation(messageText);
  
  if (!isEconomyConfirmation || !hasSimulationFlag) {
    return { handled: false };
  }
  
  console.log(`[ECONOMY_CONFIRMATION] Cliente confirmou cálculo de economia - validando e avançando`);
  
  const descontoPercentualVal = propostaInfo?.desconto_percentual || 25;
  const valorFaturaConfirm = extractedData.valorFatura || (existingDados as any).valorFatura || null;
  
  const confirmationResponse = generateResponse(
    descontoPercentualVal,
    valorFaturaConfirm as number | null,
    clienteNome
  );
  
  await sendWhatsAppMessage(phone, confirmationResponse);
  
  await supabase.from('chatbot_mensagens').insert([
    { conversa_id: conversaId, role: 'user', content: messageText },
    { conversa_id: conversaId, role: 'assistant', content: confirmationResponse },
  ]);
  
  await supabase
    .from('chatbot_conversas')
    .update({
      dados_coletados: { 
        ...existingDados, 
        ...extractedData,
        economy_confirmed: true,
        economy_confirmed_at: new Date().toISOString(),
      },
      last_message_at: new Date().toISOString(),
      last_sofia_message_at: new Date().toISOString(),
    })
    .eq('id', conversaId);
  
  return { handled: true };
}

// ═══════════════════════════════════════════════════════════════
// ORCHESTRATE PRE-AI FLOWS (Phase 70)
// Consolidates: Human Cooldown + Discount Objection + Economy Confirmation
// ═══════════════════════════════════════════════════════════════

export interface PreAIFlowContext {
  supabase: SupabaseClient;
  conversaId: string;
  phone: string;
  clienteNome: string | null;
  messageText: string;
  messageId: string | null;
  existingDados: ExtractedClientData;
  extractedData: ExtractedClientData;
  conversa: {
    last_human_message_at?: string | null;
    master_offer_at?: string | null;
    has_simulation?: boolean | null;
  } | null;
  propostaInfo: {
    desconto_percentual?: number | null;
  } | null;
  cooldownMs: number;
  sendWhatsAppMessage: (phone: string, message: string) => Promise<void>;
  detectDiscountObjection: (message: string) => boolean;
  generateDiscountResponse: (consumo: number | null, valorFatura: number | null, descontoAtual: number, clienteNome: string | null, ofertaMasterJaFeita: boolean) => { response: string; shouldOfferMaster: boolean };
  detectEconomyConfirmation: (message: string) => boolean;
  generateEconomyResponse: (descontoPercentual: number, valorFatura: number | null, clienteNome: string | null) => string;
  agentName: string;
}

export interface PreAIFlowResult {
  handled: boolean;
  earlyReturn: boolean;
  status: string;
  response?: Record<string, unknown>;
  updatedExtractedData?: ExtractedClientData;
}

/**
 * Orchestrate all pre-AI flow checks in sequence
 * Returns as soon as one requires an early return
 */
export async function orchestratePreAIFlows(
  ctx: PreAIFlowContext
): Promise<PreAIFlowResult> {
  const {
    supabase, conversaId, phone, clienteNome, messageText, messageId,
    existingDados, extractedData, conversa, propostaInfo, cooldownMs,
    sendWhatsAppMessage, detectDiscountObjection, generateDiscountResponse,
    detectEconomyConfirmation, generateEconomyResponse, agentName,
  } = ctx;

  // 1. Human Cooldown Check
  const cooldownCtx: HumanCooldownContext = {
    supabase,
    conversaId,
    messageText,
    messageId,
    existingDados,
    conversa: conversa ? { last_human_message_at: conversa.last_human_message_at } : null,
    cooldownMs,
  };
  
  const cooldownResult = await handleHumanCooldown(cooldownCtx);
  
  if (cooldownResult.isActive) {
    return {
      handled: true,
      earlyReturn: true,
      status: 'human_cooldown_active',
      response: {
        waitTimeRemaining: cooldownResult.waitTimeRemaining,
        message: 'Aguardando cooldown pós-intervenção humana',
      },
    };
  }

  // 2. Discount Objection Check
  const discountCtx: DiscountObjectionContext = {
    supabase,
    conversaId,
    phone,
    clienteNome,
    messageText,
    existingDados,
    extractedData,
    conversa: conversa ? { master_offer_at: conversa.master_offer_at || null } : null,
    propostaInfo,
    sendWhatsAppMessage,
    detectDiscountObjection,
    generateResponse: generateDiscountResponse,
    agentName,
  };
  
  const discountResult = await handleDiscountObjectionFlow(discountCtx);
  
  if (discountResult.handled) {
    return {
      handled: true,
      earlyReturn: true,
      status: 'discount_objection_handled',
      response: {
        offeredMaster: discountResult.offeredMaster,
      },
    };
  }

  // 3. Economy Confirmation Check
  const economyCtx: EconomyConfirmationContext = {
    supabase,
    conversaId,
    phone,
    clienteNome,
    messageText,
    existingDados,
    extractedData,
    conversa: conversa ? { has_simulation: conversa.has_simulation } : null,
    propostaInfo,
    sendWhatsAppMessage,
    detectEconomyConfirmation,
    generateResponse: generateEconomyResponse,
  };
  
  const economyResult = await handleEconomyConfirmationFlow(economyCtx);
  
  if (economyResult.handled) {
    return {
      handled: true,
      earlyReturn: true,
      status: 'economy_confirmation_handled',
      response: {},
    };
  }

  // Nothing handled
  return {
    handled: false,
    earlyReturn: false,
    status: 'continue',
  };
}
