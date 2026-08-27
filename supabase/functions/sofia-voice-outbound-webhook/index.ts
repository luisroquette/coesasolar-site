import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  getCorsHeaders,
  handleCorsPrelight,
  errorResponse,
  jsonResponse,
} from '../_shared/security-helpers.ts';
import { validateVoiceOutbound, parseAndValidate } from '../_shared/zod-schemas.ts';

// CORS: Public webhook endpoint (Retell external calls)
const corsHeaders = getCorsHeaders(null as unknown as Request, { mode: 'permissive' });

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const LOVABLE_API_KEY = Deno.env.get('COESA_PROPOSTAS_OPENROUTER_API_KEY');

const MODELS = ['google/gemini-3-flash-preview', 'google/gemini-2.5-flash'];

// ═══════════════════════════════════════════════════════════════
// AI GYM CONFIGURATION LOADER (100% of configs)
// ═══════════════════════════════════════════════════════════════

interface KBSource {
  id: string;
  name: string;
  type: 'document' | 'faq' | 'policy' | 'glossary' | 'api' | 'url' | 'custom';
  description?: string;
  content?: string;
  url?: string;
  enabled: boolean;
}

interface PersonaConfig {
  system_prompt?: string;
  tone?: { default?: string; forbidden?: string[] };
  style?: { max_linhas?: number; emojis_permitidos?: string[] };
  personality?: string[];
  abertura_scripts?: { padrao?: string; retorno?: string; pos_proposta?: string };
}

interface GuardrailsConfig {
  never_do?: string[];
  handoff_triggers?: string[];
  max_messages_without_progress?: number;
  escalation_phrases?: string[];
}

interface ToolConfig {
  name: string;
  enabled: boolean;
  description?: string;
}

interface IntentConfig {
  name: string;
  patterns: string[];
  response_template?: string;
  priority?: number;
}

interface CollectionRules {
  payment_reminder_days?: number[];
  escalation_after_days?: number;
  max_contact_attempts?: number;
  scripts?: { reminder?: string; warning?: string; final?: string };
}

interface CampaignSettings {
  calling_hours_start?: string;
  calling_hours_end?: string;
  calling_days?: string[];
  max_attempts?: number;
  retry_delay_hours?: number;
}

interface VoiceConfig {
  inbound?: { enabled?: boolean; greeting_template?: string };
  outbound?: {
    enabled?: boolean;
    greeting_template?: string;
    max_call_duration_seconds?: number;
    language?: string;
    campaign_settings?: CampaignSettings;
  };
}

interface FullAgentConfig {
  agent_id: string;
  name: string;
  role: string;
  status: string;
  kb_sources: KBSource[];
  persona: PersonaConfig;
  guardrails: GuardrailsConfig;
  tools_config: ToolConfig[];
  intents: IntentConfig[];
  collection_rules: CollectionRules | null;
  voice_config: VoiceConfig;
}

// Cache
let agentConfigCache: { data: FullAgentConfig | null; timestamp: number; agentId: string | null } = { 
  data: null, timestamp: 0, agentId: null 
};
const CACHE_TTL_MS = 5 * 60 * 1000;

async function loadFullAgentConfig(supabaseClient: any, agentId: string = 'sofia_outbound_sales'): Promise<FullAgentConfig> {
  const now = Date.now();
  
  if (agentConfigCache.data && agentConfigCache.agentId === agentId && (now - agentConfigCache.timestamp) < CACHE_TTL_MS) {
    console.log('[AI_GYM] Using cached config for outbound');
    return agentConfigCache.data;
  }
  
  console.log(`[AI_GYM] Loading full config for outbound agent: ${agentId}`);
  
  const SELECT_FIELDS = 'agent_id, name, role, status, kb_sources, persona, guardrails, tools_config, intents, collection_rules, voice_config';
  
  try {
    let agent = null;
    
    // 1. Try specific outbound agent with status='active' first
    const { data: activeAgent } = await supabaseClient
      .from('ai_agents')
      .select(SELECT_FIELDS)
      .eq('agent_id', agentId)
      .eq('status', 'active')
      .limit(1)
      .single();
    
    if (activeAgent) {
      agent = activeAgent;
      console.log(`[AI_GYM] Found active outbound agent: ${agentId}`);
    } else {
      // 2. Try specific agent with status='published'
      const { data: publishedAgent } = await supabaseClient
        .from('ai_agents')
        .select(SELECT_FIELDS)
        .eq('agent_id', agentId)
        .eq('status', 'published')
        .limit(1)
        .single();
      
      if (publishedAgent) {
        agent = publishedAgent;
        console.log(`[AI_GYM] Found published outbound agent: ${agentId}`);
      } else {
        // 3. Try any agent with this ID ordered by updated_at
        const { data: latestAgent } = await supabaseClient
          .from('ai_agents')
          .select(SELECT_FIELDS)
          .eq('agent_id', agentId)
          .order('updated_at', { ascending: false })
          .limit(1)
          .single();
        
        if (latestAgent) {
          agent = latestAgent;
          console.log(`[AI_GYM] Found latest outbound agent: ${agentId} (status: ${latestAgent.status})`);
        }
      }
    }
    
    // 4. Fallback to sofia if specific outbound agent not found
    if (!agent) {
      console.log(`[AI_GYM] No ${agentId} found, falling back to sofia`);
      const { data: sofiaAgent } = await supabaseClient
        .from('ai_agents')
        .select(SELECT_FIELDS)
        .eq('agent_id', 'sofia')
        .in('status', ['active', 'published'])
        .order('status', { ascending: true }) // 'active' comes before 'published' alphabetically
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();
      agent = sofiaAgent;
    }
    
    if (!agent) {
      console.log(`[AI_GYM] No agent found`);
      return getEmptyConfig(agentId);
    }
    
    const config = normalizeConfig(agent);
    agentConfigCache = { data: config, timestamp: now, agentId };
    
    console.log(`[AI_GYM] Loaded outbound config:`, {
      status: config.status,
      kbSources: config.kb_sources.filter(kb => kb.enabled).length,
      hasPersona: !!config.persona.system_prompt,
      guardrailsNeverDo: config.guardrails.never_do?.length || 0,
      handoffTriggers: config.guardrails.handoff_triggers?.length || 0,
      toolsEnabled: config.tools_config.filter(t => t.enabled).length,
      intentsCount: config.intents.length,
      hasCollectionRules: !!config.collection_rules,
      hasCampaignSettings: !!config.voice_config.outbound?.campaign_settings,
    });
    
    return config;
  } catch (err) {
    console.error('[AI_GYM] Error loading config:', err);
    return getEmptyConfig(agentId);
  }
}

function getEmptyConfig(agentId: string): FullAgentConfig {
  return {
    agent_id: agentId, name: agentId, role: 'assistant', status: 'draft',
    kb_sources: [], persona: {}, guardrails: {}, tools_config: [], intents: [], collection_rules: null, voice_config: {},
  };
}

function normalizeConfig(agent: any): FullAgentConfig {
  let kbSources: KBSource[] = [];
  if (Array.isArray(agent.kb_sources)) {
    kbSources = agent.kb_sources.map((source: any, idx: number) => {
      if (typeof source === 'string') {
        return { id: `legacy_${idx}`, name: source, type: 'custom' as const, content: source, enabled: true };
      }
      return source as KBSource;
    });
  }
  
  let toolsConfig: ToolConfig[] = [];
  if (Array.isArray(agent.tools_config)) {
    toolsConfig = agent.tools_config.map((tool: any) => ({
      name: tool.name || 'unknown', enabled: tool.enabled !== false, description: tool.description,
    }));
  }
  
  let intents: IntentConfig[] = [];
  if (Array.isArray(agent.intents)) {
    intents = agent.intents.map((intent: any) => ({
      name: intent.name || 'unknown',
      patterns: intent.patterns || [],
      response_template: intent.response_template,
      priority: intent.priority || 0,
    }));
  }
  
  return {
    agent_id: agent.agent_id, 
    name: agent.name || agent.agent_id, 
    role: agent.role || 'assistant',
    status: agent.status || 'draft',
    kb_sources: kbSources, 
    persona: agent.persona || {}, 
    guardrails: agent.guardrails || {},
    tools_config: toolsConfig, 
    intents,
    collection_rules: agent.collection_rules || null,
    voice_config: agent.voice_config || {},
  };
}

function buildKnowledgeBasePrompt(kbSources: KBSource[]): string {
  const enabledSources = kbSources.filter(kb => kb.enabled);
  if (enabledSources.length === 0) return '';
  
  let kbPrompt = `\n## BASE DE CONHECIMENTO (AI GYM - OUTBOUND)\n\nUse estas informações:\n\n`;
  for (const kb of enabledSources) {
    kbPrompt += `### ${kb.name.toUpperCase()} [${kb.type}]\n`;
    if (kb.content) kbPrompt += `${kb.content}\n\n`;
  }
  return kbPrompt;
}

function buildPersonaPrompt(persona: PersonaConfig): string {
  if (!persona || Object.keys(persona).length === 0) return '';
  
  let prompt = `\n## PERSONA (AI GYM)\n\n`;
  if (persona.system_prompt) prompt += persona.system_prompt + '\n\n';
  if (persona.personality?.length) prompt += `Traços: ${persona.personality.join(', ')}\n`;
  if (persona.tone?.default) prompt += `Tom: ${persona.tone.default}\n`;
  if (persona.tone?.forbidden?.length) prompt += `NUNCA usar tons: ${persona.tone.forbidden.join(', ')}\n`;
  if (persona.style?.max_linhas) prompt += `Máximo ${persona.style.max_linhas} linhas por mensagem\n`;
  return prompt + '\n';
}

function buildGuardrailsPrompt(guardrails: GuardrailsConfig): string {
  if (!guardrails || Object.keys(guardrails).length === 0) return '';
  
  let prompt = `\n## REGRAS E LIMITES (AI GYM)\n\n`;
  if (guardrails.never_do?.length) {
    prompt += `### O QUE NUNCA FAZER:\n`;
    guardrails.never_do.forEach(rule => prompt += `❌ ${rule}\n`);
    prompt += '\n';
  }
  if (guardrails.handoff_triggers?.length) {
    prompt += `### ESCALAR PARA HUMANO QUANDO:\n`;
    guardrails.handoff_triggers.forEach(trigger => prompt += `🚨 ${trigger}\n`);
    prompt += '\n';
  }
  return prompt;
}

function buildCampaignPrompt(voiceConfig: VoiceConfig): string {
  const outbound = voiceConfig.outbound;
  if (!outbound?.enabled) return '';
  
  let prompt = `\n## CONFIG OUTBOUND (AI GYM)\n\n`;
  if (outbound.greeting_template) prompt += `Saudação: "${outbound.greeting_template}"\n`;
  if (outbound.language) prompt += `Idioma: ${outbound.language}\n`;
  if (outbound.max_call_duration_seconds) {
    const mins = Math.floor(outbound.max_call_duration_seconds / 60);
    prompt += `Duração máx: ${mins} min\n`;
  }
  if (outbound.campaign_settings) {
    const cs = outbound.campaign_settings;
    if (cs.calling_hours_start && cs.calling_hours_end) {
      prompt += `Horário: ${cs.calling_hours_start} às ${cs.calling_hours_end}\n`;
    }
    if (cs.calling_days?.length) prompt += `Dias: ${cs.calling_days.join(', ')}\n`;
    if (cs.max_attempts) prompt += `Máx tentativas: ${cs.max_attempts}\n`;
  }
  return prompt + '\n';
}

function buildFullAIGymPrompt(config: FullAgentConfig): string {
  return buildPersonaPrompt(config.persona) +
         buildGuardrailsPrompt(config.guardrails) +
         buildKnowledgeBasePrompt(config.kb_sources) +
         buildCampaignPrompt(config.voice_config);
}

// ═══════════════════════════════════════════════════════════════
// TIPOS E INTERFACES
// ═══════════════════════════════════════════════════════════════

type ConversationStage = 
  | 'greeting' 
  | 'reactivation'
  | 'value_reminder'
  | 'objection_handling' 
  | 'closing' 
  | 'farewell'
  | 'escalation';

type IntentDetected = 
  | 'greeting'
  | 'positive_interest'
  | 'negative_interest'
  | 'ask_price'
  | 'ask_how_it_works'
  | 'ask_discount'
  | 'ask_contract'
  | 'objection_price'
  | 'objection_trust'
  | 'objection_time'
  | 'objection_already_has'
  | 'request_callback'
  | 'request_whatsapp'
  | 'complaint'
  | 'confusion'
  | 'silence'
  | 'unknown';

type NextAction = 'continue' | 'ask' | 'close' | 'schedule_callback' | 'escalate_human';

interface OutboundVoiceRequest {
  call_id: string;
  transcribed_text: string;
  conversation_history?: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  current_stage?: ConversationStage;
  // Dynamic variables from Retell
  retell_llm_dynamic_variables?: {
    customer_name?: string;
    customer_phone?: string;
    last_consumption?: number;
    last_proposal_discount?: number;
    days_since_contact?: number;
    bitrix_lead_id?: string;
    queue_id?: string;
    last_distributor?: string;
    greeting_template?: string;
  };
  metadata?: Record<string, unknown>;
}

interface OutboundVoiceResponse {
  reply_text: string;
  intent_detected: IntentDetected;
  conversation_stage: ConversationStage;
  next_action: NextAction;
  handoff_required: boolean;
  metadata?: {
    schedule_callback_for?: string;
    send_whatsapp?: boolean;
    escalation_reason?: string;
    objection_type?: string;
  };
}

// ═══════════════════════════════════════════════════════════════
// KEYWORDS DE ESCALAÇÃO OBRIGATÓRIA
// ═══════════════════════════════════════════════════════════════

const ESCALATION_KEYWORDS = {
  complaint: [
    'procon', 'processar', 'advogado', 'justiça', 'justica', 'tribunal',
    'reclame aqui', 'reclamação formal', 'reclamacao formal', 'ouvidoria',
    'fraude', 'golpe', 'enganado', 'enganada', 'mentira',
  ],
  frustration: [
    'para de ligar', 'não liga mais', 'nao liga mais', 'cansado de vocês',
    'já disse não', 'ja disse nao', 'quantas vezes preciso dizer',
    'bloquear número', 'bloquear numero', 'denunciar',
  ],
};

// ═══════════════════════════════════════════════════════════════
// SYSTEM PROMPT PARA OUTBOUND (PROATIVO)
// ═══════════════════════════════════════════════════════════════

function buildOutboundSystemPrompt(
  dynamicVars: OutboundVoiceRequest['retell_llm_dynamic_variables'],
  agentConfig: FullAgentConfig
): string {
  const customerName = dynamicVars?.customer_name || 'cliente';
  const lastConsumption = dynamicVars?.last_consumption;
  const lastDiscount = dynamicVars?.last_proposal_discount || 25;
  const daysSinceContact = dynamicVars?.days_since_contact || 7;
  const distributor = dynamicVars?.last_distributor || '';
  
  // GREETING PRECEDENCE: Retell > AI Gym > Default
  const retellGreeting = dynamicVars?.greeting_template;
  const aiGymGreeting = agentConfig.voice_config.outbound?.greeting_template;
  const defaultGreeting = `Oi ${customerName}, aqui é a sofIA da COESA Energia. Tudo bem?`;
  
  let greetingLine: string;
  let greetingSource: string;
  
  if (retellGreeting) {
    greetingLine = retellGreeting.replace('{nome}', customerName).replace('{desconto}', String(lastDiscount));
    greetingSource = 'Retell';
  } else if (aiGymGreeting) {
    greetingLine = aiGymGreeting.replace('{nome}', customerName).replace('{desconto}', String(lastDiscount));
    greetingSource = 'AI Gym';
  } else {
    greetingLine = defaultGreeting;
    greetingSource = 'Default';
  }
  
  console.log(`[AI_GYM] Greeting source: ${greetingSource}`);

  // Build AI Gym injections
  const kbPrompt = buildKnowledgeBasePrompt(agentConfig.kb_sources);
  const personaPrompt = buildPersonaPrompt(agentConfig.persona);
  const guardrailsPrompt = buildGuardrailsPrompt(agentConfig.guardrails);
  const collectionPrompt = buildCollectionRulesPrompt(agentConfig.collection_rules, agentConfig.role);

  return `Você é a sofIA, consultora de energia da COESA, fazendo uma LIGAÇÃO ATIVA (outbound).
${personaPrompt}
## CONTEXTO DESTA LIGAÇÃO

- Nome do cliente: ${customerName}
- Último consumo conhecido: ${lastConsumption ? `${lastConsumption} kWh` : 'não informado'}
- Desconto da última proposta: ${lastDiscount}%
- Dias desde último contato: ${daysSinceContact} dias
- Distribuidora: ${distributor || 'não informada'}

## OBJETIVO PRINCIPAL

Reativar o interesse do cliente e conseguir que ele aceite receber a proposta por WhatsApp ou agende um horário melhor para conversar.
${guardrailsPrompt}
## REGRAS ABSOLUTAS PARA LIGAÇÃO ATIVA

1. **ABERTURA AMIGÁVEL**: Comece com "${greetingLine}" - seja calorosa mas profissional
2. **BREVIDADE EXTREMA**: Máximo 1-3 frases curtas por resposta
3. **RELEMBRE A CONVERSA**: "A gente conversou há uns ${daysSinceContact} dias sobre economia na conta de luz, lembra?"
4. **VENDA O BENEFÍCIO**: Foque na economia (${lastDiscount}% de desconto) sem custo
5. **RESPEITE O NÃO**: Se o cliente disser não claramente, agradeça e encerre educadamente
6. **UMA PERGUNTA POR VEZ**: Nunca faça duas perguntas na mesma resposta

## FLUXO DA LIGAÇÃO OUTBOUND

1. **ABERTURA**: Saudação + identificação
2. **REATIVAÇÃO**: Relembrar conversa anterior e o interesse em economizar
3. **VALOR**: Reforçar economia sem custo
4. **FECHAMENTO**: Propor envio da proposta por WhatsApp HOJE
5. **ALTERNATIVA**: Se ocupado, propor callback em horário melhor

## RESPOSTAS MODELO OUTBOUND

Abertura: "${greetingLine}"

Reativação: "A gente conversou há uns ${daysSinceContact} dias sobre aquela economia de ${lastDiscount}% na sua conta de luz. Continua pagando caro pra ${distributor || 'distribuidora'}?"

Valor: "Bom, a boa notícia é que conseguimos te garantir os mesmos ${lastDiscount}% de desconto sem você instalar nada em casa."

Fechamento: "Posso te mandar a proposta certinha pelo WhatsApp agora? Aí você analisa com calma."

Ocupado: "Entendo! Qual o melhor horário pra eu te ligar? Manhã ou tarde?"

Despedida positiva: "Perfeito! Vou enviar agora pelo WhatsApp. Qualquer dúvida é só responder lá. Bom dia!"

Despedida negativa: "Sem problema! Se mudar de ideia é só me chamar. Tenha um ótimo dia!"
${collectionPrompt}${kbPrompt}
## RESPONDA COMO EM UMA CONVERSA TELEFÔNICA

- Linguagem falada natural (use "tá", "né", contrações)
- Uma ideia por resposta
- Pausas naturais para o cliente falar`;
}

// Build collection rules prompt for collections agents
function buildCollectionRulesPrompt(collectionRules: CollectionRules | null, role: string): string {
  if (role !== 'collections' || !collectionRules) return '';
  
  let prompt = `\n## RÉGUA DE COBRANÇA (AI GYM)\n\n`;
  
  if (collectionRules.payment_reminder_days?.length) {
    prompt += `Dias de lembrete: D+${collectionRules.payment_reminder_days.join(', D+')}\n`;
  }
  if (collectionRules.escalation_after_days) {
    prompt += `Escalar após: ${collectionRules.escalation_after_days} dias\n`;
  }
  if (collectionRules.max_contact_attempts) {
    prompt += `Máx tentativas: ${collectionRules.max_contact_attempts}\n`;
  }
  if (collectionRules.scripts) {
    if (collectionRules.scripts.reminder) prompt += `\nScript lembrete: "${collectionRules.scripts.reminder}"\n`;
    if (collectionRules.scripts.warning) prompt += `Script aviso: "${collectionRules.scripts.warning}"\n`;
    if (collectionRules.scripts.final) prompt += `Script final: "${collectionRules.scripts.final}"\n`;
  }
  
  return prompt + '\n';
}

// ═══════════════════════════════════════════════════════════════
// FUNÇÕES AUXILIARES
// ═══════════════════════════════════════════════════════════════

function detectEscalationNeeded(text: string): { needed: boolean; reason: string | null } {
  const lowerText = text.toLowerCase();
  
  for (const [type, keywords] of Object.entries(ESCALATION_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lowerText.includes(keyword)) {
        return {
          needed: true,
          reason: `${type}: ${keyword}`,
        };
      }
    }
  }
  
  return { needed: false, reason: null };
}

function detectIntent(text: string): IntentDetected {
  const lower = text.toLowerCase();
  
  // Escalation
  if (ESCALATION_KEYWORDS.complaint.some(k => lower.includes(k))) return 'complaint';
  if (ESCALATION_KEYWORDS.frustration.some(k => lower.includes(k))) return 'complaint';
  
  // Greetings
  if (/^(oi|olá|ola|alô|alo|sim|fala|pode falar|quem é|quem e)/i.test(lower)) return 'greeting';
  
  // Positive signals
  if (lower.includes('manda') || lower.includes('envia') || lower.includes('pode enviar') || lower.includes('whatsapp')) {
    return 'request_whatsapp';
  }
  if (lower.includes('quero') || lower.includes('tenho interesse') || lower.includes('pode sim') || lower.includes('beleza')) {
    return 'positive_interest';
  }
  
  // Callback requests
  if (lower.includes('liga depois') || lower.includes('agora não dá') || lower.includes('estou ocupado') || 
      lower.includes('ocupada') || lower.includes('outro horário') || lower.includes('outro horario') ||
      lower.includes('mais tarde') || lower.includes('amanhã') || lower.includes('amanha')) {
    return 'request_callback';
  }
  
  // Negative signals
  if (lower.includes('não quero') || lower.includes('nao quero') || lower.includes('não tenho interesse') ||
      lower.includes('não preciso') || lower.includes('nao preciso') || lower.includes('obrigado mas não') ||
      lower.includes('deixa quieto') || lower.includes('tchau') || lower.includes('adeus')) {
    return 'negative_interest';
  }
  
  // Already has
  if (lower.includes('já tenho') || lower.includes('ja tenho') || lower.includes('já fechei') || 
      lower.includes('ja fechei') || lower.includes('outra empresa') || lower.includes('já assinei') ||
      lower.includes('já sou cliente')) {
    return 'objection_already_has';
  }
  
  // Objections
  if (lower.includes('pensar') || lower.includes('depois') || lower.includes('ver') || lower.includes('ainda não')) {
    return 'objection_time';
  }
  if (lower.includes('confio') || lower.includes('golpe') || lower.includes('verdade') || lower.includes('real')) {
    return 'objection_trust';
  }
  if (lower.includes('caro') || lower.includes('muito')) return 'objection_price';
  
  // Questions
  if (lower.includes('como funciona')) return 'ask_how_it_works';
  if (lower.includes('desconto') || lower.includes('economia')) return 'ask_discount';
  if (lower.includes('contrato') || lower.includes('fidelidade')) return 'ask_contract';
  if (lower.includes('quanto')) return 'ask_price';
  
  // Confusion/Silence
  if (lower.includes('não entendi') || lower.includes('como assim') || lower.includes('repete')) return 'confusion';
  if (lower.trim().length < 3) return 'silence';
  
  return 'unknown';
}

function determineStage(intent: IntentDetected, currentStage?: ConversationStage): ConversationStage {
  if (intent === 'complaint') return 'escalation';
  if (intent === 'greeting') return 'reactivation';
  if (intent === 'negative_interest' || intent === 'objection_already_has') return 'farewell';
  if (intent === 'positive_interest' || intent === 'request_whatsapp') return 'closing';
  if (intent === 'request_callback') return 'closing';
  if (intent.startsWith('objection_')) return 'objection_handling';
  if (intent.startsWith('ask_')) return 'value_reminder';
  
  return currentStage || 'reactivation';
}

function determineNextAction(intent: IntentDetected, stage: ConversationStage): NextAction {
  if (stage === 'escalation') return 'escalate_human';
  if (intent === 'negative_interest' || intent === 'objection_already_has') return 'close';
  if (intent === 'positive_interest' || intent === 'request_whatsapp') return 'close';
  if (intent === 'request_callback') return 'schedule_callback';
  if (intent === 'confusion' || intent === 'unknown') return 'ask';
  
  return 'continue';
}

async function generateOutboundResponse(
  request: OutboundVoiceRequest,
  intent: IntentDetected,
  stage: ConversationStage,
  nextAction: NextAction,
  escalation: { needed: boolean; reason: string | null },
  agentConfig: FullAgentConfig
): Promise<string> {
  const dynamicVars = request.retell_llm_dynamic_variables || {};
  
  // Fixed responses for specific scenarios
  if (escalation.needed) {
    return "Entendi sua situação. Vou encerrar a ligação e pedir pra nossa equipe não te ligar mais, tá bom? Desculpa o incômodo.";
  }
  
  if (intent === 'negative_interest' || intent === 'objection_already_has') {
    return "Sem problema! Agradeço a atenção. Se mudar de ideia, é só chamar a gente. Tenha um ótimo dia!";
  }
  
  if (intent === 'request_whatsapp' || intent === 'positive_interest') {
    return "Perfeito! Vou enviar a proposta pelo WhatsApp agora mesmo. Qualquer dúvida você responde por lá, tá? Obrigada!";
  }
  
  if (intent === 'request_callback') {
    return "Combinado! Qual o melhor horário pra eu te retornar? Manhã ou tarde?";
  }
  
  // Use AI for other responses
  const historyText = request.conversation_history?.map(m => 
    `${m.role === 'user' ? 'Cliente' : 'sofIA'}: ${m.content}`
  ).join('\n') || '';
  
  // Build dynamic prompts from AI Gym config
  const aiGymPrompt = buildFullAIGymPrompt(agentConfig);
  
  // Use greeting template from voice config if first message
  let greetingOverride = '';
  if (intent === 'greeting' && agentConfig.voice_config.outbound?.greeting_template) {
    const template = agentConfig.voice_config.outbound.greeting_template;
    greetingOverride = template
      .replace('{nome}', dynamicVars.customer_name || 'cliente')
      .replace('{desconto}', String(dynamicVars.last_proposal_discount || 25));
    return greetingOverride;
  }
  
  const systemPrompt = buildOutboundSystemPrompt(dynamicVars, agentConfig);
  
  const prompt = `${systemPrompt}${aiGymPrompt}

## HISTÓRICO DA LIGAÇÃO
${historyText || 'Início da ligação outbound'}

## ÚLTIMA FALA DO CLIENTE
"${request.transcribed_text}"

## ANÁLISE
- Intenção detectada: ${intent}
- Estágio atual: ${stage}
- Próxima ação: ${nextAction}

## SUA RESPOSTA

Responda de forma natural, breve (1-3 frases), como em uma conversa telefônica real.
Lembre-se: é uma ligação ATIVA, você que ligou para reativar o interesse.

Sua resposta:`;

  // Try each model
  for (const model of MODELS) {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          max_tokens: 200,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const text = data.choices?.[0]?.message?.content || '';
        
        // Clean up response
        let cleanText = text.trim()
          .replace(/^["']|["']$/g, '')
          .replace(/\*\*/g, '')
          .replace(/\n/g, ' ')
          .replace(/\s+/g, ' ');
        
        // Max 3 sentences
        const sentences = cleanText.match(/[^.!?]+[.!?]+/g) || [cleanText];
        if (sentences.length > 3) {
          cleanText = sentences.slice(0, 3).join(' ');
        }
        
        return cleanText;
      }
      
      console.log(`Model ${model} failed with status ${response.status}`);
    } catch (error) {
      console.error(`Error with model ${model}:`, error);
    }
  }
  
  return "Desculpa, pode repetir?";
}

// ═══════════════════════════════════════════════════════════════
// HANDLER PRINCIPAL
// ═══════════════════════════════════════════════════════════════

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  try {
    const request: OutboundVoiceRequest = await req.json();
    
    console.log('📤 Outbound voice webhook received:', {
      call_id: request.call_id,
      text: request.transcribed_text?.substring(0, 100),
      stage: request.current_stage,
      dynamic_vars: request.retell_llm_dynamic_variables,
    });
    
    // Validate required fields
    if (!request.call_id || !request.transcribed_text) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: call_id and transcribed_text' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Load FULL agent config from AI Gym (100% of configurations)
    const agentConfig = await loadFullAgentConfig(supabase, 'sofia_outbound_sales');
    console.log(`📤 AI Gym config loaded - KB: ${agentConfig.kb_sources.filter(kb => kb.enabled).length}, Guardrails: ${agentConfig.guardrails.never_do?.length || 0}, Tools: ${agentConfig.tools_config.filter(t => t.enabled).length}`);
    
    // Check guardrails for additional escalation triggers
    const escalation = detectEscalationNeeded(request.transcribed_text);
    if (!escalation.needed && agentConfig.guardrails.handoff_triggers?.length) {
      const lowerText = request.transcribed_text.toLowerCase();
      for (const trigger of agentConfig.guardrails.handoff_triggers) {
        if (lowerText.includes(trigger.toLowerCase())) {
          escalation.needed = true;
          escalation.reason = `Guardrail trigger: ${trigger}`;
          console.log(`[OUTBOUND] Guardrail triggered: ${trigger}`);
          break;
        }
      }
    }
    
    const intent = detectIntent(request.transcribed_text);
    const stage = escalation.needed ? 'escalation' : determineStage(intent, request.current_stage);
    const nextAction = determineNextAction(intent, stage);
    
    const replyText = await generateOutboundResponse(request, intent, stage, nextAction, escalation, agentConfig);
    
    const response: OutboundVoiceResponse = {
      reply_text: replyText,
      intent_detected: intent,
      conversation_stage: stage,
      next_action: nextAction,
      handoff_required: escalation.needed,
      metadata: {
        send_whatsapp: intent === 'request_whatsapp' || intent === 'positive_interest',
        schedule_callback_for: intent === 'request_callback' ? 'pending' : undefined,
        escalation_reason: escalation.reason || undefined,
        objection_type: intent.startsWith('objection_') ? intent.replace('objection_', '') : undefined,
      },
    };
    
    const processingTime = Date.now() - startTime;
    console.log('📤 Outbound response:', {
      call_id: request.call_id,
      intent,
      stage,
      processing_time_ms: processingTime,
    });
    
    // Log to database (reuse existing supabase client)
    try {
      const queueId = request.retell_llm_dynamic_variables?.queue_id;
      
      if (queueId) {
        // Update queue with latest interaction
        await supabase.from('outbound_call_queue').update({
          status: stage === 'farewell' || stage === 'closing' ? 'completed' : 'calling',
          updated_at: new Date().toISOString(),
        }).eq('id', queueId);
      }
    } catch (dbError) {
      console.error('Failed to update queue:', dbError);
    }
    
    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('Outbound voice webhook error:', error);
    
    return new Response(
      JSON.stringify({
        reply_text: "Desculpa, tive um problema técnico. Vou encerrar a ligação. Tenha um bom dia!",
        intent_detected: 'unknown',
        conversation_stage: 'farewell',
        next_action: 'close',
        handoff_required: false,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
