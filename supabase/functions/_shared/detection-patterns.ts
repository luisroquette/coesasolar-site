/**
 * Detection Patterns Utilities
 * Shared helpers for loading and matching detection patterns from database
 */

// Pattern entry structure
export type PatternEntry = { 
  keywords: string[]; 
  regexPatterns: RegExp[];
};

// Cache structure
export interface DetectionPatternCache {
  patterns: Map<string, PatternEntry>;
  responses: Map<string, string>;
  timestamp: number;
}

// Objection types - Added NO_FIDELIDADE for ethical rapport handling
export type ObjectionType = 'PRECO' | 'CONFIANCA' | 'CONTRATO' | 'TEMPO' | 'COMPLEXIDADE' | 'AUTORIDADE' | 'DESISTENCIA_TEMPORARIA' | 'NO_FIDELIDADE' | 'RECUSA_DEFINITIVA' | null;

// Category to objection mapping
export const OBJECTION_CATEGORY_MAP: Record<Exclude<ObjectionType, null>, string> = {
  PRECO: 'objection_preco',
  CONFIANCA: 'objection_confianca',
  CONTRATO: 'objection_contrato',
  TEMPO: 'objection_tempo',
  COMPLEXIDADE: 'objection_complexidade',
  AUTORIDADE: 'objection_autoridade',
  DESISTENCIA_TEMPORARIA: 'objection_desistencia_temporaria',
  NO_FIDELIDADE: 'objection_no_fidelidade',
  RECUSA_DEFINITIVA: 'polite_decline_competitor',
};

// ═══════════════════════════════════════════════════════════════
// POLITE DECLINE DETECTION (competitor/alternative chosen)
// ═══════════════════════════════════════════════════════════════

export interface PoliteDeclineResult {
  detected: boolean;
  reason: string;
  alternative: string;
}

/**
 * Detect polite decline when client chose competitor or alternative
 * Examples: "preferiram ficar com financiamento", "projeto de placas solares"
 */
export function detectPoliteDeclineWithAlternative(
  message: string,
  patterns?: Map<string, PatternEntry>,
  hasPropostaId?: string | null
): PoliteDeclineResult {
  const patternsToUse = patterns || detectionPatternCache?.patterns || new Map();
  const lowerMessage = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  
  // Check DB patterns first
  if (matchesPatternCategory(message, 'polite_decline_competitor', patternsToUse)) {
    // Extract alternative from message
    let alternative = 'alternativa';
    let reason = 'chose_alternative';
    
    // Detect specific alternatives
    if (/placa|solar|painel|fotovolt/i.test(message)) {
      alternative = 'energia solar/placas';
      reason = 'chose_solar_panels';
    } else if (/financiamento/i.test(message)) {
      alternative = 'financiamento próprio';
      reason = 'chose_financing';
    } else if (/outr[oa]\s*(empresa|fornecedor|operador)/i.test(message)) {
      alternative = 'concorrente';
      reason = 'chose_competitor';
    } else if (/gerador|diesel/i.test(message)) {
      alternative = 'gerador/diesel';
      reason = 'chose_generator';
    }
    
    console.log(`[PATTERNS] Polite decline detected: ${reason} - ${alternative}`);
    
    return {
      detected: true,
      reason,
      alternative,
    };
  }
  
  // Fallback patterns (if DB patterns not loaded)
  const fallbackPatterns = [
    /preferir?am?\s+(ficar|continuar)\s+com/i,
    /optaram?\s+por/i,
    /v[aã]o\s+(ficar|continuar)\s+com/i,
    /j[aá]\s+fecharam?\s+com/i,
    /escolheram?\s+outr[oa]/i,
    /foram?\s+com\s+outr[oa]/i,
    /projeto\s+de\s+placa/i,
    /financiamento\s+de\s+placa/i,
    /fizeram?\s+financiamento/i,
    /decidiram?\s+(ir|ficar)\s+com/i,
  ];
  
  for (const pattern of fallbackPatterns) {
    if (pattern.test(message)) {
      let alternative = 'alternativa';
      let reason = 'chose_alternative';
      
      if (/placa|solar|painel/i.test(message)) {
        alternative = 'energia solar/placas';
        reason = 'chose_solar_panels';
      } else if (/financiamento/i.test(message)) {
        alternative = 'financiamento próprio';
        reason = 'chose_financing';
      }
      
      return {
        detected: true,
        reason,
        alternative,
      };
    }
  }
  
  return { detected: false, reason: '', alternative: '' };
}

// Module-level cache
let detectionPatternCache: DetectionPatternCache | null = null;
const PATTERN_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Load detection patterns from database with caching
 */
export async function loadDetectionPatterns(
  supabaseClient: any
): Promise<Map<string, PatternEntry>> {
  const now = Date.now();
  
  if (detectionPatternCache && (now - detectionPatternCache.timestamp) < PATTERN_CACHE_TTL_MS) {
    return detectionPatternCache.patterns;
  }
  
  try {
    const { data, error } = await supabaseClient
      .from('sofia_detection_patterns')
      .select('category, pattern, pattern_type, response_template')
      .eq('is_active', true)
      .order('priority', { ascending: false });
    
    if (error) {
      console.error('[PATTERNS] Error loading patterns:', error);
      return detectionPatternCache?.patterns || new Map();
    }
    
    const patternMap = new Map<string, PatternEntry>();
    const responseMap = new Map<string, string>();
    
    for (const row of (data || [])) {
      const category = row.category;
      if (!patternMap.has(category)) {
        patternMap.set(category, { keywords: [], regexPatterns: [] });
      }
      
      const entry = patternMap.get(category)!;
      
      if (row.pattern_type === 'regex') {
        try {
          entry.regexPatterns.push(new RegExp(row.pattern, 'i'));
        } catch (e) {
          console.warn(`[PATTERNS] Invalid regex: ${row.pattern}`);
        }
      } else {
        entry.keywords.push(row.pattern.toLowerCase());
      }
      
      if (row.response_template && !responseMap.has(category)) {
        responseMap.set(category, row.response_template);
      }
    }
    
    detectionPatternCache = { patterns: patternMap, responses: responseMap, timestamp: now };
    console.log(`[PATTERNS] Loaded ${data?.length || 0} patterns across ${patternMap.size} categories`);
    
    return patternMap;
  } catch (err) {
    console.error('[PATTERNS] Exception:', err);
    return detectionPatternCache?.patterns || new Map();
  }
}

/**
 * Get cached response template for a category
 */
export function getPatternResponse(category: string): string | null {
  return detectionPatternCache?.responses.get(category) || null;
}

/**
 * Get current pattern cache (for direct access)
 */
export function getPatternCache(): DetectionPatternCache | null {
  return detectionPatternCache;
}

/**
 * Check if message matches any pattern in a category
 */
export function matchesPatternCategory(
  message: string, 
  category: string, 
  patterns?: Map<string, PatternEntry>
): boolean {
  const patternsToUse = patterns || detectionPatternCache?.patterns || new Map();
  const lowerMessage = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const categoryPatterns = patternsToUse.get(category);
  
  if (!categoryPatterns) return false;
  
  for (const kw of categoryPatterns.keywords) {
    if (lowerMessage.includes(kw.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))) {
      return true;
    }
  }
  for (const rx of categoryPatterns.regexPatterns) {
    if (rx.test(message)) {
      return true;
    }
  }
  return false;
}

/**
 * Find all matching categories for a message
 */
export function findMatchingCategories(
  message: string,
  patterns?: Map<string, PatternEntry>
): string[] {
  const patternsToUse = patterns || detectionPatternCache?.patterns || new Map();
  const matching: string[] = [];
  
  for (const category of patternsToUse.keys()) {
    if (matchesPatternCategory(message, category, patternsToUse)) {
      matching.push(category);
    }
  }
  
  return matching;
}

/**
 * Check if message contains high intent keywords
 */
export function hasHighIntent(message: string, patterns?: Map<string, PatternEntry>): boolean {
  const patternsToUse = patterns || detectionPatternCache?.patterns || new Map();
  
  if (patternsToUse.has('high_intent')) {
    return matchesPatternCategory(message, 'high_intent', patternsToUse);
  }
  if (patternsToUse.has('funnel_conversion')) {
    return matchesPatternCategory(message, 'funnel_conversion', patternsToUse);
  }
  return false;
}

/**
 * Detect objection type from message
 */
export function detectObjection(message: string, patterns?: Map<string, PatternEntry>): ObjectionType {
  const patternsToUse = patterns || detectionPatternCache?.patterns || new Map();
  
  for (const [objType, category] of Object.entries(OBJECTION_CATEGORY_MAP)) {
    if (matchesPatternCategory(message, category, patternsToUse)) {
      return objType as Exclude<ObjectionType, null>;
    }
  }
  
  // Check legacy 'objections' category
  if (matchesPatternCategory(message, 'objections', patternsToUse)) {
    const lowerMessage = message.toLowerCase();
    if (lowerMessage.includes('caro') || lowerMessage.includes('preco') || lowerMessage.includes('custo')) {
      return 'PRECO';
    }
    if (lowerMessage.includes('confio') || lowerMessage.includes('golpe') || lowerMessage.includes('fraude')) {
      return 'CONFIANCA';
    }
    if (lowerMessage.includes('contrato') || lowerMessage.includes('multa') || lowerMessage.includes('fidelidade')) {
      return 'CONTRATO';
    }
    if (lowerMessage.includes('depois') || lowerMessage.includes('agora nao') || lowerMessage.includes('pensar')) {
      return 'TEMPO';
    }
    if (lowerMessage.includes('complexo') || lowerMessage.includes('dificil') || lowerMessage.includes('entend')) {
      return 'COMPLEXIDADE';
    }
    if (lowerMessage.includes('esposa') || lowerMessage.includes('marido') || lowerMessage.includes('socio')) {
      return 'AUTORIDADE';
    }
  }
  
  return null;
}

/**
 * Get objection response text (from DB or fallback)
 */
export function getObjectionResponseText(objectionType: Exclude<ObjectionType, null>): string {
  const category = OBJECTION_CATEGORY_MAP[objectionType];
  const response = getPatternResponse(category);
  
  const fallbacks: Record<Exclude<ObjectionType, null>, string> = {
    PRECO: 'Entendi, é sobre preço. Aqui você não paga mais — você paga menos todo mês. Quer ajustar o desconto ou o prazo?',
    CONFIANCA: 'Justo desconfiar. COESA opera desde 2018, +2000 clientes. Quer ver como funciona na fatura ou no contrato?',
    CONTRATO: 'Existe contrato, sim. É isso que garante sua economia. Quer ver exatamente onde está a multa antes de assinar?',
    TEMPO: 'Claro. Antes disso, me diga: o que precisa estar claro pra decidir hoje?',
    COMPLEXIDADE: 'Simplificando: você continua recebendo energia da mesma distribuidora, mas com desconto. Posso explicar um ponto específico?',
    AUTORIDADE: 'Faz sentido. Quer que eu monte uma simulação pra vocês analisarem juntos?',
    DESISTENCIA_TEMPORARIA: 'Sem problemas! Fico aqui quando precisar. É só mandar um "oi" que a gente retoma! 💚',
    NO_FIDELIDADE: 'Entendo perfeitamente! A fidelidade é o que garante seu desconto fixo todo mês. É ela que torna a relação justa e equilibrada entre nós. Posso seguir com a proposta?',
    RECUSA_DEFINITIVA: 'Entendo! 😊 Fico feliz que encontraram uma solução que funciona para vocês. Se no futuro quiserem conhecer a economia por assinatura da COESA, é só me chamar! Desejo sucesso! 💚',
  };
  
  return response || fallbacks[objectionType];
}

/**
 * Get A/B closing phrase
 */
export function getABClosingPhrase(variant: 'A' | 'B'): string {
  const category = variant === 'A' ? 'ab_closing_a' : 'ab_closing_b';
  const response = getPatternResponse(category);
  const fallbacks = {
    A: 'Você prefere 20% com mais flexibilidade ou 30% com máxima economia?',
    B: 'Ficar como está custa mais caro do que entrar agora. Quer 20% ou 30%?',
  };
  return response || fallbacks[variant];
}

/**
 * Clear pattern cache (for testing or manual refresh)
 */
export function clearPatternCache(): void {
  detectionPatternCache = null;
}

/**
 * Get keywords for a specific category
 * Useful for document detection and other keyword-based matching
 */
export function getKeywordsForCategory(
  category: string,
  patterns?: Map<string, PatternEntry>
): string[] {
  const patternsToUse = patterns || detectionPatternCache?.patterns || new Map();
  const entry = patternsToUse.get(category);
  return entry?.keywords || [];
}

/**
 * Get regex patterns for a specific category
 */
export function getRegexPatternsForCategory(
  category: string,
  patterns?: Map<string, PatternEntry>
): RegExp[] {
  const patternsToUse = patterns || detectionPatternCache?.patterns || new Map();
  const entry = patternsToUse.get(category);
  return entry?.regexPatterns || [];
}
