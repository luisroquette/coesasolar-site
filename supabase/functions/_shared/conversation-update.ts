/**
 * Conversation Update Module
 * Centralizes post-response updates: nudge tracking, data persistence, contact sync
 * Extracted from sofia-webhook/index.ts (Phase 20 refactoring)
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface ConversaData {
  id: string;
  cliente_nome?: string | null;
  cliente_email?: string | null;
  dados_coletados?: Record<string, unknown> | null;
  proposta_id?: string | null;
  bitrix24_lead_id?: string | null;
  bitrix24_stage?: string | null;
}

export interface ExtractedData {
  nome?: string | null;
  email?: string | null;
  cpf?: string | null;
  cnpj?: string | null;
  distribuidora?: string | null;
  valorFatura?: number | null;
  consumo?: number | null;
  tipoInstalacao?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
  logradouro?: string | null;
  endereco?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  [key: string]: unknown;
}

export interface ConversationUpdateContext {
  supabase: SupabaseClient;
  conversaId: string;
  phone: string;
  conversa: ConversaData | null;
  clienteNome: string | null;
  extractedData: ExtractedData;
  newScore: number;
  finalMode: string;
  totalMessages: number;
  detectedObjection?: string | null;
  nextFollowupAt?: Date | null;
  nudgeDelayMinutes?: number;
  saveContactToWhatsAppFn?: (phone: string, name: string) => Promise<boolean>;
  syncContactToCRMFn?: (supabase: SupabaseClient, data: CRMContactData) => Promise<boolean>;
}

export interface CRMContactData {
  nome: string;
  telefone: string;
  email: string | null;
  cpfCnpj: string | null;
  endereco: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  valorPotencial: number | null;
  propostaId: string | null;
  bitrixLeadId: string | null;
  bitrixStage: string | null;
  observacoes: string | null;
}

export interface ConversationUpdateResult {
  success: boolean;
  nomeParaSalvar: string | null;
  mergedDadosColetados: Record<string, unknown>;
  contactSaved: boolean;
  crmSynced: boolean;
}

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Build address string from extracted data
 */
function buildAddress(dados: Record<string, unknown>): string | null {
  const parts = [
    dados.logradouro || dados.endereco,
    dados.numero,
    dados.complemento,
    dados.bairro,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}

/**
 * Build observations string from collected data
 */
function buildObservations(dados: Record<string, unknown>): string | null {
  const obsArray: string[] = [];
  
  if (dados.distribuidora) obsArray.push(`Distribuidora: ${dados.distribuidora}`);
  if (dados.consumo) obsArray.push(`Consumo: ${dados.consumo} kWh`);
  if (dados.valorFatura) obsArray.push(`Valor fatura: R$ ${dados.valorFatura}`);
  if (dados.tipoInstalacao) obsArray.push(`Tipo: ${dados.tipoInstalacao}`);
  
  return obsArray.length > 0 ? `Via WhatsApp/sofIA - ${obsArray.join(' | ')}` : null;
}

/**
 * Calculate potential value from proposal
 */
async function calculateValorPotencial(
  supabase: SupabaseClient,
  propostaId: string | null
): Promise<number | null> {
  if (!propostaId) return null;
  
  try {
    const { data: proposta } = await supabase
      .from('propostas_assinantes')
      .select('economia_acumulada, economia_mensal')
      .eq('id', propostaId)
      .single();
    
    return proposta?.economia_acumulada || (proposta?.economia_mensal ? proposta.economia_mensal * 48 : null);
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// MAIN FUNCTION
// ═══════════════════════════════════════════════════════════════

/**
 * Complete post-response conversation update
 * 1. Merges and saves extracted data
 * 2. Updates nudge tracking
 * 3. Saves contact to WhatsApp (async)
 * 4. Syncs contact to Micro CRM (async)
 */
export async function updateConversationAfterResponse(
  ctx: ConversationUpdateContext
): Promise<ConversationUpdateResult> {
  const {
    supabase,
    conversaId,
    phone,
    conversa,
    clienteNome,
    extractedData,
    newScore,
    finalMode,
    totalMessages,
    detectedObjection,
    nextFollowupAt,
    nudgeDelayMinutes = 10,
    saveContactToWhatsAppFn,
    syncContactToCRMFn,
  } = ctx;

  let contactSaved = false;
  let crmSynced = false;

  // ═══════════════════════════════════════════════════════════════
  // STEP 1: Determine name priority
  // PRIORITY: Use name from chat (extractedData.nome) over WhatsApp profile name
  // ═══════════════════════════════════════════════════════════════
  const nomeParaSalvar = extractedData.nome || clienteNome || conversa?.cliente_nome || null;

  // ═══════════════════════════════════════════════════════════════
  // STEP 2: Merge extracted data with existing dados_coletados
  // CRITICAL: Without this, data like distribuidora and valorFatura are lost!
  // ═══════════════════════════════════════════════════════════════
  const existingDadosColetados = (conversa?.dados_coletados as Record<string, unknown>) || {};
  const mergedDadosColetados = { ...existingDadosColetados, ...extractedData };

  // ═══════════════════════════════════════════════════════════════
  // STEP 3: Build update object with nudge tracking
  // ═══════════════════════════════════════════════════════════════
  const now = new Date();
  const nextNudgeAt = new Date(now.getTime() + nudgeDelayMinutes * 60 * 1000);

  const updateData: Record<string, unknown> = {
    lead_score: newScore,
    sofia_mode: finalMode,
    last_message_at: now.toISOString(),
    total_messages: totalMessages + 2,
    cliente_nome: nomeParaSalvar,
    // Nudge tracking - Sofia just sent a message, now awaiting response
    last_sofia_message_at: now.toISOString(),
    awaiting_response: true,
    nudge_count: 0,
    next_nudge_at: nextNudgeAt.toISOString(),
    // Save extracted data
    dados_coletados: mergedDadosColetados,
  };

  // Add objection tracking if detected
  if (detectedObjection) {
    updateData.detected_objection = detectedObjection;
    updateData.event_objection_detected = true;
  }

  // Add follow-up tracking if scheduled
  if (nextFollowupAt) {
    updateData.next_followup_at = nextFollowupAt.toISOString();
    updateData.followup_stage = 'initial';
  }

  // ═══════════════════════════════════════════════════════════════
  // STEP 4: Update conversation in database
  // ═══════════════════════════════════════════════════════════════
  const { error: updateError } = await supabase
    .from('chatbot_conversas')
    .update(updateData)
    .eq('id', conversaId);

  if (updateError) {
    console.error(`[conversation-update] Failed to update conversation:`, updateError);
    return {
      success: false,
      nomeParaSalvar,
      mergedDadosColetados,
      contactSaved,
      crmSynced,
    };
  }

  console.log(`[conversation-update] Conversation ${conversaId} updated. Score: ${newScore}, Mode: ${finalMode}`);

  // ═══════════════════════════════════════════════════════════════
  // STEP 5: Save contact to WhatsApp (async, non-blocking)
  // ═══════════════════════════════════════════════════════════════
  if (nomeParaSalvar && saveContactToWhatsAppFn) {
    const previousNome = conversa?.cliente_nome;
    const hasNewName = nomeParaSalvar !== previousNome;
    const isFirstTimeNaming = !previousNome;

    if (hasNewName || isFirstTimeNaming) {
      saveContactToWhatsAppFn(phone, nomeParaSalvar).then(success => {
        if (success) {
          console.log(`[conversation-update] ✅ Contact "${nomeParaSalvar}" saved to WhatsApp for ${phone}`);
        } else {
          console.log(`[conversation-update] ⚠️ Could not save contact "${nomeParaSalvar}" to WhatsApp`);
        }
      }).catch(err => {
        console.error(`[conversation-update] Error saving contact:`, err);
      });
      contactSaved = true; // Mark as attempted
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // STEP 6: Sync contact to Micro CRM (async, non-blocking)
  // ═══════════════════════════════════════════════════════════════
  if (nomeParaSalvar && syncContactToCRMFn) {
    const valorPotencial = await calculateValorPotencial(supabase, conversa?.proposta_id || null);
    const endereco = buildAddress(mergedDadosColetados);
    const observacoes = buildObservations(mergedDadosColetados);

    const crmData: CRMContactData = {
      nome: nomeParaSalvar,
      telefone: phone,
      email: (mergedDadosColetados.email as string) || conversa?.cliente_email || null,
      cpfCnpj: (mergedDadosColetados.cpf as string) || (mergedDadosColetados.cnpj as string) || null,
      endereco,
      cidade: (mergedDadosColetados.cidade as string) || null,
      uf: (mergedDadosColetados.uf as string) || null,
      cep: (mergedDadosColetados.cep as string) || null,
      valorPotencial,
      propostaId: conversa?.proposta_id || null,
      bitrixLeadId: conversa?.bitrix24_lead_id || null,
      bitrixStage: conversa?.bitrix24_stage || null,
      observacoes,
    };

    syncContactToCRMFn(supabase, crmData).then(success => {
      if (success) {
        console.log(`[conversation-update] ✅ Contact synced to Micro CRM: ${nomeParaSalvar}`);
      }
    }).catch(err => {
      console.error(`[conversation-update] Error syncing to CRM:`, err);
    });
    crmSynced = true; // Mark as attempted
  }

  return {
    success: true,
    nomeParaSalvar,
    mergedDadosColetados,
    contactSaved,
    crmSynced,
  };
}
