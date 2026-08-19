import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getStrictCorsHeaders, handleCorsPrelight } from '../_shared/security-helpers.ts';

Deno.serve(async (req) => {
  const corsHeaders = getStrictCorsHeaders(req);
  
  if (req.method === 'OPTIONS') {
    return handleCorsPrelight(req, { mode: 'strict' });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const url = new URL(req.url);
    const minScore = parseInt(url.searchParams.get('min_score') || '70');
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const chunkType = url.searchParams.get('chunk_type'); // e.g., 'tratamento_objecao', 'qualificacao_exemplo'
    const outcome = url.searchParams.get('outcome'); // e.g., 'conversao'

    let query = supabase
      .from('rag_chunks')
      .select(`
        id,
        content,
        chunk_index,
        metadata,
        document_id,
        rag_documents!inner (
          file_name,
          category,
          source_path
        )
      `)
      .eq('rag_documents.category', 'scripts');

    // Filter by quality_score using JSONB
    // Note: We'll filter in JS since Supabase doesn't support direct JSONB numeric comparison easily
    const { data: allChunks, error } = await query.limit(500);

    if (error) throw error;

    // Filter chunks with quality_score > minScore
    let premiumChunks = (allChunks || []).filter((chunk: any) => {
      const score = chunk.metadata?.quality_score;
      if (typeof score !== 'number') return false;
      if (score < minScore) return false;
      
      // Optional filters
      if (chunkType && chunk.metadata?.chunk_type !== chunkType) return false;
      if (outcome && chunk.metadata?.outcome !== outcome) return false;
      
      return true;
    });

    // Sort by quality_score descending
    premiumChunks.sort((a: any, b: any) => 
      (b.metadata?.quality_score || 0) - (a.metadata?.quality_score || 0)
    );

    // Apply limit
    premiumChunks = premiumChunks.slice(0, limit);

    // Format response
    const formattedChunks = premiumChunks.map((chunk: any) => ({
      id: chunk.id,
      content: chunk.content,
      chunk_index: chunk.chunk_index,
      file_name: chunk.rag_documents?.file_name,
      source_path: chunk.rag_documents?.source_path,
      quality_score: chunk.metadata?.quality_score,
      chunk_type: chunk.metadata?.chunk_type,
      outcome: chunk.metadata?.outcome,
      objections_handled: chunk.metadata?.objections_handled || [],
      stages_passed: chunk.metadata?.stages_passed || [],
      message_count: chunk.metadata?.message_count
    }));

    // Generate summary stats
    const stats = {
      total_premium_chunks: formattedChunks.length,
      avg_quality_score: formattedChunks.length > 0 
        ? Math.round(formattedChunks.reduce((sum: number, c: any) => sum + c.quality_score, 0) / formattedChunks.length)
        : 0,
      chunk_types: [...new Set(formattedChunks.map((c: any) => c.chunk_type).filter(Boolean))],
      outcomes: [...new Set(formattedChunks.map((c: any) => c.outcome).filter(Boolean))],
      all_objections: [...new Set(formattedChunks.flatMap((c: any) => c.objections_handled))]
    };

    return new Response(
      JSON.stringify({ 
        success: true, 
        stats,
        chunks: formattedChunks 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error: unknown) {
    console.error('Error fetching premium scripts:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
