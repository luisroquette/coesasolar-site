import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getStrictCorsHeaders, handleCorsPrelight } from '../_shared/security-helpers.ts';

/**
 * ensure-learning-folders: Garante que a estrutura de pastas de aprendizado existe no OneDrive
 * Cria /Scripts, /Scripts/Sucesso e /Scripts/Fracasso se não existirem
 */

const MICROSOFT_CLIENT_ID = Deno.env.get('MICROSOFT_CLIENT_ID');
const MICROSOFT_CLIENT_SECRET = Deno.env.get('MICROSOFT_CLIENT_SECRET');
const MICROSOFT_TENANT_ID = Deno.env.get('MICROSOFT_TENANT_ID');

interface EnsureFoldersRequest {
  drive_id: string;
  base_path?: string; // Default: caminho configurado no banco
  include_period_folders?: boolean; // Criar pastas mensais (ex: 2026-01)
  period?: string; // Período específico (YYYY-MM) ou 'current'
  periods_to_create?: number; // Quantos meses criar (default: 1)
}

interface FolderStatus {
  status: 'existed' | 'created' | 'error';
  path: string;
  error?: string;
}

interface EnsureFoldersResponse {
  success: boolean;
  folders: {
    scripts?: FolderStatus;
    success?: FolderStatus;
    failure?: FolderStatus;
    success_periods?: FolderStatus[];
    failure_periods?: FolderStatus[];
  };
  error?: string;
}

// Gerar string YYYY-MM para mês atual
function getCurrentPeriod(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

// Gerar lista de períodos (mês atual + N meses anteriores)
function generatePeriods(count: number = 1): string[] {
  const periods: string[] = [];
  const now = new Date();
  
  for (let i = 0; i < count; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    periods.push(`${year}-${month}`);
  }
  
  return periods;
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

async function checkFolderExists(
  accessToken: string,
  driveId: string,
  path: string
): Promise<boolean> {
  const encodedPath = encodeGraphPath(path);
  const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${encodedPath}`;

  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });

  return response.ok;
}

async function createFolder(
  accessToken: string,
  driveId: string,
  parentPath: string,
  folderName: string
): Promise<{ success: boolean; error?: string }> {
  let url: string;
  if (!parentPath || parentPath === '/' || parentPath === '') {
    url = `https://graph.microsoft.com/v1.0/drives/${driveId}/root/children`;
  } else {
    const encoded = encodeGraphPath(parentPath);
    url = `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${encoded}:/children`;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: folderName.trim(),
      folder: {},
      '@microsoft.graph.conflictBehavior': 'fail'
    })
  });

  const responseText = await response.text();

  if (!response.ok) {
    // 409 = pasta já existe, considerar sucesso
    if (response.status === 409) {
      return { success: true };
    }
    return { success: false, error: `HTTP ${response.status}: ${responseText}` };
  }

  return { success: true };
}

async function ensureFolderExists(
  accessToken: string,
  driveId: string,
  fullPath: string
): Promise<FolderStatus> {
  const path = fullPath;
  
  // Verificar se já existe
  const exists = await checkFolderExists(accessToken, driveId, path);
  if (exists) {
    return { status: 'existed', path };
  }

  // Criar pasta
  const parentPath = path.split('/').slice(0, -1).join('/');
  const folderName = path.split('/').pop()!;

  const result = await createFolder(accessToken, driveId, parentPath, folderName);
  if (result.success) {
    return { status: 'created', path };
  }

  return { status: 'error', path, error: result.error };
}

serve(async (req) => {
  const corsHeaders = getStrictCorsHeaders(req);
  
  if (req.method === 'OPTIONS') {
    return handleCorsPrelight(req, { mode: 'strict' });
  }

  try {
    const body: EnsureFoldersRequest = await req.json();
    const { drive_id, base_path, include_period_folders, period, periods_to_create } = body;

    if (!drive_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'drive_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Carregar configuração do banco
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Buscar configuração de pastas (com fallback para valores padrão)
    const { data: configData } = await supabase
      .from('configuracoes_sistema')
      .select('valor')
      .eq('chave', 'learning_folders_config')
      .maybeSingle();

    let foldersConfig = {
      scripts_folder: 'Scripts',
      success_folder: 'Sucesso',
      failure_folder: 'Fracasso'
    };

    if (configData?.valor) {
      try {
        const parsed = JSON.parse(configData.valor);
        foldersConfig = { ...foldersConfig, ...parsed };
      } catch {
        console.log('[ensure-learning-folders] Using default folder config');
      }
    }

    // Determinar caminho base
    const scriptsBasePath = base_path 
      ? `${base_path}/${foldersConfig.scripts_folder}`
      : foldersConfig.scripts_folder;

    console.log(`[ensure-learning-folders] Ensuring folders in drive=${drive_id}, base=${scriptsBasePath}`);

    const accessToken = await getAccessToken();

    const result: EnsureFoldersResponse = {
      success: true,
      folders: {}
    };

    // 1. Garantir pasta Scripts base
    const scriptsResult = await ensureFolderExists(accessToken, drive_id, scriptsBasePath);
    result.folders.scripts = scriptsResult;
    
    if (scriptsResult.status === 'error') {
      console.error(`[ensure-learning-folders] Failed to create scripts folder: ${scriptsResult.error}`);
      // Continuar tentando as subpastas mesmo se a base falhar
    }

    // 2. Garantir pasta Sucesso
    const successPath = `${scriptsBasePath}/${foldersConfig.success_folder}`;
    const successResult = await ensureFolderExists(accessToken, drive_id, successPath);
    result.folders.success = successResult;

    // 3. Garantir pasta Fracasso
    const failurePath = `${scriptsBasePath}/${foldersConfig.failure_folder}`;
    const failureResult = await ensureFolderExists(accessToken, drive_id, failurePath);
    result.folders.failure = failureResult;

    // 4. [NOVO] Criar pastas de período se solicitado
    if (include_period_folders) {
      let periodsToCreate: string[];
      
      if (period === 'current') {
        periodsToCreate = [getCurrentPeriod()];
      } else if (period && /^\d{4}-\d{2}$/.test(period)) {
        periodsToCreate = [period];
      } else if (periods_to_create && periods_to_create > 0) {
        periodsToCreate = generatePeriods(periods_to_create);
      } else {
        periodsToCreate = [getCurrentPeriod()];
      }

      console.log(`[ensure-learning-folders] Creating period folders: ${periodsToCreate.join(', ')}`);

      const successPeriods: FolderStatus[] = [];
      const failurePeriods: FolderStatus[] = [];

      for (const p of periodsToCreate) {
        // Criar pasta do período em Sucesso
        const successPeriodPath = `${scriptsBasePath}/${foldersConfig.success_folder}/${p}`;
        const successPeriodResult = await ensureFolderExists(accessToken, drive_id, successPeriodPath);
        successPeriods.push(successPeriodResult);

        // Criar pasta do período em Fracasso
        const failurePeriodPath = `${scriptsBasePath}/${foldersConfig.failure_folder}/${p}`;
        const failurePeriodResult = await ensureFolderExists(accessToken, drive_id, failurePeriodPath);
        failurePeriods.push(failurePeriodResult);
      }

      result.folders.success_periods = successPeriods;
      result.folders.failure_periods = failurePeriods;
    }

    // Verificar se houve algum erro
    const allFolders = [
      result.folders.scripts,
      result.folders.success,
      result.folders.failure,
      ...(result.folders.success_periods || []),
      ...(result.folders.failure_periods || []),
    ];
    const hasError = allFolders.some(f => f?.status === 'error');
    if (hasError) {
      result.success = false;
    }

    // Log resumo
    const created = allFolders.filter(f => f?.status === 'created').length;
    const existed = allFolders.filter(f => f?.status === 'existed').length;
    console.log(`[ensure-learning-folders] Complete: ${created} created, ${existed} existed`);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[ensure-learning-folders] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        folders: {}
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
