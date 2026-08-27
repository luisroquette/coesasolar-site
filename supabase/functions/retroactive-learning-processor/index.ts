import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { extractAssistantText } from "../_shared/text-extraction.ts";
import { getStrictCorsHeaders, handleCorsPrelight } from '../_shared/security-helpers.ts';

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = (Deno.env.get("COESASOLAR_OPENROUTER_API_KEY") ?? Deno.env.get("OPENROUTER_API_KEY"))!;

const LLM_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const EVAL_MODEL = "google/gemini-2.5-flash-lite";

// ============================================
// TYPES
// ============================================

interface BatchConfig {
  batch_size: number;
  min_quality_score: number;
  max_quality_score: number;
  focus_low_quality: boolean;
  auto_approve_rules: boolean;
  dry_run: boolean;
  job_id?: string;
}

interface MessagePair {
  clientMessage: string;
  sofiaResponse: string;
  pairIndex: number;
}

interface EvaluationScores {
  clarity: number;
  accuracy: number;
  tone: number;
  progression: number;
  overall: number;
}

interface EvaluationIssue {
  type: string;
  severity: string;
  description: string;
  suggestion?: string;
}

// ============================================
// CONSTANTS
// ============================================

const SCORE_WEIGHTS = {
  clarity: 0.25,
  accuracy: 0.30,
  tone: 0.20,
  progression: 0.25
};

const PAIR_PATTERN = /\[CLIENTE\]:\s*(.+?)(?=\n\[(?:SOFIA|BOT)\]:)/gs;
const RESPONSE_PATTERN = /\[(?:SOFIA|BOT)\]:\s*(.+?)(?=\n\[CLIENTE\]:|$)/gs;

// ============================================
// PROMPTS
// ============================================

const EVALUATION_SYSTEM_PROMPT_FAILURE = `Você é um especialista em avaliação de qualidade de atendimento ao cliente.

Sua tarefa é avaliar uma resposta de uma assistente virtual de vendas (sofIA) da COESA Energia.

⚠️ CONTEXTO CRÍTICO: Esta conversa é de um ATENDIMENTO QUE FRACASSOU - o cliente NÃO fechou negócio.
Seu objetivo é identificar O QUE DEU ERRADO para que a Sofia possa aprender e melhorar.

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
- Seja MUITO CRÍTICO - estas são conversas que FRACASSARAM
- Identifique problemas específicos que podem ter CAUSADO A PERDA
- Sugira melhorias concretas e acionáveis
- Foque em erros que, se corrigidos, PODERIAM TER SALVADO A VENDA`;

const EVALUATION_SYSTEM_PROMPT_SUCCESS = `Você é um especialista em avaliação de qualidade de atendimento ao cliente.

Sua tarefa é avaliar uma resposta EXEMPLAR de uma assistente virtual de vendas (sofIA) da COESA Energia.

✅ CONTEXTO: Esta conversa é de um ATENDIMENTO DE SUCESSO - o cliente FECHOU negócio.
Seu objetivo é identificar O QUE DEU CERTO para criar padrões a serem replicados.

CRITÉRIOS DE AVALIAÇÃO (use os mesmos de sempre):
1. CLAREZA (0-1): Quão clara e direta foi a comunicação
2. PRECISÃO (0-1): Quão correta estava a informação 
3. TOM (0-1): Quão adequado foi o tom
4. PROGRESSÃO (0-1): Quão bem avançou o cliente no funil

REGRAS:
- Identifique PADRÕES DE SUCESSO que podem ser replicados
- Destaque frases, técnicas ou abordagens que funcionaram especialmente bem
- Extraia "receitas" de sucesso que a Sofia pode aplicar em outras conversas
- Foque em comportamentos que CONVERTERAM o cliente`;

const EVALUATION_TOOL = {
  type: "function",
  function: {
    name: "evaluate_response",
    description: "Avalia a qualidade de uma resposta da Sofia",
    parameters: {
      type: "object",
      properties: {
        clarity_score: { type: "number", minimum: 0, maximum: 1 },
        accuracy_score: { type: "number", minimum: 0, maximum: 1 },
        tone_score: { type: "number", minimum: 0, maximum: 1 },
        progression_score: { type: "number", minimum: 0, maximum: 1 },
        reasoning: { type: "string" },
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
          }
        },
        suggestions: { type: "array", items: { type: "string" } }
      },
      required: ["clarity_score", "accuracy_score", "tone_score", "progression_score", "reasoning"]
    }
  }
};

const RULE_EXTRACTION_SYSTEM_PROMPT_FAILURE = `Você é um especialista em criar regras de negócio para assistentes virtuais de vendas.

⚠️ CONTEXTO: Esta conversa FRACASSOU - o cliente não fechou negócio.
Sua tarefa é analisar o erro detectado e extrair uma REGRA CORRETIVA que previna o mesmo erro no futuro.

A regra deve ser:
1. ESPECÍFICA o suficiente para ser útil
2. GENÉRICA o suficiente para se aplicar a casos similares
3. ACIONÁVEL - deve ter condições claras e ações definidas
4. FOCADA EM RECUPERAR VENDAS - o objetivo é evitar perder clientes

EXEMPLOS DE BOAS REGRAS:
- "Quando cliente disser 'vou pensar', NUNCA encerrar. Perguntar qual é a principal dúvida."
- "Se cliente comparar com concorrente, DESTACAR diferenciais antes de falar de preço."
- "Ao detectar hesitação sobre contrato, SEMPRE mencionar garantia de satisfação."

Se o erro for muito específico e não puder ser generalizado, retorne confidence = 0.`;

const RULE_EXTRACTION_SYSTEM_PROMPT_SUCCESS = `Você é um especialista em criar regras de negócio para assistentes virtuais de vendas.

✅ CONTEXTO: Esta conversa foi um SUCESSO - o cliente fechou negócio.
Sua tarefa é analisar o padrão de sucesso e extrair uma REGRA POSITIVA que replique este comportamento.

A regra deve ser:
1. ESPECÍFICA o suficiente para ser útil
2. GENÉRICA o suficiente para se aplicar a casos similares
3. ACIONÁVEL - deve ter condições claras e ações definidas
4. FOCADA EM REPLICAR SUCESSO - o objetivo é converter mais clientes

EXEMPLOS DE BOAS REGRAS:
- "Quando cliente mostrar interesse no desconto, SEMPRE calcular economia anual imediatamente."
- "Se cliente mencionar conta alta, EMPATIZAR primeiro antes de explicar solução."
- "Ao detectar urgência, OFERECER fechamento imediato com benefício extra."

Se o padrão for muito específico e não puder ser generalizado, retorne confidence = 0.`;

const RULE_EXTRACTION_TOOL = {
  type: "function",
  function: {
    name: "extract_rule",
    description: "Extrai uma regra generalizável de um erro detectado",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Nome curto da regra (max 50 chars)" },
        description: { type: "string", description: "Descrição do que a regra faz" },
        conditions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              field: { type: "string" },
              operator: { type: "string", enum: ["equals", "contains", "greater_than", "less_than", "exists", "not_exists"] },
              value: {}
            },
            required: ["field", "operator", "value"]
          }
        },
        actions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["respond", "block", "escalate", "save_fact", "modify_response"] },
              parameters: { type: "object" }
            },
            required: ["type", "parameters"]
          }
        },
        confidence: { type: "number", minimum: 0, maximum: 1 }
      },
      required: ["name", "description", "conditions", "actions", "confidence"]
    }
  }
};

// ============================================
// HELPER FUNCTIONS
// ============================================

function calculateOverallScore(scores: Omit<EvaluationScores, 'overall'>): number {
  return (
    scores.clarity * SCORE_WEIGHTS.clarity +
    scores.accuracy * SCORE_WEIGHTS.accuracy +
    scores.tone * SCORE_WEIGHTS.tone +
    scores.progression * SCORE_WEIGHTS.progression
  );
}

function extractMessagePairs(content: string): MessagePair[] {
  const pairs: MessagePair[] = [];
  
  // Normalizar quebras de linha
  const normalized = content.replace(/\r\n/g, '\n');
  
  // Pattern mais robusto para capturar pares
  const segments = normalized.split(/\n(?=\[(?:CLIENTE|SOFIA|BOT)\]:)/);
  
  let currentClient: string | null = null;
  let pairIndex = 0;
  
  for (const segment of segments) {
    const trimmed = segment.trim();
    
    if (trimmed.startsWith('[CLIENTE]:')) {
      currentClient = trimmed.replace(/^\[CLIENTE\]:\s*/, '').trim();
    } else if ((trimmed.startsWith('[SOFIA]:') || trimmed.startsWith('[BOT]:')) && currentClient) {
      const sofiaResponse = trimmed.replace(/^\[(?:SOFIA|BOT)\]:\s*/, '').trim();
      
      if (currentClient.length > 5 && sofiaResponse.length > 10) {
        pairs.push({
          clientMessage: currentClient,
          sofiaResponse,
          pairIndex
        });
        pairIndex++;
      }
      currentClient = null;
    }
  }
  
  return pairs;
}

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// CORE FUNCTIONS
// ============================================

async function evaluatePair(
  clientMessage: string,
  sofiaResponse: string,
  learningType: 'success' | 'failure' | 'neutral' = 'failure'
): Promise<{ scores: EvaluationScores; issues: EvaluationIssue[]; suggestions: string[] } | null> {
  try {
    const isSuccess = learningType === 'success';
    const systemPrompt = isSuccess ? EVALUATION_SYSTEM_PROMPT_SUCCESS : EVALUATION_SYSTEM_PROMPT_FAILURE;
    
    const prompt = isSuccess 
      ? `Analise este exemplo de SUCESSO e identifique os padrões positivos:

## Mensagem do Cliente:
${clientMessage}

## Resposta da Sofia (que FUNCIONOU):
${sofiaResponse}

Avalie e destaque o que funcionou bem.`
      : `Avalie esta interação:

## Mensagem do Cliente:
${clientMessage}

## Resposta da Sofia:
${sofiaResponse}

Avalie usando os critérios de clareza, precisão, tom e progressão.`;

    const response = await fetch(LLM_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: EVAL_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt }
        ],
        temperature: 0.2,
        max_tokens: 1000,
        tools: [EVALUATION_TOOL],
        tool_choice: { type: "function", function: { name: "evaluate_response" } }
      })
    });

    if (!response.ok) {
      console.error('[eval] LLM error:', response.status);
      return null;
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall) {
      return null;
    }

    const evalData = JSON.parse(toolCall.function.arguments);
    
    const scores: EvaluationScores = {
      clarity: evalData.clarity_score || 0.5,
      accuracy: evalData.accuracy_score || 0.5,
      tone: evalData.tone_score || 0.5,
      progression: evalData.progression_score || 0.5,
      overall: 0
    };
    scores.overall = calculateOverallScore(scores);

    return {
      scores,
      issues: evalData.issues || [],
      suggestions: evalData.suggestions || []
    };
  } catch (error) {
    console.error('[eval] Error:', error);
    return null;
  }
}

async function extractRule(
  clientMessage: string,
  sofiaResponse: string,
  issues: EvaluationIssue[],
  learningType: 'success' | 'failure' | 'neutral' = 'failure'
): Promise<{ rule: any; confidence: number } | null> {
  try {
    const isSuccess = learningType === 'success';
    const systemPrompt = isSuccess ? RULE_EXTRACTION_SYSTEM_PROMPT_SUCCESS : RULE_EXTRACTION_SYSTEM_PROMPT_FAILURE;
    
    const issuesText = issues.map(i => `- ${i.type}: ${i.description}`).join('\n');
    
    const prompt = isSuccess 
      ? `Analise este SUCESSO e extraia um padrão positivo:

## Mensagem do Cliente:
${clientMessage}

## Resposta da Sofia (que CONVERTEU):
${sofiaResponse}

## Pontos Fortes Identificados:
${issuesText || 'Resposta eficaz que levou ao fechamento'}

Crie uma regra que replique este padrão de sucesso.`
      : `Analise este erro e extraia uma regra corretiva:

## Mensagem do Cliente:
${clientMessage}

## Resposta da Sofia (com problemas):
${sofiaResponse}

## Problemas Detectados:
${issuesText}

Crie uma regra que previna este tipo de erro no futuro.`;

    const response = await fetch(LLM_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: EVAL_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 1000,
        tools: [RULE_EXTRACTION_TOOL],
        tool_choice: { type: "function", function: { name: "extract_rule" } }
      })
    });

    if (!response.ok) {
      return null;
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall) {
      return null;
    }

    const ruleData = JSON.parse(toolCall.function.arguments);
    
    return {
      rule: ruleData,
      confidence: ruleData.confidence || 0
    };
  } catch (error) {
    console.error('[rule-extract] Error:', error);
    return null;
  }
}

// ============================================
// MAIN PROCESSOR
// ============================================

async function processJob(supabase: any, config: BatchConfig): Promise<{
  success: boolean;
  processed: number;
  errorsFound: number;
  rulesExtracted: number;
  error?: string;
}> {
  const jobId = config.job_id;
  
  try {
    // Update job status
    if (jobId) {
      await supabase
        .from('batch_learning_jobs')
        .update({ status: 'processing', started_at: new Date().toISOString() })
        .eq('id', jobId);
    }

    // Fetch chunks to process - focusing on script conversations
    // Now includes learning_type for intelligent processing
    let query = supabase
      .from('rag_chunks')
      .select(`
        id,
        document_id,
        content,
        chunk_index,
        metadata,
        learning_type,
        rag_documents!inner (
          id,
          file_name,
          source_path,
          category,
          metadata,
          learning_type
        )
      `)
      .eq('rag_documents.category', 'scripts')
      .order('created_at', { ascending: false })
      .limit(config.batch_size);

    const { data: chunks, error: fetchError } = await query;

    if (fetchError) {
      throw new Error(`Failed to fetch chunks: ${fetchError.message}`);
    }

    if (!chunks || chunks.length === 0) {
      return { success: true, processed: 0, errorsFound: 0, rulesExtracted: 0 };
    }

    // Update total count
    if (jobId) {
      await supabase
        .from('batch_learning_jobs')
        .update({ total_chunks: chunks.length })
        .eq('id', jobId);
    }

    let processedCount = 0;
    let errorsFound = 0;
    let rulesExtracted = 0;

    for (const chunk of chunks) {
      // Check if already evaluated
      const { data: existing } = await supabase
        .from('batch_learning_evaluations')
        .select('id')
        .eq('chunk_id', chunk.id)
        .limit(1);

      if (existing && existing.length > 0) {
        processedCount++;
        continue;
      }

      // Extract message pairs from chunk content
      const pairs = extractMessagePairs(chunk.content);
      
      if (pairs.length === 0) {
        processedCount++;
        continue;
      }

      // Determine learning type from chunk or document
      const chunkLearningType = (chunk.learning_type || 
        (chunk.rag_documents as any)?.learning_type || 
        'failure') as 'success' | 'failure' | 'neutral';
      
      const isSuccessExample = chunkLearningType === 'success';
      
      // Evaluate each pair with appropriate context
      for (const pair of pairs) {
        // Rate limiting
        await delay(500);

        const evaluation = await evaluatePair(
          pair.clientMessage, 
          pair.sofiaResponse, 
          chunkLearningType
        );
        
        if (!evaluation) {
          continue;
        }

        // For success examples: high score means extractable pattern
        // For failure examples: low score means extractable correction
        const isActionable = isSuccessExample 
          ? evaluation.scores.overall >= 0.7  // High-quality success to emulate
          : evaluation.scores.overall < 0.6;  // Error to correct
        
        if (!isActionable) {
          // Skip if not actionable
          continue;
        }

        if (!isSuccessExample && evaluation.scores.overall < 0.6) {
          errorsFound++;
        }

        // Extract rule (positive pattern for success, correction for failure)
        let proposedRule = null;
        if (isActionable && (isSuccessExample || evaluation.issues.length > 0)) {
          await delay(500);
          const ruleResult = await extractRule(
            pair.clientMessage, 
            pair.sofiaResponse, 
            evaluation.issues,
            chunkLearningType
          );
          
          if (ruleResult && ruleResult.confidence >= 0.5) {
            proposedRule = {
              ...ruleResult.rule,
              rule_type: isSuccessExample ? 'success_pattern' : 'error_correction',
              learning_type: chunkLearningType,
            };
            rulesExtracted++;
          }
        }

        // Persist evaluation
        if (!config.dry_run) {
          await supabase.from('batch_learning_evaluations').insert({
            job_id: jobId,
            chunk_id: chunk.id,
            document_id: chunk.document_id,
            pair_index: pair.pairIndex,
            client_message: pair.clientMessage,
            sofia_response: pair.sofiaResponse,
            scores: evaluation.scores,
            overall_score: evaluation.scores.overall,
            issues: evaluation.issues,
            proposed_rule: proposedRule,
            rule_status: proposedRule ? 'pending' : 'skipped'
          });
        }
      }

      processedCount++;

      // Update progress every 10 chunks
      if (jobId && processedCount % 10 === 0) {
        await supabase
          .from('batch_learning_jobs')
          .update({ 
            processed_chunks: processedCount,
            errors_found: errorsFound,
            rules_extracted: rulesExtracted
          })
          .eq('id', jobId);
      }
    }

    // Final update
    if (jobId) {
      await supabase
        .from('batch_learning_jobs')
        .update({ 
          status: 'completed',
          processed_chunks: processedCount,
          errors_found: errorsFound,
          rules_extracted: rulesExtracted,
          completed_at: new Date().toISOString()
        })
        .eq('id', jobId);
    }

    return {
      success: true,
      processed: processedCount,
      errorsFound,
      rulesExtracted
    };

  } catch (error) {
    console.error('[processor] Error:', error);
    
    if (jobId) {
      await supabase
        .from('batch_learning_jobs')
        .update({ 
          status: 'failed',
          error_message: error instanceof Error ? error.message : String(error)
        })
        .eq('id', jobId);
    }

    return {
      success: false,
      processed: 0,
      errorsFound: 0,
      rulesExtracted: 0,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// ============================================
// RULE APPROVAL
// ============================================

async function approveRule(
  supabase: any,
  evaluationId: string,
  reviewerEmail: string
): Promise<{ success: boolean; ruleId?: string; error?: string }> {
  try {
    // Get the evaluation
    const { data: evaluation, error: fetchError } = await supabase
      .from('batch_learning_evaluations')
      .select('*')
      .eq('id', evaluationId)
      .single();

    if (fetchError || !evaluation) {
      return { success: false, error: 'Evaluation not found' };
    }

    if (!evaluation.proposed_rule) {
      return { success: false, error: 'No proposed rule' };
    }

    const rule = evaluation.proposed_rule;

    // Check for duplicates
    const { data: existingRules } = await supabase
      .from('rule_memory')
      .select('id, name')
      .eq('agent_id', 'sofia')
      .ilike('name', `%${rule.name.substring(0, 20)}%`)
      .limit(1);

    if (existingRules && existingRules.length > 0) {
      await supabase
        .from('batch_learning_evaluations')
        .update({ 
          rule_status: 'duplicate',
          reviewed_at: new Date().toISOString(),
          reviewed_by: reviewerEmail
        })
        .eq('id', evaluationId);

      return { success: false, error: 'Duplicate rule exists' };
    }

    // Insert the rule
    const { data: savedRule, error: saveError } = await supabase
      .from('rule_memory')
      .insert({
        agent_id: 'sofia',
        rule_type: 'learned_pattern',
        name: rule.name,
        description: rule.description,
        conditions: rule.conditions,
        actions: rule.actions,
        priority: 50,
        is_active: true,
        confidence: rule.confidence,
        times_applied: 0,
        learning_source: 'batch_retroactive'
      })
      .select('id')
      .single();

    if (saveError) {
      return { success: false, error: saveError.message };
    }

    // Update evaluation
    await supabase
      .from('batch_learning_evaluations')
      .update({ 
        rule_status: 'approved',
        approved_rule_id: savedRule.id,
        reviewed_at: new Date().toISOString(),
        reviewed_by: reviewerEmail
      })
      .eq('id', evaluationId);

    // Update job count
    if (evaluation.job_id) {
      await supabase.rpc('increment_rules_approved', { job_id_param: evaluation.job_id });
    }

    return { success: true, ruleId: savedRule.id };

  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// ============================================
// HTTP HANDLER
// ============================================

serve(async (req) => {
  const corsHeaders = getStrictCorsHeaders(req);
  
  if (req.method === "OPTIONS") {
    return handleCorsPrelight(req, { mode: 'strict' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { action, ...params } = await req.json();

    switch (action) {
      case 'start_job': {
        const config: BatchConfig = {
          batch_size: params.batch_size || 50,
          min_quality_score: params.min_quality_score || 60,
          max_quality_score: params.max_quality_score || 100,
          focus_low_quality: params.focus_low_quality ?? true,
          auto_approve_rules: params.auto_approve_rules ?? false,
          dry_run: params.dry_run ?? false
        };

        // Create job record
        const { data: job, error: jobError } = await supabase
          .from('batch_learning_jobs')
          .insert({
            status: 'pending',
            config,
            created_by: params.created_by
          })
          .select('id')
          .single();

        if (jobError) {
          throw new Error(`Failed to create job: ${jobError.message}`);
        }

        config.job_id = job.id;

        // Process asynchronously (fire and forget)
        processJob(supabase, config).catch(err => {
          console.error('[retroactive-learning] Background job error:', err);
        });

        return new Response(
          JSON.stringify({ success: true, job_id: job.id }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case 'get_job_status': {
        const { data: job, error } = await supabase
          .from('batch_learning_jobs')
          .select('*')
          .eq('id', params.job_id)
          .single();

        if (error) {
          throw new Error(`Job not found: ${error.message}`);
        }

        return new Response(
          JSON.stringify({ success: true, job }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case 'get_pending_evaluations': {
        const { data: evaluations, error } = await supabase
          .from('batch_learning_evaluations')
          .select('*')
          .eq('rule_status', 'pending')
          .not('proposed_rule', 'is', null)
          .order('overall_score', { ascending: true })
          .limit(params.limit || 50);

        if (error) {
          throw new Error(`Failed to fetch evaluations: ${error.message}`);
        }

        return new Response(
          JSON.stringify({ success: true, evaluations }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case 'approve_rule': {
        const result = await approveRule(supabase, params.evaluation_id, params.reviewer_email);
        
        return new Response(
          JSON.stringify(result),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case 'reject_rule': {
        await supabase
          .from('batch_learning_evaluations')
          .update({ 
            rule_status: 'rejected',
            reviewed_at: new Date().toISOString(),
            reviewed_by: params.reviewer_email
          })
          .eq('id', params.evaluation_id);

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case 'get_stats': {
        const { data: jobs } = await supabase
          .from('batch_learning_jobs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(10);

        const { count: pendingCount } = await supabase
          .from('batch_learning_evaluations')
          .select('*', { count: 'exact', head: true })
          .eq('rule_status', 'pending')
          .not('proposed_rule', 'is', null);

        const { count: approvedCount } = await supabase
          .from('batch_learning_evaluations')
          .select('*', { count: 'exact', head: true })
          .eq('rule_status', 'approved');

        const { count: totalRules } = await supabase
          .from('rule_memory')
          .select('*', { count: 'exact', head: true })
          .eq('learning_source', 'batch_retroactive');

        return new Response(
          JSON.stringify({
            success: true,
            stats: {
              recent_jobs: jobs || [],
              pending_approvals: pendingCount || 0,
              approved_rules: approvedCount || 0,
              total_retroactive_rules: totalRules || 0
            }
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ success: false, error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

  } catch (error) {
    console.error('[retroactive-learning] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
