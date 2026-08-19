import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getStrictCorsHeaders, handleCorsPrelight } from '../_shared/security-helpers.ts';
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Zod schema for request validation
const WebCallRequestSchema = z.object({
  agent_db_id: z.string().uuid().optional(),
  agent_id: z.string().max(100).optional(),
  mode: z.enum(['inbound', 'outbound']).optional(),
  metadata: z.record(z.unknown()).optional(),
});

interface WebCallRequest {
  agent_db_id?: string;
  agent_id?: string;
  mode?: 'inbound' | 'outbound';
  metadata?: Record<string, unknown>;
}

interface RetellWebCallResponse {
  access_token: string;
  call_id: string;
  agent_id: string;
}

serve(async (req) => {
  const corsHeaders = getStrictCorsHeaders(req);
  
  const preflightResponse = handleCorsPrelight(req);
  if (preflightResponse) return preflightResponse;

  try {
    const rawBody = await req.json();
    
    // Validate with Zod
    const parseResult = WebCallRequestSchema.safeParse(rawBody);
    if (!parseResult.success) {
      console.error('[RETELL_WEB_CALL] Validation error:', parseResult.error.message);
      return new Response(
        JSON.stringify({ error: `Validation error: ${parseResult.error.errors.map(e => e.message).join(', ')}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const request = parseResult.data;
    const mode = request.mode || 'inbound';
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    let retellAgentId: string | null = null;
    let retellApiKey: string | null = null;
    let agentName = 'Agente';
    
    // 1. Try to find agent configuration
    if (request.agent_db_id) {
      // Load by database ID
      const { data: agentData } = await supabase
        .from('ai_agents')
        .select('id, agent_id, name, voice_config')
        .eq('id', request.agent_db_id)
        .single();
      
      if (agentData) {
        agentName = agentData.name;
        const voiceConfig = agentData.voice_config as any;
        const modeConfig = voiceConfig?.[mode] || {};
        retellAgentId = modeConfig.agent_id || null;
        
        // Check agent secrets for API key
        const { data: secrets } = await supabase
          .from('agent_secrets')
          .select('secret_key, secret_name')
          .eq('agent_id', agentData.id)
          .in('mode', [mode, 'shared']);
        
        const apiKeySecret = secrets?.find(s => 
          s.secret_name.toLowerCase().includes('retell') && 
          s.secret_name.toLowerCase().includes('api')
        );
        
        if (apiKeySecret) {
          retellApiKey = Deno.env.get(apiKeySecret.secret_key) || null;
        }
      }
    } else if (request.agent_id) {
      // Load by agent_id (slug)
      const { data: agentData } = await supabase
        .from('ai_agents')
        .select('id, agent_id, name, voice_config')
        .eq('agent_id', request.agent_id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();
      
      if (agentData) {
        agentName = agentData.name;
        const voiceConfig = agentData.voice_config as any;
        const modeConfig = voiceConfig?.[mode] || {};
        retellAgentId = modeConfig.agent_id || null;
        
        // Check agent secrets for API key
        const { data: secrets } = await supabase
          .from('agent_secrets')
          .select('secret_key, secret_name')
          .eq('agent_id', agentData.id)
          .in('mode', [mode, 'shared']);
        
        const apiKeySecret = secrets?.find(s => 
          s.secret_name.toLowerCase().includes('retell') && 
          s.secret_name.toLowerCase().includes('api')
        );
        
        if (apiKeySecret) {
          retellApiKey = Deno.env.get(apiKeySecret.secret_key) || null;
        }
      }
    }
    
    // 2. Fallback to environment variables
    if (!retellApiKey) {
      retellApiKey = Deno.env.get('RETELL_API_KEY') || null;
    }
    
    if (!retellAgentId) {
      retellAgentId = mode === 'outbound' 
        ? (Deno.env.get('RETELL_AGENT_ID_OUTBOUND') || null)
        : (Deno.env.get('RETELL_AGENT_ID') || Deno.env.get('RETELL_AGENT_ID_INBOUND') || null);
    }
    
    // 3. Validate required config
    if (!retellApiKey) {
      console.error('[RETELL_WEB_CALL] Missing RETELL_API_KEY');
      return new Response(
        JSON.stringify({ 
          error: 'Retell API key não configurada',
          details: 'Configure RETELL_API_KEY nos secrets ou adicione um secret de API no agente.'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (!retellAgentId) {
      console.error('[RETELL_WEB_CALL] Missing Retell agent_id');
      return new Response(
        JSON.stringify({ 
          error: 'Retell Agent ID não configurado',
          details: `Configure o Agent ID na aba "Voz" do agente (modo ${mode}) ou defina RETELL_AGENT_ID nos secrets.`
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log('[RETELL_WEB_CALL] Creating web call:', {
      agent_id: retellAgentId,
      agent_name: agentName,
      mode,
    });
    
    // 4. Create web call via Retell API
    const retellResponse = await fetch('https://api.retellai.com/v2/create-web-call', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${retellApiKey}`,
      },
      body: JSON.stringify({
        agent_id: retellAgentId,
        metadata: {
          source: 'ai_gym_simulator',
          agent_name: agentName,
          mode,
          ...request.metadata,
        },
      }),
    });
    
    if (!retellResponse.ok) {
      const errorText = await retellResponse.text();
      console.error('[RETELL_WEB_CALL] Retell API error:', retellResponse.status, errorText);
      return new Response(
        JSON.stringify({ 
          error: 'Erro na API do Retell',
          status: retellResponse.status,
          details: errorText
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const webCallData: RetellWebCallResponse = await retellResponse.json();
    
    console.log('[RETELL_WEB_CALL] ✅ Web call created:', {
      call_id: webCallData.call_id,
      agent_id: webCallData.agent_id,
    });
    
    return new Response(
      JSON.stringify({
        success: true,
        access_token: webCallData.access_token,
        call_id: webCallData.call_id,
        agent_id: webCallData.agent_id,
        agent_name: agentName,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('[RETELL_WEB_CALL] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
