/**
 * Context Compressor Module
 * Compresses prompts while maintaining semantic efficacy
 * Target: 80% reduction as per AGENTS.md findings
 * 
 * Techniques:
 * 1. Remove duplicate whitespace
 * 2. Abbreviate common terms
 * 3. Remove decorative emojis (keep semantic ones)
 * 4. Collapse lists to inline format
 * 5. Remove redundant examples
 * 6. Prioritize sections by importance
 * 
 * @module _shared/context-compressor
 */

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface CompressionConfig {
  maxChars: number;
  preserveSections: string[];
  aggressiveness: 'low' | 'medium' | 'high';
  removeEmojis: boolean;
  abbreviateTerms: boolean;
  collapseWhitespace: boolean;
  removeDuplicateLines: boolean;
}

export interface CompressionResult {
  compressed: string;
  originalLength: number;
  compressedLength: number;
  compressionRatio: number;
  sectionsPreserved: string[];
  sectionsRemoved: string[];
  techniques: string[];
}

export interface SectionPriority {
  pattern: RegExp;
  priority: number; // 1-10, higher = more important
  name: string;
}

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

// Terms that can be abbreviated
const ABBREVIATION_MAP: Record<string, string> = {
  'distribuidora': 'dist.',
  'DISTRIBUIDORA': 'DIST.',
  'proposta': 'prop.',
  'PROPOSTA': 'PROP.',
  'documento': 'doc.',
  'DOCUMENTO': 'DOC.',
  'documentos': 'docs.',
  'DOCUMENTOS': 'DOCS.',
  'cliente': 'cli.',
  'CLIENTE': 'CLI.',
  'economia': 'econ.',
  'ECONOMIA': 'ECON.',
  'assinatura': 'assin.',
  'ASSINATURA': 'ASSIN.',
  'contrato': 'contr.',
  'CONTRATO': 'CONTR.',
  'obrigatório': 'obrig.',
  'OBRIGATÓRIO': 'OBRIG.',
  'residencial': 'resid.',
  'RESIDENCIAL': 'RESID.',
  'comercial': 'comerc.',
  'COMERCIAL': 'COMERC.',
  'atendimento': 'atend.',
  'ATENDIMENTO': 'ATEND.',
  'qualificação': 'qualif.',
  'QUALIFICAÇÃO': 'QUALIF.',
  'informação': 'info.',
  'INFORMAÇÃO': 'INFO.',
  'informações': 'infos.',
  'INFORMAÇÕES': 'INFOS.',
};

// Decorative emojis to remove (keep semantic ones like ✅ ❌ ⚠️)
const DECORATIVE_EMOJIS = /[🎉🎊🌟💫✨🔥💪🙌👏🎯💡🚀🌈💖💕❤️😊😄😃🥳]/g;

// Section priority patterns (higher = more important, preserved first)
// AGENTS.md v3.4: Updated patterns to match new section headers
const SECTION_PRIORITIES: SectionPriority[] = [
  { pattern: /CLÁUSULA|PETREA|INVIOLÁVEL/i, priority: 10, name: 'clausulas_petreas' },
  { pattern: /RETRIEVAL-LED|HIERARQUIA/i, priority: 10, name: 'retrieval_led' },
  { pattern: /REGRAS ATIVAS|RULE_MEMORY/i, priority: 9, name: 'rule_memory' },
  { pattern: /ANTI-ALUCINA|PROIBIDO/i, priority: 9, name: 'anti_alucinacao' },
  { pattern: /FEW-SHOT|EXEMPLOS DE RACIOCÍNIO/i, priority: 8, name: 'few_shot' },
  { pattern: /DOCS_DISPONÍVEIS|RAG.*INDEX/i, priority: 7, name: 'rag_index' },
  { pattern: /RAG|BASE DE CONHECIMENTO/i, priority: 6, name: 'rag_context' },
  { pattern: /CONTEXTO|📊 DADOS/i, priority: 5, name: 'client_context' },
  { pattern: /📝 FORMATO|ESTILO/i, priority: 3, name: 'format' },
  { pattern: /LEGACY|FALLBACK/i, priority: 1, name: 'legacy' }, // Baixa prioridade - remover primeiro
];

// ═══════════════════════════════════════════════════════════════
// COMPRESSION FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Main compression function
 * Compresses context while preserving semantic meaning
 */
export function compressContext(
  fullPrompt: string,
  config: Partial<CompressionConfig> = {}
): CompressionResult {
  // AGENTS.md v3.4: Auto-select aggressiveness based on prompt size
  const autoAggressiveness = fullPrompt.length > 10000 ? 'high' : 
                             fullPrompt.length > 8000 ? 'medium' : 'low';
  
  const cfg: CompressionConfig = {
    maxChars: config.maxChars ?? 8000,
    preserveSections: config.preserveSections ?? ['clausulas_petreas', 'retrieval_led', 'rule_memory', 'anti_alucinacao'],
    aggressiveness: config.aggressiveness ?? autoAggressiveness,
    removeEmojis: config.removeEmojis ?? false, // Keep semantic emojis (📊, ❌, ✅)
    abbreviateTerms: config.abbreviateTerms ?? true,
    collapseWhitespace: config.collapseWhitespace ?? true,
    removeDuplicateLines: config.removeDuplicateLines ?? true,
  };
  
  const originalLength = fullPrompt.length;
  const techniques: string[] = [];
  let compressed = fullPrompt;
  
  // 1. Collapse multiple whitespace
  if (cfg.collapseWhitespace) {
    compressed = collapseWhitespace(compressed);
    techniques.push('collapse_whitespace');
  }
  
  // 2. Remove decorative emojis (keep semantic ones)
  if (cfg.removeEmojis) {
    compressed = removeDecorativeEmojis(compressed);
    techniques.push('remove_decorative_emojis');
  }
  
  // 3. Abbreviate common terms
  if (cfg.abbreviateTerms && cfg.aggressiveness !== 'low') {
    compressed = abbreviateTerms(compressed);
    techniques.push('abbreviate_terms');
  }
  
  // 4. Remove duplicate lines
  if (cfg.removeDuplicateLines) {
    compressed = removeDuplicateLines(compressed);
    techniques.push('remove_duplicates');
  }
  
  // 5. Collapse inline lists (medium/high aggressiveness)
  if (cfg.aggressiveness !== 'low') {
    compressed = collapseInlineLists(compressed);
    techniques.push('collapse_lists');
  }
  
  // 6. Remove redundant examples (high aggressiveness)
  if (cfg.aggressiveness === 'high') {
    compressed = removeRedundantExamples(compressed);
    techniques.push('remove_examples');
  }
  
  // 7. Truncate if still over limit (preserve priority sections)
  const sectionsPreserved: string[] = [];
  const sectionsRemoved: string[] = [];
  
  if (compressed.length > cfg.maxChars) {
    const truncated = truncateByPriority(compressed, cfg.maxChars, cfg.preserveSections);
    compressed = truncated.result;
    sectionsPreserved.push(...truncated.preserved);
    sectionsRemoved.push(...truncated.removed);
    techniques.push('truncate_by_priority');
  }
  
  const compressedLength = compressed.length;
  const compressionRatio = 1 - (compressedLength / originalLength);
  
  console.log(`[ContextCompressor] ${originalLength} → ${compressedLength} chars (${(compressionRatio * 100).toFixed(1)}% reduction)`);
  
  return {
    compressed,
    originalLength,
    compressedLength,
    compressionRatio,
    sectionsPreserved,
    sectionsRemoved,
    techniques,
  };
}

/**
 * Collapse multiple whitespace characters
 */
function collapseWhitespace(text: string): string {
  return text
    .replace(/\n{3,}/g, '\n\n') // Max 2 consecutive newlines
    .replace(/[ \t]{2,}/g, ' ') // Max 1 space/tab
    .replace(/^\s+$/gm, '')     // Remove whitespace-only lines
    .trim();
}

/**
 * Remove decorative emojis but keep semantic ones
 */
function removeDecorativeEmojis(text: string): string {
  return text.replace(DECORATIVE_EMOJIS, '');
}

/**
 * Abbreviate common terms
 */
function abbreviateTerms(text: string): string {
  let result = text;
  
  for (const [full, abbrev] of Object.entries(ABBREVIATION_MAP)) {
    // Only abbreviate in non-header contexts (preserve headers)
    const pattern = new RegExp(`(?<!#\\s*)\\b${full}\\b`, 'g');
    result = result.replace(pattern, abbrev);
  }
  
  return result;
}

/**
 * Remove duplicate consecutive lines
 */
function removeDuplicateLines(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let lastLine = '';
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed !== lastLine || trimmed === '') {
      result.push(line);
      lastLine = trimmed;
    }
  }
  
  return result.join('\n');
}

/**
 * Collapse multi-line lists to inline format
 * Example: "- Item 1\n- Item 2" → "• Item 1 | Item 2"
 */
function collapseInlineLists(text: string): string {
  // Find list blocks (3+ consecutive "- " lines)
  const listPattern = /(?:^[-•]\s+.+$\n?){4,}/gm;
  
  return text.replace(listPattern, (match) => {
    const items = match
      .split('\n')
      .map(line => line.replace(/^[-•]\s+/, '').trim())
      .filter(Boolean);
    
    // If items are short, join inline
    if (items.every(item => item.length < 50)) {
      return '• ' + items.join(' | ') + '\n';
    }
    
    return match; // Keep as-is if items are long
  });
}

/**
 * Remove redundant examples (keep first example only)
 */
function removeRedundantExamples(text: string): string {
  // Pattern for example blocks
  const examplePattern = /(?:Exemplo|Ex|E\.g\.):\s*.+(?:\n.+)*/gi;
  let exampleCount = 0;
  
  return text.replace(examplePattern, (match) => {
    exampleCount++;
    if (exampleCount > 2) {
      return '[exemplos omitidos]';
    }
    return match;
  });
}

/**
 * Truncate content by section priority
 * Preserves high-priority sections, removes low-priority ones first
 */
function truncateByPriority(
  text: string,
  maxChars: number,
  mustPreserve: string[]
): { result: string; preserved: string[]; removed: string[] } {
  // Split into sections by separator patterns
  const sections = text.split(/(?=═{3,}|#{2,})/);
  
  // Score each section
  const scoredSections = sections.map((section, idx) => {
    let priority = 4; // default
    let name = `section_${idx}`;
    
    for (const sp of SECTION_PRIORITIES) {
      if (sp.pattern.test(section)) {
        priority = sp.priority;
        name = sp.name;
        break;
      }
    }
    
    // Boost priority if must preserve
    if (mustPreserve.some(mp => name.includes(mp))) {
      priority = 10;
    }
    
    return { section, priority, name, idx };
  });
  
  // Sort by priority (highest first)
  scoredSections.sort((a, b) => b.priority - a.priority);
  
  // Build result up to maxChars
  const preserved: string[] = [];
  const removed: string[] = [];
  let result = '';
  let currentLength = 0;
  
  for (const { section, name } of scoredSections) {
    if (currentLength + section.length <= maxChars) {
      result += section;
      currentLength += section.length;
      preserved.push(name);
    } else if (currentLength < maxChars * 0.9) {
      // Try to fit a truncated version
      const available = maxChars - currentLength - 50;
      if (available > 200) {
        result += section.substring(0, available) + '\n...[TRUNCADO]\n';
        currentLength = maxChars;
        preserved.push(`${name}(partial)`);
      } else {
        removed.push(name);
      }
    } else {
      removed.push(name);
    }
  }
  
  return { result, preserved, removed };
}

// ═══════════════════════════════════════════════════════════════
// SPECIALIZED COMPRESSORS
// ═══════════════════════════════════════════════════════════════

/**
 * Compress RAG context specifically
 * Optimized for document chunks
 */
export function compressRAGContext(
  ragContent: string,
  maxChars: number = 1500
): string {
  if (ragContent.length <= maxChars) {
    return ragContent;
  }
  
  // Remove verbose metadata
  let compressed = ragContent
    .replace(/Fonte:\s*.+\n/g, '')
    .replace(/Arquivo:\s*.+\n/g, '')
    .replace(/Categoria:\s*.+\n/g, '')
    .replace(/Similaridade:\s*\d+%?\n/g, '');
  
  // Collapse whitespace
  compressed = collapseWhitespace(compressed);
  
  // If still too long, truncate with indicator
  if (compressed.length > maxChars) {
    compressed = compressed.substring(0, maxChars - 30) + '\n...[+mais docs disponíveis]';
  }
  
  return compressed;
}

/**
 * Compress rule memory for injection
 */
export function compressRuleMemory(
  rules: Array<{ name: string; description: string; priority: number; ruleType: string }>
): string {
  if (rules.length === 0) return '';
  
  // Sort by priority (highest first)
  const sorted = [...rules].sort((a, b) => b.priority - a.priority);
  
  // Compress to inline format
  const lines = sorted.map((r, i) => 
    `${i + 1}. [${r.ruleType}|P${r.priority}] ${r.name}: ${r.description?.substring(0, 80) || ''}`
  );
  
  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════

// AGENTS.md v3.4: Updated defaults
export const DEFAULT_COMPRESSION_CONFIG: CompressionConfig = {
  maxChars: 8000,
  preserveSections: ['clausulas_petreas', 'retrieval_led', 'rule_memory', 'anti_alucinacao'],
  aggressiveness: 'medium',
  removeEmojis: false, // Keep semantic emojis
  abbreviateTerms: true,
  collapseWhitespace: true,
  removeDuplicateLines: true,
};
