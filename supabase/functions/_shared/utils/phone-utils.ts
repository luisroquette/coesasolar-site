/**
 * Phone Utilities for Sofia Webhook
 * Centralized phone number normalization, variation generation, and conversation lookup
 * 
 * Extracted from sofia-webhook/index.ts during Phase 1 refactoring
 */

// ═══════════════════════════════════════════════════════════════
// PHONE NUMBER NORMALIZATION
// Padroniza telefones brasileiros para 13 dígitos (55 + DDD + 9 + número)
// Evita conversas duplicadas quando Z-API envia formatos diferentes
// ═══════════════════════════════════════════════════════════════

/**
 * Normalizes a Brazilian phone number to the standard 13-digit format
 * Format: 55 + DDD (2 digits) + 9 + number (8 digits)
 * 
 * @param phone - Raw phone number in any format
 * @returns Normalized 13-digit phone number
 */
export function normalizePhoneNumber(phone: string): string {
  if (!phone) return '';
  
  let digits = phone.replace(/\D/g, '');
  
  // Remove zero inicial do DDD se existir (031... -> 31...)
  if (digits.length === 12 && digits.startsWith('0')) {
    digits = digits.substring(1);
  }
  
  // Se 10 dígitos (DDD + celular sem 9): adiciona 55 e 9
  if (digits.length === 10) {
    digits = '55' + digits.substring(0, 2) + '9' + digits.substring(2);
  }
  
  // Se 11 dígitos (DDD + 9 + celular): adiciona 55
  if (digits.length === 11 && digits[2] === '9') {
    digits = '55' + digits;
  }
  
  // Se 12 dígitos e 4º dígito não é 9: insere 9 após DDD
  // Formato 55DDXXXXXXXX -> 55DD9XXXXXXXX
  if (digits.length === 12 && digits.startsWith('55') && digits[4] !== '9') {
    digits = digits.substring(0, 4) + '9' + digits.substring(4);
  }
  
  return digits;
}

// ═══════════════════════════════════════════════════════════════
// PHONE VARIATIONS FOR SEARCH
// Generates all possible phone number variations for database matching
// Addresses the issue of conversations not being found due to format differences
// ═══════════════════════════════════════════════════════════════

/**
 * Generates all possible phone number variations for flexible database matching
 * 
 * @param phone - Raw phone number
 * @returns Array of phone variations to search for
 */
export function generatePhoneVariations(phone: string): string[] {
  const normalized = normalizePhoneNumber(phone);
  if (!normalized || normalized.length < 10) return [phone];
  
  const variations: string[] = [normalized];
  
  // If normalized is 13 digits (55DD9XXXXXXXX), also search without the 9
  if (normalized.length === 13 && normalized.startsWith('55') && normalized[4] === '9') {
    const without9 = normalized.substring(0, 4) + normalized.substring(5);
    variations.push(without9);
  }
  
  // If normalized is 12 digits (55DDXXXXXXXX), also search with the 9
  if (normalized.length === 12 && normalized.startsWith('55')) {
    const with9 = normalized.substring(0, 4) + '9' + normalized.substring(4);
    variations.push(with9);
  }
  
  // Last 8 digits for flexible matching
  const last8 = normalized.slice(-8);
  variations.push(last8);
  
  // Remove duplicates
  return [...new Set(variations)];
}

// ═══════════════════════════════════════════════════════════════
// FIND CONVERSATION BY PHONE (with variations)
// Searches for conversation matching any phone variation
// Returns the first match or null
// ═══════════════════════════════════════════════════════════════

/**
 * Finds an active conversation by trying all phone number variations
 * Also normalizes the phone number in the database if found
 * 
 * @param supabase - Supabase client instance
 * @param phone - Raw phone number to search for
 * @param agentId - Agent ID to filter by
 * @returns Found conversation or null
 */
export async function findConversationByPhoneVariations(
  supabase: any,
  phone: string,
  agentId: string,
  whatsappProvider?: string // Optional: only filter if explicitly provided
): Promise<any | null> {
  const variations = generatePhoneVariations(phone);
  const normalized = normalizePhoneNumber(phone);
  
  console.log(`[PHONE_SEARCH] Looking for conversation with variations: ${variations.join(', ')}, agentId=${agentId}`);
  
  // Build OR clause for all variations
  const orClauses = variations.map(v => `cliente_telefone.ilike.%${v.slice(-8)}%`).join(',');
  
  // Build query - DON'T filter by whatsapp_provider unless explicitly requested
  // This fixes race condition recovery failures when provider varies
  let query = supabase
    .from('chatbot_conversas')
    .select(`
      id,
      cliente_telefone,
      cliente_nome,
      sofia_mode,
      agent_id,
      whatsapp_provider,
      ended_at,
      last_message_at,
      created_at
    `)
    .eq('agent_id', agentId)
    .is('ended_at', null)
    .or(orClauses)
    .order('created_at', { ascending: false })
    .limit(5);
  
  // Only filter by provider if explicitly provided
  if (whatsappProvider) {
    query = query.eq('whatsapp_provider', whatsappProvider);
  }
  
  const { data: conversas, error } = await query;
  
  if (error) {
    console.error('[PHONE_SEARCH] Error:', error);
    return null;
  }
  
  if (!conversas || conversas.length === 0) {
    console.log(`[PHONE_SEARCH] No conversation found for phone variations, agentId=${agentId}`);
    return null;
  }
  
  // If found, check if phone needs normalization update
  const found = conversas[0];
  
  if (found.cliente_telefone !== normalized) {
    console.log(`[PHONE_NORMALIZE_DB] Updating phone in DB: ${found.cliente_telefone} → ${normalized}`);
    
    await supabase
      .from('chatbot_conversas')
      .update({ cliente_telefone: normalized })
      .eq('id', found.id);
    
    found.cliente_telefone = normalized;
  }
  
  console.log(`[PHONE_SEARCH] Found conversation ${found.id} for phone ${found.cliente_telefone}`);
  return found;
}

// ═══════════════════════════════════════════════════════════════
// CLEANUP DUPLICATE CONVERSATIONS
// Merges duplicate conversations for the same phone number
// Keeps the most recent one, merges message history, and deletes others
// ═══════════════════════════════════════════════════════════════

export interface CleanupResult {
  merged: number;
  deleted: string[];
}

/**
 * Cleans up duplicate conversations for the same phone number
 * Merges messages from duplicates into the primary conversation
 * 
 * @param supabase - Supabase client instance
 * @param phone - Phone number to cleanup duplicates for
 * @param agentId - Agent ID to filter by
 * @param primaryConversaId - The primary conversation to keep
 * @returns Object with count of merged messages and deleted conversation IDs
 */
export async function cleanupDuplicateConversations(
  supabase: any,
  phone: string,
  agentId: string,
  primaryConversaId: string
): Promise<CleanupResult> {
  const variations = generatePhoneVariations(phone);
  const result: CleanupResult = { merged: 0, deleted: [] };
  
  // Find all conversations for this phone
  const orClauses = variations.map(v => `cliente_telefone.ilike.%${v.slice(-8)}%`).join(',');
  
  const { data: duplicates } = await supabase
    .from('chatbot_conversas')
    .select('id, cliente_telefone, created_at')
    .eq('agent_id', agentId)
    .eq('whatsapp_provider', 'zapi')
    .is('ended_at', null)
    .neq('id', primaryConversaId)
    .or(orClauses);
  
  if (!duplicates || duplicates.length === 0) {
    return result;
  }
  
  console.log(`[CLEANUP_DUPLICATES] Found ${duplicates.length} duplicate conversations for phone ${phone}`);
  
  for (const dup of duplicates) {
    try {
      // Move messages to primary conversation
      const { data: messages } = await supabase
        .from('chatbot_mensagens')
        .select('*')
        .eq('conversa_id', dup.id);
      
      if (messages && messages.length > 0) {
        // Insert messages into primary conversation
        const messagesToInsert = messages.map((m: any) => ({
          ...m,
          id: undefined, // Let DB generate new ID
          conversa_id: primaryConversaId,
        }));
        
        await supabase.from('chatbot_mensagens').insert(messagesToInsert);
        result.merged += messages.length;
        
        // Delete old messages
        await supabase.from('chatbot_mensagens').delete().eq('conversa_id', dup.id);
      }
      
      // Mark duplicate as ended (soft delete)
      await supabase
        .from('chatbot_conversas')
        .update({ 
          ended_at: new Date().toISOString(),
          escalation_reason: `Merged into ${primaryConversaId} (duplicate phone cleanup)`,
        })
        .eq('id', dup.id);
      
      result.deleted.push(dup.id);
      console.log(`[CLEANUP_DUPLICATES] Merged and closed duplicate ${dup.id}`);
    } catch (err) {
      console.error(`[CLEANUP_DUPLICATES] Error processing ${dup.id}:`, err);
    }
  }
  
  return result;
}

// ═══════════════════════════════════════════════════════════════
// CHECK FOR RECENTLY DISCARDED LEADS
// Prevents Sofia from restarting sales with leads that were just disqualified
// ═══════════════════════════════════════════════════════════════

export interface DiscardedLeadCheck {
  isDiscarded: boolean;
  discardedConversaId: string | null;
  motivoDescarte: string | null;
  discardedAt: string | null;
  distribuidora: string | null;
}

/**
 * Checks if a phone number belongs to a recently discarded lead
 * Prevents Sofia from restarting sales with disqualified leads
 * 
 * @param supabase - Supabase client instance
 * @param phone - Phone number to check
 * @param agentId - Agent ID to filter by
 * @returns Object with discard status and reason
 */
export async function checkForDiscardedLead(
  supabase: any,
  phone: string,
  agentId: string
): Promise<DiscardedLeadCheck> {
  const variations = generatePhoneVariations(phone);
  const orClauses = variations.map(v => `cliente_telefone.ilike.%${v.slice(-8)}%`).join(',');
  
  // Look for conversations that were discarded in the last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const { data: discardedConversas, error } = await supabase
    .from('chatbot_conversas')
    .select('id, ended_at, dados_coletados, sofia_mode, bitrix24_stage')
    .eq('agent_id', agentId)
    .eq('whatsapp_provider', 'zapi')
    .eq('sofia_mode', 'descartado')
    .not('ended_at', 'is', null)
    .gte('ended_at', thirtyDaysAgo.toISOString())
    .or(orClauses)
    .order('ended_at', { ascending: false })
    .limit(1);
  
  if (error) {
    console.error('[DISCARDED_CHECK] Error checking for discarded leads:', error);
    return { isDiscarded: false, discardedConversaId: null, motivoDescarte: null, discardedAt: null, distribuidora: null };
  }
  
  if (discardedConversas && discardedConversas.length > 0) {
    const discarded = discardedConversas[0];
    const dados = discarded.dados_coletados as any || {};
    
    console.log(`[DISCARDED_CHECK] ⛔ Found recently discarded lead: ${discarded.id} (motivo: ${dados.motivoDescarte}, distribuidora: ${dados.distribuidora || dados.distribuidoraInformada})`);
    
    return {
      isDiscarded: true,
      discardedConversaId: discarded.id,
      motivoDescarte: dados.motivoDescarte || 'unknown',
      discardedAt: discarded.ended_at,
      distribuidora: dados.distribuidora || dados.distribuidoraInformada || null,
    };
  }
  
  return { isDiscarded: false, discardedConversaId: null, motivoDescarte: null, discardedAt: null, distribuidora: null };
}

/**
 * Format phone number for display (Brazilian format)
 * 
 * @param phone - Normalized phone number
 * @returns Formatted phone string like "+55 (31) 99999-9999"
 */
export function formatPhoneForDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  
  if (digits.length === 13 && digits.startsWith('55')) {
    const ddd = digits.substring(2, 4);
    const part1 = digits.substring(4, 9);
    const part2 = digits.substring(9, 13);
    return `+55 (${ddd}) ${part1}-${part2}`;
  }
  
  if (digits.length === 11) {
    const ddd = digits.substring(0, 2);
    const part1 = digits.substring(2, 7);
    const part2 = digits.substring(7, 11);
    return `(${ddd}) ${part1}-${part2}`;
  }
  
  return phone;
}

/**
 * Extract phone from text message (useful for detecting phone numbers in chat)
 * 
 * @param text - Text to extract phone from
 * @returns Extracted phone number or null
 */
export function extractPhoneFromText(text: string): string | null {
  const phoneRegex = /(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?(?:9\s?)?\d{4,5}[-.\s]?\d{4}/g;
  const matches = text.match(phoneRegex);
  
  if (matches && matches.length > 0) {
    return normalizePhoneNumber(matches[0]);
  }
  
  return null;
}

// ═══════════════════════════════════════════════════════════════
// LID MAPPING FUNCTIONS
// Map WhatsApp LIDs (multi-device internal identifiers) to real phone numbers
// Critical for operator commands (#ASSUMIR) to work in multi-device mode
// ═══════════════════════════════════════════════════════════════

/**
 * Check if a phone string is a WhatsApp LID (internal identifier)
 * LIDs look like "16797768114390@lid" or "12345678@lid"
 */
export function isLidPhone(phone: string): boolean {
  return (phone || '').includes('@lid');
}

/**
 * Extract clean LID from a phone string
 * Handles variations like "12345@lid" or "12345@lid.extra"
 */
export function extractLid(phone: string): string | null {
  if (!isLidPhone(phone)) return null;
  // Extract the part before @lid and add @lid back
  const match = phone.match(/^(\d+)@lid/);
  return match ? `${match[1]}@lid` : phone.replace(/@lid.*/, '@lid');
}

/**
 * Save a LID → Phone mapping to the database
 * Called whenever we receive a message with both a valid phone AND a chatLid
 * 
 * @param supabase - Supabase client instance
 * @param chatLid - The WhatsApp LID (e.g., "16797768114390@lid")
 * @param phone - The real phone number (will be normalized)
 * @param agentId - Agent ID for the mapping
 */
export async function saveLidPhoneMapping(
  supabase: any,
  chatLid: string,
  phone: string,
  agentId: string = 'sofia'
): Promise<void> {
  // Skip if either is invalid
  if (!chatLid || !phone) return;
  
  // Skip if phone is also a LID (can't map LID to LID)
  if (isLidPhone(phone)) return;
  
  const normalizedPhone = normalizePhoneNumber(phone);
  const cleanLid = extractLid(chatLid) || chatLid;
  
  // Skip if phone normalization failed or is too short
  if (!normalizedPhone || normalizedPhone.length < 10) return;
  
  try {
    await supabase
      .from('whatsapp_lid_phone_mapping')
      .upsert({
        chat_lid: cleanLid,
        phone_normalized: normalizedPhone,
        agent_id: agentId,
        last_seen_at: new Date().toISOString(),
      }, {
        onConflict: 'chat_lid,agent_id',
      });
    
    console.log(`[LID_MAPPING] ✅ Saved: ${cleanLid} → ${normalizedPhone} (agent: ${agentId})`);
  } catch (err) {
    // Don't throw - mapping is best-effort
    console.warn(`[LID_MAPPING] Failed to save mapping:`, err);
  }
}

/**
 * Resolve a WhatsApp LID to a real phone number using the mapping table
 * 
 * @param supabase - Supabase client instance
 * @param lidPhone - The LID to resolve (e.g., "16797768114390@lid")
 * @param agentId - Agent ID to filter by (optional, will search all if not provided)
 * @returns Resolved phone number or null if not found
 */
export async function resolvePhoneFromLid(
  supabase: any,
  lidPhone: string,
  agentId?: string
): Promise<string | null> {
  // If not a LID, return null (caller should use the phone directly)
  if (!isLidPhone(lidPhone)) return null;
  
  const cleanLid = extractLid(lidPhone) || lidPhone;
  
  console.log(`[LID_RESOLVE] Looking up LID: ${cleanLid} (agent: ${agentId || 'any'})`);
  
  try {
    // Build query
    let query = supabase
      .from('whatsapp_lid_phone_mapping')
      .select('phone_normalized')
      .eq('chat_lid', cleanLid)
      .order('last_seen_at', { ascending: false })
      .limit(1);
    
    // Filter by agent if provided
    if (agentId) {
      query = query.eq('agent_id', agentId);
    }
    
    const { data, error } = await query.maybeSingle();
    
    if (error) {
      console.warn(`[LID_RESOLVE] Error querying mapping:`, error);
      return null;
    }
    
    if (data?.phone_normalized) {
      console.log(`[LID_RESOLVE] ✅ Resolved: ${cleanLid} → ${data.phone_normalized}`);
      return data.phone_normalized;
    }
    
    // Fallback: try without agent filter if agent was specified
    if (agentId) {
      const { data: fallbackData } = await supabase
        .from('whatsapp_lid_phone_mapping')
        .select('phone_normalized')
        .eq('chat_lid', cleanLid)
        .order('last_seen_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (fallbackData?.phone_normalized) {
        console.log(`[LID_RESOLVE] ✅ Resolved (fallback, any agent): ${cleanLid} → ${fallbackData.phone_normalized}`);
        return fallbackData.phone_normalized;
      }
    }
    
    console.log(`[LID_RESOLVE] ❌ No mapping found for LID: ${cleanLid}`);
    return null;
  } catch (err) {
    console.error(`[LID_RESOLVE] Exception:`, err);
    return null;
  }
}

/**
 * Find a conversation by chatLid when phone cannot be resolved
 * Uses webhook events to find previous messages with the same chatLid
 * and a valid phone number, then looks up the conversation
 * 
 * @param supabase - Supabase client instance
 * @param chatLid - The WhatsApp chatLid to search for
 * @param agentId - Agent ID to filter by
 * @returns Found conversation or null
 */
export async function findConversationByChatLid(
  supabase: any,
  chatLid: string,
  agentId: string
): Promise<any | null> {
  if (!chatLid) return null;
  
  const cleanLid = extractLid(chatLid) || chatLid;
  
  console.log(`[FIND_BY_LID] Searching for conversation with chatLid: ${cleanLid}`);
  
  try {
    // First, try to find the phone from webhook events
    const { data: events, error: eventsError } = await supabase
      .from('whatsapp_webhook_events')
      .select('phone')
      .or('provider.eq.z-api,provider.eq.zapi')
      .not('phone', 'like', '%@lid%')
      .contains('body_parsed', { chatLid: cleanLid })
      .order('received_at', { ascending: false })
      .limit(5);
    
    if (eventsError) {
      console.warn(`[FIND_BY_LID] Error querying events:`, eventsError);
    }
    
    if (events && events.length > 0) {
      // Try each phone found
      for (const event of events) {
        if (event.phone && !isLidPhone(event.phone)) {
          console.log(`[FIND_BY_LID] Found phone ${event.phone} from webhook event`);
          
          const conversa = await findConversationByPhoneVariations(
            supabase,
            event.phone,
            agentId
          );
          
          if (conversa) {
            console.log(`[FIND_BY_LID] ✅ Found conversation via webhook event: ${conversa.id}`);
            return conversa;
          }
        }
      }
    }
    
    // Also try looking up from the LID mapping table
    const resolvedPhone = await resolvePhoneFromLid(supabase, cleanLid, agentId);
    if (resolvedPhone) {
      const conversa = await findConversationByPhoneVariations(
        supabase,
        resolvedPhone,
        agentId
      );
      
      if (conversa) {
        console.log(`[FIND_BY_LID] ✅ Found conversation via LID mapping: ${conversa.id}`);
        return conversa;
      }
    }
    
    console.log(`[FIND_BY_LID] ❌ No conversation found for chatLid: ${cleanLid}`);
    return null;
  } catch (err) {
    console.error(`[FIND_BY_LID] Exception:`, err);
    return null;
  }
}

/**
 * Smart phone resolution for operator commands
 * Handles both regular phones and LIDs with comprehensive fallbacks
 * 
 * @param supabase - Supabase client instance
 * @param rawPhone - Raw phone from webhook (may be LID or phone)
 * @param chatLid - Optional chatLid for additional lookup
 * @param agentId - Agent ID for context
 * @returns Object with resolved phone and lookup method used
 */
export async function resolveOperatorCommandPhone(
  supabase: any,
  rawPhone: string,
  chatLid: string | null,
  agentId: string
): Promise<{ phone: string | null; method: string }> {
  // Case 1: Regular phone (not a LID)
  if (!isLidPhone(rawPhone)) {
    const normalized = normalizePhoneNumber(rawPhone);
    return { phone: normalized, method: 'direct_normalization' };
  }
  
  // Case 2: Phone is a LID - try to resolve
  console.log(`[RESOLVE_CMD_PHONE] Phone is LID: ${rawPhone}, chatLid: ${chatLid}`);
  
  // Try LID mapping first
  const fromMapping = await resolvePhoneFromLid(supabase, rawPhone, agentId);
  if (fromMapping) {
    return { phone: fromMapping, method: 'lid_mapping' };
  }
  
  // Try using chatLid if different from phone
  if (chatLid && chatLid !== rawPhone) {
    const fromChatLid = await resolvePhoneFromLid(supabase, chatLid, agentId);
    if (fromChatLid) {
      return { phone: fromChatLid, method: 'chatLid_mapping' };
    }
  }
  
  // Try finding via webhook events
  const lid = extractLid(rawPhone) || rawPhone;
  const { data: events } = await supabase
    .from('whatsapp_webhook_events')
    .select('phone')
    .or('provider.eq.z-api,provider.eq.zapi')
    .not('phone', 'like', '%@lid%')
    .contains('body_parsed', { chatLid: lid })
    .order('received_at', { ascending: false })
    .limit(5);
  
  if (events && events.length > 0) {
    for (const event of events) {
      if (event.phone && !isLidPhone(event.phone)) {
        const normalized = normalizePhoneNumber(event.phone);
        if (normalized && normalized.length >= 10) {
          return { phone: normalized, method: 'webhook_events' };
        }
      }
    }
  }
  
  console.log(`[RESOLVE_CMD_PHONE] ❌ Could not resolve LID to phone`);
  return { phone: null, method: 'unresolved' };
}
