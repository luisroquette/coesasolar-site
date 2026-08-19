/**
 * Competitor Detection Module
 * 
 * Detects clients who already receive energy from competitor companies
 * through text analysis (client speech) and invoice analysis (GD1 detection)
 * 
 * When a competitor is detected:
 * 1. Mark the conversation as pending cancellation proof
 * 2. Block funnel progression until proof is received
 * 3. Provide cordial messaging explaining the requirement
 * 
 * @module _shared/competitor-detection
 */

import { getPatternCache, matchesPatternCategory, type PatternEntry } from './detection-patterns.ts';
import { getRenderedTemplate } from './message-templates.ts';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface CompetitorDetectionResult {
  hasCompetitor: boolean;
  competitorName: string | null;
  detectionSource: 'speech' | 'invoice' | null;
  gd1Detected: boolean;
  requiresCancellationProof: boolean;
}

export interface CompetitorFlowContext {
  messageText: string;
  invoiceAnalysis: string | null;
  existingData: Record<string, unknown>;
  patterns?: Map<string, PatternEntry>;
}

export interface CompetitorFlowResult extends CompetitorDetectionResult {
  responseMessage: string | null;
  updatedData: Record<string, unknown>;
  shouldBlockFunnel: boolean;
}

// ═══════════════════════════════════════════════════════════════
// FALLBACK PATTERNS
// ═══════════════════════════════════════════════════════════════

// Known competitor companies
const FALLBACK_COMPETITOR_NAMES = [
  'órigo', 'origo', 'órigo energia',
  'engie', 'engie brasil',
  'flora energia', 'flora',
  'sun mobi', 'sunmobi',
  'reverde', 'reverde energia',
  'nexway', 'nexway energia',
  'raízen', 'raizen',
  'copel gd', 'copel energia solar',
  'enel x', 'enelx',
  'sungrow', 'sun grow',
  'ecori', 'ecori energia',
  'solatio', 'solatio energia',
  'atlas renewable', 'atlas',
  'canadian solar',
  'omega energia', 'omega',
  'voltalia',
];

// GD1/Compensation keywords found in invoices
const FALLBACK_GD1_KEYWORDS = [
  'energia compensada gd',
  'energia compensada gdi',
  'energia compensada gd1',
  'energia compensada gdii',
  'energia compensada gd2',
  'compensação de energia',
  'compensação gd',
  'sistema de compensação',
  'unidade faz parte de sistema de compensação',
  'crédito de energia',
  'créditos de energia',
  'energia injetada',
  'geração distribuída',
  'autoconsumo remoto',
  'quota parte',
];

// Phrases indicating competitor relationship
const FALLBACK_COMPETITOR_SPEECH_PATTERNS = [
  'já recebo energia',
  'já tenho desconto',
  'já faço parte',
  'já assino com',
  'já contratei',
  'já tenho contrato',
  'outra empresa de energia',
  'outra comercializadora',
  'energia por assinatura de outra',
  'já tenho energia solar',
  'já tenho usina',
  'já participo de',
  'tenho gd',
  'faço parte de gd',
  'cooperativa de energia',
];

// ═══════════════════════════════════════════════════════════════
// PATTERN HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Get competitor names from database or fallback
 */
function getCompetitorNames(): string[] {
  const cache = getPatternCache();
  if (cache) {
    const entry = cache.patterns.get('competitor_names');
    if (entry && entry.keywords.length > 0) {
      return entry.keywords;
    }
  }
  return FALLBACK_COMPETITOR_NAMES;
}

/**
 * Get GD1 keywords from database or fallback
 */
function getGD1Keywords(): string[] {
  const cache = getPatternCache();
  if (cache) {
    const entry = cache.patterns.get('competitor_gd1_keywords');
    if (entry && entry.keywords.length > 0) {
      return entry.keywords;
    }
  }
  return FALLBACK_GD1_KEYWORDS;
}

/**
 * Get competitor speech patterns from database or fallback
 */
function getCompetitorSpeechPatterns(): string[] {
  const cache = getPatternCache();
  if (cache) {
    const entry = cache.patterns.get('competitor_speech_patterns');
    if (entry && entry.keywords.length > 0) {
      return entry.keywords;
    }
  }
  return FALLBACK_COMPETITOR_SPEECH_PATTERNS;
}

// ═══════════════════════════════════════════════════════════════
// DETECTION FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Detect competitor mention in client speech
 */
export function detectCompetitorInSpeech(message: string): { detected: boolean; competitorName: string | null } {
  const lowerMessage = message.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  
  // Check for competitor company names
  const competitorNames = getCompetitorNames();
  for (const name of competitorNames) {
    const normalizedName = name.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    
    if (lowerMessage.includes(normalizedName)) {
      console.log(`[COMPETITOR] Detected competitor in speech: "${name}"`);
      return { detected: true, competitorName: name };
    }
  }
  
  // Check for generic competitor speech patterns
  const speechPatterns = getCompetitorSpeechPatterns();
  for (const pattern of speechPatterns) {
    const normalizedPattern = pattern.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    
    if (lowerMessage.includes(normalizedPattern)) {
      console.log(`[COMPETITOR] Detected competitor pattern in speech: "${pattern}"`);
      return { detected: true, competitorName: null };
    }
  }
  
  return { detected: false, competitorName: null };
}

/**
 * Detect GD1/compensation in invoice analysis
 */
export function detectGD1InInvoice(invoiceAnalysis: string): boolean {
  if (!invoiceAnalysis) return false;
  
  const lowerAnalysis = invoiceAnalysis.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  
  const gd1Keywords = getGD1Keywords();
  
  for (const keyword of gd1Keywords) {
    const normalizedKeyword = keyword.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    
    if (lowerAnalysis.includes(normalizedKeyword)) {
      console.log(`[COMPETITOR] Detected GD1/compensation in invoice: "${keyword}"`);
      return true;
    }
  }
  
  return false;
}

/**
 * Extract competitor name from invoice analysis (if mentioned)
 */
export function extractCompetitorFromInvoice(invoiceAnalysis: string): string | null {
  if (!invoiceAnalysis) return null;
  
  const lowerAnalysis = invoiceAnalysis.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  
  const competitorNames = getCompetitorNames();
  
  for (const name of competitorNames) {
    const normalizedName = name.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    
    if (lowerAnalysis.includes(normalizedName)) {
      return name;
    }
  }
  
  return null;
}

// ═══════════════════════════════════════════════════════════════
// MAIN DETECTION ORCHESTRATOR
// ═══════════════════════════════════════════════════════════════

/**
 * Complete competitor detection from all sources
 */
export function detectCompetitor(
  messageText: string,
  invoiceAnalysis: string | null
): CompetitorDetectionResult {
  // Check speech first
  const speechResult = detectCompetitorInSpeech(messageText);
  
  if (speechResult.detected) {
    return {
      hasCompetitor: true,
      competitorName: speechResult.competitorName,
      detectionSource: 'speech',
      gd1Detected: false,
      requiresCancellationProof: true,
    };
  }
  
  // Check invoice analysis
  if (invoiceAnalysis) {
    const gd1Detected = detectGD1InInvoice(invoiceAnalysis);
    const competitorFromInvoice = extractCompetitorFromInvoice(invoiceAnalysis);
    
    if (gd1Detected || competitorFromInvoice) {
      return {
        hasCompetitor: true,
        competitorName: competitorFromInvoice,
        detectionSource: 'invoice',
        gd1Detected,
        requiresCancellationProof: true,
      };
    }
  }
  
  return {
    hasCompetitor: false,
    competitorName: null,
    detectionSource: null,
    gd1Detected: false,
    requiresCancellationProof: false,
  };
}

// ═══════════════════════════════════════════════════════════════
// MESSAGE GENERATION
// ═══════════════════════════════════════════════════════════════

/**
 * Get message asking about competitor relationship
 */
export function getCompetitorVerificationMessage(competitorName: string | null): string {
  const template = getRenderedTemplate('competitor_detection', 'verification_question', {
    competitor_name: competitorName || 'outra empresa',
  });
  
  if (template) return template;
  
  // Fallback message
  if (competitorName) {
    return `Notei que você mencionou a ${competitorName}. Você já recebe energia por assinatura de outra empresa atualmente?`;
  }
  
  return `Você já recebe energia por assinatura de outra empresa atualmente?`;
}

/**
 * Get message requesting cancellation proof
 */
export function getCancellationProofRequestMessage(competitorName: string | null): string {
  const template = getRenderedTemplate('competitor_detection', 'cancellation_proof_request', {
    competitor_name: competitorName || 'outra empresa',
  });
  
  if (template) return template;
  
  // Fallback message (based on the human agent example)
  const companyMention = competitorName ? `da ${competitorName}` : 'da outra empresa';
  
  return `Entendi! 😊

Para prosseguir com sua adesão na COESA, preciso que você primeiro solicite o cancelamento ${companyMention}.

📄 *O que preciso:* Comprovante de solicitação de cancelamento (pode ser print, e-mail ou protocolo)

⚠️ *Importante:* Isso é necessário porque não podemos ter duas empresas injetando energia na mesma unidade consumidora - isso geraria cobrança em duplicidade para você.

Assim que tiver o comprovante de cancelamento, me envia aqui que a gente continua! 💚`;
}

/**
 * Get message when competitor is detected in invoice
 */
export function getGD1DetectedMessage(): string {
  const template = getRenderedTemplate('competitor_detection', 'gd1_detected', {});
  
  if (template) return template;
  
  return `Analisando sua fatura, identifiquei que sua unidade já faz parte de um sistema de compensação de energia (Geração Distribuída).

Você já recebe energia de outra empresa atualmente? Se sim, precisaremos do comprovante de cancelamento antes de prosseguir. 😊`;
}

/**
 * Get message when client confirms having another company
 */
export function getCompetitorConfirmedMessage(competitorName: string | null): string {
  const template = getRenderedTemplate('competitor_detection', 'competitor_confirmed', {
    competitor_name: competitorName || 'outra empresa',
  });
  
  if (template) return template;
  
  return getCancellationProofRequestMessage(competitorName);
}

/**
 * Get message when cancellation proof is received
 */
export function getCancellationProofReceivedMessage(): string {
  const template = getRenderedTemplate('competitor_detection', 'cancellation_proof_received', {});
  
  if (template) return template;
  
  return `Recebi o comprovante de cancelamento! ✅

Agora podemos prosseguir com sua adesão na COESA. Vou continuar de onde paramos! 💚`;
}

// ═══════════════════════════════════════════════════════════════
// FLOW ORCHESTRATOR
// ═══════════════════════════════════════════════════════════════

/**
 * Complete competitor flow handling
 * Returns updated data and appropriate response
 */
export function orchestrateCompetitorFlow(ctx: CompetitorFlowContext): CompetitorFlowResult {
  const { messageText, invoiceAnalysis, existingData } = ctx;
  
  // Check if already in competitor flow (waiting for cancellation proof)
  const awaitingCancellationProof = (existingData as any)?.concorrenteAguardandoComprovante === true;
  const competitorConfirmed = (existingData as any)?.concorrenteConfirmado === true;
  const existingCompetitor = (existingData as any)?.concorrenteNome as string | null;
  
  // If already waiting for proof, check if this message might be the proof
  if (awaitingCancellationProof) {
    // Check if message indicates proof (simple heuristics - AI will validate)
    const proofIndicators = [
      'comprovante', 'protocolo', 'cancelamento', 'print', 'e-mail', 'email',
      'confirmação', 'solicitei', 'pedi o cancelamento', 'já cancelei',
    ];
    const lowerMessage = messageText.toLowerCase();
    const mightBeProof = proofIndicators.some(ind => lowerMessage.includes(ind));
    
    // Note: Actual proof validation should be done by AI analyzing attached documents
    // Here we just flag that the client might be trying to send proof
    
    return {
      hasCompetitor: true,
      competitorName: existingCompetitor,
      detectionSource: 'speech',
      gd1Detected: false,
      requiresCancellationProof: true,
      responseMessage: null, // Let AI handle - might be proof or follow-up question
      updatedData: existingData,
      shouldBlockFunnel: true, // Still block until AI confirms proof received
    };
  }
  
  // Detect competitor
  const detection = detectCompetitor(messageText, invoiceAnalysis);
  
  if (!detection.hasCompetitor && !competitorConfirmed) {
    // No competitor detected, proceed normally
    return {
      ...detection,
      responseMessage: null,
      updatedData: existingData,
      shouldBlockFunnel: false,
    };
  }
  
  // Competitor detected or previously confirmed
  const updatedData = { ...existingData };
  
  if (detection.hasCompetitor) {
    (updatedData as any).concorrenteDetectado = true;
    (updatedData as any).concorrenteNome = detection.competitorName || existingCompetitor;
    (updatedData as any).concorrenteFonte = detection.detectionSource;
    (updatedData as any).concorrenteGD1 = detection.gd1Detected;
  }
  
  // Determine appropriate message
  let responseMessage: string | null = null;
  
  if (detection.gd1Detected && !competitorConfirmed) {
    // GD1 detected in invoice - ask for confirmation
    responseMessage = getGD1DetectedMessage();
    (updatedData as any).concorrenteAguardandoConfirmacao = true;
  } else if (detection.hasCompetitor || competitorConfirmed) {
    // Competitor confirmed - request cancellation proof
    responseMessage = getCancellationProofRequestMessage(detection.competitorName || existingCompetitor);
    (updatedData as any).concorrenteConfirmado = true;
    (updatedData as any).concorrenteAguardandoComprovante = true;
  }
  
  console.log(`[COMPETITOR] Flow result - hasCompetitor: ${detection.hasCompetitor}, gd1: ${detection.gd1Detected}, blocking: true`);
  
  return {
    ...detection,
    responseMessage,
    updatedData,
    shouldBlockFunnel: true,
  };
}

/**
 * Check if conversation is blocked by competitor flow
 */
export function isBlockedByCompetitor(dadosColetados: Record<string, unknown> | null): boolean {
  if (!dadosColetados) return false;
  
  const awaitingProof = (dadosColetados as any)?.concorrenteAguardandoComprovante === true;
  const proofReceived = (dadosColetados as any)?.concorrenteComprovanteRecebido === true;
  
  return awaitingProof && !proofReceived;
}

/**
 * Mark cancellation proof as received
 */
export function markCancellationProofReceived(dadosColetados: Record<string, unknown>): Record<string, unknown> {
  return {
    ...dadosColetados,
    concorrenteComprovanteRecebido: true,
    concorrenteComprovanteRecebidoAt: new Date().toISOString(),
    concorrenteAguardandoComprovante: false,
  };
}

/**
 * Build system prompt block for competitor handling
 */
export function buildCompetitorPromptBlock(dadosColetados: Record<string, unknown> | null): string {
  if (!dadosColetados) return '';
  
  const competitorDetected = (dadosColetados as any)?.concorrenteDetectado === true;
  const competitorName = (dadosColetados as any)?.concorrenteNome as string | null;
  const awaitingProof = (dadosColetados as any)?.concorrenteAguardandoComprovante === true;
  const proofReceived = (dadosColetados as any)?.concorrenteComprovanteRecebido === true;
  const gd1Detected = (dadosColetados as any)?.concorrenteGD1 === true;
  
  if (!competitorDetected && !gd1Detected) return '';
  
  if (proofReceived) {
    return `
═══════════════════════════════════════════════════════════════
✅ CONCORRENTE - COMPROVANTE RECEBIDO
═══════════════════════════════════════════════════════════════
O cliente tinha vínculo com ${competitorName || 'outra empresa'} mas já enviou o comprovante de cancelamento.
✅ PODE PROSSEGUIR NORMALMENTE com o funil de vendas.
`;
  }
  
  if (awaitingProof) {
    return `
═══════════════════════════════════════════════════════════════
🚫 CONCORRENTE - AGUARDANDO COMPROVANTE DE CANCELAMENTO
═══════════════════════════════════════════════════════════════
${competitorName ? `Cliente tem vínculo com: ${competitorName}` : 'Cliente possui vínculo com outra empresa de energia'}
${gd1Detected ? '📄 GD1/Compensação detectada na fatura' : ''}

⛔ FUNIL BLOQUEADO - NÃO AVANCE ENQUANTO NÃO RECEBER:
- Comprovante de solicitação de cancelamento
- Print, e-mail ou protocolo de cancelamento

🎯 SEU OBJETIVO AGORA:
1. Ser cordial e explicar a necessidade
2. Não pressionar - cliente precisa resolver com a outra empresa primeiro
3. Quando receber o comprovante, confirmar e retomar o atendimento

💬 Se cliente perguntar POR QUE:
"Não podemos ter duas empresas injetando energia na mesma unidade - isso geraria cobrança em duplicidade para você."
`;
  }
  
  return '';
}
