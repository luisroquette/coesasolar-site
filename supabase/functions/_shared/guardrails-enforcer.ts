/**
 * GUARDRAILS ENFORCER - Phase 47
 * 
 * Deterministic business rule enforcement loaded from database.
 * Replaces RAG-based critical rules with code-level blocks.
 * 
 * Pre-LLM: Blocks messages that violate critical rules BEFORE LLM processes
 * Post-LLM: Intercepts and corrects LLM responses that violate rules
 */

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface BusinessRuleGuardrail {
  id: string;
  rule_code: string;
  rule_name: string;
  description: string;
  enforcement_point: 'pre_llm' | 'post_llm' | 'both';
  severity: 'critical' | 'error' | 'warning' | 'info';
  trigger_patterns: string[];
  block_patterns: string[];
  action_type: 'block' | 'replace' | 'flag' | 'log';
  replacement_template: string | null;
  agent_ids: string[];
  funnel_stages: string[];
  priority: number;
}

export interface GuardrailEnforcementResult {
  triggered: boolean;
  rule_code: string | null;
  rule_name: string | null;
  severity: string | null;
  action_taken: 'blocked' | 'replaced' | 'flagged' | 'logged' | 'none';
  original_text: string;
  modified_text: string | null;
  trigger_match: string | null;
  all_violations: GuardrailViolation[];
}

export interface GuardrailViolation {
  rule_code: string;
  rule_name: string;
  severity: string;
  match: string;
}

export interface GuardrailContext {
  agentId: string;
  funnelStage?: string;
  hasEmail?: boolean;
  hasProposalId?: boolean;
  proposalUrl?: string | null;
  clientName?: string | null;
  conversaId?: string;
  clientPhone?: string;
}

// ═══════════════════════════════════════════════════════════════
// CACHE
// ═══════════════════════════════════════════════════════════════

let guardrailsCache: { 
  data: BusinessRuleGuardrail[] | null; 
  timestamp: number;
  compiledPatterns: Map<string, { trigger: RegExp[]; block: RegExp[] }>;
} = { 
  data: null, 
  timestamp: 0,
  compiledPatterns: new Map()
};

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Load guardrails from database with caching
 */
export async function loadGuardrails(supabase: any): Promise<BusinessRuleGuardrail[]> {
  const now = Date.now();
  
  if (guardrailsCache.data && (now - guardrailsCache.timestamp) < CACHE_TTL_MS) {
    return guardrailsCache.data;
  }
  
  try {
    const { data, error } = await supabase
      .from('business_rules_guardrails')
      .select('*')
      .eq('is_active', true)
      .order('priority', { ascending: false });
    
    if (error) {
      console.error('[GUARDRAILS] Error loading guardrails:', error);
      return guardrailsCache.data || [];
    }
    
    const rules: BusinessRuleGuardrail[] = (data || []).map((row: any) => ({
      id: row.id,
      rule_code: row.rule_code,
      rule_name: row.rule_name,
      description: row.description,
      enforcement_point: row.enforcement_point,
      severity: row.severity,
      trigger_patterns: Array.isArray(row.trigger_patterns) ? row.trigger_patterns : [],
      block_patterns: Array.isArray(row.block_patterns) ? row.block_patterns : [],
      action_type: row.action_type,
      replacement_template: row.replacement_template,
      agent_ids: row.agent_ids || [],
      funnel_stages: row.funnel_stages || [],
      priority: row.priority || 50,
    }));
    
    // Pre-compile regex patterns
    const compiledPatterns = new Map<string, { trigger: RegExp[]; block: RegExp[] }>();
    for (const rule of rules) {
      const triggerRegexes: RegExp[] = [];
      const blockRegexes: RegExp[] = [];
      
      for (const pattern of rule.trigger_patterns) {
        try {
          triggerRegexes.push(new RegExp(pattern, 'i'));
        } catch (e) {
          console.warn(`[GUARDRAILS] Invalid trigger regex in ${rule.rule_code}: ${pattern}`);
        }
      }
      
      for (const pattern of rule.block_patterns) {
        try {
          blockRegexes.push(new RegExp(pattern, 'i'));
        } catch (e) {
          console.warn(`[GUARDRAILS] Invalid block regex in ${rule.rule_code}: ${pattern}`);
        }
      }
      
      compiledPatterns.set(rule.rule_code, { trigger: triggerRegexes, block: blockRegexes });
    }
    
    guardrailsCache = { data: rules, timestamp: now, compiledPatterns };
    console.log(`[GUARDRAILS] Loaded ${rules.length} active guardrails`);
    
    return rules;
  } catch (err) {
    console.error('[GUARDRAILS] Exception loading guardrails:', err);
    return guardrailsCache.data || [];
  }
}

/**
 * Get compiled patterns for a rule
 */
function getCompiledPatterns(ruleCode: string): { trigger: RegExp[]; block: RegExp[] } {
  return guardrailsCache.compiledPatterns.get(ruleCode) || { trigger: [], block: [] };
}

/**
 * Check if a rule applies to the current context
 */
function ruleApplies(rule: BusinessRuleGuardrail, ctx: GuardrailContext): boolean {
  // Check agent filter
  if (rule.agent_ids.length > 0 && !rule.agent_ids.includes(ctx.agentId)) {
    return false;
  }
  
  // Check funnel stage filter
  if (rule.funnel_stages.length > 0 && ctx.funnelStage && !rule.funnel_stages.includes(ctx.funnelStage)) {
    return false;
  }
  
  return true;
}

// ═══════════════════════════════════════════════════════════════
// PRE-LLM ENFORCEMENT
// ═══════════════════════════════════════════════════════════════

/**
 * Run pre-LLM guardrails on incoming message
 * Returns early block if critical rule is violated
 */
export async function enforcePreLLMGuardrails(
  supabase: any,
  messageText: string,
  ctx: GuardrailContext
): Promise<GuardrailEnforcementResult> {
  const rules = await loadGuardrails(supabase);
  const preLLMRules = rules.filter(r => r.enforcement_point === 'pre_llm' || r.enforcement_point === 'both');
  
  const result: GuardrailEnforcementResult = {
    triggered: false,
    rule_code: null,
    rule_name: null,
    severity: null,
    action_taken: 'none',
    original_text: messageText,
    modified_text: null,
    trigger_match: null,
    all_violations: [],
  };
  
  for (const rule of preLLMRules) {
    if (!ruleApplies(rule, ctx)) continue;
    
    const patterns = getCompiledPatterns(rule.rule_code);
    
    // Check trigger patterns (if any - some rules trigger on all messages)
    let shouldCheck = patterns.trigger.length === 0;
    let triggerMatch = '';
    
    for (const regex of patterns.trigger) {
      const match = messageText.match(regex);
      if (match) {
        shouldCheck = true;
        triggerMatch = match[0];
        break;
      }
    }
    
    if (!shouldCheck) continue;
    
    // Check block patterns
    for (const regex of patterns.block) {
      const match = messageText.match(regex);
      if (match) {
        result.all_violations.push({
          rule_code: rule.rule_code,
          rule_name: rule.rule_name,
          severity: rule.severity,
          match: match[0],
        });
        
        // First critical/error violation takes action
        if (!result.triggered && (rule.severity === 'critical' || rule.severity === 'error')) {
          result.triggered = true;
          result.rule_code = rule.rule_code;
          result.rule_name = rule.rule_name;
          result.severity = rule.severity;
          result.trigger_match = match[0];
          
          if (rule.action_type === 'block' && rule.replacement_template) {
            result.action_taken = 'blocked';
            result.modified_text = interpolateTemplate(rule.replacement_template, ctx);
          } else if (rule.action_type === 'flag') {
            result.action_taken = 'flagged';
          }
        }
      }
    }
  }
  
  if (result.triggered) {
    console.log(`[GUARDRAILS] ⛔ Pre-LLM violation: ${result.rule_code} (${result.severity})`);
    await logGuardrailEvent(supabase, result, ctx, 'pre_llm');
  }
  
  return result;
}

// ═══════════════════════════════════════════════════════════════
// POST-LLM ENFORCEMENT
// ═══════════════════════════════════════════════════════════════

/**
 * Run post-LLM guardrails on AI response
 * Intercepts and corrects violations before sending to client
 */
export async function enforcePostLLMGuardrails(
  supabase: any,
  llmResponse: string,
  ctx: GuardrailContext
): Promise<GuardrailEnforcementResult> {
  const rules = await loadGuardrails(supabase);
  const postLLMRules = rules.filter(r => r.enforcement_point === 'post_llm' || r.enforcement_point === 'both');
  
  const result: GuardrailEnforcementResult = {
    triggered: false,
    rule_code: null,
    rule_name: null,
    severity: null,
    action_taken: 'none',
    original_text: llmResponse,
    modified_text: null,
    trigger_match: null,
    all_violations: [],
  };
  
  for (const rule of postLLMRules) {
    if (!ruleApplies(rule, ctx)) continue;
    
    const patterns = getCompiledPatterns(rule.rule_code);
    
    // Special handling for rules that require context checks
    if (rule.rule_code === 'EMAIL_BEFORE_PROPOSAL' && ctx.hasEmail) {
      continue; // Skip if email exists
    }
    
    if (rule.rule_code === 'NO_REDUNDANT_PROMISES' && !ctx.hasProposalId) {
      continue; // Skip if no proposal yet
    }
    
    // Check block patterns in LLM response
    for (const regex of patterns.block) {
      const match = llmResponse.match(regex);
      if (match) {
        result.all_violations.push({
          rule_code: rule.rule_code,
          rule_name: rule.rule_name,
          severity: rule.severity,
          match: match[0],
        });
        
        // First critical/error violation takes action
        if (!result.triggered && (rule.severity === 'critical' || rule.severity === 'error')) {
          result.triggered = true;
          result.rule_code = rule.rule_code;
          result.rule_name = rule.rule_name;
          result.severity = rule.severity;
          result.trigger_match = match[0];
          
          if (rule.action_type === 'replace' && rule.replacement_template) {
            result.action_taken = 'replaced';
            result.modified_text = interpolateTemplate(rule.replacement_template, ctx);
          } else if (rule.action_type === 'flag') {
            result.action_taken = 'flagged';
          }
        }
      }
    }
  }
  
  if (result.triggered) {
    console.log(`[GUARDRAILS] ⛔ Post-LLM violation: ${result.rule_code} (${result.severity}) - Action: ${result.action_taken}`);
    await logGuardrailEvent(supabase, result, ctx, 'post_llm');
  }
  
  return result;
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Interpolate template variables
 */
function interpolateTemplate(template: string, ctx: GuardrailContext): string {
  let result = template;
  
  if (ctx.proposalUrl) {
    result = result.replace(/\{proposal_url\}/gi, ctx.proposalUrl);
    result = result.replace(/\{link\}/gi, ctx.proposalUrl);
  }
  
  if (ctx.clientName) {
    const firstName = ctx.clientName.split(' ')[0];
    result = result.replace(/\{client_name\}/gi, ctx.clientName);
    result = result.replace(/\{first_name\}/gi, firstName);
  }
  
  return result;
}

/**
 * Log guardrail event for audit
 */
async function logGuardrailEvent(
  supabase: any,
  result: GuardrailEnforcementResult,
  ctx: GuardrailContext,
  enforcementPoint: string
): Promise<void> {
  try {
    await supabase.from('sofia_guardrail_events').insert({
      rule_code: result.rule_code,
      rule_name: result.rule_name,
      enforcement_point: enforcementPoint,
      severity: result.severity,
      action_taken: result.action_taken,
      conversa_id: ctx.conversaId || null,
      client_phone: ctx.clientPhone || null,
      agent_id: ctx.agentId,
      original_message: enforcementPoint === 'pre_llm' ? result.original_text?.substring(0, 500) : null,
      original_response: enforcementPoint === 'post_llm' ? result.original_text?.substring(0, 500) : null,
      replaced_response: result.modified_text?.substring(0, 500) || null,
      trigger_match: result.trigger_match,
    });
  } catch (err) {
    console.warn('[GUARDRAILS] Failed to log event:', err);
  }
}

/**
 * Clear guardrails cache (for testing/refresh)
 */
export function clearGuardrailsCache(): void {
  guardrailsCache = { data: null, timestamp: 0, compiledPatterns: new Map() };
}

/**
 * Get guardrails summary for debugging
 */
export function getGuardrailsSummary(): { count: number; rules: string[] } {
  return {
    count: guardrailsCache.data?.length || 0,
    rules: guardrailsCache.data?.map(r => `${r.rule_code} (${r.severity})`) || [],
  };
}
