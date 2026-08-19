/**
 * Disqualification Rules Module
 * Detection patterns for leads that cannot be served (Grupo A, Tarifa Social, etc.)
 * Now uses database patterns via detection-patterns.ts
 * ZERO HARDCODE: All constants loaded from configuracoes_sistema
 */

import { 
  loadDetectionPatterns, 
  matchesPatternCategory,
  type PatternEntry 
} from './detection-patterns.ts';
import {
  getDisqualificationMessage as getDisqualificationMessageFromTemplates,
  type MessageTemplate,
} from './message-templates.ts';

// ═══════════════════════════════════════════════════════════════
// DEFAULT CONSTANTS (fallbacks if DB not loaded)
// ═══════════════════════════════════════════════════════════════

const DEFAULT_CONSUMO_MINIMO_KWH = 200;
const DEFAULT_CONSUMO_MINIMO_REAIS = 50;
const DEFAULT_ESTADOS_ATENDIDOS = ['MG', 'BA', 'SP', 'RJ'];

// Module-level config cache
let configCache: {
  consumoMinimoKwh: number;
  consumoMinimoReais: number;
  estadosAtendidos: string[];
  timestamp: number;
} | null = null;
const CONFIG_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ═══════════════════════════════════════════════════════════════
// CONFIG LOADER
// ═══════════════════════════════════════════════════════════════

/**
 * Load disqualification config from database
 */
export async function loadDisqualificationConfig(supabaseClient: any): Promise<{
  consumoMinimoKwh: number;
  consumoMinimoReais: number;
  estadosAtendidos: string[];
}> {
  const now = Date.now();
  
  if (configCache && (now - configCache.timestamp) < CONFIG_CACHE_TTL_MS) {
    return configCache;
  }
  
  try {
    const { data, error } = await supabaseClient
      .from('configuracoes_sistema')
      .select('chave, valor')
      .in('chave', ['consumo_minimo_kwh', 'consumo_minimo_reais', 'estados_atendidos']);
    
    if (error) {
      console.error('[DISQ_CONFIG] Error loading config:', error);
      return getDefaultConfig();
    }
    
    const configMap = new Map<string, string>();
    for (const row of (data || [])) {
      configMap.set(row.chave, row.valor);
    }
    
    const consumoKwhStr = configMap.get('consumo_minimo_kwh') || String(DEFAULT_CONSUMO_MINIMO_KWH);
    const consumoReaisStr = configMap.get('consumo_minimo_reais') || String(DEFAULT_CONSUMO_MINIMO_REAIS);
    const estadosStr = configMap.get('estados_atendidos') || JSON.stringify(DEFAULT_ESTADOS_ATENDIDOS);
    
    let estadosAtendidos: string[];
    try {
      estadosAtendidos = JSON.parse(estadosStr);
    } catch {
      estadosAtendidos = DEFAULT_ESTADOS_ATENDIDOS;
    }
    
    configCache = {
      consumoMinimoKwh: parseInt(consumoKwhStr, 10) || DEFAULT_CONSUMO_MINIMO_KWH,
      consumoMinimoReais: parseInt(consumoReaisStr, 10) || DEFAULT_CONSUMO_MINIMO_REAIS,
      estadosAtendidos,
      timestamp: now,
    };
    
    console.log(`[DISQ_CONFIG] Loaded: minKwh=${configCache.consumoMinimoKwh}, minReais=${configCache.consumoMinimoReais}, estados=${estadosAtendidos.join(',')}`);
    
    return configCache;
  } catch (err) {
    console.error('[DISQ_CONFIG] Exception:', err);
    return getDefaultConfig();
  }
}

function getDefaultConfig() {
  return {
    consumoMinimoKwh: DEFAULT_CONSUMO_MINIMO_KWH,
    consumoMinimoReais: DEFAULT_CONSUMO_MINIMO_REAIS,
    estadosAtendidos: DEFAULT_ESTADOS_ATENDIDOS,
  };
}

/**
 * Get current config (sync version, uses cache)
 */
export function getDisqualificationConfig() {
  return configCache || getDefaultConfig();
}

// ═══════════════════════════════════════════════════════════════
// DB CATEGORY MAPPING
// ═══════════════════════════════════════════════════════════════

const DISQUALIFICATION_CATEGORIES = {
  grupo_a: 'disqualification_grupo_a',
  tarifa_social: 'disqualification_tarifa_social',
  geracao_propria: 'disqualification_geracao_propria',
} as const;

// ═══════════════════════════════════════════════════════════════
// GRUPO A (ALTA TENSÃO) - NÃO ATENDEMOS
// ═══════════════════════════════════════════════════════════════

/**
 * Detecta se o cliente é Grupo A (alta tensão) - não atendemos
 * Uses patterns from database
 */
export function detectGrupoA(
  message: string, 
  dadosColetados: Record<string, unknown> | null,
  patterns?: Map<string, PatternEntry>
): boolean {
  // Check database patterns
  if (matchesPatternCategory(message, DISQUALIFICATION_CATEGORIES.grupo_a, patterns)) {
    return true;
  }
  
  // Check collected data flags
  const isGrupoAData = dadosColetados?.grupoTarifario?.toString().toLowerCase() === 'a' ||
                       dadosColetados?.grupoTarifario?.toString().toLowerCase()?.startsWith('a') ||
                       dadosColetados?.isGrupoA === true;
  
  return isGrupoAData;
}

// ═══════════════════════════════════════════════════════════════
// TARIFA SOCIAL / BAIXA RENDA - NÃO ATENDEMOS
// ═══════════════════════════════════════════════════════════════

/**
 * Detecta se o cliente possui Tarifa Social/Baixa Renda - não atendemos
 * Uses patterns from database
 */
export function detectTarifaSocial(
  message: string, 
  dadosColetados: Record<string, unknown> | null,
  patterns?: Map<string, PatternEntry>
): boolean {
  // Check database patterns
  if (matchesPatternCategory(message, DISQUALIFICATION_CATEGORIES.tarifa_social, patterns)) {
    return true;
  }
  
  // Check collected data flags
  const isTarifaSocialData = dadosColetados?.tarifaSocial === true ||
                              dadosColetados?.isTarifaSocial === true ||
                              dadosColetados?.temTarifaSocial === true;
  
  return isTarifaSocialData;
}

// ═══════════════════════════════════════════════════════════════
// CONSUMO MUITO BAIXO - NÃO COMPENSA
// ═══════════════════════════════════════════════════════════════

/**
 * Detecta se o consumo é muito baixo para valer a pena
 * Uses config from database (with fallback to defaults)
 */
export function isConsumoBaixo(consumoKwh: number | null, valorReais: number | null): boolean {
  const config = getDisqualificationConfig();
  if (consumoKwh && consumoKwh < config.consumoMinimoKwh) return true;
  if (valorReais && valorReais < config.consumoMinimoReais) return true;
  return false;
}

// ═══════════════════════════════════════════════════════════════
// ÁREA NÃO ATENDIDA DETECTION
// ═══════════════════════════════════════════════════════════════

/**
 * Verifica se o estado é atendido
 * Uses config from database (with fallback to defaults)
 */
export function isEstadoAtendido(uf: string | null): boolean {
  if (!uf) return true; // Se não souber, assume que atende
  const config = getDisqualificationConfig();
  return config.estadosAtendidos.includes(uf.toUpperCase());
}

// ═══════════════════════════════════════════════════════════════
// GERAÇÃO PRÓPRIA - VERIFICAR SE TEM EXCEDENTE
// ═══════════════════════════════════════════════════════════════

/**
 * Detecta se cliente já tem geração própria
 * Uses patterns from database
 */
export function detectGeracaoPropria(
  message: string,
  patterns?: Map<string, PatternEntry>
): boolean {
  return matchesPatternCategory(message, DISQUALIFICATION_CATEGORIES.geracao_propria, patterns);
}

// Category for solar excess opportunity detection
const SOLAR_EXCESS_CATEGORY = 'solar_excess_opportunity';

export interface SolarExcessResult {
  hasSolar: boolean;
  hasExcess: boolean;
  estimatedValue: number | null;
  excessIndicator: string | null;
}

/**
 * Detecta se cliente tem placas solares MAS ainda tem excedente de consumo
 * Se hasExcess = true, NÃO devemos desqualificar - podemos atender o excedente
 * 
 * Critérios para hasExcess = true:
 * 1. Mensagem menciona problemas de geração ("não gera", "não cobre", etc.)
 * 2. OU valor de conta >= R$ 250 mencionado junto com solar
 */
export function detectSolarExcessOpportunity(
  message: string,
  patterns?: Map<string, PatternEntry>,
  collectedBillValue?: number | null
): SolarExcessResult {
  const msgLower = message.toLowerCase();
  const config = getDisqualificationConfig();
  const MINIMUM_EXCESS_VALUE = config.consumoMinimoReais || 250;
  
  // Check if message mentions solar panels
  const hasSolar = detectGeracaoPropria(message, patterns);
  
  if (!hasSolar) {
    return { hasSolar: false, hasExcess: false, estimatedValue: null, excessIndicator: null };
  }
  
  // Check for excess indicators from database patterns
  const hasExcessPatterns = matchesPatternCategory(msgLower, SOLAR_EXCESS_CATEGORY, patterns);
  
  // Also check common patterns inline (fallback)
  const fallbackPatterns = [
    /n[aã]o\s+(est[aá]\s+)?gera(ndo)?/i,
    /gera\s+pouco/i,
    /n[aã]o\s+cobre/i,
    /ainda\s+pago/i,
    /conta\s+(ainda\s+)?vem\s+alta/i,
    /consumo\s+(aumentou|maior)/i,
    /sistema\s+n[aã]o\s+d[aá]\s+conta/i,
    /placa\s+n[aã]o\s+d[aá]\s+conta/i,
    /painel\s+n[aã]o\s+cobre/i,
  ];
  
  const matchesFallback = fallbackPatterns.some(p => p.test(msgLower));
  const hasExcessIndicator = hasExcessPatterns || matchesFallback;
  
  // Extract value from message if any
  let extractedValue: number | null = null;
  const valueMatch = msgLower.match(/r?\$?\s*(\d{1,2}[\.,]?\d{3}|\d{3,4})(?:[,\.]\d{2})?/);
  if (valueMatch) {
    const cleanValue = valueMatch[1].replace(/[.,]/g, '');
    extractedValue = parseInt(cleanValue, 10);
  }
  
  // Use collected value or extracted value
  const effectiveValue = collectedBillValue || extractedValue;
  
  // Has excess if: explicit patterns OR value >= minimum
  const hasExcess = hasExcessIndicator || (effectiveValue !== null && effectiveValue >= MINIMUM_EXCESS_VALUE);
  
  // Determine indicator reason
  let excessIndicator: string | null = null;
  if (hasExcessIndicator) {
    excessIndicator = 'pattern_detected';
  } else if (effectiveValue !== null && effectiveValue >= MINIMUM_EXCESS_VALUE) {
    excessIndicator = 'high_bill_value';
  }
  
  return {
    hasSolar: true,
    hasExcess,
    estimatedValue: effectiveValue,
    excessIndicator,
  };
}

// ═══════════════════════════════════════════════════════════════
// DISQUALIFICATION RESULT TYPE
// ═══════════════════════════════════════════════════════════════

export type DisqualificationReason = 
  | 'grupo_a'
  | 'tarifa_social'
  | 'consumo_baixo'
  | 'area_nao_atendida'
  | 'geracao_propria'
  | null;

export interface DisqualificationResult {
  disqualified: boolean;
  reason: DisqualificationReason;
  message: string | null;
}

/**
 * Get disqualification message from database templates or fallback
 * Uses message-templates.ts for dynamic messages
 */
function getDisqualificationMessageInternal(
  reason: DisqualificationReason,
  templates?: Map<string, MessageTemplate>
): string | null {
  if (!reason) return null;
  
  const config = getDisqualificationConfig();
  
  // Build variables for template rendering
  const variables: Record<string, string | number> = {
    consumo_minimo_kwh: config.consumoMinimoKwh,
    consumo_minimo_reais: config.consumoMinimoReais,
    estados_atendidos: config.estadosAtendidos.join(', '),
  };
  
  // Use imported template function (aliased to avoid conflict)
  return getDisqualificationMessageFromTemplates(reason, variables, templates);
}

/**
 * Checks all disqualification rules
 * Uses patterns from database via detection-patterns.ts
 */
export function checkDisqualification(
  message: string,
  dadosColetados: Record<string, unknown> | null,
  options?: {
    consumoKwh?: number | null;
    valorReais?: number | null;
    uf?: string | null;
  },
  patterns?: Map<string, PatternEntry>
): DisqualificationResult {
  // Check Grupo A
  if (detectGrupoA(message, dadosColetados, patterns)) {
    return {
      disqualified: true,
      reason: 'grupo_a',
      message: getDisqualificationMessageInternal('grupo_a'),
    };
  }
  
  // Check Tarifa Social
  if (detectTarifaSocial(message, dadosColetados, patterns)) {
    return {
      disqualified: true,
      reason: 'tarifa_social',
      message: getDisqualificationMessageInternal('tarifa_social'),
    };
  }
  
  // Check Consumo Baixo
  if (options?.consumoKwh || options?.valorReais) {
    if (isConsumoBaixo(options.consumoKwh || null, options.valorReais || null)) {
      return {
        disqualified: true,
        reason: 'consumo_baixo',
        message: getDisqualificationMessageInternal('consumo_baixo'),
      };
    }
  }
  
  // Check Área Não Atendida
  if (options?.uf && !isEstadoAtendido(options.uf)) {
    return {
      disqualified: true,
      reason: 'area_nao_atendida',
      message: getDisqualificationMessageInternal('area_nao_atendida'),
    };
  }
  
  // Check Geração Própria
  if (detectGeracaoPropria(message, patterns)) {
    return {
      disqualified: true,
      reason: 'geracao_propria',
      message: getDisqualificationMessageInternal('geracao_propria'),
    };
  }
  
  return {
    disqualified: false,
    reason: null,
    message: null,
  };
}

/**
 * Async version that loads patterns if not provided
 */
export async function checkDisqualificationAsync(
  message: string,
  dadosColetados: Record<string, unknown> | null,
  supabaseClient: any,
  options?: {
    consumoKwh?: number | null;
    valorReais?: number | null;
    uf?: string | null;
  }
): Promise<DisqualificationResult> {
  const patterns = await loadDetectionPatterns(supabaseClient);
  return checkDisqualification(message, dadosColetados, options, patterns);
}
