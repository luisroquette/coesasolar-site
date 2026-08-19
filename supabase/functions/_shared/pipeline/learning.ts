/**
 * SOFIA PIPELINE 2.0 - LEARNING LAYER
 * 
 * Fase 5: Persistência de Aprendizados
 * Salva fatos, atualiza memória e identifica padrões
 * 
 * Integrado com:
 * - Behavioral Profile (Sistema 2)
 * - Self-Evaluation (Sistema 3)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { 
  LearningResult,
  LearningUpdate,
  ReasoningResult,
  FullContext,
  ValidationResult,
  NewFact,
  WorkingMemoryItem
} from "./types.ts";
import { updateProfileAfterInteraction } from "./behavioral-profile.ts";
import { executeSelfEvaluation } from "./self-evaluation.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ============================================
// FACT PERSISTENCE
// ============================================

/**
 * Save new facts to working_memory
 */
async function saveNewFacts(
  facts: NewFact[],
  conversaId: string,
  turnNumber: number
): Promise<{ saved: NewFact[]; errors: string[] }> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const saved: NewFact[] = [];
  const errors: string[] = [];
  
  for (const fact of facts) {
    try {
      const validUntil = fact.validUntilHours 
        ? new Date(Date.now() + fact.validUntilHours * 60 * 60 * 1000).toISOString()
        : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // Default 24h
      
      const { error } = await supabase.from('working_memory').upsert({
        conversa_id: conversaId,
        memory_type: 'fact',
        key: fact.key,
        value: fact.value,
        confidence: fact.confidence,
        source: fact.source,
        valid_until: validUntil,
        turn_number: turnNumber,
        created_at: new Date().toISOString()
      }, {
        onConflict: 'conversa_id,key'
      });
      
      if (error) {
        errors.push(`Failed to save fact ${fact.key}: ${error.message}`);
      } else {
        saved.push(fact);
      }
    } catch (err) {
      errors.push(`Error saving fact ${fact.key}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  
  return { saved, errors };
}

/**
 * Update existing facts with new values
 */
async function updateExistingFacts(
  updates: Array<{ key: string; newValue: unknown }>,
  conversaId: string
): Promise<{ updated: Array<{ key: string; oldValue: unknown; newValue: unknown }>; errors: string[] }> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const updated: Array<{ key: string; oldValue: unknown; newValue: unknown }> = [];
  const errors: string[] = [];
  
  for (const update of updates) {
    try {
      // Get old value first
      const { data: existing } = await supabase
        .from('working_memory')
        .select('value')
        .eq('conversa_id', conversaId)
        .eq('key', update.key)
        .single();
      
      const oldValue = existing?.value;
      
      // Update
      const { error } = await supabase
        .from('working_memory')
        .update({
          value: update.newValue,
          updated_at: new Date().toISOString()
        })
        .eq('conversa_id', conversaId)
        .eq('key', update.key);
      
      if (error) {
        errors.push(`Failed to update fact ${update.key}: ${error.message}`);
      } else {
        updated.push({ key: update.key, oldValue, newValue: update.newValue });
      }
    } catch (err) {
      errors.push(`Error updating fact ${update.key}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  
  return { updated, errors };
}

// ============================================
// PATTERN IDENTIFICATION
// ============================================

/**
 * Identify interaction patterns from the conversation
 */
async function identifyPatterns(
  context: FullContext,
  reasoning: ReasoningResult
): Promise<string[]> {
  const patterns: string[] = [];
  
  // Pattern: Quick decision maker (few messages to proposal)
  if (context.funnelState.hasProposal && context.clientProfile.totalMessages < 10) {
    patterns.push('quick_decision_maker');
  }
  
  // Pattern: Objection handler (had objections but continued)
  if (context.clientProfile.objectionHistory.length > 0 && context.funnelState.isQualified) {
    patterns.push('objection_overcomer');
  }
  
  // Pattern: Document prompt (sends docs without being asked multiple times)
  if (context.funnelState.documentsReceived.length > 0 && context.intake.turnNumber < 15) {
    patterns.push('proactive_documenter');
  }
  
  // Pattern: Night owl (interacting late at night)
  const hour = new Date().getHours();
  if (hour >= 22 || hour <= 6) {
    patterns.push('night_owl');
  }
  
  // Pattern: Weekend warrior (active on weekends)
  const day = new Date().getDay();
  if (day === 0 || day === 6) {
    patterns.push('weekend_active');
  }
  
  // Pattern: High value lead (based on bill amount)
  if (context.clientProfile.valorFatura && context.clientProfile.valorFatura > 500) {
    patterns.push('high_value_lead');
  }
  
  // Pattern: Multiple clarifications needed
  const clarificationCount = reasoning.toolCalls.filter(t => t.name === 'request_clarification').length;
  if (clarificationCount >= 2) {
    patterns.push('needs_clarification');
  }
  
  // Pattern: Fast responder (short response times)
  const avgResponseTime = context.clientProfile.responseSpeed;
  if (avgResponseTime === 'fast') {
    patterns.push('fast_responder');
  }
  
  return patterns;
}

/**
 * Save identified patterns to interaction_patterns table
 */
async function savePatterns(
  patterns: string[],
  conversaId: string,
  phone: string
): Promise<{ saved: number; errors: string[] }> {
  if (patterns.length === 0) return { saved: 0, errors: [] };
  
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const errors: string[] = [];
  let saved = 0;
  
  for (const pattern of patterns) {
    try {
      // Upsert pattern - increment occurrence count if exists
      const { data: existing } = await supabase
        .from('interaction_patterns')
        .select('id, occurrence_count')
        .eq('phone', phone)
        .eq('pattern_type', pattern)
        .single();
      
      if (existing) {
        // Update existing pattern
        const { error } = await supabase
          .from('interaction_patterns')
          .update({
            occurrence_count: (existing.occurrence_count || 1) + 1,
            last_seen_at: new Date().toISOString(),
            last_conversa_id: conversaId
          })
          .eq('id', existing.id);
        
        if (error) {
          errors.push(`Failed to update pattern ${pattern}: ${error.message}`);
        } else {
          saved++;
        }
      } else {
        // Insert new pattern
        const { error } = await supabase
          .from('interaction_patterns')
          .insert({
            phone,
            pattern_type: pattern,
            occurrence_count: 1,
            first_seen_at: new Date().toISOString(),
            last_seen_at: new Date().toISOString(),
            last_conversa_id: conversaId
          });
        
        if (error) {
          // May fail if table doesn't exist - log but don't break
          console.warn(`[learning] Pattern table insert failed: ${error.message}`);
        } else {
          saved++;
        }
      }
    } catch (err) {
      // Silently continue if table doesn't exist
      console.warn(`[learning] Pattern save error: ${err}`);
    }
  }
  
  return { saved, errors };
}

// ============================================
// RULE REFINEMENT
// ============================================

/**
 * Refine rules based on conversation outcomes
 */
async function refineRules(
  context: FullContext,
  reasoning: ReasoningResult,
  validation: ValidationResult
): Promise<string[]> {
  const refinements: string[] = [];
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  // Track which rules were applied and their outcomes
  for (const rule of context.activeRules) {
    try {
      // Increment times_applied counter
      await supabase
        .from('rule_memory')
        .update({
          times_applied: (rule.timesApplied || 0) + 1,
          last_applied_at: new Date().toISOString()
        })
        .eq('id', rule.id);
      
      // If validation failed and this rule was involved, reduce confidence
      if (!validation.overallPassed) {
        const newConfidence = Math.max(0.1, (rule.confidence || 1) - 0.1);
        await supabase
          .from('rule_memory')
          .update({ confidence: newConfidence })
          .eq('id', rule.id);
        
        refinements.push(`Rule "${rule.name}" confidence reduced to ${newConfidence.toFixed(2)}`);
      }
    } catch (err) {
      console.warn(`[learning] Rule refinement error for ${rule.id}: ${err}`);
    }
  }
  
  // Learn new rules from successful patterns
  if (validation.overallPassed && reasoning.decision === 'respond') {
    // Check if we should create a new rule from this interaction
    const shouldCreateRule = await analyzeForNewRule(context, reasoning);
    
    if (shouldCreateRule) {
      refinements.push(`New rule candidate identified from interaction`);
    }
  }
  
  return refinements;
}

/**
 * Analyze conversation for potential new rule creation
 */
async function analyzeForNewRule(
  context: FullContext,
  reasoning: ReasoningResult
): Promise<boolean> {
  // Look for repeated successful patterns that could become rules
  
  // Pattern: Same objection handled successfully multiple times
  if (context.clientProfile.objectionHistory.length > 0) {
    const lastObjection = context.clientProfile.objectionHistory[context.clientProfile.objectionHistory.length - 1];
    
    // If this objection has been handled 3+ times successfully, suggest a rule
    const objectionCount = context.clientProfile.objectionHistory.filter(o => o === lastObjection).length;
    if (objectionCount >= 3) {
      return true;
    }
  }
  
  // Pattern: Specific entity extractions always followed by same action
  if (context.intake.entities.length > 0 && reasoning.toolCalls.length > 0) {
    // Could track entity-action correlations
    return false;
  }
  
  return false;
}

// ============================================
// CONVERSATION METRICS UPDATE
// ============================================

/**
 * Update conversation-level metrics
 */
async function updateConversationMetrics(
  context: FullContext,
  reasoning: ReasoningResult
): Promise<void> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  try {
    // Calculate lead score based on conversation quality
    let leadScoreDelta = 0;
    
    // Positive signals
    if (context.intake.sentiment > 0) leadScoreDelta += 5;
    if (context.funnelState.hasSimulation) leadScoreDelta += 10;
    if (context.funnelState.documentsReceived.length > 0) leadScoreDelta += 15;
    if (reasoning.decision === 'respond' && reasoning.decisionConfidence > 0.8) leadScoreDelta += 5;
    
    // Negative signals
    if (context.intake.sentiment < 0) leadScoreDelta -= 5;
    if (context.intake.intent === 'objection') leadScoreDelta -= 3;
    if (reasoning.decision === 'escalate') leadScoreDelta -= 10;
    
    // Get current score and update
    const { data: conversa } = await supabase
      .from('chatbot_conversas')
      .select('lead_score, total_messages')
      .eq('id', context.intake.conversaId)
      .single();
    
    const currentScore = conversa?.lead_score || 50;
    const newScore = Math.max(0, Math.min(100, currentScore + leadScoreDelta));
    
    await supabase
      .from('chatbot_conversas')
      .update({
        lead_score: newScore,
        total_messages: (conversa?.total_messages || 0) + 1,
        last_message_at: new Date().toISOString()
      })
      .eq('id', context.intake.conversaId);
    
  } catch (err) {
    console.warn('[learning] Failed to update conversation metrics:', err);
  }
}

// ============================================
// CROSS-CONVERSATION LEARNING
// ============================================

/**
 * Learn from cross-conversation patterns for this phone number
 */
async function learnFromCrossConversation(
  phone: string,
  context: FullContext
): Promise<void> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  try {
    // Get previous conversations for this phone
    const { data: previousConversas } = await supabase
      .from('chatbot_conversas')
      .select('id, lead_score, sofia_mode, ended_at, event_conversion')
      .eq('cliente_telefone', phone)
      .neq('id', context.intake.conversaId)
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (!previousConversas || previousConversas.length === 0) return;
    
    // Calculate conversion rate and average score
    const convertedCount = previousConversas.filter(c => c.event_conversion).length;
    const avgScore = previousConversas.reduce((sum, c) => sum + (c.lead_score || 0), 0) / previousConversas.length;
    
    // Store as a cross-conversation fact
    await supabase.from('working_memory').upsert({
      conversa_id: context.intake.conversaId,
      memory_type: 'context',
      key: 'cross_conversation_history',
      value: {
        previousConversationCount: previousConversas.length,
        conversionRate: convertedCount / previousConversas.length,
        averageLeadScore: avgScore,
        returningClient: true
      },
      confidence: 1.0,
      source: 'system',
      valid_until: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
      turn_number: context.intake.turnNumber
    }, {
      onConflict: 'conversa_id,key'
    });
    
  } catch (err) {
    console.warn('[learning] Cross-conversation learning error:', err);
  }
}

// ============================================
// MAIN LEARNING EXECUTOR
// ============================================

export async function executeLearning(
  reasoning: ReasoningResult,
  context: FullContext,
  validation: ValidationResult
): Promise<LearningResult> {
  const startTime = Date.now();
  
  console.log(`[learning] Processing ${reasoning.newFacts.length} new facts, ${reasoning.updatedFacts.length} updates`);
  
  // 1. Save new facts
  const { saved: factsSaved, errors: factErrors } = await saveNewFacts(
    reasoning.newFacts,
    context.intake.conversaId,
    context.intake.turnNumber
  );
  
  if (factErrors.length > 0) {
    console.warn('[learning] Fact save errors:', factErrors);
  }
  
  // 2. Update existing facts
  const { updated: factsUpdated, errors: updateErrors } = await updateExistingFacts(
    reasoning.updatedFacts,
    context.intake.conversaId
  );
  
  if (updateErrors.length > 0) {
    console.warn('[learning] Fact update errors:', updateErrors);
  }
  
  // 3. Identify patterns
  const patternsIdentified = await identifyPatterns(context, reasoning);
  
  // 4. Save patterns
  const { saved: patternsSaved } = await savePatterns(
    patternsIdentified,
    context.intake.conversaId,
    context.intake.phone
  );
  
  // 5. Refine rules
  const rulesRefined = await refineRules(context, reasoning, validation);
  
  // 6. Update conversation metrics
  await updateConversationMetrics(context, reasoning);
  
  // 7. Cross-conversation learning
  await learnFromCrossConversation(context.intake.phone, context);
  
  // 8. Update behavioral profile (Sistema 2)
  try {
    await updateProfileAfterInteraction(context);
  } catch (err) {
    console.warn('[learning] Failed to update behavioral profile:', err);
  }
  
  // 9. Execute self-evaluation (Sistema 3) - async to not block
  executeSelfEvaluation(context, reasoning, validation).catch(err => {
    console.warn('[learning] Self-evaluation failed:', err);
  });
  
  const learningDurationMs = Date.now() - startTime;
  
  console.log(`[learning] Completed in ${learningDurationMs}ms: ${factsSaved.length} facts saved, ${patternsSaved} patterns, ${rulesRefined.length} refinements`);
  
  const updates: LearningUpdate = {
    factsSaved,
    factsUpdated,
    patternsIdentified,
    rulesRefined
  };
  
  return {
    updates,
    memoryItemsCreated: factsSaved.length,
    memoryItemsUpdated: factsUpdated.length,
    patternsUpdated: patternsSaved,
    learningDurationMs
  };
}
