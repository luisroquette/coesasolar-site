/**
 * Validation Utilities Module
 * Common validation functions for CPF, CNPJ, email, phone
 * 
 * ZERO HARDCODE: Domain fixes and confirmation words loaded from database
 * 
 * Phase 92: Added conversational validation messages
 * 
 * Extracted from sofia-webhook for reuse across edge functions
 */

import { getPatternCache } from './detection-patterns.ts';

// ═══════════════════════════════════════════════════════════════
// DYNAMIC CONFIG LOADERS
// ═══════════════════════════════════════════════════════════════

/**
 * Get domain fixes from patterns cache or fallback
 */
function getDomainFixes(): Record<string, string> {
  const cache = getPatternCache();
  if (cache) {
    const entry = cache.patterns.get('email_domain_fix');
    if (entry && entry.keywords.length > 0) {
      // In this pattern, keywords are the typos and response_template is the fix
      // We need to build a map from pattern -> response_template
      const fixes: Record<string, string> = {};
      // Patterns are stored individually with response_template as the correction
      // We need to iterate through all patterns in this category
      for (const [cat, patternEntry] of cache.patterns.entries()) {
        if (cat === 'email_domain_fix') {
          // Keywords contain typos, responses contain fixes
          // But since we store one pattern per row, we need to check responses map
          for (const keyword of patternEntry.keywords) {
            const fix = cache.responses.get(`email_domain_fix:${keyword}`);
            if (fix) {
              fixes[keyword] = fix;
            }
          }
        }
      }
      if (Object.keys(fixes).length > 0) {
        return fixes;
      }
    }
  }
  
  // Fallback domain fixes
  return FALLBACK_DOMAIN_FIXES;
}

/**
 * Get confirmation words from patterns cache or fallback
 */
function getConfirmationWords(): string[] {
  const cache = getPatternCache();
  if (cache) {
    const entry = cache.patterns.get('email_confirmation');
    if (entry && entry.keywords.length > 0) {
      return entry.keywords;
    }
  }
  
  // Fallback confirmation words
  return FALLBACK_CONFIRM_WORDS;
}

// Fallback values
const FALLBACK_DOMAIN_FIXES: Record<string, string> = {
  'hotamil': 'hotmail',
  'hotamail': 'hotmail',
  'hotmal': 'hotmail',
  'homail': 'hotmail',
  'hitmail': 'hotmail',
  'htmail': 'hotmail',
  'hotmial': 'hotmail',
  'hotmil': 'hotmail',
  'gmial': 'gmail',
  'gmal': 'gmail',
  'gmai': 'gmail',
  'gnail': 'gmail',
  'gamil': 'gmail',
  'gimail': 'gmail',
  'gmeil': 'gmail',
  'outloook': 'outlook',
  'outlok': 'outlook',
  'outllook': 'outlook',
  'otlook': 'outlook',
  'yahooo': 'yahoo',
  'yaoo': 'yahoo',
  'yaho': 'yahoo',
  'iclod': 'icloud',
  'iclould': 'icloud',
};

const FALLBACK_CONFIRM_WORDS = [
  'ok', 'sim', 'pode', 'pode ser', 'isso', 'isso mesmo', 'isso aí',
  'certo', 'correto', 'beleza', 'blz', 'tá bom', 'ta bom', 'tá ótimo',
  'perfeito', 'exato', 'confirmo', 'confirmado', 'pode sim', 'sim pode',
  'esse mesmo', 'é esse', 'é isso', 'tranquilo', 'fechou', 'show',
  'positivo', 'afirmativo', 'uhum', 'aham', 'bora', 'manda',
  'é sim', 'e sim', 'é esse', 'esse ai', 'esse aí', 
  'é esse mesmo', 'esse é', 'tá certo', 'ta certo',
];

// Legacy export for backward compatibility
export const DOMAIN_FIXES = FALLBACK_DOMAIN_FIXES;

// ═══════════════════════════════════════════════════════════════
// BASIC UTILITIES
// ═══════════════════════════════════════════════════════════════

/**
 * Removes all non-numeric characters from string
 */
export function removeNonNumeric(value: string): string {
  return value.replace(/\D/g, '');
}

// ═══════════════════════════════════════════════════════════════
// NAME VALIDATION
// ═══════════════════════════════════════════════════════════════

/**
 * Validates that a name is a real person name (not emoji, special chars only, etc.)
 * 
 * Requirements:
 * - At least 3 characters
 * - Contains at least one letter (a-zA-ZÀ-ÿ)
 * - Not a blacklisted value (greetings, common non-name responses)
 * 
 * @param name - The name to validate
 * @returns true if valid, false otherwise
 */
export function isValidPersonName(name: string | null | undefined): boolean {
  if (!name) return false;
  
  const trimmed = name.trim();
  
  // Must be at least 3 characters
  if (trimmed.length < 3) return false;
  
  // Must contain at least one letter (Latin alphabet including accents)
  const hasLetter = /[a-zA-ZÀ-ÿ]/.test(trimmed);
  if (!hasLetter) return false;
  
  // Strip emojis and special characters, check what remains
  const withoutEmojis = trimmed.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F000}-\u{1F02F}]|[\u{1F0A0}-\u{1F0FF}]|[\u{1F100}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]/gu, '').trim();
  
  // After removing emojis, must still have at least 2 letters
  const lettersOnly = withoutEmojis.replace(/[^a-zA-ZÀ-ÿ]/g, '');
  if (lettersOnly.length < 2) return false;
  
  // Blacklist of common non-name responses
  const blacklist = [
    'oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite',
    'tudo bem', 'tudo bom', 'ok', 'sim', 'não', 'nao',
    'obrigado', 'obrigada', 'vlw', 'valeu', 'blz', 'beleza',
    'pode', 'pode ser', 'certo', 'correto', 'isso', 'isso mesmo',
  ];
  
  const lowerName = trimmed.toLowerCase();
  if (blacklist.includes(lowerName)) return false;
  
  return true;
}

/**
 * Extract a clean name from a string that might contain emojis
 * Removes emojis and extra spaces, keeps only the textual name part
 */
export function extractCleanName(name: string | null | undefined): string | null {
  if (!name) return null;
  
  // Remove emojis
  const withoutEmojis = name.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F000}-\u{1F02F}]|[\u{1F0A0}-\u{1F0FF}]|[\u{1F100}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]/gu, '').trim();
  
  // Remove extra spaces
  const cleaned = withoutEmojis.replace(/\s+/g, ' ').trim();
  
  // Validate the result
  if (isValidPersonName(cleaned)) {
    return cleaned;
  }
  
  return null;
}

// ═══════════════════════════════════════════════════════════════
// CPF VALIDATION
// ═══════════════════════════════════════════════════════════════

/**
 * Validates CPF using official algorithm
 */
export function isValidCPF(cpf: string): boolean {
  const digits = removeNonNumeric(cpf);
  
  if (digits.length !== 11) return false;
  
  // Check if all digits are the same
  if (/^(\d)\1+$/.test(digits)) return false;
  
  // First verifier digit validation
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(digits[i]) * (10 - i);
  }
  let remainder = (sum * 10) % 11;
  if (remainder === 10) remainder = 0;
  if (remainder !== parseInt(digits[9])) return false;
  
  // Second verifier digit validation
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(digits[i]) * (11 - i);
  }
  remainder = (sum * 10) % 11;
  if (remainder === 10) remainder = 0;
  if (remainder !== parseInt(digits[10])) return false;
  
  return true;
}

/**
 * Validates CNPJ using official algorithm
 */
export function isValidCNPJ(cnpj: string): boolean {
  const digits = removeNonNumeric(cnpj);
  
  if (digits.length !== 14) return false;
  
  // Check if all digits are the same
  if (/^(\d)\1+$/.test(digits)) return false;
  
  // First verifier digit validation
  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(digits[i]) * weights1[i];
  }
  let remainder = sum % 11;
  const digit1 = remainder < 2 ? 0 : 11 - remainder;
  if (digit1 !== parseInt(digits[12])) return false;
  
  // Second verifier digit validation
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  sum = 0;
  for (let i = 0; i < 13; i++) {
    sum += parseInt(digits[i]) * weights2[i];
  }
  remainder = sum % 11;
  const digit2 = remainder < 2 ? 0 : 11 - remainder;
  if (digit2 !== parseInt(digits[13])) return false;
  
  return true;
}

// ═══════════════════════════════════════════════════════════════
// CPF/CNPJ FORMATTING
// ═══════════════════════════════════════════════════════════════

/**
 * Formats CPF with dots and dash
 */
export function formatCPF(cpf: string): string {
  const digits = removeNonNumeric(cpf);
  if (digits.length !== 11) return cpf;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

/**
 * Formats CNPJ with dots, slash and dash
 */
export function formatCNPJ(cnpj: string): string {
  const digits = removeNonNumeric(cnpj);
  if (digits.length !== 14) return cnpj;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

/**
 * Masks CPF for display (shows only first 3 and last 2 digits)
 */
export function maskCPF(cpf: string): string {
  const digits = removeNonNumeric(cpf);
  if (digits.length !== 11) return cpf;
  return `${digits.slice(0, 3)}.***.***-${digits.slice(9)}`;
}

/**
 * Masks CNPJ for display
 */
export function maskCNPJ(cnpj: string): string {
  const digits = removeNonNumeric(cnpj);
  if (digits.length !== 14) return cnpj;
  return `${digits.slice(0, 2)}.***.***/****-${digits.slice(12)}`;
}

// ═══════════════════════════════════════════════════════════════
// CPF/CNPJ EXTRACTION
// ═══════════════════════════════════════════════════════════════

/**
 * Detects if string contains a CPF (11 digits)
 */
export function extractCPF(text: string): string | null {
  // Pattern: 11 consecutive digits or formatted XXX.XXX.XXX-XX
  const patterns = [
    /(\d{3}[.\s]?\d{3}[.\s]?\d{3}[-.\s]?\d{2})/,
    /(?<!\d)(\d{11})(?!\d)/,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const digits = removeNonNumeric(match[1]);
      if (digits.length === 11 && isValidCPF(digits)) {
        return digits;
      }
    }
  }
  return null;
}

/**
 * Detects if string contains a CNPJ (14 digits)
 */
export function extractCNPJ(text: string): string | null {
  // Pattern: 14 consecutive digits or formatted XX.XXX.XXX/XXXX-XX
  const patterns = [
    /(\d{2}[.\s]?\d{3}[.\s]?\d{3}[/.\s]?\d{4}[-.\s]?\d{2})/,
    /(?<!\d)(\d{14})(?!\d)/,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const digits = removeNonNumeric(match[1]);
      if (digits.length === 14 && isValidCNPJ(digits)) {
        return digits;
      }
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// EMAIL VALIDATION AND CORRECTION
// ═══════════════════════════════════════════════════════════════

/**
 * Validates email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email.trim());
}

/**
 * Extracts email from text
 */
export function extractEmail(text: string): string | null {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  const match = text.match(emailRegex);
  return match ? match[0].toLowerCase() : null;
}

export interface MalformedEmailResult {
  isMalformed: boolean;
  originalText: string;
  suggestedEmail: string | null;
}

/**
 * Detects malformed emails and suggests corrections
 */
export function detectMalformedEmail(message: string): MalformedEmailResult {
  const lowerMessage = message.toLowerCase().trim();
  const trimmedMessage = message.trim();
  
  // Pattern 1: Missing @ before domain (e.g., "nome759ahot.com")
  const missingAtPattern = /([a-z0-9._-]+)(ahot|ahotmail|agmail|aoutlook|ayahoo)(\.com)?$/i;
  const missingAtMatch = lowerMessage.match(missingAtPattern);
  if (missingAtMatch) {
    const username = missingAtMatch[1];
    let domainPart = missingAtMatch[2].replace(/^a/, '');
    if (domainPart === 'hot') domainPart = 'hotmail';
    const suggestedEmail = `${username}@${domainPart}.com`;
    return {
      isMalformed: true,
      originalText: trimmedMessage,
      suggestedEmail,
    };
  }
  
  // Pattern 2: Domain typos (dynamically loaded)
  const domainFixes = getDomainFixes();
  for (const [typo, fix] of Object.entries(domainFixes)) {
    if (lowerMessage.includes(typo)) {
      const suggestedEmail = lowerMessage.replace(typo, fix);
      if (isValidEmail(suggestedEmail)) {
        return {
          isMalformed: true,
          originalText: trimmedMessage,
          suggestedEmail,
        };
      }
    }
  }
  
  return {
    isMalformed: false,
    originalText: trimmedMessage,
    suggestedEmail: null,
  };
}

/**
 * Checks if user confirmed or corrected a pending email
 */
export function checkEmailConfirmation(message: string, pendingEmail: string): { 
  status: 'confirmed' | 'corrected' | 'unclear';
  newEmail?: string;
} {
  const lowerMessage = message.toLowerCase().trim();
  
  // Words indicating confirmation (dynamically loaded)
  const confirmWords = getConfirmationWords();
  
  // Check for confirmation
  if (confirmWords.some(w => lowerMessage === w || (lowerMessage.includes(w) && lowerMessage.length < 30))) {
    return { status: 'confirmed' };
  }
  
  // Check if user provided a NEW email (correction)
  const emailPattern = /[\w.+-]+@[\w-]+\.[\w.-]+/;
  const emailMatch = message.match(emailPattern);
  if (emailMatch) {
    const newEmail = emailMatch[0].toLowerCase();
    // Only treat as correction if it's different from pending
    if (newEmail !== pendingEmail.toLowerCase()) {
      return { status: 'corrected', newEmail };
    }
    // If same email, consider it confirmed
    return { status: 'confirmed' };
  }
  
  // Check if message contains the pending email
  if (lowerMessage.includes(pendingEmail.toLowerCase())) {
    return { status: 'confirmed' };
  }
  
  return { status: 'unclear' };
}

// ═══════════════════════════════════════════════════════════════
// PHONE VALIDATION
// ═══════════════════════════════════════════════════════════════

/**
 * Formats phone for WhatsApp link (wa.me format)
 */
export function formatWhatsAppLink(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return `https://wa.me/${digits}`;
}

/**
 * Formats phone with country code (Brazil)
 */
export function formatPhoneBR(phone: string): string {
  const digits = removeNonNumeric(phone);
  
  // Already has country code
  if (digits.startsWith('55') && digits.length >= 12) {
    return '+' + digits;
  }
  
  // Add country code
  if (digits.length >= 10) {
    return '+55' + digits;
  }
  
  return phone;
}

/**
 * Extracts phone number from text
 */
export function extractPhone(text: string): string | null {
  // Brazilian phone patterns
  const patterns = [
    /(?:\+?55\s?)?(?:\(?0?\d{2}\)?\s?)?\d{4,5}[-.\s]?\d{4}/,
    /(?<!\d)(\d{10,11})(?!\d)/,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const digits = removeNonNumeric(match[0]);
      if (digits.length >= 10 && digits.length <= 13) {
        return digits;
      }
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// PHASE 92: CONVERSATIONAL VALIDATION MESSAGES
// Human-friendly error messages for common validation failures
// ═══════════════════════════════════════════════════════════════

export type ValidationErrorType = 
  | 'cpf_invalid'
  | 'cpf_format'
  | 'cnpj_invalid'
  | 'cnpj_format'
  | 'email_invalid'
  | 'email_typo'
  | 'phone_invalid'
  | 'cep_invalid'
  | 'valor_baixo'
  | 'valor_alto'
  | 'valor_format'
  | 'consumo_baixo'
  | 'consumo_alto'
  | 'name_too_short'
  | 'generic';

export interface ConversationalValidationMessage {
  type: ValidationErrorType;
  message: string;
  suggestion?: string;
  emoji: string;
}

/**
 * Generate a conversational, friendly validation error message
 * Instead of technical errors, provides helpful guidance
 */
export function getConversationalValidationMessage(
  type: ValidationErrorType,
  clienteNome?: string | null,
  context?: Record<string, unknown>
): ConversationalValidationMessage {
  const firstName = clienteNome?.split(' ')[0] || '';
  const greeting = firstName ? `${firstName}, ` : '';

  const messages: Record<ValidationErrorType, ConversationalValidationMessage> = {
    cpf_invalid: {
      type: 'cpf_invalid',
      message: `${greeting}hmm, parece que esse CPF não está batendo 🤔 Consegue conferir os números e me mandar de novo?`,
      suggestion: 'Formato esperado: 123.456.789-00 ou apenas os 11 números',
      emoji: '🤔',
    },
    cpf_format: {
      type: 'cpf_format',
      message: `${greeting}preciso do CPF com 11 números! Pode me passar completinho? 😊`,
      suggestion: 'Exemplo: 123.456.789-00',
      emoji: '😊',
    },
    cnpj_invalid: {
      type: 'cnpj_invalid',
      message: `${greeting}esse CNPJ não parece estar correto 🤔 Pode verificar e me mandar novamente?`,
      suggestion: 'Formato esperado: 12.345.678/0001-00 ou apenas os 14 números',
      emoji: '🤔',
    },
    cnpj_format: {
      type: 'cnpj_format',
      message: `${greeting}preciso do CNPJ completo com 14 números! 📋`,
      suggestion: 'Exemplo: 12.345.678/0001-00',
      emoji: '📋',
    },
    email_invalid: {
      type: 'email_invalid',
      message: `${greeting}esse e-mail não parece estar completo 📧 Pode conferir se digitou certinho?`,
      suggestion: 'Verifique se tem @ e o domínio (.com, .com.br, etc)',
      emoji: '📧',
    },
    email_typo: {
      type: 'email_typo',
      message: `${greeting}notei um possível erro no e-mail! ${context?.suggestedEmail ? `Seria *${context.suggestedEmail}*?` : 'Pode conferir?'} 📧`,
      emoji: '📧',
    },
    phone_invalid: {
      type: 'phone_invalid',
      message: `${greeting}não consegui identificar o telefone 📱 Me passa com DDD, por favor! Ex: (31) 99999-9999`,
      emoji: '📱',
    },
    cep_invalid: {
      type: 'cep_invalid',
      message: `${greeting}preciso de um CEP válido com 8 números! 📍`,
      suggestion: 'Exemplo: 30130-000',
      emoji: '📍',
    },
    valor_baixo: {
      type: 'valor_baixo',
      message: `${greeting}hmm, o valor mínimo para participar é de *R$ 300/mês* 💡 Sua conta é maior que isso?`,
      suggestion: 'Se sua conta for menor, infelizmente não conseguimos oferecer desconto significativo',
      emoji: '💡',
    },
    valor_alto: {
      type: 'valor_alto',
      message: `${greeting}uau, essa conta é bem alta! 💰 Para valores acima de R$ 50.000, temos um atendimento especial. Vou pedir para nossa equipe entrar em contato!`,
      emoji: '💰',
    },
    valor_format: {
      type: 'valor_format',
      message: `${greeting}não consegui identificar o valor 🔢 Pode me passar só o número? Ex: 350 ou R$ 350,00`,
      emoji: '🔢',
    },
    consumo_baixo: {
      type: 'consumo_baixo',
      message: `${greeting}o consumo mínimo para participar é de *500 kWh/mês* ⚡ Seu consumo é maior que isso?`,
      suggestion: 'Você encontra essa informação na sua conta de luz',
      emoji: '⚡',
    },
    consumo_alto: {
      type: 'consumo_alto',
      message: `${greeting}que consumo impressionante! 🏭 Para esse volume, temos condições especiais. Vou encaminhar para nossa equipe corporativa!`,
      emoji: '🏭',
    },
    name_too_short: {
      type: 'name_too_short',
      message: `${greeting}preciso do seu nome completo para a proposta! Como você se chama? 😊`,
      emoji: '😊',
    },
    generic: {
      type: 'generic',
      message: `${greeting}não consegui entender essa informação 🤔 Pode me passar de outra forma?`,
      emoji: '🤔',
    },
  };

  return messages[type] || messages.generic;
}

/**
 * Get validation message for CPF issues
 */
export function getCPFValidationMessage(
  cpf: string,
  clienteNome?: string | null
): ConversationalValidationMessage | null {
  const digits = removeNonNumeric(cpf);
  
  if (digits.length < 11) {
    return getConversationalValidationMessage('cpf_format', clienteNome);
  }
  
  if (digits.length === 11 && !isValidCPF(digits)) {
    return getConversationalValidationMessage('cpf_invalid', clienteNome);
  }
  
  return null; // Valid
}

/**
 * Get validation message for CNPJ issues
 */
export function getCNPJValidationMessage(
  cnpj: string,
  clienteNome?: string | null
): ConversationalValidationMessage | null {
  const digits = removeNonNumeric(cnpj);
  
  if (digits.length < 14) {
    return getConversationalValidationMessage('cnpj_format', clienteNome);
  }
  
  if (digits.length === 14 && !isValidCNPJ(digits)) {
    return getConversationalValidationMessage('cnpj_invalid', clienteNome);
  }
  
  return null; // Valid
}

/**
 * Get validation message for email issues
 */
export function getEmailValidationMessage(
  email: string,
  clienteNome?: string | null
): ConversationalValidationMessage | null {
  const trimmed = email.trim();
  
  // Check for typos first
  const typoResult = detectMalformedEmail(trimmed);
  if (typoResult.isMalformed && typoResult.suggestedEmail) {
    return getConversationalValidationMessage('email_typo', clienteNome, {
      suggestedEmail: typoResult.suggestedEmail,
    });
  }
  
  // Basic validation
  if (!isValidEmail(trimmed)) {
    return getConversationalValidationMessage('email_invalid', clienteNome);
  }
  
  return null; // Valid
}

/**
 * Get validation message for bill value issues
 */
export function getValorValidationMessage(
  valor: number | string,
  clienteNome?: string | null,
  minValor: number = 300,
  maxValor: number = 50000
): ConversationalValidationMessage | null {
  const numericValue = typeof valor === 'string' 
    ? parseFloat(valor.replace(/[^\d,.-]/g, '').replace(',', '.'))
    : valor;
  
  if (isNaN(numericValue)) {
    return getConversationalValidationMessage('valor_format', clienteNome);
  }
  
  if (numericValue < minValor) {
    return getConversationalValidationMessage('valor_baixo', clienteNome);
  }
  
  if (numericValue > maxValor) {
    return getConversationalValidationMessage('valor_alto', clienteNome);
  }
  
  return null; // Valid
}

/**
 * Get validation message for consumption issues
 */
export function getConsumoValidationMessage(
  consumo: number | string,
  clienteNome?: string | null,
  minConsumo: number = 500,
  maxConsumo: number = 500000
): ConversationalValidationMessage | null {
  const numericValue = typeof consumo === 'string'
    ? parseFloat(consumo.replace(/[^\d,.-]/g, '').replace(',', '.'))
    : consumo;
  
  if (isNaN(numericValue)) {
    return getConversationalValidationMessage('valor_format', clienteNome);
  }
  
  if (numericValue < minConsumo) {
    return getConversationalValidationMessage('consumo_baixo', clienteNome);
  }
  
  if (numericValue > maxConsumo) {
    return getConversationalValidationMessage('consumo_alto', clienteNome);
  }
  
  return null; // Valid
}

/**
 * Validate and return conversational message for any field type
 */
export function validateWithConversationalFeedback(
  fieldType: 'cpf' | 'cnpj' | 'email' | 'phone' | 'valor' | 'consumo' | 'name',
  value: string,
  clienteNome?: string | null
): ConversationalValidationMessage | null {
  switch (fieldType) {
    case 'cpf':
      return getCPFValidationMessage(value, clienteNome);
    case 'cnpj':
      return getCNPJValidationMessage(value, clienteNome);
    case 'email':
      return getEmailValidationMessage(value, clienteNome);
    case 'phone':
      const phoneDigits = removeNonNumeric(value);
      if (phoneDigits.length < 10 || phoneDigits.length > 13) {
        return getConversationalValidationMessage('phone_invalid', clienteNome);
      }
      return null;
    case 'valor':
      return getValorValidationMessage(value, clienteNome);
    case 'consumo':
      return getConsumoValidationMessage(value, clienteNome);
    case 'name':
      if (value.trim().length < 3 || value.trim().split(' ').length < 1) {
        return getConversationalValidationMessage('name_too_short', clienteNome);
      }
      return null;
    default:
      return null;
  }
}
