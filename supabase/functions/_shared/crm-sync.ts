/**
 * CRM Sync Module
 * Centralized contact syncing to internal Micro CRM (crm_contatos table)
 * Extracted from sofia-webhook/index.ts for reuse across Edge Functions
 * 
 * ZERO HARDCODE: System identifiers loaded from configuracoes_sistema table
 */

// Use unified config loader for hierarchical config resolution
import { 
  getRawConfigCache, 
  getConfigValue,
} from './unified-config-loader.ts';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

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

export interface CRMSyncResult {
  success: boolean;
  action: 'created' | 'updated' | 'skipped' | 'error';
  contactId?: string;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════
// CONSTANTS - Default values (fallback if DB unavailable)
// ═══════════════════════════════════════════════════════════════

const DEFAULT_SOFIA_SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';
const DEFAULT_SOFIA_EMAIL = 'sofia@coesaenergia.com.br';
const DEFAULT_SOFIA_NOME = 'sofIA (Assistente Virtual)';

// Export getter for backwards compatibility
export function getSofiaSystemUserId(): string {
  const config = getRawConfigCache();
  return getConfigValue('crm_sofia_system_user_id', DEFAULT_SOFIA_SYSTEM_USER_ID, config || undefined);
}

export function getSofiaEmail(): string {
  const config = getRawConfigCache();
  return getConfigValue('crm_sofia_email', DEFAULT_SOFIA_EMAIL, config || undefined);
}

export function getSofiaNome(): string {
  const config = getRawConfigCache();
  return getConfigValue('crm_sofia_nome', DEFAULT_SOFIA_NOME, config || undefined);
}

// Legacy export for backwards compatibility
export const SOFIA_SYSTEM_USER_ID = DEFAULT_SOFIA_SYSTEM_USER_ID;

// ═══════════════════════════════════════════════════════════════
// SYNC FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Sync contact data to the internal Micro CRM (crm_contatos table)
 * Creates a new contact if it doesn't exist, or updates existing one with new data
 * This ensures all WhatsApp leads are captured in the CRM for follow-up
 */
export async function syncContactToCRM(
  supabaseClient: any,
  data: CRMContactData
): Promise<CRMSyncResult> {
  try {
    if (!data.nome || !data.telefone) {
      console.log('[CRM_SYNC] Missing required fields (nome or telefone), skipping sync');
      return { success: false, action: 'skipped', error: 'Missing nome or telefone' };
    }

    console.log(`[CRM_SYNC] Syncing contact to CRM: ${data.nome} (${data.telefone})`);

    // Check if contact already exists by phone number
    const { data: existingContact, error: findError } = await supabaseClient
      .from('crm_contatos')
      .select('id, nome, email, cpf_cnpj, endereco, cidade, uf, cep, observacoes, proposta_id, bitrix24_lead_id, bitrix24_stage')
      .eq('telefone', data.telefone)
      .eq('origem', 'whatsapp_sofia')
      .maybeSingle();

    if (findError && findError.code !== 'PGRST116') {
      console.error('[CRM_SYNC] Error checking existing contact:', findError);
      return { success: false, action: 'error', error: findError.message };
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
        const { error: updateError } = await supabaseClient
          .from('crm_contatos')
          .update(updates)
          .eq('id', existingContact.id);

        if (updateError) {
          console.error('[CRM_SYNC] Error updating contact:', updateError);
          return { success: false, action: 'error', error: updateError.message };
        }

        console.log(`[CRM_SYNC] ✅ Contact updated: ${data.nome} (${data.telefone})`);
        return { success: true, action: 'updated', contactId: existingContact.id };
      } else {
        console.log(`[CRM_SYNC] No new data to update for: ${data.nome}`);
        return { success: true, action: 'skipped', contactId: existingContact.id };
      }
    } else {
      // Create new contact - use dynamic getters for system identity
      const { data: insertedContact, error: insertError } = await supabaseClient
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
        })
        .select('id')
        .single();

      if (insertError) {
        console.error('[CRM_SYNC] Error creating contact:', insertError);
        return { success: false, action: 'error', error: insertError.message };
      }

      console.log(`[CRM_SYNC] ✅ New contact created: ${data.nome} (${data.telefone})`);
      return { success: true, action: 'created', contactId: insertedContact?.id };
    }
  } catch (error) {
    console.error('[CRM_SYNC] Exception syncing contact:', error);
    return { 
      success: false, 
      action: 'error', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Save contact to WhatsApp phone book via Z-API
 */
export async function saveContactToWhatsApp(
  supabaseUrl: string,
  phone: string,
  fullName: string
): Promise<boolean> {
  try {
    if (!fullName || fullName.trim().length < 2) {
      console.log('[CONTACT_SAVE] Name too short, skipping WhatsApp contact save');
      return false;
    }
    
    console.log(`[CONTACT_SAVE] Attempting to save contact: ${fullName} (${phone})`);
    
    const response = await fetch(`${supabaseUrl}/functions/v1/z-api-add-contact`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phone: phone,
        firstName: fullName,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[CONTACT_SAVE] Failed to save contact: ${response.status} - ${errorText}`);
      return false;
    }
    
    const result = await response.json();
    console.log(`[CONTACT_SAVE] Contact saved successfully:`, result);
    return result.success === true;
  } catch (error) {
    console.error(`[CONTACT_SAVE] Error saving contact:`, error);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Build CRM contact data from extracted client data
 */
export function buildCRMContactFromClientData(
  clientData: {
    nome?: string;
    email?: string;
    cpf?: string;
    cnpj?: string;
    endereco?: string;
    cidade?: string;
    uf?: string;
    cep?: string;
    valorFatura?: number;
  },
  telefone: string,
  additionalData?: {
    propostaId?: string | null;
    bitrixLeadId?: string | null;
    bitrixStage?: string | null;
    observacoes?: string | null;
  }
): CRMContactData | null {
  if (!clientData.nome || !telefone) {
    return null;
  }

  return {
    nome: clientData.nome,
    telefone: telefone,
    email: clientData.email || null,
    cpfCnpj: clientData.cnpj || clientData.cpf || null,
    endereco: clientData.endereco || null,
    cidade: clientData.cidade || null,
    uf: clientData.uf || null,
    cep: clientData.cep || null,
    valorPotencial: clientData.valorFatura ? Math.round(clientData.valorFatura * 12 * 0.20) : null, // 20% annual savings estimate
    propostaId: additionalData?.propostaId || null,
    bitrixLeadId: additionalData?.bitrixLeadId || null,
    bitrixStage: additionalData?.bitrixStage || null,
    observacoes: additionalData?.observacoes || null,
  };
}

/**
 * Update contact status in CRM
 */
export async function updateContactStatus(
  supabaseClient: any,
  telefone: string,
  status: 'novo' | 'em_andamento' | 'convertido' | 'perdido' | 'arquivado'
): Promise<boolean> {
  try {
    const { error } = await supabaseClient
      .from('crm_contatos')
      .update({ 
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('telefone', telefone)
      .eq('origem', 'whatsapp_sofia');

    if (error) {
      console.error('[CRM_SYNC] Error updating contact status:', error);
      return false;
    }

    console.log(`[CRM_SYNC] Updated status to "${status}" for phone: ${telefone}`);
    return true;
  } catch (error) {
    console.error('[CRM_SYNC] Exception updating status:', error);
    return false;
  }
}

/**
 * Get contact by phone number
 */
export async function getContactByPhone(
  supabaseClient: any,
  telefone: string
): Promise<{ id: string; nome: string; status: string } | null> {
  try {
    const { data, error } = await supabaseClient
      .from('crm_contatos')
      .select('id, nome, status')
      .eq('telefone', telefone)
      .eq('origem', 'whatsapp_sofia')
      .maybeSingle();

    if (error) {
      console.error('[CRM_SYNC] Error fetching contact:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('[CRM_SYNC] Exception fetching contact:', error);
    return null;
  }
}
