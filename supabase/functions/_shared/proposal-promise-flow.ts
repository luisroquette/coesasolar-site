/**
 * Proposal Promise Flow Module
 * Detects when Sofia promises to generate a proposal and handles immediate Bitrix sync
 * Extracted from sofia-webhook/index.ts (Phase 18 refactoring)
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { matchesPatternCategory } from './detection-patterns.ts';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface ExtractedClientData {
  nome?: string | null;
  email?: string | null;
  valorFatura?: number | null;
  consumo?: number | null;
  distribuidora?: string | null;
  tipoInstalacao?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
  [key: string]: unknown;
}

export interface ProposalPromiseContext {
  supabase: SupabaseClient;
  conversaId: string;
  phone: string;
  clienteNome: string | null;
  cleanMessage: string;
  existingDados: Record<string, unknown>;
  extractedData: Record<string, unknown>;
  needsHumanEscalation: boolean;
  aiFailedCompletely: boolean;
  // Using 'any' for function types to allow flexibility with different implementations
  syncToBitrixFn: (
    supabase: any,
    conversaId: string,
    phone: string,
    clienteNome: string | null,
    dadosColetados: any,
    newFile: any,
    forcarMovimentacao: boolean
  ) => Promise<{ success: boolean; stageUpdated?: boolean; newStage?: string; error?: string }>;
  setPendingTaskFn: (supabase: any, conversaId: string, taskType: string) => Promise<void>;
}

export interface ProposalPromiseResult {
  detected: boolean;
  handled: boolean;
  hasMinimumData: boolean;
  syncSuccess: boolean;
  newStage?: string;
  error?: string;
  /**
   * When Sofia promises proposal without minimum data,
   * this contains a replacement message that MUST be used
   * instead of the original promise to prevent empty promises
   */
  replacementMessage?: string;
  /**
   * List of missing fields that caused the premature promise block
   */
  missingFields?: string[];
}

// ═══════════════════════════════════════════════════════════════
// DETECTION FUNCTIONS - Uses dynamic patterns from database
// ═══════════════════════════════════════════════════════════════

/**
 * Detect if Sofia is promising to generate a proposal
 * Uses patterns from database (category: proposal_promise)
 */
export function detectProposalPromise(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  
  // Try dynamic patterns first
  if (matchesPatternCategory(lowerMessage, 'proposal_promise')) {
    return true;
  }
  
  // Fallback patterns
  const fallbackPatterns = [
    /vou (?:preparar|gerar|criar|fazer|montar|elaborar)\s+(?:a\s+)?(?:sua\s+)?proposta/i,
    /(?:preparando|gerando|criando|fazendo|montando)\s+(?:a\s+)?(?:sua\s+)?proposta/i,
    /(?:j[áa]\s+)?(?:vou\s+)?(?:te\s+)?(?:enviar|mandar)\s+(?:a\s+)?(?:sua\s+)?proposta/i,
    /proposta\s+(?:est[áa]\s+)?(?:sendo\s+)?(?:preparada|gerada|criada)/i,
    /(?:deixa|deixe)\s+eu\s+(?:preparar|gerar|criar|fazer)\s+(?:a\s+)?(?:sua\s+)?proposta/i,
    /vou\s+calcular\s+(?:a\s+)?(?:sua\s+)?economia/i,
    /(?:j[áa]\s+)?(?:tenho|consegui)\s+(?:todos?\s+)?(?:os?\s+)?dados?\s+(?:para|pra)\s+(?:a\s+)?proposta/i,
  ];
  
  return fallbackPatterns.some(pattern => pattern.test(lowerMessage));
}

// ═══════════════════════════════════════════════════════════════
// MISSING DATA MESSAGE GENERATOR
// Generates a replacement message when Sofia promises without data
// ═══════════════════════════════════════════════════════════════

/**
 * Generate a friendly message asking for missing data
 * This replaces the empty promise with an actionable question
 */
function generateMissingDataMessage(
  missingFields: string[],
  clienteNome?: string | null
): string {
  const firstName = clienteNome?.split(' ')[0] || '';
  const greeting = firstName ? `${firstName}, ` : '';
  
  // Priority order: distribuidora > valor > email > nome
  // Ask for the most important missing field first
  
  if (missingFields.includes('distribuidora') && missingFields.includes('valor')) {
    return `${greeting}para calcular sua economia e preparar sua proposta, preciso saber:

📊 *Qual o valor médio da sua conta de luz?*
🏢 *Qual a sua distribuidora de energia?* (ex: CEMIG, Energisa MG)

Com essas informações já consigo te mostrar quanto você pode economizar! 💚`;
  }
  
  if (missingFields.includes('distribuidora')) {
    return `${greeting}para finalizar sua proposta, me diz: *qual é a sua distribuidora de energia?* 🏢

(Ex: CEMIG, Energisa MG)`;
  }
  
  if (missingFields.includes('valor')) {
    return `${greeting}para calcular sua economia, preciso saber: *qual o valor médio da sua conta de luz?* 💡

Pode ser um valor aproximado, como "uns R$ 400" ou "entre 300 e 500 reais".`;
  }
  
  if (missingFields.includes('email')) {
    return `${greeting}para te enviar a proposta personalizada, preciso do seu *e-mail*! 📧

Assim você recebe todos os detalhes da economia que podemos oferecer.`;
  }
  
  if (missingFields.includes('nome')) {
    return `Para preparar sua proposta personalizada, me diz: *qual é o seu nome?* 😊`;
  }
  
  // Fallback generic message
  return `${greeting}para preparar sua proposta, preciso de mais algumas informações! Me conta: qual o *valor médio* da sua conta de luz e qual a sua *distribuidora*?`;
}

/**
 * Check if minimum data is available for proposal generation
 * Requirements: Nome, E-mail, Distribuidora, Valor da Fatura (ou consumo)
 * 
 * @param dados - Collected data from conversation
 * @param fallbackNome - Optional fallback name (e.g., from WhatsApp contact)
 */
export function hasMinimumDataForProposal(
  dados: ExtractedClientData, 
  fallbackNome?: string | null
): boolean {
  // Use fallback name if dados.nome is missing
  const effectiveNome = dados.nome || fallbackNome;
  const hasNome = !!effectiveNome && effectiveNome.trim().length >= 2;
  const hasEmail = !!dados.email && dados.email.includes('@');
  // Also check distribuidoraInformada as fallback (typo might not be confirmed yet)
  const hasDistribuidora = !!dados.distribuidora || !!(dados as any).distribuidoraInformada;
  const hasValorOuConsumo = !!(dados.valorFatura || dados.consumo);
  
  const result = hasNome && hasEmail && hasDistribuidora && hasValorOuConsumo;
  
  console.log(`[hasMinimumDataForProposal] Check: nome=${hasNome}(${effectiveNome?.substring(0,10) || 'null'}), email=${hasEmail}, valor=${hasValorOuConsumo}, distribuidora=${hasDistribuidora} => ${result}`);
  
  return result;
}

// ═══════════════════════════════════════════════════════════════
// MAIN FUNCTION
// ═══════════════════════════════════════════════════════════════

/**
 * Handle proposal promise flow
 * Detects promise, validates minimum data, and syncs to Bitrix immediately
 */
export async function handleProposalPromiseFlow(
  ctx: ProposalPromiseContext
): Promise<ProposalPromiseResult> {
  const {
    supabase,
    conversaId,
    phone,
    clienteNome,
    cleanMessage,
    existingDados,
    extractedData,
    needsHumanEscalation,
    aiFailedCompletely,
    syncToBitrixFn,
    setPendingTaskFn,
  } = ctx;
  
  // Skip if escalation needed or AI failed
  if (needsHumanEscalation || aiFailedCompletely) {
    return { detected: false, handled: false, hasMinimumData: false, syncSuccess: false };
  }
  
  // Check for proposal promise
  if (!detectProposalPromise(cleanMessage)) {
    return { detected: false, handled: false, hasMinimumData: false, syncSuccess: false };
  }
  
  console.log('[proposal-promise-flow] Sofia promised proposal - checking minimum data');
  
  // Merge extracted data with existing data
  const mergedDados: ExtractedClientData = { ...existingDados, ...extractedData };
  
  // Check minimum requirements - use clienteNome as fallback for nome
  if (!hasMinimumDataForProposal(mergedDados, clienteNome)) {
    // Calculate effective name for logging
    const effectiveNome = mergedDados.nome || clienteNome;
    console.log('[proposal-promise-flow] ⚠️ Sofia promised proposal BUT missing data - BLOCKING PROMISE');
    
    // Identify missing fields for targeted response
    const missingFields: string[] = [];
    const hasNome = !!(mergedDados.nome || clienteNome);
    const hasEmail = !!mergedDados.email && String(mergedDados.email).includes('@');
    const hasDistribuidora = !!mergedDados.distribuidora || !!(mergedDados as any).distribuidoraInformada;
    const hasValor = !!(mergedDados.valorFatura || mergedDados.consumo);
    
    if (!hasNome) missingFields.push('nome');
    if (!hasEmail) missingFields.push('email');
    if (!hasDistribuidora) missingFields.push('distribuidora');
    if (!hasValor) missingFields.push('valor');
    
    console.log('[proposal-promise-flow] Missing fields:', missingFields);
    console.log('[proposal-promise-flow] Missing data check:', {
      nome: mergedDados.nome,
      clienteNome,
      effectiveNome,
      email: mergedDados.email,
      valorFatura: mergedDados.valorFatura,
      consumo: mergedDados.consumo,
      distribuidora: mergedDados.distribuidora,
    });
    
    // ═══════════════════════════════════════════════════════════════
    // CRITICAL FIX: Generate REPLACEMENT message instead of empty promise
    // This prevents Sofia from promising proposal without having the data
    // ═══════════════════════════════════════════════════════════════
    const replacementMessage = generateMissingDataMessage(missingFields, effectiveNome);
    console.log('[proposal-promise-flow] ✅ Generated replacement message to collect missing data');
    
    // Create admin notification for observability
    await supabase.from('admin_notifications').insert({
      title: '🔄 Promessa bloqueada - coletando dados',
      message: `sofIA ia prometer proposta mas falta: ${missingFields.join(', ')}. Mensagem substituída para coletar dados.`,
      type: 'promise_blocked',
      entity_type: 'chatbot_conversa',
      entity_id: conversaId,
    });
    
    return {
      detected: true,
      handled: true, // CHANGED: Now we're handling it by providing replacement
      hasMinimumData: false,
      syncSuccess: false,
      replacementMessage, // NEW: Caller should use this instead of original message
      missingFields,
    };
  }
  
  console.log('[proposal-promise-flow] Has minimum data - proceeding with immediate sync');
  console.log('[proposal-promise-flow] Data being used:', {
    nome: mergedDados.nome,
    email: mergedDados.email,
    valorFatura: mergedDados.valorFatura,
    consumo: mergedDados.consumo,
    distribuidora: mergedDados.distribuidora,
  });
  
  // Save merged data before sync (fixes race condition)
  await supabase
    .from('chatbot_conversas')
    .update({ dados_coletados: mergedDados })
    .eq('id', conversaId);
  console.log('[proposal-promise-flow] Saved merged dados_coletados before sync');
  
  // Immediate sync to Bitrix
  try {
    const syncResult = await syncToBitrixFn(
      supabase,
      conversaId,
      phone,
      clienteNome || mergedDados.nome || 'Cliente',
      mergedDados,
      undefined,
      true // forcarMovimentacao = TRUE
    );
    
    if (syncResult.success && syncResult.stageUpdated) {
      console.log(`[proposal-promise-flow] ✅ Lead successfully moved to stage: ${syncResult.newStage}`);
      
      // Also set pending_task as backup
      await setPendingTaskFn(supabase, conversaId, 'proposta_inicial');
      
      return {
        detected: true,
        handled: true,
        hasMinimumData: true,
        syncSuccess: true,
        newStage: syncResult.newStage,
      };
    } else if (syncResult.error) {
      console.error('[proposal-promise-flow] ⚠️ Failed to move lead immediately:', syncResult.error);
      
      // Set pending_task as backup
      await setPendingTaskFn(supabase, conversaId, 'proposta_inicial');
      
      return {
        detected: true,
        handled: true,
        hasMinimumData: true,
        syncSuccess: false,
        error: syncResult.error,
      };
    } else {
      // Stage not updated (might already be at correct stage)
      console.log('[proposal-promise-flow] Lead sync completed, stage may already be correct');
      
      // Set pending_task as backup
      await setPendingTaskFn(supabase, conversaId, 'proposta_inicial');
      
      return {
        detected: true,
        handled: true,
        hasMinimumData: true,
        syncSuccess: true,
      };
    }
  } catch (syncError) {
    console.error('[proposal-promise-flow] ❌ Error in immediate Bitrix sync:', syncError);
    
    // Set pending_task as backup
    await setPendingTaskFn(supabase, conversaId, 'proposta_inicial');
    
    return {
      detected: true,
      handled: true,
      hasMinimumData: true,
      syncSuccess: false,
      error: syncError instanceof Error ? syncError.message : 'Unknown sync error',
    };
  }
}
