/**
 * Billing Education Module
 * Handles financial education questions about energy bill components
 * Now uses database patterns via detection-patterns.ts
 */

import { 
  loadDetectionPatterns, 
  matchesPatternCategory, 
  getPatternResponse,
  type PatternEntry 
} from './detection-patterns.ts';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type BillingCategory = 'cip' | 'disponibilidade' | 'descontoBase' | 'comparativo' | 'bandeiras' | 'paymentClarification';

export interface BillingEducationDetection {
  detected: boolean;
  category: BillingCategory | null;
  matchedPattern: string | null;
}

// ═══════════════════════════════════════════════════════════════
// PAYMENT CLARIFICATION PATTERNS (Fallback hardcoded patterns)
// Used when DB patterns are not available
// ═══════════════════════════════════════════════════════════════

const PAYMENT_CLARIFICATION_PATTERNS = [
  /n[aã]o\s+entendi.*(?:valor|pagar|pagamento)/i,
  /qual\s+(?:o\s+)?valor.*pagar/i,
  /quanto\s+(?:eu\s+)?(?:vou\s+)?pagar/i,
  /como\s+(?:funciona\s+)?(?:o\s+)?pagamento/i,
  /o\s+que\s+(?:eu\s+)?pago/i,
  /dois\s+boletos/i,
  /pago\s+(?:pra|para)\s+(?:cemig|cpfl|enel|light|coelba|celpe|energisa|concession)/i,
  /valor\s+(?:da\s+)?coesa/i,
  /boleto\s+(?:da\s+)?coesa/i,
  /o\s+que\s+(?:vou|devo)\s+(?:pagar|desembolsar)/i,
  /entender\s+(?:o\s+)?(?:valor|pagamento)/i,
  /explica\s+(?:o\s+)?pagamento/i,
  /como\s+(?:vai\s+)?ficar\s+(?:o\s+)?pagamento/i,
  /(?:pago|pagar)\s+(?:quanto|qual)/i,

  // "Esse valor tem algum custo?" / "Tem custo?" (caso real recorrente)
  /tem\s+algum\s+custo\??/i,
  /tem\s+custo\??/i,
  /qual\s+o\s+custo\??/i,
  /custa\s+alguma\s+coisa\??/i,
  /tem\s+alguma\s+taxa\??/i,
];

// Category mapping from DB to internal types
const BILLING_CATEGORY_MAP: Record<string, BillingCategory> = {
  'billing_education_cip': 'cip',
  'billing_education_disponibilidade': 'disponibilidade',
  'billing_education_desconto_base': 'descontoBase',
  'billing_education_comparativo': 'comparativo',
  'billing_education_bandeiras': 'bandeiras',
  'payment_clarification': 'paymentClarification',
};

const BILLING_DB_CATEGORIES = Object.keys(BILLING_CATEGORY_MAP);

/**
 * Detects if message is a payment clarification question
 * Uses hardcoded patterns as fallback when DB patterns aren't available
 */
export function detectPaymentClarification(message: string): boolean {
  const normalized = message.toLowerCase().trim();
  return PAYMENT_CLARIFICATION_PATTERNS.some(p => p.test(normalized));
}

/**
 * Checks if message is a general clarification question
 * Used to bypass timeout handlers when client is asking legitimate questions
 */
export function isClarificationQuestion(message: string): boolean {
  const normalized = message.toLowerCase().trim();
  
  // Clarification patterns that should NOT trigger timeout
  const clarificationPatterns = [
    /n[aã]o\s+entendi/i,
    /como\s+(?:assim|funciona)/i,
    /pode\s+(?:explicar|me\s+explicar)/i,
    /o\s+que\s+(?:significa|quer\s+dizer)/i,
    /qual\s+(?:a\s+)?diferen[çc]a/i,
    /me\s+explica/i,
    /entendi\s+n[aã]o/i,
    /(?:ainda|continuo)\s+(?:com\s+)?d[úu]vida/i,
  ];
  
  return clarificationPatterns.some(p => p.test(normalized)) || detectPaymentClarification(normalized);
}

/**
 * Detects if message is a billing education question
 * Uses patterns from database via detection-patterns.ts
 */
export function detectBillingEducationQuestion(
  message: string,
  patterns?: Map<string, PatternEntry>
): BillingEducationDetection {
  for (const dbCategory of BILLING_DB_CATEGORIES) {
    if (matchesPatternCategory(message, dbCategory, patterns)) {
      return {
        detected: true,
        category: BILLING_CATEGORY_MAP[dbCategory],
        matchedPattern: dbCategory,
      };
    }
  }
  return { detected: false, category: null, matchedPattern: null };
}

/**
 * Async version that loads patterns if not provided
 */
export async function detectBillingEducationQuestionAsync(
  message: string,
  supabaseClient: any
): Promise<BillingEducationDetection> {
  const patterns = await loadDetectionPatterns(supabaseClient);
  return detectBillingEducationQuestion(message, patterns);
}

/**
 * Generates educational response about bill components
 */
import { getRenderedTemplate, getTemplateCache } from './message-templates.ts';

// Template key mapping
const BILLING_TEMPLATE_MAP: Record<BillingCategory, string> = {
  'cip': 'cip_explanation',
  'disponibilidade': 'disponibilidade_explanation',
  'descontoBase': 'desconto_base_explanation',
  'comparativo': 'comparativo_explanation',
  'bandeiras': 'bandeiras_explanation',
  'paymentClarification': 'payment_explanation', // Handled separately by generatePaymentExplanation
};

// ═══════════════════════════════════════════════════════════════
// DYNAMIC CONFIG LOADING
// ═══════════════════════════════════════════════════════════════

interface DisponibilidadeConfig {
  monofasico: string;
  bifasico: string;
  trifasico: string;
}

let disponibilidadeCache: { data: DisponibilidadeConfig | null; timestamp: number } = { data: null, timestamp: 0 };
const DISP_CACHE_TTL_MS = 5 * 60 * 1000;

const DEFAULT_DISPONIBILIDADE: DisponibilidadeConfig = {
  monofasico: '30 kWh',
  bifasico: '50 kWh',
  trifasico: '100 kWh',
};

/**
 * Load disponibilidade config from database
 */
export async function loadDisponibilidadeConfig(supabaseClient: any): Promise<DisponibilidadeConfig> {
  const now = Date.now();
  if (disponibilidadeCache.data && (now - disponibilidadeCache.timestamp) < DISP_CACHE_TTL_MS) {
    return disponibilidadeCache.data;
  }
  
  try {
    const { data, error } = await supabaseClient
      .from('configuracoes_sistema')
      .select('chave, valor')
      .in('chave', ['disponibilidade_monofasico_kwh', 'disponibilidade_bifasico_kwh', 'disponibilidade_trifasico_kwh']);
    
    if (error) {
      return DEFAULT_DISPONIBILIDADE;
    }
    
    const configMap: Record<string, string> = {};
    for (const row of data || []) {
      configMap[row.chave] = row.valor;
    }
    
    const config: DisponibilidadeConfig = {
      monofasico: configMap.disponibilidade_monofasico_kwh ? `${configMap.disponibilidade_monofasico_kwh} kWh` : DEFAULT_DISPONIBILIDADE.monofasico,
      bifasico: configMap.disponibilidade_bifasico_kwh ? `${configMap.disponibilidade_bifasico_kwh} kWh` : DEFAULT_DISPONIBILIDADE.bifasico,
      trifasico: configMap.disponibilidade_trifasico_kwh ? `${configMap.disponibilidade_trifasico_kwh} kWh` : DEFAULT_DISPONIBILIDADE.trifasico,
    };
    
    disponibilidadeCache = { data: config, timestamp: now };
    return config;
  } catch {
    return DEFAULT_DISPONIBILIDADE;
  }
}

export function getDisponibilidadeConfig(): DisponibilidadeConfig {
  return disponibilidadeCache.data || DEFAULT_DISPONIBILIDADE;
}

/**
 * Get taxa minima by installation type - from database config
 */
function getTaxaMinima(tipoInstalacao: string | null): string {
  const config = getDisponibilidadeConfig();
  if (!tipoInstalacao) return `${config.monofasico.replace(' kWh', '')}-${config.trifasico}`;
  const tipo = tipoInstalacao.toLowerCase();
  if (tipo.includes('mono')) return config.monofasico;
  if (tipo.includes('bi')) return config.bifasico;
  return config.trifasico;
}

/**
 * Generates educational response about bill components
 * Uses templates from database
 */
export function generateBillingEducationResponse(
  category: BillingCategory,
  clienteNome: string | null,
  descontoPercentual: number | null,
  tipoInstalacao: string | null,
  extraData?: {
    distribuidora?: string;
    valorConta?: number;
    consumo?: number;
  }
): string {
  const nome = clienteNome?.split(' ')[0] || '';
  const greeting = nome ? `${nome}, ` : '';
  const desconto = descontoPercentual || 25;
  
  // Handle payment clarification with dynamic data
  if (category === 'paymentClarification') {
    return generatePaymentExplanation(
      nome,
      extraData?.distribuidora || 'concessionária',
      desconto,
      tipoInstalacao,
      extraData?.valorConta,
      extraData?.consumo
    );
  }
  
  const templateKey = BILLING_TEMPLATE_MAP[category];
  
  if (templateKey) {
    // Calculate dynamic values
    const economiaExemplo = Math.round((450 * desconto) / 100);
    const economiaBandeira = Math.round(50 * (100 - desconto) / 100);
    
    const rendered = getRenderedTemplate('billing_education', templateKey, {
      greeting,
      nome,
      desconto: desconto.toString(),
      tipo_instalacao: tipoInstalacao || 'sua instalação',
      taxa_minima: getTaxaMinima(tipoInstalacao),
      economia_exemplo: economiaExemplo.toString(),
      economia_bandeira: economiaBandeira.toString(),
    });
    
    if (rendered && !rendered.includes('{')) {
      return rendered;
    }
  }
  
  // Fallback to default
  return getRenderedTemplate('billing_education', 'billing_default', { greeting });
}

// ═══════════════════════════════════════════════════════════════
// PAYMENT EXPLANATION GENERATOR
// ═══════════════════════════════════════════════════════════════

/**
 * Generates structured payment explanation for clients
 * Explains the two-bill model (Concessionária + COESA)
 */
export function generatePaymentExplanation(
  nome: string,
  distribuidora: string,
  descontoPercentual: number,
  tipoInstalacao: string | null,
  valorConta?: number,
  consumo?: number
): string {
  const greeting = nome ? `${nome}, ` : '';
  const disponibilidadeConfig = getDisponibilidadeConfig();
  
  let disponibilidadeKwh = 100;
  let disponibilidadeLabel = 'trifásica';
  if (tipoInstalacao?.toLowerCase().includes('mono')) {
    disponibilidadeKwh = parseInt(disponibilidadeConfig.monofasico) || 30;
    disponibilidadeLabel = 'monofásica';
  } else if (tipoInstalacao?.toLowerCase().includes('bi')) {
    disponibilidadeKwh = parseInt(disponibilidadeConfig.bifasico) || 50;
    disponibilidadeLabel = 'bifásica';
  } else {
    disponibilidadeKwh = parseInt(disponibilidadeConfig.trifasico) || 100;
  }
  
  const disponibilidadeEstimate = Math.round(disponibilidadeKwh * 1);
  
  let exemploNumerico = '';
  if (valorConta && valorConta > 0) {
    const economiaMensal = Math.round(valorConta * descontoPercentual / 100);
    const taxasFixas = 50 + disponibilidadeEstimate;
    const valorCoesa = Math.round((valorConta - economiaMensal) - taxasFixas);
    
    exemploNumerico = `\n\nNo seu caso: conta de *R$ ${valorConta}* com *${descontoPercentual}%* de desconto = *R$ ${economiaMensal}*/mês de economia. Você pagaria ~*R$ ${Math.max(0, taxasFixas)}* pra ${distribuidora} (taxas) e ~*R$ ${Math.max(0, valorCoesa)}* pra COESA.`;
  }

  return `${greeting}vou te explicar como funciona o pagamento.

Você recebe dois boletos: um da ${distribuidora} (taxas fixas como CIP e disponibilidade ${disponibilidadeLabel}, ~*R$ ${50 + disponibilidadeEstimate}*) e outro da COESA (seu consumo com *${descontoPercentual}%* de desconto).

O valor total dos dois boletos será menor do que você paga hoje, porque o consumo vem com desconto garantido.${exemploNumerico}

Ficou claro? Se quiser, posso detalhar algum ponto!`;
}

/**
 * Checks if message is confirming economy calculation
 * Uses patterns from database
 */
export function isEconomyConfirmation(
  message: string,
  patterns?: Map<string, PatternEntry>
): boolean {
  return matchesPatternCategory(message, 'economy_confirmation', patterns);
}

/**
 * Async version that loads patterns if not provided
 */
export async function isEconomyConfirmationAsync(
  message: string,
  supabaseClient: any
): Promise<boolean> {
  const patterns = await loadDetectionPatterns(supabaseClient);
  return isEconomyConfirmation(message, patterns);
}
