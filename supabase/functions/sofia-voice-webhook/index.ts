import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { loadAgentPromptModules, buildModularPrompt } from '../_shared/prompt-modules.ts';
import {
  getCorsHeaders,
  handleCorsPrelight,
  errorResponse,
  jsonResponse,
} from '../_shared/security-helpers.ts';
import { validateVoiceOutbound, parseAndValidate } from '../_shared/zod-schemas.ts';

// CORS: Public webhook endpoint (Retell external calls)
const corsHeaders = getCorsHeaders(null as unknown as Request, { mode: 'permissive' });

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

// Default fallback models for voice (latency is critical)
const DEFAULT_VOICE_MODELS = ['google/gemini-2.5-flash-lite', 'google/gemini-2.5-flash'];

// Helper to get models list, using agent's configured model as primary if available
function getModelsForAgent(agentConfig: FullAgentConfig): string[] {
  const configuredModel = agentConfig?.persona?.llm_model;
  if (configuredModel) {
    // Use configured model first, then fallback to fast defaults
    return [configuredModel, ...DEFAULT_VOICE_MODELS.filter(m => m !== configuredModel)];
  }
  return DEFAULT_VOICE_MODELS;
}

// ═══════════════════════════════════════════════════════════════
// PHASE 1: CONVERSATION STATE MACHINE
// Tracks where we are in the sales flow
// ═══════════════════════════════════════════════════════════════

type ConversationStage = 
  | 'GREETING'           // Cliente acabou de atender
  | 'PITCH'              // Explicando o serviço
  | 'COLLECTING_NAME'    // Coletando nome
  | 'COLLECTING_BILL'    // Coletando valor da conta
  | 'COLLECTING_UTILITY' // Coletando distribuidora
  | 'CONFIRMING'         // Confirmando dados
  | 'CLOSING'            // Tentando fechar
  | 'OBJECTION'          // Lidando com objeção
  | 'HANDOFF';           // Passando para humano

interface CollectedData {
  name?: string;
  bill_amount?: number;
  utility?: string;
  city?: string;
  phone?: string;
}

interface ConversationContext {
  stage: ConversationStage;
  collected: CollectedData;
  objections_count: number;
  messages_in_stage: number;
  total_messages: number;
  last_agent_question?: string;
}

// ═══════════════════════════════════════════════════════════════
// PHASE 4: BUSINESS INTENT DETECTION
// Specific intents that trigger instant responses
// ═══════════════════════════════════════════════════════════════

type BusinessIntent = 
  | 'want_proposal'     // "me manda a proposta"
  | 'ask_price'         // "quanto custa"
  | 'ask_how_works'     // "como funciona"
  | 'objection_trust'   // "não confio", "é golpe?"
  | 'objection_price'   // "tá caro"
  | 'objection_time'    // "não tenho tempo"
  | 'ready_to_close'    // "quero aderir", "pode fazer"
  | 'want_human'        // "quero falar com alguém"
  | 'already_customer'  // "já sou cliente"
  | 'not_interested'    // "não tenho interesse"
  | 'providing_info';   // Cliente dando informação solicitada

type InputType = 'saudacao' | 'confirmacao' | 'pergunta_energia' | 'ruido' | 'desconhecido' | 'business_intent';

interface InputClassification {
  type: InputType;
  confidence: 'high' | 'medium' | 'low';
  matched_pattern?: string;
  business_intent?: BusinessIntent;
}

// ═══════════════════════════════════════════════════════════════
// PHASE 5: INSTANT RESPONSES (Zero-latency for common intents)
// ═══════════════════════════════════════════════════════════════

const INSTANT_RESPONSES: Record<BusinessIntent, string | ((ctx: ConversationContext) => string)> = {
  'want_proposal': (ctx) => ctx.collected.name 
    ? `Ótimo ${ctx.collected.name}! Pra gerar sua proposta, só preciso saber: quanto você paga de luz por mês?`
    : `Ótimo! Pra gerar sua proposta personalizada, qual o seu nome completo?`,
  
  'ask_price': `Não tem custo de adesão! Você só paga a conta de luz com desconto de até trinta por cento. Quer saber quanto você economizaria?`,
  
  'ask_how_works': `É simples: a gente gera energia solar em usinas e injeta na rede. Você recebe o desconto direto na sua conta, sem obras na sua casa. Quer ver quanto pode economizar?`,
  
  'objection_trust': `Entendo sua preocupação! A COESA é regulamentada pela ANEEL e tem milhares de clientes satisfeitos no Brasil todo. Posso enviar nosso site e contrato pra você analisar?`,
  
  'objection_price': `Na verdade você não paga nada pra aderir! A gente reduz sua conta de luz e você fica com a economia. É desconto garantido todo mês.`,
  
  'objection_time': `Leva menos de dois minutos! Só preciso do seu nome, quanto paga de luz e a distribuidora. Daí te mando a proposta por WhatsApp pra você ver com calma.`,
  
  'ready_to_close': (ctx) => ctx.collected.name
    ? `Perfeito ${ctx.collected.name}! Vou gerar sua proposta agora. Quanto você paga de luz por mês, mais ou menos?`
    : `Perfeito! Pra finalizar, qual o seu nome completo?`,
  
  'want_human': `Claro! Vou te transferir pra um consultor humano. Um momento.`,
  
  'already_customer': `Ah que ótimo! Pra te ajudar melhor, vou te transferir pro nosso suporte de clientes, tá bom?`,
  
  'not_interested': `Tudo bem, sem problemas! Se mudar de ideia, a COESA tá aqui. Tenha um ótimo dia!`,
  
  'providing_info': '', // Handled dynamically
};

// ═══════════════════════════════════════════════════════════════
// LISTS FOR CLASSIFICATION
// ═══════════════════════════════════════════════════════════════

const SAUDACOES = [
  'oi', 'ola', 'olá', 'alo', 'alô', 'oie', 'oi oi', 'oia', 'alo alo',
  'bom dia', 'boa tarde', 'boa noite',
  // Perguntas de verificação de áudio (muito comuns)
  'ta me ouvindo', 'tá me ouvindo', 'me ouve', 'consegue me ouvir', 'esta me ouvindo',
  'voce esta me ouvindo', 'você está me ouvindo', 'voce ta me ouvindo', 'você tá me ouvindo',
  'voce me ouve', 'você me ouve', 'me escuta', 'ta me escutando', 'tá me escutando',
  'esta me escutando', 'está me escutando', 'pode me ouvir', 'consegue ouvir',
  'to ouvindo', 'tô ouvindo', 'estou ouvindo', 'sim to ouvindo',
  'quem fala', 'quem é', 'quem e', 'quem ta falando', 'quem tá falando',
  'e a coesa', 'é a coesa', 'e da coesa', 'é da coesa', 'coesa energia',
  'pronto', 'pois não', 'pois nao', 'pode falar', 'fala ai', 'manda',
  'e ai', 'e aí', 'eae', 'fala', 'diga', 'fale', 'opa',
  'oi quem fala', 'alo quem fala', 'oi quem e', 'sim alo',
  'oi boa tarde', 'oi bom dia', 'oi boa noite',
  'hello', 'oi oi oi',
  'estou', 'só', 'so', 'a', 'ah', 'hm', 'ham', 'um',
  // Interações sociais curtas
  'tudo bem', 'tudo bom', 'como vai', 'como esta', 'como está', 'e você', 'e voce',
  'tudo otimo', 'tudo ótimo', 'tudo certo', 'tudo joia', 'tudo jóia', 'tranquilo',
];

const CONFIRMACOES = [
  'sim', 'isso', 'isso mesmo', 'pode ser', 'ta', 'tá', 'ok', 'beleza',
  'certo', 'uhum', 'ham', 'aham', 'ahan', 'entendi', 'sei', 'legal',
  'com certeza', 'claro', 'pode', 'isso ai', 'isso aí', 'exato',
  'ah sim', 'a sim', 'humm', 'hum', 'ta certo', 'tá certo', 'pode sim',
];

const RUIDO_PATTERNS = [
  /^[\s\.\,\?\!]*$/,
  /^[^\w]+$/,
  /^(.)\1{3,}$/,
];

// Known utilities in Brazil
const UTILITIES = [
  'cemig', 'enel', 'copel', 'light', 'cpfl', 'energisa', 'coelba', 'celpe',
  'cosern', 'elektro', 'celesc', 'ceee', 'rge', 'celg', 'ceb', 'ceal',
  'amazonas energia', 'equatorial', 'neoenergia', 'edp', 'eletropaulo',
];

// ═══════════════════════════════════════════════════════════════
// WELCOME MESSAGES
// ═══════════════════════════════════════════════════════════════

const WELCOME_MESSAGES = [
  "Olá! Aqui é a Sofia da COESA Energia. Tô te ouvindo! Quer saber como economizar até trinta por cento na conta de luz?",
  "Oi! Aqui é a Sofia, consultora da COESA. Estou te ouvindo sim! Posso te explicar como funciona a energia por assinatura?",
  "Olá! Sou a Sofia da COESA Energia. Estou te ouvindo! Posso te contar como você pode pagar menos na conta de luz?",
];

function getRandomWelcome(): string {
  return WELCOME_MESSAGES[Math.floor(Math.random() * WELCOME_MESSAGES.length)];
}

// ═══════════════════════════════════════════════════════════════
// PHASE 2: COLLECTION MEMORY - Extract data from user speech
// ═══════════════════════════════════════════════════════════════

// Words that should NOT be treated as names (common phrases, greetings)
const NAME_BLACKLIST = new Set([
  'tudo', 'ola', 'oi', 'alo', 'bom', 'boa', 'dia', 'tarde', 'noite', 'sim', 'nao', 'não',
  'bem', 'certo', 'legal', 'otimo', 'ótimo', 'tranquilo', 'beleza', 'claro', 'pode', 'como',
  'quem', 'qual', 'quanto', 'onde', 'quando', 'porque', 'voce', 'você', 'esse', 'essa',
  'isso', 'aqui', 'ali', 'agora', 'depois', 'antes', 'obrigado', 'obrigada', 'por', 'favor',
  'sofia', 'coesa', 'energia', 'solar', 'luz', 'conta', 'proposta', 'desconto', 'economia',
]);

function extractCollectedData(text: string, currentData: CollectedData): CollectedData {
  const updated = { ...currentData };
  const normalized = text.toLowerCase().trim();
  
  // 1. Extract NAME (if not already collected)
  if (!updated.name) {
    const namePatterns = [
      /(?:me chamo|meu nome [eé]|sou o?a?|aqui [eé] o?a?)\s+([A-ZÀ-Üa-zà-ü]+(?:\s+[A-ZÀ-Üa-zà-ü]+)?)/i,
      /^([A-ZÀ-Ü][a-zà-ü]+(?:\s+[A-ZÀ-Ü][a-zà-ü]+)?)$/i, // Just a name alone
      /(?:pode me chamar de|meu nome|eu sou)\s+([A-ZÀ-Üa-zà-ü]+)/i,
    ];
    for (const pattern of namePatterns) {
      const match = text.match(pattern);
      if (match && match[1] && match[1].length > 2) {
        const candidate = match[1].trim();
        // Check if it's NOT a blacklisted word
        const firstWord = candidate.split(/\s+/)[0].toLowerCase();
        if (!NAME_BLACKLIST.has(firstWord)) {
          updated.name = candidate;
          console.log(`[EXTRACT] Name detected: ${updated.name}`);
          break;
        }
      }
    }
    
    // Simple heuristic: if it's 1-3 words starting with capital, might be a name
    // BUT only if NOT in blacklist and text is short (< 5 words total)
    if (!updated.name) {
      const words = text.trim().split(/\s+/);
      if (words.length >= 1 && words.length <= 3) {
        const possibleName = words
          .filter(w => /^[A-ZÀ-Ü][a-zà-ü]+$/.test(w))
          .filter(w => !NAME_BLACKLIST.has(w.toLowerCase()))
          .join(' ');
        if (possibleName.length >= 3) {
          updated.name = possibleName;
          console.log(`[EXTRACT] Name heuristic: ${updated.name}`);
        }
      }
    }
  }
  
  // 2. Extract BILL AMOUNT
  if (!updated.bill_amount) {
    const billPatterns = [
      /(?:pago|conta|gasto|média|media|mais ou menos|aproximadamente|cerca de|em torno de|uns?)\s*(?:de\s*)?r?\$?\s*(\d+)/i,
      /r?\$?\s*(\d+)\s*(?:reais|por m[eê]s|mensais?)/i,
      /(\d{2,4})\s*(?:reais|por m[eê]s)/i,
      /(?:uns?|tipo|mais ou menos)\s*(\d+)/i,
      /^(\d{2,4})(?:\s*reais)?$/i, // Just a number
    ];
    for (const pattern of billPatterns) {
      const match = normalized.match(pattern);
      if (match && match[1]) {
        const amount = parseInt(match[1], 10);
        if (amount >= 50 && amount <= 50000) { // Reasonable bill range
          updated.bill_amount = amount;
          console.log(`[EXTRACT] Bill amount detected: R$ ${updated.bill_amount}`);
          break;
        }
      }
    }
  }
  
  // 3. Extract UTILITY (distribuidora)
  if (!updated.utility) {
    for (const utility of UTILITIES) {
      if (normalized.includes(utility)) {
        updated.utility = utility.toUpperCase();
        console.log(`[EXTRACT] Utility detected: ${updated.utility}`);
        break;
      }
    }
  }
  
  return updated;
}

// ═══════════════════════════════════════════════════════════════
// BUSINESS INTENT DETECTION
// ═══════════════════════════════════════════════════════════════

function detectBusinessIntent(text: string): BusinessIntent | null {
  const normalized = text.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim();
  
  // Want proposal
  if (/(mand|envi|quero|gerar?).*(proposta|link|whatsapp|orcamento|orçamento)/i.test(normalized)) {
    return 'want_proposal';
  }
  
  // Ask price
  if (/(quant|qual).*(cust|valor|preco|preço|pag)/i.test(normalized) ||
      /(tem\s*(algum)?\s*custo|paga\s*algo|preciso\s*pagar)/i.test(normalized)) {
    return 'ask_price';
  }
  
  // Ask how works
  if (/(como|explica|funciona|o que [eé]|qual [eé])/i.test(normalized) && 
      /(funciona|coesa|energia|solar|servico|serviço)/i.test(normalized)) {
    return 'ask_how_works';
  }
  
  // Objection: Trust
  if (/(golpe|fraude|piramide|pirâmide|confi|serio|sério|verdade|real|empresa|registrad)/i.test(normalized) &&
      /(isso|esse|voce|você|é|e)/i.test(normalized)) {
    return 'objection_trust';
  }
  
  // Objection: Price
  if (/(caro|muito|pagar|taxa|mensalidade|custo alto)/i.test(normalized)) {
    return 'objection_price';
  }
  
  // Objection: Time
  if (/(n[aã]o\s*tenho\s*tempo|depois|agora\s*n[aã]o|ocupad|ligou\s*na\s*hora\s*errada)/i.test(normalized)) {
    return 'objection_time';
  }
  
  // Ready to close
  if (/(quero\s*(sim|aderir|fazer|fechar|contratar|assinar)|pode\s*fazer|vamos|fecha|bora|vou\s*querer)/i.test(normalized)) {
    return 'ready_to_close';
  }
  
  // Want human
  if (/(falar\s*com\s*(algu[eé]m|pessoa|humano|atendente)|transfer|gerente|supervisor)/i.test(normalized)) {
    return 'want_human';
  }
  
  // Already customer
  if (/(j[aá]\s*sou\s*cliente|j[aá]\s*tenho|j[aá]\s*contratei|j[aá]\s*assino)/i.test(normalized)) {
    return 'already_customer';
  }
  
  // Not interested
  if (/(n[aã]o\s*(tenho\s*)?interesse|n[aã]o\s*quero|obrigad[oa]?\s*mas|dispenso|deixa\s*pra\s*l[aá])/i.test(normalized)) {
    return 'not_interested';
  }
  
  return null;
}

// ═══════════════════════════════════════════════════════════════
// CLASSIFIER: Now with Business Intent detection
// ═══════════════════════════════════════════════════════════════

function classifyInput(text: string, context: ConversationContext): InputClassification {
  const normalized = text
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  console.log(`[CLASSIFY] Input: "${text}" | Stage: ${context.stage}`);

  // 1. Check for noise
  if (!normalized || normalized.length < 2) {
    return { type: 'ruido', confidence: 'high', matched_pattern: 'empty' };
  }

  for (const pattern of RUIDO_PATTERNS) {
    if (pattern.test(normalized)) {
      return { type: 'ruido', confidence: 'high', matched_pattern: pattern.toString() };
    }
  }

  // 2. Check for business intent FIRST (higher priority)
  const businessIntent = detectBusinessIntent(text);
  if (businessIntent) {
    console.log(`[CLASSIFY] → Business intent: ${businessIntent}`);
    return { 
      type: 'business_intent', 
      confidence: 'high', 
      business_intent: businessIntent 
    };
  }

  // 3. Check if user is providing information we asked for
  const newData = extractCollectedData(text, context.collected);
  const providedNewInfo = 
    (newData.name && !context.collected.name) ||
    (newData.bill_amount && !context.collected.bill_amount) ||
    (newData.utility && !context.collected.utility);
  
  if (providedNewInfo) {
    console.log(`[CLASSIFY] → Providing info for stage ${context.stage}`);
    return { 
      type: 'business_intent', 
      confidence: 'high', 
      business_intent: 'providing_info' 
    };
  }

  // 4. Pure greetings (only if short and at GREETING stage)
  const words = normalized.split(' ');
  if (words.length <= 5 && context.stage === 'GREETING') {
    for (const saudacao of SAUDACOES) {
      const saudacaoNorm = saudacao.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (normalized === saudacaoNorm || normalized.startsWith(saudacaoNorm + ' ')) {
        console.log(`[CLASSIFY] → Greeting: "${saudacao}"`);
        return { type: 'saudacao', confidence: 'high', matched_pattern: saudacao };
      }
    }
  }

  // 5. Short confirmations
  if (words.length <= 2) {
    for (const confirmacao of CONFIRMACOES) {
      const confirmacaoNorm = confirmacao.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (normalized === confirmacaoNorm) {
        console.log(`[CLASSIFY] → Confirmation: "${confirmacao}"`);
        return { type: 'confirmacao', confidence: 'high', matched_pattern: confirmacao };
      }
    }
  }

  console.log(`[CLASSIFY] → Unknown, sending to AI`);
  return { type: 'desconhecido', confidence: 'low' };
}

// ═══════════════════════════════════════════════════════════════
// PHASE 6: CONVERSION TRIGGERS
// ═══════════════════════════════════════════════════════════════

function shouldAttemptClose(context: ConversationContext): boolean {
  const { collected } = context;
  
  // Has all required data
  if (collected.name && collected.bill_amount && collected.utility) {
    return true;
  }
  
  // Has name and bill (utility can be asked later)
  if (collected.name && collected.bill_amount && context.total_messages >= 6) {
    return true;
  }
  
  return false;
}

function getNextQuestion(context: ConversationContext): string {
  const { collected, stage } = context;
  
  // Priority order: name → bill → utility
  if (!collected.name) {
    return collected.bill_amount 
      ? "E qual o seu nome completo pra eu gerar a proposta?"
      : "Qual o seu nome completo?";
  }
  
  if (!collected.bill_amount) {
    return `${collected.name}, quanto você paga de luz por mês, mais ou menos?`;
  }
  
  if (!collected.utility) {
    return `E qual a distribuidora de energia da sua região? Por exemplo, CEMIG, ENEL...`;
  }
  
  return ""; // All collected
}

// ═══════════════════════════════════════════════════════════════
// PHASE 7: FALLBACK RESPONSES
// ═══════════════════════════════════════════════════════════════

function getFallbackResponse(context: ConversationContext): string | null {
  if (context.messages_in_stage >= 3) {
    switch (context.stage) {
      case 'COLLECTING_NAME':
        return "Sem problemas! Me conta: quanto você paga de luz por mês, mais ou menos?";
      case 'COLLECTING_BILL':
        return "A maioria dos nossos clientes economiza entre 50 e 200 reais por mês. Quer receber uma proposta sem compromisso?";
      case 'COLLECTING_UTILITY':
        return "Tudo bem, depois a gente vê isso! Posso te enviar a proposta por WhatsApp?";
    }
  }
  
  if (context.objections_count >= 2) {
    return "Entendo suas dúvidas! Que tal eu enviar um material explicativo por WhatsApp pra você analisar com calma?";
  }
  
  return null;
}

// ═══════════════════════════════════════════════════════════════
// PHASE 3: DYNAMIC STAGE PROMPTS
// ═══════════════════════════════════════════════════════════════

function buildStagePrompt(context: ConversationContext): string {
  const { stage, collected, messages_in_stage, objections_count } = context;
  
  const baseRules = `REGRAS CRÍTICAS:
- Respostas CURTAS (1-2 frases máximo)
- NÃO se apresente novamente
- NÃO repita perguntas já feitas
- Uma pergunta por vez
- Tom amigável e natural`;

  const collectedInfo = `
DADOS JÁ COLETADOS:
${collected.name ? `- Nome: ${collected.name}` : '- Nome: NÃO COLETADO'}
${collected.bill_amount ? `- Conta de luz: R$ ${collected.bill_amount}` : '- Conta de luz: NÃO COLETADO'}
${collected.utility ? `- Distribuidora: ${collected.utility}` : '- Distribuidora: NÃO COLETADO'}`;

  switch (stage) {
    case 'GREETING':
      return `${baseRules}
${collectedInfo}

OBJETIVO: Cliente acabou de atender. Despertar interesse.
PRÓXIMO: Perguntar o nome OU se ele quer saber da economia.
EVITAR: Explicações longas neste momento.`;
      
    case 'COLLECTING_NAME':
      return `${baseRules}
${collectedInfo}

OBJETIVO: Coletar o nome completo do cliente.
TENTATIVAS NESTE ESTÁGIO: ${messages_in_stage}
AÇÃO: Perguntar nome de forma natural.
${messages_in_stage >= 2 ? 'DICA: Se cliente resistir, pule pra pergunta da conta de luz.' : ''}`;
      
    case 'COLLECTING_BILL':
      return `${baseRules}
${collectedInfo}

OBJETIVO: Descobrir quanto o cliente paga de luz mensalmente.
TENTATIVAS: ${messages_in_stage}
AÇÃO: Perguntar valor aproximado da conta.
IMPORTANTE: Aceite respostas aproximadas ("uns 200", "por volta de 300").`;
      
    case 'COLLECTING_UTILITY':
      return `${baseRules}
${collectedInfo}

OBJETIVO: Identificar a distribuidora de energia.
EXEMPLOS: CEMIG, ENEL, COPEL, LIGHT, CPFL, ENERGISA
AÇÃO: Perguntar qual distribuidora atende a região do cliente.`;
      
    case 'CLOSING':
      return `${baseRules}
${collectedInfo}

OBJETIVO: Fechar a adesão!
ECONOMIA ESTIMADA: R$ ${Math.round((collected.bill_amount || 300) * 0.25)}/mês
AÇÃO: Dizer que vai gerar a proposta e enviar por WhatsApp.
TOM: Entusiasmado mas profissional.`;
      
    case 'OBJECTION':
      return `${baseRules}
${collectedInfo}

OBJETIVO: Contornar objeção (objeções até agora: ${objections_count})
TÁTICAS:
- Validar sentimento ("Entendo...")
- Dar fato concreto (ANEEL, milhares de clientes)
- Oferecer material por WhatsApp
${objections_count >= 2 ? 'IMPORTANTE: Se persistir, ofereça enviar material e encerrar educadamente.' : ''}`;
      
    case 'HANDOFF':
      return `${baseRules}

OBJETIVO: Transferir para atendente humano.
AÇÃO: Dizer que vai transferir e agradecer.`;
      
    default:
      return `${baseRules}
${collectedInfo}

OBJETIVO: Continuar conversa de vendas de energia solar.
FOCO: Coletar dados faltantes ou fechar negócio.`;
  }
}

// ═══════════════════════════════════════════════════════════════
// INFER STAGE FROM CONTEXT
// ═══════════════════════════════════════════════════════════════

function inferStage(collected: CollectedData, totalMessages: number, history: Array<{role: string; content: string}>): ConversationStage {
  // No messages yet = greeting
  if (totalMessages <= 1) {
    return 'GREETING';
  }
  
  // All data collected = closing
  if (collected.name && collected.bill_amount && collected.utility) {
    return 'CLOSING';
  }
  
  // Has name and bill, just needs utility
  if (collected.name && collected.bill_amount) {
    return 'COLLECTING_UTILITY';
  }
  
  // Has name, needs bill
  if (collected.name) {
    return 'COLLECTING_BILL';
  }
  
  // First few messages, collecting name
  if (totalMessages <= 4) {
    return 'COLLECTING_NAME';
  }
  
  // Fallback
  return 'PITCH';
}

// ═══════════════════════════════════════════════════════════════
// CONFIG TYPES & CACHE
// ═══════════════════════════════════════════════════════════════

interface KBSource {
  id: string;
  name: string;
  type: 'document' | 'faq' | 'policy' | 'glossary' | 'api' | 'url' | 'custom';
  description?: string;
  content?: string;
  url?: string;
  enabled: boolean;
}

interface PersonaConfig {
  system_prompt?: string;
  tone?: { default?: string; forbidden?: string[] };
  style?: { max_linhas?: number; emojis_permitidos?: string[] };
  personality?: string[];
  llm_model?: string;
}

interface GuardrailsConfig {
  never_do?: string[];
  handoff_triggers?: string[];
  max_messages_without_progress?: number;
  escalation_phrases?: string[];
}

interface ToolConfig {
  name: string;
  enabled: boolean;
  description?: string;
}

interface VoiceConfig {
  inbound?: {
    enabled?: boolean;
    greeting_template?: string;
    max_call_duration_seconds?: number;
    language?: string;
  };
  outbound?: {
    enabled?: boolean;
    greeting_template?: string;
  };
}

interface FullAgentConfig {
  agent_id: string;
  name: string;
  role: string;
  kb_sources: KBSource[];
  persona: PersonaConfig;
  guardrails: GuardrailsConfig;
  tools_config: ToolConfig[];
  intents: Record<string, unknown>[];
  collection_rules: unknown;
  voice_config: VoiceConfig;
}

let agentConfigCache: { data: FullAgentConfig | null; timestamp: number; agentId: string | null } = { 
  data: null, 
  timestamp: 0,
  agentId: null 
};
const CACHE_TTL_MS = 5 * 60 * 1000;

// ═══════════════════════════════════════════════════════════════
// CONFIG LOADING (from AI Gym)
// ═══════════════════════════════════════════════════════════════

async function loadFullAgentConfig(supabaseClient: any, agentId: string = 'sofia'): Promise<FullAgentConfig> {
  const now = Date.now();
  
  if (agentConfigCache.data && agentConfigCache.agentId === agentId && (now - agentConfigCache.timestamp) < CACHE_TTL_MS) {
    return agentConfigCache.data;
  }
  
  try {
    let agent = null;
    
    const { data: activeAgent } = await supabaseClient
      .from('ai_agents')
      .select('*')
      .eq('agent_id', agentId)
      .eq('status', 'active')
      .limit(1)
      .single();
    
    if (activeAgent) agent = activeAgent;
    
    if (!agent) {
      const { data: publishedAgent } = await supabaseClient
        .from('ai_agents')
        .select('*')
        .eq('agent_id', agentId)
        .eq('status', 'published')
        .limit(1)
        .single();
      
      if (publishedAgent) agent = publishedAgent;
    }
    
    if (!agent) {
      const { data: latestAgent } = await supabaseClient
        .from('ai_agents')
        .select('*')
        .eq('agent_id', agentId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();
      
      if (latestAgent) agent = latestAgent;
    }
    
    if (!agent) {
      return getEmptyConfig(agentId);
    }
    
    const config = normalizeConfig(agent);
    agentConfigCache = { data: config, timestamp: now, agentId };
    return config;
  } catch (err) {
    console.error('[CONFIG] Error loading:', err);
    return getEmptyConfig(agentId);
  }
}

function getEmptyConfig(agentId: string): FullAgentConfig {
  return {
    agent_id: agentId,
    name: agentId,
    role: 'assistant',
    kb_sources: [],
    persona: {},
    guardrails: {},
    tools_config: [],
    intents: [],
    collection_rules: null,
    voice_config: {},
  };
}

function normalizeConfig(agent: any): FullAgentConfig {
  let kbSources: KBSource[] = [];
  if (Array.isArray(agent.kb_sources)) {
    kbSources = agent.kb_sources.map((source: any, idx: number) => {
      if (typeof source === 'string') {
        return { id: `legacy_${idx}`, name: source, type: 'custom' as const, content: source, enabled: true };
      }
      return source as KBSource;
    });
  }
  
  return {
    agent_id: agent.agent_id,
    name: agent.name || agent.agent_id,
    role: agent.role || 'assistant',
    kb_sources: kbSources,
    persona: agent.persona || {},
    guardrails: agent.guardrails || {},
    tools_config: Array.isArray(agent.tools_config) ? agent.tools_config : [],
    intents: Array.isArray(agent.intents) ? agent.intents : [],
    collection_rules: agent.collection_rules || null,
    voice_config: agent.voice_config || {},
  };
}

// ═══════════════════════════════════════════════════════════════
// MAIN HANDLER: handleGetSofiaResponse
// ═══════════════════════════════════════════════════════════════

async function handleGetSofiaResponse(
  args: Record<string, unknown>,
  supabase: any,
  agentConfig: FullAgentConfig
): Promise<{ reply: string; classification: InputClassification; context: ConversationContext }> {
  const startTime = Date.now();
  
  // Extract message and history
  const userMessage = (args.transcribed_text as string || args.user_message as string || args.message as string || '').trim();
  const conversationHistory = args.transcript as Array<{role: string; content: string}> || [];
  const callId = args.call_id as string || 'unknown';
  
  console.log(`[SOFIA] Input: "${userMessage}" | History: ${conversationHistory.length} msgs`);

  // Build context from conversation history
  let collected: CollectedData = {};
  let totalMessages = conversationHistory.length + 1;
  
  // Extract data from all previous messages
  for (const msg of conversationHistory) {
    if (msg.role === 'user') {
      collected = extractCollectedData(msg.content, collected);
    }
  }
  
  // Extract from current message
  collected = extractCollectedData(userMessage, collected);
  
  // Infer current stage
  const stage = inferStage(collected, totalMessages, conversationHistory);
  
  const context: ConversationContext = {
    stage,
    collected,
    objections_count: 0, // TODO: track from history
    messages_in_stage: 1,
    total_messages: totalMessages,
  };
  
  console.log(`[SOFIA] Context:`, { stage, collected, totalMessages });

  // Classify input
  const classification = classifyInput(userMessage, context);
  
  // ═══════════════════════════════════════════════════════════════
  // FAST PATHS (No AI needed)
  // ═══════════════════════════════════════════════════════════════

  // 1. GREETING at start
  if (classification.type === 'saudacao' && stage === 'GREETING') {
    const welcome = getRandomWelcome();
    console.log(`[SOFIA] → Fast path: greeting (${Date.now() - startTime}ms)`);
    return { reply: welcome, classification, context };
  }

  // 2. BUSINESS INTENT with instant response
  if (classification.type === 'business_intent' && classification.business_intent) {
    const intent = classification.business_intent;
    
    // Special handling for providing_info
    if (intent === 'providing_info') {
      // Check if we should close
      if (shouldAttemptClose(context)) {
        const economia = Math.round((collected.bill_amount || 300) * 0.25);
        const reply = collected.name 
          ? `Perfeito ${collected.name}! Com uma conta de ${collected.bill_amount} reais, você pode economizar uns ${economia} reais por mês. Vou gerar sua proposta e te enviar por WhatsApp, tá bom?`
          : `Ótimo! Com essa conta você pode economizar uns ${economia} reais por mês. Qual seu nome completo pra eu gerar a proposta?`;
        console.log(`[SOFIA] → Fast path: closing (${Date.now() - startTime}ms)`);
        return { reply, classification, context };
      }
      
      // Otherwise, ask next question
      const nextQ = getNextQuestion(context);
      if (nextQ) {
        console.log(`[SOFIA] → Fast path: next question (${Date.now() - startTime}ms)`);
        return { reply: nextQ, classification, context };
      }
    }
    
    // Check instant response
    const instantResponse = INSTANT_RESPONSES[intent];
    if (instantResponse) {
      let reply = typeof instantResponse === 'function' 
        ? instantResponse(context) 
        : instantResponse;
      
      // Skip empty responses (like providing_info fallback)
      if (reply) {
        console.log(`[SOFIA] → Fast path: instant ${intent} (${Date.now() - startTime}ms)`);
        
        // Special: handoff and already_customer trigger stage change
        if (intent === 'want_human' || intent === 'already_customer') {
          context.stage = 'HANDOFF';
        }
        if (intent === 'not_interested') {
          context.stage = 'HANDOFF';
        }
        
        return { reply, classification, context };
      }
    }
  }

  // 3. CONFIRMATION - continue flow
  if (classification.type === 'confirmacao') {
    const nextQ = getNextQuestion(context);
    if (nextQ) {
      const reply = `Ótimo! ${nextQ}`;
      console.log(`[SOFIA] → Fast path: confirmation (${Date.now() - startTime}ms)`);
      return { reply, classification, context };
    }
    
    // If all collected, go to close
    if (shouldAttemptClose(context)) {
      const economia = Math.round((collected.bill_amount || 300) * 0.25);
      const reply = `Perfeito! Vou gerar sua proposta agora, ${collected.name}. Você pode economizar uns ${economia} reais por mês. Te envio por WhatsApp!`;
      console.log(`[SOFIA] → Fast path: closing on confirm (${Date.now() - startTime}ms)`);
      return { reply, classification, context };
    }
  }

  // 4. NOISE
  if (classification.type === 'ruido') {
    console.log(`[SOFIA] → Fast path: noise (${Date.now() - startTime}ms)`);
    return { reply: "Desculpa, não consegui ouvir direito. Pode repetir?", classification, context };
  }

  // 5. FALLBACK check
  const fallback = getFallbackResponse(context);
  if (fallback) {
    console.log(`[SOFIA] → Fast path: fallback (${Date.now() - startTime}ms)`);
    return { reply: fallback, classification, context };
  }

  // ═══════════════════════════════════════════════════════════════
  // AI PATH (Only when needed)
  // ═══════════════════════════════════════════════════════════════
  
  console.log(`[SOFIA] Processing with AI...`);
  
  const stagePrompt = buildStagePrompt(context);
  
  // Load modular prompts from database
  let modularSection = '';
  try {
    const agentId = agentConfig?.agent_id || 'sofia';
    const promptModules = await loadAgentPromptModules(supabase, agentId);
    
    if (promptModules.length > 0) {
      const globalVariables = {
        clienteNome: collected.name || '',
        valorFatura: collected.bill_amount?.toString() || '',
        distribuidora: collected.utility || '',
        stage: context.stage,
        agentName: agentConfig?.name || 'Sofia',
      };
      
      modularSection = buildModularPrompt(promptModules, globalVariables);
      console.log(`[sofia-voice] 🧩 Loaded ${promptModules.length} modular prompts`);
    }
  } catch (modularError) {
    console.warn('[sofia-voice] Failed to load modular prompts:', modularError);
  }
  
  const systemPrompt = `Você é Sofia, vendedora da COESA Energia, em LIGAÇÃO telefônica.

${stagePrompt}

SOBRE A COESA:
- Energia solar por assinatura
- Desconto de 15-30% na conta de luz
- Sem custo de adesão, sem obras
- Regulamentada pela ANEEL

${modularSection ? `\n${modularSection}` : ''}`;

  const messages: Array<{role: string; content: string}> = [
    { role: 'system', content: systemPrompt }
  ];
  
  // Add last 6 history messages for context
  if (conversationHistory.length > 0) {
    const recent = conversationHistory.slice(-6);
    for (const msg of recent) {
      messages.push({ 
        role: msg.role === 'agent' ? 'assistant' : 'user', 
        content: msg.content 
      });
    }
  }
  
  messages.push({ role: 'user', content: userMessage });

  // Call AI using agent's configured model
  const models = getModelsForAgent(agentConfig);
  console.log(`[SOFIA] Using models: ${models.join(', ')} (configured: ${agentConfig?.persona?.llm_model || 'none'})`);
  
  for (const model of models) {
    try {
      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: 80,
          temperature: 0.4,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        let reply = data.choices?.[0]?.message?.content || '';
        
        // Clean markdown/emojis
        reply = reply
          .replace(/\*\*/g, '')
          .replace(/\*/g, '')
          .replace(/#{1,6}\s?/g, '')
          .replace(/\n+/g, ' ')
          .replace(/[😊🌞💚✨👍🔆⚡]/g, '')
          .trim();
        
        const latency = Date.now() - startTime;
        console.log(`[SOFIA] AI response (${latency}ms): "${reply.substring(0, 80)}..."`);
        
        return { reply, classification, context };
      }
    } catch (error) {
      console.error(`[SOFIA] AI error:`, error);
    }
  }
  
  // Ultimate fallback
  return { 
    reply: "Desculpa, tive um probleminha. Pode repetir?", 
    classification, 
    context 
  };
}

// ═══════════════════════════════════════════════════════════════
// BITRIX INTEGRATION
// Sync lead data to Bitrix24 CRM when we have enough information
// ═══════════════════════════════════════════════════════════════

interface BitrixSyncResult {
  success: boolean;
  leadId?: string;
  error?: string;
}

async function syncToBitrix(
  supabase: any,
  callId: string,
  phone: string,
  collected: CollectedData,
  stage: ConversationStage
): Promise<BitrixSyncResult> {
  // Only sync if we have minimum data
  const hasMinData = collected.name && collected.bill_amount;
  if (!hasMinData) {
    console.log(`[BITRIX] Skipping sync - insufficient data`);
    return { success: false, error: 'Insufficient data' };
  }

  try {
    console.log(`[BITRIX] Syncing lead from voice call:`, { phone, collected, stage });

    // Call sofia-bitrix-lead function to create/update lead
    const response = await fetch(`${SUPABASE_URL}/functions/v1/sofia-bitrix-lead`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        conversaId: `voice_${callId}`,
        phone: phone,
        clienteNome: collected.name,
        dadosColetados: {
          nome: collected.name,
          telefone: phone,
          valorFatura: collected.bill_amount,
          distribuidora: collected.utility,
          cidade: collected.city,
        },
        forcarMovimentacao: stage === 'CLOSING',
        origem: 'voice_inbound',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[BITRIX] Sync failed:`, response.status, errorText);
      return { success: false, error: `HTTP ${response.status}` };
    }

    const result = await response.json();
    console.log(`[BITRIX] Sync successful:`, result);
    
    return { 
      success: true, 
      leadId: result.bitrixLeadId || result.leadId 
    };
  } catch (error) {
    console.error(`[BITRIX] Sync error:`, error);
    return { success: false, error: String(error) };
  }
}

// Check if we should sync to Bitrix based on context
function shouldSyncToBitrix(context: ConversationContext): boolean {
  const { collected, stage, total_messages } = context;
  
  // Must have at least name and bill amount
  if (!collected.name || !collected.bill_amount) {
    return false;
  }

  // Sync when:
  // 1. We're in CLOSING stage (all data collected)
  // 2. We have name + bill and at least 4 messages
  if (stage === 'CLOSING') {
    return true;
  }
  
  if (collected.name && collected.bill_amount && total_messages >= 4) {
    return true;
  }
  
  return false;
}

// ═══════════════════════════════════════════════════════════════
// HELPER HANDLERS
// ═══════════════════════════════════════════════════════════════

async function handleGetGreeting(args: Record<string, unknown>, agentConfig: FullAgentConfig): Promise<string> {
  const customerName = args.customer_name as string || '';
  const greetingTemplate = agentConfig.voice_config.inbound?.greeting_template;
  
  if (greetingTemplate) {
    return greetingTemplate
      .replace('{{customer_name}}', customerName || 'cliente')
      .replace('{{agent_name}}', agentConfig.name || 'Sofia');
  }
  
  return customerName 
    ? `Oi ${customerName}! Aqui é a Sofia da COESA Energia. Como posso te ajudar?`
    : `Oi! Aqui é a Sofia da COESA Energia. Com quem eu falo?`;
}

async function handleCheckEscalation(args: Record<string, unknown>, agentConfig: FullAgentConfig): Promise<string> {
  const userMessage = (args.user_message as string || '').toLowerCase();
  
  const handoffTriggers = agentConfig.guardrails.handoff_triggers || [];
  for (const trigger of handoffTriggers) {
    if (userMessage.includes(trigger.toLowerCase())) {
      return JSON.stringify({ should_escalate: true, reason: trigger, type: 'guardrail' });
    }
  }
  
  const escalationKeywords = ['procon', 'processar', 'advogado', 'justiça', 'tribunal', 'fraude', 'golpe'];
  for (const keyword of escalationKeywords) {
    if (userMessage.includes(keyword)) {
      return JSON.stringify({ should_escalate: true, reason: keyword, type: 'keyword' });
    }
  }
  
  return JSON.stringify({ should_escalate: false });
}

// ═══════════════════════════════════════════════════════════════
// MAIN SERVER HANDLER
// ═══════════════════════════════════════════════════════════════

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  
  try {
    const body = await req.json();
    
    console.log('📞 Voice webhook:', JSON.stringify(body).substring(0, 300));
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const agentConfig = await loadFullAgentConfig(supabase, 'sofia_inbound_sales_');
    
    // Parse various Retell formats
    const callId = body.call?.call_id || body.data?.call_id || body.call_id || 'unknown';
    
    let functionName = '';
    let args: Record<string, unknown> = {};
    
    if (body.event === 'function_call' || body.args) {
      functionName = body.function_name || 'get_sofia_response';
      args = body.args || body.arguments || {};
    } else if (body.function_name && body.arguments) {
      functionName = body.function_name;
      args = body.arguments;
    } else if (body.transcribed_text) {
      functionName = 'get_sofia_response';
      args = { user_message: body.transcribed_text, customer_name: body.caller_name || '' };
    } else {
      const msg = body.message || body.text || body.input || body.query;
      if (msg) {
        functionName = 'get_sofia_response';
        args = { user_message: msg };
      } else {
        return new Response(
          JSON.stringify({ result: "ok", message: "Voice webhook healthy" }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }
    
    console.log(`📞 Function: ${functionName}`);
    
    let result: string;
    let classification: InputClassification | null = null;
    let context: ConversationContext | null = null;
    
    switch (functionName) {
      case 'get_sofia_response':
      case 'getSofiaResponse':
      case 'generate_response':
      case 'respond': {
        const response = await handleGetSofiaResponse(args, supabase, agentConfig);
        result = response.reply;
        classification = response.classification;
        context = response.context;
        break;
      }
      case 'get_greeting':
      case 'getGreeting':
        result = await handleGetGreeting(args, agentConfig);
        break;
      case 'check_escalation':
      case 'checkEscalation':
        result = await handleCheckEscalation(args, agentConfig);
        break;
      default: {
        const response = await handleGetSofiaResponse(args, supabase, agentConfig);
        result = response.reply;
        classification = response.classification;
        context = response.context;
      }
    }
    
    const processingTime = Date.now() - startTime;
    console.log(`📞 Response (${processingTime}ms):`, result.substring(0, 80));
    
    // ═══════════════════════════════════════════════════════════════
    // BITRIX SYNC: Create/update lead when we have enough data
    // ═══════════════════════════════════════════════════════════════
    let bitrixSyncResult: BitrixSyncResult | null = null;
    
    if (context && shouldSyncToBitrix(context)) {
      // Get phone from Retell call metadata
      const callerPhone = body.call?.from_number || 
                          body.caller_phone || 
                          args.caller_phone as string || 
                          args.phone as string ||
                          '';
      
      if (callerPhone) {
        // Sync in background (don't block response)
        syncToBitrix(supabase, callId, callerPhone, context.collected, context.stage)
          .then((syncResult) => {
            console.log(`[BITRIX] Background sync completed:`, syncResult);
          })
          .catch((err) => {
            console.error(`[BITRIX] Background sync error:`, err);
          });
      } else {
        console.log(`[BITRIX] No caller phone available, skipping sync`);
      }
    }
    
    // Log to database
    try {
      await supabase.from('voice_call_logs').insert({
        call_id: callId,
        transcribed_text: JSON.stringify(args),
        reply_text: result,
        intent_detected: classification?.business_intent || classification?.type || functionName,
        conversation_stage: context?.stage || 'unknown',
        next_action: 'continue',
        handoff_required: context?.stage === 'HANDOFF',
        confidence_level: classification?.confidence || 'high',
        processing_time_ms: processingTime,
        metadata: { 
          function_name: functionName, 
          collected_data: context?.collected,
          total_messages: context?.total_messages,
          bitrix_sync_triggered: context ? shouldSyncToBitrix(context) : false,
        },
      });
    } catch (dbError) {
      console.error('DB log error:', dbError);
    }
    
    return new Response(
      JSON.stringify({ result }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(
      JSON.stringify({ result: "Desculpa, tive um probleminha. Pode repetir?" }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
