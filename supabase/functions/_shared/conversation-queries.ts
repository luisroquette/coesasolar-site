/**
 * Conversation Query Helpers - Performance Optimization
 * 
 * Provides optimized SELECT field sets for chatbot_conversas queries
 * Reduces data transfer by 80-90% by selecting only needed fields
 * 
 * Created as part of Performance Sprint 2
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.90.0';

// ═══════════════════════════════════════════════════════════════
// OPTIMIZED FIELD SETS
// Define minimal field sets for different use cases
// ═══════════════════════════════════════════════════════════════

/**
 * Minimal fields for active conversation lookup
 * Use when: Finding/recovering a conversation by phone
 * Size: ~500 bytes vs ~5KB for SELECT *
 */
export const CONVERSATION_LOOKUP_FIELDS = `
  id,
  cliente_telefone,
  cliente_nome,
  sofia_mode,
  agent_id,
  whatsapp_provider,
  ended_at,
  last_message_at,
  created_at
`;

/**
 * Fields for message processing pipeline
 * Use when: Processing incoming messages, generating responses
 * Includes: lead data, collected info, scoring
 */
export const CONVERSATION_PROCESSING_FIELDS = `
  id,
  cliente_telefone,
  cliente_nome,
  cliente_email,
  sofia_mode,
  lead_score,
  ab_variant,
  dados_coletados,
  fsm_expected_field,
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
`;

/**
 * Fields for contract/proposal workflows
 * Use when: contract-sent-webhook, proposal tracking
 */
export const CONVERSATION_CONTRACT_FIELDS = `
  id,
  cliente_telefone,
  cliente_nome,
  cliente_email,
  sofia_mode,
  agent_id,
  bitrix24_lead_id,
  proposta_id,
  contrato_enviado_at,
  contrato_assinado,
  contrato_assinado_at,
  contract_nudge_count,
  next_contract_nudge_at,
  last_message_at,
  whatsapp_provider
`;

/**
 * Fields for dashboard/analytics queries
 * Use when: Displaying conversation lists, reports
 */
export const CONVERSATION_DASHBOARD_FIELDS = `
  id,
  cliente_telefone,
  cliente_nome,
  lead_score,
  lead_source,
  sofia_mode,
  created_at,
  last_message_at,
  total_messages,
  event_conversion,
  event_proposal_sent,
  bitrix24_stage
`;

/**
 * Fields for nudge/rescue schedulers
 * Use when: stuck-leads-rescue, follow-up nudges
 */
export const CONVERSATION_NUDGE_FIELDS = `
  id,
  cliente_telefone,
  cliente_nome,
  sofia_mode,
  agent_id,
  lead_score,
  nudge_count,
  next_nudge_at,
  awaiting_response,
  last_message_at,
  last_sofia_message_at,
  created_at,
  whatsapp_provider
`;

/**
 * Fields for Bitrix sync operations
 * Use when: Syncing to/from Bitrix24 CRM
 */
export const CONVERSATION_BITRIX_FIELDS = `
  id,
  cliente_telefone,
  cliente_nome,
  cliente_email,
  sofia_mode,
  lead_score,
  dados_coletados,
  bitrix24_lead_id,
  bitrix24_stage,
  proposta_id,
  agent_id
`;

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// Reusable query patterns with optimized field selection
// ═══════════════════════════════════════════════════════════════

/**
 * Find active conversation by phone number with minimal fields
 * Optimized for race condition recovery in conversation-manager
 */
export async function findActiveConversationByPhone(
  supabase: SupabaseClient,
  phone: string,
  agentId: string,
  provider: string = 'zapi'
) {
  return supabase
    .from('chatbot_conversas')
    .select(CONVERSATION_LOOKUP_FIELDS)
    .eq('cliente_telefone', phone)
    .eq('agent_id', agentId)
    .eq('whatsapp_provider', provider)
    .is('ended_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
}

/**
 * Find conversation for contract workflow
 * Supports lookup by phone, bitrix_lead_id, or proposta_id
 */
export async function findConversationForContract(
  supabase: SupabaseClient,
  params: {
    phone?: string;
    bitrixLeadId?: string;
    propostaId?: string;
  }
) {
  let query = supabase
    .from('chatbot_conversas')
    .select(CONVERSATION_CONTRACT_FIELDS);

  if (params.phone) {
    // Format phone for comparison
    let cleaned = params.phone.replace(/\D/g, '');
    if (cleaned.startsWith('0')) cleaned = cleaned.substring(1);
    if (!cleaned.startsWith('55')) cleaned = '55' + cleaned;
    
    query = query.or(`cliente_telefone.eq.${cleaned},cliente_telefone.eq.${params.phone}`);
  } else if (params.bitrixLeadId) {
    query = query.eq('bitrix24_lead_id', params.bitrixLeadId);
  } else if (params.propostaId) {
    query = query.eq('proposta_id', params.propostaId);
  } else {
    throw new Error('At least one search parameter required');
  }

  return query
    .is('ended_at', null)
    .order('created_at', { ascending: false })
    .limit(1);
}

/**
 * Find conversations for phone variations (flexible matching)
 * Used by phone-utils for fuzzy phone matching
 */
export async function findConversationsByPhoneVariations(
  supabase: SupabaseClient,
  variations: string[],
  agentId: string,
  provider: string = 'zapi',
  limit: number = 5
) {
  // Build OR clause for all variations (last 8 digits)
  const orClauses = variations
    .map(v => `cliente_telefone.ilike.%${v.slice(-8)}%`)
    .join(',');

  return supabase
    .from('chatbot_conversas')
    .select(CONVERSATION_LOOKUP_FIELDS)
    .eq('agent_id', agentId)
    .eq('whatsapp_provider', provider)
    .is('ended_at', null)
    .or(orClauses)
    .order('created_at', { ascending: false })
    .limit(limit);
}

/**
 * Find discarded conversations for phone (within last 30 days)
 * Used to prevent restarting sales with disqualified leads
 */
export async function findDiscardedConversation(
  supabase: SupabaseClient,
  variations: string[],
  agentId: string,
  provider: string = 'zapi'
) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const orClauses = variations
    .map(v => `cliente_telefone.ilike.%${v.slice(-8)}%`)
    .join(',');

  return supabase
    .from('chatbot_conversas')
    .select(`
      id,
      ended_at,
      dados_coletados,
      sofia_mode,
      bitrix24_stage
    `)
    .eq('agent_id', agentId)
    .eq('whatsapp_provider', provider)
    .eq('sofia_mode', 'descartado')
    .not('ended_at', 'is', null)
    .gte('ended_at', thirtyDaysAgo.toISOString())
    .or(orClauses)
    .order('ended_at', { ascending: false })
    .limit(1);
}

/**
 * Get conversation with processing fields by ID
 * Optimized for message handling pipeline
 */
export async function getConversationForProcessing(
  supabase: SupabaseClient,
  conversaId: string
) {
  return supabase
    .from('chatbot_conversas')
    .select(CONVERSATION_PROCESSING_FIELDS)
    .eq('id', conversaId)
    .single();
}

/**
 * List conversations for dashboard
 * Paginated with optimized fields
 */
export async function listConversationsForDashboard(
  supabase: SupabaseClient,
  options: {
    agentId?: string;
    activeOnly?: boolean;
    limit?: number;
    offset?: number;
  } = {}
) {
  let query = supabase
    .from('chatbot_conversas')
    .select(CONVERSATION_DASHBOARD_FIELDS, { count: 'exact' });

  if (options.agentId) {
    query = query.eq('agent_id', options.agentId);
  }

  if (options.activeOnly !== false) {
    query = query.is('ended_at', null);
  }

  return query
    .order('last_message_at', { ascending: false })
    .range(
      options.offset || 0,
      (options.offset || 0) + (options.limit || 50) - 1
    );
}
