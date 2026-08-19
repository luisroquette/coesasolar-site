/**
 * Document Collection Flow - Shared module for document processing workflow
 * 
 * Handles the complete document collection flow for definitive proposals:
 * - Document type detection and validation
 * - WhatsApp tracking of received documents
 * - Bitrix24 synchronization
 * - Data divergence detection and notification
 * - Installation type (tipoInstalacao) handling
 * - Lead stage advancement to PROPOSTA_DEFINITIVA
 * 
 * @module _shared/document-collection-flow
 * Extracted from sofia-webhook/index.ts (Phase 5 refactoring)
 */

import {
  detectDocumentType,
  verificarDocumentosCompletos,
  getDocumentReceivedMessage,
  type DocumentType,
  type DocumentCheckResult,
} from './document-handler.ts';

import { type ExtractedClientData } from './data-extraction.ts';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface DocumentCollectionParams {
  supabase: any;
  conversaId: string;
  phone: string;
  clienteNome: string | null;
  messageText: string;
  mediaAnalysisResult: MediaAnalysisResult | null;
  existingDados: ExtractedClientData;
  extractedData: ExtractedClientData;
  conversa: ConversaDocumentData | null;
  sendMessage: (phone: string, msg: string) => Promise<void>;
  agentConfig?: { name?: string };
  totalMessages?: number;
}

export interface MediaAnalysisResult {
  analysis: string;
  base64Data: string;
  mimeType: string;
  isInvoice: boolean;
}

export interface ConversaDocumentData {
  id: string;
  bitrix24_stage?: string | null;
  bitrix24_lead_id?: string | null;
  proposta_id?: string | null;
  contrato_enviado_at?: string | null;
  sofia_mode?: string | null;
  arquivos_anexados?: string[] | null;
  docs_received_whatsapp?: string[] | null;
  docs_received_page?: string[] | null;
  dados_coletados?: ExtractedClientData | null;
}

export interface DocumentCollectionResult {
  handled: boolean;
  status: 'document_processed' | 'waiting_tipo_instalacao' | 'lead_moved' | 'not_applicable' | 'error';
  documentType?: DocumentType;
  documentsComplete?: boolean;
  missingDocuments?: string[];
  tipoInstalacao?: string;
  leadMoved?: boolean;
  divergencesFound?: number;
  errorMessage?: string;
}

export interface TipoInstalacaoResult {
  handled: boolean;
  detected: boolean;
  tipoInstalacao: 'Monofásico' | 'Bifásico' | 'Trifásico' | null;
  leadMoved: boolean;
  errorMessage?: string;
}

export interface DadoDivergente {
  campo: string;
  valorAntigo: string | number | null | undefined;
  valorNovo: string | number | null | undefined;
}

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════

// Bitrix24 stage IDs
const BITRIX_STAGE_PROPOSTA_INICIAL = 'UC_9SLRPP';
const BITRIX_STAGE_PROPOSTA_DEFINITIVA = 'UC_JENEX5';

// Tipo Instalacao Bitrix enum mapping
const TIPO_INSTALACAO_MAP: Record<string, string> = {
  'Monofásico': '661',
  'Bifásico': '665',
  'Trifásico': '663',
};

// ═══════════════════════════════════════════════════════════════
// DIVERGENCE DETECTION HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Normalize text for comparison (remove accents, lowercase, trim)
 */
function normalizeTextForComparison(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Check if two numbers are within tolerance (percentage)
 */
function numbersAreClose(a: number | null | undefined, b: number | null | undefined, tolerancePercent: number = 5): boolean {
  if (a == null || b == null) return false;
  if (a === 0 && b === 0) return true;
  if (a === 0 || b === 0) return false;
  const diff = Math.abs(a - b);
  const avg = (Math.abs(a) + Math.abs(b)) / 2;
  return (diff / avg) * 100 <= tolerancePercent;
}

/**
 * Format value for display in divergence message
 */
export function formatDivergenceValue(campo: string, valor: string | number | null | undefined): string {
  if (valor == null || valor === '') return '(não informado)';
  if (typeof valor === 'number') {
    if (campo === 'Consumo') return `${valor} kWh`;
    if (campo === 'Valor da Fatura') return `R$ ${valor.toFixed(2)}`;
    return valor.toString();
  }
  return valor;
}

/**
 * Compare extracted document data with previously informed data
 * Returns list of divergent fields
 */
export function compararDadosExtraidos(
  dadosAntigos: ExtractedClientData,
  dadosNovos: ExtractedClientData
): DadoDivergente[] {
  const divergencias: DadoDivergente[] = [];
  
  // Compare name - only if both exist
  if (dadosAntigos.nome && dadosNovos.nome) {
    const nomeAntigoNorm = normalizeTextForComparison(dadosAntigos.nome);
    const nomeNovoNorm = normalizeTextForComparison(dadosNovos.nome);
    if (nomeAntigoNorm !== nomeNovoNorm && nomeAntigoNorm.length > 2 && nomeNovoNorm.length > 2) {
      divergencias.push({
        campo: 'Nome',
        valorAntigo: dadosAntigos.nome,
        valorNovo: dadosNovos.nome,
      });
    }
  }
  
  // Compare CPF - only digits
  if (dadosAntigos.cpf && dadosNovos.cpf) {
    const cpfAntigo = dadosAntigos.cpf.replace(/\D/g, '');
    const cpfNovo = dadosNovos.cpf.replace(/\D/g, '');
    if (cpfAntigo !== cpfNovo && cpfAntigo.length >= 11 && cpfNovo.length >= 11) {
      divergencias.push({
        campo: 'CPF',
        valorAntigo: dadosAntigos.cpf,
        valorNovo: dadosNovos.cpf,
      });
    }
  }
  
  // Compare CNPJ - only digits
  if (dadosAntigos.cnpj && dadosNovos.cnpj) {
    const cnpjAntigo = dadosAntigos.cnpj.replace(/\D/g, '');
    const cnpjNovo = dadosNovos.cnpj.replace(/\D/g, '');
    if (cnpjAntigo !== cnpjNovo && cnpjAntigo.length >= 14 && cnpjNovo.length >= 14) {
      divergencias.push({
        campo: 'CNPJ',
        valorAntigo: dadosAntigos.cnpj,
        valorNovo: dadosNovos.cnpj,
      });
    }
  }
  
  // Compare consumption - with 5% tolerance
  if (dadosAntigos.consumo != null && dadosNovos.consumo != null) {
    if (!numbersAreClose(dadosAntigos.consumo, dadosNovos.consumo, 5)) {
      divergencias.push({
        campo: 'Consumo',
        valorAntigo: dadosAntigos.consumo,
        valorNovo: dadosNovos.consumo,
      });
    }
  }
  
  // Compare bill value - with 5% tolerance
  if (dadosAntigos.valorFatura != null && dadosNovos.valorFatura != null) {
    if (!numbersAreClose(dadosAntigos.valorFatura, dadosNovos.valorFatura, 5)) {
      divergencias.push({
        campo: 'Valor da Fatura',
        valorAntigo: dadosAntigos.valorFatura,
        valorNovo: dadosNovos.valorFatura,
      });
    }
  }
  
  // Compare distributor - normalized
  if (dadosAntigos.distribuidora && dadosNovos.distribuidora) {
    const distAntigaNorm = normalizeTextForComparison(dadosAntigos.distribuidora);
    const distNovaNorm = normalizeTextForComparison(dadosNovos.distribuidora);
    if (distAntigaNorm !== distNovaNorm) {
      divergencias.push({
        campo: 'Distribuidora',
        valorAntigo: dadosAntigos.distribuidora,
        valorNovo: dadosNovos.distribuidora,
      });
    }
  }
  
  // Compare installation number - only digits
  if (dadosAntigos.numeroInstalacao && dadosNovos.numeroInstalacao) {
    const numAntigo = dadosAntigos.numeroInstalacao.replace(/\D/g, '');
    const numNovo = dadosNovos.numeroInstalacao.replace(/\D/g, '');
    if (numAntigo !== numNovo && numAntigo.length > 3 && numNovo.length > 3) {
      divergencias.push({
        campo: 'Nº Instalação',
        valorAntigo: dadosAntigos.numeroInstalacao,
        valorNovo: dadosNovos.numeroInstalacao,
      });
    }
  }
  
  return divergencias;
}

/**
 * Generate a friendly message explaining data divergences
 */
export function gerarMensagemDivergencias(divergencias: DadoDivergente[]): string | null {
  if (divergencias.length === 0) return null;
  
  let mensagem = '📋 *Atualizei alguns dados com base nos seus documentos:*\n\n';
  
  for (const div of divergencias) {
    const antigoFmt = formatDivergenceValue(div.campo, div.valorAntigo);
    const novoFmt = formatDivergenceValue(div.campo, div.valorNovo);
    mensagem += `• *${div.campo}:* ${antigoFmt} → ${novoFmt}\n`;
  }
  
  mensagem += '\n✅ Os dados dos documentos oficiais foram priorizados.';
  
  return mensagem;
}

// ═══════════════════════════════════════════════════════════════
// TIPO INSTALACAO DETECTION
// ═══════════════════════════════════════════════════════════════

/**
 * Normalize input for tipo instalacao detection
 * Removes punctuation, extra spaces, and normalizes characters
 */
function normalizeForTipoDetection(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[.,!?;:\-_'"()[\]{}]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ') // Normalize spaces
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // Remove accents
}

/**
 * Detect installation type from client message
 * Enhanced with better normalization and logging for debugging
 * 
 * IMPORTANT: Handles single digit responses like "1", "2", "3"
 * which is the expected response to the installation type question
 */
export function detectTipoInstalacao(message: string): 'Monofásico' | 'Bifásico' | 'Trifásico' | null {
  const originalMsg = message;
  const normalizedMsg = normalizeForTipoDetection(message);
  
  console.log(`[TIPO_INSTALACAO_DETECT] Original: "${originalMsg}" | Normalized: "${normalizedMsg}"`);
  
  // Pattern 1: Single digit (most common response to numbered options)
  // CRITICAL: Match standalone "1", "2", or "3" - the most likely response
  if (/^1$/.test(normalizedMsg) || normalizedMsg === 'um' || normalizedMsg === 'uma') {
    console.log(`[TIPO_INSTALACAO_DETECT] ✅ Detected MONOFÁSICO via single digit/word`);
    return 'Monofásico';
  }
  if (/^2$/.test(normalizedMsg) || normalizedMsg === 'dois' || normalizedMsg === 'duas') {
    console.log(`[TIPO_INSTALACAO_DETECT] ✅ Detected BIFÁSICO via single digit/word`);
    return 'Bifásico';
  }
  if (/^3$/.test(normalizedMsg) || normalizedMsg === 'tres' || normalizedMsg === 'três') {
    console.log(`[TIPO_INSTALACAO_DETECT] ✅ Detected TRIFÁSICO via single digit/word`);
    return 'Trifásico';
  }
  
  // Pattern 2: Text patterns with word boundaries
  if (/\b(mono|monof[aá]sic[oa]?|uma\s*fase|1\s*fase|1f)\b/i.test(normalizedMsg)) {
    console.log(`[TIPO_INSTALACAO_DETECT] ✅ Detected MONOFÁSICO via text pattern`);
    return 'Monofásico';
  }
  if (/\b(bi|bif[aá]sic[oa]?|duas\s*fases?|2\s*fases?|2f)\b/i.test(normalizedMsg)) {
    console.log(`[TIPO_INSTALACAO_DETECT] ✅ Detected BIFÁSICO via text pattern`);
    return 'Bifásico';
  }
  if (/\b(tri|trif[aá]sic[oa]?|tr[eê]s\s*fases?|3\s*fases?|3f)\b/i.test(normalizedMsg)) {
    console.log(`[TIPO_INSTALACAO_DETECT] ✅ Detected TRIFÁSICO via text pattern`);
    return 'Trifásico';
  }
  
  // Pattern 3: "Não sei" responses - default to Trifásico as per original logic
  if (/\b(n[aã]o\s*sei|nao\s*sei|n\s*sei|sei\s*n[aã]o|desconhe[çc]o|nao\s*lembro|nao\s*tenho\s*certeza)\b/i.test(normalizedMsg)) {
    console.log(`[TIPO_INSTALACAO_DETECT] ✅ Detected "não sei" - defaulting to TRIFÁSICO`);
    return 'Trifásico';
  }
  
  // Pattern 4: Check if message contains "1" anywhere (fallback for "opcao 1", "a 1", etc.)
  if (/\b1\b/.test(normalizedMsg) && !/\b[23]\b/.test(normalizedMsg)) {
    console.log(`[TIPO_INSTALACAO_DETECT] ✅ Detected MONOFÁSICO via "1" in message`);
    return 'Monofásico';
  }
  if (/\b2\b/.test(normalizedMsg) && !/\b[13]\b/.test(normalizedMsg)) {
    console.log(`[TIPO_INSTALACAO_DETECT] ✅ Detected BIFÁSICO via "2" in message`);
    return 'Bifásico';
  }
  if (/\b3\b/.test(normalizedMsg) && !/\b[12]\b/.test(normalizedMsg)) {
    console.log(`[TIPO_INSTALACAO_DETECT] ✅ Detected TRIFÁSICO via "3" in message`);
    return 'Trifásico';
  }
  
  console.log(`[TIPO_INSTALACAO_DETECT] ❌ Could not detect tipo from: "${originalMsg}"`);
  return null;
}

/**
 * Generate installation type question message
 */
export function getTipoInstalacaoQuestion(): string {
  return `📋 Recebi todos os seus documentos! ✅

Só preciso de mais uma informação para finalizar sua proposta definitiva:

*Sua instalação elétrica é:*

1️⃣ Monofásica (1 fase)
2️⃣ Bifásica (2 fases)
3️⃣ Trifásica (3 fases)

💡 _Essa informação geralmente aparece na sua conta de luz. Se não souber, pode responder "não sei" que eu te ajudo!_`;
}

// ═══════════════════════════════════════════════════════════════
// BITRIX24 HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Load Bitrix24 configuration from database
 */
async function loadBitrixConfig(supabase: any): Promise<Record<string, string>> {
  const { data: bitrixConfigs } = await supabase
    .from('configuracoes_sistema')
    .select('chave, valor')
    .like('chave', 'bitrix24%');
  
  const configMap: Record<string, string> = {};
  bitrixConfigs?.forEach((c: any) => {
    configMap[c.chave] = c.valor;
  });
  
  return configMap;
}

/**
 * Move lead to PROPOSTA_DEFINITIVA stage and update tipoInstalacao
 */
async function moveLeadToPropostaDefinitiva(
  supabase: any,
  bitrixLeadId: string,
  tipoInstalacao: string,
  conversaId: string,
  clienteNome: string | null,
  phone: string,
  agentName?: string
): Promise<{ success: boolean; errorMessage?: string }> {
  try {
    const bitrixConfig = await loadBitrixConfig(supabase);
    const bitrixWebhookUrl = bitrixConfig.bitrix24_webhook_url;
    
    if (!bitrixWebhookUrl) {
      return { success: false, errorMessage: 'Bitrix24 webhook URL not configured' };
    }
    
    const tipoInstalacaoField = bitrixConfig.bitrix24_custom_field_tipo_instalacao || 'UF_CRM_LEAD_1759426797107';
    const tipoInstalacaoId = TIPO_INSTALACAO_MAP[tipoInstalacao] || '663';
    
    // Update lead with tipoInstalacao AND stage in single call
    const updateUrl = `${bitrixWebhookUrl}crm.lead.update`;
    const response = await fetch(updateUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: bitrixLeadId,
        fields: {
          STATUS_ID: BITRIX_STAGE_PROPOSTA_DEFINITIVA,
          [tipoInstalacaoField]: tipoInstalacaoId,
        },
      }),
    });
    
    const responseJson = await response.json().catch(() => ({}));
    
    if (responseJson.error) {
      console.error(`[DOCUMENT_COLLECTION] Bitrix error moving lead:`, responseJson);
      
      // Log the failure
      await supabase.from('bitrix24_sync_logs').insert({
        action: 'move_to_proposta_definitiva',
        bitrix24_lead_id: bitrixLeadId,
        proposta_id: conversaId,
        status: 'error',
        error_message: `Bitrix error: ${responseJson.error_description || responseJson.error}`,
        request_data: { stage: BITRIX_STAGE_PROPOSTA_DEFINITIVA, tipoInstalacao },
        response_data: responseJson,
      });
      
      // Notify admins
      await supabase.from('admin_notifications').insert({
        admin_user_id: null,
        title: '❌ Erro ao mover lead no Bitrix',
        message: `Falha ao mover ${clienteNome || phone} para Proposta Definitiva: ${responseJson.error_description || responseJson.error}`,
        type: 'error',
        entity_type: 'chatbot_conversa',
        entity_id: conversaId,
        created_by_nome: agentName || 'IA',
      });
      
      return { success: false, errorMessage: responseJson.error_description || responseJson.error };
    }
    
    console.log(`[DOCUMENT_COLLECTION] Lead ${bitrixLeadId} moved to PROPOSTA_DEFINITIVA`);
    
    // Log success
    await supabase.from('bitrix24_sync_logs').insert({
      action: 'move_to_proposta_definitiva',
      bitrix24_lead_id: bitrixLeadId,
      proposta_id: conversaId,
      status: 'success',
      request_data: { stage: BITRIX_STAGE_PROPOSTA_DEFINITIVA, tipoInstalacao },
    });
    
    // Add timeline comment
    const timelineUrl = `${bitrixWebhookUrl}crm.timeline.comment.add`;
    await fetch(timelineUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          ENTITY_ID: bitrixLeadId,
          ENTITY_TYPE: 'lead',
          COMMENT: `📋 Tipo de instalação: ${tipoInstalacao}\n\n🚀 Lead movido automaticamente para Proposta Definitiva pela sofIA.`,
        },
      }),
    });
    
    // Notify success
    await supabase.from('admin_notifications').insert({
      admin_user_id: null,
      title: '📄 Lead movido para Proposta Definitiva',
      message: `${clienteNome || phone} - Todos os documentos recebidos e tipo de instalação (${tipoInstalacao}) informado. Lead movido para UC_JENEX5.`,
      type: 'success',
      entity_type: 'chatbot_conversa',
      entity_id: conversaId,
      created_by_nome: agentName || 'IA',
    });
    
    return { success: true };
    
  } catch (err) {
    console.error(`[DOCUMENT_COLLECTION] Error moving lead:`, err);
    return { success: false, errorMessage: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Sync document to Bitrix24 lead
 * 
 * CRITICAL FIX: Uses `arquivoNovo` (object) instead of `arquivos` (array)
 * to match sofia-bitrix-lead interface SyncRequest
 */
async function syncDocumentToBitrix(
  supabase: any,
  conversaId: string,
  phone: string,
  clienteNome: string | null,
  dadosColetados: ExtractedClientData,
  tipoDocumento: DocumentType,
  base64Data: string,
  isDocument: boolean
): Promise<void> {
  try {
    // Skip 'unknown' document types
    if (tipoDocumento === 'unknown') {
      console.log(`[DOCUMENT_COLLECTION] Skipping unknown document type for Bitrix sync`);
      return;
    }
    
    const fileName = `${tipoDocumento}_${Date.now()}.${isDocument ? 'pdf' : 'jpg'}`;
    
    // CRITICAL: Use arquivoNovo (object) not arquivos (array) to match SyncRequest interface
    const syncPayload = {
      conversaId,
      phone,
      clienteNome,
      dadosColetados,
      arquivoNovo: {
        tipo: tipoDocumento as 'fatura' | 'documento_identidade' | 'contrato_social',
        base64: base64Data,
        mimeType: isDocument ? 'application/pdf' : 'image/jpeg',
        fileName,
      },
    };
    
    console.log(`[DOCUMENT_COLLECTION] Syncing document to Bitrix: type=${tipoDocumento}, fileName=${fileName}`);
    
    const { error: syncError, data: syncData } = await supabase.functions.invoke('sofia-bitrix-lead', {
      body: syncPayload,
    });
    
    if (syncError) {
      console.error(`[DOCUMENT_COLLECTION] Failed to sync ${tipoDocumento} to Bitrix:`, syncError);
    } else {
      console.log(`[DOCUMENT_COLLECTION] ✅ Document ${tipoDocumento} synced to Bitrix successfully`, syncData);
    }
  } catch (bitrixError) {
    console.error(`[DOCUMENT_COLLECTION] Error syncing ${tipoDocumento} to Bitrix:`, bitrixError);
  }
}

/**
 * Add divergence comment to Bitrix timeline
 */
async function addDivergenceCommentToBitrix(
  supabase: any,
  bitrixLeadId: string,
  divergencias: DadoDivergente[]
): Promise<void> {
  try {
    const { data: bitrixConfig } = await supabase
      .from('configuracoes_sistema')
      .select('valor')
      .eq('chave', 'bitrix24_webhook_url')
      .single();
    
    if (bitrixConfig?.valor) {
      const timelineUrl = `${bitrixConfig.valor}crm.timeline.comment.add`;
      const divergenciasTexto = divergencias.map(d => {
        const antigoFmt = formatDivergenceValue(d.campo, d.valorAntigo);
        const novoFmt = formatDivergenceValue(d.campo, d.valorNovo);
        return `• ${d.campo}: "${antigoFmt}" → "${novoFmt}"`;
      }).join('\n');
      
      await fetch(timelineUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            ENTITY_ID: bitrixLeadId,
            ENTITY_TYPE: 'lead',
            COMMENT: `📋 DIVERGÊNCIAS DETECTADAS (dados atualizados automaticamente):\n${divergenciasTexto}\n\n✅ Dados dos documentos prevalecem sobre informações verbais.`,
          },
        }),
      });
      console.log(`[DOCUMENT_COLLECTION] Added divergence comment to Bitrix timeline`);
    }
  } catch (err) {
    console.error(`[DOCUMENT_COLLECTION] Error adding divergence comment to Bitrix:`, err);
  }
}

// ═══════════════════════════════════════════════════════════════
// MAIN DOCUMENT COLLECTION HANDLER
// ═══════════════════════════════════════════════════════════════

/**
 * Check if conversation is in document collection stage
 */
export function isInDocumentCollectionStage(conversa: ConversaDocumentData | null): boolean {
  if (!conversa) return false;
  
  const currentBitrixStage = conversa.bitrix24_stage;
  const hasPropostaId = !!conversa.proposta_id;
  const hasContratoEnviado = !!conversa.contrato_enviado_at;
  
  return currentBitrixStage === BITRIX_STAGE_PROPOSTA_INICIAL || 
         conversa.sofia_mode === 'proposta_inicial_enviada' ||
         (hasPropostaId && !hasContratoEnviado);
}

/**
 * Process document collection flow
 * Main entry point for document handling in the webhook
 */
export async function processDocumentCollectionFlow(
  params: DocumentCollectionParams
): Promise<DocumentCollectionResult> {
  const {
    supabase,
    conversaId,
    phone,
    clienteNome,
    mediaAnalysisResult,
    existingDados,
    extractedData,
    conversa,
    sendMessage,
    agentConfig,
    totalMessages = 0,
  } = params;
  
  // Check if we have media to process
  if (!mediaAnalysisResult) {
    return { handled: false, status: 'not_applicable' };
  }
  
  // Check if we're in the right stage for document collection
  if (!isInDocumentCollectionStage(conversa)) {
    console.log(`[DOCUMENT_COLLECTION] Not in document collection stage`);
    return { handled: false, status: 'not_applicable' };
  }
  
  console.log(`[DOCUMENT_COLLECTION] Processing document in proposta_inicial stage`);
  
  // Detect document type from analysis
  const tipoDocumento = detectDocumentType(mediaAnalysisResult.analysis);
  console.log(`[DOCUMENT_COLLECTION] Detected document type: ${tipoDocumento}`);
  
  if (tipoDocumento === 'unknown') {
    return { handled: false, status: 'not_applicable', documentType: 'unknown' };
  }
  
  // ═══════════════════════════════════════════════════════════════
  // GUARDRAIL #2: Block personal document reception via WhatsApp
  // Only invoices (fatura) are allowed. RG, CNH, etc. must go through platform
  // ═══════════════════════════════════════════════════════════════
  const personalDocTypes = ['rg', 'cnh', 'identidade', 'comprovante_endereco', 'contrato_social'];
  const isPersonalDocument = personalDocTypes.includes(tipoDocumento);
  
  if (isPersonalDocument) {
    // Check configuration - if disabled, block and redirect
    let docReceptionEnabled = false;
    try {
      const { data: configData } = await supabase
        .from('configuracoes_sistema')
        .select('valor')
        .eq('chave', 'whatsapp_document_reception_enabled')
        .maybeSingle();
      docReceptionEnabled = configData?.valor === 'true';
    } catch (e) {
      console.log('[DOCUMENT_COLLECTION] Could not load doc reception config, defaulting to blocked');
    }
    
    if (!docReceptionEnabled) {
      console.log(`[DOCUMENT_COLLECTION] ⛔ BLOCKED: Personal document (${tipoDocumento}) reception via WhatsApp disabled`);
      
      // Get proposal URL to redirect
      const dados = conversa?.dados_coletados || {};
      const proposalUrl = (dados as any).proposal_url || (dados as any).public_proposal_url;
      const firstName = clienteNome?.split(' ')[0] || '';
      
      let blockMessage: string;
      if (proposalUrl) {
        blockMessage = firstName
          ? `${firstName}, para sua segurança, os documentos pessoais devem ser enviados através do link da sua proposta! 🔒\n\n📎 Acesse aqui: ${proposalUrl}\n\nClique em *"Quero minha Proposta Definitiva"* para anexar seus documentos de forma segura.\n\nIsso protege seus dados pessoais! 💚`
          : `Para sua segurança, os documentos pessoais devem ser enviados através do link da sua proposta! 🔒\n\n📎 Acesse aqui: ${proposalUrl}\n\nClique em *"Quero minha Proposta Definitiva"* para anexar seus documentos de forma segura. 💚`;
      } else {
        blockMessage = firstName
          ? `${firstName}, os documentos pessoais devem ser enviados de forma segura através da plataforma! 🔒\n\nAssim que sua proposta estiver pronta, você receberá um link exclusivo para anexar os arquivos com total segurança.\n\nAguarde só mais um pouquinho! 💚`
          : `Os documentos pessoais devem ser enviados de forma segura através da plataforma! 🔒\n\nAssim que sua proposta estiver pronta, você receberá um link exclusivo para anexar os arquivos.\n\nAguarde só mais um pouquinho! 💚`;
      }
      
      await sendMessage(phone, blockMessage);
      
      // Log the block
      await supabase.from('chatbot_mensagens').insert({
        conversa_id: conversaId,
        role: 'assistant',
        content: blockMessage,
      });
      
      // Notify admins
      await supabase.from('admin_notifications').insert({
        admin_user_id: null,
        title: '⛔ Documento pessoal via WhatsApp bloqueado',
        message: `Cliente ${clienteNome || phone} tentou enviar ${tipoDocumento} via WhatsApp. Redirecionado para plataforma.`,
        type: 'warning',
        entity_type: 'chatbot_conversa',
        entity_id: conversaId,
        created_by_nome: agentConfig?.name || 'Sistema',
      });
      
      return { 
        handled: true, 
        status: 'error', 
        documentType: tipoDocumento as any,
        errorMessage: 'document_blocked_platform_only',
      };
    }
  }
  
  // Get current arquivos_anexados
  const currentArquivos = conversa?.arquivos_anexados || [];
  
  // Check if this document type is already attached
  if (currentArquivos.includes(tipoDocumento)) {
    console.log(`[DOCUMENT_COLLECTION] Document type ${tipoDocumento} already attached`);
    return { 
      handled: false, 
      status: 'not_applicable', 
      documentType: tipoDocumento 
    };
  }
  
  // Add new document type
  const updatedArquivos = [...currentArquivos, tipoDocumento];
  console.log(`[DOCUMENT_COLLECTION] Updating arquivos_anexados: ${JSON.stringify(updatedArquivos)}`);
  
  // Get current docs received via WhatsApp
  const currentDocsWhatsApp = conversa?.docs_received_whatsapp || [];
  const updatedDocsWhatsApp = currentDocsWhatsApp.includes(tipoDocumento) 
    ? currentDocsWhatsApp 
    : [...currentDocsWhatsApp, tipoDocumento];
  
  // Determine if this is the first document
  const isFirstDoc = currentArquivos.length === 0;
  
  // Update conversation with new document and tracking
  const updateData: any = { 
    arquivos_anexados: updatedArquivos,
    docs_received_whatsapp: updatedDocsWhatsApp,
  };
  
  // Track first document timestamp
  if (isFirstDoc) {
    updateData.first_doc_received_at = new Date().toISOString();
  }
  
  // Determine docs_source
  const currentDocsPage = conversa?.docs_received_page || [];
  if (currentDocsPage.length === 0) {
    updateData.docs_source = 'whatsapp';
  } else if (updatedDocsWhatsApp.length > 0 && currentDocsPage.length > 0) {
    updateData.docs_source = 'mixed';
  }
  
  await supabase
    .from('chatbot_conversas')
    .update(updateData)
    .eq('id', conversaId);
  
  console.log(`[DOCUMENT_COLLECTION] Tracked document via WhatsApp: ${tipoDocumento}`);
  
  // Sync document to Bitrix24 if lead exists
  const bitrixLeadId = conversa?.bitrix24_lead_id;
  const mergedData = { ...existingDados, ...extractedData };
  const isDocument = mediaAnalysisResult.mimeType?.includes('pdf') || false;
  
  if (bitrixLeadId && mediaAnalysisResult.base64Data) {
    await syncDocumentToBitrix(
      supabase,
      conversaId,
      phone,
      clienteNome,
      mergedData,
      tipoDocumento,
      mediaAnalysisResult.base64Data,
      isDocument
    );
  }
  
  // Check if all documents are now complete
  const docCheckResult = verificarDocumentosCompletos(updatedArquivos, mergedData);
  console.log(`[DOCUMENT_COLLECTION] Document check: complete=${docCheckResult.completo}, missing=${JSON.stringify(docCheckResult.faltando)}`);
  
  // Check for data divergences
  const divergencias = compararDadosExtraidos(existingDados, extractedData);
  if (divergencias.length > 0) {
    console.log(`[DOCUMENT_COLLECTION] Found ${divergencias.length} data divergences`);
    
    const mensagemDivergencias = gerarMensagemDivergencias(divergencias);
    if (mensagemDivergencias) {
      // Send divergence explanation message FIRST
      await sendMessage(phone, mensagemDivergencias);
      
      // Save to messages
      await supabase.from('chatbot_mensagens').insert({
        conversa_id: conversaId,
        role: 'assistant',
        content: mensagemDivergencias,
      });
      
      // Add comment to Bitrix timeline
      if (bitrixLeadId) {
        await addDivergenceCommentToBitrix(supabase, bitrixLeadId, divergencias);
      }
      
      // Small delay to ensure divergence message arrives first
      await new Promise(resolve => setTimeout(resolve, 800));
    }
  }
  
  // Generate document receipt message
  const docReceiptMessage = getDocumentReceivedMessage(tipoDocumento, docCheckResult.faltando);
  
  // If all documents are complete, check for tipoInstalacao
  if (docCheckResult.completo && bitrixLeadId) {
    console.log(`[DOCUMENT_COLLECTION] All documents complete! Checking tipoInstalacao...`);
    
    const hasTipoInstalacao = !!mergedData.tipoInstalacao;
    
    if (!hasTipoInstalacao) {
      console.log(`[DOCUMENT_COLLECTION] tipoInstalacao missing! Asking client...`);
      
      // Ask for installation type
      const tipoInstalacaoQuestion = getTipoInstalacaoQuestion();
      await sendMessage(phone, tipoInstalacaoQuestion);
      
      // Save bot message
      await supabase.from('chatbot_mensagens').insert({
        conversa_id: conversaId,
        role: 'assistant',
        content: tipoInstalacaoQuestion,
      });
      
      // Update conversation with flag
      await supabase
        .from('chatbot_conversas')
        .update({
          last_sofia_message_at: new Date().toISOString(),
          last_message_at: new Date().toISOString(),
          total_messages: totalMessages + 2,
          dados_coletados: { ...mergedData, aguardandoTipoInstalacao: true },
          pending_task: 'perguntar_tipo_instalacao',
          pending_task_created_at: new Date().toISOString(),
        })
        .eq('id', conversaId);
      
      // Create admin notification
      await supabase.from('admin_notifications').insert({
        admin_user_id: null,
        title: '📋 Aguardando tipo de instalação',
        message: `${clienteNome || phone} enviou todos os documentos, mas falta o tipo de instalação. sofIA perguntou ao cliente.`,
        type: 'info',
        entity_type: 'chatbot_conversa',
        entity_id: conversaId,
        created_by_nome: agentConfig?.name || 'IA',
      });
      
      return {
        handled: true,
        status: 'waiting_tipo_instalacao',
        documentType: tipoDocumento,
        documentsComplete: true,
        missingDocuments: [],
        divergencesFound: divergencias.length,
      };
    }
    
    // Has tipoInstalacao - move lead
    console.log(`[DOCUMENT_COLLECTION] tipoInstalacao present: ${mergedData.tipoInstalacao}. Moving lead...`);
    
    const moveResult = await moveLeadToPropostaDefinitiva(
      supabase,
      bitrixLeadId,
      mergedData.tipoInstalacao as string,
      conversaId,
      clienteNome,
      phone,
      agentConfig?.name
    );
    
    // Send document receipt message with completion
    const completionMessage = `${docReceiptMessage}\n\n🚀 Estou finalizando sua *Proposta Definitiva* agora!`;
    await sendMessage(phone, completionMessage);
    
    await supabase.from('chatbot_mensagens').insert({
      conversa_id: conversaId,
      role: 'assistant',
      content: completionMessage,
    });
    
    // Update conversation
    await supabase
      .from('chatbot_conversas')
      .update({
        bitrix24_stage: moveResult.success ? BITRIX_STAGE_PROPOSTA_DEFINITIVA : conversa?.bitrix24_stage,
        sofia_mode: moveResult.success ? 'proposta_definitiva' : conversa?.sofia_mode,
        all_docs_complete_at: new Date().toISOString(),
        dados_coletados: mergedData,
        last_sofia_message_at: new Date().toISOString(),
        last_message_at: new Date().toISOString(),
        total_messages: totalMessages + 2,
      })
      .eq('id', conversaId);
    
    return {
      handled: true,
      status: 'lead_moved',
      documentType: tipoDocumento,
      documentsComplete: true,
      tipoInstalacao: mergedData.tipoInstalacao as string,
      leadMoved: moveResult.success,
      divergencesFound: divergencias.length,
    };
  }
  
  // Documents not complete yet - send receipt message
  await sendMessage(phone, docReceiptMessage);
  
  await supabase.from('chatbot_mensagens').insert({
    conversa_id: conversaId,
    role: 'assistant',
    content: docReceiptMessage,
  });
  
  // Update conversation
  await supabase
    .from('chatbot_conversas')
    .update({
      last_sofia_message_at: new Date().toISOString(),
      last_message_at: new Date().toISOString(),
      total_messages: totalMessages + 2,
      dados_coletados: mergedData,
    })
    .eq('id', conversaId);
  
  return {
    handled: true,
    status: 'document_processed',
    documentType: tipoDocumento,
    documentsComplete: docCheckResult.completo,
    missingDocuments: docCheckResult.faltando,
    divergencesFound: divergencias.length,
  };
}

// ═══════════════════════════════════════════════════════════════
// TIPO INSTALACAO RESPONSE HANDLER
// ═══════════════════════════════════════════════════════════════

/**
 * Handle client response to installation type question
 * 
 * CRITICAL: This function MUST handle the response when aguardandoTipoInstalacao is true.
 * If detection fails, we should NOT fall through to generic AI response - we should re-ask.
 */
export async function handleTipoInstalacaoResponse(
  supabase: any,
  conversaId: string,
  phone: string,
  clienteNome: string | null,
  messageText: string,
  existingDados: ExtractedClientData,
  conversa: ConversaDocumentData | null,
  sendMessage: (phone: string, msg: string) => Promise<void>,
  agentConfig?: { name?: string },
  totalMessages: number = 0
): Promise<TipoInstalacaoResult> {
  // Check if we're waiting for tipo instalacao
  const isWaiting = !!(existingDados as any)?.aguardandoTipoInstalacao;
  
  console.log(`[TIPO_INSTALACAO_RESPONSE] Checking. isWaiting=${isWaiting}, message="${messageText.substring(0, 50)}"`);
  
  if (!isWaiting) {
    return { handled: false, detected: false, tipoInstalacao: null, leadMoved: false };
  }
  
  // Try to detect tipo from message
  const detectedTipo = detectTipoInstalacao(messageText);
  
  console.log(`[TIPO_INSTALACAO_RESPONSE] Detection result: ${detectedTipo || 'null'}`);
  
  // ═══════════════════════════════════════════════════════════════
  // CRITICAL FIX: If we're waiting but couldn't detect, re-ask politely
  // Do NOT fall through to generic AI response (prevents abandonment)
  // ═══════════════════════════════════════════════════════════════
  if (!detectedTipo) {
    console.log(`[TIPO_INSTALACAO_RESPONSE] ⚠️ Could not detect tipo. Re-asking client...`);
    
    const reAskMessage = `Desculpa, não consegui entender! 🙏

Pode me dizer qual é o tipo da sua instalação elétrica?

1️⃣ Monofásica
2️⃣ Bifásica  
3️⃣ Trifásica

_Basta responder com o número (1, 2 ou 3) ou o nome (mono, bi, tri)._`;
    
    await sendMessage(phone, reAskMessage);
    
    // Save the re-ask message
    await supabase.from('chatbot_mensagens').insert({
      conversa_id: conversaId,
      role: 'assistant',
      content: reAskMessage,
    });
    
    // Update last message timestamp but keep waiting
    await supabase
      .from('chatbot_conversas')
      .update({
        last_sofia_message_at: new Date().toISOString(),
        last_message_at: new Date().toISOString(),
        total_messages: totalMessages + 2,
      })
      .eq('id', conversaId);
    
    // Return handled=true to prevent fallthrough to generic AI
    return { 
      handled: true, 
      detected: false, 
      tipoInstalacao: null, 
      leadMoved: false,
      errorMessage: 'Could not detect tipo, re-asked client'
    };
  }
  
  console.log(`[TIPO_INSTALACAO] Detected: ${detectedTipo}`);
  
  // Update dados_coletados
  const updatedDados = { 
    ...existingDados, 
    tipoInstalacao: detectedTipo, 
    aguardandoTipoInstalacao: false 
  };
  
  const bitrixLeadId = conversa?.bitrix24_lead_id;
  let moveSuccess = false;
  
  if (bitrixLeadId) {
    const moveResult = await moveLeadToPropostaDefinitiva(
      supabase,
      bitrixLeadId,
      detectedTipo,
      conversaId,
      clienteNome,
      phone,
      agentConfig?.name
    );
    moveSuccess = moveResult.success;
  }
  
  // Send confirmation message
  const confirmMsg = moveSuccess 
    ? `Anotado: *${detectedTipo}*! ✅\n\nPerfeito, agora tenho todos os dados necessários. Estou finalizando sua *Proposta Definitiva* e já te envio! 📋💚`
    : `Anotado: *${detectedTipo}*! ✅\n\nVou processar sua proposta. Se tiver algum problema, um de nossos atendentes entrará em contato.`;
  
  await sendMessage(phone, confirmMsg);
  
  await supabase.from('chatbot_mensagens').insert({
    conversa_id: conversaId,
    role: 'assistant',
    content: confirmMsg,
  });
  
  // Update conversation
  await supabase
    .from('chatbot_conversas')
    .update({
      dados_coletados: updatedDados,
      bitrix24_stage: moveSuccess ? BITRIX_STAGE_PROPOSTA_DEFINITIVA : conversa?.bitrix24_stage,
      sofia_mode: moveSuccess ? 'proposta_definitiva' : conversa?.sofia_mode,
      all_docs_complete_at: moveSuccess ? new Date().toISOString() : null,
      pending_task: null,
      pending_task_created_at: null,
      last_sofia_message_at: new Date().toISOString(),
      last_message_at: new Date().toISOString(),
      total_messages: totalMessages + 2,
    })
    .eq('id', conversaId);
  
  return {
    handled: true,
    detected: true,
    tipoInstalacao: detectedTipo,
    leadMoved: moveSuccess,
  };
}
