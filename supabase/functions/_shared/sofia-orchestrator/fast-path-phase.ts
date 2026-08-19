/**
 * FAST-PATH PHASE - SOFIA ORCHESTRATOR
 * 
 * Extracted from sofia-webhook/index.ts (Refactoring Phase)
 * Handles: Fast-paths, document collection flow, confirmation handlers, audio preference
 * 
 * @module _shared/sofia-orchestrator/fast-path-phase
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.90.0';

// Fast-path handlers
import { processAllFastPaths, type FastPathContext, type FastPathResult } from '../fast-path-handlers.ts';

// Document collection flow
import {
  processDocumentCollectionFlow, handleTipoInstalacaoResponse,
  type DocumentCollectionParams, type DocumentCollectionResult, type TipoInstalacaoResult,
} from '../document-collection-flow.ts';

// Confirmation handlers
import { processAllConfirmations, type ConfirmationContext, type ConfirmationResult } from '../confirmation-handlers.ts';

// Audio preference
import {
  processAudioPreference, getSofiaAudioSettings,
  type AudioPreferenceContext, type AudioPreferenceResult, type SofiaAudioSettings,
} from '../audio-handler.ts';

// CRM pre-check types
import { type CRMLeadContext } from '../crm-precheck.ts';

// Data extraction types
import { type ExtractedClientData } from '../data-extraction.ts';

// Detection patterns
import { type PatternEntry } from '../detection-patterns.ts';

// AI Gym config
import { type FullAgentConfig } from '../ai-gym-config.ts';

// CORS headers
import { corsHeaders } from '../webhook-types.ts';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface FastPathConversaData {
  id: string;
  bitrix24_stage?: string | null;
  bitrix24_lead_id?: string | null;
  proposta_id?: string | null;
  contrato_enviado_at?: string | null;
  sofia_mode?: string | null;
  arquivos_anexados?: string[] | null;
  docs_received_whatsapp?: string[] | null;
  docs_received_page?: string[] | null;
  dados_coletados?: Record<string, unknown> | null;
  audio_oferecido?: boolean | null;
  cliente_aceita_audio?: boolean | null;
}

export interface MediaAnalysisData {
  analysis?: string;
  base64Data?: string;
  mimeType?: string;
  isInvoice?: boolean;
}

export interface FastPathPhaseContext {
  supabase: SupabaseClient;
  conversaId: string;
  phone: string;
  clienteNome: string | null;
  messageText: string;
  agentId: string;
  
  // Conversation data
  conversa: FastPathConversaData | null;
  existingDados: ExtractedClientData;
  extractedData: ExtractedClientData;
  
  // Media flags
  isTranscribedAudio: boolean;
  isAnalyzedImage: boolean;
  isAnalyzedDocument: boolean;
  mediaAnalysisResult: MediaAnalysisData | null;
  
  // Total messages
  totalMessages: number;
  
  // CRM context
  crmContext?: CRMLeadContext;
  
  // Agent config
  agentConfig: FullAgentConfig | null;
  
  // Detection patterns
  detectionPatterns: Map<string, PatternEntry>;
  
  // Functions
  sendWhatsAppMessage: (phone: string, message: string) => Promise<void>;
  sendVoiceMessage: (phone: string, text: string) => Promise<boolean>;
}

export interface FastPathPhaseResult {
  // Early return handling
  handled: boolean;
  response?: Response;
  status?: string;
  
  // Updated extracted data
  extractedData: ExtractedClientData;
  
  // Audio settings and preferences
  audioSettings: SofiaAudioSettings;
  clienteAceitaAudio: boolean | null;
  audioPreferenceJustSet: boolean;
  handleDirectAudioRequest: boolean;
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Should execute this phase
// ═══════════════════════════════════════════════════════════════

export function shouldExecuteFastPathPhase(): boolean {
  // Always execute if we reach this phase
  return true;
}

// ═══════════════════════════════════════════════════════════════
// MAIN FUNCTION
// ═══════════════════════════════════════════════════════════════

export async function executeFastPathPhase(
  ctx: FastPathPhaseContext
): Promise<FastPathPhaseResult> {
  const {
    supabase, conversaId, phone, clienteNome, messageText, agentId,
    conversa, existingDados, extractedData,
    isTranscribedAudio, isAnalyzedImage, isAnalyzedDocument, mediaAnalysisResult,
    totalMessages, crmContext, agentConfig, detectionPatterns,
    sendWhatsAppMessage, sendVoiceMessage,
  } = ctx;
  
  console.log(`[FAST_PATH_PHASE] Starting for conversa: ${conversaId}`);
  
  // Initialize mutable extracted data
  let updatedExtractedData = { ...extractedData };
  
  // ═══════════════════════════════════════════════════════════════
  // 1. DOCUMENT COLLECTION FLOW
  // ═══════════════════════════════════════════════════════════════
  if ((isAnalyzedImage || isAnalyzedDocument) && mediaAnalysisResult) {
    const docFlowResult = await processDocumentCollectionFlow({
      supabase,
      conversaId,
      phone,
      clienteNome,
      messageText,
      mediaAnalysisResult: {
        analysis: mediaAnalysisResult.analysis || '',
        base64Data: mediaAnalysisResult.base64Data || '',
        mimeType: isAnalyzedDocument ? 'application/pdf' : 'image/jpeg',
        isInvoice: mediaAnalysisResult.isInvoice || false,
      },
      existingDados,
      extractedData: updatedExtractedData,
      conversa: conversa ? {
        id: conversaId,
        bitrix24_stage: conversa.bitrix24_stage as string | undefined,
        bitrix24_lead_id: conversa.bitrix24_lead_id as string | undefined,
        proposta_id: conversa.proposta_id as string | undefined,
        contrato_enviado_at: conversa.contrato_enviado_at as string | undefined,
        sofia_mode: conversa.sofia_mode as string | undefined,
        arquivos_anexados: conversa.arquivos_anexados as string[] | undefined,
        docs_received_whatsapp: conversa.docs_received_whatsapp,
        docs_received_page: conversa.docs_received_page,
        dados_coletados: conversa.dados_coletados,
      } : null,
      sendMessage: sendWhatsAppMessage,
      agentConfig: agentConfig ? { name: agentConfig.name } : undefined,
      totalMessages,
    });
    
    if (docFlowResult.handled) {
      console.log(`[FAST_PATH_PHASE] Document flow handled: ${docFlowResult.status}`);
      
      return {
        handled: true,
        response: new Response(JSON.stringify({
          status: docFlowResult.status === 'waiting_tipo_instalacao' ? 'waiting_tipo_instalacao' :
                  docFlowResult.status === 'lead_moved' ? 'document_collected' : 'document_collected',
          conversaId,
          documentType: docFlowResult.documentType,
          documentsComplete: docFlowResult.documentsComplete,
          remaining: docFlowResult.missingDocuments,
          divergencesFound: docFlowResult.divergencesFound,
          tipoInstalacao: docFlowResult.tipoInstalacao,
          leadMoved: docFlowResult.leadMoved,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }),
        status: docFlowResult.status,
        extractedData: updatedExtractedData,
        audioSettings: await getSofiaAudioSettings(supabase),
        clienteAceitaAudio: null,
        audioPreferenceJustSet: false,
        handleDirectAudioRequest: false,
      };
    }
  }
  
  // ═══════════════════════════════════════════════════════════════
  // 2. FAST-PATH HANDLERS
  // ═══════════════════════════════════════════════════════════════
  const fastPathCtx: FastPathContext = {
    supabase,
    conversaId,
    phone,
    clienteNome,
    messageText,
    existingDados,
    extractedData: updatedExtractedData,
    conversa,
    totalMessages,
    sendMessage: sendWhatsAppMessage,
    isAnalyzedImage,
    isAnalyzedDocument,
    isTranscribedAudio,
    crmContext,
    agentConfig,
  };
  
  const fastPathResult = await processAllFastPaths(fastPathCtx);
  
  if (fastPathResult.handled) {
    console.log(`[FAST_PATH_PHASE] Fast-path handled: ${fastPathResult.status}`);
    
    return {
      handled: true,
      response: new Response(JSON.stringify({
        status: fastPathResult.status,
        ...fastPathResult.response,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }),
      status: fastPathResult.status,
      extractedData: updatedExtractedData,
      audioSettings: await getSofiaAudioSettings(supabase),
      clienteAceitaAudio: null,
      audioPreferenceJustSet: false,
      handleDirectAudioRequest: false,
    };
  }
  
  // ═══════════════════════════════════════════════════════════════
  // 3. TIPO DE INSTALAÇÃO RESPONSE
  // ═══════════════════════════════════════════════════════════════
  if ((existingDados as Record<string, unknown>).aguardandoTipoInstalacao) {
    console.log(`[FAST_PATH_PHASE] Processing tipoInstalacao response`);
    
    const tipoResult = await handleTipoInstalacaoResponse(
      supabase,
      conversaId,
      phone,
      clienteNome,
      messageText,
      existingDados,
      conversa,
      sendWhatsAppMessage,
      agentConfig ? { name: agentConfig.name } : undefined,
      totalMessages
    );
    
    if (tipoResult.handled) {
      if (tipoResult.detected) {
        return {
          handled: true,
          response: new Response(JSON.stringify({
            status: 'tipo_instalacao_processed',
            conversaId,
            tipoInstalacao: tipoResult.tipoInstalacao,
            leadMoved: tipoResult.leadMoved,
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }),
          status: 'tipo_instalacao_processed',
          extractedData: updatedExtractedData,
          audioSettings: await getSofiaAudioSettings(supabase),
          clienteAceitaAudio: null,
          audioPreferenceJustSet: false,
          handleDirectAudioRequest: false,
        };
      } else {
        // Re-asked client
        console.log(`[FAST_PATH_PHASE] Re-asked for tipoInstalacao`);
        return {
          handled: true,
          response: new Response(JSON.stringify({
            status: 'tipo_instalacao_reask',
            conversaId,
            message: 'Re-asked client for installation type',
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }),
          status: 'tipo_instalacao_reask',
          extractedData: updatedExtractedData,
          audioSettings: await getSofiaAudioSettings(supabase),
          clienteAceitaAudio: null,
          audioPreferenceJustSet: false,
          handleDirectAudioRequest: false,
        };
      }
    }
  }
  
  // ═══════════════════════════════════════════════════════════════
  // 4. AUDIO PREFERENCE HANDLING
  // ═══════════════════════════════════════════════════════════════
  const audioSettings = await getSofiaAudioSettings(supabase);
  
  const audioPrefCtx: AudioPreferenceContext = {
    supabase,
    conversaId,
    phone,
    messageText,
    conversa,
    detectionPatterns,
    sendWhatsAppMessage,
    sendVoiceMessage,
  };
  
  const audioPrefResult = await processAudioPreference(audioPrefCtx);
  
  if (audioPrefResult.handled && audioPrefResult.response) {
    console.log(`[FAST_PATH_PHASE] Audio preference handled`);
    
    return {
      handled: true,
      response: new Response(JSON.stringify(audioPrefResult.response), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }),
      status: 'audio_preference_handled',
      extractedData: updatedExtractedData,
      audioSettings,
      clienteAceitaAudio: audioPrefResult.clienteAceitaAudio,
      audioPreferenceJustSet: audioPrefResult.audioPreferenceJustSet,
      handleDirectAudioRequest: audioPrefResult.handleDirectAudioRequest,
    };
  }
  
  // ═══════════════════════════════════════════════════════════════
  // 5. CONFIRMATION HANDLERS
  // ═══════════════════════════════════════════════════════════════
  const confirmationCtx: ConfirmationContext = {
    supabase,
    conversaId,
    phone,
    clienteNome,
    messageText,
    existingDados,
    extractedData: updatedExtractedData,
    conversa,
    sendWhatsAppMessage,
  };
  
  const confirmationResult = await processAllConfirmations(confirmationCtx);
  
  if (confirmationResult.earlyReturn && confirmationResult.response) {
    console.log(`[FAST_PATH_PHASE] Confirmation handled`);
    
    return {
      handled: true,
      response: new Response(JSON.stringify(confirmationResult.response), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }),
      status: 'confirmation_handled',
      extractedData: confirmationResult.updatedExtractedData 
        ? { ...updatedExtractedData, ...confirmationResult.updatedExtractedData }
        : updatedExtractedData,
      audioSettings,
      clienteAceitaAudio: audioPrefResult.clienteAceitaAudio,
      audioPreferenceJustSet: audioPrefResult.audioPreferenceJustSet,
      handleDirectAudioRequest: audioPrefResult.handleDirectAudioRequest,
    };
  }
  
  // Apply confirmation updates
  if (confirmationResult.updatedExtractedData) {
    Object.assign(updatedExtractedData, confirmationResult.updatedExtractedData);
  }
  
  // ═══════════════════════════════════════════════════════════════
  // 6. RETURN - NOT HANDLED
  // ═══════════════════════════════════════════════════════════════
  console.log(`[FAST_PATH_PHASE] No fast-path handled, continuing to next phase`);
  
  return {
    handled: false,
    extractedData: updatedExtractedData,
    audioSettings,
    clienteAceitaAudio: audioPrefResult.clienteAceitaAudio,
    audioPreferenceJustSet: audioPrefResult.audioPreferenceJustSet,
    handleDirectAudioRequest: audioPrefResult.handleDirectAudioRequest,
  };
}
