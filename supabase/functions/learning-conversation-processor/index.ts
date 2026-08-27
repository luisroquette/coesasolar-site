import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getStrictCorsHeaders, handleCorsPrelight } from '../_shared/security-helpers.ts';

/**
 * learning-conversation-processor
 * 
 * Processa conversas de falha/sucesso e extrai:
 * 1. Regras de comportamento para rule_memory
 * 2. Exemplos few-shot para injeção no prompt
 * 
 * Seguindo padrão AGENTS.md: regras são injetadas passivamente no contexto
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = (Deno.env.get('COESASOLAR_OPENROUTER_API_KEY'))!;

const LLM_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash-lite";

// ============================================
// TYPES
// ============================================

interface ProcessRequest {
  conversation_text: string;
  file_name: string;
  learning_type: 'success' | 'failure' | 'neutral';
  auto_approve_threshold: number;
  extract_few_shots: boolean;
  extract_rules: boolean;
}

interface MessagePair {
  clientMessage: string;
  sofiaResponse: string;
  pairIndex: number;
}

interface ExtractedRule {
  name: string;
  description: string;
  rule_type: string;
  priority: number;
  confidence: number;
  conditions?: Record<string, unknown>;
  condition?: Record<string, unknown>;
  issue_detected: string;
}

interface ExtractedFewShot {
  context: string;
  input: string;
  expected_output: string;
  quality_score: number;
}

// ============================================
// PROMPTS (AGENTS.md Style - Compact)
// ============================================

const RULE_EXTRACTION_PROMPT = `Você extrai regras de comportamento de conversas de vendas.

TAREFA: Analisar conversa e extrair regras acionáveis para um agente de IA.

FORMATO DE SAÍDA (JSON):
{
  "rules": [{
    "name": "Nome curto (<50 chars)",
    "description": "O que fazer/não fazer",
    "rule_type": "guardrail|behavior|response|objection",
    "priority": 50-100,
    "confidence": 0.0-1.0,
    "conditions": {"trigger": "descrição do gatilho"},
    "issue_detected": "Problema identificado"
  }],
  "few_shots": [{
    "context": "Situação/estágio do funil",
    "input": "Mensagem do cliente",
    "expected_output": "Resposta ideal corrigida",
    "quality_score": 0-100
  }]
}

REGRAS:
- FALHA: extraia o que DEU ERRADO e como CORRIGIR
- SUCESSO: extraia o PADRÃO que funcionou
- Prioridade: 90+ para guardrails críticos, 70-89 para comportamentos, 50-69 para sugestões
- Confiança: 0.8+ se padrão claro, <0.8 se ambíguo
- Few-shots: crie exemplos de como DEVERIA ter sido a resposta`;

const FEW_SHOT_ONLY_PROMPT = `Você cria exemplos few-shot de conversas de vendas.

TAREFA: Extrair pares input/output ideais para treinar um agente de IA.

FORMATO (JSON):
{
  "few_shots": [{
    "context": "Estágio: QUALIFICACAO | Cliente hesitante",
    "input": "Mensagem exata do cliente",
    "expected_output": "Resposta ideal (corrigida se necessário)",
    "quality_score": 0-100
  }]
}

REGRAS:
- Mantenha o tom profissional e empático
- Corrija erros de clareza, tom ou progressão
- Score: 90+ para exemplares, 70-89 para bons, <70 para básicos`;

// ============================================
// HELPERS
// ============================================

function extractMessagePairs(content: string): MessagePair[] {
  const pairs: MessagePair[] = [];
  
  // Try to parse as JSON first (WhatsApp export format)
  try {
    const jsonData = JSON.parse(content);
    if (Array.isArray(jsonData)) {
      const jsonPairs = extractFromJsonArray(jsonData);
      // If we couldn't form pairs (common when conversation ends with client message),
      // fall back to a minimal pair so the LLM can still learn from the failure.
      if (jsonPairs.length > 0) return jsonPairs;
      const fallback = extractFallbackPairsFromJson(jsonData);
      if (fallback.length > 0) return fallback;
      // else continue with text parsing
    }
  } catch {
    // Not JSON, continue with text parsing
  }
  
  const normalized = content.replace(/\r\n/g, '\n');
  
  // Detectar formato automáticamente
  const hasSquareBrackets = /\[(CLIENTE|SOFIA|BOT)\]:/.test(normalized);
  const hasColons = /^(Cliente|Sofia|Vendedor):/im.test(normalized);
  const hasEmojis = /[👤🤖]/.test(normalized);
  
  let segments: string[];
  
  if (hasSquareBrackets) {
    segments = normalized.split(/\n(?=\[(?:CLIENTE|SOFIA|BOT)\]:)/);
  } else if (hasColons) {
    segments = normalized.split(/\n(?=(?:Cliente|Sofia|Vendedor):)/i);
  } else if (hasEmojis) {
    segments = normalized.split(/\n(?=[👤🤖])/);
  } else {
    // Fallback: cada linha é uma mensagem alternada
    const lines = normalized.split('\n').filter(l => l.trim());
    for (let i = 0; i < lines.length - 1; i += 2) {
      pairs.push({
        clientMessage: lines[i].trim(),
        sofiaResponse: lines[i + 1]?.trim() || '',
        pairIndex: Math.floor(i / 2)
      });
    }
    // If odd number of lines, keep last client message with empty response
    if (lines.length % 2 === 1 && lines[lines.length - 1]?.trim()) {
      pairs.push({
        clientMessage: lines[lines.length - 1].trim(),
        sofiaResponse: '',
        pairIndex: Math.floor(lines.length / 2),
      });
    }
    return pairs;
  }
  
  let currentClient: string | null = null;
  let pairIndex = 0;
  
  for (const segment of segments) {
    const trimmed = segment.trim();
    const isClient = /^\[(CLIENTE)\]:|^Cliente:|^👤/i.test(trimmed);
    const isSofia = /^\[(SOFIA|BOT)\]:|^(Sofia|Vendedor):|^🤖/i.test(trimmed);
    
    const cleanedText = trimmed
      .replace(/^\[(CLIENTE|SOFIA|BOT)\]:\s*/i, '')
      .replace(/^(Cliente|Sofia|Vendedor):\s*/i, '')
      .replace(/^[👤🤖]\s*/, '')
      .trim();
    
    if (isClient) {
      currentClient = cleanedText;
    } else if (isSofia && currentClient) {
      if (currentClient.length > 5 && cleanedText.length > 10) {
        pairs.push({
          clientMessage: currentClient,
          sofiaResponse: cleanedText,
          pairIndex
        });
        pairIndex++;
      }
      currentClient = null;
    }
  }
  
  return pairs;
}

function getWhatsAppMessageText(msg: any): string {
  // Common exports: msg.message (string), msg.caption (string)
  const m = msg?.message;
  if (typeof m === 'string') return m;
  if (typeof msg?.caption === 'string' && msg.caption.trim()) return msg.caption;
  // Some exporters store as array of strings/objects
  if (Array.isArray(m)) {
    return m
      .map((p) => {
        if (typeof p === 'string') return p;
        if (p && typeof p === 'object' && typeof p.text === 'string') return p.text;
        return '';
      })
      .join('')
      .trim();
  }
  return '';
}

function isBotFromWhatsAppMsg(msg: any): boolean {
  if (msg?.fromMe === true) return true;

  const formattedName = String(msg?.formattedName ?? '');
  if (formattedName === 'Você') return true;

  const name = `${msg?.displayName ?? ''} ${msg?.formattedName ?? ''}`.toLowerCase();
  return (
    name.includes('coesa') ||
    name.includes('sofia') ||
    name.includes('você') ||
    name.includes('voce') ||
    name.includes('bot')
  );
}

// Parse JSON array from WhatsApp export (format: [{displayName, message, ...}])
function extractFromJsonArray(messages: any[]): MessagePair[] {
  const pairs: MessagePair[] = [];
  let pairIndex = 0;
  let bufferedClientParts: string[] = [];

  // Sort by time if available (support BR date formats too)
  const sorted = [...messages].sort((a, b) => {
    const ta = a?.time;
    const tb = b?.time;
    if (!ta || !tb) return 0;
    const da = new Date(ta);
    const db = new Date(tb);
    const va = isNaN(da.getTime()) ? 0 : da.getTime();
    const vb = isNaN(db.getTime()) ? 0 : db.getTime();
    return va - vb;
  });

  for (const msg of sorted) {
    const text = getWhatsAppMessageText(msg);
    if (!text) continue;

    const isBot = isBotFromWhatsAppMsg(msg);

    if (!isBot) {
      bufferedClientParts.push(text);
      continue;
    }

    if (bufferedClientParts.length > 0) {
      const clientMessage = bufferedClientParts.join('\n').trim();
      const sofiaResponse = text.trim();

      if (clientMessage.length > 2) {
        pairs.push({
          clientMessage,
          sofiaResponse,
          pairIndex,
        });
        pairIndex++;
      }
      bufferedClientParts = [];
    }
  }

  // Conversation ended with a client message and no bot response (common failure mode)
  if (bufferedClientParts.length > 0) {
    const clientMessage = bufferedClientParts.join('\n').trim();
    if (clientMessage.length > 2) {
      pairs.push({
        clientMessage,
        sofiaResponse: '',
        pairIndex,
      });
    }
  }

  return pairs;
}

// Minimal fallback: create at least one pair from whatever we can parse
function extractFallbackPairsFromJson(messages: any[]): MessagePair[] {
  const texts: { role: 'client' | 'bot'; text: string }[] = [];
  for (const msg of messages || []) {
    const text = getWhatsAppMessageText(msg);
    if (!text) continue;
    texts.push({ role: isBotFromWhatsAppMsg(msg) ? 'bot' : 'client', text: text.trim() });
  }

  if (texts.length === 0) return [];

  // If we have at least one client message, use the last one as a learning example.
  const lastClient = [...texts].reverse().find(t => t.role === 'client');
  if (lastClient) {
    return [{ clientMessage: lastClient.text, sofiaResponse: '', pairIndex: 0 }];
  }

  // Otherwise just use the last message as "client" to avoid hard failure
  return [{ clientMessage: texts[texts.length - 1].text, sofiaResponse: '', pairIndex: 0 }];
}

async function hashContent(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

async function callLLM(prompt: string, userContent: string): Promise<any> {
  const response = await fetch(LLM_ENDPOINT, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: userContent }
      ],
      temperature: 0.3,
      max_tokens: 2000,
      response_format: { type: "json_object" }
    })
  });

  if (!response.ok) {
    throw new Error(`LLM error: ${response.status}`);
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;
  
  if (!content) {
    throw new Error('Empty LLM response');
  }
  
  return JSON.parse(content);
}

// ============================================
// MAIN HANDLER
// ============================================

serve(async (req) => {
  const corsHeaders = getStrictCorsHeaders(req);
  
  if (req.method === 'OPTIONS') {
    return handleCorsPrelight(req, { mode: 'strict' });
  }

  const startTime = Date.now();
  
  try {
    const body: ProcessRequest = await req.json();
    const {
      conversation_text,
      file_name,
      learning_type = 'failure',
      auto_approve_threshold = 0.8,
      extract_few_shots = true,
      extract_rules = true,
    } = body;

    if (!conversation_text || conversation_text.trim().length < 50) {
      return new Response(
        JSON.stringify({ success: false, error: 'Conversation text too short' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Check if already processed
    const contentHash = await hashContent(conversation_text);
    const { data: existing } = await supabase
      .from('learning_processed_conversations')
      .select('id')
      .eq('content_hash', contentHash)
      .maybeSingle();

    if (existing) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Conversation already processed',
          conversation_id: existing.id,
          rules_extracted: 0,
          few_shots_created: 0,
          auto_approved: 0,
          pending_review: 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract message pairs
    const pairs = extractMessagePairs(conversation_text);
    console.log(`[learning-processor] Extracted ${pairs.length} message pairs`);

    if (pairs.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No message pairs found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build context for LLM
    const conversationContext = pairs.map((p, i) => 
      `[${i + 1}] Cliente: ${p.clientMessage}\n    Sofia: ${p.sofiaResponse}`
    ).join('\n\n');

    const learningContext = learning_type === 'failure' 
      ? '⚠️ Esta conversa FRACASSOU - o cliente NÃO fechou negócio. Identifique os erros.'
      : '✅ Esta conversa foi um SUCESSO - o cliente FECHOU negócio. Identifique os padrões positivos.';

    const userPrompt = `${learningContext}

CONVERSA:
${conversationContext}

Extraia regras e exemplos few-shot desta conversa.`;

    // Call LLM
    let llmResult: { rules?: ExtractedRule[]; few_shots?: ExtractedFewShot[] };
    
    if (extract_rules && extract_few_shots) {
      llmResult = await callLLM(RULE_EXTRACTION_PROMPT, userPrompt);
    } else if (extract_few_shots) {
      llmResult = await callLLM(FEW_SHOT_ONLY_PROMPT, userPrompt);
    } else {
      llmResult = await callLLM(RULE_EXTRACTION_PROMPT, userPrompt);
    }

    const rules = llmResult.rules || [];
    const fewShots = llmResult.few_shots || [];

    console.log(`[learning-processor] LLM extracted: ${rules.length} rules, ${fewShots.length} few-shots`);

    // Record processed conversation
    const { data: conversationRecord, error: insertConvError } = await supabase
      .from('learning_processed_conversations')
      .insert({
        file_name,
        content_hash: contentHash,
        message_count: pairs.length,
        rules_extracted: rules.length,
        few_shots_created: fewShots.length,
        processing_time_ms: Date.now() - startTime,
        status: 'completed',
      })
      .select('id')
      .single();

    if (insertConvError) {
      console.error('[learning-processor] Error recording conversation:', insertConvError);
    }

    const conversationId = conversationRecord?.id || 'unknown';
    let autoApproved = 0;
    let pendingReview = 0;

    // Process rules
    console.log(`[learning-processor] Processing ${rules.length} rules, auto_approve_threshold=${auto_approve_threshold}`);
    
    for (const rule of rules) {
      console.log(`[learning-processor] Rule: ${rule.name}, confidence=${rule.confidence}, type=${rule.rule_type}`);
      
      const shouldAutoApprove = rule.confidence >= auto_approve_threshold;
      
      // Build condition object - handle both 'conditions' and 'condition' from LLM
      const conditionPayload = rule.conditions || rule.condition || { 
        trigger: rule.issue_detected || 'learned_pattern' 
      };
      
      // Ensure rule_type has a default if missing
      const ruleType = rule.rule_type || 'behavior';
      
      if (shouldAutoApprove) {
        // Auto-approve: insert directly into rule_memory
        const insertData = {
          agent_id: 'sofia',
          rule_type: ruleType,
          name: rule.name || 'Regra sem nome',
          description: rule.description || '',
          priority: rule.priority || 70,
          condition: conditionPayload,
          action: { 
            apply_learned_behavior: true, 
            source: 'conversation_upload',
            issue_detected: rule.issue_detected || null,
          },
          is_active: true,
          learned_from: 'conversation_upload',
          learning_source: 'conversation_upload',
          confidence: rule.confidence || 0.8,
        };
        
        console.log(`[learning-processor] Inserting rule to rule_memory:`, JSON.stringify(insertData));
        
        const { error: ruleError } = await supabase.from('rule_memory').insert(insertData);

        if (ruleError) {
          console.error('[learning-processor] Error inserting rule:', ruleError.message, ruleError.details, ruleError.hint);
        } else {
          console.log(`[learning-processor] Rule "${rule.name}" auto-approved and saved!`);
          autoApproved++;
        }
      } else {
        // Pending review: insert into pending_learned_rules
        const { error: pendingError } = await supabase
          .from('pending_learned_rules')
          .insert({
            name: rule.name || 'Regra sem nome',
            description: rule.description || '',
            rule_type: ruleType,
            priority: rule.priority || 70,
            confidence: rule.confidence || 0.5,
            conditions: conditionPayload,
            source_conversation_id: conversationId,
            source_pair_index: 0,
            client_message_sample: pairs[0]?.clientMessage || '',
            sofia_response_sample: pairs[0]?.sofiaResponse || '',
            issue_detected: rule.issue_detected || '',
            learning_type,
            status: 'pending',
          });

        if (pendingError) {
          console.error('[learning-processor] Error inserting pending rule:', pendingError.message);
        } else {
          console.log(`[learning-processor] Rule "${rule.name}" sent to pending review`);
          pendingReview++;
        }
      }
    }

    // Process few-shots
    let fewShotsCreated = 0;
    for (const fs of fewShots) {
      const shouldAutoApprove = fs.quality_score >= (auto_approve_threshold * 100);
      
      const { error: fsError } = await supabase
        .from('few_shot_examples')
        .insert({
          agent_id: 'sofia',
          context: fs.context,
          input: fs.input,
          expected_output: fs.expected_output,
          source_conversation_id: conversationId,
          quality_score: fs.quality_score,
          is_approved: shouldAutoApprove,
          is_active: shouldAutoApprove,
          metadata: {
            learning_type,
            auto_approved: shouldAutoApprove,
          },
        });

      if (!fsError) fewShotsCreated++;
    }

    const processingTime = Date.now() - startTime;
    console.log(`[learning-processor] Complete in ${processingTime}ms: ${autoApproved} auto-approved, ${pendingReview} pending`);

    return new Response(
      JSON.stringify({
        success: true,
        conversation_id: conversationId,
        rules_extracted: rules.length,
        few_shots_created: fewShotsCreated,
        auto_approved: autoApproved,
        pending_review: pendingReview,
        processing_time_ms: processingTime,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[learning-processor] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        rules_extracted: 0,
        few_shots_created: 0,
        auto_approved: 0,
        pending_review: 0,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
