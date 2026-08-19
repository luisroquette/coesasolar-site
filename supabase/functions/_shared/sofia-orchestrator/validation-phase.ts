/**
 * VALIDATION PHASE - SOFIA ORCHESTRATOR
 * 
 * Extracted from sofia-webhook/index.ts (Refactoring Phase)
 * Handles: Distributor validation, typo flow, disqualification flow
 * 
 * @module _shared/sofia-orchestrator/validation-phase
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.90.0';

// Distributor validation
import {
  handleDistributorValidationFlow, handleDistributorClarificationResponse,
  type DistribuidoraCache, type DistribuidoraValidation,
  type DistributorValidationContext,
} from '../distribuidora-handler.ts';

// Typo confirmation flow
import {
  orchestrateTypoFlow,
  type TypoFlowContext,
} from '../typo-confirmation.ts';

// Disqualification flow
import {
  handleDisqualificationFlow,
} from '../disqualification-flow.ts';

// Data extraction types
import { type ExtractedClientData } from '../data-extraction.ts';

// Detection patterns
import { type PatternEntry } from '../detection-patterns.ts';

// CORS headers
import { corsHeaders } from '../webhook-types.ts';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface ValidationConversaData {
  id: string;
  bitrix24_lead_id?: string | null;
  sofia_mode?: string | null;
  ended_at?: string | null;
}

export interface ValidationPhaseContext {
  supabase: SupabaseClient;
  conversaId: string;
  phone: string;
  clienteNome: string | null;
  messageText: string;
  agentId: string;
  agentName: string;
  
  // Conversation data
  conversa: ValidationConversaData | null;
  existingDados: ExtractedClientData;
  extractedData: ExtractedClientData;
  
  // Distributor cache
  distribuidoraCache: DistribuidoraCache | null;
  validarDistribuidora: (dist: string) => DistribuidoraValidation;
  
  // Detection patterns
  detectionPatterns: Map<string, PatternEntry>;
  
  // Media context — audio transcription guard
  isTranscribedAudio?: boolean;
  
  // Functions
  sendWhatsAppMessage: (phone: string, message: string) => Promise<void>;
}

export interface ValidationPhaseResult {
  // Early return handling
  handled: boolean;
  response?: Response;
  status?: string;
  
  // Updated extracted data
  extractedData: ExtractedClientData;
  
  // Validation results
  distributorValidated: boolean;
  distributorRejected: boolean;
  typoDetected: boolean;
  disqualified: boolean;
  disqualificationReason?: string;
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Should execute this phase
// ═══════════════════════════════════════════════════════════════

export function shouldExecuteValidationPhase(): boolean {
  return true;
}

// ═══════════════════════════════════════════════════════════════
// MAIN FUNCTION
// ═══════════════════════════════════════════════════════════════

export async function executeValidationPhase(
  ctx: ValidationPhaseContext
): Promise<ValidationPhaseResult> {
  const {
    supabase, conversaId, phone, clienteNome, messageText, agentName,
    conversa, existingDados, extractedData,
    distribuidoraCache, validarDistribuidora,
    detectionPatterns, sendWhatsAppMessage,
  } = ctx;
  
  console.log(`[VALIDATION_PHASE] Starting for conversa: ${conversaId}`);
  
  let updatedExtractedData = { ...extractedData };
  
  // ═══════════════════════════════════════════════════════════════
  // 1. DISTRIBUTOR CLARIFICATION RESPONSE
  // ═══════════════════════════════════════════════════════════════
  const distributorValidationCtx: DistributorValidationContext = {
    supabase,
    conversaId,
    phone,
    messageText,
    existingDados,
    extractedData: updatedExtractedData,
    conversa: conversa ? {
      bitrix24_lead_id: conversa.bitrix24_lead_id || null,
      sofia_mode: conversa.sofia_mode || null,
      ended_at: conversa.ended_at || null,
    } : null,
    sendMessage: sendWhatsAppMessage,
    validarDistribuidora,
  };
  
  const clarificationResult = await handleDistributorClarificationResponse(distributorValidationCtx);
  
  if (clarificationResult.handled) {
    if (clarificationResult.extractedDataUpdates) {
      Object.assign(updatedExtractedData, clarificationResult.extractedDataUpdates);
    }
    
    if (clarificationResult.response) {
      console.log(`[VALIDATION_PHASE] Distributor clarification handled`);
      
      return {
        handled: true,
        response: new Response(JSON.stringify(clarificationResult.response), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }),
        status: 'distributor_clarification_handled',
        extractedData: updatedExtractedData,
        distributorValidated: false,
        distributorRejected: false,
        typoDetected: false,
        disqualified: false,
      };
    }
  }
  
  // ═══════════════════════════════════════════════════════════════
  // 2. DISTRIBUTOR VALIDATION FLOW
  // ═══════════════════════════════════════════════════════════════
  const distributorValidationResult = await handleDistributorValidationFlow(distributorValidationCtx);
  
  if (distributorValidationResult.handled) {
    if (distributorValidationResult.response) {
      console.log(`[VALIDATION_PHASE] Distributor validation handled`);
      
      return {
        handled: true,
        response: new Response(JSON.stringify(distributorValidationResult.response), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }),
        status: 'distributor_validation_handled',
        extractedData: updatedExtractedData,
        distributorValidated: false,
        distributorRejected: false,
        typoDetected: false,
        disqualified: false,
      };
    }
  }
  
  if (distributorValidationResult.extractedDataUpdates) {
    Object.assign(updatedExtractedData, distributorValidationResult.extractedDataUpdates);
  }
  
  // ═══════════════════════════════════════════════════════════════
  // 3. DISQUALIFICATION FLOW
  // ═══════════════════════════════════════════════════════════════
  const disqualificationResult = await handleDisqualificationFlow({
    supabase,
    conversaId,
    phone,
    clienteNome,
    messageText,
    existingDados,
    extractedData: updatedExtractedData,
    conversa: conversa ? {
      bitrix24_lead_id: conversa.bitrix24_lead_id || null,
      sofia_mode: conversa.sofia_mode || null,
    } : null,
    detectionPatterns,
    sendMessage: sendWhatsAppMessage,
    agentName,
  });
  
  if (disqualificationResult.handled) {
    console.log(`[VALIDATION_PHASE] Lead disqualified: ${disqualificationResult.reason}`);
    
    return {
      handled: true,
      response: new Response(JSON.stringify({
        success: true,
        message: `Lead disqualified: ${disqualificationResult.reason}`,
        reason: disqualificationResult.reason,
        bitrixUpdated: disqualificationResult.bitrixUpdated,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }),
      status: 'disqualified',
      extractedData: updatedExtractedData,
      distributorValidated: false,
      distributorRejected: false,
      typoDetected: false,
      disqualified: true,
      disqualificationReason: disqualificationResult.reason || undefined,
    };
  }
  
  // ═══════════════════════════════════════════════════════════════
  // 4. TYPO FLOW
  // ═══════════════════════════════════════════════════════════════
  const typoFlowCtx: TypoFlowContext = {
    supabase,
    conversaId,
    phone,
    messageText,
    existingDados,
    extractedData: updatedExtractedData,
    distribuidoraCache,
    validarDistribuidora,
    sendMessage: sendWhatsAppMessage,
    corsHeaders,
  };
  
  const typoFlowResult = await orchestrateTypoFlow(typoFlowCtx);
  
  if (typoFlowResult.handled && typoFlowResult.response) {
    console.log(`[VALIDATION_PHASE] Typo flow handled`);
    
    return {
      handled: true,
      response: typoFlowResult.response,
      status: 'typo_flow_handled',
      extractedData: typoFlowResult.extractedDataUpdates
        ? { ...updatedExtractedData, ...typoFlowResult.extractedDataUpdates }
        : updatedExtractedData,
      distributorValidated: false,
      distributorRejected: false,
      typoDetected: true,
      disqualified: false,
    };
  }
  
  if (typoFlowResult.extractedDataUpdates) {
    Object.assign(updatedExtractedData, typoFlowResult.extractedDataUpdates);
  }
  
  // ═══════════════════════════════════════════════════════════════
  // 5. RETURN - NOT HANDLED
  // ═══════════════════════════════════════════════════════════════
  console.log(`[VALIDATION_PHASE] Validation complete, no blocking issues`);
  
  return {
    handled: false,
    extractedData: updatedExtractedData,
    distributorValidated: !!updatedExtractedData.distribuidora,
    distributorRejected: false,
    typoDetected: false,
    disqualified: false,
  };
}
