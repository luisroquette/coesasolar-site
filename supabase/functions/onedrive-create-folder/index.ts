import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getStrictCorsHeaders, handleCorsPrelight } from '../_shared/security-helpers.ts';

/**
 * onedrive-create-folder: Cria uma nova pasta no OneDrive/SharePoint
 */

const MICROSOFT_CLIENT_ID = Deno.env.get('MICROSOFT_CLIENT_ID');
const MICROSOFT_CLIENT_SECRET = Deno.env.get('MICROSOFT_CLIENT_SECRET');
const MICROSOFT_TENANT_ID = Deno.env.get('MICROSOFT_TENANT_ID');

// Caracteres inválidos para nomes de pasta no OneDrive
const INVALID_CHARS = /[\/\\:*?"<>|]/;
const INVALID_NAMES = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 
  'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 
  'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];

interface CreateFolderRequest {
  drive_id: string;
  parent_path?: string; // Se vazio, cria na raiz
  folder_name: string;
}

interface CreateFolderResponse {
  success: boolean;
  folder?: {
    id: string;
    name: string;
    webUrl: string;
    createdDateTime: string;
  };
  error?: string;
  error_code?: string;
}

async function getAccessToken(): Promise<string> {
  if (!MICROSOFT_TENANT_ID || !MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET) {
    throw new Error('Microsoft credentials not configured');
  }

  const tokenEndpoint = `https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}/oauth2/v2.0/token`;

  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: MICROSOFT_CLIENT_ID,
      client_secret: MICROSOFT_CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token request failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.access_token;
}

function encodeGraphPath(path: string): string {
  return path
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function validateFolderName(name: string): { valid: boolean; error?: string } {
  if (!name || name.trim() === '') {
    return { valid: false, error: 'Nome da pasta não pode ser vazio' };
  }

  const trimmedName = name.trim();

  if (INVALID_CHARS.test(trimmedName)) {
    return { valid: false, error: 'Nome contém caracteres inválidos: / \\ : * ? " < > |' };
  }

  if (INVALID_NAMES.includes(trimmedName.toUpperCase())) {
    return { valid: false, error: `"${trimmedName}" é um nome reservado do sistema` };
  }

  if (trimmedName.length > 255) {
    return { valid: false, error: 'Nome da pasta muito longo (máximo 255 caracteres)' };
  }

  if (trimmedName.startsWith('.') || trimmedName.endsWith('.')) {
    return { valid: false, error: 'Nome não pode começar ou terminar com ponto' };
  }

  return { valid: true };
}

serve(async (req) => {
  const corsHeaders = getStrictCorsHeaders(req);
  
  if (req.method === 'OPTIONS') {
    return handleCorsPrelight(req, { mode: 'strict' });
  }

  try {
    const body: CreateFolderRequest = await req.json();
    const { drive_id, parent_path, folder_name } = body;

    if (!drive_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'drive_id is required', error_code: 'MISSING_DRIVE_ID' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!folder_name) {
      return new Response(
        JSON.stringify({ success: false, error: 'folder_name is required', error_code: 'MISSING_FOLDER_NAME' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validar nome da pasta
    const validation = validateFolderName(folder_name);
    if (!validation.valid) {
      return new Response(
        JSON.stringify({ success: false, error: validation.error, error_code: 'INVALID_FOLDER_NAME' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[onedrive-create-folder] Creating folder: "${folder_name}" in drive=${drive_id}, path=${parent_path || '(root)'}`);

    const accessToken = await getAccessToken();

    // Build URL - POST para children do parent
    let url: string;
    if (!parent_path || parent_path === '/' || parent_path === '') {
      url = `https://graph.microsoft.com/v1.0/drives/${drive_id}/root/children`;
    } else {
      const encoded = encodeGraphPath(parent_path);
      url = `https://graph.microsoft.com/v1.0/drives/${drive_id}/root:/${encoded}:/children`;
    }

    console.log(`[onedrive-create-folder] URL: ${url}`);

    const graphResponse = await fetch(url, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: folder_name.trim(),
        folder: {},
        '@microsoft.graph.conflictBehavior': 'fail'
      })
    });

    const responseText = await graphResponse.text();
    let graphData: any;
    
    try {
      graphData = JSON.parse(responseText);
    } catch {
      graphData = { error: { message: responseText } };
    }

    if (!graphResponse.ok) {
      console.error(`[onedrive-create-folder] Graph error: ${graphResponse.status} - ${responseText}`);
      
      // Tratar erro específico de conflito (pasta já existe)
      if (graphResponse.status === 409) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Já existe uma pasta com este nome',
            error_code: 'FOLDER_EXISTS'
          }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Tratar erro de permissão
      if (graphResponse.status === 403) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Sem permissão para criar pastas neste local',
            error_code: 'PERMISSION_DENIED'
          }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Tratar pasta pai não encontrada
      if (graphResponse.status === 404) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Pasta pai não encontrada',
            error_code: 'PARENT_NOT_FOUND'
          }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ 
          success: false,
          error: graphData.error?.message || `Erro do Graph API: ${graphResponse.status}`,
          error_code: 'GRAPH_ERROR'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[onedrive-create-folder] Folder created successfully: ${graphData.id}`);

    const result: CreateFolderResponse = {
      success: true,
      folder: {
        id: graphData.id,
        name: graphData.name,
        webUrl: graphData.webUrl,
        createdDateTime: graphData.createdDateTime
      }
    };

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[onedrive-create-folder] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        error_code: 'INTERNAL_ERROR'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
