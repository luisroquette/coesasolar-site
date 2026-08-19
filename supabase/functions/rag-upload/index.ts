import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPrelight, errorResponse, getStrictCorsHeaders } from '../_shared/security-helpers.ts';
import { validateRAGUpload } from '../_shared/zod-schemas.ts';

/**
 * rag-upload: Upload manual de documentos para RAG
 * 
 * Recebe arquivo via multipart/form-data ou base64,
 * salva no storage e dispara processamento.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

serve(async (req) => {
  // Strict CORS - internal API only
  const corsHeaders = getStrictCorsHeaders(req);
  
  if (req.method === 'OPTIONS') {
    return handleCorsPrelight(req, { mode: 'strict' });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    let fileName: string;
    let fileContent: ArrayBuffer;
    let category: string;
    let subcategory: string | undefined;
    let fileType: string | undefined;

    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      // Upload via form-data
      const formData = await req.formData();
      const file = formData.get('file') as File;
      fileName = file?.name || formData.get('file_name') as string;
      fileContent = await file.arrayBuffer();
      category = formData.get('category') as string || 'geral';
      subcategory = formData.get('subcategory') as string | undefined;
      fileType = file?.type;
    } else {
      // Upload via JSON (base64) - validate with Zod
      const body = await req.json();
      const validation = validateRAGUpload(body);
      if (!validation.success) {
        const errorMessages = validation.errors?.map(e => `${e.field}: ${e.message}`).join(', ');
        return errorResponse(`Validation failed: ${errorMessages}`, 400, req);
      }
      
      fileName = validation.data!.file_name;
      category = validation.data!.category || 'geral';
      subcategory = validation.data!.subcategory;
      fileType = validation.data!.file_type;

      // Decode base64
      const base64Data = validation.data!.file_content.replace(/^data:[^;]+;base64,/, '');
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      fileContent = bytes.buffer;
    }

    if (!fileName || !fileContent) {
      return new Response(
        JSON.stringify({ error: 'file_name and file_content are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[rag-upload] Uploading: ${fileName} to category: ${category}`);

    // Gerar path único
    const timestamp = Date.now();
    const sanitizedName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const storagePath = `manual/${category}/${timestamp}-${sanitizedName}`;

    // Upload para storage
    const { error: uploadError } = await supabase.storage
      .from('kb-documents')
      .upload(storagePath, fileContent, {
        contentType: fileType || 'application/octet-stream',
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }

    console.log(`[rag-upload] Uploaded to: ${storagePath}`);

    // Disparar processamento
    const processResponse = await fetch(`${SUPABASE_URL}/functions/v1/process-rag-document`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        file_path: storagePath,
        file_name: fileName,
        file_type: fileType || fileName.split('.').pop(),
        category,
        subcategory,
        source_type: 'upload',
      }),
    });

    const processResult = await processResponse.json();

    if (!processResponse.ok) {
      throw new Error(`Processing failed: ${processResult.error}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Document uploaded and processing started',
        document_id: processResult.document_id,
        storage_path: storagePath,
        category,
        chunks_created: processResult.chunks_created,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[rag-upload] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
