/**
 * CONTEXT RECOVERY MODULE
 * 
 * Extracts data from conversation history to recover context when:
 * - Sofia takes over from a human agent
 * - Conversation resumes after a long pause
 * - State was lost or corrupted
 * 
 * This ensures Sofia continues from where the conversation left off,
 * not restarting from the greeting.
 * 
 * @module _shared/context-recovery
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface RecoveredContext {
  hasRecoverableData: boolean;
  recoveredDados: Record<string, unknown>;
  humanStartedFlow: boolean;
  suggestedNextField: string | null;
  confidence: number; // 0-1, how confident we are about the recovered data
}

export interface ConversationMessage {
  role: string;
  content: string;
  created_at: string;
}

// ═══════════════════════════════════════════════════════════════
// EXTRACTION PATTERNS
// ═══════════════════════════════════════════════════════════════

const DISTRIBUIDORA_PATTERNS: { pattern: RegExp; name: string }[] = [
  { pattern: /cemig/i, name: 'CEMIG' },
  { pattern: /cpfl/i, name: 'CPFL' },
  { pattern: /enel/i, name: 'ENEL' },
  { pattern: /energisa/i, name: 'ENERGISA' },
  { pattern: /coelba/i, name: 'COELBA' },
  { pattern: /celpe/i, name: 'CELPE' },
  { pattern: /light/i, name: 'LIGHT' },
  { pattern: /copel/i, name: 'COPEL' },
  { pattern: /celesc/i, name: 'CELESC' },
  { pattern: /equatorial/i, name: 'EQUATORIAL' },
  { pattern: /neoenergia/i, name: 'NEOENERGIA' },
  { pattern: /elektro/i, name: 'ELEKTRO' },
  { pattern: /eletropaulo/i, name: 'ELETROPAULO' },
];

const VALUE_PATTERNS = [
  /r\$\s*([\d.,]+)/i,
  /(\d{2,4})[,.]?(\d{0,2})?\s*(reais|por\s*m[eê]s)/i,
  /(\d{2,4})[,.]?(\d{0,2})?\s*mensal/i,
  /valor\s*[éde:\s]*r?\$?\s*([\d.,]+)/i,
  /conta\s*[éde:\s]*r?\$?\s*([\d.,]+)/i,
  /pago?\s*[éde:\s]*r?\$?\s*([\d.,]+)/i,
];

const HUMAN_AGENT_PATTERNS = [
  /sou\s+[ao]?\s*(chris|cristiane|ana|joão|maria|carlos|pedro|fernanda|lucas|bruno)/i,
  /aqui\s+[ée]\s+[ao]?\s*(chris|cristiane|ana|joão|maria|carlos|pedro|fernanda|lucas|bruno)/i,
  /meu\s+nome\s+[ée]\s+(chris|cristiane|ana|joão|maria|carlos|pedro|fernanda|lucas|bruno)/i,
];

// ═══════════════════════════════════════════════════════════════
// EXTRACTION FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Extract distribuidora from text
 */
function extractDistribuidora(text: string): string | null {
  for (const { pattern, name } of DISTRIBUIDORA_PATTERNS) {
    if (pattern.test(text)) {
      return name;
    }
  }
  return null;
}

/**
 * Extract value from text
 */
function extractValue(text: string): number | null {
  for (const pattern of VALUE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      // Clean and parse the value
      let valueStr = match[1] || match[0];
      valueStr = valueStr.replace(/[^\d.,]/g, '');
      valueStr = valueStr.replace(',', '.');
      
      const value = parseFloat(valueStr);
      if (!isNaN(value) && value > 50 && value < 50000) {
        return value;
      }
    }
  }
  return null;
}

/**
 * Check if text confirms distribuidora (e.g., "Sim" in response to "É da CEMIG?")
 */
function isConfirmationResponse(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return /^(sim|s|ss+|simmm+|é|eh|isso|correto|certo|exato)$/i.test(normalized);
}

/**
 * Check if a message is from a human agent (not Sofia)
 */
function isHumanAgentMessage(content: string): boolean {
  return HUMAN_AGENT_PATTERNS.some(pattern => pattern.test(content));
}

// ═══════════════════════════════════════════════════════════════
// MAIN RECOVERY FUNCTION
// ═══════════════════════════════════════════════════════════════

/**
 * Recover context from conversation history
 * Analyzes messages to extract data that was collected but not persisted
 */
export async function recoverContextFromHistory(
  supabase: SupabaseClient,
  conversaId: string,
  existingDados: Record<string, unknown>
): Promise<RecoveredContext> {
  const result: RecoveredContext = {
    hasRecoverableData: false,
    recoveredDados: {},
    humanStartedFlow: false,
    suggestedNextField: null,
    confidence: 0,
  };
  
  try {
    // Fetch conversation messages
    const { data: messages } = await supabase
      .from('chatbot_mensagens')
      .select('role, content, created_at')
      .eq('conversa_id', conversaId)
      .order('created_at', { ascending: true })
      .limit(30);
    
    if (!messages || messages.length < 2) {
      return result;
    }
    
    console.log(`[CONTEXT_RECOVERY] Analyzing ${messages.length} messages for conversa ${conversaId}`);
    
    let recoveredDistribuidora: string | null = null;
    let recoveredValue: number | null = null;
    let pendingDistribuidoraQuestion: string | null = null;
    let humanAgentDetected = false;
    
    // Analyze messages in order
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i] as ConversationMessage;
      const content = msg.content || '';
      
      // Check for human agent
      if (msg.role === 'assistant' && isHumanAgentMessage(content)) {
        humanAgentDetected = true;
        result.humanStartedFlow = true;
      }
      
      // Check if assistant asked about distribuidora
      if (msg.role === 'assistant') {
        const distMention = extractDistribuidora(content);
        if (distMention && /\?/.test(content)) {
          // Assistant asked about a specific distribuidora
          pendingDistribuidoraQuestion = distMention;
        }
      }
      
      // Check user responses
      if (msg.role === 'user') {
        // If previous message asked about distribuidora and user confirmed
        if (pendingDistribuidoraQuestion && isConfirmationResponse(content)) {
          recoveredDistribuidora = pendingDistribuidoraQuestion;
          console.log(`[CONTEXT_RECOVERY] Confirmed distribuidora: ${recoveredDistribuidora}`);
          pendingDistribuidoraQuestion = null;
        }
        
        // Direct extraction from user message
        const directDist = extractDistribuidora(content);
        if (directDist) {
          recoveredDistribuidora = directDist;
        }
        
        const directValue = extractValue(content);
        if (directValue) {
          recoveredValue = directValue;
        }
      }
    }
    
    // Build recovered data
    const recoveredDados: Record<string, unknown> = {};
    let confidence = 0;
    
    if (recoveredDistribuidora && !existingDados.distribuidora && !existingDados.distribuidoraInformada) {
      recoveredDados.distribuidora = recoveredDistribuidora;
      recoveredDados.distribuidoraInformada = recoveredDistribuidora;
      recoveredDados.distribuidora_recovered = true;
      confidence += 0.4;
      result.hasRecoverableData = true;
    }
    
    if (recoveredValue && !existingDados.valorFatura && !existingDados.valor_fatura) {
      recoveredDados.valorFatura = recoveredValue;
      recoveredDados.valor_fatura = recoveredValue;
      recoveredDados.valor_recovered = true;
      confidence += 0.4;
      result.hasRecoverableData = true;
    }
    
    if (humanAgentDetected) {
      recoveredDados.human_started_flow = true;
      recoveredDados.started_by_human = true;
      confidence += 0.2;
    }
    
    // Mark recovery
    if (result.hasRecoverableData) {
      recoveredDados.context_recovered_at = new Date().toISOString();
      recoveredDados.recovery_source = 'history_analysis';
    }
    
    // Suggest next field based on what we recovered
    const hasValor = recoveredDados.valorFatura || existingDados.valorFatura || existingDados.valor_fatura;
    const hasDist = recoveredDados.distribuidora || existingDados.distribuidora || existingDados.distribuidoraInformada;
    const hasEmail = existingDados.email;
    
    if (!hasValor) {
      result.suggestedNextField = 'valor';
    } else if (!hasDist) {
      result.suggestedNextField = 'distribuidora';
    } else if (!hasEmail) {
      result.suggestedNextField = 'email';
    } else {
      result.suggestedNextField = 'nome';
    }
    
    result.recoveredDados = recoveredDados;
    result.confidence = Math.min(confidence, 1.0);
    
    console.log(`[CONTEXT_RECOVERY] Result:`, {
      hasRecoverableData: result.hasRecoverableData,
      recoveredDistribuidora,
      recoveredValue,
      humanStartedFlow: result.humanStartedFlow,
      suggestedNextField: result.suggestedNextField,
      confidence: result.confidence,
    });
    
    return result;
  } catch (err) {
    console.error('[CONTEXT_RECOVERY] Error:', err);
    return result;
  }
}

/**
 * Apply recovered context to conversation
 */
export async function applyRecoveredContext(
  supabase: SupabaseClient,
  conversaId: string,
  existingDados: Record<string, unknown>,
  recoveredContext: RecoveredContext
): Promise<boolean> {
  if (!recoveredContext.hasRecoverableData) {
    return false;
  }
  
  try {
    const mergedDados = {
      ...existingDados,
      ...recoveredContext.recoveredDados,
      // Ensure triagem is marked as complete to avoid restart
      triagem_concluida: true,
      greeting_sent: existingDados.greeting_sent || true,
      awaiting_clausula_petrea_response: false,
    };
    
    const updateData: Record<string, unknown> = {
      dados_coletados: mergedDados,
    };
    
    if (recoveredContext.suggestedNextField) {
      updateData.fsm_expected_field = recoveredContext.suggestedNextField;
    }
    
    const { error } = await supabase
      .from('chatbot_conversas')
      .update(updateData)
      .eq('id', conversaId);
    
    if (error) {
      console.error('[CONTEXT_RECOVERY] Failed to apply context:', error);
      return false;
    }
    
    console.log(`[CONTEXT_RECOVERY] ✅ Applied recovered context to ${conversaId}`);
    return true;
  } catch (err) {
    console.error('[CONTEXT_RECOVERY] Error applying context:', err);
    return false;
  }
}
