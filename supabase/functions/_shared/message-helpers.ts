/**
 * Message Helpers Module
 * Centralized message persistence utilities for chatbot operations
 * 
 * Eliminates ~15 duplicate save message patterns across the codebase
 * 
 * @module message-helpers
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

export interface SaveMessageOptions {
  conversaId: string;
  role: MessageRole;
  content: string;
  messageId?: string | null;
  handlerType?: string | null;
  isQuickReply?: boolean;
}

export interface SaveMessageResult {
  success: boolean;
  id?: string;
  error?: string;
}

export interface UpdateConversaOptions {
  lastMessageAt?: boolean;
  lastSofiaMessageAt?: boolean;
  lastHumanMessageAt?: boolean;
  totalMessages?: 'increment' | number;
  customFields?: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════
// MESSAGE PERSISTENCE
// ═══════════════════════════════════════════════════════════════

/**
 * Save a message to chatbot_mensagens
 * 
 * @example
 * await saveMessage(supabase, {
 *   conversaId: 'abc-123',
 *   role: 'assistant',
 *   content: 'Olá! Como posso ajudar?',
 *   handlerType: 'fast_path'
 * });
 */
export async function saveMessage(
  supabase: SupabaseClient,
  options: SaveMessageOptions
): Promise<SaveMessageResult> {
  const {
    conversaId,
    role,
    content,
    messageId = null,
    handlerType = null,
    isQuickReply = false,
  } = options;

  try {
    const { data, error } = await supabase
      .from('chatbot_mensagens')
      .insert({
        conversa_id: conversaId,
        role,
        content,
        message_id: messageId,
        handler_type: handlerType,
        is_quick_reply: isQuickReply,
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) {
      console.error(`[MESSAGE_HELPERS] Failed to save ${role} message:`, error);
      return { success: false, error: error.message };
    }

    return { success: true, id: data.id };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[MESSAGE_HELPERS] Exception saving ${role} message:`, errorMsg);
    return { success: false, error: errorMsg };
  }
}

/**
 * Save user message with automatic conversation timestamp update
 */
export async function saveUserMessage(
  supabase: SupabaseClient,
  conversaId: string,
  content: string,
  messageId?: string | null
): Promise<SaveMessageResult> {
  const result = await saveMessage(supabase, {
    conversaId,
    role: 'user',
    content,
    messageId,
  });

  if (result.success) {
    await updateConversaTimestamps(supabase, conversaId, {
      lastMessageAt: true,
      lastHumanMessageAt: true,
      totalMessages: 'increment',
    });
  }

  return result;
}

/**
 * Save assistant message with automatic conversation timestamp update
 */
export async function saveAssistantMessage(
  supabase: SupabaseClient,
  conversaId: string,
  content: string,
  handlerType?: string | null
): Promise<SaveMessageResult> {
  const result = await saveMessage(supabase, {
    conversaId,
    role: 'assistant',
    content,
    handlerType,
  });

  if (result.success) {
    await updateConversaTimestamps(supabase, conversaId, {
      lastMessageAt: true,
      lastSofiaMessageAt: true,
      totalMessages: 'increment',
    });
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════
// CONVERSATION UPDATES
// ═══════════════════════════════════════════════════════════════

/**
 * Update conversation timestamps and counters
 */
export async function updateConversaTimestamps(
  supabase: SupabaseClient,
  conversaId: string,
  options: UpdateConversaOptions
): Promise<boolean> {
  const updates: Record<string, unknown> = {};
  const now = new Date().toISOString();

  if (options.lastMessageAt) {
    updates.last_message_at = now;
  }
  if (options.lastSofiaMessageAt) {
    updates.last_sofia_message_at = now;
  }
  if (options.lastHumanMessageAt) {
    updates.last_human_message_at = now;
  }
  if (options.customFields) {
    Object.assign(updates, options.customFields);
  }

  // Handle increment separately with RPC if needed
  if (options.totalMessages === 'increment') {
    // For now, we'll skip the increment since it requires an RPC
    // The update will still proceed with other fields
  } else if (typeof options.totalMessages === 'number') {
    updates.total_messages = options.totalMessages;
  }

  if (Object.keys(updates).length === 0) {
    return true;
  }

  try {
    const { error } = await supabase
      .from('chatbot_conversas')
      .update(updates)
      .eq('id', conversaId);

    if (error) {
      console.error('[MESSAGE_HELPERS] Failed to update conversa:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[MESSAGE_HELPERS] Exception updating conversa:', err);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// MESSAGE HISTORY
// ═══════════════════════════════════════════════════════════════

export interface HistoryMessage {
  role: MessageRole;
  content: string;
  createdAt: string;
  handlerType?: string | null;
}

/**
 * Fetch message history for a conversation
 * 
 * @param limit Max messages to fetch (default 50)
 * @param beforeTimestamp Fetch messages before this timestamp (for pagination)
 */
export async function getMessageHistory(
  supabase: SupabaseClient,
  conversaId: string,
  limit = 50,
  beforeTimestamp?: string
): Promise<HistoryMessage[]> {
  try {
    let query = supabase
      .from('chatbot_mensagens')
      .select('role, content, created_at, handler_type')
      .eq('conversa_id', conversaId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (beforeTimestamp) {
      query = query.lt('created_at', beforeTimestamp);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[MESSAGE_HELPERS] Failed to fetch history:', error);
      return [];
    }

    // Reverse to get chronological order
    return (data || []).reverse().map(msg => ({
      role: msg.role as MessageRole,
      content: msg.content,
      createdAt: msg.created_at,
      handlerType: msg.handler_type,
    }));
  } catch (err) {
    console.error('[MESSAGE_HELPERS] Exception fetching history:', err);
    return [];
  }
}

/**
 * Count total messages in a conversation
 */
export async function countMessages(
  supabase: SupabaseClient,
  conversaId: string,
  role?: MessageRole
): Promise<number> {
  try {
    let query = supabase
      .from('chatbot_mensagens')
      .select('id', { count: 'exact', head: true })
      .eq('conversa_id', conversaId);

    if (role) {
      query = query.eq('role', role);
    }

    const { count, error } = await query;

    if (error) {
      console.error('[MESSAGE_HELPERS] Failed to count messages:', error);
      return 0;
    }

    return count || 0;
  } catch (err) {
    console.error('[MESSAGE_HELPERS] Exception counting messages:', err);
    return 0;
  }
}

// ═══════════════════════════════════════════════════════════════
// BULK OPERATIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Save multiple messages in a single transaction
 */
export async function saveMessages(
  supabase: SupabaseClient,
  messages: SaveMessageOptions[]
): Promise<{ success: boolean; savedCount: number; errors: string[] }> {
  const errors: string[] = [];
  let savedCount = 0;

  const records = messages.map(msg => ({
    conversa_id: msg.conversaId,
    role: msg.role,
    content: msg.content,
    message_id: msg.messageId || null,
    handler_type: msg.handlerType || null,
    is_quick_reply: msg.isQuickReply || false,
    created_at: new Date().toISOString(),
  }));

  try {
    const { data, error } = await supabase
      .from('chatbot_mensagens')
      .insert(records)
      .select('id');

    if (error) {
      errors.push(error.message);
    } else {
      savedCount = data?.length || 0;
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  return {
    success: errors.length === 0,
    savedCount,
    errors,
  };
}
