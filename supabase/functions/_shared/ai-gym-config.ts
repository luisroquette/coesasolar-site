/**
 * AI GYM CONFIGURATION LOADER
 * 
 * Módulo compartilhado para carregar e processar configurações de agentes
 * do AI Gym (tabela ai_agents) para uso em todos os webhooks.
 * 
 * CONECTA 100% DAS CONFIGURAÇÕES:
 * - kb_sources: Base de conhecimento
 * - persona: Personalidade, tom, estilo
 * - guardrails: Regras, limites, triggers de handoff
 * - tools_config: Ferramentas habilitadas/desabilitadas
 * - intents: Intenções mapeadas
 * - collection_rules: Réguas de cobrança (julIA)
 * - voice_config: Configurações de voz
 */

// ═══════════════════════════════════════════════════════════════
// INTERFACES
// ═══════════════════════════════════════════════════════════════

export interface KBSource {
  id: string;
  name: string;
  type: 'document' | 'faq' | 'policy' | 'glossary' | 'api' | 'url' | 'custom';
  description?: string;
  content?: string;
  url?: string;
  enabled: boolean;
}

export interface PersonaConfig {
  system_prompt?: string;
  tone?: {
    default?: string;
    forbidden?: string[];
  };
  style?: {
    max_linhas?: number;
    emojis_permitidos?: string[];
  };
  personality?: string[];
  abertura_scripts?: {
    padrao?: string;
    retorno?: string;
    pos_proposta?: string;
  };
  llm_model?: string; // Model selected in AI Gym dashboard
}

export interface GuardrailsConfig {
  never_do?: string[];
  handoff_triggers?: string[];
  max_messages_without_progress?: number;
  escalation_phrases?: string[];
  supervisor_nome?: string;
  supervisor_telefone?: string;
}

export interface ToolConfig {
  name: string;
  enabled: boolean;
  description?: string;
  parameters?: Record<string, unknown>;
}

export interface CollectionStage {
  name: string;
  days_from: number;
  days_to: number;
  tone: string;
  actions: string[];
  message_template?: string;
}

export interface CollectionRules {
  stages?: CollectionStage[];
  exceptions?: Record<string, string>;
  allowed_hours?: { start: number; end: number };
  allowed_days?: string[];
}

export interface IdentificationConfig {
  enabled: boolean;
  message: string;
  ask_cpf_cnpj: boolean;
  ask_email: boolean;
  success_message: string;
  verify_in_crm: boolean;
  divergence_message: string;
  not_found_message: string;
}

export interface TriageConfig {
  enabled: boolean;
  // Configuração de identificação do cliente
  identification?: IdentificationConfig;
  // Mensagem de confirmação perguntando se é cliente
  confirmation_question: string;
  // Keywords que indicam que SIM, é cliente → SAC
  yes_keywords: string[];
  // Keywords que indicam que NÃO é cliente → Vendas
  no_keywords: string[];
  // Setor de Vendas (para não clientes)
  vendas_contact: string;
  vendas_message: string;
  // Setor SAC (para clientes existentes)
  sac_contact: string;
  sac_message: string;
}

export interface VoiceModeSettings {
  enabled?: boolean;
  provider?: string;
  agent_id?: string;
  greeting_template?: string;
  max_call_duration_seconds?: number;
  language?: string;
  voice_id?: string;
}

export interface VoiceConfig {
  inbound?: VoiceModeSettings & {
    webhook_url?: string;
  };
  outbound?: VoiceModeSettings & {
    campaign_settings?: {
      calling_hours_start?: string;
      calling_hours_end?: string;
      calling_days?: string[];
      max_attempts?: number;
      retry_delay_hours?: number;
    };
  };
}

export interface FullAgentConfig {
  agent_id: string;
  name: string;
  role: string;
  kb_sources: KBSource[];
  persona: PersonaConfig;
  guardrails: GuardrailsConfig;
  tools_config: ToolConfig[];
  intents: Record<string, unknown>[];
  collection_rules: CollectionRules | null;
  voice_config: VoiceConfig;
  triage_config: TriageConfig | null;
}

// ═══════════════════════════════════════════════════════════════
// CACHE SYSTEM
// ═══════════════════════════════════════════════════════════════

const agentConfigCache: Map<string, { data: FullAgentConfig; timestamp: number }> = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ═══════════════════════════════════════════════════════════════
// LOADER FUNCTION
// ═══════════════════════════════════════════════════════════════

export async function loadFullAgentConfig(
  supabaseClient: any, 
  agentId: string = 'sofia',
  fallbackAgentId: string | null = null
): Promise<FullAgentConfig> {
  const now = Date.now();
  const cacheKey = agentId;
  
  // Check cache
  const cached = agentConfigCache.get(cacheKey);
  if (cached && (now - cached.timestamp) < CACHE_TTL_MS) {
    console.log(`[AI_GYM] Using cached config for: ${agentId}`);
    return cached.data;
  }
  
  console.log(`[AI_GYM] Loading full config for agent: ${agentId} (precedence: active > latest)`);
  
  try {
    // PRECEDÊNCIA: Primeiro buscar agente com status 'active'
    let agent = null;
    
    // 1. Try to find active agent first
    const { data: activeAgent, error: activeError } = await supabaseClient
      .from('ai_agents')
      .select('agent_id, name, role, kb_sources, persona, guardrails, tools_config, intents, collection_rules, voice_config, status')
      .eq('agent_id', agentId)
      .eq('status', 'active')
      .limit(1)
      .single();
    
    if (activeAgent && !activeError) {
      agent = activeAgent;
      console.log(`[AI_GYM] Found ACTIVE agent: ${agentId}`);
    }
    
    // 2. If no active agent, try 'published' status
    if (!agent) {
      const { data: publishedAgent, error: publishedError } = await supabaseClient
        .from('ai_agents')
        .select('agent_id, name, role, kb_sources, persona, guardrails, tools_config, intents, collection_rules, voice_config, status')
        .eq('agent_id', agentId)
        .eq('status', 'published')
        .limit(1)
        .single();
      
      if (publishedAgent && !publishedError) {
        agent = publishedAgent;
        console.log(`[AI_GYM] Found PUBLISHED agent: ${agentId}`);
      }
    }
    
    // 3. Fallback: get latest updated agent with any status
    if (!agent) {
      const { data: latestAgent, error: latestError } = await supabaseClient
        .from('ai_agents')
        .select('agent_id, name, role, kb_sources, persona, guardrails, tools_config, intents, collection_rules, voice_config, status')
        .eq('agent_id', agentId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();
      
      if (latestAgent && !latestError) {
        agent = latestAgent;
        console.log(`[AI_GYM] Using LATEST agent (status: ${latestAgent.status}): ${agentId}`);
      }
    }
    
    if (!agent) {
      console.log(`[AI_GYM] No agent found for ${agentId}${fallbackAgentId ? `, trying fallback: ${fallbackAgentId}` : ''}`);
      
      if (fallbackAgentId) {
        return loadFullAgentConfig(supabaseClient, fallbackAgentId, null);
      }
      
      return getEmptyConfig(agentId);
    }
    
    const config = normalizeFullConfig(agent);
    agentConfigCache.set(cacheKey, { data: config, timestamp: now });
    
    // Log what was loaded for debugging (100% visibility)
    console.log(`[AI_GYM] ✅ Config loaded for ${agentId} (status: ${agent.status}):`, {
      kbSources: config.kb_sources.filter(kb => kb.enabled).length,
      hasPersona: !!config.persona.system_prompt,
      personalityTraits: config.persona.personality?.length || 0,
      toneDefault: config.persona.tone?.default || 'N/A',
      guardrailsNeverDo: config.guardrails.never_do?.length || 0,
      handoffTriggers: config.guardrails.handoff_triggers?.length || 0,
      escalationPhrases: config.guardrails.escalation_phrases?.length || 0,
      toolsEnabled: config.tools_config.filter(t => t.enabled).length,
      toolsDisabled: config.tools_config.filter(t => !t.enabled).length,
      hasIntents: config.intents?.length || 0,
      hasCollectionRules: !!config.collection_rules,
      voiceInbound: config.voice_config.inbound?.enabled || false,
      voiceOutbound: config.voice_config.outbound?.enabled || false,
    });
    
    return config;
    
  } catch (err) {
    console.error('[AI_GYM] Error loading agent config:', err);
    return getEmptyConfig(agentId);
  }
}

function getEmptyConfig(agentId: string): FullAgentConfig {
  return {
    agent_id: agentId,
    name: agentId,
    role: 'assistant',
    kb_sources: [],
    persona: {},
    guardrails: {},
    tools_config: [],
    intents: [],
    collection_rules: null,
    voice_config: {},
    triage_config: null,
  };
}

function normalizeFullConfig(agent: any): FullAgentConfig {
  // Normalize KB sources
  let kbSources: KBSource[] = [];
  if (Array.isArray(agent.kb_sources)) {
    kbSources = agent.kb_sources.map((source: any, idx: number) => {
      if (typeof source === 'string') {
        return {
          id: `legacy_${idx}`,
          name: source,
          type: 'custom' as const,
          content: source,
          enabled: true,
        };
      }
      return source as KBSource;
    });
  }
  
  // Normalize tools_config
  let toolsConfig: ToolConfig[] = [];
  if (Array.isArray(agent.tools_config)) {
    toolsConfig = agent.tools_config.map((tool: any) => ({
      name: tool.name || 'unknown',
      enabled: tool.enabled !== false,
      description: tool.description,
      parameters: tool.parameters,
    }));
  }
  
  return {
    agent_id: agent.agent_id,
    name: agent.name || agent.agent_id,
    role: agent.role || 'assistant',
    kb_sources: kbSources,
    persona: agent.persona || {},
    guardrails: agent.guardrails || {},
    tools_config: toolsConfig,
    intents: Array.isArray(agent.intents) ? agent.intents : [],
    collection_rules: agent.collection_rules || null,
    voice_config: agent.voice_config || {},
    triage_config: agent.triage_config || null,
  };
}

// ═══════════════════════════════════════════════════════════════
// PROMPT BUILDERS
// ═══════════════════════════════════════════════════════════════

/**
 * Build Knowledge Base prompt section
 */
export function buildKnowledgeBasePrompt(kbSources: KBSource[]): string {
  const enabledSources = kbSources.filter(kb => kb.enabled);
  
  if (enabledSources.length === 0) {
    return '';
  }
  
  let kbPrompt = `
═══════════════════════════════════════════════════════════════
📚 BASE DE CONHECIMENTO (AI GYM)
═══════════════════════════════════════════════════════════════

Use as seguintes fontes de conhecimento para embasar suas respostas:

`;
  
  for (const kb of enabledSources) {
    kbPrompt += `### ${kb.name.toUpperCase()}`;
    if (kb.type) kbPrompt += ` [${kb.type}]`;
    kbPrompt += '\n';
    
    if (kb.description) {
      kbPrompt += `*${kb.description}*\n`;
    }
    
    if (kb.content) {
      kbPrompt += `${kb.content}\n`;
    }
    
    if (kb.url) {
      kbPrompt += `Referência: ${kb.url}\n`;
    }
    
    kbPrompt += '\n';
  }
  
  kbPrompt += `
INSTRUÇÕES PARA USO DA BASE DE CONHECIMENTO:
- Priorize informações destas fontes sobre conhecimento geral
- Se uma pergunta for coberta pelo KB, use essa informação
- Se não encontrar a resposta no KB, use seu conhecimento base
- Nunca invente informações que não estejam no KB ou no seu treinamento

`;
  
  return kbPrompt;
}

/**
 * Build Persona prompt section (COMPLETE)
 */
export function buildPersonaPrompt(persona: PersonaConfig): string {
  if (!persona || Object.keys(persona).length === 0) {
    return '';
  }
  
  let personaPrompt = `
═══════════════════════════════════════════════════════════════
🎭 PERSONA CONFIGURADA (AI GYM)
═══════════════════════════════════════════════════════════════

`;
  
  // System prompt (main persona definition)
  if (persona.system_prompt) {
    personaPrompt += persona.system_prompt + '\n\n';
  }
  
  // Personality traits
  if (persona.personality && Array.isArray(persona.personality) && persona.personality.length > 0) {
    personaPrompt += `## TRAÇOS DE PERSONALIDADE\n`;
    personaPrompt += persona.personality.map(trait => `- ${trait}`).join('\n') + '\n\n';
  }
  
  // Tone configuration
  if (persona.tone) {
    personaPrompt += `## TOM DE VOZ\n`;
    if (persona.tone.default) {
      personaPrompt += `Tom padrão: ${persona.tone.default}\n`;
    }
    if (persona.tone.forbidden && persona.tone.forbidden.length > 0) {
      personaPrompt += `NUNCA usar tons: ${persona.tone.forbidden.join(', ')}\n`;
    }
    personaPrompt += '\n';
  }
  
  // Style configuration
  if (persona.style) {
    personaPrompt += `## ESTILO DE COMUNICAÇÃO\n`;
    if (persona.style.max_linhas) {
      personaPrompt += `- Máximo ${persona.style.max_linhas} linhas por mensagem\n`;
    }
    if (persona.style.emojis_permitidos && persona.style.emojis_permitidos.length > 0) {
      personaPrompt += `- Emojis permitidos: ${persona.style.emojis_permitidos.join(' ')}\n`;
    }
    personaPrompt += '\n';
  }
  
  // Opening scripts
  if (persona.abertura_scripts) {
    personaPrompt += `## SCRIPTS DE ABERTURA\n`;
    if (persona.abertura_scripts.padrao) {
      personaPrompt += `Padrão: "${persona.abertura_scripts.padrao}"\n`;
    }
    if (persona.abertura_scripts.retorno) {
      personaPrompt += `Retorno: "${persona.abertura_scripts.retorno}"\n`;
    }
    if (persona.abertura_scripts.pos_proposta) {
      personaPrompt += `Pós-proposta: "${persona.abertura_scripts.pos_proposta}"\n`;
    }
    personaPrompt += '\n';
  }
  
  return personaPrompt;
}

/**
 * Build Guardrails prompt section
 */
export function buildGuardrailsPrompt(guardrails: GuardrailsConfig): string {
  if (!guardrails || Object.keys(guardrails).length === 0) {
    return '';
  }
  
  let guardrailsPrompt = `
═══════════════════════════════════════════════════════════════
🛡️ REGRAS E LIMITES (AI GYM)
═══════════════════════════════════════════════════════════════

`;
  
  // ═══════════════════════════════════════════════════════════════
  // ANTI-HALLUCINATION RULES (CRITICAL - highlighted separately)
  // These rules prevent Sofia from inventing data, URLs, or claiming false facts
  // ═══════════════════════════════════════════════════════════════
  const criticalPatterns = ['inventar', 'url', 'proposta', 'documento', 'afirmar', 'fatura', 'consumo', 'kwh'];
  const antiHallucinationRules = (guardrails.never_do || []).filter((rule: string) =>
    criticalPatterns.some(pattern => rule.toLowerCase().includes(pattern))
  );
  const regularNeverDoRules = (guardrails.never_do || []).filter((rule: string) =>
    !criticalPatterns.some(pattern => rule.toLowerCase().includes(pattern))
  );

  if (antiHallucinationRules.length > 0) {
    guardrailsPrompt += `## 🚨 REGRAS ANTI-ALUCINAÇÃO (CRÍTICO - VIOLAÇÃO = ESCALAÇÃO IMEDIATA)\n`;
    guardrailsPrompt += `ATENÇÃO: Violar QUALQUER uma destas regras é INACEITÁVEL:\n`;
    for (const rule of antiHallucinationRules) {
      guardrailsPrompt += `⛔ ${rule.toUpperCase()}\n`;
    }
    guardrailsPrompt += '\n';
  }
  
  // Never do rules (regular ones)
  if (regularNeverDoRules.length > 0) {
    guardrailsPrompt += `## O QUE NUNCA FAZER\n`;
    for (const rule of regularNeverDoRules) {
      guardrailsPrompt += `❌ ${rule}\n`;
    }
    guardrailsPrompt += '\n';
  }
  
  // Handoff triggers
  if (guardrails.handoff_triggers && guardrails.handoff_triggers.length > 0) {
    guardrailsPrompt += `## ESCALAR PARA HUMANO QUANDO\n`;
    for (const trigger of guardrails.handoff_triggers) {
      guardrailsPrompt += `🚨 ${trigger}\n`;
    }
    guardrailsPrompt += '\n';
  }
  
  // Escalation phrases
  if (guardrails.escalation_phrases && guardrails.escalation_phrases.length > 0) {
    guardrailsPrompt += `## FRASES QUE INDICAM NECESSIDADE DE HUMANO\n`;
    guardrailsPrompt += `Detectar: ${guardrails.escalation_phrases.join(', ')}\n\n`;
  }
  
  // Max messages without progress
  if (guardrails.max_messages_without_progress) {
    guardrailsPrompt += `⚠️ Se após ${guardrails.max_messages_without_progress} mensagens não houver progresso, escalar para humano.\n\n`;
  }
  
  return guardrailsPrompt;
}

/**
 * Build Collection Rules prompt section (for julIA / collections agents)
 */
export function buildCollectionRulesPrompt(rules: CollectionRules | null, role: string): string {
  if (!rules || role !== 'collections') {
    return '';
  }
  
  let rulesPrompt = `
═══════════════════════════════════════════════════════════════
📋 RÉGUAS DE COBRANÇA (AI GYM)
═══════════════════════════════════════════════════════════════

`;
  
  // Stages
  if (rules.stages && rules.stages.length > 0) {
    rulesPrompt += `## ESTÁGIOS POR DIAS DE ATRASO\n`;
    for (const stage of rules.stages) {
      rulesPrompt += `\n### ${stage.name} (${stage.days_from}-${stage.days_to} dias)\n`;
      rulesPrompt += `Tom: ${stage.tone}\n`;
      if (stage.actions && stage.actions.length > 0) {
        rulesPrompt += `Ações: ${stage.actions.join(', ')}\n`;
      }
      if (stage.message_template) {
        rulesPrompt += `Template: "${stage.message_template}"\n`;
      }
    }
    rulesPrompt += '\n';
  }
  
  // Exceptions
  if (rules.exceptions && Object.keys(rules.exceptions).length > 0) {
    rulesPrompt += `## TRATAMENTO DE EXCEÇÕES\n`;
    for (const [situation, response] of Object.entries(rules.exceptions)) {
      rulesPrompt += `Se "${situation}": ${response}\n`;
    }
    rulesPrompt += '\n';
  }
  
  // Allowed hours
  if (rules.allowed_hours) {
    rulesPrompt += `## HORÁRIOS PERMITIDOS\n`;
    rulesPrompt += `Contato permitido das ${rules.allowed_hours.start}h às ${rules.allowed_hours.end}h\n\n`;
  }
  
  // Allowed days
  if (rules.allowed_days && rules.allowed_days.length > 0) {
    rulesPrompt += `Dias: ${rules.allowed_days.join(', ')}\n\n`;
  }
  
  return rulesPrompt;
}

/**
 * Build Voice-specific prompt section
 */
export function buildVoicePrompt(voiceConfig: VoiceConfig, mode: 'inbound' | 'outbound'): string {
  const modeConfig = mode === 'inbound' ? voiceConfig.inbound : voiceConfig.outbound;
  
  if (!modeConfig || !modeConfig.enabled) {
    return '';
  }
  
  let voicePrompt = `
═══════════════════════════════════════════════════════════════
🎙️ CONFIGURAÇÕES DE VOZ (AI GYM - ${mode.toUpperCase()})
═══════════════════════════════════════════════════════════════

`;
  
  // Language
  if (modeConfig.language) {
    voicePrompt += `Idioma: ${modeConfig.language}\n`;
  }
  
  // Greeting template
  if (modeConfig.greeting_template) {
    voicePrompt += `Saudação padrão: "${modeConfig.greeting_template}"\n`;
  }
  
  // Max duration warning
  if (modeConfig.max_call_duration_seconds) {
    const minutes = Math.floor(modeConfig.max_call_duration_seconds / 60);
    voicePrompt += `Duração máxima: ${minutes} minutos\n`;
    voicePrompt += `⚠️ Próximo de ${minutes - 1} minutos, avisar que precisa encerrar.\n`;
  }
  
  // Outbound campaign settings
  if (mode === 'outbound' && voiceConfig.outbound?.campaign_settings) {
    const campaign = voiceConfig.outbound.campaign_settings;
    voicePrompt += `\n## CONFIGURAÇÕES DE CAMPANHA\n`;
    if (campaign.calling_hours_start && campaign.calling_hours_end) {
      voicePrompt += `Horário de ligação: ${campaign.calling_hours_start} às ${campaign.calling_hours_end}\n`;
    }
    if (campaign.calling_days && campaign.calling_days.length > 0) {
      voicePrompt += `Dias: ${campaign.calling_days.join(', ')}\n`;
    }
    if (campaign.max_attempts) {
      voicePrompt += `Máximo ${campaign.max_attempts} tentativas por lead\n`;
    }
  }
  
  voicePrompt += '\n';
  return voicePrompt;
}

// ═══════════════════════════════════════════════════════════════
// TOOL CHECKING
// ═══════════════════════════════════════════════════════════════

/**
 * Check if a tool is enabled in the agent's tools_config
 */
export function isToolEnabled(toolsConfig: ToolConfig[], toolName: string): boolean {
  const tool = toolsConfig.find(t => t.name === toolName);
  // If tool not found in config, assume enabled (backward compatibility)
  if (!tool) return true;
  return tool.enabled !== false;
}

/**
 * Get list of enabled tool names
 */
export function getEnabledTools(toolsConfig: ToolConfig[]): string[] {
  return toolsConfig.filter(t => t.enabled !== false).map(t => t.name);
}

// ═══════════════════════════════════════════════════════════════
// COMBINED PROMPT BUILDER
// ═══════════════════════════════════════════════════════════════

/**
 * Build complete AI Gym context to inject into any webhook prompt
 */
export function buildFullAIGymPrompt(
  config: FullAgentConfig, 
  options: { 
    includeKB?: boolean;
    includePersona?: boolean;
    includeGuardrails?: boolean;
    includeCollectionRules?: boolean;
    voiceMode?: 'inbound' | 'outbound' | null;
  } = {}
): string {
  const {
    includeKB = true,
    includePersona = true,
    includeGuardrails = true,
    includeCollectionRules = true,
    voiceMode = null,
  } = options;
  
  let fullPrompt = '';
  
  if (includePersona) {
    fullPrompt += buildPersonaPrompt(config.persona);
  }
  
  if (includeGuardrails) {
    fullPrompt += buildGuardrailsPrompt(config.guardrails);
  }
  
  if (includeKB) {
    fullPrompt += buildKnowledgeBasePrompt(config.kb_sources);
  }
  
  if (includeCollectionRules && config.role === 'collections') {
    fullPrompt += buildCollectionRulesPrompt(config.collection_rules, config.role);
  }
  
  if (voiceMode) {
    fullPrompt += buildVoicePrompt(config.voice_config, voiceMode);
  }
  
  return fullPrompt;
}

/**
 * Get greeting template from voice config, with variable substitution
 */
export function getGreetingTemplate(
  voiceConfig: VoiceConfig, 
  mode: 'inbound' | 'outbound',
  variables: Record<string, string> = {}
): string | null {
  const modeConfig = mode === 'inbound' ? voiceConfig.inbound : voiceConfig.outbound;
  
  if (!modeConfig?.greeting_template) {
    return null;
  }
  
  let greeting = modeConfig.greeting_template;
  
  // Replace variables like {nome}, {desconto}, etc.
  for (const [key, value] of Object.entries(variables)) {
    greeting = greeting.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }
  
  return greeting;
}

// Re-export prompt modules functions
export { 
  loadAgentPromptModules, 
  buildModularPrompt, 
  buildAgentPromptFromModules,
  renderTemplate,
  getModulesByCategory,
  clearModuleCache
} from './prompt-modules.ts';
