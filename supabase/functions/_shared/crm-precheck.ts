/**
 * ═══════════════════════════════════════════════════════════════
 * CRM PRE-CHECK MODULE
 * ═══════════════════════════════════════════════════════════════
 * Mandatory CRM lookup BEFORE any AI/triage processing.
 * Determines lead stage and recommends fast-path based on Bitrix24 status.
 * 
 * Key responsibilities:
 * 1. Query Bitrix24 by phone to get lead status
 * 2. Map stage to behavioral recommendations
 * 3. Block triage for advanced stages
 * 4. Provide SAC redirect for closed clients
 * 5. Cache results to minimize API calls
 * ═══════════════════════════════════════════════════════════════
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { findLeadByPhone, BitrixLeadData, BITRIX_STAGE_IDS } from './bitrix-client.ts';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface CRMPreCheckContext {
  supabase: SupabaseClient;
  phone: string;
  conversaId?: string;
  bitrix24Url?: string;
}

export interface CRMLeadContext {
  found: boolean;
  leadId: string | null;
  stage: string | null;
  stageName: string | null;
  
  // Data from CRM
  nome: string | null;
  email: string | null;
  cpfCnpj: string | null;
  distribuidora: string | null;
  valorFatura: number | null;
  
  // Stage-derived flags
  isDiscarded: boolean;
  isContractSigned: boolean;
  isProposalSent: boolean;
  isDefinitiveReady: boolean;
  isAwaitingSignature: boolean;
  isHotLead: boolean;
  
  // Behavioral recommendations
  shouldSkipTriage: boolean;
  shouldSkipDataCollection: boolean;
  recommendedMode: 'standard' | 'closer' | 'sac_redirect' | 'blocked';
  recommendedFastPath: string | null;
  
  // Metadata
  lookupDurationMs: number;
  source: 'bitrix' | 'local_db' | 'cache';
}

export interface CRMPreCheckResult {
  context: CRMLeadContext;
  handled: boolean;
  response?: {
    status: string;
    message?: string;
  };
}

// ═══════════════════════════════════════════════════════════════
// STAGE BEHAVIOR MAPPING
// ═══════════════════════════════════════════════════════════════

interface StageBehavior {
  shouldSkipTriage: boolean;
  shouldSkipDataCollection: boolean;
  recommendedMode: 'standard' | 'closer' | 'sac_redirect' | 'blocked';
  recommendedFastPath: string | null;
  isBlocked: boolean;
  blockMessage?: string;
}

const DEFAULT_BEHAVIOR: StageBehavior = {
  shouldSkipTriage: false,
  shouldSkipDataCollection: false,
  recommendedMode: 'standard',
  recommendedFastPath: null,
  isBlocked: false,
};

/**
 * Get stage behavior map from database or use defaults
 */
async function getStageBehaviorMap(supabase: SupabaseClient): Promise<Record<string, StageBehavior>> {
  // Try to load from config
  const { data: hotLeadStagesConfig } = await supabase
    .from('configuracoes_sistema')
    .select('valor')
    .eq('chave', 'crm_hot_lead_stages')
    .single();
  
  let hotLeadStages: string[] = [];
  try {
    hotLeadStages = hotLeadStagesConfig?.valor ? JSON.parse(hotLeadStagesConfig.valor) : [];
  } catch {
    hotLeadStages = ['UC_9SLRPP', 'UC_JENEX5', 'UC_AGUARDANDO_ASSINATURA'];
  }
  
  // Build map with dynamic stage IDs
  const map: Record<string, StageBehavior> = {
    // Initial stages - allow normal triage
    'NEW': {
      shouldSkipTriage: false,
      shouldSkipDataCollection: false,
      recommendedMode: 'standard',
      recommendedFastPath: null,
      isBlocked: false,
    },
    'UC_AGUARDANDO_DADOS': {
      shouldSkipTriage: true,  // Already in data collection
      shouldSkipDataCollection: false,
      recommendedMode: 'standard',
      recommendedFastPath: null,
      isBlocked: false,
    },
    
    // Initial Proposal - hot lead
    [BITRIX_STAGE_IDS.PROPOSTA_INICIAL]: {
      shouldSkipTriage: true,
      shouldSkipDataCollection: true,
      recommendedMode: 'closer',
      recommendedFastPath: 'proposal_sent',
      isBlocked: false,
    },
    
    // Contract Solicitation stage - very hot (legacy: proposta definitiva)
    [BITRIX_STAGE_IDS.PROPOSTA_DEFINITIVA]: {
      shouldSkipTriage: true,
      shouldSkipDataCollection: true,
      recommendedMode: 'closer',
      recommendedFastPath: 'contract_solicitation',
      isBlocked: false,
    },
    
    // Awaiting Signature - highest priority
    [BITRIX_STAGE_IDS.AGUARDANDO_ASSINATURA]: {
      shouldSkipTriage: true,
      shouldSkipDataCollection: true,
      recommendedMode: 'closer',
      recommendedFastPath: 'contract_pending',
      isBlocked: false,
    },
    
    // Closed/Won - redirect to SAC
    [BITRIX_STAGE_IDS.FECHADO]: {
      shouldSkipTriage: true,
      shouldSkipDataCollection: true,
      recommendedMode: 'sac_redirect',
      recommendedFastPath: 'existing_customer',
      isBlocked: false,
    },
    'WON': {
      shouldSkipTriage: true,
      shouldSkipDataCollection: true,
      recommendedMode: 'sac_redirect',
      recommendedFastPath: 'existing_customer',
      isBlocked: false,
    },
    
    // Discarded - block re-entry
    [BITRIX_STAGE_IDS.LEAD_DESCARTADO]: {
      shouldSkipTriage: true,
      shouldSkipDataCollection: true,
      recommendedMode: 'blocked',
      recommendedFastPath: 'discarded_lead',
      isBlocked: true,
      blockMessage: 'Lead descartado - verificar período de quarentena',
    },
    'JUNK': {
      shouldSkipTriage: true,
      shouldSkipDataCollection: true,
      recommendedMode: 'blocked',
      recommendedFastPath: 'discarded_lead',
      isBlocked: true,
      blockMessage: 'Lead descartado - verificar período de quarentena',
    },
    
    // Lost
    [BITRIX_STAGE_IDS.PERDIDO]: {
      shouldSkipTriage: true,
      shouldSkipDataCollection: true,
      recommendedMode: 'blocked',
      recommendedFastPath: 'lost_lead',
      isBlocked: true,
      blockMessage: 'Lead perdido',
    },
    'LOSE': {
      shouldSkipTriage: true,
      shouldSkipDataCollection: true,
      recommendedMode: 'blocked',
      recommendedFastPath: 'lost_lead',
      isBlocked: true,
      blockMessage: 'Lead perdido',
    },
  };
  
  return map;
}

// ═══════════════════════════════════════════════════════════════
// CACHE HELPERS
// ═══════════════════════════════════════════════════════════════

const CRM_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes default

interface LocalCacheResult {
  hasRecentBitrixData: boolean;
  leadId: string | null;
  stage: string | null;
  stageName: string | null;
  nome: string | null;
  email: string | null;
  checkedAt: string | null;
}

/**
 * Check local conversation for cached CRM data
 */
async function checkLocalConversationData(
  supabase: SupabaseClient,
  phone: string
): Promise<LocalCacheResult> {
  const emptyResult: LocalCacheResult = {
    hasRecentBitrixData: false,
    leadId: null,
    stage: null,
    stageName: null,
    nome: null,
    email: null,
    checkedAt: null,
  };
  
  try {
    // Get cache TTL from config
    const { data: ttlConfig } = await supabase
      .from('configuracoes_sistema')
      .select('valor')
      .eq('chave', 'crm_precheck_cache_ttl_ms')
      .single();
    
    const cacheTtlMs = ttlConfig?.valor ? parseInt(ttlConfig.valor) : CRM_CACHE_TTL_MS;
    
    // Find recent conversation with CRM data
    const { data: conversa } = await supabase
      .from('chatbot_conversas')
      .select('bitrix24_lead_id, bitrix24_stage, cliente_nome, cliente_email, dados_coletados')
      .ilike('cliente_telefone', `%${phone.slice(-8)}%`)
      .is('ended_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (!conversa) return emptyResult;
    
    // Check if we have cached CRM context
    const dados = conversa.dados_coletados as Record<string, any> | null;
    const crmContext = dados?._crm_context;
    
    if (crmContext?.checkedAt) {
      const checkedAt = new Date(crmContext.checkedAt).getTime();
      const now = Date.now();
      
      if (now - checkedAt < cacheTtlMs) {
        console.log(`[CRM_PRECHECK] Using cached CRM data (age: ${Math.round((now - checkedAt) / 1000)}s)`);
        return {
          hasRecentBitrixData: true,
          leadId: crmContext.leadId || conversa.bitrix24_lead_id,
          stage: crmContext.stage || conversa.bitrix24_stage,
          stageName: crmContext.stageName,
          nome: conversa.cliente_nome,
          email: conversa.cliente_email,
          checkedAt: crmContext.checkedAt,
        };
      }
    }
    
    return emptyResult;
  } catch (err) {
    console.warn('[CRM_PRECHECK] Error checking local cache:', err);
    return emptyResult;
  }
}

/**
 * Get Bitrix24 webhook URL from config
 */
async function getBitrixWebhookUrl(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase
    .from('configuracoes_sistema')
    .select('valor')
    .eq('chave', 'bitrix24_webhook_url')
    .single();
  
  return data?.valor || null;
}

/**
 * Resolve stage ID to human-readable label
 */
async function resolveStageLabel(supabase: SupabaseClient, stageId: string): Promise<string | null> {
  const { data } = await supabase
    .from('bitrix_stages_config')
    .select('nome')
    .eq('stage_id', stageId)
    .single();
  
  return data?.nome || stageId;
}

/**
 * Extract email from Bitrix lead data
 */
function extractEmail(emailField: any): string | null {
  if (!emailField) return null;
  if (Array.isArray(emailField) && emailField.length > 0) {
    return emailField[0]?.VALUE || null;
  }
  if (typeof emailField === 'string') return emailField;
  return null;
}

/**
 * Extract custom field from Bitrix lead
 */
function extractCustomField(lead: BitrixLeadData, fieldName: string): string | null {
  const value = lead[fieldName];
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return null;
}

/**
 * Build empty result for new leads
 */
function buildEmptyResult(startTime: number): CRMPreCheckResult {
  return {
    context: {
      found: false,
      leadId: null,
      stage: null,
      stageName: null,
      nome: null,
      email: null,
      cpfCnpj: null,
      distribuidora: null,
      valorFatura: null,
      isDiscarded: false,
      isContractSigned: false,
      isProposalSent: false,
      isDefinitiveReady: false,
      isAwaitingSignature: false,
      isHotLead: false,
      shouldSkipTriage: false,
      shouldSkipDataCollection: false,
      recommendedMode: 'standard',
      recommendedFastPath: null,
      lookupDurationMs: Date.now() - startTime,
      source: 'bitrix',
    },
    handled: false,
  };
}

/**
 * Build result from local cache
 */
function buildResultFromLocal(
  local: LocalCacheResult,
  startTime: number,
  behaviorMap: Record<string, StageBehavior>
): CRMPreCheckResult {
  const stageId = local.stage || 'NEW';
  const behavior = behaviorMap[stageId] || DEFAULT_BEHAVIOR;
  
  const hotLeadStages = [
    BITRIX_STAGE_IDS.PROPOSTA_INICIAL,
    BITRIX_STAGE_IDS.PROPOSTA_DEFINITIVA,
    BITRIX_STAGE_IDS.AGUARDANDO_ASSINATURA,
    'UC_9SLRPP', 'UC_JENEX5', 'UC_AGUARDANDO_ASSINATURA'
  ];
  
  return {
    context: {
      found: true,
      leadId: local.leadId,
      stage: stageId,
      stageName: local.stageName,
      nome: local.nome,
      email: local.email,
      cpfCnpj: null,
      distribuidora: null,
      valorFatura: null,
      isDiscarded: stageId === 'JUNK' || stageId === BITRIX_STAGE_IDS.LEAD_DESCARTADO,
      isContractSigned: stageId === 'WON' || stageId === BITRIX_STAGE_IDS.FECHADO,
      isProposalSent: hotLeadStages.includes(stageId),
      isDefinitiveReady: stageId === BITRIX_STAGE_IDS.PROPOSTA_DEFINITIVA || stageId === 'UC_JENEX5',
      isAwaitingSignature: stageId === BITRIX_STAGE_IDS.AGUARDANDO_ASSINATURA || stageId === 'UC_AGUARDANDO_ASSINATURA',
      isHotLead: hotLeadStages.includes(stageId),
      shouldSkipTriage: behavior.shouldSkipTriage,
      shouldSkipDataCollection: behavior.shouldSkipDataCollection,
      recommendedMode: behavior.recommendedMode,
      recommendedFastPath: behavior.recommendedFastPath,
      lookupDurationMs: Date.now() - startTime,
      source: 'cache',
    },
    handled: behavior.isBlocked,
    response: behavior.isBlocked ? {
      status: 'crm_blocked',
      message: behavior.blockMessage,
    } : undefined,
  };
}

// ═══════════════════════════════════════════════════════════════
// MAIN FUNCTION
// ═══════════════════════════════════════════════════════════════

/**
 * Execute CRM Pre-Check
 * Queries Bitrix24 to determine lead stage and recommend behavior
 */
export async function executeCRMPreCheck(
  ctx: CRMPreCheckContext
): Promise<CRMPreCheckResult> {
  const startTime = Date.now();
  
  // Check if CRM pre-check is enabled
  const { data: enabledConfig } = await ctx.supabase
    .from('configuracoes_sistema')
    .select('valor')
    .eq('chave', 'crm_precheck_enabled')
    .single();
  
  const isEnabled = enabledConfig?.valor !== 'false';
  
  if (!isEnabled) {
    console.log(`[CRM_PRECHECK] ⏭️ Disabled by config`);
    return buildEmptyResult(startTime);
  }
  
  // Load behavior map
  const behaviorMap = await getStageBehaviorMap(ctx.supabase);
  
  // 1. Try local cache first
  const localResult = await checkLocalConversationData(ctx.supabase, ctx.phone);
  
  if (localResult.hasRecentBitrixData) {
    console.log(`[CRM_PRECHECK] ✅ Using cached data | Lead: ${localResult.leadId} | Stage: ${localResult.stage}`);
    return buildResultFromLocal(localResult, startTime, behaviorMap);
  }
  
  // 2. Get Bitrix URL
  const bitrixUrl = ctx.bitrix24Url || await getBitrixWebhookUrl(ctx.supabase);
  
  if (!bitrixUrl) {
    console.log(`[CRM_PRECHECK] ⚠️ No Bitrix URL configured`);
    return buildEmptyResult(startTime);
  }
  
  // 3. Query Bitrix24 by phone
  console.log(`[CRM_PRECHECK] 🔍 Querying Bitrix24 for phone: ${ctx.phone}`);
  const bitrixLead = await findLeadByPhone(bitrixUrl, ctx.phone);
  
  if (!bitrixLead) {
    console.log(`[CRM_PRECHECK] No lead found for ${ctx.phone} in Bitrix`);
    return buildEmptyResult(startTime);
  }
  
  // 4. Map stage to behavior
  const stageId = bitrixLead.STATUS_ID || 'NEW';
  const behavior = behaviorMap[stageId] || DEFAULT_BEHAVIOR;
  
  // 5. Resolve stage name
  const stageName = await resolveStageLabel(ctx.supabase, stageId);
  
  // 6. Define hot lead stages
  const hotLeadStages = [
    BITRIX_STAGE_IDS.PROPOSTA_INICIAL,
    BITRIX_STAGE_IDS.PROPOSTA_DEFINITIVA,
    BITRIX_STAGE_IDS.AGUARDANDO_ASSINATURA,
    'UC_9SLRPP', 'UC_JENEX5', 'UC_AGUARDANDO_ASSINATURA'
  ];
  
  // 7. Build context
  const context: CRMLeadContext = {
    found: true,
    leadId: bitrixLead.ID || null,
    stage: stageId,
    stageName,
    
    nome: bitrixLead.NAME || null,
    email: extractEmail(bitrixLead.EMAIL),
    cpfCnpj: extractCustomField(bitrixLead, 'UF_CRM_CPF_CNPJ'),
    distribuidora: extractCustomField(bitrixLead, 'UF_CRM_DISTRIBUIDORA'),
    valorFatura: parseFloat(extractCustomField(bitrixLead, 'UF_CRM_VALOR_FATURA') || '0') || null,
    
    isDiscarded: stageId === 'JUNK' || stageId === BITRIX_STAGE_IDS.LEAD_DESCARTADO,
    isContractSigned: stageId === 'WON' || stageId === BITRIX_STAGE_IDS.FECHADO,
    isProposalSent: hotLeadStages.includes(stageId),
    isDefinitiveReady: stageId === BITRIX_STAGE_IDS.PROPOSTA_DEFINITIVA || stageId === 'UC_JENEX5',
    isAwaitingSignature: stageId === BITRIX_STAGE_IDS.AGUARDANDO_ASSINATURA || stageId === 'UC_AGUARDANDO_ASSINATURA',
    isHotLead: hotLeadStages.includes(stageId),
    
    shouldSkipTriage: behavior.shouldSkipTriage,
    shouldSkipDataCollection: behavior.shouldSkipDataCollection,
    recommendedMode: behavior.recommendedMode,
    recommendedFastPath: behavior.recommendedFastPath,
    
    lookupDurationMs: Date.now() - startTime,
    source: 'bitrix',
  };
  
  console.log(`[CRM_PRECHECK] ✅ Lead ${context.leadId} | Stage: ${context.stageName} (${stageId}) | Mode: ${context.recommendedMode} | SkipTriage: ${context.shouldSkipTriage} | Duration: ${context.lookupDurationMs}ms`);
  
  // 8. Persist to local cache
  if (ctx.conversaId) {
    try {
      const { data: currentConversa } = await ctx.supabase
        .from('chatbot_conversas')
        .select('dados_coletados')
        .eq('id', ctx.conversaId)
        .single();
      
      const existingDados = (currentConversa?.dados_coletados as Record<string, any>) || {};
      
      await ctx.supabase
        .from('chatbot_conversas')
        .update({
          bitrix24_lead_id: context.leadId,
          bitrix24_stage: context.stage,
          dados_coletados: {
            ...existingDados,
            _crm_context: {
              leadId: context.leadId,
              stage: context.stage,
              stageName: context.stageName,
              isHotLead: context.isHotLead,
              recommendedMode: context.recommendedMode,
              shouldSkipTriage: context.shouldSkipTriage,
              checkedAt: new Date().toISOString(),
            },
          },
        })
        .eq('id', ctx.conversaId);
    } catch (err) {
      console.warn('[CRM_PRECHECK] Failed to persist cache:', err);
    }
  }
  
  return {
    context,
    handled: behavior.isBlocked,
    response: behavior.isBlocked ? {
      status: 'crm_blocked',
      message: behavior.blockMessage,
    } : undefined,
  };
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════

export { getBitrixWebhookUrl };
