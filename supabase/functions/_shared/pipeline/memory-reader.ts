/**
 * SOFIA PIPELINE 2.0 - MEMORY READER
 * 
 * Módulo responsável por ler memórias persistentes:
 * - Working Memory (fatos da sessão)
 * - Rule Memory (regras e restrições)
 * - Interaction Patterns (padrões de comportamento)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { 
  WorkingMemoryItem, 
  RuleMemoryItem, 
  ClientProfile,
  RAGContextItem,
  FunnelState,
  MemoryType,
  RuleType
} from "./types.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ============================================
// WORKING MEMORY READER
// ============================================

/**
 * Carrega todos os itens de working memory de uma conversa
 * Filtra por validade (valid_until) e ordena por recência
 */
export async function loadWorkingMemory(
  conversaId: string,
  memoryTypes?: MemoryType[]
): Promise<WorkingMemoryItem[]> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  try {
    let query = supabase
      .from("working_memory")
      .select("*")
      .eq("conversa_id", conversaId)
      .or(`valid_until.is.null,valid_until.gt.${new Date().toISOString()}`)
      .order("created_at", { ascending: false });
    
    if (memoryTypes && memoryTypes.length > 0) {
      query = query.in("memory_type", memoryTypes);
    }
    
    const { data, error } = await query.limit(100);
    
    if (error) {
      console.error("[MemoryReader] Error loading working memory:", error);
      return [];
    }
    
    return (data || []).map(row => ({
      id: row.id,
      conversaId: row.conversa_id,
      memoryType: row.memory_type as MemoryType,
      key: row.key,
      value: row.value,
      confidence: row.confidence || 1.0,
      source: row.source || 'system',
      validUntil: row.valid_until ? new Date(row.valid_until) : undefined,
      turnNumber: row.turn_number || 0,
      createdAt: new Date(row.created_at)
    }));
  } catch (err) {
    console.error("[MemoryReader] Exception loading working memory:", err);
    return [];
  }
}

/**
 * Busca um fato específico na working memory
 */
export async function getMemoryFact(
  conversaId: string,
  key: string
): Promise<unknown | null> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  const { data, error } = await supabase
    .from("working_memory")
    .select("value, confidence")
    .eq("conversa_id", conversaId)
    .eq("key", key)
    .or(`valid_until.is.null,valid_until.gt.${new Date().toISOString()}`)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  
  if (error || !data) return null;
  return data.value;
}

/**
 * Carrega working memory de um telefone (cross-conversation)
 * Útil para lembrar dados do cliente entre conversas
 */
export async function loadWorkingMemoryByPhone(
  phone: string,
  memoryTypes?: MemoryType[]
): Promise<WorkingMemoryItem[]> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  try {
    // Primeiro, buscar conversas deste telefone
    const { data: conversas } = await supabase
      .from("chatbot_conversas")
      .select("id")
      .eq("cliente_telefone", phone)
      .order("created_at", { ascending: false })
      .limit(10);
    
    if (!conversas || conversas.length === 0) return [];
    
    const conversaIds = conversas.map(c => c.id);
    
    let query = supabase
      .from("working_memory")
      .select("*")
      .in("conversa_id", conversaIds)
      .or(`valid_until.is.null,valid_until.gt.${new Date().toISOString()}`)
      .order("created_at", { ascending: false });
    
    if (memoryTypes && memoryTypes.length > 0) {
      query = query.in("memory_type", memoryTypes);
    }
    
    const { data, error } = await query.limit(50);
    
    if (error) return [];
    
    // Deduplica por key, mantendo o mais recente
    const seenKeys = new Set<string>();
    const deduplicated: WorkingMemoryItem[] = [];
    
    for (const row of data || []) {
      if (!seenKeys.has(row.key)) {
        seenKeys.add(row.key);
        deduplicated.push({
          id: row.id,
          conversaId: row.conversa_id,
          memoryType: row.memory_type as MemoryType,
          key: row.key,
          value: row.value,
          confidence: row.confidence || 1.0,
          source: row.source || 'system',
          validUntil: row.valid_until ? new Date(row.valid_until) : undefined,
          turnNumber: row.turn_number || 0,
          createdAt: new Date(row.created_at)
        });
      }
    }
    
    return deduplicated;
  } catch (err) {
    console.error("[MemoryReader] Exception loading memory by phone:", err);
    return [];
  }
}

// ============================================
// RULE MEMORY READER
// ============================================

/**
 * Carrega regras ativas para um agente
 * Ordena por prioridade (maior primeiro)
 */
export async function loadRuleMemory(
  agentId: string,
  ruleTypes?: RuleType[]
): Promise<RuleMemoryItem[]> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  try {
    let query = supabase
      .from("rule_memory")
      .select("*")
      .eq("agent_id", agentId)
      .eq("is_active", true)
      .order("priority", { ascending: false });
    
    if (ruleTypes && ruleTypes.length > 0) {
      query = query.in("rule_type", ruleTypes);
    }
    
    const { data, error } = await query.limit(50);
    
    if (error) {
      console.error("[MemoryReader] Error loading rule memory:", error);
      return [];
    }
    
    return (data || []).map(row => ({
      id: row.id,
      agentId: row.agent_id,
      ruleType: row.rule_type as RuleType,
      name: row.name,
      description: row.description,
      conditions: row.conditions || [],
      actions: row.actions || [],
      priority: row.priority || 0,
      isActive: row.is_active,
      learnedFrom: row.learned_from,
      confidence: row.confidence || 1.0,
      timesApplied: row.times_applied || 0,
      lastAppliedAt: row.last_applied_at ? new Date(row.last_applied_at) : undefined
    }));
  } catch (err) {
    console.error("[MemoryReader] Exception loading rule memory:", err);
    return [];
  }
}

/**
 * Carrega regras que correspondem a condições específicas
 */
export async function loadMatchingRules(
  agentId: string,
  context: Record<string, unknown>
): Promise<RuleMemoryItem[]> {
  const allRules = await loadRuleMemory(agentId);
  
  // Filtra regras cujas condições são satisfeitas
  return allRules.filter(rule => {
    if (!rule.conditions || rule.conditions.length === 0) return true;
    
    return rule.conditions.every(condition => {
      const fieldValue = getNestedValue(context, condition.field);
      return evaluateCondition(fieldValue, condition.operator, condition.value, condition.caseSensitive);
    });
  });
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((current: unknown, key) => {
    if (current && typeof current === 'object') {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function evaluateCondition(
  fieldValue: unknown,
  operator: string,
  targetValue: unknown,
  caseSensitive?: boolean
): boolean {
  const normalize = (v: unknown): string => {
    if (v === null || v === undefined) return '';
    const str = String(v);
    return caseSensitive ? str : str.toLowerCase();
  };
  
  switch (operator) {
    case 'equals':
      return normalize(fieldValue) === normalize(targetValue);
    case 'contains':
      return normalize(fieldValue).includes(normalize(targetValue));
    case 'greater_than':
      return Number(fieldValue) > Number(targetValue);
    case 'less_than':
      return Number(fieldValue) < Number(targetValue);
    case 'exists':
      return fieldValue !== null && fieldValue !== undefined;
    case 'not_exists':
      return fieldValue === null || fieldValue === undefined;
    case 'matches_pattern':
      try {
        const regex = new RegExp(String(targetValue), caseSensitive ? '' : 'i');
        return regex.test(String(fieldValue));
      } catch {
        return false;
      }
    case 'in_list':
      if (Array.isArray(targetValue)) {
        return targetValue.some(v => normalize(v) === normalize(fieldValue));
      }
      return false;
    default:
      return false;
  }
}

// ============================================
// CLIENT PROFILE READER
// ============================================

/**
 * Carrega ou constrói o perfil do cliente
 */
export async function loadClientProfile(
  phone: string,
  conversaId?: string
): Promise<ClientProfile> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  // Perfil base
  const profile: ClientProfile = {
    phone,
    objectionHistory: [],
    currentStage: 'unknown',
    leadScore: 0,
    totalMessages: 0,
    conversationCount: 0
  };
  
  try {
    // Buscar dados da conversa atual
    if (conversaId) {
      const { data: conversa } = await supabase
        .from("chatbot_conversas")
        .select("*")
        .eq("id", conversaId)
        .single();
      
      if (conversa) {
        profile.name = conversa.cliente_nome || undefined;
        profile.email = conversa.cliente_email || undefined;
        profile.currentStage = conversa.bitrix24_stage || conversa.sofia_mode || 'unknown';
        profile.leadScore = conversa.lead_score || 0;
        profile.totalMessages = conversa.total_messages || 0;
        profile.proposalId = conversa.proposta_id || undefined;
        profile.bitrixLeadId = conversa.bitrix24_lead_id || undefined;
        profile.lastInteraction = conversa.last_message_at ? new Date(conversa.last_message_at) : undefined;
        
        // Extrair dados coletados
        const dadosColetados = conversa.dados_coletados || {};
        profile.distribuidora = dadosColetados.distribuidora;
        profile.valorFatura = dadosColetados.valor_fatura;
        profile.consumoKwh = dadosColetados.consumo_kwh;
        profile.tipoInstalacao = dadosColetados.tipo_instalacao;
        profile.cpfCnpj = dadosColetados.cpf || dadosColetados.cnpj;
        
        // Objeções detectadas
        if (conversa.detected_objection) {
          profile.objectionHistory = [conversa.detected_objection];
        }
      }
    }
    
    // Contar conversas do telefone
    const { count } = await supabase
      .from("chatbot_conversas")
      .select("id", { count: 'exact', head: true })
      .eq("cliente_telefone", phone);
    
    profile.conversationCount = count || 0;
    
    // Carregar objeções históricas da working_memory
    const objectionMemory = await loadWorkingMemoryByPhone(phone, ['objection']);
    if (objectionMemory.length > 0) {
      const historicObjections = objectionMemory
        .map(m => String(m.value))
        .filter(o => !profile.objectionHistory.includes(o));
      profile.objectionHistory = [...profile.objectionHistory, ...historicObjections];
    }
    
    // Carregar preferências
    const preferenceMemory = await loadWorkingMemoryByPhone(phone, ['preference']);
    for (const pref of preferenceMemory) {
      if (pref.key === 'preferred_tone') {
        profile.preferredTone = pref.value as 'formal' | 'informal' | 'technical';
      } else if (pref.key === 'response_speed') {
        profile.responseSpeed = pref.value as 'fast' | 'normal' | 'slow';
      }
    }
    
    return profile;
  } catch (err) {
    console.error("[MemoryReader] Exception loading client profile:", err);
    return profile;
  }
}

// ============================================
// RAG CONTEXT READER
// ============================================

/**
 * Busca contexto RAG relevante
 * Usa cache se disponível
 */
export async function loadRAGContext(
  query: string,
  agentId: string,
  categories?: string[],
  maxChunks: number = 5
): Promise<{ items: RAGContextItem[]; cacheHit: boolean }> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  // Gerar hash da query para cache
  const queryHash = await generateQueryHash(query);
  
  // Verificar cache
  const { data: cached } = await supabase
    .from("rag_cache")
    .select("chunks, created_at")
    .eq("query_hash", queryHash)
    .eq("agent_id", agentId)
    .single();
  
  if (cached) {
    const cacheAge = Date.now() - new Date(cached.created_at).getTime();
    const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos (aumentado de 2)
    
    if (cacheAge < CACHE_TTL_MS) {
      return {
        items: cached.chunks as RAGContextItem[],
        cacheHit: true
      };
    }
  }
  
  // Buscar do RAG
  try {
    const response = await supabase.functions.invoke("rag-search", {
      body: {
        query,
        agent_id: agentId,
        categories,
        max_results: maxChunks
      }
    });
    
    if (response.error) {
      console.error("[MemoryReader] RAG search error:", response.error);
      return { items: [], cacheHit: false };
    }
    
    const items: RAGContextItem[] = (response.data?.results || []).map((r: {
      chunk_id: string;
      document_id: string;
      content: string;
      category: string;
      similarity: number;
      metadata?: Record<string, unknown>;
    }) => ({
      chunkId: r.chunk_id,
      documentId: r.document_id,
      content: r.content,
      category: r.category,
      similarity: r.similarity,
      metadata: r.metadata
    }));
    
    // Salvar no cache
    if (items.length > 0) {
      await supabase
        .from("rag_cache")
        .upsert({
          query_hash: queryHash,
          agent_id: agentId,
          query_text: query.substring(0, 500),
          chunks: items,
          created_at: new Date().toISOString()
        }, { onConflict: 'query_hash,agent_id' });
    }
    
    return { items, cacheHit: false };
  } catch (err) {
    console.error("[MemoryReader] RAG search exception:", err);
    return { items: [], cacheHit: false };
  }
}

async function generateQueryHash(query: string): Promise<string> {
  const normalized = query.toLowerCase().trim().replace(/\s+/g, ' ');
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32);
}

// ============================================
// FUNNEL STATE READER
// ============================================

/**
 * Determina o estado atual do funil de vendas
 */
export async function loadFunnelState(
  conversaId: string
): Promise<FunnelState> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  const defaultState: FunnelState = {
    stage: 'unknown',
    mode: 'standard',
    hasSimulation: false,
    hasProposal: false,
    documentsReceived: [],
    documentsPending: [],
    isQualified: true
  };
  
  try {
    const { data: conversa } = await supabase
      .from("chatbot_conversas")
      .select(`
        bitrix24_stage,
        sofia_mode,
        has_simulation,
        proposta_id,
        docs_received_whatsapp,
        docs_received_page,
        dados_coletados
      `)
      .eq("id", conversaId)
      .single();
    
    if (!conversa) return defaultState;
    
    // Documentos recebidos
    const docsWhatsapp = (conversa.docs_received_whatsapp || []) as string[];
    const docsPage = (conversa.docs_received_page || []) as string[];
    const allDocs = [...new Set([...docsWhatsapp, ...docsPage])];
    
    // Documentos pendentes baseado no tipo de proposta
    const dadosColetados = conversa.dados_coletados || {};
    const isPJ = dadosColetados.cnpj || dadosColetados.tipo_cliente === 'PJ';
    
    const requiredDocs = isPJ
      ? ['fatura_energia', 'contrato_social', 'documento_representante']
      : ['fatura_energia', 'documento_identidade'];
    
    const pendingDocs = requiredDocs.filter(d => !allDocs.includes(d));
    
    // Tipo de proposta
    let proposalType: 'initial' | 'definitive' | undefined;
    if (conversa.proposta_id) {
      const { data: proposta } = await supabase
        .from("propostas_assinantes")
        .select("tipo_proposta")
        .eq("id", conversa.proposta_id)
        .single();
      
      proposalType = proposta?.tipo_proposta === 'definitiva' ? 'definitive' : 'initial';
    }
    
    // Verificar desqualificação
    const isDisqualified = conversa.sofia_mode === 'disqualified';
    const disqualReason = isDisqualified ? dadosColetados.disqualification_reason : undefined;
    
    return {
      stage: conversa.bitrix24_stage || 'unknown',
      mode: conversa.sofia_mode || 'standard',
      hasSimulation: conversa.has_simulation || false,
      hasProposal: !!conversa.proposta_id,
      proposalType,
      documentsReceived: allDocs,
      documentsPending: pendingDocs,
      isQualified: !isDisqualified,
      disqualificationReason: disqualReason
    };
  } catch (err) {
    console.error("[MemoryReader] Exception loading funnel state:", err);
    return defaultState;
  }
}

// ============================================
// CONVERSATION HISTORY READER
// ============================================

/**
 * Carrega histórico de mensagens formatado
 * Sem limite artificial - usa working_memory para resumos
 */
export async function loadConversationHistory(
  conversaId: string,
  maxMessages: number = 30
): Promise<Array<{ role: 'user' | 'assistant'; content: string; timestamp: Date }>> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  try {
    const { data, error } = await supabase
      .from("chatbot_mensagens")
      .select("role, content, created_at")
      .eq("conversa_id", conversaId)
      .order("created_at", { ascending: true })
      .limit(maxMessages);
    
    if (error) {
      console.error("[MemoryReader] Error loading conversation history:", error);
      return [];
    }
    
    return (data || []).map(msg => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content,
      timestamp: new Date(msg.created_at)
    }));
  } catch (err) {
    console.error("[MemoryReader] Exception loading conversation history:", err);
    return [];
  }
}
