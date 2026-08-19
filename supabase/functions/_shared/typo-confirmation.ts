/**
 * Typo Confirmation Handler Module
 * Centralized typo confirmation/rejection logic for distribuidora detection
 * Extracted from sofia-webhook/index.ts for reuse and cleaner code
 * 
 * Phase 6: Now uses detection patterns from database (zero hardcode)
 */

import {
  validarDistribuidoraFromCache,
  isForbiddenTypo,
  type DistribuidoraCache,
  type DistribuidoraValidation,
} from './distribuidora-handler.ts';

import {
  matchesPatternCategory,
  type PatternEntry,
} from './detection-patterns.ts';

import {
  getTypoSuggestionMessage,
  getTypoRejectionMessage,
} from './message-templates.ts';

// MESSAGE BUS - Unified persistence layer
import { publishAssistantMessage } from './message-bus.ts';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface TypoConfirmationResult {
  handled: boolean;
  action: 'confirmed' | 'rejected' | 'pending' | 'blocked' | 'skipped';
  extractedDataUpdates?: Record<string, any>;
  message?: string;
  shouldReturn?: boolean;
  responseData?: {
    success: boolean;
    message: string;
    typoDetected?: string;
    suggested?: string;
  };
}

export interface TypoConfirmationContext {
  messageText: string;
  conversaId: string;
  phone: string;
  existingDados: Record<string, any>;
  extractedData: Record<string, any>;
  distribuidoraCache: DistribuidoraCache | null;
}

export interface TypoLogEntry {
  conversa_id: string;
  cliente_telefone: string;
  typo_detectado: string;
  sugestao: string;
  confirmado: boolean | null;
  contexto_mensagem?: string;
  distribuidora_final?: string | null;
}

// ═══════════════════════════════════════════════════════════════
// CONFIRMATION DETECTION (from database patterns)
// ═══════════════════════════════════════════════════════════════

/**
 * Check if message confirms the typo suggestion
 * Uses database patterns (typo_confirmation category)
 */
export function isTypoConfirmed(
  message: string, 
  suggestedDist: string,
  patterns?: Map<string, PatternEntry>
): boolean {
  const lowerMessage = message.toLowerCase().trim();
  
  // Check if message contains the suggested distributor name
  if (lowerMessage.includes(suggestedDist.toLowerCase())) {
    return true;
  }
  
  // Check confirmation patterns from database
  return matchesPatternCategory(message, 'typo_confirmation', patterns);
}

/**
 * Check if message rejects the typo suggestion
 * Uses database patterns (typo_rejection category)
 */
export function isTypoRejected(
  message: string,
  patterns?: Map<string, PatternEntry>
): boolean {
  return matchesPatternCategory(message, 'typo_rejection', patterns);
}

// ═══════════════════════════════════════════════════════════════
// TYPO LOG DATABASE OPERATIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Log a new typo detection for analytics
 */
export async function logTypoForAnalytics(
  supabaseClient: any,
  entry: TypoLogEntry
): Promise<void> {
  try {
    await supabaseClient.from('distribuidora_typos_log').insert({
      conversa_id: entry.conversa_id,
      cliente_telefone: entry.cliente_telefone,
      typo_detectado: entry.typo_detectado,
      sugestao: entry.sugestao,
      confirmado: entry.confirmado,
      contexto_mensagem: entry.contexto_mensagem?.substring(0, 500),
    });
    console.log(`[TYPO_CONFIRM] Logged typo for analytics: "${entry.typo_detectado}" → "${entry.sugestao}"`);
  } catch (error) {
    console.error('[TYPO_CONFIRM] Error logging typo:', error);
  }
}

/**
 * Update typo log with confirmation result
 */
export async function updateTypoLogConfirmation(
  supabaseClient: any,
  conversaId: string,
  sugestao: string,
  confirmed: boolean,
  distribuidoraFinal?: string | null
): Promise<void> {
  try {
    await supabaseClient
      .from('distribuidora_typos_log')
      .update({ 
        confirmado: confirmed,
        distribuidora_final: distribuidoraFinal || null
      })
      .eq('conversa_id', conversaId)
      .eq('sugestao', sugestao)
      .is('confirmado', null);
    
    console.log(`[TYPO_CONFIRM] Typo log updated: confirmed=${confirmed}, final=${distribuidoraFinal || 'null'}`);
  } catch (error) {
    console.error('[TYPO_CONFIRM] Error updating typo log:', error);
  }
}

// ═══════════════════════════════════════════════════════════════
// MAIN CONFIRMATION HANDLERS
// ═══════════════════════════════════════════════════════════════

/**
 * Handle user's confirmation or rejection of a typo suggestion
 * Returns updates to extractedData and optional response message
 */
export async function handleTypoConfirmationResponse(
  supabaseClient: any,
  ctx: TypoConfirmationContext,
  validarDistribuidora: (dist: string) => DistribuidoraValidation
): Promise<TypoConfirmationResult> {
  const { existingDados, extractedData, messageText, conversaId } = ctx;
  
  // Check if we're waiting for typo confirmation
  if (!existingDados.aguardandoConfirmacaoTypo || !existingDados.distribuidoraTypoSugerida) {
    return { handled: false, action: 'skipped' };
  }
  
  const suggestedDist = existingDados.distribuidoraTypoSugerida;
  const isConfirmed = isTypoConfirmed(messageText, suggestedDist);
  const isRejected = isTypoRejected(messageText);
  
  if (isConfirmed) {
    // User confirmed the typo suggestion
    const validation = validarDistribuidora(suggestedDist);
    
    // Update typo log
    await updateTypoLogConfirmation(
      supabaseClient, 
      conversaId, 
      suggestedDist, 
      true, 
      validation.normalizada || suggestedDist
    );
    
    const updates: Record<string, any> = {
      aguardandoConfirmacaoTypo: false,
      distribuidoraTypoDetectado: undefined,
      distribuidoraTypoSugerida: undefined,
    };
    
    if (validation.atendida) {
      updates.distribuidora = validation.normalizada;
      console.log(`[TYPO_CONFIRM] User confirmed typo: ${suggestedDist} → ${validation.normalizada}`);
    } else if (validation.needsClarification) {
      updates.distribuidoraInformada = suggestedDist;
      updates.distribuidoraClarificacao = true;
      console.log(`[TYPO_CONFIRM] Typo confirmed but needs clarification: ${suggestedDist}`);
    } else {
      updates.distribuidoraInformada = suggestedDist;
      updates.distribuidoraNaoAtendida = true;
      console.log(`[TYPO_CONFIRM] Typo confirmed but distributor not attended: ${suggestedDist}`);
    }
    
    return {
      handled: true,
      action: 'confirmed',
      extractedDataUpdates: updates,
    };
  }
  
  if (isRejected) {
    // User rejected the typo suggestion
    await updateTypoLogConfirmation(
      supabaseClient, 
      conversaId, 
      suggestedDist, 
      false, 
      null
    );
    
    // Get message from database templates
    const clarifyMessage = getTypoRejectionMessage();
    
    return {
      handled: true,
      action: 'rejected',
      extractedDataUpdates: {
        aguardandoConfirmacaoTypo: false,
        distribuidoraTypoDetectado: undefined,
        distribuidoraTypoSugerida: undefined,
      },
      message: clarifyMessage,
      shouldReturn: true,
      responseData: {
        success: true,
        message: 'Typo rejected, asking again',
      },
    };
  }
  
  // Neither confirmed nor rejected - let AI handle
  return { handled: false, action: 'pending' };
}

/**
 * Handle initial typo detection - send suggestion message and log
 * Returns true if a typo suggestion was sent (should return early)
 */
export async function handleTypoDetection(
  supabaseClient: any,
  ctx: TypoConfirmationContext
): Promise<TypoConfirmationResult> {
  const { extractedData, conversaId, phone, messageText } = ctx;
  
  // Check if a typo was detected
  if (!extractedData.aguardandoConfirmacaoTypo || 
      !extractedData.distribuidoraTypoSugerida || 
      !extractedData.distribuidoraTypoDetectado) {
    return { handled: false, action: 'skipped' };
  }
  
  const typoDetected = extractedData.distribuidoraTypoDetectado;
  const suggested = extractedData.distribuidoraTypoSugerida;
  
  // CRITICAL: Check if this typo is forbidden
  if (isForbiddenTypo(typoDetected)) {
    console.log(`[TYPO_CONFIRM] BLOCKED forbidden typo: "${typoDetected}" → Would suggest "${suggested}" but skipping`);
    
    return {
      handled: true,
      action: 'blocked',
      extractedDataUpdates: {
        aguardandoConfirmacaoTypo: false,
        distribuidoraTypoDetectado: undefined,
        distribuidoraTypoSugerida: undefined,
      },
    };
  }
  
  // Log typo for analytics
  await logTypoForAnalytics(supabaseClient, {
    conversa_id: conversaId,
    cliente_telefone: phone,
    typo_detectado: typoDetected,
    sugestao: suggested,
    confirmado: null,
    contexto_mensagem: messageText,
  });
  
  // Get message from database templates
  const suggestionMessage = getTypoSuggestionMessage(typoDetected, suggested);
  
  console.log(`[TYPO_CONFIRM] Sending typo suggestion: "${typoDetected}" → "${suggested}"`);
  
  return {
    handled: true,
    action: 'pending',
    message: suggestionMessage,
    shouldReturn: true,
    responseData: {
      success: true,
      message: 'Typo suggestion sent, waiting confirmation',
      typoDetected,
      suggested,
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// ORCHESTRATED TYPO FLOW - Handles both confirmation and detection
// ═══════════════════════════════════════════════════════════════

export interface TypoFlowContext {
  supabase: any;
  conversaId: string;
  phone: string;
  messageText: string;
  existingDados: Record<string, any>;
  extractedData: Record<string, any>;
  distribuidoraCache: DistribuidoraCache | null;
  validarDistribuidora: (dist: string) => DistribuidoraValidation;
  sendMessage: (phone: string, message: string) => Promise<void>;
  corsHeaders: Record<string, string>;
}

export interface TypoFlowResult {
  handled: boolean;
  response?: Response;
  extractedDataUpdates?: Record<string, any>;
}

/**
 * Orchestrate the full typo confirmation/detection flow
 * Handles DB updates, message sending, and response generation
 * Reduces ~80 lines of repetitive code in the main webhook
 */
export async function orchestrateTypoFlow(ctx: TypoFlowContext): Promise<TypoFlowResult> {
  const {
    supabase,
    conversaId,
    phone,
    messageText,
    existingDados,
    extractedData,
    distribuidoraCache,
    validarDistribuidora,
    sendMessage,
    corsHeaders,
  } = ctx;

  // Step 1: Check for confirmation response
  const typoConfirmationCtx: TypoConfirmationContext = {
    messageText,
    conversaId,
    phone,
    existingDados,
    extractedData,
    distribuidoraCache,
  };
  
  const confirmResult = await handleTypoConfirmationResponse(
    supabase, 
    typoConfirmationCtx, 
    validarDistribuidora
  );
  
  if (confirmResult.handled) {
    if (confirmResult.extractedDataUpdates) {
      Object.assign(extractedData, confirmResult.extractedDataUpdates);
    }
    
    if (confirmResult.shouldReturn && confirmResult.message) {
      await sendMessage(phone, confirmResult.message);
      
      // Use Message Bus for unified persistence
      await publishAssistantMessage(supabase, conversaId, confirmResult.message, 'typo_correction');
      
      // Update dados_coletados (Message Bus handles timestamps)
      await supabase
        .from('chatbot_conversas')
        .update({
          dados_coletados: { ...existingDados, ...extractedData },
        })
        .eq('id', conversaId);
      
      return {
        handled: true,
        response: new Response(JSON.stringify(confirmResult.responseData), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }),
        extractedDataUpdates: confirmResult.extractedDataUpdates,
      };
    }
    
    // Handled but no return needed - just apply updates
    return {
      handled: false,
      extractedDataUpdates: confirmResult.extractedDataUpdates,
    };
  }
  
  // Step 2: Check for new typo detection
  const detectionCtx: TypoConfirmationContext = {
    ...typoConfirmationCtx,
    extractedData, // Use updated extractedData
  };
  
  const detectionResult = await handleTypoDetection(supabase, detectionCtx);
  
  if (detectionResult.handled) {
    if (detectionResult.extractedDataUpdates) {
      Object.assign(extractedData, detectionResult.extractedDataUpdates);
    }
    
    if (detectionResult.shouldReturn && detectionResult.message) {
      await sendMessage(phone, detectionResult.message);
      
      // Use Message Bus for unified persistence
      await publishAssistantMessage(supabase, conversaId, detectionResult.message, 'typo_correction');
      
      // Update dados_coletados (Message Bus handles timestamps)
      await supabase
        .from('chatbot_conversas')
        .update({
          dados_coletados: { ...existingDados, ...extractedData },
        })
        .eq('id', conversaId);
      
      console.log(`[TYPO_FLOW] Typo handling complete: ${detectionResult.action}`);
      
      return {
        handled: true,
        response: new Response(JSON.stringify(detectionResult.responseData), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }),
        extractedDataUpdates: detectionResult.extractedDataUpdates,
      };
    }
    
    // Handled (e.g., blocked) but no message needed
    return {
      handled: false,
      extractedDataUpdates: detectionResult.extractedDataUpdates,
    };
  }
  
  return { handled: false };
}

// ═══════════════════════════════════════════════════════════════
// CONTEXTUAL AI ANALYSIS INTEGRATION
// ═══════════════════════════════════════════════════════════════

export interface ContextAnalysisResult {
  shouldProceed: boolean;
  extractedDataUpdates?: Record<string, any>;
  action: 'cleared' | 'auto_accepted' | 'validated' | 'needs_clarification' | 'not_attended' | 'pending';
}

/**
 * Process AI context analysis result and update extracted data
 */
export function processContextAnalysisResult(
  contextAnalysis: {
    detected: boolean;
    distribuidora: string | null;
    confidence: number;
    isTypo: boolean;
    suggestedCorrection: string | null;
    context: 'distributor_mention' | 'generic_energy' | 'company_name' | 'product' | 'unknown';
    reasoning: string;
  } | null,
  extractedData: Record<string, any>,
  validarDistribuidora: (dist: string) => DistribuidoraValidation
): ContextAnalysisResult {
  if (!contextAnalysis) {
    return { shouldProceed: true, action: 'pending' };
  }
  
  // If AI says it's generic energy context with high confidence, IGNORE the typo detection
  if (contextAnalysis.context === 'generic_energy' && contextAnalysis.confidence >= 70) {
    console.log(`[TYPO_CONFIRM] AI overrides: generic energy context (${contextAnalysis.confidence}%). Reason: ${contextAnalysis.reasoning}`);
    
    return {
      shouldProceed: true,
      action: 'cleared',
      extractedDataUpdates: {
        aguardandoConfirmacaoTypo: undefined,
        distribuidoraTypoDetectado: undefined,
        distribuidoraTypoSugerida: undefined,
      },
    };
  }
  
  // If AI confirms it's a distributor mention with typo
  if (contextAnalysis.detected && contextAnalysis.isTypo && contextAnalysis.confidence >= 70) {
    console.log(`[TYPO_CONFIRM] AI confirms typo: "${extractedData.distribuidoraTypoDetectado}" → "${contextAnalysis.suggestedCorrection || contextAnalysis.distribuidora}" (${contextAnalysis.confidence}%)`);
    
    // If confidence is very high (>90%), auto-accept without asking
    if (contextAnalysis.confidence >= 90 && contextAnalysis.distribuidora) {
      console.log(`[TYPO_CONFIRM] Very high confidence - auto-accepting: ${contextAnalysis.distribuidora}`);
      return {
        shouldProceed: true,
        action: 'auto_accepted',
        extractedDataUpdates: {
          distribuidora: contextAnalysis.distribuidora,
          aguardandoConfirmacaoTypo: undefined,
          distribuidoraTypoDetectado: undefined,
          distribuidoraTypoSugerida: undefined,
        },
      };
    }
    // Otherwise keep the confirmation flow
  }
  
  // If AI detects a distributor without typo (exact match)
  if (contextAnalysis.detected && !contextAnalysis.isTypo && contextAnalysis.distribuidora && contextAnalysis.confidence >= 70) {
    console.log(`[TYPO_CONFIRM] AI detected exact distributor: ${contextAnalysis.distribuidora} (${contextAnalysis.confidence}%)`);
    
    const validation = validarDistribuidora(contextAnalysis.distribuidora);
    const updates: Record<string, any> = {
      aguardandoConfirmacaoTypo: undefined,
      distribuidoraTypoDetectado: undefined,
      distribuidoraTypoSugerida: undefined,
    };
    
    if (validation.atendida) {
      updates.distribuidora = validation.normalizada;
      return { shouldProceed: true, action: 'validated', extractedDataUpdates: updates };
    } else if (validation.needsClarification) {
      updates.distribuidoraInformada = contextAnalysis.distribuidora;
      updates.distribuidoraClarificacao = true;
      return { shouldProceed: true, action: 'needs_clarification', extractedDataUpdates: updates };
    } else {
      updates.distribuidoraInformada = contextAnalysis.distribuidora;
      updates.distribuidoraNaoAtendida = true;
      return { shouldProceed: true, action: 'not_attended', extractedDataUpdates: updates };
    }
  }
  
  return { shouldProceed: true, action: 'pending' };
}
