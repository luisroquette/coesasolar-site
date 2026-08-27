/**
 * SOFIA PIPELINE 2.0 - SELF-EVALUATION LOOP
 * 
 * Auto-avaliação de respostas da Sofia usando LLM secundária
 * - Avalia clareza, precisão, tom e progressão
 * - Flagga respostas ruins para revisão humana
 * - Alimenta o Learning Layer com insights
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { FullContext, ReasoningResult, ValidationResult } from "./types.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = (Deno.env.get("COESASOLAR_OPENROUTER_API_KEY") ?? Deno.env.get("OPENROUTER_API_KEY"))!;

const LLM_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_EVAL_MODEL = "google/gemini-2.5-flash-lite";

// ============================================
// TYPES
// ============================================

export interface SelfEvalScores {
  clarity: number;      // 0-1: Quão clara é a resposta
  accuracy: number;     // 0-1: Precisão das informações
  tone: number;         // 0-1: Tom adequado ao contexto
  progression: number;  // 0-1: Avança o cliente no funil
  overall: number;      // 0-1: Média ponderada
}

export interface SelfEvalIssue {
  type: 'clarity' | 'accuracy' | 'tone' | 'progression' | 'other';
  severity: 'low' | 'medium' | 'high';
  description: string;
  suggestion?: string;
}

export interface SelfEvalResult {
  scores: SelfEvalScores;
  issues: SelfEvalIssue[];
  reasoning: string;
  requiresReview: boolean;
  suggestions: string[];
  evaluationDurationMs: number;
}

// ============================================
// CONFIGURATION
// ============================================

interface SelfEvalConfig {
  enabled: boolean;
  threshold: number;
  model: string;
}

async function loadSelfEvalConfig(): Promise<SelfEvalConfig> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  const { data } = await supabase
    .from('configuracoes_sistema')
    .select('chave, valor')
    .in('chave', ['self_eval_enabled', 'self_eval_threshold', 'self_eval_model']);
  
  const configMap = new Map(data?.map(r => [r.chave, r.valor]) || []);
  
  return {
    enabled: configMap.get('self_eval_enabled') === 'true',
    threshold: parseFloat(configMap.get('self_eval_threshold') || '0.6'),
    model: configMap.get('self_eval_model') || DEFAULT_EVAL_MODEL
  };
}

// ============================================
// WEIGHTS FOR SCORE CALCULATION
// ============================================

const SCORE_WEIGHTS = {
  clarity: 0.25,
  accuracy: 0.30,
  tone: 0.20,
  progression: 0.25
};

function calculateOverallScore(scores: Omit<SelfEvalScores, 'overall'>): number {
  return (
    scores.clarity * SCORE_WEIGHTS.clarity +
    scores.accuracy * SCORE_WEIGHTS.accuracy +
    scores.tone * SCORE_WEIGHTS.tone +
    scores.progression * SCORE_WEIGHTS.progression
  );
}

// ============================================
// MAIN EVALUATION
// ============================================

/**
 * Executa a auto-avaliação da resposta da Sofia
 */
export async function executeSelfEvaluation(
  context: FullContext,
  reasoning: ReasoningResult,
  _validation: ValidationResult
): Promise<SelfEvalResult | null> {
  const startTime = Date.now();
  
  // Verificar configuração
  const config = await loadSelfEvalConfig();
  
  if (!config.enabled) {
    console.log('[self-eval] Self-evaluation is disabled');
    return null;
  }
  
  // Se não houver resposta, não avaliar
  if (!reasoning.responseText) {
    return null;
  }
  
  try {
    // Construir prompt de avaliação
    const evalPrompt = buildEvaluationPrompt(context, reasoning);
    
    // Chamar LLM para avaliação
    const response = await fetch(LLM_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: EVALUATION_SYSTEM_PROMPT },
          { role: "user", content: evalPrompt }
        ],
        temperature: 0.2,
        max_tokens: 1000,
        tools: [EVALUATION_TOOL],
        tool_choice: { type: "function", function: { name: "evaluate_response" } }
      })
    });
    
    if (!response.ok) {
      console.error('[self-eval] LLM API error:', response.status);
      return null;
    }
    
    const llmResult = await response.json();
    const toolCall = llmResult.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall) {
      console.warn('[self-eval] No evaluation result from LLM');
      return null;
    }
    
    const evalData = JSON.parse(toolCall.function.arguments);
    
    // Calcular score geral
    const scores: SelfEvalScores = {
      clarity: evalData.clarity_score || 0.5,
      accuracy: evalData.accuracy_score || 0.5,
      tone: evalData.tone_score || 0.5,
      progression: evalData.progression_score || 0.5,
      overall: 0
    };
    scores.overall = calculateOverallScore(scores);
    
    // Determinar se precisa revisão
    const requiresReview = scores.overall < config.threshold;
    
    const result: SelfEvalResult = {
      scores,
      issues: evalData.issues || [],
      reasoning: evalData.reasoning || '',
      requiresReview,
      suggestions: evalData.suggestions || [],
      evaluationDurationMs: Date.now() - startTime
    };
    
    // Persistir avaliação
    await persistEvaluation(context, reasoning, result);
    
    console.log(`[self-eval] Evaluated: overall=${scores.overall.toFixed(2)}, requiresReview=${requiresReview}`);
    
    return result;
    
  } catch (error) {
    console.error('[self-eval] Evaluation error:', error);
    return null;
  }
}

// ============================================
// PERSISTENCE
// ============================================

async function persistEvaluation(
  context: FullContext,
  reasoning: ReasoningResult,
  result: SelfEvalResult
): Promise<void> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  try {
    await supabase.from('response_evaluations').insert({
      conversa_id: context.intake.conversaId,
      message_id: context.intake.messageId,
      agent_id: 'sofia',
      
      clarity_score: result.scores.clarity,
      accuracy_score: result.scores.accuracy,
      tone_score: result.scores.tone,
      progression_score: result.scores.progression,
      overall_score: result.scores.overall,
      
      issues_detected: result.issues,
      suggestions: result.suggestions.join('\n'),
      evaluation_reasoning: result.reasoning,
      
      requires_review: result.requiresReview,
      
      client_message: context.intake.rawContent,
      sofia_response: reasoning.responseText,
      funnel_stage: context.funnelState.stage,
      client_sentiment: context.intake.sentiment,
      
      model_used: DEFAULT_EVAL_MODEL,
      evaluation_duration_ms: result.evaluationDurationMs
    });
  } catch (error) {
    console.warn('[self-eval] Failed to persist evaluation:', error);
  }
}

// ============================================
// REVIEW MANAGEMENT
// ============================================

/**
 * Obtém avaliações que precisam de revisão
 */
export async function getPendingReviews(
  agentId: string = 'sofia',
  limit: number = 50
): Promise<Array<{
  id: string;
  conversaId: string;
  clientMessage: string;
  sofiaResponse: string;
  overallScore: number;
  issues: SelfEvalIssue[];
  createdAt: string;
}>> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  const { data, error } = await supabase
    .from('response_evaluations')
    .select('id, conversa_id, client_message, sofia_response, overall_score, issues_detected, created_at')
    .eq('agent_id', agentId)
    .eq('requires_review', true)
    .is('reviewed_at', null)
    .order('overall_score', { ascending: true })
    .limit(limit);
  
  if (error || !data) {
    return [];
  }
  
  return data.map(row => ({
    id: row.id,
    conversaId: row.conversa_id,
    clientMessage: row.client_message || '',
    sofiaResponse: row.sofia_response || '',
    overallScore: row.overall_score || 0,
    issues: row.issues_detected || [],
    createdAt: row.created_at
  }));
}

/**
 * Marca uma avaliação como revisada
 */
export async function markAsReviewed(
  evaluationId: string,
  reviewerEmail: string,
  action: 'approved' | 'corrected' | 'flagged' | 'ignored',
  notes?: string
): Promise<boolean> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  const { error } = await supabase
    .from('response_evaluations')
    .update({
      reviewed_by: reviewerEmail,
      reviewed_at: new Date().toISOString(),
      review_action: action,
      review_notes: notes
    })
    .eq('id', evaluationId);
  
  return !error;
}

// ============================================
// ANALYTICS
// ============================================

/**
 * Obtém estatísticas de avaliação para um agente
 */
export async function getEvaluationStats(
  agentId: string = 'sofia',
  days: number = 30
): Promise<{
  totalEvaluations: number;
  avgOverallScore: number;
  avgScores: SelfEvalScores;
  requiresReviewCount: number;
  reviewedCount: number;
  commonIssues: Array<{ type: string; count: number }>;
}> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  const since = new Date();
  since.setDate(since.getDate() - days);
  
  const { data: evaluations } = await supabase
    .from('response_evaluations')
    .select('clarity_score, accuracy_score, tone_score, progression_score, overall_score, requires_review, reviewed_at, issues_detected')
    .eq('agent_id', agentId)
    .gte('created_at', since.toISOString());
  
  if (!evaluations || evaluations.length === 0) {
    return {
      totalEvaluations: 0,
      avgOverallScore: 0,
      avgScores: { clarity: 0, accuracy: 0, tone: 0, progression: 0, overall: 0 },
      requiresReviewCount: 0,
      reviewedCount: 0,
      commonIssues: []
    };
  }
  
  // Calcular médias
  const sums = {
    clarity: 0,
    accuracy: 0,
    tone: 0,
    progression: 0,
    overall: 0
  };
  
  let requiresReviewCount = 0;
  let reviewedCount = 0;
  const issueTypeCounts: Record<string, number> = {};
  
  for (const eval_ of evaluations) {
    sums.clarity += eval_.clarity_score || 0;
    sums.accuracy += eval_.accuracy_score || 0;
    sums.tone += eval_.tone_score || 0;
    sums.progression += eval_.progression_score || 0;
    sums.overall += eval_.overall_score || 0;
    
    if (eval_.requires_review) requiresReviewCount++;
    if (eval_.reviewed_at) reviewedCount++;
    
    // Contar tipos de issues
    const issues = eval_.issues_detected as SelfEvalIssue[] || [];
    for (const issue of issues) {
      issueTypeCounts[issue.type] = (issueTypeCounts[issue.type] || 0) + 1;
    }
  }
  
  const count = evaluations.length;
  
  return {
    totalEvaluations: count,
    avgOverallScore: sums.overall / count,
    avgScores: {
      clarity: sums.clarity / count,
      accuracy: sums.accuracy / count,
      tone: sums.tone / count,
      progression: sums.progression / count,
      overall: sums.overall / count
    },
    requiresReviewCount,
    reviewedCount,
    commonIssues: Object.entries(issueTypeCounts)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
  };
}

// ============================================
// PROMPTS AND TOOLS
// ============================================

const EVALUATION_SYSTEM_PROMPT = `Você é um especialista em avaliação de qualidade de atendimento ao cliente.

Sua tarefa é avaliar uma resposta de uma assistente virtual de vendas (sofIA) da COESA Energia.

CRITÉRIOS DE AVALIAÇÃO:

1. CLAREZA (0-1): A resposta é fácil de entender? Evita jargões desnecessários?
   - 1.0: Cristalina, qualquer pessoa entenderia
   - 0.7: Clara, mas poderia ser mais simples
   - 0.4: Confusa em partes
   - 0.0: Completamente incompreensível

2. PRECISÃO (0-1): As informações estão corretas? Há alucinações ou promessas falsas?
   - 1.0: Todas as informações verificáveis e corretas
   - 0.7: Majoritariamente correto, pequenas imprecisões
   - 0.4: Erros significativos
   - 0.0: Informações completamente erradas ou perigosas

3. TOM (0-1): O tom é adequado ao contexto? Empático quando necessário, profissional sempre?
   - 1.0: Perfeitamente adequado
   - 0.7: Adequado, mas poderia ser melhor
   - 0.4: Tom inadequado para o contexto
   - 0.0: Grosseiro, frio demais ou inadequado

4. PROGRESSÃO (0-1): A resposta avança o cliente no funil de vendas?
   - 1.0: Claramente direciona para próximo passo
   - 0.7: Mantém engajamento
   - 0.4: Neutra, não avança nem recua
   - 0.0: Pode afastar o cliente

REGRAS:
- Seja crítico mas justo
- Identifique problemas específicos
- Sugira melhorias concretas
- Considere o contexto do funil de vendas`;

const EVALUATION_TOOL = {
  type: "function",
  function: {
    name: "evaluate_response",
    description: "Avalia a qualidade de uma resposta da Sofia",
    parameters: {
      type: "object",
      properties: {
        clarity_score: {
          type: "number",
          minimum: 0,
          maximum: 1,
          description: "Score de clareza (0-1)"
        },
        accuracy_score: {
          type: "number",
          minimum: 0,
          maximum: 1,
          description: "Score de precisão (0-1)"
        },
        tone_score: {
          type: "number",
          minimum: 0,
          maximum: 1,
          description: "Score de tom adequado (0-1)"
        },
        progression_score: {
          type: "number",
          minimum: 0,
          maximum: 1,
          description: "Score de progressão no funil (0-1)"
        },
        reasoning: {
          type: "string",
          description: "Explicação breve da avaliação"
        },
        issues: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["clarity", "accuracy", "tone", "progression", "other"] },
              severity: { type: "string", enum: ["low", "medium", "high"] },
              description: { type: "string" },
              suggestion: { type: "string" }
            },
            required: ["type", "severity", "description"]
          },
          description: "Lista de problemas identificados"
        },
        suggestions: {
          type: "array",
          items: { type: "string" },
          description: "Sugestões de melhoria"
        }
      },
      required: ["clarity_score", "accuracy_score", "tone_score", "progression_score", "reasoning"]
    }
  }
};

function buildEvaluationPrompt(context: FullContext, reasoning: ReasoningResult): string {
  const clientName = context.clientProfile.name || 'Cliente';
  const funnelStage = context.funnelState.stage;
  const sentiment = context.intake.sentiment;
  const intent = context.intake.intent;
  
  return `Avalie esta resposta da Sofia:

## CONTEXTO
- Nome do cliente: ${clientName}
- Estágio do funil: ${funnelStage}
- Modo Sofia: ${context.funnelState.mode}
- Tem proposta: ${context.funnelState.hasProposal ? 'Sim' : 'Não'}
- Sentimento do cliente: ${sentiment > 0 ? 'Positivo' : sentiment < 0 ? 'Negativo' : 'Neutro'}
- Intenção detectada: ${intent}

## MENSAGEM DO CLIENTE
${context.intake.rawContent}

## RESPOSTA DA SOFIA
${reasoning.responseText}

## DECISÃO TOMADA
Tipo: ${reasoning.decision}
Confiança: ${(reasoning.decisionConfidence * 100).toFixed(0)}%
Tom usado: ${reasoning.responseTone}

---

Avalie a resposta considerando o contexto e retorne os scores e issues encontrados.`;
}
