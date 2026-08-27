import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getCorsHeaders,
  handleCorsPrelight,
} from '../_shared/security-helpers.ts';
import { validateRAGSearch, parseAndValidate } from '../_shared/zod-schemas.ts';

/**
 * rag-search: Busca semântica no RAG com permissões por agente
 * 
 * Recebe uma query, gera embedding, e busca chunks relevantes
 * respeitando as permissões do agente.
 * 
 * SECURITY: Uses strict CORS + Zod validation
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const OPENAI_API_KEY = (Deno.env.get('COESASOLAR_OPENROUTER_API_KEY'))!

interface SearchResult {
  id: string;
  content: string;
  file_name: string;
  category: string;
  subcategory?: string;
  source_path?: string;
  similarity: number;
  learning_type?: 'success' | 'failure' | 'neutral';
  is_exemplar?: boolean;
  exemplar_reason?: string;
  metadata?: Record<string, unknown>;
  chunk_type?: string;
  document_category?: string;
  document_name?: string;
}

// Funnel stage → chunk_type mapping for v2 filtered search
const FUNNEL_CHUNK_TYPE_MAP: Record<string, string[]> = {
  triagem: ['faq', 'objecao'],
  qualificacao: ['faq', 'plano', 'objecao'],
  coleta_dados: ['faq', 'plano', 'objecao'],
  proposta: ['plano', 'regulamentacao', 'objecao'],
  proposta_inicial: ['plano', 'regulamentacao', 'objecao'],
  proposta_definitiva: ['plano', 'regulamentacao', 'objecao'],
  fechamento: ['plano', 'regulamentacao', 'operacional'],
  assinatura: ['plano', 'regulamentacao', 'operacional'],
  pos_venda: ['operacional', 'faq'],
  docs_plataforma: ['operacional', 'faq'],
};

function getConfidenceLabel(similarity: number): string {
  return similarity > 0.7 ? 'ALTA' : 'MÉDIA';
}

// In-memory cache for current request batch (short-lived)
const embeddingCache = new Map<string, { embedding: number[]; timestamp: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Full result cache for repeated queries (5 min TTL)
const resultCache = new Map<string, { results: SearchResult[]; context: string; timestamp: number }>();
const RESULT_CACHE_TTL_MS = 5 * 60 * 1000;

function getCacheKey(query: string, agentId: string): string {
  return `${agentId}:${query.toLowerCase().trim().substring(0, 100)}`;
}

function getQueryHash(query: string): string {
  const normalized = query.toLowerCase().trim();
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `qh_${Math.abs(hash).toString(36)}_${normalized.substring(0, 30).replace(/\s+/g, '_')}`;
}

function getCachedEmbedding(query: string): number[] | null {
  const cached = embeddingCache.get(query);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.embedding;
  }
  embeddingCache.delete(query);
  return null;
}

function setCachedEmbedding(query: string, embedding: number[]): void {
  if (embeddingCache.size > 200) {
    const now = Date.now();
    for (const [key, value] of embeddingCache.entries()) {
      if (now - value.timestamp > CACHE_TTL_MS) {
        embeddingCache.delete(key);
      }
    }
  }
  embeddingCache.set(query, { embedding, timestamp: Date.now() });
}

function getCachedResults(cacheKey: string): { results: SearchResult[]; context: string } | null {
  const cached = resultCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < RESULT_CACHE_TTL_MS) {
    return { results: cached.results, context: cached.context };
  }
  resultCache.delete(cacheKey);
  return null;
}

function setCachedResults(cacheKey: string, results: SearchResult[], context: string): void {
  if (resultCache.size > 100) {
    const now = Date.now();
    for (const [key, value] of resultCache.entries()) {
      if (now - value.timestamp > RESULT_CACHE_TTL_MS) {
        resultCache.delete(key);
      }
    }
  }
  resultCache.set(cacheKey, { results, context, timestamp: Date.now() });
}

// deno-lint-ignore no-explicit-any
async function getOrCreateEmbedding(
  supabase: any,
  text: string
): Promise<number[]> {
  const normalizedQuery = text.toLowerCase().trim();
  const queryHash = getQueryHash(normalizedQuery);
  
  // 1. Check in-memory cache first (fastest)
  const memCached = getCachedEmbedding(normalizedQuery);
  if (memCached) {
    console.log('[rag-search] 🚀 Memory cache hit for embedding');
    return memCached;
  }
  
  // 2. Check persistent DB cache (survives restarts)
  try {
    const { data: dbCached, error: cacheError } = await supabase
      .from('rag_embedding_cache')
      .select('embedding')
      .eq('query_hash', queryHash)
      .single();
    
    if (dbCached && !cacheError) {
      console.log('[rag-search] 💾 DB cache hit for embedding');
      const embedding = typeof dbCached.embedding === 'string' 
        ? JSON.parse(dbCached.embedding) 
        : dbCached.embedding;
      
      setCachedEmbedding(normalizedQuery, embedding);
      
      supabase.from('rag_embedding_cache')
        .update({ last_used_at: new Date().toISOString(), use_count: 1 })
        .eq('query_hash', queryHash)
        .then(() => {});
      
      return embedding;
    }
  } catch (err) {
    console.warn('[rag-search] DB cache lookup failed:', err);
  }

  // 3. Generate new embedding from OpenAI
  console.log('[rag-search] 🔄 Generating new embedding via OpenAI');
  
  const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'openai/text-embedding-3-small',
      input: text,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[rag-search] Embedding API error:', response.status, errorText);
    throw new Error(`Embedding API error: ${response.status}`);
  }

  const data = await response.json();
  const embedding = data.data?.[0]?.embedding;
  
  if (!embedding || !Array.isArray(embedding)) {
    throw new Error('Invalid embedding response');
  }

  // 4. Cache in-memory
  setCachedEmbedding(normalizedQuery, embedding);
  
  // 5. Cache in DB asynchronously
  supabase.from('rag_embedding_cache')
    .upsert({
      query_hash: queryHash,
      query_text: normalizedQuery.substring(0, 500),
      embedding: `[${embedding.join(',')}]`,
      last_used_at: new Date().toISOString(),
      use_count: 1,
    }, { onConflict: 'query_hash' })
    .then(({ error }: { error: unknown }) => {
      if (error) console.warn('[rag-search] Failed to cache embedding:', error);
      else console.log('[rag-search] ✅ Cached embedding to DB');
    });
  
  return embedding;
}

// deno-lint-ignore no-explicit-any
async function logSearch(
  supabase: any,
  agentId: string,
  query: string,
  _embedding: number[],
  results: SearchResult[],
  executionTimeMs: number
): Promise<void> {
  try {
    const topSimilarity = results.length > 0 ? results[0].similarity : null;
    const avgSimilarity = results.length > 0 
      ? results.reduce((sum, r) => sum + r.similarity, 0) / results.length 
      : null;

    await supabase.from('rag_search_logs').insert({
      agent_id: agentId,
      query_text: query,
      results_count: results.length,
      top_similarity: topSimilarity,
      avg_similarity: avgSimilarity,
      execution_time_ms: executionTimeMs,
    });
  } catch (error) {
    console.error('[rag-search] Failed to log search:', error);
  }
}

serve(async (req) => {
  // CORS: This is an internal API - use strict CORS
  if (req.method === 'OPTIONS') {
    return handleCorsPrelight(req, { mode: 'strict' });
  }

  const corsHeaders = getCorsHeaders(req, { mode: 'strict' });
  const startTime = Date.now();

  try {
    // Validate and parse request body
    const parseResult = await parseAndValidate(req, validateRAGSearch);
    
    if (!parseResult.success) {
      console.warn('[rag-search] Validation failed:', parseResult.error);
      return new Response(
        JSON.stringify({ success: false, error: parseResult.error, results: [], context: '' }),
        { status: parseResult.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = parseResult.data;
    const { 
      query, 
      agentId, 
      topK = 5, 
      minScore = 0.45,
      categories,
    } = body;
    
    // Extract funnel_stage from body (not in zod schema yet, so read raw)
    const funnelStage = (body as Record<string, unknown>).funnel_stage as string | undefined;

    // Additional validation for required agentId
    if (!agentId) {
      return new Response(
        JSON.stringify({ success: false, error: 'agentId is required', results: [], context: '' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[rag-search] Agent: ${agentId}, Query: "${query.substring(0, 100)}...", funnelStage: ${funnelStage || 'none'}`);

    // Check result cache first (include funnelStage in cache key)
    const cacheKey = getCacheKey(`${query}:${funnelStage || ''}`, agentId);
    const cachedResult = getCachedResults(cacheKey);
    
    if (cachedResult) {
      const executionTimeMs = Date.now() - startTime;
      console.log(`[rag-search] 🚀 CACHE HIT! Returning cached results in ${executionTimeMs}ms`);
      
      return new Response(
        JSON.stringify({
          success: true,
          results: cachedResult.results,
          context: cachedResult.context,
          meta: {
            query_length: query.length,
            results_count: cachedResult.results.length,
            execution_time_ms: executionTimeMs,
            agent_id: agentId,
            cached: true,
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Generate embedding
    const queryEmbedding = await getOrCreateEmbedding(supabase, query);
    
    // Determine chunk_types filter based on funnel stage
    const filterChunkTypes = funnelStage ? (FUNNEL_CHUNK_TYPE_MAP[funnelStage] || null) : null;
    
    // Use match_rag_chunks_v2 with funnel-aware filtering
    const { data: rawResults, error: searchError } = await supabase.rpc('match_rag_chunks_v2', {
      query_embedding: `[${queryEmbedding.join(',')}]`,
      match_threshold: minScore,
      match_count: topK,
      filter_chunk_types: filterChunkTypes,
      filter_funnel_stage: funnelStage || null,
    });
    
    if (!searchError) {
      console.log(`[rag-search] ✅ Using match_rag_chunks_v2 with chunk_types: ${filterChunkTypes?.join(',') || 'all'}`);
    }

    if (searchError) {
      console.error('[rag-search] Search error:', searchError);
      throw new Error(`Search failed: ${searchError.message}`);
    }

    // Format results from v2
    const results: SearchResult[] = (rawResults || []).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      content: r.content as string,
      file_name: (r.document_name || r.file_name) as string,
      category: (r.document_category || r.category) as string,
      similarity: r.similarity as number,
      chunk_type: r.chunk_type as string | undefined,
      metadata: r.metadata as Record<string, unknown> | undefined,
      document_category: r.document_category as string | undefined,
      document_name: r.document_name as string | undefined,
    }));

    const executionTimeMs = Date.now() - startTime;
    console.log(`[rag-search] Found ${results.length} results in ${executionTimeMs}ms`);

    // Log asynchronously
    logSearch(supabase, agentId, query, queryEmbedding, results, executionTimeMs);

    // Format context
    let contextText = '';
    if (results.length > 0) {
      // v2 format: confidence labels based on similarity
      contextText = results.map((r) => {
        const confidence = getConfidenceLabel(r.similarity);
        const topic = (r.metadata as Record<string, unknown>)?.topic as string || r.chunk_type || r.category;
        return `[Confiança: ${confidence} | Tópico: ${topic}]\n${r.content}`;
      }).join('\n\n---\n\n');
    }

    // Cache results
    setCachedResults(cacheKey, results, contextText);

    return new Response(
      JSON.stringify({
        success: true,
        results,
        context: contextText,
        meta: {
          query_length: query.length,
          results_count: results.length,
          execution_time_ms: executionTimeMs,
          agent_id: agentId,
          cached: false,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[rag-search] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        results: [],
        context: '',
      }),
      { status: 500, headers: { ...getCorsHeaders(req, { mode: 'strict' }), 'Content-Type': 'application/json' } }
    );
  }
});
