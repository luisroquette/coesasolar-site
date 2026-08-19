/**
 * ═══════════════════════════════════════════════════════════════
 * BITRIX SYNC - Shared Module
 * ═══════════════════════════════════════════════════════════════
 * Centralized Bitrix24 synchronization utilities for sofia-webhook.
 * Extracted from the main webhook to reduce file size and improve
 * maintainability.
 * 
 * ZERO HARDCODE: All messages loaded from sofia_message_templates
 * System identifiers loaded from config-loader via crm-sync module
 * 
 * Provides:
 * - syncToBitrix: Progressive lead sync via sofia-bitrix-lead function
 * - handleProposalDelayComplaint: Auto-rescue when client complains
 * - syncContactToCRM: Micro CRM contact sync
 * ═══════════════════════════════════════════════════════════════
 */

import { type ExtractedClientData } from './data-extraction.ts';
import { type FileType } from './document-handler.ts';
import { getRenderedTemplate } from './message-templates.ts';
import { 
  getSofiaSystemUserId, 
  getSofiaEmail, 
  getSofiaNome,
  SOFIA_SYSTEM_USER_ID 
} from './crm-sync.ts';

// Re-export types for convenience
export type { ExtractedClientData, FileType };

// Re-export crm-sync identity getters for backwards compatibility
export { getSofiaSystemUserId, getSofiaEmail, getSofiaNome, SOFIA_SYSTEM_USER_ID };

// ═══════════════════════════════════════════════════════════════
// AUTO-RESCUE MESSAGE KEYS (from sofia_message_templates)
// ═══════════════════════════════════════════════════════════════
// These template keys are used for auto-rescue scenarios:
// - auto_rescue_success: When lead is successfully moved
// - auto_rescue_proposal_created: When proposal is generated
// - auto_rescue_escalation: When escalating to human
// - auto_rescue_guide_missing_data: When guiding client for missing data
// - auto_rescue_wait: When asking client to wait
// - auto_rescue_attendant_notify: Notification to attendant

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface SyncToBitrixResult {
  success: boolean;
  leadId?: string;
  stageUpdated?: boolean;
  newStage?: string;
  propostaId?: string;
  propostaCreated?: boolean;
  error?: string;
}

export interface AutoRescueResult {
  triggered: boolean;
  rescued: boolean;
  escalated: boolean;
  message?: string;
  newStage?: string;
  missingData?: string[];
}

export interface CRMContactData {
  nome: string;
  telefone: string;
  email?: string | null;
  cpfCnpj?: string | null;
  endereco?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
  valorPotencial?: number | null;
  propostaId?: string | null;
  bitrixLeadId?: string | null;
  bitrixStage?: string | null;
  observacoes?: string | null;
}

// ═══════════════════════════════════════════════════════════════
// SYNC TO BITRIX - Progressive lead sync
// ═══════════════════════════════════════════════════════════════

/**
 * Sync data to Bitrix24 progressively via sofia-bitrix-lead function
 * Handles lead creation/update, stage movement, and proposal generation
 */
export async function syncToBitrix(
  supabase: any,
  conversaId: string,
  phone: string,
  clienteNome: string | null,
  dadosColetados: ExtractedClientData,
  arquivoNovo?: {
    tipo: FileType;
    base64: string;
    mimeType: string;
    fileName: string;
  },
  forcarMovimentacao = false
): Promise<SyncToBitrixResult> {
  try {
    // ═══════════════════════════════════════════════════════════════
    // GUARDRAIL #4: Block proposal generation without valid email
    // E-mail is REQUIRED before generating any proposal
    // ═══════════════════════════════════════════════════════════════
    const email = dadosColetados.email as string | null | undefined;
    const hasValidEmail = email && typeof email === 'string' && email.includes('@') && email.length > 5;
    
    // Check if email is required via config (default: true)
    let emailRequiredConfig = true;
    try {
      const { data: configData } = await supabase
        .from('configuracoes_sistema')
        .select('valor')
        .eq('chave', 'proposal_requires_verified_email')
        .maybeSingle();
      emailRequiredConfig = configData?.valor !== 'false';
    } catch (e) {
      console.log('[bitrix-sync] Could not load email config, defaulting to required');
    }
    
    if (emailRequiredConfig && forcarMovimentacao && !hasValidEmail) {
      console.log(`[bitrix-sync] ⛔ BLOCKED: Cannot generate proposal without email for ${phone}`);
      return {
        success: false,
        error: 'email_required_for_proposal',
      };
    }
    
    const requestBody = {
      conversaId,
      phone,
      clienteNome,
      dadosColetados,
      arquivoNovo,
      forcarMovimentacao,
    };

    // Call the sofia-bitrix-lead function
    const { data, error } = await supabase.functions.invoke('sofia-bitrix-lead', {
      body: requestBody,
    });

    if (error) {
      console.error('[bitrix-sync] Error calling sofia-bitrix-lead:', error);
      return { success: false, error: error.message };
    }

    console.log('[bitrix-sync] Bitrix sync result:', data);
    return {
      success: data?.success || false,
      leadId: data?.leadId,
      stageUpdated: data?.stageUpdated,
      newStage: data?.newStageName,
      propostaId: data?.propostaId,
      propostaCreated: data?.propostaCreated,
      error: data?.error,
    };
  } catch (error) {
    console.error('[bitrix-sync] Error syncing to Bitrix:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ═══════════════════════════════════════════════════════════════
// HANDLE PROPOSAL DELAY COMPLAINT - Auto-rescue
// ═══════════════════════════════════════════════════════════════

/**
 * Handle proposal delay complaints with auto-rescue
 * Tries to force Bitrix movement if data is complete, otherwise escalates
 * 
 * @param sendWhatsAppMessage - Callback to send WhatsApp messages
 */
export async function handleProposalDelayComplaint(
  supabase: any,
  conversaId: string,
  phone: string,
  clienteNome: string | null,
  dadosColetados: ExtractedClientData,
  bitrixLeadId: string | null,
  bitrixStage: string | null,
  sendWhatsAppMessage: (phone: string, message: string) => Promise<void>
): Promise<AutoRescueResult> {
  console.log(`[AUTO-RESCUE] Handling proposal delay complaint for ${phone}`);
  console.log(`[AUTO-RESCUE] Current Bitrix stage: ${bitrixStage}, Lead ID: ${bitrixLeadId}`);

  const result: AutoRescueResult = {
    triggered: true,
    rescued: false,
    escalated: false,
    missingData: [],
  };

  // Check what data we have and what's missing
  const hasNome = dadosColetados.nome && dadosColetados.nome.trim().length >= 2;
  const hasEmail = dadosColetados.email && dadosColetados.email.includes('@');
  const hasConsumoOuValor = dadosColetados.consumo || dadosColetados.valorFatura;
  const hasDistribuidora = !!dadosColetados.distribuidora;

  if (!hasNome) result.missingData!.push('nome');
  if (!hasEmail) result.missingData!.push('e-mail');
  if (!hasConsumoOuValor) result.missingData!.push('valor da conta ou consumo');
  if (!hasDistribuidora) result.missingData!.push('distribuidora');

  console.log(`[AUTO-RESCUE] Data status: nome=${hasNome}, email=${hasEmail}, consumo=${hasConsumoOuValor}, dist=${hasDistribuidora}`);
  console.log(`[AUTO-RESCUE] Missing data: ${result.missingData!.join(', ') || 'none'}`);

  // If we have all required data, try to force the movement
  if (hasNome && hasEmail && hasConsumoOuValor && hasDistribuidora) {
    console.log('[AUTO-RESCUE] All data present, attempting to force Bitrix movement...');

    // Try sync with forcarMovimentacao = true
    const syncResult = await syncToBitrix(
      supabase,
      conversaId,
      phone,
      clienteNome,
      dadosColetados,
      undefined, // no new file
      true // forcarMovimentacao
    );

    if (syncResult.success && syncResult.stageUpdated) {
      result.rescued = true;
      result.newStage = syncResult.newStage;
      
      // Get dynamic message from templates
      result.message = await getRenderedTemplate(supabase, 'auto_rescue_success', {}) 
        || `✅ Ótima notícia! Consegui processar sua proposta agora mesmo. Em instantes você receberá o link para visualizar! 🎉`;

      console.log(`[AUTO-RESCUE] SUCCESS! Lead moved to ${syncResult.newStage}`);

      // Log rescue event
      await supabase
        .from('chatbot_conversas')
        .update({
          dados_coletados: {
            ...dadosColetados,
            _autoRescueAt: new Date().toISOString(),
            _autoRescueSuccess: true,
          },
        })
        .eq('id', conversaId);

      return result;
    } else if (syncResult.propostaCreated) {
      // Proposal was just created!
      result.rescued = true;
      result.message = await getRenderedTemplate(supabase, 'auto_rescue_proposal_created', {})
        || `✅ Pronto! Sua proposta foi gerada com sucesso. Você já deve estar recebendo o link para visualizar! 🎉`;
      console.log(`[AUTO-RESCUE] SUCCESS! Proposal created: ${syncResult.propostaId}`);
      return result;
    } else {
      console.log(`[AUTO-RESCUE] Sync attempted but no stage update. Error: ${syncResult.error}`);
    }
  }

  // If we couldn't rescue (missing data or sync failed), check if we should escalate
  const hasSignificantMissingData = result.missingData!.length > 1;
  const isStaleLead = bitrixStage === 'UC_AGUARDANDO_DADOS' || bitrixStage === 'NEW' || !bitrixStage;

  if (hasSignificantMissingData || isStaleLead) {
    // Escalate to human if we can't auto-rescue
    console.log(`[AUTO-RESCUE] Cannot auto-rescue, escalating to human...`);

    // Check for available attendant
    const { data: atendente } = await supabase
      .from('whatsapp_atendentes')
      .select('*')
      .eq('is_active', true)
      .eq('is_plantao', true)
      .limit(1)
      .maybeSingle();

    if (atendente) {
      // Update conversation for escalation
      await supabase
        .from('chatbot_conversas')
        .update({
          needs_human_fallback: true,
          escalated_at: new Date().toISOString(),
          escalation_reason: `Auto-rescue falhou: cliente reclamou de demora. Dados faltantes: ${result.missingData!.join(', ') || 'sync failed'}`,
          atendente_notificado_id: atendente.id,
          atendente_notificado_nome: atendente.nome,
          atendente_notificado_at: new Date().toISOString(),
          sofia_mode: 'human_takeover',
        })
        .eq('id', conversaId);

      // Get attendant notification message from templates
      const notifyMessageTemplate = await getRenderedTemplate(supabase, 'auto_rescue_attendant_notify', {
        cliente_nome: clienteNome || 'Não identificado',
        telefone: phone,
        bitrix_lead_id: bitrixLeadId || 'Não criado',
        bitrix_stage: bitrixStage || 'Desconhecido',
        dados_faltantes: result.missingData!.join(', ') || 'Nenhum (falha no sync)',
      });
      
      const notifyMessage = notifyMessageTemplate || 
        `🚨 *RESGATE AUTOMÁTICO - CLIENTE RECLAMANDO*\n\n` +
        `Cliente: ${clienteNome || 'Não identificado'}\n` +
        `Telefone: ${phone}\n` +
        `Lead Bitrix: ${bitrixLeadId || 'Não criado'}\n` +
        `Estágio: ${bitrixStage || 'Desconhecido'}\n\n` +
        `📋 *Dados faltantes:* ${result.missingData!.join(', ') || 'Nenhum (falha no sync)'}\n\n` +
        `O cliente está reclamando de demora na proposta. Por favor, assuma o atendimento.`;

      try {
        await sendWhatsAppMessage(atendente.telefone, notifyMessage);
        console.log(`[AUTO-RESCUE] Attendant ${atendente.nome} notified`);
      } catch (err) {
        console.error('[AUTO-RESCUE] Failed to notify attendant:', err);
      }

      result.escalated = true;
      result.message = await getRenderedTemplate(supabase, 'auto_rescue_escalation', {})
        || `Entendo sua preocupação! 😊 Estou verificando o status aqui e já vou chamar um colega da equipe para agilizar isso pra você. Só um instante! 🙏`;
    } else {
      // No attendant available, try to guide client
      if (result.missingData!.length > 0) {
        const missingList = result.missingData!.join(', ');
        result.message = await getRenderedTemplate(supabase, 'auto_rescue_guide_missing_data', { dados_faltantes: missingList })
          || `Entendo sua preocupação com a demora! 😊 Verificando aqui, parece que ainda precisamos de algumas informações para gerar sua proposta: *${missingList}*.\n\nPode me passar esses dados? Assim consigo agilizar pra você! 🚀`;
      } else {
        result.message = await getRenderedTemplate(supabase, 'auto_rescue_wait', {})
          || `Entendo sua preocupação! 😊 Estou verificando o status da sua proposta aqui. Pode me dar um minutinho que já volto com uma resposta? 🙏`;
      }
    }
  } else {
    // Guide client with what's missing
    if (result.missingData!.length > 0) {
      const missingList = result.missingData!.join(', ');
      result.message = await getRenderedTemplate(supabase, 'auto_rescue_guide_single', { dados_faltantes: missingList })
        || `Entendo! 😊 Para eu gerar sua proposta, só preciso de mais uma informação: *${missingList}*. Pode me passar?`;
    }
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════
// SYNC CONTACT TO CRM - Micro CRM contact sync
// ═══════════════════════════════════════════════════════════════

/**
 * Sync contact data to the internal Micro CRM (crm_contatos table)
 * Creates a new contact if it doesn't exist, or updates existing one with new data
 * This ensures all WhatsApp leads are captured in the CRM for follow-up
 */
export async function syncContactToCRM(supabase: any, data: CRMContactData): Promise<boolean> {
  try {
    if (!data.nome || !data.telefone) {
      console.log('[CRM_SYNC] Missing required fields (nome or telefone), skipping sync');
      return false;
    }

    console.log(`[CRM_SYNC] Syncing contact to CRM: ${data.nome} (${data.telefone})`);

    // Check if contact already exists by phone number
    const { data: existingContact, error: findError } = await supabase
      .from('crm_contatos')
      .select('id, nome, email, cpf_cnpj, endereco, cidade, uf, cep, observacoes, proposta_id, bitrix24_lead_id, bitrix24_stage')
      .eq('telefone', data.telefone)
      .eq('origem', 'whatsapp_sofia')
      .maybeSingle();

    if (findError && findError.code !== 'PGRST116') {
      console.error('[CRM_SYNC] Error checking existing contact:', findError);
    }

    const now = new Date().toISOString();

    if (existingContact) {
      // Update existing contact - merge new data (only if new value is better)
      const updates: Record<string, unknown> = {
        updated_at: now,
        ultima_interacao: now,
      };

      // Update name if better (longer or more complete)
      if (data.nome && data.nome.split(' ').length > (existingContact.nome?.split(' ').length || 0)) {
        updates.nome = data.nome;
      }

      // Update fields only if new value exists and old value is empty
      if (data.email && !existingContact.email) {
        updates.email = data.email;
      }
      if (data.cpfCnpj && !existingContact.cpf_cnpj) {
        updates.cpf_cnpj = data.cpfCnpj;
      }
      if (data.endereco && !existingContact.endereco) {
        updates.endereco = data.endereco;
      }
      if (data.cidade && !existingContact.cidade) {
        updates.cidade = data.cidade;
      }
      if (data.uf && !existingContact.uf) {
        updates.uf = data.uf;
      }
      if (data.cep && !existingContact.cep) {
        updates.cep = data.cep;
      }
      if (data.propostaId && !existingContact.proposta_id) {
        updates.proposta_id = data.propostaId;
        updates.proposta_tipo = 'assinante';
      }
      if (data.bitrixLeadId && !existingContact.bitrix24_lead_id) {
        updates.bitrix24_lead_id = data.bitrixLeadId;
      }
      // Always update the stage if provided (it can change over time)
      if (data.bitrixStage) {
        updates.bitrix24_stage = data.bitrixStage;
      }
      if (data.valorPotencial) {
        updates.valor_potencial = data.valorPotencial;
      }

      // Append new observation if exists
      if (data.observacoes) {
        const existingObs = existingContact.observacoes || '';
        if (!existingObs.includes(data.observacoes)) {
          updates.observacoes = existingObs
            ? `${existingObs}\n[${now.split('T')[0]}] ${data.observacoes}`
            : `[${now.split('T')[0]}] ${data.observacoes}`;
        }
      }

      // Only update if we have changes beyond timestamp
      if (Object.keys(updates).length > 2) {
        const { error: updateError } = await supabase
          .from('crm_contatos')
          .update(updates)
          .eq('id', existingContact.id);

        if (updateError) {
          console.error('[CRM_SYNC] Error updating contact:', updateError);
          return false;
        }

        console.log(`[CRM_SYNC] ✅ Contact updated: ${data.nome} (${data.telefone})`);
      } else {
        console.log(`[CRM_SYNC] No new data to update for: ${data.nome}`);
      }
    } else {
      // Create new contact - use dynamic getters for system identity
      const { error: insertError } = await supabase
        .from('crm_contatos')
        .insert({
          user_id: getSofiaSystemUserId(),
          criado_por_email: getSofiaEmail(),
          criado_por_nome: getSofiaNome(),
          nome: data.nome,
          telefone: data.telefone,
          email: data.email || null,
          cpf_cnpj: data.cpfCnpj || null,
          endereco: data.endereco || null,
          cidade: data.cidade || null,
          uf: data.uf || null,
          cep: data.cep || null,
          origem: 'whatsapp_sofia',
          proposta_id: data.propostaId || null,
          proposta_tipo: data.propostaId ? 'assinante' : null,
          status: 'novo',
          valor_potencial: data.valorPotencial || null,
          bitrix24_lead_id: data.bitrixLeadId || null,
          bitrix24_stage: data.bitrixStage || null,
          observacoes: data.observacoes ? `[${now.split('T')[0]}] ${data.observacoes}` : null,
          ultima_interacao: now,
        });

      if (insertError) {
        console.error('[CRM_SYNC] Error creating contact:', insertError);
        return false;
      }

      console.log(`[CRM_SYNC] ✅ New contact created: ${data.nome} (${data.telefone})`);
    }

    return true;
  } catch (error) {
    console.error('[CRM_SYNC] Exception syncing contact:', error);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// HELPER BUILDERS
// ═══════════════════════════════════════════════════════════════

/**
 * Build CRM contact data from collected client data
 */
export function buildCRMContactData(
  clienteNome: string | null,
  telefone: string,
  dadosColetados: ExtractedClientData,
  bitrixLeadId?: string | null,
  bitrixStage?: string | null,
  propostaId?: string | null,
  observacoes?: string | null
): CRMContactData | null {
  if (!clienteNome && !dadosColetados.nome) return null;
  if (!telefone) return null;

  return {
    nome: dadosColetados.nome || clienteNome || 'Cliente WhatsApp',
    telefone,
    email: dadosColetados.email || null,
    cpfCnpj: dadosColetados.cpf || dadosColetados.cnpj || null,
    endereco: dadosColetados.endereco || null,
    cidade: dadosColetados.cidade || null,
    uf: dadosColetados.uf || null,
    cep: dadosColetados.cep || null,
    valorPotencial: dadosColetados.valorFatura || null,
    propostaId: propostaId || null,
    bitrixLeadId: bitrixLeadId || null,
    bitrixStage: bitrixStage || null,
    observacoes: observacoes || null,
  };
}

// ═══════════════════════════════════════════════════════════════
// PHASE 64: ORCHESTRATE BITRIX SYNC FLOW
// Consolidates: hasNewData check, auto-advance logic, sync, proposal link
// ═══════════════════════════════════════════════════════════════

export interface BitrixSyncFlowContext {
  supabase: any;
  conversaId: string;
  phone: string;
  clienteNome: string | null;
  existingDados: ExtractedClientData;
  extractedData: ExtractedClientData;
  detectedInvoice: boolean;
  isAnalyzedDocument: boolean;
  isAnalyzedImage: boolean;
  mediaAnalysisResult?: {
    base64Data?: string;
    mimeType?: string;
  } | null;
  hasMinimumDataForProposal: (dados: ExtractedClientData, fallbackNome?: string | null) => boolean;
  pendingTask?: string | null;
}

export interface BitrixSyncFlowResult {
  synced: boolean;
  leadId?: string;
  stageUpdated?: boolean;
  newStage?: string;
  propostaId?: string;
  propostaCreated?: boolean;
  error?: string;
  hasNewData: boolean;
  dataCompleteForProposal: boolean;
}

/**
 * Orchestrate the complete Bitrix sync flow:
 * 1. Check if there's new data to sync
 * 2. Merge existing + extracted data
 * 3. Check if data is complete for proposal (auto-advance)
 * 4. Build file payload if invoice detected
 * 5. Call syncToBitrix with appropriate flags
 * 
 * Returns sync result with metadata for caller
 */
export async function orchestrateBitrixSyncFlow(
  ctx: BitrixSyncFlowContext
): Promise<BitrixSyncFlowResult> {
  const {
    supabase,
    conversaId,
    phone,
    clienteNome,
    existingDados,
    extractedData,
    detectedInvoice,
    isAnalyzedDocument,
    isAnalyzedImage,
    mediaAnalysisResult,
    hasMinimumDataForProposal,
    pendingTask,
  } = ctx;

  // Check if there's new data to sync
  const hasNewData = Object.keys(extractedData).some(k => 
    extractedData[k as keyof ExtractedClientData] !== existingDados[k as keyof ExtractedClientData]
  );

  // Return early if no new data and no invoice
  if (!hasNewData && !detectedInvoice) {
    return {
      synced: false,
      hasNewData: false,
      dataCompleteForProposal: false,
    };
  }

  console.log('[BITRIX_SYNC_FLOW] Syncing data to Bitrix24...');

  // Build file name if media was analyzed
  const fileName = isAnalyzedDocument 
    ? `Fatura_${clienteNome || phone}.pdf` 
    : isAnalyzedImage 
      ? `Fatura_${clienteNome || phone}.jpg`
      : undefined;

  // Build file payload if invoice detected with media data
  const arquivoNovo = (detectedInvoice && mediaAnalysisResult?.base64Data) ? {
    tipo: 'fatura' as FileType,
    base64: mediaAnalysisResult.base64Data,
    mimeType: mediaAnalysisResult.mimeType || 'application/pdf',
    fileName: fileName || 'fatura.pdf',
  } : undefined;

  // AUTO-ADVANCE: Merge existing + new data to check requirements
  const mergedDadosForCheck = { ...existingDados, ...extractedData } as ExtractedClientData;
  // CRITICAL FIX: Pass clienteNome as fallback for nome
  const dataCompleteForProposal = hasMinimumDataForProposal(mergedDadosForCheck, clienteNome);

  // Always sync with MERGED data (not only extractedData)
  // This prevents incomplete payloads when last missing field arrives
  const dadosParaSync = mergedDadosForCheck;

  // PRIORITY: Use explicit name from merged data over WhatsApp profile name
  const nomeParaBitrix = dadosParaSync.nome || extractedData.nome || clienteNome;

  if (dataCompleteForProposal) {
    console.log('[BITRIX_SYNC_FLOW] ✅ AUTO-ADVANCE: Dados completos detectados, forçando movimentação para Proposta Inicial');
    console.log('[BITRIX_SYNC_FLOW] Dados:', {
      nome: mergedDadosForCheck.nome,
      email: mergedDadosForCheck.email,
      distribuidora: mergedDadosForCheck.distribuidora,
      valor: mergedDadosForCheck.valorFatura || mergedDadosForCheck.consumo,
    });
  }

  // Execute sync with force movement when data complete OR invoice detected
  const bitrixResult = await syncToBitrix(
    supabase,
    conversaId,
    phone,
    nomeParaBitrix,
    dadosParaSync,
    arquivoNovo,
    dataCompleteForProposal || detectedInvoice
  );

  if (bitrixResult.success) {
    console.log(`[BITRIX_SYNC_FLOW] Bitrix24 synced: ${bitrixResult.leadId}${bitrixResult.stageUpdated ? ` (moved to ${bitrixResult.newStage})` : ''}${bitrixResult.propostaCreated ? ` [PROPOSTA CRIADA: ${bitrixResult.propostaId}]` : ''}`);
  } else {
    console.error('[BITRIX_SYNC_FLOW] Failed to sync to Bitrix24:', bitrixResult.error);
  }

  return {
    synced: bitrixResult.success,
    leadId: bitrixResult.leadId,
    stageUpdated: bitrixResult.stageUpdated,
    newStage: bitrixResult.newStage,
    propostaId: bitrixResult.propostaId,
    propostaCreated: bitrixResult.propostaCreated,
    error: bitrixResult.error,
    hasNewData,
    dataCompleteForProposal,
  };
}
