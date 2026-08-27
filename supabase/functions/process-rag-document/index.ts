import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { getStrictCorsHeaders, jsonResponse, errorResponse } from "../_shared/security-helpers.ts";
import { validateProcessRagDocument, parseAndValidate, type ProcessRagDocumentPayloadType } from "../_shared/zod-schemas.ts";
import { processBatchWithConcurrency } from "../_shared/batch-processor.ts";

/**
 * process-rag-document: Processa documentos para RAG
 * 
 * SECURITY: Internal API - strict CORS enforcement
 * 
 * 1. Extrai texto de PDF/DOCX/TXT
 * 2. Divide em chunks otimizados
 * 3. Gera embeddings via Lovable AI
 * 4. Armazena no banco vetorial
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const OPENAI_API_KEY = (Deno.env.get('COESASOLAR_OPENROUTER_API_KEY') ?? Deno.env.get('OPENROUTER_API_KEY'))!;
const LOVABLE_API_KEY = OPENAI_API_KEY;

// Configurações de chunking
const CHUNK_CONFIG = {
  maxTokens: 500,
  overlapTokens: 50,
  minChunkSize: 100, // caracteres mínimos
};

// Estimativa simples de tokens (4 chars ~= 1 token)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// Dividir texto em chunks inteligentes
function splitIntoChunks(text: string): { content: string; index: number; tokenCount: number }[] {
  const chunks: { content: string; index: number; tokenCount: number }[] = [];
  
  // Limpar texto
  const cleanText = text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!cleanText) return chunks;

  // Tentar dividir por seções (headers, parágrafos duplos)
  const sections = cleanText.split(/\n\n+/);
  
  let currentChunk = '';
  let chunkIndex = 0;

  for (const section of sections) {
    const sectionTokens = estimateTokens(section);
    const currentTokens = estimateTokens(currentChunk);

    // Se a seção sozinha é maior que o limite, dividir por sentenças
    if (sectionTokens > CHUNK_CONFIG.maxTokens) {
      // Salvar chunk atual se existir
      if (currentChunk.trim()) {
        chunks.push({
          content: currentChunk.trim(),
          index: chunkIndex++,
          tokenCount: estimateTokens(currentChunk),
        });
        currentChunk = '';
      }

      // Dividir seção grande por sentenças
      const sentences = section.match(/[^.!?]+[.!?]+\s*/g) || [section];
      let subChunk = '';

      for (const sentence of sentences) {
        if (estimateTokens(subChunk + sentence) > CHUNK_CONFIG.maxTokens) {
          if (subChunk.trim()) {
            chunks.push({
              content: subChunk.trim(),
              index: chunkIndex++,
              tokenCount: estimateTokens(subChunk),
            });
          }
          subChunk = sentence;
        } else {
          subChunk += sentence;
        }
      }

      if (subChunk.trim()) {
        currentChunk = subChunk;
      }
    } 
    // Se adicionar a seção excede o limite
    else if (currentTokens + sectionTokens > CHUNK_CONFIG.maxTokens) {
      if (currentChunk.trim()) {
        chunks.push({
          content: currentChunk.trim(),
          index: chunkIndex++,
          tokenCount: estimateTokens(currentChunk),
        });
      }
      currentChunk = section + '\n\n';
    } 
    // Adicionar ao chunk atual
    else {
      currentChunk += section + '\n\n';
    }
  }

  // Chunk final
  if (currentChunk.trim() && currentChunk.trim().length >= CHUNK_CONFIG.minChunkSize) {
    chunks.push({
      content: currentChunk.trim(),
      index: chunkIndex,
      tokenCount: estimateTokens(currentChunk),
    });
  }

  return chunks;
}

// Extrair texto de PDF usando Lovable AI
async function extractTextFromPDF(base64Content: string, fileName: string): Promise<string> {
  console.log('[process-rag-document] Extracting text from PDF:', fileName);

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        {
          role: 'system',
          content: `Você é um extrator de texto de documentos. Extraia TODO o texto do PDF de forma estruturada, preservando:
- Títulos e subtítulos
- Listas e numeração
- Tabelas (formate como texto)
- Parágrafos e seções

NÃO adicione comentários, análises ou interpretações. Apenas extraia o texto fielmente.`
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: `Extraia todo o texto deste documento: ${fileName}` },
            {
              type: 'file',
              file: {
                filename: fileName,
                file_data: `data:application/pdf;base64,${base64Content}`
              }
            }
          ]
        }
      ],
      max_tokens: 16000,
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[process-rag-document] PDF extraction error:', response.status, errorText);
    throw new Error(`PDF extraction failed: ${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

// Gerar embedding para um chunk
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
    throw new Error(`Embedding API error: ${response.status}`);
  }

  const data = await response.json();
  return data.data?.[0]?.embedding;
}

// Gerar hash SHA-256 do conteúdo
async function generateContentHash(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  const corsHeaders = getStrictCorsHeaders(req);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    // Validate input with Zod
    const parseResult = await parseAndValidate(req, validateProcessRagDocument);
    
    if (!parseResult.success) {
      console.error('[process-rag-document] Validation failed:', parseResult.error);
      return new Response(
        JSON.stringify({ error: 'Validation failed', details: parseResult.error }),
        { status: parseResult.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const body = parseResult.data as ProcessRagDocumentPayloadType;
    const { 
      document_id,
      file_path, 
      file_name, 
      file_type,
      category = 'geral',
      subcategory,
      content: providedContent,
      source_type = 'manual',
      source_id,
      source_path,
    } = body;

    console.log(`[process-rag-document] Processing: ${file_name}`);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let extractedText = providedContent || '';
    let detectedFileType = file_type || file_name.split('.').pop()?.toLowerCase() || 'txt';

    // Se não tem conteúdo providenciado, baixar e extrair
    if (!extractedText && file_path) {
      // Determinar bucket baseado no source_type
      const bucket = source_type === 'onedrive' ? 'kb-documents' : 'kb-documents';
      
      const { data: fileData, error: downloadError } = await supabase
        .storage
        .from(bucket)
        .download(file_path);

      if (downloadError) {
        throw new Error(`Download failed: ${downloadError.message}`);
      }

      // Extrair texto baseado no tipo
      if (detectedFileType === 'pdf') {
        const arrayBuffer = await fileData.arrayBuffer();
        const base64 = base64Encode(arrayBuffer);
        extractedText = await extractTextFromPDF(base64, file_name);
      } else if (['txt', 'md', 'markdown'].includes(detectedFileType)) {
        extractedText = await fileData.text();
      } else if (['docx', 'doc'].includes(detectedFileType)) {
        // Para DOCX, enviar como PDF para extração
        const arrayBuffer = await fileData.arrayBuffer();
        const base64 = base64Encode(arrayBuffer);
        extractedText = await extractTextFromPDF(base64, file_name);
      } else {
        // Tentar como texto
        extractedText = await fileData.text();
      }
    }

    if (!extractedText || extractedText.trim().length < 50) {
      throw new Error('Could not extract meaningful text from document');
    }

    // Gerar hash do conteúdo
    const contentHash = await generateContentHash(extractedText);

    // Verificar se documento já existe com mesmo hash
    if (document_id) {
      const { data: existingDoc } = await supabase
        .from('rag_documents')
        .select('content_hash')
        .eq('id', document_id)
        .single();

      if (existingDoc?.content_hash === contentHash) {
        console.log('[process-rag-document] Document unchanged, skipping');
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: 'Document unchanged',
            document_id,
            skipped: true,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Dividir em chunks
    const chunks = splitIntoChunks(extractedText);
    console.log(`[process-rag-document] Created ${chunks.length} chunks`);

    // Criar ou atualizar documento
    let docId = document_id;
    const totalTokens = chunks.reduce((sum, c) => sum + c.tokenCount, 0);

    if (!docId) {
      const { data: newDoc, error: insertError } = await supabase
        .from('rag_documents')
        .insert({
          file_name,
          file_type: detectedFileType,
          category,
          subcategory,
          source_type,
          source_id,
          source_path,
          content_raw: extractedText,
          content_hash: contentHash,
          chunk_count: chunks.length,
          total_tokens: totalTokens,
          processing_status: 'processing',
        })
        .select('id')
        .single();

      if (insertError) throw new Error(`Insert document failed: ${insertError.message}`);
      docId = newDoc.id;
    } else {
      // Atualizar documento existente
      await supabase
        .from('rag_documents')
        .update({
          content_raw: extractedText,
          content_hash: contentHash,
          chunk_count: chunks.length,
          total_tokens: totalTokens,
          processing_status: 'processing',
          processing_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', docId);

      // Deletar chunks antigos
      await supabase.from('rag_chunks').delete().eq('document_id', docId);
    }

    // Gerar embeddings e inserir chunks (otimizado com concorrência)
    // batchSize=10, maxConcurrent=3: 100 chunks → 4 rodadas (~8s vs ~40s)
    console.log(`[process-rag-document] Processing ${chunks.length} chunks with optimized concurrency...`);
    
    const batchResult = await processBatchWithConcurrency(
      chunks,
      async (chunk, index) => {
        const embedding = await generateEmbedding(chunk.content);
        return {
          document_id: docId,
          chunk_index: chunk.index,
          content: chunk.content,
          embedding: `[${embedding.join(',')}]`,
          token_count: chunk.tokenCount,
          char_count: chunk.content.length,
          metadata: {},
        };
      },
      {
        batchSize: 10,
        maxConcurrent: 3,
        onProgress: (processed, total) => {
          if (processed % 20 === 0) {
            console.log(`[process-rag-document] Progress: ${processed}/${total} chunks`);
          }
        },
      }
    );

    // Insert successful chunks
    const successfulChunks = batchResult.results
      .filter(r => r.success && r.data)
      .map(r => r.data!);
    
    let processedChunks = 0;
    if (successfulChunks.length > 0) {
      const { error: chunkError } = await supabase
        .from('rag_chunks')
        .insert(successfulChunks);

      if (chunkError) {
        console.error('[process-rag-document] Chunk insert error:', chunkError);
      } else {
        processedChunks = successfulChunks.length;
      }
    }
    
    if (batchResult.failed > 0) {
      console.warn(`[process-rag-document] ${batchResult.failed} chunks failed to generate embeddings`);
    }

    // Atualizar status do documento
    await supabase
      .from('rag_documents')
      .update({
        processing_status: 'completed',
        last_synced_at: new Date().toISOString(),
      })
      .eq('id', docId);

    const executionTimeMs = Date.now() - startTime;
    console.log(`[process-rag-document] Completed in ${executionTimeMs}ms`);

    // Gerar URL pública se disponível
    let publicUrl = null;
    if (file_path) {
      const { data: urlData } = supabase.storage.from('kb-documents').getPublicUrl(file_path);
      publicUrl = urlData?.publicUrl;
    }

    return new Response(
      JSON.stringify({
        success: true,
        document_id: docId,
        file_name,
        category,
        chunks_created: processedChunks,
        total_tokens: totalTokens,
        content_hash: contentHash,
        public_url: publicUrl,
        execution_time_ms: executionTimeMs,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[process-rag-document] Error:', error);

    // Atualizar documento com erro se possível
    const body = await req.clone().json().catch(() => ({}));
    if (body.document_id) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      await supabase
        .from('rag_documents')
        .update({
          processing_status: 'failed',
          processing_error: error instanceof Error ? error.message : 'Unknown error',
        })
        .eq('id', body.document_id);
    }

    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
