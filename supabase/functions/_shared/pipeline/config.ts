/**
 * SOFIA PIPELINE 2.0 - CONFIGURATION LOADER
 * 
 * Carrega configurações dinâmicas do banco de dados
 * para controlar o comportamento do pipeline
 * 
 * INTEGRADO COM UNIFIED CONFIG LOADER:
 * - Prioridade 1: agent_configurations (override por agente)
 * - Prioridade 2: configuracoes_sistema (global/fallback)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { PipelineConfig } from "./types.ts";
import { getUnifiedConfigLoader, type UnifiedConfig } from "../unified-config-loader.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Cache de configuração (5 minutos)
let configCache: PipelineConfig | null = null;
let configCacheTime = 0;
const CONFIG_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Carrega as configurações do Pipeline do banco de dados
 */
export async function loadPipelineConfig(): Promise<PipelineConfig> {
  const now = Date.now();
  
  if (configCache && (now - configCacheTime) < CONFIG_CACHE_TTL_MS) {
    return configCache;
  }
  
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  const { data: configs } = await supabase
    .from("configuracoes_sistema")
    .select("chave, valor")
    .in("chave", [
      "pipeline_v2_enabled",
      "pipeline_v2_rollout_percentage",
      "pipeline_v2_test_phones",
      "pipeline_memory_ttl_hours",
      "pipeline_max_facts_per_conversation",
      "pipeline_rag_enabled",
      "pipeline_learning_enabled",
      "pipeline_debug_mode"
    ]);
  
  const configMap = new Map<string, string>();
  configs?.forEach(c => configMap.set(c.chave, c.valor));
  
  const getConfig = (key: string, defaultValue: string): string => 
    configMap.get(key) ?? defaultValue;
  
  const parseTestPhones = (value: string): string[] => {
    try {
      return JSON.parse(value);
    } catch {
      return [];
    }
  };
  
  configCache = {
    enabled: getConfig("pipeline_v2_enabled", "false") === "true",
    rolloutPercentage: parseInt(getConfig("pipeline_v2_rollout_percentage", "0"), 10),
    testPhones: parseTestPhones(getConfig("pipeline_v2_test_phones", "[]")),
    memoryTtlHours: parseInt(getConfig("pipeline_memory_ttl_hours", "168"), 10),
    maxFactsPerConversation: parseInt(getConfig("pipeline_max_facts_per_conversation", "100"), 10),
    ragEnabled: getConfig("pipeline_rag_enabled", "true") === "true",
    learningEnabled: getConfig("pipeline_learning_enabled", "true") === "true",
    debugMode: getConfig("pipeline_debug_mode", "false") === "true"
  };
  
  configCacheTime = now;
  
  return configCache;
}

// ============================================
// UNIFIED CONFIG - AGENT-SPECIFIC WITH GLOBAL FALLBACK
// ============================================

// Cache for unified config per agent
const unifiedConfigCache = new Map<string, { config: UnifiedConfig; time: number }>();

/**
 * Load unified config for an agent (agent overrides + global fallback)
 */
export async function loadUnifiedPipelineConfig(agentId: string): Promise<UnifiedConfig> {
  const now = Date.now();
  const cached = unifiedConfigCache.get(agentId);
  
  if (cached && (now - cached.time) < CONFIG_CACHE_TTL_MS) {
    return cached.config;
  }
  
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const loader = getUnifiedConfigLoader(supabase);
  const config = await loader.loadUnifiedConfig(agentId);
  
  unifiedConfigCache.set(agentId, { config, time: now });
  
  console.log(`[Pipeline:Config] Loaded unified config for agent ${agentId}`);
  return config;
}

/**
 * Get LLM config for an agent (from unified loader)
 */
export async function getLLMConfigForAgent(agentId: string) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const loader = getUnifiedConfigLoader(supabase);
  return loader.getLLMConfig(agentId);
}

/**
 * Get pipeline config for an agent (from unified loader)
 */
export async function getPipelineConfigForAgent(agentId: string) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const loader = getUnifiedConfigLoader(supabase);
  return loader.getPipelineConfig(agentId);
}

/**
 * Check if in quiet hours for an agent (with global fallback)
 */
export async function isAgentQuietHours(agentId: string): Promise<boolean> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const loader = getUnifiedConfigLoader(supabase);
  return loader.isQuietHours(agentId);
}

/**
 * Determina se uma conversa deve usar o Pipeline v2
 */
export async function shouldUsePipelineV2(phone: string): Promise<boolean> {
  const config = await loadPipelineConfig();
  
  // Pipeline desabilitado globalmente
  if (!config.enabled) {
    return false;
  }
  
  // Se rollout é 100%, usar para TODOS (fix para garantir ativação)
  if (config.rolloutPercentage >= 100) {
    console.log(`[Pipeline] 100% rollout active, using v2 for ${phone}`);
    return true;
  }
  
  // Telefone de teste sempre usa v2
  if (config.testPhones.includes(phone)) {
    console.log(`[Pipeline] Phone ${phone} is in test list, using v2`);
    return true;
  }
  
  // Rollout gradual baseado em hash do telefone
  if (config.rolloutPercentage > 0) {
    const hash = simpleHash(phone);
    const bucket = hash % 100;
    
    if (bucket < config.rolloutPercentage) {
      console.log(`[Pipeline] Phone ${phone} in rollout bucket ${bucket}/${config.rolloutPercentage}, using v2`);
      return true;
    }
  }
  
  return false;
}

/**
 * Hash simples e determinístico para distribuição
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Limpa o cache de configuração (útil para testes)
 */
export function clearConfigCache(): void {
  configCache = null;
  configCacheTime = 0;
  unifiedConfigCache.clear();
}
