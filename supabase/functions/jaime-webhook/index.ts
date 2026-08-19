import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getStrictCorsHeaders, handleCorsPrelight } from '../_shared/security-helpers.ts';

/**
 * jaime-webhook: Wrapper for JAIme agent
 * 
 * This is a lightweight wrapper that forwards requests to z-api-webhook
 * with the agent_id set to 'jaime'. The z-api-webhook handles message
 * parsing, deduplication, and then forwards to sofia-webhook for AI processing.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  const corsHeaders = getStrictCorsHeaders(req);
  
  if (req.method === 'OPTIONS') {
    return handleCorsPrelight(req, { mode: 'strict' });
  }

  try {
    // Parse the incoming request body
    const body = await req.json();
    
    // Inject the agent_id into the payload
    const enrichedBody = {
      ...body,
      _agentId: 'jaime',
    };
    
    console.log('[jaime-webhook] Forwarding request to z-api-webhook with agent_id: jaime');
    
    // Forward to z-api-webhook (which handles parsing and then calls sofia-webhook)
    const response = await fetch(`${SUPABASE_URL}/functions/v1/z-api-webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify(enrichedBody),
    });
    
    const result = await response.text();
    
    console.log('[jaime-webhook] Response status:', response.status);
    
    return new Response(result, {
      status: response.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    console.error('[jaime-webhook] Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      agent: 'jaime'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
