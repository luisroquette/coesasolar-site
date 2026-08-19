/**
 * History Sanitizer Module
 * Handles sanitization and preparation of conversation history for LLM context
 * Extracted from sofia-webhook/index.ts (Phase 40 refactoring)
 * 
 * Responsibilities:
 * - Truncating long messages (especially image/PDF analysis)
 * - Filtering out technical error messages
 * - Extracting key data points from analysis messages
 * - Limiting history to prevent context overflow
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface ConversationMessage {
  role: string;
  content: string;
}

export interface HistoryFetchOptions {
  conversaId: string;
  limit?: number;
  filterErrors?: boolean;
  sanitize?: boolean;
}

export interface HistoryFetchResult {
  messages: ConversationMessage[];
  originalCount: number;
  filteredCount: number;
}

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const DEFAULT_HISTORY_LIMIT = 10;
const MAX_MESSAGE_LENGTH = 800;
const TRUNCATED_MESSAGE_LENGTH = 600;

// Patterns for identifying error messages to filter
const ERROR_MESSAGE_PATTERNS = [
  'Desculpe, estou com dificuldades técnicas',
  'Tive um problema técnico',
  'Erro ao processar',
  'Sistema temporariamente indisponível',
];

// Patterns for identifying analysis messages
const ANALYSIS_PATTERNS = [
  '[Análise da imagem:',
  '[📷 Imagem analisada]',
  '[Análise do PDF:',
  '[📄 PDF analisado]',
];

// Known distributors for extraction
const KNOWN_DISTRIBUTORS = [
  'CEMIG', 'COPEL', 'CPFL', 'ENEL', 'LIGHT', 'ENERGISA',
  'CELESC', 'CELPE', 'COELBA', 'ELEKTRO', 'EQUATORIAL',
  'NEOENERGIA', 'EDP', 'CEAL', 'CEMAR', 'COSERN',
];

// ═══════════════════════════════════════════════════════════════
// SANITIZATION FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Check if message is an analysis message
 */
function isAnalysisMessage(content: string): boolean {
  return ANALYSIS_PATTERNS.some(pattern => content.includes(pattern));
}

/**
 * Extract key data points from analysis message
 */
function extractAnalysisKeyPoints(content: string): string {
  const resumo: string[] = [];
  
  // Extract consumption (kWh)
  const consumoMatch = content.match(/(\d{2,5})\s*kWh/i);
  if (consumoMatch) {
    resumo.push(`Consumo: ${consumoMatch[1]} kWh`);
  }
  
  // Extract bill value (R$)
  const valorMatch = content.match(/R\$\s*([\d.,]+)/i);
  if (valorMatch) {
    resumo.push(`Valor: R$ ${valorMatch[1]}`);
  }
  
  // Extract distributor
  const distribuidoraRegex = new RegExp(`(${KNOWN_DISTRIBUTORS.join('|')})`, 'i');
  const distribuidoraMatch = content.match(distribuidoraRegex);
  if (distribuidoraMatch) {
    resumo.push(`Distribuidora: ${distribuidoraMatch[1].toUpperCase()}`);
  }
  
  // Extract installation type if present
  const tipoMatch = content.match(/(Monofásico|Bifásico|Trifásico)/i);
  if (tipoMatch) {
    resumo.push(`Tipo: ${tipoMatch[1]}`);
  }
  
  if (resumo.length > 0) {
    return `[Fatura analisada: ${resumo.join(', ')}]`;
  }
  
  return '[Fatura de energia analisada com sucesso]';
}

/**
 * Sanitize a single message
 * - Truncates long messages
 * - Extracts key points from analysis messages
 */
export function sanitizeMessage(content: string): string {
  // Short messages pass through
  if (content.length <= MAX_MESSAGE_LENGTH) {
    return content;
  }
  
  // For analysis messages, extract key data points
  if (isAnalysisMessage(content)) {
    return extractAnalysisKeyPoints(content);
  }
  
  // For other long messages, truncate with ellipsis
  return content.substring(0, TRUNCATED_MESSAGE_LENGTH) + '...';
}

/**
 * Check if message should be filtered out
 */
function shouldFilterMessage(content: string): boolean {
  return ERROR_MESSAGE_PATTERNS.some(pattern => content.includes(pattern));
}

// ═══════════════════════════════════════════════════════════════
// MAIN FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Fetch and prepare conversation history for LLM context
 */
export async function fetchAndPrepareHistory(
  supabase: SupabaseClient,
  options: HistoryFetchOptions
): Promise<HistoryFetchResult> {
  const {
    conversaId,
    limit = DEFAULT_HISTORY_LIMIT,
    filterErrors = true,
    sanitize = true,
  } = options;
  
  // Fetch messages from database
  const { data: mensagens } = await supabase
    .from('chatbot_mensagens')
    .select('role, content')
    .eq('conversa_id', conversaId)
    .order('created_at', { ascending: false })
    .limit(limit);
  
  const originalCount = mensagens?.length || 0;
  
  if (!mensagens || mensagens.length === 0) {
    return {
      messages: [],
      originalCount: 0,
      filteredCount: 0,
    };
  }
  
  // Process messages: reverse to chronological order, filter, and sanitize
  let processedMessages = mensagens.reverse();
  
  // Filter error messages
  if (filterErrors) {
    processedMessages = processedMessages.filter(m => !shouldFilterMessage(m.content));
  }
  
  // Sanitize messages
  const messages: ConversationMessage[] = processedMessages.map(m => ({
    role: m.role,
    content: sanitize ? sanitizeMessage(m.content) : m.content,
  }));
  
  console.log(`[HISTORY_SANITIZER] Prepared ${messages.length} messages (from ${originalCount})`);
  
  return {
    messages,
    originalCount,
    filteredCount: messages.length,
  };
}

/**
 * Prepare history from pre-fetched messages (no DB call)
 */
export function prepareHistoryFromMessages(
  mensagens: Array<{ role: string; content: string }>,
  options: { filterErrors?: boolean; sanitize?: boolean } = {}
): ConversationMessage[] {
  const { filterErrors = true, sanitize = true } = options;
  
  // Reverse to chronological order
  let processedMessages = [...mensagens].reverse();
  
  // Filter error messages
  if (filterErrors) {
    processedMessages = processedMessages.filter(m => !shouldFilterMessage(m.content));
  }
  
  // Sanitize and return
  return processedMessages.map(m => ({
    role: m.role,
    content: sanitize ? sanitizeMessage(m.content) : m.content,
  }));
}

/**
 * Calculate approximate token count for history
 * Uses rough estimate of 4 chars per token
 */
export function estimateHistoryTokens(messages: ConversationMessage[]): number {
  const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
  return Math.ceil(totalChars / 4);
}

/**
 * Trim history to fit within token budget
 */
export function trimHistoryToTokenBudget(
  messages: ConversationMessage[],
  maxTokens: number
): ConversationMessage[] {
  let currentTokens = 0;
  const result: ConversationMessage[] = [];
  
  // Start from most recent messages (end of array)
  for (let i = messages.length - 1; i >= 0; i--) {
    const messageTokens = Math.ceil(messages[i].content.length / 4);
    
    if (currentTokens + messageTokens > maxTokens) {
      break;
    }
    
    result.unshift(messages[i]);
    currentTokens += messageTokens;
  }
  
  return result;
}
