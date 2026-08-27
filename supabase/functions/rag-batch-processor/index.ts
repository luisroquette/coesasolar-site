import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";
import JSZip from "https://esm.sh/jszip@3.10.1";

/**
 * rag-batch-processor: Processa arquivos da fila rag_sync_queue em lotes
 * 
 * ARQUITETURA V2 COM PROCESSAMENTO PARALELO:
 * 1. Gera worker_id único para esta instância
 * 2. Busca próximo lote via claim_rag_sync_batch_for_worker (lock otimista)
 * 3. Processa cada arquivo (download + extração + embedding)
 * 4. Se ainda houver pendentes E workers < max_concurrency, dispara workers paralelos
 * 
 * Evita timeout processando poucos arquivos por chamada.
 * Suporta múltiplos workers simultâneos para alta throughput.
 * 
 * TIPOS DE ARQUIVO SUPORTADOS:
 * - pdf, docx, doc: extração via AI (Lovable/Gemini)
 * - txt, md, markdown: leitura direta
 * - xlsx, xls: parsing via SheetJS
 * - pptx: extração de texto dos slides via JSZip
 */

import { getStrictCorsHeaders, handleCorsPrelight } from '../_shared/security-helpers.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const MICROSOFT_CLIENT_ID = Deno.env.get('MICROSOFT_CLIENT_ID');
const MICROSOFT_CLIENT_SECRET = Deno.env.get('MICROSOFT_CLIENT_SECRET');
const MICROSOFT_TENANT_ID = Deno.env.get('MICROSOFT_TENANT_ID');
const LOVABLE_API_KEY = Deno.env.get('COESASOLAR_OPENROUTER_API_KEY') ?? Deno.env.get('OPENROUTER_API_KEY');
const OPENAI_API_KEY = LOVABLE_API_KEY;

interface QueueItem {
  id: string;
  sync_log_id: string;
  onedrive_item_id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  category: string;
  attempts: number;
  last_modified_at: string;
}

interface ProcessRequest {
  sync_log_id?: string;
  batch_size?: number;
  continue_chain?: boolean;
  worker_id?: string;
}

// Configurações de chunking
const CHUNK_CONFIG = {
  maxTokens: 500,
  overlapTokens: 50,
  minChunkSize: 100,
};

// Configurações de memória - Edge Functions têm limite de ~150MB
const MEMORY_CONFIG = {
  maxFileSizeMB: 5, // Reduzido para 5MB para garantir estabilidade
  defaultBatchSize: 2, // Batch de 2 para evitar estouro de memória
  maxConcurrentEmbeddings: 1, // Embeddings sequenciais (1 por vez)
};

// Tipos de arquivo suportados para extração de texto
const SUPPORTED_FILE_TYPES = ['pdf', 'docx', 'doc', 'txt', 'md', 'markdown', 'xlsx', 'xls', 'pptx'];
const LOCAL_PARSE_TYPES = ['txt', 'md', 'markdown', 'xlsx', 'xls', 'pptx', 'docx']; // Tipos com parsing local
const UNSUPPORTED_FILE_TYPES = ['ppt', 'doc', 'zip', 'rar', 'exe', 'dll', 'jpg', 'jpeg', 'png', 'gif', 'mp4', 'mp3'];

function isFileTypeSupported(fileName: string): { supported: boolean; reason?: string } {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  
  if (UNSUPPORTED_FILE_TYPES.includes(ext)) {
    return { supported: false, reason: `Tipo de arquivo não suportado: .${ext}` };
  }
  
  if (!SUPPORTED_FILE_TYPES.includes(ext)) {
    return { supported: false, reason: `Extensão desconhecida: .${ext}` };
  }
  
  return { supported: true };
}

// Extrair texto de arquivos Excel (xlsx/xls)
function extractTextFromExcel(fileContent: ArrayBuffer): string {
  try {
    const workbook = XLSX.read(fileContent, { type: 'array' });
    const textParts: string[] = [];
    
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      textParts.push(`## Planilha: ${sheetName}\n`);
      
      // Converter para CSV para preservar estrutura tabular
      const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
      if (csv.trim()) {
        textParts.push(csv);
      }
      textParts.push('\n');
    }
    
    return textParts.join('\n').trim();
  } catch (error) {
    console.error('[rag-batch-processor] Error parsing Excel:', error);
    throw new Error(`Falha ao processar Excel: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
  }
}

// Extrair texto de arquivos PowerPoint (pptx)
async function extractTextFromPowerPoint(fileContent: ArrayBuffer): Promise<string> {
  try {
    const zip = await JSZip.loadAsync(fileContent);
    const textParts: string[] = [];
    
    // PPTX slides são armazenados em ppt/slides/slide{N}.xml
    const slideFiles = Object.keys(zip.files)
      .filter(name => name.match(/^ppt\/slides\/slide\d+\.xml$/))
      .sort((a, b) => {
        const numA = parseInt(a.match(/slide(\d+)/)?.[1] || '0');
        const numB = parseInt(b.match(/slide(\d+)/)?.[1] || '0');
        return numA - numB;
      });
    
    for (const slideFile of slideFiles) {
      const slideNum = slideFile.match(/slide(\d+)/)?.[1];
      const content = await zip.files[slideFile].async('text');
      
      // Extrair texto dos elementos XML (tags <a:t> contêm texto)
      const textMatches = content.match(/<a:t>([^<]*)<\/a:t>/g) || [];
      const slideTexts = textMatches
        .map(match => match.replace(/<\/?a:t>/g, '').trim())
        .filter(text => text.length > 0);
      
      if (slideTexts.length > 0) {
        textParts.push(`## Slide ${slideNum}\n${slideTexts.join('\n')}\n`);
      }
    }
    
    // Também extrair notas do apresentador se existirem
    const notesFiles = Object.keys(zip.files)
      .filter(name => name.match(/^ppt\/notesSlides\/notesSlide\d+\.xml$/));
    
    for (const notesFile of notesFiles) {
      const slideNum = notesFile.match(/notesSlide(\d+)/)?.[1];
      const content = await zip.files[notesFile].async('text');
      
      const textMatches = content.match(/<a:t>([^<]*)<\/a:t>/g) || [];
      const notesTexts = textMatches
        .map(match => match.replace(/<\/?a:t>/g, '').trim())
        .filter(text => text.length > 0 && !text.match(/^\d+$/)); // Ignorar números de slide
      
      if (notesTexts.length > 0) {
        textParts.push(`### Notas do Slide ${slideNum}\n${notesTexts.join('\n')}\n`);
      }
    }
    
    return textParts.join('\n').trim();
  } catch (error) {
    console.error('[rag-batch-processor] Error parsing PowerPoint:', error);
    throw new Error(`Falha ao processar PowerPoint: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
  }
}

// Extrair texto de arquivos Word (docx)
async function extractTextFromDocx(fileContent: ArrayBuffer): Promise<string> {
  try {
    const zip = await JSZip.loadAsync(fileContent);
    const textParts: string[] = [];
    
    // DOCX armazena conteúdo principal em word/document.xml
    const documentXml = zip.files['word/document.xml'];
    if (!documentXml) {
      throw new Error('Arquivo document.xml não encontrado no DOCX');
    }
    
    const content = await documentXml.async('text');
    
    // Extrair texto dos parágrafos (tags <w:t> contêm texto)
    const textMatches = content.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
    
    let currentParagraph = '';
    let lastWasParagraphEnd = false;
    
    // Processar mantendo estrutura de parágrafos
    const paragraphRegex = /<w:p[^>]*>(.*?)<\/w:p>/gs;
    let paragraphMatch;
    
    while ((paragraphMatch = paragraphRegex.exec(content)) !== null) {
      const paragraphContent = paragraphMatch[1];
      const paragraphTexts = paragraphContent.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
      
      const paragraphText = paragraphTexts
        .map(match => {
          const textMatch = match.match(/<w:t[^>]*>([^<]*)<\/w:t>/);
          return textMatch ? textMatch[1] : '';
        })
        .join('');
      
      if (paragraphText.trim()) {
        textParts.push(paragraphText.trim());
      }
    }
    
    // Se não encontrou parágrafos estruturados, usar extração simples
    if (textParts.length === 0) {
      const simpleTexts = textMatches
        .map(match => {
          const textMatch = match.match(/<w:t[^>]*>([^<]*)<\/w:t>/);
          return textMatch ? textMatch[1] : '';
        })
        .filter(text => text.length > 0);
      
      return simpleTexts.join(' ').trim();
    }
    
    return textParts.join('\n\n').trim();
  } catch (error) {
    console.error('[rag-batch-processor] Error parsing DOCX:', error);
    throw new Error(`Falha ao processar DOCX: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
  }
}

// Gerar worker ID único
function generateWorkerId(): string {
  return `worker-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
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

// Baixar conteúdo do arquivo diretamente do OneDrive
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

// Extrair texto de documento usando Lovable AI
async function extractTextFromDocument(base64Content: string, fileName: string, mimeType: string): Promise<string> {
  console.log(`[rag-batch-processor] Extracting text from: ${fileName}`);

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
    throw new Error(`Text extraction failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

// Estimativa de tokens
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// Dividir texto em chunks
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

// Gerar embedding
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

// Gerar hash do conteúdo
async function generateContentHash(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Processar um item da fila
async function processQueueItem(
  supabase: any,
  accessToken: string,
  driveId: string,
  item: QueueItem
): Promise<{ success: boolean; error?: string; skipped?: boolean; documentId?: string }> {
  const startTime = Date.now();
  const fileName = item.file_name;
  const fileType = fileName.split('.').pop()?.toLowerCase() || 'txt';
  const mimeType = item.mime_type || 'application/octet-stream';

  // Verificar se tipo de arquivo é suportado
  const fileTypeCheck = isFileTypeSupported(fileName);
  if (!fileTypeCheck.supported) {
    console.log(`[rag-batch-processor] Skipping unsupported file: ${fileName} - ${fileTypeCheck.reason}`);
    return { success: true, skipped: true, error: fileTypeCheck.reason };
  }

  // Verificar tamanho do arquivo para evitar estouro de memória
  const fileSizeMB = (item.file_size || 0) / (1024 * 1024);
  if (fileSizeMB > MEMORY_CONFIG.maxFileSizeMB) {
    console.log(`[rag-batch-processor] Skipping large file: ${fileName} (${fileSizeMB.toFixed(1)}MB > ${MEMORY_CONFIG.maxFileSizeMB}MB limit)`);
    return { success: true, skipped: true, error: `Arquivo muito grande: ${fileSizeMB.toFixed(1)}MB (máximo: ${MEMORY_CONFIG.maxFileSizeMB}MB)` };
  }

  try {
    // 1. Verificar se documento já existe com mesmo source_id
    const { data: existing } = await supabase
      .from('rag_documents')
      .select('id, content_hash, external_modified_at')
      .eq('source_type', 'onedrive')
      .eq('source_id', item.onedrive_item_id)
      .maybeSingle();

    // 2. Baixar conteúdo do OneDrive
    console.log(`[rag-batch-processor] Downloading: ${fileName} (${fileSizeMB.toFixed(1)}MB)`);
    const fileContent = await downloadFileContent(accessToken, driveId, item.onedrive_item_id);
    const base64Content = base64Encode(fileContent);

    // 3. Extrair texto baseado no tipo de arquivo
    let extractedText: string;
    if (['txt', 'md', 'markdown'].includes(fileType)) {
      // Arquivos de texto puro - leitura direta
      const decoder = new TextDecoder('utf-8');
      extractedText = decoder.decode(fileContent);
    } else if (['xlsx', 'xls'].includes(fileType)) {
      // Excel - parsing via SheetJS
      console.log(`[rag-batch-processor] Parsing Excel: ${fileName}`);
      extractedText = extractTextFromExcel(fileContent);
    } else if (fileType === 'pptx') {
      // PowerPoint - extração de texto dos slides
      console.log(`[rag-batch-processor] Parsing PowerPoint: ${fileName}`);
      extractedText = await extractTextFromPowerPoint(fileContent);
    } else if (fileType === 'docx') {
      // Word DOCX - extração de texto via JSZip
      console.log(`[rag-batch-processor] Parsing DOCX: ${fileName}`);
      extractedText = await extractTextFromDocx(fileContent);
    } else {
      // PDF - extração via AI
      extractedText = await extractTextFromDocument(base64Content, fileName, mimeType);
    }

    if (!extractedText || extractedText.trim().length < 50) {
      console.log(`[rag-batch-processor] Skipping ${fileName}: insufficient text content`);
      return { success: true, skipped: true };
    }

    // 4. Gerar hash e verificar se mudou
    const contentHash = await generateContentHash(extractedText);

    if (existing?.content_hash === contentHash) {
      console.log(`[rag-batch-processor] Document unchanged: ${fileName}`);
      return { success: true, skipped: true, documentId: existing.id };
    }

    // 5. Dividir em chunks
    const chunks = splitIntoChunks(extractedText);
    const totalTokens = chunks.reduce((sum, c) => sum + c.tokenCount, 0);
    console.log(`[rag-batch-processor] Created ${chunks.length} chunks for ${fileName}`);

    // 6. Criar ou atualizar documento
    let docId = existing?.id;

    if (!docId) {
      const { data: newDoc, error: insertError } = await supabase
        .from('rag_documents')
        .insert({
          file_name: fileName,
          file_type: fileType,
          category: item.category,
          source_type: 'onedrive',
          source_id: item.onedrive_item_id,
          source_path: item.file_path,
          content_raw: extractedText,
          content_hash: contentHash,
          chunk_count: chunks.length,
          total_tokens: totalTokens,
          processing_status: 'processing',
          external_modified_at: item.last_modified_at,
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
          external_modified_at: item.last_modified_at,
          updated_at: new Date().toISOString(),
        })
        .eq('id', docId);

      // Deletar chunks antigos
      await supabase.from('rag_chunks').delete().eq('document_id', docId);
    }

    // 7. Gerar embeddings e inserir chunks (em batches menores para economizar memória)
    const EMBEDDING_BATCH_SIZE = MEMORY_CONFIG.maxConcurrentEmbeddings;
    for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
      const batch = chunks.slice(i, i + EMBEDDING_BATCH_SIZE);
      
      // Processar embeddings sequencialmente para reduzir uso de memória
      const chunkInserts = [];
      for (const chunk of batch) {
        const embedding = await generateEmbedding(chunk.content);
        chunkInserts.push({
          document_id: docId,
          chunk_index: chunk.index,
          content: chunk.content,
          embedding: `[${embedding.join(',')}]`,
          token_count: chunk.tokenCount,
          char_count: chunk.content.length,
          metadata: {},
        });
      }

      await supabase.from('rag_chunks').insert(chunkInserts);
    }

    // 8. Atualizar status do documento
    await supabase
      .from('rag_documents')
      .update({
        processing_status: 'completed',
        last_synced_at: new Date().toISOString(),
      })
      .eq('id', docId);

    console.log(`[rag-batch-processor] Processed ${fileName} in ${Date.now() - startTime}ms`);
    return { success: true, documentId: docId };

  } catch (error) {
    console.error(`[rag-batch-processor] Error processing ${fileName}:`, error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

// Disparar workers adicionais se necessário
async function triggerParallelWorkers(
  supabase: any,
  currentWorkerId: string,
  maxConcurrency: number,
  batchSize: number,
  delay: number
) {
  // Buscar workers ativos
  const { data: activeWorkers } = await supabase.rpc('get_active_rag_workers');
  const activeCount = activeWorkers?.length || 0;

  // Calcular quantos workers adicionais podemos disparar
  const availableSlots = Math.max(0, maxConcurrency - activeCount - 1); // -1 porque já estamos executando

  if (availableSlots > 0) {
    console.log(`[rag-batch-processor] Spawning ${availableSlots} additional workers (${activeCount + 1}/${maxConcurrency} active)`);
    
    // Disparar workers adicionais com delays escalonados
    for (let i = 0; i < availableSlots; i++) {
      const workerDelay = delay * (i + 1);
      
      setTimeout(async () => {
        try {
          await fetch(`${SUPABASE_URL}/functions/v1/rag-batch-processor`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
              batch_size: batchSize, 
              continue_chain: true,
              worker_id: generateWorkerId()
            }),
          });
        } catch (e) {
          console.error('[rag-batch-processor] Failed to spawn worker:', e);
        }
      }, workerDelay);
    }
  }
}

serve(async (req) => {
  const corsHeaders = getStrictCorsHeaders(req);
  
  if (req.method === 'OPTIONS') {
    return handleCorsPrelight(req, { mode: 'strict' });
  }

  const startTime = Date.now();
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const body: ProcessRequest = req.method === 'POST' ? await req.json() : {};
    // Batch size reduzido de 10 para 3 para evitar estouro de memória em Edge Functions
    const { batch_size = MEMORY_CONFIG.defaultBatchSize, continue_chain = true, worker_id } = body;

    // Gerar ou usar worker_id existente
    const myWorkerId = worker_id || generateWorkerId();
    console.log(`[rag-batch-processor] Worker ${myWorkerId} starting...`);

    // Verificar secrets
    if (!MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET || !MICROSOFT_TENANT_ID) {
      throw new Error('Missing Microsoft credentials');
    }

    if (!LOVABLE_API_KEY || !OPENAI_API_KEY) {
      throw new Error('Missing AI credentials');
    }

    // Buscar configurações
    const { data: configs } = await supabase
      .from('configuracoes_sistema')
      .select('chave, valor')
      .in('chave', ['rag_sync_worker_concurrency', 'rag_sync_batch_delay_ms']);

    const configMap = new Map(configs?.map((c: any) => [c.chave, c.valor]) || []);
    const maxConcurrency = parseInt(configMap.get('rag_sync_worker_concurrency') || '3', 10);
    const delay = parseInt(configMap.get('rag_sync_batch_delay_ms') || '500', 10);

    // Buscar configuração do OneDrive para obter driveId
    const { data: config } = await supabase
      .from('rag_onedrive_config')
      .select('drive_id, client_id, tenant_id')
      .single();

    if (!config?.drive_id) {
      throw new Error('OneDrive drive_id not configured');
    }

    const driveId = config.drive_id;
    const clientId = MICROSOFT_CLIENT_ID || config.client_id;
    const tenantId = MICROSOFT_TENANT_ID || config.tenant_id;

    // Limpar itens travados antes de processar
    await supabase.rpc('cleanup_stale_rag_processing');

    // Obter access token
    const accessToken = await getAccessToken(tenantId, clientId, MICROSOFT_CLIENT_SECRET);

    // Buscar próximo batch usando a função com worker_id
    const { data: batch, error: batchError } = await supabase
      .rpc('claim_rag_sync_batch_for_worker', { 
        p_worker_id: myWorkerId, 
        p_batch_size: batch_size 
      });

    if (batchError) {
      throw new Error(`Failed to claim batch: ${batchError.message}`);
    }

    if (!batch || batch.length === 0) {
      console.log(`[rag-batch-processor] Worker ${myWorkerId}: No pending items`);
      return new Response(
        JSON.stringify({
          success: true,
          worker_id: myWorkerId,
          message: 'No pending items',
          stats: { processed: 0, pending: 0 }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[rag-batch-processor] Worker ${myWorkerId}: Processing batch of ${batch.length} items`);

    let processed = 0, failed = 0, skipped = 0;

    // Processar cada item
    for (const item of batch) {
      const result = await processQueueItem(supabase, accessToken, driveId, item as QueueItem);

      // Atualizar status do item na fila
      if (result.success) {
        if (result.skipped) {
          await supabase
            .from('rag_sync_queue')
            .update({
              status: 'skipped',
              processed_at: new Date().toISOString(),
              document_id: result.documentId,
              worker_id: myWorkerId,
            })
            .eq('id', item.id);
          skipped++;
        } else {
          await supabase
            .from('rag_sync_queue')
            .update({
              status: 'completed',
              processed_at: new Date().toISOString(),
              document_id: result.documentId,
              worker_id: myWorkerId,
            })
            .eq('id', item.id);
          processed++;
        }
      } else {
        const shouldRetry = (item as QueueItem).attempts < 3;
        await supabase
          .from('rag_sync_queue')
          .update({
            status: shouldRetry ? 'pending' : 'failed',
            last_error: result.error,
            processed_at: shouldRetry ? null : new Date().toISOString(),
            worker_id: shouldRetry ? null : myWorkerId,
          })
          .eq('id', item.id);
        failed++;
      }
    }

    // Verificar se há mais pendentes
    const { data: statsData } = await supabase
      .rpc('get_rag_sync_queue_stats', { p_sync_log_id: null });
    
    const stats = statsData?.[0] || { pending: 0 };
    const hasPending = stats.pending > 0;

    // Se configurado e há mais pendentes, dispara próximo batch e workers paralelos
    if (continue_chain && hasPending) {
      console.log(`[rag-batch-processor] Worker ${myWorkerId}: ${stats.pending} pending, scheduling continuation`);
      
      // Disparar workers paralelos se necessário
      await triggerParallelWorkers(supabase, myWorkerId, maxConcurrency, batch_size, delay);
      
      // Disparar próximo batch deste worker
      setTimeout(async () => {
        try {
          await fetch(`${SUPABASE_URL}/functions/v1/rag-batch-processor`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
              batch_size, 
              continue_chain: true,
              worker_id: myWorkerId 
            }),
          });
        } catch (e) {
          console.error('[rag-batch-processor] Failed to trigger next batch:', e);
        }
      }, delay);
    }

    const executionTime = Date.now() - startTime;
    console.log(`[rag-batch-processor] Worker ${myWorkerId}: Batch complete: processed=${processed}, skipped=${skipped}, failed=${failed} in ${executionTime}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        worker_id: myWorkerId,
        stats: {
          processed,
          skipped,
          failed,
          remaining: stats.pending,
          has_more: hasPending,
        },
        execution_time_ms: executionTime,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[rag-batch-processor] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
