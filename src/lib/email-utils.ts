/**
 * Utilitários para validação de email
 */

/**
 * Valida formato de email usando regex
 */
export function isValidEmail(email: string): boolean {
  if (!email || email.trim() === '') return false;
  
  // Regex para validação de email
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email.trim());
}

/**
 * Verifica se o email tem formato parcialmente válido (está sendo digitado)
 */
export function isPartialEmail(email: string): boolean {
  if (!email || email.trim() === '') return false;
  
  // Tem @ e algo antes dele
  return email.includes('@') && email.indexOf('@') > 0;
}

/**
 * Retorna o domínio do email
 */
export function getEmailDomain(email: string): string | null {
  if (!email.includes('@')) return null;
  
  const parts = email.split('@');
  return parts[1] || null;
}
