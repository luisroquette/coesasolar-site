/**
 * Response Processing Module
 * Handles AI failure escalation, Master Offer detection, and response tag processing
 * Phase 44: Extracted from sofia-webhook/index.ts
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ═══════════════════════════════════════════════════════════════
// AI FAILURE HANDLING
// Escalates to human when all AI models fail
// ═══════════════════════════════════════════════════════════════

export interface AIFailureContext {
  supabase: SupabaseClient;
  conversaId: string;
  phone: string;
  clienteNome: string | null;
  messageText: string;
  agentName: string;
  sendWhatsAppMessage: (phone: string, message: string) => Promise<void>;
}

export interface AIFailureResult {
  handled: boolean;
  fallbackMessage: string;
  messageSentDirectly: boolean;
  continuedOperating: boolean; // NEW: indicates Sofia kept operating (did NOT pause)
}

// ═══════════════════════════════════════════════════════════════
// CONTEXTUAL FALLBACK GENERATOR
// Creates educational responses when AI fails, to keep conversation flowing
// ═══════════════════════════════════════════════════════════════

function generateContextualFallback(messageText: string, clienteNome: string | null): string {
  const firstName = clienteNome?.split(' ')[0] || '';
  const greeting = firstName ? `${firstName}, ` : '';
  
  const normalizedMessage = messageText.toLowerCase().trim();
  
  // Request for explanation about the service
  if (/me\s+expliq|como\s+funciona|quer(?:o|ia)\s+saber|mais\s+informaç|entender|saber\s+mais/i.test(normalizedMessage)) {
    return `${greeting}vou te explicar rapidinho! 😊

A *energia por assinatura* é um modelo inovador onde você economiza *até 30% na conta de luz* sem precisar instalar painéis solares na sua casa.

Como funciona:
📋 Fazendas solares já existentes geram energia limpa
⚡ Essa energia é injetada na rede da sua concessionária
💰 Você recebe um *desconto direto na sua conta de luz*

Tudo sem obras, sem investimento e sem burocracia!

Quer que eu calcule quanto você poderia economizar? Basta me passar o *valor médio da sua conta de luz* e sua *distribuidora* (ex: CEMIG, Energisa MG) 😊`;
  }
  
  // Questions about values/proposal
  if (/proposta|valor|quanto|pre[çc]o|desconto|economia|simula/i.test(normalizedMessage)) {
    return `${greeting}para calcular sua economia personalizada, preciso de algumas informações:

📊 Qual o *valor médio da sua conta de luz*?
🏢 Qual sua *distribuidora* (ex: CEMIG, Energisa MG)?

Com esses dados, consigo te mostrar exatamente quanto você pode economizar! 💚`;
  }
  
  // Affirmative/continuation responses
  if (/^(sim|ok|pode|certo|beleza|bora|vamos|s[ií]m|claro|quero|manda|fala)/i.test(normalizedMessage)) {
    return `${greeting}ótimo! 💚 Para calcular sua economia, preciso saber:

📊 Qual o *valor médio da sua conta de luz*?
🏢 Qual sua *distribuidora*?

Pode me passar esses dados? 😊`;
  }
  
  // Generic educational fallback
  return `${greeting}aqui na COESA trabalhamos com *energia por assinatura* - você economiza até 30% na conta de luz sem precisar instalar nada! 💚

Quer que eu te explique melhor como funciona ou já podemos calcular sua economia? 

Se preferir, me passa o *valor da sua conta de luz* que eu faço uma simulação rápida! 😊`;
}

/**
 * Handle AI failure - CONTINUE OPERATING with contextual fallback
 * Does NOT pause conversation - Sofia keeps attending
 */
export async function handleAIFailure(ctx: AIFailureContext): Promise<AIFailureResult> {
  const { supabase, conversaId, phone, clienteNome, messageText, agentName, sendWhatsAppMessage } = ctx;
  
  console.error('[response-processing] AI FAILURE - continuing with contextual fallback (NOT pausing)');
  
  // Generate contextual educational fallback (not a technical message)
  const fallbackMessage = generateContextualFallback(messageText, clienteNome);
  
  // ═══════════════════════════════════════════════════════════════
  // CRITICAL: Send fallback to client IMMEDIATELY
  // ═══════════════════════════════════════════════════════════════
  let messageSentDirectly = false;
  try {
    await sendWhatsAppMessage(phone, fallbackMessage);
    messageSentDirectly = true;
    console.log('[response-processing] ✅ Contextual fallback sent - Sofia continues operating');
  } catch (sendError) {
    console.error('[response-processing] ❌ Failed to send contextual fallback:', sendError);
  }
  
  // ═══════════════════════════════════════════════════════════════
  // CRITICAL: Do NOT pause conversation - Sofia keeps attending
  // Only create WARNING notification (not escalation)
  // ═══════════════════════════════════════════════════════════════
  await supabase.from('admin_notifications').insert({
    admin_user_id: null,
    title: '⚠️ Falha temporária de IA - Resposta automática enviada',
    message: `A IA falhou ao processar "${messageText.substring(0, 100)}${messageText.length > 100 ? '...' : ''}" para ${clienteNome || phone}. ${messageSentDirectly ? 'Resposta educativa enviada automaticamente.' : '⚠️ Falha ao enviar resposta.'} O atendimento continua normalmente.`,
    type: 'warning',
    entity_type: 'chatbot_conversa',
    entity_id: conversaId,
    created_by_nome: agentName ? `${agentName} (Sistema)` : 'IA (Sistema)',
  });
  
  return { 
    handled: true, 
    fallbackMessage: messageSentDirectly ? fallbackMessage : fallbackMessage,
    messageSentDirectly,
    continuedOperating: true, // NEW: Sofia kept operating
  };
}

// ═══════════════════════════════════════════════════════════════
// MASTER OFFER PROCESSING
// Detects and tracks the "Carta na Manga" (30% discount, 4 years, 12h window)
// ═══════════════════════════════════════════════════════════════

export interface MasterOfferContext {
  supabase: SupabaseClient;
  conversaId: string;
  phone: string;
  clienteNome: string | null;
  assistantMessage: string;
  existingDados: Record<string, unknown>;
  extractedData: Record<string, unknown>;
  agentName: string;
}

export interface MasterOfferResult {
  detected: boolean;
  masterOfferAt: string | null;
  masterOfferExpires: string | null;
  updatedExtractedData: Record<string, unknown>;
}

/**
 * Process Master Offer tag in AI response
 */
export async function processMasterOffer(ctx: MasterOfferContext): Promise<MasterOfferResult> {
  const { supabase, conversaId, phone, clienteNome, assistantMessage, existingDados, extractedData, agentName } = ctx;
  
  const hasMasterOffer = assistantMessage.includes('[OFERTA_MASTER]');
  const alreadyHasMasterOffer = !!(extractedData as any).masterOfertaAt;
  
  if (!hasMasterOffer || alreadyHasMasterOffer) {
    return {
      detected: false,
      masterOfferAt: null,
      masterOfferExpires: null,
      updatedExtractedData: extractedData,
    };
  }
  
  const masterOfferTime = new Date();
  const masterOfferExpires = new Date(masterOfferTime.getTime() + 12 * 60 * 60 * 1000); // 12 hours
  
  console.log(`[response-processing] MASTER OFFER detected! Expires at: ${masterOfferExpires.toISOString()}`);
  
  // Update extracted data with MASTER offer tracking
  const updatedExtractedData = {
    ...extractedData,
    masterOfertaAt: masterOfferTime.toISOString(),
    masterOfertaExpiraEm: masterOfferExpires.toISOString(),
    masterOfertaAceita: false,
  };
  
  // Update conversation with MASTER offer tracking
  await supabase
    .from('chatbot_conversas')
    .update({
      dados_coletados: { ...existingDados, ...updatedExtractedData },
      master_offer_at: masterOfferTime.toISOString(),
      master_offer_expires_at: masterOfferExpires.toISOString(),
      master_offer_accepted: false,
    })
    .eq('id', conversaId);
  
  // Create admin notification about MASTER offer
  await supabase.from('admin_notifications').insert({
    admin_user_id: null,
    title: '🏆 Oferta MASTER ativada',
    message: `${agentName || 'IA'} ofereceu a OFERTA MASTER para ${clienteNome || phone}. Janela de 12h aberta até ${masterOfferExpires.toLocaleString('pt-BR')}.`,
    type: 'info',
    entity_type: 'chatbot_conversa',
    entity_id: conversaId,
    created_by_nome: agentName || 'IA',
  });
  
  return {
    detected: true,
    masterOfferAt: masterOfferTime.toISOString(),
    masterOfferExpires: masterOfferExpires.toISOString(),
    updatedExtractedData,
  };
}

// ═══════════════════════════════════════════════════════════════
// RESPONSE TAG PROCESSING
// Removes special tags and detects escalation needs
// ═══════════════════════════════════════════════════════════════

export interface ResponseTagResult {
  cleanMessage: string;
  needsHumanEscalation: boolean;
  hasMasterOffer: boolean;
  escalationDepartment?: string | null;
}

// Expanded pattern to capture all escalation tag variations
// PHASE: Triage Fix Error #4 - Capture [ESCALAR_HUMANO_*] variations
const ESCALATION_TAG_VARIATIONS = /\[ESCALAR[^\]]*\]/gi;

/**
 * Process and clean response tags from AI message
 * PHASE: Expanded to handle [ESCALAR_HUMANO_POS_VENDA] and similar variations
 */
export function processResponseTags(assistantMessage: string): ResponseTagResult {
  // Check for any escalation tag variation
  const escalationMatches = assistantMessage.match(ESCALATION_TAG_VARIATIONS);
  const needsHumanEscalation = escalationMatches !== null && escalationMatches.length > 0;
  const hasMasterOffer = assistantMessage.includes('[OFERTA_MASTER]');
  
  // Try to extract department from escalation tag
  let escalationDepartment: string | null = null;
  if (escalationMatches && escalationMatches.length > 0) {
    const tag = escalationMatches[0].toUpperCase();
    if (tag.includes('POS_VENDA') || tag.includes('POS-VENDA') || tag.includes('POSVENDA')) {
      escalationDepartment = 'pos_venda';
    } else if (tag.includes('FINANCEIRO') || tag.includes('FINANCE')) {
      escalationDepartment = 'financeiro';
    } else if (tag.includes('SAC') || tag.includes('SUPORTE')) {
      escalationDepartment = 'atendimento';
    } else if (tag.includes('FATURA')) {
      escalationDepartment = 'fatura';
    }
    console.log(`[RESPONSE_TAGS] Escalation detected: ${tag} -> department: ${escalationDepartment}`);
  }
  
  // Remove all escalation tag variations and master offer tag
  const cleanMessage = assistantMessage
    .replace(ESCALATION_TAG_VARIATIONS, '')
    .replace('[OFERTA_MASTER]', '')
    .replace(/^~+\s*/gm, '')  // Remove leading tildes
    .replace(/~{1,2}([^~]+)?$/gm, '$1')  // Remove trailing incomplete strikethrough
    .replace(/\s{2,}/g, ' ')
    .trim();
  
  return {
    cleanMessage,
    needsHumanEscalation,
    hasMasterOffer,
    escalationDepartment,
  };
}

// ═══════════════════════════════════════════════════════════════
// URL APPEND HELPER
// Ensures proposal URL is included when AI claims it was sent
// ═══════════════════════════════════════════════════════════════

/**
 * Append proposal URL if message claims sending but doesn't include it
 */
export function appendProposalUrlIfMissing(message: string, proposalUrl: string | null): string {
  if (!proposalUrl || !/^https?:\/\//i.test(proposalUrl)) {
    return message;
  }
  
  const hasAnyUrlInMessage = /https?:\/\//i.test(message);
  
  // FIX: Require EXPLICIT proposal/simulation context — not just generic send verbs
  // "mandei", "segue", "enviei" are too common in PT-BR and cause false positives
  const hasProposalContext = /(propost[ao]|simulação|simulacao|link da|seu link|economia personalizada|pdf|documento da economia)/i.test(message);
  const isClaimingSent = /(enviei|mandei|segue|j[aá]\s+foi|aqui est[aá]|preparei)/i.test(message);
  
  // Only append if message is EXPLICITLY about a proposal AND claims to be sending it
  if (!hasAnyUrlInMessage && hasProposalContext && isClaimingSent) {
    console.log(`[PROPOSAL_URL] ✅ Appending proposal URL (explicit context detected)`);
    return `${message}\n\nSegue o link por aqui também: ${proposalUrl}`;
  }
  
  if (!hasAnyUrlInMessage && isClaimingSent && !hasProposalContext) {
    console.log(`[PROPOSAL_URL] ⛔ Blocked URL injection: send verb found but no proposal context in: "${message.substring(0, 80)}..."`);
  }
  
  return message;
}

// ═══════════════════════════════════════════════════════════════
// UNIFIED RESPONSE PROCESSOR
// Combines all post-AI processing steps
// ═══════════════════════════════════════════════════════════════

export interface FullResponseProcessingContext {
  supabase: SupabaseClient;
  conversaId: string;
  phone: string;
  clienteNome: string | null;
  messageText: string;
  assistantMessage: string | null;
  existingDados: Record<string, unknown>;
  extractedData: Record<string, unknown>;
  agentName: string;
  proposalUrl: string | null;
  sendWhatsAppMessage: (phone: string, message: string) => Promise<void>;
}

export interface FullResponseProcessingResult {
  cleanMessage: string;
  needsHumanEscalation: boolean;
  aiFailedCompletely: boolean;
  masterOfferDetected: boolean;
  updatedExtractedData: Record<string, unknown>;
  messageSentDirectly: boolean;
  continuedOperating: boolean; // NEW: true if Sofia kept operating after AI failure (did NOT pause)
}

/**
 * Process AI response: handle failures, detect tags, clean message
 */
export async function processAIResponse(ctx: FullResponseProcessingContext): Promise<FullResponseProcessingResult> {
  const {
    supabase, conversaId, phone, clienteNome, messageText,
    assistantMessage, existingDados, extractedData, agentName,
    proposalUrl, sendWhatsAppMessage
  } = ctx;
  
  let finalMessage = assistantMessage || '';
  let aiFailedCompletely = false;
  let updatedExtractedData = extractedData;
  let messageSentDirectly = false;
  
  // Handle AI failure
  if (!assistantMessage) {
    aiFailedCompletely = true;
    const failureResult = await handleAIFailure({
      supabase, conversaId, phone, clienteNome, messageText, agentName, sendWhatsAppMessage
    });
    finalMessage = failureResult.fallbackMessage;
    messageSentDirectly = failureResult.messageSentDirectly;
  }
  
  // Process Master Offer
  if (!aiFailedCompletely) {
    const masterOfferResult = await processMasterOffer({
      supabase, conversaId, phone, clienteNome,
      assistantMessage: finalMessage,
      existingDados, extractedData, agentName
    });
    
    if (masterOfferResult.detected) {
      updatedExtractedData = masterOfferResult.updatedExtractedData;
    }
  }
  
  // Process response tags
  const tagResult = processResponseTags(finalMessage);
  let cleanMessage = tagResult.cleanMessage;
  
  // Append proposal URL if missing
  cleanMessage = appendProposalUrlIfMissing(cleanMessage, proposalUrl);
  
  // Track if Sofia continued operating after failure
  let continuedOperating = false;
  if (aiFailedCompletely) {
    // When AI fails, Sofia now continues (doesn't pause)
    continuedOperating = true;
  }
  
  return {
    cleanMessage,
    needsHumanEscalation: tagResult.needsHumanEscalation,
    aiFailedCompletely,
    masterOfferDetected: tagResult.hasMasterOffer && !aiFailedCompletely,
    updatedExtractedData,
    messageSentDirectly,
    continuedOperating,
  };
}
