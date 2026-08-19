/**
 * SOFIA ORCHESTRATOR - DATA COLLECTION PHASE
 * 
 * Extracted from sofia-webhook/index.ts
 * Handles data extraction and persistence:
 * - HYBRID INTELLIGENT EXTRACTION: LLM extracts data, regex validates
 * - Text data extraction (email, CPF, CNPJ, valor, distribuidora, etc.)
 * - Multiple units/bills support (e.g., "3 contas de 150" = R$ 450)
 * - Contextual AI analysis for distributor typos
 * - Media analysis parsing (invoice data)
 * - Numeric value inference
 * - Critical field persistence
 * - Eligibility check for minimum bill value
 * 
 * FSM check remains in webhook (executed after Hard Stops)
 * 
 * @module _shared/sofia-orchestrator/data-collection-phase
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.90.0';
import {
  extractDataFromText,
  parseInvoiceAnalysis,
  type ExtractedClientData,
} from '../data-extraction.ts';
import {
  extractDataWithLLM,
  messageContainsExtractableData,
} from '../llm-data-extractor.ts';
import {
  persistCriticalFields,
  logSpecialDetections,
  resetPauseFollowupIfNeeded,
  inferValueFromNumericMessage,
  type CriticalPersistenceResult,
} from '../data-persistence.ts';
import {
  analyzeDistribuidoraContext,
  type DistribuidoraValidation,
} from '../distribuidora-handler.ts';
import {
  processContextAnalysisResult,
} from '../typo-confirmation.ts';
import {
  hasMinimumDataForProposal,
} from '../funnel-stage.ts';
import {
  syncToBitrix,
} from '../bitrix-sync.ts';
import {
  checkMinimumBillEligibility,
  type MinimumBillCheckResult,
} from '../eligibility-check.ts';
import {
  checkAndTriggerBigAccountAlert,
} from '../big-account-detection.ts';

// ═══════════════════════════════════════════════════════════════
// GENERIC DISTRIBUIDORA CHECK
// ═══════════════════════════════════════════════════════════════

/**
 * Check if distribuidora is generic and needs clarification
 * "ENERGISA" alone is generic, "ENERGISA MG" is specific
 */
function isGenericUnclarifiedDistribuidora(dist: string | undefined | null): boolean {
  if (!dist) return true;
  
  const normalized = dist.toUpperCase().trim();
  
  // Distribuidoras genéricas que precisam de clarificação
  const generics = ['ENERGISA', 'NEOENERGIA', 'CPFL'];
  
  // "ENERGISA MG" é específica, "ENERGISA" sozinha é genérica
  return generics.some(g => 
    normalized === g || 
    (normalized.startsWith(g) && normalized.split(/\s+/).length === 1)
  );
}

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface DataCollectionConversaData {
  id: string;
  cliente_email?: string | null;
  cliente_nome?: string | null;
  dados_coletados?: Record<string, unknown> | null;
  sofia_mode?: string | null;
  bitrix24_stage?: string | null;
  proposta_id?: string | null;
  proposta_link_sent_at?: string | null;
  event_proposal_sent?: boolean | null;
  all_docs_complete_at?: string | null;
  contrato_enviado_at?: string | null;
  contrato_assinado_at?: string | null;
}

export interface MediaAnalysisResult {
  analysis: string;
  base64Data?: string;
  mimeType?: string;
  isInvoice?: boolean;
}

export interface DataCollectionPhaseContext {
  supabase: SupabaseClient;
  conversaId: string;
  phone: string;
  clienteNome: string | null;
  messageText: string;
  messageId: string | null;
  agentId: string;
  conversa: DataCollectionConversaData | null;
  existingDados: ExtractedClientData;
  mediaAnalysisResult?: MediaAnalysisResult | null;
  isAnalyzedImage: boolean;
  isAnalyzedDocument: boolean;
  isTranscribedAudio: boolean;
  lovableApiKey?: string;
  sendWhatsAppMessage: (phone: string, msg: string) => Promise<boolean | void>;
  validarDistribuidora: (dist: string) => DistribuidoraValidation;
  bitrix24LeadId?: string | null;
}

export interface DataCollectionPhaseResult {
  handled: boolean;
  response?: Response;
  extractedData: ExtractedClientData;
  mergedData: ExtractedClientData;
  persistenceResult: CriticalPersistenceResult;
  proposalReadinessTriggered?: boolean;
}

// ═══════════════════════════════════════════════════════════════
// SHOULD EXECUTE CHECK
// ═══════════════════════════════════════════════════════════════

export function shouldExecuteDataCollectionPhase(conversaId: string | null): boolean {
  return !!conversaId;
}

// ═══════════════════════════════════════════════════════════════
// MAIN EXECUTOR
// ═══════════════════════════════════════════════════════════════

export async function executeDataCollectionPhase(
  ctx: DataCollectionPhaseContext
): Promise<DataCollectionPhaseResult> {
  const {
    supabase,
    conversaId,
    clienteNome,
    messageText,
    conversa,
    existingDados,
    mediaAnalysisResult,
    lovableApiKey,
    validarDistribuidora,
    bitrix24LeadId,
  } = ctx;

  // ═══════════════════════════════════════════════════════════════
  // STEP 1: HYBRID INTELLIGENT EXTRACTION
  // Uses LLM for semantic understanding + Regex for validation
  // This allows understanding context like "3 contas, duas de 150 e uma de 400" = R$ 700
  // ═══════════════════════════════════════════════════════════════
  let extractedData: ExtractedClientData = {};
  
  const shouldUseLLM = lovableApiKey && messageContainsExtractableData(messageText);
  
  if (shouldUseLLM) {
    console.log(`[DATA_COLLECTION_PHASE] 🧠 Using HYBRID LLM extraction for: "${messageText.substring(0, 50)}..."`);
    
    const llmResult = await extractDataWithLLM(
      messageText,
      lovableApiKey,
      existingDados,
      { supabase, agentId: ctx.agentId, conversaId }
    );
    
    if (llmResult.success) {
      extractedData = llmResult.data;
      console.log(`[DATA_COLLECTION_PHASE] ✅ LLM extraction successful (${llmResult.tokensUsed || '?'} tokens)`);
      console.log(`[DATA_COLLECTION_PHASE] Validation notes: ${llmResult.validationNotes.join(', ')}`);
    } else {
      // Fallback to regex-only extraction
      console.log(`[DATA_COLLECTION_PHASE] ⚠️ LLM extraction failed, falling back to regex`);
      extractedData = extractDataFromText(messageText, existingDados);
    }
  } else {
    // Simple messages: use fast regex extraction
    console.log(`[DATA_COLLECTION_PHASE] ⚡ Using fast regex extraction for: "${messageText.substring(0, 50)}..."`);
    extractedData = extractDataFromText(messageText, existingDados);
  }
  
  console.log(`[DATA_COLLECTION_PHASE] Extracted: valorFatura=${extractedData.valorFatura}, distribuidora=${extractedData.distribuidora}, email=${extractedData.email}, isMultipleUnits=${extractedData.isMultipleUnits || false}`);

  // STEP 2: Reset pause followup if client returned
  resetPauseFollowupIfNeeded(existingDados, extractedData);

  // STEP 3: Log special detections
  logSpecialDetections({ extractedData, existingDados });

  // STEP 4: Contextual AI analysis for distributor typos
  if (extractedData.aguardandoConfirmacaoTypo || extractedData.distribuidoraTypoDetectado) {
    console.log(`[DATA_COLLECTION_PHASE] Distributor typo detected: "${extractedData.distribuidoraTypoDetectado}" → "${extractedData.distribuidoraTypoSugerida}". Running contextual analysis...`);
    
    const contextAnalysis = await analyzeDistribuidoraContext(messageText, lovableApiKey || '');
    const analysisResult = processContextAnalysisResult(contextAnalysis, extractedData, validarDistribuidora);
    
    if (analysisResult.extractedDataUpdates) {
      Object.assign(extractedData, analysisResult.extractedDataUpdates);
    }
  }

  // STEP 5: Parse media analysis (invoice data)
  if (mediaAnalysisResult) {
    const mediaData = parseInvoiceAnalysis(mediaAnalysisResult.analysis);
    extractedData = { ...extractedData, ...mediaData };
    console.log(`[DATA_COLLECTION_PHASE] Parsed media analysis, merged invoice data`);
  }

  // STEP 6: Infer value from numeric-only message
  // CRITICAL FIX: Build merged data BEFORE inference to check if value already exists
  let mergedForPersist = { ...existingDados, ...extractedData };
  
  // Only infer if no value exists in merged data
  if (!mergedForPersist.valorFatura && !mergedForPersist.consumo) {
    const inferredValue = inferValueFromNumericMessage(messageText, mergedForPersist);
    if (inferredValue.valorFatura) {
      mergedForPersist.valorFatura = inferredValue.valorFatura;
      extractedData.valorFatura = inferredValue.valorFatura;
      console.log(`[DATA_COLLECTION_PHASE] Inferred valorFatura: R$ ${inferredValue.valorFatura}`);
    }
  } else {
    console.log(`[DATA_COLLECTION_PHASE] Value already exists: valorFatura=${mergedForPersist.valorFatura}, consumo=${mergedForPersist.consumo}`);
  }

  // ═══════════════════════════════════════════════════════════════
  // STEP 6.5: BIG ACCOUNT DETECTION (async, non-blocking)
  // Triggers WhatsApp alert to Luis & Eric for accounts >= R$ 3.000
  // ═══════════════════════════════════════════════════════════════
  const finalValorFatura = mergedForPersist.valorFatura || extractedData.valorFatura;
  if (finalValorFatura && finalValorFatura >= 3000 && conversa) {
    console.log(`[DATA_COLLECTION_PHASE] 💰 Big account candidate detected: R$ ${finalValorFatura}`);
    
    // Non-blocking: fire and forget
    checkAndTriggerBigAccountAlert(
      supabase,
      finalValorFatura,
      {
        id: conversaId,
        cliente_nome: clienteNome || conversa.cliente_nome,
        cliente_telefone: ctx.phone,
      },
      mergedForPersist as Record<string, unknown>
    ).catch(err => console.error(`[DATA_COLLECTION_PHASE] [BIG_ACCOUNT] Alert failed:`, err));
  }

  // STEP 7: Persist critical fields immediately
  const persistenceResult = await persistCriticalFields({
    supabase,
    conversaId,
    existingDados,
    extractedData,
    clienteNome,
    conversa: conversa ? {
      cliente_email: conversa.cliente_email,
      cliente_nome: conversa.cliente_nome,
    } : null,
  });

  const mergedData = persistenceResult.mergedData;

  // ═══════════════════════════════════════════════════════════════
  // STEP 8: PROPOSAL READINESS SYNC (Deterministic trigger)
  // If minimum data is now complete AND we have a Bitrix lead,
  // IMMEDIATELY sync to Bitrix AND set pending_task as backup
  // ═══════════════════════════════════════════════════════════════
  let proposalReadinessTriggered = false;
  
  // CRITICAL FIX: Use clienteNome as fallback for nome when checking proposal readiness
  // This ensures leads with WhatsApp-provided names are not blocked from advancing
  const hasMinimum = hasMinimumDataForProposal(mergedData as any, clienteNome);
  const leadId = bitrix24LeadId || conversa?.bitrix24_stage ? 'has_stage' : null;
  const alreadyHasProposal = !!conversa?.proposta_id;
  const alreadySentLink = !!conversa?.proposta_link_sent_at;
  const isDescartado = conversa?.sofia_mode === 'descartado';
  
  // Check if we just completed minimum data (wasn't complete before)
  const wasCompleteBeforeExtraction = hasMinimumDataForProposal(existingDados as any, clienteNome);
  const justCompletedMinimum = hasMinimum && !wasCompleteBeforeExtraction;
  
  // Log detailed minimum data check for debugging
  console.log(`[DATA_COLLECTION_PHASE] 📊 Minimum data check: hasMinimum=${hasMinimum}, wasComplete=${wasCompleteBeforeExtraction}, justCompleted=${justCompletedMinimum}`);
  console.log(`[DATA_COLLECTION_PHASE] 📊 Data state: nome=${mergedData.nome || clienteNome || 'MISSING'}, email=${mergedData.email || 'MISSING'}, dist=${mergedData.distribuidora || 'MISSING'}, valor=${mergedData.valorFatura || mergedData.consumo || 'MISSING'}`);
  
  if (hasMinimum && !alreadyHasProposal && !alreadySentLink && !isDescartado) {
    console.log(`[DATA_COLLECTION_PHASE] 🎯 PROPOSAL READINESS: Minimum data complete!`);
    console.log(`[DATA_COLLECTION_PHASE] Data: nome=${mergedData.nome}, email=${mergedData.email}, dist=${mergedData.distribuidora}, valor=${mergedData.valorFatura || mergedData.consumo}`);
    
    // ═══════════════════════════════════════════════════════════════
    // PHASE 5 "CASO EDSON": Track proposal generation start time
    // ═══════════════════════════════════════════════════════════════
    const proposalGenerationStartedAt = (mergedData as any).proposal_generation_started_at;
    const proposalRescueAttempts = (mergedData as any).proposal_rescue_attempts || 0;
    
    if (!proposalGenerationStartedAt) {
      (mergedData as any).proposal_generation_started_at = new Date().toISOString();
      console.log(`[DATA_COLLECTION_PHASE] [PROPOSAL_RESCUE] 📍 Marking proposal generation start time`);
    }
    
    // ═══════════════════════════════════════════════════════════════
    // CRITICAL FIX: Immediately sync to Bitrix when data is complete
    // This ensures email and valor are pushed to CRM immediately
    // ═══════════════════════════════════════════════════════════════
    try {
      console.log(`[DATA_COLLECTION_PHASE] 🚀 Calling syncToBitrix immediately with complete data...`);
      const syncResult = await syncToBitrix(
        supabase,
        conversaId,
        ctx.phone,
        clienteNome || mergedData.nome || 'Cliente',
        mergedData,
        undefined, // arquivoNovo
        true       // forcarMovimentacao = true when data is complete
      );
      console.log(`[DATA_COLLECTION_PHASE] ✅ syncToBitrix result: success=${syncResult.success}, stage=${syncResult.newStage}, error=${syncResult.error || 'none'}`);
      
      if (syncResult.success) {
        proposalReadinessTriggered = true;
        
        // ═══════════════════════════════════════════════════════════════
        // PHASE 4 "CASO EDSON": Stage Verification Post-Sync
        // Verify the lead actually moved to PROPOSTA_INICIAL
        // If not, create admin_notification for visibility
        // ═══════════════════════════════════════════════════════════════
        const targetStage = 'UC_9SLRPP'; // PROPOSTA_INICIAL
        const actualStage = syncResult.newStage;
        
        if (actualStage && actualStage !== targetStage && actualStage !== 'Proposta Inicial') {
          console.log(`[DATA_COLLECTION_PHASE] [STAGE_VERIFY] ⚠️ Stage mismatch: expected=${targetStage}, got=${actualStage}`);
          
          // Create admin notification for stage mismatch
          await supabase.from('admin_notifications').insert({
            title: '⚠️ Lead Stage Mismatch',
            message: `Lead "${mergedData.nome || clienteNome || 'Cliente'}" tem dados completos mas estágio=${actualStage} (esperado: PROPOSTA_INICIAL). Telefone: ${ctx.phone}`,
            type: 'stage_mismatch',
            entity_type: 'chatbot_conversa',
            entity_id: conversaId,
          });
        } else {
          console.log(`[DATA_COLLECTION_PHASE] [STAGE_VERIFY] ✅ Stage correctly set to PROPOSTA_INICIAL`);
        }
      } else {
        // Sync failed - create admin notification
        console.error(`[DATA_COLLECTION_PHASE] ❌ syncToBitrix failed: ${syncResult.error}`);
        await supabase.from('admin_notifications').insert({
          title: '❌ Bitrix Sync Failed',
          message: `Lead "${mergedData.nome || clienteNome}" com dados completos falhou ao sincronizar: ${syncResult.error}. Telefone: ${ctx.phone}`,
          type: 'sync_failure',
          entity_type: 'chatbot_conversa',
          entity_id: conversaId,
        });
      }
    } catch (syncError) {
      console.error(`[DATA_COLLECTION_PHASE] ❌ syncToBitrix exception:`, syncError);
      
      // Create admin notification for sync exception
      await supabase.from('admin_notifications').insert({
        title: '❌ Bitrix Sync Exception',
        message: `Exceção ao sincronizar lead "${mergedData.nome || clienteNome}": ${syncError instanceof Error ? syncError.message : 'Unknown error'}. Telefone: ${ctx.phone}`,
        type: 'sync_exception',
        entity_type: 'chatbot_conversa',
        entity_id: conversaId,
      });
      // Continue anyway - pending_task will handle retry
    }
    
    // Set pending_task as backup to ensure proposal flow happens
    await supabase
      .from('chatbot_conversas')
      .update({
        pending_task: 'proposta_inicial',
        pending_task_created_at: new Date().toISOString(),
        pending_task_retries: 0,
      })
      .eq('id', conversaId)
      .is('pending_task', null); // Only set if not already set
    
    // Create admin notification for observability (only on first completion)
    if (justCompletedMinimum) {
      await supabase.from('admin_notifications').insert({
        title: '🎯 Dados mínimos completos',
        message: `Lead ${mergedData.nome || 'Cliente'} completou os dados mínimos para proposta. syncToBitrix executado, pending_task='proposta_inicial' armado.`,
        type: 'proposal_readiness',
        entity_type: 'chatbot_conversa',
        entity_id: conversaId,
      });
      console.log(`[DATA_COLLECTION_PHASE] ✅ Admin notification created for proposal readiness`);
    }
    
    // ═══════════════════════════════════════════════════════════════
    // PHASE 5 "CASO EDSON": PROPOSAL RESCUE LOGIC
    // If proposal_id is still missing after sync, schedule rescue
    // ═══════════════════════════════════════════════════════════════
    const currentPropostaId = conversa?.proposta_id || (mergedData as any).proposta_id;
    
    if (!currentPropostaId && proposalGenerationStartedAt) {
      const startTime = new Date(proposalGenerationStartedAt).getTime();
      const elapsedSeconds = (Date.now() - startTime) / 1000;
      
      console.log(`[DATA_COLLECTION_PHASE] [PROPOSAL_RESCUE] ⏱️ Proposal generation started ${elapsedSeconds.toFixed(0)}s ago, proposal_id still missing`);
      
      // If more than 2 minutes have passed, attempt rescue
      if (elapsedSeconds > 120 && proposalRescueAttempts < 3) {
        console.log(`[DATA_COLLECTION_PHASE] [PROPOSAL_RESCUE] 🔄 Attempting rescue (attempt ${proposalRescueAttempts + 1}/3)...`);
        
        // Update rescue attempts counter
        (mergedData as any).proposal_rescue_attempts = proposalRescueAttempts + 1;
        
        // Re-invoke sync to force proposal generation
        try {
          const rescueResult = await syncToBitrix(
            supabase,
            conversaId,
            ctx.phone,
            clienteNome || mergedData.nome || 'Cliente',
            mergedData,
            undefined,
            true // forcarMovimentacao
          );
          
          if (rescueResult.success) {
            console.log(`[DATA_COLLECTION_PHASE] [PROPOSAL_RESCUE] ✅ Rescue sync successful`);
          } else {
            console.log(`[DATA_COLLECTION_PHASE] [PROPOSAL_RESCUE] ⚠️ Rescue sync failed: ${rescueResult.error}`);
          }
        } catch (rescueError) {
          console.error(`[DATA_COLLECTION_PHASE] [PROPOSAL_RESCUE] ❌ Rescue exception:`, rescueError);
        }
        
        // Create admin notification if rescue is happening
        await supabase.from('admin_notifications').insert({
          title: '🔄 Proposal Rescue Triggered',
          message: `Lead "${mergedData.nome || clienteNome}" - proposta não gerada após ${Math.round(elapsedSeconds)}s. Tentativa ${proposalRescueAttempts + 1}/3. Telefone: ${ctx.phone}`,
          type: 'proposal_rescue',
          entity_type: 'chatbot_conversa',
          entity_id: conversaId,
        });
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // STEP 9: ELIGIBILITY CHECK (minimum bill value)
  // If below minimum AND haven't asked about other accounts yet, ask first
  // ═══════════════════════════════════════════════════════════════
  const hasValor = !!(mergedData.valorFatura || mergedData.consumo);
  
  if (hasValor && !(mergedData as any).already_asked_multiple_units) {
    console.log(`[DATA_COLLECTION_PHASE] 📊 Step 9: Eligibility check...`);
    
    const eligibilityCheck = await checkMinimumBillEligibility(
      supabase,
      mergedData.valorFatura || 0,
      mergedData as any
    );
    
    console.log(`[DATA_COLLECTION_PHASE] 📊 Eligibility: isEligible=${eligibilityCheck.isEligible}, belowMinimum=${eligibilityCheck.isBelowMinimum}`);
    
    // If below minimum and need to ask about multiple accounts
    if (eligibilityCheck.shouldAskMultipleUnits && eligibilityCheck.askMultipleUnitsMessage) {
      console.log(`[DATA_COLLECTION_PHASE] ⚠️ Below minimum - asking about other accounts`);
      
      try {
        await ctx.sendWhatsAppMessage(ctx.phone, eligibilityCheck.askMultipleUnitsMessage);
        console.log(`[DATA_COLLECTION_PHASE] ✅ Multiple units question sent`);
        
        // Persist flag in dados_coletados
        const updatedFlags = {
          awaiting_multiple_units_response: true,
          already_asked_multiple_units: true,
          asked_multiple_units_at: new Date().toISOString(),
          below_minimum_value: mergedData.valorFatura,
          minimum_threshold: eligibilityCheck.minimumThreshold,
        };
        
        await supabase
          .from('chatbot_conversas')
          .update({
            dados_coletados: { ...(mergedData as any), ...updatedFlags },
          })
          .eq('id', conversaId);
        
        // Create admin notification for observability
        await supabase.from('admin_notifications').insert({
          title: '⚠️ Lead abaixo do mínimo - perguntando outras contas',
          message: `Cliente ${clienteNome || ctx.phone} informou R$ ${mergedData.valorFatura} (mínimo: R$ ${eligibilityCheck.minimumThreshold}). Perguntando sobre outras unidades.`,
          type: 'below_minimum_asked_multiple',
          entity_type: 'chatbot_conversa',
          entity_id: conversaId,
        });
        
        // Update mergedData to reflect new state
        (mergedData as any).awaiting_multiple_units_response = true;
        (mergedData as any).already_asked_multiple_units = true;
        
      } catch (err) {
        console.error(`[DATA_COLLECTION_PHASE] ❌ Failed to send multiple units question:`, err);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // STEP 10: FINAL PERSISTENCE OF FLAGS
  // Persist proposal_generation_started_at, proposal_rescue_attempts
  // ═══════════════════════════════════════════════════════════════
  const phase5Flags: Record<string, unknown> = {};
  
  if ((mergedData as any).proposal_generation_started_at) {
    phase5Flags.proposal_generation_started_at = (mergedData as any).proposal_generation_started_at;
  }
  if ((mergedData as any).proposal_rescue_attempts) {
    phase5Flags.proposal_rescue_attempts = (mergedData as any).proposal_rescue_attempts;
  }
  
  if (Object.keys(phase5Flags).length > 0) {
    console.log(`[DATA_COLLECTION_PHASE] [PHASE5] Persisting flags:`, phase5Flags);
    
    // Fetch current dados_coletados to merge
    const { data: currentConversa } = await supabase
      .from('chatbot_conversas')
      .select('dados_coletados')
      .eq('id', conversaId)
      .single();
    
    const currentDados = (currentConversa?.dados_coletados as Record<string, unknown>) || {};
    const updatedDados = { ...currentDados, ...phase5Flags };
    
    await supabase
      .from('chatbot_conversas')
      .update({ dados_coletados: updatedDados })
      .eq('id', conversaId);
    
    console.log(`[DATA_COLLECTION_PHASE] [PHASE5] ✅ Flags persisted to dados_coletados`);
  }

  return {
    handled: false,
    extractedData,
    mergedData,
    persistenceResult,
    proposalReadinessTriggered,
  };
}
