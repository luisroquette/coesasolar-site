/**
 * Rule Memory Injector Module
 * Injects rules from rule_memory table into system prompt
 * Ensures learned rules are ALWAYS considered in both Fast-Path and LLM flows
 * 
 * Part of AGENTS.md-Style Passive Context Architecture
 * 
 * @module _shared/rule-memory-injector
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface RuleMemoryEntry {
  id: string;
  agentId: string;
  ruleType: string;
  name: string;
  description: string | null;
  priority: number;
  conditions: Record<string, unknown> | null;
  isActive: boolean;
  validUntil: string | null;
  metadata: Record<string, unknown> | null;
}

export interface InjectedRulesBlock {
  content: string;
  rulesCount: number;
  charCount: number;
  topPriority: number;
  criticalRulesCount: number;
  categories: string[];
}

export interface RuleMemoryContext {
  funnelStage?: string;
  hasProposal?: boolean;
  detectedObjection?: string;
  clientDistribuidora?: string;
  valorFatura?: number;
}

export interface RuleMemoryInjectorOptions {
  maxRules?: number;
  minPriority?: number;
  includeExpired?: boolean;
  filterByContext?: boolean;
  compressDescriptions?: boolean;
  maxDescriptionLength?: number;
}

// ═══════════════════════════════════════════════════════════════
// CACHE
// ═══════════════════════════════════════════════════════════════

// Cache rules for 5 minutes to reduce DB calls
const rulesCache = new Map<string, { rules: RuleMemoryEntry[]; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Clear cache for a specific agent
 */
export function clearRuleMemoryCache(agentId?: string): void {
  if (agentId) {
    rulesCache.delete(agentId);
  } else {
    rulesCache.clear();
  }
  console.log(`[RuleMemoryInjector] Cache cleared${agentId ? ` for ${agentId}` : ''}`);
}

// ═══════════════════════════════════════════════════════════════
// MAIN FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Load matching rules from rule_memory table
 * Filters by agent, active status, and optional context
 */
export async function loadMatchingRules(
  supabase: SupabaseClient,
  agentId: string,
  context: RuleMemoryContext = {},
  options: RuleMemoryInjectorOptions = {}
): Promise<RuleMemoryEntry[]> {
  const cacheKey = agentId;
  const now = Date.now();
  
  // Check cache
  const cached = rulesCache.get(cacheKey);
  if (cached && (now - cached.timestamp) < CACHE_TTL_MS) {
    console.log(`[RuleMemoryInjector] Using cached rules for ${agentId} (${cached.rules.length} rules)`);
    return filterRulesByContext(cached.rules, context, options);
  }
  
  try {
    const { data, error } = await supabase
      .from('rule_memory')
      .select('*')
      .eq('agent_id', agentId)
      .eq('is_active', true)
      .order('priority', { ascending: false });
    
    if (error) {
      console.error('[RuleMemoryInjector] Error loading rules:', error);
      return [];
    }
    
    const rules: RuleMemoryEntry[] = (data || []).map(row => ({
      id: row.id,
      agentId: row.agent_id,
      ruleType: row.rule_type,
      name: row.name,
      description: row.description,
      priority: row.priority,
      conditions: row.condition || null, // Schema uses 'condition' (singular)
      isActive: row.is_active,
      validUntil: null, // Column doesn't exist in current schema
      metadata: row.metadata,
    }));
    
    // All rules returned are already active (filtered in query)
    const activeRules = rules;
    
    // Update cache
    rulesCache.set(cacheKey, { rules: activeRules, timestamp: now });
    
    console.log(`[RuleMemoryInjector] Loaded ${activeRules.length} rules for ${agentId}`);
    
    return filterRulesByContext(activeRules, context, options);
    
  } catch (err) {
    console.error('[RuleMemoryInjector] Exception loading rules:', err);
    return [];
  }
}

/**
 * Filter rules based on current context
 */
function filterRulesByContext(
  rules: RuleMemoryEntry[],
  context: RuleMemoryContext,
  options: RuleMemoryInjectorOptions
): RuleMemoryEntry[] {
  let filtered = rules;
  
  // Filter by minimum priority
  if (options.minPriority) {
    filtered = filtered.filter(r => r.priority >= options.minPriority!);
  }
  
  // Filter by context if enabled
  if (options.filterByContext && Object.keys(context).length > 0) {
    filtered = filtered.filter(rule => {
      if (!rule.conditions) return true;
      
      const conditions = rule.conditions as Record<string, unknown>;
      
      // Check funnel stage condition
      if (conditions.funnelStages && context.funnelStage) {
        const stages = conditions.funnelStages as string[];
        if (!stages.includes(context.funnelStage)) return false;
      }
      
      // Check proposal condition
      if (conditions.requiresProposal !== undefined && context.hasProposal !== undefined) {
        if (conditions.requiresProposal !== context.hasProposal) return false;
      }
      
      // Check objection condition
      if (conditions.objectionTypes && context.detectedObjection) {
        const types = conditions.objectionTypes as string[];
        if (!types.includes(context.detectedObjection)) return false;
      }
      
      return true;
    });
  }
  
  // Limit number of rules
  if (options.maxRules && filtered.length > options.maxRules) {
    filtered = filtered.slice(0, options.maxRules);
  }
  
  return filtered;
}

/**
 * Build the rule memory injection block for system prompt
 * This is the main function to use when building prompts
 */
export async function buildRuleMemoryBlock(
  supabase: SupabaseClient,
  agentId: string,
  context: RuleMemoryContext = {},
  options: RuleMemoryInjectorOptions = {}
): Promise<InjectedRulesBlock> {
  const defaultOptions: RuleMemoryInjectorOptions = {
    maxRules: 15,
    minPriority: 0,
    includeExpired: false,
    filterByContext: true,
    compressDescriptions: true,
    maxDescriptionLength: 100,
    ...options,
  };
  
  const rules = await loadMatchingRules(supabase, agentId, context, defaultOptions);
  
  if (rules.length === 0) {
    return {
      content: '',
      rulesCount: 0,
      charCount: 0,
      topPriority: 0,
      criticalRulesCount: 0,
      categories: [],
    };
  }
  
  // Sort by priority (highest first)
  const sorted = [...rules].sort((a, b) => b.priority - a.priority);
  
  // Group by type
  const byType = new Map<string, RuleMemoryEntry[]>();
  for (const rule of sorted) {
    const existing = byType.get(rule.ruleType) || [];
    existing.push(rule);
    byType.set(rule.ruleType, existing);
  }
  
  // Build AGENTS.md-style compressed content (pipe-delimited format)
  const lines: string[] = [];
  lines.push('');
  lines.push('## REGRAS ATIVAS (OBRIGATÓRIO)');
  lines.push('');
  
  let ruleIndex = 1;
  const categories: string[] = [];
  
  // Critical rules first (P90+) in compact format
  const criticalRules = sorted.filter(r => r.priority >= 90);
  const normalRules = sorted.filter(r => r.priority < 90);
  
  if (criticalRules.length > 0) {
    lines.push('**🔴 CRÍTICAS (BLOQUEANTES):**');
    const criticalLine = criticalRules.map(r => `${r.name}[P${r.priority}]`).join(' | ');
    lines.push(criticalLine);
    lines.push('');
  }
  
  // Group normal rules by type in compact format
  for (const [ruleType, typeRules] of byType.entries()) {
    categories.push(ruleType);
    const nonCritical = typeRules.filter(r => r.priority < 90);
    if (nonCritical.length === 0) continue;
    
    const icon = formatRuleType(ruleType).split(' ')[0];
    lines.push(`**${icon} ${ruleType.toUpperCase()}:**`);
    
    // AGENTS.md format: inline pipe-delimited
    for (const rule of nonCritical) {
      const priorityIcon = rule.priority >= 70 ? '🟡' : '🟢';
      let desc = rule.description || '';
      
      // Aggressive compression for AGENTS.md compliance
      if (defaultOptions.compressDescriptions && desc.length > 60) {
        desc = desc.substring(0, 57) + '...';
      }
      
      lines.push(`${ruleIndex}. ${priorityIcon}[P${rule.priority}] ${rule.name}${desc ? ': ' + desc : ''}`);
      ruleIndex++;
    }
    lines.push('');
  }
  
  const content = lines.join('\n');
  
  return {
    content,
    rulesCount: rules.length,
    charCount: content.length,
    topPriority: sorted[0]?.priority || 0,
    criticalRulesCount: criticalRules.length,
    categories,
  };
}

/**
 * Format rule type for display
 */
function formatRuleType(ruleType: string): string {
  const mapping: Record<string, string> = {
    'guardrail': '🛡️ Guardrails',
    'behavior': '🎭 Comportamento',
    'response': '💬 Respostas',
    'validation': '✅ Validações',
    'escalation': '🚨 Escalação',
    'restriction': '🚫 Restrições',
    'collection': '📝 Coleta de Dados',
    'objection': '🤝 Objeções',
  };
  
  return mapping[ruleType] || `📌 ${ruleType.charAt(0).toUpperCase() + ruleType.slice(1)}`;
}

// ═══════════════════════════════════════════════════════════════
// QUICK ACCESS FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Get only critical rules (priority >= 90)
 * Useful for Fast-Path handlers that need quick rule checks
 */
export async function getCriticalRules(
  supabase: SupabaseClient,
  agentId: string
): Promise<RuleMemoryEntry[]> {
  return loadMatchingRules(supabase, agentId, {}, { minPriority: 90 });
}

/**
 * Check if a specific rule applies to current context
 */
export async function checkRuleApplies(
  supabase: SupabaseClient,
  agentId: string,
  ruleName: string,
  context: RuleMemoryContext
): Promise<boolean> {
  const rules = await loadMatchingRules(supabase, agentId, context, { filterByContext: true });
  return rules.some(r => r.name.toLowerCase().includes(ruleName.toLowerCase()));
}

/**
 * Get rules for a specific type
 */
export async function getRulesByType(
  supabase: SupabaseClient,
  agentId: string,
  ruleType: string
): Promise<RuleMemoryEntry[]> {
  const rules = await loadMatchingRules(supabase, agentId, {});
  return rules.filter(r => r.ruleType === ruleType);
}

// ═══════════════════════════════════════════════════════════════
// INLINE RULE SUMMARY (for Fast-Path)
// ═══════════════════════════════════════════════════════════════

/**
 * Build a minimal inline summary of active rules
 * For use in Fast-Path where full prompt isn't available
 */
export async function buildInlineRuleSummary(
  supabase: SupabaseClient,
  agentId: string,
  context: RuleMemoryContext
): Promise<string> {
  const rules = await loadMatchingRules(supabase, agentId, context, {
    maxRules: 5,
    minPriority: 70,
    filterByContext: true,
  });
  
  if (rules.length === 0) return '';
  
  const summary = rules
    .map(r => `[${r.ruleType}] ${r.name}`)
    .join(' | ');
  
  return `Regras: ${summary}`;
}
