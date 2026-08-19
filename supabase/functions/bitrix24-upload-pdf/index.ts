import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getStrictCorsHeaders, handleCorsPrelight, errorResponse } from '../_shared/security-helpers.ts';
import { validateUploadPDF, parseAndValidate } from '../_shared/zod-schemas.ts';

Deno.serve(async (req) => {
  const corsHeaders = getStrictCorsHeaders(req);
  console.log('Bitrix24 Upload PDF received:', req.method);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsPrelight(req, { mode: 'strict' });
  }

  try {
    // Validate and parse request body
    const parseResult = await parseAndValidate(req, validateUploadPDF);
    if (!parseResult.success) {
      console.warn('[bitrix24-upload-pdf] Validation failed:', parseResult.error);
      return errorResponse(parseResult.error, parseResult.status, req);
    }

    const { proposalId, pdfBase64, filename } = parseResult.data;
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`Uploading PDF for proposal ${proposalId}, filename: ${filename}`);

    // Get proposal with Bitrix24 lead ID
    const { data: proposal, error: proposalError } = await supabase
      .from('propostas_assinantes')
      .select('id, cliente_nome, bitrix24_lead_id')
      .eq('id', proposalId)
      .single();

    if (proposalError || !proposal) {
      console.error('Proposal not found:', proposalError);
      return new Response(
        JSON.stringify({ error: 'Proposal not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!proposal.bitrix24_lead_id) {
      console.log('Proposal has no Bitrix24 lead ID - skipping upload');
      return new Response(
        JSON.stringify({ success: true, message: 'No Bitrix24 lead linked', uploaded: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const leadId = proposal.bitrix24_lead_id;
    console.log(`Found Bitrix24 lead ID: ${leadId}`);

    // Get Bitrix24 webhook URL
    const { data: configData } = await supabase
      .from('configuracoes_sistema')
      .select('valor')
      .eq('chave', 'bitrix24_webhook_url')
      .single();

    const bitrix24Url = configData?.valor;

    if (!bitrix24Url) {
      console.error('Bitrix24 webhook URL not configured');
      return new Response(
        JSON.stringify({ error: 'Bitrix24 not configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if integration is enabled
    const { data: enabledConfig } = await supabase
      .from('configuracoes_sistema')
      .select('valor')
      .eq('chave', 'bitrix24_enabled')
      .single();

    if (enabledConfig?.valor !== 'true') {
      console.log('Bitrix24 integration disabled');
      return new Response(
        JSON.stringify({ success: true, message: 'Integration disabled', uploaded: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Discover or get cached PDF field code
    let pdfFieldCode = 'UF_CRM_PDF_PROPOSTA';
    
    const { data: savedFieldConfig } = await supabase
      .from('configuracoes_sistema')
      .select('valor')
      .eq('chave', 'bitrix24_pdf_field_code')
      .maybeSingle();

    if (savedFieldConfig?.valor) {
      pdfFieldCode = savedFieldConfig.valor;
    } else {
      // Try to discover the field
      try {
        console.log('Discovering PDF field code...');
        const userFieldsResponse = await fetch(`${bitrix24Url}/crm.lead.userfield.list`);
        const userFieldsData = await userFieldsResponse.json();
        
        if (userFieldsData.result && Array.isArray(userFieldsData.result)) {
          for (const field of userFieldsData.result) {
            const label = (field.EDIT_FORM_LABEL || field.LIST_COLUMN_LABEL || '').toLowerCase();
            const fieldName = field.FIELD_NAME || '';
            const userType = field.USER_TYPE_ID || '';
            
            // Look for file type fields with "PDF" or "Proposta" in label
            if (userType === 'file' && (label.includes('pdf') || label.includes('proposta') || label.includes('arquivo'))) {
              console.log(`Found PDF field: ${fieldName} (label: ${label})`);
              pdfFieldCode = fieldName;
              
              // Save for future use
              await supabase.from('configuracoes_sistema').upsert({
                chave: 'bitrix24_pdf_field_code',
                valor: fieldName,
                descricao: 'Código do campo de arquivo do Bitrix24 para o PDF da proposta (descoberto automaticamente)',
              }, { onConflict: 'chave' });
              
              break;
            }
          }
        }
      } catch (discoverError) {
        console.error('Error discovering PDF field:', discoverError);
      }
    }

    console.log(`Using PDF field code: ${pdfFieldCode}`);

    // Clean base64 - remove data URI prefix if present
    let cleanBase64 = pdfBase64;
    if (pdfBase64.includes(',')) {
      cleanBase64 = pdfBase64.split(',')[1];
    }

    // Prepare filename
    const pdfFilename = filename || `Proposta_COESA_${proposal.cliente_nome?.replace(/\s+/g, '_') || proposalId}.pdf`;

    // Try to upload file to lead using crm.lead.update with file field
    // Format: [["filename", "base64content"]]
    const updatePayload = {
      id: leadId,
      fields: {
        [pdfFieldCode]: {
          fileData: [pdfFilename, cleanBase64],
        },
      },
    };

    console.log('Sending file to Bitrix24...');
    
    const updateResponse = await fetch(`${bitrix24Url}/crm.lead.update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatePayload),
    });

    const updateResult = await updateResponse.json();
    console.log('Bitrix24 update result:', JSON.stringify(updateResult));

    if (updateResult.error) {
      console.error('Bitrix24 error:', updateResult.error, updateResult.error_description);
      
      // Try alternative method: attach to timeline as activity
      console.log('Trying alternative method: timeline attachment...');
      
      // Add comment with note about file
      const commentPayload = new URLSearchParams({
        'fields[ENTITY_ID]': leadId,
        'fields[ENTITY_TYPE]': 'lead',
        'fields[COMMENT]': `📄 PDF da proposta gerado:\n\n📋 Arquivo: ${pdfFilename}\n\n💡 O arquivo foi anexado a este lead. Verifique os campos personalizados ou atividades.`,
      });
      
      await fetch(`${bitrix24Url}/crm.timeline.comment.add`, {
        method: 'POST',
        body: commentPayload,
      });

      // Log the attempt
      await supabase.from('bitrix24_sync_logs').insert({
        proposta_id: proposalId,
        bitrix24_lead_id: leadId,
        action: 'pdf_upload_failed',
        status: 'error',
        error_message: `${updateResult.error}: ${updateResult.error_description || 'Unknown error'}`,
        request_data: { filename: pdfFilename, fieldCode: pdfFieldCode },
        response_data: updateResult,
      });

      return new Response(
        JSON.stringify({
          success: false,
          uploaded: false,
          error: updateResult.error,
          message: 'Não foi possível anexar o PDF diretamente. Verifique se existe um campo do tipo "Arquivo" no lead do Bitrix24.',
          suggestion: 'Crie um campo personalizado do tipo "Arquivo" no Bitrix24 com o nome "PDF Proposta" ou similar.',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Success! Add comment about the file
    const successComment = `📄 PDF da proposta anexado com sucesso!\n\n📋 Arquivo: ${pdfFilename}\n\n✅ O PDF está disponível no campo "${pdfFieldCode}".`;
    
    const commentPayload = new URLSearchParams({
      'fields[ENTITY_ID]': leadId,
      'fields[ENTITY_TYPE]': 'lead',
      'fields[COMMENT]': successComment,
    });
    
    await fetch(`${bitrix24Url}/crm.timeline.comment.add`, {
      method: 'POST',
      body: commentPayload,
    });

    // Log success
    await supabase.from('bitrix24_sync_logs').insert({
      proposta_id: proposalId,
      bitrix24_lead_id: leadId,
      action: 'pdf_uploaded',
      status: 'success',
      request_data: { filename: pdfFilename, fieldCode: pdfFieldCode },
      response_data: updateResult,
    });

    console.log('PDF uploaded successfully to Bitrix24');

    return new Response(
      JSON.stringify({
        success: true,
        uploaded: true,
        leadId,
        filename: pdfFilename,
        fieldCode: pdfFieldCode,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Upload PDF error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
