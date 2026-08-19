import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getStrictCorsHeaders, handleCorsPrelight } from '../_shared/security-helpers.ts';

/**
 * onedrive-list-folder: Lista subpastas de um caminho no OneDrive/SharePoint
 */

const MICROSOFT_CLIENT_ID = Deno.env.get('MICROSOFT_CLIENT_ID');
const MICROSOFT_CLIENT_SECRET = Deno.env.get('MICROSOFT_CLIENT_SECRET');
const MICROSOFT_TENANT_ID = Deno.env.get('MICROSOFT_TENANT_ID');

interface ListRequest {
  drive_id: string;
  folder_path?: string; // Se vazio, lista a raiz
}

interface FolderItem {
  id: string;
  name: string;
  type: 'folder' | 'file';
  size?: number;
  childCount?: number;
  lastModified: string;
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

serve(async (req) => {
  const corsHeaders = getStrictCorsHeaders(req);
  
  if (req.method === 'OPTIONS') {
    return handleCorsPrelight(req, { mode: 'strict' });
  }

  try {
    const body: ListRequest = await req.json();
    const { drive_id, folder_path } = body;

    if (!drive_id) {
      return new Response(
        JSON.stringify({ error: 'drive_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[onedrive-list-folder] Listing: drive=${drive_id}, path=${folder_path || '(root)'}`);

    const accessToken = await getAccessToken();

    // Build URL
    let url: string;
    if (!folder_path || folder_path === '/' || folder_path === '') {
      url = `https://graph.microsoft.com/v1.0/drives/${drive_id}/root/children?$top=100`;
    } else {
      const encoded = encodeGraphPath(folder_path);
      url = `https://graph.microsoft.com/v1.0/drives/${drive_id}/root:/${encoded}:/children?$top=100`;
    }

    console.log(`[onedrive-list-folder] URL: ${url}`);

    const graphResponse = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!graphResponse.ok) {
      const errorText = await graphResponse.text();
      console.error(`[onedrive-list-folder] Graph error: ${graphResponse.status} - ${errorText}`);
      return new Response(
        JSON.stringify({ 
          error: `Graph API error: ${graphResponse.status}`,
          details: errorText 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const graphData = await graphResponse.json();
    
    const items: FolderItem[] = graphData.value.map((item: any) => ({
      id: item.id,
      name: item.name,
      type: item.folder ? 'folder' : 'file',
      size: item.size,
      childCount: item.folder?.childCount,
      lastModified: item.lastModifiedDateTime,
    }));

    // Separar pastas e arquivos
    const folders = items.filter(i => i.type === 'folder').sort((a, b) => a.name.localeCompare(b.name));
    const files = items.filter(i => i.type === 'file').sort((a, b) => a.name.localeCompare(b.name));

    return new Response(
      JSON.stringify({
        success: true,
        path: folder_path || '/',
        folders,
        files,
        total_folders: folders.length,
        total_files: files.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[onedrive-list-folder] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
