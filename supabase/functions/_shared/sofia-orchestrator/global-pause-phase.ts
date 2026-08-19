/**
 * GLOBAL PAUSE PHASE
 * 
 * Handles the Sofia global pause check - when Sofia is globally disabled,
 * messages are saved but no AI processing occurs.
 * Extracted from sofia-webhook/index.ts lines 940-1069
 * 
 * @module _shared/sofia-orchestrator/global-pause-phase
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.90.0';
import { corsHeaders } from '../webhook-types.ts';
import type { PhaseMetricsCollector } from './observability/index.ts';
import { PHASE_INDICES } from './observability/constants.ts';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface GlobalPauseContext {
  supabase: SupabaseClient;
  phone: string;
  agentId: string;
  clienteNome?: string | null;
  messageText: string;
  messageId?: string | null;
  getABVariant: (sessionId: string) => 'A' | 'B';
  /** Optional metrics collector for observability */
  metrics?: PhaseMetricsCollector;
}

export interface GlobalPauseResult {
  handled: boolean;
  response?: Response;
  isPaused: boolean;
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Check Sofia Global Pause Status
// ═══════════════════════════════════════════════════════════════

/**
 * Check if Sofia is globally paused via system configuration
 */
export async function checkGlobalPauseStatus(
  supabase: SupabaseClient
): Promise<boolean> {
  const { data: pauseConfig } = await supabase
    .from('configuracoes_sistema')
    .select('valor')
    .eq('chave', 'sofia_pausada')
    .maybeSingle();
  
  return pauseConfig?.valor === 'true';
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Save Message While Paused
// ═══════════════════════════════════════════════════════════════

/**
 * Find or create conversation and save incoming message while Sofia is paused
 */
async function saveMessageWhilePaused(
  supabase: SupabaseClient,
  phone: string,
  agentId: string,
  clienteNome: string | null,
  messageText: string,
  messageId: string | null,
  getABVariant: (sessionId: string) => 'A' | 'B'
): Promise<{ conversaId: string | null; saved: boolean }> {
  // Find existing conversation
  const { data: existingConversa } = await supabase
    .from('chatbot_conversas')
    .select('id')
    .eq('cliente_telefone', phone)
    .eq('agent_id', agentId)
    .eq('whatsapp_provider', 'zapi')
    .is('ended_at', null)
    .limit(1)
    .maybeSingle();
  
  let conversaId = existingConversa?.id || null;
  
  // Create new conversation if none exists
  if (!conversaId) {
    const sessionId = crypto.randomUUID();
    
    const { data: newConversa, error: createError } = await supabase
      .from('chatbot_conversas')
      .insert({
        session_id: sessionId,
        cliente_telefone: phone,
        cliente_nome: clienteNome,
        agent_id: agentId,
        lead_source: 'whatsapp_inbound',
        lead_score: 10,
        sofia_mode: 'standard',
        ab_variant: getABVariant(sessionId),
        whatsapp_provider: 'zapi',
        total_messages: 1,
      })
      .select('id')
      .single();
    
    // Handle race condition - if unique constraint hit, fetch existing
    if (createError && (createError.code === '23505' || createError.message?.includes('unique'))) {
      console.log('[GLOBAL_PAUSE] Race condition in paused flow - fetching existing conversation');
      
      const { data: raceConversa } = await supabase
        .from('chatbot_conversas')
        .select('id')
        .eq('cliente_telefone', phone)
        .eq('agent_id', agentId)
        .eq('whatsapp_provider', 'zapi')
        .is('ended_at', null)
        .limit(1)
        .single();
      
      conversaId = raceConversa?.id || null;
    } else {
      conversaId = newConversa?.id || null;
    }
  }
  
  // Save message if we have a conversation
  if (conversaId) {
    await supabase.from('chatbot_mensagens').insert({
      conversa_id: conversaId,
      role: 'user',
      content: messageText,
      message_id: messageId || null,
    });
    
    // Get current message count
    const { count } = await supabase
      .from('chatbot_mensagens')
      .select('id', { count: 'exact' })
      .eq('conversa_id', conversaId);
    
    // Update conversation metadata
    await supabase
      .from('chatbot_conversas')
      .update({
        last_message_at: new Date().toISOString(),
        // Reset nudge state when lead responds
        awaiting_response: false,
        nudge_count: 0,
        next_nudge_at: null,
        total_messages: count || 1,
      })
      .eq('id', conversaId);
    
    return { conversaId, saved: true };
  }
  
  return { conversaId: null, saved: false };
}

// ═══════════════════════════════════════════════════════════════
// MAIN EXECUTION FUNCTION
// ═══════════════════════════════════════════════════════════════

/**
 * Execute global pause phase
 * Checks if Sofia is globally paused and saves message without processing
 */
export async function executeGlobalPausePhase(
  ctx: GlobalPauseContext
): Promise<GlobalPauseResult> {
  const {
    supabase,
    phone,
    agentId,
    clienteNome,
    messageText,
    messageId,
    getABVariant,
    metrics,
  } = ctx;
  
  const phaseName = 'global_pause';
  const phaseIndex = PHASE_INDICES.global_pause ?? 1;
  
  // Start metrics tracking
  metrics?.startPhase(phaseName, phaseIndex);
  
  try {
    // Check global pause status
    const isSofiaPausada = await checkGlobalPauseStatus(supabase);
    
    if (!isSofiaPausada) {
      // End phase - not paused, continue pipeline
      metrics?.endPhase(phaseName, {
        handled: false,
        action: 'continue',
        metadata: { isPaused: false },
      });
      
      return {
        handled: false,
        isPaused: false,
      };
    }
    
    console.log('[GLOBAL_PAUSE] ⏸️ Sofia is globally paused - saving message without processing');
    
    // Save message while paused
    const saveResult = await saveMessageWhilePaused(
      supabase,
      phone,
      agentId,
      clienteNome || null,
      messageText,
      messageId || null,
      getABVariant
    );
    
    // End phase - paused and handled
    metrics?.endPhase(phaseName, {
      handled: true,
      action: 'message_saved_while_paused',
      metadata: {
        isPaused: true,
        messageSaved: saveResult.saved,
        conversaId: saveResult.conversaId,
      },
    });
    
    return {
      handled: true,
      isPaused: true,
      response: new Response(JSON.stringify({
        status: 'paused',
        reason: 'sofIA is currently paused',
        message_saved: saveResult.saved,
        conversaId: saveResult.conversaId,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }),
    };
  } catch (error) {
    // Record phase failure
    metrics?.failPhase(phaseName, error as Error);
    throw error;
  }
}
