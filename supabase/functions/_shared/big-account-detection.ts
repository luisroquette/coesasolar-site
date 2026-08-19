/**
 * BIG ACCOUNT DETECTION - Detecção de Grandes Contas
 * 
 * Detecta automaticamente contas com valor mensal >= R$ 3.000
 * e dispara alerta via WhatsApp para Luis e Eric.
 * 
 * @module _shared/big-account-detection
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.90.0';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface BigAccountAlertPayload {
  nome: string;
  telefone: string;
  valor_conta: number;
  conversa_id: string;
  alert_type: 'big_account';
}

export interface BigAccountConversaData {
  id: string;
  cliente_nome?: string | null;
  cliente_telefone?: string;
}

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════

const DEFAULT_THRESHOLD = 3000; // R$ 3.000

/**
 * Get the big account threshold from configuracoes_sistema
 */
async function getThreshold(supabase: SupabaseClient): Promise<number> {
  try {
    const { data } = await supabase
      .from('configuracoes_sistema')
      .select('valor')
      .eq('chave', 'big_account_threshold_reais')
      .single();
    
    if (data?.valor) {
      return parseFloat(data.valor) || DEFAULT_THRESHOLD;
    }
  } catch (error) {
    console.log(`[BIG_ACCOUNT] Failed to get threshold config, using default: ${DEFAULT_THRESHOLD}`);
  }
  
  return DEFAULT_THRESHOLD;
}

// ═══════════════════════════════════════════════════════════════
// COOLDOWN CHECK
// ═══════════════════════════════════════════════════════════════

/**
 * Check if an alert was already sent for this conversation in the last 24 hours
 */
async function checkAlreadyAlerted(
  supabase: SupabaseClient, 
  conversaId: string
): Promise<boolean> {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  
  const { data } = await supabase
    .from('activity_logs')
    .select('id')
    .eq('action', 'sofia_big_account_alert')
    .eq('entity_id', conversaId)
    .gte('created_at', twentyFourHoursAgo)
    .limit(1);
  
  return (data?.length || 0) > 0;
}

// ═══════════════════════════════════════════════════════════════
// ALERT TRIGGER
// ═══════════════════════════════════════════════════════════════

/**
 * Trigger the big account alert via the sofia-hot-lead-alert edge function
 */
async function triggerBigAccountAlert(
  supabase: SupabaseClient,
  payload: BigAccountAlertPayload
): Promise<boolean> {
  try {
    // Get Supabase URL from environment
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl) {
      console.error('[BIG_ACCOUNT] SUPABASE_URL not configured');
      return false;
    }
    
    const response = await fetch(`${supabaseUrl}/functions/v1/sofia-hot-lead-alert`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey || supabaseAnonKey}`,
      },
      body: JSON.stringify(payload),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[BIG_ACCOUNT] Alert trigger failed: ${response.status} - ${errorText}`);
      return false;
    }
    
    const result = await response.json();
    console.log(`[BIG_ACCOUNT] ✅ Alert triggered successfully, sent to ${result.sent_to} recipients`);
    
    return true;
  } catch (error) {
    console.error(`[BIG_ACCOUNT] Alert trigger exception:`, error);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// MAIN FUNCTION
// ═══════════════════════════════════════════════════════════════

/**
 * Check if the bill value qualifies as a "big account" and trigger alert if so.
 * This function is non-blocking and should be called asynchronously.
 * 
 * @param supabase - Supabase client
 * @param valorFatura - Bill value in R$
 * @param conversa - Conversation data
 * @param dadosColetados - Collected client data
 * @returns true if alert was triggered, false otherwise
 */
export async function checkAndTriggerBigAccountAlert(
  supabase: SupabaseClient,
  valorFatura: number,
  conversa: BigAccountConversaData,
  dadosColetados: Record<string, unknown>
): Promise<boolean> {
  try {
    console.log(`[BIG_ACCOUNT] Checking: valorFatura=${valorFatura}, conversaId=${conversa.id}`);
    
    // 1. Get threshold from config
    const threshold = await getThreshold(supabase);
    console.log(`[BIG_ACCOUNT] Threshold: R$ ${threshold}`);
    
    // 2. Check if value meets threshold
    if (valorFatura < threshold) {
      console.log(`[BIG_ACCOUNT] Value R$ ${valorFatura} below threshold R$ ${threshold}, skipping`);
      return false;
    }
    
    console.log(`[BIG_ACCOUNT] 💰 BIG ACCOUNT DETECTED! R$ ${valorFatura} >= R$ ${threshold}`);
    
    // 3. Check cooldown (don't alert twice for same conversation)
    const alreadyAlerted = await checkAlreadyAlerted(supabase, conversa.id);
    if (alreadyAlerted) {
      console.log(`[BIG_ACCOUNT] Alert already sent for this conversation in last 24h, skipping`);
      return false;
    }
    
    // 4. Get client phone from conversa (normalized)
    const clientePhone = (conversa as any).cliente_telefone || 
                         (dadosColetados.telefone as string) || 
                         '';
    
    if (!clientePhone) {
      console.error(`[BIG_ACCOUNT] No client phone found, cannot trigger alert`);
      return false;
    }
    
    // 5. Trigger alert
    const clienteNome = conversa.cliente_nome || 
                        (dadosColetados.nome as string) || 
                        'Cliente';
    
    const alertPayload: BigAccountAlertPayload = {
      nome: clienteNome,
      telefone: clientePhone,
      valor_conta: valorFatura,
      conversa_id: conversa.id,
      alert_type: 'big_account',
    };
    
    const alertSent = await triggerBigAccountAlert(supabase, alertPayload);
    
    // 6. Log the alert in activity_logs for cooldown tracking
    if (alertSent) {
      await supabase.from('activity_logs').insert({
        action: 'sofia_big_account_alert',
        entity_type: 'chatbot_conversa',
        entity_id: conversa.id,
        entity_name: clienteNome,
        details: {
          valor_fatura: valorFatura,
          threshold,
          cliente_telefone: clientePhone,
        },
      });
      
      console.log(`[BIG_ACCOUNT] ✅ Alert sent and logged for ${clienteNome} (R$ ${valorFatura})`);
    }
    
    return alertSent;
  } catch (error) {
    console.error(`[BIG_ACCOUNT] Exception in checkAndTriggerBigAccountAlert:`, error);
    return false;
  }
}
