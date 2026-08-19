// Cálculos para Propostas de Clientes com GD (Migração de Concorrentes)

import { DISPONIBILIDADE_MINIMA, INFLACAO_ENERGETICA_ANUAL_DEFAULT } from './calculations-constants';

export interface ClienteGDInput {
  // Dados do concorrente
  nomeConcorrente: string;
  descontoConcorrente: number;        // ex: 25 para 25%
  multaRescisoria: number;            // R$ valor da multa
  mesesRestantesConcorrente: number;  // meses restantes do contrato atual
  
  // Proposta COESA
  descontoCoesa: number;              // ex: 30 para 30%
  fidelidadeAnos: number;             // 1, 2 ou 3 anos
  
  // Dados de consumo (mesmos da proposta padrão)
  tarifa: number;
  cip: number;
  consumoMedio: number;
  tipoInstalacao: 'Monofásico' | 'Bifásico' | 'Trifásico';
  numeroUcs: number;
}

export interface FluxoCaixaMigracao {
  mes: number;
  economiaAdicionalMes: number;       // Diferença mensal
  economiaAcumulada: number;          // Economia acumulada até este mês
  saldoDevedor: number;               // Multa - economia acumulada (negativo = lucro)
  paybackAtingido: boolean;           // Se já recuperou a multa
}

export interface ClienteGDOutput {
  // Comparativo mensal
  valorConcorrente: number;           // R$ mensal pagando ao concorrente
  valorCoesa: number;                 // R$ mensal pagando à COESA
  diferencaMensal: number;            // Economia adicional por mês (Concorrente - COESA)
  diferencaPercentual: number;        // % a mais de economia
  
  // Disponibilidade
  disponibilidadeKwh: number;
  disponibilidadeValor: number;
  
  // Projeção de economia adicional
  economiaAdicionalAnual: number;
  economiaAdicionalAcumulada: number; // No período de fidelidade COESA
  
  // Análise da multa
  temMulta: boolean;
  paybackMeses: number | null;        // null se não houver multa ou não compensar
  multaJustificada: boolean;          // true se payback < fidelidade em meses
  mesesParaRecuperarMulta: number;
  roiMigracao: number;                // (Economia - Multa) / Multa × 100
  
  // Fluxo de caixa da migração
  fluxoCaixaMigracao: FluxoCaixaMigracao[];
  
  // Alertas e validações
  alertas: string[];
  migracaoRecomendada: boolean;
}

// Constantes de disponibilidade por tipo de instalação
const DISPONIBILIDADE = {
  'Monofásico': 30,
  'Bifásico': 50,
  'Trifásico': 100,
};

/**
 * Calcula o valor mensal da conta considerando o desconto e disponibilidade
 */
function calcularValorMensal(
  consumoMedio: number,
  tarifa: number,
  cip: number,
  descontoPercentual: number,
  disponibilidadeKwh: number
): number {
  // Consumo excedente à disponibilidade
  const consumoExcedente = Math.max(0, consumoMedio - disponibilidadeKwh);
  
  // Tarifa com desconto aplicada ao excedente
  const tarifaComDesconto = tarifa * (1 - descontoPercentual / 100);
  const valorConsumoExcedenteComDesconto = consumoExcedente * tarifaComDesconto;
  
  // Disponibilidade sempre na tarifa cheia
  const disponibilidadeValor = disponibilidadeKwh * tarifa;
  
  // Total
  return valorConsumoExcedenteComDesconto + disponibilidadeValor + cip;
}

/**
 * Calcula proposta de migração de cliente com GD para COESA
 */
export function calcularPropostaClienteGD(input: ClienteGDInput, inflacaoEnergetica: number = INFLACAO_ENERGETICA_ANUAL_DEFAULT): ClienteGDOutput {
  const alertas: string[] = [];
  
  // Disponibilidade
  const disponibilidadeKwh = DISPONIBILIDADE[input.tipoInstalacao] * input.numeroUcs;
  const disponibilidadeValor = disponibilidadeKwh * input.tarifa;
  
  // Valor mensal no concorrente
  const valorConcorrente = calcularValorMensal(
    input.consumoMedio,
    input.tarifa,
    input.cip,
    input.descontoConcorrente,
    disponibilidadeKwh
  );
  
  // Valor mensal na COESA
  const valorCoesa = calcularValorMensal(
    input.consumoMedio,
    input.tarifa,
    input.cip,
    input.descontoCoesa,
    disponibilidadeKwh
  );
  
  // Diferença mensal (economia adicional)
  const diferencaMensal = valorConcorrente - valorCoesa;
  const diferencaPercentual = input.descontoCoesa - input.descontoConcorrente;
  
  // Validação: COESA deve oferecer mais desconto
  if (diferencaMensal <= 0) {
    alertas.push('⚠️ O desconto COESA não é maior que o concorrente. Considere aumentar o desconto.');
  }
  
  // Projeção de economia adicional
  const fidelidadeMeses = input.fidelidadeAnos * 12;
  let economiaAdicionalAcumulada = 0;
  
  for (let ano = 1; ano <= input.fidelidadeAnos; ano++) {
    const fatorInflacao = Math.pow(1 + inflacaoEnergetica, ano - 1);
    economiaAdicionalAcumulada += diferencaMensal * 12 * fatorInflacao;
  }
  
  const economiaAdicionalAnual = diferencaMensal * 12;
  
  // Análise da multa
  const temMulta = input.multaRescisoria > 0;
  let paybackMeses: number | null = null;
  let mesesParaRecuperarMulta = 0;
  
  if (temMulta && diferencaMensal > 0) {
    paybackMeses = Math.ceil(input.multaRescisoria / diferencaMensal);
    mesesParaRecuperarMulta = paybackMeses;
    
    if (paybackMeses > fidelidadeMeses) {
      alertas.push(`⚠️ O payback da multa (${paybackMeses} meses) excede o período de fidelidade (${fidelidadeMeses} meses).`);
    }
    
    if (paybackMeses > 12) {
      alertas.push('💡 Considere negociar redução da multa com o concorrente ou aumentar o período de fidelidade.');
    }
  }
  
  const multaJustificada = temMulta ? (paybackMeses !== null && paybackMeses <= fidelidadeMeses) : true;
  
  // ROI da migração
  const roiMigracao = temMulta && input.multaRescisoria > 0
    ? ((economiaAdicionalAcumulada - input.multaRescisoria) / input.multaRescisoria) * 100
    : 100; // Se não tem multa, ROI é 100%+
  
  // Fluxo de caixa da migração
  const fluxoCaixaMigracao: FluxoCaixaMigracao[] = [];
  let economiaAcumuladaFluxo = 0;
  let paybackAtingidoFlag = false;
  
  // Gerar fluxo de caixa mês a mês
  const totalMesesFluxo = Math.max(fidelidadeMeses, temMulta ? (paybackMeses || 12) + 6 : 12);
  
  for (let mes = 1; mes <= totalMesesFluxo; mes++) {
    // Aplicar inflação a cada 12 meses
    const anoCorrente = Math.ceil(mes / 12);
    const fatorInflacao = Math.pow(1 + inflacaoEnergetica, anoCorrente - 1);
    const economiaAdicionalMes = diferencaMensal * fatorInflacao;
    
    economiaAcumuladaFluxo += economiaAdicionalMes;
    const saldoDevedor = input.multaRescisoria - economiaAcumuladaFluxo;
    
    if (!paybackAtingidoFlag && saldoDevedor <= 0) {
      paybackAtingidoFlag = true;
    }
    
    fluxoCaixaMigracao.push({
      mes,
      economiaAdicionalMes,
      economiaAcumulada: economiaAcumuladaFluxo,
      saldoDevedor,
      paybackAtingido: paybackAtingidoFlag,
    });
  }
  
  // Migração recomendada se:
  // 1. Diferença mensal é positiva
  // 2. Multa se paga dentro do período de fidelidade (ou não há multa)
  const migracaoRecomendada = diferencaMensal > 0 && multaJustificada;
  
  if (!migracaoRecomendada) {
    alertas.push('❌ A migração não é recomendada nas condições atuais.');
  } else if (temMulta) {
    alertas.push(`✅ Migração vantajosa! Multa recuperada em ${paybackMeses} meses.`);
  } else {
    alertas.push('✅ Migração vantajosa! Sem custo de multa rescisória.');
  }
  
  return {
    valorConcorrente,
    valorCoesa,
    diferencaMensal,
    diferencaPercentual,
    disponibilidadeKwh,
    disponibilidadeValor,
    economiaAdicionalAnual,
    economiaAdicionalAcumulada,
    temMulta,
    paybackMeses,
    multaJustificada,
    mesesParaRecuperarMulta,
    roiMigracao,
    fluxoCaixaMigracao,
    alertas,
    migracaoRecomendada,
  };
}

/**
 * Formata o payback para exibição
 */
export function formatPayback(meses: number | null): string {
  if (meses === null) return 'N/A';
  
  if (meses <= 12) {
    return `${meses} ${meses === 1 ? 'mês' : 'meses'}`;
  }
  
  const anos = Math.floor(meses / 12);
  const mesesRestantes = meses % 12;
  
  if (mesesRestantes === 0) {
    return `${anos} ${anos === 1 ? 'ano' : 'anos'}`;
  }
  
  return `${anos} ${anos === 1 ? 'ano' : 'anos'} e ${mesesRestantes} ${mesesRestantes === 1 ? 'mês' : 'meses'}`;
}
