import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { loadSchedulerConfig, getCachedSchedulerConfig } from '../_shared/scheduler-config.ts';
import { getStrictCorsHeaders, handleCorsPrelight, errorResponse } from '../_shared/security-helpers.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ZAPI_INSTANCE_ID = Deno.env.get('ZAPI_INSTANCE_ID')!;
const ZAPI_TOKEN = Deno.env.get('ZAPI_TOKEN')!;
const ZAPI_SECURITY_TOKEN = Deno.env.get('ZAPI_SECURITY_TOKEN');

// ZERO HARDCODE: Fallback values - actual loaded from configuracoes_sistema
const FALLBACK_MAX_MESSAGE_LENGTH = 4000;
let MAX_MESSAGE_LENGTH = FALLBACK_MAX_MESSAGE_LENGTH;

// Fallback - will be overwritten by dynamic config
let RETRY_DELAY_MINUTES = [5, 15, 30, 60, 120];

interface PendingMessage {
  id: string;
  telefone: string;
  mensagem: string;
  agent_id: string;
  conversa_id: string | null;
  tentativas: number;
  max_tentativas: number;
  ultimo_erro: string | null;
}

/**
 * Sanitizes a message for WhatsApp
 */
function sanitizeMessage(message: string): string {
  if (!message) return '';
  let sanitized = message.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  if (sanitized.length > MAX_MESSAGE_LENGTH) {
    sanitized = sanitized.substring(0, MAX_MESSAGE_LENGTH - 3) + '...';
  }
  return sanitized.trim();
}

/**
 * Send message via z-api-send-message edge function (centralized, with kill switch)
 * This ensures retry messages also respect agent pause status
 */
async function sendViaEdgeFunction(
  phone: string,
  message: string,
  agentId: string,
  conversaId: string | null
): Promise<{ success: boolean; error?: string; statusCode?: number; blocked?: boolean; reason?: string }> {
  const sanitizedMessage = sanitizeMessage(message);
  if (!sanitizedMessage) {
    return { success: false, error: 'Empty message', statusCode: 400 };
  }
  
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/z-api-send-message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        phone,
        message: sanitizedMessage,
        agentId,
        conversaId,
        enableAsyncRetry: false, // Prevent infinite retry loop
        skipAntiSpam: true, // Already passed anti-spam on first attempt
      }),
    });
    
    const result = await response.json();
    
    // Check if blocked by agent status
    if (result.blocked) {
      console.log(`[Retry Scheduler] 🛑 Agent ${agentId} blocked send: ${result.reason}`);
      return { 
        success: false, 
        blocked: true, 
        reason: result.reason || 'agent_blocked',
        statusCode: response.status 
      };
    }
    
    if (response.ok && result.success) {
      console.log(`[Retry Scheduler] ✅ Message sent to ${phone} via edge function`);
      return { success: true, statusCode: response.status };
    }
    
    console.error(`[Retry Scheduler] ❌ Edge function failed for ${phone}: ${result.error || 'Unknown error'}`);
    return { 
      success: false, 
      error: result.error || `Status ${response.status}`,
      statusCode: response.status 
    };
    
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[Retry Scheduler] ❌ Network error calling edge function for ${phone}:`, errorMsg);
    return { success: false, error: `Network error: ${errorMsg}`, statusCode: 0 };
  }
}

/**
 * Process pending messages
 */
async function processPendingMessages(supabase: any, config: Awaited<ReturnType<typeof loadSchedulerConfig>>): Promise<{
  processed: number;
  sent: number;
  failed: number;
  maxedOut: number;
}> {
  const stats = { processed: 0, sent: 0, failed: 0, maxedOut: 0 };
  
  // Fetch pending messages that are ready for retry
  // Use dynamic config for limits
  const { data: pendingMessages, error: fetchError } = await supabase
    .from('chatbot_mensagens_pendentes')
    .select('*')
    .is('resolved_at', null)
    .lt('retry_at', new Date().toISOString())
    .lt('tentativas', config.retryMaxAttempts)
    .order('retry_at', { ascending: true })
    .limit(config.retryBatchSize);
  
  if (fetchError) {
    console.error('[Retry Scheduler] Error fetching pending messages:', fetchError);
    return stats;
  }
  
  if (!pendingMessages || pendingMessages.length === 0) {
    console.log('[Retry Scheduler] No pending messages to process');
    return stats;
  }
  
  console.log(`[Retry Scheduler] Processing ${pendingMessages.length} pending messages...`);
  
  for (const msg of pendingMessages as PendingMessage[]) {
    stats.processed++;
    
    // Send via centralized edge function (respects agent kill switch)
    const result = await sendViaEdgeFunction(msg.telefone, msg.mensagem, msg.agent_id, msg.conversa_id);
    
    if (result.success) {
      stats.sent++;
      
      // Mark as resolved
      await supabase
        .from('chatbot_mensagens_pendentes')
        .update({
          resolved_at: new Date().toISOString(),
          resolution_status: 'sent',
        })
        .eq('id', msg.id);
      
      console.log(`[Retry Scheduler] ✅ Successfully sent pending message ${msg.id}`);
      
    } else if (result.blocked) {
      // Agent is paused - reschedule for later, don't count as failure
      console.log(`[Retry Scheduler] 🛑 Agent ${msg.agent_id} is paused - rescheduling message ${msg.id}`);
      
      // Reschedule using dynamic config (default 30min)
      const nextRetry = new Date(Date.now() + config.retryAgentBlockReschedule);
      
      await supabase
        .from('chatbot_mensagens_pendentes')
        .update({
          ultimo_erro: `blocked: ${result.reason}`,
          retry_at: nextRetry.toISOString(),
          // Don't increment tentativas - this is not a real failure
        })
        .eq('id', msg.id);
      
      // Track separately (not as failed, not as sent)
      stats.failed++; // Count as "not sent this run" for stats
      
    } else {
      const newAttempts = msg.tentativas + 1;
      
      // Check if max retries exceeded
      if (newAttempts >= msg.max_tentativas) {
        stats.maxedOut++;
        
        await supabase
          .from('chatbot_mensagens_pendentes')
          .update({
            tentativas: newAttempts,
            ultimo_erro: result.error,
            ultimo_status_code: result.statusCode,
            resolved_at: new Date().toISOString(),
            resolution_status: 'max_retries',
          })
          .eq('id', msg.id);
        
        console.log(`[Retry Scheduler] ⚠️ Message ${msg.id} exceeded max retries`);
        
        // Create admin notification for permanent failure
        await supabase.from('admin_notifications').insert({
          title: '❌ Mensagem não entregue após múltiplas tentativas',
          message: `Não foi possível enviar mensagem para ${msg.telefone} após ${newAttempts} tentativas. Último erro: ${result.error?.substring(0, 100)}`,
          type: 'delivery_failure_permanent',
          entity_type: 'chatbot_conversa',
          entity_id: msg.conversa_id,
        });
        
      } else {
        stats.failed++;
        
        // Calculate next retry time with exponential backoff (dynamic config)
        const delayIndex = Math.min(newAttempts - 1, config.retryDelayMinutes.length - 1);
        const delayMinutes = config.retryDelayMinutes[delayIndex];
        const nextRetry = new Date(Date.now() + delayMinutes * 60 * 1000);
        
        await supabase
          .from('chatbot_mensagens_pendentes')
          .update({
            tentativas: newAttempts,
            ultimo_erro: result.error,
            ultimo_status_code: result.statusCode,
            retry_at: nextRetry.toISOString(),
          })
          .eq('id', msg.id);
        
        console.log(`[Retry Scheduler] Message ${msg.id} will retry in ${delayMinutes} minutes`);
      }
    }
    
    // Small delay between messages to avoid rate limiting (dynamic config)
    await new Promise(r => setTimeout(r, config.messageDelayBetween));
  }
  
  return stats;
}

serve(async (req) => {
  const corsHeaders = getStrictCorsHeaders(req);
  
  if (req.method === 'OPTIONS') {
    return handleCorsPrelight(req, { mode: 'strict' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    console.log('[Retry Scheduler] Starting pending message processing...');
    
    // Load dynamic config
    const schedulerConfig = await loadSchedulerConfig(supabase);
    RETRY_DELAY_MINUTES = schedulerConfig.retryDelayMinutes;
    
    const stats = await processPendingMessages(supabase, schedulerConfig);
    
    console.log('[Retry Scheduler] Processing complete:', stats);
    
    return new Response(JSON.stringify({
      success: true,
      stats,
      timestamp: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[Retry Scheduler] Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
