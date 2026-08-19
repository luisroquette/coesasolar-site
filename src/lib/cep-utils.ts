/**
 * Utilitários para formatação de CEP e busca de endereço via ViaCEP
 */

export interface ViaCEPResponse {
  cep: string;
  logradouro: string;
  complemento: string;
  bairro: string;
  localidade: string;
  uf: string;
  erro?: boolean;
}

/**
 * Remove caracteres não numéricos do CEP
 */
function removeNonNumeric(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * Formata CEP: 00000-000
 */
export function formatCEP(value: string): string {
  const digits = removeNonNumeric(value).slice(0, 8);
  
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

/**
 * Valida se o CEP está completo (8 dígitos)
 */
export function isCEPComplete(value: string): boolean {
  return removeNonNumeric(value).length === 8;
}

/**
 * Busca endereço pelo CEP via API ViaCEP
 */
export async function fetchAddressByCEP(cep: string): Promise<ViaCEPResponse | null> {
  const digits = removeNonNumeric(cep);
  
  if (digits.length !== 8) return null;
  
  try {
    const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
    
    if (!response.ok) return null;
    
    const data: ViaCEPResponse = await response.json();
    
    if (data.erro) return null;
    
    return data;
  } catch (error) {
    console.error('Erro ao buscar CEP:', error);
    return null;
  }
}
