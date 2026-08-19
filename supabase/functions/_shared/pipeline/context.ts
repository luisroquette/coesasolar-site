/**
 * SOFIA PIPELINE 2.0 - CONTEXT LAYER
 * 
 * Orquestra o carregamento de todo o contexto necessário
 * para o estágio de Reasoning tomar decisões informadas.
 * 
 * Responsabilidades:
 * - Carregar Working Memory (fatos da sessão)
 * - Carregar Rule Memory (regras do agente)
 * - Carregar Client Profile (perfil do cliente)
 * - Carregar RAG Context (conhecimento relevante)
 * - Carregar Funnel State (estado do funil)
 * - Carregar Conversation History (histórico de mensagens)
 */

import type { 
  IntentPayload,
  FullContext,
  WorkingMemoryItem,
  RuleMemoryItem,
  ClientProfile,
  RAGContextItem,
  FunnelState
} from "./types.ts";

import {
  loadWorkingMemory,
  loadWorkingMemoryByPhone,
  loadRuleMemory,
  loadMatchingRules,
  loadClientProfile,
  loadRAGContext,
  loadFunnelState,
  loadConversationHistory
} from "./memory-reader.ts";

import { loadPipelineConfig } from "./config.ts";

// Unified Config Loader - Agent-specific configs with global fallback
import { getUnifiedConfigLoader } from "../unified-config-loader.ts";

// ============================================
// MAIN CONTEXT LOADER
// ============================================

/**
 * Executa o Context Layer completo
 * Carrega todas as memórias e contextos em paralelo para performance
 */
export async function executeContext(
  intake: IntentPayload,
  agentId: string = 'sofia'
): Promise<FullContext> {
  const startTime = Date.now();
  const config = await loadPipelineConfig();
  
  console.log(`[Context] Loading context for ${intake.conversaId}`);
  
  // Executar carregamentos em paralelo para performance
  const [
    workingMemoryResult,
    crossConversationMemoryResult,
    ruleMemoryResult,
    clientProfileResult,
    funnelStateResult,
    conversationHistoryResult,
    ragContextResult
  ] = await Promise.all([
    // Working Memory da conversa atual
    loadWorkingMemory(intake.conversaId),
    
    // Working Memory cross-conversation (pelo telefone)
    loadWorkingMemoryByPhone(intake.phone, ['fact', 'preference']),
    
    // Regras do agente
    config.ragEnabled 
      ? loadRuleMemory(agentId)
      : Promise.resolve([]),
    
    // Perfil do cliente
    loadClientProfile(intake.phone, intake.conversaId),
    
    // Estado do funil
    loadFunnelState(intake.conversaId),
    
    // Histórico de mensagens
    loadConversationHistory(intake.conversaId, 30),
    
    // Contexto RAG (se habilitado)
    config.ragEnabled
      ? loadRAGContext(intake.rawContent, agentId)
      : Promise.resolve({ items: [], cacheHit: false })
  ]);
  
  // Mesclar working memories (conversa atual tem prioridade)
  const mergedWorkingMemory = mergeWorkingMemories(
    workingMemoryResult,
    crossConversationMemoryResult
  );
  
  // Filtrar regras que se aplicam ao contexto atual
  const contextForRules = buildRuleContext(intake, clientProfileResult, funnelStateResult);
  const activeRules = await filterActiveRules(ruleMemoryResult, contextForRules);
  
  // Enriquecer perfil com dados da intake se necessário
  const enrichedProfile = enrichClientProfile(clientProfileResult, intake);
  
  const contextDurationMs = Date.now() - startTime;
  
  console.log(`[Context] Loaded: ${mergedWorkingMemory.length} memories, ${activeRules.length} rules, ${ragContextResult.items.length} RAG chunks in ${contextDurationMs}ms`);
  
  return {
    intake,
    workingMemory: mergedWorkingMemory,
    activeRules,
    clientProfile: enrichedProfile,
    ragContext: ragContextResult.items,
    ragCacheHit: ragContextResult.cacheHit,
    funnelState: funnelStateResult,
    conversationHistory: conversationHistoryResult,
    contextLoadedAt: new Date(),
    contextDurationMs,
    memoryItemsLoaded: mergedWorkingMemory.length,
    rulesLoaded: activeRules.length
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Mescla working memories de diferentes fontes
 * Conversa atual tem prioridade sobre cross-conversation
 */
function mergeWorkingMemories(
  currentConversation: WorkingMemoryItem[],
  crossConversation: WorkingMemoryItem[]
): WorkingMemoryItem[] {
  const keySet = new Set<string>();
  const merged: WorkingMemoryItem[] = [];
  
  // Primeiro, adiciona itens da conversa atual
  for (const item of currentConversation) {
    keySet.add(item.key);
    merged.push(item);
  }
  
  // Depois, adiciona itens cross-conversation que não existem na atual
  for (const item of crossConversation) {
    if (!keySet.has(item.key)) {
      keySet.add(item.key);
      merged.push(item);
    }
  }
  
  return merged;
}

/**
 * Constrói contexto para avaliação de regras
 */
function buildRuleContext(
  intake: IntentPayload,
  clientProfile: ClientProfile,
  funnelState: FunnelState
): Record<string, unknown> {
  return {
    intent: intake.intent,
    intentConfidence: intake.intentConfidence,
    sentiment: intake.sentiment,
    urgency: intake.urgency,
    mediaType: intake.mediaType,
    entities: intake.entities,
    
    clientName: clientProfile.name,
    clientPhone: clientProfile.phone,
    clientEmail: clientProfile.email,
    distribuidora: clientProfile.distribuidora,
    valorFatura: clientProfile.valorFatura,
    consumoKwh: clientProfile.consumoKwh,
    tipoInstalacao: clientProfile.tipoInstalacao,
    leadScore: clientProfile.leadScore,
    totalMessages: clientProfile.totalMessages,
    conversationCount: clientProfile.conversationCount,
    hasObjections: clientProfile.objectionHistory.length > 0,
    
    funnelStage: funnelState.stage,
    sofiaMode: funnelState.mode,
    hasSimulation: funnelState.hasSimulation,
    hasProposal: funnelState.hasProposal,
    proposalType: funnelState.proposalType,
    isQualified: funnelState.isQualified,
    documentsReceived: funnelState.documentsReceived,
    documentsPending: funnelState.documentsPending,
    allDocsComplete: funnelState.documentsPending.length === 0
  };
}

/**
 * Filtra regras que se aplicam ao contexto atual
 */
async function filterActiveRules(
  allRules: RuleMemoryItem[],
  context: Record<string, unknown>
): Promise<RuleMemoryItem[]> {
  return allRules.filter(rule => {
    // Regras sem condições sempre se aplicam
    if (!rule.conditions || rule.conditions.length === 0) {
      return true;
    }
    
    // Avaliar cada condição
    return rule.conditions.every(condition => {
      const fieldValue = getNestedValue(context, condition.field);
      return evaluateCondition(
        fieldValue,
        condition.operator,
        condition.value,
        condition.caseSensitive
      );
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

/**
 * Enriquece o perfil do cliente com dados da intake
 */
function enrichClientProfile(
  profile: ClientProfile,
  intake: IntentPayload
): ClientProfile {
  const enriched = { ...profile };
  
  // Extrair entidades da intake para enriquecer o perfil
  for (const entity of intake.entities) {
    switch (entity.type) {
      case 'name':
        if (!enriched.name && entity.confidence > 0.7) {
          enriched.name = entity.normalized || entity.value;
        }
        break;
      case 'email':
        if (!enriched.email && entity.confidence > 0.9) {
          enriched.email = entity.normalized || entity.value;
        }
        break;
      case 'cpf':
      case 'cnpj':
        if (!enriched.cpfCnpj && entity.confidence > 0.9) {
          enriched.cpfCnpj = entity.normalized || entity.value;
        }
        break;
      case 'distributor':
        if (!enriched.distribuidora && entity.confidence > 0.7) {
          enriched.distribuidora = entity.normalized || entity.value;
        }
        break;
      case 'value':
        if (!enriched.valorFatura && entity.confidence > 0.7) {
          const valor = parseFloat(entity.value.replace(/[^\d.,]/g, '').replace(',', '.'));
          if (!isNaN(valor) && valor > 0) {
            enriched.valorFatura = valor;
          }
        }
        break;
    }
  }
  
  return enriched;
}

// ============================================
// CONTEXT UTILITIES
// ============================================

/**
 * Serializa o contexto para logging (versão resumida)
 */
export function summarizeContext(context: FullContext): Record<string, unknown> {
  return {
    intent: context.intake.intent,
    intentConfidence: context.intake.intentConfidence,
    sentiment: context.intake.sentiment,
    urgency: context.intake.urgency,
    mediaType: context.intake.mediaType,
    entitiesCount: context.intake.entities.length,
    
    memoryItemsCount: context.workingMemory.length,
    activeRulesCount: context.activeRules.length,
    ragChunksCount: context.ragContext.length,
    ragCacheHit: context.ragCacheHit,
    
    clientName: context.clientProfile.name,
    clientPhone: context.clientProfile.phone,
    distribuidora: context.clientProfile.distribuidora,
    valorFatura: context.clientProfile.valorFatura,
    leadScore: context.clientProfile.leadScore,
    
    funnelStage: context.funnelState.stage,
    sofiaMode: context.funnelState.mode,
    hasSimulation: context.funnelState.hasSimulation,
    hasProposal: context.funnelState.hasProposal,
    isQualified: context.funnelState.isQualified,
    docsReceived: context.funnelState.documentsReceived.length,
    docsPending: context.funnelState.documentsPending.length,
    
    historyMessages: context.conversationHistory.length,
    contextDurationMs: context.contextDurationMs
  };
}

/**
 * Extrai fatos da working memory como mapa chave-valor
 */
export function getFactsMap(workingMemory: WorkingMemoryItem[]): Record<string, unknown> {
  const facts: Record<string, unknown> = {};
  
  for (const item of workingMemory) {
    if (item.memoryType === 'fact') {
      facts[item.key] = item.value;
    }
  }
  
  return facts;
}

/**
 * Verifica se um fato específico existe na memória
 */
export function hasFact(workingMemory: WorkingMemoryItem[], key: string): boolean {
  return workingMemory.some(item => item.memoryType === 'fact' && item.key === key);
}

/**
 * Obtém valor de um fato específico
 */
export function getFactValue(workingMemory: WorkingMemoryItem[], key: string): unknown | undefined {
  const fact = workingMemory.find(item => item.memoryType === 'fact' && item.key === key);
  return fact?.value;
}
