import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsPrelight, errorResponse } from '../_shared/security-helpers.ts';
import { validateRetellWebhook, parseAndValidate, type RetellWebhookPayload } from '../_shared/zod-schemas.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

function determineOutcome(event: RetellWebhookPayload): string {
  const disconnectReason = event.call.disconnection_reason?.toLowerCase() || '';
  
  if (disconnectReason.includes('no_answer') || disconnectReason.includes('no answer')) {
    return 'no_answer';
  }
  if (disconnectReason.includes('busy')) {
    return 'busy';
  }
  if (disconnectReason.includes('voicemail') || disconnectReason.includes('machine')) {
    return 'voicemail';
  }
  if (disconnectReason.includes('rejected') || disconnectReason.includes('declined')) {
    return 'rejected';
  }
  if (disconnectReason.includes('error') || disconnectReason.includes('failed')) {
    return 'error';
  }
  
  // If call had transcript, it was answered
  if (event.transcript && event.transcript.length > 50) {
    return 'answered';
  }
  
  // Check call analysis for success
  if (event.call_analysis?.call_successful) {
    return 'answered';
  }
  
  return 'unknown';
}

function extractIntent(transcript: string): string {
  const lower = transcript.toLowerCase();
  
  if (lower.includes('não quero') || lower.includes('não tenho interesse') || lower.includes('tchau')) {
    return 'negative';
  }
  if (lower.includes('manda') || lower.includes('envia') || lower.includes('whatsapp') || lower.includes('proposta')) {
    return 'positive_whatsapp';
  }
  if (lower.includes('liga depois') || lower.includes('outro horário') || lower.includes('amanhã')) {
    return 'callback_requested';
  }
  if (lower.includes('já tenho') || lower.includes('outra empresa') || lower.includes('já fechei')) {
    return 'already_has_provider';
  }
  
  return 'neutral';
}

function determineNextAction(outcome: string, intent: string): string {
  if (outcome === 'no_answer' || outcome === 'busy') {
    return 'retry_later';
  }
  if (outcome === 'voicemail') {
    return 'send_sms';
  }
  if (intent === 'positive_whatsapp') {
    return 'send_whatsapp_proposal';
  }
  if (intent === 'callback_requested') {
    return 'schedule_callback';
  }
  if (intent === 'negative' || intent === 'already_has_provider') {
    return 'mark_not_interested';
  }
  
  return 'manual_review';
}

// ═══════════════════════════════════════════════════════════════
// HANDLER
// ═══════════════════════════════════════════════════════════════

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req, { mode: 'auto' });
  
  if (req.method === 'OPTIONS') {
    return handleCorsPrelight(req);
  }

  try {
    // Validate payload
    const validation = await parseAndValidate(req, validateRetellWebhook);
    if (!validation.success) {
      return errorResponse(validation.error, validation.status, req);
    }
    
    const event = validation.data;
    
    console.log('📲 Retell webhook received:', {
      event: event.event,
      call_id: event.call.call_id,
      status: event.call.call_status,
      queue_id: event.call.metadata?.queue_id,
    });
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // Only process call_ended and call_analyzed events
    if (event.event === 'call_started') {
      console.log('📲 Call started - no action needed');
      return new Response(
        JSON.stringify({ received: true, action: 'none' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const queueId = event.call.metadata?.queue_id;
    
    if (!queueId) {
      console.log('📲 No queue_id in metadata - skipping');
      return new Response(
        JSON.stringify({ received: true, action: 'skipped', reason: 'no_queue_id' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Calculate call duration
    let durationSeconds: number | null = null;
    if (event.call.start_timestamp && event.call.end_timestamp) {
      durationSeconds = Math.round((event.call.end_timestamp - event.call.start_timestamp) / 1000);
    }
    
    // Determine outcome and intent
    const outcome = determineOutcome(event);
    const intent = event.transcript ? extractIntent(event.transcript) : 'unknown';
    const nextAction = determineNextAction(outcome, intent);
    
    console.log('📲 Call analysis:', {
      queue_id: queueId,
      outcome,
      intent,
      next_action: nextAction,
      duration_seconds: durationSeconds,
    });
    
    // 1. Save to outbound_call_results
    const { data: resultData, error: resultError } = await supabase
      .from('outbound_call_results')
      .insert({
        queue_id: queueId,
        retell_call_id: event.call.call_id,
        outcome,
        call_duration_seconds: durationSeconds,
        transcript: event.transcript || null,
        summary: event.call_analysis?.call_summary || null,
        sentiment: event.call_analysis?.user_sentiment || null,
        intent_detected: intent,
        next_action: nextAction,
        recording_url: event.recording_url || null,
        retell_response: event as unknown as Record<string, unknown>,
      })
      .select()
      .single();
    
    if (resultError) {
      console.error('Error saving call result:', resultError);
    }
    
    // 2. Update queue status
    const newQueueStatus = outcome === 'answered' && (intent === 'positive_whatsapp' || intent === 'neutral') 
      ? 'completed' 
      : outcome === 'no_answer' || outcome === 'busy' 
        ? 'pending' 
        : 'failed';
    
    // Fetch current queue item for retry logic
    const { data: queueItem } = await supabase
      .from('outbound_call_queue')
      .select('attempts, campaign_id')
      .eq('id', queueId)
      .single();
    
    // ZERO HARDCODE: Load retry config from database
    const { data: retellConfig } = await supabase
      .from('configuracoes_sistema')
      .select('chave, valor')
      .in('chave', ['retell_max_call_attempts', 'retell_retry_delay_hours']);
    
    const configMap = new Map(retellConfig?.map(c => [c.chave, c.valor]) || []);
    const maxAttempts = parseInt(configMap.get('retell_max_call_attempts') || '3', 10);
    const retryDelayHours = parseInt(configMap.get('retell_retry_delay_hours') || '2', 10);
    
    const shouldRetry = newQueueStatus === 'pending' && (queueItem?.attempts || 0) < maxAttempts;
    
    // Calculate next retry time dynamically
    const nextScheduledAt = shouldRetry 
      ? new Date(Date.now() + retryDelayHours * 60 * 60 * 1000).toISOString() 
      : null;
    
    await supabase.from('outbound_call_queue').update({
      status: shouldRetry ? 'scheduled' : newQueueStatus,
      scheduled_at: nextScheduledAt,
      updated_at: new Date().toISOString(),
    }).eq('id', queueId);
    
    // 3. If positive, trigger WhatsApp flow
    if (intent === 'positive_whatsapp') {
      console.log('📲 Positive response - triggering WhatsApp proposal');
      
      // Get lead data for WhatsApp
      const { data: queueData } = await supabase
        .from('outbound_call_queue')
        .select('phone, customer_name, lead_context, bitrix_lead_id')
        .eq('id', queueId)
        .single();
      
      if (queueData?.phone) {
        try {
          // Call z-api-send-message to send proposal prompt
          const proposalMessage = `Olá${queueData.customer_name ? ` ${queueData.customer_name}` : ''}! 📲

Conforme conversamos na ligação, vou te enviar todas as informações sobre a economia na sua conta de luz.

Para gerar sua proposta personalizada, preciso apenas de algumas informações. Qual o valor médio da sua conta de luz?`;
          
          const sendResult = await supabase.functions.invoke('z-api-send-message', {
            body: {
              phone: queueData.phone,
              message: proposalMessage,
              agentId: 'sofia',
              source: 'retell-call-followup',
            },
          });
          
          console.log('📲 WhatsApp proposal prompt sent:', sendResult.data?.success ? 'OK' : 'FAILED');
          
          // Update queue with WhatsApp status
          await supabase.from('outbound_call_queue').update({
            status: 'completed',
            updated_at: new Date().toISOString(),
          }).eq('id', queueId);
          
        } catch (whatsappError) {
          console.error('📲 Error sending WhatsApp:', whatsappError);
        }
      }
    }
    
    // 4. Update Bitrix if lead_id exists
    const bitrixLeadId = event.call.metadata?.bitrix_lead_id;
    if (bitrixLeadId) {
      try {
        console.log('📲 Updating Bitrix lead:', bitrixLeadId);
        
        // Map call outcome to Bitrix fields
        const bitrixFields: Record<string, string> = {
          'UF_CRM_LAST_CALL_OUTCOME': outcome,
          'UF_CRM_LAST_CALL_DATE': new Date().toISOString(),
        };
        
        if (event.call_analysis?.call_summary) {
          bitrixFields['UF_CRM_CALL_SUMMARY'] = event.call_analysis.call_summary.substring(0, 500);
        }
        
        // Invoke bitrix update
        const bitrixResult = await supabase.functions.invoke('sofia-bitrix-lead', {
          body: {
            action: 'update_call_result',
            leadId: bitrixLeadId,
            fields: bitrixFields,
            callOutcome: outcome,
            callIntent: intent,
            callDuration: durationSeconds,
          },
        });
        
        console.log('📲 Bitrix update result:', bitrixResult.data?.success ? 'OK' : 'FAILED');
        
      } catch (bitrixError) {
        console.error('📲 Error updating Bitrix:', bitrixError);
      }
    }
    
    return new Response(
      JSON.stringify({
        received: true,
        queue_id: queueId,
        outcome,
        intent,
        next_action: nextAction,
        queue_status: shouldRetry ? 'scheduled' : newQueueStatus,
        result_id: resultData?.id,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('Retell webhook error:', error);
    
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
