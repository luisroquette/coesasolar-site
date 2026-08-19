/**
 * LEAD PROCESSING PHASE
 * 
 * Handles hot lead detection, Bitrix lead creation, and document collection flows
 * Extracted from sofia-webhook/index.ts lines 1873-1895 + 2136-2200
 * 
 * @module _shared/sofia-orchestrator/lead-processing-phase
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.90.0';
import {
  detectHotLead,
  processHotLeadDetection,
  type HotLeadDetectionResult,
} from '../hot-lead-detection.ts';
import type { PatternEntry } from '../detection-patterns.ts';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface LeadProcessingPhaseContext {
  supabase: SupabaseClient;
  conversaId: string;
  phone: string;
  messageText: string;
  detectionPatterns: Map<string, PatternEntry>;
  conversa?: LeadProcessingConversaData | null;
  dadosColetados?: Record<string, unknown> | null;
}

export interface LeadProcessingPhaseResult {
  hotLeadDetected: boolean;
  hotLeadPattern?: string;
  alertSent?: boolean;
}

export interface LeadProcessingConversaData {
  id: string;
  cliente_nome?: string | null;
  cliente_telefone?: string | null;
  cliente_email?: string | null;
  bitrix24_lead_id?: string | null;
  proposta_id?: string | null;
  dados_coletados?: Record<string, unknown> | null;
}

// ═══════════════════════════════════════════════════════════════
// HOT LEAD DETECTION
// ═══════════════════════════════════════════════════════════════

/**
 * Process hot lead detection and trigger alerts
 * Non-blocking - alerts are sent asynchronously
 */
export async function processHotLeadFlow(
  supabase: SupabaseClient,
  messageText: string,
  conversa: LeadProcessingConversaData | null,
  dadosColetados: Record<string, unknown> | null,
  detectionPatterns: Map<string, PatternEntry>
): Promise<{ detected: boolean; pattern?: string }> {
  const hotLeadDetection = detectHotLead(messageText, detectionPatterns);
  
  if (!hotLeadDetection.isHotLead) {
    return { detected: false };
  }
  
  console.log(`[HOT_LEAD] 🔥 Closing intent detected: "${hotLeadDetection.matchedPattern}"`);
  
  // Trigger alert asynchronously (non-blocking)
  processHotLeadDetection(
    supabase,
    messageText,
    conversa,
    dadosColetados,
    detectionPatterns
  ).catch(err => console.warn('[HOT_LEAD] Alert failed:', err));
  
  return { 
    detected: true, 
    pattern: hotLeadDetection.matchedPattern || undefined,
  };
}

// ═══════════════════════════════════════════════════════════════
// MESSAGE SAVING WITH MEDIA CONTEXT
// ═══════════════════════════════════════════════════════════════

export interface SaveMessageOptions {
  conversaId: string;
  messageText: string;
  messageId?: string;
  isTranscribedAudio?: boolean;
  isAnalyzedImage?: boolean;
  isAnalyzedDocument?: boolean;
}

/**
 * Get message prefix based on media type
 */
export function getMediaMessagePrefix(options: {
  isTranscribedAudio?: boolean;
  isAnalyzedImage?: boolean;
  isAnalyzedDocument?: boolean;
}): string {
  if (options.isTranscribedAudio) return '[🎤 Áudio transcrito]: ';
  if (options.isAnalyzedImage) return '[📷 Imagem analisada]: ';
  if (options.isAnalyzedDocument) return '[📄 PDF analisado]: ';
  return '';
}

/**
 * Save incoming message with media context prefix
 */
export async function saveIncomingMessageWithContext(
  supabase: SupabaseClient,
  options: SaveMessageOptions
): Promise<void> {
  const prefix = getMediaMessagePrefix({
    isTranscribedAudio: options.isTranscribedAudio,
    isAnalyzedImage: options.isAnalyzedImage,
    isAnalyzedDocument: options.isAnalyzedDocument,
  });
  
  const messageContentToSave = prefix + options.messageText;
  
  await supabase.from('chatbot_mensagens').insert({
    conversa_id: options.conversaId,
    role: 'user',
    content: messageContentToSave,
    message_id: options.messageId || null,
  });
}

// ═══════════════════════════════════════════════════════════════
// BITRIX LEAD CREATION TRIGGER
// ═══════════════════════════════════════════════════════════════

export interface BitrixLeadTrigger {
  shouldCreate: boolean;
  reason?: 'invoice_detected' | 'minimum_data' | 'explicit_request';
  mediaType?: 'image' | 'document' | 'audio';
}

/**
 * Check if Bitrix lead should be created based on context
 */
export function shouldCreateBitrixLead(
  detectedInvoice: boolean,
  isAnalyzedImage: boolean,
  isAnalyzedDocument: boolean,
  existingLeadId?: string | null
): BitrixLeadTrigger {
  // Don't create if lead already exists
  if (existingLeadId) {
    return { shouldCreate: false };
  }
  
  // Create if invoice was detected
  if (detectedInvoice) {
    const mediaType = isAnalyzedImage ? 'image' : isAnalyzedDocument ? 'document' : undefined;
    return { 
      shouldCreate: true, 
      reason: 'invoice_detected',
      mediaType,
    };
  }
  
  return { shouldCreate: false };
}

// ═══════════════════════════════════════════════════════════════
// MAIN EXECUTION FUNCTION
// ═══════════════════════════════════════════════════════════════

/**
 * Execute lead processing phase
 * Handles hot lead detection and message saving with media context
 */
export async function executeLeadProcessingPhase(
  ctx: LeadProcessingPhaseContext
): Promise<LeadProcessingPhaseResult> {
  const { 
    supabase, 
    messageText, 
    conversa, 
    dadosColetados,
    detectionPatterns 
  } = ctx;
  
  // Process hot lead detection
  const hotLeadResult = await processHotLeadFlow(
    supabase,
    messageText,
    conversa || null,
    dadosColetados || null,
    detectionPatterns
  );
  
  return {
    hotLeadDetected: hotLeadResult.detected,
    hotLeadPattern: hotLeadResult.pattern,
    alertSent: hotLeadResult.detected,
  };
}
