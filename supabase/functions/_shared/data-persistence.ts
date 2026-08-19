/**
 * Data Persistence Module
 * Centralizes critical field persistence and auto-rescue handling
 * Extracted from sofia-webhook/index.ts (Phase 35 refactoring)
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ExtractedClientData } from './data-extraction.ts';

// Re-export for convenience
export type { ExtractedClientData };

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface CriticalPersistenceParams {
  supabase: SupabaseClient;
  conversaId: string;
  existingDados: ExtractedClientData;
  extractedData: ExtractedClientData;
  clienteNome: string | null;
  conversa?: {
    cliente_email?: string | null;
    cliente_nome?: string | null;
  } | null;
}

export interface CriticalPersistenceResult {
  persisted: boolean;
  mergedData: ExtractedClientData;
  newFields: string[];
}

export interface ProposalDelayComplaintParams {
  supabase: SupabaseClient;
  conversaId: string;
  phone: string;
  clienteNome: string | null;
  mergedData: ExtractedClientData;
  bitrixLeadId: string | null;
  bitrixStage: string | null;
  sendMessage: (phone: string, message: string) => Promise<void>;
  totalMessages: number;
}

export interface ProposalDelayComplaintResult {
  handled: boolean;
  rescued?: boolean;
  escalated?: boolean;
  newStage?: string;
  missingData?: string[];
  message?: string;
}

// ═══════════════════════════════════════════════════════════════
// CRITICAL FIELDS DEFINITION
// ═══════════════════════════════════════════════════════════════

export const CRITICAL_FIELDS = [
  'email', 
  'distribuidora', 
  'valorFatura', 
  'consumo', 
  'cep', 
  'tipoInstalacao', 
  'cpf', 
  'cnpj'
];

// ═══════════════════════════════════════════════════════════════
// DISTRIBUIDORA CANONICAL CONSOLIDATION
// ═══════════════════════════════════════════════════════════════

/**
 * Consolidate distribuidoraInformada → distribuidora
 * Ensures canonical field is always populated when client informs a distribuidora
 * This prevents data loss when validation happens in a separate phase
 */
export function consolidateDistribuidoraCanonical(
  mergedData: ExtractedClientData
): ExtractedClientData {
  // If we have distribuidoraInformada but no distribuidora, promote it
  if (mergedData.distribuidoraInformada && !mergedData.distribuidora) {
    console.log(`[DATA_PERSISTENCE] 🔄 Promoting distribuidoraInformada to distribuidora: ${mergedData.distribuidoraInformada}`);
    mergedData.distribuidora = mergedData.distribuidoraInformada;
  }
  return mergedData;
}

// ═══════════════════════════════════════════════════════════════
// NUMERIC-ONLY MESSAGE INFERENCE
// ═══════════════════════════════════════════════════════════════

/**
 * Infer valorFatura from numeric-only messages
 * Handles formats like "250", "1500,50", "3000.00"
 */
export function inferValueFromNumericMessage(
  messageText: string,
  mergedData: ExtractedClientData
): { valorFatura?: number } {
  console.log(`[inferValueFromNumericMessage] Input: "${messageText}" | existing valorFatura=${mergedData.valorFatura} consumo=${mergedData.consumo}`);
  
  if (mergedData.valorFatura || mergedData.consumo) {
    console.log(`[inferValueFromNumericMessage] Already has value, skipping`);
    return {};
  }

  // Pattern 1: Pure numeric "250", "1500,50", "3000.00"
  const numericOnlyMatch = messageText.trim().match(/^(\d{2,5})(?:[,.](\d{1,2}))?$/);
  
  // Pattern 2: Number + currency word "420 reais", "350,00 reais", "R$ 500"
  const numericWithUnitMatch = !numericOnlyMatch 
    ? messageText.trim().match(/^(?:r\$\s*)?(\d{2,5})(?:[,.](\d{1,2}))?\s*(?:reais|real|r\$|por\s+m[eê]s)?$/i)
    : null;
  
  const match = numericOnlyMatch || numericWithUnitMatch;
  
  console.log(`[inferValueFromNumericMessage] Regex match: ${JSON.stringify(match)}`);
  if (!match) {
    return {};
  }

  const intPart = parseInt(match[1]);
  const decPart = match[2] ? parseFloat(`0.${match[2]}`) : 0;
  const inferredValue = intPart + decPart;

  // Validate range: R$ 50 - R$ 50,000
  if (inferredValue >= 50 && inferredValue <= 50000) {
    console.log(`[DATA_PERSISTENCE] 💡 Inferred valorFatura from message: R$ ${inferredValue}`);
    return { valorFatura: inferredValue };
  }

  return {};
}

// ═══════════════════════════════════════════════════════════════
// PERSIST CRITICAL FIELDS IMMEDIATELY
// ═══════════════════════════════════════════════════════════════

/**
 * Immediately persist critical fields after extraction
 * Prevents data loss when function returns early from any branch
 */
export async function persistCriticalFields(
  params: CriticalPersistenceParams
): Promise<CriticalPersistenceResult> {
  const {
    supabase,
    conversaId,
    extractedData,
    clienteNome,
    conversa,
  } = params;
  
  // ═══════════════════════════════════════════════════════════════
  // CRITICAL FIX: Re-read dados_coletados from DB to prevent race conditions
  // This ensures we never overwrite data saved by concurrent requests
  // ═══════════════════════════════════════════════════════════════
  let existingDados = params.existingDados;
  
  const { data: freshConversa } = await supabase
    .from('chatbot_conversas')
    .select('dados_coletados')
    .eq('id', conversaId)
    .single();
  
  if (freshConversa?.dados_coletados) {
    const freshDados = freshConversa.dados_coletados as ExtractedClientData;
    // Merge fresh data with what was passed (fresh wins for existing keys)
    existingDados = { ...params.existingDados, ...freshDados };
    console.log(`[DATA_PERSISTENCE] 🔄 Re-read from DB: found keys=${Object.keys(freshDados).filter(k => (freshDados as any)[k]).join(',')}`);
  }

  // ═══════════════════════════════════════════════════════════════
  // CRITICAL FIX: Deep merge that NEVER overwrites with undefined/null
  // This prevents data loss when extractedData has empty fields
  // ═══════════════════════════════════════════════════════════════
  
  // First, filter out undefined/null values from extractedData
  const cleanedExtractedData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(extractedData)) {
    if (value !== undefined && value !== null && value !== '') {
      cleanedExtractedData[key] = value;
    }
  }
  
  // Now merge: existingDados as base, only add non-empty values from extractedData
  // ═══════════════════════════════════════════════════════════════
  // CRITICAL FIX: PRESERVE existing nome - do not overwrite with new extraction
  // This prevents Sofia from "forgetting" the client's name
  // ═══════════════════════════════════════════════════════════════
  const existingNome = existingDados.nome || conversa?.cliente_nome;
  if (existingNome && cleanedExtractedData.nome) {
    // Don't overwrite existing nome
    console.log(`[DATA_PERSISTENCE] 🔒 Preserving existing nome: "${existingNome}" (ignoring extracted: "${cleanedExtractedData.nome}")`);
    delete cleanedExtractedData.nome;
  }
  
  let mergedData = { ...existingDados, ...cleanedExtractedData } as ExtractedClientData;
  
  console.log(`[DATA_PERSISTENCE] 🔀 Merge: existing keys=${Object.keys(existingDados).filter(k => (existingDados as any)[k]).join(',')} | extracted keys=${Object.keys(cleanedExtractedData).join(',')}`);
  
  // CRITICAL FIX: Consolidate distribuidoraInformada → distribuidora
  mergedData = consolidateDistribuidoraCanonical(mergedData);

  // Fallback #1: Infer valorFatura from numeric-only message
  // (This should be called by the main webhook with the messageText)

  // Fallback #2: Ensure nome is populated
  if (!mergedData.nome && clienteNome) {
    mergedData.nome = clienteNome;
    extractedData.nome = clienteNome;
    console.log(`[DATA_PERSISTENCE] 💡 Fallback nome from WhatsApp: ${clienteNome}`);
  }

  // Check if any critical field was newly extracted
  const newFields: string[] = [];
  for (const field of CRITICAL_FIELDS) {
    const newVal = (extractedData as any)[field];
    const oldVal = (existingDados as any)[field];
    if (newVal && newVal !== oldVal) {
      newFields.push(field);
    }
  }

  // If no new critical data, return early
  if (newFields.length === 0) {
    return {
      persisted: false,
      mergedData,
      newFields: [],
    };
  }

  console.log(`[DATA_PERSISTENCE] 🔒 Persisting ${newFields.length} critical fields: ${newFields.join(', ')}`);

  const updatePayload: Record<string, unknown> = {
    dados_coletados: mergedData,
    last_message_at: new Date().toISOString(),
  };

  // Sync email to dedicated column if extracted
  if (mergedData.email && !conversa?.cliente_email) {
    updatePayload.cliente_email = mergedData.email;
    console.log(`[DATA_PERSISTENCE] 📧 Syncing email to dedicated column: ${mergedData.email}`);
  }

  // Sync nome to dedicated column if extracted
  // CRITICAL FIX: Always prefer dados_coletados.nome (client-provided) over 
  // existing cliente_nome which may be a WhatsApp pushName (e.g., "LFR" instead of "Luis")
  if (mergedData.nome && mergedData.nome !== conversa?.cliente_nome) {
    updatePayload.cliente_nome = mergedData.nome;
    console.log(`[DATA_PERSISTENCE] 👤 Syncing nome to dedicated column: "${mergedData.nome}" (was: "${conversa?.cliente_nome || 'null'}")`);
  }

  await supabase
    .from('chatbot_conversas')
    .update(updatePayload)
    .eq('id', conversaId);

  console.log(`[DATA_PERSISTENCE] ✅ Immediate persistence complete`);

  return {
    persisted: true,
    mergedData,
    newFields,
  };
}

// ═══════════════════════════════════════════════════════════════
// LOG SPECIAL DETECTIONS
// ═══════════════════════════════════════════════════════════════

export interface SpecialDetectionParams {
  extractedData: ExtractedClientData;
  existingDados: ExtractedClientData;
}

/**
 * Log special detections (CIP zero, rural area, future consumption, pause request)
 */
export function logSpecialDetections(params: SpecialDetectionParams): void {
  const { extractedData, existingDados } = params;

  if (extractedData.cipZero && !existingDados.cipZero) {
    console.log(`[DATA_PERSISTENCE] 🏡 Detected NO CIP (sem iluminação pública) - will use CIP=0 in calculations`);
  }
  if (extractedData.isAreaRural && !existingDados.isAreaRural) {
    console.log(`[DATA_PERSISTENCE] 🌾 Detected RURAL AREA - may affect CIP and calculations`);
  }
  if (extractedData.consumoFuturoMencionado && !existingDados.consumoFuturoMencionado) {
    console.log(`[DATA_PERSISTENCE] 📈 Client mentioned FUTURE CONSUMPTION: ${extractedData.consumoFuturoDetalhes || 'unspecified'}`);
  }
  if (extractedData.pauseFollowupRequested && !existingDados.pauseFollowupRequested) {
    console.log(`[DATA_PERSISTENCE] ⏸️ Client requested PAUSE for analysis - will extend nudge intervals`);
  }
}

// ═══════════════════════════════════════════════════════════════
// RESET PAUSE FOLLOWUP
// ═══════════════════════════════════════════════════════════════

/**
 * Reset pause followup flag when client returns after requesting pause
 */
export function resetPauseFollowupIfNeeded(
  existingDados: ExtractedClientData,
  extractedData: ExtractedClientData
): void {
  if (existingDados.pauseFollowupRequested && !extractedData.pauseFollowupRequested) {
    console.log(`[DATA_PERSISTENCE] Client returned after pause request - resuming normal flow`);
    extractedData.pauseFollowupRequested = false;
  }
}
