/**
 * Passive RAG Prefetch Module
 * Pre-fetches RAG context based on funnel stage instead of on-demand search
 * Implements AGENTS.md-style passive context injection
 * 
 * Key difference from active RAG:
 * - Active RAG: Search on every message → Variable latency, cache misses
 * - Passive RAG: Pre-load by stage → Consistent context, faster response
 * 
 * @module _shared/passive-rag-prefetch
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { compressRAGContext } from './context-compressor.ts';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface PassiveRAGConfig {
  categories: string[];
  maxChunksPerCategory: number;
  compressionEnabled: boolean;
  maxTotalChars: number;
  prioritizeExemplars: boolean;
}

export interface RAGChunk {
  id: string;
  content: string;
  fileName: string;
  category: string;
  subcategory: string | null;
  similarity?: number;
  learningType?: 'success' | 'failure' | 'neutral';
  isExemplar?: boolean;
  qualityScore?: number;
}

export interface PassiveRAGResult {
  content: string;
  chunksUsed: number;
  categories: string[];
  charCount: number;
  wasCached: boolean;
  executionTimeMs: number;
}

export interface FunnelStageMapping {
  stage: string;
  categories: string[];
  priority: number;
  description: string;
}

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

// Mapping of funnel stages to relevant RAG categories
// Higher priority categories are included first when space is limited
const FUNNEL_STAGE_MAPPING: Record<string, FunnelStageMapping> = {
  'triagem': {
    stage: 'triagem',
    categories: ['faq_geral', 'processo', 'empresa'],
    priority: 1,
    description: 'Initial triage - general FAQ and company info',
  },
  'qualificacao': {
    stage: 'qualificacao',
    categories: ['energia_solar', 'faq_geral', 'requisitos'],
    priority: 2,
    description: 'Qualification - energy explanation and requirements',
  },
  'coleta_dados': {
    stage: 'coleta_dados',
    categories: ['processo', 'financeiro', 'requisitos'],
    priority: 3,
    description: 'Data collection - process and financial details',
  },
  'proposta_inicial': {
    stage: 'proposta_inicial',
    categories: ['financeiro', 'objecoes', 'valores'],
    priority: 4,
    description: 'Initial proposal - financial and objection handling',
  },
  'docs_plataforma': {
    stage: 'docs_plataforma',
    categories: ['documentos', 'processo', 'seguranca'],
    priority: 5,
    description: 'Document collection - document requirements',
  },
  'solicitar_contrato': {
    stage: 'solicitar_contrato',
    categories: ['contrato', 'objecoes', 'financeiro'],
    priority: 6,
    description: 'Contract solicitation - contract and objection handling',
  },
  'assinatura': {
    stage: 'assinatura',
    categories: ['contrato', 'processo', 'objecoes'],
    priority: 7,
    description: 'Signing - contract details and final objections',
  },
  'default': {
    stage: 'default',
    categories: ['faq_geral', 'processo'],
    priority: 0,
    description: 'Default fallback categories',
  },
};

// Cache for prefetched RAG content (per stage)
const prefetchCache = new Map<string, { 
  content: string; 
  chunks: RAGChunk[];
  timestamp: number;
  stage: string;
}>();

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes (longer than active RAG)

// ═══════════════════════════════════════════════════════════════
// MAIN FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Pre-fetch RAG context for a given funnel stage
 * Returns compressed, stage-relevant content for prompt injection
 */
export async function prefetchPassiveRAG(
  supabase: SupabaseClient,
  agentId: string,
  funnelStage: string,
  config: Partial<PassiveRAGConfig> = {}
): Promise<PassiveRAGResult> {
  const startTime = Date.now();
  
  const cfg: PassiveRAGConfig = {
    categories: config.categories || [],
    maxChunksPerCategory: config.maxChunksPerCategory ?? 3,
    compressionEnabled: config.compressionEnabled ?? true,
    maxTotalChars: config.maxTotalChars ?? 1500,
    prioritizeExemplars: config.prioritizeExemplars ?? true,
  };
  
  // Get relevant categories for this stage
  const stageMapping = FUNNEL_STAGE_MAPPING[funnelStage] || FUNNEL_STAGE_MAPPING['default'];
  const categories = cfg.categories.length > 0 ? cfg.categories : stageMapping.categories;
  
  // Check cache
  const cacheKey = `${agentId}:${funnelStage}`;
  const cached = prefetchCache.get(cacheKey);
  
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
    console.log(`[PassiveRAG] Using cached content for ${funnelStage} (${cached.chunks.length} chunks)`);
    return {
      content: cached.content,
      chunksUsed: cached.chunks.length,
      categories,
      charCount: cached.content.length,
      wasCached: true,
      executionTimeMs: Date.now() - startTime,
    };
  }
  
  try {
    // Fetch chunks for each category
    const allChunks: RAGChunk[] = [];
    
    for (const category of categories) {
      const chunks = await fetchCategoryChunks(
        supabase,
        agentId,
        category,
        cfg.maxChunksPerCategory,
        cfg.prioritizeExemplars
      );
      allChunks.push(...chunks);
    }
    
    if (allChunks.length === 0) {
      console.log(`[PassiveRAG] No chunks found for stage ${funnelStage}`);
      return {
        content: '',
        chunksUsed: 0,
        categories,
        charCount: 0,
        wasCached: false,
        executionTimeMs: Date.now() - startTime,
      };
    }
    
    // Sort by quality/exemplar status
    const sortedChunks = sortChunksByQuality(allChunks);
    
    // Build and compress content
    let content = buildRAGContentBlock(sortedChunks, funnelStage);
    
    if (cfg.compressionEnabled && content.length > cfg.maxTotalChars) {
      content = compressRAGContext(content, cfg.maxTotalChars);
    }
    
    // Update cache
    prefetchCache.set(cacheKey, {
      content,
      chunks: sortedChunks,
      timestamp: Date.now(),
      stage: funnelStage,
    });
    
    const executionTimeMs = Date.now() - startTime;
    console.log(`[PassiveRAG] Prefetched ${sortedChunks.length} chunks for ${funnelStage} in ${executionTimeMs}ms`);
    
    return {
      content,
      chunksUsed: sortedChunks.length,
      categories,
      charCount: content.length,
      wasCached: false,
      executionTimeMs,
    };
    
  } catch (error) {
    console.error('[PassiveRAG] Error prefetching:', error);
    return {
      content: '',
      chunksUsed: 0,
      categories,
      charCount: 0,
      wasCached: false,
      executionTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * Fetch chunks for a specific category
 */
async function fetchCategoryChunks(
  supabase: SupabaseClient,
  agentId: string,
  category: string,
  limit: number,
  prioritizeExemplars: boolean
): Promise<RAGChunk[]> {
  try {
    // Build query
    let query = supabase
      .from('rag_chunks')
      .select(`
        id,
        content,
        learning_type,
        is_exemplar,
        chunk_index,
        rag_documents!inner (
          file_name,
          category,
          subcategory,
          is_active,
          processing_status,
          metadata
        )
      `)
      .eq('rag_documents.category', category)
      .eq('rag_documents.is_active', true)
      .eq('rag_documents.processing_status', 'completed');
    
    // Prioritize exemplars if enabled
    if (prioritizeExemplars) {
      query = query.order('is_exemplar', { ascending: false });
    }
    
    query = query.limit(limit);
    
    const { data, error } = await query;
    
    if (error) {
      console.error(`[PassiveRAG] Error fetching category ${category}:`, error);
      return [];
    }
    
    return (data || []).map((row: any) => ({
      id: row.id,
      content: row.content,
      fileName: row.rag_documents?.file_name || '',
      category: row.rag_documents?.category || category,
      subcategory: row.rag_documents?.subcategory,
      learningType: row.learning_type,
      isExemplar: row.is_exemplar,
      qualityScore: row.rag_documents?.metadata?.analysis?.quality_score || 50,
    }));
    
  } catch (error) {
    console.error(`[PassiveRAG] Exception fetching category ${category}:`, error);
    return [];
  }
}

/**
 * Sort chunks by quality (exemplars first, then by quality score)
 */
function sortChunksByQuality(chunks: RAGChunk[]): RAGChunk[] {
  return [...chunks].sort((a, b) => {
    // Exemplars first
    if (a.isExemplar && !b.isExemplar) return -1;
    if (!a.isExemplar && b.isExemplar) return 1;
    
    // Then by quality score
    const scoreA = a.qualityScore || 50;
    const scoreB = b.qualityScore || 50;
    return scoreB - scoreA;
  });
}

/**
 * Build the RAG content block for prompt injection
 */
function buildRAGContentBlock(chunks: RAGChunk[], funnelStage: string): string {
  if (chunks.length === 0) return '';
  
  const lines: string[] = [];
  lines.push('');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push(`📚 CONHECIMENTO PRÉ-CARREGADO (Estágio: ${funnelStage})`);
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('');
  
  // Group by category
  const byCategory = new Map<string, RAGChunk[]>();
  for (const chunk of chunks) {
    const existing = byCategory.get(chunk.category) || [];
    existing.push(chunk);
    byCategory.set(chunk.category, existing);
  }
  
  for (const [category, categoryChunks] of byCategory.entries()) {
    lines.push(`### ${formatCategoryName(category)}`);
    lines.push('');
    
    for (const chunk of categoryChunks) {
      const exemplarTag = chunk.isExemplar ? ' ⭐' : '';
      lines.push(`**[${chunk.fileName}${exemplarTag}]**`);
      lines.push(chunk.content.trim());
      lines.push('');
    }
  }
  
  lines.push('---');
  lines.push('⚠️ Use este conhecimento para responder. Não invente informações.');
  lines.push('');
  
  return lines.join('\n');
}

/**
 * Format category name for display
 */
function formatCategoryName(category: string): string {
  const mapping: Record<string, string> = {
    'faq_geral': '❓ FAQ Geral',
    'processo': '📋 Processo',
    'empresa': '🏢 Sobre a Empresa',
    'energia_solar': '☀️ Energia Solar',
    'requisitos': '✅ Requisitos',
    'financeiro': '💰 Financeiro',
    'objecoes': '🤝 Objeções',
    'valores': '💵 Valores',
    'documentos': '📄 Documentos',
    'seguranca': '🔐 Segurança',
    'contrato': '📝 Contrato',
  };
  
  return mapping[category] || `📌 ${category.charAt(0).toUpperCase() + category.slice(1)}`;
}

// ═══════════════════════════════════════════════════════════════
// CACHE MANAGEMENT
// ═══════════════════════════════════════════════════════════════

/**
 * Clear prefetch cache
 */
export function clearPassiveRAGCache(agentId?: string, stage?: string): void {
  if (agentId && stage) {
    prefetchCache.delete(`${agentId}:${stage}`);
  } else if (agentId) {
    for (const key of prefetchCache.keys()) {
      if (key.startsWith(`${agentId}:`)) {
        prefetchCache.delete(key);
      }
    }
  } else {
    prefetchCache.clear();
  }
  console.log('[PassiveRAG] Cache cleared');
}

/**
 * Get cache status for debugging
 */
export function getPassiveRAGCacheStatus(): {
  entries: number;
  stages: string[];
  oldestEntry: number | null;
} {
  const stages: string[] = [];
  let oldestTimestamp: number | null = null;
  
  for (const [key, value] of prefetchCache.entries()) {
    stages.push(value.stage);
    if (!oldestTimestamp || value.timestamp < oldestTimestamp) {
      oldestTimestamp = value.timestamp;
    }
  }
  
  return {
    entries: prefetchCache.size,
    stages: [...new Set(stages)],
    oldestEntry: oldestTimestamp ? Date.now() - oldestTimestamp : null,
  };
}

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Get categories for a funnel stage
 */
export function getCategoriesForStage(funnelStage: string): string[] {
  const mapping = FUNNEL_STAGE_MAPPING[funnelStage] || FUNNEL_STAGE_MAPPING['default'];
  return mapping.categories;
}

/**
 * Get all available stage mappings
 */
export function getAllStageMappings(): FunnelStageMapping[] {
  return Object.values(FUNNEL_STAGE_MAPPING);
}

/**
 * Warm up cache for common stages
 * Call this on webhook initialization
 */
export async function warmUpPassiveRAGCache(
  supabase: SupabaseClient,
  agentId: string,
  stages: string[] = ['triagem', 'qualificacao', 'coleta_dados']
): Promise<void> {
  console.log(`[PassiveRAG] Warming up cache for stages: ${stages.join(', ')}`);
  
  await Promise.all(
    stages.map(stage => 
      prefetchPassiveRAG(supabase, agentId, stage).catch(err => {
        console.warn(`[PassiveRAG] Failed to warm up ${stage}:`, err);
      })
    )
  );
  
  console.log('[PassiveRAG] Cache warm-up complete');
}
