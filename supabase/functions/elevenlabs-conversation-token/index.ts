import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getStrictCorsHeaders, handleCorsPrelight } from '../_shared/security-helpers.ts';

serve(async (req) => {
  const corsHeaders = getStrictCorsHeaders(req);
  
  if (req.method === 'OPTIONS') {
    return handleCorsPrelight(req, { mode: 'strict' });
  }

  try {
    const { agentId, agentDbId } = await req.json();
    
    console.log('[ConvToken] Generating conversation token for agent:', agentId);

    // Try to get API key from agent_secrets first
    let apiKey = Deno.env.get('ELEVENLABS_API_KEY');
    let elevenLabsAgentId: string | null = null;
    
    if (agentDbId) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      // Check for agent-specific ElevenLabs API key
      const { data: secrets } = await supabase
        .from('agent_secrets')
        .select('secret_name, secret_key, is_configured')
        .eq('agent_id', agentDbId)
        .in('mode', ['inbound', 'shared']);

      if (secrets) {
        for (const secret of secrets) {
          if (secret.secret_name.includes('ELEVENLABS') && secret.secret_name.includes('API') && secret.is_configured) {
            // The secret_key is the reference to the actual secret in env
            const envKey = Deno.env.get(secret.secret_key);
            if (envKey) {
              apiKey = envKey;
              console.log('[ConvToken] Using agent-specific API key');
            }
          }
          if (secret.secret_name.includes('AGENT_ID') && secret.is_configured) {
            const envAgentId = Deno.env.get(secret.secret_key);
            if (envAgentId) {
              elevenLabsAgentId = envAgentId;
              console.log('[ConvToken] Using agent-specific ElevenLabs Agent ID:', elevenLabsAgentId);
            }
          }
        }
      }

      // Also check voice_config for agent_id
      const { data: agent } = await supabase
        .from('ai_agents')
        .select('voice_config')
        .eq('id', agentDbId)
        .single();

      if (agent?.voice_config?.inbound?.agent_id) {
        elevenLabsAgentId = agent.voice_config.inbound.agent_id;
        console.log('[ConvToken] Using voice_config agent_id:', elevenLabsAgentId);
      }
    }

    if (!apiKey) {
      throw new Error('ELEVENLABS_API_KEY not configured');
    }

    if (!elevenLabsAgentId) {
      // Use default agent ID from env if not configured per-agent
      elevenLabsAgentId = Deno.env.get('ELEVENLABS_AGENT_ID') || null;
      
      if (!elevenLabsAgentId) {
        throw new Error('No ElevenLabs Agent ID configured. Configure it in AI Gym voice settings or set ELEVENLABS_AGENT_ID env var.');
      }
    }

    console.log('[ConvToken] Requesting token for ElevenLabs agent:', elevenLabsAgentId);

    // Generate conversation token from ElevenLabs
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${elevenLabsAgentId}`,
      {
        method: 'GET',
        headers: {
          'xi-api-key': apiKey,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[ConvToken] ElevenLabs API error:', response.status, errorText);
      throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    console.log('[ConvToken] Successfully generated signed URL');

    return new Response(
      JSON.stringify({ 
        signed_url: data.signed_url,
        agent_id: elevenLabsAgentId
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: unknown) {
    console.error('[ConvToken] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
