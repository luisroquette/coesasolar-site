import { useMemo } from 'react';

interface ExtractedDataForValidation {
  cpf: string | null;
  cpf_cnpj_titular: string | null;
  tipo_pessoa: 'PF' | 'PJ' | null;
  nome_completo: string | null;
}

export interface TitularidadeResult {
  isValid: boolean;
  isPJ: boolean;
  cpfIdentificacao: string | null;
  cpfCnpjConta: string | null;
  motivoBloqueio: 'cpf_diferente' | 'cnpj_pj' | 'dados_incompletos' | null;
  mensagem: string;
  confiancaValidacao: number; // 0-100
}

// Normaliza CPF removendo formatação
function normalizeCpf(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(/\D/g, '');
}

// Verifica se é CNPJ (14 dígitos)
function isCnpj(value: string): boolean {
  const digits = normalizeCpf(value);
  return digits.length === 14;
}

// Verifica se é CPF (11 dígitos)
function isCpf(value: string): boolean {
  const digits = normalizeCpf(value);
  return digits.length === 11;
}

// Mascara CPF para exibição segura (ex: ***.***.789-00)
export function mascaraCpfSeguro(cpf: string | null | undefined): string {
  if (!cpf) return '---';
  const digits = normalizeCpf(cpf);
  if (digits.length !== 11) return '---';
  return `***.***${digits.slice(6, 9)}-${digits.slice(9)}`;
}

// Mascara CNPJ para exibição segura
export function mascaraCnpjSeguro(cnpj: string | null | undefined): string {
  if (!cnpj) return '---';
  const digits = normalizeCpf(cnpj);
  if (digits.length !== 14) return '---';
  return `**.***.***/****-${digits.slice(12)}`;
}

export function useTitularidadeValidation(
  extractedData: ExtractedDataForValidation | null
): TitularidadeResult {
  return useMemo(() => {
    // Se não há dados extraídos
    if (!extractedData) {
      return {
        isValid: true, // Permite continuar sem validação
        isPJ: false,
        cpfIdentificacao: null,
        cpfCnpjConta: null,
        motivoBloqueio: null,
        mensagem: '',
        confiancaValidacao: 0
      };
    }

    const cpfIdentificacao = normalizeCpf(extractedData.cpf);
    const cpfCnpjConta = normalizeCpf(extractedData.cpf_cnpj_titular);

    // Se não conseguiu extrair os dados necessários
    if (!cpfIdentificacao || !cpfCnpjConta) {
      return {
        isValid: true, // Permite continuar com validação manual
        isPJ: false,
        cpfIdentificacao: cpfIdentificacao || null,
        cpfCnpjConta: cpfCnpjConta || null,
        motivoBloqueio: 'dados_incompletos',
        mensagem: 'Não foi possível extrair todos os dados para validação automática. O formulário será liberado para preenchimento manual.',
        confiancaValidacao: 0
      };
    }

    // Se a conta é de Pessoa Jurídica (CNPJ)
    if (isCnpj(cpfCnpjConta)) {
      return {
        isValid: true, // PJ pode continuar, validação será posterior
        isPJ: true,
        cpfIdentificacao,
        cpfCnpjConta,
        motivoBloqueio: 'cnpj_pj',
        mensagem: 'A conta de luz está em nome de uma Pessoa Jurídica (CNPJ). A validação do representante legal será realizada posteriormente.',
        confiancaValidacao: 50
      };
    }

    // Validação principal: CPF do RG deve ser igual ao CPF da conta
    const cpfContaNormalizado = cpfCnpjConta;
    
    if (cpfIdentificacao === cpfContaNormalizado) {
      return {
        isValid: true,
        isPJ: false,
        cpfIdentificacao,
        cpfCnpjConta,
        motivoBloqueio: null,
        mensagem: 'Documentos validados com sucesso! O CPF do documento de identificação corresponde ao CPF da conta de luz.',
        confiancaValidacao: 100
      };
    }

    // FRAUDE DETECTADA: CPFs diferentes
    return {
      isValid: false,
      isPJ: false,
      cpfIdentificacao,
      cpfCnpjConta,
      motivoBloqueio: 'cpf_diferente',
      mensagem: 'Os documentos apresentam CPFs diferentes. O CPF do documento de identificação não corresponde ao CPF do titular da conta de luz.',
      confiancaValidacao: 100
    };
  }, [extractedData]);
}
