import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getStrictCorsHeaders, handleCorsPrelight } from '../_shared/security-helpers.ts';

interface BitrixStage {
  STATUS_ID: string;
  NAME: string;
  SORT: string;
  ENTITY_ID: string;
}

Deno.serve(async (req) => {
  const corsHeaders = getStrictCorsHeaders(req);
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsPrelight(req, { mode: 'strict' });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get Bitrix24 webhook URL from config
    const { data: configData } = await supabase
      .from('configuracoes_sistema')
      .select('valor')
      .eq('chave', 'bitrix24_webhook_url')
      .single();

    if (!configData?.valor) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'URL do webhook Bitrix24 não configurada' 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const webhookUrl = configData.valor;
    
    // Extract base URL for API calls
    const baseUrl = webhookUrl.replace(/\/[^\/]*$/, '');
    
    console.log('Fetching lead statuses from Bitrix24...');
    
    // Call Bitrix24 API to get lead statuses
    const response = await fetch(`${baseUrl}/crm.status.list`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filter: { ENTITY_ID: 'STATUS' }
      }),
    });

    if (!response.ok) {
      throw new Error(`Bitrix24 API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.error) {
      throw new Error(`Bitrix24 error: ${data.error_description || data.error}`);
    }

    const stages: BitrixStage[] = data.result || [];
    
    // Filter only lead statuses (ENTITY_ID = 'STATUS') and sort by SORT field
    const leadStages = stages
      .filter((s: BitrixStage) => s.ENTITY_ID === 'STATUS')
      .sort((a: BitrixStage, b: BitrixStage) => parseInt(a.SORT) - parseInt(b.SORT))
      .map((s: BitrixStage) => ({
        id: s.STATUS_ID,
        name: s.NAME,
        sort: parseInt(s.SORT),
      }));

    console.log(`Found ${leadStages.length} lead stages`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        stages: leadStages 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error: unknown) {
    console.error('Error fetching Bitrix24 stages:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro ao buscar etapas do Bitrix24';
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
