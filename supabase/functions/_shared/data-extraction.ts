/**
 * Data Extraction Module
 * Centralized text extraction, pattern detection, and data parsing for client data
 * 
 * Phase 12: Zero Hardcode - All patterns now loaded from database
 * 
 * @module _shared/data-extraction
 */

import {
  isValidCPF,
  isValidCNPJ,
  detectMalformedEmail,
} from './validation-utils.ts';
import { getPatternCache, matchesPatternCategory, type PatternEntry } from './detection-patterns.ts';
import { getDistribuidoraCache, findDistribuidoraFromCache, type DistribuidoraCache } from './distribuidora-handler.ts';

// ═══════════════════════════════════════════════════════════════
// FALLBACK PATTERNS - Used when database cache is unavailable
// ═══════════════════════════════════════════════════════════════
const FALLBACK_BILL_VALUE_DECIMAL = /(\d+),(\d{2})(?!\d)/i;
const FALLBACK_BILL_VALUE_PLAIN = /\b(\d{3,5})\b/;
const FALLBACK_BILL_VALUE_RS = /r\$\s*(\d+(?:[.,]\d{3})*(?:[.,]\d{2})?)/i;
// NEW: Pattern for isolated numeric value like "250,00" or "250" alone
// This specifically matches messages that are ONLY a number (no other text)
const FALLBACK_ISOLATED_VALUE = /^\s*(\d{2,5})(?:[,.](\d{1,2}))?\s*$/;

// ═══════════════════════════════════════════════════════════════
// LOWER BOUND VALUE PATTERNS (Phase "Caso Edson")
// Matches: "acima de 600", "mais de 500", "> 400", "passa de 300"
// These are treated as VALID values (not ambiguous)
// ═══════════════════════════════════════════════════════════════
const LOWER_BOUND_PATTERNS = [
  /(?:acima\s+de|mais\s+de|maior\s+que|passa\s+de|supera|ultrapassa|excede)\s*(?:r\$\s*)?(\d+(?:[.,]\d{1,2})?)/i,
  /(?:>\s*|>=\s*)(?:r\$\s*)?(\d+(?:[.,]\d{1,2})?)/i,
  /(?:r\$\s*)?(\d+(?:[.,]\d{1,2})?)\s+(?:ou\s+mais|pra\s+cima|para\s+cima)/i,
];

interface LowerBoundResult {
  value: number;
  originalText: string;
  isLowerBound: true;
}

/**
 * Extract lower bound value from "acima de X" / "mais de X" patterns
 * Returns the value and marks it as a lower bound for audit
 */
function extractLowerBoundValue(
  message: string,
  limits: ExtractionLimitsConfig
): LowerBoundResult | null {
  for (const pattern of LOWER_BOUND_PATTERNS) {
    const match = message.match(pattern);
    if (match && match[1]) {
      const valueStr = match[1].replace('.', '').replace(',', '.');
      const value = parseFloat(valueStr);
      
      if (value >= limits.billValueMin && value <= limits.billValueMax) {
        return {
          value,
          originalText: match[0].trim(),
          isLowerBound: true,
        };
      }
    }
  }
  return null;
}

/**
 * Check if a value extraction is a lower bound
 * Used by extractDataFromText to set the flag in dados_coletados
 */
export function checkForLowerBoundValue(message: string): LowerBoundResult | null {
  const limits = getExtractionLimits();
  return extractLowerBoundValue(message, limits);
}

// ═══════════════════════════════════════════════════════════════
// EXTRACTION LIMITS CONFIG - Zero Hardcode
// ═══════════════════════════════════════════════════════════════

interface ExtractionLimitsConfig {
  billValueMin: number;
  billValueMax: number;
  consumptionMin: number;
  consumptionMax: number;
}

const FALLBACK_EXTRACTION_LIMITS: ExtractionLimitsConfig = {
  billValueMin: 50,
  billValueMax: 50000,
  consumptionMin: 50,
  consumptionMax: 100000,
};

let extractionLimitsCache: { data: ExtractionLimitsConfig | null; timestamp: number } = { data: null, timestamp: 0 };
const EXTRACTION_LIMITS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Load extraction limits from database
 */
export async function loadExtractionLimitsConfig(supabaseClient: any): Promise<ExtractionLimitsConfig> {
  const now = Date.now();
  if (extractionLimitsCache.data && (now - extractionLimitsCache.timestamp) < EXTRACTION_LIMITS_CACHE_TTL_MS) {
    return extractionLimitsCache.data;
  }
  
  try {
    const { data, error } = await supabaseClient
      .from('configuracoes_sistema')
      .select('chave, valor')
      .in('chave', [
        'extraction_bill_value_min',
        'extraction_bill_value_max',
        'extraction_consumption_min',
        'extraction_consumption_max',
      ]);
    
    if (error) {
      return FALLBACK_EXTRACTION_LIMITS;
    }
    
    const configMap: Record<string, string> = {};
    for (const row of data || []) {
      configMap[row.chave] = row.valor;
    }
    
    const config: ExtractionLimitsConfig = {
      billValueMin: parseInt(configMap.extraction_bill_value_min || '50', 10),
      billValueMax: parseInt(configMap.extraction_bill_value_max || '50000', 10),
      consumptionMin: parseInt(configMap.extraction_consumption_min || '50', 10),
      consumptionMax: parseInt(configMap.extraction_consumption_max || '100000', 10),
    };
    
    extractionLimitsCache = { data: config, timestamp: now };
    console.log('[data-extraction] Loaded extraction limits from database');
    return config;
  } catch {
    return FALLBACK_EXTRACTION_LIMITS;
  }
}

/**
 * Get cached extraction limits (sync) - returns fallback if not loaded
 */
export function getExtractionLimits(): ExtractionLimitsConfig {
  return extractionLimitsCache.data || FALLBACK_EXTRACTION_LIMITS;
}

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface ExtractedClientData {
  nome?: string;
  cpf?: string;
  cnpj?: string;
  email?: string;
  telefone?: string;
  endereco?: string;
  cidade?: string;
  uf?: string;
  cep?: string;
  consumo?: number;
  valorFatura?: number;
  distribuidora?: string;
  numeroInstalacao?: string;
  tipoCliente?: 'PF' | 'PJ';
  rawAnalysis?: string;
  tipoInstalacao?: 'Monofásico' | 'Bifásico' | 'Trifásico';
  cpfInvalido?: string;
  cnpjInvalido?: string;
  descontoMaximoOfertado?: boolean;
  masterOfertaAt?: string;
  masterOfertaExpiraEm?: string;
  masterOfertaAceita?: boolean;
  distribuidoraInformada?: string;
  distribuidoraNaoAtendida?: boolean;
  distribuidoraClarificacao?: boolean;
  distribuidoraTypoDetectado?: string;
  distribuidoraTypoSugerida?: string;
  aguardandoConfirmacaoTypo?: boolean;
  valorPendente?: PendingValueConfirmation;
  aguardandoTipoInstalacao?: boolean;
  emailPendente?: PendingEmailConfirmation;
  motivoDescarte?: 'distribuidora_nao_atendida' | 'grupo_a' | 'tarifa_social' | 'outro';
  isGrupoA?: boolean;
  tarifaSocial?: boolean;
  // NEW: CIP and Rural area detection
  cipZero?: boolean;           // True if client explicitly stated no CIP/public lighting
  isAreaRural?: boolean;       // True if client is in rural area
  consumoFuturoMencionado?: boolean;  // True if client mentioned future consumption plans
  consumoFuturoDetalhes?: string;     // Description of future installations mentioned
  pauseFollowupRequested?: boolean;   // True if client asked for time/pause
  // NEW: Multiple bills/units support (Phase 120)
  isMultipleUnits?: boolean;         // True if client mentioned having more than one bill
  quantidadeUnidades?: number;        // Number of units mentioned (ex: 3)
  valoresIndividuais?: number[];      // Array with individual values [150, 150, 400]
  valorTotalEstimado?: number;        // Sum of all values: 700
  contextoCorporativo?: string;       // "condomínio", "empresa", "lojas", etc.
  // NEW: Lower bound value support (Phase "Caso Edson")
  // When client says "acima de 600", we accept 600 as minimum and set this flag
  valorLowerBound?: boolean;          // True if value came from "acima de X" / "mais de X"
  valorOriginalTexto?: string;        // Original text for audit: "acima de 600 reais"
}

export interface PendingValueConfirmation {
  valor: number;
  textoOriginal: string;
  tipoAmbiguidade: AmbiguityType;
  aguardandoConfirmacao: boolean;
}

export interface PendingEmailConfirmation {
  email: string;
  textoOriginal: string;
  aguardandoConfirmacao: boolean;
}

export type AmbiguityType = 'faixa' | 'aproximado' | 'coloquial' | 'incerto' | null;

export interface AmbiguousValueResult {
  isAmbiguous: boolean;
  extractedValue: number | null;
  originalText: string;
  ambiguityType: AmbiguityType;
  confirmationMessage: string | null;
}

export interface LearnedTypo {
  typo: string;
  normalized: string;
  count: number;
}

// ═══════════════════════════════════════════════════════════════
// DYNAMIC PATTERN HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Get confirmation words from database cache
 */
function getConfirmationWords(): string[] {
  const cache = getPatternCache();
  if (!cache) {
    // Fallback to minimal set
    return ['ok', 'sim', 'pode', 'certo', 'correto', 'beleza', 'perfeito', 'confirmo'];
  }
  
  const pattern = cache.patterns.get('value_confirmation');
  if (!pattern) {
    return ['ok', 'sim', 'pode', 'certo', 'correto', 'beleza', 'perfeito', 'confirmo'];
  }
  
  return pattern.keywords || [];
}

/**
 * Get patterns by category from cache
 */
function getPatternsForCategory(category: string): PatternEntry | null {
  const cache = getPatternCache();
  return cache?.patterns.get(category) || null;
}

/**
 * Get response template for a category
 */
function getResponseTemplate(category: string): string | null {
  const cache = getPatternCache();
  return cache?.responses.get(category) || null;
}

/**
 * Check if message matches any regex in category
 */
function matchesCategoryRegex(message: string, category: string): RegExpMatchArray | null {
  const pattern = getPatternsForCategory(category);
  if (!pattern?.regexPatterns) return null;
  
  const lowerMessage = message.toLowerCase();
  for (const regex of pattern.regexPatterns) {
    const match = lowerMessage.match(regex);
    if (match) return match;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// AMBIGUOUS VALUE DETECTION
// ═══════════════════════════════════════════════════════════════

/**
 * Detects if a bill value response is ambiguous and needs confirmation
 * Phase 12: Now uses dynamic patterns from database
 */
export function detectAmbiguousValue(message: string): AmbiguousValueResult {
  const lowerMessage = message.toLowerCase().trim();
  const originalText = message.trim();
  
  // Check for PRECISE values using dynamic patterns
  const precisePattern = getPatternsForCategory('value_precise');
  if (precisePattern?.regexPatterns) {
    for (const regex of precisePattern.regexPatterns) {
      if (regex.test(lowerMessage)) {
        return {
          isAmbiguous: false,
          extractedValue: null,
          originalText,
          ambiguityType: null,
          confirmationMessage: null,
        };
      }
    }
  }
  
  // Check for RANGE values
  const rangeMatch = matchesCategoryRegex(message, 'value_range');
  const limits = getExtractionLimits();
  
  if (rangeMatch && rangeMatch[1] && rangeMatch[2]) {
    const valor1 = parseInt(rangeMatch[1]);
    const valor2 = parseInt(rangeMatch[2]);
    const valorMedio = Math.round((valor1 + valor2) / 2);
    
    if (valorMedio >= limits.billValueMin && valorMedio <= limits.billValueMax) {
      const template = getResponseTemplate('value_range') || 
        `Entendi, algo entre R$ ${valor1} e R$ ${valor2}. Vou simular com *R$ ${valorMedio}*, ok pra você?`;
      
      return {
        isAmbiguous: true,
        extractedValue: valorMedio,
        originalText,
        ambiguityType: 'faixa',
        confirmationMessage: template
          .replace('{valor1}', valor1.toString())
          .replace('{valor2}', valor2.toString())
          .replace('{valorMedio}', valorMedio.toString()),
      };
    }
  }
  
  // Check for APPROXIMATE values
  const approxMatch = matchesCategoryRegex(message, 'value_approximate');
  if (approxMatch && approxMatch[1]) {
    const valor = parseInt(approxMatch[1]);
    if (valor >= limits.billValueMin && valor <= limits.billValueMax) {
      const template = getResponseTemplate('value_approximate') || 
        `Entendi, por volta de *R$ ${valor}*. Posso usar esse valor?`;
      
      return {
        isAmbiguous: true,
        extractedValue: valor,
        originalText,
        ambiguityType: 'aproximado',
        confirmationMessage: template.replace('{valor}', valor.toString()),
      };
    }
  }
  
  // Check for COLLOQUIAL values
  const coloquialMatch = matchesCategoryRegex(message, 'value_colloquial');
  if (coloquialMatch && coloquialMatch[1]) {
    const valor = parseInt(coloquialMatch[1]);
    if (valor >= limits.billValueMin && valor <= limits.billValueMax) {
      const template = getResponseTemplate('value_colloquial') || 
        `Beleza, *R$ ${valor}*! Vou usar esse valor, ok?`;
      
      return {
        isAmbiguous: true,
        extractedValue: valor,
        originalText,
        ambiguityType: 'coloquial',
        confirmationMessage: template.replace('{valor}', valor.toString()),
      };
    }
  }
  
  // Check for UNCERTAIN values
  const uncertainMatch = matchesCategoryRegex(message, 'value_uncertain');
  if (uncertainMatch && uncertainMatch[1]) {
    const valor = parseInt(uncertainMatch[1]);
    if (valor >= limits.billValueMin && valor <= limits.billValueMax) {
      const template = getResponseTemplate('value_uncertain') || 
        `*R$ ${valor}*, certo? Confirma pra eu seguir?`;
      
      return {
        isAmbiguous: true,
        extractedValue: valor,
        originalText,
        ambiguityType: 'incerto',
        confirmationMessage: template.replace('{valor}', valor.toString()),
      };
    }
  }
  
  return {
    isAmbiguous: false,
    extractedValue: null,
    originalText,
    ambiguityType: null,
    confirmationMessage: null,
  };
}

/**
 * Checks if user confirmed or corrected a pending value
 * Phase 12: Now uses dynamic patterns from database
 */
export function checkValueConfirmation(message: string, pendingValue: number): { 
  status: 'confirmed' | 'corrected' | 'unclear';
  newValue?: number;
} {
  const lowerMessage = message.toLowerCase().trim();
  
  // Get confirmation words from DB
  const confirmWords = getConfirmationWords();
  
  if (confirmWords.some(w => lowerMessage === w || lowerMessage.includes(w))) {
    return { status: 'confirmed' };
  }
  
  // Check for corrections using dynamic patterns and limits
  const limits = getExtractionLimits();
  const correctionPattern = getPatternsForCategory('value_correction');
  if (correctionPattern?.regexPatterns) {
    for (const regex of correctionPattern.regexPatterns) {
      const match = lowerMessage.match(regex);
      if (match && match[1]) {
        const newValue = parseInt(match[1]);
        if (newValue >= limits.billValueMin && newValue <= limits.billValueMax && newValue !== pendingValue) {
          return { status: 'corrected', newValue };
        }
      }
    }
  }
  
  if (lowerMessage.includes(pendingValue.toString())) {
    return { status: 'confirmed' };
  }
  
  return { status: 'unclear' };
}

// ═══════════════════════════════════════════════════════════════
// MULTIPLE BILL VALUES EXTRACTION (Phase 120)
// ═══════════════════════════════════════════════════════════════

export interface MultipleBillResult {
  values: number[];
  totalValue: number;
  isMultiple: boolean;
  quantityMentioned: number | null;
  corporateContext: string | null;
}

/**
 * Extract ALL bill values from message - supports multiple accounts
 * Phase 120: Handles cases like "tenho 3 contas, duas de 150 e uma de 400"
 */
export function extractMultipleBillValues(message: string): MultipleBillResult {
  const limits = getExtractionLimits();
  
  // ═══════════════════════════════════════════════════════════════
  // GUARD: Detect VALUE RANGE patterns BEFORE treating as multiple bills
  // "varia de 550 a 570" should return average 560, NOT sum 1120
  // ═══════════════════════════════════════════════════════════════
  const rangePatterns = [
    /varia\s+(?:de\s+)?(\d+[.,]?\d*)\s*(?:a|à|até|ate)\s*(\d+[.,]?\d*)/i,
    /entre\s+(\d+[.,]?\d*)\s*(?:e|a|à)\s*(\d+[.,]?\d*)/i,
    /(?:de\s+)(\d+[.,]?\d*)\s*(?:a|à)\s*(\d+[.,]?\d*)\s*(?:mensal|por\s*m[eê]s|reais|real)/i,
    /(\d+[.,]?\d*)\s*(?:a|à)\s*(\d+[.,]?\d*)\s*(?:mensal|por\s*m[eê]s)/i,
  ];

  for (const pattern of rangePatterns) {
    const match = message.match(pattern);
    if (match) {
      const v1 = parseFloat(match[1].replace(',', '.'));
      const v2 = parseFloat(match[2].replace(',', '.'));
      if (v1 >= limits.billValueMin && v2 >= limits.billValueMin && v1 <= limits.billValueMax && v2 <= limits.billValueMax) {
        const average = Math.round((v1 + v2) / 2);
        console.log(`[extractMultipleBillValues] 🎯 RANGE DETECTED: "${match[0]}" → average R$ ${average} (from ${v1} and ${v2})`);
        return {
          values: [average],
          totalValue: average,
          isMultiple: false,
          quantityMentioned: null,
          corporateContext: null,
        };
      }
    }
  }

  const values: number[] = [];
  const lowerMessage = message.toLowerCase();
  
  // Patterns to detect quantity of accounts
  const quantityPatterns = [
    /(\d+)\s*contas?\s*(?:de\s*(?:luz|energia))?/i,
    /(?:tenho|são|sao|possuo|temos)\s*(\d+)\s*(?:contas?|faturas?|unidades?)/i,
    /(?:tr[êe]s|3)\s*contas?/i,
    /(?:duas|2)\s*contas?/i,
    /(?:quatro|4)\s*contas?/i,
    /(?:cinco|5)\s*contas?/i,
  ];
  
  let quantityMentioned: number | null = null;
  for (const pattern of quantityPatterns) {
    const match = message.match(pattern);
    if (match) {
      if (match[1]) {
        quantityMentioned = parseInt(match[1]);
      } else {
        // Map words to numbers
        const wordToNum: Record<string, number> = {
          'duas': 2, 'três': 3, 'tres': 3, 'quatro': 4, 'cinco': 5
        };
        const text = match[0].toLowerCase();
        for (const [word, num] of Object.entries(wordToNum)) {
          if (text.includes(word)) {
            quantityMentioned = num;
            break;
          }
        }
      }
      break;
    }
  }
  
  // Extract ALL numeric values that look like bill amounts
  const allValuePatterns = [
    /r\$\s*(\d+(?:[.,]\d{1,2})?)/gi,                          // R$ 150, R$ 400, R$ 350,00
    /(\d+(?:,\d{2})?)\s*(?:reais?|rs)/gi,                     // 150 reais, 400rs
    /(?:uma?\s+de\s+|outra?\s+de\s+|e\s+uma?\s+de\s+)(\d+)/gi, // "uma de 150", "outra de 400"
    /(?:duas?\s+de\s+|duas?\s+contas?\s+de\s+)(\d+)/gi,       // "duas de 150"
    /(\d{2,5})[,.](\d{2})(?!\d)/g,                            // 150,00 or 400.00
  ];
  
  const seenValues = new Set<number>();
  
  for (const pattern of allValuePatterns) {
    let match;
    const patternCopy = new RegExp(pattern.source, pattern.flags);
    while ((match = patternCopy.exec(message)) !== null) {
      let value: number;
      if (match[2]) {
        // Has decimal part
        value = parseFloat(`${match[1]}.${match[2]}`);
      } else {
        value = parseFloat(match[1].replace('.', '').replace(',', '.'));
      }
      
      if (value >= limits.billValueMin && value <= limits.billValueMax && !seenValues.has(value)) {
        values.push(value);
        seenValues.add(value);
      }
    }
  }
  
  // If mentioned quantity X and we have fewer values, multiply
  // Ex: "duas de 150" → quantityMentioned=2, values=[150] → result=[150, 150]
  if (quantityMentioned && values.length === 1 && quantityMentioned > 1) {
    const baseValue = values[0];
    const repeatedPatterns = [
      /(?:duas?|tr[êe]s|quatro|cinco|\d+)\s*(?:contas?\s+)?de\s+(\d+)/i,
      /(?:todas?\s+de\s+|cada\s+(?:uma?\s+)?(?:de\s+)?)(\d+)/i,
    ];
    
    for (const rp of repeatedPatterns) {
      if (rp.test(message)) {
        // "duas de 150" → repeat the value
        for (let i = 1; i < quantityMentioned; i++) {
          values.push(baseValue);
        }
        break;
      }
    }
  }
  
  // Detect corporate context
  const corporatePatterns = [
    { pattern: /cond[oó]m[íi]nio/i, context: 'condomínio' },
    { pattern: /s[íi]ndico/i, context: 'condomínio' },
    { pattern: /(?:v[áa]rias?\s+)?lojas?/i, context: 'lojas' },
    { pattern: /empresa/i, context: 'empresa' },
    { pattern: /unidades?/i, context: 'unidades' },
    { pattern: /filiais?/i, context: 'filiais' },
    { pattern: /apartamentos?/i, context: 'apartamentos' },
    { pattern: /casas?(?:\s+e\s+|\s+ou\s+)/i, context: 'casas' },
  ];
  
  let corporateContext: string | null = null;
  for (const { pattern, context } of corporatePatterns) {
    if (pattern.test(message)) {
      corporateContext = context;
      break;
    }
  }
  
  const totalValue = values.reduce((sum, v) => sum + v, 0);
  
  return {
    values,
    totalValue,
    isMultiple: values.length > 1 || (quantityMentioned !== null && quantityMentioned > 1),
    quantityMentioned,
    corporateContext,
  };
}

// ═══════════════════════════════════════════════════════════════
// BILL VALUE EXTRACTION (Single)
// ═══════════════════════════════════════════════════════════════

/**
 * Extract bill value from message text
 * Phase 12: Now uses dynamic patterns from database with fallbacks
 * Zero Hardcode: Uses extraction limits from database
 * 
 * CRITICAL FIX (2026-02-03): Added upfront fallback to ensure extraction
 * works even when pattern cache is empty or patterns fail to match.
 */
export function extractBillValue(message: string): number | null {
  const lowerMessage = message.toLowerCase().trim();
  const limits = getExtractionLimits();
  let extractedValue: number | null = null;
  
  // ═══════════════════════════════════════════════════════════════
  // PHASE "CASO EDSON": Handle "acima de X" / "mais de X" as valid value
  // These patterns should be treated as USABLE values (not ambiguous)
  // The lower bound is sufficient to proceed without asking for "exact value"
  // ═══════════════════════════════════════════════════════════════
  const lowerBoundResult = extractLowerBoundValue(message, limits);
  if (lowerBoundResult) {
    console.log(`[extractBillValue] [VALUE_LOWER_BOUND] ✅ Extracted lower bound: R$ ${lowerBoundResult.value} from "${lowerBoundResult.originalText}"`);
    return lowerBoundResult.value;
  }
  
  // ═══════════════════════════════════════════════════════════════
  // PRIORITY -1: Check for ISOLATED NUMERIC VALUE (message is just a number)
  // This catches cases like "250,00" or "250" sent alone as a response
  // Critical for when client sends distributor and value in separate messages
  // ═══════════════════════════════════════════════════════════════
  const isolatedMatch = message.trim().match(FALLBACK_ISOLATED_VALUE);
  if (isolatedMatch && isolatedMatch[1]) {
    const intPart = parseInt(isolatedMatch[1]);
    const decPart = isolatedMatch[2] ? parseFloat(`0.${isolatedMatch[2]}`) : 0;
    const isolatedValue = intPart + decPart;
    
    if (isolatedValue >= limits.billValueMin && isolatedValue <= limits.billValueMax) {
      console.log(`[extractBillValue] ✅ ISOLATED NUMERIC VALUE detected: R$ ${isolatedValue} from "${message}"`);
      return isolatedValue;
    }
  }
  
  // ═══════════════════════════════════════════════════════════════
  // UPFRONT FALLBACK: Try simple patterns first to avoid cache issues
  // This ensures "350,00" always works regardless of pattern cache state
  // ═══════════════════════════════════════════════════════════════
  
  // Try decimal format first: 350,00 or 1500,50
  const decimalFallback = message.match(FALLBACK_BILL_VALUE_DECIMAL);
  if (decimalFallback && decimalFallback[1] && decimalFallback[2]) {
    const value = parseFloat(`${decimalFallback[1]}.${decimalFallback[2]}`);
    if (value >= limits.billValueMin && value <= limits.billValueMax) {
      console.log(`[extractBillValue] ✅ Extracted via decimal pattern: R$ ${value} from "${message}"`);
      return value;
    }
  }
  
  // Try R$ prefix: R$ 300 or R$ 300,00
  const rsFallback = message.match(FALLBACK_BILL_VALUE_RS);
  if (rsFallback && rsFallback[1]) {
    const value = parseFloat(rsFallback[1].replace(/\./g, '').replace(',', '.'));
    if (value >= limits.billValueMin && value <= limits.billValueMax) {
      console.log(`[extractBillValue] ✅ Extracted via R$ pattern: R$ ${value} from "${message}"`);
      return value;
    }
  }
  
  // Try plain 3-5 digit number: 300 or 1500
  const plainFallback = message.match(FALLBACK_BILL_VALUE_PLAIN);
  if (plainFallback && plainFallback[1]) {
    const value = parseInt(plainFallback[1]);
    if (value >= limits.billValueMin && value <= limits.billValueMax) {
      console.log(`[extractBillValue] ✅ Extracted via plain number pattern: R$ ${value} from "${message}"`);
      return value;
    }
  }
  
  // ═══════════════════════════════════════════════════════════════
  // DYNAMIC PATTERNS: Try database patterns if fallbacks didn't match
  // ═══════════════════════════════════════════════════════════════
  
  // Pattern 0: Natural language (dynamic)
  const naturalMatch = matchesCategoryRegex(message, 'bill_value_natural');
  if (naturalMatch && naturalMatch[1]) {
    const valorInteiro = parseInt(naturalMatch[1]);
    const decimais = naturalMatch[2] ? parseInt(naturalMatch[2]) / 100 : 0;
    if (valorInteiro >= limits.billValueMin && valorInteiro <= limits.billValueMax) {
      extractedValue = valorInteiro + decimais;
      console.log(`[extractBillValue] ✅ Extracted via natural language: R$ ${extractedValue}`);
      return extractedValue;
    }
  }
  
  // Pattern 1: With R$ prefix (dynamic)
  if (!extractedValue) {
    const rsMatch = matchesCategoryRegex(message, 'bill_value_rs');
    if (rsMatch && rsMatch[1]) {
      extractedValue = parseFloat(rsMatch[1].replace(/\./g, '').replace(',', '.'));
      if (extractedValue >= limits.billValueMin && extractedValue <= limits.billValueMax) {
        console.log(`[extractBillValue] ✅ Extracted via dynamic R$: R$ ${extractedValue}`);
        return extractedValue;
      }
      extractedValue = null;
    }
  }
  
  // Pattern 1b: With $ suffix (dynamic)
  if (!extractedValue) {
    const suffixMatch = matchesCategoryRegex(message, 'bill_value_suffix');
    if (suffixMatch && suffixMatch[1]) {
      extractedValue = parseFloat(suffixMatch[1].replace(/\./g, '').replace(',', '.'));
      if (extractedValue >= limits.billValueMin && extractedValue <= limits.billValueMax) {
        console.log(`[extractBillValue] ✅ Extracted via suffix pattern: R$ ${extractedValue}`);
        return extractedValue;
      }
      extractedValue = null;
    }
  }
  
  // Pattern 2: Colloquial formats (mil reais)
  if (!extractedValue) {
    const milMatch = matchesCategoryRegex(message, 'bill_value_mil');
    if (milMatch && milMatch[1]) {
      const milhares = parseInt(milMatch[1]) * 1000;
      const centenas = milMatch[2] ? parseInt(milMatch[2]) : 0;
      extractedValue = milhares + centenas;
      if (extractedValue >= limits.billValueMin && extractedValue <= limits.billValueMax) {
        console.log(`[extractBillValue] ✅ Extracted via mil pattern: R$ ${extractedValue}`);
        return extractedValue;
      }
      extractedValue = null;
    }
  }
  
  // Pattern 3: Just "mil" or "mil reais" (= 1000)
  if (!extractedValue && /\b(?:um\s+)?mil\s*(?:reais?)?\b/i.test(lowerMessage) && !/\d+\s*mil/i.test(lowerMessage)) {
    extractedValue = 1000;
    console.log(`[extractBillValue] ✅ Extracted "mil" keyword: R$ 1000`);
    return extractedValue;
  }
  
  // Pattern 4: Plain number with thousand separator (dynamic)
  if (!extractedValue) {
    const formattedMatch = matchesCategoryRegex(message, 'bill_value_formatted');
    if (formattedMatch && formattedMatch[1]) {
      extractedValue = parseFloat(formattedMatch[1].replace(/\./g, '').replace(',', '.'));
      if (extractedValue >= limits.billValueMin && extractedValue <= limits.billValueMax) {
        console.log(`[extractBillValue] ✅ Extracted via formatted pattern: R$ ${extractedValue}`);
        return extractedValue;
      }
      extractedValue = null;
    }
  }
  
  // Pattern 5: Plain number with comma as decimal (dynamic)
  if (!extractedValue) {
    const decimalMatch = matchesCategoryRegex(message, 'bill_value_decimal');
    if (decimalMatch && decimalMatch[1] && decimalMatch[2]) {
      extractedValue = parseFloat(`${decimalMatch[1]}.${decimalMatch[2]}`);
      if (extractedValue >= limits.billValueMin && extractedValue <= limits.billValueMax) {
        console.log(`[extractBillValue] ✅ Extracted via dynamic decimal: R$ ${extractedValue}`);
        return extractedValue;
      }
      extractedValue = null;
    }
  }
  
  // Pattern 6: Plain number (dynamic)
  if (!extractedValue) {
    const plainMatch = matchesCategoryRegex(message, 'bill_value_plain');
    if (plainMatch && plainMatch[1]) {
      const value = parseInt(plainMatch[1]);
      if (value >= limits.billValueMin && value <= limits.billValueMax) {
        extractedValue = value;
        console.log(`[extractBillValue] ✅ Extracted via dynamic plain: R$ ${extractedValue}`);
        return extractedValue;
      }
    }
  }
  
  // No value extracted - log for debugging
  if (!extractedValue) {
    console.log(`[extractBillValue] ⚠️ No value extracted from: "${message.substring(0, 50)}"`);
  }
  
  return null;
}

// ═══════════════════════════════════════════════════════════════
// CONSUMPTION EXTRACTION
// ═══════════════════════════════════════════════════════════════

/**
 * Extract energy consumption (kWh) from message text
 * Phase 12: Now uses dynamic patterns from database
 * Zero Hardcode: Uses extraction limits from database
 */
export function extractConsumption(message: string): number | null {
  const limits = getExtractionLimits();
  
  // Pattern 1: With kWh suffix (dynamic)
  const kwhMatch = matchesCategoryRegex(message, 'consumption_kwh');
  if (kwhMatch && kwhMatch[1]) {
    const value = parseFloat(kwhMatch[1].replace(',', '.'));
    if (value >= limits.consumptionMin && value <= limits.consumptionMax) {
      return value;
    }
  }
  
  // Pattern 2: With "consumo" prefix (dynamic)
  const prefixMatch = matchesCategoryRegex(message, 'consumption_prefix');
  if (prefixMatch && prefixMatch[1]) {
    const value = parseFloat(prefixMatch[1].replace(',', '.'));
    if (value >= limits.consumptionMin && value <= limits.consumptionMax) {
      return value;
    }
  }
  
  return null;
}

// ═══════════════════════════════════════════════════════════════
// CPF/CNPJ EXTRACTION
// ═══════════════════════════════════════════════════════════════

export interface CPFExtractionResult {
  cpf: string | null;
  cpfInvalido: string | null;
  tipoCliente: 'PF' | null;
}

export interface CNPJExtractionResult {
  cnpj: string | null;
  cnpjInvalido: string | null;
  tipoCliente: 'PJ' | null;
}

/**
 * Extract and validate CPF from text
 */
export function extractCPF(message: string): CPFExtractionResult {
  const cpfMatch = message.match(/\b(\d{3}\.?\d{3}\.?\d{3}[-.]?\d{2})\b/);
  if (cpfMatch) {
    const cleanCpf = cpfMatch[1].replace(/[.\-]/g, '');
    if (isValidCPF(cleanCpf)) {
      return { cpf: cleanCpf, cpfInvalido: null, tipoCliente: 'PF' };
    } else {
      const maskedCpf = `${cleanCpf.substring(0, 3)}.***.***-${cleanCpf.substring(9, 11)}`;
      return { cpf: null, cpfInvalido: maskedCpf, tipoCliente: null };
    }
  }
  return { cpf: null, cpfInvalido: null, tipoCliente: null };
}

/**
 * Extract and validate CNPJ from text
 */
export function extractCNPJ(message: string): CNPJExtractionResult {
  const cnpjMatch = message.match(/\b(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}[-.]?\d{2})\b/);
  if (cnpjMatch) {
    const cleanCnpj = cnpjMatch[1].replace(/[.\/\-]/g, '');
    if (isValidCNPJ(cleanCnpj)) {
      return { cnpj: cleanCnpj, cnpjInvalido: null, tipoCliente: 'PJ' };
    } else {
      const maskedCnpj = `${cleanCnpj.substring(0, 2)}.***.***/${cleanCnpj.substring(8, 12)}-**`;
      return { cnpj: null, cnpjInvalido: maskedCnpj, tipoCliente: null };
    }
  }
  return { cnpj: null, cnpjInvalido: null, tipoCliente: null };
}

// ═══════════════════════════════════════════════════════════════
// NAME EXTRACTION
// ═══════════════════════════════════════════════════════════════

/**
 * Extract client name from text patterns
 * Phase 12: Now uses dynamic patterns from database
 */
export function extractName(message: string): string | null {
  const pattern = getPatternsForCategory('name_extraction');
  const patterns = pattern?.regexPatterns || [
    // Fallback patterns
    /(?:meu nome [eé]|me chamo|sou o|sou a)\s+([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)*)/i,
    /(?:ol[aá]|oi|bom dia|boa tarde|boa noite|e a[ií]|hey)[,.\s!]*\s*([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)?)\s+aqui/i,
    /aqui [eé]\s*(?:o|a)\s+([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)*)/i,
    /^([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)?)\s+aqui\b/i,
    /(?:pode me chamar|me chamam|me chama)\s+(?:de\s+)?([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)*)/i,
  ];
  
  for (const regex of patterns) {
    const match = message.match(regex);
    if (match && match[1] && match[1].trim().length > 2) {
      const extractedName = match[1].trim()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
      return extractedName;
    }
  }
  
  return null;
}

// ═══════════════════════════════════════════════════════════════
// EMAIL EXTRACTION
// ═══════════════════════════════════════════════════════════════

export interface EmailExtractionResult {
  email: string | null;
  emailPendente: PendingEmailConfirmation | null;
}

/**
 * Extract and validate email from text
 */
export function extractEmail(message: string, existingEmail?: string | null): EmailExtractionResult {
  const emailMatch = message.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  if (emailMatch && !existingEmail) {
    return { email: emailMatch[0].toLowerCase(), emailPendente: null };
  }
  
  // Check for malformed email patterns
  if (!existingEmail) {
    const malformedCheck = detectMalformedEmail(message);
    if (malformedCheck.isMalformed && malformedCheck.suggestedEmail) {
      return {
        email: null,
        emailPendente: {
          email: malformedCheck.suggestedEmail,
          textoOriginal: malformedCheck.originalText,
          aguardandoConfirmacao: true,
        },
      };
    }
  }
  
  return { email: null, emailPendente: null };
}

// ═══════════════════════════════════════════════════════════════
// CEP EXTRACTION
// ═══════════════════════════════════════════════════════════════

/**
 * Extract CEP from text
 */
export function extractCEP(message: string): string | null {
  const cepMatch = message.match(/\b(\d{5}[-.]?\d{3})\b/);
  if (cepMatch) {
    return cepMatch[1].replace(/[-.]/, '');
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// INSTALLATION TYPE EXTRACTION
// ═══════════════════════════════════════════════════════════════

/**
 * Extract installation type from text (Monofásico, Bifásico, Trifásico)
 * Enhanced with hardcoded fallback patterns for invoice analysis
 * 
 * Phase 12: Uses dynamic patterns from database with robust fallbacks
 */
export function extractInstallationType(message: string): 'Monofásico' | 'Bifásico' | 'Trifásico' | null {
  const lowerMsg = message.toLowerCase();
  
  // Check Monofásico patterns (dynamic)
  if (matchesCategoryRegex(message, 'installation_type_mono')) {
    console.log(`[extractInstallationType] Detected MONOFÁSICO via dynamic pattern`);
    return 'Monofásico';
  }
  
  // Check Bifásico patterns (dynamic)
  if (matchesCategoryRegex(message, 'installation_type_bi')) {
    console.log(`[extractInstallationType] Detected BIFÁSICO via dynamic pattern`);
    return 'Bifásico';
  }
  
  // Check Trifásico patterns (dynamic)
  if (matchesCategoryRegex(message, 'installation_type_tri')) {
    console.log(`[extractInstallationType] Detected TRIFÁSICO via dynamic pattern`);
    return 'Trifásico';
  }
  
  // ═══════════════════════════════════════════════════════════════
  // HARDCODED FALLBACK PATTERNS for invoice analysis
  // These ensure extraction works even when database patterns are missing
  // ═══════════════════════════════════════════════════════════════
  
  // Monofásico patterns
  if (/\b(monof[áa]sic[oa]?|mono[-\s]?f[áa]sic[oa]?|1\s*f|1f|uma?\s*fase)\b/i.test(lowerMsg)) {
    console.log(`[extractInstallationType] Detected MONOFÁSICO via hardcoded fallback`);
    return 'Monofásico';
  }
  
  // Bifásico patterns  
  if (/\b(bif[áa]sic[oa]?|bi[-\s]?f[áa]sic[oa]?|2\s*f|2f|duas?\s*fases?)\b/i.test(lowerMsg)) {
    console.log(`[extractInstallationType] Detected BIFÁSICO via hardcoded fallback`);
    return 'Bifásico';
  }
  
  // Trifásico patterns
  if (/\b(trif[áa]sic[oa]?|tri[-\s]?f[áa]sic[oa]?|3\s*f|3f|tr[êe]s?\s*fases?)\b/i.test(lowerMsg)) {
    console.log(`[extractInstallationType] Detected TRIFÁSICO via hardcoded fallback`);
    return 'Trifásico';
  }
  
  // Check for "Tipo de Instalação:" format from AI analysis
  const tipoMatch = message.match(/tipo\s*(?:de\s*)?instala[çc][aã]o[:\s]*([^\n,]+)/i);
  if (tipoMatch) {
    const tipoText = tipoMatch[1].toLowerCase().trim();
    if (tipoText.includes('mono')) {
      console.log(`[extractInstallationType] Detected MONOFÁSICO from AI analysis format`);
      return 'Monofásico';
    }
    if (tipoText.includes('bi')) {
      console.log(`[extractInstallationType] Detected BIFÁSICO from AI analysis format`);
      return 'Bifásico';
    }
    if (tipoText.includes('tri')) {
      console.log(`[extractInstallationType] Detected TRIFÁSICO from AI analysis format`);
      return 'Trifásico';
    }
  }
  
  return null;
}

// ═══════════════════════════════════════════════════════════════
// INVOICE ANALYSIS PARSER
// ═══════════════════════════════════════════════════════════════

/**
 * Get known distribuidoras from database cache
 */
function getKnownDistribuidoras(): string[] {
  const pattern = getPatternsForCategory('known_distribuidora');
  if (pattern?.keywords && pattern.keywords.length > 0) {
    return pattern.keywords;
  }
  
  // Fallback - Extended list including smaller/regional distributors
  return [
    // Major distributors
    'CEMIG', 'COPEL', 'CPFL', 'ENEL', 'LIGHT', 'CELESC', 'COELBA', 'ENERGISA', 'EQUATORIAL',
    // Regional/smaller distributors (Phase 89 - Critical fix for "Delta" case)
    'DELTA', 'EDP', 'ELEKTRO', 'COSERN', 'CELPE', 'CELPA', 'CEAL', 'CEMAR', 'CEPISA',
    'CERON', 'ELETROACRE', 'ELETROPAULO', 'BANDEIRANTE', 'ESCELSA', 'AMPLA', 'COELCE',
    'CELTINS', 'RGE', 'AES', 'CEEE', 'DEMEI', 'MUXFELDT', 'URUSSANGA', 'COOPERATIVA',
    'CERILUZ', 'CERTAJA', 'CERMISSOES', 'COOPERLUZ', 'CRERAL', 'HIDROPAN', 'IENERGIA',
    'UHENPAL', 'FORCEL', 'CFLO', 'COCEL', 'COPREL', 'CEJAMA', 'CHESP', 'CEMIRIM', 'EEB',
    'CPEE', 'CSPE', 'DMED', 'DME', 'EFLUL', 'EFLJC', 'ELFSM', 'ENF', 'SULGIPE',
    // Aliases and common abbreviations
    'CEMIG-D', 'CPFL PAULISTA', 'CPFL PIRATININGA', 'ENEL SP', 'ENEL RJ', 'ENEL CE', 'ENEL GO',
    'LIGHT RIO', 'ENERGISA MT', 'ENERGISA MS', 'ENERGISA PB', 'ENERGISA SE', 'ENERGISA TO',
    'EQUATORIAL PA', 'EQUATORIAL MA', 'EQUATORIAL PI', 'EQUATORIAL AL', 'EQUATORIAL GO',
  ];
}

/**
 * Extract distribuidora using the distribuidoras_config cache (includes typos)
 * CRITICAL FIX: This allows recognition of typos like "ligth" -> "Light"
 * 
 * @returns Object with distribuidoraInformada (user input) and distribuidora (normalized)
 */
export function extractDistribuidoraWithCache(message: string): { 
  distribuidoraInformada?: string; 
  distribuidora?: string;
  isTypo?: boolean;
} {
  const cache = getDistribuidoraCache();
  if (!cache || !cache.distribuidoras.length) {
    console.log('[DATA-EXTRACTION] No distribuidora cache available, skipping typo detection');
    return {};
  }
  
  const lowerMessage = message.toLowerCase().trim();
  
  // Skip if message is too long (likely not just a distributor name)
  if (lowerMessage.length > 50) {
    // Still check for embedded distributor mentions in longer messages
    // Try to find any known distributor or typo
    const found = findDistribuidoraFromCache(lowerMessage, cache);
    if (found) {
      console.log(`[DATA-EXTRACTION] Found distribuidora in long message: "${found.nome}"`);
      return {
        distribuidoraInformada: found.nome,
        distribuidora: found.nome_normalizado,
        isTypo: false,
      };
    }
    return {};
  }
  
  // For short messages, try direct lookup using cache (includes typos)
  const found = findDistribuidoraFromCache(lowerMessage, cache);
  if (found) {
    const isTypo = found.nome.toLowerCase() !== lowerMessage.replace(/[^a-z]/g, '');
    console.log(`[DATA-EXTRACTION] Cache match: "${message}" -> "${found.nome}" (typo: ${isTypo})`);
    return {
      distribuidoraInformada: found.nome,
      distribuidora: found.nome_normalizado,
      isTypo,
    };
  }
  
  // Also check typos map directly for edge cases
  const typoMatch = cache.typos.get(lowerMessage.replace(/[^a-z0-9]/g, ''));
  if (typoMatch) {
    const dist = cache.distribuidoras.find(d => d.id === typoMatch.distribuidora_id);
    if (dist) {
      console.log(`[DATA-EXTRACTION] Typo cache match: "${message}" -> "${dist.nome}"`);
      return {
        distribuidoraInformada: dist.nome,
        distribuidora: dist.nome_normalizado,
        isTypo: true,
      };
    }
  }
  
  return {};
}

/**
 * Parse invoice analysis from AI response
 * Phase 12: Now uses dynamic distribuidora list
 * 
 * ENHANCED (2026-02-04): Now extracts MULTIPLE R$ values and calculates average
 * This handles screenshot of bill history like:
 * - Dezembro 2025: R$ 705,13
 * - Novembro 2025: R$ 590,35
 * ...
 */
export function parseInvoiceAnalysis(analysis: string): ExtractedClientData {
  const data: ExtractedClientData = {};
  const lowerAnalysis = analysis.toLowerCase();
  
  // Extract consumption
  const consumoPatterns = [
    /consumo[:\s]*(\d+(?:[.,]\d+)?)\s*kwh/i,
    /(\d+(?:[.,]\d+)?)\s*kwh/i,
  ];
  for (const pattern of consumoPatterns) {
    const match = analysis.match(pattern);
    if (match) {
      data.consumo = parseFloat(match[1].replace(',', '.'));
      break;
    }
  }
  
  // ═══════════════════════════════════════════════════════════════
  // ENHANCED: Extract ALL R$ values and calculate average
  // This handles both single invoice and bill history screenshots
  // ═══════════════════════════════════════════════════════════════
  
  // Pattern that captures R$ followed by value with thousands separator and decimals
  // Examples: R$ 705,13 | R$ 1.234,56 | R$ 500
  const allValuesPattern = /R\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{2})?|\d+(?:,\d{2})?)/gi;
  const matches = analysis.matchAll(allValuesPattern);
  const extractedValues: number[] = [];
  
  for (const match of matches) {
    if (match[1]) {
      // Parse: "1.234,56" → 1234.56, "705,13" → 705.13, "500" → 500
      const valueStr = match[1].replace(/\./g, '').replace(',', '.');
      const value = parseFloat(valueStr);
      
      // Only include reasonable bill values (R$ 50 to R$ 50.000)
      if (!isNaN(value) && value >= 50 && value <= 50000) {
        extractedValues.push(value);
      }
    }
  }
  
  if (extractedValues.length > 0) {
    // If multiple values found (history screenshot), calculate average
    if (extractedValues.length > 1) {
      const average = extractedValues.reduce((sum, v) => sum + v, 0) / extractedValues.length;
      data.valorFatura = Math.round(average * 100) / 100; // Round to 2 decimals
      console.log(`[parseInvoiceAnalysis] ✅ Extracted ${extractedValues.length} values, average: R$ ${data.valorFatura} (values: ${extractedValues.join(', ')})`);
    } else {
      // Single value
      data.valorFatura = extractedValues[0];
      console.log(`[parseInvoiceAnalysis] ✅ Extracted single value: R$ ${data.valorFatura}`);
    }
  } else {
    // Fallback: try legacy patterns for edge cases
    const valorPatterns = [
      /valor total[:\s]*r\$?\s*(\d+(?:[.,]\d+)?)/i,
      /valor[:\s]*r\$?\s*(\d+(?:[.,]\d+)?)/i,
    ];
    for (const pattern of valorPatterns) {
      const match = analysis.match(pattern);
      if (match) {
        data.valorFatura = parseFloat(match[1].replace('.', '').replace(',', '.'));
        console.log(`[parseInvoiceAnalysis] ✅ Extracted via legacy pattern: R$ ${data.valorFatura}`);
        break;
      }
    }
  }
  
  // Extract distributor (dynamic list)
  const distribuidoras = getKnownDistribuidoras();
  for (const dist of distribuidoras) {
    if (lowerAnalysis.includes(dist.toLowerCase())) {
      data.distribuidora = dist;
      break;
    }
  }
  
  // Extract installation number
  const instalacaoMatch = analysis.match(/(?:uc|instala[çc][ãa]o)[:\s]*(\d+)/i);
  if (instalacaoMatch) {
    data.numeroInstalacao = instalacaoMatch[1];
  }
  
  // Extract installation type
  data.tipoInstalacao = extractInstallationType(analysis) || undefined;
  
  // Extract and validate CPF/CNPJ
  const cnpjMatch = analysis.match(/cnpj[:\s]*(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}[-.]?\d{2})/i);
  const cpfMatch = analysis.match(/cpf[:\s]*(\d{3}\.?\d{3}\.?\d{3}[-.]?\d{2})/i);
  
  if (cnpjMatch) {
    const result = extractCNPJ(cnpjMatch[0]);
    if (result.cnpj) {
      data.cnpj = result.cnpj;
      data.tipoCliente = 'PJ';
    } else if (result.cnpjInvalido) {
      data.cnpjInvalido = result.cnpjInvalido;
    }
  } else if (cpfMatch) {
    const result = extractCPF(cpfMatch[0]);
    if (result.cpf) {
      data.cpf = result.cpf;
      data.tipoCliente = 'PF';
    } else if (result.cpfInvalido) {
      data.cpfInvalido = result.cpfInvalido;
    }
  }
  
  return data;
}

// ═══════════════════════════════════════════════════════════════
// COMBINED DATA EXTRACTION
// ═══════════════════════════════════════════════════════════════

/**
 * Extract all client data from a text message
 * Combines all extraction functions into a single pass
 */
export function extractDataFromText(
  message: string, 
  existingData: ExtractedClientData = {},
): ExtractedClientData {
  const data = { ...existingData };
  
  // Extract CPF
  if (!data.cpf) {
    const cpfResult = extractCPF(message);
    if (cpfResult.cpf) {
      data.cpf = cpfResult.cpf;
      data.tipoCliente = cpfResult.tipoCliente || undefined;
      data.cpfInvalido = undefined;
    } else if (cpfResult.cpfInvalido) {
      data.cpfInvalido = cpfResult.cpfInvalido;
    }
  }
  
  // Extract CNPJ
  if (!data.cnpj) {
    const cnpjResult = extractCNPJ(message);
    if (cnpjResult.cnpj) {
      data.cnpj = cnpjResult.cnpj;
      data.tipoCliente = cnpjResult.tipoCliente || undefined;
      data.cnpjInvalido = undefined;
    } else if (cnpjResult.cnpjInvalido) {
      data.cnpjInvalido = cnpjResult.cnpjInvalido;
    }
  }
  
  // Extract CEP
  if (!data.cep) {
    data.cep = extractCEP(message) || undefined;
  }
  
  // Extract bill value - CRITICAL FIX (Phase 120): Check for multiple bills first
  // CRITICAL FIX "CASO EDSON": Also check for lower bound patterns (acima de X)
  if (!data.valorFatura) {
    // ═══════════════════════════════════════════════════════════════
    // PRIORITY 0: Check for "acima de X" / "mais de X" patterns FIRST
    // These are VALID values and should NOT trigger ambiguity flow
    // ═══════════════════════════════════════════════════════════════
    const lowerBoundResult = checkForLowerBoundValue(message);
    if (lowerBoundResult) {
      data.valorFatura = lowerBoundResult.value;
      data.valorLowerBound = true;
      data.valorOriginalTexto = lowerBoundResult.originalText;
      console.log(`[extractDataFromText] ✅ LOWER BOUND VALUE: R$ ${lowerBoundResult.value}+ from "${lowerBoundResult.originalText}" - PROCEEDING WITHOUT EXACT VALUE`);
    } else {
      // ═══════════════════════════════════════════════════════════════
      // PRIORITY 1: Check for ambiguous RANGE values ("varia de X a Y")
      // Must come BEFORE extractMultipleBillValues to prevent doubling
      // ═══════════════════════════════════════════════════════════════
      const ambiguity = detectAmbiguousValue(message);
      if (ambiguity.isAmbiguous && ambiguity.ambiguityType === 'faixa' && ambiguity.extractedValue) {
        data.valorFatura = ambiguity.extractedValue;
        data.valorAmbiguo = true;
        data.valorOriginalTexto = ambiguity.originalText;
        console.log(`[extractDataFromText] ✅ RANGE/AMBIGUOUS VALUE: R$ ${ambiguity.extractedValue} (average from "${ambiguity.originalText}")`);
      } else {
        // Check for multiple bills
        const multipleResult = extractMultipleBillValues(message);
        
        if (multipleResult.isMultiple || multipleResult.values.length > 1) {
          // Client has multiple accounts
          data.isMultipleUnits = true;
          data.quantidadeUnidades = multipleResult.quantityMentioned || multipleResult.values.length;
          data.valoresIndividuais = multipleResult.values;
          data.valorTotalEstimado = multipleResult.totalValue;
          data.valorFatura = multipleResult.totalValue; // Use SUM for qualification
          data.contextoCorporativo = multipleResult.corporateContext || undefined;
          
          console.log(`[extractDataFromText] ✅ MULTIPLE BILLS DETECTED: ${multipleResult.values.length} bills (qty mentioned: ${multipleResult.quantityMentioned}), total R$ ${multipleResult.totalValue}, corporate: ${multipleResult.corporateContext || 'none'}`);
        } else if (multipleResult.values.length === 1) {
          // Single account
          data.valorFatura = multipleResult.values[0];
          console.log(`[extractDataFromText] Single bill: R$ ${data.valorFatura}`);
        } else {
          // Fallback to original extraction
          const extractedBillValue = extractBillValue(message);
          console.log(`[extractDataFromText] extractBillValue fallback("${message.substring(0, 30)}") = ${extractedBillValue}`);
          data.valorFatura = extractedBillValue || undefined;
        }
      }
    }
  } else {
    console.log(`[extractDataFromText] Skipping extractBillValue - already has valorFatura: ${data.valorFatura}`);
  }
  
  // Extract consumption
  if (!data.consumo) {
    data.consumo = extractConsumption(message) || undefined;
  }
  
  // Extract email
  if (!data.email && !data.emailPendente?.aguardandoConfirmacao) {
    const emailResult = extractEmail(message, data.email);
    if (emailResult.email) {
      data.email = emailResult.email;
    } else if (emailResult.emailPendente) {
      data.emailPendente = emailResult.emailPendente;
    }
  }
  
  // Extract name
  if (!data.nome) {
    data.nome = extractName(message) || undefined;
  }
  
  // Extract installation type
  if (!data.tipoInstalacao) {
    data.tipoInstalacao = extractInstallationType(message) || undefined;
  }
  
  // ═══════════════════════════════════════════════════════════════
  // 🔧 CRITICAL FIX (Phase 119): Extract distribuidora using database cache
  // This FIRST tries the distribuidoras_config cache (which includes typos like "ligth" -> "Light")
  // Only falls back to static list if cache is not available
  // This fixes the bug where typos like "ligth" were not being validated!
  // ═══════════════════════════════════════════════════════════════
  if (!data.distribuidora && !data.distribuidoraInformada) {
    // PRIORITY 1: Try cache-based extraction (includes typos from database)
    const cacheResult = extractDistribuidoraWithCache(message);
    if (cacheResult.distribuidoraInformada) {
      data.distribuidoraInformada = cacheResult.distribuidoraInformada;
      if (cacheResult.distribuidora) {
        data.distribuidora = cacheResult.distribuidora;
      }
      if (cacheResult.isTypo) {
        console.log(`[DATA-EXTRACTION] Distribuidora extracted via typo match: ${data.distribuidoraInformada}`);
      } else {
        console.log(`[DATA-EXTRACTION] Distribuidora extracted via cache: ${data.distribuidoraInformada}`);
      }
    } else {
      // PRIORITY 2: Fallback to static list (for when cache is not loaded)
      const distribuidoras = getKnownDistribuidoras();
      const lowerMessage = message.toLowerCase().trim();
      
      // First try exact word match (more precise)
      for (const dist of distribuidoras) {
        const distLower = dist.toLowerCase();
        // Check for word boundaries to avoid false positives
        const wordBoundaryRegex = new RegExp(`\\b${distLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        if (wordBoundaryRegex.test(lowerMessage)) {
          data.distribuidoraInformada = dist.toUpperCase();
          console.log(`[DATA-EXTRACTION] Distribuidora extracted from message (fallback): ${data.distribuidoraInformada}`);
          break;
        }
      }
      
      // If message is ONLY the distributor name (short message), set as distribuidora directly
      if (data.distribuidoraInformada && lowerMessage.length < 30) {
        // Short message that's just the distributor name - likely a direct answer
        const isJustDistributor = distribuidoras.some(d => 
          lowerMessage === d.toLowerCase() || 
          lowerMessage === d.toLowerCase() + '!' ||
          lowerMessage === 'é ' + d.toLowerCase() ||
          lowerMessage === 'a ' + d.toLowerCase() ||
          lowerMessage === 'da ' + d.toLowerCase()
        );
        if (isJustDistributor) {
          console.log(`[DATA-EXTRACTION] Short message confirms distribuidora: ${data.distribuidoraInformada}`);
        }
      }
    }
  }
  
  // ═══════════════════════════════════════════════════════════════
  // NEW: Detect CIP zero / no public lighting
  // ═══════════════════════════════════════════════════════════════
  if (!data.cipZero) {
    if (matchesPatternCategory(message, 'sem_cip')) {
      data.cipZero = true;
      console.log('[DATA-EXTRACTION] Detected no CIP (sem_cip pattern match)');
    }
  }
  
  // ═══════════════════════════════════════════════════════════════
  // NEW: Detect rural area
  // ═══════════════════════════════════════════════════════════════
  if (!data.isAreaRural) {
    if (matchesPatternCategory(message, 'area_rural')) {
      data.isAreaRural = true;
      // Rural areas often don't have CIP
      if (!data.cipZero) {
        console.log('[DATA-EXTRACTION] Rural area detected, marking for CIP check');
      }
    }
  }
  
  // ═══════════════════════════════════════════════════════════════
  // NEW: Detect future consumption mentions
  // ═══════════════════════════════════════════════════════════════
  if (!data.consumoFuturoMencionado) {
    if (matchesPatternCategory(message, 'consumo_futuro')) {
      data.consumoFuturoMencionado = true;
      // Try to capture context about future installations
      const futuroKeywords = ['ar condicionado', 'ar-condicionado', 'piscina', 'aquecedor', 'carro elétrico', 'forno', 'chuveiro'];
      const mentionedItems: string[] = [];
      const lowerMsg = message.toLowerCase();
      for (const kw of futuroKeywords) {
        if (lowerMsg.includes(kw)) {
          mentionedItems.push(kw);
        }
      }
      if (mentionedItems.length > 0) {
        data.consumoFuturoDetalhes = mentionedItems.join(', ');
      }
      console.log('[DATA-EXTRACTION] Future consumption mentioned:', data.consumoFuturoDetalhes || 'generic');
    }
  }
  
  // ═══════════════════════════════════════════════════════════════
  // NEW: Detect pause/followup request
  // ═══════════════════════════════════════════════════════════════
  if (!data.pauseFollowupRequested) {
    if (matchesPatternCategory(message, 'pause_followup')) {
      data.pauseFollowupRequested = true;
      console.log('[DATA-EXTRACTION] Client requested pause/time to analyze');
    }
  }
  
  return data;
}
