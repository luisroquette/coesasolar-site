/**
 * SOFIA PIPELINE 2.0 - OPERATOR FEEDBACK LOOP
 * 
 * Captura correções de operadores e transforma em aprendizado
 * - Detecta #CORRIGIR e #ASSUMIR
 * - Extrai regras generalizáveis via LLM
 * - Persiste em rule_memory
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = (Deno.env.get('COESA_PROPOSTAS_OPENROUTER_API_KEY'))!;

const LLM_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

// ============================================
// TYPES
// ============================================

export interface OperatorFeedback {
  id: string;
  conversaId: string;
  agentId: string;
  operatorPhone?: string;
  operatorName?: string;
  operatorId?: string;
  feedbackType: 'takeover' | 'correction' | 'escalation_resolved' | 'explicit_correction';
  triggerMessage?: string;
  sofiaResponse?: string;
  correctResponse?: string;
  correctionReason?: string;
  clientPhone?: string;
  clientName?: string;
}

export interface ExtractedRule {
  name: string;
  description: string;
  conditions: Array<{
    field: string;
    operator: string;
    value: unknown;
  }>;
  actions: Array<{
    type: string;
    parameters: Record<string, unknown>;
  }>;
  confidence: number;
}

export interface FeedbackResult {
  feedbackId: string;
  ruleExtracted: boolean;
  ruleId?: string;
  ruleName?: string;
  error?: string;
}

// ============================================
// FEEDBACK CAPTURE
// ============================================

/**
 * Captura um feedback de operador e persiste no banco
 */
export async function captureOperatorFeedback(
  feedback: Omit<OperatorFeedback, 'id'>
): Promise<FeedbackResult> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  try {
    // 1. Inserir o feedback
    const { data: inserted, error: insertError } = await supabase
      .from('operator_feedback')
      .insert({
        conversa_id: feedback.conversaId,
        agent_id: feedback.agentId,
        operator_phone: feedback.operatorPhone,
        operator_name: feedback.operatorName,
        operator_id: feedback.operatorId,
        feedback_type: feedback.feedbackType,
        trigger_message: feedback.triggerMessage,
        sofia_response: feedback.sofiaResponse,
        correct_response: feedback.correctResponse,
        correction_reason: feedback.correctionReason,
        client_phone: feedback.clientPhone,
        client_name: feedback.clientName,
        rule_extraction_status: 'pending'
      })
      .select('id')
      .single();
    
    if (insertError || !inserted) {
      console.error('[operator-feedback] Insert error:', insertError);
      return { feedbackId: '', ruleExtracted: false, error: insertError?.message };
    }
    
    console.log(`[operator-feedback] Captured feedback ${inserted.id} (type: ${feedback.feedbackType})`);
    
    // 2. Verificar se deve extrair regra automaticamente
    const shouldExtract = await shouldAutoExtractRule(supabase);
    
    if (shouldExtract && feedback.feedbackType === 'explicit_correction') {
      // Extração assíncrona para não bloquear
      extractRuleFromFeedback(inserted.id, feedback).catch(err => {
        console.error('[operator-feedback] Async rule extraction failed:', err);
      });
    }
    
    return { feedbackId: inserted.id, ruleExtracted: false };
    
  } catch (error) {
    console.error('[operator-feedback] Error capturing feedback:', error);
    return { 
      feedbackId: '', 
      ruleExtracted: false, 
      error: error instanceof Error ? error.message : String(error) 
    };
  }
}

/**
 * Verifica se extração automática está habilitada
 */
async function shouldAutoExtractRule(supabaseClient: any): Promise<boolean> {
  const { data } = await supabaseClient
    .from('configuracoes_sistema')
    .select('valor')
    .eq('chave', 'operator_feedback_auto_extract')
    .single();
  
  return (data as { valor: string } | null)?.valor === 'true';
}

// ============================================
// RULE EXTRACTION
// ============================================

/**
 * Extrai uma regra generalizável de um feedback usando LLM
 */
export async function extractRuleFromFeedback(
  feedbackId: string,
  feedback: Omit<OperatorFeedback, 'id'>
): Promise<ExtractedRule | null> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  try {
    // Atualizar status para processing
    await supabase
      .from('operator_feedback')
      .update({ rule_extraction_status: 'processing' })
      .eq('id', feedbackId);
    
    // Construir prompt para extração
    const prompt = buildRuleExtractionPrompt(feedback);
    
    // Chamar LLM
    const response = await fetch(LLM_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: RULE_EXTRACTION_SYSTEM_PROMPT },
          { role: "user", content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 1000,
        tools: [RULE_EXTRACTION_TOOL],
        tool_choice: { type: "function", function: { name: "extract_rule" } }
      })
    });
    
    if (!response.ok) {
      throw new Error(`LLM API error: ${response.status}`);
    }
    
    const llmResult = await response.json();
    const toolCall = llmResult.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall) {
      // Não conseguiu extrair regra - marcar como skipped
      await supabase
        .from('operator_feedback')
        .update({ 
          rule_extraction_status: 'skipped',
          processed_at: new Date().toISOString()
        })
        .eq('id', feedbackId);
      
      console.log(`[operator-feedback] No rule extracted for ${feedbackId}`);
      return null;
    }
    
    const extractedRule = JSON.parse(toolCall.function.arguments) as ExtractedRule;
    
    // Validar se a regra é útil (confiança mínima)
    if (extractedRule.confidence < 0.5) {
      await supabase
        .from('operator_feedback')
        .update({ 
          rule_extraction_status: 'skipped',
          extracted_rule_text: JSON.stringify(extractedRule),
          processed_at: new Date().toISOString()
        })
        .eq('id', feedbackId);
      
      console.log(`[operator-feedback] Rule confidence too low for ${feedbackId}`);
      return null;
    }
    
    // Persistir a regra em rule_memory
    const { data: savedRule, error: saveError } = await supabase
      .from('rule_memory')
      .insert({
        agent_id: feedback.agentId,
        rule_type: 'learned_pattern',
        name: extractedRule.name,
        description: extractedRule.description,
        conditions: extractedRule.conditions,
        actions: extractedRule.actions,
        priority: 50, // Prioridade média para regras aprendidas
        is_active: true,
        confidence: extractedRule.confidence,
        times_applied: 0,
        learned_from_feedback_id: feedbackId,
        learning_source: 'operator_correction'
      })
      .select('id')
      .single();
    
    if (saveError) {
      throw new Error(`Failed to save rule: ${saveError.message}`);
    }
    
    // Atualizar feedback com sucesso
    await supabase
      .from('operator_feedback')
      .update({ 
        rule_extraction_status: 'extracted',
        learned_rule_id: savedRule.id,
        extracted_rule_text: JSON.stringify(extractedRule),
        processed_at: new Date().toISOString()
      })
      .eq('id', feedbackId);
    
    console.log(`[operator-feedback] Rule "${extractedRule.name}" extracted and saved for ${feedbackId}`);
    
    return extractedRule;
    
  } catch (error) {
    console.error('[operator-feedback] Rule extraction error:', error);
    
    // Marcar como failed
    await supabase
      .from('operator_feedback')
      .update({ 
        rule_extraction_status: 'failed',
        processed_at: new Date().toISOString()
      })
      .eq('id', feedbackId);
    
    return null;
  }
}

// ============================================
// CORRECTION COMMAND HANDLER
// ============================================

/**
 * Processa o comando #CORRIGIR
 * Formato: #CORRIGIR A resposta correta era: <texto>
 */
export function parseCorrectionCommand(messageText: string): { isCorrection: boolean; correctResponse?: string } {
  const normalized = messageText.trim().toUpperCase();
  
  // Verificar se é um comando de correção
  if (!normalized.startsWith('#CORRIGIR')) {
    return { isCorrection: false };
  }
  
  // Extrair a resposta correta
  const match = messageText.match(/#CORRIGIR\s+(?:A resposta correta era:|Correto:)?\s*(.+)/is);
  
  if (match && match[1]) {
    return {
      isCorrection: true,
      correctResponse: match[1].trim()
    };
  }
  
  return { isCorrection: true, correctResponse: undefined };
}

/**
 * Processa uma correção explícita de operador
 */
export async function handleCorrectionCommand(
  conversaId: string,
  agentId: string,
  operatorPhone: string,
  operatorName: string,
  correctResponse: string
): Promise<FeedbackResult> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  try {
    // Buscar as últimas mensagens da conversa para contexto
    const { data: messages } = await supabase
      .from('chatbot_mensagens')
      .select('role, content, created_at')
      .eq('conversa_id', conversaId)
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (!messages || messages.length === 0) {
      return { feedbackId: '', ruleExtracted: false, error: 'No messages found' };
    }
    
    // Encontrar a última resposta da Sofia e a mensagem do cliente antes dela
    const lastSofiaMessage = messages.find(m => m.role === 'assistant');
    const lastClientMessage = messages.find(m => m.role === 'user');
    
    // Buscar dados da conversa
    const { data: conversa } = await supabase
      .from('chatbot_conversas')
      .select('cliente_telefone, cliente_nome')
      .eq('id', conversaId)
      .single();
    
    // Capturar o feedback
    return await captureOperatorFeedback({
      conversaId,
      agentId,
      operatorPhone,
      operatorName,
      feedbackType: 'explicit_correction',
      triggerMessage: lastClientMessage?.content,
      sofiaResponse: lastSofiaMessage?.content,
      correctResponse,
      clientPhone: conversa?.cliente_telefone,
      clientName: conversa?.cliente_nome
    });
    
  } catch (error) {
    console.error('[operator-feedback] handleCorrectionCommand error:', error);
    return { 
      feedbackId: '', 
      ruleExtracted: false, 
      error: error instanceof Error ? error.message : String(error) 
    };
  }
}

// ============================================
// TAKEOVER FEEDBACK CAPTURE
// ============================================

/**
 * Captura feedback quando operador assume conversa (#ASSUMIR)
 */
export async function captureTakeoverFeedback(
  conversaId: string,
  agentId: string,
  operatorPhone: string,
  operatorName: string,
  operatorId: string,
  clientPhone: string,
  clientName: string | null
): Promise<FeedbackResult> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  try {
    // Buscar as últimas mensagens para entender o contexto
    const { data: messages } = await supabase
      .from('chatbot_mensagens')
      .select('role, content')
      .eq('conversa_id', conversaId)
      .order('created_at', { ascending: false })
      .limit(4);
    
    const lastSofiaMessage = messages?.find(m => m.role === 'assistant');
    const lastClientMessage = messages?.find(m => m.role === 'user');
    
    return await captureOperatorFeedback({
      conversaId,
      agentId,
      operatorPhone,
      operatorName,
      operatorId,
      feedbackType: 'takeover',
      triggerMessage: lastClientMessage?.content,
      sofiaResponse: lastSofiaMessage?.content,
      correctionReason: 'Operador assumiu a conversa manualmente',
      clientPhone,
      clientName: clientName || undefined
    });
    
  } catch (error) {
    console.error('[operator-feedback] captureTakeoverFeedback error:', error);
    return { feedbackId: '', ruleExtracted: false, error: String(error) };
  }
}

// ============================================
// PROMPTS E TOOLS
// ============================================

const RULE_EXTRACTION_SYSTEM_PROMPT = `Você é um especialista em criar regras de negócio para assistentes virtuais de vendas.

Sua tarefa é analisar uma correção feita por um operador humano à resposta de uma IA e extrair uma REGRA GENERALIZÁVEL que previna o mesmo erro no futuro.

A regra deve ser:
1. ESPECÍFICA o suficiente para ser útil
2. GENÉRICA o suficiente para se aplicar a casos similares
3. ACIONÁVEL - deve ter condições claras e ações definidas

Se a correção for muito específica para um caso único e não puder ser generalizada, retorne confidence = 0.`;

const RULE_EXTRACTION_TOOL = {
  type: "function",
  function: {
    name: "extract_rule",
    description: "Extrai uma regra generalizável de uma correção de operador",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Nome curto e descritivo da regra (max 50 chars)"
        },
        description: {
          type: "string",
          description: "Descrição completa do que a regra faz e por quê"
        },
        conditions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              field: { type: "string", description: "Campo a verificar (ex: intent, sentiment, funnelStage)" },
              operator: { type: "string", enum: ["equals", "contains", "greater_than", "less_than", "exists", "not_exists"] },
              value: { description: "Valor a comparar" }
            },
            required: ["field", "operator", "value"]
          },
          description: "Condições para aplicar a regra"
        },
        actions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["respond", "block", "escalate", "save_fact", "modify_response"] },
              parameters: { type: "object", description: "Parâmetros da ação" }
            },
            required: ["type", "parameters"]
          },
          description: "Ações a executar quando a regra se aplicar"
        },
        confidence: {
          type: "number",
          minimum: 0,
          maximum: 1,
          description: "Confiança de que esta regra é generalizável (0-1)"
        }
      },
      required: ["name", "description", "conditions", "actions", "confidence"]
    }
  }
};

function buildRuleExtractionPrompt(feedback: Omit<OperatorFeedback, 'id'>): string {
  return `Analise esta correção de operador e extraia uma regra generalizável:

## CONTEXTO
- Agente: ${feedback.agentId}
- Tipo de feedback: ${feedback.feedbackType}

## MENSAGEM DO CLIENTE (que disparou o problema)
${feedback.triggerMessage || '[Não disponível]'}

## RESPOSTA DA SOFIA (que foi corrigida)
${feedback.sofiaResponse || '[Não disponível]'}

## RESPOSTA CORRETA (fornecida pelo operador)
${feedback.correctResponse || '[Não disponível]'}

## RAZÃO DA CORREÇÃO
${feedback.correctionReason || '[Não especificada]'}

---

Extraia uma regra que previna este tipo de erro no futuro. Se não for possível generalizar, retorne confidence = 0.`;
}

// ============================================
// ANALYTICS
// ============================================

/**
 * Obtém estatísticas de feedback para um agente
 */
export async function getFeedbackStats(agentId: string, days: number = 30): Promise<{
  totalFeedbacks: number;
  byType: Record<string, number>;
  rulesExtracted: number;
  pendingExtraction: number;
}> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  const since = new Date();
  since.setDate(since.getDate() - days);
  
  const { data: feedbacks } = await supabase
    .from('operator_feedback')
    .select('feedback_type, rule_extraction_status')
    .eq('agent_id', agentId)
    .gte('created_at', since.toISOString());
  
  if (!feedbacks) {
    return { totalFeedbacks: 0, byType: {}, rulesExtracted: 0, pendingExtraction: 0 };
  }
  
  const byType: Record<string, number> = {};
  let rulesExtracted = 0;
  let pendingExtraction = 0;
  
  for (const fb of feedbacks) {
    byType[fb.feedback_type] = (byType[fb.feedback_type] || 0) + 1;
    if (fb.rule_extraction_status === 'extracted') rulesExtracted++;
    if (fb.rule_extraction_status === 'pending') pendingExtraction++;
  }
  
  return {
    totalFeedbacks: feedbacks.length,
    byType,
    rulesExtracted,
    pendingExtraction
  };
}
