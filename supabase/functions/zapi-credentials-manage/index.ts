import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, jsonResponse, errorResponse } from "../_shared/security-helpers.ts";

interface CredentialsRequest {
  action: "get" | "save";
  agentId: string;
  credentials?: {
    zapi_instance_id: string | null;
    zapi_token: string | null;
    zapi_security_token: string | null;
  };
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return errorResponse("Missing authorization", 401, req);
    }

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return errorResponse("Unauthorized", 401, req);
    }

    // Check admin role
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .single();

    if (!roleData) {
      return errorResponse("Admin access required", 403, req);
    }

    const { action, agentId, credentials } = (await req.json()) as CredentialsRequest;

    if (!agentId || typeof agentId !== "string") {
      return errorResponse("agentId is required", 400, req);
    }

    if (action === "get") {
      const { data, error } = await supabaseAdmin
        .from("ai_agents")
        .select("zapi_instance_id, zapi_token, zapi_security_token")
        .eq("agent_id", agentId)
        .single();

      if (error) {
        return errorResponse("Agent not found", 404, req);
      }

      return jsonResponse({ credentials: data }, 200, req);
    }

    if (action === "save") {
      if (!credentials) {
        return errorResponse("credentials object is required", 400, req);
      }

      const { error } = await supabaseAdmin
        .from("ai_agents")
        .update({
          zapi_instance_id: credentials.zapi_instance_id || null,
          zapi_token: credentials.zapi_token || null,
          zapi_security_token: credentials.zapi_security_token || null,
          updated_at: new Date().toISOString(),
        })
        .eq("agent_id", agentId);

      if (error) {
        console.error("Error saving credentials:", error);
        return errorResponse("Failed to save credentials", 500, req);
      }

      return jsonResponse({ success: true }, 200, req);
    }

    return errorResponse("Invalid action", 400, req);
  } catch (error) {
    console.error("Error in zapi-credentials-manage:", error);
    return errorResponse("Internal server error", 500, req);
  }
});
