import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import {
  getStrictCorsHeaders,
  handleCorsPrelight,
  errorResponse,
} from '../_shared/security-helpers.ts';
import { validateProcessKbDocument } from '../_shared/zod-schemas.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const LOVABLE_API_KEY = Deno.env.get('COESASOLAR_OPENROUTER_API_KEY');

serve(async (req) => {
  // Strict CORS - internal API only
  const corsHeaders = getStrictCorsHeaders(req);
  
  if (req.method === 'OPTIONS') {
    return handleCorsPrelight(req, { mode: 'strict' });
  }

  try {
    // Parse and validate request body
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return errorResponse('Invalid JSON body', 400, req);
    }
    
    const validation = validateProcessKbDocument(rawBody);
    if (!validation.success) {
      const errorMsg = validation.errors?.map((e: { field: string; message: string }) => `${e.field}: ${e.message}`).join(', ');
      return errorResponse(`Validation failed: ${errorMsg}`, 400, req);
    }
    
    const { file_path, file_name, agent_id } = validation.data!;

    console.log(`[process-kb-document] Processing: ${file_name} for agent: ${agent_id || 'sofia'}`);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Download the file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('kb-documents')
      .download(file_path);

    if (downloadError) {
      console.error('[process-kb-document] Download error:', downloadError);
      throw new Error(`Failed to download file: ${downloadError.message}`);
    }

    // Convert to base64 using Deno's built-in encoder (avoids stack overflow)
    const arrayBuffer = await fileData.arrayBuffer();
    const base64Content = base64Encode(arrayBuffer);
    
    console.log(`[process-kb-document] File downloaded, size: ${arrayBuffer.byteLength} bytes`);

    // Use Lovable AI Gateway with Gemini (supports PDF natively)
    const extractedText = await extractTextFromPDF(base64Content, file_name);

    if (!extractedText) {
      throw new Error('Failed to extract text from document');
    }

    console.log(`[process-kb-document] Extracted ${extractedText.length} characters`);

    // Get the public URL for the file
    const { data: urlData } = supabase.storage
      .from('kb-documents')
      .getPublicUrl(file_path);

    return new Response(
      JSON.stringify({
        success: true,
        content: extractedText,
        file_name,
        file_path,
        url: urlData?.publicUrl || null,
        characters: extractedText.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[process-kb-document] Error:', error);
    return errorResponse(error.message || 'Unknown error', 500, req);
  }
});

async function extractTextFromPDF(base64Content: string, fileName: string): Promise<string> {
  if (!LOVABLE_API_KEY) {
    throw new Error('LOVABLE_API_KEY not configured');
  }

  console.log(`[process-kb-document] Calling Lovable AI Gateway to extract text from: ${fileName}`);

  try {
    // Use Gemini model via Lovable AI Gateway - it supports PDF natively
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `Você é um especialista em extração de texto de documentos. 
Sua tarefa é extrair TODO o conteúdo textual do documento PDF fornecido.
Mantenha a estrutura original (títulos, parágrafos, listas).
Retorne APENAS o texto extraído, sem comentários adicionais.
Se houver tabelas, converta para formato texto legível.
Preserve a formatação markdown quando apropriado (títulos com #, listas com -, etc).`
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Extraia todo o conteúdo textual deste documento PDF chamado "${fileName}". Retorne o texto completo preservando a estrutura.`
              },
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
        temperature: 0.1
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[process-kb-document] Lovable AI Gateway error:', errorText);
      
      if (response.status === 429) {
        throw new Error('Rate limit exceeded. Please try again later.');
      }
      if (response.status === 402) {
        throw new Error('AI credits exhausted. Please add credits to continue.');
      }
      
      throw new Error(`AI API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    const extractedText = result.choices?.[0]?.message?.content;

    if (!extractedText) {
      throw new Error('No text extracted from AI response');
    }

    return extractedText.trim();

  } catch (error: any) {
    console.error('[process-kb-document] AI extraction error:', error);
    throw error;
  }
}
