// Shared config loader for Edge Functions
// Carrega configurações dinâmicas do banco de dados
// 
// ARQUITETURA UNIFICADA DE CONFIGURAÇÕES:
// ----------------------------------------
// Este módulo é a FONTE ÚNICA DE VERDADE para todas as configs do sistema.
// Para requisitos de proposta, use o módulo proposal-requirements.ts
// 
// @see proposal-requirements.ts - Campos obrigatórios para propostas
// @see config-loader.ts - Configurações gerais do sistema

// Re-export proposal requirements for convenience
export {
  loadProposalRequirements,
  getStageRequirements,
  getRequiredFieldIds,
  getRequiredFileIds,
  getMissingRequirements,
  checkRequirementsMet,
  clearRequirementsCache,
  getCachedRequirements,
  type ProposalStage,
  type RequirementType,
  type RequirementDefinition,
  type ProposalRequirements,
  type UnifiedRequirementsConfig,
} from './proposal-requirements.ts';

export interface SystemConfig {
  // Empresa - Dados básicos
  empresa_nome: string;
  empresa_slogan: string;
  empresa_domain: string;
  empresa_endereco: string;
  whatsapp_numero: string;
  email_contato: string;
  telefone_contato: string;
  
  // Empresa - Dados jurídicos
  empresa_cnpj: string;
  empresa_cnpj_consorcio: string;
  empresa_razao_social: string;
  empresa_site: string;
  email_financeiro: string;
  
  // Redes sociais
  rede_social_instagram: string;
  rede_social_linkedin: string;
  rede_social_facebook: string;
  
  // Bitrix24
  bitrix24_base_url: string;
  bitrix24_enabled: boolean;
  bitrix24_webhook_url: string;
  
  // Parâmetros técnicos
  pis_cofins_aliquota: number;
  disponibilidade_monofasico: number;
  disponibilidade_bifasico: number;
  disponibilidade_trifasico: number;
  
  // Plano UNLOCK
  plano_unlock_threshold: number;
  plano_unlock_desconto: number;
  plano_unlock_fidelidade: number;
  
  // Nudges e automação
  nudge_documento_delay_1: number;
  nudge_documento_delay_2: number;
  nudge_documento_delay_3: number;
  nudge_contrato_delay_1: number;
  nudge_contrato_delay_2: number;
  nudge_contrato_delay_3: number;
  max_nudge_attempts: number;
  
  // Quiet hours
  quiet_hours_start: number;
  quiet_hours_end: number;
  quiet_hours_enabled: boolean;
  
  // Cálculos
  multa_rescisoria_percentual: number;
  prazo_compensacao_dias: number;
  
  // Cleanup
  cleanup_audio_horas: number;
  documento_recuperacao_horas: number;
  
  // Follow-up scores
  followup_score_alto: number;
  followup_score_medio: number;
  followup_score_baixo: number;
  
  // Defaults para proposta
  cip_default: number;
  desconto_default: number;
  fidelidade_default: number;
  consumo_default: number;
}

// Valores padrão (fallback se não houver config no banco)
const DEFAULT_CONFIG: SystemConfig = {
  // Empresa - Dados básicos
  empresa_nome: 'COESA Energia Inteligente',
  empresa_slogan: 'Soluções em Energia Renovável',
  empresa_domain: '@coesaenergia.com.br',
  empresa_endereco: 'Av. Paulista, 1000, São Paulo - SP',
  whatsapp_numero: '5511999999999',
  email_contato: 'contato@coesaenergia.com.br',
  telefone_contato: '(11) 99999-9999',
  
  // Empresa - Dados jurídicos
  empresa_cnpj: '00.000.000/0001-00',
  empresa_cnpj_consorcio: '',
  empresa_razao_social: 'COESA ENERGIA LTDA',
  empresa_site: 'www.coesaenergia.com.br',
  email_financeiro: 'financeiro@coesaenergia.com.br',
  
  // Redes sociais
  rede_social_instagram: 'https://instagram.com/coesaenergia',
  rede_social_linkedin: 'https://linkedin.com/company/coesa-energia',
  rede_social_facebook: 'https://facebook.com/coesaenergia',
  
  // Bitrix24
  bitrix24_base_url: 'https://coesaenergia.bitrix24.com.br',
  bitrix24_enabled: false,
  bitrix24_webhook_url: '',
  
  // Parâmetros técnicos
  pis_cofins_aliquota: 0.0365,
  disponibilidade_monofasico: 30,
  disponibilidade_bifasico: 50,
  disponibilidade_trifasico: 100,
  
  // Plano UNLOCK
  plano_unlock_threshold: 3000,
  plano_unlock_desconto: 30,
  plano_unlock_fidelidade: 4,
  
  // Nudges
  nudge_documento_delay_1: 2,
  nudge_documento_delay_2: 6,
  nudge_documento_delay_3: 24,
  nudge_contrato_delay_1: 4,
  nudge_contrato_delay_2: 24,
  nudge_contrato_delay_3: 48,
  max_nudge_attempts: 3,
  
  // Quiet hours
  quiet_hours_start: 20,
  quiet_hours_end: 8,
  quiet_hours_enabled: true,
  
  // Cálculos
  multa_rescisoria_percentual: 20,
  prazo_compensacao_dias: 90,
  
  // Cleanup
  cleanup_audio_horas: 24,
  documento_recuperacao_horas: 48,
  
  // Follow-up scores
  followup_score_alto: 80,
  followup_score_medio: 60,
  followup_score_baixo: 30,
  
  // Defaults
  cip_default: 25,
  desconto_default: 25,
  fidelidade_default: 36,
  consumo_default: 500,
};

// Cache simples
let cachedConfig: SystemConfig | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

export async function loadSystemConfig(supabase: any): Promise<SystemConfig> {
  // Verificar cache
  if (cachedConfig && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedConfig;
  }
  
  try {
    const { data, error } = await supabase
      .from('configuracoes_sistema')
      .select('chave, valor');
    
    if (error) {
      console.error('[config-loader] Error loading configs:', error);
      return DEFAULT_CONFIG;
    }
    
    const configMap: Record<string, string> = {};
    (data || []).forEach((c: { chave: string; valor: string }) => {
      configMap[c.chave] = c.valor;
    });
    
    const config: SystemConfig = {
      // Empresa - Dados básicos
      empresa_nome: configMap.empresa_nome || DEFAULT_CONFIG.empresa_nome,
      empresa_slogan: configMap.empresa_slogan || DEFAULT_CONFIG.empresa_slogan,
      empresa_domain: configMap.empresa_domain || DEFAULT_CONFIG.empresa_domain,
      empresa_endereco: configMap.empresa_endereco || DEFAULT_CONFIG.empresa_endereco,
      whatsapp_numero: configMap.whatsapp_numero || DEFAULT_CONFIG.whatsapp_numero,
      email_contato: configMap.email_contato || DEFAULT_CONFIG.email_contato,
      telefone_contato: configMap.telefone_contato || DEFAULT_CONFIG.telefone_contato,
      
      // Empresa - Dados jurídicos
      empresa_cnpj: configMap.empresa_cnpj || DEFAULT_CONFIG.empresa_cnpj,
      empresa_cnpj_consorcio: configMap.empresa_cnpj_consorcio || DEFAULT_CONFIG.empresa_cnpj_consorcio,
      empresa_razao_social: configMap.empresa_razao_social || DEFAULT_CONFIG.empresa_razao_social,
      empresa_site: configMap.empresa_site || DEFAULT_CONFIG.empresa_site,
      email_financeiro: configMap.email_financeiro || DEFAULT_CONFIG.email_financeiro,
      
      // Redes sociais
      rede_social_instagram: configMap.rede_social_instagram || DEFAULT_CONFIG.rede_social_instagram,
      rede_social_linkedin: configMap.rede_social_linkedin || DEFAULT_CONFIG.rede_social_linkedin,
      rede_social_facebook: configMap.rede_social_facebook || DEFAULT_CONFIG.rede_social_facebook,
      
      // Bitrix24
      bitrix24_base_url: configMap.bitrix24_base_url || DEFAULT_CONFIG.bitrix24_base_url,
      bitrix24_enabled: configMap.bitrix24_enabled === 'true',
      bitrix24_webhook_url: configMap.bitrix24_webhook_url || '',
      
      // Parâmetros técnicos
      pis_cofins_aliquota: parseFloat(configMap.pis_cofins_aliquota) || DEFAULT_CONFIG.pis_cofins_aliquota,
      disponibilidade_monofasico: parseInt(configMap.disponibilidade_monofasico) || DEFAULT_CONFIG.disponibilidade_monofasico,
      disponibilidade_bifasico: parseInt(configMap.disponibilidade_bifasico) || DEFAULT_CONFIG.disponibilidade_bifasico,
      disponibilidade_trifasico: parseInt(configMap.disponibilidade_trifasico) || DEFAULT_CONFIG.disponibilidade_trifasico,
      
      // Plano UNLOCK
      plano_unlock_threshold: parseInt(configMap.plano_unlock_threshold) || DEFAULT_CONFIG.plano_unlock_threshold,
      plano_unlock_desconto: parseInt(configMap.plano_unlock_desconto) || DEFAULT_CONFIG.plano_unlock_desconto,
      plano_unlock_fidelidade: parseInt(configMap.plano_unlock_fidelidade) || DEFAULT_CONFIG.plano_unlock_fidelidade,
      
      // Nudges
      nudge_documento_delay_1: parseInt(configMap.nudge_documento_delay_1) || DEFAULT_CONFIG.nudge_documento_delay_1,
      nudge_documento_delay_2: parseInt(configMap.nudge_documento_delay_2) || DEFAULT_CONFIG.nudge_documento_delay_2,
      nudge_documento_delay_3: parseInt(configMap.nudge_documento_delay_3) || DEFAULT_CONFIG.nudge_documento_delay_3,
      nudge_contrato_delay_1: parseInt(configMap.nudge_contrato_delay_1) || DEFAULT_CONFIG.nudge_contrato_delay_1,
      nudge_contrato_delay_2: parseInt(configMap.nudge_contrato_delay_2) || DEFAULT_CONFIG.nudge_contrato_delay_2,
      nudge_contrato_delay_3: parseInt(configMap.nudge_contrato_delay_3) || DEFAULT_CONFIG.nudge_contrato_delay_3,
      max_nudge_attempts: parseInt(configMap.max_nudge_attempts) || DEFAULT_CONFIG.max_nudge_attempts,
      
      // Quiet hours
      quiet_hours_start: parseInt(configMap.quiet_hours_start) || DEFAULT_CONFIG.quiet_hours_start,
      quiet_hours_end: parseInt(configMap.quiet_hours_end) || DEFAULT_CONFIG.quiet_hours_end,
      quiet_hours_enabled: configMap.quiet_hours_enabled !== 'false',
      
      // Cálculos
      multa_rescisoria_percentual: parseInt(configMap.multa_rescisoria_percentual) || DEFAULT_CONFIG.multa_rescisoria_percentual,
      prazo_compensacao_dias: parseInt(configMap.prazo_compensacao_dias) || DEFAULT_CONFIG.prazo_compensacao_dias,
      
      // Cleanup
      cleanup_audio_horas: parseInt(configMap.cleanup_audio_horas) || DEFAULT_CONFIG.cleanup_audio_horas,
      documento_recuperacao_horas: parseInt(configMap.documento_recuperacao_horas) || DEFAULT_CONFIG.documento_recuperacao_horas,
      
      // Follow-up scores
      followup_score_alto: parseInt(configMap.followup_score_alto) || DEFAULT_CONFIG.followup_score_alto,
      followup_score_medio: parseInt(configMap.followup_score_medio) || DEFAULT_CONFIG.followup_score_medio,
      followup_score_baixo: parseInt(configMap.followup_score_baixo) || DEFAULT_CONFIG.followup_score_baixo,
      
      // Defaults
      cip_default: parseInt(configMap.cip_default) || DEFAULT_CONFIG.cip_default,
      desconto_default: parseInt(configMap.desconto_default) || DEFAULT_CONFIG.desconto_default,
      fidelidade_default: parseInt(configMap.fidelidade_default) || DEFAULT_CONFIG.fidelidade_default,
      consumo_default: parseInt(configMap.consumo_default) || DEFAULT_CONFIG.consumo_default,
    };
    
    // Atualizar cache
    cachedConfig = config;
    cacheTimestamp = Date.now();
    
    console.log('[config-loader] Loaded system config successfully');
    return config;
  } catch (err) {
    console.error('[config-loader] Exception loading configs:', err);
    return DEFAULT_CONFIG;
  }
}

// Helper para obter dados da empresa formatados para prompts
export function getCompanyPromptData(config: SystemConfig): string {
  return `
## Dados da Empresa
- Nome: ${config.empresa_nome}
- Slogan: ${config.empresa_slogan}
- Endereço: ${config.empresa_endereco}
- WhatsApp: ${config.whatsapp_numero}
- Email: ${config.email_contato}
- Telefone: ${config.telefone_contato}

## Condições Comerciais
- Prazo para início da compensação: ${config.prazo_compensacao_dias} dias
- Multa rescisória: ${config.multa_rescisoria_percentual}% do valor remanescente
`;
}

// Helper para obter defaults de proposta
export function getProposalDefaults(config: SystemConfig) {
  return {
    cip: config.cip_default,
    desconto: config.desconto_default,
    fidelidade: config.fidelidade_default,
    consumoMedio: config.consumo_default,
  };
}

// Função para calcular desconto dinâmico baseado no consumo
export function calcularDescontoPadrao(consumoKwh: number, config: SystemConfig): number {
  return consumoKwh > config.plano_unlock_threshold 
    ? config.plano_unlock_desconto 
    : config.desconto_default;
}

// Função para calcular fidelidade dinâmica baseada no consumo
export function calcularFidelidadePadrao(consumoKwh: number, config: SystemConfig): number {
  return consumoKwh > config.plano_unlock_threshold 
    ? config.plano_unlock_fidelidade * 12 
    : config.fidelidade_default;
}

// Raw config cache for direct key lookups
let rawConfigCache: Map<string, string> | null = null;
let rawConfigTimestamp = 0;

/**
 * Load raw config values (key-value pairs) for direct lookups
 */
export async function loadRawConfig(supabase: any): Promise<Map<string, string>> {
  if (rawConfigCache && Date.now() - rawConfigTimestamp < CACHE_TTL_MS) {
    return rawConfigCache;
  }
  
  try {
    const { data, error } = await supabase
      .from('configuracoes_sistema')
      .select('chave, valor');
    
    if (error) {
      console.error('[config-loader] Error loading raw configs:', error);
      return rawConfigCache || new Map();
    }
    
    const configMap = new Map<string, string>();
    (data || []).forEach((c: { chave: string; valor: string }) => {
      configMap.set(c.chave, c.valor);
    });
    
    rawConfigCache = configMap;
    rawConfigTimestamp = Date.now();
    
    return configMap;
  } catch (err) {
    console.error('[config-loader] Exception loading raw configs:', err);
    return rawConfigCache || new Map();
  }
}

/**
 * Get raw config cache (for synchronous access after initial load)
 */
export function getRawConfigCache(): Map<string, string> | null {
  return rawConfigCache;
}

/**
 * Get a config value by key with fallback
 * Uses cache if available, otherwise uses fallback
 */
export function getConfigValue(
  key: string,
  fallback: string,
  cache?: Map<string, string>
): string {
  const cacheToUse = cache || rawConfigCache;
  if (cacheToUse?.has(key)) {
    return cacheToUse.get(key)!;
  }
  return fallback;
}

/**
 * Get a numeric config value by key with fallback
 */
export function getConfigNumber(
  key: string,
  fallback: number,
  cache?: Map<string, string>
): number {
  const value = getConfigValue(key, String(fallback), cache);
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? fallback : parsed;
}

/**
 * Get a float config value by key with fallback
 */
export function getConfigFloat(
  key: string,
  fallback: number,
  cache?: Map<string, string>
): number {
  const value = getConfigValue(key, String(fallback), cache);
  const parsed = parseFloat(value);
  return isNaN(parsed) ? fallback : parsed;
}

/**
 * Get a boolean config value by key with fallback
 */
export function getConfigBool(
  key: string,
  fallback: boolean,
  cache?: Map<string, string>
): boolean {
  const value = getConfigValue(key, String(fallback), cache);
  return value === 'true' || value === '1';
}

/**
 * Clear raw config cache
 */
export function clearRawConfigCache(): void {
  rawConfigCache = null;
  rawConfigTimestamp = 0;
}
