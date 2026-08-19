import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, jsonResponse, errorResponse } from "../_shared/security-helpers.ts";

interface PublicProposalRequest {
  action: "get" | "update_status" | "heartbeat";
  proposalId: string;
  status?: "aceita" | "recusada";
  viewId?: string;
  durationSeconds?: number;
}

Deno.serve(async (req) => {
  // CORS headers - public-proposal is in PUBLIC_WEBHOOK_ENDPOINTS (auto mode → permissive)
  const corsHeaders = getCorsHeaders(req);
  
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, proposalId, status, viewId, durationSeconds } = (await req.json()) as PublicProposalRequest;

    if (!proposalId) {
      return errorResponse("proposalId is required", 400, req);
    }

    // Validate UUID format to prevent injection
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(proposalId)) {
      console.error(`Invalid proposal ID format received: "${proposalId}" (type: ${typeof proposalId}, length: ${proposalId?.length})`);
      return errorResponse("Invalid proposal ID format", 400, req);
    }

    // Use service role to bypass RLS
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (action === "get") {
      // Fetch proposal with only the fields needed for public display
      // Exclude sensitive internal fields
      const { data, error } = await supabaseAdmin
        .from("propostas_assinantes")
        .select(`
          id,
          cliente_nome,
          cliente_email,
          cliente_telefone,
          cliente_cidade,
          cliente_uf,
          cliente_cpf_cnpj,
          cliente_endereco,
          cliente_cep,
          consumo_medio,
          valor_conta_original,
          tarifa,
          cip,
          desconto_percentual,
          fidelidade_anos,
          economia_mensal,
          economia_anual,
          economia_acumulada,
          status,
          created_at,
          responsavel_comercial,
          concessionaria,
          tipo_instalacao,
          numero_instalacao,
          numero_ucs,
          bitrix24_lead_id,
          dados_inferidos,
          tipo_proposta,
          tipo_proposta_sub,
          nome_concorrente,
          desconto_concorrente,
          multa_rescisoria,
          meses_restantes_concorrente,
          payback_multa_meses,
          economia_adicional_mensal
        `)
        .eq("id", proposalId)
        .single();

      if (error) {
        console.error("Error fetching proposal:", error);
        return errorResponse("Proposal not found", 404, req);
      }

      // Track proposal view with IP and user-agent
      const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() 
        || req.headers.get("cf-connecting-ip") 
        || "unknown";
      const userAgent = req.headers.get("user-agent") || "unknown";
      
      // Create fingerprint for unique visitor counting
      const encoder = new TextEncoder();
      const fingerprintData = encoder.encode(`${ipAddress}|${userAgent}`);
      const hashBuffer = await crypto.subtle.digest("SHA-256", fingerprintData);
      const fingerprint = Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");

      // Insert view record and audit log in parallel
      const viewId = crypto.randomUUID();
      await Promise.all([
        supabaseAdmin.from("proposal_views").insert({
          id: viewId,
          proposal_id: proposalId,
          ip_address: ipAddress,
          user_agent: userAgent.substring(0, 500),
          fingerprint,
        }),
        supabaseAdmin.from("activity_logs").insert({
          action: "public_view",
          entity_type: "proposta",
          entity_id: proposalId,
          entity_name: data.cliente_nome,
          details: { 
            type: "public_proposal_access",
            status: data.status 
          },
        }),
      ]);

      // Sync view stats to Bitrix24 if lead is linked
      if (data.bitrix24_lead_id) {
        try {
          // Count total views and unique devices for this proposal
          const [totalResult, uniqueResult] = await Promise.all([
            supabaseAdmin
              .from("proposal_views")
              .select("id", { count: "exact", head: true })
              .eq("proposal_id", proposalId),
            supabaseAdmin
              .rpc("count_unique_fingerprints", { p_proposal_id: proposalId }),
          ]);

          const totalViews = totalResult.count ?? 0;
          const uniqueDevices = typeof uniqueResult.data === "number" ? uniqueResult.data : 0;

          // Get Bitrix24 webhook URL
          const { data: configData } = await supabaseAdmin
            .from("configuracoes_sistema")
            .select("valor")
            .eq("chave", "bitrix24_webhook_url")
            .single();

          if (configData?.valor) {
            const bitrixUrl = configData.valor;
            await fetch(`${bitrixUrl}/crm.lead.update`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                id: data.bitrix24_lead_id,
                fields: {
                  UF_CRM_1774973302: String(totalViews),
                  UF_CRM_1774973337: String(uniqueDevices),
                },
              }),
            });
            console.log(`[BITRIX_SYNC] Updated lead ${data.bitrix24_lead_id} with views: ${totalViews} total, ${uniqueDevices} unique`);
          }
        } catch (bitrixErr) {
          console.error("[BITRIX_SYNC] Error syncing view stats:", bitrixErr);
          // Non-blocking: don't fail the request if Bitrix sync fails
        }
      }

      return jsonResponse({ proposal: data, viewId }, 200, req);
    }

    if (action === "heartbeat") {
      if (!viewId || typeof durationSeconds !== "number" || durationSeconds < 0 || durationSeconds > 86400) {
        return errorResponse("Invalid heartbeat data", 400, req);
      }

      // Update duration on the view record
      const { error: hbError } = await supabaseAdmin
        .from("proposal_views")
        .update({ duration_seconds: durationSeconds })
        .eq("id", viewId)
        .eq("proposal_id", proposalId);

      if (hbError) {
        console.error("Heartbeat update error:", hbError);
        return errorResponse("Failed to update duration", 500, req);
      }

      // Sync total duration to Bitrix24 on every heartbeat with meaningful time
      if (durationSeconds >= 5) {
        try {
          const { data: propostaData } = await supabaseAdmin
            .from("propostas_assinantes")
            .select("bitrix24_lead_id")
            .eq("id", proposalId)
            .single();

          if (propostaData?.bitrix24_lead_id) {
            // Sum total duration across all views for this proposal
            const { data: durationData } = await supabaseAdmin
              .rpc("sum_proposal_view_duration", { p_proposal_id: proposalId });

            const totalSeconds = typeof durationData === "number" ? durationData : 0;
            const minutes = Math.floor(totalSeconds / 60);
            const secs = totalSeconds % 60;
            const formatted = `${minutes}min ${secs}s`;

            const { data: configData } = await supabaseAdmin
              .from("configuracoes_sistema")
              .select("valor")
              .eq("chave", "bitrix24_webhook_url")
              .single();

            if (configData?.valor) {
              await fetch(`${configData.valor}/crm.lead.update`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  id: propostaData.bitrix24_lead_id,
                  fields: {
                    UF_CRM_1774979287: formatted,
                  },
                }),
              });
              console.log(`[BITRIX_SYNC] Duration updated: ${formatted} for lead ${propostaData.bitrix24_lead_id}`);
            }
          }
        } catch (err) {
          console.error("[BITRIX_SYNC] Duration sync error:", err);
        }
      }

      return jsonResponse({ success: true }, 200, req);
    }

    if (action === "update_status") {
      // Only allow status updates to 'aceita' or 'recusada'
      if (!status || !["aceita", "recusada"].includes(status)) {
        return errorResponse("Invalid status. Must be 'aceita' or 'recusada'", 400, req);
      }

      // First fetch current status to prevent double updates
      const { data: currentProposal, error: fetchError } = await supabaseAdmin
        .from("propostas_assinantes")
        .select("id, status, cliente_nome")
        .eq("id", proposalId)
        .single();

      if (fetchError || !currentProposal) {
        return errorResponse("Proposal not found", 404, req);
      }

      // Prevent updates if already accepted or refused
      if (["aceita", "recusada"].includes(currentProposal.status)) {
        return jsonResponse({ 
          error: "Proposal already finalized",
          currentStatus: currentProposal.status 
        }, 409, req);
      }

      // Update only the status field
      const { error: updateError } = await supabaseAdmin
        .from("propostas_assinantes")
        .update({ status })
        .eq("id", proposalId);

      if (updateError) {
        console.error("Error updating proposal status:", updateError);
        return errorResponse("Failed to update proposal", 500, req);
      }

      // Log the status change
      await supabaseAdmin.from("activity_logs").insert({
        action: status === "aceita" ? "proposal_accepted" : "proposal_refused",
        entity_type: "proposta",
        entity_id: proposalId,
        entity_name: currentProposal.cliente_nome,
        details: { 
          type: "public_status_update",
          previous_status: currentProposal.status,
          new_status: status 
        },
      });

      return jsonResponse({ success: true, status }, 200, req);
    }

    return errorResponse("Invalid action", 400, req);
  } catch (error) {
    console.error("Error in public-proposal function:", error);
    return errorResponse("Internal server error", 500, req);
  }
});
