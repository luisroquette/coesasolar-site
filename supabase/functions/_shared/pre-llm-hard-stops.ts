/**
 * PRE-LLM HARD STOPS
 * 
 * Deterministic business rule enforcement BEFORE the LLM processes messages.
 * These are CODE-LEVEL blocks, not prompt suggestions.
 * 
 * Hard Stops:
 * 1. Minimum Bill Threshold (R$ 50) - Discard leads below threshold
 * 2. Document Request Block - Never ask for docs via WhatsApp
 * 3. Proposal Without Email Block - Require email before generating proposal
 * 4. Triage Context Bypass - Skip triage if commercial data exists
 * 5. Recent Disqualification Block - Prevent re-entry within 30 days
 */

import { createClient } from 'npm:@supabase/supabase-js@2.90.0';
import type { ExtractedClientData } from './data-extraction.ts';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface HardStopContext {
  phone: string;
  messageText: string;
  conversaId: string | null;
  agentId: string;
  extractedData: ExtractedClientData;
  existingDados: ExtractedClientData;
  conversa: HardStopConversaData | null;
  propostaId: string | null;
  proposalUrl: string | null;
}

export interface HardStopConversaData {
  id: string;
  bitrix24_stage?: string | null;
  proposta_id?: string | null;
  sofia_mode?: string | null;
  ended_at?: string | null;
  dados_coletados?: Record<string, unknown> | null;
}

export interface HardStopResult {
  blocked: boolean;
  blockType: HardStopType | null;
  responseMessage: string | null;
  shouldDiscard: boolean;
  discardReason: string | null;
  skipTriage: boolean;
  triageBypassReason: string | null;
  requireEmail: boolean;
  blockDocumentRequest: boolean;
  logDetails: Record<string, unknown>;
}

export type HardStopType = 
  | 'minimum_bill_threshold'
  | 'document_request_blocked'
  | 'proposal_without_email'
  | 'recent_disqualification'
  | 'triage_bypass';

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION LOADER
// ═══════════════════════════════════════════════════════════════

interface HardStopConfig {
  consumoMinimoReais: number;
  disqualificationCooldownDays: number;
  documentBlockEnabled: boolean;
  emailRequiredForProposal: boolean;
}

let configCache: { data: HardStopConfig | null; timestamp: number } = { data: null, timestamp: 0 };
const CONFIG_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function loadHardStopConfig(supabase: any): Promise<HardStopConfig> {
  const now = Date.now();
  if (configCache.data && (now - configCache.timestamp) < CONFIG_TTL_MS) {
    return configCache.data;
  }

  const { data: configs } = await supabase
    .from('configuracoes_sistema')
    .select('chave, valor')
    .in('chave', [
      'consumo_minimo_reais',
      'disqualification_cooldown_days',
      'document_block_whatsapp_enabled',
      'email_required_for_proposal',
    ]);

  const configMap: Record<string, string> = {};
  configs?.forEach((c: any) => {
    configMap[c.chave] = c.valor;
  });

  const result: HardStopConfig = {
    consumoMinimoReais: parseFloat(configMap.consumo_minimo_reais) || 50,
    disqualificationCooldownDays: parseInt(configMap.disqualification_cooldown_days) || 30,
    documentBlockEnabled: configMap.document_block_whatsapp_enabled !== 'false',
    emailRequiredForProposal: configMap.email_required_for_proposal !== 'false',
  };

  configCache = { data: result, timestamp: now };
  return result;
}

// ═══════════════════════════════════════════════════════════════
// HARD STOP #1: MINIMUM BILL THRESHOLD
// Blocks leads with bills below R$ 50
// PHASE 120: Now supports multiple accounts/units
// ═══════════════════════════════════════════════════════════════

function checkMinimumBillThreshold(
  extractedData: ExtractedClientData,
  existingDados: ExtractedClientData,
  config: HardStopConfig
): { blocked: boolean; valorDetected: number | null; message: string | null; estimatedFromConsumption: boolean; isMultipleUnits: boolean } {
  
  // Merge data to check for multiple units
  const merged = { ...existingDados, ...extractedData };
  
  // ═══════════════════════════════════════════════════════════════
  // PRIORITY 0: Check if awaiting multiple units response
  // If yes, DON'T block yet - let the flow continue
  // ═══════════════════════════════════════════════════════════════
  if ((merged as any).awaiting_multiple_units_response) {
    console.log(`[HARD_STOP] ⏳ Awaiting multiple units response - skipping minimum check`);
    return { blocked: false, valorDetected: null, message: null, estimatedFromConsumption: false, isMultipleUnits: false };
  }
  
  // Check if they already confirmed NO other accounts
  const confirmedNoOther = (merged as any).multiple_units_confirmed_no;
  const alreadyAskedMultiple = (merged as any).already_asked_multiple_units;
  
  // ═══════════════════════════════════════════════════════════════
  // PRIORITY 1: Check for multiple units (use sum)
  // ═══════════════════════════════════════════════════════════════
  if (merged.isMultipleUnits && merged.valorTotalEstimado) {
    const valorTotal = merged.valorTotalEstimado;
    const quantidade = merged.quantidadeUnidades || 'várias';
    const valoresStr = merged.valoresIndividuais?.map(v => `R$ ${v.toFixed(2)}`).join(', ') || '';
    const contextNote = merged.contextoCorporativo ? ` (${merged.contextoCorporativo})` : '';
    
    console.log(`[HARD_STOP] Multiple units detected: ${quantidade} bills totaling R$ ${valorTotal}${contextNote}`);
    
    if (valorTotal >= config.consumoMinimoReais) {
      // PASSES - sum is sufficient
      console.log(`[HARD_STOP] ✅ Multiple units QUALIFIED: R$ ${valorTotal} >= R$ ${config.consumoMinimoReais}`);
      return { 
        blocked: false, 
        valorDetected: valorTotal, 
        message: null, 
        estimatedFromConsumption: false,
        isMultipleUnits: true 
      };
    } else {
      // Sum is still low - block with special message
      console.log(`[HARD_STOP] ⛔ Multiple units but total still low: R$ ${valorTotal} < R$ ${config.consumoMinimoReais}`);
      
      const message = `Agradeço seu interesse! 💚

Analisando as ${quantidade} contas que você mencionou${contextNote} (${valoresStr ? valoresStr + ' = ' : ''}total de R$ ${valorTotal.toFixed(2)}), infelizmente o valor total ainda está abaixo do nosso limite mínimo de R$ ${config.consumoMinimoReais} para adesão.

Se o consumo das unidades aumentar ou se você conhecer alguém com conta acima de R$ ${config.consumoMinimoReais}, estamos à disposição! 😊`;
      
      return { blocked: true, valorDetected: valorTotal, message, estimatedFromConsumption: false, isMultipleUnits: true };
    }
  }
  
  // ═══════════════════════════════════════════════════════════════
  // PRIORITY 2: Standard single-account logic
  // ═══════════════════════════════════════════════════════════════
  let valorFatura = extractedData.valorFatura || existingDados.valorFatura || 
                    (extractedData as any).valorConta || (existingDados as any).valorConta ||
                    (extractedData as any).valor_fatura || (existingDados as any).valor_fatura;
  
  let estimatedFromConsumption = false;
  
  // GUARDRAIL #1: If no bill value, try to estimate from consumption (kWh)
  if (!valorFatura || typeof valorFatura !== 'number') {
    const consumoKwh = extractedData.consumo || existingDados.consumo ||
                       (extractedData as any).consumoKwh || (existingDados as any).consumoKwh;
    
    if (consumoKwh && typeof consumoKwh === 'number' && consumoKwh > 0) {
      // Conservative estimate: R$ 0.80/kWh (average tariff)
      valorFatura = consumoKwh * 0.80;
      estimatedFromConsumption = true;
      console.log(`[HARD_STOP] Estimating bill from consumption: ${consumoKwh}kWh × R$0.80 = R$ ${valorFatura.toFixed(2)}`);
    }
  }
  
  if (!valorFatura || typeof valorFatura !== 'number') {
    return { blocked: false, valorDetected: null, message: null, estimatedFromConsumption: false, isMultipleUnits: false };
  }

  if (valorFatura < config.consumoMinimoReais) {
    // ═══════════════════════════════════════════════════════════════
    // NEW: If below minimum BUT haven't asked about other accounts, don't block
    // Let the eligibility-check.ts handle asking the question
    // ═══════════════════════════════════════════════════════════════
    if (!alreadyAskedMultiple && !confirmedNoOther) {
      console.log(`[HARD_STOP] ⚠️ Below minimum R$ ${valorFatura.toFixed(2)} < R$ ${config.consumoMinimoReais} - but need to ask about other accounts first`);
      return { blocked: false, valorDetected: valorFatura, message: null, estimatedFromConsumption: false, isMultipleUnits: false };
    }
    
    console.log(`[HARD_STOP] ⛔ Minimum bill threshold: R$ ${valorFatura.toFixed(2)} < R$ ${config.consumoMinimoReais}${estimatedFromConsumption ? ' (estimated from kWh)' : ''}`);
    
    const estimateNote = estimatedFromConsumption 
      ? `\n\n_(Valor estimado com base no consumo informado)_` 
      : '';
    
    const message = `Agradeço seu interesse! 💚

Analisando os dados, infelizmente sua conta de R$ ${valorFatura.toFixed(2)} está abaixo do nosso limite mínimo de R$ ${config.consumoMinimoReais} para adesão ao programa de economia.

Isso acontece porque os custos operacionais tornam inviável oferecer desconto para contas menores.

Se sua conta aumentar no futuro ou se você conhecer alguém com conta acima de R$ ${config.consumoMinimoReais}, estamos à disposição! 😊${estimateNote}`;

    return { blocked: true, valorDetected: valorFatura, message, estimatedFromConsumption, isMultipleUnits: false };
  }

  return { blocked: false, valorDetected: valorFatura, message: null, estimatedFromConsumption, isMultipleUnits: false };
}

// ═══════════════════════════════════════════════════════════════
// HARD STOP #2: DOCUMENT REQUEST BLOCK
// Replaces any document request with platform link instruction
// ═══════════════════════════════════════════════════════════════

const DOCUMENT_REQUEST_PATTERNS = [
  /\b(envi[ae]|mand[ae]|anexe|anexar?).{0,30}(documento|rg|cnh|identidade|fatura|conta|contrato|carteirinha|comprovante)/i,
  /\b(documento|rg|cnh|identidade|foto).{0,30}(aqui|no\s+whatsapp|por\s+aqui|nessa\s+conversa)/i,
  /\bpreciso\s+(de|que).{0,30}(documento|rg|cnh|foto|scan|digitaliza)/i,
  /\bpode\s+enviar.{0,30}(documento|rg|cnh|foto|pdf)/i,
  /\baguardando.{0,30}(documento|foto|pdf|comprovante)/i,
];

export function detectDocumentRequestInMessage(message: string): boolean {
  const msgLower = message.toLowerCase();
  return DOCUMENT_REQUEST_PATTERNS.some(pattern => pattern.test(msgLower));
}

function buildDocumentBlockMessage(proposalUrl: string | null, clienteName: string | null): string {
  const firstName = clienteName?.split(' ')[0] || '';
  const greeting = firstName ? `${firstName}, ` : '';
  
  if (proposalUrl) {
    return `${greeting}para sua segurança, os documentos devem ser enviados através do link da sua proposta! 🔒

📎 Acesse aqui: ${proposalUrl}

Clique em *"Solicitar Contrato"* para anexar os arquivos de forma segura. 

Isso protege seus dados pessoais! 💚`;
  }

  return `${greeting}os documentos devem ser enviados de forma segura através da plataforma! 🔒

Assim que sua proposta estiver pronta, você receberá um link exclusivo para anexar os documentos com total segurança.

Aguarde só mais um pouquinho! 💚`;
}

// ═══════════════════════════════════════════════════════════════
// HARD STOP #3: PROPOSAL WITHOUT EMAIL
// Blocks proposal generation if email is missing
// ═══════════════════════════════════════════════════════════════

function checkEmailForProposal(
  extractedData: ExtractedClientData,
  existingDados: ExtractedClientData
): { hasEmail: boolean; requestMessage: string | null } {
  const email = extractedData.email || existingDados.email;
  
  if (email && typeof email === 'string' && email.includes('@')) {
    return { hasEmail: true, requestMessage: null };
  }

  return {
    hasEmail: false,
    requestMessage: `Para preparar sua proposta personalizada, preciso do seu *e-mail*! 📧

Assim você recebe todos os detalhes da economia que podemos oferecer.

Qual é o seu e-mail?`,
  };
}

// ═══════════════════════════════════════════════════════════════
// HARD STOP #4: TRIAGE CONTEXT BYPASS
// Skips triage if commercial data already exists
// ═══════════════════════════════════════════════════════════════

function checkTriageBypass(
  conversa: HardStopConversaData | null,
  extractedData: ExtractedClientData,
  existingDados: ExtractedClientData
): { shouldSkip: boolean; reason: string | null } {
  if (!conversa) {
    return { shouldSkip: false, reason: null };
  }

  const dados = conversa.dados_coletados || {};
  const merged = { ...existingDados, ...extractedData };

  // 1. Has distribuidora
  const hasDistribuidora = !!(
    merged.distribuidora || 
    dados.distribuidora || 
    dados.distribuidoraInformada
  );

  // 2. Has value
  const hasValue = !!(
    merged.valorFatura || 
    (merged as any).valorConta ||
    (dados as any).valorFatura ||
    (dados as any).valor_fatura ||
    (dados as any).consumo
  );

  // 3. Has email
  const hasEmail = !!(merged.email || dados.email);

  // 4. Has proposal
  const hasProposal = !!(conversa.proposta_id || dados.proposta_id);

  // 5. Bitrix stage past NEW
  const bitrixStage = conversa.bitrix24_stage;
  const pastNewStage = bitrixStage && bitrixStage !== 'NEW';

  // Check conditions for skip
  if (hasProposal) {
    return { shouldSkip: true, reason: 'has_proposta_id' };
  }

  if (pastNewStage) {
    return { shouldSkip: true, reason: `bitrix_stage:${bitrixStage}` };
  }

  if (hasDistribuidora && hasValue) {
    return { shouldSkip: true, reason: 'has_commercial_data' };
  }

  if (hasDistribuidora && hasEmail) {
    return { shouldSkip: true, reason: 'has_distribuidora_and_email' };
  }

  return { shouldSkip: false, reason: null };
}

// ═══════════════════════════════════════════════════════════════
// HARD STOP #5: RECENT DISQUALIFICATION BLOCK
// Prevents re-entry within cooldown period
// ═══════════════════════════════════════════════════════════════

async function checkRecentDisqualification(
  supabase: any,
  phone: string,
  agentId: string,
  cooldownDays: number
): Promise<{ blocked: boolean; discardReason: string | null; discardedAt: string | null }> {
  const cooldownDate = new Date();
  cooldownDate.setDate(cooldownDate.getDate() - cooldownDays);

  const { data: recentDiscarded } = await supabase
    .from('chatbot_conversas')
    .select('id, ended_at, sofia_mode, dados_coletados')
    .eq('cliente_telefone', phone)
    .eq('agent_id', agentId)
    .eq('sofia_mode', 'descartado')
    .gte('ended_at', cooldownDate.toISOString())
    .order('ended_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recentDiscarded) {
    const discardReason = (recentDiscarded.dados_coletados as any)?.motivoDescarte || 'lead_descartado';
    console.log(`[HARD_STOP] ⛔ Recent disqualification: ${discardReason} (${recentDiscarded.ended_at})`);
    
    return {
      blocked: true,
      discardReason,
      discardedAt: recentDiscarded.ended_at,
    };
  }

  return { blocked: false, discardReason: null, discardedAt: null };
}

// ═══════════════════════════════════════════════════════════════
// MAIN EXECUTOR
// ═══════════════════════════════════════════════════════════════

export async function executePreLLMHardStops(
  supabaseUrl: string,
  supabaseKey: string,
  ctx: HardStopContext
): Promise<HardStopResult> {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const config = await loadHardStopConfig(supabase);
  
  const result: HardStopResult = {
    blocked: false,
    blockType: null,
    responseMessage: null,
    shouldDiscard: false,
    discardReason: null,
    skipTriage: false,
    triageBypassReason: null,
    requireEmail: false,
    blockDocumentRequest: false,
    logDetails: {},
  };

  console.log(`[HARD_STOP] Executing pre-LLM checks for ${ctx.phone}`);

  // 1. Check minimum bill threshold (now supports multiple units)
  const billCheck = checkMinimumBillThreshold(ctx.extractedData, ctx.existingDados, config);
  if (billCheck.blocked) {
    result.blocked = true;
    result.blockType = 'minimum_bill_threshold';
    result.responseMessage = billCheck.message;
    result.shouldDiscard = true;
    result.discardReason = billCheck.isMultipleUnits 
      ? `Baixo Consumo Total (R$ ${billCheck.valorDetected} - múltiplas contas)`
      : `Baixo Consumo (R$ ${billCheck.valorDetected})`;
    result.logDetails.valorFatura = billCheck.valorDetected;
    result.logDetails.threshold = config.consumoMinimoReais;
    result.logDetails.isMultipleUnits = billCheck.isMultipleUnits;
    
    console.log(`[HARD_STOP] ⛔ BLOCKED: minimum_bill_threshold (R$ ${billCheck.valorDetected})${billCheck.isMultipleUnits ? ' [MULTIPLE UNITS]' : ''}`);
    return result;
  }

  // 2. Check recent disqualification
  const disqualCheck = await checkRecentDisqualification(
    supabase,
    ctx.phone,
    ctx.agentId,
    config.disqualificationCooldownDays
  );
  if (disqualCheck.blocked) {
    result.blocked = true;
    result.blockType = 'recent_disqualification';
    result.responseMessage = null; // Silent block - don't respond
    result.logDetails.previousDiscardReason = disqualCheck.discardReason;
    result.logDetails.discardedAt = disqualCheck.discardedAt;
    
    console.log(`[HARD_STOP] ⛔ BLOCKED: recent_disqualification (${disqualCheck.discardReason})`);
    return result;
  }

  // 3. Check triage bypass
  const triageCheck = checkTriageBypass(ctx.conversa, ctx.extractedData, ctx.existingDados);
  if (triageCheck.shouldSkip) {
    result.skipTriage = true;
    result.triageBypassReason = triageCheck.reason;
    result.logDetails.triageBypass = triageCheck.reason;
    
    console.log(`[HARD_STOP] ✅ Triage bypassed: ${triageCheck.reason}`);
  }

  // 4. Check email for proposal (non-blocking, just flag)
  if (ctx.propostaId || ctx.proposalUrl) {
    const emailCheck = checkEmailForProposal(ctx.extractedData, ctx.existingDados);
    if (!emailCheck.hasEmail) {
      result.requireEmail = true;
      result.logDetails.emailMissing = true;
    }
  }

  // 5. Document request block (will be applied post-LLM to intercept responses)
  if (config.documentBlockEnabled) {
    result.blockDocumentRequest = true;
  }

  console.log(`[HARD_STOP] ✅ All checks passed, proceeding to LLM`);
  return result;
}

// ═══════════════════════════════════════════════════════════════
// POST-LLM INTERCEPTOR
// Intercepts LLM response to block document requests
// ═══════════════════════════════════════════════════════════════

export function interceptDocumentRequest(
  llmResponse: string,
  proposalUrl: string | null,
  clienteName: string | null,
  blockEnabled: boolean
): { intercepted: boolean; newResponse: string | null } {
  if (!blockEnabled) {
    return { intercepted: false, newResponse: null };
  }

  if (detectDocumentRequestInMessage(llmResponse)) {
    console.log(`[HARD_STOP] ⛔ Intercepted document request in LLM response`);
    const newResponse = buildDocumentBlockMessage(proposalUrl, clienteName);
    return { intercepted: true, newResponse };
  }

  return { intercepted: false, newResponse: null };
}

// ═══════════════════════════════════════════════════════════════
// DISCARD HANDLER
// Marks conversation as discarded and cleans up automations
// ═══════════════════════════════════════════════════════════════

export async function handleDiscardFromHardStop(
  supabaseUrl: string,
  supabaseKey: string,
  conversaId: string,
  discardReason: string,
  responseMessage: string | null,
  sendMessage: (phone: string, msg: string) => Promise<void>,
  phone: string
): Promise<void> {
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  // Update conversation to discarded state
  await supabase
    .from('chatbot_conversas')
    .update({
      sofia_mode: 'descartado',
      ended_at: new Date().toISOString(),
      next_followup_at: null,
      next_nudge_at: null,
      next_rescue_at: null,
      next_contract_nudge_at: null,
      pending_task: null,
      awaiting_response: false,
      dados_coletados: supabase.rpc('jsonb_set', {
        target: 'dados_coletados',
        path: '{motivoDescarte}',
        value: JSON.stringify(discardReason),
      }),
    })
    .eq('id', conversaId);

  // Send response message if provided
  if (responseMessage) {
    await sendMessage(phone, responseMessage);
    
    // Save assistant message
    await supabase.from('chatbot_mensagens').insert({
      conversa_id: conversaId,
      role: 'assistant',
      content: responseMessage,
    });
  }

  console.log(`[HARD_STOP] Conversation ${conversaId} marked as discarded: ${discardReason}`);
}
