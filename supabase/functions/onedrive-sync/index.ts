import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { getStrictCorsHeaders, handleCorsPrelight } from '../_shared/security-helpers.ts';
import { processBatchWithConcurrency } from '../_shared/batch-processor.ts';

/**
 * onedrive-sync: Sincroniza documentos do OneDrive para RAG
 * 
 * ARQUITETURA OTIMIZADA (sem download para Storage):
 * 1. Lista arquivos recursivamente via Microsoft Graph API
 * 2. Lê conteúdo diretamente do OneDrive
 * 3. Extrai texto e gera embeddings
 * 4. Armazena apenas os chunks/embeddings no banco
 * 
 * O OneDrive é a ÚNICA fonte da verdade para os arquivos.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Secrets do Microsoft (configurados via UI)
const MICROSOFT_CLIENT_ID = Deno.env.get('MICROSOFT_CLIENT_ID');
const MICROSOFT_CLIENT_SECRET = Deno.env.get('MICROSOFT_CLIENT_SECRET');
const MICROSOFT_TENANT_ID = Deno.env.get('MICROSOFT_TENANT_ID');
const LOVABLE_API_KEY = Deno.env.get('COESASOLAR_OPENROUTER_API_KEY');
const OPENAI_API_KEY = LOVABLE_API_KEY;

interface SyncRequest {
  sync_type?: 'full' | 'incremental';
  folder_path?: string;
  triggered_by?: string;
  discovery_mode?: boolean; // Se true, apenas lista e enfileira (não processa)
}

interface OneDriveItem {
  id: string;
  name: string;
  file?: { mimeType: string };
  folder?: { childCount: number };
  parentReference?: { path: string };
  lastModifiedDateTime: string;
  size: number;
  '@microsoft.graph.downloadUrl'?: string;
}

type FolderRef =
  | { kind: 'root' }
  | { kind: 'id'; id: string }
  | { kind: 'path'; path: string };

// Extensões suportadas
const SUPPORTED_EXTENSIONS = ['pdf', 'docx', 'doc', 'txt', 'md', 'xlsx', 'pptx'];

// Configurações de chunking
const CHUNK_CONFIG = {
  maxTokens: 500,
  overlapTokens: 50,
  minChunkSize: 100,
};

function isProcessableFile(fileName: string): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase();
  return ext ? SUPPORTED_EXTENSIONS.includes(ext) : false;
}

// Inferir categoria pela pasta
function inferCategoryFromPath(path: string, folderMapping: Record<string, string>): string {
  const normalizedPath = path.toLowerCase();
  
  for (const [folderName, category] of Object.entries(folderMapping)) {
    if (normalizedPath.includes(folderName.toLowerCase())) {
      return category;
    }
  }
  
  return 'geral';
}

function normalizeRootPath(path: unknown): string | null {
  if (typeof path !== 'string') return null;
  const trimmed = path.trim();
  if (!trimmed || trimmed === '/') return null;
  return trimmed.replace(/^\/+/, '').replace(/\/+$/, '');
}

function encodeGraphPath(path: string): string {
  return path
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function stripDriveRootPrefix(parentPath: string, driveId: string): string {
  const cleaned = parentPath
    .replace(new RegExp(`^/drives/${driveId}/root:`), '')
    .replace(/^\/drive\/root:/, '');
  return cleaned.startsWith('/') ? cleaned : `/${cleaned}`;
}

function buildChildrenUrl(driveId: string, folder: FolderRef, top = 100): string {
  if (folder.kind === 'root') {
    return `https://graph.microsoft.com/v1.0/drives/${driveId}/root/children?$top=${top}`;
  }

  if (folder.kind === 'path') {
    const encoded = encodeGraphPath(folder.path);
    return `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${encoded}:/children?$top=${top}`;
  }

  return `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${folder.id}/children?$top=${top}`;
}

// Obter access token via Client Credentials Flow
async function getAccessToken(tenantId: string, clientId: string, clientSecret: string): Promise<string> {
  const tokenEndpoint = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
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

// Listar arquivos recursivamente com streaming opcional para discovery incremental
async function listFilesRecursive(
  accessToken: string,
  driveId: string,
  folder: FolderRef = { kind: 'root' },
  folderMapping: Record<string, string>,
  results: { item: OneDriveItem; category: string; path: string }[] = [],
  onBatchFound?: (batch: { item: OneDriveItem; category: string; path: string }[]) => Promise<void>
): Promise<{ item: OneDriveItem; category: string; path: string }[]> {
  
  const url = buildChildrenUrl(driveId, folder, 100);
  console.log(`[onedrive-sync] Listing folder: ${JSON.stringify(folder)} -> ${url}`);
  
  let nextLink: string | null = url;
  const batchBuffer: { item: OneDriveItem; category: string; path: string }[] = [];
  const STREAM_BATCH_SIZE = 50; // Enqueue every 50 files for streaming

  while (nextLink) {
    const graphResponse: Response = await fetch(nextLink, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!graphResponse.ok) {
      const errorText = await graphResponse.text();
      throw new Error(`Graph API error: ${graphResponse.status} - ${errorText}`);
    }

    const graphData: { value: OneDriveItem[]; '@odata.nextLink'?: string } = await graphResponse.json();

    for (const item of graphData.value) {
      const parent = item.parentReference?.path
        ? stripDriveRootPrefix(item.parentReference.path, driveId)
        : '';
      const itemPath = `${parent}/${item.name}`.replace(/\/+/g, '/');

      if (item.folder) {
        // Recursão para subpastas
        await listFilesRecursive(accessToken, driveId, { kind: 'id', id: item.id }, folderMapping, results, onBatchFound);
      } else if (item.file && isProcessableFile(item.name)) {
        const category = inferCategoryFromPath(itemPath, folderMapping);
        const fileEntry = { item, category, path: itemPath };
        results.push(fileEntry);
        
        // Streaming mode: enqueue in batches as we discover
        if (onBatchFound) {
          batchBuffer.push(fileEntry);
          if (batchBuffer.length >= STREAM_BATCH_SIZE) {
            await onBatchFound([...batchBuffer]);
            batchBuffer.length = 0;
          }
        }
      }
    }

    nextLink = graphData['@odata.nextLink'] || null;
  }

  // Flush remaining buffer in streaming mode
  if (onBatchFound && batchBuffer.length > 0) {
    await onBatchFound(batchBuffer);
  }

  return results;
}

// Verificar se uma pasta existe no drive
async function folderExists(
  accessToken: string,
  driveId: string,
  folderPath: string
): Promise<boolean> {
  const encoded = encodeGraphPath(folderPath);
  const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${encoded}`;
  
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  
  return response.ok;
}

// Baixar conteúdo do arquivo diretamente do OneDrive (em memória)
async function downloadFileContent(accessToken: string, driveId: string, itemId: string): Promise<ArrayBuffer> {
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/content`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) {
    throw new Error(`Download failed: ${response.status}`);
  }

  return await response.arrayBuffer();
}

// Extrair texto de PDF usando Lovable AI
async function extractTextFromDocument(base64Content: string, fileName: string, mimeType: string): Promise<string> {
  console.log(`[onedrive-sync] Extracting text from: ${fileName}`);

  const dataUri = mimeType.includes('pdf') 
    ? `data:application/pdf;base64,${base64Content}`
    : `data:${mimeType};base64,${base64Content}`;

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
          content: `Você é um extrator de texto de documentos. Extraia TODO o texto do documento de forma estruturada, preservando:
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
                file_data: dataUri
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
    console.error(`[onedrive-sync] Text extraction error: ${response.status} - ${errorText}`);
    throw new Error(`Text extraction failed: ${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

// Estimativa simples de tokens
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// Dividir texto em chunks inteligentes
function splitIntoChunks(text: string): { content: string; index: number; tokenCount: number }[] {
  const chunks: { content: string; index: number; tokenCount: number }[] = [];
  
  const cleanText = text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!cleanText) return chunks;

  const sections = cleanText.split(/\n\n+/);
  
  let currentChunk = '';
  let chunkIndex = 0;

  for (const section of sections) {
    const sectionTokens = estimateTokens(section);
    const currentTokens = estimateTokens(currentChunk);

    if (sectionTokens > CHUNK_CONFIG.maxTokens) {
      if (currentChunk.trim()) {
        chunks.push({
          content: currentChunk.trim(),
          index: chunkIndex++,
          tokenCount: estimateTokens(currentChunk),
        });
        currentChunk = '';
      }

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
    else {
      currentChunk += section + '\n\n';
    }
  }

  if (currentChunk.trim() && currentChunk.trim().length >= CHUNK_CONFIG.minChunkSize) {
    chunks.push({
      content: currentChunk.trim(),
      index: chunkIndex,
      tokenCount: estimateTokens(currentChunk),
    });
  }

  return chunks;
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

// Processar documento inline (sem usar storage)
async function processDocumentInline(
  supabase: any,
  accessToken: string,
  driveId: string,
  item: OneDriveItem,
  category: string,
  sourcePath: string,
  existingDocId?: string
): Promise<{ success: boolean; isNew: boolean; skipped?: boolean }> {
  const startTime = Date.now();
  const fileName = item.name;
  const fileType = fileName.split('.').pop()?.toLowerCase() || 'txt';
  const mimeType = item.file?.mimeType || 'application/octet-stream';

  try {
    // 1. Baixar conteúdo diretamente do OneDrive (em memória)
    const fileContent = await downloadFileContent(accessToken, driveId, item.id);
    const base64Content = base64Encode(fileContent);

    // 2. Extrair texto do documento
    let extractedText: string;
    if (['txt', 'md', 'markdown'].includes(fileType)) {
      const decoder = new TextDecoder('utf-8');
      extractedText = decoder.decode(fileContent);
    } else {
      extractedText = await extractTextFromDocument(base64Content, fileName, mimeType);
    }

    if (!extractedText || extractedText.trim().length < 50) {
      console.log(`[onedrive-sync] Skipping ${fileName}: insufficient text content`);
      return { success: false, isNew: false, skipped: true };
    }

    // 3. Gerar hash do conteúdo
    const contentHash = await generateContentHash(extractedText);

    // 4. Verificar se documento já existe com mesmo hash
    if (existingDocId) {
      const { data: existingDoc } = await supabase
        .from('rag_documents')
        .select('content_hash')
        .eq('id', existingDocId)
        .single();

      if (existingDoc?.content_hash === contentHash) {
        console.log(`[onedrive-sync] Document unchanged: ${fileName}`);
        return { success: true, isNew: false, skipped: true };
      }
    }

    // 5. Dividir em chunks
    const chunks = splitIntoChunks(extractedText);
    const totalTokens = chunks.reduce((sum, c) => sum + c.tokenCount, 0);
    console.log(`[onedrive-sync] Created ${chunks.length} chunks for ${fileName}`);

    // 6. Criar ou atualizar documento
    let docId = existingDocId;

    if (!docId) {
      const { data: newDoc, error: insertError } = await supabase
        .from('rag_documents')
        .insert({
          file_name: fileName,
          file_type: fileType,
          category,
          source_type: 'onedrive',
          source_id: item.id,
          source_path: sourcePath,
          content_raw: extractedText,
          content_hash: contentHash,
          chunk_count: chunks.length,
          total_tokens: totalTokens,
          processing_status: 'processing',
          external_modified_at: item.lastModifiedDateTime,
        })
        .select('id')
        .single();

      if (insertError) throw new Error(`Insert document failed: ${insertError.message}`);
      docId = newDoc.id;
    } else {
      await supabase
        .from('rag_documents')
        .update({
          content_raw: extractedText,
          content_hash: contentHash,
          chunk_count: chunks.length,
          total_tokens: totalTokens,
          processing_status: 'processing',
          processing_error: null,
          external_modified_at: item.lastModifiedDateTime,
          updated_at: new Date().toISOString(),
        })
        .eq('id', docId);

      // Deletar chunks antigos
      await supabase.from('rag_chunks').delete().eq('document_id', docId);
    }

    // 7. Gerar embeddings e inserir chunks (otimizado com concorrência)
    // batchSize=10, maxConcurrent=3 para rate limiting de API
    console.log(`[onedrive-sync] Processing ${chunks.length} chunks with optimized concurrency...`);
    
    const batchResult = await processBatchWithConcurrency(
      chunks,
      async (chunk) => {
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
      }
    );

    // Insert successful chunks
    const successfulChunks = batchResult.results
      .filter(r => r.success && r.data)
      .map(r => r.data!);
    
    if (successfulChunks.length > 0) {
      await supabase.from('rag_chunks').insert(successfulChunks);
    }
    
    if (batchResult.failed > 0) {
      console.warn(`[onedrive-sync] ${batchResult.failed} chunks failed to embed`);
    }

    // 8. Atualizar status do documento
    await supabase
      .from('rag_documents')
      .update({
        processing_status: 'completed',
        last_synced_at: new Date().toISOString(),
      })
      .eq('id', docId);

    console.log(`[onedrive-sync] Processed ${fileName} in ${Date.now() - startTime}ms`);
    return { success: true, isNew: !existingDocId };

  } catch (error) {
    console.error(`[onedrive-sync] Error processing ${fileName}:`, error);
    
    // Atualizar documento com erro se existir
    if (existingDocId) {
      await supabase
        .from('rag_documents')
        .update({
          processing_status: 'failed',
          processing_error: error instanceof Error ? error.message : 'Unknown error',
        })
        .eq('id', existingDocId);
    }
    
    return { success: false, isNew: false };
  }
}

serve(async (req) => {
  const corsHeaders = getStrictCorsHeaders(req);
  
  if (req.method === 'OPTIONS') {
    return handleCorsPrelight(req, { mode: 'strict' });
  }

  const startTime = Date.now();
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Criar log de sincronização
  const { data: syncLog } = await supabase
    .from('rag_sync_logs')
    .insert({
      sync_type: 'incremental',
      source_type: 'onedrive',
      status: 'running',
    })
    .select('id')
    .single();

  const syncLogId = syncLog?.id;

  try {
    const body: SyncRequest = req.method === 'POST' ? await req.json() : {};
    const { sync_type = 'incremental', triggered_by, folder_path, discovery_mode = true } = body;

    // Buscar configuração do OneDrive
    const { data: config, error: configError } = await supabase
      .from('rag_onedrive_config')
      .select('*')
      .single();

    if (configError || !config) {
      throw new Error('OneDrive configuration not found');
    }

    if (!config.is_configured) {
      throw new Error('OneDrive integration not configured. Please set up credentials.');
    }

    // Verificar secrets
    const clientId = MICROSOFT_CLIENT_ID || config.client_id;
    const clientSecret = MICROSOFT_CLIENT_SECRET;
    const tenantId = MICROSOFT_TENANT_ID || config.tenant_id;
    const driveId = config.drive_id;

    if (!clientId || !clientSecret || !tenantId || !driveId) {
      throw new Error('Missing Microsoft credentials. Configure MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, MICROSOFT_TENANT_ID secrets.');
    }

    console.log(`[onedrive-sync] Starting sync (discovery_mode=${discovery_mode})...`);

    // Obter access token
    const accessToken = await getAccessToken(tenantId, clientId, clientSecret);
    console.log('[onedrive-sync] Obtained access token');

    // Atualizar log
    await supabase
      .from('rag_sync_logs')
      .update({ sync_type, metadata: { triggered_by, mode: discovery_mode ? 'discovery' : 'direct_processing', folder_path } })
      .eq('id', syncLogId);

    // Listar todos os arquivos
    const folderMapping = config.folder_category_mapping || {};
    const configuredRootPath = normalizeRootPath(config.root_folder_path);
    const requestedFolderPath = normalizeRootPath(folder_path);
    
    let rootFolder: FolderRef = { kind: 'root' };

    // If a folder was explicitly requested, prefer it.
    if (requestedFolderPath) {
      if (configuredRootPath && !requestedFolderPath.toLowerCase().startsWith(configuredRootPath.toLowerCase())) {
        console.log(`[onedrive-sync] WARNING: requested folder is outside configured root. Requested="${requestedFolderPath}", Root="${configuredRootPath}"`);
      }

      const pathExists = await folderExists(accessToken, driveId, requestedFolderPath);
      if (!pathExists) {
        throw new Error(`Requested folder not found in drive: ${requestedFolderPath}`);
      }

      rootFolder = { kind: 'path', path: requestedFolderPath };
      console.log(`[onedrive-sync] Using requested folder: ${requestedFolderPath}`);
    } else if (configuredRootPath) {
      const pathExists = await folderExists(accessToken, driveId, configuredRootPath);
      if (pathExists) {
        rootFolder = { kind: 'path', path: configuredRootPath };
        console.log(`[onedrive-sync] Using configured root folder: ${configuredRootPath}`);
      } else {
        console.log(`[onedrive-sync] Configured folder "${configuredRootPath}" not found, using drive root`);
      }
    }

    const files = await listFilesRecursive(accessToken, driveId, rootFolder, folderMapping);
    
    console.log(`[onedrive-sync] Found ${files.length} processable files`);

    // ========================================
    // MODO DISCOVERY: Apenas enfileira arquivos
    // ========================================
    if (discovery_mode) {
      // Buscar documentos já existentes para filtrar
      const { data: existingDocs } = await supabase
        .from('rag_documents')
        .select('source_id, external_modified_at')
        .eq('source_type', 'onedrive');
      
      const existingMap = new Map(
        (existingDocs || []).map(d => [d.source_id, d.external_modified_at])
      );

      // Filtrar arquivos que precisam ser processados (novos ou modificados)
      const filesToQueue = files.filter(({ item }) => {
        const existingModified = existingMap.get(item.id);
        if (!existingModified) return true; // Novo arquivo
        
        if (sync_type === 'full') return true; // Full sync processa tudo
        
        // Incremental: só processa se modificado
        const itemModified = new Date(item.lastModifiedDateTime);
        const existingDate = new Date(existingModified);
        return itemModified > existingDate;
      });

      console.log(`[onedrive-sync] Queueing ${filesToQueue.length} files (${files.length - filesToQueue.length} skipped as unchanged)`);

      // Inserir na fila em batches de 100
      const QUEUE_BATCH_SIZE = 100;
      let queued = 0;

      for (let i = 0; i < filesToQueue.length; i += QUEUE_BATCH_SIZE) {
        const batch = filesToQueue.slice(i, i + QUEUE_BATCH_SIZE);
        
        const queueItems = batch.map(({ item, category, path }) => ({
          sync_log_id: syncLogId,
          onedrive_item_id: item.id,
          file_name: item.name,
          file_path: path,
          file_size: item.size,
          mime_type: item.file?.mimeType,
          category,
          priority: category === 'vendas' ? 10 : category === 'treinamento' ? 5 : 0,
          status: 'pending',
          last_modified_at: item.lastModifiedDateTime,
        }));

        const { error: queueError } = await supabase
          .from('rag_sync_queue')
          .upsert(queueItems, { 
            onConflict: 'sync_log_id,onedrive_item_id',
            ignoreDuplicates: true 
          });

        if (queueError) {
          console.error('[onedrive-sync] Queue insert error:', queueError);
        } else {
          queued += batch.length;
        }
      }

      // Atualizar log com totais
      await supabase
        .from('rag_sync_logs')
        .update({
          documents_scanned: files.length,
          documents_skipped: files.length - filesToQueue.length,
          metadata: { 
            triggered_by, 
            mode: 'discovery',
            folder_path,
            queued_count: queued,
            skipped_unchanged: files.length - filesToQueue.length
          }
        })
        .eq('id', syncLogId);

      // Atualizar last_sync_at na config
      await supabase
        .from('rag_onedrive_config')
        .update({
          last_sync_at: new Date().toISOString(),
          next_sync_at: new Date(Date.now() + (config.sync_interval_hours || 6) * 60 * 60 * 1000).toISOString(),
        })
        .single();

      // Disparar batch processor se há itens na fila
      if (queued > 0) {
        console.log('[onedrive-sync] Triggering batch processor...');
        try {
          await fetch(`${SUPABASE_URL}/functions/v1/rag-batch-processor`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ batch_size: 10, continue_chain: true }),
          });
        } catch (triggerError) {
          console.error('[onedrive-sync] Failed to trigger batch processor:', triggerError);
        }
      }

      const executionTimeMs = Date.now() - startTime;
      console.log(`[onedrive-sync] Discovery complete: ${queued} queued in ${executionTimeMs}ms`);

      return new Response(
        JSON.stringify({
          success: true,
          sync_log_id: syncLogId,
          mode: 'discovery',
          stats: {
            scanned: files.length,
            queued: queued,
            skipped_unchanged: files.length - filesToQueue.length,
          },
          execution_time_ms: executionTimeMs,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========================================
    // MODO LEGADO: Processamento direto (mantido para compatibilidade)
    // ========================================
    if (!LOVABLE_API_KEY || !OPENAI_API_KEY) {
      throw new Error('Missing AI credentials. Configure COESASOLAR_OPENROUTER_API_KEY.');
    }

    let added = 0, updated = 0, skipped = 0, failed = 0;

    for (const { item, category, path } of files) {
      try {
        // Verificar se já existe
        const { data: existing } = await supabase
          .from('rag_documents')
          .select('id, external_modified_at')
          .eq('source_type', 'onedrive')
          .eq('source_id', item.id)
          .single();

        const itemModifiedAt = new Date(item.lastModifiedDateTime);

        // Skip se não modificado (sync incremental)
        if (existing && sync_type === 'incremental') {
          const existingModifiedAt = existing.external_modified_at 
            ? new Date(existing.external_modified_at) 
            : null;
          
          if (existingModifiedAt && itemModifiedAt <= existingModifiedAt) {
            skipped++;
            continue;
          }
        }

        // Processar documento diretamente do OneDrive
        const result = await processDocumentInline(
          supabase,
          accessToken,
          driveId,
          item,
          category,
          path,
          existing?.id
        );

        if (result.skipped) {
          skipped++;
        } else if (result.success) {
          if (result.isNew) {
            added++;
          } else {
            updated++;
          }
        } else {
          failed++;
        }

      } catch (fileError) {
        failed++;
        console.error(`[onedrive-sync] Error processing ${item.name}:`, fileError);
      }
    }

    const executionTimeMs = Date.now() - startTime;

    // Atualizar log de sincronização
    await supabase
      .from('rag_sync_logs')
      .update({
        status: 'completed',
        documents_scanned: files.length,
        documents_added: added,
        documents_updated: updated,
        documents_skipped: skipped,
        documents_failed: failed,
        completed_at: new Date().toISOString(),
      })
      .eq('id', syncLogId);

    // Atualizar last_sync_at na config
    await supabase
      .from('rag_onedrive_config')
      .update({
        last_sync_at: new Date().toISOString(),
        next_sync_at: new Date(Date.now() + (config.sync_interval_hours || 6) * 60 * 60 * 1000).toISOString(),
      })
      .single();

    console.log(`[onedrive-sync] Completed: added=${added}, updated=${updated}, skipped=${skipped}, failed=${failed}`);

    return new Response(
      JSON.stringify({
        success: true,
        sync_log_id: syncLogId,
        mode: 'direct_processing',
        stats: {
          scanned: files.length,
          added,
          updated,
          skipped,
          failed,
        },
        execution_time_ms: executionTimeMs,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[onedrive-sync] Error:', error);

    // Atualizar log com erro
    if (syncLogId) {
      await supabase
        .from('rag_sync_logs')
        .update({
          status: 'failed',
          error_message: error instanceof Error ? error.message : 'Unknown error',
          completed_at: new Date().toISOString(),
        })
        .eq('id', syncLogId);
    }

    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        sync_log_id: syncLogId,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
