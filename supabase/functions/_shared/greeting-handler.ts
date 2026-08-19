/**
 * Greeting Handler Module
 * Handles initial greeting/welcome messages for new conversations
 * Phase 75: Improved first contact experience
 * Phase 76: Cláusula Pétrea - Always ask if client knows about subscription energy
 */

import { getRenderedTemplate, getTemplateCache, type MessageTemplate } from './message-templates.ts';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface GreetingContext {
  conversaId: string;
  phone: string;
  clienteNome: string | null;
  totalMessages: number;
  isNewConversation: boolean;
  agentName: string;
  userMessage?: string; // The user's incoming message for context analysis
}

export interface GreetingResult {
  shouldSendGreeting: boolean;
  greetingMessage: string | null;
  greetingType: 'first_contact' | 'first_contact_anonymous' | 'returning_client' | 'info_request' | null;
  shouldContinueToAI: boolean; // Whether to continue processing after greeting
}

// ═══════════════════════════════════════════════════════════════
// INFO REQUEST DETECTION
// ═══════════════════════════════════════════════════════════════

/**
 * Patterns that indicate the lead is asking for more information
 */
const INFO_REQUEST_PATTERNS = [
  /\b(quer(?:o|ia)?|quero)\s+(?:saber|mais|informaç)/i,
  /\b(mais\s+informaç|explicar?|como\s+funciona)/i,
  /\b(me\s+(?:explica|conta|fala))/i,
  /\b(tenho\s+interesse)/i,
  /\b(o\s+que\s+(?:é|são)|como\s+(?:é|funciona))/i,
  /\b(saber\s+mais|entender\s+melhor)/i,
  /\b(informa[çc][ãõo]es)/i,
  /\b(pode(?:ria)?\s+(?:me\s+)?(?:explicar|falar|informar))/i,
  /\b(gostaria\s+de\s+(?:saber|entender))/i,
];

/**
 * Check if the user's message is requesting more information
 */
export function detectInfoRequest(message: string): boolean {
  if (!message) return false;
  const normalizedMessage = message.toLowerCase().trim();
  return INFO_REQUEST_PATTERNS.some(pattern => pattern.test(normalizedMessage));
}

// ═══════════════════════════════════════════════════════════════
// GREETING DETECTION
// ═══════════════════════════════════════════════════════════════

/**
 * Check if this is a first message in a new conversation
 * Returns true if the conversation just started and needs a greeting
 */
export function isFirstMessage(totalMessages: number, isNewConversation: boolean): boolean {
  // First message = new conversation OR total messages is 0 or 1
  return isNewConversation || totalMessages <= 1;
}

/**
 * Generate appropriate greeting based on context
 * Phase 76: Now includes CLÁUSULA PÉTREA - asks if client knows about subscription energy
 */
export function generateGreeting(
  ctx: GreetingContext,
  templates?: Map<string, MessageTemplate>
): GreetingResult {
  const { clienteNome, totalMessages, isNewConversation, userMessage } = ctx;
  const templatesCache = templates || getTemplateCache() || undefined;
  
  // Only send greeting on first contact
  if (!isFirstMessage(totalMessages, isNewConversation)) {
    return {
      shouldSendGreeting: false,
      greetingMessage: null,
      greetingType: null,
      shouldContinueToAI: true,
    };
  }
  
  // Check if user is explicitly requesting more information
  const isInfoRequest = userMessage ? detectInfoRequest(userMessage) : false;
  
  // Determine greeting type
  let greetingType: 'first_contact' | 'first_contact_anonymous' | 'returning_client' | 'info_request';
  let greetingMessage: string;
  
  if (isInfoRequest) {
    // User asked for info - provide warm greeting + explanation + CLÁUSULA PÉTREA
    greetingType = 'info_request';
    greetingMessage = getRenderedTemplate(
      'greeting',
      'info_request',
      { cliente_nome: clienteNome || '' },
      templatesCache,
      getFallbackInfoRequestGreeting(clienteNome)
    );
  } else if (clienteNome && clienteNome.trim().length > 0) {
    // We have the client's name - warm greeting + CLÁUSULA PÉTREA
    greetingType = 'first_contact';
    greetingMessage = getRenderedTemplate(
      'greeting',
      'first_contact',
      { cliente_nome: clienteNome },
      templatesCache,
      getFallbackGreeting(clienteNome)
    );
  } else {
    // Anonymous client - warm greeting + CLÁUSULA PÉTREA
    greetingType = 'first_contact_anonymous';
    greetingMessage = getRenderedTemplate(
      'greeting',
      'first_contact_anonymous',
      {},
      templatesCache,
      getFallbackGreetingAnonymous()
    );
  }
  
  // Replace {{}} placeholders with {} for template rendering compatibility
  greetingMessage = greetingMessage.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (key === 'cliente_nome' && clienteNome) return clienteNome;
    return `{${key}}`;
  });
  
  console.log(`[GREETING] Generating ${greetingType} greeting for ${clienteNome || 'anonymous'}`);
  
  return {
    shouldSendGreeting: true,
    greetingMessage,
    greetingType,
    shouldContinueToAI: false, // Wait for user response after greeting
  };
}

// ═══════════════════════════════════════════════════════════════
// FALLBACK GREETINGS (if templates not loaded)
// Phase 76: All greetings now include CLÁUSULA PÉTREA
// ═══════════════════════════════════════════════════════════════

/**
 * Greeting for when user explicitly asks for more information
 * FASE 2: Asks for name FIRST, then proceeds with flow
 */
function getFallbackInfoRequestGreeting(clienteNome: string | null): string {
  if (clienteNome) {
    // Has name from WhatsApp - confirm it
    return `Olá, ${clienteNome}! 👋 Que bom receber você aqui!

Sou a *sofIA*, assistente virtual da *COESA Energia Inteligente*. 💚

Fico muito feliz com seu interesse! Trabalhamos com *energia por assinatura* - você economiza *até 30% na conta de luz* sem precisar instalar nada!

Posso confirmar: você é ${clienteNome} mesmo? Se não, me conta seu nome! 😊`;
  }
  
  // No name - ask for it first
  return `Olá! 👋 Que bom receber você aqui!

Sou a *sofIA*, assistente virtual da *COESA Energia Inteligente*. 💚

Fico muito feliz com seu interesse! Trabalhamos com *energia por assinatura* - você economiza *até 30% na conta de luz* sem precisar instalar nada!

Antes de te mostrar sua economia, *qual o seu nome?* 😊`;
}

/**
 * Greeting when we have the client's name (from WhatsApp)
 * FASE 2: Confirm name, then ask for bill value directly
 */
function getFallbackGreeting(clienteNome: string): string {
  return `Olá, ${clienteNome}! 👋 Que alegria falar com você!

Sou a *sofIA*, assistente virtual da *COESA Energia Inteligente*. 💚

Aqui você pode economizar *até 30% na conta de luz* com nossa *energia por assinatura* - sem precisar instalar nada!

Posso confirmar: você é *${clienteNome}* mesmo? Se sim, me conta! Se não, qual o seu nome correto? 😊`;
}

/**
 * Greeting for anonymous clients
 * FASE 2: Ask for name FIRST - this is mandatory before proceeding
 */
function getFallbackGreetingAnonymous(): string {
  return `Olá! 👋 Que bom receber você aqui!

Sou a *sofIA*, assistente virtual da *COESA Energia Inteligente*. 💚

Aqui você pode economizar *até 30% na conta de luz* com nossa *energia por assinatura* - sem precisar instalar nada!

Antes de te mostrar sua economia, *qual o seu nome?* 😊`;
}

// ═══════════════════════════════════════════════════════════════
// ANTI-SPAM / CONTEXT RESET PROTECTION
// ═══════════════════════════════════════════════════════════════

export interface SpamDetectionContext {
  conversaId: string;
  recentAssistantMessages: Array<{ content: string; created_at: string }>;
  messageSpamThreshold?: number; // Default: 5 messages
  timeWindowSeconds?: number;    // Default: 30 seconds
}

export interface SpamDetectionResult {
  isSpamDetected: boolean;
  spamCount: number;
  shouldBlockLLM: boolean;
  contextProtectionNote: string | null;
}

/**
 * Detect if recent messages show spam pattern
 * Returns protection notes to prevent context reset
 */
export function detectSpamPattern(ctx: SpamDetectionContext): SpamDetectionResult {
  const {
    recentAssistantMessages,
    messageSpamThreshold = 5,
    timeWindowSeconds = 30,
  } = ctx;
  
  if (!recentAssistantMessages || recentAssistantMessages.length < 2) {
    return {
      isSpamDetected: false,
      spamCount: 0,
      shouldBlockLLM: false,
      contextProtectionNote: null,
    };
  }
  
  const now = new Date();
  const windowStart = new Date(now.getTime() - (timeWindowSeconds * 1000));
  
  // Count messages in the time window
  const recentMessages = recentAssistantMessages.filter(m => {
    const msgTime = new Date(m.created_at);
    return msgTime >= windowStart;
  });
  
  const spamCount = recentMessages.length;
  const isSpamDetected = spamCount >= messageSpamThreshold;
  
  if (isSpamDetected) {
    console.log(`[SPAM_DETECTED] ⚠️ ${spamCount} messages in ${timeWindowSeconds}s window`);
    
    // Check if there are duplicate messages (proposal link spam)
    const uniqueContents = new Set(recentMessages.map(m => m.content.substring(0, 100)));
    const hasDuplicates = uniqueContents.size < recentMessages.length;
    
    return {
      isSpamDetected: true,
      spamCount,
      shouldBlockLLM: hasDuplicates, // Block if duplicate messages detected
      contextProtectionNote: `🚨 ALERTA DE SPAM DETECTADO:
${spamCount} mensagens enviadas nos últimos ${timeWindowSeconds} segundos.
⚠️ AÇÃO OBRIGATÓRIA: NÃO reinicie a conversa!
⚠️ NÃO cumprimente o cliente novamente.
⚠️ Continue de onde a conversa parou.
⚠️ Se houve erro técnico, peça desculpas brevemente e siga em frente.`,
    };
  }
  
  return {
    isSpamDetected: false,
    spamCount,
    shouldBlockLLM: false,
    contextProtectionNote: null,
  };
}

/**
 * Build context protection prompt section
 * Prevents LLM from resetting conversation after spam events
 */
export function buildContextProtectionPrompt(
  spamResult: SpamDetectionResult,
  lastAssistantMessage?: string | null
): string {
  if (!spamResult.isSpamDetected) {
    return '';
  }
  
  let protectionPrompt = `
═══════════════════════════════════════════════════════════════
🛡️ PROTEÇÃO DE CONTEXTO (CRÍTICO)
═══════════════════════════════════════════════════════════════
${spamResult.contextProtectionNote}
`;

  if (lastAssistantMessage) {
    const truncatedLast = lastAssistantMessage.length > 200 
      ? lastAssistantMessage.substring(0, 200) + '...'
      : lastAssistantMessage;
    
    protectionPrompt += `
📝 SUA ÚLTIMA MENSAGEM FOI:
"${truncatedLast}"

Continue a partir deste ponto. NÃO repita saudações ou apresentações.
`;
  }
  
  return protectionPrompt;
}
