// Cálculos para Propostas de Assinantes
// NOTA: Constantes agora são carregadas dinamicamente via useCalculationConfigs
// Os valores aqui são fallbacks para compatibilidade

import { 
  INFLACAO_ENERGETICA_ANUAL_DEFAULT,
  PLANO_UNLOCK_THRESHOLD as UNLOCK_THRESHOLD_FALLBACK,
  PLANO_UNLOCK_DESCONTO as UNLOCK_DESCONTO_FALLBACK,
  PLANO_UNLOCK_FIDELIDADE as UNLOCK_FIDELIDADE_FALLBACK,
  PIS_COFINS_ALIQUOTA_PADRAO,
  VIDA_UTIL_ANOS as VIDA_UTIL_FALLBACK,
  DEGRADACAO_ANUAL as DEGRADACAO_FALLBACK,
  PIS_COFINS_USINEIRO as PIS_COFINS_USINEIRO_FALLBACK,
  IRPJ_ALIQUOTA as IRPJ_FALLBACK,
  CSLL_ALIQUOTA as CSLL_FALLBACK,
  ADICIONAL_IRPJ as ADICIONAL_IRPJ_FALLBACK,
  IRPJ_ADICIONAL_THRESHOLD as IRPJ_THRESHOLD_FALLBACK,
  PRESUMIDO_PERCENTUAL as PRESUMIDO_FALLBACK,
} from './calculations-constants';

export interface AssinanteInput {
  tarifa: number;
  cip: number;
  consumoMedio: number;
  fidelidadeAnos: number;
  descontoPercentual: number;
  tipoInstalacao: 'Monofásico' | 'Bifásico' | 'Trifásico';
  numeroUcs: number;
}

export interface AssinanteOutput {
  disponibilidade: number;
  consumoFaturado: number;
  valorSemCoesa: number;
  valorComCoesa: number;
  economiaMensal: number;
  economiaAnual: number;
  economiaAcumulada: number;
  projecaoAnual: { ano: number; semCoesa: number; comCoesa: number; economia: number }[];
}

// Disponibilidade mínima por tipo de instalação (kWh) - FALLBACK
// Valores reais via useCalculationConfigs ou getCachedConfigs
const DISPONIBILIDADE_MINIMA = {
  'Monofásico': 30,
  'Bifásico': 50,
  'Trifásico': 100,
};

// ===== CONSTANTES DO PLANO UNLOCK - FALLBACKS =====
// Valores reais: configuracoes_sistema.calc_unlock_*
export const PLANO_UNLOCK_THRESHOLD = UNLOCK_THRESHOLD_FALLBACK;
export const PLANO_UNLOCK_DESCONTO = UNLOCK_DESCONTO_FALLBACK;
export const PLANO_UNLOCK_FIDELIDADE = UNLOCK_FIDELIDADE_FALLBACK;

/**
 * Calcula o desconto padrão baseado no consumo médio
 * @param consumoKwh Consumo em kWh
 * @param unlockThreshold Threshold dinâmico (padrão: 3000)
 * @param unlockDesconto Desconto UNLOCK (padrão: 30)
 */
export function calcularDescontoPadrao(
  consumoKwh: number,
  unlockThreshold = PLANO_UNLOCK_THRESHOLD,
  unlockDesconto = PLANO_UNLOCK_DESCONTO
): number {
  return consumoKwh > unlockThreshold ? unlockDesconto : 25;
}

/**
 * Calcula a fidelidade padrão baseada no consumo médio
 * @param consumoKwh Consumo em kWh
 * @param unlockThreshold Threshold dinâmico (padrão: 3000)
 * @param unlockFidelidade Fidelidade UNLOCK em anos (padrão: 4)
 */
export function calcularFidelidadePadrao(
  consumoKwh: number,
  unlockThreshold = PLANO_UNLOCK_THRESHOLD,
  unlockFidelidade = PLANO_UNLOCK_FIDELIDADE
): { meses: number; anos: number } {
  const anos = consumoKwh > unlockThreshold ? unlockFidelidade : 3;
  return { meses: anos * 12, anos };
}

// ===== CÁLCULOS REVERSOS PARA PROPOSTA INICIAL =====

/**
 * Calcula o consumo médio em kWh a partir do valor da conta de luz
 * Fórmula: consumo = valorConta / tarifaComImpostos
 */
export function calcularConsumoReverso(valorConta: number, tarifaComImpostos: number): number {
  if (tarifaComImpostos <= 0) return 0;
  return valorConta / tarifaComImpostos;
}

/**
 * Infere o tipo de instalação com base no consumo médio
 * Regras (configuráveis via calc_inferir_tipo_threshold):
 * - 0 a threshold kWh → Bifásico
 * - > threshold kWh → Trifásico
 * - Nunca retorna Monofásico (decisão de negócio)
 */
export function inferirTipoInstalacao(consumoKwh: number): 'Bifásico' | 'Trifásico' {
  return consumoKwh <= 1000 ? 'Bifásico' : 'Trifásico';
}

/**
 * Verifica se a proposta é do tipo "inicial" (simplificada)
 * baseada em dados inferidos vs dados informados
 */
export interface PropostaInicialMetadata {
  tipoPropostaInicial: boolean;
  consumoInferido: boolean;
  tipoInstalacaoInferido: boolean;
  valorContaOriginal?: number;
}

export function criarMetadataPropostaInicial(
  valorConta: number,
  tarifaComImpostos: number
): { consumoMedio: number; tipoInstalacao: 'Bifásico' | 'Trifásico'; metadata: PropostaInicialMetadata } {
  const consumoMedio = calcularConsumoReverso(valorConta, tarifaComImpostos);
  const tipoInstalacao = inferirTipoInstalacao(consumoMedio);
  
  return {
    consumoMedio: Math.round(consumoMedio), // Arredonda para número inteiro
    tipoInstalacao,
    metadata: {
      tipoPropostaInicial: true,
      consumoInferido: true,
      tipoInstalacaoInferido: true,
      valorContaOriginal: valorConta,
    },
  };
}

export function calcularPropostaAssinante(input: AssinanteInput, inflacaoEnergetica: number = INFLACAO_ENERGETICA_ANUAL_DEFAULT): AssinanteOutput {
  const disponibilidadeKwh = DISPONIBILIDADE_MINIMA[input.tipoInstalacao] * input.numeroUcs;
  
  // Valor da disponibilidade em R$ (kWh × tarifa)
  const disponibilidadeValor = disponibilidadeKwh * input.tarifa;
  
  // SEM COESA: cliente paga apenas consumo × tarifa + CIP
  // (não paga disponibilidade separada - está embutida no consumo)
  const valorSemCoesa = (input.consumoMedio * input.tarifa) + input.cip;
  
  // COM COESA: 
  // 1. Consumo EXCEDENTE à disponibilidade × tarifa com desconto
  // 2. MAIS disponibilidade na tarifa cheia (sem desconto)
  // 3. MAIS CIP
  // Fórmula: ((Consumo - Disponibilidade) × (Tarifa × (1 - Desconto))) + (Disponibilidade × Tarifa) + CIP
  const consumoExcedente = Math.max(0, input.consumoMedio - disponibilidadeKwh);
  const tarifaComDesconto = input.tarifa * (1 - input.descontoPercentual / 100);
  const valorConsumoExcedenteComDesconto = consumoExcedente * tarifaComDesconto;
  const valorComCoesa = valorConsumoExcedenteComDesconto + disponibilidadeValor + input.cip;
  
  // Economia mensal (pode ser negativa se desconto não compensa a disponibilidade)
  const economiaMensal = valorSemCoesa - valorComCoesa;
  
  // Economia anual
  const economiaAnual = economiaMensal * 12;
  
  // Economia acumulada no período de fidelidade
  let economiaAcumulada = 0;
  const projecaoAnual: { ano: number; semCoesa: number; comCoesa: number; economia: number }[] = [];
  
  for (let ano = 1; ano <= input.fidelidadeAnos; ano++) {
    const fatorInflacao = Math.pow(1 + inflacaoEnergetica, ano - 1);
    const semCoesaAno = valorSemCoesa * 12 * fatorInflacao;
    const comCoesaAno = valorComCoesa * 12 * fatorInflacao;
    const economiaAno = semCoesaAno - comCoesaAno;
    
    economiaAcumulada += economiaAno;
    
    projecaoAnual.push({
      ano,
      semCoesa: semCoesaAno,
      comCoesa: comCoesaAno,
      economia: economiaAno,
    });
  }
  
  return {
    disponibilidade: disponibilidadeValor,
    consumoFaturado: input.consumoMedio,
    valorSemCoesa,
    valorComCoesa,
    economiaMensal,
    economiaAnual,
    economiaAcumulada,
    projecaoAnual,
  };
}

// ===== CÁLCULO GD2 COMPLETO PARA ASSINANTES (MODELO COESA) =====

/**
 * Input completo para cálculo de proposta de assinante com estratificação GD2
 * 
 * MODELO COESA: Cliente recebe 2 boletos
 * 1. Boleto Concessionária: Disponibilidade + CIP + custo GD2 (Fio B) + tributos
 * 2. Boleto COESA: Energia compensada × tarifa COESA + taxa bancária
 */
export interface AssinanteInputGD2 {
  // Consumo
  consumoMedio: number;
  tipoInstalacao: 'Monofásico' | 'Bifásico' | 'Trifásico';
  numeroUcs: number;
  
  // Tarifas separadas (da concessionária)
  te: number;                    // Tarifa de Energia (R$/kWh)
  tusd: number;                  // TUSD total (R$/kWh)
  tusdFioB: number;              // TUSD Fio B (R$/kWh) - para GD2
  
  // Tributos
  aliqIcms: number;              // ex: 0.18 para 18%
  aliqPisCofins: number;         // ex: 0.0553 para 5,53% (varia por concessionária)
  icmsIsentaCompensacao: boolean; // Convênio 16/2015
  
  // Bandeira
  bandeiraNome: string;
  bandeiraValorKwh: number;
  
  // Custos adicionais
  cip: number;
  
  // Comerciais COESA
  tarifaCoesa: number;           // R$/kWh cobrado pela COESA
  taxaBancariaCoesa: number;     // Taxa fixa por boleto COESA
  
  // Condições
  fidelidadeAnos: number;
  
  // Ano de referência para GD2
  anoReferencia: number;
}

/**
 * Composição da fatura da CONCESSIONÁRIA (sem COESA/GD)
 */
export interface FaturaConcessionaria {
  // Componentes base
  consumoKwh: number;
  disponibilidadeKwh: number;
  disponibilidadeValor: number;
  teValor: number;
  tusdValor: number;
  bandeiraValor: number;
  cipValor: number;
  
  // Para cenário COM GD (conta residual)
  gd2FioBValor: number;          // Custo Fio B GD2
  
  // Tributos
  subtotalSemTributos: number;
  pisCofinsValor: number;
  icmsValor: number;
  totalTributos: number;
  
  total: number;
}

/**
 * Composição da fatura COESA
 */
export interface FaturaCoesa {
  energiaCompensadaKwh: number;
  tarifaCoesa: number;           // R$/kWh
  valorEnergia: number;          // kWh × tarifa
  taxaBancaria: number;          // Taxa fixa
  total: number;
}

/**
 * Output completo com modelo de faturas separadas (Concessionária + COESA)
 */
export interface AssinanteOutputGD2 {
  // Cenário SEM COESA (conta normal da concessionária)
  contaSemCoesa: FaturaConcessionaria;
  
  // Cenário COM COESA (2 boletos)
  contaConcessionaria: FaturaConcessionaria;  // Boleto 1: Disponibilidade + CIP + GD2
  contaCoesa: FaturaCoesa;                    // Boleto 2: Energia × tarifa + taxa
  totalComCoesa: number;                      // Soma dos 2 boletos
  
  // Economia
  economiaMensal: number;
  economiaPercentual: number;
  economiaAnual: number;
  economiaAcumulada: number;
  
  // Dados GD2
  percentualGD2: number;
  icmsIsentaCompensacao: boolean;
  
  // Projeção multi-ano
  projecaoAnual: { 
    ano: number; 
    semCoesa: number; 
    comCoesa: number; 
    economia: number;
    percentualGD2: number;
  }[];
  
  // Dados de disponibilidade
  disponibilidadeKwh: number;
  disponibilidadeValor: number;
}

// Usa alíquota importada de calculations-constants (fallback)
// Valor real: configuracoes_sistema.calc_pis_cofins_total

/**
 * Calcula proposta de assinante com modelo COESA de faturas separadas
 * 
 * MODELO OPERACIONAL COESA:
 * 1. Cliente recebe 2 boletos:
 *    - Boleto CONCESSIONÁRIA: Disponibilidade + CIP + GD2 (Fio B) + tributos
 *    - Boleto COESA: Energia compensada × tarifa COESA + taxa bancária
 * 
 * 2. Economia = Fatura SEM COESA - (Fatura Concessionária + Fatura COESA)
 */
export function calcularPropostaAssinanteGD2(input: AssinanteInputGD2, inflacaoEnergetica: number = INFLACAO_ENERGETICA_ANUAL_DEFAULT): AssinanteOutputGD2 {
  const disponibilidadeKwh = DISPONIBILIDADE_MINIMA[input.tipoInstalacao] * input.numeroUcs;
  const percentualGD2 = getPercentualGD2(input.anoReferencia);
  const tarifaCheia = input.te + input.tusd;
  
  const aliqPisCofins = input.aliqPisCofins || PIS_COFINS_ALIQUOTA_PADRAO;
  
  // === CENÁRIO SEM COESA (conta normal da concessionária) ===
  const contaSemCoesa = calcularFaturaConcessionaria({
    consumoKwh: input.consumoMedio,
    consumoCompensadoKwh: 0,  // Sem GD = paga tudo
    te: input.te,
    tusd: input.tusd,
    tusdFioB: input.tusdFioB,
    bandeiraValorKwh: input.bandeiraValorKwh,
    disponibilidadeKwh,
    tarifaCheia,
    cip: input.cip,
    aliqPisCofins,
    aliqIcms: input.aliqIcms,
    icmsIsentaCompensacao: input.icmsIsentaCompensacao,
    percentualGD2,
  });
  
  // === CENÁRIO COM COESA (2 boletos) ===
  
  // BOLETO 1: Concessionária (só paga disponibilidade + CIP + GD2)
  const contaConcessionaria = calcularFaturaConcessionaria({
    consumoKwh: input.consumoMedio,
    consumoCompensadoKwh: input.consumoMedio, // Compensação total - usina cobre 100%
    te: input.te,
    tusd: input.tusd,
    tusdFioB: input.tusdFioB,
    bandeiraValorKwh: input.bandeiraValorKwh,
    disponibilidadeKwh,
    tarifaCheia,
    cip: input.cip,
    aliqPisCofins,
    aliqIcms: input.aliqIcms,
    icmsIsentaCompensacao: input.icmsIsentaCompensacao,
    percentualGD2,
  });
  
  // BOLETO 2: COESA (energia compensada × tarifa COESA + taxa bancária)
  const contaCoesa: FaturaCoesa = {
    energiaCompensadaKwh: input.consumoMedio,
    tarifaCoesa: input.tarifaCoesa,
    valorEnergia: input.consumoMedio * input.tarifaCoesa,
    taxaBancaria: input.taxaBancariaCoesa,
    total: (input.consumoMedio * input.tarifaCoesa) + input.taxaBancariaCoesa,
  };
  
  // Total COM COESA = Boleto Concessionária + Boleto COESA
  const totalComCoesa = contaConcessionaria.total + contaCoesa.total;
  
  // === ECONOMIA ===
  const economiaMensal = contaSemCoesa.total - totalComCoesa;
  const economiaPercentual = contaSemCoesa.total > 0 
    ? (economiaMensal / contaSemCoesa.total) * 100 
    : 0;
  const economiaAnual = economiaMensal * 12;
  
  // === PROJEÇÃO MULTI-ANO ===
  let economiaAcumulada = 0;
  const projecaoAnual: { 
    ano: number; 
    semCoesa: number; 
    comCoesa: number; 
    economia: number;
    percentualGD2: number;
  }[] = [];
  
  for (let ano = 1; ano <= input.fidelidadeAnos; ano++) {
    const anoReal = input.anoReferencia + ano - 1;
    const percentualGD2Ano = getPercentualGD2(anoReal);
    const fatorInflacao = Math.pow(1 + inflacaoEnergetica, ano - 1);
    
    // Recalcular fatura concessionária para o ano específico
    const contaConcessionariaAno = calcularFaturaConcessionaria({
      consumoKwh: input.consumoMedio,
      consumoCompensadoKwh: input.consumoMedio,
      te: input.te * fatorInflacao,
      tusd: input.tusd * fatorInflacao,
      tusdFioB: input.tusdFioB * fatorInflacao,
      bandeiraValorKwh: input.bandeiraValorKwh,
      disponibilidadeKwh,
      tarifaCheia: tarifaCheia * fatorInflacao,
      cip: input.cip * fatorInflacao,
      aliqPisCofins,
      aliqIcms: input.aliqIcms,
      icmsIsentaCompensacao: input.icmsIsentaCompensacao,
      percentualGD2: percentualGD2Ano,
    });
    
    // Tarifa COESA também corrigida pela inflação
    const tarifaCoesaAno = input.tarifaCoesa * fatorInflacao;
    const contaCoesaAno = (input.consumoMedio * tarifaCoesaAno) + input.taxaBancariaCoesa;
    
    const comCoesaAno = (contaConcessionariaAno.total + contaCoesaAno) * 12;
    const semCoesaAno = contaSemCoesa.total * 12 * fatorInflacao;
    const economiaAno = semCoesaAno - comCoesaAno;
    
    economiaAcumulada += economiaAno;
    
    projecaoAnual.push({
      ano,
      semCoesa: semCoesaAno,
      comCoesa: comCoesaAno,
      economia: economiaAno,
      percentualGD2: percentualGD2Ano * 100,
    });
  }
  
  return {
    contaSemCoesa,
    contaConcessionaria,
    contaCoesa,
    totalComCoesa,
    economiaMensal,
    economiaPercentual,
    economiaAnual,
    economiaAcumulada,
    percentualGD2: percentualGD2 * 100,
    icmsIsentaCompensacao: input.icmsIsentaCompensacao,
    projecaoAnual,
    disponibilidadeKwh,
    disponibilidadeValor: disponibilidadeKwh * tarifaCheia,
  };
}

/**
 * Calcula fatura da CONCESSIONÁRIA
 * 
 * REGRAS TRIBUTÁRIAS BRASILEIRAS:
 * 1. PIS/COFINS: tributos FEDERAIS sobre FATURAMENTO - NÃO COMPENSAM com energia
 *    - Incidem sobre QUALQUER valor remanescente na fatura
 *    - Mesmo com compensação 100%, continuam incidindo sobre disponibilidade, CIP, GD2
 * 
 * 2. ICMS: incide sobre o subtotal com PIS/COFINS
 *    - Se estado isenta compensação (Convênio 16/2015): não cobra sobre energia compensada
 *    - Se não isenta: cobra sobre energia compensada também
 */
interface FaturaConcessionariaInput {
  consumoKwh: number;
  consumoCompensadoKwh: number;
  te: number;
  tusd: number;
  tusdFioB: number;
  bandeiraValorKwh: number;
  disponibilidadeKwh: number;
  tarifaCheia: number;
  cip: number;
  aliqPisCofins: number;
  aliqIcms: number;
  icmsIsentaCompensacao: boolean;
  percentualGD2: number;
}

function calcularFaturaConcessionaria(input: FaturaConcessionariaInput): FaturaConcessionaria {
  // Consumo líquido (não compensado)
  const consumoLiquidoKwh = Math.max(0, input.consumoKwh - input.consumoCompensadoKwh);
  
  // === VALORES BASE (sem tributos) ===
  
  // TE e TUSD: só sobre consumo NÃO compensado
  const teValor = consumoLiquidoKwh * input.te;
  const tusdValor = consumoLiquidoKwh * input.tusd;
  
  // GD2 Fio B: cobrança sobre energia COMPENSADA (Lei 14.300)
  const gd2FioBValor = input.consumoCompensadoKwh * input.tusdFioB * input.percentualGD2;
  
  // Bandeira: só sobre consumo líquido
  const bandeiraValor = consumoLiquidoKwh * input.bandeiraValorKwh;
  
  // Disponibilidade (SEMPRE cobrada, nunca compensa)
  const disponibilidadeValor = input.disponibilidadeKwh * input.tarifaCheia;
  
  // CIP (SEMPRE cobrada, valor fixo municipal)
  const cipValor = input.cip;
  
  // Subtotal antes de tributos
  const subtotalSemTributos = teValor + tusdValor + gd2FioBValor + bandeiraValor + disponibilidadeValor + cipValor;
  
  // === TRIBUTOS ===
  
  // PIS/COFINS: incidência "por dentro" (gross-up)
  // Base = subtotal / (1 - alíquota)
  const baseComPisCofins = subtotalSemTributos / (1 - input.aliqPisCofins);
  const pisCofinsValor = baseComPisCofins - subtotalSemTributos;
  
  // ICMS: incide sobre base com PIS/COFINS
  let baseIcms = baseComPisCofins;
  
  // Se estado NÃO isenta compensação, adiciona energia compensada à base do ICMS
  if (!input.icmsIsentaCompensacao && input.consumoCompensadoKwh > 0) {
    const valorEnergiaCompensada = input.consumoCompensadoKwh * input.tarifaCheia;
    baseIcms += valorEnergiaCompensada;
  }
  
  const icmsValor = baseIcms * input.aliqIcms;
  const totalTributos = pisCofinsValor + icmsValor;
  
  // Total = base com PIS/COFINS + ICMS
  const total = baseComPisCofins + icmsValor;
  
  return {
    consumoKwh: input.consumoKwh,
    disponibilidadeKwh: input.disponibilidadeKwh,
    disponibilidadeValor,
    teValor,
    tusdValor,
    bandeiraValor,
    cipValor,
    gd2FioBValor,
    subtotalSemTributos,
    pisCofinsValor,
    icmsValor,
    totalTributos,
    total,
  };
}

// Cálculos para Propostas de Usineiros

export interface UsineiroInput {
  // Capacidade
  potenciaMwp: number;
  oversizing: number;
  indiceSolarimetrico: number; // kWh/kWp/mês
  
  // Comercialização
  tarifaMedia: number;
  taxaAdministracao: number;
  descontoClienteFinal: number;
  
  // Custos
  capexTotal: number;
  omPercentual: number;
  arrendamentoMensal: number;
  seguroAnual: number;
  contabilidadeMensal: number;
  
  // Financiamento (opcional)
  financiamentoValor?: number;
  financiamentoCarenciaMeses?: number;
  financiamentoPrazoMeses?: number;
  financiamentoTaxa?: number;
  
  // Regime tributário
  regimeTributario: 'SIMPLES' | 'Lucro Presumido';
  
  // Parâmetros macro
  ipca: number;
  cdi: number;
  inflacaoEnergetica: number;
}

export interface UsineiroOutput {
  geracaoMensalMwh: number;
  geracaoAnualMwh: number;
  receitaBrutaMensal: number;
  receitaBrutaAnual: number;
  receitaLiquidaMensal: number;
  receitaLiquidaAnual: number;
  ebitdaAnual: number;
  lucroLiquidoAnual: number;
  tir: number;
  vpl: number;
  paybackAnos: number;
  fluxoCaixa: FluxoCaixaAnual[];
}

export interface FluxoCaixaAnual {
  ano: number;
  geracaoMwh: number;
  receitaBruta: number;
  receitaLiquida: number;
  om: number;
  arrendamento: number;
  seguro: number;
  contabilidade: number;
  parcelaFinanciamento: number;
  pisCofins: number;
  irpjCsll: number;
  ebitda: number;
  lucroLiquido: number;
  fluxoCaixaLivre: number;
  fluxoCaixaDescontado: number;
}

// Usa constantes importadas de calculations-constants (fallbacks)
// Valores reais: configuracoes_sistema.calc_*
const VIDA_UTIL_ANOS = VIDA_UTIL_FALLBACK;
const DEGRADACAO_ANUAL = DEGRADACAO_FALLBACK;

// Alíquotas tributárias (fallbacks)
const PIS_COFINS = PIS_COFINS_USINEIRO_FALLBACK;
const IRPJ = IRPJ_FALLBACK;
const CSLL = CSLL_FALLBACK;
const ADICIONAL_IRPJ = ADICIONAL_IRPJ_FALLBACK;

export function calcularPropostaUsineiro(input: UsineiroInput): UsineiroOutput {
  const potenciaKwp = input.potenciaMwp * 1000;
  
  // Geração mensal em kWh (considerando oversizing)
  const geracaoMensalKwh = potenciaKwp * input.indiceSolarimetrico * input.oversizing;
  const geracaoMensalMwh = geracaoMensalKwh / 1000;
  const geracaoAnualMwh = geracaoMensalMwh * 12;
  
  // Receita bruta = geração * tarifa * (1 - taxa administração)
  const valorLocacao = input.tarifaMedia * (1 - input.descontoClienteFinal / 100);
  const receitaBrutaMensal = geracaoMensalKwh * valorLocacao;
  const receitaLiquidaMensal = receitaBrutaMensal * (1 - input.taxaAdministracao / 100);
  
  const receitaBrutaAnual = receitaBrutaMensal * 12;
  const receitaLiquidaAnual = receitaLiquidaMensal * 12;
  
  // Custos anuais
  const omAnual = input.capexTotal * (input.omPercentual / 100);
  const arrendamentoAnual = input.arrendamentoMensal * 12;
  const seguroAnual = input.seguroAnual;
  const contabilidadeAnual = input.contabilidadeMensal * 12;
  
  // Cálculo de parcela de financiamento (SAC simplificado)
  let parcelaFinanciamentoAnual = 0;
  if (input.financiamentoValor && input.financiamentoPrazoMeses && input.financiamentoTaxa) {
    const taxaMensal = input.financiamentoTaxa / 100 / 12;
    const amortizacaoMensal = input.financiamentoValor / input.financiamentoPrazoMeses;
    // Média das parcelas (sistema SAC)
    const parcelaMedia = amortizacaoMensal + (input.financiamentoValor * taxaMensal / 2);
    parcelaFinanciamentoAnual = parcelaMedia * 12;
  }
  
  // EBITDA
  const custosOperacionais = omAnual + arrendamentoAnual + seguroAnual + contabilidadeAnual;
  const ebitdaAnual = receitaLiquidaAnual - custosOperacionais;
  
  // Impostos
  const pisCofinsAnual = receitaLiquidaAnual * PIS_COFINS;
  const lucroAntesIR = ebitdaAnual - pisCofinsAnual;
  let irpjCsllAnual = 0;
  
  if (input.regimeTributario === 'Lucro Presumido') {
    const baseIR = lucroAntesIR * 0.32; // Presunção de 32% para serviços
    irpjCsllAnual = baseIR * (IRPJ + CSLL);
    if (baseIR > 240000) {
      irpjCsllAnual += (baseIR - 240000) * ADICIONAL_IRPJ;
    }
  }
  
  // Lucro líquido
  const lucroLiquidoAnual = lucroAntesIR - irpjCsllAnual - parcelaFinanciamentoAnual;
  
  // Fluxo de caixa para 25 anos
  const fluxoCaixa: FluxoCaixaAnual[] = [];
  let vpl = -input.capexTotal;
  const taxaDesconto = input.cdi / 100;
  
  // Ano 0 (investimento inicial)
  fluxoCaixa.push({
    ano: 0,
    geracaoMwh: 0,
    receitaBruta: 0,
    receitaLiquida: 0,
    om: 0,
    arrendamento: 0,
    seguro: 0,
    contabilidade: 0,
    parcelaFinanciamento: 0,
    pisCofins: 0,
    irpjCsll: 0,
    ebitda: 0,
    lucroLiquido: -input.capexTotal + (input.financiamentoValor || 0),
    fluxoCaixaLivre: -input.capexTotal + (input.financiamentoValor || 0),
    fluxoCaixaDescontado: -input.capexTotal + (input.financiamentoValor || 0),
  });
  
  let paybackAcumulado = -input.capexTotal + (input.financiamentoValor || 0);
  let paybackAnos = VIDA_UTIL_ANOS;
  
  for (let ano = 1; ano <= VIDA_UTIL_ANOS; ano++) {
    const fatorDegradacao = Math.pow(1 - DEGRADACAO_ANUAL, ano - 1);
    const fatorInflacao = Math.pow(1 + input.inflacaoEnergetica / 100, ano - 1);
    const fatorIpca = Math.pow(1 + input.ipca / 100, ano - 1);
    
    const geracaoAnoMwh = geracaoAnualMwh * fatorDegradacao;
    const receitaBrutaAno = receitaBrutaAnual * fatorDegradacao * fatorInflacao;
    const receitaLiquidaAno = receitaBrutaAno * (1 - input.taxaAdministracao / 100);
    
    const omAno = omAnual * fatorIpca;
    const arrendamentoAno = arrendamentoAnual * fatorIpca;
    const seguroAno = seguroAnual * fatorIpca;
    const contabilidadeAno = contabilidadeAnual * fatorIpca;
    
    // Financiamento (durante o prazo)
    let parcelaAno = 0;
    if (input.financiamentoValor && input.financiamentoPrazoMeses) {
      const prazoAnos = input.financiamentoPrazoMeses / 12;
      const carenciaAnos = (input.financiamentoCarenciaMeses || 0) / 12;
      if (ano > carenciaAnos && ano <= prazoAnos) {
        parcelaAno = parcelaFinanciamentoAnual;
      }
    }
    
    const custosAno = omAno + arrendamentoAno + seguroAno + contabilidadeAno;
    const ebitdaAno = receitaLiquidaAno - custosAno;
    
    const pisCofinsAno = receitaLiquidaAno * PIS_COFINS;
    const lucroAntesIRAno = ebitdaAno - pisCofinsAno;
    
    let irpjCsllAno = 0;
    if (input.regimeTributario === 'Lucro Presumido' && lucroAntesIRAno > 0) {
      const baseIR = lucroAntesIRAno * 0.32;
      irpjCsllAno = baseIR * (IRPJ + CSLL);
      if (baseIR > 240000) {
        irpjCsllAno += (baseIR - 240000) * ADICIONAL_IRPJ;
      }
    }
    
    const lucroLiquidoAno = lucroAntesIRAno - irpjCsllAno - parcelaAno;
    const fcd = lucroLiquidoAno / Math.pow(1 + taxaDesconto, ano);
    
    vpl += fcd;
    paybackAcumulado += lucroLiquidoAno;
    
    if (paybackAcumulado >= 0 && paybackAnos === VIDA_UTIL_ANOS) {
      paybackAnos = ano;
    }
    
    fluxoCaixa.push({
      ano,
      geracaoMwh: geracaoAnoMwh,
      receitaBruta: receitaBrutaAno,
      receitaLiquida: receitaLiquidaAno,
      om: omAno,
      arrendamento: arrendamentoAno,
      seguro: seguroAno,
      contabilidade: contabilidadeAno,
      parcelaFinanciamento: parcelaAno,
      pisCofins: pisCofinsAno,
      irpjCsll: irpjCsllAno,
      ebitda: ebitdaAno,
      lucroLiquido: lucroLiquidoAno,
      fluxoCaixaLivre: lucroLiquidoAno,
      fluxoCaixaDescontado: fcd,
    });
  }
  
  // Cálculo da TIR (Newton-Raphson simplificado)
  const tir = calcularTIR(fluxoCaixa.map(fc => fc.fluxoCaixaLivre));
  
  return {
    geracaoMensalMwh,
    geracaoAnualMwh,
    receitaBrutaMensal,
    receitaBrutaAnual,
    receitaLiquidaMensal,
    receitaLiquidaAnual,
    ebitdaAnual,
    lucroLiquidoAnual,
    tir: tir * 100,
    vpl,
    paybackAnos,
    fluxoCaixa,
  };
}

function calcularTIR(fluxos: number[], precisao = 0.0001, maxIteracoes = 100): number {
  let taxa = 0.1;
  
  for (let i = 0; i < maxIteracoes; i++) {
    let vpl = 0;
    let derivada = 0;
    
    for (let t = 0; t < fluxos.length; t++) {
      const fator = Math.pow(1 + taxa, t);
      vpl += fluxos[t] / fator;
      if (t > 0) {
        derivada -= t * fluxos[t] / Math.pow(1 + taxa, t + 1);
      }
    }
    
    if (Math.abs(vpl) < precisao) {
      return taxa;
    }
    
    if (derivada === 0) break;
    taxa = taxa - vpl / derivada;
  }
  
  return taxa;
}

// Constantes de impostos federais - Usa imports de calculations-constants
// Valores reais: configuracoes_sistema.calc_pis_aliquota e calc_cofins_aliquota
const PIS_COFINS_TOTAL = PIS_COFINS_ALIQUOTA_PADRAO; // 3.65%

// Tabela de ICMS por estado - FALLBACK caso não esteja no banco (icms_estados)
// Esta tabela é usada apenas quando o ICMS não é encontrado no banco de dados
const ICMS_POR_ESTADO: Record<string, number> = {
  'AC': 0.17, 'AL': 0.18, 'AP': 0.17, 'AM': 0.18, 'BA': 0.18,
  'CE': 0.18, 'DF': 0.18, 'ES': 0.17, 'GO': 0.17, 'MA': 0.22,
  'MT': 0.17, 'MS': 0.17, 'MG': 0.18, 'PA': 0.17, 'PB': 0.18,
  'PR': 0.18, 'PE': 0.18, 'PI': 0.18, 'RJ': 0.18, 'RN': 0.18,
  'RS': 0.30, 'RO': 0.175, 'RR': 0.17, 'SC': 0.25, 'SP': 0.18,
  'SE': 0.18, 'TO': 0.18,
};

/**
 * Calcula a tarifa com impostos (PIS/COFINS + ICMS)
 * Fórmula: Tarifa Final = (TE + TUSD) / (1 - PIS_COFINS) * (1 + ICMS)
 * 
 * @param tarifaSemImpostos - Tarifa base (TE + TUSD) em R$/kWh
 * @param uf - Sigla do estado (ex: 'MG', 'SP')
 * @param icmsCustom - ICMS customizado (opcional, usa tabela padrão se não informado)
 * @returns Tarifa com impostos em R$/kWh
 */
export function calcularTarifaComImpostos(
  tarifaSemImpostos: number, 
  uf: string,
  icmsCustom?: number
): number {
  const icms = icmsCustom !== undefined ? icmsCustom : (ICMS_POR_ESTADO[uf.toUpperCase()] || 0.18);
  
  // Passo 1: PIS/COFINS "por dentro"
  const baseComPisCofins = tarifaSemImpostos / (1 - PIS_COFINS_TOTAL);
  
  // Passo 2: ICMS "por fora"
  const tarifaFinal = baseComPisCofins * (1 + icms);
  
  return tarifaFinal;
}

/**
 * Retorna os componentes do cálculo de impostos para exibição
 */
export function detalharImpostosTarifa(
  tarifaSemImpostos: number,
  uf: string,
  icmsCustom?: number
): {
  tarifaBase: number;
  pisCofins: number;
  pisCofinsValor: number;
  icms: number;
  icmsValor: number;
  tarifaFinal: number;
} {
  const icms = icmsCustom !== undefined ? icmsCustom : (ICMS_POR_ESTADO[uf.toUpperCase()] || 0.18);
  
  const baseComPisCofins = tarifaSemImpostos / (1 - PIS_COFINS_TOTAL);
  const pisCofinsValor = baseComPisCofins - tarifaSemImpostos;
  
  const tarifaFinal = baseComPisCofins * (1 + icms);
  const icmsValor = tarifaFinal - baseComPisCofins;
  
  return {
    tarifaBase: tarifaSemImpostos,
    pisCofins: PIS_COFINS_TOTAL,
    pisCofinsValor,
    icms,
    icmsValor,
    tarifaFinal,
  };
}

/**
 * Retorna a alíquota de ICMS para um estado (fallback)
 */
export function getIcmsEstado(uf: string): number {
  return ICMS_POR_ESTADO[uf.toUpperCase()] || 0.18;
}

// Formatação de valores monetários
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

export function formatNumber(value: number, decimals = 2): string {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatPercent(value: number, decimals = 2): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value / 100);
}

// ===== CÁLCULOS GD2 (Lei 14.300) =====

/**
 * @deprecated Use getCronogramaGD2Completo() do hook useCronogramaGD2 para dados dinâmicos
 * Cronograma de percentuais GD2 (Lei 14.300, art. 27)
 * Define o percentual da TUSD Fio B que incide sobre energia compensada
 * FALLBACK: Usado apenas se banco de dados falhar
 */
export const CRONOGRAMA_GD2: Record<number, number> = {
  2023: 0.00,  // Isenção total (projetos anteriores à lei)
  2024: 0.15,  // 15%
  2025: 0.30,  // 30%
  2026: 0.45,  // 45%
  2027: 0.60,  // 60%
  2028: 0.75,  // 75%
  2029: 0.90,  // 90%
};

/**
 * @deprecated Use tabela bandeiras_tarifarias do banco
 * Valores das bandeiras tarifárias (adicional em R$/kWh)
 * Fonte: ANEEL - Resolução vigente
 * FALLBACK: Usado apenas se banco de dados falhar
 */
export const BANDEIRAS_VALORES: Record<string, number> = {
  'verde': 0,
  'amarela': 0.01885,
  'vermelha1': 0.04463,
  'vermelha2': 0.07877,
};

export type BandeiraTarifaria = 'verde' | 'amarela' | 'vermelha1' | 'vermelha2';

/**
 * @deprecated Use getPercentualGD2() do hook useCronogramaGD2 para dados dinâmicos
 * Retorna o percentual GD2 para um determinado ano (FALLBACK síncrono)
 * @param ano - Ano de referência
 * @returns Percentual de cobrança (0 a 1)
 */
export function getPercentualGD2(ano: number): number {
  if (ano <= 2022) return 0; // Antes da Lei 14.300
  if (ano >= 2029) return 0.90; // 90% a partir de 2029
  return CRONOGRAMA_GD2[ano] ?? 0.90;
}

/**
 * Retorna o valor adicional da bandeira tarifária
 * @param bandeira - Tipo da bandeira
 * @returns Valor em R$/kWh
 */
export function getValorBandeira(bandeira: BandeiraTarifaria): number {
  return BANDEIRAS_VALORES[bandeira] || 0;
}

/**
 * Fatores de simultaneidade típicos por perfil de consumo
 * FS = parcela da geração consumida instantaneamente (não usa rede)
 */
export const FATOR_SIMULTANEIDADE_TIPICO: Record<string, { min: number; max: number; default: number; descricao: string }> = {
  'residencial': { min: 0.20, max: 0.40, default: 0.30, descricao: 'Residencial (20-40%)' },
  'comercial_diurno': { min: 0.50, max: 0.70, default: 0.60, descricao: 'Comercial diurno (50-70%)' },
  'industrial': { min: 0.70, max: 0.85, default: 0.75, descricao: 'Industrial (70-85%)' },
  'agro_bombeamento': { min: 0.30, max: 0.60, default: 0.45, descricao: 'Agro/Bombeamento (30-60%)' },
};

export type PerfilConsumo = 'residencial' | 'comercial_diurno' | 'industrial' | 'agro_bombeamento';

/**
 * Retorna o fator de simultaneidade padrão para um perfil de consumo
 */
export function estimarFatorSimultaneidade(perfilConsumo: PerfilConsumo): number {
  return FATOR_SIMULTANEIDADE_TIPICO[perfilConsumo]?.default || 0.30;
}

export interface CalculoGD2Input {
  // Consumo e geração
  consumoKwh: number;           // Energia consumida no mês (C)
  geradaKwh: number;            // Energia GERADA total no mês (G) - NOVO
  fatorSimultaneidade: number;  // FS: 0 a 1 (ex: 0.60) - NOVO
  creditoInicialKwh: number;    // Saldo de créditos anterior
  
  // Tarifas
  te: number;                 // TE em R$/kWh
  tusd: number;               // TUSD total em R$/kWh
  tusdFioB: number;           // TUSD Fio B em R$/kWh (componente de uso da rede)
  
  // Bandeira
  bandeira: BandeiraTarifaria;
  
  // Disponibilidade
  custoDisponibilidade: number; // Em R$
  
  // Tributos
  aliqIcms: number;           // Alíquota ICMS (ex: 0.18 para 18%)
  aliqPis: number;            // Alíquota PIS efetiva (ex: 0.0065)
  aliqCofins: number;         // Alíquota COFINS efetiva (ex: 0.03)
  
  // Ano de referência (para percentual GD2)
  anoReferencia: number;
  
  // ICMS da Compensação (Convênio 16/2015)
  icmsIsentaCompensacao?: boolean; // Se estado isenta ICMS sobre energia compensada
}

// Interface para composição tarifária detalhada
export interface ComposicaoTarifaria {
  tarifaBase: number;           // TE + TUSD sem impostos (R$)
  teValor: number;              // Componente TE em R$
  tusdValor: number;            // Componente TUSD em R$
  bandeiraValor: number;        // Bandeira em R$
  disponibilidadeValor: number; // Disponibilidade em R$
  gd2Valor: number;             // Cobrança GD2 em R$
  subtotalSemTributos: number;  // Subtotal antes dos tributos
  pisPercentual: number;        // Alíquota PIS
  pisValor: number;             // PIS em R$
  cofinsPercentual: number;     // Alíquota COFINS
  cofinsValor: number;          // COFINS em R$
  icmsPercentual: number;       // Alíquota ICMS
  icmsValor: number;            // ICMS em R$
  totalComImpostos: number;     // Total final
}

export interface CalculoGD2Output {
  // Detalhes do Fator de Simultaneidade
  energiaSimultanea: number;    // Energia consumida instantaneamente (não usa rede)
  energiaInjetada: number;      // Energia que passou pela rede (vira crédito)
  fatorSimultaneidade: number;  // FS usado no cálculo
  
  // Apuração de energia
  kwhCompensada: number;        // Energia compensada (sofre GD2)
  kwhLiquidaFaturada: number;   // Energia que paga tarifa cheia
  creditoFinalKwh: number;      // Crédito para próximo mês
  
  // Componentes sem tributos
  valorConsumoLiquido: number;    // kWh líquida × (TE + TUSD)
  valorBandeira: number;          // kWh líquida × adicional bandeira
  valorGD2: number;               // kWh compensada × TUSD_FioB × %GD2
  valorDisponibilidade: number;   // Custo de disponibilidade
  subtotalSemTributos: number;
  
  // Tributos
  valorPisCofins: number;
  valorIcms: number;
  totalTributos: number;
  
  // Total
  totalComTributos: number;
  
  // Detalhes
  percentualGD2: number;
  adicionalBandeira: number;
  
  // ICMS da Compensação
  icmsIsentaCompensacao: boolean;
  economiaIcmsIsencao: number;    // Economia obtida com a isenção
  
  // Composição tarifária detalhada (para extratificação)
  composicao: ComposicaoTarifaria;
}

/**
 * Calcula a fatura de energia com regras GD2 (Lei 14.300)
 * INCLUI Fator de Simultaneidade (FS) para cálculo correto
 * 
 * Conceitos:
 * - Energia Simultânea: consumida instantaneamente, NÃO usa rede, NÃO paga GD2
 * - Energia Injetada: passa pela rede, vira crédito, AO SER COMPENSADA paga GD2
 */
export function calcularFaturaGD2(input: CalculoGD2Input): CalculoGD2Output {
  const percentualGD2 = getPercentualGD2(input.anoReferencia);
  const adicionalBandeira = getValorBandeira(input.bandeira);
  const icmsIsentaCompensacao = input.icmsIsentaCompensacao ?? false;
  
  // === LÓGICA COM FATOR DE SIMULTANEIDADE ===
  
  // 1. Energia simultânea (consumida instantaneamente, não usa rede)
  // E_sim = min(G × FS, C) - limite físico: não pode consumir mais que o total
  const energiaSimultanea = Math.min(
    input.geradaKwh * input.fatorSimultaneidade,
    input.consumoKwh
  );
  
  // 2. Energia injetada (passa pela rede, vira crédito)
  // E_inj = G - E_sim
  const energiaInjetada = Math.max(0, input.geradaKwh - energiaSimultanea);
  
  // 3. Consumo restante após simultaneidade (precisa ser coberto por compensação ou rede)
  const consumoRestante = Math.max(0, input.consumoKwh - energiaSimultanea);
  
  // 4. Energia efetivamente compensada (usa créditos da injeção)
  // E_comp = min(E_inj + créditos_anteriores, consumo_restante)
  const kwhCompensada = Math.min(
    energiaInjetada + input.creditoInicialKwh,
    consumoRestante
  );
  
  // 5. kWh líquida faturada (paga TE + TUSD integral)
  const kwhLiquidaFaturada = Math.max(0, consumoRestante - kwhCompensada);
  
  // 6. Crédito restante para próximo mês
  const creditoFinalKwh = Math.max(0, 
    (energiaInjetada + input.creditoInicialKwh) - consumoRestante
  );
  
  // === CÁLCULO DOS VALORES ===
  
  // Valor do consumo líquido (energia que não foi compensada nem simultânea)
  const valorConsumoLiquido = kwhLiquidaFaturada * (input.te + input.tusd);
  const teValor = kwhLiquidaFaturada * input.te;
  const tusdValor = kwhLiquidaFaturada * input.tusd;
  
  // Bandeira: incide APENAS sobre energia líquida faturada (Art. 19)
  const valorBandeira = kwhLiquidaFaturada * adicionalBandeira;
  
  // GD2: cobrança APENAS sobre energia COMPENSADA (não sobre simultânea!)
  // Cobrança_GD2 = E_comp × TUSD_FioB × p_GD2
  const valorGD2 = kwhCompensada * input.tusdFioB * percentualGD2;
  
  // Disponibilidade
  const valorDisponibilidade = input.custoDisponibilidade;
  
  // Subtotal sem tributos
  const subtotalSemTributos = valorConsumoLiquido + valorBandeira + valorGD2 + valorDisponibilidade;
  
  // === CÁLCULO DOS TRIBUTOS COM REGRA DE ICMS DA COMPENSAÇÃO ===
  
  const aliqPisCofins = input.aliqPis + input.aliqCofins;
  
  // Aplicar PIS/COFINS "por dentro"
  const baseComPisCofins = subtotalSemTributos / (1 - aliqPisCofins);
  const valorPisCofins = baseComPisCofins - subtotalSemTributos;
  const valorPis = valorPisCofins * (input.aliqPis / aliqPisCofins);
  const valorCofins = valorPisCofins * (input.aliqCofins / aliqPisCofins);
  
  // === ICMS DA COMPENSAÇÃO (Convênio 16/2015) ===
  // Se o estado NÃO concede isenção, ICMS incide também sobre energia compensada
  let baseParaIcms: number;
  let valorCompensadoParaTributos = 0;
  
  if (icmsIsentaCompensacao) {
    // Estado COM isenção: ICMS só sobre energia líquida (base normal)
    baseParaIcms = baseComPisCofins;
  } else {
    // Estado SEM isenção: ICMS também sobre energia compensada
    // O cliente compensa kWh mas continua pagando ICMS
    valorCompensadoParaTributos = kwhCompensada * (input.te + input.tusd);
    baseParaIcms = baseComPisCofins + valorCompensadoParaTributos;
  }
  
  // Aplicar ICMS "por fora"
  const valorIcms = baseParaIcms * input.aliqIcms;
  const totalComTributos = baseComPisCofins + valorIcms;
  
  const totalTributos = valorPisCofins + valorIcms;
  
  // Calcular economia da isenção (para mostrar ao usuário)
  const economiaIcmsIsencao = icmsIsentaCompensacao 
    ? valorCompensadoParaTributos * input.aliqIcms 
    : 0;
  
  // Montar composição tarifária
  const composicao: ComposicaoTarifaria = {
    tarifaBase: valorConsumoLiquido,
    teValor,
    tusdValor,
    bandeiraValor: valorBandeira,
    disponibilidadeValor: valorDisponibilidade,
    gd2Valor: valorGD2,
    subtotalSemTributos,
    pisPercentual: input.aliqPis * 100,
    pisValor: valorPis,
    cofinsPercentual: input.aliqCofins * 100,
    cofinsValor: valorCofins,
    icmsPercentual: input.aliqIcms * 100,
    icmsValor: valorIcms,
    totalComImpostos: totalComTributos,
  };
  
  return {
    // Detalhes FS
    energiaSimultanea,
    energiaInjetada,
    fatorSimultaneidade: input.fatorSimultaneidade,
    // Apuração
    kwhCompensada,
    kwhLiquidaFaturada,
    creditoFinalKwh,
    // Valores
    valorConsumoLiquido,
    valorBandeira,
    valorGD2,
    valorDisponibilidade,
    subtotalSemTributos,
    valorPisCofins,
    valorIcms,
    totalTributos,
    totalComTributos,
    percentualGD2,
    adicionalBandeira,
    // ICMS da Compensação
    icmsIsentaCompensacao,
    economiaIcmsIsencao,
    // Composição
    composicao,
  };
}

/**
 * Calcula a economia mensal de um assinante GD considerando GD2
 * Compara cenário SEM solar vs COM solar (compensação)
 * INCLUI Fator de Simultaneidade para cálculo correto
 */
export interface EconomiaGD2Input {
  consumoKwh: number;
  geradaKwh: number;              // Energia gerada total
  fatorSimultaneidade: number;    // FS: 0 a 1
  te: number;
  tusd: number;
  tusdFioB: number;
  bandeira: BandeiraTarifaria;
  custoDisponibilidade: number;
  aliqIcms: number;
  aliqPis: number;
  aliqCofins: number;
  anoReferencia: number;
}

export interface EconomiaGD2Output {
  faturaSemSolar: number;
  faturaComSolar: number;
  economiaMensal: number;
  economiaPercentual: number;
  // Detalhes adicionais
  energiaSimultanea: number;
  energiaInjetada: number;
  kwhCompensada: number;
  valorGD2: number;
}

export function calcularEconomiaGD2(input: EconomiaGD2Input): EconomiaGD2Output {
  // Cenário SEM solar (consumo integral, sem geração)
  const resultadoSemSolar = calcularFaturaGD2({
    ...input,
    geradaKwh: 0,
    fatorSimultaneidade: 0,
    creditoInicialKwh: 0,
  });
  
  // Cenário COM solar (com geração e simultaneidade)
  const resultadoComSolar = calcularFaturaGD2({
    ...input,
    creditoInicialKwh: 0, // Assumindo início sem créditos
  });
  
  const economiaMensal = resultadoSemSolar.totalComTributos - resultadoComSolar.totalComTributos;
  const economiaPercentual = resultadoSemSolar.totalComTributos > 0 
    ? (economiaMensal / resultadoSemSolar.totalComTributos) * 100 
    : 0;
  
  return {
    faturaSemSolar: resultadoSemSolar.totalComTributos,
    faturaComSolar: resultadoComSolar.totalComTributos,
    economiaMensal,
    economiaPercentual,
    // Detalhes do FS
    energiaSimultanea: resultadoComSolar.energiaSimultanea,
    energiaInjetada: resultadoComSolar.energiaInjetada,
    kwhCompensada: resultadoComSolar.kwhCompensada,
    valorGD2: resultadoComSolar.valorGD2,
  };
}

/**
 * Projeta a economia anual considerando evolução do percentual GD2
 * Útil para análise de viabilidade de projetos de usinas
 */
export function projetarEconomiaGD2(
  input: Omit<EconomiaGD2Input, 'anoReferencia'>,
  anoInicio: number,
  anosProjecao: number = 25
): { 
  ano: number; 
  percentualGD2: number; 
  economia: number; 
  faturaSemSolar: number; 
  faturaComSolar: number;
  energiaSimultanea: number;
  valorGD2Anual: number;
}[] {
  const projecao: { 
    ano: number; 
    percentualGD2: number; 
    economia: number; 
    faturaSemSolar: number; 
    faturaComSolar: number;
    energiaSimultanea: number;
    valorGD2Anual: number;
  }[] = [];
  
  for (let i = 0; i < anosProjecao; i++) {
    const ano = anoInicio + i;
    const resultado = calcularEconomiaGD2({ ...input, anoReferencia: ano });
    
    projecao.push({
      ano,
      percentualGD2: getPercentualGD2(ano) * 100,
      economia: resultado.economiaMensal * 12, // Anualizar
      faturaSemSolar: resultado.faturaSemSolar * 12,
      faturaComSolar: resultado.faturaComSolar * 12,
      energiaSimultanea: resultado.energiaSimultanea * 12,
      valorGD2Anual: resultado.valorGD2 * 12,
    });
  }
  
  return projecao;
}
