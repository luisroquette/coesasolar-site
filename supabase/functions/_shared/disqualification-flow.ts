/**
 * Disqualification Flow Handler
 * Centralized handler for disqualifying leads (Grupo A, Tarifa Social, Distributor not attended, etc.)
 * Extracted from sofia-webhook/index.ts (Phase 13 refactoring)
 * 
 * This module handles:
 * 1. Detection of disqualification reasons
 * 2. Sending polite rejection messages
 * 3. Moving lead to JUNK in Bitrix24
 * 4. Updating conversation state
 */

import { 
  detectGrupoA, 
  detectTarifaSocial,
  isConsumoBaixo,
  loadDisqualificationConfig,
  detectSolarExcessOpportunity,
  detectGeracaoPropria,
  type DisqualificationReason,
  type SolarExcessResult,
} from './disqualification-rules.ts';

import {
  getClientMessage,
  buildCRMComment,
} from './disqualification-messages.ts';

import { type PatternEntry } from './detection-patterns.ts';
import {
  processMultipleUnitsResponse,
  type MultipleUnitsResponseResult,
} from './eligibility-check.ts';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface DisqualificationFlowParams {
  supabase: any;
  conversaId: string;
  phone: string;
  clienteNome: string | null;
  messageText: string;
  existingDados: Record<string, unknown> | object;
  extractedData: Record<string, unknown> | object;
  conversa: {
    bitrix24_lead_id?: string | null;
    sofia_mode?: string | null;
  } | null;
  detectionPatterns?: Map<string, PatternEntry>;
  sendMessage: (phone: string, message: string) => Promise<void>;
  agentName?: string;
}

export interface DisqualificationFlowResult {
  handled: boolean;
  reason: DisqualificationReason | 'distribuidora_nao_atendida' | null;
  status: string;
  bitrixUpdated?: boolean;
  shouldWaitForMultipleUnits?: boolean;
  solarExcessResult?: SolarExcessResult;
}

interface BitrixConfig {
  webhookUrl: string | null;
  enabled: boolean;
  stageDescartado: string;
  stageConcessionariaNaoAtendida: string;
}

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Load Bitrix24 configuration for disqualification
 */
async function loadBitrixConfig(supabase: any): Promise<BitrixConfig> {
  const { data: bitrixConfig } = await supabase
    .from('configuracoes_sistema')
    .select('chave, valor')
    .in('chave', [
      'bitrix24_webhook_url', 
      'bitrix24_enabled', 
      'bitrix24_stage_descartado',
      'bitrix24_stage_concessionaria_nao_atendida',
    ]);
  
  const configMap: Record<string, string> = {};
  bitrixConfig?.forEach((c: { chave: string; valor: string }) => { 
    configMap[c.chave] = c.valor; 
  });
  
  return {
    webhookUrl: configMap.bitrix24_webhook_url || null,
    enabled: configMap.bitrix24_enabled === 'true',
    stageDescartado: configMap.bitrix24_stage_descartado || 'JUNK',
    // Fallback to JUNK if not configured, but should be UC_56ZLAR
    stageConcessionariaNaoAtendida: configMap.bitrix24_stage_concessionaria_nao_atendida || 'JUNK',
  };
}

/**
 * Move lead to JUNK in Bitrix24 with comment
 */
async function moveLeadToJunk(
  bitrixConfig: BitrixConfig,
  leadId: string,
  reason: string,
  comment: string
): Promise<boolean> {
  if (!bitrixConfig.webhookUrl || !bitrixConfig.enabled) {
    console.log(`[DISQ_FLOW] Bitrix24 not configured, skipping CRM update`);
    return false;
  }
  
  try {
    // Update lead status
    await fetch(`${bitrixConfig.webhookUrl}crm.lead.update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        id: leadId, 
        fields: { STATUS_ID: bitrixConfig.stageDescartado }
      }),
    });
    
    // Add timeline comment
    await fetch(`${bitrixConfig.webhookUrl}crm.timeline.comment.add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          ENTITY_ID: leadId,
          ENTITY_TYPE: 'lead',
          COMMENT: comment,
        },
      }),
    });
    
    console.log(`[DISQ_FLOW] Lead ${leadId} moved to ${bitrixConfig.stageDescartado} (${reason})`);
    return true;
  } catch (error) {
    console.error(`[DISQ_FLOW] Error moving lead to JUNK:`, error);
    return false;
  }
}

/**
 * Update conversation with disqualification state
 */
async function updateConversationDisqualified(
  supabase: any,
  conversaId: string,
  dados: Record<string, unknown>,
  motivoDescarte: string,
  bitrixStage: string = 'JUNK'
): Promise<void> {
  await supabase
    .from('chatbot_conversas')
    .update({
      dados_coletados: { ...dados, motivoDescarte },
      sofia_mode: 'descartado',
      bitrix24_stage: bitrixStage,
      ended_at: new Date().toISOString(),
      // Stop ALL automations
      awaiting_response: false,
      nudge_count: 0,
      next_nudge_at: null,
      next_followup_at: null,
      next_rescue_at: null,
      next_contract_nudge_at: null,
      last_message_at: new Date().toISOString(),
    })
    .eq('id', conversaId);
}

/**
 * Move lead to "Concessionária Não Atendida" stage in Bitrix24
 * Uses UC_56ZLAR (or configured value) instead of JUNK for future reactivation
 */
async function moveLeadToConcessionariaNaoAtendida(
  bitrixConfig: BitrixConfig,
  leadId: string,
  distribuidora: string,
  comment: string
): Promise<boolean> {
  if (!bitrixConfig.webhookUrl || !bitrixConfig.enabled) {
    console.log(`[DISQ_FLOW] Bitrix24 not configured, skipping CRM update for concessionária não atendida`);
    return false;
  }
  
  try {
    // Update lead status to UC_56ZLAR (Concessionária Não Atendida)
    await fetch(`${bitrixConfig.webhookUrl}crm.lead.update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        id: leadId, 
        fields: { STATUS_ID: bitrixConfig.stageConcessionariaNaoAtendida }
      }),
    });
    
    // Add timeline comment
    await fetch(`${bitrixConfig.webhookUrl}crm.timeline.comment.add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          ENTITY_ID: leadId,
          ENTITY_TYPE: 'lead',
          COMMENT: comment,
        },
      }),
    });
    
    console.log(`[DISQ_FLOW] Lead ${leadId} moved to Concessionária Não Atendida (${bitrixConfig.stageConcessionariaNaoAtendida}) - ${distribuidora}`);
    return true;
  } catch (error) {
    console.error(`[DISQ_FLOW] Error moving lead to Concessionária Não Atendida:`, error);
    return false;
  }
}

/**
 * Save message to conversation history
 */
async function saveMessageToHistory(
  supabase: any,
  conversaId: string,
  message: string
): Promise<void> {
  await supabase.from('chatbot_mensagens').insert({
    conversa_id: conversaId,
    role: 'assistant',
    content: message,
  });
}

// ═══════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════

/**
 * Handle Grupo A disqualification flow
 */
export async function handleGrupoADisqualification(
  params: DisqualificationFlowParams
): Promise<DisqualificationFlowResult> {
  const {
    supabase,
    conversaId,
    phone,
    messageText,
    existingDados,
    extractedData,
    conversa,
    detectionPatterns,
    sendMessage,
    agentName,
  } = params;
  
  // Cast to Record for type safety
  const existingDadosRecord = existingDados as Record<string, unknown>;
  const extractedDataRecord = extractedData as Record<string, unknown>;
  
  // Skip if already disqualified
  if (existingDadosRecord.motivoDescarte) {
    return { handled: false, reason: null, status: 'already_disqualified' };
  }
  
  // Check for Grupo A
  const isGrupoA = detectGrupoA(messageText, existingDadosRecord, detectionPatterns);
  if (!isGrupoA) {
    return { handled: false, reason: null, status: 'not_grupo_a' };
  }
  
  console.log(`[DISQ_FLOW] Grupo A detected - disqualifying lead`);
  
  // Get message from database (with fallback)
  const mensagemGrupoA = await getClientMessage(supabase, 'grupo_a');
  await sendMessage(phone, mensagemGrupoA);
  await saveMessageToHistory(supabase, conversaId, mensagemGrupoA);
  
  // Move to JUNK in Bitrix24
  let bitrixUpdated = false;
  const bitrixLeadId = conversa?.bitrix24_lead_id;
  if (bitrixLeadId) {
    const bitrixConfig = await loadBitrixConfig(supabase);
    const crmComment = await buildCRMComment(supabase, 'grupo_a', agentName || 'sofIA');
    bitrixUpdated = await moveLeadToJunk(bitrixConfig, bitrixLeadId, 'Grupo A', crmComment);
  }
  
  // Update conversation (merge existing + extracted to avoid data loss)
  await updateConversationDisqualified(
    supabase,
    conversaId,
    { ...existingDadosRecord, ...extractedDataRecord, isGrupoA: true },
    'grupo_a'
  );
  
  return {
    handled: true,
    reason: 'grupo_a',
    status: 'disqualified',
    bitrixUpdated,
  };
}

/**
 * Handle Tarifa Social disqualification flow
 */
export async function handleTarifaSocialDisqualification(
  params: DisqualificationFlowParams
): Promise<DisqualificationFlowResult> {
  const {
    supabase,
    conversaId,
    phone,
    messageText,
    existingDados,
    extractedData,
    conversa,
    detectionPatterns,
    sendMessage,
    agentName,
  } = params;
  
  // Cast to Record for type safety
  const existingDadosRecord = existingDados as Record<string, unknown>;
  const extractedDataRecord = extractedData as Record<string, unknown>;
  
  // Skip if already disqualified
  if (existingDadosRecord.motivoDescarte) {
    return { handled: false, reason: null, status: 'already_disqualified' };
  }
  
  // Check for Tarifa Social
  const isTarifaSocial = detectTarifaSocial(messageText, existingDadosRecord, detectionPatterns);
  if (!isTarifaSocial) {
    return { handled: false, reason: null, status: 'not_tarifa_social' };
  }
  
  console.log(`[DISQ_FLOW] Tarifa Social detected - disqualifying lead`);
  
  // Get message from database (with fallback)
  const mensagemTarifaSocial = await getClientMessage(supabase, 'tarifa_social');
  await sendMessage(phone, mensagemTarifaSocial);
  await saveMessageToHistory(supabase, conversaId, mensagemTarifaSocial);
  
  // Move to JUNK in Bitrix24
  let bitrixUpdated = false;
  const bitrixLeadId = conversa?.bitrix24_lead_id;
  if (bitrixLeadId) {
    const bitrixConfig = await loadBitrixConfig(supabase);
    const crmComment = await buildCRMComment(supabase, 'tarifa_social', agentName || 'sofIA');
    bitrixUpdated = await moveLeadToJunk(bitrixConfig, bitrixLeadId, 'Tarifa Social', crmComment);
  }
  
  // Update conversation (merge existing + extracted to avoid data loss)
  await updateConversationDisqualified(
    supabase,
    conversaId,
    { ...existingDadosRecord, ...extractedDataRecord, tarifaSocial: true },
    'tarifa_social'
  );
  
  return {
    handled: true,
    reason: 'tarifa_social',
    status: 'disqualified',
    bitrixUpdated,
  };
}

/**
 * Handle Distributor not attended disqualification flow
 * UPDATED: Now moves to UC_56ZLAR (Concessionária Não Atendida) instead of JUNK
 * This allows future reactivation when new regions are attended
 */
export async function handleDistribuidoraNaoAtendida(
  params: DisqualificationFlowParams & {
    distribuidora: string;
    rejectionMessage: string;
  }
): Promise<DisqualificationFlowResult> {
  const {
    supabase,
    conversaId,
    phone,
    distribuidora,
    rejectionMessage,
    extractedData,
    conversa,
    sendMessage,
  } = params;
  
  console.log(`[DISQ_FLOW] Distributor NOT attended: ${distribuidora} - Moving to Concessionária Não Atendida`);
  
  // Send rejection message
  await sendMessage(phone, rejectionMessage);
  await saveMessageToHistory(supabase, conversaId, rejectionMessage);
  
  // Load Bitrix config to get the specific stage for concessionária não atendida
  const bitrixConfig = await loadBitrixConfig(supabase);
  
  // Move to Concessionária Não Atendida (UC_56ZLAR) in Bitrix24 (NOT JUNK!)
  let bitrixUpdated = false;
  const bitrixLeadId = conversa?.bitrix24_lead_id;
  if (bitrixLeadId) {
    const crmComment = `📍 Lead movido para Concessionária Não Atendida\n\n📋 Distribuidora: ${distribuidora}\n📅 Data: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\n\n💡 Motivo: Região ainda não atendida. Lead pode ser reativado quando houver expansão para esta concessionária.`;
    bitrixUpdated = await moveLeadToConcessionariaNaoAtendida(bitrixConfig, bitrixLeadId, distribuidora, crmComment);
  }
  
  // Update conversation (merge existing + extracted to avoid data loss)
  // Note: For distribuidora flow, existingDados comes from params
  const existingDadosFromParams = params.existingDados as Record<string, unknown>;
  await updateConversationDisqualified(
    supabase,
    conversaId,
    { ...existingDadosFromParams, ...extractedData, distribuidoraNaoAtendida: true },
    'distribuidora_nao_atendida',
    bitrixConfig.stageConcessionariaNaoAtendida // Use UC_56ZLAR, not JUNK
  );
  
  return {
    handled: true,
    reason: 'distribuidora_nao_atendida',
    status: 'disqualified',
    bitrixUpdated,
  };
}

/**
 * Handle Consumo Baixo (low consumption/bill) disqualification flow
 * IMMEDIATE disqualification when valorFatura < minimum configured threshold
 */
export async function handleConsumoBaixoDisqualification(
  params: DisqualificationFlowParams
): Promise<DisqualificationFlowResult> {
  const {
    supabase,
    conversaId,
    phone,
    messageText,
    existingDados,
    extractedData,
    conversa,
    sendMessage,
    agentName,
  } = params;
  
  // Cast to Record for type safety
  const existingDadosRecord = existingDados as Record<string, unknown>;
  const extractedDataRecord = extractedData as Record<string, unknown>;
  
  // Skip if already disqualified
  if (existingDadosRecord.motivoDescarte) {
    return { handled: false, reason: null, status: 'already_disqualified' };
  }
  
  // ═══════════════════════════════════════════════════════════════
  // STEP 1: Check if we're awaiting multiple units response
  // ═══════════════════════════════════════════════════════════════
  const awaitingMultipleUnits = !!existingDadosRecord.awaiting_multiple_units_response;
  
  if (awaitingMultipleUnits && messageText) {
    console.log(`[DISQ_FLOW] Processing multiple units response...`);
    
    const existingValor = (existingDadosRecord.valorFatura as number) || 0;
    const responseResult = processMultipleUnitsResponse(messageText, existingValor);
    
    if (responseResult.hasOtherAccounts) {
      console.log(`[DISQ_FLOW] ✅ Client has other accounts - clearing awaiting flag, will re-evaluate`);
      
      // Update dados_coletados to clear awaiting flag
      const updatedDados: Record<string, unknown> = {
        ...existingDadosRecord,
        ...extractedDataRecord,
        awaiting_multiple_units_response: false,
        multiple_units_confirmed_yes: true,
      };
      
      // If a new value was detected, add it
      if (responseResult.newValorTotal) {
        updatedDados.valorTotalEstimado = responseResult.newValorTotal;
        updatedDados.isMultipleUnits = true;
      }
      
      await supabase
        .from('chatbot_conversas')
        .update({ dados_coletados: updatedDados })
        .eq('id', conversaId);
      
      // Don't disqualify - let the flow continue to collect more info
      return { handled: false, reason: null, status: 'has_other_accounts', shouldWaitForMultipleUnits: true };
    }
    
    if (responseResult.confirmedNo) {
      console.log(`[DISQ_FLOW] ⛔ Client confirmed NO other accounts - proceeding with disqualification`);
      
      // Update dados_coletados
      const updatedDados = {
        ...existingDadosRecord,
        ...extractedDataRecord,
        awaiting_multiple_units_response: false,
        multiple_units_confirmed_no: true,
      };
      
      await supabase
        .from('chatbot_conversas')
        .update({ dados_coletados: updatedDados })
        .eq('id', conversaId);
      
      // Proceed with disqualification below
    } else if (responseResult.unclear) {
      console.log(`[DISQ_FLOW] ❓ Unclear response about other accounts - will let LLM handle`);
      return { handled: false, reason: null, status: 'unclear_multiple_units_response' };
    }
  }
  
  // Get value from EXTRACTED data (not existing) - this is the NEW value just informed
  const valorFatura = extractedDataRecord.valorFatura as number | undefined;
  const consumoKwh = extractedDataRecord.consumo as number | undefined;
  
  // Also check merged data in case value was already set
  const valorMerged = valorFatura || (existingDadosRecord.valorFatura as number | undefined);
  const consumoMerged = consumoKwh || (existingDadosRecord.consumo as number | undefined);
  
  // Check for valorTotalEstimado (multiple units sum)
  const valorTotal = (extractedDataRecord.valorTotalEstimado as number) || 
                     (existingDadosRecord.valorTotalEstimado as number);
  
  // Use the highest available value (preferring sum if available)
  const effectiveValor = valorTotal || valorMerged;
  
  // If no value informed yet, skip check
  if (!effectiveValor && !consumoMerged) {
    return { handled: false, reason: null, status: 'no_value_informed' };
  }
  
  // Load config to get current thresholds
  const config = await loadDisqualificationConfig(supabase);
  
  // Check if consumption/value is below minimum
  const isBelowMinimum = isConsumoBaixo(consumoMerged || null, effectiveValor || null);
  
  // ═══════════════════════════════════════════════════════════════
  // STEP 2: If below minimum but haven't asked about other accounts, DON'T disqualify yet
  // ═══════════════════════════════════════════════════════════════
  const alreadyAskedMultiple = !!existingDadosRecord.already_asked_multiple_units;
  const confirmedNoOther = !!existingDadosRecord.multiple_units_confirmed_no;
  
  if (isBelowMinimum && !alreadyAskedMultiple && !confirmedNoOther) {
    console.log(`[DISQ_FLOW] ⚠️ Below minimum but haven't asked about other accounts yet - skipping disqualification`);
    return { handled: false, reason: null, status: 'should_ask_multiple_units_first', shouldWaitForMultipleUnits: true };
  }
  
  if (!isBelowMinimum) {
    return { handled: false, reason: null, status: 'value_above_minimum' };
  }
  
  console.log(`[DISQ_FLOW] ⚡ CONSUMO BAIXO DETECTED - valorFatura=${effectiveValor}, consumo=${consumoMerged}, minReais=${config.consumoMinimoReais}, minKwh=${config.consumoMinimoKwh}`);
  
  // Build personalized message
  const minValueMsg = config.consumoMinimoReais > 0 
    ? `R$ ${config.consumoMinimoReais}` 
    : `${config.consumoMinimoKwh} kWh`;
  
  const valorInformado = effectiveValor 
    ? `R$ ${effectiveValor}` 
    : `${consumoMerged} kWh`;
  
  // Different message if they already confirmed no other accounts
  let mensagemConsumoBaixo: string;
  
  if (confirmedNoOther) {
    mensagemConsumoBaixo = `Agradeco sua resposta! 💚

Infelizmente, como sua conta de *${valorInformado}* esta abaixo do nosso limite minimo de *${minValueMsg}/mes*, nao conseguimos oferecer o desconto neste momento.

Isso acontece porque os custos operacionais tornam inviavel a economia para contas menores.

Se sua conta aumentar no futuro, ou se voce tiver outras unidades (casa, comercio, etc.) que somadas atinjam esse valor, e so me chamar! 💚`;
  } else {
    mensagemConsumoBaixo = `Entendi! Voce informou uma conta de *${valorInformado}* 💡

Infelizmente, para que a economia com energia solar faca sentido, a fatura precisa ser de pelo menos *${minValueMsg}/mes*.

Com valores menores, os custos de gestao acabam consumindo a economia gerada.

Se sua conta aumentar no futuro, e so me chamar! 💚`;
  }
  
  await sendMessage(phone, mensagemConsumoBaixo);
  await saveMessageToHistory(supabase, conversaId, mensagemConsumoBaixo);
  
  // Move to JUNK in Bitrix24
  let bitrixUpdated = false;
  const bitrixLeadId = conversa?.bitrix24_lead_id;
  if (bitrixLeadId) {
    const bitrixConfig = await loadBitrixConfig(supabase);
    const crmComment = `🚫 Lead Descartado automaticamente\n\n📋 Motivo: Consumo Baixo (${valorInformado} < ${minValueMsg})\n📅 Data: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\n🤖 Agente: ${agentName || 'sofIA'}`;
    bitrixUpdated = await moveLeadToJunk(bitrixConfig, bitrixLeadId, 'Consumo Baixo', crmComment);
  }
  
  // Update conversation with merged data
  await updateConversationDisqualified(
    supabase,
    conversaId,
    { ...existingDadosRecord, ...extractedDataRecord, consumoBaixo: true },
    'consumo_baixo'
  );
  
  return {
    handled: true,
    reason: 'consumo_baixo',
    status: 'disqualified',
    bitrixUpdated,
  };
}

/**
 * Handle Geração Própria (solar panels) - with EXCESS protection
 * CRITICAL: If client has excess consumption, DO NOT disqualify!
 */
export async function handleGeracaoPropriaWithExcess(
  params: DisqualificationFlowParams
): Promise<DisqualificationFlowResult> {
  const {
    supabase,
    conversaId,
    phone,
    messageText,
    existingDados,
    extractedData,
    conversa,
    detectionPatterns,
    sendMessage,
    agentName,
  } = params;
  
  const existingDadosRecord = existingDados as Record<string, unknown>;
  const extractedDataRecord = extractedData as Record<string, unknown>;
  
  // Skip if already disqualified
  if (existingDadosRecord.motivoDescarte) {
    return { handled: false, reason: null, status: 'already_disqualified' };
  }
  
  // Get bill value from collected data
  const billValue = (extractedDataRecord.valorFatura as number) || 
                    (existingDadosRecord.valorFatura as number) || 
                    null;
  
  // Check for solar panels with excess opportunity
  const solarResult = detectSolarExcessOpportunity(
    messageText, 
    detectionPatterns,
    billValue
  );
  
  if (!solarResult.hasSolar) {
    return { handled: false, reason: null, status: 'no_solar_detected' };
  }
  
  console.log(`[DISQ_FLOW] Solar detected! hasSolar=${solarResult.hasSolar}, hasExcess=${solarResult.hasExcess}, indicator=${solarResult.excessIndicator}, value=${solarResult.estimatedValue}`);
  
  // ═══════════════════════════════════════════════════════════════
  // CRITICAL: If has excess consumption, DO NOT DISQUALIFY
  // Mark data and let LLM explain the excess opportunity
  // ═══════════════════════════════════════════════════════════════
  if (solarResult.hasExcess) {
    console.log(`[DISQ_FLOW] ✅ Solar with EXCESS detected - NOT disqualifying, can serve excedente`);
    
    // Update conversation with solar excess flags (but don't disqualify)
    await supabase
      .from('chatbot_conversas')
      .update({
        dados_coletados: {
          ...existingDadosRecord,
          ...extractedDataRecord,
          hasGeracaoPropria: true,
          hasExcessoConsumo: true,
          excessIndicator: solarResult.excessIndicator,
          solarExcessValue: solarResult.estimatedValue,
        },
      })
      .eq('id', conversaId);
    
    // Return not handled - let LLM process with the rule_memory guidance
    return {
      handled: false,
      reason: null,
      status: 'solar_with_excess_opportunity',
      solarExcessResult: solarResult,
    };
  }
  
  // ═══════════════════════════════════════════════════════════════
  // No excess detected - ASK about bill value before disqualifying
  // ═══════════════════════════════════════════════════════════════
  if (solarResult.estimatedValue === null) {
    console.log(`[DISQ_FLOW] ⚠️ Solar detected but no bill value - asking before disqualifying`);
    
    // Mark as having solar, but don't disqualify yet
    await supabase
      .from('chatbot_conversas')
      .update({
        dados_coletados: {
          ...existingDadosRecord,
          ...extractedDataRecord,
          hasGeracaoPropria: true,
          awaiting_solar_bill_value: true,
        },
      })
      .eq('id', conversaId);
    
    // Let LLM ask about bill value
    return {
      handled: false,
      reason: null,
      status: 'solar_awaiting_bill_value',
      solarExcessResult: solarResult,
    };
  }
  
  // ═══════════════════════════════════════════════════════════════
  // Low bill value - disqualify gracefully
  // ═══════════════════════════════════════════════════════════════
  console.log(`[DISQ_FLOW] ⛔ Solar with LOW bill value (${solarResult.estimatedValue}) - disqualifying`);
  
  const mensagemSolarBaixo = await getClientMessage(supabase, 'geracao_propria');
  await sendMessage(phone, mensagemSolarBaixo);
  await saveMessageToHistory(supabase, conversaId, mensagemSolarBaixo);
  
  // Move to JUNK in Bitrix24
  let bitrixUpdated = false;
  const bitrixLeadId = conversa?.bitrix24_lead_id;
  if (bitrixLeadId) {
    const bitrixConfig = await loadBitrixConfig(supabase);
    const crmComment = await buildCRMComment(supabase, 'geracao_propria', agentName || 'sofIA');
    bitrixUpdated = await moveLeadToJunk(bitrixConfig, bitrixLeadId, 'Geração Própria (100%)', crmComment);
  }
  
  await updateConversationDisqualified(
    supabase,
    conversaId,
    { ...existingDadosRecord, ...extractedDataRecord, hasGeracaoPropria: true, geracaoCobreTudo: true },
    'geracao_propria'
  );
  
  return {
    handled: true,
    reason: 'geracao_propria',
    status: 'disqualified',
    bitrixUpdated,
    solarExcessResult: solarResult,
  };
}

/**
 * Unified disqualification check - runs all checks in sequence
 * Returns early on first match
 * 
 * ORDER MATTERS: 
 * 1. Solar with Excess - check FIRST to protect qualified leads
 * 2. Consumo Baixo - most common disqualification
 * 3. Grupo A
 * 4. Tarifa Social
 */
export async function handleDisqualificationFlow(
  params: DisqualificationFlowParams
): Promise<DisqualificationFlowResult> {
  // ═══════════════════════════════════════════════════════════════
  // PRIORITY 0: SOLAR WITH EXCESS (protect qualified leads)
  // Check BEFORE consumo baixo to prevent false disqualification
  // ═══════════════════════════════════════════════════════════════
  const solarResult = await handleGeracaoPropriaWithExcess(params);
  if (solarResult.handled) {
    return solarResult;
  }
  // If solar with excess, let LLM handle it (status = solar_with_excess_opportunity)
  if (solarResult.status === 'solar_with_excess_opportunity') {
    return solarResult;
  }
  
  // ═══════════════════════════════════════════════════════════════
  // PRIORITY 1: CONSUMO BAIXO (most common disqualification)
  // Check IMMEDIATELY when value is informed to save processing time
  // ═══════════════════════════════════════════════════════════════
  const consumoBaixoResult = await handleConsumoBaixoDisqualification(params);
  if (consumoBaixoResult.handled) {
    return consumoBaixoResult;
  }
  
  // Check Grupo A
  const grupoAResult = await handleGrupoADisqualification(params);
  if (grupoAResult.handled) {
    return grupoAResult;
  }
  
  // Check Tarifa Social
  const tarifaSocialResult = await handleTarifaSocialDisqualification(params);
  if (tarifaSocialResult.handled) {
    return tarifaSocialResult;
  }
  
  // Note: Distributor check is separate because it needs validation data
  // Call handleDistribuidoraNaoAtendida directly when needed
  
  return {
    handled: false,
    reason: null,
    status: 'not_disqualified',
  };
}
