/**
 * INTAKE LAYER - CENTRALIZED MESSAGE PERSISTENCE
 * 
 * This module provides GUARANTEED message persistence as the FIRST step
 * in the Sofia pipeline. All user messages MUST be persisted here before
 * any other processing occurs.
 * 
 * ARCHITECTURE PRINCIPLE:
 * - Single point of entry for ALL incoming messages
 * - Persistence happens BEFORE any early returns or branching
 * - No message is ever lost, regardless of downstream failures
 * 
 * @module _shared/sofia-orchestrator/intake-layer
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.90.0';
import { corsHeaders } from '../webhook-types.ts';
import { saveUserMessage, type SaveMessageResult } from '../message-helpers.ts';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface IntakeContext {
  supabase: SupabaseClient;
  phone: string;
  agentId: string;
  messageText: string;
  messageId?: string;
  clienteNome?: string | null;
  
  // Media context for prefix
  isTranscribedAudio?: boolean;
  isAnalyzedImage?: boolean;
  isAnalyzedDocument?: boolean;
  
  // Existing conversa (if found)
  conversaId?: string | null;
  existingConversa?: ExistingConversaData | null;
}

export interface IntakeResult {
  success: boolean;
  conversaId: string;
  messageId?: string;
  isNewConversation: boolean;
  persistedAt: string;
  error?: string;
}

export interface ExistingConversaData {
  id: string;
  cliente_nome?: string | null;
  cliente_telefone?: string | null;
  dados_coletados?: Record<string, unknown> | null;
  total_messages?: number | null;
  bitrix24_lead_id?: string | null;
  bitrix24_stage?: string | null;
  agent_id?: string;
}

// ═══════════════════════════════════════════════════════════════
// MEDIA PREFIX HELPER
// ═══════════════════════════════════════════════════════════════

/**
 * Generate message prefix based on media type
 * Centralizes the logic from multiple places
 */
export function getMediaPrefix(context: {
  isTranscribedAudio?: boolean;
  isAnalyzedImage?: boolean;
  isAnalyzedDocument?: boolean;
}): string {
  if (context.isTranscribedAudio) return '[🎤 Áudio transcrito]: ';
  if (context.isAnalyzedImage) return '[📷 Imagem analisada]: ';
  if (context.isAnalyzedDocument) return '[📄 PDF analisado]: ';
  return '';
}

// ═══════════════════════════════════════════════════════════════
// CONVERSATION FIND OR CREATE
// ═══════════════════════════════════════════════════════════════

/**
 * Find existing conversation or create a new one
 * This ensures we always have a valid conversaId before persisting
 */
export async function findOrCreateConversation(
  supabase: SupabaseClient,
  phone: string,
  agentId: string,
  clienteNome?: string | null
): Promise<{ conversaId: string; isNew: boolean; conversa: ExistingConversaData | null }> {
  // Try to find existing open conversation
  const { data: existing, error: findError } = await supabase
    .from('chatbot_conversas')
    .select(`
      id,
      cliente_nome,
      cliente_telefone,
      dados_coletados,
      total_messages,
      bitrix24_lead_id,
      bitrix24_stage,
      agent_id
    `)
    .eq('cliente_telefone', phone)
    .eq('agent_id', agentId)
    .eq('whatsapp_provider', 'zapi')
    .is('ended_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  
  if (existing) {
    console.log(`[INTAKE] Found existing conversation: ${existing.id}`);
    return {
      conversaId: existing.id,
      isNew: false,
      conversa: existing as ExistingConversaData,
    };
  }
  
  // Create new conversation
  const sessionId = `${phone}_${agentId}_${Date.now()}`;
  const { data: newConversa, error: createError } = await supabase
    .from('chatbot_conversas')
    .insert({
      cliente_telefone: phone,
      cliente_nome: clienteNome || null,
      agent_id: agentId,
      session_id: sessionId,
      whatsapp_provider: 'zapi',
      created_at: new Date().toISOString(),
      last_message_at: new Date().toISOString(),
      total_messages: 0,
    })
    .select('id')
    .single();
  
  if (createError || !newConversa) {
    console.error('[INTAKE] Failed to create conversation:', createError);
    throw new Error(`Failed to create conversation: ${createError?.message || 'unknown'}`);
  }
  
  console.log(`[INTAKE] Created new conversation: ${newConversa.id}`);
  return {
    conversaId: newConversa.id,
    isNew: true,
    conversa: null,
  };
}

// ═══════════════════════════════════════════════════════════════
// MAIN INTAKE FUNCTION
// ═══════════════════════════════════════════════════════════════

/**
 * GUARANTEED MESSAGE PERSISTENCE
 * 
 * This function MUST be called at the start of every webhook invocation.
 * It ensures the user message is saved to `chatbot_mensagens` BEFORE
 * any other processing occurs.
 * 
 * Benefits:
 * 1. No message loss regardless of downstream failures
 * 2. Complete conversation history for AI context
 * 3. Single source of truth for message persistence
 * 4. Metrics and debugging visibility
 * 
 * @example
 * const intake = await executeIntakeLayer({
 *   supabase,
 *   phone: '5511999999999',
 *   agentId: 'sofia',
 *   messageText: 'Olá, quero saber sobre energia solar',
 *   clienteNome: 'João',
 * });
 * 
 * // Now safe to proceed with any processing
 * // Message is guaranteed to be persisted
 */
export async function executeIntakeLayer(
  context: IntakeContext
): Promise<IntakeResult> {
  const {
    supabase,
    phone,
    agentId,
    messageText,
    messageId,
    clienteNome,
    isTranscribedAudio,
    isAnalyzedImage,
    isAnalyzedDocument,
    conversaId: existingConversaId,
    existingConversa,
  } = context;
  
  const startTime = Date.now();
  
  // ═══════════════════════════════════════════════════════════════
  // STEP 1: Ensure we have a valid conversation
  // ═══════════════════════════════════════════════════════════════
  let conversaId = existingConversaId;
  let isNewConversation = false;
  
  if (!conversaId) {
    const result = await findOrCreateConversation(supabase, phone, agentId, clienteNome);
    conversaId = result.conversaId;
    isNewConversation = result.isNew;
  }
  
  // ═══════════════════════════════════════════════════════════════
  // STEP 2: Build message content with media prefix
  // ═══════════════════════════════════════════════════════════════
  const prefix = getMediaPrefix({
    isTranscribedAudio,
    isAnalyzedImage,
    isAnalyzedDocument,
  });
  
  const fullMessageContent = prefix + messageText;
  
  // ═══════════════════════════════════════════════════════════════
  // STEP 3: PERSIST MESSAGE (CRITICAL - GUARANTEED)
  // ═══════════════════════════════════════════════════════════════
  const saveResult = await saveUserMessage(
    supabase,
    conversaId,
    fullMessageContent,
    messageId
  );
  
  if (!saveResult.success) {
    console.error(`[INTAKE] ❌ CRITICAL: Failed to save user message:`, saveResult.error);
    
    // Even on failure, try a direct insert as fallback
    const { error: fallbackError } = await supabase
      .from('chatbot_mensagens')
      .insert({
        conversa_id: conversaId,
        role: 'user',
        content: fullMessageContent,
        message_id: messageId || null,
        created_at: new Date().toISOString(),
      });
    
    if (fallbackError) {
      console.error(`[INTAKE] ❌ FALLBACK ALSO FAILED:`, fallbackError);
      return {
        success: false,
        conversaId,
        isNewConversation,
        persistedAt: new Date().toISOString(),
        error: `Primary: ${saveResult.error}, Fallback: ${fallbackError.message}`,
      };
    }
    
    console.log(`[INTAKE] ⚠️ Fallback insert succeeded`);
  }
  
  const durationMs = Date.now() - startTime;
  const persistedAt = new Date().toISOString();
  
  console.log(`[INTAKE] ✅ Message persisted in ${durationMs}ms | conversaId=${conversaId} | new=${isNewConversation} | length=${messageText.length}`);
  
  return {
    success: true,
    conversaId,
    messageId: saveResult.id,
    isNewConversation,
    persistedAt,
  };
}

// ═══════════════════════════════════════════════════════════════
// OUTBOUND MESSAGE PERSISTENCE
// ═══════════════════════════════════════════════════════════════

export interface OutboundIntakeContext {
  supabase: SupabaseClient;
  conversaId: string;
  content: string;
  handlerType?: string;
}

/**
 * Persist assistant (Sofia) outbound message
 * Called after message is successfully sent to WhatsApp
 */
export async function persistOutboundMessage(
  context: OutboundIntakeContext
): Promise<SaveMessageResult> {
  const { supabase, conversaId, content, handlerType } = context;
  
  const { data, error } = await supabase
    .from('chatbot_mensagens')
    .insert({
      conversa_id: conversaId,
      role: 'assistant',
      content,
      handler_type: handlerType || null,
      created_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  
  if (error) {
    console.error(`[INTAKE] Failed to save assistant message:`, error);
    return { success: false, error: error.message };
  }
  
  // Update conversation timestamps
  await supabase
    .from('chatbot_conversas')
    .update({
      last_message_at: new Date().toISOString(),
      last_sofia_message_at: new Date().toISOString(),
    })
    .eq('id', conversaId);
  
  return { success: true, id: data.id };
}

// ═══════════════════════════════════════════════════════════════
// INTAKE VALIDATION (for debugging/monitoring)
// ═══════════════════════════════════════════════════════════════

/**
 * Validate that a message was properly persisted
 * Useful for debugging and monitoring
 */
export async function validateMessagePersisted(
  supabase: SupabaseClient,
  conversaId: string,
  messageId?: string
): Promise<{ found: boolean; message?: { id: string; content: string; created_at: string } }> {
  let query = supabase
    .from('chatbot_mensagens')
    .select('id, content, created_at')
    .eq('conversa_id', conversaId)
    .eq('role', 'user')
    .order('created_at', { ascending: false })
    .limit(1);
  
  if (messageId) {
    query = query.eq('message_id', messageId);
  }
  
  const { data, error } = await query.maybeSingle();
  
  if (error || !data) {
    return { found: false };
  }
  
  return {
    found: true,
    message: data,
  };
}

// ═══════════════════════════════════════════════════════════════
// INTAKE METRICS (for observability)
// ═══════════════════════════════════════════════════════════════

export interface IntakeMetrics {
  totalMessages: number;
  successRate: number;
  avgPersistenceMs: number;
  lastError?: string;
}

/**
 * Get intake layer metrics for monitoring
 */
export async function getIntakeMetrics(
  supabase: SupabaseClient,
  agentId: string,
  sinceHours: number = 24
): Promise<IntakeMetrics> {
  const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000).toISOString();
  
  const { count, error } = await supabase
    .from('chatbot_mensagens')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', since);
  
  return {
    totalMessages: count || 0,
    successRate: 1.0, // TODO: Track failures separately
    avgPersistenceMs: 15, // TODO: Track actual timing
  };
}
