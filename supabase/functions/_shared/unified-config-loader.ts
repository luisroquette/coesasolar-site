/**
 * UNIFIED CONFIGURATION LOADER
 * ============================
 * 
 * ARQUITETURA HIERÁRQUICA DE CONFIGURAÇÕES
 * 
 * Este módulo implementa a estratégia de "duas camadas":
 * 
 * 1. AGENT LAYER (override): Configurações específicas por agente
 *    - Fonte: tabela `agent_configurations`
 *    - Escopo: Por agent_id
 *    - Prioridade: ALTA (sobrescreve global)
 * 
 * 2. GLOBAL LAYER (fallback): Configurações globais/white-label
 *    - Fonte: tabela `configuracoes_sistema`
 *    - Escopo: Sistema inteiro
 *    - Prioridade: BAIXA (usado se agent não define)
 * 
 * FLUXO DE RESOLUÇÃO:
 * ───────────────────
 * getConfig(agentId, key) → 
 *   1. Busca em agent_configurations[agentId][key]
 *   2. Se não encontrar → busca em configuracoes_sistema[key]
 *   3. Se não encontrar → usa default hardcoded
 * 
 * @module _shared/unified-config-loader
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { 
  AgentConfigLoader,
  AgentFullConfig,
  ConfigNamespace,
  getDefaultAgentConfig,
  clearAgentConfigCache,
} from './agent-config-loader.ts';
import { 
  loadSystemConfig, 
  loadRawConfig,
  getConfigValue,
  getConfigNumber,
  getConfigFloat,
  getConfigBool,
  SystemConfig,
  clearRawConfigCache,
} from './config-loader.ts';

// ═══════════════════════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════

export interface UnifiedConfig {
  /** Global system config (white-label, company data) */
  global: SystemConfig;
  /** Agent-specific overrides */
  agent: AgentFullConfig;
  /** Resolved agent ID used for lookup */
  agentId: string;
}

export interface ConfigResolution {
  value: unknown;
  source: 'agent' | 'global' | 'default';
  key: string;
}

// ═══════════════════════════════════════════════════════════════
// MAPPING: Agent namespace keys → Global config keys
// ═══════════════════════════════════════════════════════════════

/**
 * Mapping between agent namespace.key and global configuracoes_sistema.chave
 * This enables fallback from agent-specific to global when agent doesn't define a value
 */
const AGENT_TO_GLOBAL_MAP: Record<string, string> = {
  // Nudges
  'nudges.documento_delay_1_hours': 'nudge_documento_delay_1',
  'nudges.documento_delay_2_hours': 'nudge_documento_delay_2',
  'nudges.documento_delay_3_hours': 'nudge_documento_delay_3',
  'nudges.contrato_delay_1_hours': 'nudge_contrato_delay_1',
  'nudges.contrato_delay_2_hours': 'nudge_contrato_delay_2',
  'nudges.contrato_delay_3_hours': 'nudge_contrato_delay_3',
  'nudges.max_attempts': 'max_nudge_attempts',
  
  // Quiet hours
  'quiet_hours.enabled': 'quiet_hours_enabled',
  'quiet_hours.start_hour': 'quiet_hours_start',
  'quiet_hours.end_hour': 'quiet_hours_end',
  
  // Proposal defaults
  'proposal_defaults.cip_default': 'cip_default',
  'proposal_defaults.desconto_default': 'desconto_default',
  'proposal_defaults.fidelidade_meses_default': 'fidelidade_default',
  'proposal_defaults.consumo_kwh_default': 'consumo_default',
  'proposal_defaults.unlock_threshold_kwh': 'plano_unlock_threshold',
  'proposal_defaults.unlock_desconto': 'plano_unlock_desconto',
  'proposal_defaults.unlock_fidelidade_anos': 'plano_unlock_fidelidade',
  
  // Follow-up
  'followup.score_alto_threshold': 'followup_score_alto',
  'followup.score_medio_threshold': 'followup_score_medio',
  'followup.score_baixo_threshold': 'followup_score_baixo',
  
  // Integrations
  'integrations.bitrix24_enabled': 'bitrix24_enabled',
};

// Reverse map for global → agent lookups
const GLOBAL_TO_AGENT_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(AGENT_TO_GLOBAL_MAP).map(([k, v]) => [v, k])
);

// ═══════════════════════════════════════════════════════════════
// UNIFIED CONFIG LOADER CLASS
// ═══════════════════════════════════════════════════════════════

const LOG_PREFIX = '[UNIFIED_CONFIG]';

export class UnifiedConfigLoader {
  private supabase: SupabaseClient;
  private agentLoader: AgentConfigLoader;
  
  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
    this.agentLoader = new AgentConfigLoader(supabase);
  }

  // ─────────────────────────────────────────────────────────────
  // MAIN LOADING METHODS
  // ─────────────────────────────────────────────────────────────

  /**
   * Load complete unified config for an agent
   * Returns both global and agent-specific configs merged
   */
  async loadUnifiedConfig(agentId: string): Promise<UnifiedConfig> {
    console.log(`${LOG_PREFIX} Loading unified config for agent ${agentId}`);
    
    // Load both layers in parallel
    const [globalConfig, agentConfig] = await Promise.all([
      loadSystemConfig(this.supabase),
      this.agentLoader.loadFullConfig(agentId),
    ]);

    console.log(`${LOG_PREFIX} Unified config loaded: global + agent overrides`);

    return {
      global: globalConfig,
      agent: agentConfig,
      agentId,
    };
  }

  /**
   * Get a specific value with automatic layer resolution
   * Checks agent first, then falls back to global
   * 
   * @param agentId - Agent ID for lookup
   * @param agentKey - Key in format "namespace.key" (e.g., "nudges.max_attempts")
   * @param defaultValue - Fallback if neither layer has the value
   */
  async getValue<T>(
    agentId: string,
    agentKey: string,
    defaultValue: T
  ): Promise<ConfigResolution & { value: T }> {
    // Try agent layer first
    const agentValue = await this.getAgentValue(agentId, agentKey);
    if (agentValue !== undefined) {
      return {
        value: agentValue as T,
        source: 'agent',
        key: agentKey,
      };
    }

    // Try global layer (using mapping)
    const globalKey = AGENT_TO_GLOBAL_MAP[agentKey];
    if (globalKey) {
      const rawConfig = await loadRawConfig(this.supabase);
      const globalValue = getConfigValue(globalKey, '', rawConfig);
      if (globalValue !== '') {
        return {
          value: this.parseTypedValue(globalValue, defaultValue) as T,
          source: 'global',
          key: globalKey,
        };
      }
    }

    // Return default
    return {
      value: defaultValue,
      source: 'default',
      key: agentKey,
    };
  }

  /**
   * Get a number value with layer resolution
   */
  async getNumber(
    agentId: string,
    agentKey: string,
    defaultValue: number
  ): Promise<number> {
    const result = await this.getValue(agentId, agentKey, defaultValue);
    return typeof result.value === 'number' ? result.value : defaultValue;
  }

  /**
   * Get a boolean value with layer resolution
   */
  async getBoolean(
    agentId: string,
    agentKey: string,
    defaultValue: boolean
  ): Promise<boolean> {
    const result = await this.getValue(agentId, agentKey, defaultValue);
    return typeof result.value === 'boolean' ? result.value : defaultValue;
  }

  /**
   * Get a string value with layer resolution
   */
  async getString(
    agentId: string,
    agentKey: string,
    defaultValue: string
  ): Promise<string> {
    const result = await this.getValue(agentId, agentKey, defaultValue);
    return typeof result.value === 'string' ? result.value : defaultValue;
  }

  // ─────────────────────────────────────────────────────────────
  // CONVENIENCE METHODS FOR COMMON CONFIG PATTERNS
  // ─────────────────────────────────────────────────────────────

  /**
   * Get nudge delays for an agent (with global fallback)
   * Returns delays in milliseconds
   */
  async getNudgeDelays(agentId: string): Promise<{
    doc1: number;
    doc2: number;
    doc3: number;
    contract1: number;
    contract2: number;
    contract3: number;
    maxAttempts: number;
  }> {
    const config = await this.loadUnifiedConfig(agentId);
    const nudges = config.agent.nudges;
    const global = config.global;

    const hoursToMs = (hours: number) => hours * 60 * 60 * 1000;

    return {
      doc1: hoursToMs(nudges.documento_delay_1_hours || global.nudge_documento_delay_1),
      doc2: hoursToMs(nudges.documento_delay_2_hours || global.nudge_documento_delay_2),
      doc3: hoursToMs(nudges.documento_delay_3_hours || global.nudge_documento_delay_3),
      contract1: hoursToMs(nudges.contrato_delay_1_hours || global.nudge_contrato_delay_1),
      contract2: hoursToMs(nudges.contrato_delay_2_hours || global.nudge_contrato_delay_2),
      contract3: hoursToMs(nudges.contrato_delay_3_hours || global.nudge_contrato_delay_3),
      maxAttempts: nudges.max_attempts || global.max_nudge_attempts,
    };
  }

  /**
   * Check if agent is in quiet hours (with global fallback)
   */
  async isQuietHours(agentId: string): Promise<boolean> {
    const config = await this.loadUnifiedConfig(agentId);
    const qh = config.agent.quiet_hours;
    const global = config.global;

    const enabled = qh.enabled ?? global.quiet_hours_enabled;
    if (!enabled) return false;

    const startHour = qh.start_hour ?? global.quiet_hours_start;
    const endHour = qh.end_hour ?? global.quiet_hours_end;

    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    if (isWeekend && qh.weekend_enabled) {
      return true;
    }

    // Handle overnight quiet hours (e.g., 20:00 - 08:00)
    if (startHour > endHour) {
      return hour >= startHour || hour < endHour;
    } else {
      return hour >= startHour && hour < endHour;
    }
  }

  /**
   * Get proposal defaults for an agent (with global fallback)
   */
  async getProposalDefaults(agentId: string): Promise<{
    cip: number;
    desconto: number;
    fidelidade: number;
    consumoMedio: number;
    unlockThreshold: number;
    unlockDesconto: number;
    unlockFidelidade: number;
  }> {
    const config = await this.loadUnifiedConfig(agentId);
    const pd = config.agent.proposal_defaults;
    const global = config.global;

    return {
      cip: pd.cip_default || global.cip_default,
      desconto: pd.desconto_default || global.desconto_default,
      fidelidade: pd.fidelidade_meses_default || global.fidelidade_default,
      consumoMedio: pd.consumo_kwh_default || global.consumo_default,
      unlockThreshold: pd.unlock_threshold_kwh || global.plano_unlock_threshold,
      unlockDesconto: pd.unlock_desconto || global.plano_unlock_desconto,
      unlockFidelidade: pd.unlock_fidelidade_anos * 12 || global.plano_unlock_fidelidade * 12,
    };
  }

  /**
   * Get follow-up score thresholds (with global fallback)
   */
  async getFollowupScores(agentId: string): Promise<{
    alto: number;
    medio: number;
    baixo: number;
  }> {
    const config = await this.loadUnifiedConfig(agentId);
    const fu = config.agent.followup;
    const global = config.global;

    return {
      alto: fu.score_alto_threshold || global.followup_score_alto,
      medio: fu.score_medio_threshold || global.followup_score_medio,
      baixo: fu.score_baixo_threshold || global.followup_score_baixo,
    };
  }

  /**
   * Get LLM config for agent (agent-only, no global fallback)
   */
  async getLLMConfig(agentId: string) {
    return (await this.loadUnifiedConfig(agentId)).agent.llm;
  }

  /**
   * Get pipeline config for agent (agent-only, no global fallback)
   */
  async getPipelineConfig(agentId: string) {
    return (await this.loadUnifiedConfig(agentId)).agent.pipeline;
  }

  /**
   * Get anti-spam config for agent (agent-only, no global fallback)
   */
  async getAntiSpamConfig(agentId: string) {
    return (await this.loadUnifiedConfig(agentId)).agent.anti_spam;
  }

  /**
   * Get integration config for agent (agent-only, no global fallback)
   */
  async getIntegrationConfig(agentId: string) {
    return (await this.loadUnifiedConfig(agentId)).agent.integrations;
  }

  // ─────────────────────────────────────────────────────────────
  // GLOBAL-ONLY ACCESSORS (for white-label data)
  // ─────────────────────────────────────────────────────────────

  /**
   * Get company/white-label data (always from global)
   */
  async getCompanyData(): Promise<{
    nome: string;
    slogan: string;
    cnpj: string;
    razaoSocial: string;
    endereco: string;
    email: string;
    telefone: string;
    whatsapp: string;
    site: string;
    instagram: string;
    linkedin: string;
    facebook: string;
  }> {
    const global = await loadSystemConfig(this.supabase);
    
    return {
      nome: global.empresa_nome,
      slogan: global.empresa_slogan,
      cnpj: global.empresa_cnpj,
      razaoSocial: global.empresa_razao_social,
      endereco: global.empresa_endereco,
      email: global.email_contato,
      telefone: global.telefone_contato,
      whatsapp: global.whatsapp_numero,
      site: global.empresa_site,
      instagram: global.rede_social_instagram,
      linkedin: global.rede_social_linkedin,
      facebook: global.rede_social_facebook,
    };
  }

  /**
   * Get Bitrix24 config (global layer)
   */
  async getBitrix24Config(): Promise<{
    enabled: boolean;
    baseUrl: string;
    webhookUrl: string;
  }> {
    const global = await loadSystemConfig(this.supabase);
    
    return {
      enabled: global.bitrix24_enabled,
      baseUrl: global.bitrix24_base_url,
      webhookUrl: global.bitrix24_webhook_url,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // INTERNAL HELPERS
  // ─────────────────────────────────────────────────────────────

  /**
   * Get value from agent config by namespace.key path
   */
  private async getAgentValue(agentId: string, path: string): Promise<unknown> {
    const [namespace, key] = path.split('.') as [ConfigNamespace, string];
    
    if (!namespace || !key) return undefined;

    const config = await this.agentLoader.loadFullConfig(agentId);
    const namespaceConfig = config[namespace];
    
    if (!namespaceConfig) return undefined;
    
    // @ts-ignore - dynamic access
    return namespaceConfig[key];
  }

  /**
   * Parse a string value to match the type of defaultValue
   */
  private parseTypedValue<T>(value: string, defaultValue: T): T {
    if (typeof defaultValue === 'number') {
      const parsed = parseFloat(value);
      return (isNaN(parsed) ? defaultValue : parsed) as T;
    }
    if (typeof defaultValue === 'boolean') {
      return (value === 'true' || value === '1') as unknown as T;
    }
    return value as unknown as T;
  }
}

// ═══════════════════════════════════════════════════════════════
// SINGLETON & CONVENIENCE FUNCTIONS
// ═══════════════════════════════════════════════════════════════

let unifiedLoaderInstance: UnifiedConfigLoader | null = null;

/**
 * Get or create singleton loader instance
 */
export function getUnifiedConfigLoader(supabase: SupabaseClient): UnifiedConfigLoader {
  if (!unifiedLoaderInstance) {
    unifiedLoaderInstance = new UnifiedConfigLoader(supabase);
  }
  return unifiedLoaderInstance;
}

/**
 * Create a fresh loader instance
 */
export function createUnifiedConfigLoader(supabase: SupabaseClient): UnifiedConfigLoader {
  return new UnifiedConfigLoader(supabase);
}

/**
 * Clear all config caches (both agent and global)
 */
export function clearAllConfigCaches(agentId?: string): void {
  clearAgentConfigCache(agentId);
  clearRawConfigCache();
  console.log(`${LOG_PREFIX} All caches cleared${agentId ? ` for agent ${agentId}` : ''}`);
}

// ═══════════════════════════════════════════════════════════════
// QUICK ACCESS FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Quick load unified config
 */
export async function loadUnifiedConfig(
  supabase: SupabaseClient,
  agentId: string
): Promise<UnifiedConfig> {
  const loader = getUnifiedConfigLoader(supabase);
  return loader.loadUnifiedConfig(agentId);
}

/**
 * Quick get nudge delays with fallback
 */
export async function getUnifiedNudgeDelays(
  supabase: SupabaseClient,
  agentId: string
) {
  const loader = getUnifiedConfigLoader(supabase);
  return loader.getNudgeDelays(agentId);
}

/**
 * Quick check quiet hours with fallback
 */
export async function isUnifiedQuietHours(
  supabase: SupabaseClient,
  agentId: string
): Promise<boolean> {
  const loader = getUnifiedConfigLoader(supabase);
  return loader.isQuietHours(agentId);
}

/**
 * Quick get proposal defaults with fallback
 */
export async function getUnifiedProposalDefaults(
  supabase: SupabaseClient,
  agentId: string
) {
  const loader = getUnifiedConfigLoader(supabase);
  return loader.getProposalDefaults(agentId);
}

/**
 * Quick get company data (global only)
 */
export async function getCompanyData(supabase: SupabaseClient) {
  const loader = getUnifiedConfigLoader(supabase);
  return loader.getCompanyData();
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════

// Re-export functions from config-loader for backwards compatibility
export { 
  loadSystemConfig, 
  loadRawConfig,
  getConfigValue,
  getConfigNumber,
  getConfigFloat,
  getConfigBool,
  getRawConfigCache,
  clearRawConfigCache,
} from './config-loader.ts';

// Re-export types from underlying loaders for convenience
export type { SystemConfig } from './config-loader.ts';
export type { 
  AgentFullConfig,
  ConfigNamespace,
  NudgeConfig,
  QuietHoursConfig,
  LLMConfig,
  IntegrationConfig,
  PipelineConfig,
  FollowupConfig,
  ProposalDefaultsConfig,
  AntiSpamConfig,
} from './agent-config-loader.ts';
