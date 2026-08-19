/**
 * SOFIA PIPELINE 2.0 - MAIN ORCHESTRATOR
 * 
 * Pipeline Estrutural de Dados com 7 estágios:
 * 1. INTAKE - Normalização de entrada
 * 1.5. DETERMINISTIC ROUTER - Bypass da LLM para coleta de dados
 * 2. CONTEXT - Carregamento de memória persistente
 * 3. REASONING - Decisão via LLM com Tool Calling
 * 4. ACTION - Execução de ações
 * 5. VALIDATION - Guardrails e validação
 * 6. LEARNING - Persistência de aprendizados
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { 
  PipelineResult, 
  PipelineExecutionLog,
  IntentPayload,
  FullContext,
  ReasoningResult,
  ActionResult,
  ValidationResult,
  LearningResult,
  StageMetrics,
  PipelineError
} from "./types.ts";
import { loadPipelineConfig } from "./config.ts";
import { executeIntake } from "./intake.ts";
import { executeContext } from "./context.ts";
import { executeReasoning } from "./reasoning.ts";
import { executeAction } from "./action.ts";
import { executeValidation } from "./validation.ts";
import { executeLearning } from "./learning.ts";
import { 
  tryDeterministicResponse, 
  loadFSMState, 
  updateFSMState,
  type DeterministicResult 
} from "./deterministic-router.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const PIPELINE_VERSION = "2.0.0";

// Import phone normalization utility
import { normalizePhoneNumber } from "../utils/phone-utils.ts";

/**
 * Executa o pipeline completo para uma mensagem
 * Com lock distribuído para evitar race conditions
 */
export async function executePipeline(
  conversaId: string,
  messageId: string,
  phone: string,
  content: string,
  mediaType: string,
  metadata: Record<string, unknown> = {}
): Promise<PipelineResult> {
  const startTime = Date.now();
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const config = await loadPipelineConfig();
  const agentId = (metadata.agentId as string) || 'sofia';
  
  const executionLog: Partial<PipelineExecutionLog> = {
    id: crypto.randomUUID(),
    conversaId,
    messageId,
    pipelineVersion: PIPELINE_VERSION,
    createdAt: new Date()
  };
  
  // ========================================
  // STAGE 0: ACQUIRE DISTRIBUTED LOCK
  // ========================================
  const instanceId = crypto.randomUUID();
  const normalizedPhone = normalizePhoneNumber(phone);
  
  console.log(`[Pipeline:Lock] Acquiring lock for ${normalizedPhone}`);
  
  const { data: lockAcquired, error: lockError } = await supabase.rpc('acquire_phone_lock', {
    p_phone: normalizedPhone,
    p_agent_id: agentId,
    p_instance_id: instanceId,
    p_lock_duration_seconds: 60
  });
  
  if (lockError || !lockAcquired) {
    console.log(`[Pipeline:Lock] Lock not acquired for ${normalizedPhone}, another instance processing`);
    return createFallbackResult(executionLog, "another_instance_processing");
  }
  
  console.log(`[Pipeline:Lock] ✅ Lock acquired for ${normalizedPhone} (instance: ${instanceId.substring(0, 8)})`);
  
  // Wrap all processing in try/finally to ensure lock release
  try {
    return await executePipelineWithLock(
      supabase,
      config,
      conversaId,
      messageId,
      phone,
      content,
      mediaType,
      metadata,
      executionLog,
      startTime,
      agentId
    );
  } finally {
    // Always release the lock
    console.log(`[Pipeline:Lock] Releasing lock for ${normalizedPhone}`);
    await supabase.rpc('release_phone_lock', {
      p_phone: normalizedPhone,
      p_instance_id: instanceId
    });
  }
}

/**
 * Internal pipeline execution (called after lock acquired)
 */
// deno-lint-ignore no-explicit-any
async function executePipelineWithLock(
  supabase: any,
  config: Awaited<ReturnType<typeof loadPipelineConfig>>,
  conversaId: string,
  messageId: string,
  phone: string,
  content: string,
  mediaType: string,
  metadata: Record<string, unknown>,
  executionLog: Partial<PipelineExecutionLog>,
  startTime: number,
  agentId: string
): Promise<PipelineResult> {
  
  const stageMetrics: StageMetrics[] = [];
  
  try {
    // ========================================
    // STAGE 1: INTAKE (IMPLEMENTED)
    // ========================================
    const intakeStart = Date.now();
    console.log(`[Pipeline:Intake] Starting for ${phone}`);
    
    // Intake Layer - Normaliza entrada em IntentPayload estruturado
    const intake: IntentPayload = await executeIntake(
      conversaId,
      messageId,
      phone,
      content,
      mediaType,
      metadata
    );
    
    executionLog.intake = intake;
    stageMetrics.push({
      stage: 'intake',
      startedAt: new Date(intakeStart),
      completedAt: new Date(),
      durationMs: Date.now() - intakeStart,
      success: true
    });
    
    // ========================================
    // FAST PATH: Check for operator takeover intent
    // ========================================
    
    // Check for operator command fast path
    if (intake.isOperatorCommand) {
      console.log(`[Pipeline] Operator command detected: ${intake.commandType}`);
      
      // Import operator-phase handler
      const { isOperatorCommandMessage } = await import("../sofia-orchestrator/operator-phase.ts");
      
      // Verify it's a valid operator command using rawContent
      if (isOperatorCommandMessage(intake.rawContent || content)) {
        console.log(`[Pipeline] Valid operator command, delegating to legacy handler`);
        // For now, fall back to legacy webhook handler for operator commands
        // The operator-phase requires full context (sendWhatsAppMessage, etc.) that we don't have here
        return createFallbackResult(executionLog, "operator_command");
      }
      
      // Fallback if command not recognized
      return createFallbackResult(executionLog, "operator_command");
    }
    
    // ========================================
    // STAGE 1.5: DETERMINISTIC ROUTER (NEW)
    // ========================================
    const routerStart = Date.now();
    console.log(`[Pipeline:Router] Checking deterministic path for ${conversaId}`);
    
    // Load FSM state
    const fsmState = await loadFSMState(conversaId);
    
    // Try deterministic routing (bypass LLM for data collection)
    const deterministicResult: DeterministicResult = await tryDeterministicResponse(
      intake,
      fsmState,
      agentId
    );
    
    // Add router metrics
    stageMetrics.push({
      stage: 'deterministic_router',
      startedAt: new Date(routerStart),
      completedAt: new Date(),
      durationMs: Date.now() - routerStart,
      success: true
    });
    
    // If router handled it, skip LLM entirely
    if (deterministicResult.handled && deterministicResult.skipLLM) {
      console.log(`[Pipeline:Router] ✅ DETERMINISTIC PATH: ${deterministicResult.routingReason}`);
      
      // Update FSM state
      const { data: conversaData } = await supabase
        .from('chatbot_conversas')
        .select('dados_coletados')
        .eq('id', conversaId)
        .single();
      
      await updateFSMState(
        conversaId, 
        deterministicResult,
        (conversaData?.dados_coletados as Record<string, unknown>) || {}
      );
      
      // Send message directly via Z-API if we have a response
      if (deterministicResult.responseText) {
        const zapiModule = await import("../zapi-client.ts");
        
        // Get Z-API credentials from agent
        const { data: agent } = await supabase
          .from('ai_agents')
          .select('zapi_instance_id, zapi_token, zapi_security_token')
          .eq('agent_id', agentId)
          .single();
        
        if (agent?.zapi_instance_id && agent?.zapi_token) {
          await zapiModule.sendWhatsAppMessage(
            phone,
            deterministicResult.responseText,
            {
              zapi_instance_id: agent.zapi_instance_id,
              zapi_token: agent.zapi_token,
              zapi_security_token: agent.zapi_security_token
            }
          );
          
          // Save Sofia's response to chatbot_mensagens with handler tracking
          console.log(`[Pipeline:Router] Saving deterministic message with handler_type='deterministic'`);
          await supabase.from('chatbot_mensagens').insert({
            conversa_id: conversaId,
            role: 'assistant',
            content: deterministicResult.responseText,
            handler_type: 'deterministic'
          });
          
          // Update conversation timestamps
          await supabase
            .from('chatbot_conversas')
            .update({
              last_message_at: new Date().toISOString(),
              last_sofia_message_at: new Date().toISOString()
            })
            .eq('id', conversaId);
          
          const totalDurationMs = Date.now() - startTime;
          console.log(`[Pipeline] Deterministic response sent in ${totalDurationMs}ms`);
          
          return {
            success: true,
            messageSent: true,
            responseText: deterministicResult.responseText,
            executionLog: {
              ...executionLog,
              totalDurationMs,
              success: true,
              deterministicRouting: {
                handled: true,
                reason: deterministicResult.routingReason,
                skippedLLM: true
              }
            } as PipelineExecutionLog,
            shouldFallbackToLegacy: false
          };
        }
      }
      
      // Handle escalation
      if (deterministicResult.shouldEscalate) {
        console.log(`[Pipeline:Router] Escalation required, triggering fallback`);
        return createFallbackResult(executionLog, "escalation_required");
      }
    }
    
    // ========================================
    // STAGE 2: CONTEXT (IMPLEMENTED)
    // ========================================
    const contextStart = Date.now();
    console.log(`[Pipeline:Context] Loading memory for ${conversaId}`);
    
    // Context Layer - Carrega memórias persistentes e monta contexto completo
    const context: FullContext = await executeContext(intake, agentId);
    
    executionLog.context = {
      workingMemory: context.workingMemory,
      activeRules: context.activeRules,
      ragContext: context.ragContext,
      funnelState: context.funnelState
    };
    stageMetrics.push({
      stage: 'context',
      startedAt: new Date(contextStart),
      completedAt: new Date(),
      durationMs: Date.now() - contextStart,
      success: true
    });
    
    // ========================================
    // STAGE 3: REASONING (IMPLEMENTED)
    // ========================================
    const reasoningStart = Date.now();
    console.log(`[Pipeline:Reasoning] Processing decision`);
    
    // Reasoning Layer - Processa decisão via LLM com Tool Calling
    const reasoning: ReasoningResult = await executeReasoning(context, 'sofia');
    
    executionLog.reasoning = reasoning;
    stageMetrics.push({
      stage: 'reasoning',
      startedAt: new Date(reasoningStart),
      completedAt: new Date(),
      durationMs: Date.now() - reasoningStart,
      success: true
    });
    
    // ========================================
    // STAGE 4: ACTION
    // ========================================
    const actionStart = Date.now();
    console.log(`[Pipeline:Action] Executing ${reasoning.toolCalls.length} tool calls`);
    
    // Action Layer - Executa tool calls e ações concretas
    const action: ActionResult = await executeAction(reasoning, context);
    
    executionLog.action = action;
    stageMetrics.push({
      stage: 'action',
      startedAt: new Date(actionStart),
      completedAt: new Date(),
      durationMs: Date.now() - actionStart,
      success: action.failedActions.length === 0
    });
    
    // ========================================
    // STAGE 5: VALIDATION
    // ========================================
    const validationStart = Date.now();
    console.log(`[Pipeline:Validation] Running guardrails`);
    
    // Validation Layer - Verifica guardrails e aplica correções
    const validation: ValidationResult = await executeValidation(
      reasoning,
      context,
      action
    );
    
    executionLog.validation = validation;
    stageMetrics.push({
      stage: 'validation',
      startedAt: new Date(validationStart),
      completedAt: new Date(),
      durationMs: Date.now() - validationStart,
      success: validation.overallPassed
    });
    
    // Handle validation failure
    if (!validation.overallPassed) {
      console.log(`[Pipeline:Validation] BLOCKED: ${validation.blockedReason}`);
      
      if (validation.escalationRequired) {
        // Trigger escalation via notification service
        const { notifyHumanAgent } = await import("../notification-service.ts");
        await notifyHumanAgent({
          conversaId: intake.conversaId,
          reason: validation.blockedReason || 'Guardrail triggered',
          priority: 'medium',
          clienteNome: context.clientProfile?.name,
          clienteTelefone: intake.phone,
          currentStage: context.funnelState?.stage
        }, supabase);
        console.log(`[Pipeline:Validation] Escalation notification sent`);
      }
      
      return {
        success: false,
        messageSent: false,
        executionLog: executionLog as PipelineExecutionLog,
        shouldFallbackToLegacy: true,
        fallbackReason: validation.blockedReason
      };
    }
    
    // ========================================
    // STAGE 6: LEARNING
    // ========================================
    const learningStart = Date.now();
    
    if (config.learningEnabled) {
      console.log(`[Pipeline:Learning] Persisting ${reasoning.newFacts.length} facts`);
      
      // Learning Layer - Persiste fatos, identifica padrões e refina regras
      const learning: LearningResult = await executeLearning(
        reasoning,
        context,
        validation
      );
      
      executionLog.learning = learning;
      stageMetrics.push({
        stage: 'learning',
        startedAt: new Date(learningStart),
        completedAt: new Date(),
        durationMs: Date.now() - learningStart,
        success: true
      });
    }
    
    // ========================================
    // FINALIZE
    // ========================================
    const totalDurationMs = Date.now() - startTime;
    
    // Log execution
    await logPipelineExecution(supabase, {
      ...executionLog,
      totalDurationMs,
      success: true
    } as PipelineExecutionLog);
    
    console.log(`[Pipeline] Completed in ${totalDurationMs}ms`);
    
    return {
      success: true,
      messageSent: action.messageSent,
      messageId: action.messageId,
      responseText: validation.modifiedResponse || reasoning.responseText,
      executionLog: {
        ...executionLog,
        totalDurationMs,
        success: true
      } as PipelineExecutionLog,
      shouldFallbackToLegacy: false
    };
    
  } catch (error) {
    const pipelineError = error as PipelineError;
    console.error(`[Pipeline] Error in stage ${pipelineError.stage || 'unknown'}:`, error);
    
    // Log error
    await logPipelineExecution(supabase, {
      ...executionLog,
      totalDurationMs: Date.now() - startTime,
      success: false,
      errorMessage: pipelineError.message || String(error),
      errorStage: pipelineError.stage
    } as PipelineExecutionLog);
    
    return {
      success: false,
      messageSent: false,
      executionLog: executionLog as PipelineExecutionLog,
      shouldFallbackToLegacy: true,
      fallbackReason: `Pipeline error: ${pipelineError.message || String(error)}`
    };
  }
}

// ============================================
// STAGE IMPLEMENTATIONS - ALL COMPLETE
// ============================================

// Phase 1: executeIntake from ./intake.ts - Normalização de entrada
// Phase 2: executeContext from ./context.ts - Carregamento de memória
// Phase 3: executeReasoning from ./reasoning.ts - Decisão via LLM
// Phase 4a: executeAction from ./action.ts - Execução de tool calls
// Phase 4b: executeValidation from ./validation.ts - Guardrails
// Phase 5: executeLearning from ./learning.ts - Persistência de aprendizados

// ============================================
// HELPERS
// ============================================

function createFallbackResult(
  executionLog: Partial<PipelineExecutionLog>,
  reason: string
): PipelineResult {
  return {
    success: false,
    messageSent: false,
    executionLog: executionLog as PipelineExecutionLog,
    shouldFallbackToLegacy: true,
    fallbackReason: reason
  };
}

// deno-lint-ignore no-explicit-any
async function logPipelineExecution(
  supabase: any,
  log: PipelineExecutionLog
): Promise<void> {
  try {
    const insertData = {
      id: log.id,
      conversa_id: log.conversaId,
      message_id: log.messageId,
      pipeline_version: log.pipelineVersion,
      
      intake_duration_ms: log.intake?.intakeDurationMs ?? null,
      intake_result: log.intake ? {
        intent: log.intake.intent,
        entities: log.intake.entities.length,
        sentiment: log.intake.sentiment
      } : null,
      
      context_duration_ms: log.context?.contextDurationMs ?? null,
      context_memory_count: log.context?.memoryItemsLoaded ?? null,
      context_rules_count: log.context?.rulesLoaded ?? null,
      
      reasoning_duration_ms: log.reasoning?.reasoningDurationMs ?? null,
      reasoning_model: log.reasoning?.modelUsed ?? null,
      reasoning_tokens_in: log.reasoning?.tokensIn ?? null,
      reasoning_tokens_out: log.reasoning?.tokensOut ?? null,
      reasoning_tool_calls: log.reasoning?.toolCalls ?? null,
      
      action_duration_ms: log.action?.actionDurationMs ?? null,
      actions_executed: log.action?.executedActions ?? null,
      
      validation_duration_ms: log.validation?.validationDurationMs ?? null,
      validation_passed: log.validation?.overallPassed ?? null,
      validation_blocks: log.validation?.checks.filter(c => !c.passed) ?? null,
      
      learning_duration_ms: log.learning?.learningDurationMs ?? null,
      facts_saved: log.learning?.memoryItemsCreated ?? null,
      patterns_updated: log.learning?.patternsUpdated ?? null,
      
      total_duration_ms: log.totalDurationMs,
      success: log.success,
      error_message: log.errorMessage ?? null
    };
    
    // Using any to bypass strict typing for dynamic table
    await (supabase as any).from("pipeline_execution_log").insert(insertData);
  } catch (err) {
    console.error("[Pipeline] Failed to log execution:", err);
  }
}

// Export types for use in other modules
export * from "./types.ts";

// Export config functions (including unified config loaders)
export { 
  loadPipelineConfig, 
  shouldUsePipelineV2,
  loadUnifiedPipelineConfig,
  getLLMConfigForAgent,
  getPipelineConfigForAgent,
  isAgentQuietHours,
  clearConfigCache,
} from "./config.ts";

// Export new enhancement systems
export { captureOperatorFeedback, handleCorrectionCommand, parseCorrectionCommand, captureTakeoverFeedback } from "./operator-feedback.ts";
export { detectBehavioralProfile, loadPersistedProfile, buildProfilePromptBlock, updateProfileAfterInteraction } from "./behavioral-profile.ts";
export { executeSelfEvaluation, getPendingReviews, markAsReviewed, getEvaluationStats } from "./self-evaluation.ts";

// Export deterministic router
export { tryDeterministicResponse, loadFSMState, updateFSMState, setExpectedField } from "./deterministic-router.ts";
