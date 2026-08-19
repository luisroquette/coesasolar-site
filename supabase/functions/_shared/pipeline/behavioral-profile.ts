/**
 * SOFIA PIPELINE 2.0 - BEHAVIORAL PROFILE
 * 
 * Sistema de detecção e adaptação de perfil comportamental do cliente
 * - Detecta: técnico, objetivo, desconfiado, confuso, idoso
 * - Adapta tom e estilo de resposta automaticamente
 * - Persiste perfil cross-sessão
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { FullContext, IntentPayload } from "./types.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ============================================
// TYPES
// ============================================

export interface BehavioralProfile {
  technical: number;    // 0-1: Quão técnico
  objective: number;    // 0-1: Quão direto ao ponto
  skeptical: number;    // 0-1: Quão desconfiado
  confused: number;     // 0-1: Quão confuso
  elderly: number;      // 0-1: Probabilidade de idoso
}

export interface FullBehavioralProfile extends BehavioralProfile {
  dominantProfile: 'technical' | 'objective' | 'skeptical' | 'confused' | 'elderly' | 'balanced';
  profileConfidence: number;
  preferredTone?: 'formal' | 'informal' | 'technical' | 'simple';
  avgMessageLength?: number;
  totalMessagesAnalyzed: number;
}

export interface ProfileAdaptation {
  toneInstructions: string;
  styleInstructions: string;
  avoidPatterns: string[];
  preferPatterns: string[];
}

// ============================================
// PATTERN DETECTION
// ============================================

// Padrões para detecção de perfil TÉCNICO
const TECHNICAL_PATTERNS = [
  /\bkwh\b/i,
  /\bscee\b/i,
  /\bgd[12]?\b/i,
  /\btusd\b/i,
  /\bte\b/i,
  /\bicms\b/i,
  /\bpis\b/i,
  /\bcofins\b/i,
  /\btarifa\b/i,
  /\bdemanda\b/i,
  /\bpotência\b/i,
  /\bgeração\b/i,
  /\binjeção\b/i,
  /\bcrédito.*energia/i,
  /\bcompensação/i,
  /\bmicroger/i,
  /\bminiger/i,
  /\baneel\b/i,
  /\bresoluç[aã]o\s*\d+/i,
  /\bmodal/i,
  /como\s+funciona\s+o\s+c[aá]lculo/i,
  /explica.*t[eé]cnic/i,
];

// Padrões para detecção de perfil OBJETIVO
const OBJECTIVE_PATTERNS = [
  /^sim$/i,
  /^n[aã]o$/i,
  /^ok$/i,
  /^blz$/i,
  /^pode$/i,
  /^t[aá]$/i,
  /^fechou$/i,
  /^beleza$/i,
  /^certo$/i,
  /^entendi$/i,
  /^manda$/i,
  /^vai$/i,
  /^bora$/i,
  /quanto\s*(?:fica|custa|[eé]|sai)/i,
  /qual\s*o\s*(?:valor|pre[cç]o|desconto)/i,
];

// Padrões para detecção de perfil DESCONFIADO
const SKEPTICAL_PATTERNS = [
  /golpe/i,
  /fraude/i,
  /piramide/i,
  /enganação/i,
  /mentira/i,
  /fake/i,
  /verdade/i,
  /comprova/i,
  /garantia/i,
  /contrato/i,
  /multa/i,
  /fidel/i,
  /prend/i,
  /como\s+sei\s+que/i,
  /quem\s+garante/i,
  /muito\s+bom\s+pra\s+ser/i,
  /qual\s+[eé]\s+a\s+pegadinha/i,
  /cadê\s+o\s+(?:cnpj|endere[cç]o)/i,
  /empresa\s+(?:[eé]\s+)?s[eé]ria/i,
  /desconfi/i,
  /suspeito/i,
];

// Padrões para detecção de perfil CONFUSO
const CONFUSED_PATTERNS = [
  /n[aã]o\s+entendi/i,
  /como\s+assim/i,
  /o\s+que\s+[eé]\s+isso/i,
  /pode\s+explicar/i,
  /de\s+novo/i,
  /repete/i,
  /confuso/i,
  /perdido/i,
  /complicado/i,
  /dif[ií]cil/i,
  /\?\s*\?/,
  /hã\?/i,
  /oi\?/i,
  /como\?/i,
  /o\s+qu[eê]\?/i,
];

// Padrões para detecção de perfil IDOSO
const ELDERLY_PATTERNS = [
  /minha\s+idade/i,
  /\d{2,3}\s*anos/i,
  /aposentad/i,
  /idoso/i,
  /terceira\s+idade/i,
  /não\s+mexo\s+(?:muito\s+)?(?:com|no)\s+(?:celular|internet|computador)/i,
  /dificuldade\s+(?:com|no)\s+(?:celular|internet|computador)/i,
  /meu\s+(?:filho|neto|sobrinho)\s+(?:que\s+)?(?:mexe|ajuda)/i,
  /n[aã]o\s+(?:sei|consigo)\s+(?:usar|mexer)/i,
  /pode\s+(?:me\s+)?ligar/i,
  /prefer.*(?:telefone|ligar|falar)/i,
];

/**
 * Analisa uma mensagem e retorna scores de perfil
 */
function analyzeMessage(message: string): BehavioralProfile {
  const scores: BehavioralProfile = {
    technical: 0,
    objective: 0,
    skeptical: 0,
    confused: 0,
    elderly: 0
  };
  
  const normalizedMsg = message.toLowerCase();
  const msgLength = message.length;
  
  // Verificar padrões técnicos
  for (const pattern of TECHNICAL_PATTERNS) {
    if (pattern.test(normalizedMsg)) {
      scores.technical += 0.15;
    }
  }
  
  // Verificar padrões objetivos
  for (const pattern of OBJECTIVE_PATTERNS) {
    if (pattern.test(normalizedMsg)) {
      scores.objective += 0.2;
    }
  }
  
  // Mensagens muito curtas são indicativo de perfil objetivo
  if (msgLength < 30) {
    scores.objective += 0.1;
  }
  
  // Verificar padrões desconfiados
  for (const pattern of SKEPTICAL_PATTERNS) {
    if (pattern.test(normalizedMsg)) {
      scores.skeptical += 0.15;
    }
  }
  
  // Verificar padrões confusos
  for (const pattern of CONFUSED_PATTERNS) {
    if (pattern.test(normalizedMsg)) {
      scores.confused += 0.2;
    }
  }
  
  // Múltiplos pontos de interrogação indicam confusão
  const questionMarks = (message.match(/\?/g) || []).length;
  if (questionMarks > 2) {
    scores.confused += 0.15;
  }
  
  // Verificar padrões de idoso
  for (const pattern of ELDERLY_PATTERNS) {
    if (pattern.test(normalizedMsg)) {
      scores.elderly += 0.25;
    }
  }
  
  // Normalizar scores para máximo de 1
  return {
    technical: Math.min(1, scores.technical),
    objective: Math.min(1, scores.objective),
    skeptical: Math.min(1, scores.skeptical),
    confused: Math.min(1, scores.confused),
    elderly: Math.min(1, scores.elderly)
  };
}

/**
 * Combina múltiplas análises em um perfil consolidado
 */
function consolidateProfiles(profiles: BehavioralProfile[]): BehavioralProfile {
  if (profiles.length === 0) {
    return { technical: 0, objective: 0, skeptical: 0, confused: 0, elderly: 0 };
  }
  
  // Média ponderada com peso maior para mensagens recentes
  const weights: number[] = [];
  for (let i = 0; i < profiles.length; i++) {
    weights.push(1 + (i * 0.2)); // Mensagens mais recentes têm peso maior
  }
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  
  const consolidated: BehavioralProfile = {
    technical: 0,
    objective: 0,
    skeptical: 0,
    confused: 0,
    elderly: 0
  };
  
  for (let i = 0; i < profiles.length; i++) {
    const weight = weights[i] / totalWeight;
    consolidated.technical += profiles[i].technical * weight;
    consolidated.objective += profiles[i].objective * weight;
    consolidated.skeptical += profiles[i].skeptical * weight;
    consolidated.confused += profiles[i].confused * weight;
    consolidated.elderly += profiles[i].elderly * weight;
  }
  
  return consolidated;
}

/**
 * Determina o perfil dominante
 */
function getDominantProfile(profile: BehavioralProfile): FullBehavioralProfile['dominantProfile'] {
  const entries = Object.entries(profile) as Array<[keyof BehavioralProfile, number]>;
  const sorted = entries.sort((a, b) => b[1] - a[1]);
  
  // Se o score mais alto for menor que 0.3, é balanceado
  if (sorted[0][1] < 0.3) {
    return 'balanced';
  }
  
  // Se houver empate (diferença menor que 0.1), é balanceado
  if (sorted.length > 1 && sorted[0][1] - sorted[1][1] < 0.1) {
    return 'balanced';
  }
  
  return sorted[0][0] as FullBehavioralProfile['dominantProfile'];
}

/**
 * Calcula confiança do perfil baseado na quantidade de dados
 */
function calculateConfidence(messagesAnalyzed: number, profile: BehavioralProfile): number {
  // Base: quanto mais mensagens, mais confiança
  let confidence = Math.min(1, messagesAnalyzed / 20); // 20 mensagens = 100% confiança base
  
  // Se os scores são muito baixos, confiança é menor
  const maxScore = Math.max(...Object.values(profile));
  if (maxScore < 0.2) {
    confidence *= 0.5;
  }
  
  return Math.min(1, confidence);
}

// ============================================
// PROFILE DETECTION
// ============================================

/**
 * Detecta o perfil comportamental a partir do contexto completo
 */
export function detectBehavioralProfile(context: FullContext): FullBehavioralProfile {
  const profiles: BehavioralProfile[] = [];
  
  // Analisar histórico de conversas
  for (const msg of context.conversationHistory) {
    if (msg.role === 'user') {
      profiles.push(analyzeMessage(msg.content));
    }
  }
  
  // Analisar mensagem atual
  const currentContent = context.intake.transcribedContent || 
                          context.intake.extractedText || 
                          context.intake.rawContent;
  profiles.push(analyzeMessage(currentContent));
  
  // Consolidar
  const consolidated = consolidateProfiles(profiles);
  const dominant = getDominantProfile(consolidated);
  const confidence = calculateConfidence(profiles.length, consolidated);
  
  // Determinar tom preferido baseado no perfil
  let preferredTone: FullBehavioralProfile['preferredTone'];
  switch (dominant) {
    case 'technical':
      preferredTone = 'technical';
      break;
    case 'elderly':
    case 'confused':
      preferredTone = 'simple';
      break;
    case 'skeptical':
      preferredTone = 'formal';
      break;
    default:
      preferredTone = 'informal';
  }
  
  // Calcular comprimento médio das mensagens do usuário
  const userMessages = context.conversationHistory.filter(m => m.role === 'user');
  const avgLength = userMessages.length > 0
    ? userMessages.reduce((sum, m) => sum + m.content.length, 0) / userMessages.length
    : 0;
  
  return {
    ...consolidated,
    dominantProfile: dominant,
    profileConfidence: confidence,
    preferredTone,
    avgMessageLength: avgLength,
    totalMessagesAnalyzed: profiles.length
  };
}

/**
 * Carrega perfil persistido do banco de dados
 */
export async function loadPersistedProfile(phone: string): Promise<FullBehavioralProfile | null> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  const { data, error } = await supabase
    .from('client_behavioral_profiles')
    .select('*')
    .eq('phone', phone)
    .single();
  
  if (error || !data) {
    return null;
  }
  
  return {
    technical: data.technical_score || 0,
    objective: data.objective_score || 0,
    skeptical: data.skeptical_score || 0,
    confused: data.confused_score || 0,
    elderly: data.elderly_score || 0,
    dominantProfile: data.dominant_profile || 'balanced',
    profileConfidence: data.profile_confidence || 0,
    preferredTone: data.preferred_tone,
    avgMessageLength: data.avg_message_length,
    totalMessagesAnalyzed: data.total_messages_analyzed || 0
  };
}

/**
 * Persiste/atualiza o perfil no banco de dados
 */
export async function persistBehavioralProfile(
  phone: string,
  profile: FullBehavioralProfile,
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
        dominant_profile: profile.dominantProfile,
        profile_confidence: profile.profileConfidence,
        preferred_tone: profile.preferredTone,
        avg_message_length: profile.avgMessageLength,
        total_messages_analyzed: profile.totalMessagesAnalyzed,
        last_updated_at: new Date().toISOString(),
        last_conversa_id: conversaId
      }, {
        onConflict: 'phone'
      });
  } catch (error) {
    console.warn('[behavioral-profile] Failed to persist profile:', error);
  }
}

// ============================================
// PROMPT ADAPTATION
// ============================================

/**
 * Gera instruções de adaptação para o prompt baseado no perfil
 */
export function generateProfileAdaptation(profile: FullBehavioralProfile): ProfileAdaptation {
  const instructions: ProfileAdaptation = {
    toneInstructions: '',
    styleInstructions: '',
    avoidPatterns: [],
    preferPatterns: []
  };
  
  switch (profile.dominantProfile) {
    case 'technical':
      instructions.toneInstructions = `Este cliente tem perfil TÉCNICO (confiança: ${(profile.profileConfidence * 100).toFixed(0)}%).
ADAPTE seu tom: Use termos técnicos quando relevante, cite regulamentações ANEEL, 
mostre cálculos e fórmulas quando perguntado. O cliente valoriza precisão e detalhes.`;
      instructions.styleInstructions = `- Pode usar termos como SCEE, GD, TUSD, TE, kWh
- Explique fórmulas de cálculo quando relevante
- Cite resoluções da ANEEL quando aplicável
- Seja detalhista e preciso`;
      instructions.avoidPatterns = ['linguagem muito simplificada', 'analogias infantis'];
      instructions.preferPatterns = ['dados numéricos', 'referências técnicas', 'explicações detalhadas'];
      break;
      
    case 'objective':
      instructions.toneInstructions = `Este cliente tem perfil OBJETIVO (confiança: ${(profile.profileConfidence * 100).toFixed(0)}%).
ADAPTE seu tom: Seja direto e conciso. Evite rodeios e explicações longas.
O cliente quer respostas curtas e acionáveis.`;
      instructions.styleInstructions = `- Respostas curtas (máximo 2-3 linhas)
- Vá direto ao ponto
- Use bullet points quando listar
- Evite introduções longas`;
      instructions.avoidPatterns = ['parágrafos longos', 'explicações extensas', 'muitos emojis'];
      instructions.preferPatterns = ['respostas curtas', 'números diretos', 'próximos passos claros'];
      break;
      
    case 'skeptical':
      instructions.toneInstructions = `Este cliente tem perfil DESCONFIADO (confiança: ${(profile.profileConfidence * 100).toFixed(0)}%).
ADAPTE seu tom: Seja transparente e proativo em fornecer garantias.
Cite validações, regulamentações e ofereça provas de legitimidade.`;
      instructions.styleInstructions = `- Cite que a COESA é regulamentada pela ANEEL
- Mencione que não há fidelidade nem multa
- Ofereça enviar contrato para análise
- Seja transparente sobre todos os termos
- Valide preocupações antes de rebater`;
      instructions.avoidPatterns = ['promessas vagas', 'pressão para fechar', 'evitar perguntas'];
      instructions.preferPatterns = ['transparência', 'garantias formais', 'validações oficiais'];
      break;
      
    case 'confused':
      instructions.toneInstructions = `Este cliente tem perfil CONFUSO (confiança: ${(profile.profileConfidence * 100).toFixed(0)}%).
ADAPTE seu tom: Use linguagem ultra-simples e didática.
Divida explicações em passos pequenos. Confirme entendimento frequentemente.`;
      instructions.styleInstructions = `- Use frases curtas e simples
- Evite jargões técnicos
- Divida explicações em passos numerados
- Pergunte "Ficou claro?" após explicações
- Use analogias do dia-a-dia`;
      instructions.avoidPatterns = ['termos técnicos', 'explicações longas de uma vez', 'múltiplos conceitos juntos'];
      instructions.preferPatterns = ['linguagem simples', 'passo a passo', 'confirmações de entendimento'];
      break;
      
    case 'elderly':
      instructions.toneInstructions = `Este cliente tem perfil IDOSO/MENOS FAMILIARIZADO COM TECNOLOGIA (confiança: ${(profile.profileConfidence * 100).toFixed(0)}%).
ADAPTE seu tom: Seja paciente, respeitoso e extremamente claro.
Evite emojis excessivos. Ofereça alternativas como ligação se necessário.`;
      instructions.styleInstructions = `- Tom respeitoso e paciente
- Frases curtas e claras
- Evite gírias e abreviações
- Máximo 1-2 emojis por mensagem
- Ofereça ligar se o cliente preferir
- Repita informações importantes`;
      instructions.avoidPatterns = ['gírias', 'abreviações', 'muitos emojis', 'linguagem jovem'];
      instructions.preferPatterns = ['respeito', 'paciência', 'clareza', 'oferta de ligação'];
      break;
      
    default: // balanced
      instructions.toneInstructions = `Perfil do cliente ainda não definido ou balanceado.
Mantenha um tom profissional mas amigável, equilibrando clareza e cordialidade.`;
      instructions.styleInstructions = `- Tom profissional e amigável
- Clareza nas explicações
- Adapte-se conforme a conversa evolui`;
      instructions.avoidPatterns = [];
      instructions.preferPatterns = ['equilíbrio', 'adaptabilidade'];
  }
  
  return instructions;
}

/**
 * Gera o bloco de prompt para injeção no Reasoning Layer
 */
export function buildProfilePromptBlock(profile: FullBehavioralProfile): string {
  if (profile.profileConfidence < 0.3 || profile.dominantProfile === 'balanced') {
    return ''; // Não incluir bloco se confiança for baixa
  }
  
  const adaptation = generateProfileAdaptation(profile);
  
  return `## PERFIL COMPORTAMENTAL DO CLIENTE
${adaptation.toneInstructions}

### Estilo de Comunicação
${adaptation.styleInstructions}

### Evitar
${adaptation.avoidPatterns.length > 0 ? adaptation.avoidPatterns.map(p => `- ${p}`).join('\n') : '- Nenhuma restrição específica'}

### Preferir
${adaptation.preferPatterns.length > 0 ? adaptation.preferPatterns.map(p => `- ${p}`).join('\n') : '- Comunicação padrão'}
`;
}

// ============================================
// INTEGRATION WITH LEARNING LAYER
// ============================================

/**
 * Atualiza o perfil após cada interação (chamado pelo Learning Layer)
 */
export async function updateProfileAfterInteraction(
  context: FullContext
): Promise<void> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  // Verificar se feature está habilitada
  const { data: config } = await supabase
    .from('configuracoes_sistema')
    .select('valor')
    .eq('chave', 'behavioral_profile_enabled')
    .single();
  
  if (config?.valor !== 'true') {
    return;
  }
  
  // Detectar perfil atual
  const detectedProfile = detectBehavioralProfile(context);
  
  // Carregar perfil existente
  const existingProfile = await loadPersistedProfile(context.intake.phone);
  
  // Mesclar perfis (média ponderada com peso maior para existente)
  let mergedProfile: FullBehavioralProfile;
  
  if (existingProfile && existingProfile.totalMessagesAnalyzed > 0) {
    const existingWeight = 0.7;
    const newWeight = 0.3;
    
    mergedProfile = {
      technical: existingProfile.technical * existingWeight + detectedProfile.technical * newWeight,
      objective: existingProfile.objective * existingWeight + detectedProfile.objective * newWeight,
      skeptical: existingProfile.skeptical * existingWeight + detectedProfile.skeptical * newWeight,
      confused: existingProfile.confused * existingWeight + detectedProfile.confused * newWeight,
      elderly: existingProfile.elderly * existingWeight + detectedProfile.elderly * newWeight,
      dominantProfile: getDominantProfile({
        technical: existingProfile.technical * existingWeight + detectedProfile.technical * newWeight,
        objective: existingProfile.objective * existingWeight + detectedProfile.objective * newWeight,
        skeptical: existingProfile.skeptical * existingWeight + detectedProfile.skeptical * newWeight,
        confused: existingProfile.confused * existingWeight + detectedProfile.confused * newWeight,
        elderly: existingProfile.elderly * existingWeight + detectedProfile.elderly * newWeight,
      }),
      profileConfidence: Math.min(1, existingProfile.profileConfidence + 0.05),
      preferredTone: detectedProfile.preferredTone,
      avgMessageLength: detectedProfile.avgMessageLength,
      totalMessagesAnalyzed: existingProfile.totalMessagesAnalyzed + detectedProfile.totalMessagesAnalyzed
    };
  } else {
    mergedProfile = detectedProfile;
  }
  
  // Persistir
  await persistBehavioralProfile(
    context.intake.phone,
    mergedProfile,
    context.intake.conversaId
  );
  
  console.log(`[behavioral-profile] Updated profile for ${context.intake.phone}: ${mergedProfile.dominantProfile} (${(mergedProfile.profileConfidence * 100).toFixed(0)}%)`);
}
