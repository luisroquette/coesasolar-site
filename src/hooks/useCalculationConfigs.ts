import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Interface para todas as configurações de cálculo
export interface CalculationConfigs {
  // Disponibilidade mínima por tipo de instalação (kWh)
  disponibilidadeMonofasico: number;
  disponibilidadeBifasico: number;
  disponibilidadeTrifasico: number;
  
  // Plano UNLOCK
  unlockThreshold: number;
  unlockDesconto: number;
  unlockFidelidade: number;
  
  // Thresholds para inferência de tipo de instalação
  inferirTipoThreshold: number;      // > 1000 = Trifásico
  inferirTipoMonoThreshold: number;  // < 200 = Monofásico
  
  // Impostos federais
  pisAliquota: number;
  cofinsAliquota: number;
  pisCofinsTotal: number;
  
  // Usineiros
  vidaUtilAnos: number;
  degradacaoAnual: number;
  irpjAliquota: number;
  csllAliquota: number;
  adicionalIrpj: number;
  irpjAdicionalThreshold: number;
  presumidoPercentual: number;
  pisCofinsUsineiro: number;
  
  // Inflação
  inflacaoEnergeticaDefault: number;
  
  // GD2 Transição
  gd2TransicaoInicio: number;
  gd2TransicaoFim: number;
  gd2Percentuais: Record<string, number>;
  
  // ICMS Fallback
  icmsFallbackEstados: Record<string, number>;
  icmsFallbackDefault: number;
  
  // Cronograma GD2 (Lei 14.300)
  cronogramaGd2: Record<string, number>;
  
  // Bandeiras tarifárias fallback
  bandeirasValores: Record<string, number>;
  
  // Fator de simultaneidade
  fatorSimultaneidade: Record<string, { min: number; max: number; default: number }>;
  
  // Estado de carregamento
  loaded: boolean;
}

// Valores padrão (fallback)
const DEFAULT_CONFIGS: CalculationConfigs = {
  disponibilidadeMonofasico: 30,
  disponibilidadeBifasico: 50,
  disponibilidadeTrifasico: 100,
  
  unlockThreshold: 3000,
  unlockDesconto: 30,
  unlockFidelidade: 4,
  
  inferirTipoThreshold: 1000,
  inferirTipoMonoThreshold: 200,
  
  pisAliquota: 0.0065,
  cofinsAliquota: 0.03,
  pisCofinsTotal: 0.0365,
  
  vidaUtilAnos: 25,
  degradacaoAnual: 0.005,
  irpjAliquota: 0.15,
  csllAliquota: 0.09,
  adicionalIrpj: 0.10,
  irpjAdicionalThreshold: 240000,
  presumidoPercentual: 0.32,
  pisCofinsUsineiro: 0.0925,
  
  inflacaoEnergeticaDefault: 0.07,
  
  gd2TransicaoInicio: 2024,
  gd2TransicaoFim: 2028,
  gd2Percentuais: {
    '2024': 0.15,
    '2025': 0.30,
    '2026': 0.45,
    '2027': 0.60,
    '2028': 0.75,
    '2029': 0.90,
    '2030': 1.00,
  },
  
  // ICMS Fallback
  icmsFallbackEstados: {
    'AC': 0.17, 'AL': 0.18, 'AP': 0.17, 'AM': 0.18, 'BA': 0.18,
    'CE': 0.18, 'DF': 0.18, 'ES': 0.17, 'GO': 0.17, 'MA': 0.22,
    'MT': 0.17, 'MS': 0.17, 'MG': 0.18, 'PA': 0.17, 'PB': 0.18,
    'PR': 0.18, 'PE': 0.18, 'PI': 0.18, 'RJ': 0.18, 'RN': 0.18,
    'RS': 0.30, 'RO': 0.175, 'RR': 0.17, 'SC': 0.25, 'SP': 0.18,
    'SE': 0.18, 'TO': 0.18,
  },
  icmsFallbackDefault: 0.18,
  
  // Cronograma GD2 (Lei 14.300)
  cronogramaGd2: {
    '2023': 0.15, '2024': 0.30, '2025': 0.45, '2026': 0.60,
    '2027': 0.75, '2028': 0.90, '2029': 1.00,
  },
  
  // Bandeiras tarifárias
  bandeirasValores: {
    'verde': 0, 'amarela': 0.01885, 'vermelha1': 0.04463, 'vermelha2': 0.07877,
  },
  
  // Fator de simultaneidade
  fatorSimultaneidade: {
    'residencial': { min: 0.20, max: 0.40, default: 0.30 },
    'comercial_diurno': { min: 0.50, max: 0.70, default: 0.60 },
    'industrial': { min: 0.70, max: 0.85, default: 0.75 },
    'agro_bombeamento': { min: 0.30, max: 0.60, default: 0.45 },
  },
  
  loaded: false,
};

// Cache simples
let cachedConfigs: CalculationConfigs | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

export function useCalculationConfigs(): CalculationConfigs {
  const [configs, setConfigs] = useState<CalculationConfigs>(cachedConfigs || DEFAULT_CONFIGS);

  useEffect(() => {
    async function loadConfigs() {
      // Usar cache se válido
      if (cachedConfigs && Date.now() - cacheTimestamp < CACHE_TTL) {
        setConfigs(cachedConfigs);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('configuracoes_sistema')
          .select('chave, valor')
          .like('chave', 'calc_%');

        if (error) throw error;

        const configMap = new Map<string, string>();
        data?.forEach((item) => {
          configMap.set(item.chave, item.valor);
        });

        const parseFloat = (key: string, fallback: number): number => {
          const val = configMap.get(key);
          if (!val) return fallback;
          const parsed = Number(val);
          return isNaN(parsed) ? fallback : parsed;
        };

        const parseInt = (key: string, fallback: number): number => {
          const val = configMap.get(key);
          if (!val) return fallback;
          const parsed = Number(val);
          return isNaN(parsed) ? fallback : Math.floor(parsed);
        };

        const parseJSON = (key: string, fallback: Record<string, number>): Record<string, number> => {
          const val = configMap.get(key);
          if (!val) return fallback;
          try {
            return JSON.parse(val);
          } catch {
            return fallback;
          }
        };

        const parseJSONGeneric = <T,>(key: string, fallback: T): T => {
          const val = configMap.get(key);
          if (!val) return fallback;
          try {
            return JSON.parse(val) as T;
          } catch {
            return fallback;
          }
        };

        const loadedConfigs: CalculationConfigs = {
          disponibilidadeMonofasico: parseFloat('calc_disponibilidade_monofasico', DEFAULT_CONFIGS.disponibilidadeMonofasico),
          disponibilidadeBifasico: parseFloat('calc_disponibilidade_bifasico', DEFAULT_CONFIGS.disponibilidadeBifasico),
          disponibilidadeTrifasico: parseFloat('calc_disponibilidade_trifasico', DEFAULT_CONFIGS.disponibilidadeTrifasico),
          
          unlockThreshold: parseFloat('calc_unlock_threshold', DEFAULT_CONFIGS.unlockThreshold),
          unlockDesconto: parseFloat('calc_unlock_desconto', DEFAULT_CONFIGS.unlockDesconto),
          unlockFidelidade: parseInt('calc_unlock_fidelidade', DEFAULT_CONFIGS.unlockFidelidade),
          
          inferirTipoThreshold: parseFloat('calc_inferir_tipo_threshold', DEFAULT_CONFIGS.inferirTipoThreshold),
          inferirTipoMonoThreshold: parseFloat('calc_inferir_tipo_mono_threshold', DEFAULT_CONFIGS.inferirTipoMonoThreshold),
          
          pisAliquota: parseFloat('calc_pis_aliquota', DEFAULT_CONFIGS.pisAliquota),
          cofinsAliquota: parseFloat('calc_cofins_aliquota', DEFAULT_CONFIGS.cofinsAliquota),
          pisCofinsTotal: parseFloat('calc_pis_cofins_total', DEFAULT_CONFIGS.pisCofinsTotal),
          
          vidaUtilAnos: parseInt('calc_vida_util_anos', DEFAULT_CONFIGS.vidaUtilAnos),
          degradacaoAnual: parseFloat('calc_degradacao_anual', DEFAULT_CONFIGS.degradacaoAnual),
          irpjAliquota: parseFloat('calc_irpj_aliquota', DEFAULT_CONFIGS.irpjAliquota),
          csllAliquota: parseFloat('calc_csll_aliquota', DEFAULT_CONFIGS.csllAliquota),
          adicionalIrpj: parseFloat('calc_adicional_irpj', DEFAULT_CONFIGS.adicionalIrpj),
          irpjAdicionalThreshold: parseFloat('calc_irpj_adicional_threshold', DEFAULT_CONFIGS.irpjAdicionalThreshold),
          presumidoPercentual: parseFloat('calc_presumido_percentual', DEFAULT_CONFIGS.presumidoPercentual),
          pisCofinsUsineiro: parseFloat('calc_pis_cofins_usineiro', DEFAULT_CONFIGS.pisCofinsUsineiro),
          
          inflacaoEnergeticaDefault: parseFloat('calc_inflacao_energetica_default', DEFAULT_CONFIGS.inflacaoEnergeticaDefault),
          
          gd2TransicaoInicio: parseInt('calc_gd2_transicao_inicio', DEFAULT_CONFIGS.gd2TransicaoInicio),
          gd2TransicaoFim: parseInt('calc_gd2_transicao_fim', DEFAULT_CONFIGS.gd2TransicaoFim),
          gd2Percentuais: parseJSON('calc_gd2_percentuais', DEFAULT_CONFIGS.gd2Percentuais),
          
          // Phase 13: ICMS, GD2, Bandeiras, Fator Simultaneidade
          icmsFallbackEstados: parseJSON('calc_icms_fallback_estados', DEFAULT_CONFIGS.icmsFallbackEstados),
          icmsFallbackDefault: parseFloat('calc_icms_fallback_default', DEFAULT_CONFIGS.icmsFallbackDefault),
          cronogramaGd2: parseJSON('calc_cronograma_gd2', DEFAULT_CONFIGS.cronogramaGd2),
          bandeirasValores: parseJSON('calc_bandeiras_valores', DEFAULT_CONFIGS.bandeirasValores),
          fatorSimultaneidade: parseJSONGeneric('calc_fator_simultaneidade', DEFAULT_CONFIGS.fatorSimultaneidade),
          
          loaded: true,
        };

        cachedConfigs = loadedConfigs;
        cacheTimestamp = Date.now();
        setConfigs(loadedConfigs);
      } catch (err) {
        console.error('Erro ao carregar configs de cálculo:', err);
        setConfigs({ ...DEFAULT_CONFIGS, loaded: true });
      }
    }

    loadConfigs();
  }, []);

  return configs;
}

// Função para obter disponibilidade por tipo de instalação
export function getDisponibilidade(
  tipoInstalacao: 'Monofásico' | 'Bifásico' | 'Trifásico',
  configs: CalculationConfigs = DEFAULT_CONFIGS
): number {
  switch (tipoInstalacao) {
    case 'Monofásico':
      return configs.disponibilidadeMonofasico;
    case 'Bifásico':
      return configs.disponibilidadeBifasico;
    case 'Trifásico':
      return configs.disponibilidadeTrifasico;
    default:
      return configs.disponibilidadeBifasico;
  }
}

// Função para obter percentual GD2 por ano
export function getPercentualGD2(
  ano: number,
  configs: CalculationConfigs = DEFAULT_CONFIGS
): number {
  // Antes do início da transição
  if (ano < configs.gd2TransicaoInicio) return 0;
  
  // Depois do fim da transição
  if (ano >= configs.gd2TransicaoFim + 2) return 1;
  
  // Durante a transição - busca no mapa
  const percentual = configs.gd2Percentuais[ano.toString()];
  if (percentual !== undefined) return percentual;
  
  // Fallback linear
  const anosTransicao = configs.gd2TransicaoFim - configs.gd2TransicaoInicio + 2;
  const anosDecorridos = ano - configs.gd2TransicaoInicio;
  return Math.min(1, anosDecorridos / anosTransicao);
}

// Exporta defaults para uso como fallback
export { DEFAULT_CONFIGS };

// Função síncrona para obter configs do cache (útil para funções puras)
export function getCachedConfigs(): CalculationConfigs {
  return cachedConfigs || DEFAULT_CONFIGS;
}

// Limpa o cache (útil para testes ou reload forçado)
export function clearConfigsCache(): void {
  cachedConfigs = null;
  cacheTimestamp = 0;
}
