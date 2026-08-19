/**
 * Automation Eligibility Module
 * Centralizes all rules for determining if a conversation is eligible for automated actions
 * (Follow-up, Nudge, Rescue) to ensure consistent behavior across all schedulers.
 * 
 * Core Rules:
 * 1. Human takeover only blocks if #ASSUMIR was used (human_agent_id != null OR sofia_mode = 'paused_for_human')
 * 2. Activity cooldown: blocks automation if lead messaged recently (configurable, default 60 min)
 * 3. Stage gating: FUP only for specific stages (e.g., PROPOSTA_INICIAL), not IN_PROCESS
 * 4. Hard-stops: disqualified leads (Grupo A, Tarifa Social, low consumption, JUNK, WON)
 * 5. SAC/Client redirect: leads marked as 'sac_redirect' are blocked from all automations
 * 6. Commercial data requirement: FUP/Rescue only for leads with simulation or minimum commercial data
 */

// Use unified config loader for hierarchical config resolution
import { 
  getUnifiedConfigLoader, 
  loadRawConfig,
  getConfigNumber,
  type UnifiedConfigLoader,
} from './unified-config-loader.ts';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface AutomationContext {
  // Core conversation fields
  id: string;
  cliente_telefone: string | null;
  cliente_nome: string | null;
  
  // Human intervention
  human_agent_id: string | null;
  sofia_mode: string | null;
  
  // Timestamps
  last_message_at: string | null;
  last_human_message_at: string | null;
  ended_at: string | null;
  contrato_enviado_at: string | null;
  
  // State
  bitrix24_stage: string | null;
  contrato_assinado: boolean | null;
  event_conversion: boolean | null;
  event_drop: boolean | null;
  
  // Collected data (for disqualification checks)
  dados_coletados: Record<string, unknown> | null;
  
  // Optional for FUP
  lead_score?: number | null;
  
  // Commercial data indicator
  has_simulation?: boolean | null;
}

export interface EligibilityResult {
  eligible: boolean;
  reason: string;
  action?: 'skip' | 'cleanup' | 'reschedule';
}

export type AutomationType = 'followup' | 'nudge' | 'rescue';

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION DEFAULTS (fallbacks - loaded from DB via config-loader)
// ZERO HARDCODE: All values come from configuracoes_sistema
// ═══════════════════════════════════════════════════════════════

const DEFAULT_ACTIVITY_COOLDOWN_MINUTES = 60;
const DEFAULT_FUP_VALID_STAGES = ['UC_9SLRPP', 'PROPOSTA_INICIAL', 'LEAD_FRIO'];
const DEFAULT_BLOCKED_STAGES = ['JUNK', 'WON', 'LOST'];
const DEFAULT_PAUSED_MODES = ['paused_for_human', 'descartado', 'sac_redirect'];
const DEFAULT_LOW_CONSUMPTION_THRESHOLD = 150;

// Config cache
let eligibilityConfigCache: {
  blockedStages: string[];
  pausedModes: string[];
  lowConsumptionThreshold: number;
  timestamp: number;
} | null = null;
const CONFIG_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Load eligibility config from database
 */
export async function loadEligibilityConfig(supabase: any): Promise<{
  blockedStages: string[];
  pausedModes: string[];
  lowConsumptionThreshold: number;
}> {
  const now = Date.now();
  
  if (eligibilityConfigCache && (now - eligibilityConfigCache.timestamp) < CONFIG_CACHE_TTL) {
    return eligibilityConfigCache;
  }
  
  try {
    const { data } = await supabase
      .from('configuracoes_sistema')
      .select('chave, valor')
      .in('chave', ['automation_blocked_stages', 'automation_paused_modes', 'automation_low_consumption_threshold']);
    
    const configMap = new Map<string, string>(data?.map((r: any) => [r.chave, r.valor]) || []);
    
    const blockedStagesStr = configMap.get('automation_blocked_stages');
    const pausedModesStr = configMap.get('automation_paused_modes');
    
    eligibilityConfigCache = {
      blockedStages: blockedStagesStr ? blockedStagesStr.split(',').map(s => s.trim()) : DEFAULT_BLOCKED_STAGES,
      pausedModes: pausedModesStr ? pausedModesStr.split(',').map(s => s.trim()) : DEFAULT_PAUSED_MODES,
      lowConsumptionThreshold: parseInt(configMap.get('automation_low_consumption_threshold') || String(DEFAULT_LOW_CONSUMPTION_THRESHOLD)),
      timestamp: now,
    };
    
    console.log('[AUTO_ELIGIBILITY] Config loaded from DB');
    return eligibilityConfigCache;
  } catch (err) {
    console.error('[AUTO_ELIGIBILITY] Error loading config:', err);
    return {
      blockedStages: DEFAULT_BLOCKED_STAGES,
      pausedModes: DEFAULT_PAUSED_MODES,
      lowConsumptionThreshold: DEFAULT_LOW_CONSUMPTION_THRESHOLD,
    };
  }
}

/**
 * Get cached config (sync version)
 */
function getCachedEligibilityConfig() {
  return eligibilityConfigCache || {
    blockedStages: DEFAULT_BLOCKED_STAGES,
    pausedModes: DEFAULT_PAUSED_MODES,
    lowConsumptionThreshold: DEFAULT_LOW_CONSUMPTION_THRESHOLD,
  };
}

// ═══════════════════════════════════════════════════════════════
// CORE ELIGIBILITY CHECKS
// ═══════════════════════════════════════════════════════════════

/**
 * Check if conversation is under human control (#ASSUMIR was used)
 * Only blocks if human_agent_id is set OR sofia_mode is paused_for_human
 */
export function isUnderHumanControl(context: AutomationContext): boolean {
  if (context.human_agent_id) {
    return true;
  }
  if (context.sofia_mode === 'paused_for_human') {
    return true;
  }
  return false;
}

/**
 * Check if conversation is in activity cooldown
 * Prevents automation if lead messaged recently
 */
export function isWithinActivityCooldown(
  context: AutomationContext,
  configCache?: Map<string, string>
): boolean {
  if (!context.last_message_at) return false;
  
  const cooldownMinutes = getConfigNumber(
    'automation_activity_cooldown_minutes',
    DEFAULT_ACTIVITY_COOLDOWN_MINUTES,
    configCache
  );
  
  const lastMessageTime = new Date(context.last_message_at).getTime();
  const now = Date.now();
  const cooldownMs = cooldownMinutes * 60 * 1000;
  
  return (now - lastMessageTime) < cooldownMs;
}

/**
 * Check if conversation is in a valid stage for the automation type
 */
export function isInValidStage(
  context: AutomationContext,
  automationType: AutomationType,
  configCache?: Map<string, string>
): boolean {
  const stage = context.bitrix24_stage;
  const config = getCachedEligibilityConfig();
  
  // Always block these stages
  if (stage && config.blockedStages.includes(stage)) {
    return false;
  }
  
  // For FUP, only allow specific stages
  if (automationType === 'followup') {
    // Get valid stages from config or use defaults
    const validStagesStr = configCache?.get('fup_valid_stages');
    const validStages = validStagesStr 
      ? validStagesStr.split(',').map(s => s.trim())
      : DEFAULT_FUP_VALID_STAGES;
    
    // If stage is null, allow FUP (might be new lead)
    if (!stage) return true;
    
    return validStages.includes(stage);
  }
  
  // Nudge and Rescue are more permissive
  return true;
}

/**
 * Check if conversation has disqualification flags in dados_coletados
 */
export function hasDisqualificationFlags(context: AutomationContext): {
  disqualified: boolean;
  reason: string | null;
} {
  const dados = context.dados_coletados || {};
  
  // Check explicit disqualification
  const motivoDescarte = dados.motivoDescarte as string | undefined;
  if (motivoDescarte) {
    return { disqualified: true, reason: `motivoDescarte: ${motivoDescarte}` };
  }
  
  // Check specific flags
  if (dados.distribuidoraNaoAtendida) {
    return { disqualified: true, reason: 'distribuidoraNaoAtendida' };
  }
  if (dados.isGrupoA) {
    return { disqualified: true, reason: 'Grupo A' };
  }
  if (dados.tarifaSocial || dados.isTarifaSocial) {
    return { disqualified: true, reason: 'Tarifa Social' };
  }
  
  // Infer low consumption from numeric fields
  const consumo = Number(dados.consumo ?? dados.consumo_kwh ?? dados.consumoKwh ?? null);
  const valor = Number(dados.valorFatura ?? dados.valor_fatura ?? dados.valorReais ?? null);
  
  const config = getCachedEligibilityConfig();
  const threshold = config.lowConsumptionThreshold;
  
  const isLowConsumption = 
    (Number.isFinite(consumo) && consumo > 0 && consumo < threshold) ||
    (Number.isFinite(valor) && valor > 0 && valor < threshold);
  
  if (isLowConsumption || dados.consumoBaixo || dados.baixo_consumo) {
    return { disqualified: true, reason: `Baixo consumo (<${threshold})` };
  }
  
  return { disqualified: false, reason: null };
}

/**
 * Check if conversation has minimum commercial data to justify automation
 * FUP/Rescue only makes sense for leads with simulation or value + distributor
 */
export function hasCommercialData(context: AutomationContext): boolean {
  // Has simulation = good
  if (context.has_simulation) return true;
  
  const dados = context.dados_coletados || {};
  
  // Check for value data
  const hasValue = !!(
    dados.valorFatura || 
    dados.valor_fatura || 
    dados.valorReais ||
    dados.valor ||
    dados.consumo ||
    dados.consumo_kwh ||
    dados.consumoKwh
  );
  
  // Check for distributor data
  const hasDistributor = !!(
    dados.distribuidora ||
    dados.concessionaria
  );
  
  // Need at least value OR distributor to be considered commercial lead
  return hasValue || hasDistributor;
}

/**
 * Check if conversation is ended/closed
 */
export function isConversationEnded(context: AutomationContext): boolean {
  if (context.ended_at) return true;
  if (context.contrato_assinado) return true;
  if (context.event_conversion) return true;
  if (context.event_drop) return true;
  if (context.sofia_mode === 'descartado') return true;
  return false;
}

/**
 * Check if contract was already sent (should use contract nudge instead)
 */
export function hasContractSent(context: AutomationContext): boolean {
  return !!context.contrato_enviado_at;
}

// ═══════════════════════════════════════════════════════════════
// MAIN ELIGIBILITY FUNCTION
// ═══════════════════════════════════════════════════════════════

/**
 * Comprehensive eligibility check for automation
 * Returns detailed result with reason and suggested action
 */
export function checkAutomationEligibility(
  context: AutomationContext,
  automationType: AutomationType,
  configCache?: Map<string, string>
): EligibilityResult {
  // 1. Check if conversation is ended
  if (isConversationEnded(context)) {
    return {
      eligible: false,
      reason: 'Conversation ended/closed',
      action: 'cleanup',
    };
  }
  
  // 2. Check human takeover (only if #ASSUMIR was used)
  if (isUnderHumanControl(context)) {
    return {
      eligible: false,
      reason: 'Under human control (#ASSUMIR)',
      action: 'skip',
    };
  }
  
  // 3. Check sofia_mode blocked
  const config = getCachedEligibilityConfig();
  if (context.sofia_mode && config.pausedModes.includes(context.sofia_mode)) {
    return {
      eligible: false,
      reason: `Sofia mode blocked: ${context.sofia_mode}`,
      action: context.sofia_mode === 'descartado' ? 'cleanup' : 'skip',
    };
  }
  
  // 4. Check disqualification flags
  const disqualCheck = hasDisqualificationFlags(context);
  if (disqualCheck.disqualified) {
    return {
      eligible: false,
      reason: `Disqualified: ${disqualCheck.reason}`,
      action: 'cleanup',
    };
  }
  
  // 5. Check stage validity
  if (!isInValidStage(context, automationType, configCache)) {
    // For FUP with invalid stage, skip but don't cleanup
    if (automationType === 'followup') {
      return {
        eligible: false,
        reason: `Stage ${context.bitrix24_stage} not valid for ${automationType}`,
        action: 'skip',
      };
    }
    // For blocked stages (JUNK, WON), cleanup
    if (context.bitrix24_stage && config.blockedStages.includes(context.bitrix24_stage)) {
      return {
        eligible: false,
        reason: `Blocked stage: ${context.bitrix24_stage}`,
        action: 'cleanup',
      };
    }
  }
  
  // 6. Check contract sent (for nudge/rescue, use contract nudge instead)
  if (hasContractSent(context) && automationType !== 'nudge') {
    return {
      eligible: false,
      reason: 'Contract already sent',
      action: 'skip',
    };
  }
  
  // 7. Check activity cooldown (prevents messaging right after client activity)
  if (isWithinActivityCooldown(context, configCache)) {
    return {
      eligible: false,
      reason: 'Within activity cooldown',
      action: 'reschedule',
    };
  }
  
  // 8. Check commercial data requirement for FUP/Rescue
  // Only send automations to leads with simulation or minimum commercial data (value/distributor)
  if ((automationType === 'followup' || automationType === 'rescue') && !hasCommercialData(context)) {
    return {
      eligible: false,
      reason: 'No commercial data (value/distributor/simulation)',
      action: 'cleanup', // Remove from automation queue - not a qualified lead
    };
  }
  
  // All checks passed
  return {
    eligible: true,
    reason: 'All checks passed',
  };
}

/**
 * Log eligibility result in standardized format
 */
export function logEligibility(
  schedulerName: string,
  conversaId: string,
  phone: string | null,
  result: EligibilityResult
): void {
  const symbol = result.eligible ? '✅' : '🚫';
  const action = result.action ? ` [${result.action.toUpperCase()}]` : '';
  console.log(
    `[AUTO_ELIGIBILITY] ${symbol} ${schedulerName} | ${conversaId.substring(0,8)} | ${phone || 'no-phone'} | ${result.reason}${action}`
  );
}
