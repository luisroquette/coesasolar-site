/**
 * Proposal Link Sender Module
 * Handles sending proposal links to clients via WhatsApp
 * Extracted from sofia-webhook/index.ts (Phase 39 refactoring)
 * 
 * Responsibilities:
 * - Fetching public URL configuration
 * - Building properly formatted proposal URLs
 * - Sending proposal link message to client
 * - Clearing pending tasks after proposal sent
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface ProposalLinkContext {
  supabase: SupabaseClient;
  conversaId: string;
  phone: string;
  clienteNome: string | null;
  propostaId: string;
  tipoProposta?: 'inicial' | 'definitiva';
  enviarLinksEnabled: boolean;
  sendWhatsAppMessage: (phone: string, message: string) => Promise<void>;
}

export interface ProposalLinkResult {
  sent: boolean;
  propostaUrl?: string;
  message?: string;
  skipped?: boolean;
  skipReason?: string;
}

// ═══════════════════════════════════════════════════════════════
// URL CONFIGURATION
// ═══════════════════════════════════════════════════════════════

interface URLConfig {
  publicAppUrl: string;
  cacheBust?: string;
}

/**
 * Fetch public URL configuration from database
 */
async function fetchURLConfig(supabase: SupabaseClient): Promise<URLConfig> {
  const defaultUrl = 'https://coesa-propose-craft.lovable.app';
  
  try {
    const { data: configs } = await supabase
      .from('configuracoes_sistema')
      .select('chave, valor')
      .in('chave', ['public_app_url', 'public_cache_bust']);
    
    const publicAppUrl = configs?.find(c => c.chave === 'public_app_url')?.valor || defaultUrl;
    const cacheBust = configs?.find(c => c.chave === 'public_cache_bust')?.valor;
    
    return { publicAppUrl, cacheBust };
  } catch (error) {
    console.error('[PROPOSAL_LINK] Error fetching URL config:', error);
    return { publicAppUrl: defaultUrl };
  }
}

/**
 * Build proposal URL with proper formatting
 */
function buildProposalUrl(
  config: URLConfig,
  propostaId: string,
  tipoProposta: 'inicial' | 'definitiva' = 'inicial'
): string {
  const baseUrl = config.publicAppUrl.replace(/\/$/, '');
  const routePath = tipoProposta === 'definitiva' ? 'proposta-definitiva' : 'proposta-inicial';
  
  const params = new URLSearchParams();
  if (config.cacheBust) {
    params.set('v', config.cacheBust);
  }
  
  const queryString = params.toString();
  return `${baseUrl}/${routePath}/${propostaId}${queryString ? `?${queryString}` : ''}`;
}

// ═══════════════════════════════════════════════════════════════
// MESSAGE GENERATION
// ═══════════════════════════════════════════════════════════════

/**
 * Generate proposal link message
 */
function generateProposalMessage(propostaUrl: string): string {
  return `🎉 *Sua proposta está pronta!*

📊 Preparei uma simulação personalizada com base no valor da sua conta.

👉 Acesse aqui: ${propostaUrl}

Dá uma olhada e me conta o que achou! Se tiver qualquer dúvida, é só me chamar. 😊`;
}

// ═══════════════════════════════════════════════════════════════
// PENDING TASK CLEARING
// ═══════════════════════════════════════════════════════════════

/**
 * Clear pending task after proposal is sent
 */
async function clearPendingTask(supabase: SupabaseClient, conversaId: string): Promise<void> {
  try {
    await supabase
      .from('chatbot_conversas')
      .update({
        pending_task: null,
        pending_task_created_at: null,
        pending_task_retries: null,
      })
      .eq('id', conversaId);
    
    console.log(`[PROPOSAL_LINK] Cleared pending task for conversa: ${conversaId}`);
  } catch (error) {
    console.error('[PROPOSAL_LINK] Error clearing pending task:', error);
  }
}

// ═══════════════════════════════════════════════════════════════
// MAIN FUNCTION
// ═══════════════════════════════════════════════════════════════

/**
 * Send proposal link to client
 * 
 * ⚠️ DESABILITADO: O envio de proposta via WhatsApp agora é feito EXCLUSIVAMENTE
 * pelo bitrix24-link-webhook, que possui deduplicação robusta via hash.
 * Isso evita mensagens duplicadas (4 mensagens enviadas de uma vez).
 * 
 * Esta função agora apenas atualiza o estado da conversa (pending task, event_proposal_sent)
 * mas NÃO envia mensagem via WhatsApp.
 */
export async function sendProposalLink(ctx: ProposalLinkContext): Promise<ProposalLinkResult> {
  const {
    supabase,
    conversaId,
    propostaId,
    tipoProposta = 'inicial',
  } = ctx;
  
  console.log('[PROPOSAL_LINK] ⚠️ WhatsApp sending disabled - handled by bitrix24-link-webhook');
  console.log('[PROPOSAL_LINK] Only updating conversation state (pending task, event_proposal_sent)');
  
  // Build URL for reference (not sending)
  const urlConfig = await fetchURLConfig(supabase);
  const propostaUrl = buildProposalUrl(urlConfig, propostaId, tipoProposta);
  
  console.log(`[PROPOSAL_LINK] Proposal URL (for reference): ${propostaUrl}`);
  
  // Clear pending task and mark proposal sent
  // The actual WhatsApp message will be sent by bitrix24-link-webhook
  await clearPendingTask(supabase, conversaId);
  await supabase
    .from('chatbot_conversas')
    .update({ 
      event_proposal_sent: true,
      proposta_link_sent_at: new Date().toISOString(), // CRITICAL: Track when link was sent for deduplication
    })
    .eq('id', conversaId);
  
  console.log(`[PROPOSAL_LINK] ✅ Conversation state updated (WhatsApp handled by bitrix24-link-webhook)`);
  
  return {
    sent: false,
    skipped: true,
    skipReason: 'WhatsApp sending handled by bitrix24-link-webhook to prevent duplicates',
    propostaUrl, // Include URL for logging/debugging
  };
}

/**
 * Handle proposal creation result and send link if needed
 * Called after syncToBitrix when a proposal is created
 */
export async function handleProposalCreated(
  ctx: ProposalLinkContext,
  bitrixResult: {
    propostaCreated?: boolean;
    propostaId?: string;
    stageUpdated?: boolean;
  },
  pendingTask?: string | null
): Promise<ProposalLinkResult> {
  const { supabase, conversaId } = ctx;
  
  // If proposal was JUST created, send the link to the client
  if (bitrixResult.propostaCreated && bitrixResult.propostaId) {
    return await sendProposalLink({
      ...ctx,
      propostaId: bitrixResult.propostaId,
    });
  }
  
  // If proposal was created/linked via stage update, clear pending task
  if (bitrixResult.stageUpdated && pendingTask === 'proposta_inicial') {
    console.log('[PROPOSAL_LINK] Proposal created via stage update, clearing pending task');
    await clearPendingTask(supabase, conversaId);
    
    return {
      sent: false,
      skipped: true,
      skipReason: 'Stage updated, task cleared',
    };
  }
  
  return {
    sent: false,
    skipped: true,
    skipReason: 'No proposal to send',
  };
}
