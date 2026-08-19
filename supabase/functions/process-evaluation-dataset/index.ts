import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const severityMap: Record<string, string> = {
  critica: "critical",
  alta: "error",
  media: "warning",
  baixa: "info",
};

const priorityMap: Record<string, number> = {
  critica: 90,
  alta: 80,
  media: 70,
  baixa: 60,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch pending records
    const { data: pending, error: fetchErr } = await supabase
      .from("evaluation_dataset")
      .select("*")
      .eq("status", "pendente");

    if (fetchErr) throw fetchErr;
    if (!pending || pending.length === 0) {
      return new Response(
        JSON.stringify({
          status: "success",
          report: { total_processed: 0, few_shot_created: 0, guardrails_created: 0, code_fix_needed: 0, errors: 0, details: [] },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const report = {
      total_processed: pending.length,
      few_shot_created: 0,
      guardrails_created: 0,
      code_fix_needed: 0,
      errors: 0,
      details: [] as Record<string, unknown>[],
    };

    for (const record of pending) {
      try {
        const cat = record.categoria;

        if (cat === "compreensao" || cat === "tom") {
          const { data: inserted, error } = await supabase
            .from("few_shot_examples")
            .insert({
              agent_id: "sofia",
              context: record.contexto,
              input: record.mensagem_lead,
              expected_output: record.resposta_esperada,
              quality_score: 90,
              is_active: true,
              is_approved: true,
              metadata: {
                source: "evaluation_dataset",
                evaluation_id: record.id,
                categoria: cat,
                severidade: record.severidade,
              },
            })
            .select("id")
            .single();

          if (error) throw error;

          await supabase
            .from("evaluation_dataset")
            .update({
              status: "corrigido",
              correcao_aplicada: `Few-shot example criado (${inserted.id})`,
              updated_at: new Date().toISOString(),
            })
            .eq("id", record.id);

          report.few_shot_created++;
          report.details.push({ id: record.id, categoria: cat, action: "few_shot_created", target_id: inserted.id });

        } else if (cat === "informacao" || cat === "alucinacao") {
          const { data: inserted, error } = await supabase
            .from("business_rules_guardrails")
            .insert({
              rule_code: `eval_fix_${record.id}`,
              rule_name: (record.problema || "").substring(0, 100),
              description: record.problema,
              enforcement_point: "post_llm",
              severity: severityMap[record.severidade] || "medium",
              action_type: "replace",
              replacement_template: record.resposta_esperada,
              priority: priorityMap[record.severidade] || 70,
              is_active: true,
            })
            .select("id")
            .single();

          if (error) throw error;

          await supabase
            .from("evaluation_dataset")
            .update({
              status: "corrigido",
              correcao_aplicada: `Guardrail criado (${inserted.id})`,
              updated_at: new Date().toISOString(),
            })
            .eq("id", record.id);

          report.guardrails_created++;
          report.details.push({ id: record.id, categoria: cat, action: "guardrail_created", target_id: inserted.id });

        } else {
          // fluxo, raciocinio, prioridade → manual
          await supabase
            .from("evaluation_dataset")
            .update({
              correcao_aplicada: "Requer alteracao no codigo - fix manual necessario",
              updated_at: new Date().toISOString(),
            })
            .eq("id", record.id);

          report.code_fix_needed++;
          report.details.push({ id: record.id, categoria: cat, action: "code_fix_needed", reason: "Requer alteracao no codigo" });
        }
      } catch (e) {
        report.errors++;
        const errMsg = e && typeof e === 'object' && 'message' in e ? (e as any).message : JSON.stringify(e);
        report.details.push({ id: record.id, categoria: record.categoria, action: "error", reason: errMsg });
      }
    }

    return new Response(
      JSON.stringify({ status: "success", report }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ status: "error", error: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
