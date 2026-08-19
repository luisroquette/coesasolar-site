/**
 * Utilitários para formatação e validação de números de WhatsApp
 * Formato esperado: DDI+DDD+9+Celular = 5531991703646 (13 dígitos)
 */

/**
 * Remove todos os caracteres não numéricos de uma string
 */
function removeNonNumeric(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * Formata um número de telefone para o padrão WhatsApp brasileiro
 * @param input - Número em qualquer formato
 * @returns Número formatado (apenas dígitos) ou string vazia se inválido
 */
export function formatWhatsAppNumber(input: string): string {
  if (!input) return '';
  
  let digits = removeNonNumeric(input);
  
  // Remove zero inicial do DDD se existir (031 -> 31)
  if (digits.length === 12 && digits.startsWith('0')) {
    digits = digits.substring(1);
  }
  
  // Se tem 11 dígitos (DDD + 9 + celular), adiciona DDI 55
  if (digits.length === 11 && digits[2] === '9') {
    digits = '55' + digits;
  }
  
  // Se tem 10 dígitos (DDD + celular sem 9), adiciona DDI 55 e 9
  if (digits.length === 10) {
    digits = '55' + digits.substring(0, 2) + '9' + digits.substring(2);
  }
  
  return digits;
}

/**
 * Valida se o número está no formato correto do WhatsApp brasileiro
 * @param number - Número a ser validado (apenas dígitos)
 * @returns true se válido, false caso contrário
 */
export function isValidWhatsAppNumber(number: string): boolean {
  if (!number) return false;
  
  const digits = removeNonNumeric(number);
  
  // Deve ter exatamente 13 dígitos
  if (digits.length !== 13) return false;
  
  // Deve começar com 55 (DDI Brasil)
  if (!digits.startsWith('55')) return false;
  
  // O 5º dígito deve ser 9 (indicador de celular)
  if (digits[4] !== '9') return false;
  
  // DDD válido (11-99)
  const ddd = parseInt(digits.substring(2, 4));
  if (ddd < 11 || ddd > 99) return false;
  
  return true;
}

/**
 * Formata o número para exibição amigável
 * @param number - Número no formato 5531991703646
 * @returns Formato: +55 (31) 9 9170-3646
 */
export function formatWhatsAppDisplay(number: string): string {
  const digits = removeNonNumeric(number);
  
  if (digits.length !== 13) return number;
  
  const ddi = digits.substring(0, 2);
  const ddd = digits.substring(2, 4);
  const nove = digits.substring(4, 5);
  const parte1 = digits.substring(5, 9);
  const parte2 = digits.substring(9, 13);
  
  return `+${ddi} (${ddd}) ${nove} ${parte1}-${parte2}`;
}
