/**
 * Rejection Fallback Module
 * Detects rejections from Sofia's response content and marks leads as discarded
 * Extracted from sofia-webhook/index.ts (Phase 16 refactoring)
 * 
 * Rejection types:
 * 1. Tarifa Social - beneficiary of social tariff program
 * 2. Grupo A - high voltage installation
 * 3. Consumo Baixo - consumption below minimum (150 kWh)
 * 4. Região não atendida - distributor not served
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type RejectionType = 
  | 'tarifa_social' 
  | 'grupo_a' 
  | 'consumo_baixo' 
  | 'distribuidora_nao_atendida';

export interface RejectionDetectionResult {
  isRejected: boolean;
  rejectionType: RejectionType | null;
  rejectionLabel: string | null;
}

export interface RejectionFallbackContext {
  supabase: SupabaseClient;
  conversaId: string;
  cleanMessage: string;
  currentMode: string | null;
  existingDados: Record<string, unknown>;
  extractedData: Record<string, unknown>;
  bitrixLeadId: string | null;
}

export interface RejectionFallbackResult {
  handled: boolean;
  rejectionType: RejectionType | null;
  rejectionLabel: string | null;
}

/**
 * Rejection history from conversation - for recurring leads
 */
export interface RejectionHistory {
  wasRejectedBefore: boolean;
  rejectionReason: RejectionType | null;
  rejectionDate: string | null;
  rejectedBy: 'sofia' | 'human' | null;
  rejectionMessage: string | null;
}

// ═══════════════════════════════════════════════════════════════
// REJECTION DETECTION
// ═══════════════════════════════════════════════════════════════

/**
 * Detect rejection by REGION/DISTRIBUIDORA
 * Enhanced patterns for Wilson-like cases (Energisa not attended)
 */
function detectRegionRejection(lowerResponse: string): boolean {
  return (
    // Original patterns
    (lowerResponse.includes('não atendemos') && 
     (lowerResponse.includes('região') || lowerResponse.includes('distribuidora'))) ||
    (lowerResponse.includes('sentimos muito') && lowerResponse.includes('expansão')) ||
    (lowerResponse.includes('salvar seu contato') && lowerResponse.includes('chegarmos')) ||
    (lowerResponse.includes('infelizmente') && lowerResponse.includes('não operamos')) ||
    (lowerResponse.includes('ainda não chegamos') && lowerResponse.includes('região')) ||
    // NEW: Enhanced patterns for "não atende a região da X"
    (lowerResponse.includes('não atende') && lowerResponse.includes('região')) ||
    (lowerResponse.includes('coesa') && lowerResponse.includes('não atend')) ||
    (lowerResponse.includes('plano de expansão') && 
     (lowerResponse.includes('energisa') || lowerResponse.includes('enel') || 
      lowerResponse.includes('light') || lowerResponse.includes('equatorial') ||
      lowerResponse.includes('distribuidora'))) ||
    // NEW: "ainda não atende" / "ainda não atendemos"
    (/ainda\s+não\s+atend/i.test(lowerResponse)) ||
    // NEW: Specific distributors mentioned with rejection context
    ((lowerResponse.includes('energisa') || lowerResponse.includes('enel') || 
      lowerResponse.includes('light') || lowerResponse.includes('equatorial')) &&
     (lowerResponse.includes('sinto muito') || lowerResponse.includes('sentimos muito') ||
      lowerResponse.includes('que pena') || lowerResponse.includes('infelizmente')))
  );
}

/**
 * Detect rejection by TARIFA SOCIAL
 */
function detectTarifaSocialRejection(lowerResponse: string): boolean {
  return (
    (lowerResponse.includes('tarifa social') && 
     (lowerResponse.includes('não') || lowerResponse.includes('infelizmente') || 
      lowerResponse.includes('impede') || lowerResponse.includes('não consigo') ||
      lowerResponse.includes('não se aplica') || lowerResponse.includes('que pena'))) ||
    (lowerResponse.includes('benefício') && lowerResponse.includes('tarifa') && 
     (lowerResponse.includes('não') || lowerResponse.includes('impede'))) ||
    (lowerResponse.includes('não foi aprovada') && lowerResponse.includes('tarifa')) ||
    (lowerResponse.includes('conta') && lowerResponse.includes('social') && 
     (lowerResponse.includes('não atendemos') || lowerResponse.includes('impede'))) ||
    (lowerResponse.includes('baixa renda') && 
     (lowerResponse.includes('não atendemos') || lowerResponse.includes('não se aplica')))
  );
}

/**
 * Detect rejection by GRUPO A (alta tensão)
 */
function detectGrupoARejection(lowerResponse: string): boolean {
  return (
    (lowerResponse.includes('grupo a') && 
     (lowerResponse.includes('não atendemos') || lowerResponse.includes('alta tensão') ||
      lowerResponse.includes('infelizmente'))) ||
    (lowerResponse.includes('alta tensão') && lowerResponse.includes('não'))
  );
}

/**
 * Detect rejection by CONSUMO BAIXO (abaixo do mínimo)
 */
function detectConsumoBaixoRejection(lowerResponse: string): boolean {
  return (
    ((lowerResponse.includes('consumo') && 
      (lowerResponse.includes('baixo') || lowerResponse.includes('mínimo') || 
       lowerResponse.includes('abaixo de 150') || lowerResponse.includes('muito baixo'))) &&
      (lowerResponse.includes('não consigo') || lowerResponse.includes('não posso') ||
       lowerResponse.includes('que pena') || lowerResponse.includes('infelizmente') ||
       lowerResponse.includes('não compensa') || lowerResponse.includes('não incluir'))
    ) || (
      lowerResponse.includes('abaixo de 150 kwh') ||
      lowerResponse.includes('menor que 150 kwh') ||
      (lowerResponse.includes('150 kwh') && 
       (lowerResponse.includes('não incluir') || lowerResponse.includes('não consigo')))
    )
  );
}

/**
 * Detect any rejection from Sofia's response
 */
export function detectRejection(cleanMessage: string): RejectionDetectionResult {
  const lowerResponse = cleanMessage?.toLowerCase() || '';
  
  if (detectTarifaSocialRejection(lowerResponse)) {
    return {
      isRejected: true,
      rejectionType: 'tarifa_social',
      rejectionLabel: 'Tarifa Social detectada',
    };
  }
  
  if (detectGrupoARejection(lowerResponse)) {
    return {
      isRejected: true,
      rejectionType: 'grupo_a',
      rejectionLabel: 'Grupo A (alta tensão) detectado',
    };
  }
  
  if (detectConsumoBaixoRejection(lowerResponse)) {
    return {
      isRejected: true,
      rejectionType: 'consumo_baixo',
      rejectionLabel: 'Consumo abaixo do mínimo (150 kWh)',
    };
  }
  
  if (detectRegionRejection(lowerResponse)) {
    return {
      isRejected: true,
      rejectionType: 'distribuidora_nao_atendida',
      rejectionLabel: 'Região não atendida',
    };
  }
  
  return {
    isRejected: false,
    rejectionType: null,
    rejectionLabel: null,
  };
}

// ═══════════════════════════════════════════════════════════════
// MAIN FUNCTION
// ═══════════════════════════════════════════════════════════════

/**
 * Handle rejection fallback - detects rejections from Sofia's response
 * and marks leads as discarded in DB and Bitrix
 */
export async function handleRejectionFallback(
  ctx: RejectionFallbackContext
): Promise<RejectionFallbackResult> {
  const { supabase, conversaId, cleanMessage, currentMode, existingDados, extractedData, bitrixLeadId } = ctx;
  
  // Skip if already discarded
  if (currentMode === 'descartado') {
    return { handled: false, rejectionType: null, rejectionLabel: null };
  }
  
  const detection = detectRejection(cleanMessage);
  
  if (!detection.isRejected || !detection.rejectionType) {
    return { handled: false, rejectionType: null, rejectionLabel: null };
  }
  
  console.log(`[rejection-fallback] 🚫 ${detection.rejectionLabel} - garantindo atualização do banco`);
  
  // Build specific flags based on rejection type
  const specificFlags: Record<string, boolean> = {};
  switch (detection.rejectionType) {
    case 'consumo_baixo':
      specificFlags.consumoBaixo = true;
      break;
    case 'grupo_a':
      specificFlags.isGrupoA = true;
      break;
    case 'tarifa_social':
      specificFlags.tarifaSocial = true;
      break;
    case 'distribuidora_nao_atendida':
      specificFlags.distribuidoraNaoAtendida = true;
      break;
  }
  
  // Update conversation - CRITICAL: Clear ALL automation timestamps
  await supabase
    .from('chatbot_conversas')
    .update({
      sofia_mode: 'descartado',
      bitrix24_stage: 'JUNK',
      ended_at: new Date().toISOString(),
      awaiting_response: false,
      nudge_count: 0,
      // CRITICAL: Clear ALL automation timestamps to prevent FUP/Rescue
      next_nudge_at: null,
      next_followup_at: null,
      next_rescue_at: null,
      next_contract_nudge_at: null,
      dados_coletados: {
        ...existingDados,
        ...extractedData,
        motivoDescarte: detection.rejectionType,
        ...specificFlags,
        descarteDetectadoPorFallback: true,
        descarteDetectadoEm: new Date().toISOString(),
      },
    })
    .eq('id', conversaId);
  
  // Update Bitrix to JUNK stage
  if (bitrixLeadId) {
    try {
      console.log(`[rejection-fallback] Movendo lead ${bitrixLeadId} para JUNK no Bitrix`);
      await supabase.functions.invoke('bitrix24-update-lead', {
        body: {
          leadId: bitrixLeadId,
          fields: {
            STAGE_ID: 'JUNK',
            COMMENTS: `🚫 Lead descartado automaticamente\n📋 Motivo: ${detection.rejectionLabel}\n⏰ ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
          },
        },
      });
    } catch (bitrixError) {
      console.error('[rejection-fallback] Erro ao atualizar Bitrix:', bitrixError);
    }
  }
  
  console.log(`[rejection-fallback] ✅ Conversa ${conversaId} marcada como descartada (${detection.rejectionType}) via fallback`);
  
  return {
    handled: true,
    rejectionType: detection.rejectionType,
    rejectionLabel: detection.rejectionLabel,
  };
}

// ═══════════════════════════════════════════════════════════════
// REJECTION HISTORY LOOKUP (Phase 26)
// ═══════════════════════════════════════════════════════════════

/**
 * Get human-readable label for rejection reason
 */
export function getRejectionLabel(reason: RejectionType | string | null): string {
  switch (reason) {
    case 'tarifa_social': return 'Tarifa Social';
    case 'grupo_a': return 'Grupo A (Alta Tensão)';
    case 'consumo_baixo': return 'Consumo Abaixo do Mínimo';
    case 'distribuidora_nao_atendida': return 'Região Não Atendida';
    default: return reason || 'Desconhecido';
  }
}

/**
 * Fetches rejection history from conversation messages
 * Looks for patterns indicating the lead was previously rejected
 */
export async function fetchRejectionHistory(
  supabase: SupabaseClient,
  conversaId: string
): Promise<RejectionHistory> {
  const emptyResult: RejectionHistory = { 
    wasRejectedBefore: false, 
    rejectionReason: null, 
    rejectionDate: null, 
    rejectedBy: null, 
    rejectionMessage: null 
  };
  
  try {
    // Fetch assistant messages that might contain rejection
    const { data: messages, error } = await supabase
      .from('chatbot_mensagens')
      .select('content, created_at, role')
      .eq('conversa_id', conversaId)
      .eq('role', 'assistant')
      .order('created_at', { ascending: false })
      .limit(100);
    
    if (error || !messages || messages.length === 0) {
      return emptyResult;
    }
    
    // Patterns indicating rejection by TARIFA SOCIAL
    const tarifaSocialPatterns = [
      /tarifa social.*(?:não|impede|que pena|infelizmente)/i,
      /(?:não|infelizmente).*tarifa social/i,
      /possui.*tarifa social/i,
      /benefício.*baixa renda.*não/i,
      /conta.*social.*(?:não consigo|não atendemos)/i,
    ];
    
    // Patterns indicating rejection by REGION/DISTRIBUIDORA
    const regionPatterns = [
      /não atendemos.*(?:região|distribuidora)/i,
      /(?:região|distribuidora).*não atendemos/i,
      /sentimos muito.*expansão/i,
      /ainda não chegamos.*região/i,
    ];
    
    // Patterns indicating rejection by GRUPO A
    const grupoAPatterns = [
      /grupo a.*(?:não atendemos|alta tensão)/i,
      /alta tensão.*não/i,
    ];
    
    // Patterns indicating rejection by LOW CONSUMPTION
    const consumoBaixoPatterns = [
      /consumo.*(?:baixo|mínimo).*não/i,
      /conta.*(?:muito baixa|pequena).*não compensa/i,
    ];
    
    // Search through messages for rejection patterns
    for (const msg of messages) {
      const content = msg.content?.toLowerCase() || '';
      
      // Check Tarifa Social
      if (tarifaSocialPatterns.some(p => p.test(content))) {
        console.log(`[fetchRejectionHistory] Found TARIFA SOCIAL rejection in message from ${msg.created_at}`);
        return {
          wasRejectedBefore: true,
          rejectionReason: 'tarifa_social',
          rejectionDate: msg.created_at,
          rejectedBy: 'human', // Assume human since sofIA should have marked properly
          rejectionMessage: msg.content?.substring(0, 200),
        };
      }
      
      // Check Region/Distribuidora
      if (regionPatterns.some(p => p.test(content))) {
        console.log(`[fetchRejectionHistory] Found REGION rejection in message from ${msg.created_at}`);
        return {
          wasRejectedBefore: true,
          rejectionReason: 'distribuidora_nao_atendida',
          rejectionDate: msg.created_at,
          rejectedBy: 'sofia',
          rejectionMessage: msg.content?.substring(0, 200),
        };
      }
      
      // Check Grupo A
      if (grupoAPatterns.some(p => p.test(content))) {
        console.log(`[fetchRejectionHistory] Found GRUPO A rejection in message from ${msg.created_at}`);
        return {
          wasRejectedBefore: true,
          rejectionReason: 'grupo_a',
          rejectionDate: msg.created_at,
          rejectedBy: 'sofia',
          rejectionMessage: msg.content?.substring(0, 200),
        };
      }
      
      // Check Consumo Baixo
      if (consumoBaixoPatterns.some(p => p.test(content))) {
        console.log(`[fetchRejectionHistory] Found LOW CONSUMPTION rejection in message from ${msg.created_at}`);
        return {
          wasRejectedBefore: true,
          rejectionReason: 'consumo_baixo',
          rejectionDate: msg.created_at,
          rejectedBy: 'sofia',
          rejectionMessage: msg.content?.substring(0, 200),
        };
      }
    }
    
    return emptyResult;
    
  } catch (err) {
    console.error('[fetchRejectionHistory] Error:', err);
    return emptyResult;
  }
}
