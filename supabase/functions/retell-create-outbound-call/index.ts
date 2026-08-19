import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getStrictCorsHeaders, handleCorsPrelight } from '../_shared/security-helpers.ts';
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Zod schema for request validation
const CreateCallRequestSchema = z.object({
  queue_id: z.string().uuid(),
  override_agent_id: z.string().max(100).optional(),
  override_from_number: z.string().max(20).optional(),
});

// ═══════════════════════════════════════════════════════════════
// INTERFACES
// ═══════════════════════════════════════════════════════════════

interface CreateCallRequest {
  queue_id: string;
  // Optional overrides
  override_agent_id?: string;
  override_from_number?: string;
}

interface RetellCallResponse {
  call_id: string;
  agent_id: string;
  call_status: string;
  metadata: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════
// HANDLER
// ═══════════════════════════════════════════════════════════════

serve(async (req) => {
  const corsHeaders = getStrictCorsHeaders(req);
  
  const preflightResponse = handleCorsPrelight(req);
  if (preflightResponse) return preflightResponse;

  try {
    const rawBody = await req.json();
    
    // Validate with Zod
    const parseResult = CreateCallRequestSchema.safeParse(rawBody);
    if (!parseResult.success) {
      console.error('[RETELL] Validation error:', parseResult.error.message);
      return new Response(
        JSON.stringify({ error: `Validation error: ${parseResult.error.errors.map(e => e.message).join(', ')}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const request = parseResult.data;
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // 1. Fetch queue item with lead data
    const { data: queueItem, error: queueError } = await supabase
      .from('outbound_call_queue')
      .select('*')
      .eq('id', request.queue_id)
      .single();
    
    if (queueError || !queueItem) {
      return new Response(
        JSON.stringify({ error: 'Queue item not found', details: queueError }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (queueItem.status !== 'pending' && queueItem.status !== 'scheduled') {
      return new Response(
        JSON.stringify({ error: `Cannot call: queue item status is ${queueItem.status}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // 2. Fetch agent voice config for outbound
    const { data: agentData } = await supabase
      .from('ai_agents')
      .select('voice_config')
      .eq('agent_id', 'sofia')
      .single();
    
    const voiceConfig = agentData?.voice_config as any;
    const outboundConfig = voiceConfig?.outbound || {};
    
    // Get config values (prioritize overrides, then agent config, then secrets)
    const retellApiKey = Deno.env.get('RETELL_API_KEY');
    const agentId = request.override_agent_id || outboundConfig.agent_id || Deno.env.get('RETELL_AGENT_ID_OUTBOUND');
    const fromNumber = request.override_from_number || outboundConfig.from_number || Deno.env.get('RETELL_FROM_NUMBER');
    
    if (!retellApiKey) {
      return new Response(
        JSON.stringify({ error: 'RETELL_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (!agentId) {
      return new Response(
        JSON.stringify({ error: 'Retell agent_id not configured (check agent voice config or RETELL_AGENT_ID_OUTBOUND secret)' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (!fromNumber) {
      return new Response(
        JSON.stringify({ error: 'from_number not configured (check agent voice config or RETELL_FROM_NUMBER secret)' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // 3. Build dynamic variables for the call
    const leadContext = queueItem.lead_context as any || {};
    const greetingTemplate = outboundConfig.settings?.greeting_template || '';
    
    const dynamicVariables = {
      customer_name: queueItem.customer_name || 'cliente',
      customer_phone: queueItem.phone,
      last_consumption: leadContext.consumption_kwh || null,
      last_proposal_discount: leadContext.discount_percentage || 25,
      days_since_contact: leadContext.days_since_contact || 7,
      bitrix_lead_id: queueItem.bitrix_lead_id || null,
      queue_id: queueItem.id,
      last_distributor: leadContext.distributor || '',
      greeting_template: greetingTemplate,
    };
    
    console.log('📞 Creating Retell outbound call:', {
      queue_id: request.queue_id,
      to_number: queueItem.phone,
      agent_id: agentId,
      from_number: fromNumber,
    });
    
    // 4. Create call via Retell API
    const retellResponse = await fetch('https://api.retellai.com/v2/create-phone-call', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${retellApiKey}`,
      },
      body: JSON.stringify({
        from_number: fromNumber,
        to_number: queueItem.phone,
        override_agent_id: agentId,
        retell_llm_dynamic_variables: dynamicVariables,
        metadata: {
          queue_id: queueItem.id,
          bitrix_lead_id: queueItem.bitrix_lead_id,
          campaign_id: queueItem.campaign_id,
        },
      }),
    });
    
    if (!retellResponse.ok) {
      const errorText = await retellResponse.text();
      console.error('Retell API error:', retellResponse.status, errorText);
      
      // Update queue status to failed
      await supabase.from('outbound_call_queue').update({
        status: 'failed',
        attempts: (queueItem.attempts || 0) + 1,
        last_attempt_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', request.queue_id);
      
      return new Response(
        JSON.stringify({ error: 'Retell API error', status: retellResponse.status, details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const retellData: RetellCallResponse = await retellResponse.json();
    
    console.log('📞 Retell call created:', retellData);
    
    // 5. Update queue with call_id and status
    await supabase.from('outbound_call_queue').update({
      status: 'calling',
      retell_call_id: retellData.call_id,
      attempts: (queueItem.attempts || 0) + 1,
      last_attempt_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', request.queue_id);
    
    return new Response(
      JSON.stringify({
        success: true,
        call_id: retellData.call_id,
        queue_id: request.queue_id,
        status: 'calling',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('Create outbound call error:', error);
    
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
