/**
 * LLM Guardrails Module
 * Prevents LLM hallucinations and incorrect statements
 * Extracted from sofia-webhook/index.ts (Phase 14 refactoring)
 * 
 * Guards include:
 * 1. Premature Advancement Guard - Blocks skipping funnel steps
 * 2. False Delivery Claim Guard - Prevents claiming email/link sent without URL
 * 3. Unresolved Placeholder Guard - Catches [LINK], {url} placeholders
 * 4. Proposal Promise Guard - Blocks promises without minimum data
 */

import { detectProposalPromise } from './funnel-stage.ts';
import { type PatternEntry } from './detection-patterns.ts';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface GuardContext {
  cleanMessage: string;
  clienteNome: string | null;
  conversaId: string;
  propostaId: string | null;
  propostaLinkSent: boolean;
  proposalUrl: string | null;
  extractedData: Record<string, unknown>;
  existingDados: Record<string, unknown>;
  agentName?: string;
  patterns?: Map<string, PatternEntry>;

  // Context signals (avoid hallucinated human handoff)
  needsHumanEscalation?: boolean;
  conversaMode?: string | null;
  humanAgentId?: string | null;
}

export interface GuardResult {
  cleanMessage: string;
  wasBlocked: boolean;
  blockType: string | null;
  notification?: {
    title: string;
    message: string;
    type: 'warning' | 'error' | 'info';
  };
}

export interface MinimumDataCheck {
  nome?: string | null;
  email?: string | null;
  valorFatura?: number | null;
  consumo?: number | null;
  distribuidora?: string | null;
}

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Get client's first name for personalization
 */
function getFirstName(clienteNome: string | null): string {
  return clienteNome?.split(' ')[0] || '';
}

/**
 * Check if minimum data is available for proposal (local implementation)
 */
function hasMinimumData(data: MinimumDataCheck): boolean {
  const hasNome = !!data.nome;
  const hasEmail = !!data.email;
  const hasValorOuConsumo = !!(data.valorFatura || data.consumo);
  const hasDistribuidora = !!data.distribuidora;
  
  return hasNome && hasEmail && hasValorOuConsumo && hasDistribuidora;
}

/**
 * Identify which field is missing for a given task
 * PRIORITY ORDER (FASE 5): Nome > Valor > Distribuidora > Email
 */
export function identifyMissingDataForTask(
  task: 'proposta_inicial',
  data: MinimumDataCheck
): { field: string; question: string } | null {
  // PRIORITY 1: Nome (MUST be first - user experience)
  if (!data.nome) {
    return {
      field: 'nome',
      question: 'Para preparar sua proposta, primeiro me conta: *qual é o seu nome?* 😊',
    };
  }
  // PRIORITY 2: Valor da conta
  if (!data.valorFatura && !data.consumo) {
    return {
      field: 'valorFatura',
      question: 'Para calcular sua economia, me conta: *qual é o valor médio da sua conta de luz* por mês? 📊',
    };
  }
  // PRIORITY 3: Distribuidora
  if (!data.distribuidora) {
    return {
      field: 'distribuidora',
      question: 'Qual é a *distribuidora de energia* da sua região? (ex: CEMIG, Energisa MG) ⚡',
    };
  }
  // PRIORITY 4: Email (last - least friction)
  if (!data.email) {
    return {
      field: 'email',
      question: 'Qual é o seu *e-mail* para eu enviar a proposta? 📧',
    };
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// GUARD: DOCUMENT REQUEST (PHASE 1 vs PHASE 2)
// Prevents Sofia from asking for documents before proposal is sent
// ═══════════════════════════════════════════════════════════════

const DOCUMENT_REQUEST_PATTERN = /\b(envi[ae]r?|mand[ae]r?|foto|pdf|imagem|digitaliza|escanea|fatura|conta\s+de\s+luz|RG|CNH|documento|identidade|contrato\s+social)\b/i;

function checkDocumentRequest(message: string): boolean {
  const msgLower = message.toLowerCase();
  
  // Check if LLM is asking for documents
  const hasDocumentKeyword = DOCUMENT_REQUEST_PATTERN.test(message);
  const hasRequestIndicator = 
    msgLower.includes('preciso') ||
    msgLower.includes('precisar') ||
    msgLower.includes('consegue me enviar') ||
    msgLower.includes('pode enviar') ||
    msgLower.includes('manda aqui') ||
    msgLower.includes('envia aqui') ||
    msgLower.includes('envie') ||
    msgLower.includes('mande');
  
  if (hasDocumentKeyword && hasRequestIndicator) return true;
  
  // Additional specific patterns
  if (/\bfoto\s+(da|de).{0,20}(conta|fatura|rg|cnh|documento)/i.test(message)) return true;
  if (/\b(rg|cnh|documento|identidade).{0,30}(enviar?|mandar?|foto)/i.test(message)) return true;
  if (/para\s+garantir.{0,40}(envie?|mande?|foto|documento)/i.test(message)) return true;
  if (/próximo\s+passo.{0,30}(documento|foto|fatura)/i.test(message)) return true;
  
  return false;
}

export function applyDocumentRequestGuard(ctx: GuardContext): GuardResult {
  const isAskingForDocuments = checkDocumentRequest(ctx.cleanMessage);
  
  // HARD STOP: Always block document requests via WhatsApp
  // Documents must ONLY be collected via platform link
  if (isAskingForDocuments) {
    const firstName = getFirstName(ctx.clienteNome);
    
    // If we have proposal URL, direct to it
    if (ctx.proposalUrl) {
      const newMessage = firstName
        ? `${firstName}, para sua segurança, os documentos devem ser enviados através do link da sua proposta! 🔒\n\n📎 Acesse aqui: ${ctx.proposalUrl}\n\nClique em *"Solicitar Contrato"* para anexar os arquivos de forma segura.\n\nIsso protege seus dados pessoais! 💚`
        : `Para sua segurança, os documentos devem ser enviados através do link da sua proposta! 🔒\n\n📎 Acesse aqui: ${ctx.proposalUrl}\n\nClique em *"Solicitar Contrato"* para anexar os arquivos de forma segura.\n\nIsso protege seus dados pessoais! 💚`;
      
      return {
        cleanMessage: newMessage,
        wasBlocked: true,
        blockType: 'document_request_blocked_platform_only',
        notification: {
          title: '⛔ Pedido de documento via WhatsApp BLOQUEADO',
          message: `${ctx.agentName || 'IA'} tentou pedir documentos via WhatsApp para ${ctx.clienteNome || 'cliente'}. Resposta substituída por instrução da plataforma.`,
          type: 'warning',
        },
      };
    }
    
    // No proposal yet - ask for data first or wait for proposal
    const mergedData = { ...ctx.existingDados, ...ctx.extractedData } as MinimumDataCheck;
    
    if (!hasMinimumData(mergedData)) {
      const missing = identifyMissingDataForTask('proposta_inicial', mergedData);
      if (missing?.question) {
        return {
          cleanMessage: missing.question,
          wasBlocked: true,
          blockType: 'document_request_premature',
          notification: {
            title: '⚠️ Pedido de documento bloqueado (sem proposta)',
            message: `${ctx.agentName || 'IA'} tentou pedir documentos antes de gerar proposta para ${ctx.clienteNome || 'cliente'}. Campo faltante: ${missing.field}.`,
            type: 'warning',
          },
        };
      }
    }
    
    // Data complete but no proposal URL yet
    const newMessage = firstName
      ? `${firstName}, os documentos devem ser enviados de forma segura através da plataforma! 🔒\n\nAssim que sua proposta estiver pronta, você receberá um link exclusivo para anexar os arquivos com total segurança.\n\nAguarde só mais um pouquinho! 💚`
      : `Os documentos devem ser enviados de forma segura através da plataforma! 🔒\n\nAssim que sua proposta estiver pronta, você receberá um link exclusivo para anexar os arquivos com total segurança.\n\nAguarde só mais um pouquinho! 💚`;
    
    return {
      cleanMessage: newMessage,
      wasBlocked: true,
      blockType: 'document_request_blocked_platform_only',
      notification: {
        title: '⛔ Pedido de documento via WhatsApp BLOQUEADO',
        message: `${ctx.agentName || 'IA'} tentou pedir documentos via WhatsApp para ${ctx.clienteNome || 'cliente'}. Proposta ainda não gerada.`,
        type: 'warning',
      },
    };
  }
  
  return { cleanMessage: ctx.cleanMessage, wasBlocked: false, blockType: null };
}

// ═══════════════════════════════════════════════════════════════
// GUARD: PREMATURE ADVANCEMENT
// Prevents Sofia from skipping funnel steps
// ═══════════════════════════════════════════════════════════════

const PREMATURE_ADVANCEMENT_PATTERNS = [
  /próximos\s+passos/i,
  /seguintes\s+etapas/i,
  /etapa\s+seguinte/i,
  /para\s+continuar.*preciso/i,
  /agora\s+é\s+só\s+enviar/i,
  /basta\s+enviar.*documento/i,
  /só\s+falta.*documento/i,
  /vamos\s+para.*próximo/i,
  /contrato.*pronto/i,
  /já\s+podemos\s+finalizar/i,
];

export function checkPrematureAdvancement(
  message: string,
  hasProposalId: boolean,
  proposalLinkSent: boolean
): boolean {
  // Only check if we DON'T have a proposal yet
  if (hasProposalId || proposalLinkSent) return false;
  
  return PREMATURE_ADVANCEMENT_PATTERNS.some(pattern => pattern.test(message));
}

export function applyPrematureAdvancementGuard(ctx: GuardContext): GuardResult {
  const isPremature = checkPrematureAdvancement(
    ctx.cleanMessage,
    !!ctx.propostaId,
    ctx.propostaLinkSent
  );
  
  if (!isPremature) {
    return { cleanMessage: ctx.cleanMessage, wasBlocked: false, blockType: null };
  }
  
  const firstName = getFirstName(ctx.clienteNome);
  
  // ═══════════════════════════════════════════════════════════════
  // PHASE 48 FIX: Check minimum data before promising proposal!
  // If data is missing, ask for it instead of promising an empty proposal
  // ═══════════════════════════════════════════════════════════════
  const mergedData = { ...ctx.existingDados, ...ctx.extractedData } as MinimumDataCheck;
  
  if (hasMinimumData(mergedData)) {
    // ✅ Data complete - OK to promise proposal
    const newMessage = firstName
      ? `Perfeito, ${firstName}! ✅\n\nO sistema está preparando sua proposta personalizada. Assim que o link estiver pronto, te envio aqui no WhatsApp para você conferir todos os números e detalhes! 😊`
      : `Perfeito! ✅\n\nO sistema está preparando sua proposta personalizada. Assim que o link estiver pronto, te envio aqui no WhatsApp para você conferir todos os números e detalhes! 😊`;
    
    return {
      cleanMessage: newMessage,
      wasBlocked: true,
      blockType: 'premature_advancement',
      notification: {
        title: '⚠️ Avanço prematuro bloqueado',
        message: `${ctx.agentName || 'IA'} tentou "adiantar próximo passo" sem proposta inicial para ${ctx.clienteNome || 'cliente'}. Resposta corrigida automaticamente.`,
        type: 'warning',
      },
    };
  }
  
  // ❌ Data incomplete - ask for missing field instead of promising proposal
  const missing = identifyMissingDataForTask('proposta_inicial', mergedData);
  
  if (missing) {
    console.log(`[GUARDRAILS] Premature advancement blocked, missing field: ${missing.field}`);
    return {
      cleanMessage: missing.question,
      wasBlocked: true,
      blockType: 'premature_advancement_data_missing',
      notification: {
        title: '⚠️ Avanço prematuro: dado faltante',
        message: `${ctx.agentName || 'IA'} tentou avançar sem ${missing.field} para ${ctx.clienteNome || 'cliente'}. Perguntando pelo campo faltante.`,
        type: 'warning',
      },
    };
  }
  
  // Fallback (should rarely happen if identifyMissingDataForTask is comprehensive)
  const fallbackMessage = firstName
    ? `${firstName}, para preparar sua proposta personalizada, preciso de mais uma informação! Qual é o valor médio da sua conta de luz? 📊`
    : `Para preparar sua proposta personalizada, preciso de mais uma informação! Qual é o valor médio da sua conta de luz? 📊`;
  
  return {
    cleanMessage: fallbackMessage,
    wasBlocked: true,
    blockType: 'premature_advancement_data_missing',
    notification: {
      title: '⚠️ Avanço prematuro bloqueado (fallback)',
      message: `${ctx.agentName || 'IA'} tentou avançar sem dados completos para ${ctx.clienteNome || 'cliente'}. Perguntando por valor de conta.`,
      type: 'warning',
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// GUARD: FALSE DELIVERY CLAIM
// Prevents claiming email/link was sent without actual URL
// ═══════════════════════════════════════════════════════════════

function detectFalseEmailClaim(message: string): boolean {
  return (
    /(estou\s+enviando|enviei|acabei\s+de\s+enviar|mandei).{0,60}e-?mail/i.test(message) ||
    /segue.{0,40}no.{0,10}seu.{0,10}e-?mail/i.test(message) ||
    /(proposta|link).{0,20}enviad[ao].{0,30}e-?mail/i.test(message) ||
    /enviad[ao]\s+com\s+sucesso.{0,30}e-?mail/i.test(message) ||
    /foi\s+enviad[ao].{0,40}e-?mail/i.test(message) ||
    /j[aá]\s+foi.{0,20}(enviado|enviada|mandado|mandada).{0,30}e-?mail/i.test(message) ||
    /proposta.{0,15}sucesso.{0,20}e-?mail/i.test(message)
  );
}

function detectFalseLinkClaim(message: string): boolean {
  return (
    /(te\s+enviei|enviei|acabei\s+de\s+enviar|mandei).{0,40}link/i.test(message) ||
    /segue.{0,20}o.{0,10}link/i.test(message) ||
    /j[aá]\s+(te\s+)?mand[eou]i?.{0,30}(proposta|link)/i.test(message) ||
    /voc[eê]\s+j[aá]\s+receb.{0,20}(link|proposta)/i.test(message) ||
    /j[aá]\s+(enviei|mandei).{0,20}(pra|para)\s+(voc[eê]|ti)/i.test(message) ||
    /proposta.{0,20}j[aá]\s+foi.{0,20}(enviada|mandada)/i.test(message) ||
    /link.{0,20}j[aá]\s+(est[aá]|foi).{0,20}(no\s+seu|enviado)/i.test(message)
  );
}

export function applyFalseDeliveryClaim(ctx: GuardContext): GuardResult {
  const hasValidUrl = typeof ctx.proposalUrl === 'string' && /^https?:\/\//i.test(ctx.proposalUrl);
  const isClaimingEmail = detectFalseEmailClaim(ctx.cleanMessage);
  const isClaimingLink = detectFalseLinkClaim(ctx.cleanMessage);
  
  if ((isClaimingEmail || isClaimingLink) && !hasValidUrl) {
    const firstName = getFirstName(ctx.clienteNome);
    const newMessage = firstName
      ? `Perfeito, ${firstName}! ✅\n\nEstou finalizando a geração da sua proposta. Assim que o link estiver pronto, eu te envio aqui no WhatsApp (e ele também seguirá para o seu e-mail).`
      : `Perfeito! ✅\n\nEstou finalizando a geração da sua proposta. Assim que o link estiver pronto, eu te envio aqui no WhatsApp (e ele também seguirá para o seu e-mail).`;
    
    return {
      cleanMessage: newMessage,
      wasBlocked: true,
      blockType: 'false_delivery_claim',
      notification: {
        title: '⚠️ Promessa de envio bloqueada (sem link)',
        message: `${ctx.agentName || 'IA'} afirmou envio por e-mail/link sem URL gerada para ${ctx.clienteNome || 'cliente'}. Resposta foi corrigida automaticamente.`,
        type: 'warning',
      },
    };
  }
  
  // If we have URL but message claims sending without including it, append URL
  if (hasValidUrl && (isClaimingEmail || isClaimingLink)) {
    const hasUrlInMessage = /https?:\/\//i.test(ctx.cleanMessage);
    if (!hasUrlInMessage) {
      return {
        cleanMessage: `${ctx.cleanMessage}\n\nSegue o link por aqui também: ${ctx.proposalUrl}`,
        wasBlocked: false,
        blockType: null,
      };
    }
  }
  
  return { cleanMessage: ctx.cleanMessage, wasBlocked: false, blockType: null };
}

// ═══════════════════════════════════════════════════════════════
// GUARD: UNRESOLVED PLACEHOLDER
// Catches [LINK], {url}, [PROPOSTA_LINK], [ESCALAR_*], etc.
// PHASE: Triage Fix Error #4 - Expanded to capture escalation tags
// ═══════════════════════════════════════════════════════════════

// Expanded pattern to catch ESCALAR, HUMANO, DEPARTAMENTO, SAC, SUPORTE tags
const PLACEHOLDER_PATTERN = /\[[^\]]*(?:LINK|PROPOSTA|URL|PROPOSAL|EMAIL|ESCALAR|HUMANO|DEPARTAMENTO|SAC|SUPORTE|POS.?VENDA)[^\]]*\]|\{[^}]*(?:link|proposta|url|proposal|email|escalar|humano|departamento)[^}]*\}/gi;

// Specific pattern for escalation tags that should trigger escalation flow
const ESCALATION_TAG_PATTERN = /\[ESCALAR[^\]]*\]/gi;

export function applyUnresolvedPlaceholderGuard(ctx: GuardContext): GuardResult {
  const matches = ctx.cleanMessage.match(PLACEHOLDER_PATTERN);
  
  if (!matches || matches.length === 0) {
    return { cleanMessage: ctx.cleanMessage, wasBlocked: false, blockType: null };
  }
  
  const hasValidUrl = typeof ctx.proposalUrl === 'string' && /^https?:\/\//i.test(ctx.proposalUrl);
  const firstName = getFirstName(ctx.clienteNome);
  
  // Check if this is an escalation tag - needs different handling
  const hasEscalationTag = ESCALATION_TAG_PATTERN.test(ctx.cleanMessage);
  
  if (hasEscalationTag) {
    // Remove escalation tags but don't replace with proposal message
    // The system should trigger actual escalation flow
    const cleanedMessage = ctx.cleanMessage
      .replace(ESCALATION_TAG_PATTERN, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    
    // If message became too short after removing tags, generate fallback
    const finalMessage = cleanedMessage.length > 20 ? cleanedMessage : 
      (firstName 
        ? `${firstName}, vou te transferir para um de nossos atendentes que vai poder te ajudar melhor! 💚 Aguarde um momento.`
        : `Vou te transferir para um de nossos atendentes que vai poder te ajudar melhor! 💚 Aguarde um momento.`);
    
    return {
      cleanMessage: finalMessage,
      wasBlocked: true,
      blockType: 'escalation_tag_removed',
      notification: {
        title: '⚠️ Tag de escalação removida',
        message: `${ctx.agentName || 'IA'} gerou tag de escalação "${matches.join(', ')}" para ${ctx.clienteNome || 'cliente'}. Tag removida e escalação deve ser processada via fluxo adequado.`,
        type: 'warning',
      },
    };
  }
  
  if (hasValidUrl) {
    // Replace placeholders with actual URL
    const newMessage = ctx.cleanMessage.replace(PLACEHOLDER_PATTERN, ctx.proposalUrl!);
    return {
      cleanMessage: newMessage,
      wasBlocked: false,
      blockType: null,
    };
  }
  
  // No URL - replace with honest message
  const newMessage = firstName
    ? `${firstName}, estou finalizando a geração da sua proposta personalizada! ✅\n\nAssim que o link estiver pronto, te envio aqui no WhatsApp. Aguarde só mais um pouquinho! 😊`
    : `Estou finalizando a geração da sua proposta personalizada! ✅\n\nAssim que o link estiver pronto, te envio aqui no WhatsApp. Aguarde só mais um pouquinho! 😊`;
  
  return {
    cleanMessage: newMessage,
    wasBlocked: true,
    blockType: 'unresolved_placeholder',
    notification: {
      title: '⚠️ Placeholder não resolvido bloqueado',
      message: `${ctx.agentName || 'IA'} tentou enviar mensagem com placeholder literal "${matches.join(', ')}" para ${ctx.clienteNome || 'cliente'}. Resposta foi corrigida automaticamente.`,
      type: 'warning',
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// GUARD: PROPOSAL PROMISE
// Blocks promises without minimum data
// ═══════════════════════════════════════════════════════════════

export function applyProposalPromiseGuard(ctx: GuardContext): GuardResult {
  const isPromising = detectProposalPromise(ctx.cleanMessage, ctx.patterns);
  
  if (!isPromising) {
    return { cleanMessage: ctx.cleanMessage, wasBlocked: false, blockType: null };
  }
  
  const mergedData = { ...ctx.existingDados, ...ctx.extractedData } as MinimumDataCheck;
  
  if (hasMinimumData(mergedData)) {
    return { cleanMessage: ctx.cleanMessage, wasBlocked: false, blockType: null };
  }
  
  const missing = identifyMissingDataForTask('proposta_inicial', mergedData);
  const firstName = getFirstName(ctx.clienteNome);
  
  let newMessage: string;
  if (missing?.question) {
    newMessage = missing.question;
  } else {
    newMessage = firstName
      ? `${firstName}, para preparar sua proposta personalizada, preciso de mais uma informação! Qual o valor médio da sua conta de luz por mês? 📊`
      : `Para preparar sua proposta personalizada, preciso de mais uma informação! Qual o valor médio da sua conta de luz por mês? 📊`;
  }
  
  return {
    cleanMessage: newMessage,
    wasBlocked: true,
    blockType: 'proposal_promise',
    notification: {
      title: '🚫 Promessa vazia bloqueada',
      message: `${ctx.agentName || 'IA'} tentou prometer proposta sem dados completos para ${ctx.clienteNome || 'cliente'}. Campo faltante: ${missing?.field || 'desconhecido'}. Resposta foi substituída por pergunta.`,
      type: 'warning',
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// GUARD: PROPOSAL URL REMOVAL
// Prevents LLM from generating proposal URLs in responses
// Links should only be sent by bitrix24-link-webhook
// ═══════════════════════════════════════════════════════════════

const PROPOSAL_URL_PATTERNS = [
  /https?:\/\/[^\s]*proposta[^\s]*/gi,
  /https?:\/\/[^\s]*coesa[^\s]*/gi,
  /https?:\/\/[^\s]+\/proposta[-_]?(?:inicial|definitiva)?\/[a-f0-9-]+[^\s]*/gi,
];

const LINK_ANNOUNCEMENT_PATTERNS = [
  /segue\s*(?:o\s*)?link[:\s]*/gi,
  /acesse\s*(?:aqui)?[:\s]*/gi,
  /clique\s*(?:aqui)?[:\s]*/gi,
  /(?:veja|confira)\s*(?:a\s*sua\s*)?proposta[:\s]*/gi,
  /aqui\s+est[aá]\s+(?:o\s+)?link[:\s]*/gi,
  /(?:te\s+)?(?:mando|envio)\s+(?:o\s+)?link[:\s]*/gi,
];

export function applyProposalUrlRemovalGuard(ctx: GuardContext): GuardResult {
  let cleanMessage = ctx.cleanMessage;
  let foundUrls: string[] = [];
  
  // Detect and remove proposal URLs
  for (const pattern of PROPOSAL_URL_PATTERNS) {
    const matches = cleanMessage.match(pattern);
    if (matches) {
      foundUrls.push(...matches);
      cleanMessage = cleanMessage.replace(pattern, '');
    }
  }
  
  if (foundUrls.length === 0) {
    return { cleanMessage: ctx.cleanMessage, wasBlocked: false, blockType: null };
  }
  
  // Remove orphaned link announcement phrases
  for (const pattern of LINK_ANNOUNCEMENT_PATTERNS) {
    cleanMessage = cleanMessage.replace(pattern, '');
  }
  
  // Clean up extra whitespace
  cleanMessage = cleanMessage
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s{2,}/g, ' ')
    .trim();
  
  // If message became too short, generate fallback
  if (cleanMessage.length < 30) {
    const firstName = getFirstName(ctx.clienteNome);
    cleanMessage = firstName
      ? `Pronto, ${firstName}! 🎉 O link da sua proposta será enviado em instantes pelo sistema!`
      : `Pronto! 🎉 O link da sua proposta será enviado em instantes pelo sistema!`;
  }
  
  return {
    cleanMessage,
    wasBlocked: true,
    blockType: 'proposal_url_in_llm_response',
    notification: {
      title: '⚠️ Link removido da resposta da IA',
      message: `IA gerou ${foundUrls.length} link(s) de proposta no texto. Removidos para evitar duplicidade. URLs: ${foundUrls.slice(0, 3).join(', ')}${foundUrls.length > 3 ? '...' : ''}`,
      type: 'info',
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// GUARD: PROPOSAL ALREADY SENT (ANTI "PROMESSA" DUPLICADA)
// When the link was already sent (proposta_link_sent_at/event_proposal_sent),
// block LLM from saying "estou preparando" / "posso enviar".
// REINFORCED: Also checks event_proposal_sent = true explicitly
// ═══════════════════════════════════════════════════════════════

const PROPOSAL_ALREADY_SENT_PATTERNS = [
  /estou\s+(?:finalizando|preparando|gerando).{0,40}proposta/i,
  /j[aá]\s+estou\s+preparando/i,
  /vou\s+preparar\s+(?:a\s+)?proposta/i,
  /posso\s+te\s+enviar.{0,40}link/i,
  /vou\s+te\s+enviar\s+o\s+link/i,
  /em\s+instantes.{0,40}(link|proposta)/i,
  /voc[eê]\s+vai\s+receber.{0,40}(link|proposta)/i,
  /preparando\s+sua\s+proposta/i,
  /aguarde.{0,30}(link|proposta)/i,
  /sua\s+proposta\s+personalizada.{0,20}agora/i,
  /link\s+da\s+sua\s+proposta.{0,20}instantes/i,
];

function checkProposalAlreadySentPromise(message: string): boolean {
  return PROPOSAL_ALREADY_SENT_PATTERNS.some((p) => p.test(message));
}

export interface ProposalSentContext {
  propostaLinkSentAt?: string | null;
  eventProposalSent?: boolean | null;
  propostaId?: string | null;
}

/**
 * Check if proposal was already sent using multiple signals
 */
export function wasProposalAlreadySent(ctx: ProposalSentContext): boolean {
  return !!(
    ctx.propostaLinkSentAt ||
    ctx.eventProposalSent === true
  );
}

export function applyProposalAlreadySentGuard(ctx: GuardContext): GuardResult {
  if (!ctx.propostaLinkSent) {
    return { cleanMessage: ctx.cleanMessage, wasBlocked: false, blockType: null };
  }

  if (!checkProposalAlreadySentPromise(ctx.cleanMessage)) {
    return { cleanMessage: ctx.cleanMessage, wasBlocked: false, blockType: null };
  }

  const firstName = getFirstName(ctx.clienteNome);
  const url = ctx.proposalUrl;
  const linkLine = url ? `\n\n📋 Link da proposta: ${url}` : '';

  const newMessage = firstName
    ? `${firstName}, o link da sua proposta *já foi enviado aqui na conversa* ✅${linkLine}\n\nSe quiser, me diga o que você achou (ou qual dúvida ficou) que eu te explico agora. 😊`
    : `O link da sua proposta *já foi enviado aqui na conversa* ✅${linkLine}\n\nSe quiser, me diga o que você achou (ou qual dúvida ficou) que eu te explico agora. 😊`;

  return {
    cleanMessage: newMessage,
    wasBlocked: true,
    blockType: 'proposal_already_sent_block_duplicate_promise',
    notification: {
      title: '⚠️ Promessa duplicada de link bloqueada',
      message: `${ctx.agentName || 'IA'} tentou prometer envio de link/proposta mesmo após envio confirmado (event_proposal_sent=true). Resposta substituída para evitar confusão.`,
      type: 'warning',
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// GUARD: FALSE TIME PROMISE
// Blocks LLM from inventing specific response time promises
// (e.g., "entra em contato em até 2 horas", "retornamos em 30 min")
// ═══════════════════════════════════════════════════════════════

const FALSE_TIME_PROMISE_PATTERNS = [
  /em\s+at[eé]\s+\d+\s*(hora|hr|min|minuto|dia)/gi,
  /\d+\s*(hora|hr|min|minuto|dia)s?\s+(no\s+m[aá]ximo|pra|para|de|a)/gi,
  /entra(r[aá]?|mos)?\s+em\s+contato\s+em\s+\d+/gi,
  /retorna(r[aá]?|mos)?\s+em\s+\d+/gi,
  /responde(r[aá]?|mos)?\s+em\s+at[eé]\s+\d+/gi,
  /prazo\s+(de\s+)?\d+\s*(hora|hr|min|minuto|dia)/gi,
  /dentro\s+de\s+\d+\s*(hora|hr|min|minuto)/gi,
];

function checkFalseTimePromise(message: string): { found: boolean; matches: string[] } {
  const matches: string[] = [];
  for (const pattern of FALSE_TIME_PROMISE_PATTERNS) {
    const found = message.match(pattern);
    if (found) {
      matches.push(...found);
    }
  }
  return { found: matches.length > 0, matches };
}

export function applyFalseTimePromiseGuard(ctx: GuardContext): GuardResult {
  const { found, matches } = checkFalseTimePromise(ctx.cleanMessage);
  
  if (!found) {
    return { cleanMessage: ctx.cleanMessage, wasBlocked: false, blockType: null };
  }
  
  console.log(`[GUARDRAILS] ⚠️ False time promise detected: ${matches.join(', ')}`);
  
  // Remove the false promise from the message
  let cleanMessage = ctx.cleanMessage;
  for (const pattern of FALSE_TIME_PROMISE_PATTERNS) {
    cleanMessage = cleanMessage.replace(pattern, 'em breve');
  }
  
  // Also remove variations like "tudo bem?" after the promise
  cleanMessage = cleanMessage.replace(/em breve[.,]?\s*tudo bem\??/gi, 'em breve, ok?');
  
  // Clean up whitespace
  cleanMessage = cleanMessage
    .replace(/\s{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  
  return {
    cleanMessage,
    wasBlocked: true,
    blockType: 'false_time_promise',
    notification: {
      title: '⚠️ Promessa de prazo bloqueada',
      message: `IA inventou prazo de resposta: "${matches.join(', ')}". Substituído por "em breve".`,
      type: 'warning',
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// GUARD: HUMAN HANDOFF HALLUCINATION
// Blocks "vou passar para um especialista / atendente entra em contato" when
// there is no real escalation/takeover happening.
// ═══════════════════════════════════════════════════════════════

const HUMAN_HANDOFF_PATTERNS = [
  /vou\s+passar\s+seu\s+caso\s+para\s+(?:um|uma)\s+(?:especialista|atendente|equipe)/i,
  /vou\s+te\s+(?:transferir|encaminhar)/i,
  /um\s+(?:especialista|atendente).{0,40}vai\s+entrar\s+em\s+contato/i,
  /equipe\s+especializada/i,
  /mais\s+autonomia\s+para\s+avaliar/i,
  /vou\s+abrir\s+um\s+chamado/i,
];

function checkHumanHandoffHallucination(message: string): boolean {
  return HUMAN_HANDOFF_PATTERNS.some((p) => p.test(message));
}

export function applyHumanHandoffHallucinationGuard(ctx: GuardContext): GuardResult {
  const allowHandoff =
    !!ctx.needsHumanEscalation ||
    (ctx.conversaMode === 'paused_for_human') ||
    !!ctx.humanAgentId;

  if (allowHandoff) {
    return { cleanMessage: ctx.cleanMessage, wasBlocked: false, blockType: null };
  }

  if (!checkHumanHandoffHallucination(ctx.cleanMessage)) {
    return { cleanMessage: ctx.cleanMessage, wasBlocked: false, blockType: null };
  }

  const firstName = getFirstName(ctx.clienteNome);
  const newMessage = firstName
    ? `${firstName}, entendi seu pedido — mas eu não posso alterar condições fora do que está previsto em contrato (ex.: remover multa ou “criar” desconto extra).\n\nO que eu posso fazer agora é te explicar as opções reais de plano/fidelidade e te ajudar a escolher o melhor cenário. Quer priorizar *maior desconto* ou *mais flexibilidade*?`
    : `Entendi seu pedido — mas eu não posso alterar condições fora do que está previsto em contrato (ex.: remover multa ou “criar” desconto extra).\n\nO que eu posso fazer agora é te explicar as opções reais de plano/fidelidade e te ajudar a escolher o melhor cenário. Quer priorizar *maior desconto* ou *mais flexibilidade*?`;

  return {
    cleanMessage: newMessage,
    wasBlocked: true,
    blockType: 'human_handoff_hallucination_blocked',
    notification: {
      title: '⛔ Handoff humano inventado bloqueado',
      message: `${ctx.agentName || 'IA'} tentou prometer transferência/contato humano sem escalação real. Resposta substituída por posição objetiva de política comercial.`,
      type: 'warning',
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// GUARD: TEMPLATE FOOTER HALLUCINATION
// Blocks LLM from generating fake disclaimers, demo warnings, or corporate footers
// that look like email templates (e.g., "Link fictício para fins de demonstração")
// ═══════════════════════════════════════════════════════════════

const TEMPLATE_FOOTER_PATTERNS = [
  /link\s+fict[ií]cio/i,
  /fins?\s+de\s+demonstra[çc][ãa]o/i,
  /assistente\s+virtual\s*[-–]\s*coesa/i,
  /COESA\s+S\.?A\.?/i,  // Sofia NUNCA usa "COESA S.A." - é "COESA Energia"
  /═{5,}/,  // LLM gerando linhas de separador visual em mensagens
  /⚠️\s*ATEN[ÇC][ÃA]O:\s*(link|este|para)/i,
  /\*este\s+[eé]\s+um\s+exemplo\*/i,
  /dados?\s+fict[ií]cios?/i,
  /meramente\s+ilustrativ/i,
  /apenas\s+para\s+demonstra/i,
  /resposta\s+(de\s+)?demonstra[çc][ãa]o/i,
  /footer\s+(de\s+)?template/i,
];

function checkTemplateFooterHallucination(message: string): boolean {
  return TEMPLATE_FOOTER_PATTERNS.some(pattern => pattern.test(message));
}

export function applyTemplateFooterHallucinationGuard(ctx: GuardContext): GuardResult {
  if (!checkTemplateFooterHallucination(ctx.cleanMessage)) {
    return { cleanMessage: ctx.cleanMessage, wasBlocked: false, blockType: null };
  }
  
  console.log('[GUARDRAILS] ⛔ CRITICAL: Template footer hallucination detected!');
  
  // Se proposta já foi enviada, dar resposta contextual
  if (ctx.propostaLinkSent) {
    const firstName = getFirstName(ctx.clienteNome);
    const linkLine = ctx.proposalUrl ? `\n\n📋 Seu link: ${ctx.proposalUrl}` : '';
    
    const newMessage = firstName
      ? `${firstName}, sua proposta já foi enviada! ✅${linkLine}\n\nMe conta: o que achou? Ficou alguma dúvida? 😊`
      : `Sua proposta já foi enviada! ✅${linkLine}\n\nMe conta: o que achou? Ficou alguma dúvida? 😊`;
    
    return {
      cleanMessage: newMessage,
      wasBlocked: true,
      blockType: 'template_footer_hallucination_blocked',
      notification: {
        title: '⛔ ALUCINAÇÃO GRAVE: LLM gerou disclaimer/footer fake',
        message: `LLM gerou mensagem com padrões de template (fictício, demonstração, COESA S.A.) para ${ctx.clienteNome || 'cliente'}. Resposta substituída.`,
        type: 'error',
      },
    };
  }
  
  // Se proposta não foi enviada, bloquear completamente
  return {
    cleanMessage: '',  // Bloquear completamente - não enviar nada
    wasBlocked: true,
    blockType: 'template_footer_hallucination_blocked_no_message',
    notification: {
      title: '⛔ ALUCINAÇÃO GRAVE: LLM gerou disclaimer/footer fake',
      message: `LLM gerou mensagem absurda (fictício, demonstração, COESA S.A.) para ${ctx.clienteNome || 'cliente'}. Mensagem BLOQUEADA completamente.`,
      type: 'error',
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// GUARD: PROPOSAL URL VERIFICATION
// Validates that any proposal URL in the message is legitimate
// Blocks fake/placeholder/malformed URLs before they reach client
// GUARDRAIL #3: Impedir envio de link de proposta não verificado
// ═══════════════════════════════════════════════════════════════

const VALID_PROPOSAL_DOMAINS = [
  'coesasolar.com.br',
  'coesaenergia.com.br',
  'coesa.com.br',
  'lovable.app',
  'lovableproject.com',
];

// UUID pattern for proposal IDs
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function extractUrlsFromMessage(message: string): string[] {
  const urlPattern = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
  return message.match(urlPattern) || [];
}

function isValidProposalUrl(url: string): { valid: boolean; reason?: string } {
  try {
    const parsed = new URL(url);
    
    // Check domain
    const isValidDomain = VALID_PROPOSAL_DOMAINS.some(domain => 
      parsed.hostname.includes(domain)
    );
    
    if (!isValidDomain) {
      return { valid: false, reason: 'invalid_domain' };
    }
    
    // Check if URL contains a valid UUID (proposal ID)
    const hasValidUUID = UUID_PATTERN.test(url);
    if (!hasValidUUID) {
      return { valid: false, reason: 'missing_uuid' };
    }
    
    // Check for suspicious patterns
    const suspiciousPatterns = [
      /exemplo/i,
      /teste/i,
      /demo/i,
      /placeholder/i,
      /fake/i,
      /xxxx/i,
      /0000-0000-0000/,
    ];
    
    const hasSuspiciousContent = suspiciousPatterns.some(p => p.test(url));
    if (hasSuspiciousContent) {
      return { valid: false, reason: 'suspicious_content' };
    }
    
    return { valid: true };
  } catch (e) {
    return { valid: false, reason: 'malformed_url' };
  }
}

export function applyProposalUrlVerificationGuard(ctx: GuardContext): GuardResult {
  const urls = extractUrlsFromMessage(ctx.cleanMessage);
  
  // Only check URLs that look like proposal links
  const proposalUrls = urls.filter(url => 
    /proposta/i.test(url) || 
    /proposal/i.test(url) ||
    UUID_PATTERN.test(url)
  );
  
  if (proposalUrls.length === 0) {
    return { cleanMessage: ctx.cleanMessage, wasBlocked: false, blockType: null };
  }
  
  // Validate each proposal URL
  for (const url of proposalUrls) {
    const validation = isValidProposalUrl(url);
    
    if (!validation.valid) {
      console.log(`[GUARDRAILS] ⛔ Invalid proposal URL detected: ${url} (reason: ${validation.reason})`);
      
      const firstName = getFirstName(ctx.clienteNome);
      
      // If we have a valid proposal URL in context, use it
      if (ctx.proposalUrl && isValidProposalUrl(ctx.proposalUrl).valid) {
        const newMessage = ctx.cleanMessage.replace(url, ctx.proposalUrl);
        return {
          cleanMessage: newMessage,
          wasBlocked: false, // Not blocking, just fixing
          blockType: null,
        };
      }
      
      // No valid URL available - replace with honest message
      const newMessage = firstName
        ? `${firstName}, estou finalizando sua proposta! Assim que o link estiver pronto, te envio aqui. 😊`
        : `Estou finalizando sua proposta! Assim que o link estiver pronto, te envio aqui. 😊`;
      
      return {
        cleanMessage: newMessage,
        wasBlocked: true,
        blockType: 'invalid_proposal_url_blocked',
        notification: {
          title: '⛔ URL de proposta inválida bloqueada',
          message: `LLM gerou URL inválida (${validation.reason}): ${url.slice(0, 100)}. Resposta substituída.`,
          type: 'warning',
        },
      };
    }
  }
  
  return { cleanMessage: ctx.cleanMessage, wasBlocked: false, blockType: null };
}

// ═══════════════════════════════════════════════════════════════
// MAIN FUNCTION: Apply all guards sequentially
// ═══════════════════════════════════════════════════════════════

export function applyAllGuards(ctx: GuardContext): GuardResult {
  let result: GuardResult = { cleanMessage: ctx.cleanMessage, wasBlocked: false, blockType: null };
  
  // 0-CRITICAL: Block template footer hallucinations FIRST
  // (fictício, demonstração, COESA S.A., ═══════ separators)
  result = applyTemplateFooterHallucinationGuard({ ...ctx, cleanMessage: result.cleanMessage });
  if (result.wasBlocked) return result;
  
  // 0a. ANTI-SPAM: Remove proposal URLs generated by LLM (prevents duplicate sends)
  result = applyProposalUrlRemovalGuard({ ...ctx, cleanMessage: result.cleanMessage });
  // Note: Don't return early - just log and continue with cleaned message
  const urlRemovalResult = result;

  // 0b. If proposal was already sent, block "promise" messages that create pending_task loops
  result = applyProposalAlreadySentGuard({ ...ctx, cleanMessage: result.cleanMessage });
  if (result.wasBlocked) return result;
  
  // 0c. GUARDRAIL #3: Verify any proposal URLs in the message are legitimate
  result = applyProposalUrlVerificationGuard({ ...ctx, cleanMessage: result.cleanMessage });
  if (result.wasBlocked) return result;
  
  // 1. Document Request Guard (Phase 1 vs Phase 2)
  result = applyDocumentRequestGuard({ ...ctx, cleanMessage: result.cleanMessage });
  if (result.wasBlocked) return result;
  
  // 2. Premature Advancement Guard
  result = applyPrematureAdvancementGuard({ ...ctx, cleanMessage: result.cleanMessage });
  if (result.wasBlocked) return result;
  
  // 3. False Delivery Claim Guard
  result = applyFalseDeliveryClaim({ ...ctx, cleanMessage: result.cleanMessage });
  if (result.wasBlocked) return result;
  
  // 4. Unresolved Placeholder Guard
  result = applyUnresolvedPlaceholderGuard({ ...ctx, cleanMessage: result.cleanMessage });
  if (result.wasBlocked) return result;
  
  // 5. Proposal Promise Guard
  result = applyProposalPromiseGuard({ ...ctx, cleanMessage: result.cleanMessage });
  if (result.wasBlocked) return result;

  // 5b. Block invented human handoff (specialist/atendente) unless escalation is real
  result = applyHumanHandoffHallucinationGuard({ ...ctx, cleanMessage: result.cleanMessage });
  if (result.wasBlocked) return result;
  
  // 6. FALSE TIME PROMISE Guard
  // Blocks: "entra em contato em até 2 horas", "retornamos em 30 min", etc.
  result = applyFalseTimePromiseGuard({ ...ctx, cleanMessage: result.cleanMessage });
  
  // If URL removal happened but no other block, return the URL removal result
  if (urlRemovalResult.wasBlocked && !result.wasBlocked) {
    return {
      ...urlRemovalResult,
      cleanMessage: result.cleanMessage, // Use the latest cleaned message
    };
  }
  
  return result;
}

// ═══════════════════════════════════════════════════════════════
// GUARDRAILS ORCHESTRATOR
// Handles: reload conversa → apply guards → log notification
// ═══════════════════════════════════════════════════════════════

export interface GuardrailsFlowContext {
  supabase: any;
  conversaId: string;
  conversa: any;
  cleanMessage: string;
  clienteNome: string | null;
  extractedData: Record<string, unknown>;
  agentName: string;
  patterns?: Map<string, PatternEntry>;

  // pass-through signal from response processing
  needsHumanEscalation?: boolean;
}

export interface GuardrailsFlowResult {
  cleanMessage: string;
  wasBlocked: boolean;
  blockType: string | null;
  notificationLogged: boolean;
}

/**
 * Orchestrates the full guardrails flow:
 * 1. Reloads conversation state for accurate proposta_id check
 * 2. Builds guard context
 * 3. Applies all guards
 * 4. Logs notification if blocked
 */
export async function orchestrateGuardrailsFlow(
  ctx: GuardrailsFlowContext
): Promise<GuardrailsFlowResult> {
  const { supabase, conversaId, conversa, cleanMessage, clienteNome, extractedData, agentName, patterns, needsHumanEscalation } = ctx;

  // Public URL config cache (module-level)
  type PublicUrlConfig = { publicAppUrl: string; cacheBust?: string };
  const DEFAULT_PUBLIC_URL = 'https://coesa-propose-craft.lovable.app';
  const PUBLIC_URL_TTL_MS = 5 * 60 * 1000;
  // deno-lint-ignore no-explicit-any
  const globalAny: any = globalThis as any;
  if (!globalAny.__coesaPublicUrlCache) {
    globalAny.__coesaPublicUrlCache = { data: null as PublicUrlConfig | null, ts: 0 };
  }

  async function getPublicUrlConfig(): Promise<PublicUrlConfig> {
    const now = Date.now();
    const cache = globalAny.__coesaPublicUrlCache as { data: PublicUrlConfig | null; ts: number };
    if (cache.data && (now - cache.ts) < PUBLIC_URL_TTL_MS) {
      return cache.data;
    }

    try {
      const { data } = await supabase
        .from('configuracoes_sistema')
        .select('chave, valor')
        .in('chave', ['public_app_url', 'public_cache_bust']);

      const publicAppUrl = data?.find((c: any) => c.chave === 'public_app_url')?.valor || DEFAULT_PUBLIC_URL;
      const cacheBust = data?.find((c: any) => c.chave === 'public_cache_bust')?.valor;
      const cfg: PublicUrlConfig = { publicAppUrl, cacheBust };
      cache.data = cfg;
      cache.ts = now;
      return cfg;
    } catch {
      return { publicAppUrl: DEFAULT_PUBLIC_URL };
    }
  }

  function buildProposalUrlFromConfig(cfg: PublicUrlConfig, propostaId: string): string {
    const baseUrl = (cfg.publicAppUrl || DEFAULT_PUBLIC_URL).replace(/\/$/, '');
    const params = new URLSearchParams();
    if (cfg.cacheBust) params.set('v', cfg.cacheBust);
    const qs = params.toString();
    return `${baseUrl}/proposta-inicial/${propostaId}${qs ? `?${qs}` : ''}`;
  }

  // Reload conversation state for accurate guard checks
  let conversaForGuards = conversa;
  try {
    const { data: freshConversa } = await supabase
      .from('chatbot_conversas')
      .select('proposta_id, dados_coletados, proposta_link_sent_at, event_proposal_sent, sofia_mode, human_agent_id')
      .eq('id', conversaId)
      .single();
    if (freshConversa) {
      conversaForGuards = { ...conversa, ...freshConversa };
      console.log('[GUARDRAILS] Reloaded conversa: proposta_id =', freshConversa.proposta_id);
    }
  } catch (e) {
    console.log('[GUARDRAILS] Failed to reload conversa:', e);
  }

  // Build guard context
  const existingDadosForGuard = (conversaForGuards?.dados_coletados as Record<string, unknown>) || {};
  const proposalUrlForGuard =
    (extractedData as any)?.proposal_url ||
    (extractedData as any)?.public_proposal_url ||
    (extractedData as any)?.proposta_url ||
    existingDadosForGuard?.proposal_url ||
    existingDadosForGuard?.public_proposal_url ||
    existingDadosForGuard?.proposta_url;
  const conversaLinkSentAt = (conversaForGuards as any)?.proposta_link_sent_at as string | null | undefined;
  const conversaEventProposalSent = (conversaForGuards as any)?.event_proposal_sent as boolean | null | undefined;

  const propostaLinkSent = !!(
    conversaLinkSentAt ||
    conversaEventProposalSent === true ||
    (extractedData as any).proposta_link_sent ||
    (extractedData as any).proposal_url ||
    existingDadosForGuard?.proposal_url
  );

  // If we still don't have a URL but we have propostaId, build it deterministically
  let finalProposalUrl: string | null = typeof proposalUrlForGuard === 'string' ? proposalUrlForGuard : null;
  if (!finalProposalUrl && (conversaForGuards?.proposta_id as string | null)) {
    try {
      const cfg = await getPublicUrlConfig();
      finalProposalUrl = buildProposalUrlFromConfig(cfg, conversaForGuards.proposta_id as string);
    } catch {
      // ignore
    }
  }

  const guardContext: GuardContext = {
    cleanMessage,
    clienteNome,
    conversaId,
    propostaId: conversaForGuards?.proposta_id as string | null,
    propostaLinkSent,
    proposalUrl: finalProposalUrl,
    extractedData,
    existingDados: existingDadosForGuard,
    agentName,
    patterns,

    needsHumanEscalation,
    conversaMode: (conversaForGuards as any)?.sofia_mode as string | null,
    humanAgentId: (conversaForGuards as any)?.human_agent_id as string | null,
  };

  // Apply all guards
  const guardResult = applyAllGuards(guardContext);

  // Log notification if blocked
  let notificationLogged = false;
  if (guardResult.wasBlocked && guardResult.notification) {
    try {
      await supabase.from('admin_notifications').insert({
        admin_user_id: null,
        title: guardResult.notification.title,
        message: guardResult.notification.message,
        type: guardResult.notification.type,
        entity_type: 'chatbot_conversa',
        entity_id: conversaId,
        created_by_nome: agentName,
      });
      notificationLogged = true;
    } catch (e) {
      console.log('[GUARDRAILS] Failed to log notification:', e);
    }
    console.log(`[GUARDRAILS] Guard triggered: ${guardResult.blockType}`);
    
    // Log to sofia_guardrail_events for recurring errors panel
    try {
      const categoryMap: Record<string, string> = {
        'document_request_blocked_platform_only': 'docs_whatsapp',
        'document_request_premature': 'docs_whatsapp',
        'unresolved_placeholder': 'link_nao_verificado',
        'proposal_url_in_llm_response': 'link_nao_verificado',
        'invalid_proposal_url_blocked': 'link_nao_verificado',
        'false_delivery_claim': 'link_nao_verificado',
        'minimum_bill_threshold_block': 'abaixo_linha_corte',
        'premature_advancement': 'triagem_indevida',
        'triage_loop_detected': 'triagem_indevida',
        'escalation_tag_removed': 'triagem_indevida',
        'human_handoff_hallucination': 'triagem_indevida',
        'template_footer_hallucination': 'link_nao_verificado',
      };
      
      const category = categoryMap[guardResult.blockType || ''] || 'outros';
      
      await supabase.from('sofia_guardrail_events').insert({
        conversa_id: conversaId,
        cliente_telefone: (conversaForGuards as any)?.cliente_telefone || null,
        cliente_nome: clienteNome,
        agent_id: agentName,
        category,
        block_type: guardResult.blockType,
        severity: guardResult.notification.type === 'error' ? 'error' : 'warning',
        original_message: cleanMessage,
        corrected_message: guardResult.cleanMessage,
        context: {
          propostaId: (conversaForGuards as any)?.proposta_id,
          proposalUrl: finalProposalUrl,
        },
        status: 'open',
      });
      console.log(`[GUARDRAILS] Logged event to sofia_guardrail_events: ${category}`);
    } catch (e) {
      console.log('[GUARDRAILS] Failed to log guardrail event:', e);
    }
  }

  return {
    cleanMessage: guardResult.cleanMessage,
    wasBlocked: guardResult.wasBlocked,
    blockType: guardResult.blockType,
    notificationLogged,
  };
}
