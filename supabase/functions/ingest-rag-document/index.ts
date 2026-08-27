import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const OPENAI_API_KEY = (Deno.env.get('COESA_PROPOSTAS_OPENROUTER_API_KEY'))!;

interface ChunkInput {
  content: string;
  metadata: {
    chunk_type?: string;
    topic?: string;
    funnel_stage?: string;
    quality_score?: number;
    source?: string;
    version?: string;
    [key: string]: unknown;
  };
}

interface IngestPayload {
  title?: string;
  category: string;
  subcategory?: string;
  file_name: string;
  source_path?: string;
  document_id?: string; // optional: append to existing document
  chunks: ChunkInput[];
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'openai/text-embedding-3-small',
      input: text,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Embedding API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  return data.data?.[0]?.embedding;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: IngestPayload = await req.json();
    const { category, subcategory, file_name, source_path, chunks, document_id } = body;

    if (!category || !file_name || !chunks?.length) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: category, file_name, chunks' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[ingest-rag-document] Ingesting ${chunks.length} chunks for "${file_name}"`);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    let docId = document_id;

    // Create or reuse document
    if (!docId) {
      const { data: newDoc, error: insertErr } = await supabase
        .from('rag_documents')
        .insert({
          file_name,
          file_type: file_name.split('.').pop() || 'md',
          category,
          subcategory,
          source_type: 'manual',
          source_path: source_path || 'manual_curadoria',
          content_raw: chunks.map(c => c.content).join('\n\n---\n\n'),
          chunk_count: chunks.length,
          total_tokens: chunks.reduce((s, c) => s + estimateTokens(c.content), 0),
          processing_status: 'processing',
        })
        .select('id')
        .single();

      if (insertErr) throw new Error(`Insert document failed: ${insertErr.message}`);
      docId = newDoc.id;
    }

    // Get current max chunk_index for this document (for appending)
    const { data: existingChunks } = await supabase
      .from('rag_chunks')
      .select('chunk_index')
      .eq('document_id', docId)
      .order('chunk_index', { ascending: false })
      .limit(1);

    const startIndex = existingChunks?.length ? (existingChunks[0].chunk_index + 1) : 0;

    // Process all chunks: generate embeddings and insert
    let successCount = 0;
    let failCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      try {
        const embedding = await generateEmbedding(chunk.content);
        const tokenCount = estimateTokens(chunk.content);

        const { error: chunkErr } = await supabase
          .from('rag_chunks')
          .insert({
            document_id: docId,
            chunk_index: startIndex + i,
            content: chunk.content,
            embedding: `[${embedding.join(',')}]`,
            token_count: tokenCount,
            char_count: chunk.content.length,
            chunk_type: chunk.metadata?.chunk_type || 'unknown',
            quality_score: chunk.metadata?.quality_score ?? 0.8,
            is_active: true,
            metadata: chunk.metadata || {},
          });

        if (chunkErr) {
          errors.push(`Chunk ${i}: ${chunkErr.message}`);
          failCount++;
        } else {
          successCount++;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        errors.push(`Chunk ${i}: ${msg}`);
        failCount++;
      }
    }

    // Update document status
    const totalTokens = chunks.reduce((s, c) => s + estimateTokens(c.content), 0);
    await supabase
      .from('rag_documents')
      .update({
        processing_status: failCount === 0 ? 'completed' : 'partial',
        chunk_count: startIndex + chunks.length,
        total_tokens: totalTokens,
        last_synced_at: new Date().toISOString(),
      })
      .eq('id', docId);

    console.log(`[ingest-rag-document] Done: ${successCount} ok, ${failCount} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        document_id: docId,
        file_name,
        category,
        chunks_inserted: successCount,
        chunks_failed: failCount,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[ingest-rag-document] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
