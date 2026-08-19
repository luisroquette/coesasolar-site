/**
 * Hook para validação anti-fraude de propostas PJ
 * Valida:
 * 1. CNPJ do contrato social == CNPJ da conta de luz
 * 2. CPF do administrador no contrato == CPF do documento de identificação
 */

import { useMemo } from 'react';

interface DadosValidacaoPJ {
  // Do Contrato Social
  cnpjContrato: string | null | undefined;
  cpfAdminContrato: string | null | undefined;
  nomeAdminContrato: string | null | undefined;
  
  // Da Conta de Energia
  cnpjConta: string | null | undefined;
  
  // Do Documento de Identificação
  cpfDocumento: string | null | undefined;
}

export type TipoFraudePJ = 
  | 'cnpj_divergente'      // CNPJ da conta != CNPJ do contrato
  | 'admin_cpf_divergente' // CPF do documento != CPF do admin
  | 'dados_incompletos'    // Faltam dados para validação
  | null;

export interface TitularidadePJResult {
  isValid: boolean;
  cnpjMatch: boolean;
  cpfAdminMatch: boolean;
  tipoFraude: TipoFraudePJ;
  mensagem: string;
  detalhes: {
    cnpjContrato: string;
    cnpjConta: string;
    cpfAdminContrato: string;
    cpfDocumento: string;
    nomeAdminContrato: string;
  };
}

/**
 * Remove todos os caracteres não numéricos
 */
function normalizarDocumento(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(/\D/g, '');
}

/**
 * Mascara CPF para exibição segura: 123.***.**4-56
 */
export function mascaraCpfPJSeguro(cpf: string | null | undefined): string {
  const digits = normalizarDocumento(cpf);
  if (digits.length !== 11) return '***.***.***-**';
  return `${digits.slice(0, 3)}.***.***-${digits.slice(9)}`;
}

/**
 * Mascara CNPJ para exibicao segura
 */
export function mascaraCnpjPJSeguro(cnpj: string | null | undefined): string {
  const digits = normalizarDocumento(cnpj);
  if (digits.length !== 14) return '**.***/****-**';
  return `${digits.slice(0, 2)}.***/****-${digits.slice(12)}`;
}

/**
 * Hook de validação anti-fraude para PJ
 */
export function useTitularidadePJValidation(
  dados: DadosValidacaoPJ | null
): TitularidadePJResult {
  return useMemo(() => {
    // Default: tudo válido se não houver dados
    const defaultResult: TitularidadePJResult = {
      isValid: true,
      cnpjMatch: true,
      cpfAdminMatch: true,
      tipoFraude: null,
      mensagem: '',
      detalhes: {
        cnpjContrato: '',
        cnpjConta: '',
        cpfAdminContrato: '',
        cpfDocumento: '',
        nomeAdminContrato: ''
      }
    };

    if (!dados) return defaultResult;

    const cnpjContrato = normalizarDocumento(dados.cnpjContrato);
    const cnpjConta = normalizarDocumento(dados.cnpjConta);
    const cpfAdminContrato = normalizarDocumento(dados.cpfAdminContrato);
    const cpfDocumento = normalizarDocumento(dados.cpfDocumento);
    const nomeAdminContrato = dados.nomeAdminContrato || '';

    const detalhes = {
      cnpjContrato,
      cnpjConta,
      cpfAdminContrato,
      cpfDocumento,
      nomeAdminContrato
    };

    // Verificar se temos dados suficientes para validar
    if (!cnpjContrato || !cnpjConta) {
      return {
        isValid: false,
        cnpjMatch: false,
        cpfAdminMatch: true,
        tipoFraude: 'dados_incompletos',
        mensagem: 'Não foi possível extrair o CNPJ de todos os documentos para validação.',
        detalhes
      };
    }

    // Validar CNPJ (conta deve pertencer à mesma empresa)
    const cnpjMatch = cnpjContrato === cnpjConta;
    
    if (!cnpjMatch) {
      return {
        isValid: false,
        cnpjMatch: false,
        cpfAdminMatch: true,
        tipoFraude: 'cnpj_divergente',
        mensagem: 'O CNPJ da conta de luz não corresponde ao CNPJ do contrato social. A conta de energia deve estar em nome da mesma empresa.',
        detalhes
      };
    }

    // Validar CPF do administrador (se tivermos os dados)
    if (cpfAdminContrato && cpfDocumento) {
      const cpfAdminMatch = cpfAdminContrato === cpfDocumento;
      
      if (!cpfAdminMatch) {
        return {
          isValid: false,
          cnpjMatch: true,
          cpfAdminMatch: false,
          tipoFraude: 'admin_cpf_divergente',
          mensagem: `O CPF do documento de identificação não corresponde ao CPF do sócio administrador (${nomeAdminContrato || 'nome não identificado'}) indicado no contrato social.`,
          detalhes
        };
      }
    }

    // Tudo válido
    return {
      isValid: true,
      cnpjMatch: true,
      cpfAdminMatch: true,
      tipoFraude: null,
      mensagem: 'Validação anti-fraude concluída com sucesso.',
      detalhes
    };
  }, [dados]);
}
