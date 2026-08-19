/**
 * RAG Search Client Module
 * Handles semantic search integration with RAG system
 * Extracted from sofia-webhook for modularity (Phase 24)
 * Phase 4: Added passive mode for AGENTS.md-style context injection
 */

import { 
  matchesPatternCategory,
  getPatternCache,
  type PatternEntry 
} from './detection-patterns.ts';
import { getSystemConstant } from './message-templates.ts';
import { 
  prefetchPassiveRAG, 
  type PassiveRAGConfig, 
  type PassiveRAGResult 
} from './passive-rag-prefetch.ts';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface RAGSearchResult {
  id: string;
  content: string;
  file_name: string;
  category: string;
  subcategory?: string;
  similarity: number;
  chunk_index?: number;
  learning_type?: 'success' | 'failure' | 'neutral';
  is_exemplar?: boolean;
}

export interface RAGSearchResponse {
  success: boolean;
  results: RAGSearchResult[];
  context: string;
  meta?: {
    results_count: number;
    execution_time_ms: number;
  };
}

export interface RAGTriggerResult {
  shouldTrigger: boolean;
  reason: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface RAGContextResult {
  context: string;
  resultsCount: number;
  executionTimeMs: number;
  chunksUsed: RAGChunkUsed[];
  topSimilarity: number | null;
  avgSimilarity: number | null;
  categories: string[];
}

export interface RAGChunkUsed {
  id: string;
  file_name: string;
  category: string;
  similarity: number;
  chunk_index?: number;
  learning_type?: string;
  content_preview: string;
}

// ═══════════════════════════════════════════════════════════════
// PASSIVE RAG MODE (Phase 4 - AGENTS.md Style)
// Pre-fetches context by funnel stage instead of on-demand search
// ═══════════════════════════════════════════════════════════════

export interface PassiveModeConfig {
  enabled: boolean;
  funnelStage: string | null;
  supabase: any;
  agentId: string;
  compressionEnabled?: boolean;
}

/**
 * Feature flag for passive RAG mode
 */
const ENABLE_PASSIVE_RAG_MODE = true;

/**
 * Orchestrate RAG with passive mode support
 * If passive mode is enabled AND we have a funnel stage, use pre-fetched context
 * Otherwise, fall back to active (on-demand) search
 */
export async function orchestrateRAGWithPassiveMode(
  ctx: RAGOrchestrationContext & { 
    clientPhone?: string;
    passiveConfig?: PassiveModeConfig;
  }
): Promise<RAGOrchestrationResult> {
  const { passiveConfig } = ctx;
  
  // Check if passive mode should be used
  if (ENABLE_PASSIVE_RAG_MODE && passiveConfig?.enabled && passiveConfig.funnelStage) {
    console.log(`[RAG] 🔄 Using PASSIVE mode for stage: ${passiveConfig.funnelStage}`);
    
    try {
      const passiveResult = await prefetchPassiveRAG(
        passiveConfig.supabase,
        passiveConfig.agentId,
        passiveConfig.funnelStage,
        {
          categories: [], // Will use stage mapping
          maxChunksPerCategory: 3,
          compressionEnabled: passiveConfig.compressionEnabled ?? true,
          maxTotalChars: 2000,
          prioritizeExemplars: true,
        }
      );
      
      if (passiveResult.content && passiveResult.chunksUsed > 0) {
        console.log(`[RAG] ✅ Passive prefetch: ${passiveResult.chunksUsed} chunks, ${passiveResult.charCount} chars (${passiveResult.executionTimeMs}ms)`);
        
        return {
          ragContextForPrompt: {
            content: passiveResult.content,
            resultsCount: passiveResult.chunksUsed,
            categories: passiveResult.categories,
          },
          skipped: false,
          skipReason: '',
          coveredSections: passiveResult.categories,
        };
      }
      
      console.log(`[RAG] ⚠️ Passive prefetch returned empty, falling back to active mode`);
    } catch (passiveError) {
      console.warn('[RAG] Passive prefetch failed, falling back to active mode:', passiveError);
    }
  }
  
  // Fall back to active (on-demand) mode
  return orchestrateRAGSearch(ctx);
}

// ═══════════════════════════════════════════════════════════════
// CACHE
// ═══════════════════════════════════════════════════════════════

// Cache to avoid repeated RAG searches in the same conversation
const ragContextCache = new Map<string, { context: string; timestamp: number; query: string }>();

// RAG constants - fallbacks (actual values loaded from configuracoes_sistema)
const DEFAULT_RAG_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes
const DEFAULT_RAG_MIN_MESSAGE_LENGTH = 8;

/**
 * Get RAG cache TTL from config or use default
 */
export function getRAGCacheTTLMs(): number {
  return getSystemConstant('rag_cache_ttl_ms', DEFAULT_RAG_CACHE_TTL_MS);
}

/**
 * Get RAG minimum message length from config or use default
 */
export function getRAGMinMessageLength(): number {
  return getSystemConstant('rag_min_message_length', DEFAULT_RAG_MIN_MESSAGE_LENGTH);
}

/**
 * Clear cache for a specific conversation
 */
export function clearRAGCache(conversaId: string): void {
  ragContextCache.delete(conversaId);
}

/**
 * Clear entire RAG cache
 */
export function clearAllRAGCache(): void {
  ragContextCache.clear();
}

// ═══════════════════════════════════════════════════════════════
// RAG SMART FILTER - Database-driven (Phase 46 Enhanced)
// Patterns loaded from sofia_detection_patterns table
// Categories: rag_trigger_*, rag_skip_*
// Critical categories always trigger RAG with high confidence
// ═══════════════════════════════════════════════════════════════

/**
 * Critical RAG trigger categories - ALWAYS trigger RAG with high confidence
 * These represent high-value intents in the sales funnel
 */
export const RAG_CRITICAL_CATEGORIES = [
  'rag_trigger_documents',   // Documents collection stage
  'rag_trigger_proposal',    // Proposal/pricing stage
  'rag_trigger_pricing',     // Price questions
  'rag_trigger_objections',  // Sales objections
  'rag_trigger_critical',    // Critical questions (como funciona, etc)
];

/**
 * Standard RAG trigger categories from database
 */
export const RAG_TRIGGER_CATEGORIES = [
  ...RAG_CRITICAL_CATEGORIES,
  'rag_trigger_questions', 
  'rag_trigger_product',
  'rag_trigger_company',
  'rag_trigger_process',
  'rag_trigger_timing',
];

/**
 * RAG skip categories from database (lower priority than triggers)
 */
export const RAG_SKIP_CATEGORIES = [
  'rag_skip_trivial',
  'rag_skip_greetings',
  'rag_skip_confirmations',
  'rag_skip_audio',
  'rag_skip_short',
];

/**
 * Get patterns from cache (internal helper)
 */
function getDetectionPatternsFromCache(): Map<string, PatternEntry> {
  const cache = getPatternCache();
  return cache?.patterns || new Map();
}

/**
 * Determines if a message should trigger RAG search
 * Uses database patterns via matchesPatternCategory
 * Phase 46: Critical intents ALWAYS trigger RAG with high confidence
 * Phase 47: LEGAL_POLICY_REGEX check moved to TOP PRIORITY
 * Phase 48: Added funnelStage context + expanded legal keywords
 */
export function shouldTriggerRAG(
  message: string,
  patterns?: Map<string, PatternEntry>,
  ctx?: { funnelStage?: string }
): RAGTriggerResult {
  const cleanMessage = message.trim().toLowerCase();
  const patternsToUse = patterns || getDetectionPatternsFromCache();
  
  // ═══════════════════════════════════════════════════════════════
  // 1. LEGAL / CONTRACTUAL TOPICS (HIGHEST PRIORITY - BEFORE ANYTHING)
  // This MUST run first to prevent hallucinations on policies like "multa rescisória".
  // Pattern matches: multa, rescisão, fidelidade, contrato, adesão, termos, cláusula, serasa, spc, restrição, etc.
  // ═══════════════════════════════════════════════════════════════
  const legalPolicyRegex = /(multa|rescis\w*|cancel\w*|fidelid\w*|contrat\w*|ades[aã]o|termos\s*(de\s*)?(ades[aã]o)?|cl[aá]usul\w*|car[eê]ncia|penalidad\w*|quebra\s*de\s*contrato|desfideliza\w*|sair\s*do\s*contrato|desist\w*|trocar\s*de\s*(empresa|fornecedor)|restri[çc][aã]o|nome\s*sujo|serasa|spc)/i;
  if (legalPolicyRegex.test(cleanMessage)) {
    console.log(`[RAG-TRIGGER] 🚨 LEGAL_POLICY keyword detected in: "${cleanMessage.substring(0, 60)}..."`);
    return {
      shouldTrigger: true,
      reason: 'legal_policy_keyword_FORCED',
      confidence: 'high',
    };
  }
  
  // ═══════════════════════════════════════════════════════════════
  // 1.5. CRITICAL FUNNEL STAGES: Always trigger RAG
  // When in proposal/contract stages, RAG must be consulted
  // ═══════════════════════════════════════════════════════════════
  const CRITICAL_STAGES = ['proposta_inicial', 'solicitar_contrato', 'assinatura', 'docs_plataforma'];
  if (ctx?.funnelStage && CRITICAL_STAGES.includes(ctx.funnelStage)) {
    console.log(`[RAG-TRIGGER] 🚨 CRITICAL_FUNNEL_STAGE: ${ctx.funnelStage} - forcing RAG`);
    return {
      shouldTrigger: true,
      reason: 'critical_funnel_stage',
      confidence: 'high',
    };
  }
  
  // 2. Skip very short messages (but still check critical categories first)
  const isVeryShort = cleanMessage.length < getRAGMinMessageLength();
  
  // 3. CRITICAL CHECK - These always trigger RAG regardless of skip patterns
  // This ensures high-value intents (docs, proposal, pricing, objections) always get RAG context
  const criticalMatches: string[] = [];
  for (const criticalCategory of RAG_CRITICAL_CATEGORIES) {
    if (matchesPatternCategory(cleanMessage, criticalCategory, patternsToUse)) {
      criticalMatches.push(criticalCategory);
    }
  }
  
  // If ANY critical category matches, trigger RAG immediately with high confidence
  if (criticalMatches.length > 0) {
    console.log(`[RAG-TRIGGER] 🚨 Critical intent detected: ${criticalMatches.join(', ')}`);
    return { 
      shouldTrigger: true, 
      reason: `critical_intent: ${criticalMatches.slice(0, 3).join(', ')}`,
      confidence: 'high'
    };
  }
  
  // 4. Now check skip patterns (only if no critical match)
  if (isVeryShort) {
    return { shouldTrigger: false, reason: 'message_too_short', confidence: 'high' };
  }
  
  for (const skipCategory of RAG_SKIP_CATEGORIES) {
    if (matchesPatternCategory(cleanMessage, skipCategory, patternsToUse)) {
      return { shouldTrigger: false, reason: `trivial_message:${skipCategory}`, confidence: 'medium' };
    }
  }
  
  // 4. Check for question marks (strong indicator)
  if (cleanMessage.includes('?')) {
    return { shouldTrigger: true, reason: 'contains_question', confidence: 'high' };
  }
  
  // 5. Check standard trigger keywords by category (from database)
  const matchedCategories: string[] = [];
  
  for (const triggerCategory of RAG_TRIGGER_CATEGORIES) {
    if (!RAG_CRITICAL_CATEGORIES.includes(triggerCategory)) { // Skip already-checked critical ones
      if (matchesPatternCategory(cleanMessage, triggerCategory, patternsToUse)) {
        matchedCategories.push(triggerCategory);
      }
    }
  }
  
  // High confidence: Multiple category matches
  if (matchedCategories.length >= 2) {
    return { 
      shouldTrigger: true, 
      reason: `categories_matched: ${matchedCategories.slice(0, 3).join(', ')}`,
      confidence: 'high'
    };
  }
  
  // Medium confidence: Single category match
  if (matchedCategories.length === 1) {
    return {
      shouldTrigger: true,
      reason: `category_matched: ${matchedCategories[0]}`,
      confidence: 'medium'
    };
  }
  
  // 6. Check for longer messages that might contain complex queries
  if (cleanMessage.length > 40 && cleanMessage.split(' ').length > 6) {
    return { 
      shouldTrigger: true, 
      reason: 'long_complex_message',
      confidence: 'low'
    };
  }
  
  // Default: Skip RAG for messages without clear indicators
  return { shouldTrigger: false, reason: 'no_rag_indicators', confidence: 'medium' };
}

// ═══════════════════════════════════════════════════════════════
// RAG FETCH FUNCTION
// ═══════════════════════════════════════════════════════════════

/**
 * Fetches semantic context from RAG based on user message
 * Respects agent permissions configured in rag_permissions table
 * Now includes detailed chunk tracking for analytics
 */
export async function fetchRAGContext(
  supabaseClient: any,
  agentId: string,
  userMessage: string,
  conversaId?: string,
  options?: {
    supabaseUrl: string;
    supabaseServiceKey: string;
    topK?: number;
    minSimilarity?: number;
    clientPhone?: string;
    funnelStage?: string;
  }
): Promise<RAGContextResult> {
  const supabaseUrl = options?.supabaseUrl || Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = options?.supabaseServiceKey || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  
  const emptyResult: RAGContextResult = {
    context: '',
    resultsCount: 0,
    executionTimeMs: 0,
    chunksUsed: [],
    topSimilarity: null,
    avgSimilarity: null,
    categories: [],
  };
  
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('[RAG] Missing Supabase credentials');
    return emptyResult;
  }
  
  try {
    // Check cache first (same conversation, similar query)
    if (conversaId) {
      const cached = ragContextCache.get(conversaId);
      if (cached && Date.now() - cached.timestamp < getRAGCacheTTLMs()) {
        // If query is similar (first 50 chars match), reuse cache
        if (cached.query.substring(0, 50) === userMessage.substring(0, 50)) {
          console.log(`[RAG] Using cached context for conversation ${conversaId}`);
          return { ...emptyResult, context: cached.context };
        }
      }
    }

    console.log(`[RAG] Fetching semantic context for agent: ${agentId}, query: "${userMessage.substring(0, 80)}..."`);
    
    const startTime = Date.now();
    
    const response = await fetch(`${supabaseUrl}/functions/v1/rag-search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        query: userMessage,
        agent_id: agentId,
        top_k: options?.topK || 5,
        min_similarity: options?.minSimilarity || 0.40,
        include_metadata: true,
        funnel_stage: options?.funnelStage || null,
      }),
    });

    const executionTimeMs = Date.now() - startTime;

    if (!response.ok) {
      console.warn(`[RAG] Search failed with status ${response.status}`);
      return { ...emptyResult, executionTimeMs };
    }

    const data: RAGSearchResponse = await response.json();
    
    if (!data.success || !data.results || data.results.length === 0) {
      console.log(`[RAG] No relevant documents found for query`);
      
      // Log even empty searches for analytics
      await logRAGUsage(supabaseClient, {
        agentId,
        queryText: userMessage,
        results: [],
        executionTimeMs,
        conversaId,
        clientPhone: options?.clientPhone,
        funnelStage: options?.funnelStage,
      });
      
      return { ...emptyResult, executionTimeMs };
    }

    console.log(`[RAG] Found ${data.results.length} relevant documents in ${executionTimeMs}ms`);
    
    // Build detailed chunk info for logging
    const chunksUsed: RAGChunkUsed[] = data.results.map((r: RAGSearchResult) => ({
      id: r.id,
      file_name: r.file_name,
      category: r.category,
      similarity: r.similarity,
      chunk_index: r.chunk_index,
      learning_type: r.learning_type,
      content_preview: r.content?.substring(0, 150) || '',
    }));
    
    const documentsAccessed = data.results.map((r: RAGSearchResult) => r.file_name).filter(Boolean);
    const categoriesAccessed = [...new Set(data.results.map((r: RAGSearchResult) => r.category).filter(Boolean))];
    const topSimilarity = data.results.length > 0 ? Math.max(...data.results.map(r => r.similarity)) : null;
    const avgSimilarity = data.results.length > 0 
      ? data.results.reduce((sum, r) => sum + r.similarity, 0) / data.results.length 
      : null;
    
    // Log RAG usage with detailed chunk info
    await logRAGUsage(supabaseClient, {
      agentId,
      queryText: userMessage,
      results: data.results,
      executionTimeMs,
      conversaId,
      clientPhone: options?.clientPhone,
      funnelStage: options?.funnelStage,
      chunksUsed,
    });
    
    // Cache the result
    if (conversaId) {
      ragContextCache.set(conversaId, {
        context: data.context,
        timestamp: Date.now(),
        query: userMessage,
      });
      
      // Cleanup old cache entries
      if (ragContextCache.size > 50) {
        const now = Date.now();
        for (const [key, value] of ragContextCache.entries()) {
          if (now - value.timestamp > getRAGCacheTTLMs()) {
            ragContextCache.delete(key);
          }
        }
      }
    }

    return {
      context: data.context,
      resultsCount: data.results.length,
      executionTimeMs,
      chunksUsed,
      topSimilarity,
      avgSimilarity,
      categories: categoriesAccessed,
    };
  } catch (error) {
    console.error('[RAG] Error fetching context:', error);
    return emptyResult;
  }
}

/**
 * Log RAG usage with detailed chunk tracking for analytics
 */
async function logRAGUsage(
  supabaseClient: any,
  params: {
    agentId: string;
    queryText: string;
    results: RAGSearchResult[];
    executionTimeMs: number;
    conversaId?: string;
    clientPhone?: string;
    funnelStage?: string;
    chunksUsed?: RAGChunkUsed[];
  }
): Promise<void> {
  try {
    const { agentId, queryText, results, executionTimeMs, conversaId, clientPhone, funnelStage, chunksUsed } = params;
    
    const documentsAccessed = results.map((r: RAGSearchResult) => r.file_name).filter(Boolean);
    const categoriesAccessed = [...new Set(results.map((r: RAGSearchResult) => r.category).filter(Boolean))];
    const topSimilarity = results.length > 0 ? Math.max(...results.map(r => r.similarity)) : null;
    const avgSimilarity = results.length > 0 
      ? results.reduce((sum, r) => sum + r.similarity, 0) / results.length 
      : null;
    const totalTokens = results.reduce((sum: number, r: RAGSearchResult) => sum + (r.content?.length || 0) / 4, 0);
    
    await supabaseClient
      .from('rag_usage_logs')
      .insert({
        agent_id: agentId,
        query_text: queryText.substring(0, 500),
        results_count: results.length,
        top_similarity: topSimilarity,
        avg_similarity: avgSimilarity,
        documents_accessed: documentsAccessed,
        categories_accessed: categoriesAccessed,
        tokens_used: Math.round(totalTokens),
        response_time_ms: executionTimeMs,
        conversation_id: conversaId || null,
        conversa_id: conversaId || null,
        client_phone: clientPhone || null,
        funnel_stage: funnelStage || null,
        total_chunks: results.length,
        chunks_used: chunksUsed ? JSON.stringify(chunksUsed) : null,
        was_skipped: false,
        skip_reason: null,
        trigger_confidence: 'high', // If we called RAG, trigger was successful
      });
      
    console.log(`[RAG] Logged usage: ${results.length} chunks, top_sim=${topSimilarity?.toFixed(3)}, phone=${clientPhone || 'unknown'}`);
  } catch (logError) {
    console.warn('[RAG] Failed to log usage:', logError);
  }
}

// ═══════════════════════════════════════════════════════════════
// RAG ORCHESTRATION - Phase 45
// Complete RAG workflow: filter → fetch → parse categories → log
// ═══════════════════════════════════════════════════════════════

export interface RAGOrchestrationContext {
  supabase: any;
  agentId: string;
  messageText: string;
  conversaId: string;
  detectionPatterns?: Map<string, PatternEntry>;
}

export interface RAGPromptContext {
  content: string;
  resultsCount: number;
  categories: string[];
}

export interface RAGOrchestrationResult {
  ragContextForPrompt: RAGPromptContext | null;
  skipped: boolean;
  skipReason: string;
  coveredSections: string[];
}

/**
 * RAG Orchestration Context
 */
export interface RAGOrchestrationContext {
  supabase: any;
  agentId: string;
  messageText: string;
  conversaId: string;
  detectionPatterns?: Map<string, PatternEntry>;
  funnelStage?: string; // Added for critical_funnel_stage check
}

/**
 * Log RAG skip event for health monitoring
 */
async function logRAGSkip(
  supabaseClient: any,
  params: {
    agentId: string;
    queryText: string;
    skipReason: string;
    triggerConfidence: string;
    conversaId?: string;
    clientPhone?: string;
  }
): Promise<void> {
  try {
    await supabaseClient
      .from('rag_usage_logs')
      .insert({
        agent_id: params.agentId,
        query_text: params.queryText.substring(0, 500),
        was_skipped: true,
        skip_reason: params.skipReason,
        trigger_confidence: params.triggerConfidence,
        results_count: 0,
        top_similarity: null,
        conversa_id: params.conversaId || null,
        client_phone: params.clientPhone || null,
      });
    console.log(`[RAG] Logged skip event: reason=${params.skipReason}`);
  } catch (logError) {
    console.warn('[RAG] Failed to log skip event:', logError);
  }
}

/**
 * Complete RAG orchestration - filter, fetch, parse categories
 */
export async function orchestrateRAGSearch(ctx: RAGOrchestrationContext & { clientPhone?: string; funnelStage?: string }): Promise<RAGOrchestrationResult> {
  const { supabase, agentId, messageText, conversaId, detectionPatterns, clientPhone, funnelStage } = ctx;
  
  // 📊 AUDIT LOG: Input params for every call
  console.log(`[RAG-AUDIT] 📥 INPUT: msg="${messageText.substring(0, 60)}...", funnelStage="${funnelStage || 'unknown'}", agentId="${agentId}"`);
  
  // ═══════════════════════════════════════════════════════════════
  // CRITICAL FUNNEL STAGES: Force RAG regardless of message content
  // ═══════════════════════════════════════════════════════════════
  const CRITICAL_STAGES = ['proposta_inicial', 'solicitar_contrato', 'assinatura', 'docs_plataforma'];
  if (funnelStage && CRITICAL_STAGES.includes(funnelStage)) {
    console.log(`[RAG-AUDIT] 🚨 CRITICAL FUNNEL STAGE: ${funnelStage} - FORCING RAG`);
  }
  
  // Apply smart filter BEFORE making RAG API call
  const ragFilterResult = shouldTriggerRAG(messageText, detectionPatterns, { funnelStage });
  
  // 📊 AUDIT LOG: Always log RAG decision for transparency
  console.log(`[RAG-AUDIT] 🎯 DECISION for "${messageText.substring(0, 50)}...": shouldTrigger=${ragFilterResult.shouldTrigger}, reason="${ragFilterResult.reason}", confidence="${ragFilterResult.confidence}"`);
  
  if (!ragFilterResult.shouldTrigger) {
    console.warn(`[RAG-AUDIT] ⚠️ RAG SKIPPED: ${ragFilterResult.reason} | msg="${messageText.substring(0, 80)}..." | phone=${clientPhone || 'unknown'}`);
    
    // Log skip event for health monitoring
    await logRAGSkip(supabase, {
      agentId,
      queryText: messageText,
      skipReason: ragFilterResult.reason,
      triggerConfidence: ragFilterResult.confidence,
      conversaId,
      clientPhone,
    });
    
    return {
      ragContextForPrompt: null,
      skipped: true,
      skipReason: ragFilterResult.reason,
      coveredSections: [],
    };
  }
  
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    
    const ragResult = await fetchRAGContext(
      supabase,
      agentId,
      messageText,
      conversaId,
      {
        supabaseUrl,
        supabaseServiceKey,
        funnelStage: funnelStage || undefined,
        clientPhone: clientPhone || undefined,
      }
    );
    
    if (!ragResult.context || ragResult.resultsCount === 0) {
      console.log(`[rag-search-client] 📚 RAG-FIRST: No relevant documents found - using hardcoded fallback`);
      return {
        ragContextForPrompt: null,
        skipped: false,
        skipReason: 'no_relevant_documents',
        coveredSections: [],
      };
    }
    
    console.log(`[rag-search-client] 📚 RAG-FIRST: Found ${ragResult.resultsCount} relevant document chunks (${ragResult.executionTimeMs}ms)`);
    
    // Extract categories from the RAG context (parse from the formatted context)
    const categoryMatches = ragResult.context.match(/\(([a-z_]+)(?:\/[^)]+)?\)/gi) || [];
    const categories = [...new Set(categoryMatches.map(m => m.replace(/[()]/g, '').split('/')[0].toLowerCase()))];
    
    const ragContextForPrompt: RAGPromptContext = {
      content: ragResult.context,
      resultsCount: ragResult.resultsCount,
      categories: categories.length > 0 ? categories : ['kb_vendas'],
    };
    
    console.log(`[rag-search-client] 📚 RAG categories detected: ${ragContextForPrompt.categories.join(', ')}`);
    
    // Determine which hardcoded sections are covered by RAG
    const lowerContent = ragResult.context.toLowerCase();
    const coveredSections: string[] = [];
    
    if (['cnpj', 'consórcio', 'inka'].some(kw => lowerContent.includes(kw))) {
      coveredSections.push('COESA_COMPANY_INFO');
    }
    if (['objeção', 'objecao', 'tratamento'].some(kw => lowerContent.includes(kw))) {
      coveredSections.push('OBJECTION_RESPONSES');
    }
    if (['plano', 'desconto', 'fidelidade'].some(kw => lowerContent.includes(kw))) {
      coveredSections.push('PLANOS');
    }
    
    if (coveredSections.length > 0) {
      console.log(`[rag-search-client] 📚 RAG-FIRST: Sections replaced by RAG: ${coveredSections.join(', ')}`);
    }
    
    return {
      ragContextForPrompt,
      skipped: false,
      skipReason: '',
      coveredSections,
    };
    
  } catch (ragError) {
    console.warn('[rag-search-client] RAG-FIRST search failed, continuing without document context:', ragError);
    return {
      ragContextForPrompt: null,
      skipped: false,
      skipReason: 'error',
      coveredSections: [],
    };
  }
}
