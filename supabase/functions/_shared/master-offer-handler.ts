/**
 * Master Offer Handler - Process MASTER offer acceptances
 * Extracted from sofia-webhook/index.ts (Phase 12 refactoring)
 * 
 * Handles the MASTER offer flow (30% discount + 4 years fidelity):
 * 1. Detect if MASTER offer is active and client accepted
 * 2. Update chatbot_conversas with acceptance
 * 3. Update propostas_assinantes with new terms
 * 4. Sync with Bitrix24 (update fields + add timeline comment)
 * 5. Create admin notification
 */

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface MasterOfferContext {
  masterOfferAt: string | null;
  masterOfferExpiresAt: string | null;
  masterOfferAccepted: boolean | null;
  existingDados: Record<string, unknown> | object;
}

export interface MasterOfferFlowParams {
  supabase: any;
  conversaId: string;
  phone: string;
  clienteNome: string | null;
  messageText: string;
  context: MasterOfferContext;
  propostaId: string | null;
  bitrixLeadId: string | null;
  agentName?: string | null;
  detectMasterOfferAcceptance: (message: string) => boolean;
}

export interface MasterOfferFlowResult {
  handled: boolean;
  status: string;
  accepted?: boolean;
  expired?: boolean;
  updatedDados?: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Check if MASTER offer is currently active (not expired, not accepted)
 */
export function isMasterOfferActive(context: MasterOfferContext): boolean {
  const { masterOfferAt, masterOfferExpiresAt, masterOfferAccepted } = context;
  return !!(
    masterOfferAt &&
    masterOfferExpiresAt &&
    new Date(masterOfferExpiresAt) > new Date() &&
    !masterOfferAccepted
  );
}

/**
 * Check if MASTER offer has expired without acceptance
 */
export function isMasterOfferExpired(context: MasterOfferContext): boolean {
  const { masterOfferAt, masterOfferExpiresAt, masterOfferAccepted } = context;
  return !!(
    masterOfferAt &&
    masterOfferExpiresAt &&
    new Date(masterOfferExpiresAt) <= new Date() &&
    !masterOfferAccepted
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════

/**
 * Handle MASTER offer acceptance flow
 * Updates conversation, proposta, Bitrix24 and creates notification
 */
export async function handleMasterOfferFlow(
  params: MasterOfferFlowParams
): Promise<MasterOfferFlowResult> {
  const {
    supabase,
    conversaId,
    phone,
    clienteNome,
    messageText,
    context,
    propostaId,
    bitrixLeadId,
    agentName,
    detectMasterOfferAcceptance,
  } = params;

  // Check if offer is expired
  if (isMasterOfferExpired(context)) {
    console.log(`[MASTER_OFFER] MASTER offer has expired without acceptance`);
    return { handled: false, status: 'expired', expired: true };
  }

  // Check if offer is active and client accepted
  if (!isMasterOfferActive(context)) {
    return { handled: false, status: 'not_active' };
  }

  if (!detectMasterOfferAcceptance(messageText)) {
    return { handled: false, status: 'not_accepted' };
  }

  console.log(`[MASTER_OFFER] Client accepted MASTER offer! Processing acceptance...`);

  const now = new Date();

  // 1. Update chatbot_conversas with acceptance
  const updatedDados = {
    ...context.existingDados,
    masterOfertaAceita: true,
    descontoContratado: 30,
    fidelidadeContratada: 4,
  };

  await supabase
    .from('chatbot_conversas')
    .update({
      master_offer_accepted: true,
      dados_coletados: updatedDados,
    })
    .eq('id', conversaId);

  console.log(`[MASTER_OFFER] Updated conversation with acceptance`);

  // 2. Update propostas_assinantes if exists
  if (propostaId) {
    const { error: propostaError } = await supabase
      .from('propostas_assinantes')
      .update({
        desconto_percentual: 30,
        fidelidade_anos: 4,
      })
      .eq('id', propostaId);

    if (propostaError) {
      console.error(`[MASTER_OFFER] Error updating proposta:`, propostaError);
    } else {
      console.log(`[MASTER_OFFER] Updated proposta ${propostaId} with 30%/4 years`);
    }
  }

  // 3. Sync with Bitrix24 if lead exists
  if (bitrixLeadId) {
    await syncMasterOfferToBitrix(supabase, bitrixLeadId, now);
  }

  // 4. Create admin notification
  await supabase.from('admin_notifications').insert({
    admin_user_id: null,
    title: '🏆 OFERTA MASTER ACEITA!',
    message: `${clienteNome || phone} aceitou a Oferta MASTER: 30% de desconto + 4 anos de fidelidade! Próximo passo: coleta de documentos.`,
    type: 'success',
    entity_type: 'chatbot_conversa',
    entity_id: conversaId,
    created_by_nome: agentName || 'IA',
  });

  console.log(`[MASTER_OFFER] Created success notification for admins`);

  return {
    handled: true,
    status: 'accepted',
    accepted: true,
    updatedDados,
  };
}

/**
 * Sync MASTER offer acceptance to Bitrix24
 */
async function syncMasterOfferToBitrix(
  supabase: any,
  bitrixLeadId: string,
  acceptedAt: Date
): Promise<void> {
  try {
    // Get Bitrix24 config
    const { data: bitrixConfig } = await supabase
      .from('configuracoes_sistema')
      .select('chave, valor')
      .in('chave', [
        'bitrix24_webhook_url',
        'bitrix24_custom_field_desconto_contratado',
        'bitrix24_custom_field_prazo_contrato',
        'bitrix24_custom_field_fidelidade_desejada',
      ]);

    const configMap: Record<string, string> = {};
    bitrixConfig?.forEach((c: { chave: string; valor: string }) => {
      configMap[c.chave] = c.valor;
    });

    if (!configMap.bitrix24_webhook_url) {
      console.log(`[MASTER_OFFER] No Bitrix24 webhook configured, skipping sync`);
      return;
    }

    const bitrix24Url = configMap.bitrix24_webhook_url;

    // Build update fields
    const updateFields: Record<string, unknown> = {};

    if (configMap.bitrix24_custom_field_desconto_contratado) {
      updateFields[configMap.bitrix24_custom_field_desconto_contratado] = 30;
    }
    if (configMap.bitrix24_custom_field_prazo_contrato) {
      updateFields[configMap.bitrix24_custom_field_prazo_contrato] = 48; // 4 years in months
    }

    // Update fidelidade_desejada to MASTER option
    if (configMap.bitrix24_custom_field_fidelidade_desejada) {
      const fidelidadeField = configMap.bitrix24_custom_field_fidelidade_desejada;
      const masterFidelidadeOption = '48 meses - 30% de desconto';

      // Fetch field info to find the enum ID
      try {
        const fieldInfoRes = await fetch(`${bitrix24Url}crm.lead.fields`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        const fieldInfoJson = await fieldInfoRes.json();

        if (fieldInfoJson?.result?.[fidelidadeField]?.items) {
          const items = fieldInfoJson.result[fidelidadeField].items;
          // Try to find matching option
          const masterOption = items.find(
            (item: { VALUE: string; ID: string }) =>
              item.VALUE?.toLowerCase().includes('48 meses') ||
              item.VALUE?.toLowerCase().includes('4 anos') ||
              (item.VALUE?.includes('30') && item.VALUE?.includes('meses'))
          );

          if (masterOption) {
            updateFields[fidelidadeField] = masterOption.ID;
            console.log(
              `[MASTER_OFFER] Setting fidelidade to "${masterOption.VALUE}" (ID: ${masterOption.ID})`
            );
          } else {
            updateFields[fidelidadeField] = masterFidelidadeOption;
            console.log(
              `[MASTER_OFFER] No matching enum found, sending text: ${masterFidelidadeOption}`
            );
          }
        }
      } catch (enumError) {
        console.error(`[MASTER_OFFER] Error resolving fidelidade enum:`, enumError);
        updateFields[fidelidadeField] = masterFidelidadeOption;
      }
    }

    // Update lead
    if (Object.keys(updateFields).length > 0) {
      await fetch(`${bitrix24Url}crm.lead.update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: bitrixLeadId, fields: updateFields }),
      });
      console.log(`[MASTER_OFFER] Updated Bitrix24 lead ${bitrixLeadId} with MASTER plan`);
    }

    // Add comment to timeline
    await fetch(`${bitrix24Url}crm.timeline.comment.add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          ENTITY_ID: bitrixLeadId,
          ENTITY_TYPE: 'lead',
          COMMENT: `🏆 OFERTA MASTER ACEITA!\n\n✅ Cliente aceitou a condição especial:\n• Desconto: 30%\n• Fidelidade: 4 anos (48 meses)\n\n📅 Aceite em: ${acceptedAt.toLocaleString('pt-BR')}\n\n⚡ Prosseguir com coleta de documentos para proposta definitiva.`,
        },
      }),
    });
    console.log(`[MASTER_OFFER] Added acceptance comment to Bitrix24 timeline`);
  } catch (bitrixError) {
    console.error(`[MASTER_OFFER] Error syncing to Bitrix24:`, bitrixError);
  }
}
