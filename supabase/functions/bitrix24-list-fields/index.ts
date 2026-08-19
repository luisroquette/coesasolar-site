import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getStrictCorsHeaders, handleCorsPrelight } from '../_shared/security-helpers.ts';

interface Bitrix24Field {
  ID: string;
  FIELD_NAME: string;
  EDIT_FORM_LABEL: string;
  LIST_COLUMN_LABEL: string;
  USER_TYPE_ID: string;
  MANDATORY: string;
}

interface FieldInfo {
  id: string;
  fieldName: string;
  label: string;
  type: string;
  mandatory: boolean;
}

Deno.serve(async (req) => {
  const corsHeaders = getStrictCorsHeaders(req);
  console.log('Bitrix24 List Fields received:', req.method);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsPrelight(req, { mode: 'strict' });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get Bitrix24 webhook URL from config
    const { data: configData } = await supabase
      .from('configuracoes_sistema')
      .select('valor')
      .eq('chave', 'bitrix24_webhook_url')
      .single();

    const bitrix24Url = configData?.valor;

    if (!bitrix24Url) {
      return new Response(JSON.stringify({ 
        error: 'Bitrix24 webhook URL not configured',
        fields: [] 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch all user fields from Bitrix24
    console.log('Fetching user fields from Bitrix24...');
    const userFieldsResponse = await fetch(`${bitrix24Url}/crm.lead.userfield.list`);
    const userFieldsData = await userFieldsResponse.json();

    if (!userFieldsData.result || !Array.isArray(userFieldsData.result)) {
      console.log('No userfields found or invalid response');
      return new Response(JSON.stringify({
        success: true,
        fields: [],
        message: 'No custom fields found'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse and organize fields
    const fields: FieldInfo[] = userFieldsData.result.map((field: Bitrix24Field) => ({
      id: field.ID,
      fieldName: field.FIELD_NAME,
      label: field.EDIT_FORM_LABEL || field.LIST_COLUMN_LABEL || field.FIELD_NAME,
      type: field.USER_TYPE_ID,
      mandatory: field.MANDATORY === 'Y',
    }));

    // Sort by label
    fields.sort((a, b) => a.label.localeCompare(b.label));

    console.log(`Found ${fields.length} custom fields in Bitrix24`);

    return new Response(JSON.stringify({
      success: true,
      fields,
      total: fields.length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error listing fields:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage, fields: [] }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
