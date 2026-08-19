import { useMemo } from 'react';
import type { 
  DataDivergence, 
  ComparisonResult, 
  OriginalData, 
  ExtractedDataForComparison 
} from '@/types/data-comparison';

// Normaliza texto para comparação (remove acentos, espaços extras, case)
function normalizeText(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' '); // Remove espaços múltiplos
}

// Normaliza números (remove formatação)
function normalizeNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return value;
  // Remove pontos de milhar e troca vírgula por ponto
  const cleaned = value.replace(/\./g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

// Remove formatação de CPF/CNPJ para comparação
function normalizeCpfCnpj(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(/[^\d]/g, '');
}

// Remove formatação de CEP
function normalizeCep(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(/[^\d]/g, '');
}

// Compara dois textos com tolerância a acentos
function compareText(original: string | null | undefined, extracted: string | null | undefined): boolean {
  const normOriginal = normalizeText(original);
  const normExtracted = normalizeText(extracted);
  
  if (!normOriginal && !normExtracted) return true;
  if (!normOriginal || !normExtracted) return false;
  
  return normOriginal === normExtracted;
}

// Compara dois números com tolerância percentual
function compareNumber(
  original: number | string | null | undefined, 
  extracted: number | string | null | undefined, 
  tolerancePercent: number = 2
): boolean {
  const normOriginal = normalizeNumber(original);
  const normExtracted = normalizeNumber(extracted);
  
  if (normOriginal === null && normExtracted === null) return true;
  if (normOriginal === null || normExtracted === null) return false;
  
  // Calcula diferença percentual
  const diff = Math.abs(normOriginal - normExtracted);
  const maxVal = Math.max(Math.abs(normOriginal), Math.abs(normExtracted));
  
  if (maxVal === 0) return true;
  
  const percentDiff = (diff / maxVal) * 100;
  return percentDiff <= tolerancePercent;
}

// Formata valor para exibição
function formatValue(value: string | number | null | undefined, tipo: 'texto' | 'numero' | 'documento'): string {
  if (value === null || value === undefined || value === '') return '(não informado)';
  
  if (tipo === 'numero' && typeof value === 'number') {
    return value.toLocaleString('pt-BR');
  }
  
  return String(value);
}

export function useDataComparison(
  originalData: OriginalData | null,
  extractedData: ExtractedDataForComparison | null
): ComparisonResult {
  return useMemo(() => {
    if (!originalData || !extractedData) {
      return {
        hasDivergences: false,
        divergences: [],
        totalCamposComparados: 0,
        totalDivergencias: 0
      };
    }

    const divergences: DataDivergence[] = [];
    let camposComparados = 0;

    // 1. Nome Completo
    const nomeExtraido = extractedData.nome_completo;
    if (nomeExtraido && originalData.cliente_nome) {
      camposComparados++;
      if (!compareText(originalData.cliente_nome, nomeExtraido)) {
        divergences.push({
          campo: 'nome',
          campoLabel: 'Nome Completo',
          valorOriginal: originalData.cliente_nome,
          valorExtraido: nomeExtraido,
          fonte: 'proposta_inicial',
          prioridade: 'extraido',
          tipo: 'texto'
        });
      }
    }

    // 2. CPF/CNPJ
    const cpfCnpjExtraido = extractedData.cpf_cnpj_titular || extractedData.cpf;
    if (cpfCnpjExtraido && originalData.cliente_cpf_cnpj) {
      camposComparados++;
      if (normalizeCpfCnpj(originalData.cliente_cpf_cnpj) !== normalizeCpfCnpj(cpfCnpjExtraido)) {
        divergences.push({
          campo: 'cpf_cnpj',
          campoLabel: 'CPF/CNPJ',
          valorOriginal: originalData.cliente_cpf_cnpj,
          valorExtraido: cpfCnpjExtraido,
          fonte: 'proposta_inicial',
          prioridade: 'extraido',
          tipo: 'documento'
        });
      }
    }

    // 3. Endereço
    if (extractedData.endereco && originalData.cliente_endereco) {
      camposComparados++;
      if (!compareText(originalData.cliente_endereco, extractedData.endereco)) {
        divergences.push({
          campo: 'endereco',
          campoLabel: 'Endereço',
          valorOriginal: originalData.cliente_endereco,
          valorExtraido: extractedData.endereco,
          fonte: 'proposta_inicial',
          prioridade: 'extraido',
          tipo: 'texto'
        });
      }
    }

    // 4. CEP
    if (extractedData.cep && originalData.cliente_cep) {
      camposComparados++;
      if (normalizeCep(originalData.cliente_cep) !== normalizeCep(extractedData.cep)) {
        divergences.push({
          campo: 'cep',
          campoLabel: 'CEP',
          valorOriginal: originalData.cliente_cep,
          valorExtraido: extractedData.cep,
          fonte: 'proposta_inicial',
          prioridade: 'extraido',
          tipo: 'texto'
        });
      }
    }

    // 5. Cidade
    if (extractedData.cidade && originalData.cliente_cidade) {
      camposComparados++;
      if (!compareText(originalData.cliente_cidade, extractedData.cidade)) {
        divergences.push({
          campo: 'cidade',
          campoLabel: 'Cidade',
          valorOriginal: originalData.cliente_cidade,
          valorExtraido: extractedData.cidade,
          fonte: 'proposta_inicial',
          prioridade: 'extraido',
          tipo: 'texto'
        });
      }
    }

    // 6. UF
    if (extractedData.uf && originalData.cliente_uf) {
      camposComparados++;
      if (!compareText(originalData.cliente_uf, extractedData.uf)) {
        divergences.push({
          campo: 'uf',
          campoLabel: 'UF',
          valorOriginal: originalData.cliente_uf,
          valorExtraido: extractedData.uf,
          fonte: 'proposta_inicial',
          prioridade: 'extraido',
          tipo: 'texto'
        });
      }
    }

    // 7. Consumo Médio (tolerância de 2%)
    const consumoExtraido = extractedData.consumo_media_anual || extractedData.consumo_kwh;
    if (consumoExtraido && originalData.consumo_medio) {
      camposComparados++;
      if (!compareNumber(originalData.consumo_medio, consumoExtraido, 2)) {
        divergences.push({
          campo: 'consumo_medio',
          campoLabel: 'Consumo Médio (kWh)',
          valorOriginal: originalData.consumo_medio,
          valorExtraido: consumoExtraido,
          fonte: 'proposta_inicial',
          prioridade: 'extraido',
          tipo: 'numero'
        });
      }
    }

    // 8. Tipo de Instalação
    if (extractedData.tipo_instalacao && originalData.tipo_instalacao) {
      camposComparados++;
      if (!compareText(originalData.tipo_instalacao, extractedData.tipo_instalacao)) {
        divergences.push({
          campo: 'tipo_instalacao',
          campoLabel: 'Tipo de Instalação',
          valorOriginal: originalData.tipo_instalacao,
          valorExtraido: extractedData.tipo_instalacao,
          fonte: 'proposta_inicial',
          prioridade: 'extraido',
          tipo: 'texto'
        });
      }
    }

    // 9. Concessionária
    if (extractedData.concessionaria && originalData.concessionaria) {
      camposComparados++;
      if (!compareText(originalData.concessionaria, extractedData.concessionaria)) {
        divergences.push({
          campo: 'concessionaria',
          campoLabel: 'Concessionária',
          valorOriginal: originalData.concessionaria,
          valorExtraido: extractedData.concessionaria,
          fonte: 'proposta_inicial',
          prioridade: 'extraido',
          tipo: 'texto'
        });
      }
    }

    return {
      hasDivergences: divergences.length > 0,
      divergences,
      totalCamposComparados: camposComparados,
      totalDivergencias: divergences.length
    };
  }, [originalData, extractedData]);
}

// Exporta funções utilitárias para uso externo
export { formatValue, normalizeText, normalizeNumber };
