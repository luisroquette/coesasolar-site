/**
 * Distribuidora Handler Module
 * Centralized distribuidora validation, typo detection, and caching
 * Extracted from sofia-webhook/index.ts for reuse across Edge Functions
 */

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface DistribuidoraConfig {
  id: string;
  nome: string;
  nome_normalizado: string;
  uf: string | null;
  is_atendida: boolean;
  requires_clarification: boolean;
  clarification_message: string | null;
  rejection_message: string | null;
  parent_id: string | null;
  priority: number;
}

export interface DistribuidoraCache {
  distribuidoras: DistribuidoraConfig[];
  typos: Map<string, { distribuidora_id: string; normalized: string }>;
  forbiddenWords: Set<string>;
  timestamp: number;
}

export interface DistribuidoraValidation {
  atendida: boolean;
  normalizada?: string;
  needsClarification?: boolean;
  clarificationQuestion?: string;
  mensagemNaoAtendida?: string;
}

export interface LearnedTypo {
  typo: string;
  normalized: string;
  count: number;
}

// ═══════════════════════════════════════════════════════════════
// CACHE MANAGEMENT
// ═══════════════════════════════════════════════════════════════

let distribuidoraCache: DistribuidoraCache | null = null;
const DISTRIBUIDORA_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Load distribuidoras configuration from database
 */
export async function loadDistribuidorasConfig(
  supabaseClient: any
): Promise<DistribuidoraCache> {
  const now = Date.now();
  
  // Return cached if still valid
  if (distribuidoraCache && (now - distribuidoraCache.timestamp) < DISTRIBUIDORA_CACHE_TTL_MS) {
    console.log('[DISTRIBUIDORAS] Using cached distribuidoras config');
    return distribuidoraCache;
  }
  
  console.log('[DISTRIBUIDORAS] Loading distribuidoras config from database...');
  
  try {
    // Load distribuidoras
    const { data: distribuidoras, error: distError } = await supabaseClient
      .from('distribuidoras_config')
      .select('id, nome, nome_normalizado, uf, is_atendida, requires_clarification, clarification_message, rejection_message, parent_id, priority')
      .eq('is_active', true)
      .order('priority', { ascending: true });
    
    if (distError) {
      console.error('[DISTRIBUIDORAS] Error loading distribuidoras:', distError);
      return { distribuidoras: [], typos: new Map(), forbiddenWords: new Set(), timestamp: now };
    }
    
    // Load typos with distribuidora info
    const { data: typosData, error: typosError } = await supabaseClient
      .from('distribuidora_typos')
      .select('typo, distribuidora_id, distribuidoras_config!inner(nome_normalizado)');
    
    if (typosError) {
      console.error('[DISTRIBUIDORAS] Error loading typos:', typosError);
    }
    
    // Load forbidden words
    const { data: forbiddenData, error: forbiddenError } = await supabaseClient
      .from('forbidden_typo_words')
      .select('word');
    
    if (forbiddenError) {
      console.error('[DISTRIBUIDORAS] Error loading forbidden words:', forbiddenError);
    }
    
    // Build typos map
    const typosMap = new Map<string, { distribuidora_id: string; normalized: string }>();
    if (typosData) {
      for (const row of typosData) {
        const typo = row.typo?.toLowerCase()?.trim();
        if (typo) {
          typosMap.set(typo, {
            distribuidora_id: row.distribuidora_id,
            normalized: (row as any).distribuidoras_config?.nome_normalizado || '',
          });
        }
      }
    }
    
    // Build forbidden words set
    const forbiddenSet = new Set<string>();
    if (forbiddenData) {
      for (const row of forbiddenData) {
        if (row.word) {
          forbiddenSet.add(row.word.toLowerCase().trim());
        }
      }
    }
    
    distribuidoraCache = {
      distribuidoras: distribuidoras || [],
      typos: typosMap,
      forbiddenWords: forbiddenSet,
      timestamp: now,
    };
    
    console.log(`[DISTRIBUIDORAS] ✅ Loaded ${distribuidoras?.length || 0} distribuidoras, ${typosMap.size} typos, ${forbiddenSet.size} forbidden words`);
    
    return distribuidoraCache;
  } catch (error) {
    console.error('[DISTRIBUIDORAS] Exception loading config:', error);
    return { distribuidoras: [], typos: new Map(), forbiddenWords: new Set(), timestamp: now };
  }
}

/**
 * Get current cache (without loading)
 */
export function getDistribuidoraCache(): DistribuidoraCache | null {
  return distribuidoraCache;
}

/**
 * Clear the distribuidora cache
 */
export function clearDistribuidoraCache(): void {
  distribuidoraCache = null;
}

// ═══════════════════════════════════════════════════════════════
// VALIDATION
// ═══════════════════════════════════════════════════════════════

/**
 * Normalize input text for comparison
 */
function normalizeInput(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

/**
 * Find distribuidora from cache
 */
export function findDistribuidoraFromCache(
  input: string,
  cache: DistribuidoraCache
): DistribuidoraConfig | null {
  if (!input || !cache.distribuidoras.length) return null;
  
  const normalizedInput = normalizeInput(input);
  
  // 1. Exact match by nome_normalizado
  const exactMatch = cache.distribuidoras.find(d => 
    normalizeInput(d.nome_normalizado) === normalizedInput ||
    normalizeInput(d.nome) === normalizedInput
  );
  if (exactMatch) {
    console.log(`[DISTRIBUIDORAS] Exact match: "${input}" -> "${exactMatch.nome}"`);
    return exactMatch;
  }
  
  // 2. Check typos map
  const typoMatch = cache.typos.get(normalizedInput);
  if (typoMatch) {
    const dist = cache.distribuidoras.find(d => d.id === typoMatch.distribuidora_id);
    if (dist) {
      console.log(`[DISTRIBUIDORAS] Typo match: "${input}" -> "${dist.nome}"`);
      return dist;
    }
  }
  
  // 3. Partial match (input is contained in distribuidora name or vice versa)
  for (const dist of cache.distribuidoras) {
    const normalizedNome = normalizeInput(dist.nome_normalizado);
    if (normalizedNome.includes(normalizedInput) || normalizedInput.includes(normalizedNome)) {
      if (normalizedInput.length > 3) {
        console.log(`[DISTRIBUIDORAS] Partial match: "${input}" -> "${dist.nome}"`);
        return dist;
      }
    }
  }
  
  // 4. Check if input matches any typo partially
  for (const [typo, typoData] of cache.typos) {
    if (normalizedInput.includes(typo) || typo.includes(normalizedInput)) {
      const dist = cache.distribuidoras.find(d => d.id === typoData.distribuidora_id);
      if (dist) {
        console.log(`[DISTRIBUIDORAS] Partial typo match: "${input}" -> "${dist.nome}"`);
        return dist;
      }
    }
  }
  
  return null;
}

/**
 * Validate distribuidora using database configuration
 */
export function validarDistribuidoraFromCache(
  distribuidoraInformada: string,
  cache: DistribuidoraCache
): DistribuidoraValidation {
  const dist = findDistribuidoraFromCache(distribuidoraInformada, cache);
  
  // Found in database
  if (dist) {
    // Requires clarification (generic name like "NEOENERGIA" or "CPFL")
    if (dist.requires_clarification) {
      return {
        atendida: false,
        needsClarification: true,
        clarificationQuestion: dist.clarification_message || 
          `Qual ${dist.nome} especificamente? Poderia confirmar?`,
      };
    }
    
    // Attended
    if (dist.is_atendida) {
      return {
        atendida: true,
        normalizada: dist.nome_normalizado,
      };
    }
    
    // Not attended
    return {
      atendida: false,
      mensagemNaoAtendida: dist.rejection_message || 
        `Hmm... Sentimos muito, mas ainda não atendemos a sua região. 😔

A *${distribuidoraInformada}* está no nosso plano de expansão e, em breve, estaremos por aí!

Posso salvar seu contato e te chamar quando iniciarmos as operações na sua área? 📋`,
    };
  }
  
  // Not found - show list of attended distribuidoras
  const atendidasList = getAttendedasList(cache);
  
  return {
    atendida: false,
    mensagemNaoAtendida: `Hmm... Não reconheci essa distribuidora. 🤔

${atendidasList ? `Atualmente atendemos clientes da ${atendidasList}.` : 'Entre em contato conosco para verificar sua região.'}

Se você for de outra região, posso salvar seu contato para avisá-lo quando expandirmos! 📋`,
  };
}

/**
 * Get list of attended distribuidoras for messaging
 */
export function getAttendedasList(cache: DistribuidoraCache): string {
  const atendidas = cache.distribuidoras
    .filter(d => d.is_atendida && !d.requires_clarification)
    .map(d => `*${d.nome}*${d.uf ? ` (${d.uf})` : ''}`);
  
  if (atendidas.length === 0) return '';
  if (atendidas.length === 1) return atendidas[0];
  if (atendidas.length === 2) return `${atendidas[0]} e ${atendidas[1]}`;
  
  return atendidas.slice(0, -1).join(', ') + ' e ' + atendidas.slice(-1);
}

// ═══════════════════════════════════════════════════════════════
// TYPO MANAGEMENT
// ═══════════════════════════════════════════════════════════════

/**
 * Check if a word is forbidden from being registered as a typo
 */
export function isForbiddenTypo(typo: string, cache?: DistribuidoraCache | null): boolean {
  const lowerTypo = typo?.toLowerCase()?.trim();
  if (!lowerTypo || lowerTypo.length < 3) return true;
  
  // Check against database-loaded forbidden words
  const cacheToUse = cache || distribuidoraCache;
  if (cacheToUse?.forbiddenWords?.has(lowerTypo)) return true;
  
  // Also block if it's a substring of "energia" or similar (safety net)
  if ('energia'.includes(lowerTypo) && lowerTypo.length < 6) return true;
  if ('solar'.includes(lowerTypo) && lowerTypo.length < 4) return true;
  
  return false;
}

/**
 * Load learned typos from database
 */
export async function loadLearnedTypos(supabaseClient: any): Promise<LearnedTypo[]> {
  try {
    const { data: confirmedTypos, error } = await supabaseClient
      .from('distribuidora_typos_log')
      .select('typo_detectado, sugestao, confirmado')
      .eq('confirmado', true);
    
    if (error) {
      console.error('[loadLearnedTypos] Error querying typos:', error);
      return [];
    }
    
    if (!confirmedTypos || confirmedTypos.length === 0) {
      return [];
    }
    
    // Aggregate and count
    const typoMap = new Map<string, { normalized: string; count: number }>();
    
    for (const t of confirmedTypos) {
      const typo = t.typo_detectado?.toLowerCase()?.trim();
      const normalized = t.sugestao;
      
      if (!typo || !normalized) continue;
      
      const existing = typoMap.get(typo);
      if (existing) {
        existing.count++;
      } else {
        typoMap.set(typo, { normalized, count: 1 });
      }
    }
    
    // Convert to array
    const result: LearnedTypo[] = [];
    for (const [typo, data] of typoMap) {
      // Only include typos seen at least twice (reduces noise)
      if (data.count >= 2) {
        result.push({ typo, normalized: data.normalized, count: data.count });
      }
    }
    
    console.log(`[loadLearnedTypos] Loaded ${result.length} confirmed typos from database`);
    return result;
  } catch (err) {
    console.error('[loadLearnedTypos] Exception:', err);
    return [];
  }
}

/**
 * Log a detected typo for analysis
 */
export async function logTypoDetection(
  supabaseClient: any,
  typo: string,
  sugestao: string,
  conversaId?: string
): Promise<void> {
  try {
    await supabaseClient.from('distribuidora_typos_log').insert({
      typo_detectado: typo.toLowerCase().trim(),
      sugestao: sugestao,
      conversa_id: conversaId || null,
      confirmado: null, // Will be updated when user confirms/rejects
    });
    console.log(`[logTypoDetection] Logged typo: "${typo}" -> "${sugestao}"`);
  } catch (error) {
    console.error('[logTypoDetection] Error:', error);
  }
}

/**
 * Confirm or reject a typo suggestion
 */
export async function confirmTypoSuggestion(
  supabaseClient: any,
  typo: string,
  confirmed: boolean,
  conversaId?: string
): Promise<void> {
  try {
    // Update the most recent typo log entry
    const { error } = await supabaseClient
      .from('distribuidora_typos_log')
      .update({ confirmado: confirmed })
      .eq('typo_detectado', typo.toLowerCase().trim())
      .is('confirmado', null)
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (error) {
      console.error('[confirmTypoSuggestion] Error:', error);
    } else {
      console.log(`[confirmTypoSuggestion] Typo "${typo}" ${confirmed ? 'confirmed' : 'rejected'}`);
    }
  } catch (err) {
    console.error('[confirmTypoSuggestion] Exception:', err);
  }
}

// ═══════════════════════════════════════════════════════════════
// CONTEXT ANALYSIS (AI-based)
// Zero Hardcode: Prompt carregado do banco de dados
// ═══════════════════════════════════════════════════════════════

import { getTemplate, getTemplateCache } from './message-templates.ts';

export interface DistribuidoraContextAnalysis {
  detected: boolean;
  distribuidora: string | null;
  confidence: number; // 0-100
  isTypo: boolean;
  suggestedCorrection: string | null;
  context: 'distributor_mention' | 'generic_energy' | 'company_name' | 'product' | 'unknown';
  reasoning: string;
}

// Fallback prompt (used only if DB template unavailable)
const FALLBACK_CONTEXT_ANALYSIS_PROMPT = `Você é um analisador de contexto especializado para mensagens de WhatsApp da COESA Energia (empresa de energia solar por assinatura).

Sua tarefa: determinar se uma mensagem menciona uma DISTRIBUIDORA DE ENERGIA ELÉTRICA ou se "energia" é usada em outro contexto.

DISTRIBUIDORAS CONHECIDAS (empresas de energia elétrica no Brasil):
CEMIG, CPFL, COPEL, ENERGISA, ENEL, LIGHT, COELBA, CELESC, EQUATORIAL, ELEKTRO, CELPE, COSERN, ELETROPAULO, EDP, RGE SUL, CEEE, AMAZONAS ENERGIA, CEA, NEOENERGIA

REGRAS CRÍTICAS:
1. "energia solar", "COESA Energia", "economizar energia", "conta de energia", "gasto de energia" → NÃO são distribuidoras, são termos genéricos
2. "energia" sozinho em contexto como "quero saber mais sobre energia", "vi sobre energia solar" → NÃO é ENERGISA
3. "minha conta é da energis", "sou da enrgisa", "pago pra energisa" → PROVÁVEL typo de ENERGISA (contexto de distribuidora)
4. "vim pelo site da coesa energia" → "energia" é parte do nome da empresa COESA, NÃO distribuidora`;

/**
 * Get context analysis prompt from database (Zero Hardcode)
 */
function getContextAnalysisPrompt(): string {
  const template = getTemplate('ai_prompts', 'distribuidora_context_analysis', getTemplateCache() || undefined);
  return template?.template_text || FALLBACK_CONTEXT_ANALYSIS_PROMPT;
}

/**
 * Analyze distribuidora context using AI (for ambiguous cases)
 */
export async function analyzeDistribuidoraContext(
  message: string,
  apiKey: string,
  apiUrl: string = 'https://openrouter.ai/api/v1/chat/completions'
): Promise<DistribuidoraContextAnalysis | null> {
  // Quick check: if message doesn't contain any potential distributor mention, skip AI call
  const potentialMentions = [
    /\benerg/i, /\bcemig/i, /\bcpfl/i, /\bcopel/i, /\benel/i, /\blight/i, /\bcoelba/i,
    /\bcelesc/i, /\bequatorial/i, /\belektro/i, /\bcelpe/i, /\bcosern/i, /\bedp/i,
    /\bneoenergia/i, /\brge/i, /\bceee/i, /\beletropaulo/i, /\bamazonas/i,
    /\bcmeig/i, /\bsemig/i, /\benrgisa/i, /\bcolba/i, /\bligth/i, /\bcfpl/i,
  ];
  
  const hasPotentialMention = potentialMentions.some(p => p.test(message));
  if (!hasPotentialMention) {
    return null;
  }
  
  // If it's clearly just "energia solar" or "COESA Energia", skip AI call entirely
  const clearlyGenericPatterns = [
    /energia\s+solar/i,
    /coesa\s+energia/i,
    /economizar?\s+energia/i,
    /gasto\s+(?:de\s+)?energia/i,
    /conta\s+de\s+energia/i,
    /consumo\s+de\s+energia/i,
    /energia\s+(?:el[eé]trica|renov[aá]vel|limpa)/i,
    /energia\s+(?:mais\s+)?barata/i,
    /reduzir\s+(?:conta|gasto)\s+(?:de\s+)?energia/i,
  ];
  
  const lowerMessage = message.toLowerCase();
  
  if (/\benergia\b/i.test(message)) {
    const isGeneric = clearlyGenericPatterns.some(p => p.test(lowerMessage));
    const hasExplicitDistributor = /\b(cemig|cpfl|copel|enel|light|coelba|celesc|equatorial|elektro|celpe|cosern|edp|neoenergia|rge|ceee|eletropaulo|energisa)\b/i.test(lowerMessage);
    
    if (isGeneric && !hasExplicitDistributor) {
      console.log(`[analyzeDistribuidoraContext] Skipping AI: clearly generic energy context`);
      return {
        detected: false,
        distribuidora: null,
        confidence: 95,
        isTypo: false,
        suggestedCorrection: null,
        context: 'generic_energy',
        reasoning: 'Message contains "energia" in a generic context (energia solar, COESA Energia, etc.)',
      };
    }
  }
  
  // For ambiguous cases, use AI for contextual analysis
  try {
    console.log(`[analyzeDistribuidoraContext] Using AI to analyze: "${message.substring(0, 100)}..."`);
    
    // Get prompt from database (Zero Hardcode)
    const contextPrompt = getContextAnalysisPrompt();
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: contextPrompt },
          { role: 'user', content: `Analise esta mensagem de WhatsApp:\n\n"${message}"` }
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'analyze_distribuidora',
            description: 'Analisa se uma mensagem menciona uma distribuidora de energia ou se "energia" é usado em contexto genérico',
            parameters: {
              type: 'object',
              properties: {
                detected: { type: 'boolean', description: 'Se uma distribuidora real foi mencionada' },
                distribuidora: { type: 'string', description: 'Nome normalizado da distribuidora ou null' },
                confidence: { type: 'number', description: 'Nível de confiança de 0-100' },
                isTypo: { type: 'boolean', description: 'Se a menção parece ser um erro de digitação' },
                suggestedCorrection: { type: 'string', description: 'Correção sugerida se for typo' },
                context: { 
                  type: 'string', 
                  enum: ['distributor_mention', 'generic_energy', 'company_name', 'product', 'unknown'],
                  description: 'Tipo de contexto' 
                },
                reasoning: { type: 'string', description: 'Explicação breve do raciocínio' },
              },
              required: ['detected', 'confidence', 'context', 'reasoning'],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'analyze_distribuidora' } },
      }),
    });
    
    if (!response.ok) {
      console.error(`[analyzeDistribuidoraContext] AI API error: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall?.function?.arguments) {
      console.error(`[analyzeDistribuidoraContext] No tool call in response`);
      return null;
    }
    
    const analysis = JSON.parse(toolCall.function.arguments) as DistribuidoraContextAnalysis;
    console.log(`[analyzeDistribuidoraContext] AI analysis:`, {
      detected: analysis.detected,
      distribuidora: analysis.distribuidora,
      confidence: analysis.confidence,
      context: analysis.context,
    });
    
    return analysis;
  } catch (err) {
    console.error(`[analyzeDistribuidoraContext] Error calling AI:`, err);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// DISTRIBUTOR VALIDATION FLOW - Phase 41
// Handles full validation + rejection/clarification + Bitrix JUNK
// ═══════════════════════════════════════════════════════════════

export interface DistributorValidationContext {
  supabase: any;
  conversaId: string;
  phone: string;
  messageText: string;
  existingDados: Record<string, any>;
  extractedData: Record<string, any>;
  conversa: {
    bitrix24_lead_id?: string | null;
    sofia_mode?: string | null;
    ended_at?: string | null;
  } | null;
  sendMessage: (phone: string, message: string) => Promise<void>;
  validarDistribuidora: (input: string) => DistribuidoraValidation;
}

export interface DistributorValidationResult {
  handled: boolean;
  extractedDataUpdates?: Record<string, any>;
  response?: {
    success: boolean;
    message: string;
    distribuidora?: string;
  };
}

/**
 * Non-attended regions for clarification flow
 */
const NON_ATTENDED_NEOENERGIA = [
  'pernambuco', 'recife', 'pe',
  'rio grande do norte', 'natal', 'rn', 'cosern',
  'paraíba', 'paraiba', 'joão pessoa', 'joao pessoa', 'pb', 'borborema',
  'mato grosso', 'cuiabá', 'cuiaba', 'mt',
  'mato grosso do sul', 'campo grande', 'ms',
  'distrito federal', 'brasília', 'brasilia', 'df',
  'goiás', 'goias', 'goiânia', 'goiania', 'go',
];

const NON_ATTENDED_CPFL = [
  'piratininga', 'santa cruz', 'mococa', 'leste paulista', 'sul paulista', 'jaguari',
  'rio grande do sul', 'rs', 'porto alegre', 'rge',
];

/**
 * Move lead to "Concessionária Não Atendida" stage in Bitrix24
 * UPDATED: Uses UC_56ZLAR instead of JUNK for future reactivation
 */
async function moveLeadToConcessionariaNaoAtendida(
  supabase: any,
  bitrixLeadId: string,
  distribuidora: string
): Promise<{ success: boolean; stageId: string }> {
  try {
    const { data: bitrixConfig } = await supabase
      .from('configuracoes_sistema')
      .select('chave, valor')
      .in('chave', [
        'bitrix24_webhook_url', 
        'bitrix24_enabled', 
        'bitrix24_stage_concessionaria_nao_atendida',
      ]);
    
    const configMap: Record<string, string> = {};
    bitrixConfig?.forEach((c: { chave: string; valor: string }) => { configMap[c.chave] = c.valor; });
    
    // Default to UC_56ZLAR if not configured
    const stageConcessionariaNaoAtendida = configMap.bitrix24_stage_concessionaria_nao_atendida || 'UC_56ZLAR';
    
    if (configMap.bitrix24_webhook_url && configMap.bitrix24_enabled === 'true') {
      await fetch(`${configMap.bitrix24_webhook_url}/crm.lead.update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          id: bitrixLeadId, 
          fields: { STATUS_ID: stageConcessionariaNaoAtendida }
        }),
      });
      
      await fetch(`${configMap.bitrix24_webhook_url}/crm.timeline.comment.add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            ENTITY_ID: bitrixLeadId,
            ENTITY_TYPE: 'lead',
            COMMENT: `📍 Lead movido para Concessionária Não Atendida\n\n📋 Distribuidora: ${distribuidora}\n📅 Data: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\n\n💡 Motivo: Região ainda não atendida. Lead pode ser reativado quando houver expansão para esta concessionária.`,
          },
        }),
      });
      
      console.log(`[DISTRIBUTOR_FLOW] Lead ${bitrixLeadId} movido para Concessionária Não Atendida (${stageConcessionariaNaoAtendida})`);
      return { success: true, stageId: stageConcessionariaNaoAtendida };
    }
    return { success: false, stageId: stageConcessionariaNaoAtendida };
  } catch (error) {
    console.error('[DISTRIBUTOR_FLOW] Erro ao mover lead para Concessionária Não Atendida:', error);
    return { success: false, stageId: 'UC_56ZLAR' };
  }
}

/**
 * Handle not-attended distributor rejection
 * UPDATED: Moves to Concessionária Não Atendida (UC_56ZLAR) instead of JUNK
 */
async function handleNotAttendedRejection(
  ctx: DistributorValidationContext,
  distInformada: string,
  rejectionMessage: string
): Promise<DistributorValidationResult> {
  const { supabase, conversaId, phone, existingDados, extractedData, conversa, sendMessage } = ctx;
  
  await sendMessage(phone, rejectionMessage);
  
  await supabase.from('chatbot_mensagens').insert({
    conversa_id: conversaId,
    role: 'assistant',
    content: rejectionMessage,
  });
  
  // Move lead to Concessionária Não Atendida (UC_56ZLAR) in Bitrix
  let stageId = 'UC_56ZLAR';
  const bitrixLeadId = conversa?.bitrix24_lead_id;
  if (bitrixLeadId) {
    const result = await moveLeadToConcessionariaNaoAtendida(supabase, bitrixLeadId, distInformada);
    stageId = result.stageId;
  }
  
  // Update conversation with discard status
  // CRITICAL FIX: Merge with existingDados to prevent data loss
  // UPDATED: Uses UC_56ZLAR instead of JUNK
  await supabase
    .from('chatbot_conversas')
    .update({
      dados_coletados: { ...existingDados, ...extractedData, motivoDescarte: 'distribuidora_nao_atendida' },
      sofia_mode: 'descartado',
      bitrix24_stage: stageId, // UC_56ZLAR, not JUNK
      ended_at: new Date().toISOString(),
      awaiting_response: false,
      nudge_count: 0,
      next_nudge_at: null,
      next_followup_at: null,
      next_rescue_at: null,
      next_contract_nudge_at: null,
      last_message_at: new Date().toISOString(),
    })
    .eq('id', conversaId);
  
  return {
    handled: true,
    response: {
      success: true,
      message: 'Region not attended, lead moved to Concessionária Não Atendida',
      distribuidora: distInformada,
    },
  };
}

/**
 * Handle clarification request for generic distributor
 */
async function handleClarificationRequest(
  ctx: DistributorValidationContext,
  distInformada: string,
  clarificationMessage: string
): Promise<DistributorValidationResult> {
  const { supabase, conversaId, phone, existingDados, extractedData, sendMessage } = ctx;
  
  await sendMessage(phone, clarificationMessage);
  
  await supabase.from('chatbot_mensagens').insert({
    conversa_id: conversaId,
    role: 'assistant',
    content: clarificationMessage,
  });
  
  // CRITICAL FIX: Merge with existingDados to prevent data loss
  await supabase
    .from('chatbot_conversas')
    .update({
      dados_coletados: { ...existingDados, ...extractedData, distribuidoraClarificacao: true },
      last_message_at: new Date().toISOString(),
    })
    .eq('id', conversaId);
  
  return {
    handled: true,
    response: {
      success: true,
      message: 'Distributor clarification requested',
      distribuidora: distInformada,
    },
  };
}

/**
 * Main distributor validation flow
 * Handles validation, clarification requests, and rejections
 */
export async function handleDistributorValidationFlow(
  ctx: DistributorValidationContext
): Promise<DistributorValidationResult> {
  const { 
    existingDados, 
    extractedData, 
    conversa, 
    validarDistribuidora 
  } = ctx;
  
  // Check if we should validate distribuidora
  // CRITICAL FIX: Also check extractedData.distribuidora from PDF analysis
  const distToValidate = extractedData.distribuidoraInformada || 
                         extractedData.distribuidora || 
                         existingDados.distribuidoraInformada;
  const shouldValidate = distToValidate && (
    !existingDados.distribuidoraInformada ||
    (existingDados.distribuidoraInformada && 
     !existingDados.motivoDescarte && 
     !existingDados.distribuidoraNaoAtendida &&
     conversa?.sofia_mode !== 'descartado' &&
     !conversa?.ended_at)
  );
  
  if (!shouldValidate) {
    return { handled: false };
  }
  
  const distInformada = distToValidate;
  const validation = validarDistribuidora(distInformada);
  
  // If attended, update extractedData
  if (validation.atendida && validation.normalizada) {
    console.log(`[DISTRIBUTOR_FLOW] ✅ Distribuidora validated: ${validation.normalizada}`);
    return {
      handled: false, // Continue processing
      extractedDataUpdates: {
        distribuidora: validation.normalizada,
        distribuidoraInformada: distInformada,
      },
    };
  }
  
  // If needs clarification
  if (validation.needsClarification && validation.clarificationQuestion) {
    console.log(`[DISTRIBUTOR_FLOW] Generic distributor, asking clarification: ${distInformada}`);
    return handleClarificationRequest(ctx, distInformada, validation.clarificationQuestion);
  }
  
  // If not attended
  if (validation.mensagemNaoAtendida) {
    console.log(`[DISTRIBUTOR_FLOW] Distributor NOT attended: ${distInformada}`);
    return handleNotAttendedRejection(ctx, distInformada, validation.mensagemNaoAtendida);
  }
  
  return { handled: false };
}

/**
 * Handle clarification response (user confirming which NEOENERGIA/CPFL)
 */
export async function handleDistributorClarificationResponse(
  ctx: DistributorValidationContext
): Promise<DistributorValidationResult> {
  const { 
    supabase, 
    conversaId, 
    phone, 
    messageText, 
    existingDados, 
    extractedData,
    conversa,
    sendMessage 
  } = ctx;
  
  // Only process if we're waiting for clarification
  if (!existingDados.distribuidoraClarificacao || extractedData.distribuidora) {
    return { handled: false };
  }
  
  const lowerMessage = messageText.toLowerCase();
  const distInformada = existingDados.distribuidoraInformada?.toUpperCase();
  
  // Check for confirmation
  const isCoelbaConfirmed = lowerMessage.includes('sim') || lowerMessage.includes('essa') || 
                            lowerMessage.includes('coelba') || lowerMessage.includes('bahia') ||
                            lowerMessage.includes('é essa') || lowerMessage.includes('isso');
  const isPaulistaConfirmed = lowerMessage.includes('sim') || lowerMessage.includes('essa') || 
                              lowerMessage.includes('paulista') || lowerMessage.includes('são paulo') ||
                              lowerMessage.includes('é essa') || lowerMessage.includes('isso');
  
  if (distInformada === 'NEOENERGIA' && isCoelbaConfirmed) {
    console.log('[DISTRIBUTOR_FLOW] User confirmed Neoenergia Coelba');
    return {
      handled: true,
      extractedDataUpdates: {
        distribuidora: 'NEOENERGIA COELBA',
        distribuidoraClarificacao: false,
      },
    };
  }
  
  if (distInformada === 'CPFL' && isPaulistaConfirmed) {
    console.log('[DISTRIBUTOR_FLOW] User confirmed CPFL Paulista');
    return {
      handled: true,
      extractedDataUpdates: {
        distribuidora: 'CPFL PAULISTA',
        distribuidoraClarificacao: false,
      },
    };
  }
  
  // Check for non-attended regions
  const isNonAttendedRegion = 
    (distInformada === 'NEOENERGIA' && NON_ATTENDED_NEOENERGIA.some(r => lowerMessage.includes(r))) ||
    (distInformada === 'CPFL' && NON_ATTENDED_CPFL.some(r => lowerMessage.includes(r))) ||
    lowerMessage.includes('não') || lowerMessage.includes('nao') || lowerMessage.includes('outra');
  
  if (!isNonAttendedRegion) {
    // Unclear response, continue waiting
    console.log('[DISTRIBUTOR_FLOW] Clarification response unclear, continuing');
    return { handled: false };
  }
  
  // User indicated non-attended region
  const distName = existingDados.distribuidoraInformada || 'a sua distribuidora';
  const rejectionMessage = `Hmm... Sentimos muito, mas ainda não atendemos a sua região. 😔

A *${distName}* está no nosso plano de expansão e, em breve, estaremos por aí!

Posso salvar seu contato e te chamar quando iniciarmos as operações na sua área? 📋`;
  
  await sendMessage(phone, rejectionMessage);
  
  await supabase.from('chatbot_mensagens').insert({
    conversa_id: conversaId,
    role: 'assistant',
    content: rejectionMessage,
  });
  
  // Move lead to Concessionária Não Atendida (UC_56ZLAR)
  let stageId = 'UC_56ZLAR';
  const bitrixLeadId = conversa?.bitrix24_lead_id;
  if (bitrixLeadId) {
    const result = await moveLeadToConcessionariaNaoAtendida(supabase, bitrixLeadId, distName);
    stageId = result.stageId;
  }
  
  await supabase
    .from('chatbot_conversas')
    .update({
      // CRITICAL FIX: Merge with existingDados to prevent data loss
      dados_coletados: { 
        ...existingDados,
        ...extractedData, 
        distribuidoraNaoAtendida: true,
        distribuidoraClarificacao: false,
        motivoDescarte: 'distribuidora_nao_atendida',
      },
      sofia_mode: 'descartado',
      bitrix24_stage: stageId, // UC_56ZLAR, not JUNK
      ended_at: new Date().toISOString(),
      awaiting_response: false,
      nudge_count: 0,
      next_nudge_at: null,
      next_followup_at: null,
      next_rescue_at: null,
      next_contract_nudge_at: null,
      last_message_at: new Date().toISOString(),
    })
    .eq('id', conversaId);
  
  return {
    handled: true,
    response: {
      success: true,
      message: 'Region not attended after clarification, lead moved to Concessionária Não Atendida',
    },
  };
}
