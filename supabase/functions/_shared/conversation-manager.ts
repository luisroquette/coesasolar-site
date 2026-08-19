/**
 * Conversation Manager Module
 * Centralizes conversation creation, recovery, and race condition handling
 * Extracted from sofia-webhook/index.ts (Phase 34 refactoring)
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { syncToBitrix } from './bitrix-sync.ts';
import { findLeadByPhone, getBitrixLead } from './bitrix-client.ts';
import { ObjectionType } from './detection-patterns.ts';
import { findConversationByPhoneVariations, normalizePhoneNumber } from './utils/phone-utils.ts';

const BITRIX24_URL = Deno.env.get('BITRIX24_URL');

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type SofiaMode = 'standard' | 'closer_premium' | 'paused_for_human' | 'sac_redirect' | 'paused_for_redirect';
export type ABVariant = 'A' | 'B';
export type { ObjectionType } from './detection-patterns.ts';

export interface ConversaSnapshot {
  id: string;
  leadScore: number;
  sofiaMode: SofiaMode;
  detectedObjection: ObjectionType;
  abVariant: ABVariant;
  totalMessages: number;
  clienteTelefone?: string | null;
  clienteNome?: string | null;
  clienteEmail?: string | null;
  bitrix24LeadId?: string | null;
  bitrix24Stage?: string | null;
  propostaId?: string | null;
  dadosColetados?: Record<string, unknown> | null;
  sofiaModeFull?: string | null;
  masterOfferAt?: string | null;
  masterOfferExpiresAt?: string | null;
  masterOfferAccepted?: boolean | null;
  pendingTask?: string | null;
  pendingTaskCreatedAt?: string | null;
  pendingTaskRetries?: number;
  // Raw conversa for backward compatibility
  raw?: any;
}

export interface CreateConversationParams {
  supabase: SupabaseClient;
  phone: string;
  clienteNome: string | null;
  agentId: string;
  leadSource?: string;
  whatsappProvider?: string;
  getABVariant: (sessionId: string) => ABVariant;
}

export interface CreateConversationResult {
  success: boolean;
  snapshot: ConversaSnapshot | null;
  isRaceCondition: boolean;
  bitrixLeadId?: string | null;
  error?: string;
}

export interface FetchConversationParams {
  supabase: SupabaseClient;
  phone: string;
  agentId: string;
  whatsappProvider?: string;
}

// ═══════════════════════════════════════════════════════════════
// CONVERSATION SNAPSHOT BUILDER
// ═══════════════════════════════════════════════════════════════

/**
 * Build a ConversaSnapshot from raw database row
 */
export function buildConversaSnapshot(row: any): ConversaSnapshot {
  return {
    id: row.id,
    leadScore: row.lead_score || 0,
    sofiaMode: (row.sofia_mode as SofiaMode) || 'standard',
    detectedObjection: row.detected_objection as ObjectionType,
    abVariant: (row.ab_variant as ABVariant) || 'A',
    totalMessages: row.total_messages || 0,
    clienteTelefone: row.cliente_telefone,
    clienteNome: row.cliente_nome,
    clienteEmail: row.cliente_email,
    bitrix24LeadId: row.bitrix24_lead_id,
    bitrix24Stage: row.bitrix24_stage,
    propostaId: row.proposta_id,
    dadosColetados: row.dados_coletados,
    sofiaModeFull: row.sofia_mode,
    masterOfferAt: row.master_offer_at,
    masterOfferExpiresAt: row.master_offer_expires_at,
    masterOfferAccepted: row.master_offer_accepted,
    pendingTask: row.pending_task,
    pendingTaskCreatedAt: row.pending_task_created_at,
    pendingTaskRetries: row.pending_task_retries || 0,
    raw: row,
  };
}

// ═══════════════════════════════════════════════════════════════
// CREATE NEW CONVERSATION
// ═══════════════════════════════════════════════════════════════

/**
 * Create a new conversation with race condition handling
 * Also creates initial Bitrix24 lead
 */
export async function createConversation(
  params: CreateConversationParams
): Promise<CreateConversationResult> {
  const {
    supabase,
    phone,
    clienteNome,
    agentId,
    leadSource = 'whatsapp_inbound',
    whatsappProvider = 'zapi',
    getABVariant,
  } = params;

  const newSessionId = crypto.randomUUID();
  const abVariant = getABVariant(newSessionId);

  const { data: newConversa, error: createError } = await supabase
    .from('chatbot_conversas')
    .insert({
      session_id: newSessionId,
      cliente_telefone: phone,
      cliente_nome: clienteNome,
      agent_id: agentId,
      lead_source: leadSource,
      lead_score: 10,
      sofia_mode: 'standard',
      ab_variant: abVariant,
      whatsapp_provider: whatsappProvider,
      total_messages: 1,
    })
    .select()
    .single();

  if (createError) {
    // Check race condition (unique constraint violation)
    const isUniqueViolation = 
      createError.code === '23505' ||
      createError.message?.includes('unique') ||
      createError.message?.includes('duplicate');

    if (isUniqueViolation) {
      console.log(`[RACE_CONDITION] Detected unique violation. Attempting recovery for phone=${phone}, agentId=${agentId}`);

      // Use phone variations for flexible matching (DON'T filter by provider for recovery)
      const existingConversa = await findConversationByPhoneVariations(
        supabase,
        phone,
        agentId
        // Note: NOT passing whatsappProvider to maximize recovery chances
      );

      console.log(`[RACE_CONDITION] Recovery result: found=${!!existingConversa}, conversaId=${existingConversa?.id || 'N/A'}`);

      if (existingConversa) {
        // Fetch full conversation data for snapshot
        const { data: fullConversa } = await supabase
          .from('chatbot_conversas')
          .select(`
            id,
            cliente_telefone,
            cliente_nome,
            cliente_email,
            sofia_mode,
            lead_score,
            ab_variant,
            dados_coletados,
            agent_id,
            bitrix24_lead_id,
            bitrix24_stage,
            proposta_id,
            last_message_at,
            total_messages,
            detected_objection,
            master_offer_at,
            master_offer_expires_at,
            master_offer_accepted,
            pending_task,
            pending_task_created_at,
            pending_task_retries,
            whatsapp_provider
          `)
          .eq('id', existingConversa.id)
          .single();

        if (fullConversa) {
          console.log(`[RACE_CONDITION] ✅ Successfully recovered conversation: ${fullConversa.id}`);
          return {
            success: true,
            snapshot: buildConversaSnapshot(fullConversa),
            isRaceCondition: true,
          };
        }
      }
      
      // ═══════════════════════════════════════════════════════════════
      // FALLBACK: If recovery failed, try direct query without variations
      // This handles edge cases where the phone format is very different
      // ═══════════════════════════════════════════════════════════════
      console.log(`[RACE_CONDITION] Primary recovery failed. Trying fallback direct query...`);
      
      const { data: fallbackConversas } = await supabase
        .from('chatbot_conversas')
        .select(`
          id,
          cliente_telefone,
          cliente_nome,
          cliente_email,
          sofia_mode,
          lead_score,
          ab_variant,
          dados_coletados,
          agent_id,
          bitrix24_lead_id,
          bitrix24_stage,
          proposta_id,
          last_message_at,
          total_messages,
          detected_objection,
          master_offer_at,
          master_offer_expires_at,
          master_offer_accepted,
          pending_task,
          pending_task_created_at,
          pending_task_retries,
          whatsapp_provider
        `)
        .eq('agent_id', agentId)
        .is('ended_at', null)
        .ilike('cliente_telefone', `%${phone.slice(-8)}%`)
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (fallbackConversas && fallbackConversas.length > 0) {
        const fallbackConversa = fallbackConversas[0];
        console.log(`[RACE_CONDITION] ✅ Fallback recovery successful: ${fallbackConversa.id}`);
        return {
          success: true,
          snapshot: buildConversaSnapshot(fallbackConversa),
          isRaceCondition: true,
        };
      }
      
      console.error(`[RACE_CONDITION] ❌ All recovery attempts failed for phone=${phone}, agentId=${agentId}`);
      console.error(`[RACE_CONDITION] Debug: createError.code=${createError.code}, message=${createError.message}`);
      return {
        success: false,
        snapshot: null,
        isRaceCondition: true,
        error: 'Race condition recovery failed',
      };
    }

    console.error('[CONVERSATION_MANAGER] Error creating conversation:', createError);
    return {
      success: false,
      snapshot: null,
      isRaceCondition: false,
      error: createError.message,
    };
  }

  const snapshot = buildConversaSnapshot(newConversa);
  console.log(`[CONVERSATION_MANAGER] Created new conversation: ${snapshot.id}`);

  // Check if lead already exists in Bitrix24 by phone (returning client scenario)
  let bitrixLeadId: string | null = null;
  let bitrixStage: string = 'NEW';
  
  try {
    // First, search for existing lead by phone
    if (BITRIX24_URL) {
      const existingLead = await findLeadByPhone(BITRIX24_URL, phone);
      
      if (existingLead?.ID) {
        bitrixLeadId = existingLead.ID;
        bitrixStage = existingLead.STATUS_ID || 'NEW';
        console.log(`[CONVERSATION_MANAGER] ✅ Found existing Bitrix lead: ${bitrixLeadId}, stage: ${bitrixStage}`);
        
        // Sync conversation with existing lead
        await supabase
          .from('chatbot_conversas')
          .update({
            bitrix24_lead_id: bitrixLeadId,
            bitrix24_stage: bitrixStage,
          })
          .eq('id', snapshot.id);
        
        snapshot.bitrix24LeadId = bitrixLeadId;
        snapshot.bitrix24Stage = bitrixStage;
      }
    }
    
    // If no existing lead found, create new one
    if (!bitrixLeadId) {
      const initialSyncResult = await syncToBitrix(
        supabase,
        snapshot.id,
        phone,
        clienteNome,
        {},
        undefined,
        false
      );

      if (initialSyncResult.success && initialSyncResult.leadId) {
        bitrixLeadId = initialSyncResult.leadId;
        console.log(`[CONVERSATION_MANAGER] ✅ Bitrix lead created: ${bitrixLeadId}`);

        await supabase
          .from('chatbot_conversas')
          .update({
            bitrix24_lead_id: bitrixLeadId,
            bitrix24_stage: 'NEW',
          })
          .eq('id', snapshot.id);

        snapshot.bitrix24LeadId = bitrixLeadId;
        snapshot.bitrix24Stage = 'NEW';
      } else {
        console.error('[CONVERSATION_MANAGER] ❌ Failed to create initial lead:', initialSyncResult.error);
      }
    }
  } catch (leadError) {
    console.error('[CONVERSATION_MANAGER] ❌ Error with Bitrix lead:', leadError);
  }

  return {
    success: true,
    snapshot,
    isRaceCondition: false,
    bitrixLeadId,
  };
}

// ═══════════════════════════════════════════════════════════════
// FETCH EXISTING CONVERSATION
// ═══════════════════════════════════════════════════════════════

/**
 * Fetch existing conversation by phone/agent
 */
export async function fetchConversation(
  params: FetchConversationParams
): Promise<ConversaSnapshot | null> {
  const {
    supabase,
    phone,
    agentId,
    whatsappProvider = 'zapi',
  } = params;

  const { data: existingConversa } = await supabase
    .from('chatbot_conversas')
    .select(`
      id,
      cliente_telefone,
      cliente_nome,
      cliente_email,
      sofia_mode,
      lead_score,
      ab_variant,
      dados_coletados,
      agent_id,
      bitrix24_lead_id,
      bitrix24_stage,
      proposta_id,
      last_message_at,
      total_messages,
      detected_objection,
      master_offer_at,
      master_offer_expires_at,
      master_offer_accepted,
      pending_task,
      pending_task_created_at,
      pending_task_retries,
      whatsapp_provider
    `)
    .eq('cliente_telefone', phone)
    .eq('agent_id', agentId)
    .eq('whatsapp_provider', whatsappProvider)
    .is('ended_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!existingConversa) {
    return null;
  }

  return buildConversaSnapshot(existingConversa);
}

// ═══════════════════════════════════════════════════════════════
// GET OR CREATE CONVERSATION
// ═══════════════════════════════════════════════════════════════

export interface GetOrCreateResult {
  snapshot: ConversaSnapshot;
  isNew: boolean;
  isRaceCondition: boolean;
  error?: string;
}

/**
 * Get existing conversation or create new one
 * This is the main entry point for conversation management
 */
export async function getOrCreateConversation(
  params: CreateConversationParams & { existingConversa?: any }
): Promise<GetOrCreateResult> {
  const { existingConversa, ...createParams } = params;

  if (existingConversa) {
    return {
      snapshot: buildConversaSnapshot(existingConversa),
      isNew: false,
      isRaceCondition: false,
    };
  }

  const result = await createConversation(createParams);

  if (!result.success || !result.snapshot) {
    throw new Error(result.error || 'Failed to create conversation');
  }

  return {
    snapshot: result.snapshot,
    isNew: true,
    isRaceCondition: result.isRaceCondition,
  };
}

// ═══════════════════════════════════════════════════════════════
// RESET NUDGE STATE
// ═══════════════════════════════════════════════════════════════

/**
 * Reset nudge state when lead responds
 */
export async function resetNudgeState(
  supabase: SupabaseClient,
  conversaId: string
): Promise<void> {
  await supabase
    .from('chatbot_conversas')
    .update({
      awaiting_response: false,
      nudge_count: 0,
      next_nudge_at: null,
      last_message_at: new Date().toISOString(),
    })
    .eq('id', conversaId);
}

// ═══════════════════════════════════════════════════════════════
// SAVE INCOMING MESSAGE
// ═══════════════════════════════════════════════════════════════

export interface SaveMessageParams {
  supabase: SupabaseClient;
  conversaId: string;
  messageText: string;
  messageId: string | null;
  isTranscribedAudio?: boolean;
  isAnalyzedImage?: boolean;
  isAnalyzedDocument?: boolean;
}

/**
 * Save incoming message with media context prefix
 */
export async function saveIncomingMessage(
  params: SaveMessageParams
): Promise<void> {
  const {
    supabase,
    conversaId,
    messageText,
    messageId,
    isTranscribedAudio = false,
    isAnalyzedImage = false,
    isAnalyzedDocument = false,
  } = params;

  const getMessagePrefix = () => {
    if (isTranscribedAudio) return '[🎤 Áudio transcrito]: ';
    if (isAnalyzedImage) return '[📷 Imagem analisada]: ';
    if (isAnalyzedDocument) return '[📄 PDF analisado]: ';
    return '';
  };

  const messageContentToSave = getMessagePrefix() + messageText;

  await supabase.from('chatbot_mensagens').insert({
    conversa_id: conversaId,
    role: 'user',
    content: messageContentToSave,
    message_id: messageId,
  });
}
