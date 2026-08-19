import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  getStrictCorsHeaders,
  handleCorsPrelight,
} from '../_shared/security-helpers.ts';
import {
  withCircuitBreaker,
  createCircuitBreaker,
  canExecute,
  recordSuccess,
  recordFailure,
  type CircuitBreakerConfig,
} from '../_shared/circuit-breaker.ts';

/**
 * proposal-retry-scheduler: Internal cron-triggered scheduler
 * SECURITY: Uses strict CORS (internal API)
 * RESILIENCE: Uses circuit breaker pattern for Bitrix24 calls
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Circuit breaker configuration for proposal generation
const PROPOSAL_CIRCUIT_CONFIG: CircuitBreakerConfig = {
  circuitId: 'proposal_generation',
  failureThreshold: 3,
  recoveryTimeMs: 2 * 60 * 1000, // 2 minutes
  successThreshold: 2,
  failureWindowMs: 10 * 60 * 1000, // 10 minute window
};

interface QueueItem {
  id: string;
  bitrix_lead_id: string;
  cliente_telefone: string | null;
  cliente_nome: string | null;
  conversa_id: string | null;
  retry_count: number;
  max_retries: number;
  request_data: Record<string, unknown> | null;
}

/**
 * Scheduler that processes proposal generation retries
 * Handles race conditions where leads move to target stage but webhook fires too early
 */
Deno.serve(async (req) => {
  console.log('[proposal-retry-scheduler] Function called:', req.method);

  // Internal API - strict CORS
  if (req.method === 'OPTIONS') {
    return handleCorsPrelight(req, { mode: 'strict' });
  }

  const corsHeaders = getStrictCorsHeaders(req);

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch pending items ready for retry
    const { data: pendingItems, error: fetchError } = await supabase
      .from('proposal_generation_queue')
      .select('*')
      .eq('status', 'pending')
      .lte('retry_at', new Date().toISOString())
      .order('retry_at', { ascending: true })
      .limit(10);

    if (fetchError) {
      console.error('[proposal-retry-scheduler] Error fetching queue:', fetchError);
      throw fetchError;
    }

    // Check circuit breaker status first
    const circuitCheck = await canExecute(supabase, 'proposal_generation');
    
    if (!circuitCheck.allowed) {
      console.log(`[proposal-retry-scheduler] ⛔ Circuit OPEN - skipping this run. Reason: ${circuitCheck.reason}`);
      return new Response(
        JSON.stringify({ 
          status: 'circuit_open', 
          processed: 0,
          circuit_state: circuitCheck.state,
          reason: circuitCheck.reason
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!pendingItems || pendingItems.length === 0) {
      console.log('[proposal-retry-scheduler] No pending retries');
      return new Response(
        JSON.stringify({ status: 'ok', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[proposal-retry-scheduler] Processing ${pendingItems.length} retry items (circuit: ${circuitCheck.state})`);

    const results = {
      processed: 0,
      success: 0,
      failed: 0,
      rescheduled: 0,
      circuitOpened: false,
    };

    for (const item of pendingItems as QueueItem[]) {
      // Re-check circuit before each item (fast path exit if circuit opened during batch)
      const itemCircuitCheck = await canExecute(supabase, 'proposal_generation');
      if (!itemCircuitCheck.allowed) {
        console.log(`[proposal-retry-scheduler] ⛔ Circuit opened mid-batch - stopping`);
        results.circuitOpened = true;
        break;
      }

      console.log(`[proposal-retry-scheduler] Processing lead ${item.bitrix_lead_id}, attempt ${item.retry_count + 1}/${item.max_retries}`);

      // Mark as processing
      await supabase
        .from('proposal_generation_queue')
        .update({ status: 'processing' })
        .eq('id', item.id);

      try {
        // Call bitrix24-webhook with forceProcess flag
        const webhookResponse = await supabase.functions.invoke('bitrix24-webhook', {
          body: {
            leadId: item.bitrix_lead_id,
            forceProcess: true,
            isRetry: true,
            retryAttempt: item.retry_count + 1,
            ...(item.request_data || {}),
          },
        });

        if (webhookResponse.error) {
          throw new Error(webhookResponse.error.message || 'Webhook invocation failed');
        }

        const responseData = webhookResponse.data;
        
        // Check if proposal was created
        if (responseData?.propostaId || responseData?.status === 'success') {
          console.log(`[proposal-retry-scheduler] Success for lead ${item.bitrix_lead_id}, proposal: ${responseData.propostaId}`);
          
          // Record success in circuit breaker
          await recordSuccess(supabase, 'proposal_generation', PROPOSAL_CIRCUIT_CONFIG);
          
          await supabase
            .from('proposal_generation_queue')
            .update({
              status: 'success',
              resolved_at: new Date().toISOString(),
            })
            .eq('id', item.id);

          results.success++;

          // Update conversa if linked
          if (item.conversa_id && responseData.propostaId) {
            await supabase
              .from('chatbot_conversas')
              .update({ proposta_id: responseData.propostaId })
              .eq('id', item.conversa_id)
              .is('proposta_id', null);
          }
        } else if (responseData?.status === 'skipped' || responseData?.status === 'ignored') {
          // Still not ready, reschedule if retries remain
          const newRetryCount = item.retry_count + 1;
          
          if (newRetryCount >= item.max_retries) {
            console.log(`[proposal-retry-scheduler] Max retries reached for lead ${item.bitrix_lead_id}`);
            await supabase
              .from('proposal_generation_queue')
              .update({
                status: 'failed',
                failure_reason: `Max retries (${item.max_retries}) reached. Last response: ${JSON.stringify(responseData)}`,
                resolved_at: new Date().toISOString(),
                retry_count: newRetryCount,
              })
              .eq('id', item.id);
            results.failed++;

            // Notify admins
            await supabase.from('admin_notifications').insert({
              admin_user_id: null,
              title: '⚠️ Retry de Proposta Falhou',
              message: `Lead ${item.bitrix_lead_id} (${item.cliente_nome || 'sem nome'}) atingiu o máximo de tentativas sem gerar proposta.`,
              type: 'warning',
              entity_type: 'bitrix24_lead',
              created_by_nome: 'Scheduler Retry',
            });
          } else {
            // Reschedule with exponential backoff (30s, 60s, 120s)
            const delaySeconds = 30 * Math.pow(2, newRetryCount);
            const nextRetry = new Date(Date.now() + delaySeconds * 1000);
            
            console.log(`[proposal-retry-scheduler] Rescheduling lead ${item.bitrix_lead_id} for ${nextRetry.toISOString()}`);
            
            await supabase
              .from('proposal_generation_queue')
              .update({
                status: 'pending',
                retry_count: newRetryCount,
                retry_at: nextRetry.toISOString(),
              })
              .eq('id', item.id);
            results.rescheduled++;
          }
        } else {
          // Unexpected response, treat as failure
          throw new Error(`Unexpected response: ${JSON.stringify(responseData)}`);
        }

      } catch (error) {
        console.error(`[proposal-retry-scheduler] Error processing lead ${item.bitrix_lead_id}:`, error);

        // Record failure in circuit breaker
        const { circuitOpened } = await recordFailure(
          supabase, 
          'proposal_generation', 
          PROPOSAL_CIRCUIT_CONFIG,
          error instanceof Error ? error.message : String(error)
        );
        
        if (circuitOpened) {
          results.circuitOpened = true;
          console.log(`[proposal-retry-scheduler] 🔴 Circuit breaker OPENED after failures`);
        }

        const newRetryCount = item.retry_count + 1;
        
        if (newRetryCount >= item.max_retries) {
          await supabase
            .from('proposal_generation_queue')
            .update({
              status: 'failed',
              failure_reason: error instanceof Error ? error.message : String(error),
              resolved_at: new Date().toISOString(),
              retry_count: newRetryCount,
            })
            .eq('id', item.id);
          results.failed++;
        } else {
          // Reschedule with exponential backoff
          const delaySeconds = 30 * Math.pow(2, newRetryCount);
          const nextRetry = new Date(Date.now() + delaySeconds * 1000);
          
          await supabase
            .from('proposal_generation_queue')
            .update({
              status: 'pending',
              retry_count: newRetryCount,
              retry_at: nextRetry.toISOString(),
              failure_reason: error instanceof Error ? error.message : String(error),
            })
            .eq('id', item.id);
          results.rescheduled++;
        }
      }

      results.processed++;
    }

    console.log('[proposal-retry-scheduler] Cycle complete:', results);

    return new Response(
      JSON.stringify({ status: 'ok', ...results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[proposal-retry-scheduler] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
