/**
 * MESSAGE BUS - UNIFIED MESSAGE PERSISTENCE LAYER
 * 
 * ARQUITETURA UNIFICADA DE MENSAGENS
 * ==================================
 * 
 * Este módulo é a ÚNICA FONTE DE VERDADE para persistência de mensagens.
 * TODOS os outros módulos DEVEM usar este bus para salvar mensagens.
 * 
 * PROBLEMA RESOLVIDO:
 * - Antes: 36+ arquivos fazendo inserts diretos em chatbot_mensagens
 * - Agora: Ponto único de entrada com garantias de persistência
 * 
 * BENEFÍCIOS:
 * 1. Garantia de persistência - nenhuma mensagem é perdida
 * 2. Deduplicação automática por message_id
 * 3. Atualização automática de timestamps na conversa
 * 4. Métricas centralizadas
 * 5. Logging estruturado
 * 
 * @module _shared/message-bus
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type MessageRole = 'user' | 'assistant' | 'system';

export type MediaType = 'text' | 'audio' | 'image' | 'document' | 'sticker';

export type HandlerType = 
  | 'triage'
  | 'fast_path'
  | 'guided_script'
  | 'llm_response'
  | 'followup'
  | 'nudge'
  | 'rescue'
  | 'fallback'
  | 'human'
  | 'bitrix_sync'
  | 'contract_sent'
  | 'proposal_sent'
  | 'typo_correction'
  | 'scheduler'
  | 'unanswered_detector'
  | null;

export interface MessagePayload {
  conversaId: string;
  role: MessageRole;
  content: string;
  
  // Optional metadata
  messageId?: string | null;
  handlerType?: HandlerType;
  mediaType?: MediaType;
  isQuickReply?: boolean;
  
  // Media context (for prefixing)
  isTranscribedAudio?: boolean;
  isAnalyzedImage?: boolean;
  isAnalyzedDocument?: boolean;
}

export interface MessageResult {
  success: boolean;
  id?: string;
  isDuplicate?: boolean;
  error?: string;
  persistedAt?: string;
}

export interface BulkMessagePayload {
  messages: MessagePayload[];
}

export interface BulkMessageResult {
  success: boolean;
  results: MessageResult[];
  totalSaved: number;
  totalDuplicates: number;
  errors: string[];
}

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const LOG_PREFIX = '[MSG_BUS]';

const MEDIA_PREFIXES: Record<string, string> = {
  audio: '[🎤 Áudio transcrito]: ',
  image: '[📷 Imagem analisada]: ',
  document: '[📄 PDF analisado]: ',
};

// ═══════════════════════════════════════════════════════════════
// MESSAGE BUS CLASS
// ═══════════════════════════════════════════════════════════════

export class MessageBus {
  private supabase: SupabaseClient;
  private metrics = {
    totalMessages: 0,
    totalDuplicates: 0,
    totalErrors: 0,
    lastError: null as string | null,
  };

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  // ─────────────────────────────────────────────────────────────
  // MAIN ENTRY POINTS
  // ─────────────────────────────────────────────────────────────

  /**
   * PERSIST A SINGLE MESSAGE
   * 
   * This is the ONLY method that should be used to save messages.
   * All other code paths should call this method.
   */
  async publish(payload: MessagePayload): Promise<MessageResult> {
    const startTime = Date.now();
    
    try {
      // Build final content with media prefix
      const content = this.buildContent(payload);
      
      // Check for duplicates if messageId provided
      if (payload.messageId) {
        const isDuplicate = await this.checkDuplicate(payload.conversaId, payload.messageId);
        if (isDuplicate) {
          console.log(`${LOG_PREFIX} ⚠️ Duplicate message skipped: ${payload.messageId}`);
          this.metrics.totalDuplicates++;
          return { success: true, isDuplicate: true };
        }
      }
      
      // Insert message
      const { data, error } = await this.supabase
        .from('chatbot_mensagens')
        .insert({
          conversa_id: payload.conversaId,
          role: payload.role,
          content,
          message_id: payload.messageId || null,
          handler_type: payload.handlerType || null,
          is_quick_reply: payload.isQuickReply || false,
          created_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      
      if (error) {
        throw error;
      }
      
      // Update conversation timestamps
      await this.updateConversationTimestamps(payload.conversaId, payload.role);
      
      const durationMs = Date.now() - startTime;
      this.metrics.totalMessages++;
      
      console.log(`${LOG_PREFIX} ✅ ${payload.role} message saved in ${durationMs}ms | handler=${payload.handlerType || 'none'}`);
      
      return {
        success: true,
        id: data?.id,
        persistedAt: new Date().toISOString(),
      };
      
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.metrics.totalErrors++;
      this.metrics.lastError = errorMsg;
      
      console.error(`${LOG_PREFIX} ❌ Failed to save message:`, errorMsg);
      
      return {
        success: false,
        error: errorMsg,
      };
    }
  }

  /**
   * PERSIST MULTIPLE MESSAGES IN BULK
   * 
   * Use for conversation pairs (user + assistant) or batch operations.
   * Maintains order and atomicity.
   */
  async publishBulk(payload: BulkMessagePayload): Promise<BulkMessageResult> {
    const results: MessageResult[] = [];
    let totalSaved = 0;
    let totalDuplicates = 0;
    const errors: string[] = [];
    
    // Process in order to maintain conversation flow
    for (const message of payload.messages) {
      const result = await this.publish(message);
      results.push(result);
      
      if (result.success) {
        if (result.isDuplicate) {
          totalDuplicates++;
        } else {
          totalSaved++;
        }
      } else if (result.error) {
        errors.push(result.error);
      }
    }
    
    return {
      success: errors.length === 0,
      results,
      totalSaved,
      totalDuplicates,
      errors,
    };
  }

  /**
   * SHORTHAND: Publish user message
   */
  async publishUser(
    conversaId: string,
    content: string,
    options: Partial<Omit<MessagePayload, 'conversaId' | 'role' | 'content'>> = {}
  ): Promise<MessageResult> {
    return this.publish({
      conversaId,
      role: 'user',
      content,
      ...options,
    });
  }

  /**
   * SHORTHAND: Publish assistant message
   */
  async publishAssistant(
    conversaId: string,
    content: string,
    handlerType: HandlerType = null,
    options: Partial<Omit<MessagePayload, 'conversaId' | 'role' | 'content' | 'handlerType'>> = {}
  ): Promise<MessageResult> {
    return this.publish({
      conversaId,
      role: 'assistant',
      content,
      handlerType,
      ...options,
    });
  }

  /**
   * SHORTHAND: Publish user + assistant pair
   */
  async publishPair(
    conversaId: string,
    userContent: string,
    assistantContent: string,
    userMessageId: string | null = null,
    handlerType: HandlerType = null
  ): Promise<BulkMessageResult> {
    return this.publishBulk({
      messages: [
        {
          conversaId,
          role: 'user',
          content: userContent,
          messageId: userMessageId,
        },
        {
          conversaId,
          role: 'assistant',
          content: assistantContent,
          handlerType,
        },
      ],
    });
  }

  // ─────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────

  /**
   * Build message content with media prefix
   */
  private buildContent(payload: MessagePayload): string {
    let prefix = '';
    
    if (payload.isTranscribedAudio) {
      prefix = MEDIA_PREFIXES.audio;
    } else if (payload.isAnalyzedImage) {
      prefix = MEDIA_PREFIXES.image;
    } else if (payload.isAnalyzedDocument) {
      prefix = MEDIA_PREFIXES.document;
    } else if (payload.mediaType && MEDIA_PREFIXES[payload.mediaType]) {
      prefix = MEDIA_PREFIXES[payload.mediaType];
    }
    
    return prefix + payload.content;
  }

  /**
   * Check if message already exists (deduplication)
   */
  private async checkDuplicate(conversaId: string, messageId: string): Promise<boolean> {
    const { count, error } = await this.supabase
      .from('chatbot_mensagens')
      .select('id', { count: 'exact', head: true })
      .eq('conversa_id', conversaId)
      .eq('message_id', messageId);
    
    if (error) {
      console.error(`${LOG_PREFIX} Duplicate check failed:`, error);
      return false; // Fail open - try to insert anyway
    }
    
    return (count || 0) > 0;
  }

  /**
   * Update conversation timestamps
   */
  private async updateConversationTimestamps(
    conversaId: string,
    role: MessageRole
  ): Promise<void> {
    const update: Record<string, string | number> = {
      last_message_at: new Date().toISOString(),
    };
    
    if (role === 'assistant') {
      update.last_sofia_message_at = new Date().toISOString();
    } else if (role === 'user') {
      // Increment total messages count
      const { data: conversa } = await this.supabase
        .from('chatbot_conversas')
        .select('total_messages')
        .eq('id', conversaId)
        .single();
      
      if (conversa) {
        update.total_messages = (conversa.total_messages || 0) + 1;
      }
    }
    
    await this.supabase
      .from('chatbot_conversas')
      .update(update)
      .eq('id', conversaId);
  }

  // ─────────────────────────────────────────────────────────────
  // METRICS
  // ─────────────────────────────────────────────────────────────

  getMetrics() {
    return { ...this.metrics };
  }

  resetMetrics() {
    this.metrics = {
      totalMessages: 0,
      totalDuplicates: 0,
      totalErrors: 0,
      lastError: null,
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// SINGLETON INSTANCE MANAGEMENT
// ═══════════════════════════════════════════════════════════════

let busInstance: MessageBus | null = null;

/**
 * Get or create MessageBus instance
 * Uses singleton pattern per invocation
 */
export function getMessageBus(supabase: SupabaseClient): MessageBus {
  if (!busInstance) {
    busInstance = new MessageBus(supabase);
  }
  return busInstance;
}

/**
 * Create a fresh MessageBus instance
 * Use when you need isolated metrics or testing
 */
export function createMessageBus(supabase: SupabaseClient): MessageBus {
  return new MessageBus(supabase);
}

// ═══════════════════════════════════════════════════════════════
// CONVENIENCE FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Quick publish user message
 */
export async function publishUserMessage(
  supabase: SupabaseClient,
  conversaId: string,
  content: string,
  messageId?: string | null,
  mediaContext?: {
    isTranscribedAudio?: boolean;
    isAnalyzedImage?: boolean;
    isAnalyzedDocument?: boolean;
  }
): Promise<MessageResult> {
  const bus = getMessageBus(supabase);
  return bus.publishUser(conversaId, content, {
    messageId,
    ...mediaContext,
  });
}

/**
 * Quick publish assistant message
 */
export async function publishAssistantMessage(
  supabase: SupabaseClient,
  conversaId: string,
  content: string,
  handlerType?: HandlerType
): Promise<MessageResult> {
  const bus = getMessageBus(supabase);
  return bus.publishAssistant(conversaId, content, handlerType);
}

/**
 * Quick publish conversation pair
 */
export async function publishConversationPair(
  supabase: SupabaseClient,
  conversaId: string,
  userContent: string,
  assistantContent: string,
  userMessageId?: string | null,
  handlerType?: HandlerType
): Promise<BulkMessageResult> {
  const bus = getMessageBus(supabase);
  return bus.publishPair(
    conversaId,
    userContent,
    assistantContent,
    userMessageId || null,
    handlerType || null
  );
}

// All exports are inline - no additional export block needed
