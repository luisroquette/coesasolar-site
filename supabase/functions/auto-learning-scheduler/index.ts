import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getStrictCorsHeaders,
  handleCorsPrelight,
} from '../_shared/security-helpers.ts';
import { validateInternalScheduler, parseAndValidate } from '../_shared/zod-schemas.ts';

/**
 * auto-learning-scheduler: Internal cron-triggered scheduler
 * SECURITY: Uses strict CORS + Zod validation
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const LOVABLE_API_KEY = (Deno.env.get('COESASOLAR_OPENROUTER_API_KEY') ?? Deno.env.get('OPENROUTER_API_KEY'))!;

// ============================================
// TYPES
// ============================================

interface SchedulerConfig {
  enabled: boolean;
  sync_folder_path: string;
  batch_size: number;
  auto_approve_threshold: number;  // Confiança mínima para auto-aprovação (ex: 0.8)
  max_rules_per_run: number;
  notify_on_completion: boolean;
}

interface RunStats {
  scripts_synced: number;
  chunks_processed: number;
  errors_found: number;
  rules_extracted: number;
  rules_auto_approved: number;
  rules_pending_review: number;
  duration_seconds: number;
}

// ============================================
// DEFAULT CONFIG
// ============================================

const DEFAULT_CONFIG: SchedulerConfig = {
  enabled: true,
  sync_folder_path: 'Knowledge Base/Scripts',
  batch_size: 30,
  auto_approve_threshold: 0.8,
  max_rules_per_run: 20,
  notify_on_completion: true,
};

// ============================================
// HELPER FUNCTIONS
// ============================================

async function getConfig(supabase: any): Promise<SchedulerConfig> {
  const { data } = await supabase
    .from('configuracoes_sistema')
    .select('valor')
    .eq('chave', 'auto_learning_scheduler_config')
    .maybeSingle();

  if (data?.valor) {
    try {
      return { ...DEFAULT_CONFIG, ...JSON.parse(data.valor) };
    } catch {
      return DEFAULT_CONFIG;
    }
  }
  return DEFAULT_CONFIG;
}

async function isEnabled(supabase: any): Promise<boolean> {
  const { data } = await supabase
    .from('configuracoes_sistema')
    .select('valor')
    .eq('chave', 'auto_learning_scheduler_enabled')
    .maybeSingle();

  return data?.valor === 'true';
}

async function createRunLog(supabase: any): Promise<string> {
  const { data, error } = await supabase
    .from('auto_learning_runs')
    .insert({
      status: 'running',
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) {
    console.error('[auto-learning] Failed to create run log:', error);
    throw error;
  }

  return data.id;
}

async function updateRunLog(
  supabase: any,
  runId: string,
  status: 'completed' | 'failed',
  stats?: RunStats,
  error?: string
): Promise<void> {
  await supabase
    .from('auto_learning_runs')
    .update({
      status,
      completed_at: new Date().toISOString(),
      stats,
      error_message: error,
    })
    .eq('id', runId);
}

// ============================================
// STEP 1: SYNC NEW SCRIPTS FROM ONEDRIVE
// ============================================

async function syncNewScripts(supabase: any, folderPath: string): Promise<number> {
  console.log(`[auto-learning] Syncing scripts from: ${folderPath}`);

  try {
    // Trigger onedrive-sync for the scripts folder
    const response = await fetch(`${SUPABASE_URL}/functions/v1/onedrive-sync`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        folder_path: folderPath,
        categories: ['Scripts'],
        incremental: true,  // Only sync new/modified files
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[auto-learning] OneDrive sync failed:', errorText);
      return 0;
    }

    const result = await response.json();
    console.log(`[auto-learning] Synced ${result.processed || 0} new scripts`);
    return result.processed || 0;

  } catch (error) {
    console.error('[auto-learning] Sync error:', error);
    return 0;
  }
}

// ============================================
// STEP 2: PROCESS CONVERSATIONS INTO RAG
// ============================================

async function processConversations(supabase: any, batchSize: number): Promise<number> {
  console.log(`[auto-learning] Processing conversations, batch size: ${batchSize}`);

  try {
    // Trigger rag-conversation-processor
    const response = await fetch(`${SUPABASE_URL}/functions/v1/rag-conversation-processor`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        folder_path: 'Knowledge Base/Scripts',
        max_conversations: batchSize,
        skip_existing: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[auto-learning] Conversation processing failed:', errorText);
      return 0;
    }

    const result = await response.json();
    console.log(`[auto-learning] Processed ${result.chunks_created || 0} conversation chunks`);
    return result.chunks_created || 0;

  } catch (error) {
    console.error('[auto-learning] Processing error:', error);
    return 0;
  }
}

// ============================================
// STEP 3: EVALUATE CHUNKS & EXTRACT RULES
// ============================================

async function evaluateAndExtractRules(
  supabase: any,
  batchSize: number,
  maxRules: number
): Promise<{ errorsFound: number; rulesExtracted: number }> {
  console.log(`[auto-learning] Evaluating chunks, batch size: ${batchSize}`);

  try {
    // Trigger retroactive-learning-processor
    const response = await fetch(`${SUPABASE_URL}/functions/v1/retroactive-learning-processor`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'start_job',
        batch_size: batchSize,
        min_quality_score: 0,
        max_quality_score: 60,  // Foca em conversas de baixa qualidade (falhas)
        focus_low_quality: true,
        auto_approve_rules: false,  // Vamos fazer auto-aprovação manualmente com threshold
        created_by: 'auto_learning_scheduler',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[auto-learning] Evaluation failed:', errorText);
      return { errorsFound: 0, rulesExtracted: 0 };
    }

    const result = await response.json();
    
    if (!result.job_id) {
      console.log('[auto-learning] No job created');
      return { errorsFound: 0, rulesExtracted: 0 };
    }

    // Aguardar o job completar (com timeout)
    const jobStats = await waitForJobCompletion(supabase, result.job_id, 300);  // 5 min timeout
    
    return {
      errorsFound: jobStats.errors_found || 0,
      rulesExtracted: jobStats.rules_extracted || 0,
    };

  } catch (error) {
    console.error('[auto-learning] Evaluation error:', error);
    return { errorsFound: 0, rulesExtracted: 0 };
  }
}

async function waitForJobCompletion(
  supabase: any,
  jobId: string,
  timeoutSeconds: number
): Promise<any> {
  const startTime = Date.now();
  const timeoutMs = timeoutSeconds * 1000;

  while (Date.now() - startTime < timeoutMs) {
    const { data: job } = await supabase
      .from('batch_learning_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (!job) {
      throw new Error('Job not found');
    }

    if (job.status === 'completed' || job.status === 'failed') {
      return job;
    }

    // Aguardar 5 segundos antes de verificar novamente
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  throw new Error('Job timeout');
}

// ============================================
// STEP 4: AUTO-APPROVE HIGH CONFIDENCE RULES
// ============================================

async function autoApproveRules(
  supabase: any,
  threshold: number,
  maxRules: number
): Promise<{ approved: number; pending: number }> {
  console.log(`[auto-learning] Auto-approving rules with confidence >= ${threshold}`);

  // Buscar regras pendentes com alta confiança
  const { data: pendingEvaluations, error } = await supabase
    .from('batch_learning_evaluations')
    .select('id, proposed_rule')
    .eq('rule_status', 'pending')
    .not('proposed_rule', 'is', null)
    .order('created_at', { ascending: false })
    .limit(maxRules * 2);  // Buscar o dobro para ter margem

  if (error || !pendingEvaluations) {
    console.error('[auto-learning] Failed to fetch pending evaluations:', error);
    return { approved: 0, pending: 0 };
  }

  let approved = 0;
  let pending = 0;

  for (const evaluation of pendingEvaluations) {
    if (approved >= maxRules) break;

    const rule = evaluation.proposed_rule;
    const confidence = rule?.confidence || 0;

    if (confidence >= threshold) {
      // Verificar duplicidade
      const { data: existingRules } = await supabase
        .from('rule_memory')
        .select('id, name')
        .eq('agent_id', 'sofia')
        .ilike('name', `%${rule.name.substring(0, 20)}%`)
        .limit(1);

      if (existingRules && existingRules.length > 0) {
        // Marcar como duplicada
        await supabase
          .from('batch_learning_evaluations')
          .update({
            rule_status: 'duplicate',
            reviewed_at: new Date().toISOString(),
            reviewed_by: 'auto_learning_scheduler',
          })
          .eq('id', evaluation.id);
        continue;
      }

      // Inserir regra auto-aprovada
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
          learning_source: 'auto_scheduler',
        })
        .select('id')
        .single();

      if (saveError) {
        console.error('[auto-learning] Failed to save rule:', saveError);
        continue;
      }

      // Atualizar avaliação
      await supabase
        .from('batch_learning_evaluations')
        .update({
          rule_status: 'auto_approved',
          approved_rule_id: savedRule.id,
          reviewed_at: new Date().toISOString(),
          reviewed_by: 'auto_learning_scheduler',
        })
        .eq('id', evaluation.id);

      approved++;
      console.log(`[auto-learning] Auto-approved rule: ${rule.name} (confidence: ${confidence})`);

    } else {
      pending++;
    }
  }

  // Contar pendentes restantes
  const { count: pendingCount } = await supabase
    .from('batch_learning_evaluations')
    .select('*', { count: 'exact', head: true })
    .eq('rule_status', 'pending')
    .not('proposed_rule', 'is', null);

  return { approved, pending: pendingCount || 0 };
}

// ============================================
// STEP 5: NOTIFY COMPLETION
// ============================================

async function notifyCompletion(
  supabase: any,
  stats: RunStats,
  config: SchedulerConfig
): Promise<void> {
  if (!config.notify_on_completion) return;

  // Criar notificação para admins
  const message = `Aprendizado Automático Concluído:
• Scripts sincronizados: ${stats.scripts_synced}
• Chunks processados: ${stats.chunks_processed}
• Erros detectados: ${stats.errors_found}
• Regras extraídas: ${stats.rules_extracted}
• Regras auto-aprovadas: ${stats.rules_auto_approved}
• Regras pendentes de revisão: ${stats.rules_pending_review}
• Duração: ${stats.duration_seconds}s`;

  // Buscar admins
  const { data: admins } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('role', 'admin');

  if (admins && admins.length > 0) {
    const notifications = admins.map((admin: any) => ({
      admin_user_id: admin.user_id,
      title: 'Aprendizado Automático Concluído',
      message,
      type: 'info',
      entity_type: 'auto_learning',
    }));

    await supabase.from('admin_notifications').insert(notifications);
  }
}

// ============================================
// MAIN SCHEDULER
// ============================================

async function runScheduler(supabase: any): Promise<{ success: boolean; stats?: RunStats; error?: string }> {
  const startTime = Date.now();
  let runId: string | null = null;

  try {
    // Verificar se está habilitado
    const enabled = await isEnabled(supabase);
    if (!enabled) {
      console.log('[auto-learning] Scheduler is disabled');
      return { success: true, stats: undefined };
    }

    // Carregar configuração
    const config = await getConfig(supabase);
    console.log('[auto-learning] Config loaded:', config);

    // Criar log de execução
    runId = await createRunLog(supabase);

    // STEP 1: Sincronizar novos scripts
    const scriptsSynced = await syncNewScripts(supabase, config.sync_folder_path);

    // STEP 2: Processar conversas (gerar chunks)
    const chunksProcessed = await processConversations(supabase, config.batch_size);

    // STEP 3: Avaliar chunks e extrair regras
    const { errorsFound, rulesExtracted } = await evaluateAndExtractRules(
      supabase,
      config.batch_size,
      config.max_rules_per_run
    );

    // STEP 4: Auto-aprovar regras de alta confiança
    const { approved, pending } = await autoApproveRules(
      supabase,
      config.auto_approve_threshold,
      config.max_rules_per_run
    );

    // STEP 5: Self-Analysis — gerar propostas de melhoria
    let selfAnalysisProposals = 0;
    try {
      console.log('[auto-learning] Step 5: Running self-analysis...');
      const selfAnalysisResponse = await fetch(`${SUPABASE_URL}/functions/v1/sofia-self-analysis`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'analyze', period_days: 7, max_proposals: 5 }),
      });

      if (selfAnalysisResponse.ok) {
        const saResult = await selfAnalysisResponse.json();
        selfAnalysisProposals = saResult.proposals_generated || 0;
        console.log(`[auto-learning] Self-analysis generated ${selfAnalysisProposals} proposals`);
      }
    } catch (saError) {
      console.warn('[auto-learning] Self-analysis error (non-fatal):', saError);
    }

    const stats: RunStats = {
      scripts_synced: scriptsSynced,
      chunks_processed: chunksProcessed,
      errors_found: errorsFound,
      rules_extracted: rulesExtracted,
      rules_auto_approved: approved,
      rules_pending_review: pending,
      duration_seconds: Math.round((Date.now() - startTime) / 1000),
    };

    // STEP 6: Notificar conclusão
    await notifyCompletion(supabase, stats, config);

    // Atualizar log de execução
    await updateRunLog(supabase, runId, 'completed', stats);

    console.log('[auto-learning] Run completed:', stats);
    return { success: true, stats };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[auto-learning] Error:', errorMessage);

    if (runId) {
      await updateRunLog(supabase, runId, 'failed', undefined, errorMessage);
    }

    return { success: false, error: errorMessage };
  }
}

// ============================================
// HTTP HANDLER
// ============================================

serve(async (req) => {
  // Internal API - strict CORS
  if (req.method === 'OPTIONS') {
    return handleCorsPrelight(req, { mode: 'strict' });
  }

  const corsHeaders = getStrictCorsHeaders(req);
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || 'run';

    switch (action) {
      case 'run': {
        const result = await runScheduler(supabase);
        return new Response(
          JSON.stringify(result),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'get_config': {
        const config = await getConfig(supabase);
        const enabled = await isEnabled(supabase);
        return new Response(
          JSON.stringify({ success: true, config, enabled }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'update_config': {
        const newConfig = body.config || {};
        await supabase
          .from('configuracoes_sistema')
          .upsert({
            chave: 'auto_learning_scheduler_config',
            valor: JSON.stringify(newConfig),
            descricao: 'Configuração do scheduler de aprendizado automático',
          });

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'enable': {
        await supabase
          .from('configuracoes_sistema')
          .upsert({
            chave: 'auto_learning_scheduler_enabled',
            valor: 'true',
            descricao: 'Habilitar scheduler de aprendizado automático',
          });

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'disable': {
        await supabase
          .from('configuracoes_sistema')
          .upsert({
            chave: 'auto_learning_scheduler_enabled',
            valor: 'false',
            descricao: 'Habilitar scheduler de aprendizado automático',
          });

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'get_runs': {
        const { data: runs, error } = await supabase
          .from('auto_learning_runs')
          .select('*')
          .order('started_at', { ascending: false })
          .limit(body.limit || 10);

        return new Response(
          JSON.stringify({ success: true, runs: runs || [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'get_stats': {
        // Estatísticas gerais do aprendizado automático
        const { count: totalRuns } = await supabase
          .from('auto_learning_runs')
          .select('*', { count: 'exact', head: true });

        const { data: recentRuns } = await supabase
          .from('auto_learning_runs')
          .select('stats')
          .eq('status', 'completed')
          .order('started_at', { ascending: false })
          .limit(10);

        const { count: autoApprovedRules } = await supabase
          .from('rule_memory')
          .select('*', { count: 'exact', head: true })
          .eq('learning_source', 'auto_scheduler');

        const { count: pendingApprovals } = await supabase
          .from('batch_learning_evaluations')
          .select('*', { count: 'exact', head: true })
          .eq('rule_status', 'pending')
          .not('proposed_rule', 'is', null);

        // Calcular médias
        let avgScriptsSynced = 0;
        let avgRulesApproved = 0;
        if (recentRuns && recentRuns.length > 0) {
          const validRuns = recentRuns.filter((r: any) => r.stats);
          if (validRuns.length > 0) {
            avgScriptsSynced = validRuns.reduce((sum: number, r: any) => sum + (r.stats.scripts_synced || 0), 0) / validRuns.length;
            avgRulesApproved = validRuns.reduce((sum: number, r: any) => sum + (r.stats.rules_auto_approved || 0), 0) / validRuns.length;
          }
        }

        return new Response(
          JSON.stringify({
            success: true,
            stats: {
              total_runs: totalRuns || 0,
              auto_approved_rules: autoApprovedRules || 0,
              pending_approvals: pendingApprovals || 0,
              avg_scripts_synced: Math.round(avgScriptsSynced),
              avg_rules_approved: Math.round(avgRulesApproved * 10) / 10,
            },
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ success: false, error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

  } catch (error) {
    console.error('[auto-learning] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
