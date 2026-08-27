import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getStrictCorsHeaders,
  handleCorsPrelight,
} from '../_shared/security-helpers.ts';

/**
 * sofia-self-analysis: Layer 2 of Self-Improving Agent
 * 
 * Analyzes agent conversations, identifies failure patterns, consults own code via RAG,
 * and generates structured improvement proposals for human review.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const LOVABLE_API_KEY = (Deno.env.get('COESA_PROPOSTAS_OPENROUTER_API_KEY'))!;

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

interface AnalysisConfig {
  period_days: number;
  max_conversations: number;
  min_quality_threshold: number;
  max_proposals: number;
}

interface ConversationSummary {
  id: string;
  cliente_nome: string | null;
  total_messages: number;
  sofia_mode: string | null;
  lead_score: number | null;
  detected_objection: string | null;
  escalation_reason: string | null;
  needs_human_fallback: boolean;
  created_at: string;
  ended_at: string | null;
  messages: { role: string; content: string }[];
}

interface ProposalDraft {
  category: string;
  title: string;
  problem_description: string;
  evidence: {
    conversation_ids: string[];
    pattern_frequency: number;
    metrics?: Record<string, number>;
  };
  proposed_change: string;
  expected_impact: string;
  risk_level: string;
  confidence: number;
}

const DEFAULT_CONFIG: AnalysisConfig = {
  period_days: 7,
  max_conversations: 50,
  min_quality_threshold: 60,
  max_proposals: 10,
};

// ═══════════════════════════════════════════════════════════════
// DATA GATHERING
// ═══════════════════════════════════════════════════════════════

async function getFailedConversations(
  supabase: any,
  config: AnalysisConfig
): Promise<ConversationSummary[]> {
  const sinceDate = new Date(Date.now() - config.period_days * 24 * 60 * 60 * 1000).toISOString();

  // Get conversations that ended poorly
  const { data: conversas, error } = await supabase
    .from('chatbot_conversas')
    .select('id, cliente_nome, total_messages, sofia_mode, lead_score, detected_objection, escalation_reason, needs_human_fallback, created_at, ended_at')
    .gte('created_at', sinceDate)
    .or('needs_human_fallback.eq.true,lead_score.lt.30,escalation_reason.not.is.null,event_drop.eq.true')
    .order('created_at', { ascending: false })
    .limit(config.max_conversations);

  if (error || !conversas) {
    console.error('[self-analysis] Error fetching conversations:', error);
    return [];
  }

  // Fetch messages for each conversation (last 20 per conversation)
  const summaries: ConversationSummary[] = [];
  for (const conv of conversas) {
    const { data: msgs } = await supabase
      .from('chatbot_mensagens')
      .select('role, content')
      .eq('conversa_id', conv.id)
      .order('created_at', { ascending: true })
      .limit(20);

    summaries.push({
      ...conv,
      messages: msgs || [],
    });
  }

  return summaries;
}

async function getAgentCodeContext(supabase: any): Promise<string> {
  // Fetch top code chunks from RAG for self-awareness
  const { data: chunks } = await supabase
    .from('rag_chunks')
    .select(`
      content,
      metadata,
      rag_documents!inner (
        category,
        subcategory,
        source_path
      )
    `)
    .eq('rag_documents.category', 'codigo_agente')
    .limit(15);

  if (!chunks || chunks.length === 0) {
    return 'Nenhum código do agente indexado no RAG. Execute agent-code-indexer primeiro.';
  }

  return chunks
    .map((c: any) => `--- ${c.rag_documents?.source_path} (${c.rag_documents?.subcategory}) ---\n${c.content.slice(0, 1500)}`)
    .join('\n\n');
}

async function getConversionMetrics(supabase: any, periodDays: number): Promise<Record<string, any>> {
  const sinceDate = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString();

  const [
    { count: totalConversas },
    { count: convertidas },
    { count: drops },
    { count: escaladas },
    { count: humanFallbacks },
  ] = await Promise.all([
    supabase.from('chatbot_conversas').select('*', { count: 'exact', head: true }).gte('created_at', sinceDate),
    supabase.from('chatbot_conversas').select('*', { count: 'exact', head: true }).gte('created_at', sinceDate).eq('event_conversion', true),
    supabase.from('chatbot_conversas').select('*', { count: 'exact', head: true }).gte('created_at', sinceDate).eq('event_drop', true),
    supabase.from('chatbot_conversas').select('*', { count: 'exact', head: true }).gte('created_at', sinceDate).not('escalation_reason', 'is', null),
    supabase.from('chatbot_conversas').select('*', { count: 'exact', head: true }).gte('created_at', sinceDate).eq('needs_human_fallback', true),
  ]);

  return {
    total: totalConversas || 0,
    converted: convertidas || 0,
    dropped: drops || 0,
    escalated: escaladas || 0,
    human_fallbacks: humanFallbacks || 0,
    conversion_rate: totalConversas ? ((convertidas || 0) / totalConversas * 100).toFixed(1) : '0',
    drop_rate: totalConversas ? ((drops || 0) / totalConversas * 100).toFixed(1) : '0',
  };
}

// ═══════════════════════════════════════════════════════════════
// LLM ANALYSIS (via Lovable AI)
// ═══════════════════════════════════════════════════════════════

async function generateProposals(
  conversations: ConversationSummary[],
  codeContext: string,
  metrics: Record<string, any>,
  maxProposals: number
): Promise<ProposalDraft[]> {
  // Build the analysis prompt
  const conversationSummaries = conversations.slice(0, 20).map((c, i) => {
    const msgs = c.messages.map(m => `[${m.role}]: ${m.content.slice(0, 200)}`).join('\n');
    return `### Conversa ${i + 1} (${c.id.slice(0, 8)})
- Cliente: ${c.cliente_nome || 'Desconhecido'}
- Lead Score: ${c.lead_score ?? 'N/A'}
- Objeção: ${c.detected_objection || 'Nenhuma'}
- Escalação: ${c.escalation_reason || 'Não'}
- Human Fallback: ${c.needs_human_fallback ? 'SIM' : 'Não'}
- Mensagens (${c.total_messages}):
${msgs}`;
  }).join('\n\n');

  const systemPrompt = `Você é um analista de performance de agentes de IA especializados em vendas.
Sua tarefa é analisar conversas que falharam e propor melhorias concretas para o agente.

## CONTEXTO DO AGENTE (código fonte)
${codeContext.slice(0, 6000)}

## MÉTRICAS DO PERÍODO
${JSON.stringify(metrics, null, 2)}

## REGRAS DE ANÁLISE
1. Identifique PADRÕES recorrentes, não casos isolados
2. Proponha mudanças CONCRETAS e ACIONÁVEIS
3. Cada proposta deve ter evidência de múltiplas conversas
4. Considere o risco de cada mudança (prompt change = low, flow change = medium, guardrail = high)
5. Use as categorias: prompt, flow, guardrail, rule, fast_path, constitution
6. Máximo ${maxProposals} propostas, priorizadas por impacto

## OUTPUT FORMAT
Retorne um JSON array de propostas:
[{
  "category": "rule|prompt|flow|guardrail|fast_path|constitution",
  "title": "Título conciso",
  "problem_description": "Descrição do problema com evidências",
  "proposed_change": "Mudança concreta proposta",
  "expected_impact": "Impacto esperado",
  "risk_level": "low|medium|high",
  "confidence": 0.0-1.0,
  "conversation_ids": ["id1", "id2"]
}]`;

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Analise estas ${conversations.length} conversas que falharam e gere propostas de melhoria:\n\n${conversationSummaries}` },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LLM analysis failed: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('Empty LLM response');
  }

  try {
    const parsed = JSON.parse(content);
    const proposals = Array.isArray(parsed) ? parsed : (parsed.proposals || parsed.items || []);

    return proposals.slice(0, maxProposals).map((p: any) => ({
      category: p.category || 'rule',
      title: p.title || 'Untitled',
      problem_description: p.problem_description || '',
      evidence: {
        conversation_ids: p.conversation_ids || [],
        pattern_frequency: p.conversation_ids?.length || 1,
        metrics,
      },
      proposed_change: p.proposed_change || '',
      expected_impact: p.expected_impact || '',
      risk_level: p.risk_level || 'low',
      confidence: Math.min(1, Math.max(0, p.confidence || 0.5)),
    }));
  } catch (parseErr) {
    console.error('[self-analysis] Failed to parse LLM response:', content.slice(0, 500));
    throw new Error('Failed to parse LLM proposals');
  }
}

// ═══════════════════════════════════════════════════════════════
// SAVE PROPOSALS
// ═══════════════════════════════════════════════════════════════

async function saveProposals(
  supabase: any,
  proposals: ProposalDraft[],
  runId: string
): Promise<number> {
  let saved = 0;

  for (const proposal of proposals) {
    const { error } = await supabase
      .from('improvement_proposals')
      .insert({
        agent_id: 'sofia',
        category: proposal.category,
        title: proposal.title,
        problem_description: proposal.problem_description,
        evidence: proposal.evidence,
        proposed_change: proposal.proposed_change,
        expected_impact: proposal.expected_impact,
        risk_level: proposal.risk_level,
        confidence: proposal.confidence,
        source: 'self_analysis',
        run_id: runId,
      });

    if (!error) saved++;
    else console.error('[self-analysis] Failed to save proposal:', error.message);
  }

  return saved;
}

async function notifyAdmins(supabase: any, proposalCount: number, metrics: Record<string, any>): Promise<void> {
  const { data: admins } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('role', 'admin');

  if (!admins || admins.length === 0) return;

  const notifications = admins.map((admin: any) => ({
    admin_user_id: admin.user_id,
    title: `Self-Analysis: ${proposalCount} propostas de melhoria`,
    message: `A análise automática gerou ${proposalCount} propostas. Taxa de conversão: ${metrics.conversion_rate}%, Taxa de abandono: ${metrics.drop_rate}%. Revise em /self-improvement.`,
    type: 'info',
    entity_type: 'self_analysis',
  }));

  await supabase.from('admin_notifications').insert(notifications);
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════

async function runSelfAnalysis(supabase: any, config: AnalysisConfig): Promise<{
  success: boolean;
  proposals_generated: number;
  conversations_analyzed: number;
  metrics: Record<string, any>;
  duration_ms: number;
  errors: string[];
}> {
  const startTime = Date.now();
  const errors: string[] = [];
  const runId = `self_analysis_${Date.now()}`;

  try {
    // Step 1: Gather failed conversations
    console.log('[self-analysis] Step 1: Gathering failed conversations...');
    const conversations = await getFailedConversations(supabase, config);
    console.log(`[self-analysis] Found ${conversations.length} problematic conversations`);

    if (conversations.length === 0) {
      return {
        success: true,
        proposals_generated: 0,
        conversations_analyzed: 0,
        metrics: {},
        duration_ms: Date.now() - startTime,
        errors: ['No failed conversations found in period'],
      };
    }

    // Step 2: Get agent code context (self-awareness)
    console.log('[self-analysis] Step 2: Loading agent code context...');
    const codeContext = await getAgentCodeContext(supabase);

    // Step 3: Get conversion metrics
    console.log('[self-analysis] Step 3: Computing metrics...');
    const metrics = await getConversionMetrics(supabase, config.period_days);

    // Step 4: Generate improvement proposals via LLM
    console.log('[self-analysis] Step 4: Generating proposals via LLM...');
    const proposals = await generateProposals(conversations, codeContext, metrics, config.max_proposals);
    console.log(`[self-analysis] Generated ${proposals.length} proposals`);

    // Step 5: Save proposals
    console.log('[self-analysis] Step 5: Saving proposals...');
    const saved = await saveProposals(supabase, proposals, runId);

    // Step 6: Notify admins
    if (saved > 0) {
      await notifyAdmins(supabase, saved, metrics);
    }

    return {
      success: true,
      proposals_generated: saved,
      conversations_analyzed: conversations.length,
      metrics,
      duration_ms: Date.now() - startTime,
      errors,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(msg);
    return {
      success: false,
      proposals_generated: 0,
      conversations_analyzed: 0,
      metrics: {},
      duration_ms: Date.now() - startTime,
      errors,
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// HTTP HANDLER
// ═══════════════════════════════════════════════════════════════

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPrelight(req, { mode: 'strict' });
  }

  const corsHeaders = getStrictCorsHeaders(req);
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || 'analyze';

    switch (action) {
      case 'analyze': {
        const config: AnalysisConfig = {
          ...DEFAULT_CONFIG,
          period_days: body.period_days || DEFAULT_CONFIG.period_days,
          max_conversations: body.max_conversations || DEFAULT_CONFIG.max_conversations,
          max_proposals: body.max_proposals || DEFAULT_CONFIG.max_proposals,
        };

        const result = await runSelfAnalysis(supabase, config);
        return new Response(
          JSON.stringify(result),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'get_proposals': {
        const status = body.status || 'pending';
        const limit = body.limit || 50;

        const query = supabase
          .from('improvement_proposals')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(limit);

        if (status !== 'all') {
          query.eq('status', status);
        }

        const { data, error } = await query;

        return new Response(
          JSON.stringify({ success: true, proposals: data || [], error: error?.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'review_proposal': {
        const { proposal_id, decision, notes } = body;
        if (!proposal_id || !decision) {
          return new Response(
            JSON.stringify({ error: 'proposal_id and decision are required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const updateData: Record<string, any> = {
          status: decision, // 'approved' or 'rejected'
          reviewed_at: new Date().toISOString(),
          review_notes: notes || null,
        };

        // If approved and category is 'rule', auto-insert into rule_memory
        if (decision === 'approved') {
          const { data: proposal } = await supabase
            .from('improvement_proposals')
            .select('*')
            .eq('id', proposal_id)
            .single();

          if (proposal?.category === 'rule') {
            const { error: ruleError } = await supabase
              .from('rule_memory')
              .insert({
                agent_id: proposal.agent_id,
                rule_type: 'self_improvement',
                name: proposal.title,
                description: proposal.proposed_change,
                conditions: { source: 'self_analysis', proposal_id },
                actions: { apply: proposal.proposed_change },
                priority: 60,
                is_active: true,
                confidence: proposal.confidence,
                times_applied: 0,
                learning_source: 'self_analysis',
              });

            if (!ruleError) {
              updateData.status = 'applied';
              updateData.applied_at = new Date().toISOString();
            }
          }
        }

        const { error } = await supabase
          .from('improvement_proposals')
          .update(updateData)
          .eq('id', proposal_id);

        return new Response(
          JSON.stringify({ success: !error, error: error?.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('[self-analysis] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
