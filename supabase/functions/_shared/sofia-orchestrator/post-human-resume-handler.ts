/**
 * POST-HUMAN RESUME HANDLER
 * 
 * Handles the transition when Sofia resumes after human intervention (#RESOLVIDO).
 * CRITICAL: Preserves all collected data and skips triagem if data exists.
 * 
 * Problems this module fixes:
 * 1. Sofia "forgetting" context after #RESOLVIDO (data loss)
 * 2. Triagem menu appearing for leads with commercial data
 * 3. Repeated fallback messages after human intervention
 * 
 * @module _shared/sofia-orchestrator/post-human-resume-handler
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.90.0';
import { corsHeaders } from '../webhook-types.ts';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface PostHumanResumeContext {
  supabase: SupabaseClient;
  conversaId: string;
  phone: string;
  clienteNome: string | null;
  messageText: string;
  dadosColetados: Record<string, unknown>;
  sofiaMode: string | null;
  lastSofiaMessageAt: string | null;
  humanInterventionCompleted: boolean;
}

export interface PostHumanResumeResult {
  shouldSkipTriagem: boolean;
  shouldSkipGreeting: boolean;
  preservedContext: boolean;
  existingDataSummary: {
    hasDistribuidora: boolean;
    hasValor: boolean;
    hasNome: boolean;
    hasEmail: boolean;
    hasCpf: boolean;
    hasProposta: boolean;
  };
  nextExpectedField: string | null;
  resumeMessage?: string;
}

// ═══════════════════════════════════════════════════════════════
// DETECTION FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Check if conversation just returned from human intervention
 */
export function isReturningFromHumanIntervention(
  dadosColetados: Record<string, unknown>,
  sofiaMode: string | null
): boolean {
  // Check explicit flag set by #RESOLVIDO
  if (dadosColetados?.human_intervention_completed === true) {
    return true;
  }
  
  // Check context_restored_at (set when returning from human)
  if (dadosColetados?.context_restored_at) {
    return true;
  }
  
  // Mode is standard but has human_resolved markers
  if (sofiaMode === 'standard' && dadosColetados?.human_resolved_at) {
    return true;
  }
  
  return false;
}

/**
 * Check if we have substantial commercial data collected
 */
export function hasCommercialData(dadosColetados: Record<string, unknown>): {
  hasData: boolean;
  details: {
    distribuidora: string | null;
    valor: number | null;
    consumo: number | null;
    nome: string | null;
    email: string | null;
    cpf: string | null;
    propostaId: string | null;
  };
} {
  const distribuidora = (dadosColetados?.distribuidora as string) || 
                        (dadosColetados?.distribuidoraInformada as string) || null;
  const valor = (dadosColetados?.valorFatura as number) || 
                (dadosColetados?.valor_fatura as number) || null;
  const consumo = (dadosColetados?.consumo as number) || null;
  const nome = (dadosColetados?.nome as string) || null;
  const email = (dadosColetados?.email as string) || null;
  const cpf = (dadosColetados?.cpf as string) || null;
  const propostaId = (dadosColetados?.proposta_id as string) || null;
  
  const hasData = !!(distribuidora || valor || consumo || email || cpf || propostaId);
  
  return {
    hasData,
    details: {
      distribuidora,
      valor,
      consumo,
      nome,
      email,
      cpf,
      propostaId,
    },
  };
}

/**
 * Determine what field Sofia should collect next based on existing data
 */
export function determineNextExpectedField(
  dadosColetados: Record<string, unknown>
): string | null {
  const data = hasCommercialData(dadosColetados);
  
  // If no valor/consumo, ask for that first (qualificação)
  if (!data.details.valor && !data.details.consumo) {
    return 'valor';
  }
  
  // If no distribuidora
  if (!data.details.distribuidora) {
    return 'distribuidora';
  }
  
  // If no email (required for proposta)
  if (!data.details.email) {
    return 'email';
  }
  
  // If no nome
  if (!data.details.nome) {
    return 'nome';
  }
  
  // If no CPF (for docs stage)
  if (!data.details.cpf) {
    return 'cpf';
  }
  
  // All data collected
  return null;
}

// ═══════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════

/**
 * Process conversation resuming after human intervention
 * Returns context about what Sofia should do next
 */
export async function handlePostHumanResume(
  ctx: PostHumanResumeContext
): Promise<PostHumanResumeResult> {
  const {
    supabase,
    conversaId,
    dadosColetados,
    sofiaMode,
  } = ctx;
  
  // Check if returning from human
  const isReturning = isReturningFromHumanIntervention(dadosColetados, sofiaMode);
  
  // Check existing commercial data
  const commercialData = hasCommercialData(dadosColetados);
  
  // Determine next field
  const nextExpectedField = determineNextExpectedField(dadosColetados);
  
  console.log(`[POST_HUMAN_RESUME] Checking context for conversa ${conversaId}:`, {
    isReturning,
    hasCommercialData: commercialData.hasData,
    distribuidora: commercialData.details.distribuidora,
    valor: commercialData.details.valor,
    nextExpectedField,
  });
  
  // Build result
  const result: PostHumanResumeResult = {
    // Skip triagem if: returning from human OR has commercial data
    shouldSkipTriagem: isReturning || commercialData.hasData,
    // Skip greeting if: has commercial data (they're not a new contact)
    shouldSkipGreeting: commercialData.hasData,
    preservedContext: isReturning,
    existingDataSummary: {
      hasDistribuidora: !!commercialData.details.distribuidora,
      hasValor: !!(commercialData.details.valor || commercialData.details.consumo),
      hasNome: !!commercialData.details.nome,
      hasEmail: !!commercialData.details.email,
      hasCpf: !!commercialData.details.cpf,
      hasProposta: !!commercialData.details.propostaId,
    },
    nextExpectedField,
  };
  
  // If returning from human intervention and has commercial data,
  // update dados_coletados to ensure triagem is marked complete
  if (result.shouldSkipTriagem && conversaId) {
    const updatedDados = {
      ...dadosColetados,
      triagem_concluida: true,
      human_intervention_completed: true,
      fsm_context_verified_at: new Date().toISOString(),
    };
    
    await supabase
      .from('chatbot_conversas')
      .update({
        dados_coletados: updatedDados,
        fsm_expected_field: nextExpectedField,
      })
      .eq('id', conversaId);
    
    console.log(`[POST_HUMAN_RESUME] ✅ Context preserved. triagem_concluida=true, nextField=${nextExpectedField}`);
  }
  
  return result;
}

// ═══════════════════════════════════════════════════════════════
// DUPLICATE MESSAGE PREVENTION
// ═══════════════════════════════════════════════════════════════

/**
 * Check if Sofia is about to send a duplicate/similar message
 * Prevents the "Desculpe, problema técnico" loop
 */
export async function checkDuplicateResponse(
  supabase: SupabaseClient,
  conversaId: string,
  proposedMessage: string,
  windowMinutes: number = 5
): Promise<{
  isDuplicate: boolean;
  lastSimilarMessage?: string;
  lastSentAt?: string;
}> {
  try {
    // Get recent assistant messages
    const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
    
    const { data: recentMessages } = await supabase
      .from('chatbot_mensagens')
      .select('content, created_at')
      .eq('conversa_id', conversaId)
      .eq('role', 'assistant')
      .gte('created_at', windowStart)
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (!recentMessages || recentMessages.length === 0) {
      return { isDuplicate: false };
    }
    
    // Normalize for comparison
    const normalizeForComparison = (text: string): string => {
      return text
        .toLowerCase()
        .replace(/[^\w\s]/g, '')  // Remove punctuation
        .replace(/\s+/g, ' ')      // Normalize whitespace
        .trim()
        .substring(0, 100);        // Compare first 100 chars
    };
    
    const proposedNormalized = normalizeForComparison(proposedMessage);
    
    // Check for similarity
    for (const msg of recentMessages) {
      const msgNormalized = normalizeForComparison(msg.content);
      
      // Exact or very similar match
      if (proposedNormalized === msgNormalized) {
        return {
          isDuplicate: true,
          lastSimilarMessage: msg.content,
          lastSentAt: msg.created_at,
        };
      }
      
      // Check for technical fallback pattern repetition
      const fallbackPatterns = [
        'desculpe tive um problema técnico',
        'problema técnico estou de volta',
        'desculpe problema técnico',
      ];
      
      const isFallbackMessage = fallbackPatterns.some(pattern => 
        proposedNormalized.includes(pattern.replace(/\s+/g, ' '))
      );
      
      const wasFallbackMessage = fallbackPatterns.some(pattern =>
        msgNormalized.includes(pattern.replace(/\s+/g, ' '))
      );
      
      if (isFallbackMessage && wasFallbackMessage) {
        return {
          isDuplicate: true,
          lastSimilarMessage: msg.content,
          lastSentAt: msg.created_at,
        };
      }
    }
    
    return { isDuplicate: false };
  } catch (error) {
    console.error('[DUPLICATE_CHECK] Error:', error);
    return { isDuplicate: false };
  }
}

/**
 * Generate an alternative message when duplicate is detected
 */
export function generateAlternativeResponse(
  clienteNome: string | null,
  nextExpectedField: string | null
): string {
  const firstName = clienteNome?.split(' ')[0] || '';
  const greeting = firstName ? `${firstName}, ` : '';
  
  // Generate based on what data we need next
  switch (nextExpectedField) {
    case 'valor':
      return `${greeting}para continuar, me conta: qual é o *valor médio* da sua conta de luz? 💡`;
    
    case 'distribuidora':
      return `${greeting}me conta qual é a sua *distribuidora de energia* (a que aparece na sua conta de luz)? 🏭`;
    
    case 'email':
      return `${greeting}qual é o seu *e-mail* para eu preparar sua proposta? 📧`;
    
    case 'nome':
      return `${greeting}pode me informar seu *nome completo*? 📝`;
    
    case 'cpf':
      return `${greeting}agora preciso do seu *CPF* para finalizar o cadastro. 🪪`;
    
    default:
      return `${greeting}como posso te ajudar? Se quiser, me conta mais sobre o que você precisa! 😊`;
  }
}
