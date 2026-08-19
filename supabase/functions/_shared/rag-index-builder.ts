/**
 * RAG Index Builder Module
 * Provides a compact index of available RAG categories for the LLM
 * Implements AGENTS.md P3: RAG Index feature
 * 
 * Purpose:
 * - Helps LLM know "what knowledge is available" before reasoning
 * - Compact pipe-delimited format: DOCS_DISPONÍVEIS: faq_geral|processo|financeiro|...
 * - Cached per agent to minimize database hits
 * 
 * @module _shared/rag-index-builder
 * @version 1.0
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface RAGCategory {
  category: string;
  label: string;
  docCount: number;
  isActive: boolean;
}

export interface RAGIndexResult {
  indexLine: string;          // Compact format: "DOCS_DISPONÍVEIS: cat1|cat2|cat3"
  categories: RAGCategory[];  // Full category details
  totalDocs: number;          // Total documents available
  executionTimeMs: number;    // Performance tracking
  wasCached: boolean;         // Cache hit indicator
}

// ═══════════════════════════════════════════════════════════════
// CACHE
// ═══════════════════════════════════════════════════════════════

interface CacheEntry {
  categories: RAGCategory[];
  indexLine: string;
  totalDocs: number;
  timestamp: number;
}

const indexCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes (categories change rarely)

// ═══════════════════════════════════════════════════════════════
// CATEGORY LABELS (Compact, emoji-prefixed for quick LLM recognition)
// ═══════════════════════════════════════════════════════════════

const CATEGORY_LABELS: Record<string, string> = {
  'faq_geral': '❓FAQ',
  'processo': '📋Processo',
  'empresa': '🏢Empresa',
  'energia_solar': '☀️Solar',
  'requisitos': '✅Requisitos',
  'financeiro': '💰Financeiro',
  'objecoes': '🤝Objeções',
  'valores': '💵Valores',
  'documentos': '📄Documentos',
  'seguranca': '🔐Segurança',
  'contrato': '📝Contrato',
  'vendas': '🎯Vendas',
  'sac': '📞SAC',
  'cobranca': '💳Cobrança',
  'tecnico': '🔧Técnico',
  'juridico': '⚖️Jurídico',
  'codigo_agente': '🧠Código',
};

/**
 * Get label for a category (with fallback)
 */
function getCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category] || `📌${category}`;
}

// ═══════════════════════════════════════════════════════════════
// MAIN FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Build a compact RAG index for prompt injection
 * Returns available categories in pipe-delimited format
 */
export async function buildRAGIndex(
  supabase: SupabaseClient,
  agentId: string,
  options?: {
    includeLabels?: boolean;    // Use emoji labels instead of raw names
    includeCounts?: boolean;    // Include doc counts: "faq(12)|processo(8)"
    minDocsThreshold?: number;  // Only include categories with >= N docs
  }
): Promise<RAGIndexResult> {
  const startTime = Date.now();
  
  const includeLabels = options?.includeLabels ?? true;
  const includeCounts = options?.includeCounts ?? false;
  const minDocsThreshold = options?.minDocsThreshold ?? 1;
  
  // Check cache first
  const cacheKey = agentId;
  const cached = indexCache.get(cacheKey);
  
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
    console.log(`[RAG-INDEX] Using cached index for ${agentId} (${cached.categories.length} categories)`);
    return {
      indexLine: cached.indexLine,
      categories: cached.categories,
      totalDocs: cached.totalDocs,
      executionTimeMs: Date.now() - startTime,
      wasCached: true,
    };
  }
  
  try {
    // Query distinct categories with doc counts from rag_documents
    const { data: categoryData, error } = await supabase
      .from('rag_documents')
      .select('category')
      .eq('is_active', true)
      .eq('processing_status', 'completed');
    
    if (error) {
      console.error('[RAG-INDEX] Error fetching categories:', error);
      return buildEmptyResult(startTime);
    }
    
    if (!categoryData || categoryData.length === 0) {
      console.log('[RAG-INDEX] No active RAG documents found');
      return buildEmptyResult(startTime);
    }
    
    // Count documents per category
    const categoryCounts = new Map<string, number>();
    for (const doc of categoryData) {
      if (doc.category) {
        categoryCounts.set(doc.category, (categoryCounts.get(doc.category) || 0) + 1);
      }
    }
    
    // Build categories array with counts
    const categories: RAGCategory[] = [];
    for (const [category, count] of categoryCounts.entries()) {
      if (count >= minDocsThreshold) {
        categories.push({
          category,
          label: getCategoryLabel(category),
          docCount: count,
          isActive: true,
        });
      }
    }
    
    // Sort by doc count (most docs first = most useful)
    categories.sort((a, b) => b.docCount - a.docCount);
    
    // Build compact index line
    const indexLine = buildIndexLine(categories, includeLabels, includeCounts);
    const totalDocs = categoryData.length;
    
    // Cache the result
    indexCache.set(cacheKey, {
      categories,
      indexLine,
      totalDocs,
      timestamp: Date.now(),
    });
    
    const executionTimeMs = Date.now() - startTime;
    console.log(`[RAG-INDEX] Built index: ${categories.length} categories, ${totalDocs} docs (${executionTimeMs}ms)`);
    
    return {
      indexLine,
      categories,
      totalDocs,
      executionTimeMs,
      wasCached: false,
    };
    
  } catch (error) {
    console.error('[RAG-INDEX] Exception building index:', error);
    return buildEmptyResult(startTime);
  }
}

/**
 * Build the compact index line for prompt injection
 */
function buildIndexLine(
  categories: RAGCategory[],
  includeLabels: boolean,
  includeCounts: boolean
): string {
  if (categories.length === 0) {
    return '';
  }
  
  const parts = categories.map(cat => {
    const name = includeLabels ? cat.label : cat.category;
    if (includeCounts) {
      return `${name}(${cat.docCount})`;
    }
    return name;
  });
  
  return `📚 DOCS_DISPONÍVEIS: ${parts.join('|')}`;
}

/**
 * Build prompt block for RAG index
 * Returns formatted block ready for system prompt injection
 */
export function buildRAGIndexPromptBlock(indexResult: RAGIndexResult): string {
  if (!indexResult.indexLine || indexResult.categories.length === 0) {
    return '';
  }
  
  return `
## CONHECIMENTO DISPONÍVEL
${indexResult.indexLine}
↳ Consulte estes tópicos para fundamentar respostas; se não houver cobertura, pergunte ao cliente.
`;
}

/**
 * Get pre-built index for a specific funnel stage
 * Returns categories most relevant to that stage
 */
export function getStageRelevantCategories(funnelStage: string): string[] {
  const stageMapping: Record<string, string[]> = {
    'triagem': ['faq_geral', 'processo', 'empresa'],
    'qualificacao': ['energia_solar', 'faq_geral', 'requisitos'],
    'coleta_dados': ['processo', 'financeiro', 'requisitos'],
    'proposta_inicial': ['financeiro', 'objecoes', 'valores'],
    'docs_plataforma': ['documentos', 'processo', 'seguranca'],
    'proposta_definitiva': ['contrato', 'objecoes', 'financeiro'],
    'assinatura': ['contrato', 'processo', 'objecoes'],
  };
  
  return stageMapping[funnelStage] || ['faq_geral', 'processo'];
}

/**
 * Build empty result helper
 */
function buildEmptyResult(startTime: number): RAGIndexResult {
  return {
    indexLine: '',
    categories: [],
    totalDocs: 0,
    executionTimeMs: Date.now() - startTime,
    wasCached: false,
  };
}

// ═══════════════════════════════════════════════════════════════
// CACHE MANAGEMENT
// ═══════════════════════════════════════════════════════════════

/**
 * Clear index cache (call when RAG documents are updated)
 */
export function clearRAGIndexCache(agentId?: string): void {
  if (agentId) {
    indexCache.delete(agentId);
  } else {
    indexCache.clear();
  }
  console.log('[RAG-INDEX] Cache cleared');
}

/**
 * Get cache status for debugging
 */
export function getRAGIndexCacheStatus(): {
  entries: number;
  oldestEntry: number | null;
} {
  let oldestTimestamp: number | null = null;
  
  for (const value of indexCache.values()) {
    if (!oldestTimestamp || value.timestamp < oldestTimestamp) {
      oldestTimestamp = value.timestamp;
    }
  }
  
  return {
    entries: indexCache.size,
    oldestEntry: oldestTimestamp ? Date.now() - oldestTimestamp : null,
  };
}
