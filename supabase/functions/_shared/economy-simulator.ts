/**
 * Economy Simulator Module
 * Calculates savings for customers based on bill value or consumption
 * Used by sofIA to respond to economy questions with real calculations
 * 
 * ZERO HARDCODE: All constants, patterns, and templates loaded from database
 */

import { matchesPatternCategory, getRegexPatternsForCategory, type PatternEntry } from './detection-patterns.ts';
import { getRenderedTemplate, getTemplateCache, type MessageTemplate } from './message-templates.ts';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface SimulationInput {
  valorConta?: number;      // Bill value in R$
  consumoKwh?: number;      // Consumption in kWh
  distribuidora?: string;   // Utility company name
  tipoInstalacao?: 'Monofásico' | 'Bifásico' | 'Trifásico';
}

export interface SimulationResult {
  consumoEstimado: number;
  tipoInstalacao: 'Monofásico' | 'Bifásico' | 'Trifásico';
  tarifa: number;
  disponibilidadeKwh: number;
  disponibilidadeValor: number;
  
  valorAtual: number;
  valorComCoesa: number;
  economiaMensal: number;
  economiaAnual: number;
  economiaAcumulada: number;
  
  descontoPercentual: number;
  fidelidadeAnos: number;
  
  // Para exibição
  economiaPercentual: number;
  message: string;
}

export interface TarifaInfo {
  tarifa: number;
  uf: string;
  distribuidora: string;
}

export interface EconomyConfig {
  disponibilidadeMonofasico: number;
  disponibilidadeBifasico: number;
  disponibilidadeTrifasico: number;
  inflacaoEnergetica: number;
  cipDefault: number;
  tarifaFallback: number;
  unlockThreshold: number;
  unlockDesconto: number;
  unlockFidelidade: number;
  descontoDefault: number;
  fidelidadeDefault: number;
}

// ═══════════════════════════════════════════════════════════════
// FALLBACK DEFAULTS (used only if DB unavailable)
// ═══════════════════════════════════════════════════════════════

const FALLBACK_CONFIG: EconomyConfig = {
  disponibilidadeMonofasico: 30,
  disponibilidadeBifasico: 50,
  disponibilidadeTrifasico: 100,
  inflacaoEnergetica: 0.07,
  cipDefault: 25,
  tarifaFallback: 0.85,
  unlockThreshold: 3000,
  unlockDesconto: 30,
  unlockFidelidade: 4,
  descontoDefault: 25,
  fidelidadeDefault: 3,
};

// ═══════════════════════════════════════════════════════════════
// CONFIG LOADING
// ═══════════════════════════════════════════════════════════════

let configCache: EconomyConfig | null = null;
let configCacheTimestamp = 0;
const CONFIG_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

/**
 * Load economy config from database
 */
export async function loadEconomyConfig(supabase: any): Promise<EconomyConfig> {
  if (configCache && Date.now() - configCacheTimestamp < CONFIG_CACHE_TTL_MS) {
    return configCache;
  }
  
  try {
    const { data, error } = await supabase
      .from('configuracoes_sistema')
      .select('chave, valor')
      .in('chave', [
        'economy_disponibilidade_monofasico',
        'economy_disponibilidade_bifasico',
        'economy_disponibilidade_trifasico',
        'economy_inflacao_energetica',
        'economy_cip_default',
        'economy_tarifa_fallback',
        'economy_unlock_threshold',
        'economy_unlock_desconto',
        'economy_unlock_fidelidade',
        'economy_desconto_default',
        'economy_fidelidade_default',
      ]);
    
    if (error) {
      console.error('[economy-simulator] Error loading config:', error);
      return configCache || FALLBACK_CONFIG;
    }
    
    const configMap = new Map<string, string>();
    for (const row of data || []) {
      configMap.set(row.chave, row.valor);
    }
    
    configCache = {
      disponibilidadeMonofasico: parseInt(configMap.get('economy_disponibilidade_monofasico') || '') || FALLBACK_CONFIG.disponibilidadeMonofasico,
      disponibilidadeBifasico: parseInt(configMap.get('economy_disponibilidade_bifasico') || '') || FALLBACK_CONFIG.disponibilidadeBifasico,
      disponibilidadeTrifasico: parseInt(configMap.get('economy_disponibilidade_trifasico') || '') || FALLBACK_CONFIG.disponibilidadeTrifasico,
      inflacaoEnergetica: parseFloat(configMap.get('economy_inflacao_energetica') || '') || FALLBACK_CONFIG.inflacaoEnergetica,
      cipDefault: parseFloat(configMap.get('economy_cip_default') || '') || FALLBACK_CONFIG.cipDefault,
      tarifaFallback: parseFloat(configMap.get('economy_tarifa_fallback') || '') || FALLBACK_CONFIG.tarifaFallback,
      unlockThreshold: parseInt(configMap.get('economy_unlock_threshold') || '') || FALLBACK_CONFIG.unlockThreshold,
      unlockDesconto: parseInt(configMap.get('economy_unlock_desconto') || '') || FALLBACK_CONFIG.unlockDesconto,
      unlockFidelidade: parseInt(configMap.get('economy_unlock_fidelidade') || '') || FALLBACK_CONFIG.unlockFidelidade,
      descontoDefault: parseInt(configMap.get('economy_desconto_default') || '') || FALLBACK_CONFIG.descontoDefault,
      fidelidadeDefault: parseInt(configMap.get('economy_fidelidade_default') || '') || FALLBACK_CONFIG.fidelidadeDefault,
    };
    
    configCacheTimestamp = Date.now();
    console.log('[economy-simulator] Loaded config from database');
    
    return configCache;
  } catch (err) {
    console.error('[economy-simulator] Exception loading config:', err);
    return configCache || FALLBACK_CONFIG;
  }
}

// ═══════════════════════════════════════════════════════════════
// TARIFF LOOKUP
// ═══════════════════════════════════════════════════════════════

let tarifaCache: Map<string, TarifaInfo> | null = null;
let tarifaCacheTimestamp = 0;
const TARIFA_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

/**
 * Load tariffs from database
 */
export async function loadTarifas(supabase: any): Promise<Map<string, TarifaInfo>> {
  if (tarifaCache && Date.now() - tarifaCacheTimestamp < TARIFA_CACHE_TTL_MS) {
    return tarifaCache;
  }
  
  try {
    const [{ data, error }, { data: icmsData, error: icmsError }] = await Promise.all([
      supabase
        .from('concessionarias')
        .select('nome, tarifa_com_impostos, tarifa_media, uf, pis_cofins'),
      supabase
        .from('icms_estados')
        .select('uf, icms_percentual'),
    ]);
    
    if (error) {
      console.error('[economy-simulator] Error loading tarifas:', error);
      return tarifaCache || new Map();
    }

    if (icmsError) {
      console.warn('[economy-simulator] Failed to load ICMS map, using fallback 18%');
    }

    const icmsMap = new Map<string, number>();
    for (const row of icmsData || []) {
      if (!row?.uf) continue;
      icmsMap.set(String(row.uf).toUpperCase(), Number(row.icms_percentual) / 100);
    }
    
    const map = new Map<string, TarifaInfo>();
    for (const row of data || []) {
      const nome = row?.nome;
      if (!nome) continue;

      const uf = (row.uf || '').toString().toUpperCase();
      const pisCofins = Number(row.pis_cofins ?? 0.0365);
      const icms = icmsMap.get(uf) ?? 0.18;

      // Prefer stored tarifa_com_impostos
      let tarifaFinal: number | null = (row.tarifa_com_impostos ?? null);

      // Otherwise estimate from tarifa_media
      if ((tarifaFinal === null || tarifaFinal <= 0) && row.tarifa_media && row.tarifa_media > 0 && uf) {
        const baseComPisCofins = Number(row.tarifa_media) / (1 - pisCofins);
        tarifaFinal = baseComPisCofins * (1 + icms);
      }

      if (!tarifaFinal || tarifaFinal <= 0) continue;

      const key = row.nome.toLowerCase().trim();
      map.set(key, {
        tarifa: tarifaFinal,
        uf: row.uf || '',
        distribuidora: row.nome,
      });
    }
    
    tarifaCache = map;
    tarifaCacheTimestamp = Date.now();
    console.log(`[economy-simulator] Loaded ${map.size} tarifas`);
    
    return map;
  } catch (err) {
    console.error('[economy-simulator] Exception loading tarifas:', err);
    return tarifaCache || new Map();
  }
}

/**
 * Find tarifa by distribuidora name (fuzzy match)
 */
export function findTarifa(distribuidora: string | undefined, tarifas: Map<string, TarifaInfo>): TarifaInfo | null {
  if (!distribuidora) return null;
  
  const searchKey = distribuidora.toLowerCase().trim();
  
  // Exact match
  if (tarifas.has(searchKey)) {
    return tarifas.get(searchKey)!;
  }
  
  // Partial match
  for (const [key, value] of tarifas.entries()) {
    if (key.includes(searchKey) || searchKey.includes(key)) {
      return value;
    }
  }
  
  // Match by prefix (CEMIG, CPFL, ENEL, etc.)
  const prefix = searchKey.split(/[\s\-]/)[0];
  if (prefix.length >= 3) {
    for (const [key, value] of tarifas.entries()) {
      if (key.startsWith(prefix)) {
        return value;
      }
    }
  }
  
  return null;
}

// ═══════════════════════════════════════════════════════════════
// CALCULATION HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Get disponibilidade by installation type
 */
function getDisponibilidade(tipo: 'Monofásico' | 'Bifásico' | 'Trifásico', config: EconomyConfig): number {
  switch (tipo) {
    case 'Monofásico': return config.disponibilidadeMonofasico;
    case 'Bifásico': return config.disponibilidadeBifasico;
    case 'Trifásico': return config.disponibilidadeTrifasico;
    default: return config.disponibilidadeBifasico;
  }
}

/**
 * Calculate discount based on consumption
 */
export function calcularDesconto(consumoKwh: number, config: EconomyConfig): number {
  return consumoKwh > config.unlockThreshold ? config.unlockDesconto : config.descontoDefault;
}

/**
 * Calculate fidelity based on consumption
 */
export function calcularFidelidade(consumoKwh: number, config: EconomyConfig): number {
  return consumoKwh > config.unlockThreshold ? config.unlockFidelidade : config.fidelidadeDefault;
}

/**
 * Infer installation type from consumption
 */
export function inferirTipoInstalacao(consumoKwh: number): 'Bifásico' | 'Trifásico' {
  return consumoKwh <= 1000 ? 'Bifásico' : 'Trifásico';
}

/**
 * Calculate consumption from bill value
 */
export function calcularConsumo(valorConta: number, tarifa: number, cip: number): number {
  if (tarifa <= 0) return 0;
  return Math.max(0, (valorConta - cip) / tarifa);
}

// ═══════════════════════════════════════════════════════════════
// MAIN SIMULATION
// ═══════════════════════════════════════════════════════════════

/**
 * Run economy simulation with given inputs
 */
export async function simularEconomia(
  supabase: any,
  input: SimulationInput,
  templates?: Map<string, MessageTemplate>
): Promise<SimulationResult | null> {
  // Load config from database
  const config = await loadEconomyConfig(supabase);
  
  // Load tarifas
  const tarifas = await loadTarifas(supabase);
  
  // Get tarifa
  let tarifa = config.tarifaFallback;
  let distribuidoraUsada = input.distribuidora || 'Distribuidora Média';
  
  const tarifaInfo = findTarifa(input.distribuidora, tarifas);
  if (tarifaInfo) {
    tarifa = tarifaInfo.tarifa;
    distribuidoraUsada = tarifaInfo.distribuidora;
  }
  
  // Calculate consumption
  let consumo: number;
  if (input.consumoKwh && input.consumoKwh > 0) {
    consumo = input.consumoKwh;
  } else if (input.valorConta && input.valorConta > 0) {
    consumo = calcularConsumo(input.valorConta, tarifa, config.cipDefault);
  } else {
    return null; // No input data
  }
  
  if (consumo <= 0) return null;
  
  // Determine installation type
  const tipoInstalacao = input.tipoInstalacao || inferirTipoInstalacao(consumo);
  const disponibilidadeKwh = getDisponibilidade(tipoInstalacao, config);
  
  // Calculate discount and fidelity
  const descontoPercentual = calcularDesconto(consumo, config);
  const fidelidadeAnos = calcularFidelidade(consumo, config);
  
  // Value calculations
  const disponibilidadeValor = disponibilidadeKwh * tarifa;
  const valorAtual = (consumo * tarifa) + config.cipDefault;
  
  // With COESA
  const consumoExcedente = Math.max(0, consumo - disponibilidadeKwh);
  const tarifaComDesconto = tarifa * (1 - descontoPercentual / 100);
  const valorComCoesa = (consumoExcedente * tarifaComDesconto) + disponibilidadeValor + config.cipDefault;
  
  // Savings
  const economiaMensal = valorAtual - valorComCoesa;
  const economiaAnual = economiaMensal * 12;
  
  // Accumulated savings over fidelity period (with inflation)
  let economiaAcumulada = 0;
  for (let ano = 1; ano <= fidelidadeAnos; ano++) {
    const fatorInflacao = Math.pow(1 + config.inflacaoEnergetica, ano - 1);
    economiaAcumulada += economiaAnual * fatorInflacao;
  }
  
  const economiaPercentual = valorAtual > 0 ? (economiaMensal / valorAtual) * 100 : 0;
  
  // Generate message from template
  const message = generateSimulationMessage({
    consumo: Math.round(consumo),
    valorAtual,
    valorComCoesa,
    economiaMensal,
    economiaAnual,
    economiaAcumulada,
    economiaPercentual,
    descontoPercentual,
    fidelidadeAnos,
    distribuidora: distribuidoraUsada,
  }, templates);
  
  return {
    consumoEstimado: Math.round(consumo),
    tipoInstalacao,
    tarifa,
    disponibilidadeKwh,
    disponibilidadeValor,
    valorAtual,
    valorComCoesa,
    economiaMensal,
    economiaAnual,
    economiaAcumulada,
    descontoPercentual,
    fidelidadeAnos,
    economiaPercentual,
    message,
  };
}

// ═══════════════════════════════════════════════════════════════
// MESSAGE GENERATION
// ═══════════════════════════════════════════════════════════════

interface MessageParams {
  consumo: number;
  valorAtual: number;
  valorComCoesa: number;
  economiaMensal: number;
  economiaAnual: number;
  economiaAcumulada: number;
  economiaPercentual: number;
  descontoPercentual: number;
  fidelidadeAnos: number;
  distribuidora: string;
}

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function generateSimulationMessage(params: MessageParams, templates?: Map<string, MessageTemplate>): string {
  const {
    consumo,
    valorAtual,
    valorComCoesa,
    economiaMensal,
    economiaAnual,
    economiaAcumulada,
    economiaPercentual,
    descontoPercentual,
    fidelidadeAnos,
  } = params;
  
  const isUnlock = descontoPercentual >= 30;
  const planoNome = isUnlock ? '🔓 UNLOCK' : '💎 Premium';
  
  // Try to get template from database
  const templateCache = templates || getTemplateCache();
  if (templateCache) {
    const rendered = getRenderedTemplate('economy', 'simulation_result', {
      consumo: consumo.toString(),
      valor_atual: formatCurrency(valorAtual),
      valor_coesa: formatCurrency(valorComCoesa),
      economia_mensal: formatCurrency(economiaMensal),
      economia_percentual: economiaPercentual.toFixed(1),
      economia_anual: formatCurrency(economiaAnual),
      fidelidade: fidelidadeAnos.toString(),
      economia_acumulada: formatCurrency(economiaAcumulada),
      plano_nome: planoNome,
      desconto: descontoPercentual.toString(),
    }, templateCache);
    
    if (rendered) return rendered;
  }
  
  // Fallback hardcoded message
  return `📊 **Simulação de Economia COESA**

Com base nos seus dados, veja o resultado:

🏠 **Consumo estimado:** ${consumo} kWh/mês
💡 **Valor atual:** ${formatCurrency(valorAtual)}/mês
💚 **Com COESA:** ${formatCurrency(valorComCoesa)}/mês

✨ **Sua economia:**
• Mensal: **${formatCurrency(economiaMensal)}** (${economiaPercentual.toFixed(1)}%)
• Anual: **${formatCurrency(economiaAnual)}**
• Em ${fidelidadeAnos} anos: **${formatCurrency(economiaAcumulada)}**

🎯 **Plano ${planoNome}** - ${descontoPercentual}% de desconto

Quer receber sua proposta personalizada? 💚`;
}

// ═══════════════════════════════════════════════════════════════
// DETECTION HELPERS (Zero Hardcode via patterns DB)
// ═══════════════════════════════════════════════════════════════

/**
 * Check if message is asking for economy simulation
 * Uses database patterns from category 'economy_simulation'
 */
export function isSimulationRequest(message: string, patterns?: Map<string, PatternEntry>): boolean {
  const lower = message.toLowerCase();
  
  // If we have patterns from DB, use them
  if (patterns) {
    // Check for question keyword
    const hasQuestionWord = matchesPatternCategory(lower, 'economy_simulation', patterns);
    
    // Check for value context
    const hasValueContext = matchesPatternCategory(lower, 'economy_value_context', patterns);
    
    if (hasQuestionWord && hasValueContext) {
      return true;
    }
  }
  
  // Fallback to hardcoded patterns
  const keywords = [
    'qual desconto',
    'qual seria',
    'quanto economizo',
    'quanto vou economizar',
    'quanto economizaria',
    'minha economia',
    'meu desconto',
    'calcula pra mim',
    'calcular economia',
    'simular',
    'simulação',
    'quanto pago',
    'quanto pagaria',
    'quanto fico pagando',
  ];
  
  const hasValueContext = /R\$|reais|\d+\s*kwh|conta\s+de|pago\s+\d|fatura|valor/i.test(message);
  const hasQuestionWord = keywords.some(kw => lower.includes(kw));
  
  return hasQuestionWord && hasValueContext;
}

/**
 * Extract bill value from message using DB patterns
 */
export function extractBillValue(message: string, patterns?: Map<string, PatternEntry>): number | null {
  // Fallback regex patterns for bill extraction
  const regexPatterns = [
    'R\\$\\s*(\\d+(?:[.,]\\d{2})?)',
    '(\\d+(?:[.,]\\d{2})?)\\s*reais',
    'conta\\s+(?:de\\s+)?(?:R\\$\\s*)?(\\d+(?:[.,]\\d{2})?)',
    'pago\\s+(?:R\\$\\s*)?(\\d+(?:[.,]\\d{2})?)',
    'fatura\\s+(?:de\\s+)?(?:R\\$\\s*)?(\\d+(?:[.,]\\d{2})?)',
    'gasto\\s+(?:R\\$\\s*)?(\\d+(?:[.,]\\d{2})?)',
    'valor\\s+(?:de\\s+)?(?:R\\$\\s*)?(\\d+(?:[.,]\\d{2})?)',
    '(\\d{3,4})\\s*(?:por\\s+m[eê]s|mensal|\\/m[eê]s)'
  ];
  
  for (const patternStr of regexPatterns) {
    try {
      const pattern = new RegExp(patternStr, 'i');
      const match = message.match(pattern);
      if (match && match[1]) {
        const value = parseFloat(match[1].replace(',', '.'));
        // Valid range: R$ 50 to R$ 50.000
        if (value >= 50 && value <= 50000) {
          return value;
        }
      }
    } catch (e) {
      console.error(`[economy-simulator] Invalid regex pattern: ${patternStr}`, e);
    }
  }
  
  return null;
}

/**
 * Extract consumption value from message using DB patterns
 */
export function extractConsumption(message: string, patterns?: Map<string, PatternEntry>): number | null {
  // Get regex patterns from DB using existing helper
  const dbRegexPatterns: RegExp[] = getRegexPatternsForCategory('economy_consumption_extract', patterns);
  const regexPatterns: string[] = dbRegexPatterns.map((rx: RegExp) => rx.source);
  
  // Add fallback patterns if none from DB
  if (regexPatterns.length === 0) {
    regexPatterns.push(
      '(\\d+)\\s*kwh',
      'consumo\\s+(?:de\\s+)?(\\d+)',
      '(\\d+)\\s*quilowatts?'
    );
  }
  
  for (const patternStr of regexPatterns) {
    try {
      const pattern = new RegExp(patternStr, 'i');
      const match = message.match(pattern);
      if (match && match[1]) {
        const value = parseInt(match[1], 10);
        // Valid range: 50 to 50.000 kWh
        if (value >= 50 && value <= 50000) {
          return value;
        }
      }
    } catch (e) {
      console.error(`[economy-simulator] Invalid regex pattern: ${patternStr}`, e);
    }
  }
  
  return null;
}

/**
 * Extract simulation inputs from message and conversation context
 */
export function extractSimulationInputs(
  message: string,
  conversationContext?: { valorFatura?: number; consumoMedio?: number; distribuidora?: string },
  patterns?: Map<string, PatternEntry>
): SimulationInput {
  const input: SimulationInput = {};
  
  // Extract from message using DB patterns
  const billValue = extractBillValue(message, patterns);
  const consumption = extractConsumption(message, patterns);
  
  if (billValue) input.valorConta = billValue;
  if (consumption) input.consumoKwh = consumption;
  
  // Use context if not in message
  if (!input.valorConta && conversationContext?.valorFatura) {
    input.valorConta = conversationContext.valorFatura;
  }
  if (!input.consumoKwh && conversationContext?.consumoMedio) {
    input.consumoKwh = conversationContext.consumoMedio;
  }
  if (conversationContext?.distribuidora) {
    input.distribuidora = conversationContext.distribuidora;
  }
  
  return input;
}
