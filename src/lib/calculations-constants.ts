// Constantes compartilhadas para cálculos de propostas
// NOTA: Este arquivo mantém valores de fallback. Os valores reais são carregados
// dinamicamente do banco de dados via useCalculationConfigs hook.

// Disponibilidade mínima por tipo de instalação (kWh) - FALLBACK
// Valores reais: configuracoes_sistema.calc_disponibilidade_*
export const DISPONIBILIDADE_MINIMA = {
  'Monofásico': 30,
  'Bifásico': 50,
  'Trifásico': 100,
};

// Inflação energética média anual (VALOR PADRÃO - pode ser sobrescrito dinamicamente)
// Valor real: configuracoes_sistema.calc_inflacao_energetica_default
export const INFLACAO_ENERGETICA_ANUAL_DEFAULT = 0.07; // 7% ao ano

// @deprecated Use INFLACAO_ENERGETICA_ANUAL_DEFAULT e passe o valor dinâmico via parâmetro
export const INFLACAO_ENERGETICA_ANUAL = 0.07; // 7% ao ano - mantido para compatibilidade

// PIS/COFINS padrão - FALLBACK
// Valor real: configuracoes_sistema.calc_pis_cofins_total
export const PIS_COFINS_ALIQUOTA_PADRAO = 0.0365; // 3.65%

// Constantes UNLOCK - FALLBACK
// Valores reais: configuracoes_sistema.calc_unlock_*
export const PLANO_UNLOCK_THRESHOLD = 3000; // kWh
export const PLANO_UNLOCK_DESCONTO = 30;    // %
export const PLANO_UNLOCK_FIDELIDADE = 4;   // anos

// Constantes de Usineiros - FALLBACK
// Valores reais: configuracoes_sistema.calc_*
export const VIDA_UTIL_ANOS = 25;
export const DEGRADACAO_ANUAL = 0.005; // 0.5%
export const PIS_COFINS_USINEIRO = 0.0925; // 9.25%
export const IRPJ_ALIQUOTA = 0.15;
export const CSLL_ALIQUOTA = 0.09;
export const ADICIONAL_IRPJ = 0.10;
export const IRPJ_ADICIONAL_THRESHOLD = 240000;
export const PRESUMIDO_PERCENTUAL = 0.32;

// Tipos de instalação
export const TIPOS_INSTALACAO = ['Monofásico', 'Bifásico', 'Trifásico'] as const;
export type TipoInstalacao = typeof TIPOS_INSTALACAO[number];
