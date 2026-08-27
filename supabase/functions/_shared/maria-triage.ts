/**
 * MarIA Triage Module - Centralized triage logic for routing existing clients
 * Extracted from sofia-webhook for reuse across agents (marIA SAC, sofIA Vendas)
 * 
 * Handles:
 * - Existing client detection (keyword + AI)
 * - Contextual clarification for ambiguous intents
 * - Department selection routing
 * - Triage state machine
 * - Contact lookup for redirection
 */

import { matchesPatternCategory, type PatternEntry } from './detection-patterns.ts';
import { getRenderedTemplate, getTemplate, getTemplateCache, type MessageTemplate } from './message-templates.ts';

const LOVABLE_API_KEY = Deno.env.get('COESASOLAR_OPENROUTER_API_KEY');

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type TriagemState = null | 'aguardando_confirmacao_cliente' | 'aguardando_departamento' | 'aguardando_clarificacao' | 'triagem_concluida';

export type TriagemDepartment = 'financeiro' | 'pos_venda' | 'fatura' | 'atendimento' | null;

export type TriagemCategory = 
  | 'billing'
  | 'contract_status'
  | 'invoice_issues'
  | 'cadastral'
  | 'complaint'
  | 'referral'
  | 'support_generic'
  | 'third_party'
  | 'service_not_offered'
  | 'corporate'
  | 'scheduling'
  | 'return_contact'
  | 'identity_confusion'
  | 'institutional'
  | 'partner_b2b'
  | 'forwarding'
  | 'wrong_number'
  | 'unknown';

export interface TriagemContext {
  state: TriagemState;
  clienteConfirmado?: boolean;
  departamentoSelecionado?: TriagemDepartment;
  triggerKeyword?: string;
  originalMessage?: string;
  aiConfidence?: number;
}

// ═══════════════════════════════════════════════════════════════
// CONTEXTUAL CLARIFICATION - PHASE: Triage Fix Error #1 & #2
// Handles ambiguous patterns like "andamento" that need context
// ═══════════════════════════════════════════════════════════════

export interface ContextualResolution {
  needsClarification: boolean;
  inferredContext: 'proposal' | 'contract' | 'support' | null;
  confidence: number;
  reason: string;
  historicalProposalUrl?: string | null;
}

/**
 * Check if message matches contextual clarification patterns
 * (patterns that are ambiguous and need context before triggering triage)
 */
export function matchesContextualPattern(
  message: string,
  patterns?: Map<string, PatternEntry>
): boolean {
  if (!patterns) return false;
  return matchesPatternCategory(message, 'contextual_clarification', patterns);
}

/**
 * Resolve contextual intent by checking database for existing proposals/contracts
 * Returns whether clarification is needed or we can infer context
 */
export async function resolveContextualIntent(
  supabase: any,
  phone: string,
  conversa: any,
  patterns?: Map<string, PatternEntry>
): Promise<ContextualResolution> {
  // 1. Check current conversation context
  if (conversa?.proposta_id) {
    console.log(`[CONTEXTUAL] Found proposta_id in current conversa: ${conversa.proposta_id}`);
    return { 
      needsClarification: false, 
      inferredContext: 'proposal', 
      confidence: 1.0,
      reason: 'current_conversa_has_proposta'
    };
  }
  
  const dados = conversa?.dados_coletados || {};
  
  if (dados.proposta_id || dados.proposal_url) {
    console.log(`[CONTEXTUAL] Found proposal context in dados_coletados`);
    return { 
      needsClarification: false, 
      inferredContext: 'proposal', 
      confidence: 1.0,
      reason: 'dados_has_proposta',
      historicalProposalUrl: dados.proposal_url || null
    };
  }
  
  // 2. Check Bitrix24 stage - contract stages indicate existing client
  const stage = conversa?.bitrix24_stage;
  const contractStages = ['UC_GQKQX5', 'UC_59V8I1', 'WON']; // Contrato Enviado, Assinado, Ganho
  if (stage && contractStages.includes(stage)) {
    console.log(`[CONTEXTUAL] Bitrix stage indicates contract: ${stage}`);
    return { 
      needsClarification: false, 
      inferredContext: 'contract', 
      confidence: 0.9,
      reason: `bitrix_stage_${stage}`
    };
  }
  
  // 3. Check for commercial data that indicates lead in progress
  if (dados.distribuidora || dados.valorFatura || dados.valor_fatura || dados.consumo) {
    console.log(`[CONTEXTUAL] Commercial data found - lead in progress`);
    return { 
      needsClarification: false, 
      inferredContext: 'proposal', 
      confidence: 0.7,
      reason: 'has_commercial_data'
    };
  }
  
  // 4. Check historical conversations for this phone
  try {
    const { data: historicalConversas } = await supabase
      .from('chatbot_conversas')
      .select('proposta_id, bitrix24_stage, dados_coletados, last_message_at')
      .eq('cliente_telefone', phone)
      .not('proposta_id', 'is', null)
      .order('last_message_at', { ascending: false })
      .limit(1);
    
    if (historicalConversas && historicalConversas.length > 0) {
      const lastWithProposal = historicalConversas[0];
      const proposalUrl = lastWithProposal.dados_coletados?.proposal_url || 
                          lastWithProposal.dados_coletados?.public_proposal_url;
      console.log(`[CONTEXTUAL] Found historical proposal: ${lastWithProposal.proposta_id}`);
      return { 
        needsClarification: false, 
        inferredContext: 'proposal', 
        confidence: 0.8,
        reason: 'historical_proposta_found',
        historicalProposalUrl: proposalUrl
      };
    }
  } catch (e) {
    console.error(`[CONTEXTUAL] Error checking historical conversas:`, e);
  }
  
  // 5. No context found - needs clarification
  console.log(`[CONTEXTUAL] No context found - clarification needed`);
  return { 
    needsClarification: true, 
    inferredContext: null, 
    confidence: 0,
    reason: 'no_context_found'
  };
}

/**
 * Generate clarification question for ambiguous patterns
 */
export function generateClarificationQuestion(
  clienteNome: string | null,
  templates?: Map<string, MessageTemplate>
): string {
  const fallback = `Olá! 👋 Você quer saber sobre o andamento de:

1️⃣ Uma *proposta comercial* que está analisando
2️⃣ O *contrato* que já assinou (homologação, créditos)  
3️⃣ Outra questão (pagamentos, suporte)

_Digite o número da opção!_`;

  return getRenderedTemplate('triage', 'contextual_clarification_prompt', {}, templates, fallback);
}

/**
 * Generate message when we found a historical proposal
 */
export function generateHistoricalProposalMessage(
  clienteNome: string | null,
  proposalUrl: string,
  templates?: Map<string, MessageTemplate>
): string {
  const firstName = (clienteNome || '').split(' ')[0];
  const greeting = firstName ? `${firstName}` : 'Olá';
  
  const fallback = `${greeting}! 😊

Encontrei uma proposta no seu nome. É sobre ela que você quer saber?

📋 Acesse aqui: ${proposalUrl}

Se for sobre outra questão (contrato, pagamentos), me avisa!`;

  return getRenderedTemplate('triage', 'found_historical_proposal', { greeting, proposal_url: proposalUrl }, templates, fallback);
}

export interface ExistingClientDetection {
  detected: boolean;
  triggerKeyword: string | null;
  category: TriagemCategory;
  confidence: number;
  source: 'keywords' | 'ai' | 'none';
  needsContextLookup?: boolean; // PLAN: Flag for contextual_clarification patterns
}

export interface TriagemResponse {
  confirmedExisting: boolean | null;
  departmentSelected: TriagemDepartment;
}

export interface CoesaContact {
  telefone: string;
  nome: string;
}

// ═══════════════════════════════════════════════════════════════
// CATEGORY DETECTION - Uses dynamic patterns from database
// ═══════════════════════════════════════════════════════════════

// Category to DB pattern mapping
const TRIAGE_CATEGORY_MAP: Record<TriagemCategory, string> = {
  wrong_number: 'triage_wrong_number',
  partner_b2b: 'triage_partner_b2b',
  identity_confusion: 'triage_identity_confusion',
  service_not_offered: 'triage_service_not_offered',
  third_party: 'triage_third_party',
  corporate: 'triage_corporate',
  scheduling: 'triage_scheduling',
  return_contact: 'triage_return_contact',
  institutional: 'triage_institutional',
  forwarding: 'triage_forwarding',
  billing: 'triage_billing',
  contract_status: 'triage_contract_status',
  invoice_issues: 'triage_invoice_issues',
  cadastral: 'triage_cadastral',
  complaint: 'triage_complaint',
  referral: 'triage_referral',
  support_generic: 'triage_support_generic',
  unknown: '',
};

/**
 * Detect category from dynamic patterns - 18 categories
 */
export function detectTriagemCategory(
  message: string,
  patterns?: Map<string, PatternEntry>
): TriagemCategory {
  // Check each category in priority order using dynamic patterns
  const priorityOrder: TriagemCategory[] = [
    'wrong_number', 'partner_b2b', 'identity_confusion', 'service_not_offered',
    'third_party', 'corporate', 'scheduling', 'return_contact', 'institutional',
    'forwarding', 'billing', 'contract_status', 'invoice_issues', 'cadastral',
    'complaint', 'referral', 'support_generic'
  ];
  
  for (const category of priorityOrder) {
    const patternKey = TRIAGE_CATEGORY_MAP[category];
    if (patternKey && patterns && matchesPatternCategory(message, patternKey, patterns)) {
      return category;
    }
  }
  
  return 'unknown';
}

// ═══════════════════════════════════════════════════════════════
// EXISTING CLIENT DETECTION
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// DISTRIBUTOR CONTEXT EXCLUSION
// When client says "sou cliente da ENERGISA/CEMIG/etc", they're talking about
// their electricity distributor, NOT claiming to be a COESA customer
// ═══════════════════════════════════════════════════════════════
const DISTRIBUIDORAS_EXCLUSION = [
  'energisa', 'cemig', 'cpfl', 'enel', 'light', 'copel', 'celesc',
  'coelba', 'equatorial', 'celpe', 'cosern', 'elektro', 'edp',
  'neoenergia', 'rge', 'ceee', 'eletropaulo', 'amazonas energia', 'cea',
  'celpa', 'cemar', 'cepisa', 'ceal', 'sulgipe', 'eflul', 'demei',
  'ceb', 'ceron', 'eletroacre', 'boa vista energia', 'roraima energia'
];

/**
 * Check if message is about being a distributor client (NOT COESA client)
 */
function isDistributorClientContext(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  
  return DISTRIBUIDORAS_EXCLUSION.some(dist => 
    lowerMessage.includes(`cliente da ${dist}`) ||
    lowerMessage.includes(`cliente ${dist}`) ||
    lowerMessage.includes(`sou da ${dist}`) ||
    lowerMessage.includes(`pago pra ${dist}`) ||
    lowerMessage.includes(`pago para ${dist}`) ||
    lowerMessage.includes(`minha conta é da ${dist}`) ||
    lowerMessage.includes(`minha conta e da ${dist}`) ||
    lowerMessage.includes(`conta da ${dist}`) ||
    lowerMessage.includes(`recebo da ${dist}`) ||
    lowerMessage.includes(`atendido pela ${dist}`)
  );
}

/**
 * Wait/pause intent patterns - imported from triage-flow.ts logic
 * Detects when client is asking for time (prevents false triage activation)
 */
const WAIT_PAUSE_EXCLUSION_PATTERNS = [
  // Padrões de saída/ocupação
  /\b(preciso|vou|tenho\s+que)\s+(dar\s+uma\s+)?sa[ií]r?\b/i,
  /\bestou\s+(ocupad[oa]|em\s+reuni[aã]o|trabalhando|dirigindo|no\s+trabalho)\b/i,
  /\b(depois|daqui\s+a\s+pouco|mais\s+tarde|agora\s+n[aã]o)\s+(te\s+)?(respondo|falo|retorno)\b/i,
  /\b(me\s+d[aá]|preciso\s+de?)\s+(um\s+)?(tempo|minuto|momento)\b/i,
  /\bj[aá]\s+(te\s+)?retorno\b/i,
  /\bvolto\s+(j[aá]|depois|logo|em\s+breve)\b/i,
  /\bagora\s+n[aã]o\s+(posso|d[aá]|consigo)\b/i,
  /\bto\s+(ocupad[oa]|sem\s+tempo|correndo)\b/i,
  
  // Padrões de "verificando/olhando/momento" (sincronizado com triage-phase.ts)
  /\bum\s*momento\b/i,
  /\baguarde\b/i,
  /\bj[aá]\s*volto\b/i,
  /\bestou\s*(verificando|conferindo|olhando|vendo)\b/i,
  /\bdeixa\s*eu\s*ver\b/i,
  /\bs[oó]\s*um\s*(instante|segundo|minuto)\b/i,
  /\bvou\s*(conferir|verificar|olhar|ver)\b/i,
  /\bespera\s*(a[ií]|um\s*pouco)?\b/i,
  /\bperai\b/i,
  /\bto\s*(vendo|olhando|conferindo)\b/i,
  /\bdeix[ao]\s*eu\s*(olhar|conferir|ver)\b/i,
  /\bpreciso\s*(ver|conferir|olhar)\b/i,
];

/**
 * Check if message indicates wait/pause intent (should skip existing client detection)
 */
function isWaitPauseContext(message: string): boolean {
  return WAIT_PAUSE_EXCLUSION_PATTERNS.some(pattern => pattern.test(message));
}

/**
 * Detect if message suggests existing client - uses dynamic patterns ONLY
 * Now with DISTRIBUTOR EXCLUSION and WAIT/PAUSE EXCLUSION to prevent false positives
 * Phase 95: Added wait/pause intent detection
 */
export function detectExistingClientIntent(
  message: string,
  patterns?: Map<string, PatternEntry>
): { detected: boolean; triggerKeyword: string | null; category: TriagemCategory } {
  // CRITICAL: Skip if message mentions being a distributor client
  // "Sou cliente da Energisa" means distributor, NOT COESA
  if (isDistributorClientContext(message)) {
    console.log(`[TRIAGEM] DISTRIBUTOR CONTEXT SKIP: Client mentioned being customer of distributor, not COESA: "${message.substring(0, 60)}..."`);
    return { detected: false, triggerKeyword: null, category: 'unknown' };
  }
  
  // Phase 95: Skip if message indicates wait/pause intent
  // "Preciso sair" or "estou ocupado" should NOT trigger triage
  if (isWaitPauseContext(message)) {
    console.log(`[TRIAGEM] WAIT/PAUSE CONTEXT SKIP: Client is asking for time, not claiming existing client: "${message.substring(0, 60)}..."`);
    return { detected: false, triggerKeyword: null, category: 'unknown' };
  }
  
  if (patterns && matchesPatternCategory(message, 'existing_client', patterns)) {
    return { 
      detected: true, 
      triggerKeyword: '[dynamic]',
      category: detectTriagemCategory(message, patterns)
    };
  }
  
  return { detected: false, triggerKeyword: null, category: 'unknown' };
}

/**
 * AI-based non-commercial intent detection (for subtle cases)
 * Zero Hardcode: Prompt loaded from database with fallback
 */
export async function detectNonCommercialIntentAI(
  message: string,
  defaultModels: string[] = ['google/gemini-2.5-flash-lite'],
  templates?: Map<string, MessageTemplate>
): Promise<{
  isNonCommercial: boolean;
  confidence: number;
  category: TriagemCategory;
  reasoning: string | null;
}> {
  try {
    // Zero Hardcode: Carregar prompt do banco de dados
    const templateFromDB = getTemplate('ai_prompts', 'triagem_non_commercial_detection', templates || getTemplateCache() || undefined);
    
    let prompt: string;
    if (templateFromDB?.template_text) {
      // Substituir variável ${message}
      prompt = templateFromDB.template_text.replace('${message}', message);
      console.log('[TRIAGEM] Using prompt from database (Zero Hardcode)');
    } else {
      // Fallback para prompt hardcoded (backward compatibility)
      console.log('[TRIAGEM] Using fallback hardcoded prompt (template not found)');
      prompt = `Analise a mensagem de um lead/cliente e determine se ele está buscando ATENDIMENTO DE SUPORTE (já é cliente/não quer comprar) ou se quer COMPRAR/ADERIR (novo cliente potencial).

IMPORTANTE: Se o cliente fizer perguntas genéricas de ORIENTAÇÃO como "como descubro?", "como faço?", "onde vejo?", "não sei", "o que é?", "me explica" - isso é COMERCIAL, pois ele está tentando entender/fornecer as informações pedidas.

Sinais de que JÁ É CLIENTE ou NÃO QUER COMPRAR (não-comercial):
- Pergunta sobre status de algo em andamento
- Menciona contrato que assinou/tem
- Pergunta sobre boleto, pagamento, fatura
- Quer saber de homologação, ativação, créditos
- Reclamação ou problema com serviço atual
- Quer atualizar dados cadastrais
- Menciona indicação/bonificação
- Menciona familiar/terceiro sendo cliente ("minha mãe é cliente", "conta do meu pai")
- Pergunta sobre instalação de placas/painéis solares (não vendemos isso)
- Pergunta sobre contrato que não é seu
- Oferecendo serviços/parceria ("sou representante", "quero oferecer")
- Confunde COESA com concessionária/governo ("são da CEMIG?", "é do governo?")
- Pedindo dados institucionais (CNPJ, endereço da empresa)
- Diz que número está errado ou que nunca pediu contato
- Retornando contato/ligação anterior ("vocês me ligaram")
- Contexto corporativo/condomínio ("sou síndico", "várias unidades")
- Pedindo visita/reunião presencial

Sinais de que QUER COMPRAR (comercial):
- Pergunta como funciona o serviço/produto
- Quer saber preços, descontos oferecidos
- Pede simulação, proposta
- Primeiro contato querendo conhecer
- Envia conta de luz para análise
- Perguntas de orientação ("não sei", "como descubro", "como faço", "onde vejo", "me ajuda", "o que é")
- Qualquer pergunta genérica sem contexto de cliente existente

Mensagem: "${message}"

Responda APENAS com JSON válido:
{
  "isNonCommercial": true/false,
  "confidence": 0.0 a 1.0,
  "category": "billing" | "contract_status" | "invoice_issues" | "cadastral" | "complaint" | "referral" | "support_generic" | "third_party" | "service_not_offered" | "corporate" | "scheduling" | "return_contact" | "identity_confusion" | "institutional" | "partner_b2b" | "forwarding" | "wrong_number" | "commercial" | "unknown",
  "reasoning": "breve explicação"
}`;
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: defaultModels[0],
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      console.log('[TRIAGEM] AI detection failed, using keywords only');
      return { isNonCommercial: false, confidence: 0, category: 'unknown', reasoning: null };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { isNonCommercial: false, confidence: 0, category: 'unknown', reasoning: null };
    }
    
    const parsed = JSON.parse(jsonMatch[0]);
    console.log(`[TRIAGEM] AI detected: isNonCommercial=${parsed.isNonCommercial}, confidence=${parsed.confidence}, category=${parsed.category}`);
    
    return {
      isNonCommercial: parsed.isNonCommercial === true,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
      category: parsed.category || 'unknown',
      reasoning: parsed.reasoning || null,
    };
    
  } catch (error) {
    console.error('[TRIAGEM] AI detection error:', error);
    return { isNonCommercial: false, confidence: 0, category: 'unknown', reasoning: null };
  }
}

/**
 * Combined detection: keywords first, then AI for ambiguous cases
 * Now with DISTRIBUTOR EXCLUSION as first check
 * PHASE 96: Added WAIT/PAUSE check as FIRST priority to prevent false triage triggers
 */
export async function detectExistingClientIntentFull(
  message: string,
  dadosColetados: any,
  patterns?: Map<string, PatternEntry>,
  defaultModels?: string[]
): Promise<ExistingClientDetection> {
  // ═══════════════════════════════════════════════════════════════
  // PHASE 96: WAIT/PAUSE CHECK (ABSOLUTE FIRST PRIORITY)
  // MUST be checked BEFORE any other detection logic
  // Prevents false triage triggers on "um momento", "estou olhando", etc.
  // ═══════════════════════════════════════════════════════════════
  if (isWaitPauseContext(message)) {
    console.log(`[TRIAGE_INTENT] ⏳ WAIT_PAUSE detected - skipping intent detection entirely: "${message.substring(0, 60)}..."`);
    return {
      detected: false,
      triggerKeyword: null,
      category: 'unknown',
      confidence: 0,
      source: 'none',
    };
  }
  
  // ═══════════════════════════════════════════════════════════════
  // COMMERCIAL CONTEXT BLOCKERS (HIGHEST PRIORITY - NEW FIX)
  // Check for commercial context patterns FIRST - these BLOCK triage completely
  // ═══════════════════════════════════════════════════════════════
  if (patterns && matchesPatternCategory(message, 'commercial_context_blockers', patterns)) {
    console.log(`[TRIAGEM] ⛔ COMMERCIAL BLOCKER: Message has commercial context, skipping triage: "${message.substring(0, 60)}..."`);
    return {
      detected: false,
      triggerKeyword: null,
      category: 'unknown',
      confidence: 0,
      source: 'none',
    };
  }
  
  // ═══════════════════════════════════════════════════════════════
  // DISTRIBUTOR CONTEXT EXCLUSION
  // When client says "sou cliente da ENERGISA/CEMIG/etc", they're talking about
  // their electricity distributor, NOT claiming to be a COESA customer
  // ═══════════════════════════════════════════════════════════════
  if (isDistributorClientContext(message)) {
    console.log(`[TRIAGEM] DISTRIBUTOR CONTEXT EXCLUSION: "${message.substring(0, 80)}..."`);
    return {
      detected: false,
      triggerKeyword: null,
      category: 'unknown',
      confidence: 0,
      source: 'none',
    };
  }
  
  // EARLY EXIT: Skip triage for ORIENTATION QUESTIONS (uses dynamic patterns)
  if (patterns && matchesPatternCategory(message, 'orientation_questions', patterns)) {
    console.log(`[TRIAGEM] Skipping detection - orientation question detected: "${message.substring(0, 50)}..."`);
    return {
      detected: false,
      triggerKeyword: null,
      category: 'unknown',
      confidence: 0,
      source: 'none',
    };
  }
  
  // ═══════════════════════════════════════════════════════════════
  // TRIAGE LOCK - EXPANDED: Skip triage if lead is in active commercial flow
  // This prevents false-positive triggers when client explains their situation
  // ═══════════════════════════════════════════════════════════════
  const hasSignificantData = dadosColetados && (
    // Core commercial data
    dadosColetados.consumo_medio || 
    dadosColetados.consumo ||
    dadosColetados.concessionaria || 
    dadosColetados.has_simulation ||
    dadosColetados.valor_fatura ||
    dadosColetados.valorFatura ||
    // Distributor info (indicates commercial interest)
    dadosColetados.distribuidora ||
    dadosColetados.distribuidoraInformada ||
    // Proposal context
    dadosColetados.proposta_id ||
    dadosColetados.proposal_url ||
    dadosColetados.proposta_link_sent ||
    // Client identity already confirmed
    dadosColetados.email ||
    dadosColetados.cpf ||
    dadosColetados.cnpj ||
    // Previous human intervention or completed triage
    dadosColetados.human_intervention_completed ||
    dadosColetados.triagem_concluida === true
  );
  
  if (hasSignificantData) {
    console.log(`[TRIAGEM] TRIAGE LOCK - Skipping detection due to significant commercial data present`);
    return {
      detected: false,
      triggerKeyword: null,
      category: 'unknown',
      confidence: 0,
      source: 'none',
    };
  }
  
  // ═══════════════════════════════════════════════════════════════
  // CONTEXT-AWARE SKIP: Detect explanatory context (not support request)
  // Phrases like "como eu te disse", "preciso buscar", "não estou em casa"
  // indicate the client is EXPLAINING their situation, not asking for support
  // ═══════════════════════════════════════════════════════════════
  const explanatoryPhrases = [
    'como eu te disse',
    'como eu disse',
    'como te disse',
    'como falei',
    'como mencionei',
    'preciso buscar',
    'preciso pegar',
    'vou buscar',
    'vou pegar',
    'não estou em casa',
    'nao estou em casa',
    'não tenho em mãos',
    'nao tenho em maos',
    'quando chegar em casa',
    'quando eu chegar',
    'mais tarde te envio',
    'mais tarde mando',
    'depois te mando',
    'depois eu mando',
    'já já te mando',
    'ja ja te mando',
  ];
  
  const msgLower = message.toLowerCase();
  const isExplainingContext = explanatoryPhrases.some(phrase => msgLower.includes(phrase));
  
  if (isExplainingContext) {
    console.log(`[TRIAGEM] CONTEXT SKIP - Client is explaining situation, not requesting support: "${message.substring(0, 60)}..."`);
    return {
      detected: false,
      triggerKeyword: null,
      category: 'unknown',
      confidence: 0,
      source: 'none',
    };
  }
  
  // ═══════════════════════════════════════════════════════════════
  // CONTEXTUAL CLARIFICATION CHECK (PLAN: Lookup contextual)
  // Patterns like "andamento", "minha situação" need database lookup
  // before triggering generic triage
  // ═══════════════════════════════════════════════════════════════
  if (patterns && matchesPatternCategory(message, 'contextual_clarification', patterns)) {
    console.log(`[TRIAGEM] Contextual pattern detected - needs database lookup: "${message.substring(0, 60)}..."`);
    return {
      detected: true,
      triggerKeyword: '[contextual_clarification]',
      category: 'unknown', // Will be resolved after context lookup
      confidence: 1.0,
      source: 'keywords',
      needsContextLookup: true,
    };
  }
  
  // First, quick keyword detection
  const keywordResult = detectExistingClientIntent(message, patterns);
  
  if (keywordResult.detected) {
    console.log(`[TRIAGEM] Keyword detected: "${keywordResult.triggerKeyword}" -> category: ${keywordResult.category}`);
    return {
      detected: true,
      triggerKeyword: keywordResult.triggerKeyword,
      category: keywordResult.category,
      confidence: 1.0,
      source: 'keywords',
    };
  }
  
  // For longer messages without obvious keywords, use AI (with higher threshold for edge cases)
  if (message.length > 40) {
    const aiResult = await detectNonCommercialIntentAI(message, defaultModels);
    
    // RAISED THRESHOLD: 0.85 instead of 0.7 to reduce false positives
    if (aiResult.isNonCommercial && aiResult.confidence >= 0.85) {
      console.log(`[TRIAGEM] AI detected non-commercial intent: confidence=${aiResult.confidence}, category=${aiResult.category}`);
      return {
        detected: true,
        triggerKeyword: `[AI] ${aiResult.reasoning || 'detected'}`,
        category: aiResult.category as TriagemCategory,
        confidence: aiResult.confidence,
        source: 'ai',
      };
    } else if (aiResult.isNonCommercial && aiResult.confidence >= 0.7) {
      // Log near-misses for debugging but don't trigger triage
      console.log(`[TRIAGEM] AI near-miss (confidence ${aiResult.confidence} < 0.85): "${aiResult.reasoning}" - NOT triggering triage`);
    }
  }
  
  return {
    detected: false,
    triggerKeyword: null,
    category: 'unknown',
    confidence: 0,
    source: 'none',
  };
}

// ═══════════════════════════════════════════════════════════════
// TRIAGE RESPONSE HANDLING
// ═══════════════════════════════════════════════════════════════

/**
 * Check user's triage response - uses dynamic patterns
 * ENHANCED: Added hardcoded fallbacks for critical patterns like "2"
 */
export function checkTriagemResponse(
  message: string,
  currentState: TriagemState,
  patterns?: Map<string, PatternEntry>
): TriagemResponse {
  const msgLower = message.toLowerCase().trim();
  
  if (currentState === 'aguardando_confirmacao_cliente') {
    // CRITICAL: Hardcoded check for "2" and variations (anti-loop fix)
    const NEW_CLIENT_HARDCODED = ['2', 'dois', 'quero ser', 'quero ser cliente', 'ser cliente', 
      'conhecer', 'desconto', 'proposta', 'novo cliente', 'nao sou', 'não sou', 'nunca fui', 
      'primeira vez', 'ainda não', 'ainda nao', 'quero conhecer', 'quero aderir', 'quero proposta'];
    
    const EXISTING_CLIENT_HARDCODED = ['1', 'um', 'ja sou', 'já sou', 'sou cliente', 
      'ja sou cliente', 'já sou cliente'];
    
    // Check hardcoded patterns first (most reliable)
    for (const phrase of EXISTING_CLIENT_HARDCODED) {
      if (msgLower === phrase || msgLower.includes(phrase)) {
        return { confirmedExisting: true, departmentSelected: null };
      }
    }
    
    for (const phrase of NEW_CLIENT_HARDCODED) {
      if (msgLower === phrase || msgLower.includes(phrase)) {
        return { confirmedExisting: false, departmentSelected: null };
      }
    }
    
    // Then check dynamic patterns
    if (patterns && matchesPatternCategory(message, 'confirm_existing', patterns)) {
      return { confirmedExisting: true, departmentSelected: null };
    }
    if (patterns && matchesPatternCategory(message, 'confirm_new', patterns)) {
      return { confirmedExisting: false, departmentSelected: null };
    }
  }
  
  if (currentState === 'aguardando_departamento') {
    if (patterns && matchesPatternCategory(message, 'select_financial', patterns)) {
      return { confirmedExisting: true, departmentSelected: 'financeiro' };
    }
    
    if (patterns && matchesPatternCategory(message, 'select_pos_venda', patterns)) {
      return { confirmedExisting: true, departmentSelected: 'pos_venda' };
    }
    
    if (patterns && matchesPatternCategory(message, 'select_fatura', patterns)) {
      return { confirmedExisting: true, departmentSelected: 'fatura' };
    }
    
    if (patterns && matchesPatternCategory(message, 'select_other', patterns)) {
      return { confirmedExisting: true, departmentSelected: 'atendimento' };
    }
  }
  
  return { confirmedExisting: null, departmentSelected: null };
}

// ═══════════════════════════════════════════════════════════════
// DEPARTMENT UTILITIES
// ═══════════════════════════════════════════════════════════════

/**
 * Map department to contact identifier
 */
export function getDepartmentContactId(department: TriagemDepartment): string {
  switch (department) {
    case 'financeiro': return 'financeiro';
    case 'pos_venda': return 'pos_venda';
    case 'fatura': return 'atendimento';
    case 'atendimento': return 'atendimento';
    default: return 'atendimento';
  }
}

/**
 * Get department display name for messages
 */
export function getDepartmentDisplayName(department: TriagemDepartment): string {
  switch (department) {
    case 'financeiro': return 'Financeiro';
    case 'pos_venda': return 'Pós-Venda';
    case 'fatura': return 'Atendimento ao Cliente';
    case 'atendimento': return 'Atendimento ao Cliente';
    default: return 'Atendimento';
  }
}

/**
 * Get COESA contact phone by identifier
 */
export async function getCoesaContact(
  supabase: any,
  identificador: string
): Promise<CoesaContact | null> {
  try {
    const { data, error } = await supabase
      .from('coesa_contatos')
      .select('telefone, nome')
      .eq('identificador', identificador)
      .eq('is_active', true)
      .single();
    
    if (error || !data) {
      console.error(`[TRIAGEM] Contato não encontrado: ${identificador}`, error);
      if (identificador !== 'atendimento') {
        return getCoesaContact(supabase, 'atendimento');
      }
      return null;
    }
    
    return data;
  } catch (err) {
    console.error(`[TRIAGEM] Erro ao buscar contato:`, err);
    return null;
  }
}

/**
 * Format phone for WhatsApp link (wa.me format)
 */
export function formatWhatsAppLink(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return `https://wa.me/${digits}`;
}

// ═══════════════════════════════════════════════════════════════
// MESSAGE GENERATORS
// ═══════════════════════════════════════════════════════════════

/**
 * Generate triage department selection message (4 options) - uses dynamic template
 */
export function generateDepartmentSelectionMessage(templates?: Map<string, MessageTemplate>): string {
  const fallback = `Entendido! Que bom que você já conta com nosso desconto na sua fatura de energia. 💚

Para te direcionar melhor, me diz: você quer falar sobre:

*1.* Questão financeira (boletos, pagamentos)
*2.* Acompanhamento do meu contrato (liberação, homologação)
*3.* Dúvidas sobre minha fatura de energia (descontos, créditos)
*4.* Outras questões

_Responda com o número da opção!_`;

  return getRenderedTemplate('triage', 'department_selection', {}, templates, fallback);
}

/**
 * Generate return-to-commercial message with context - uses dynamic templates
 */
export function generateReturnToCommercialMessage(
  originalMessage: string,
  clienteNome: string | null,
  agentConfig?: { name?: string; role?: string } | null,
  templates?: Map<string, MessageTemplate>
): string {
  const agentName = agentConfig?.name || 'sofIA';
  const agentRole = agentConfig?.role || 'vendas';
  const roleLabel = agentRole === 'vendas' ? 'do comercial' : agentRole === 'sac' ? 'do atendimento' : agentRole === 'collections' ? 'do financeiro' : 'da equipe';
  
  const nome = clienteNome || '';
  const greeting = nome ? `Ótimo, ${nome}!` : 'Ótimo!';
  
  // Get context based on original message - from templates with fallback
  let context = '';
  const lower = originalMessage.toLowerCase();
  
  if (lower.includes('proposta') || lower.includes('simulação') || lower.includes('simulacao')) {
    context = getRenderedTemplate('triage', 'context_proposta', {}, templates, 
      'Vou te mostrar como funciona nosso desconto na conta de luz e preparar uma simulação personalizada pra você!');
  } else if (lower.includes('como funciona') || lower.includes('me explica')) {
    context = getRenderedTemplate('triage', 'context_explicacao', {}, templates,
      'Vou te explicar direitinho como funciona a economia na sua conta de energia!');
  } else if (lower.includes('desconto') || lower.includes('economia')) {
    context = getRenderedTemplate('triage', 'context_desconto', {}, templates,
      'Vou te mostrar quanto você pode economizar na sua conta de luz!');
  } else {
    context = getRenderedTemplate('triage', 'context_default', {}, templates,
      'Vou te mostrar como funciona nosso desconto garantido na conta de energia!');
  }
  
  // Get main template with variables
  const fallback = `${greeting} Então sou eu mesma a responsável pelo seu atendimento. 😊

Prazer, me chamo *${agentName}*, ${roleLabel} aqui na COESA Energia Inteligente.

${context}

Me conta, você já teve alguma experiência com energia solar por assinatura ou essa é a primeira vez que ouve falar?`;

  return getRenderedTemplate('triage', 'return_commercial_base', { greeting, agentName, roleLabel, context }, templates, fallback);
}

/**
 * Generate redirect message to marIA with WhatsApp link - uses dynamic template
 */
export function generateRedirectToMariaMessage(
  department: TriagemDepartment,
  contactPhone: string,
  contactName: string,
  templates?: Map<string, MessageTemplate>
): string {
  const departmentName = getDepartmentDisplayName(department);
  const waLink = formatWhatsAppLink(contactPhone);
  
  const fallback = `Entendi! Vou te direcionar para nossa equipe de ${departmentName} que vai poder te ajudar melhor com isso. 💚

👉 Clica aqui para falar com ${contactName}: ${waLink}

É só enviar uma mensagem por lá que vão te atender rapidinho!`;

  return getRenderedTemplate('triage', 'redirect_to_department', { departmentName, contactName, waLink }, templates, fallback);
}
