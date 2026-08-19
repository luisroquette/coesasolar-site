/**
 * Few-Shot Injector Module
 * 
 * Fetches and injects relevant few-shot examples into the system prompt
 * based on funnel stage and context - following AGENTS.md Passive-First pattern.
 * 
 * Key features:
 * - Stage-based example selection (examples matched to funnel stage)
 * - Quality-prioritized (higher quality_score first)
 * - Compact formatting (minimal tokens, maximum signal)
 * - Cache support for performance
 * 
 * @module _shared/few-shot-injector
 * @version 1.0
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface FewShotExample {
  id: string;
  context: string | null;
  input: string;
  expected_output: string;
  quality_score: number | null;
  metadata: Record<string, unknown> | null;
}

export interface FewShotInjectorConfig {
  maxExamples: number;           // Max examples to inject (default: 3)
  minQualityScore: number;       // Minimum quality score (default: 70)
  preferredContext?: string;     // Context keyword to prioritize
  compactFormat: boolean;        // Use compact AGENTS.md format (default: true)
}

export interface FewShotBlock {
  content: string;               // Formatted block for prompt injection
  examplesCount: number;         // Number of examples included
  examplesUsed: string[];        // IDs of examples used
  charCount: number;             // Total characters
  executionTimeMs: number;       // Fetch time
}

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const DEFAULT_CONFIG: FewShotInjectorConfig = {
  maxExamples: 3,
  minQualityScore: 70,
  compactFormat: true,
};

// Cache for few-shot examples (per agent + context)
const fewShotCache = new Map<string, {
  examples: FewShotExample[];
  timestamp: number;
}>();

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Funnel stage to context keyword mapping
const STAGE_CONTEXT_MAP: Record<string, string[]> = {
  'triagem': ['início', 'interesse', 'apresentação', 'saudação'],
  'qualificacao': ['qualificação', 'valor', 'conta', 'consumo'],
  'coleta_dados': ['coleta', 'dados', 'email', 'distribuidora'],
  'proposta_inicial': ['proposta', 'economia', 'desconto', 'plano'],
  'docs_plataforma': ['documento', 'rg', 'cnh', 'fatura'],
  'solicitar_contrato': ['fechamento', 'contrato', 'assinatura'],
  'assinatura': ['assinatura', 'contrato', 'clicksign'],
};

// ═══════════════════════════════════════════════════════════════
// MAIN FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Fetch and inject few-shot examples for a given funnel stage
 * Returns formatted block ready for prompt injection
 */
export async function injectFewShotExamples(
  supabase: SupabaseClient,
  agentId: string,
  funnelStage: string,
  config: Partial<FewShotInjectorConfig> = {}
): Promise<FewShotBlock> {
  const startTime = Date.now();
  
  const cfg: FewShotInjectorConfig = {
    ...DEFAULT_CONFIG,
    ...config,
  };
  
  // Get context keywords for this funnel stage
  const contextKeywords = STAGE_CONTEXT_MAP[funnelStage] || STAGE_CONTEXT_MAP['triagem'];
  
  // Check cache first
  const cacheKey = `${agentId}:${funnelStage}`;
  const cached = fewShotCache.get(cacheKey);
  
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
    console.log(`[FewShotInjector] Using cached examples for ${funnelStage} (${cached.examples.length} examples)`);
    
    const content = formatFewShotBlock(cached.examples, cfg);
    return {
      content,
      examplesCount: cached.examples.length,
      examplesUsed: cached.examples.map(e => e.id),
      charCount: content.length,
      executionTimeMs: Date.now() - startTime,
    };
  }
  
  try {
    // Fetch examples from database
    const examples = await fetchFewShotExamples(
      supabase,
      agentId,
      contextKeywords,
      cfg.maxExamples,
      cfg.minQualityScore
    );
    
    if (examples.length === 0) {
      console.log(`[FewShotInjector] No examples found for ${funnelStage}`);
      return {
        content: '',
        examplesCount: 0,
        examplesUsed: [],
        charCount: 0,
        executionTimeMs: Date.now() - startTime,
      };
    }
    
    // Update cache
    fewShotCache.set(cacheKey, {
      examples,
      timestamp: Date.now(),
    });
    
    // Format examples for prompt
    const content = formatFewShotBlock(examples, cfg);
    
    const executionTimeMs = Date.now() - startTime;
    console.log(`[FewShotInjector] Injected ${examples.length} examples for ${funnelStage} in ${executionTimeMs}ms`);
    
    return {
      content,
      examplesCount: examples.length,
      examplesUsed: examples.map(e => e.id),
      charCount: content.length,
      executionTimeMs,
    };
    
  } catch (error) {
    console.error('[FewShotInjector] Error fetching examples:', error);
    return {
      content: '',
      examplesCount: 0,
      examplesUsed: [],
      charCount: 0,
      executionTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * Fetch few-shot examples from database
 */
async function fetchFewShotExamples(
  supabase: SupabaseClient,
  agentId: string,
  contextKeywords: string[],
  limit: number,
  minQualityScore: number
): Promise<FewShotExample[]> {
  // Build query - prioritize examples that match context keywords
  const { data, error } = await supabase
    .from('few_shot_examples')
    .select('id, context, input, expected_output, quality_score, metadata')
    .eq('agent_id', agentId)
    .eq('is_active', true)
    .eq('is_approved', true)
    .gte('quality_score', minQualityScore)
    .order('quality_score', { ascending: false })
    .limit(limit * 2); // Fetch more to filter by context relevance
  
  if (error) {
    console.error('[FewShotInjector] Database error:', error);
    return [];
  }
  
  if (!data || data.length === 0) {
    return [];
  }
  
  // Score examples by context relevance
  const scoredExamples = (data as FewShotExample[]).map(example => {
    let relevanceScore = example.quality_score || 50;
    
    // Boost score if context matches funnel stage keywords
    if (example.context) {
      const contextLower = example.context.toLowerCase();
      for (const keyword of contextKeywords) {
        if (contextLower.includes(keyword)) {
          relevanceScore += 10;
          break; // Only add bonus once
        }
      }
    }
    
    return { example, relevanceScore };
  });
  
  // Sort by combined score and take top N
  scoredExamples.sort((a, b) => b.relevanceScore - a.relevanceScore);
  
  return scoredExamples.slice(0, limit).map(s => s.example);
}

/**
 * Format few-shot examples into AGENTS.md-style compact block
 */
function formatFewShotBlock(examples: FewShotExample[], config: FewShotInjectorConfig): string {
  if (examples.length === 0) return '';
  
  const lines: string[] = [];
  
  if (config.compactFormat) {
    // AGENTS.md Compact Format
    lines.push('## FEW-SHOT (EXEMPLOS DE RESPOSTAS IDEAIS)');
    lines.push('');
    
    for (let i = 0; i < examples.length; i++) {
      const ex = examples[i];
      const inputCompact = truncateText(ex.input, 80);
      const outputCompact = truncateText(ex.expected_output, 150);
      const contextTag = ex.context ? `[${truncateText(ex.context, 30)}]` : '';
      
      lines.push(`**Ex${i + 1}${contextTag}:**`);
      lines.push(`👤 "${inputCompact}"`);
      lines.push(`🤖 "${outputCompact}"`);
      lines.push('');
    }
    
    lines.push('Use estes exemplos como referência de tom e estrutura.');
    
  } else {
    // Full Format (more detailed)
    lines.push('═══════════════════════════════════════════════════════════════');
    lines.push('📚 EXEMPLOS DE RESPOSTA (FEW-SHOT LEARNING)');
    lines.push('═══════════════════════════════════════════════════════════════');
    lines.push('');
    
    for (let i = 0; i < examples.length; i++) {
      const ex = examples[i];
      lines.push(`### Exemplo ${i + 1}${ex.context ? ` (${ex.context})` : ''}`);
      lines.push(`**Cliente:** ${ex.input}`);
      lines.push(`**Sofia:** ${ex.expected_output}`);
      lines.push('');
    }
    
    lines.push('---');
    lines.push('⚠️ Use estes exemplos como guia para tom e estrutura de resposta.');
  }
  
  return lines.join('\n');
}

/**
 * Truncate text to max length with ellipsis
 */
function truncateText(text: string, maxLength: number): string {
  if (!text) return '';
  const cleaned = text.trim().replace(/\n+/g, ' ');
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.substring(0, maxLength - 3) + '...';
}

// ═══════════════════════════════════════════════════════════════
// CACHE MANAGEMENT
// ═══════════════════════════════════════════════════════════════

/**
 * Clear few-shot cache
 */
export function clearFewShotCache(agentId?: string, stage?: string): void {
  if (agentId && stage) {
    fewShotCache.delete(`${agentId}:${stage}`);
  } else if (agentId) {
    for (const key of fewShotCache.keys()) {
      if (key.startsWith(`${agentId}:`)) {
        fewShotCache.delete(key);
      }
    }
  } else {
    fewShotCache.clear();
  }
  console.log('[FewShotInjector] Cache cleared');
}

/**
 * Get cache status for debugging
 */
export function getFewShotCacheStatus(): {
  entries: number;
  stages: string[];
  oldestEntry: number | null;
} {
  const stages: string[] = [];
  let oldestTimestamp: number | null = null;
  
  for (const [key, value] of fewShotCache.entries()) {
    const stage = key.split(':')[1];
    if (stage) stages.push(stage);
    if (!oldestTimestamp || value.timestamp < oldestTimestamp) {
      oldestTimestamp = value.timestamp;
    }
  }
  
  return {
    entries: fewShotCache.size,
    stages: [...new Set(stages)],
    oldestEntry: oldestTimestamp ? Date.now() - oldestTimestamp : null,
  };
}

/**
 * Warm up cache for common stages
 */
export async function warmUpFewShotCache(
  supabase: SupabaseClient,
  agentId: string,
  stages: string[] = ['triagem', 'qualificacao', 'coleta_dados']
): Promise<void> {
  console.log(`[FewShotInjector] Warming up cache for stages: ${stages.join(', ')}`);
  
  await Promise.all(
    stages.map(stage =>
      injectFewShotExamples(supabase, agentId, stage).catch(err => {
        console.warn(`[FewShotInjector] Failed to warm up ${stage}:`, err);
      })
    )
  );
  
  console.log('[FewShotInjector] Cache warm-up complete');
}
