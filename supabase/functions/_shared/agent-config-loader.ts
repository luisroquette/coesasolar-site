/**
 * AGENT CONFIGURATION LOADER V2
 * =============================
 * 
 * ARQUITETURA UNIFICADA DE CONFIGURAÇÕES POR AGENTE
 * 
 * Este módulo é a FONTE ÚNICA DE VERDADE para todas as configurações
 * específicas de cada agente. Substitui a fragmentação de configs
 * hardcoded em 7+ locais diferentes.
 * 
 * CARACTERÍSTICAS:
 * - Escopo: Por agente (agent_id)
 * - Validação: Zod schemas tipados
 * - Secrets: Referências a Lovable Secrets (nunca valores diretos)
 * - Cache: 5 minutos com invalidação por agent_id
 * - Fallbacks: Defaults tipados por namespace
 * 
 * @module _shared/agent-config-loader
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

// ═══════════════════════════════════════════════════════════════
// ZOD SCHEMAS - VALIDATION LAYER
// ═══════════════════════════════════════════════════════════════

/**
 * Nudge Configuration Schema
 */
export const NudgeConfigSchema = z.object({
  documento_delay_1_hours: z.number().min(1).max(168).default(2),
  documento_delay_2_hours: z.number().min(1).max(168).default(6),
  documento_delay_3_hours: z.number().min(1).max(168).default(24),
  contrato_delay_1_hours: z.number().min(1).max(168).default(4),
  contrato_delay_2_hours: z.number().min(1).max(168).default(24),
  contrato_delay_3_hours: z.number().min(1).max(168).default(48),
  max_attempts: z.number().min(1).max(10).default(3),
  cooldown_minutes: z.number().min(5).max(1440).default(60),
});

/**
 * Quiet Hours Configuration Schema
 */
export const QuietHoursConfigSchema = z.object({
  enabled: z.boolean().default(true),
  start_hour: z.number().min(0).max(23).default(20),
  end_hour: z.number().min(0).max(23).default(8),
  timezone: z.string().default('America/Sao_Paulo'),
  weekend_enabled: z.boolean().default(true),
});

/**
 * LLM Configuration Schema
 */
export const LLMConfigSchema = z.object({
  model: z.string().default('google/gemini-2.5-flash'),
  temperature: z.number().min(0).max(2).default(0.7),
  max_tokens: z.number().min(100).max(8000).default(1024),
  fallback_model: z.string().default('google/gemini-2.5-flash-lite'),
  cost_limit_daily_usd: z.number().min(0).default(50),
  cost_limit_monthly_usd: z.number().min(0).default(1000),
});

/**
 * Integration Configuration Schema (references to secrets)
 */
export const IntegrationConfigSchema = z.object({
  chatapp_enabled: z.boolean().default(false),
  chatapp_license_id_secret: z.string().optional(),
  chatapp_token_secret: z.string().optional(),
  zapi_enabled: z.boolean().default(false),
  zapi_instance_id_secret: z.string().optional(),
  zapi_token_secret: z.string().optional(),
  bitrix24_enabled: z.boolean().default(false),
  bitrix24_webhook_url_secret: z.string().optional(),
  bitrix24_user_id: z.string().optional(),
});

/**
 * Pipeline Configuration Schema
 */
export const PipelineConfigSchema = z.object({
  enable_fast_path: z.boolean().default(true),
  enable_triage: z.boolean().default(true),
  enable_rag: z.boolean().default(true),
  enable_guided_script: z.boolean().default(true),
  enable_rule_memory: z.boolean().default(true),
  enable_typo_correction: z.boolean().default(true),
  data_collection_timeout_minutes: z.number().min(1).max(60).default(10),
  max_field_attempts: z.number().min(1).max(10).default(3),
});

/**
 * Follow-up Configuration Schema
 */
export const FollowupConfigSchema = z.object({
  enabled: z.boolean().default(true),
  score_alto_threshold: z.number().min(0).max(100).default(80),
  score_medio_threshold: z.number().min(0).max(100).default(60),
  score_baixo_threshold: z.number().min(0).max(100).default(30),
  max_daily_followups: z.number().min(0).max(50).default(5),
  interval_hours: z.number().min(1).max(168).default(24),
});

/**
 * Proposal Defaults Configuration Schema
 */
export const ProposalDefaultsConfigSchema = z.object({
  cip_default: z.number().min(0).max(200).default(25),
  desconto_default: z.number().min(0).max(50).default(25),
  fidelidade_meses_default: z.number().min(0).max(120).default(36),
  consumo_kwh_default: z.number().min(0).max(50000).default(500),
  unlock_threshold_kwh: z.number().min(0).max(100000).default(3000),
  unlock_desconto: z.number().min(0).max(50).default(30),
  unlock_fidelidade_anos: z.number().min(1).max(10).default(4),
});

/**
 * Anti-Spam Configuration Schema
 */
export const AntiSpamConfigSchema = z.object({
  rate_limit_per_minute: z.number().min(1).max(100).default(30),
  rate_limit_global_per_minute: z.number().min(10).max(1000).default(500),
  duplicate_window_seconds: z.number().min(1).max(300).default(30),
  fallback_cooldown_minutes: z.number().min(5).max(1440).default(60),
  max_fallbacks_per_day: z.number().min(0).max(10).default(1),
});

// Combine all namespace schemas
export const AgentConfigSchemas = {
  nudges: NudgeConfigSchema,
  quiet_hours: QuietHoursConfigSchema,
  llm: LLMConfigSchema,
  integrations: IntegrationConfigSchema,
  pipeline: PipelineConfigSchema,
  followup: FollowupConfigSchema,
  proposal_defaults: ProposalDefaultsConfigSchema,
  anti_spam: AntiSpamConfigSchema,
} as const;

export type ConfigNamespace = keyof typeof AgentConfigSchemas;

// Inferred types from schemas
export type NudgeConfig = z.infer<typeof NudgeConfigSchema>;
export type QuietHoursConfig = z.infer<typeof QuietHoursConfigSchema>;
export type LLMConfig = z.infer<typeof LLMConfigSchema>;
export type IntegrationConfig = z.infer<typeof IntegrationConfigSchema>;
export type PipelineConfig = z.infer<typeof PipelineConfigSchema>;
export type FollowupConfig = z.infer<typeof FollowupConfigSchema>;
export type ProposalDefaultsConfig = z.infer<typeof ProposalDefaultsConfigSchema>;
export type AntiSpamConfig = z.infer<typeof AntiSpamConfigSchema>;

// Full agent config type
export interface AgentFullConfig {
  nudges: NudgeConfig;
  quiet_hours: QuietHoursConfig;
  llm: LLMConfig;
  integrations: IntegrationConfig;
  pipeline: PipelineConfig;
  followup: FollowupConfig;
  proposal_defaults: ProposalDefaultsConfig;
  anti_spam: AntiSpamConfig;
}

// ═══════════════════════════════════════════════════════════════
// DEFAULT VALUES
// ═══════════════════════════════════════════════════════════════

const DEFAULT_CONFIGS: AgentFullConfig = {
  nudges: NudgeConfigSchema.parse({}),
  quiet_hours: QuietHoursConfigSchema.parse({}),
  llm: LLMConfigSchema.parse({}),
  integrations: IntegrationConfigSchema.parse({}),
  pipeline: PipelineConfigSchema.parse({}),
  followup: FollowupConfigSchema.parse({}),
  proposal_defaults: ProposalDefaultsConfigSchema.parse({}),
  anti_spam: AntiSpamConfigSchema.parse({}),
};

// ═══════════════════════════════════════════════════════════════
// CACHE LAYER
// ═══════════════════════════════════════════════════════════════

interface CacheEntry {
  config: Partial<AgentFullConfig>;
  timestamp: number;
}

const agentConfigCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const LOG_PREFIX = '[AGENT_CONFIG]';

// ═══════════════════════════════════════════════════════════════
// LOADER CLASS
// ═══════════════════════════════════════════════════════════════

export class AgentConfigLoader {
  private supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  /**
   * Load all configurations for an agent
   */
  async loadFullConfig(agentId: string): Promise<AgentFullConfig> {
    // Check cache
    const cached = agentConfigCache.get(agentId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      console.log(`${LOG_PREFIX} Cache hit for agent ${agentId}`);
      return this.mergeWithDefaults(cached.config);
    }

    try {
      const { data, error } = await this.supabase
        .from('agent_configurations')
        .select('config_namespace, config_key, config_value, value_type')
        .eq('agent_id', agentId);

      if (error) {
        console.error(`${LOG_PREFIX} Error loading configs for ${agentId}:`, error);
        return DEFAULT_CONFIGS;
      }

      // Group by namespace
      const configByNamespace: Record<string, Record<string, unknown>> = {};
      
      for (const row of data || []) {
        if (!configByNamespace[row.config_namespace]) {
          configByNamespace[row.config_namespace] = {};
        }
        configByNamespace[row.config_namespace][row.config_key] = this.parseValue(
          row.config_value,
          row.value_type
        );
      }

      // Validate each namespace with Zod
      const validatedConfig: Partial<AgentFullConfig> = {};
      
      for (const [namespace, values] of Object.entries(configByNamespace)) {
        if (namespace in AgentConfigSchemas) {
          const schema = AgentConfigSchemas[namespace as ConfigNamespace];
          const result = schema.safeParse(values);
          
          if (result.success) {
            // @ts-ignore - dynamic assignment
            validatedConfig[namespace as ConfigNamespace] = result.data;
          } else {
            console.warn(`${LOG_PREFIX} Validation failed for ${namespace}:`, result.error.issues);
          }
        }
      }

      // Update cache
      agentConfigCache.set(agentId, {
        config: validatedConfig,
        timestamp: Date.now(),
      });

      console.log(`${LOG_PREFIX} Loaded ${Object.keys(validatedConfig).length} namespaces for agent ${agentId}`);
      return this.mergeWithDefaults(validatedConfig);

    } catch (err) {
      console.error(`${LOG_PREFIX} Exception loading configs:`, err);
      return DEFAULT_CONFIGS;
    }
  }

  /**
   * Load a specific namespace config
   */
  async loadNamespace<T extends ConfigNamespace>(
    agentId: string,
    namespace: T
  ): Promise<AgentFullConfig[T]> {
    const fullConfig = await this.loadFullConfig(agentId);
    return fullConfig[namespace];
  }

  /**
   * Get nudge config for agent
   */
  async getNudgeConfig(agentId: string): Promise<NudgeConfig> {
    return this.loadNamespace(agentId, 'nudges');
  }

  /**
   * Get quiet hours config for agent
   */
  async getQuietHoursConfig(agentId: string): Promise<QuietHoursConfig> {
    return this.loadNamespace(agentId, 'quiet_hours');
  }

  /**
   * Get LLM config for agent
   */
  async getLLMConfig(agentId: string): Promise<LLMConfig> {
    return this.loadNamespace(agentId, 'llm');
  }

  /**
   * Get integration config for agent
   */
  async getIntegrationConfig(agentId: string): Promise<IntegrationConfig> {
    return this.loadNamespace(agentId, 'integrations');
  }

  /**
   * Get pipeline config for agent
   */
  async getPipelineConfig(agentId: string): Promise<PipelineConfig> {
    return this.loadNamespace(agentId, 'pipeline');
  }

  /**
   * Get follow-up config for agent
   */
  async getFollowupConfig(agentId: string): Promise<FollowupConfig> {
    return this.loadNamespace(agentId, 'followup');
  }

  /**
   * Get proposal defaults for agent
   */
  async getProposalDefaults(agentId: string): Promise<ProposalDefaultsConfig> {
    return this.loadNamespace(agentId, 'proposal_defaults');
  }

  /**
   * Get anti-spam config for agent
   */
  async getAntiSpamConfig(agentId: string): Promise<AntiSpamConfig> {
    return this.loadNamespace(agentId, 'anti_spam');
  }

  /**
   * Check if we're in quiet hours for agent
   */
  async isQuietHours(agentId: string): Promise<boolean> {
    const config = await this.getQuietHoursConfig(agentId);
    
    if (!config.enabled) return false;

    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    if (isWeekend && config.weekend_enabled) {
      return true;
    }

    // Handle overnight quiet hours (e.g., 20:00 - 08:00)
    if (config.start_hour > config.end_hour) {
      return hour >= config.start_hour || hour < config.end_hour;
    } else {
      return hour >= config.start_hour && hour < config.end_hour;
    }
  }

  /**
   * Parse config value based on type
   */
  private parseValue(value: unknown, valueType: string): unknown {
    if (value === null || value === undefined) return undefined;
    
    switch (valueType) {
      case 'number':
        return typeof value === 'number' ? value : parseFloat(String(value));
      case 'boolean':
        return typeof value === 'boolean' ? value : value === 'true' || value === true;
      case 'json':
      case 'array':
        return value;
      default:
        return String(value);
    }
  }

  /**
   * Merge loaded config with defaults
   */
  private mergeWithDefaults(loaded: Partial<AgentFullConfig>): AgentFullConfig {
    return {
      nudges: { ...DEFAULT_CONFIGS.nudges, ...loaded.nudges },
      quiet_hours: { ...DEFAULT_CONFIGS.quiet_hours, ...loaded.quiet_hours },
      llm: { ...DEFAULT_CONFIGS.llm, ...loaded.llm },
      integrations: { ...DEFAULT_CONFIGS.integrations, ...loaded.integrations },
      pipeline: { ...DEFAULT_CONFIGS.pipeline, ...loaded.pipeline },
      followup: { ...DEFAULT_CONFIGS.followup, ...loaded.followup },
      proposal_defaults: { ...DEFAULT_CONFIGS.proposal_defaults, ...loaded.proposal_defaults },
      anti_spam: { ...DEFAULT_CONFIGS.anti_spam, ...loaded.anti_spam },
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// SINGLETON & CONVENIENCE FUNCTIONS
// ═══════════════════════════════════════════════════════════════

let loaderInstance: AgentConfigLoader | null = null;

/**
 * Get or create loader instance
 */
export function getAgentConfigLoader(supabase: SupabaseClient): AgentConfigLoader {
  if (!loaderInstance) {
    loaderInstance = new AgentConfigLoader(supabase);
  }
  return loaderInstance;
}

/**
 * Create fresh loader instance
 */
export function createAgentConfigLoader(supabase: SupabaseClient): AgentConfigLoader {
  return new AgentConfigLoader(supabase);
}

/**
 * Clear cache for a specific agent
 */
export function clearAgentConfigCache(agentId?: string): void {
  if (agentId) {
    agentConfigCache.delete(agentId);
  } else {
    agentConfigCache.clear();
  }
}

/**
 * Get default config (for fallback scenarios)
 */
export function getDefaultAgentConfig(): AgentFullConfig {
  return { ...DEFAULT_CONFIGS };
}

// ═══════════════════════════════════════════════════════════════
// QUICK ACCESS FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Quick load full agent config
 */
export async function loadAgentConfig(
  supabase: SupabaseClient,
  agentId: string
): Promise<AgentFullConfig> {
  const loader = getAgentConfigLoader(supabase);
  return loader.loadFullConfig(agentId);
}

/**
 * Quick check quiet hours
 */
export async function isAgentInQuietHours(
  supabase: SupabaseClient,
  agentId: string
): Promise<boolean> {
  const loader = getAgentConfigLoader(supabase);
  return loader.isQuietHours(agentId);
}

/**
 * Quick get nudge delays (in milliseconds)
 */
export async function getAgentNudgeDelays(
  supabase: SupabaseClient,
  agentId: string
): Promise<{ doc1: number; doc2: number; doc3: number; contract1: number; contract2: number; contract3: number }> {
  const loader = getAgentConfigLoader(supabase);
  const config = await loader.getNudgeConfig(agentId);
  
  const hoursToMs = (hours: number) => hours * 60 * 60 * 1000;
  
  return {
    doc1: hoursToMs(config.documento_delay_1_hours),
    doc2: hoursToMs(config.documento_delay_2_hours),
    doc3: hoursToMs(config.documento_delay_3_hours),
    contract1: hoursToMs(config.contrato_delay_1_hours),
    contract2: hoursToMs(config.contrato_delay_2_hours),
    contract3: hoursToMs(config.contrato_delay_3_hours),
  };
}
