import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getStrictCorsHeaders, handleCorsPrelight } from '../_shared/security-helpers.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const OPENAI_API_KEY = (Deno.env.get('COESASOLAR_OPENROUTER_API_KEY') ?? Deno.env.get('OPENROUTER_API_KEY'))!;
const MICROSOFT_TENANT_ID = Deno.env.get('MICROSOFT_TENANT_ID');
const MICROSOFT_CLIENT_ID = Deno.env.get('MICROSOFT_CLIENT_ID');
const MICROSOFT_CLIENT_SECRET = Deno.env.get('MICROSOFT_CLIENT_SECRET');

// ============= TYPES =============

interface ProcessRequest {
  folder_path?: string;
  max_conversations?: number;
  dry_run?: boolean;
  skip_existing?: boolean;
  learning_type?: 'success' | 'failure' | 'neutral' | 'auto';
}

interface LearningFoldersConfig {
  success_folder: string;
  failure_folder: string;
  auto_detect_from_content: boolean;
}

interface WhatsAppMessage {
  timestamp: Date;
  sender: string;
  content: string;
  isBot: boolean;
  isClient: boolean;
}

interface ConversationAnalysis {
  totalMessages: number;
  clientMessages: number;
  botMessages: number;
  duration: number; // in hours
  outcome: 'conversao' | 'qualificacao' | 'objecao_tratada' | 'perdido' | 'indefinido';
  objectionsHandled: string[];
  stagesPassed: string[];
  keyMoments: { type: string; startIndex: number; endIndex: number; content: string }[];
  qualityScore: number;
}

interface ConversationChunk {
  type: 'conversa_completa' | 'tratamento_objecao' | 'fechamento_efetivo' | 'qualificacao_exemplo' | 'abertura_eficaz';
  content: string;
  metadata: {
    outcome: string;
    objections_handled: string[];
    stages_passed: string[];
    quality_score: number;
    message_count: number;
    source_file: string;
  };
}

// ============= CONSTANTS =============

const SUCCESS_KEYWORDS = [
  'proposta enviada', 'proposta encaminhada', 'enviei a proposta',
  'contrato assinado', 'assinou o contrato', 'fechamos',
  'bem-vindo à coesa', 'parabéns pela adesão',
  'ativação confirmada', 'sua economia começa'
];

const QUALIFICATION_KEYWORDS = [
  'conta de luz', 'fatura', 'kwh', 'consumo',
  'cpf', 'cnpj', 'documento', 'endereço',
  'cemig', 'cpfl', 'energisa', 'celpe', 'coelba'
];

const OBJECTION_PATTERNS: { pattern: RegExp; category: string }[] = [
  { pattern: /golpe|fraude|piramide|enganar/i, category: 'confianca' },
  { pattern: /caro|preço|desconto (baixo|pequeno)|economia (pouca|baixa)/i, category: 'preco' },
  { pattern: /não (entendi|compreendi)|como funciona|explica (melhor|direito)/i, category: 'funcionamento' },
  { pattern: /fidelidade|multa|cancelar|sair quando quiser/i, category: 'contrato' },
  { pattern: /marido|esposa|sócio|parceiro|consultar/i, category: 'decisao_compartilhada' },
  { pattern: /aneel|regulament|legal|lei/i, category: 'regulatorio' },
  { pattern: /já tenho|solar|placa|painel/i, category: 'comparacao' },
  { pattern: /depois|agora não|ocupado|sem tempo/i, category: 'tempo' },
  { pattern: /medo|risco|garantia|seguro/i, category: 'risco' },
];

const BOT_IDENTIFIERS = [
  'sofia', 'sofiá', 'coesa', 'atendente', 'assistente',
  '📊', '💡', '🌱', '✅', '👋' // Sofia typically uses these emojis
];

// ============= GRAPH API HELPERS =============

async function getAccessToken(): Promise<string> {
  if (!MICROSOFT_TENANT_ID || !MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET) {
    throw new Error('Microsoft Graph credentials not configured');
  }

  const tokenUrl = `https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}/oauth2/v2.0/token`;
  const response = await fetch(tokenUrl, {
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
    const error = await response.text();
    throw new Error(`Failed to get access token: ${error}`);
  }

  const data = await response.json();
  return data.access_token;
}

async function listFolderContents(
  accessToken: string,
  driveId: string,
  folderPath: string
): Promise<{ files: any[]; folders: any[] }> {
  const encodedPath = encodeURIComponent(folderPath);
  const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${encodedPath}:/children?$top=500`;

  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to list folder: ${error}`);
  }

  const data = await response.json();
  const items = data.value || [];

  return {
    files: items.filter((i: any) => i.file),
    folders: items.filter((i: any) => i.folder),
  };
}

async function downloadFileContent(
  accessToken: string,
  driveId: string,
  itemId: string
): Promise<string> {
  const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/content`;
  
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.status}`);
  }

  return await response.text();
}

// ============= WHATSAPP PARSER =============

function parseWhatsAppChat(content: string, fileName: string): WhatsAppMessage[] {
  const messages: WhatsAppMessage[] = [];
  
  // Check if it's HTML format (WAChatsBackup exports as HTML)
  const isHtml = content.includes('<html') || content.includes('<!DOCTYPE');
  
  if (isHtml) {
    return parseWhatsAppHtml(content, fileName);
  }
  
  // Plain text WhatsApp export formats:
  // [DD/MM/YYYY, HH:MM:SS] Sender: Message
  // DD/MM/YYYY HH:MM - Sender: Message
  const patterns = [
    /\[(\d{2}\/\d{2}\/\d{4}),?\s*(\d{2}:\d{2}(?::\d{2})?)\]\s*([^:]+):\s*([\s\S]*?)(?=\[\d{2}\/\d{2}\/\d{4}|$)/g,
    /(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2})\s*-\s*([^:]+):\s*([\s\S]*?)(?=\d{2}\/\d{2}\/\d{4}|$)/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const [, date, time, sender, message] = match;
      const senderClean = sender.trim();
      const messageClean = message.trim();
      
      if (!messageClean || messageClean === '<Mídia oculta>') continue;

      const isBot = BOT_IDENTIFIERS.some(id => 
        senderClean.toLowerCase().includes(id.toLowerCase()) ||
        messageClean.substring(0, 50).toLowerCase().includes(id.toLowerCase())
      );

      messages.push({
        timestamp: parseDate(date, time),
        sender: senderClean,
        content: messageClean,
        isBot,
        isClient: !isBot && !senderClean.toLowerCase().includes('sistema'),
      });
    }
    
    if (messages.length > 0) break;
  }

  return messages;
}

function parseWhatsAppHtml(content: string, fileName: string): WhatsAppMessage[] {
  const messages: WhatsAppMessage[] = [];
  
  // WAChatsBackup HTML format has messages in divs with class "message"
  // Pattern for message blocks: <div class="message (incoming|outgoing)">...</div>
  // Timestamp in <span class="timestamp">...</span>
  // Content in <div class="msg-text">...</div> or <span class="text">...</span>
  
  // Extract phone number from filename for sender identification
  const phoneMatch = fileName.match(/\+55\s*\d+\s*\d+/);
  const clientPhone = phoneMatch ? phoneMatch[0].replace(/\s/g, '') : 'Cliente';
  
  // Simpler approach: find all message content between tags
  // Pattern: outgoing = bot, incoming = client
  
  // First try: look for message containers with direction
  const outgoingPattern = /<div[^>]*class="[^"]*message[^"]*outgoing[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?=<div|$)/gi;
  const incomingPattern = /<div[^>]*class="[^"]*message[^"]*incoming[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?=<div|$)/gi;
  
  // Try to extract text content from HTML
  // Look for patterns like: <span class="text">message content</span>
  const textPattern = /<(?:span|div)[^>]*class="[^"]*(?:text|msg-text|message-text)[^"]*"[^>]*>([\s\S]*?)<\/(?:span|div)>/gi;
  
  // Alternative: strip HTML and look for conversation patterns
  const strippedContent = content
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\n\s*\n/g, '\n')
    .trim();
  
  // Look for patterns in stripped content
  // Common format: timestamp + sender/direction indicator + message
  const lines = strippedContent.split('\n').filter(l => l.trim().length > 5);
  
  let lastWasBot = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip very short lines or common HTML artifacts
    if (line.length < 10) continue;
    if (line.match(/^(WhatsApp|Chat|Export|Media|PDF|Audio|Video|Image)/i)) continue;
    
    // Try to detect if line is a timestamp or metadata
    const isTimestamp = /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(line) || 
                        /^\d{1,2}:\d{2}/.test(line);
    if (isTimestamp) continue;
    
    // Check for bot identifiers in the message
    const isBot = BOT_IDENTIFIERS.some(id => 
      line.toLowerCase().includes(id.toLowerCase())
    );
    
    // Alternate between bot and client based on content patterns
    // Messages with emojis like 📊💡🌱 are typically bot
    // Short responses like "sim", "ok", "pode" are typically client
    const hasTypicalBotPatterns = /[📊💡🌱✅👋🎉]|economia|proposta|coesa|cemig|fatura/i.test(line);
    const hasTypicalClientPatterns = /^(sim|não|ok|pode|certo|entendi|beleza|blz|vlw|obrigad[oa]?)[\s.,!?]*$/i.test(line);
    
    const finalIsBot = isBot || hasTypicalBotPatterns && !hasTypicalClientPatterns;
    
    messages.push({
      timestamp: new Date(),
      sender: finalIsBot ? 'Sofia' : clientPhone,
      content: line,
      isBot: finalIsBot,
      isClient: !finalIsBot,
    });
    
    lastWasBot = finalIsBot;
  }
  
  return messages;
}

function parseDate(date: string, time: string): Date {
  const [day, month, year] = date.split('/').map(Number);
  const [hour, minute, second = 0] = time.split(':').map(Number);
  return new Date(year, month - 1, day, hour, minute, second);
}

// ============= CONVERSATION ANALYSIS =============

function analyzeConversation(messages: WhatsAppMessage[]): ConversationAnalysis {
  const clientMessages = messages.filter(m => m.isClient);
  const botMessages = messages.filter(m => m.isBot);
  
  // Calculate duration
  const timestamps = messages.map(m => m.timestamp.getTime()).filter(t => !isNaN(t));
  const duration = timestamps.length >= 2 
    ? (Math.max(...timestamps) - Math.min(...timestamps)) / (1000 * 60 * 60)
    : 0;

  // Detect objections handled
  const objectionsHandled: string[] = [];
  const allContent = messages.map(m => m.content).join(' ').toLowerCase();
  
  for (const { pattern, category } of OBJECTION_PATTERNS) {
    if (pattern.test(allContent)) {
      objectionsHandled.push(category);
    }
  }

  // Detect stages passed
  const stagesPassed: string[] = [];
  if (QUALIFICATION_KEYWORDS.some(kw => allContent.includes(kw.toLowerCase()))) {
    stagesPassed.push('qualificacao');
  }
  if (allContent.includes('proposta')) {
    stagesPassed.push('proposta');
  }
  if (SUCCESS_KEYWORDS.some(kw => allContent.includes(kw.toLowerCase()))) {
    stagesPassed.push('fechamento');
  }

  // Determine outcome
  let outcome: ConversationAnalysis['outcome'] = 'indefinido';
  if (SUCCESS_KEYWORDS.some(kw => allContent.includes(kw.toLowerCase()))) {
    outcome = 'conversao';
  } else if (objectionsHandled.length > 0 && botMessages.length > 3) {
    outcome = 'objecao_tratada';
  } else if (stagesPassed.includes('qualificacao')) {
    outcome = 'qualificacao';
  }

  // Find key moments
  const keyMoments: ConversationAnalysis['keyMoments'] = [];
  
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const content = msg.content.toLowerCase();
    
    // Objection treatment: client objection followed by bot response
    for (const { pattern, category } of OBJECTION_PATTERNS) {
      if (msg.isClient && pattern.test(content)) {
        // Find bot response
        const botResponse = messages.slice(i + 1, i + 4).find(m => m.isBot);
        if (botResponse) {
          const endIdx = messages.indexOf(botResponse);
          keyMoments.push({
            type: `objecao_${category}`,
            startIndex: i,
            endIndex: endIdx,
            content: messages.slice(i, endIdx + 1).map(m => 
              `${m.isBot ? '[BOT]' : '[CLIENTE]'}: ${m.content}`
            ).join('\n'),
          });
        }
        break;
      }
    }
    
    // Closing moment
    if (msg.isBot && SUCCESS_KEYWORDS.some(kw => content.includes(kw.toLowerCase()))) {
      const startIdx = Math.max(0, i - 5);
      keyMoments.push({
        type: 'fechamento',
        startIndex: startIdx,
        endIndex: i,
        content: messages.slice(startIdx, i + 1).map(m => 
          `${m.isBot ? '[BOT]' : '[CLIENTE]'}: ${m.content}`
        ).join('\n'),
      });
    }
  }

  // Calculate quality score (0-100)
  let qualityScore = 50;
  if (outcome === 'conversao') qualityScore += 30;
  if (objectionsHandled.length > 0) qualityScore += 10;
  if (stagesPassed.length >= 2) qualityScore += 10;
  if (botMessages.length > 5 && clientMessages.length > 3) qualityScore += 5;
  qualityScore = Math.min(100, qualityScore);

  return {
    totalMessages: messages.length,
    clientMessages: clientMessages.length,
    botMessages: botMessages.length,
    duration,
    outcome,
    objectionsHandled: [...new Set(objectionsHandled)],
    stagesPassed: [...new Set(stagesPassed)],
    keyMoments,
    qualityScore,
  };
}

// ============= CHUNK GENERATION =============

function generateChunks(
  messages: WhatsAppMessage[],
  analysis: ConversationAnalysis,
  sourceFile: string
): ConversationChunk[] {
  const chunks: ConversationChunk[] = [];
  const baseMetadata = {
    outcome: analysis.outcome,
    objections_handled: analysis.objectionsHandled,
    stages_passed: analysis.stagesPassed,
    quality_score: analysis.qualityScore,
    message_count: analysis.totalMessages,
    source_file: sourceFile,
  };

  // Only generate chunks for quality conversations
  if (analysis.qualityScore < 60 || analysis.totalMessages < 5) {
    return chunks;
  }

  // Generate opening chunk (first 5-8 messages)
  if (analysis.botMessages > 2) {
    const openingEnd = Math.min(8, messages.length);
    const openingContent = messages.slice(0, openingEnd)
      .map(m => `${m.isBot ? '[SOFIA]' : '[CLIENTE]'}: ${m.content}`)
      .join('\n');
    
    chunks.push({
      type: 'abertura_eficaz',
      content: `## Exemplo de Abertura Eficaz\n\n${openingContent}`,
      metadata: baseMetadata,
    });
  }

  // Generate objection handling chunks
  for (const moment of analysis.keyMoments.filter(m => m.type.startsWith('objecao_'))) {
    const category = moment.type.replace('objecao_', '');
    chunks.push({
      type: 'tratamento_objecao',
      content: `## Tratamento de Objeção: ${category.toUpperCase()}\n\n${moment.content}`,
      metadata: { ...baseMetadata, objections_handled: [category] },
    });
  }

  // Generate closing chunk for conversions
  if (analysis.outcome === 'conversao') {
    const closingMoment = analysis.keyMoments.find(m => m.type === 'fechamento');
    if (closingMoment) {
      chunks.push({
        type: 'fechamento_efetivo',
        content: `## Exemplo de Fechamento Bem-Sucedido\n\n${closingMoment.content}`,
        metadata: baseMetadata,
      });
    }

    // Full successful conversation
    if (messages.length <= 50) {
      const fullContent = messages
        .map(m => `${m.isBot ? '[SOFIA]' : '[CLIENTE]'}: ${m.content}`)
        .join('\n');
      
      chunks.push({
        type: 'conversa_completa',
        content: `## Conversa Completa de Sucesso (${analysis.objectionsHandled.length} objeções tratadas)\n\n${fullContent}`,
        metadata: baseMetadata,
      });
    }
  }

  // Generate qualification example
  if (analysis.stagesPassed.includes('qualificacao') && analysis.qualityScore >= 70) {
    const qualMessages = messages.filter(m => {
      const content = m.content.toLowerCase();
      return QUALIFICATION_KEYWORDS.some(kw => content.includes(kw.toLowerCase()));
    });
    
    if (qualMessages.length > 0) {
      const qualContent = qualMessages.slice(0, 10)
        .map(m => `${m.isBot ? '[SOFIA]' : '[CLIENTE]'}: ${m.content}`)
        .join('\n');
      
      chunks.push({
        type: 'qualificacao_exemplo',
        content: `## Exemplo de Qualificação Eficiente\n\n${qualContent}`,
        metadata: baseMetadata,
      });
    }
  }

  return chunks;
}

// ============= EMBEDDING GENERATION =============

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'openai/text-embedding-3-small',
      input: text.substring(0, 8000),
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI embedding error: ${response.status}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

// ============= MAIN HANDLER =============

serve(async (req) => {
  const corsHeaders = getStrictCorsHeaders(req);
  
  if (req.method === 'OPTIONS') {
    return handleCorsPrelight(req, { mode: 'strict' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const body: ProcessRequest = req.method === 'POST' ? await req.json() : {};
    const { 
      folder_path = 'Consórcio INKA II/RAG COESA/Knowledge Base. Vendas/Scripts',
      max_conversations = 50,
      dry_run = false,
      skip_existing = true,
      learning_type = 'auto',
    } = body;
    
    // Load learning folders configuration
    const { data: foldersConfigData } = await supabase
      .from('configuracoes_sistema')
      .select('valor')
      .eq('chave', 'learning_folders_config')
      .single();
    
    const foldersConfig: LearningFoldersConfig = foldersConfigData?.valor 
      ? JSON.parse(foldersConfigData.valor)
      : { success_folder: 'Scripts/Sucesso', failure_folder: 'Scripts/Fracasso', auto_detect_from_content: true };
    
    // Load exemplar threshold
    const { data: thresholdData } = await supabase
      .from('configuracoes_sistema')
      .select('valor')
      .eq('chave', 'learning_exemplar_min_score')
      .single();
    
    const exemplarMinScore = parseInt(thresholdData?.valor || '85', 10);
    
    // Determine learning type from folder path
    const determineLearningType = (path: string, analysis: ConversationAnalysis): 'success' | 'failure' | 'neutral' => {
      // First check explicit folder structure
      if (path.toLowerCase().includes(foldersConfig.success_folder.toLowerCase()) ||
          path.toLowerCase().includes('/sucesso')) {
        return 'success';
      }
      if (path.toLowerCase().includes(foldersConfig.failure_folder.toLowerCase()) ||
          path.toLowerCase().includes('/fracasso')) {
        return 'failure';
      }
      
      // Auto-detect from content if enabled
      if (foldersConfig.auto_detect_from_content) {
        if (analysis.outcome === 'conversao' && analysis.qualityScore >= 80) {
          return 'success';
        }
        if (analysis.qualityScore < 50 || analysis.outcome === 'perdido') {
          return 'failure';
        }
      }
      
      // Default: if in Scripts folder without subfolder, treat as failure (legacy behavior)
      if (path.toLowerCase().includes('/scripts') && !path.toLowerCase().includes('/sucesso')) {
        return 'failure';
      }
      
      return 'neutral';
    };

    console.log('[rag-conversation-processor] Starting...', { folder_path, max_conversations, dry_run, skip_existing });

    // Get OneDrive config
    const { data: config } = await supabase
      .from('rag_onedrive_config')
      .select('drive_id')
      .single();

    if (!config?.drive_id) {
      throw new Error('OneDrive not configured');
    }

    // Get access token
    const accessToken = await getAccessToken();
    console.log('[rag-conversation-processor] Got access token');

    // Get already processed documents if skip_existing is true
    let existingDocs: Set<string> = new Set();
    if (skip_existing) {
      const { data: existingData } = await supabase
        .from('rag_documents')
        .select('file_name')
        .eq('category', 'scripts');
      existingDocs = new Set((existingData || []).map(d => d.file_name));
      console.log(`[rag-conversation-processor] Found ${existingDocs.size} already processed documents`);
    }

    // List conversation folders
    const { folders } = await listFolderContents(accessToken, config.drive_id, folder_path);
    console.log(`[rag-conversation-processor] Found ${folders.length} total conversation folders`);

    // Filter to WAChatsBackup folders and exclude already processed
    let waBackupFolders = folders.filter(f => f.name.startsWith('WAChatsBackup'));
    
    if (skip_existing) {
      waBackupFolders = waBackupFolders.filter(f => !existingDocs.has(f.name));
      console.log(`[rag-conversation-processor] ${waBackupFolders.length} remaining after excluding already processed`);
    }
    
    // Apply limit
    waBackupFolders = waBackupFolders.slice(0, max_conversations);

    let processed = 0;
    let chunksCreated = 0;
    let errors = 0;
    let skipped = existingDocs.size;
    const results: any[] = [];

    for (const folder of waBackupFolders) {
      try {
        console.log(`[rag-conversation-processor] Processing: ${folder.name}`);
        
        // WAChatsBackup structure: folder/subfolder_with_same_name/index.html
        // Try to find the chat file by navigating the nested structure
        let chatContent: string | null = null;
        let chatFilePath = '';
        
        // First, list contents of the backup folder
        const level1 = await listFolderContents(
          accessToken, 
          config.drive_id, 
          `${folder_path}/${folder.name}`
        );

        // Check if there's an index.html directly
        let chatFile = level1.files.find(f => f.name === 'index.html' || f.name.endsWith('.txt'));
        
        if (chatFile) {
          chatContent = await downloadFileContent(accessToken, config.drive_id, chatFile.id);
          chatFilePath = `${folder_path}/${folder.name}/${chatFile.name}`;
        } else if (level1.folders.length > 0) {
          // Check nested folder (common structure: folder/same_folder_name/index.html)
          const nestedFolder = level1.folders[0];
          const level2 = await listFolderContents(
            accessToken,
            config.drive_id,
            `${folder_path}/${folder.name}/${nestedFolder.name}`
          );
          
          chatFile = level2.files.find(f => f.name === 'index.html' || f.name.endsWith('.txt'));
          if (chatFile) {
            chatContent = await downloadFileContent(accessToken, config.drive_id, chatFile.id);
            chatFilePath = `${folder_path}/${folder.name}/${nestedFolder.name}/${chatFile.name}`;
          }
        }
        
        if (!chatContent) {
          console.log(`[rag-conversation-processor] No chat file found in ${folder.name}`);
          continue;
        }

        // Parse the content
        const messages = parseWhatsAppChat(chatContent, folder.name);
        
        if (messages.length < 5) {
          console.log(`[rag-conversation-processor] Too few messages in ${folder.name}: ${messages.length}`);
          continue;
        }

        // Analyze conversation
        const analysis = analyzeConversation(messages);
        console.log(`[rag-conversation-processor] ${folder.name}: ${messages.length} msgs, outcome=${analysis.outcome}, quality=${analysis.qualityScore}`);

        // Generate chunks
        const chunks = generateChunks(messages, analysis, folder.name);
        
        results.push({
          folder: folder.name,
          messages: messages.length,
          outcome: analysis.outcome,
          quality_score: analysis.qualityScore,
          objections: analysis.objectionsHandled,
          chunks_generated: chunks.length,
        });

        if (dry_run || chunks.length === 0) {
          processed++;
          continue;
        }

        // Determine learning type for this document
        const docLearningType = learning_type === 'auto' 
          ? determineLearningType(folder_path, analysis)
          : learning_type;
        
        console.log(`[rag-conversation-processor] ${folder.name}: learning_type=${docLearningType}`);

        // Create document record
        const { data: doc, error: docError } = await supabase
          .from('rag_documents')
          .insert({
            file_name: folder.name,
            file_type: 'whatsapp_backup',
            category: 'scripts',
            subcategory: analysis.outcome,
            source_type: 'onedrive',
            source_path: `${folder_path}/${folder.name}`,
            chunk_count: chunks.length,
            total_tokens: chunks.reduce((sum, c) => sum + Math.ceil(c.content.length / 4), 0),
            processing_status: 'processing',
            is_active: true,
            learning_type: docLearningType,
            metadata: {
              analysis: {
                outcome: analysis.outcome,
                quality_score: analysis.qualityScore,
                objections_handled: analysis.objectionsHandled,
                stages_passed: analysis.stagesPassed,
                total_messages: analysis.totalMessages,
                duration_hours: analysis.duration,
              },
              learning_context: {
                type: docLearningType,
                detected_from: learning_type === 'auto' ? 'auto_detection' : 'explicit',
                is_exemplar_candidate: analysis.qualityScore >= exemplarMinScore,
              },
            },
          })
          .select('id')
          .single();

        if (docError) {
          console.error(`[rag-conversation-processor] Doc insert error: ${docError.message}`);
          errors++;
          continue;
        }

        // Create chunks with embeddings
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          try {
            const embedding = await generateEmbedding(chunk.content);
            
            // Determine if this chunk should be an exemplar
            const isExemplar = docLearningType === 'success' && 
              analysis.qualityScore >= exemplarMinScore &&
              (chunk.type === 'fechamento_efetivo' || chunk.type === 'tratamento_objecao');
            
            const exemplarReason = isExemplar 
              ? `${docLearningType === 'success' ? 'Successful' : 'Failed'} ${chunk.type} with quality ${analysis.qualityScore}%`
              : null;
            
            await supabase.from('rag_chunks').insert({
              document_id: doc.id,
              chunk_index: i,
              content: chunk.content,
              token_count: Math.ceil(chunk.content.length / 4),
              embedding,
              learning_type: docLearningType,
              is_exemplar: isExemplar,
              exemplar_reason: exemplarReason,
              metadata: {
                chunk_type: chunk.type,
                learning_context: {
                  type: docLearningType,
                  is_positive_example: docLearningType === 'success',
                  is_negative_example: docLearningType === 'failure',
                },
                ...chunk.metadata,
              },
            });
            
            chunksCreated++;
            if (isExemplar) {
              console.log(`[rag-conversation-processor] Created exemplar chunk: ${chunk.type}`);
            }
          } catch (embError) {
            console.error(`[rag-conversation-processor] Embedding error: ${embError}`);
          }
        }

        // Update document status
        await supabase
          .from('rag_documents')
          .update({ 
            processing_status: 'completed',
            chunk_count: chunks.length,
          })
          .eq('id', doc.id);

        processed++;
        
        // Rate limit
        await new Promise(r => setTimeout(r, 500));
        
      } catch (folderError) {
        console.error(`[rag-conversation-processor] Error processing ${folder.name}:`, folderError);
        errors++;
      }
    }

    console.log(`[rag-conversation-processor] Completed: ${processed} processed, ${chunksCreated} chunks, ${errors} errors`);

    return new Response(JSON.stringify({
      success: true,
      stats: {
        total_in_folder: folders.filter(f => f.name.startsWith('WAChatsBackup')).length,
        already_processed: skipped,
        remaining_before_batch: waBackupFolders.length + processed,
        processed_this_batch: processed,
        chunks_created: chunksCreated,
        errors,
        has_more: (folders.filter(f => f.name.startsWith('WAChatsBackup')).length - skipped - processed) > 0,
      },
      results: results.slice(0, 20), // Return sample
      dry_run,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[rag-conversation-processor] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: errorMessage,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
