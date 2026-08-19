import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getStrictCorsHeaders, handleCorsPrelight } from '../_shared/security-helpers.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ZAPI_INSTANCE_ID = Deno.env.get('ZAPI_INSTANCE_ID');
const ZAPI_TOKEN = Deno.env.get('ZAPI_TOKEN');

interface AgentCredentials {
  agentId: string;
  agentName: string;
  instanceId: string | null;
  token: string | null;
  securityToken: string | null;
  usesGlobal: boolean;
}

interface CredentialCheckResult {
  agentId: string;
  agentName: string;
  status: 'connected' | 'disconnected' | 'qr_needed' | 'invalid_token' | 'error' | 'not_configured';
  connected: boolean;
  phoneNumber?: string;
  error?: string;
  usesGlobal: boolean;
  checkedAt: string;
}

/**
 * Check Z-API instance status
 */
async function checkZApiStatus(instanceId: string, token: string): Promise<{
  connected: boolean;
  status: string;
  phoneNumber?: string;
  error?: string;
}> {
  try {
    const url = `https://api.z-api.io/instances/${instanceId}/token/${token}/status`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    const text = await response.text();
    
    if (!response.ok) {
      console.error(`[ZAPI-CHECK] Error checking status: ${response.status} - ${text}`);
      
      if (response.status === 401 || response.status === 403) {
        return { connected: false, status: 'invalid_token', error: 'Token inválido ou expirado' };
      }
      
      return { connected: false, status: 'error', error: `HTTP ${response.status}: ${text.substring(0, 100)}` };
    }
    
    const data = JSON.parse(text);
    console.log(`[ZAPI-CHECK] Status response:`, data);
    
    // Z-API returns different statuses
    // connected: true means WhatsApp is connected
    // smartphoneConnected: true means phone is online
    const isConnected = data.connected === true;
    const needsQr = data.connected === false && !data.error;
    
    if (isConnected) {
      return { 
        connected: true, 
        status: 'connected',
        phoneNumber: data.phone || data.phoneNumber || undefined
      };
    }
    
    if (needsQr) {
      return { connected: false, status: 'qr_needed', error: 'QR Code necessário' };
    }
    
    return { 
      connected: false, 
      status: 'disconnected',
      error: data.error || 'WhatsApp desconectado'
    };
    
  } catch (err) {
    console.error(`[ZAPI-CHECK] Network error:`, err);
    return { 
      connected: false, 
      status: 'error', 
      error: err instanceof Error ? err.message : 'Erro de rede' 
    };
  }
}

serve(async (req) => {
  const corsHeaders = getStrictCorsHeaders(req);
  
  const preflightResponse = handleCorsPrelight(req);
  if (preflightResponse) return preflightResponse;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Get optional agentId from query params
    const url = new URL(req.url);
    const specificAgentId = url.searchParams.get('agentId');
    
    // Fetch all agents (or specific one)
    let query = supabase
      .from('ai_agents')
      .select('id, agent_id, name, zapi_instance_id, zapi_token, zapi_security_token, channels')
      .order('name');
    
    if (specificAgentId) {
      query = query.eq('agent_id', specificAgentId);
    }
    
    const { data: agents, error } = await query;
    
    if (error) {
      console.error('[ZAPI-CHECK] Error fetching agents:', error);
      return new Response(
        JSON.stringify({ error: 'Erro ao buscar agentes', details: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Filter agents that have WhatsApp channel
    const whatsappAgents = (agents || []).filter(agent => 
      agent.channels?.includes('whatsapp')
    );
    
    console.log(`[ZAPI-CHECK] Checking ${whatsappAgents.length} agents with WhatsApp channel`);
    
    const results: CredentialCheckResult[] = [];
    
    for (const agent of whatsappAgents) {
      const agentCredentials: AgentCredentials = {
        agentId: agent.agent_id,
        agentName: agent.name,
        instanceId: agent.zapi_instance_id,
        token: agent.zapi_token,
        securityToken: agent.zapi_security_token,
        usesGlobal: !agent.zapi_instance_id || !agent.zapi_token,
      };
      
      // Determine which credentials to use
      const effectiveInstanceId = agentCredentials.instanceId || ZAPI_INSTANCE_ID;
      const effectiveToken = agentCredentials.token || ZAPI_TOKEN;
      
      if (!effectiveInstanceId || !effectiveToken) {
        results.push({
          agentId: agent.agent_id,
          agentName: agent.name,
          status: 'not_configured',
          connected: false,
          error: 'Credenciais Z-API não configuradas',
          usesGlobal: agentCredentials.usesGlobal,
          checkedAt: new Date().toISOString(),
        });
        continue;
      }
      
      console.log(`[ZAPI-CHECK] Checking agent ${agent.name} (${agent.agent_id})...`);
      
      const checkResult = await checkZApiStatus(effectiveInstanceId, effectiveToken);
      
      results.push({
        agentId: agent.agent_id,
        agentName: agent.name,
        status: checkResult.status as CredentialCheckResult['status'],
        connected: checkResult.connected,
        phoneNumber: checkResult.phoneNumber,
        error: checkResult.error,
        usesGlobal: agentCredentials.usesGlobal,
        checkedAt: new Date().toISOString(),
      });
    }
    
    // Calculate summary
    const summary = {
      total: results.length,
      connected: results.filter(r => r.connected).length,
      disconnected: results.filter(r => !r.connected && r.status !== 'not_configured').length,
      notConfigured: results.filter(r => r.status === 'not_configured').length,
      needsAttention: results.filter(r => !r.connected).length,
    };
    
    console.log(`[ZAPI-CHECK] Summary:`, summary);
    
    return new Response(
      JSON.stringify({ 
        success: true,
        results,
        summary,
        checkedAt: new Date().toISOString(),
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
    
  } catch (err) {
    console.error('[ZAPI-CHECK] Unexpected error:', err);
    return new Response(
      JSON.stringify({ 
        error: 'Erro interno', 
        details: err instanceof Error ? err.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
