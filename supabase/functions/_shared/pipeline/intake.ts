/**
 * SOFIA PIPELINE 2.0 - INTAKE LAYER (Stage 1)
 * 
 * Responsável por normalizar todas as entradas em um formato estruturado.
 * Detecta: tipo de mídia, intenção, entidades, sentimento, urgência.
 * NÃO faz processamento de negócios - apenas parse e classificação.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { 
  IntentPayload, 
  MediaType, 
  IntentCategory, 
  UrgencyLevel, 
  SentimentScore,
  ExtractedEntity 
} from "./types.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ============================================
// INTAKE ORCHESTRATOR
// ============================================

export async function executeIntake(
  conversaId: string,
  messageId: string,
  phone: string,
  content: string,
  mediaType: string,
  metadata: Record<string, unknown> = {}
): Promise<IntentPayload> {
  const startTime = Date.now();
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  console.log(`[Intake] Processing message for ${phone}, type: ${mediaType}`);
  
  // 1. Normalize media type
  const normalizedMediaType = normalizeMediaType(mediaType);
  
  // 2. Get transcribed/extracted content if needed
  let processedContent = content;
  let transcribedContent: string | undefined;
  let extractedText: string | undefined;
  
  if (normalizedMediaType === 'audio' && metadata.transcription) {
    transcribedContent = metadata.transcription as string;
    processedContent = transcribedContent;
  } else if ((normalizedMediaType === 'image' || normalizedMediaType === 'document') && metadata.extractedText) {
    extractedText = metadata.extractedText as string;
    processedContent = extractedText;
  }
  
  // 3. Check for operator command (fast path)
  const operatorCheck = checkOperatorCommand(processedContent);
  
  // 4. Extract entities using regex patterns
  const entities = await extractEntities(supabase, processedContent);
  
  // 5. Detect intent
  const { intent, confidence, subIntent } = await detectIntent(supabase, processedContent, entities, metadata);
  
  // 6. Analyze sentiment
  const sentiment = analyzeSentiment(processedContent);
  
  // 7. Determine urgency
  const urgency = determineUrgency(processedContent, intent, entities);
  
  // 8. Get turn number
  const turnNumber = await getTurnNumber(supabase, conversaId);
  
  // 9. Check if requires human review
  const requiresHumanReview = checkRequiresHumanReview(intent, confidence, sentiment, urgency);
  
  const payload: IntentPayload = {
    messageId,
    conversaId,
    phone,
    timestamp: new Date(),
    turnNumber,
    mediaType: normalizedMediaType,
    rawContent: content,
    transcribedContent,
    extractedText,
    intent,
    intentConfidence: confidence,
    subIntent,
    entities,
    sentiment,
    urgency,
    isOperatorCommand: operatorCheck.isCommand,
    commandType: operatorCheck.commandType,
    requiresHumanReview,
    intakeProcessedAt: new Date(),
    intakeDurationMs: Date.now() - startTime
  };
  
  console.log(`[Intake] Completed in ${payload.intakeDurationMs}ms - Intent: ${intent} (${(confidence * 100).toFixed(0)}%)`);
  
  return payload;
}

// ============================================
// MEDIA TYPE NORMALIZATION
// ============================================

function normalizeMediaType(rawType: string): MediaType {
  const typeMap: Record<string, MediaType> = {
    'text': 'text',
    'chat': 'text',
    'audio': 'audio',
    'ptt': 'audio',
    'voice': 'audio',
    'image': 'image',
    'photo': 'image',
    'document': 'document',
    'file': 'document',
    'pdf': 'document',
    'video': 'video',
    'sticker': 'sticker',
    'location': 'location',
    'contact': 'contact'
  };
  
  const normalized = rawType.toLowerCase().trim();
  return typeMap[normalized] || 'text';
}

// ============================================
// OPERATOR COMMAND DETECTION
// ============================================

interface OperatorCommandResult {
  isCommand: boolean;
  commandType?: string;
  args?: string[];
}

function checkOperatorCommand(content: string): OperatorCommandResult {
  const trimmed = content.trim();
  
  // Operator commands start with #
  if (!trimmed.startsWith('#')) {
    return { isCommand: false };
  }
  
  const parts = trimmed.split(/\s+/);
  const command = parts[0].substring(1).toUpperCase();
  const args = parts.slice(1);
  
  // Known operator commands
  const validCommands = [
    'PAUSAR', 'PAUSE', 'PARAR', 'STOP',
    'RETOMAR', 'RESUME', 'CONTINUAR',
    'ASSUMIR', 'TAKEOVER', 'HUMANO',
    'DEVOLVER', 'RELEASE', 'SOFIA',
    'STATUS', 'INFO',
    'ENVIAR', 'SEND',
    'CORRIGIR', 'FIX', 'EDITAR',
    'DESCARTAR', 'DISCARD', 'REJECT',
    'AGENDAR', 'SCHEDULE',
    'NOTA', 'NOTE', 'MEMO',
    'PRIORIDADE', 'PRIORITY',
    'ESCALAR', 'ESCALATE'
  ];
  
  if (validCommands.includes(command)) {
    return {
      isCommand: true,
      commandType: command,
      args
    };
  }
  
  return { isCommand: false };
}

// ============================================
// ENTITY EXTRACTION
// ============================================

async function extractEntities(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  content: string
): Promise<ExtractedEntity[]> {
  const entities: ExtractedEntity[] = [];
  const text = content.toLowerCase();
  
  // CPF Pattern (xxx.xxx.xxx-xx or xxxxxxxxxxx)
  const cpfPattern = /\b(\d{3}\.?\d{3}\.?\d{3}-?\d{2})\b/g;
  let match;
  while ((match = cpfPattern.exec(content)) !== null) {
    const raw = match[1];
    const normalized = raw.replace(/\D/g, '');
    if (normalized.length === 11 && isValidCPF(normalized)) {
      entities.push({
        type: 'cpf',
        value: raw,
        normalized,
        confidence: 0.95,
        source: 'regex'
      });
    }
  }
  
  // CNPJ Pattern (xx.xxx.xxx/xxxx-xx or xxxxxxxxxxxxxx)
  const cnpjPattern = /\b(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})\b/g;
  while ((match = cnpjPattern.exec(content)) !== null) {
    const raw = match[1];
    const normalized = raw.replace(/\D/g, '');
    if (normalized.length === 14) {
      entities.push({
        type: 'cnpj',
        value: raw,
        normalized,
        confidence: 0.95,
        source: 'regex'
      });
    }
  }
  
  // Email Pattern
  const emailPattern = /\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/gi;
  while ((match = emailPattern.exec(content)) !== null) {
    entities.push({
      type: 'email',
      value: match[1],
      normalized: match[1].toLowerCase(),
      confidence: 0.98,
      source: 'regex'
    });
  }
  
  // Phone Pattern (Brazilian)
  const phonePattern = /\b(?:\+55\s?)?(?:\(?\d{2}\)?[\s-]?)?\d{4,5}[\s-]?\d{4}\b/g;
  while ((match = phonePattern.exec(content)) !== null) {
    const normalized = match[0].replace(/\D/g, '');
    if (normalized.length >= 10 && normalized.length <= 13) {
      entities.push({
        type: 'phone',
        value: match[0],
        normalized,
        confidence: 0.85,
        source: 'regex'
      });
    }
  }
  
  // Value Pattern (R$ xxx or just numbers in context)
  const valuePattern = /R?\$?\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?|\d+(?:[.,]\d{2})?)/gi;
  while ((match = valuePattern.exec(content)) !== null) {
    const raw = match[1];
    const normalized = raw.replace(/\./g, '').replace(',', '.');
    const numValue = parseFloat(normalized);
    
    // Only capture reasonable bill values (50-5000)
    if (numValue >= 50 && numValue <= 5000) {
      entities.push({
        type: 'value',
        value: raw,
        normalized: numValue.toString(),
        confidence: 0.80,
        source: 'regex'
      });
    }
  }
  
  // Distributor Detection (from database)
  const distributorEntity = await detectDistributor(supabase, text);
  if (distributorEntity) {
    entities.push(distributorEntity);
  }
  
  // Plan Selection Detection
  const planMatch = text.match(/plano\s*(flex|basico|básico|premium|master|1|2|3)/i);
  if (planMatch) {
    entities.push({
      type: 'plan',
      value: planMatch[1],
      normalized: planMatch[1].toLowerCase(),
      confidence: 0.90,
      source: 'regex'
    });
  }
  
  // PF/PJ Classification Detection (Fase 2 - Formulário Guiado de Documentos)
  const pfMatch = /\b(pf|pessoa\s*f[ií]sica|f[ií]sica|meu\s*nome|no\s*meu\s*nome|nome\s*pr[oó]prio|aut[oô]nomo)\b/i;
  const pjMatch = /\b(pj|pessoa\s*jur[ií]dica|jur[ií]dica|empresa|cnpj|minha\s*empresa|no\s*nome\s*da\s*empresa)\b/i;
  
  if (pfMatch.test(text)) {
    entities.push({
      type: 'tipoCliente',
      value: 'PF',
      normalized: 'PF',
      confidence: 0.95,
      source: 'regex'
    });
  } else if (pjMatch.test(text)) {
    entities.push({
      type: 'tipoCliente',
      value: 'PJ',
      normalized: 'PJ',
      confidence: 0.95,
      source: 'regex'
    });
  }
  
  return entities;
}

async function detectDistributor(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  text: string
): Promise<ExtractedEntity | null> {
  try {
    // Use the existing find_distribuidora function
    const { data, error } = await supabase.rpc('find_distribuidora', {
      p_input: text
    });
    
    if (!error && data && data.length > 0) {
      const dist = data[0];
      return {
        type: 'distributor',
        value: dist.nome,
        normalized: dist.nome_normalizado,
        confidence: dist.matched_via === 'exact' ? 0.98 : dist.matched_via === 'typo' ? 0.85 : 0.70,
        source: 'pattern'
      };
    }
  } catch (e) {
    console.error('[Intake] Error detecting distributor:', e);
  }
  
  return null;
}

function isValidCPF(cpf: string): boolean {
  if (cpf.length !== 11) return false;
  if (/^(\d)\1+$/.test(cpf)) return false;
  
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cpf.charAt(i)) * (10 - i);
  }
  let digit = (sum * 10) % 11;
  if (digit === 10) digit = 0;
  if (digit !== parseInt(cpf.charAt(9))) return false;
  
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cpf.charAt(i)) * (11 - i);
  }
  digit = (sum * 10) % 11;
  if (digit === 10) digit = 0;
  if (digit !== parseInt(cpf.charAt(10))) return false;
  
  return true;
}

// ============================================
// INTENT DETECTION
// ============================================

interface IntentResult {
  intent: IntentCategory;
  confidence: number;
  subIntent?: string;
}

async function detectIntent(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  content: string,
  entities: ExtractedEntity[],
  metadata: Record<string, unknown>
): Promise<IntentResult> {
  const text = content.toLowerCase().trim();
  
  // Empty or very short messages
  if (text.length < 2) {
    return { intent: 'noise', confidence: 0.95 };
  }
  
  // Greeting patterns
  if (/^(oi|olá|ola|bom dia|boa tarde|boa noite|hey|hi|hello|e aí|eai|opa|fala)\b/i.test(text)) {
    return { intent: 'greeting', confidence: 0.95 };
  }
  
  // Farewell patterns
  if (/^(tchau|adeus|até|ate logo|até mais|falou|vlw|valeu|obrigad[oa]|brigad[oa])\b/i.test(text)) {
    return { intent: 'farewell', confidence: 0.90 };
  }
  
  // Confirmation patterns
  if (/^(sim|s|ss|sss|isso|exato|correto|pode ser|ok|okay|certo|confirmo|confirmado|positivo|afirmativo)\s*[!.]?$/i.test(text)) {
    return { intent: 'confirmation', confidence: 0.95 };
  }
  
  // Denial patterns
  if (/^(não|nao|n|nn|nope|nunca|negativo|errado|incorreto|nada disso)\s*[!.]?$/i.test(text)) {
    return { intent: 'denial', confidence: 0.95 };
  }
  
  // Escalation request
  if (/\b(falar com|quero falar|atendente|humano|pessoa|gerente|supervisor|reclamação|reclamacao|ouvidoria)\b/i.test(text)) {
    return { intent: 'escalation_request', confidence: 0.90 };
  }
  
  // Discount inquiry
  if (/\b(desconto|economia|economizar|quanto|valor|preço|preco|barato|caro|pagar menos|mais barato)\b/i.test(text)) {
    return { intent: 'discount_inquiry', confidence: 0.85 };
  }
  
  // Economy simulation request
  if (/\b(simul|calcula|quanto.*(economiz|gast|pag)|minha conta.*de luz)\b/i.test(text)) {
    return { intent: 'economy_simulation', confidence: 0.85 };
  }
  
  // Document submission (has document entity or mentions document)
  if (metadata.hasDocument || /\b(fatura|conta de luz|documento|cpf|cnpj|identidade|rg|comprovante)\b/i.test(text)) {
    return { intent: 'document_submission', confidence: 0.80 };
  }
  
  // Objection patterns
  if (/\b(golpe|fraude|enrolação|mentira|não acredito|desconfio|suspeito|propaganda|spam)\b/i.test(text)) {
    return { intent: 'objection', confidence: 0.85, subIntent: 'trust' };
  }
  if (/\b(depois|agora não|sem tempo|ocupad|liga depois|outro dia|sem interesse)\b/i.test(text)) {
    return { intent: 'objection', confidence: 0.80, subIntent: 'timing' };
  }
  if (/\b(muito caro|não vale|não compensa|prefiro|já tenho|tenho contrato)\b/i.test(text)) {
    return { intent: 'objection', confidence: 0.80, subIntent: 'value' };
  }
  
  // Billing question
  if (/\b(boleto|pagamento|pagar|vencimento|segunda via|pix|débito|crédito)\b/i.test(text)) {
    return { intent: 'billing_question', confidence: 0.85 };
  }
  
  // Contract status
  if (/\b(meu contrato|minha adesão|quando começa|ativação|status|situação|andamento)\b/i.test(text)) {
    return { intent: 'contract_status', confidence: 0.85 };
  }
  
  // Data correction
  if (/\b(errad[oa]|corrigir|atualizar|mudar|alterar|trocar|não é esse|nome errado|email errado)\b/i.test(text)) {
    return { intent: 'data_correction', confidence: 0.85 };
  }
  
  // Plan selection
  if (/\b(escolh|quer|prefer|opto|plano|opção|opcao)\b/i.test(text) && entities.some(e => e.type === 'plan')) {
    return { intent: 'plan_selection', confidence: 0.90 };
  }
  
  // Support request
  if (/\b(ajuda|problema|erro|bug|não funciona|não consigo|dúvida|duvida|como faço|como faz)\b/i.test(text)) {
    return { intent: 'support_request', confidence: 0.80 };
  }
  
  // Clarification (asking questions)
  if (/^(o que|como|quando|onde|qual|quem|porque|por que|pq)\b/i.test(text) || text.endsWith('?')) {
    return { intent: 'clarification', confidence: 0.75 };
  }
  
  // Generic question (has question words but not specific)
  if (/\?$/.test(text)) {
    return { intent: 'generic_question', confidence: 0.70 };
  }
  
  // If has value entities, likely related to economy
  if (entities.some(e => e.type === 'value')) {
    return { intent: 'economy_simulation', confidence: 0.70 };
  }
  
  // If has distributor entity, likely providing data
  if (entities.some(e => e.type === 'distributor')) {
    return { intent: 'economy_simulation', confidence: 0.65 };
  }
  
  // Default to unknown
  return { intent: 'unknown', confidence: 0.50 };
}

// ============================================
// SENTIMENT ANALYSIS
// ============================================

function analyzeSentiment(content: string): SentimentScore {
  const text = content.toLowerCase();
  
  // Very positive indicators
  const veryPositive = /\b(ótimo|otimo|excelente|maravilhoso|perfeito|incrível|incrivel|amei|adorei|fantástico|fantastico|😍|🥰|❤️|💚|🎉)\b/i;
  if (veryPositive.test(text)) return 1;
  
  // Positive indicators
  const positive = /\b(bom|legal|ok|beleza|bacana|interessante|gostei|curti|show|top|massa|dahora|👍|😊|🙂)\b/i;
  if (positive.test(text)) return 0.5;
  
  // Very negative indicators
  const veryNegative = /\b(péssimo|pessimo|horrível|horrivel|lixo|vergonha|absurdo|raiva|ódio|odio|nojo|😡|🤬|💢|👎)\b/i;
  if (veryNegative.test(text)) return -1;
  
  // Negative indicators
  const negative = /\b(ruim|chato|irritado|bravo|triste|decepcionado|insatisfeito|frustrado|😤|😠|🙄|😒)\b/i;
  if (negative.test(text)) return -0.5;
  
  // Neutral
  return 0;
}

// ============================================
// URGENCY DETERMINATION
// ============================================

function determineUrgency(
  content: string,
  intent: IntentCategory,
  entities: ExtractedEntity[]
): UrgencyLevel {
  const text = content.toLowerCase();
  
  // Critical urgency indicators
  if (/\b(urgente|emergência|emergencia|agora|imediato|já|ja|rápido|rapido|socorro)\b/i.test(text)) {
    return 'critical';
  }
  
  // High urgency intents
  if (intent === 'escalation_request' || intent === 'objection') {
    return 'high';
  }
  
  // Negative sentiment increases urgency
  const sentiment = analyzeSentiment(content);
  if (sentiment <= -0.5) {
    return 'high';
  }
  
  // Multiple consecutive messages (turn > 10) might indicate frustration
  // This will be checked via context in Stage 2
  
  // Medium urgency for business-critical intents
  if (['discount_inquiry', 'economy_simulation', 'billing_question', 'contract_status'].includes(intent)) {
    return 'medium';
  }
  
  // Low urgency for informational intents
  return 'low';
}

// ============================================
// TURN NUMBER
// ============================================

async function getTurnNumber(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  conversaId: string
): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('chatbot_mensagens')
      .select('id', { count: 'exact', head: true })
      .eq('conversa_id', conversaId)
      .eq('role', 'user');
    
    if (error) {
      console.error('[Intake] Error getting turn number:', error);
      return 1;
    }
    
    return (count || 0) + 1;
  } catch (e) {
    console.error('[Intake] Error getting turn number:', e);
    return 1;
  }
}

// ============================================
// HUMAN REVIEW CHECK
// ============================================

function checkRequiresHumanReview(
  intent: IntentCategory,
  confidence: number,
  sentiment: SentimentScore,
  urgency: UrgencyLevel
): boolean {
  // Low confidence always requires review
  if (confidence < 0.60) {
    return true;
  }
  
  // Escalation requests always require review
  if (intent === 'escalation_request') {
    return true;
  }
  
  // Critical urgency requires review
  if (urgency === 'critical') {
    return true;
  }
  
  // Very negative sentiment with low confidence
  if (sentiment <= -0.5 && confidence < 0.75) {
    return true;
  }
  
  // Objections with trust issues
  if (intent === 'objection') {
    return true;
  }
  
  return false;
}

// ============================================
// EXPORTS
// ============================================

export type { IntentPayload, MediaType, IntentCategory, UrgencyLevel, SentimentScore, ExtractedEntity };
