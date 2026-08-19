/**
 * CONTINUOUS IMPROVEMENT INTEGRATION FOR LEGACY WEBHOOK
 * 
 * Adapta os sistemas do Pipeline v2 para funcionar com o sofia-webhook legado:
 * - Behavioral Profile Detection & Adaptation
 * - Operator Feedback Loop (correções e takeovers)
 * - Self-Evaluation (avaliação de qualidade)
 * 
 * Este módulo serve como bridge durante a transição para o Pipeline v2.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const LLM_ENDPOINT = "https://ai.gateway.lovable.dev/v1/chat/completions";

// ============================================
// TYPES
// ============================================

export interface LegacyBehavioralProfile {
  technical: number;
  objective: number;
  skeptical: number;
  confused: number;
  elderly: number;
  dominant: 'technical' | 'objective' | 'skeptical' | 'confused' | 'elderly' | 'balanced';
  confidence: number;
  preferredTone: 'formal' | 'informal' | 'technical' | 'simple';
}

export interface ProfilePromptBlock {
  enabled: boolean;
  block: string;
}

export interface SelfEvalSummary {
  score: number;
  requiresReview: boolean;
  issues: string[];
}

export interface ContinuousImprovementConfig {
  behavioralProfileEnabled: boolean;
  operatorFeedbackEnabled: boolean;
  selfEvalEnabled: boolean;
  selfEvalThreshold: number;
}

// ============================================
// CONFIG LOADING
// ============================================

let configCache: { data: ContinuousImprovementConfig | null; timestamp: number } = { data: null, timestamp: 0 };
const CONFIG_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function loadContinuousImprovementConfig(): Promise<ContinuousImprovementConfig> {
  const now = Date.now();
  
  if (configCache.data && (now - configCache.timestamp) < CONFIG_CACHE_TTL_MS) {
    return configCache.data;
  }
  
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  const { data } = await supabase
    .from('configuracoes_sistema')
    .select('chave, valor')
    .in('chave', [
      'behavioral_profile_enabled',
      'operator_feedback_enabled',
      'self_eval_enabled',
      'self_eval_threshold'
    ]);
  
  const configMap = new Map(data?.map(r => [r.chave, r.valor]) || []);
  
  const config: ContinuousImprovementConfig = {
    behavioralProfileEnabled: configMap.get('behavioral_profile_enabled') === 'true',
    operatorFeedbackEnabled: configMap.get('operator_feedback_enabled') === 'true',
    selfEvalEnabled: configMap.get('self_eval_enabled') === 'true',
    selfEvalThreshold: parseFloat(configMap.get('self_eval_threshold') || '0.6')
  };
  
  configCache = { data: config, timestamp: now };
  console.log('[continuous-improvement] Config loaded:', config);
  
  return config;
}

// ============================================
// BEHAVIORAL PROFILE - LEGACY ADAPTER
// ============================================

// Pattern arrays for profile detection
const TECHNICAL_PATTERNS = [/\bkwh\b/i, /\bscee\b/i, /\bgd[12]?\b/i, /\btusd\b/i, /\bte\b/i, /\bicms\b/i, /\bpis\b/i, /\bcofins\b/i, /\btarifa\b/i, /\baneel\b/i];
const OBJECTIVE_PATTERNS = [/^sim$/i, /^n[aã]o$/i, /^ok$/i, /^blz$/i, /^pode$/i, /^t[aá]$/i, /quanto\s*(?:fica|custa)/i, /qual\s*o\s*(?:valor|pre[cç]o)/i];
const SKEPTICAL_PATTERNS = [/golpe/i, /fraude/i, /piramide/i, /garantia/i, /contrato/i, /multa/i, /como\s+sei\s+que/i, /quem\s+garante/i];
const CONFUSED_PATTERNS = [/n[aã]o\s+entendi/i, /como\s+assim/i, /pode\s+explicar/i, /de\s+novo/i, /repete/i, /confuso/i, /\?\s*\?/];
const ELDERLY_PATTERNS = [/aposentad/i, /idoso/i, /n[aã]o\s+(?:sei|consigo)\s+(?:usar|mexer)/i, /pode\s+(?:me\s+)?ligar/i, /prefer.*(?:telefone|ligar)/i];

function analyzeMessageForProfile(message: string): LegacyBehavioralProfile {
  const scores = { technical: 0, objective: 0, skeptical: 0, confused: 0, elderly: 0 };
  const normalizedMsg = message.toLowerCase();
  
  for (const p of TECHNICAL_PATTERNS) if (p.test(normalizedMsg)) scores.technical += 0.15;
  for (const p of OBJECTIVE_PATTERNS) if (p.test(normalizedMsg)) scores.objective += 0.2;
  for (const p of SKEPTICAL_PATTERNS) if (p.test(normalizedMsg)) scores.skeptical += 0.15;
  for (const p of CONFUSED_PATTERNS) if (p.test(normalizedMsg)) scores.confused += 0.2;
  for (const p of ELDERLY_PATTERNS) if (p.test(normalizedMsg)) scores.elderly += 0.25;
  
  // Mensagens curtas indicam perfil objetivo
  if (message.length < 30) scores.objective += 0.1;
  
  // Normalizar para máximo de 1
  Object.keys(scores).forEach(k => {
    scores[k as keyof typeof scores] = Math.min(1, scores[k as keyof typeof scores]);
  });
  
  // Determinar dominante
  const entries = Object.entries(scores) as Array<[keyof typeof scores, number]>;
  const sorted = entries.sort((a, b) => b[1] - a[1]);
  const dominant = sorted[0][1] < 0.3 ? 'balanced' : sorted[0][0];
  const confidence = sorted[0][1] < 0.3 ? 0.3 : Math.min(1, sorted[0][1] * 1.5);
  
  // Tom preferido
  let preferredTone: LegacyBehavioralProfile['preferredTone'] = 'informal';
  if (dominant === 'technical') preferredTone = 'technical';
  else if (dominant === 'elderly' || dominant === 'confused') preferredTone = 'simple';
  else if (dominant === 'skeptical') preferredTone = 'formal';
  
  return {
    ...scores,
    dominant,
    confidence,
    preferredTone
  };
}

/**
 * Detecta perfil comportamental a partir do histórico de mensagens
 * Versão adaptada para o webhook legado
 */
export function detectBehavioralProfileLegacy(
  messages: Array<{ role: string; content: string }>
): LegacyBehavioralProfile {
  const userMessages = messages.filter(m => m.role === 'user');
  
  if (userMessages.length === 0) {
    return {
      technical: 0, objective: 0, skeptical: 0, confused: 0, elderly: 0,
      dominant: 'balanced', confidence: 0, preferredTone: 'informal'
    };
  }
  
  // Analisar todas as mensagens com peso maior para mais recentes
  const profiles = userMessages.map(m => analyzeMessageForProfile(m.content));
  
  // Média ponderada
  const weights = profiles.map((_, i) => 1 + (i * 0.2));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  
  const consolidated: LegacyBehavioralProfile = {
    technical: 0, objective: 0, skeptical: 0, confused: 0, elderly: 0,
    dominant: 'balanced', confidence: 0, preferredTone: 'informal'
  };
  
  for (let i = 0; i < profiles.length; i++) {
    const w = weights[i] / totalWeight;
    consolidated.technical += profiles[i].technical * w;
    consolidated.objective += profiles[i].objective * w;
    consolidated.skeptical += profiles[i].skeptical * w;
    consolidated.confused += profiles[i].confused * w;
    consolidated.elderly += profiles[i].elderly * w;
  }
  
  // Recalcular dominante
  const entries = Object.entries({
    technical: consolidated.technical,
    objective: consolidated.objective,
    skeptical: consolidated.skeptical,
    confused: consolidated.confused,
    elderly: consolidated.elderly
  }) as Array<[keyof typeof consolidated, number]>;
  const sorted = entries.sort((a, b) => b[1] - a[1]);
  
  consolidated.dominant = sorted[0][1] < 0.3 ? 'balanced' : sorted[0][0] as typeof consolidated.dominant;
  consolidated.confidence = Math.min(1, profiles.length / 10); // Mais mensagens = mais confiança
  
  // Tom preferido
  if (consolidated.dominant === 'technical') consolidated.preferredTone = 'technical';
  else if (consolidated.dominant === 'elderly' || consolidated.dominant === 'confused') consolidated.preferredTone = 'simple';
  else if (consolidated.dominant === 'skeptical') consolidated.preferredTone = 'formal';
  
  return consolidated;
}

/**
 * Gera bloco de prompt com instruções de adaptação de perfil
 */
export function buildProfilePromptBlockLegacy(profile: LegacyBehavioralProfile): ProfilePromptBlock {
  if (profile.confidence < 0.3 || profile.dominant === 'balanced') {
    return { enabled: false, block: '' };
  }
  
  let block = `
═══════════════════════════════════════════════════
📊 PERFIL COMPORTAMENTAL DO CLIENTE (Confiança: ${(profile.confidence * 100).toFixed(0)}%)
═══════════════════════════════════════════════════
`;
  
  switch (profile.dominant) {
    case 'technical':
      block += `Este cliente tem perfil TÉCNICO.
ADAPTE seu tom: Use termos técnicos quando relevante, cite regulamentações ANEEL, 
mostre cálculos e fórmulas quando perguntado. O cliente valoriza precisão e detalhes.
- Pode usar termos como SCEE, GD, TUSD, TE, kWh
- Explique fórmulas de cálculo quando relevante
- Cite resoluções da ANEEL quando aplicável`;
      break;
    case 'objective':
      block += `Este cliente tem perfil OBJETIVO.
ADAPTE seu tom: Seja direto e conciso. Evite rodeios e explicações longas.
O cliente quer respostas curtas e acionáveis.
- Respostas curtas (máximo 2-3 linhas)
- Vá direto ao ponto
- Use bullet points quando listar`;
      break;
    case 'skeptical':
      block += `Este cliente tem perfil DESCONFIADO.
ADAPTE seu tom: Seja transparente e proativo em fornecer garantias.
Cite validações, regulamentações e ofereça provas de legitimidade.
- Cite que a COESA é regulamentada pela ANEEL
- Mencione que não há fidelidade nem multa
- Ofereça enviar contrato para análise`;
      break;
    case 'confused':
      block += `Este cliente tem perfil CONFUSO.
ADAPTE seu tom: Use linguagem ultra-simples e didática.
Divida explicações em passos pequenos. Confirme entendimento frequentemente.
- Use frases curtas e simples
- Evite jargões técnicos
- Pergunte "Ficou claro?" após explicações`;
      break;
    case 'elderly':
      block += `Este cliente parece ter perfil IDOSO ou menos familiarizado com tecnologia.
ADAPTE seu tom: Seja paciente, respeitoso e extremamente claro.
Evite emojis excessivos. Ofereça alternativas como ligação se necessário.
- Tom respeitoso e paciente
- Frases curtas e claras
- Evite gírias e abreviações`;
      break;
  }
  
  block += '\n═══════════════════════════════════════════════════\n';
  
  return { enabled: true, block };
}

/**
 * Persiste o perfil comportamental no banco de dados
 */
export async function persistBehavioralProfileLegacy(
  phone: string,
  profile: LegacyBehavioralProfile,
  conversaId: string
): Promise<void> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  try {
    await supabase
      .from('client_behavioral_profiles')
      .upsert({
        phone,
        technical_score: profile.technical,
        objective_score: profile.objective,
        skeptical_score: profile.skeptical,
        confused_score: profile.confused,
        elderly_score: profile.elderly,
        dominant_profile: profile.dominant,
        profile_confidence: profile.confidence,
        preferred_tone: profile.preferredTone,
        last_updated_at: new Date().toISOString(),
        last_conversa_id: conversaId
      }, { onConflict: 'phone' });
    
    console.log(`[continuous-improvement] Profile persisted for ${phone}: ${profile.dominant}`);
  } catch (error) {
    console.warn('[continuous-improvement] Failed to persist profile:', error);
  }
}

/**
 * Carrega perfil persistido do banco
 */
export async function loadPersistedProfileLegacy(phone: string): Promise<LegacyBehavioralProfile | null> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  const { data, error } = await supabase
    .from('client_behavioral_profiles')
    .select('*')
    .eq('phone', phone)
    .single();
  
  if (error || !data) return null;
  
  return {
    technical: data.technical_score || 0,
    objective: data.objective_score || 0,
    skeptical: data.skeptical_score || 0,
    confused: data.confused_score || 0,
    elderly: data.elderly_score || 0,
    dominant: data.dominant_profile || 'balanced',
    confidence: data.profile_confidence || 0,
    preferredTone: data.preferred_tone || 'informal'
  };
}

// ============================================
// OPERATOR FEEDBACK - LEGACY ADAPTER
// ============================================

/**
 * Captura feedback de takeover (#ASSUMIR)
 */
export async function captureTakeoverFeedbackLegacy(
  conversaId: string,
  agentId: string,
  operatorPhone: string,
  operatorName: string,
  operatorId: string,
  clientPhone: string,
  clientName: string | null,
  lastSofiaMessage: string | null,
  lastClientMessage: string | null
): Promise<{ feedbackId: string; success: boolean }> {
  const config = await loadContinuousImprovementConfig();
  
  if (!config.operatorFeedbackEnabled) {
    return { feedbackId: '', success: false };
  }
  
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  try {
    const { data, error } = await supabase
      .from('operator_feedback')
      .insert({
        conversa_id: conversaId,
        agent_id: agentId,
        operator_phone: operatorPhone,
        operator_name: operatorName,
        operator_id: operatorId,
        feedback_type: 'takeover',
        trigger_message: lastClientMessage,
        sofia_response: lastSofiaMessage,
        correction_reason: 'Operador assumiu a conversa manualmente',
        client_phone: clientPhone,
        client_name: clientName,
        rule_extraction_status: 'pending'
      })
      .select('id')
      .single();
    
    if (error) throw error;
    
    console.log(`[continuous-improvement] Takeover feedback captured: ${data?.id}`);
    return { feedbackId: data?.id || '', success: true };
  } catch (error) {
    console.error('[continuous-improvement] Takeover feedback error:', error);
    return { feedbackId: '', success: false };
  }
}

/**
 * Processa comando #CORRIGIR
 */
export function parseCorrectionCommandLegacy(messageText: string): { isCorrection: boolean; correctResponse?: string } {
  const normalized = messageText.trim().toUpperCase();
  
  if (!normalized.startsWith('#CORRIGIR')) {
    return { isCorrection: false };
  }
  
  const match = messageText.match(/#CORRIGIR\s+(?:A resposta correta era:|Correto:)?\s*(.+)/is);
  
  return {
    isCorrection: true,
    correctResponse: match?.[1]?.trim()
  };
}

/**
 * Captura correção explícita de operador
 */
export async function handleCorrectionCommandLegacy(
  conversaId: string,
  agentId: string,
  operatorPhone: string,
  operatorName: string,
  correctResponse: string,
  lastSofiaMessage: string | null,
  lastClientMessage: string | null,
  clientPhone: string,
  clientName: string | null
): Promise<{ feedbackId: string; ruleExtracted: boolean }> {
  const config = await loadContinuousImprovementConfig();
  
  if (!config.operatorFeedbackEnabled) {
    return { feedbackId: '', ruleExtracted: false };
  }
  
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  try {
    const { data, error } = await supabase
      .from('operator_feedback')
      .insert({
        conversa_id: conversaId,
        agent_id: agentId,
        operator_phone: operatorPhone,
        operator_name: operatorName,
        feedback_type: 'explicit_correction',
        trigger_message: lastClientMessage,
        sofia_response: lastSofiaMessage,
        correct_response: correctResponse,
        client_phone: clientPhone,
        client_name: clientName,
        rule_extraction_status: 'pending'
      })
      .select('id')
      .single();
    
    if (error) throw error;
    
    console.log(`[continuous-improvement] Correction captured: ${data?.id}`);
    
    // Trigger async rule extraction
    if (data?.id) {
      extractRuleFromFeedbackAsync(data.id, {
        conversaId,
        agentId,
        triggerMessage: lastClientMessage,
        sofiaResponse: lastSofiaMessage,
        correctResponse
      }).catch(err => console.error('[continuous-improvement] Rule extraction failed:', err));
    }
    
    return { feedbackId: data?.id || '', ruleExtracted: false };
  } catch (error) {
    console.error('[continuous-improvement] Correction command error:', error);
    return { feedbackId: '', ruleExtracted: false };
  }
}

async function extractRuleFromFeedbackAsync(
  feedbackId: string,
  context: {
    conversaId: string;
    agentId: string;
    triggerMessage: string | null;
    sofiaResponse: string | null;
    correctResponse: string | null;
  }
): Promise<void> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  try {
    await supabase.from('operator_feedback').update({ rule_extraction_status: 'processing' }).eq('id', feedbackId);
    
    const prompt = `Analise esta correção de operador e extraia uma regra generalizável:

## MENSAGEM DO CLIENTE
${context.triggerMessage || '[Não disponível]'}

## RESPOSTA DA SOFIA (que foi corrigida)
${context.sofiaResponse || '[Não disponível]'}

## RESPOSTA CORRETA (fornecida pelo operador)
${context.correctResponse || '[Não disponível]'}

Extraia uma regra que previna este erro no futuro. Se a correção for muito específica, retorne confidence = 0.`;

    const response = await fetch(LLM_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: "Você é um especialista em criar regras de negócio para assistentes virtuais. Extraia regras generalizáveis das correções de operadores." },
          { role: "user", content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 800
      })
    });
    
    if (!response.ok) throw new Error(`LLM error: ${response.status}`);
    
    const result = await response.json();
    const ruleText = result.choices?.[0]?.message?.content;
    
    if (!ruleText || ruleText.toLowerCase().includes('confidence = 0') || ruleText.toLowerCase().includes('não generalizável')) {
      await supabase.from('operator_feedback').update({ 
        rule_extraction_status: 'skipped',
        processed_at: new Date().toISOString()
      }).eq('id', feedbackId);
      return;
    }
    
    // Salvar regra em rule_memory
    const { data: rule } = await supabase.from('rule_memory').insert({
      agent_id: context.agentId,
      rule_type: 'learned_pattern',
      name: `Correção de ${new Date().toISOString().split('T')[0]}`,
      description: ruleText.substring(0, 500),
      conditions: [],
      actions: [{ type: 'modify_response', parameters: { learned_rule: ruleText } }],
      priority: 50,
      is_active: true,
      confidence: 0.7,
      learning_source: 'operator_correction'
    }).select('id').single();
    
    await supabase.from('operator_feedback').update({ 
      rule_extraction_status: 'extracted',
      learned_rule_id: rule?.id,
      extracted_rule_text: ruleText,
      processed_at: new Date().toISOString()
    }).eq('id', feedbackId);
    
    console.log(`[continuous-improvement] Rule extracted for feedback ${feedbackId}`);
    
  } catch (error) {
    console.error('[continuous-improvement] Rule extraction error:', error);
    await supabase.from('operator_feedback').update({ 
      rule_extraction_status: 'failed',
      processed_at: new Date().toISOString()
    }).eq('id', feedbackId);
  }
}

// ============================================
// SELF-EVALUATION - LEGACY ADAPTER
// ============================================

/**
 * Avalia a qualidade de uma resposta da Sofia (assíncrono, não bloqueia)
 */
export async function evaluateResponseLegacy(
  conversaId: string,
  agentId: string,
  clientMessage: string,
  sofiaResponse: string,
  funnelStage: string,
  clientSentiment: string | null
): Promise<SelfEvalSummary | null> {
  const config = await loadContinuousImprovementConfig();
  
  if (!config.selfEvalEnabled) {
    return null;
  }
  
  // Executar avaliação de forma assíncrona para não bloquear
  runSelfEvaluationAsync(
    conversaId,
    agentId,
    clientMessage,
    sofiaResponse,
    funnelStage,
    clientSentiment,
    config.selfEvalThreshold
  ).catch(err => console.error('[continuous-improvement] Self-eval error:', err));
  
  return null; // Retorna imediatamente, avaliação é async
}

async function runSelfEvaluationAsync(
  conversaId: string,
  agentId: string,
  clientMessage: string,
  sofiaResponse: string,
  funnelStage: string,
  clientSentiment: string | null,
  threshold: number
): Promise<void> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const startTime = Date.now();
  
  try {
    const prompt = `Avalie a qualidade desta resposta de atendimento:

## MENSAGEM DO CLIENTE
${clientMessage}

## RESPOSTA DA SOFIA
${sofiaResponse}

## CONTEXTO
- Estágio do funil: ${funnelStage}
- Sentimento do cliente: ${clientSentiment || 'Não detectado'}

Avalie de 0 a 1:
1. CLAREZA: A resposta é fácil de entender?
2. PRECISÃO: As informações estão corretas?
3. TOM: O tom é adequado?
4. PROGRESSÃO: Avança o cliente no funil?

Responda no formato JSON: {"clarity": 0.X, "accuracy": 0.X, "tone": 0.X, "progression": 0.X, "issues": ["issue1"], "reasoning": "..."}`;

    const response = await fetch(LLM_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: "Você é um avaliador de qualidade de atendimento. Responda apenas com JSON válido." },
          { role: "user", content: prompt }
        ],
        temperature: 0.2,
        max_tokens: 500
      })
    });
    
    if (!response.ok) throw new Error(`LLM error: ${response.status}`);
    
    const result = await response.json();
    const evalText = result.choices?.[0]?.message?.content;
    
    // Parse JSON da resposta
    let evalData: {
      clarity: number;
      accuracy: number;
      tone: number;
      progression: number;
      issues: string[];
      reasoning: string;
    };
    
    try {
      const jsonMatch = evalText.match(/\{[\s\S]*\}/);
      evalData = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      console.warn('[continuous-improvement] Failed to parse eval JSON');
      return;
    }
    
    if (!evalData) return;
    
    // Calcular score geral
    const overall = (
      evalData.clarity * 0.25 +
      evalData.accuracy * 0.30 +
      evalData.tone * 0.20 +
      evalData.progression * 0.25
    );
    
    const requiresReview = overall < threshold;
    
    // Persistir avaliação
    await supabase.from('response_evaluations').insert({
      conversa_id: conversaId,
      agent_id: agentId,
      clarity_score: evalData.clarity,
      accuracy_score: evalData.accuracy,
      tone_score: evalData.tone,
      progression_score: evalData.progression,
      overall_score: overall,
      issues_detected: evalData.issues?.map(i => ({ type: 'other', severity: 'medium', description: i })) || [],
      evaluation_reasoning: evalData.reasoning,
      requires_review: requiresReview,
      client_message: clientMessage,
      sofia_response: sofiaResponse,
      funnel_stage: funnelStage,
      client_sentiment: clientSentiment,
      model_used: 'google/gemini-2.5-flash-lite',
      evaluation_duration_ms: Date.now() - startTime
    });
    
    console.log(`[continuous-improvement] Self-eval complete: overall=${overall.toFixed(2)}, requiresReview=${requiresReview}`);
    
  } catch (error) {
    console.error('[continuous-improvement] Self-evaluation error:', error);
  }
}

// ============================================
// UNIFIED ORCHESTRATION
// ============================================

/**
 * Orquestra todos os sistemas de melhoria contínua após uma resposta da Sofia
 * Chamado no final do processamento do webhook
 */
export async function orchestrateContinuousImprovement(params: {
  conversaId: string;
  agentId: string;
  phone: string;
  clientName: string | null;
  clientMessage: string;
  sofiaResponse: string;
  funnelStage: string;
  clientSentiment: string | null;
  history: Array<{ role: string; content: string }>;
}): Promise<{
  profileBlock: ProfilePromptBlock;
  profilePersisted: boolean;
  evalTriggered: boolean;
}> {
  const config = await loadContinuousImprovementConfig();
  
  let profileBlock: ProfilePromptBlock = { enabled: false, block: '' };
  let profilePersisted = false;
  let evalTriggered = false;
  
  // 1. Behavioral Profile
  if (config.behavioralProfileEnabled && params.history.length > 0) {
    const profile = detectBehavioralProfileLegacy(params.history);
    profileBlock = buildProfilePromptBlockLegacy(profile);
    
    if (profile.confidence >= 0.3) {
      persistBehavioralProfileLegacy(params.phone, profile, params.conversaId).catch(() => {});
      profilePersisted = true;
    }
  }
  
  // 2. Self-Evaluation (async)
  if (config.selfEvalEnabled) {
    evaluateResponseLegacy(
      params.conversaId,
      params.agentId,
      params.clientMessage,
      params.sofiaResponse,
      params.funnelStage,
      params.clientSentiment
    ).catch(() => {});
    evalTriggered = true;
  }
  
  return { profileBlock, profilePersisted, evalTriggered };
}
