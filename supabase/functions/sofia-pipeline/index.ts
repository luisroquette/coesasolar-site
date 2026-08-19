/**
 * SOFIA PIPELINE 2.0 - EDGE FUNCTION ENTRY POINT
 * 
 * Esta função serve como entry point para o novo pipeline.
 * Durante a fase de transição, ela pode ser chamada diretamente
 * ou redirecionada pelo sofia-webhook quando pipeline_v2_enabled=true.
 * 
 * Fase 0: Apenas loga e faz fallback para o webhook antigo
 */

import { executePipeline, shouldUsePipelineV2 } from "../_shared/pipeline/index.ts";
import { getStrictCorsHeaders, handleCorsPrelight } from '../_shared/security-helpers.ts';

Deno.serve(async (req) => {
  const corsHeaders = getStrictCorsHeaders(req);
  
  // CORS preflight
  if (req.method === "OPTIONS") {
    return handleCorsPrelight(req, { mode: 'strict' });
  }

  const startTime = Date.now();
  
  try {
    const body = await req.json();
    
    // Extrair dados do payload (compatível com Z-API)
    const phone = body.phone || body.from || "";
    const messageId = body.messageId || body.ids?.at(0)?.serialized || crypto.randomUUID();
    const content = body.text?.message || body.text || body.message || "";
    const mediaType = body.type || "text";
    const conversaId = body.conversaId; // Opcional, pode ser resolvido internamente
    
    console.log(`[sofia-pipeline] Received message from ${phone}: ${content.substring(0, 50)}...`);
    
    // Verificar se pipeline está habilitado para este telefone
    const shouldUsePipeline = await shouldUsePipelineV2(phone);
    
    if (!shouldUsePipeline) {
      console.log(`[sofia-pipeline] Pipeline v2 not enabled for ${phone}, returning fallback signal`);
      
      return new Response(JSON.stringify({
        success: false,
        usePipelineV2: false,
        fallbackToLegacy: true,
        reason: "pipeline_not_enabled_for_phone"
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    
    // Executar pipeline
    console.log(`[sofia-pipeline] Executing Pipeline v2 for ${phone}`);
    
    const result = await executePipeline(
      conversaId || "",
      messageId,
      phone,
      content,
      mediaType,
      { originalPayload: body }
    );
    
    const duration = Date.now() - startTime;
    console.log(`[sofia-pipeline] Completed in ${duration}ms, success: ${result.success}`);
    
    // Se pipeline falhou, sinalizar fallback
    if (result.shouldFallbackToLegacy) {
      console.log(`[sofia-pipeline] Signaling fallback: ${result.fallbackReason}`);
      
      return new Response(JSON.stringify({
        success: false,
        usePipelineV2: true,
        fallbackToLegacy: true,
        reason: result.fallbackReason,
        executionId: result.executionLog?.id
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    
    // Pipeline executou com sucesso
    return new Response(JSON.stringify({
      success: true,
      usePipelineV2: true,
      fallbackToLegacy: false,
      messageSent: result.messageSent,
      messageId: result.messageId,
      executionId: result.executionLog?.id,
      duration
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
    
  } catch (error) {
    console.error("[sofia-pipeline] Fatal error:", error);
    
    return new Response(JSON.stringify({
      success: false,
      usePipelineV2: true,
      fallbackToLegacy: true,
      reason: `Fatal error: ${error instanceof Error ? error.message : String(error)}`
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
