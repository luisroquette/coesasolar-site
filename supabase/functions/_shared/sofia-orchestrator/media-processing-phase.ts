/**
 * MEDIA PROCESSING PHASE
 * 
 * Handles media message processing - audio transcription, image analysis,
 * PDF analysis, and text processing.
 * Extracted from sofia-webhook/index.ts lines 700-743
 * 
 * @module _shared/sofia-orchestrator/media-processing-phase
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.90.0';
import { corsHeaders } from '../webhook-types.ts';
import {
  processMediaMessage,
  type MediaProcessingResult,
  type SofiaCapabilities as MediaSofiaCapabilities,
} from '../media-message-processor.ts';
import { getSofiaCapabilities } from '../audio-handler.ts';
import { getMediaCapabilityMessage, getDelayIntentAcknowledgment, getTemplateCache } from '../message-templates.ts';
import { type MessageData } from '../webhook-types.ts';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface MediaProcessingContext {
  supabase: SupabaseClient;
  msgData: MessageData;
  phone: string;
  clienteNome: string | null;
  agentId: string;
  sendWhatsAppMessage: (phone: string, message: string) => Promise<void>;
}

export interface MediaProcessingPhaseResult {
  handled: boolean;
  response?: Response;
  messageText: string | null;
  isTranscribedAudio: boolean;
  isAnalyzedImage: boolean;
  isAnalyzedDocument: boolean;
  detectedInvoice: boolean;
  mediaAnalysisResult: {
    analysis?: string;
    base64Data?: string;
    mimeType?: string;
    isInvoice?: boolean;
  } | null;
}

// ═══════════════════════════════════════════════════════════════
// MAIN EXECUTION FUNCTION
// ═══════════════════════════════════════════════════════════════

/**
 * Execute media processing phase
 * Handles audio transcription, image analysis, PDF analysis
 */
export async function executeMediaProcessingPhase(
  ctx: MediaProcessingContext
): Promise<MediaProcessingPhaseResult> {
  const {
    supabase,
    msgData,
    phone,
    clienteNome,
    agentId,
    sendWhatsAppMessage,
  } = ctx;
  
  // Get Sofia capabilities for media processing
  const sofiaCapabilities = await getSofiaCapabilities(supabase);
  
  // Process media message
  const mediaProcessingResult = await processMediaMessage({
    msgData,
    phone,
    capabilities: sofiaCapabilities as MediaSofiaCapabilities,
    requestAgentId: agentId,
    supabase,
    sendMessage: sendWhatsAppMessage,
    getMediaCapabilityMessage: getMediaCapabilityMessage as (type: string, templates?: any) => string,
    getDelayIntentAcknowledgment: getDelayIntentAcknowledgment as (templates?: any) => string,
    templateCache: getTemplateCache() || undefined,
    corsHeaders,
  });
  
  // If media processing returned early (e.g., capability disabled, inaudible audio)
  if (mediaProcessingResult.shouldReturn && mediaProcessingResult.response) {
    return {
      handled: true,
      response: mediaProcessingResult.response,
      messageText: null,
      isTranscribedAudio: false,
      isAnalyzedImage: false,
      isAnalyzedDocument: false,
      detectedInvoice: false,
      mediaAnalysisResult: null,
    };
  }
  
  // Extract results from media processing
  const messageText = mediaProcessingResult.messageText;
  
  // No message text found
  if (!messageText) {
    console.log('No message text found');
    return {
      handled: true,
      response: new Response(JSON.stringify({ status: 'ignored', reason: 'no message text' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }),
      messageText: null,
      isTranscribedAudio: false,
      isAnalyzedImage: false,
      isAnalyzedDocument: false,
      detectedInvoice: false,
      mediaAnalysisResult: null,
    };
  }
  
  // Log with media type indicator
  const mediaIndicator = mediaProcessingResult.isTranscribedAudio ? ' [ÁUDIO]' :
                         mediaProcessingResult.isAnalyzedImage ? ' [IMAGEM]' :
                         mediaProcessingResult.isAnalyzedDocument ? ' [PDF]' : '';
  console.log(`Processing message from ${phone} (${clienteNome})${mediaIndicator}: "${messageText.substring(0, 100)}..."`);
  
  return {
    handled: false,
    messageText,
    isTranscribedAudio: mediaProcessingResult.isTranscribedAudio,
    isAnalyzedImage: mediaProcessingResult.isAnalyzedImage,
    isAnalyzedDocument: mediaProcessingResult.isAnalyzedDocument,
    detectedInvoice: mediaProcessingResult.detectedInvoice,
    mediaAnalysisResult: mediaProcessingResult.mediaAnalysisResult,
  };
}
