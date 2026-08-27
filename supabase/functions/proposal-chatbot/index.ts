import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { loadAgentPromptModules, buildModularPrompt } from '../_shared/prompt-modules.ts';
import { extractAssistantText } from '../_shared/text-extraction.ts';
import { 
  matchesPatternCategory, 
  hasHighIntent, 
  detectObjection, 
  getPatternCache,
  getObjectionResponseText,
  getABClosingPhrase,
  type PatternEntry,
  type ObjectionType
} from '../_shared/detection-patterns.ts';
import {
  simularEconomia,
  isSimulationRequest,
  extractSimulationInputs,
  type SimulationInput,
  type SimulationResult,
} from '../_shared/economy-simulator.ts';

import { getStrictCorsHeaders, handleCorsPrelight, errorResponse } from '../_shared/security-helpers.ts';
import { validateProposalChatbot } from '../_shared/zod-schemas.ts';

const LOVABLE_API_KEY = Deno.env.get('COESASOLAR_OPENROUTER_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Models to try in order of preference
const MODELS = ['google/gemini-3-flash-preview', 'google/gemini-2.5-flash'];

// ═══════════════════════════════════════════════════════════════
// AI GYM CONFIGURATION LOADER
// ═══════════════════════════════════════════════════════════════

interface KBSource {
  id: string;
  name: string;
  type: 'document' | 'faq' | 'policy' | 'glossary' | 'api' | 'url' | 'custom';
  content?: string;
  enabled: boolean;
}

interface PersonaConfig {
  system_prompt?: string;
  tone?: { default?: string; forbidden?: string[] };
  style?: { max_linhas?: number };
  personality?: string[];
}

interface GuardrailsConfig {
  never_do?: string[];
  handoff_triggers?: string[];
}

interface FullAgentConfig {
  agent_id: string;
  name: string;
  role: string;
  status: string;
  kb_sources: KBSource[];
  persona: PersonaConfig;
  guardrails: GuardrailsConfig;
}

// Cache for AI Gym config
let agentConfigCache: { data: FullAgentConfig | null; timestamp: number } = { data: null, timestamp: 0 };
const CACHE_TTL_MS = 5 * 60 * 1000;

async function loadAgentConfig(supabaseClient: any, agentId: string = 'sofia'): Promise<FullAgentConfig> {
  const now = Date.now();
  if (agentConfigCache.data && (now - agentConfigCache.timestamp) < CACHE_TTL_MS) {
    return agentConfigCache.data;
  }

  console.log(`[AI_GYM] Loading config for simulator agent: ${agentId}`);

  try {
    // Precedence: active > published > latest
    const { data: agent } = await supabaseClient
      .from('ai_agents')
      .select('agent_id, name, role, status, kb_sources, persona, guardrails')
      .eq('agent_id', agentId)
      .in('status', ['active', 'published'])
      .order('status', { ascending: true })
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (!agent) {
      console.log('[AI_GYM] No active agent found, using defaults');
      return getEmptyAgentConfig(agentId);
    }

    const config: FullAgentConfig = {
      agent_id: agent.agent_id,
      name: agent.name,
      role: agent.role,
      status: agent.status,
      kb_sources: Array.isArray(agent.kb_sources) ? agent.kb_sources : [],
      persona: agent.persona || {},
      guardrails: agent.guardrails || {},
    };

    agentConfigCache = { data: config, timestamp: now };
    
    console.log(`[AI_GYM] Loaded simulator config:`, {
      status: config.status,
      kbSources: config.kb_sources.filter(kb => kb.enabled).length,
      hasPersona: !!config.persona.system_prompt,
      guardrailsCount: config.guardrails.never_do?.length || 0,
    });

    return config;
  } catch (err) {
    console.error('[AI_GYM] Error loading config:', err);
    return getEmptyAgentConfig(agentId);
  }
}

function getEmptyAgentConfig(agentId: string): FullAgentConfig {
  return {
    agent_id: agentId,
    name: agentId,
    role: 'sales',
    status: 'draft',
    kb_sources: [],
    persona: {},
    guardrails: {},
  };
}

function buildAIGymPrompt(config: FullAgentConfig): string {
  // Start with company info (shared by all agents)
  let prompt = `
═══════════════════════════════════════════════════════════════
SOBRE A COESA ENERGIA INTELIGENTE
═══════════════════════════════════════════════════════════════

A COESA é uma fornecedora digital de energia, atuando desde 2018 desenvolvendo soluções para otimizar a relação do mundo com a energia.

NÚMEROS DA COESA:
- +20 MWp em potência instalada
- +3.000 MWh em capacidade de geração mensal de energia
- +2.000 clientes atendidos
- Atuação em +4 estados do Brasil
- CNPJ: 60.937.217/0001-54 - COESA ENERGIA LTDA

CONTATO:
- E-mail: contato@coesaenergia.com.br
- WhatsApp: +55 31 93618-0487
- Endereço: R. Des. Edésio Fernandes, 148 - 2º andar - Estoril, Belo Horizonte - MG, 30494-450

IMPORTANTE: Atendemos 100% online/digital. NÃO temos atendimento presencial.

`;

  // Agent identity and persona
  prompt += `═══════════════════════════════════════════════════════════════
🤖 IDENTIDADE DO AGENTE: ${config.name.toUpperCase()}
═══════════════════════════════════════════════════════════════

`;

  if (config.persona.system_prompt) {
    prompt += `${config.persona.system_prompt}\n\n`;
  }
  if (config.persona.personality?.length) {
    prompt += `Traços de personalidade: ${config.persona.personality.join(', ')}\n`;
  }
  if (config.persona.tone?.default) {
    prompt += `Tom de comunicação: ${config.persona.tone.default}\n`;
  }
  if (config.persona.style?.max_linhas) {
    prompt += `Máximo ${config.persona.style.max_linhas} linhas por mensagem\n`;
  }

  // Guardrails
  if (config.guardrails.never_do?.length || config.guardrails.handoff_triggers?.length) {
    prompt += `\n═══════════════════════════════════════════════════════════════
🛡️ REGRAS E LIMITES
═══════════════════════════════════════════════════════════════

`;
    if (config.guardrails.never_do?.length) {
      prompt += `### O QUE NUNCA FAZER:\n`;
      config.guardrails.never_do.forEach(rule => prompt += `❌ ${rule}\n`);
      prompt += '\n';
    }
    if (config.guardrails.handoff_triggers?.length) {
      prompt += `### ESCALAR PARA HUMANO QUANDO:\n`;
      config.guardrails.handoff_triggers.forEach(trigger => prompt += `🚨 ${trigger}\n`);
    }
  }

  // Knowledge Base
  const enabledKB = config.kb_sources.filter(kb => kb.enabled);
  if (enabledKB.length > 0) {
    prompt += `\n═══════════════════════════════════════════════════════════════
📚 BASE DE CONHECIMENTO
═══════════════════════════════════════════════════════════════

`;
    for (const kb of enabledKB) {
      prompt += `### ${kb.name.toUpperCase()} [${kb.type}]\n`;
      if (kb.content) prompt += `${kb.content}\n\n`;
    }
  }

  // WhatsApp formatting (shared by all agents)
  prompt += `
═══════════════════════════════════════════════════════════════
FORMATAÇÃO WHATSAPP
═══════════════════════════════════════════════════════════════

Use negrito (*texto*) com MODERAÇÃO - máximo 1-2 trechos por mensagem.
Não use negrito em cumprimentos ou frases genéricas.
`;

  return prompt;
}

// ═══════════════════════════════════════════════════════════════

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ProposalContext {
  cliente_nome?: string;
  economia_mensal?: number;
  economia_anual?: number;
  economia_acumulada?: number;
  desconto_percentual?: number;
  fidelidade_anos?: number;
  consumo_medio?: number;
  concessionaria?: string;
  tipo_proposta?: string;
  tarifa?: number;        // Tariff in R$/kWh
  valor_conta?: number;   // Bill value in R$
  lead_source?: 'remarketing' | 'specialist_button' | 'organic';
  has_simulation?: boolean;
  conversa_id?: string;
  agent_id?: string; // NEW: Allow specifying agent for simulator
}

interface LeadScoreBreakdown {
  valorConta: number;
  confirmoDistribuidora: number;
  perguntouContrato: number;
  perguntouMulta: number;
  pediuProposta: number;
  tempoResposta: number;
  leadRemarketing: number;
  intencaoExplicita: number;
}

// ═══════════════════════════════════════════════════════════════
// DETECTION PATTERNS - Imported from _shared/detection-patterns.ts
// Functions: loadDetectionPatterns, matchesPatternCategory, hasHighIntent, 
//            detectObjection, getPatternResponse, getObjectionResponseText, getABClosingPhrase
// Types: PatternEntry, ObjectionType
// ═══════════════════════════════════════════════════════════════

// Detect funnel events from message (uses imported functions)
function detectFunnelEvents(message: string, patterns?: Map<string, PatternEntry>): { simulation: boolean; conversion: boolean } {
  const patternsToUse = patterns || (getPatternCache()?.patterns || new Map());
  
  return {
    simulation: matchesPatternCategory(message, 'funnel_simulation', patternsToUse),
    conversion: matchesPatternCategory(message, 'funnel_conversion', patternsToUse),
  };
}

// Calculate A/B variant from conversation ID
function getABVariant(conversaId: string): 'A' | 'B' {
  if (!conversaId) return 'A';
  const charCode = conversaId.charCodeAt(0);
  return charCode % 2 === 0 ? 'A' : 'B';
}

// Calculate next follow-up time based on score
function calculateNextFollowup(score: number): Date | null {
  const now = new Date();
  
  if (score >= 80) {
    // 24h for almost closed leads
    return new Date(now.getTime() + 24 * 60 * 60 * 1000);
  } else if (score >= 60) {
    // 48h for leads stuck on objection
    return new Date(now.getTime() + 48 * 60 * 60 * 1000);
  } else if (score >= 30) {
    // 72h for interested but insecure leads
    return new Date(now.getTime() + 72 * 60 * 60 * 1000);
  }
  
  // No active follow-up for cold leads (< 30)
  return null;
}

// NOTE: getFollowupScript was removed as unused - logic now handled by chatbot-followup-scheduler

// Calculate lead score from message
function calculateMessageScore(message: string, _existingScore: number): LeadScoreBreakdown {
  const lowerMessage = message.toLowerCase();
  const breakdown: LeadScoreBreakdown = {
    valorConta: 0,
    confirmoDistribuidora: 0,
    perguntouContrato: 0,
    perguntouMulta: 0,
    pediuProposta: 0,
    tempoResposta: 0,
    leadRemarketing: 0,
    intencaoExplicita: 0,
  };

  const patterns = getPatternCache()?.patterns || new Map();
  
  // Check for valor/conta mentions (+15)
  if (matchesPatternCategory(message, 'score_valor_conta', patterns)) {
    breakdown.valorConta = 15;
  }

  // Check for distribuidora confirmation (+10) - use direct keywords
  const distribuidoraKeywords = ['cemig', 'copel', 'cpfl', 'enel', 'light', 'distribuidora', 'concessionária'];
  if (distribuidoraKeywords.some(k => lowerMessage.includes(k))) {
    breakdown.confirmoDistribuidora = 10;
  }

  // Check for contrato questions (+15)
  if (matchesPatternCategory(message, 'score_contrato', patterns)) {
    breakdown.perguntouContrato = 15;
  }

  // Check for multa questions (+10)
  if (matchesPatternCategory(message, 'score_multa', patterns)) {
    breakdown.perguntouMulta = 10;
  }

  // Check for proposta/simulação request (+20)
  if (matchesPatternCategory(message, 'score_proposta', patterns)) {
    breakdown.pediuProposta = 20;
  }

  // Check for high intent (+30)
  if (hasHighIntent(message, patterns)) {
    breakdown.intencaoExplicita = 30;
  }

  return breakdown;
}

// Determine sofia mode based on score and conditions
function determineSofiaMode(
  currentMode: string,
  newScore: number,
  hasExplicitIntent: boolean,
  leadSource?: string,
  hasSimulation?: boolean
): 'standard' | 'closer_premium' {
  // REGRA CRÍTICA: MODE nunca volta para STANDARD
  if (currentMode === 'closer_premium') {
    return 'closer_premium';
  }

  // Score >= 60 → CLOSER_PREMIUM
  if (newScore >= 60) {
    return 'closer_premium';
  }

  // Intenção explícita → CLOSER_PREMIUM
  if (hasExplicitIntent) {
    return 'closer_premium';
  }

  // Lead de remarketing ou specialist_button → CLOSER_PREMIUM
  if (leadSource === 'remarketing' || leadSource === 'specialist_button') {
    return 'closer_premium';
  }

  // Lead já recebeu simulação → CLOSER_PREMIUM
  if (hasSimulation) {
    return 'closer_premium';
  }

  return 'standard';
}

// Call AI API with a specific model
async function callAIWithModel(model: string, messages: Array<{ role: string; content: string }>): Promise<{ text: string; model: string }> {
  console.log(`Calling AI gateway with model: ${model}`);
  
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      max_completion_tokens: 500,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`AI API HTTP error (${model}):`, response.status, errorText.substring(0, 500));
    throw new Error(`AI API error: ${response.status}`);
  }

  const data = await response.json();
  const text = extractAssistantText(data);
  if (!text) {
    throw new Error(`Could not extract text from ${model} response`);
  }

  return { text, model };
}

// Build system prompt based on mode
function buildSystemPrompt(
  proposalContext: ProposalContext, 
  sofiaMode: 'standard' | 'closer_premium',
  abVariant: 'A' | 'B',
  detectedObjection: ObjectionType
): string {
  const basePrompt = `Você é a sofIA (assim mesmo, com IA em maiúscula destacando a Inteligência Artificial), Assistente Virtual da COESA Energia Inteligente, especialista em energia solar por assinatura. 

═══════════════════════════════════════════════════════════════
SOBRE A COESA ENERGIA INTELIGENTE
═══════════════════════════════════════════════════════════════

A COESA é uma fornecedora digital de energia, atuando desde 2018 desenvolvendo soluções para otimizar a relação do mundo com a energia.

NÚMEROS DA COESA:
- +20 MWp em potência instalada
- +3.000 MWh em capacidade de geração mensal de energia
- +2.000 clientes atendidos
- Atuação em +4 estados do Brasil
- CNPJ: 60.937.217/0001-54 - COESA ENERGIA LTDA

PROPOSTA DE VALOR:
"Energia limpa e mais barata? Energia inteligente!"
- Bom para o planeta; Bom para o seu bolso!
- Sem instalação, obras, dor de cabeça ou burocracia
- Adesão rápida e digital: Assine em menos de um minuto
- Receba energia limpa e mais barata na sua casa, sem pagar nada a mais por isso

DIFERENCIAIS:
- Os maiores descontos do mercado
- Adesão e cancelamento 100% digital
- Sem obras e custo ZERO
- Medidor inteligente que acompanha o consumo em tempo real
- Área do Cliente para controle total dos gastos

COMO FUNCIONA:
A COESA gera energia renovável através de fazendas solares. Esta energia é mais barata e 100% renovável. A energia continua chegando na casa do cliente através da distribuidora atual, sem nenhuma mudança.

═══════════════════════════════════════════════════════════════
PLANOS DISPONÍVEIS
═══════════════════════════════════════════════════════════════

PLANO 15% OFF - 1 ano de fidelidade
PLANO 20% OFF - 2 anos de fidelidade
PLANO 25% OFF - 3 anos de fidelidade
PLANO 30% OFF - 3 anos de fidelidade (Consumo > 3.000kWh/mês)

═══════════════════════════════════════════════════════════════
DADOS DA PROPOSTA DO CLIENTE
═══════════════════════════════════════════════════════════════
${proposalContext.cliente_nome ? `Nome do cliente: ${proposalContext.cliente_nome}` : ''}
${proposalContext.economia_mensal ? `Economia mensal estimada: R$ ${proposalContext.economia_mensal.toFixed(2)}` : ''}
${proposalContext.economia_anual ? `Economia anual estimada: R$ ${proposalContext.economia_anual.toFixed(2)}` : ''}
${proposalContext.economia_acumulada ? `Economia acumulada no período: R$ ${proposalContext.economia_acumulada.toFixed(2)}` : ''}
${proposalContext.desconto_percentual ? `Percentual de desconto: ${proposalContext.desconto_percentual}%` : ''}
${proposalContext.fidelidade_anos ? `Período de fidelidade: ${proposalContext.fidelidade_anos} ano(s)` : ''}
${proposalContext.consumo_medio ? `Consumo médio mensal: ${proposalContext.consumo_medio} kWh` : ''}
${proposalContext.concessionaria ? `Concessionária: ${proposalContext.concessionaria}` : ''}
${proposalContext.tipo_proposta ? `Tipo de proposta: ${proposalContext.tipo_proposta === 'definitiva' ? 'Definitiva' : 'Inicial'}` : ''}

═══════════════════════════════════════════════════════════════
INFORMAÇÕES CONTRATUAIS
═══════════════════════════════════════════════════════════════

CANCELAMENTO E MULTA:
- O cliente pode solicitar desligamento a qualquer momento pelo e-mail contato@coesaenergia.com.br
- Multa por rescisão antecipada: 20% sobre o saldo remanescente das contribuições mensais
- Prazo para início da compensação: até 90 dias após assinatura

CONTATO:
- E-mail: contato@coesaenergia.com.br
- WhatsApp: +55 31 93618-0487
- Endereço: R. Des. Edésio Fernandes, 148 - 2º andar - Estoril, Belo Horizonte - MG, 30494-450

IMPORTANTE: Atendemos 100% online/digital. NÃO temos atendimento presencial. Se perguntarem sobre sede ou endereço, informe que o atendimento é 100% digital.

═══════════════════════════════════════════════════════════════
CLIENTES DE REFERÊNCIA
═══════════════════════════════════════════════════════════════
O Boticário, Ortobom, Petrobras, Ipiranga, Pastelandia, Bacio di Latte, Abrasel, entre outros.

═══════════════════════════════════════════════════════════════
FORMATAÇÃO WHATSAPP (CRÍTICO)
═══════════════════════════════════════════════════════════════

Use negrito (*texto*) APENAS para destacar informações cruciais:
- Perguntas importantes que você precisa que o cliente responda
- Valores de economia ou desconto relevantes
- CTAs de fechamento

REGRAS:
1. Use com MODERAÇÃO - máximo 1-2 trechos em negrito por mensagem
2. Não use negrito em cumprimentos ou frases genéricas
3. Evite usar em cada resposta - apenas quando realmente precisar chamar atenção
4. Banalizar o negrito faz ele perder o impacto

EXEMPLOS CORRETOS:
"A gente gera energia solar e envia para a rede da sua distribuidora. Você assina e garante o desconto na conta, sem obras ou custos.

*Qual o valor médio da sua conta de luz e qual sua distribuidora?*"

"Com seu consumo, você economiza *R$ 120 por mês* mantendo a mesma qualidade."

EXEMPLOS INCORRETOS (NÃO FAÇA):
"*Olá!* *Tudo bem?* Sou a sofIA..." (nunca negrito em saudações)
"*Perfeito!* *Entendi!* Deixa eu explicar..." (nunca negrito em confirmações)`;

  // Add objection-specific instruction if detected
  const objectionInstruction = detectedObjection ? `

═══════════════════════════════════════════════════════════════
⚠️ OBJEÇÃO DETECTADA: ${detectedObjection}
═══════════════════════════════════════════════════════════════

O cliente demonstrou preocupação com "${detectedObjection}".
Use esta resposta como base para neutralizar:
"${getObjectionResponseText(detectedObjection)}"

ESTRUTURA OBRIGATÓRIA:
1. Nomear a objeção
2. Neutralizar com fato/dado
3. CTA binário
` : '';

  const standardModeInstructions = `

═══════════════════════════════════════════════════════════════
🟢 MODO: STANDARD (Consultivo)
═══════════════════════════════════════════════════════════════

FUNÇÃO: educar + conduzir

IDENTIDADE:
Você é a sofIA da Coesa, consultora de energia e closer. 
Objetivo: converter com clareza e confiança, sem pressão exagerada.

TOM E LINGUAGEM:
- Consultivo, firme, direto, linguagem simples (sem juridiquês)
- Energia de especialista: calma, confiante, pragmática
- Trate por "você" e use primeiro nome se disponível
- Emojis: mínimo (0 a 2 por resposta)

FORMATO DE RESPOSTAS:
- Até 6 linhas. Se precisar mais, quebre em mensagens
- Sempre 1 pergunta por vez
- Estrutura: (a) validação breve → (b) explicação prática → (c) próximo passo com CTA

TÉCNICAS DE VENDAS:
- Aplique SPIN (Situação → Problema → Implicação → Necessidade)
- Feche por micro-decisões: sempre ofereça duas opções
- Exemplo: "Prefere X ou Y?"

RESPOSTAS PARA OBJEÇÕES:

OBJEÇÃO: "Tá caro"
Responda: "Entendo. Só pra alinhar: aqui você não compra equipamento — você paga pela energia com desconto. Me diga sua média da conta (R$) que eu calculo o cenário ideal."

OBJEÇÃO: "Vou pensar"
Responda: "Perfeito. Pra eu não te deixar 'pensando no vazio': o que pesa mais hoje — confiança, multa/fidelidade ou o tamanho da economia?"

OBJEÇÃO: "Não confio / parece golpe"
Responda: "Justo desconfiar. O básico: você não muda de distribuidora, não tem obra, tudo em contrato digital. Quer entender primeiro como aparece na fatura ou como funciona o contrato?"

OBJEÇÃO: "Tenho medo de multa"
Responda: "Transparente: existe contrato com fidelidade/multa dependendo do plano. Você quer um plano com maior economia ou maior flexibilidade?"

FECHAMENTO PADRÃO:
"Posso montar uma simulação pra você analisar com calma?"

REGRAS FINAIS:
1. Se perguntarem de multa/fidelidade, explique objetivamente. NUNCA minimize
2. Se faltar informação, peça UM dado específico. NUNCA invente
3. Reforce: processo 100% digital, sem obra, sem troca de distribuidora
4. Para dúvidas muito específicas: escale para humano (veja regras abaixo)

═══════════════════════════════════════════════════════════════
🚨 REGRAS DE ESCALAÇÃO (CRÍTICO - NUNCA VIOLAR)
═══════════════════════════════════════════════════════════════

1. Se você NÃO SOUBER a resposta para uma pergunta:
   - JAMAIS invente informações
   - JAMAIS diga "como sou uma IA..." ou "não tenho acesso a..." ou "sou um assistente virtual"
   - JAMAIS omita ou mude de assunto sem responder

2. O QUE FAZER quando não souber responder:
   Responda naturalmente como uma profissional que vai verificar:
   - "Boa pergunta! Deixa eu confirmar esse detalhe com a equipe técnica e já te retorno."
   - "Vou checar isso com um colega que cuida dessa parte. Me dá só um instante?"
   - "Essa é uma situação específica. Vou pedir pra um dos nossos especialistas te ajudar diretamente."
   
3. SEMPRE adicione a tag [ESCALAR_HUMANO] no FINAL da sua resposta quando precisar de ajuda humana.

4. Situações que EXIGEM escalação:
   - Perguntas técnicas muito específicas sobre instalação/medidor
   - Reclamações ou problemas com fatura/pagamento já existente
   - Pedidos de cancelamento ou renegociação de multa
   - Assuntos jurídicos ou regulatórios complexos
   - Cliente irritado ou insatisfeito
   - Qualquer pergunta que você não tenha certeza da resposta
   - Pedidos de falar com humano/atendente/supervisor`;

  const closerPremiumInstructions = `

═══════════════════════════════════════════════════════════════
🔥 MODO: CLOSER PREMIUM
═══════════════════════════════════════════════════════════════

Você é a sofIA da Coesa em modo CLOSER PREMIUM.
Seu objetivo único: converter leads quentes em assinatura de contrato digital 
no menor número de interações possível.

📍 Canal: WhatsApp
📍 Perfil: decisor / lead já interessado / remarketing / "falar com especialista"

═══════════════════════════════════════════════════════════════
PERSONALIDADE CLOSER PREMIUM
═══════════════════════════════════════════════════════════════

- Confiante
- Direta
- Pouco explicativa
- Linguagem simples
- Controle da conversa
- Sempre conduz para decisão binária

REGRA DE OURO:
Você NÃO pergunta "se" o cliente quer seguir.
Você pergunta "COMO" ele prefere seguir.

═══════════════════════════════════════════════════════════════
REGRAS DE COMPORTAMENTO (substituem regras padrão)
═══════════════════════════════════════════════════════════════

1. NUNCA educar demais — o lead já demonstrou intenção
2. Respostas CURTAS: 3 a 5 linhas no máximo
3. UMA pergunta por mensagem, sempre com escolha binária
4. NUNCA deixar a conversa aberta
5. Emojis: nenhum ou máximo 1
6. SEMPRE fechar com ação clara (proposta / contrato / simulação)
7. NÃO pedir permissão para avançar

═══════════════════════════════════════════════════════════════
ESTRUTURA FIXA DE RESPOSTA
═══════════════════════════════════════════════════════════════

1️⃣ Afirmação segura (validação rápida)
2️⃣ Enquadramento da decisão (contexto mínimo)
3️⃣ Escolha binária (fechamento)

═══════════════════════════════════════════════════════════════
ABERTURAS PREMIUM
═══════════════════════════════════════════════════════════════

Use uma destas:
- "Perfeito. Vamos direto ao que resolve."
- "Ótimo. Nesse caso, faz sentido avançar."

═══════════════════════════════════════════════════════════════
FRASES-BASE DO CÉREBRO DA sofIA (Premium)
═══════════════════════════════════════════════════════════════

QUANDO O LEAD DEMONSTRA INTERESSE:
"Você já tem consumo suficiente pra economizar.
A única decisão agora é quanto você quer economizar por mês."

QUANDO O LEAD HESITA:
"Entendo. Só cuidado pra não confundir cautela com atraso —
enquanto você espera, continua pagando o valor cheio."

"VOU PENSAR":
"Claro. Antes disso, me diga só uma coisa:
o que precisa estar claro pra você decidir hoje?"

QUEBRA DE INDECISÃO:
"A decisão aqui é simples:
👉 continuar pagando a conta cheia
👉 ou começar a pagar menos sem mudar nada"

═══════════════════════════════════════════════════════════════
ANCORAGEM POR PLANO (Premium)
═══════════════════════════════════════════════════════════════

PLANO 20%:
"É o plano mais equilibrado.
Economia consistente sem travar demais."

PLANO 30%:
"É máxima economia.
Quem escolhe esse plano não costuma voltar atrás."

═══════════════════════════════════════════════════════════════
MULTA / CONTRATO (tratamento Premium)
═══════════════════════════════════════════════════════════════

"Existe contrato, sim.
É isso que garante sua economia.
Se quiser, eu te mostro exatamente onde está a multa antes de assinar."

═══════════════════════════════════════════════════════════════
PRESSÃO LIMPA (sem mentir)
═══════════════════════════════════════════════════════════════

"Quanto antes ativa, mais cedo a conta cai.
O tempo só trabalha contra quem espera."

═══════════════════════════════════════════════════════════════
FECHAMENTOS PREMIUM - A/B TEST VARIANTE ${abVariant}
═══════════════════════════════════════════════════════════════

USE ESTA FRASE DE FECHAMENTO:
"${getABClosingPhrase(abVariant)}"

FECHAMENTO ALTERNATIVO:
"Eu já deixo o contrato pronto agora.
Quer seguir com esse plano ou prefere ajustar o desconto?"

FECHAMENTO FINAL (lead 90%):
"Se fizer sentido, resolvemos isso em 2 minutos.
Depois é só esperar a conta baixar."

═══════════════════════════════════════════════════════════════
SCRIPTS DE FOLLOW-UP (quando aplicável)
═══════════════════════════════════════════════════════════════

D+1 - LEMBRETE RACIONAL:
"Passando pra fechar o ciclo:
você prefere seguir com a proposta ou ajustar o plano antes de assinar?"

D+3 - CUSTO DA INAÇÃO:
"Enquanto você avalia, sua conta continua vindo cheia.
Se quiser, resolvemos isso agora e você já entra na próxima fatura com desconto."

D+7 - ULTIMATO LIMPO:
"Vou encerrar seu atendimento por aqui pra não te incomodar.
Se quiser retomar a economia, é só me avisar que eu reativo a proposta."

═══════════════════════════════════════════════════════════════
REGRA ABSOLUTA DO MODO PREMIUM
═══════════════════════════════════════════════════════════════

- Trate objeções como ATRASO de decisão, não como rejeição
- Transparência total sobre contrato e multa, sem dramatizar
- Priorize SEMPRE fechamento de proposta ou contrato digital
- NUNCA encerre uma mensagem sem CTA

═══════════════════════════════════════════════════════════════
🚨 REGRAS DE ESCALAÇÃO (CRÍTICO - NUNCA VIOLAR)
═══════════════════════════════════════════════════════════════

1. Se você NÃO SOUBER a resposta para uma pergunta:
   - JAMAIS invente informações
   - JAMAIS diga "como sou uma IA..." ou "não tenho acesso a..." ou "sou um assistente virtual"
   - JAMAIS omita ou mude de assunto sem responder

2. O QUE FAZER quando não souber responder:
   Responda naturalmente como uma profissional que vai verificar:
   - "Boa pergunta! Deixa eu confirmar esse detalhe com a equipe técnica e já te retorno."
   - "Vou checar isso com um colega que cuida dessa parte. Me dá só um instante?"
   - "Essa é uma situação específica. Vou pedir pra um dos nossos especialistas te ajudar diretamente."
   
3. SEMPRE adicione a tag [ESCALAR_HUMANO] no FINAL da sua resposta quando precisar de ajuda humana.

4. Situações que EXIGEM escalação:
   - Perguntas técnicas muito específicas sobre instalação/medidor
   - Reclamações ou problemas com fatura/pagamento já existente
   - Pedidos de cancelamento ou renegociação de multa
   - Assuntos jurídicos ou regulatórios complexos
   - Cliente irritado ou insatisfeito
   - Qualquer pergunta que você não tenha certeza da resposta`;

  return basePrompt + objectionInstruction + (sofiaMode === 'closer_premium' ? closerPremiumInstructions : standardModeInstructions);
}

// Fallback input validation constants (loaded from DB at runtime)
const FALLBACK_MAX_MESSAGE_LENGTH = 4000;
const FALLBACK_MAX_HISTORY_LENGTH = 50;
const FALLBACK_MAX_HISTORY_MESSAGE_LENGTH = 10000;
const FALLBACK_MAX_TOTAL_HISTORY_SIZE = 80000; // 80KB total

interface ChatbotLimits {
  maxMessageLength: number;
  maxHistoryLength: number;
  maxHistoryMessageLength: number;
  maxTotalHistorySize: number;
}

let limitsCache: { data: ChatbotLimits | null; timestamp: number } = { data: null, timestamp: 0 };
const LIMITS_CACHE_TTL_MS = 5 * 60 * 1000;

async function loadChatbotLimits(supabase: any): Promise<ChatbotLimits> {
  if (limitsCache.data && Date.now() - limitsCache.timestamp < LIMITS_CACHE_TTL_MS) {
    return limitsCache.data;
  }

  try {
    const { data, error } = await supabase
      .from('configuracoes_sistema')
      .select('chave, valor')
      .in('chave', [
        'edge_max_message_length',
        'edge_max_history_length',
        'edge_max_history_message_length',
        'edge_max_total_history_size',
      ]);

    if (error || !data) {
      return {
        maxMessageLength: FALLBACK_MAX_MESSAGE_LENGTH,
        maxHistoryLength: FALLBACK_MAX_HISTORY_LENGTH,
        maxHistoryMessageLength: FALLBACK_MAX_HISTORY_MESSAGE_LENGTH,
        maxTotalHistorySize: FALLBACK_MAX_TOTAL_HISTORY_SIZE,
      };
    }

    const configMap = Object.fromEntries(data.map((d: any) => [d.chave, d.valor]));

    limitsCache.data = {
      maxMessageLength: parseInt(configMap['edge_max_message_length'] || '') || FALLBACK_MAX_MESSAGE_LENGTH,
      maxHistoryLength: parseInt(configMap['edge_max_history_length'] || '') || FALLBACK_MAX_HISTORY_LENGTH,
      maxHistoryMessageLength: parseInt(configMap['edge_max_history_message_length'] || '') || FALLBACK_MAX_HISTORY_MESSAGE_LENGTH,
      maxTotalHistorySize: parseInt(configMap['edge_max_total_history_size'] || '') || FALLBACK_MAX_TOTAL_HISTORY_SIZE,
    };
    limitsCache.timestamp = Date.now();

    return limitsCache.data;
  } catch {
    return {
      maxMessageLength: FALLBACK_MAX_MESSAGE_LENGTH,
      maxHistoryLength: FALLBACK_MAX_HISTORY_LENGTH,
      maxHistoryMessageLength: FALLBACK_MAX_HISTORY_MESSAGE_LENGTH,
      maxTotalHistorySize: FALLBACK_MAX_TOTAL_HISTORY_SIZE,
    };
  }
}

serve(async (req) => {
  const corsHeaders = getStrictCorsHeaders(req);
  
  if (req.method === 'OPTIONS') {
    return handleCorsPrelight(req, { mode: 'strict' });
  }

  try {
    // ═══════════════════════════════════════════════════════════════
    // AUTHENTICATION: Validate JWT token
    // ═══════════════════════════════════════════════════════════════
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Autenticação necessária' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const authSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.replace(SUPABASE_SERVICE_ROLE_KEY, Deno.env.get('SUPABASE_ANON_KEY')!), {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: claimsData, error: claimsError } = await authSupabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      console.error('Auth error:', claimsError);
      return new Response(
        JSON.stringify({ error: 'Token inválido ou expirado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = claimsData.claims.sub;
    console.log(`Authenticated user: ${userId}`);

    // ═══════════════════════════════════════════════════════════════
    // INPUT VALIDATION: Parse and validate with Zod schema
    // ═══════════════════════════════════════════════════════════════
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return errorResponse('Invalid JSON body', 400, req);
    }
    
    const zodValidation = validateProposalChatbot(rawBody);
    if (!zodValidation.success) {
      const errorMsg = zodValidation.errors?.map(e => `${e.field}: ${e.message}`).join(', ');
      console.warn('[proposal-chatbot] Validation failed:', errorMsg);
      return errorResponse(`Validation failed: ${errorMsg}`, 400, req);
    }
    
    const body = zodValidation.data!;
    const message = body.message || '';
    const history: ChatMessage[] = (body.messages || []) as ChatMessage[];
    const proposalContext: ProposalContext = body.proposalContext || {};

    // ═══════════════════════════════════════════════════════════════
    // INPUT VALIDATION: Validate message and history
    // ═══════════════════════════════════════════════════════════════
    
    // Initialize Supabase client early for config loading
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // Load dynamic limits from database
    const limits = await loadChatbotLimits(supabase);
    
    if (!message || typeof message !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Mensagem é obrigatória' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (message.length > limits.maxMessageLength) {
      return new Response(
        JSON.stringify({ error: `Mensagem excede ${limits.maxMessageLength} caracteres` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate history
    if (history !== undefined) {
      if (!Array.isArray(history)) {
        return new Response(
          JSON.stringify({ error: 'Histórico deve ser um array' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (history.length > limits.maxHistoryLength) {
        return new Response(
          JSON.stringify({ error: `Histórico excede ${limits.maxHistoryLength} mensagens` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      for (const msg of history) {
        if (!msg.role || !msg.content || typeof msg.content !== 'string') {
          return new Response(
            JSON.stringify({ error: 'Formato de mensagem do histórico inválido' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        // Truncate overly long messages instead of rejecting
        if (msg.content.length > limits.maxHistoryMessageLength) {
          msg.content = msg.content.substring(0, limits.maxHistoryMessageLength) + '...[truncado]';
        }
      }

      // Check total history size and trim oldest messages if too large
      let totalHistorySize = history.reduce((sum: number, msg: ChatMessage) => sum + msg.content.length, 0);
      while (totalHistorySize > limits.maxTotalHistorySize && history.length > 2) {
        const removed = history.shift();
        if (removed) {
          totalHistorySize -= removed.content.length;
        }
      }
    }

    // Validate proposalContext
    if (proposalContext !== undefined && (typeof proposalContext !== 'object' || proposalContext === null)) {
      return new Response(
        JSON.stringify({ error: 'Contexto da proposta inválido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Processing chatbot request...');
    console.log('Message:', message.substring(0, 100));
    console.log('History length:', history?.length || 0);
    console.log('Lead source:', proposalContext?.lead_source);

    // Note: supabase client already initialized above for loadChatbotLimits

    // ═══════════════════════════════════════════════════════════════
    // FAST PATH: Economy Simulation Detection
    // ═══════════════════════════════════════════════════════════════
    if (isSimulationRequest(message)) {
      console.log('[FAST_PATH] Detected simulation request in proposal chatbot');
      
      // Build context from proposal + message
      const simulationInputs = extractSimulationInputs(message, {
        valorFatura: proposalContext.valor_conta,
        consumoMedio: proposalContext.consumo_medio,
        distribuidora: proposalContext.concessionaria,
      });
      
      // Try to run simulation
      const simulationResult = await simularEconomia(supabase, simulationInputs);
      
      if (simulationResult) {
        console.log('[FAST_PATH] Simulation successful:', {
          consumo: simulationResult.consumoEstimado,
          economia: simulationResult.economiaMensal,
          desconto: simulationResult.descontoPercentual,
        });
        
        // Update conversation if conversa_id exists
        if (proposalContext.conversa_id) {
          await supabase
            .from('chatbot_conversas')
            .update({
              event_simulation: true,
              has_simulation: true,
              last_message_at: new Date().toISOString(),
            })
            .eq('id', proposalContext.conversa_id);
        }
        
        return new Response(
          JSON.stringify({
            message: simulationResult.message,
            needsHumanFallback: false,
            model: 'fast-path-simulator',
            leadScore: 0,
            sofiaMode: 'standard',
            simulationResult: {
              consumoEstimado: simulationResult.consumoEstimado,
              economiaMensal: simulationResult.economiaMensal,
              economiaAnual: simulationResult.economiaAnual,
              economiaAcumulada: simulationResult.economiaAcumulada,
              descontoPercentual: simulationResult.descontoPercentual,
              fidelidadeAnos: simulationResult.fidelidadeAnos,
            },
            events: {
              simulation: true,
              conversion: false,
              objectionDetected: false,
            },
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else {
        console.log('[FAST_PATH] Simulation failed - no valid inputs, falling through to LLM');
      }
    }
    // ═══════════════════════════════════════════════════════════════

    // Get current conversation state if conversa_id is provided
    let currentScore = 0;
    let currentMode: 'standard' | 'closer_premium' = 'standard';
    let currentObjection: ObjectionType = null;
    let abVariant: 'A' | 'B' = 'A';
    
    if (proposalContext.conversa_id) {
      const { data: conversa } = await supabase
        .from('chatbot_conversas')
        .select('lead_score, sofia_mode, detected_objection, ab_variant')
        .eq('id', proposalContext.conversa_id)
        .single();
      
      if (conversa) {
        currentScore = conversa.lead_score || 0;
        currentMode = (conversa.sofia_mode as 'standard' | 'closer_premium') || 'standard';
        currentObjection = (conversa.detected_objection as ObjectionType) || null;
        abVariant = (conversa.ab_variant as 'A' | 'B') || getABVariant(proposalContext.conversa_id);
      }
    } else {
      abVariant = getABVariant(proposalContext.conversa_id || crypto.randomUUID());
    }

    // Detect objection from current message
    const detectedObjection = detectObjection(message) || currentObjection;

    // Detect funnel events
    const funnelEvents = detectFunnelEvents(message);

    // Calculate score from current message
    const scoreBreakdown = calculateMessageScore(message, currentScore);
    
    // Add source-based score
    if (proposalContext.lead_source === 'remarketing') {
      scoreBreakdown.leadRemarketing = 20;
    } else if (proposalContext.lead_source === 'specialist_button') {
      scoreBreakdown.leadRemarketing = 25;
    }

    // Calculate total new score
    const messageScore = Object.values(scoreBreakdown).reduce((sum, val) => sum + val, 0);
    const newScore = Math.min(currentScore + messageScore, 100); // Cap at 100

    // Check for explicit high intent
    const hasExplicitIntent = hasHighIntent(message);

    // Determine sofia mode (respecting the rule that it never goes back to standard)
    const finalMode = determineSofiaMode(
      currentMode,
      newScore,
      hasExplicitIntent,
      proposalContext.lead_source,
      proposalContext.has_simulation
    );

    // Calculate next follow-up time
    const nextFollowupAt = calculateNextFollowup(newScore);

    console.log('Lead Scoring:', {
      currentScore,
      messageScore,
      newScore,
      scoreBreakdown,
      hasExplicitIntent,
      currentMode,
      finalMode,
      detectedObjection,
      abVariant,
      nextFollowupAt: nextFollowupAt?.toISOString(),
    });

    // Load AI Gym config for this agent
    const agentId = proposalContext.agent_id || 'sofia';
    const agentConfig = await loadAgentConfig(supabase, agentId);
    
    // ═══════════════════════════════════════════════════════════════
    // LOAD MODULAR PROMPTS FROM DATABASE (Dynamic Prompt System)
    // ═══════════════════════════════════════════════════════════════
    let modularPromptSection = '';
    try {
      const promptModules = await loadAgentPromptModules(supabase, agentId);
      
      if (promptModules.length > 0) {
        const globalVariables = {
          clienteNome: proposalContext.cliente_nome || '',
          descontoPercentual: proposalContext.desconto_percentual || 20,
          economiaAnual: proposalContext.economia_anual || 0,
          fidelidade: proposalContext.fidelidade_anos || 2,
          consumoMedio: proposalContext.consumo_medio || 0,
          agentName: agentConfig.name || 'sofIA',
        };
        
        modularPromptSection = buildModularPrompt(promptModules, globalVariables);
        console.log(`[proposal-chatbot] 🧩 Loaded ${promptModules.length} modular prompts for agent: ${agentId}`);
      }
    } catch (modularError) {
      console.warn('[proposal-chatbot] Failed to load modular prompts:', modularError);
    }
    
    // Determine system prompt based on agent config
    // If agent has a custom system_prompt in persona, use AI Gym as PRIMARY (not sofIA fallback)
    // Otherwise, fallback to sofIA sales prompt
    let systemPrompt: string;
    
    if (agentConfig.persona?.system_prompt) {
      // Agent has custom persona - use AI Gym config as the MAIN prompt
      console.log(`[AI_GYM] Using custom persona for agent: ${agentId}`);
      systemPrompt = buildAIGymPrompt(agentConfig);
    } else {
      // No custom persona - use sofIA sales prompt as base with AI Gym additions
      console.log(`[AI_GYM] No custom persona, using sofIA fallback for: ${agentId}`);
      const baseSystemPrompt = buildSystemPrompt(proposalContext, finalMode, abVariant, detectedObjection);
      const aiGymPrompt = buildAIGymPrompt(agentConfig);
      systemPrompt = baseSystemPrompt + aiGymPrompt;
    }
    
    // Inject modular prompts if available
    if (modularPromptSection && modularPromptSection.trim().length > 0) {
      systemPrompt += `

═══════════════════════════════════════════════════════════════
🧩 MÓDULOS DINÂMICOS (AI GYM - Database)
═══════════════════════════════════════════════════════════════

${modularPromptSection}
`;
    }
    
    console.log(`[AI_GYM] Loaded config for ${agentId} (status: ${agentConfig.status})`);

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.map(msg => ({ role: msg.role, content: msg.content })),
      { role: 'user', content: message }
    ];

    let assistantMessage: string | null = null;
    let usedModel: string | null = null;
    let lastError: Error | null = null;

    // Try each model in order until one succeeds
    for (const model of MODELS) {
      try {
        const result = await callAIWithModel(model, messages);
        assistantMessage = result.text;
        usedModel = result.model;
        console.log(`Successfully got response from ${model}`);
        break;
      } catch (error) {
        console.error(`Model ${model} failed:`, error);
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    if (!assistantMessage) {
      console.error('All models failed. Last error:', lastError?.message);
      return new Response(
        JSON.stringify({ 
          error: 'Todos os modelos de IA falharam',
          message: 'Desculpe, estou com dificuldades técnicas no momento. Por favor, fale diretamente com nosso time no WhatsApp!',
          needsHumanFallback: true,
          leadScore: newScore,
          sofiaMode: finalMode,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update conversation with new score, mode, objection, and events if conversa_id is provided
    if (proposalContext.conversa_id) {
      const updateData: Record<string, unknown> = {
        lead_score: newScore,
        sofia_mode: finalMode,
        last_message_at: new Date().toISOString(),
        has_simulation: proposalContext.has_simulation || funnelEvents.simulation || false,
        ab_variant: abVariant,
      };

      // Update objection if detected
      if (detectedObjection) {
        updateData.detected_objection = detectedObjection;
        updateData.event_objection_detected = true;
      }

      // Update funnel events
      if (funnelEvents.simulation) {
        updateData.event_simulation = true;
      }
      if (funnelEvents.conversion) {
        updateData.event_conversion = true;
      }

      // Update next follow-up time
      if (nextFollowupAt) {
        updateData.next_followup_at = nextFollowupAt.toISOString();
      }

      await supabase
        .from('chatbot_conversas')
        .update(updateData)
        .eq('id', proposalContext.conversa_id);
    }

    console.log(`Response from ${usedModel}:`, assistantMessage.substring(0, 150) + '...');

    // Check if the response indicates the bot doesn't know the answer
    const needsHumanFallback = assistantMessage.toLowerCase().includes('especialista') ||
      assistantMessage.toLowerCase().includes('atendente') ||
      assistantMessage.toLowerCase().includes('não consigo') ||
      assistantMessage.toLowerCase().includes('não sei');

    return new Response(
      JSON.stringify({ 
        message: assistantMessage,
        needsHumanFallback,
        model: usedModel,
        leadScore: newScore,
        sofiaMode: finalMode,
        scoreBreakdown,
        detectedObjection,
        abVariant,
        nextFollowupAt: nextFollowupAt?.toISOString(),
        events: {
          simulation: funnelEvents.simulation,
          conversion: funnelEvents.conversion,
          objectionDetected: !!detectedObjection,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in proposal-chatbot:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Erro ao processar mensagem',
        message: 'Desculpe, estou com dificuldades técnicas. Por favor, fale diretamente com nosso time no WhatsApp!',
        needsHumanFallback: true
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
