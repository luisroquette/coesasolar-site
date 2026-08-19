/**
 * Shared Agent Identity Helpers
 * 
 * Centralized utilities for resolving agent names and identity for:
 * - Admin notifications (created_by_nome)
 * - Operator confirmation messages
 * - Farewell/return messages
 * - Ping/status commands
 * 
 * Now loads agent identity from database (ai_agents table) with fallback to hardcoded values
 */

// ═══════════════════════════════════════════════════════════════
// TYPES & CACHE
// ═══════════════════════════════════════════════════════════════

interface AgentIdentity {
  name: string;
  role: string;
}

interface AgentIdentityCache {
  data: Map<string, AgentIdentity>;
  timestamp: number;
}

let agentIdentityCache: AgentIdentityCache | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Fallback agent display names (used if database unavailable)
const FALLBACK_AGENT_NAMES: Record<string, string> = {
  'sofia': 'sofIA',
  'sofia_inbound_sales_': 'sofIA',
  'maria': 'marIA',
  'maria_inbound_sac_': 'marIA',
  'julia': 'julIA',
  'julia_outbound_cobranca_': 'julIA',
  'iago': 'iagO',
  'iago_outbound_sales_': 'iagO',
  'jaime': 'jaimE',
  'jaime_inbound_sac_': 'jaimE',
};

// Fallback agent role descriptions
const FALLBACK_AGENT_ROLES: Record<string, string> = {
  'sofia': 'vendas',
  'sofia_inbound_sales_': 'vendas',
  'maria': 'atendimento ao cliente',
  'maria_inbound_sac_': 'atendimento ao cliente',
  'julia': 'financeiro',
  'julia_outbound_cobranca_': 'financeiro',
  'iago': 'vendas outbound',
  'iago_outbound_sales_': 'vendas outbound',
  'jaime': 'suporte técnico',
  'jaime_inbound_sac_': 'suporte técnico',
};

// Role description mapping (English to Portuguese)
const ROLE_MAP: Record<string, string> = {
  'vendas': 'vendas',
  'sales': 'vendas',
  'sac': 'atendimento ao cliente',
  'support': 'suporte',
  'cobranca': 'financeiro',
  'collection': 'financeiro',
  'billing': 'financeiro',
};

// ═══════════════════════════════════════════════════════════════
// DYNAMIC LOADING
// ═══════════════════════════════════════════════════════════════

/**
 * Load agent identities from database
 */
export async function loadAgentIdentities(supabaseClient: any): Promise<Map<string, AgentIdentity>> {
  // Check cache first
  if (agentIdentityCache && Date.now() - agentIdentityCache.timestamp < CACHE_TTL) {
    return agentIdentityCache.data;
  }
  
  try {
    const { data, error } = await supabaseClient
      .from('ai_agents')
      .select('agent_id, name, role')
      .eq('is_active', true);
    
    if (error) {
      console.error('[agent-identity] Error loading agents:', error);
      return buildFallbackMap();
    }
    
    const identityMap = new Map<string, AgentIdentity>();
    
    for (const agent of data || []) {
      if (agent.agent_id) {
        identityMap.set(agent.agent_id.toLowerCase(), {
          name: agent.name || 'IA',
          role: agent.role || 'assistente virtual',
        });
      }
    }
    
    // Cache the results
    agentIdentityCache = {
      data: identityMap,
      timestamp: Date.now(),
    };
    
    console.log(`[agent-identity] Loaded ${identityMap.size} agent identities from database`);
    return identityMap;
  } catch (err) {
    console.error('[agent-identity] Exception loading agents:', err);
    return buildFallbackMap();
  }
}

/**
 * Build fallback identity map from hardcoded values
 */
function buildFallbackMap(): Map<string, AgentIdentity> {
  const map = new Map<string, AgentIdentity>();
  
  for (const [key, name] of Object.entries(FALLBACK_AGENT_NAMES)) {
    map.set(key.toLowerCase(), {
      name,
      role: FALLBACK_AGENT_ROLES[key] || 'assistente virtual',
    });
  }
  
  return map;
}

/**
 * Get cached agent identities (returns fallback if not loaded)
 */
export function getAgentIdentityCache(): Map<string, AgentIdentity> {
  if (agentIdentityCache) {
    return agentIdentityCache.data;
  }
  return buildFallbackMap();
}

/**
 * Clear the agent identity cache
 */
export function clearAgentIdentityCache(): void {
  agentIdentityCache = null;
}

// ═══════════════════════════════════════════════════════════════
// IDENTITY RESOLUTION
// ═══════════════════════════════════════════════════════════════

/**
 * Get the display name for an agent
 * Falls back to the agentConfig.name if available, or 'IA' as default
 */
export function getAgentDisplayName(
  agentId: string | null | undefined,
  agentConfigName?: string | null
): string {
  if (agentConfigName) {
    return agentConfigName;
  }
  
  if (!agentId) {
    return 'IA';
  }
  
  const identityMap = getAgentIdentityCache();
  const lowerAgentId = agentId.toLowerCase();
  
  // Try exact match first
  if (identityMap.has(lowerAgentId)) {
    return identityMap.get(lowerAgentId)!.name;
  }
  
  // Try prefix match (for agent IDs with suffixes)
  for (const [key, identity] of identityMap.entries()) {
    if (lowerAgentId.startsWith(key) || key.startsWith(lowerAgentId)) {
      return identity.name;
    }
  }
  
  return 'IA';
}

/**
 * Get role description for an agent (e.g., "vendas", "atendimento ao cliente")
 */
export function getAgentRoleDescription(
  agentId: string | null | undefined,
  agentConfigRole?: string | null
): string {
  if (agentConfigRole) {
    return ROLE_MAP[agentConfigRole.toLowerCase()] || agentConfigRole;
  }
  
  if (!agentId) {
    return 'assistente virtual';
  }
  
  const identityMap = getAgentIdentityCache();
  const lowerAgentId = agentId.toLowerCase();
  
  // Try exact match first
  if (identityMap.has(lowerAgentId)) {
    return identityMap.get(lowerAgentId)!.role;
  }
  
  // Try prefix match
  for (const [key, identity] of identityMap.entries()) {
    if (lowerAgentId.startsWith(key) || key.startsWith(lowerAgentId)) {
      return identity.role;
    }
  }
  
  return 'assistente virtual';
}

/**
 * Get the "created_by_nome" string for admin notifications
 * Uses agent display name with optional suffix
 */
export function getNotificationAuthorName(
  agentId: string | null | undefined,
  agentConfigName?: string | null,
  suffix?: string
): string {
  const name = getAgentDisplayName(agentId, agentConfigName);
  return suffix ? `${name} (${suffix})` : name;
}

/**
 * Get supervisor info for escalation messages
 * Falls back to generic supervisor if not configured
 */
export interface SupervisorInfo {
  name: string;
  description: string;
}

export function getSupervisorInfo(
  guardrails?: { supervisor_nome?: string; supervisor_telefone?: string } | null
): SupervisorInfo {
  const name = guardrails?.supervisor_nome || 'um especialista';
  const description = guardrails?.supervisor_nome 
    ? `${name}` 
    : 'um especialista da nossa equipe';
  
  return { name, description };
}

// ═══════════════════════════════════════════════════════════════
// MESSAGE GENERATORS
// ═══════════════════════════════════════════════════════════════

/**
 * Generate a farewell message when agent is pausing for human takeover
 */
export function generateFarewellMessage(
  clienteNome: string | null,
  agentConfig?: { name?: string; guardrails?: { supervisor_nome?: string } | null } | null
): string {
  const clientFirstName = clienteNome?.split(' ')[0] || '';
  const supervisor = getSupervisorInfo(agentConfig?.guardrails);
  
  if (clientFirstName) {
    return `${clientFirstName}, vou transferir seu atendimento para ${supervisor.description}. Você está em boas mãos! 😊`;
  }
  
  return `Vou transferir seu atendimento para ${supervisor.description}. Você está em boas mãos! 😊`;
}

/**
 * Generate a return message when agent resumes after human handoff
 */
export function generateReturnMessage(
  clienteNome: string | null,
  agentConfig?: { name?: string } | null
): string {
  const clientFirstName = clienteNome?.split(' ')[0] || '';
  
  if (clientFirstName) {
    return `Olá ${clientFirstName}! Estou de volta e vou seguir com seu atendimento, caso você precise, ok?! Estou à disposição. Qualquer coisa, me chama! 😊`;
  }
  
  return `Olá! Estou de volta e vou seguir com seu atendimento, caso você precise, ok?! Estou à disposição. Qualquer coisa, me chama! 😊`;
}

/**
 * Generate operator confirmation message for pause command
 */
export function generatePauseConfirmation(
  clienteName: string,
  phone: string,
  agentConfig?: { name?: string } | null
): string {
  const agentName = getAgentDisplayName(null, agentConfig?.name);
  
  return `✅ *COMANDO RECEBIDO*

🔇 ${agentName} pausada para o cliente *${clienteName}*
📱 ${phone}

_Você está no controle. Use #RESOLVIDO quando terminar._`;
}

/**
 * Generate operator confirmation message for resume command
 */
export function generateResumeConfirmation(
  clienteName: string,
  phone: string,
  agentConfig?: { name?: string } | null
): string {
  const agentName = getAgentDisplayName(null, agentConfig?.name);
  
  return `✅ *COMANDO RECEBIDO*

🔊 ${agentName} reativada para o cliente *${clienteName}*
📱 ${phone}

_A IA voltou a responder automaticamente._`;
}

/**
 * Generate PING response with agent identity
 */
export function generatePingResponse(
  phone: string,
  clienteNome: string | null,
  messageText: string,
  agentConfig?: { name?: string } | null
): string {
  const agentName = getAgentDisplayName(null, agentConfig?.name);
  const timestamp = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  
  return `🟢 *${agentName.toUpperCase()} ONLINE*

✅ Webhook recebido com sucesso
📱 Seu número: ${phone}
👤 Nome detectado: ${clienteNome || 'Não identificado'}
⏰ Timestamp: ${timestamp}

📊 *Status dos Serviços:*
• WhatsApp: ✅ Conectado
• Banco de dados: ✅ Operacional
• Gateway IA: ✅ Disponível

💬 *Mensagem Recebida:*
"${messageText}"

_Sistema funcionando normalmente. Envie outra mensagem para testar a resposta da IA._`;
}

/**
 * Generate voice test message with agent identity
 */
export function generateVoiceTestMessage(
  agentConfig?: { name?: string } | null
): string {
  const agentName = getAgentDisplayName(null, agentConfig?.name);
  
  return `Olá! Eu sou a ${agentName}, assistente virtual da COESA Energia. Estou aqui para te ajudar a economizar até 30% na sua conta de luz, sem obras, sem investimento e sem burocracia. Quer que eu faça uma simulação personalizada para você?`;
}

/**
 * Generate voice test confirmation message
 */
export function generateVoiceTestConfirmation(
  testMessage: string,
  success: boolean,
  agentConfig?: { name?: string } | null
): string {
  const agentName = getAgentDisplayName(null, agentConfig?.name);
  
  if (success) {
    return `🎙️ *Teste de Voz da ${agentName}*

_Áudio enviado com sucesso!_

📝 Texto do áudio:
"${testMessage}"`;
  }
  
  return `⚠️ *Teste de Voz da ${agentName}*

❌ Não foi possível enviar o áudio.

Possíveis causas:
• Formato de áudio não aceito pelo provedor
• ElevenLabs sem créditos (fallback para OpenAI foi usado)
• Erro na API do provedor

📋 O áudio foi GERADO com sucesso, mas o envio falhou.

_Verifique os logs da edge function para detalhes técnicos._`;
}
