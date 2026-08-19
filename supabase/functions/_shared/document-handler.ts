/**
 * Document Handler - Shared module for document processing via WhatsApp
 * 
 * Provides document type detection, validation, tracking, and confirmation
 * message generation for documents received from clients:
 * - Electricity bills (fatura)
 * - Identity documents (RG/CNH)
 * - Corporate contracts (contrato social)
 * 
 * @module _shared/document-handler
 */

import { getPatternCache, getKeywordsForCategory } from './detection-patterns.ts';
// Use unified config loader for hierarchical config resolution
import { getConfigValue } from './unified-config-loader.ts';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type DocumentType = 'fatura' | 'documento_identidade' | 'contrato_social' | 'unknown';
export type FileType = 'fatura' | 'documento_identidade' | 'contrato_social';
export type ClientType = 'PF' | 'PJ' | null;

export interface DocumentCheckResult {
  completo: boolean;
  faltando: string[];
  tipoCliente: ClientType;
}

export interface MediaAnalysisResult {
  analysis: string;
  base64Data: string;
  mimeType: string;
  isInvoice: boolean;
}

export interface DocumentRecoveryResult {
  recovered: RecoveredDocument[];
  newArquivos: string[];
  extractedData: Record<string, unknown>;
}

export interface RecoveredDocument {
  type: DocumentType;
  source: 'webhook' | 'history';
  url?: string;
  fileName?: string;
}

export interface DocsSubmittedViaPage {
  hasSubmission: boolean;
  documentoIdentidade: boolean;
  fatura: boolean;
  contratoSocial: boolean;
  status: string | null;
}

export interface DocsReceivedWhatsApp {
  type: DocumentType;
  receivedAt: string;
  fileName?: string;
  source?: string;
}

// ═══════════════════════════════════════════════════════════════
// DETECTION KEYWORDS - Now loaded from detection-patterns
// ═══════════════════════════════════════════════════════════════

// Fallback keywords (used if database patterns not loaded)
const FALLBACK_FATURA_KEYWORDS = [
  'fatura', 'conta de luz', 'conta de energia', 'consumo kwh', 
  'distribuidora', 'cemig', 'cpfl', 'coelba', 'tusd', 'unidade consumidora',
  'valor total', 'energia elétrica', 'kwh'
];

const FALLBACK_IDENTIDADE_KEYWORDS = [
  'carteira de identidade', 'registro geral', 'cnh', 'habilitação', 
  'documento de identidade', 'órgão emissor', 'rg', 'cpf'
];

const FALLBACK_CONTRATO_KEYWORDS = [
  'contrato social', 'alteração contratual', 'razão social',
  'objeto social', 'sócios', 'capital social', 'junta comercial', 'nire'
];

const FALLBACK_INVOICE_KEYWORDS = [
  'fatura de energia', 'conta de luz', 'consumo kwh', 'distribuidora',
  'cemig', 'copel', 'cpfl', 'enel', 'tusd', 'te ', 'tarifa', 'kWh'
];

/**
 * Get document keywords from cache or fallback
 */
function getDocumentKeywords(category: string, fallback: string[]): string[] {
  const cache = getPatternCache();
  if (!cache || cache.patterns.size === 0) {
    return fallback;
  }
  
  const keywords = getKeywordsForCategory(category, cache.patterns);
  return keywords.length > 0 ? keywords : fallback;
}

// ═══════════════════════════════════════════════════════════════
// DOCUMENT TYPE DETECTION
// ═══════════════════════════════════════════════════════════════

/**
 * Detects the type of document from AI analysis text
 */
export function detectDocumentType(analysis: string): DocumentType {
  const lowerAnalysis = analysis.toLowerCase();
  
  const faturaKeywords = getDocumentKeywords('doc_fatura', FALLBACK_FATURA_KEYWORDS);
  const identidadeKeywords = getDocumentKeywords('doc_identidade', FALLBACK_IDENTIDADE_KEYWORDS);
  const contratoKeywords = getDocumentKeywords('doc_contrato_social', FALLBACK_CONTRATO_KEYWORDS);
  
  // Count keyword matches for each type
  const faturaMatches = faturaKeywords.filter(k => lowerAnalysis.includes(k));
  const docMatches = identidadeKeywords.filter(k => lowerAnalysis.includes(k));
  const contratoMatches = contratoKeywords.filter(k => lowerAnalysis.includes(k));
  
  console.log(`[detectDocumentType] Matches - Fatura: ${faturaMatches.length}, Identidade: ${docMatches.length}, Contrato: ${contratoMatches.length}`);
  
  // Get thresholds from config or use defaults
  const configCache = new Map<string, string>();
  const faturaMinMatches = parseInt(getConfigValue('doc_fatura_min_matches', '3', configCache));
  const identidadeMinMatches = parseInt(getConfigValue('doc_identidade_min_matches', '2', configCache));
  const contratoMinMatches = parseInt(getConfigValue('doc_contrato_min_matches', '2', configCache));
  
  // Prioritize based on number of matches
  if (faturaMatches.length >= faturaMinMatches) {
    return 'fatura';
  }
  
  if (docMatches.length >= identidadeMinMatches) {
    return 'documento_identidade';
  }
  
  if (contratoMatches.length >= contratoMinMatches) {
    return 'contrato_social';
  }
  
  // Fallback by single strong keyword
  if (faturaMatches.length >= 1 && lowerAnalysis.includes('energia')) {
    return 'fatura';
  }
  
  if (docMatches.length >= 1 && (lowerAnalysis.includes('identidade') || lowerAnalysis.includes('cnh'))) {
    return 'documento_identidade';
  }
  
  if (contratoMatches.length >= 1 && lowerAnalysis.includes('social')) {
    return 'contrato_social';
  }
  
  return 'unknown';
}

/**
 * Check if analysis indicates an energy invoice
 */
export function isEnergyInvoice(analysis: string): boolean {
  const lowerAnalysis = analysis.toLowerCase();
  const invoiceKeywords = getDocumentKeywords('doc_invoice', FALLBACK_INVOICE_KEYWORDS);
  return invoiceKeywords.some(keyword => lowerAnalysis.includes(keyword));
}

/**
 * Detect document type from filename (heuristic for PDFs)
 */
export function detectDocumentTypeFromFilename(fileName: string): DocumentType {
  const lowerName = fileName.toLowerCase();
  
  const faturaFilenameKeywords = getDocumentKeywords('doc_filename_fatura', ['fatura', 'conta', 'energia']);
  const identidadeFilenameKeywords = getDocumentKeywords('doc_filename_identidade', ['cnh', 'identidade', 'rg']);
  const contratoFilenameKeywords = getDocumentKeywords('doc_filename_contrato', ['contrato', 'social', 'alteracao']);
  
  if (faturaFilenameKeywords.some(k => lowerName.includes(k))) {
    return 'fatura';
  }
  
  if (identidadeFilenameKeywords.some(k => lowerName.includes(k))) {
    return 'documento_identidade';
  }
  
  if (contratoFilenameKeywords.some(k => lowerName.includes(k))) {
    return 'contrato_social';
  }
  
  return 'unknown';
}

// ═══════════════════════════════════════════════════════════════
// DOCUMENT COMPLETENESS VALIDATION
// ═══════════════════════════════════════════════════════════════

/**
 * Extended client data interface for document validation
 */
interface ClientDataForDocs {
  tipoCliente?: 'PF' | 'PJ' | null;
  cnpj?: string | null;
  cpf?: string | null;
}

/**
 * Checks if all required documents have been received
 */
export function verificarDocumentosCompletos(
  arquivosAnexados: string[] | null,
  dadosColetados: ClientDataForDocs
): DocumentCheckResult {
  const arquivos = arquivosAnexados || [];
  const faltando: string[] = [];
  
  // Determine client type
  const tipoCliente: ClientType = dadosColetados.tipoCliente || 
    (dadosColetados.cnpj ? 'PJ' : dadosColetados.cpf ? 'PF' : null);
  
  // Identity document is always required
  if (!arquivos.includes('documento_identidade')) {
    faltando.push('documento de identidade (RG ou CNH)');
  }
  
  // Invoice is always required
  if (!arquivos.includes('fatura')) {
    faltando.push('fatura de energia');
  }
  
  // Corporate contract only for PJ
  if (tipoCliente === 'PJ' && !arquivos.includes('contrato_social')) {
    faltando.push('contrato social');
  }
  
  return { 
    completo: faltando.length === 0, 
    faltando,
    tipoCliente
  };
}

/**
 * Gets list of missing documents for a given stage
 */
export function getMissingDocuments(
  arquivos: string[] | null,
  isPJ: boolean
): string[] {
  const attached = arquivos || [];
  const missing: string[] = [];
  
  if (!attached.includes('fatura')) {
    missing.push('fatura');
  }
  
  if (!attached.includes('documento_identidade')) {
    missing.push('documento_identidade');
  }
  
  if (isPJ && !attached.includes('contrato_social')) {
    missing.push('contrato_social');
  }
  
  return missing;
}

// ═══════════════════════════════════════════════════════════════
// DOCUMENT CONFIRMATION MESSAGES
// ═══════════════════════════════════════════════════════════════

/**
 * Friendly document type names in Portuguese
 */
const DOCUMENT_TYPE_NAMES: Record<DocumentType, string> = {
  'fatura': 'fatura de energia',
  'documento_identidade': 'documento de identidade',
  'contrato_social': 'contrato social',
  'unknown': 'documento',
};

/**
 * Generate secure document choice message for security-conscious clients
 */
function getSecureUploadChoiceMessage(): string {
  return `
🔐 *Prezamos pela sua segurança!* Você escolhe como enviar:

📱 *Recomendado:* Acesse sua proposta e clique em "Quero minha Proposta Definitiva" para upload seguro

💬 *Ou:* Pode me enviar aqui pelo WhatsApp que eu faço o upload pra você

Qual opção você prefere?`;
}

/**
 * Generate confirmation message when document is received
 */
export function getDocumentReceivedMessage(
  tipoDocumento: DocumentType,
  documentosRestantes: string[]
): string {
  const tipoNome = DOCUMENT_TYPE_NAMES[tipoDocumento];
  const isFeminine = tipoNome === 'fatura de energia';
  
  if (documentosRestantes.length === 0) {
    return `Recebi ${isFeminine ? 'a' : 'o'} ${tipoNome}! ✅

🎉 *Tenho todos os documentos!* Vou gerar sua proposta definitiva agora.`;
  }
  
  const faltandoText = documentosRestantes.length === 1 
    ? `Agora só falta: *${documentosRestantes[0]}*`
    : `Ainda preciso de:\n${documentosRestantes.map(d => `• ${d}`).join('\n')}`;
  
  return `Recebi ${isFeminine ? 'a' : 'o'} ${tipoNome}! ✅

${faltandoText}

🔐 Você pode enviar pelo link da proposta (mais seguro) ou aqui mesmo pelo WhatsApp!`;
}

/**
 * Generate message listing required documents with GUIDED FORMAT (Formulário Livre Guiado - Fase 2)
 * Prioriza link da proposta (LGPD), separa PF/PJ e pergunta qual caso
 */
export function getRequiredDocumentsMessage(
  tipoCliente: ClientType,
  clientFirstName?: string | null,
  useGuidedFormat: boolean = true
): string {
  const nome = clientFirstName ? `${clientFirstName}` : '';
  
  // Formato guiado completo (padrão)
  if (useGuidedFormat) {
    return `Ótimo ${nome}! 👏 Agora que você recebeu sua proposta inicial, o próximo passo é validarmos esses números e te entregar uma *proposta definitiva* com os valores reais.

Para isso, acesse o link da sua proposta e clique no banner *"QUERO MINHA PROPOSTA DEFINITIVA"*. Ao clicar, você anexa os documentos solicitados.

🔐 Pode ficar tranquilo! Seguimos as melhores práticas da *LGPD*, e por isso preferimos que você envie os documentos por lá, pelo link!

───────────────────────────

Mas, se preferir, você pode me encaminhar por aqui também:

📌 *PESSOA FÍSICA* - Se a fatura está no seu nome:
• *Doc. de Identificação* (CNH, RG, Passaporte, Carteira de Trabalho, OAB...)
• *Fatura RECENTE* de energia *EM PDF* - _Nada de fotos tremidas ou embaçadas. Precisamos de imagens LEGÍVEIS!_

📌 *PESSOA JURÍDICA* - Se a fatura está em nome de uma empresa:
• Todos os documentos acima *para o Sócio Administrador*
• *ÚLTIMA ALTERAÇÃO SOCIAL* em PDF - ⚠️ _Não é Cartão CNPJ!_

───────────────────────────

💬 Qual é o seu caso: *PF* ou *PJ*?`;
  }
  
  // Fallback: formato legado (security-first simples)
  const greeting = nome ? `${nome}, p` : 'P';
  const securityChoice = getSecureUploadChoiceMessage();
  
  if (tipoCliente === 'PJ') {
    return `${greeting}ara gerar sua proposta definitiva, vou precisar de:

📄 *1. Contrato Social* (ou última alteração)
🪪 *2. Documento do Administrador* (RG ou CNH)
⚡ *3. Fatura de Energia* recente
${securityChoice}`;
  }
  
  return `${greeting}ara gerar sua proposta definitiva, vou precisar de:

🪪 *1. Documento de Identidade* (RG ou CNH)
⚡ *2. Fatura de Energia* recente
${securityChoice}`;
}

/**
 * Generate follow-up message after client confirms PF or PJ
 */
export function getDocumentsFollowupByType(tipoCliente: 'PF' | 'PJ'): string {
  if (tipoCliente === 'PJ') {
    return `Entendi! 👍 Para empresas preciso de:

📄 *Doc. de Identificação do Sócio Administrador* (CNH, RG...)
⚡ *Fatura RECENTE* de energia *EM PDF* - _Precisa estar legível!_
📋 *ÚLTIMA ALTERAÇÃO SOCIAL* em PDF - ⚠️ _Não é Cartão CNPJ!_

🔐 Você pode enviar pelo link da proposta (mais seguro) ou aqui mesmo!`;
  }
  
  return `Perfeito! 👍 Então preciso de:

📄 *Doc. de Identificação* (CNH, RG, Passaporte...)
⚡ *Fatura RECENTE* de energia *EM PDF* - _Precisa estar legível!_

🔐 Você pode enviar pelo link da proposta (mais seguro) ou aqui mesmo!`;
}

// Removed duplicate function - security-first version is above

/**
 * Generate message when document is already attached
 */
export function getDocumentAlreadyReceivedMessage(tipoDocumento: DocumentType): string {
  const tipoNome = DOCUMENT_TYPE_NAMES[tipoDocumento];
  const isFeminine = tipoNome === 'fatura de energia';
  
  return `Já recebi ${isFeminine ? 'essa' : 'esse'} ${tipoNome} antes! ✅ Obrigada por enviar novamente, mas já tenho ${isFeminine ? 'ela' : 'ele'} registrad${isFeminine ? 'a' : 'o'}.`;
}

// ═══════════════════════════════════════════════════════════════
// DOCUMENT TRACKING HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Create a new document tracking entry
 */
export function createDocTrackingEntry(
  type: DocumentType,
  fileName?: string,
  source: string = 'whatsapp'
): DocsReceivedWhatsApp {
  return {
    type,
    receivedAt: new Date().toISOString(),
    fileName,
    source,
  };
}

/**
 * Update docs_received_whatsapp array with new document
 */
export function updateDocsReceivedWhatsApp(
  currentDocs: DocsReceivedWhatsApp[] | null,
  newDoc: DocsReceivedWhatsApp
): DocsReceivedWhatsApp[] {
  const docs = currentDocs || [];
  
  // Check if this type already exists
  const existingIndex = docs.findIndex(d => d.type === newDoc.type);
  
  if (existingIndex >= 0) {
    // Replace existing entry
    const updated = [...docs];
    updated[existingIndex] = newDoc;
    return updated;
  }
  
  // Add new entry
  return [...docs, newDoc];
}

/**
 * Determine docs_source based on where documents came from
 */
export function determineDocsSource(
  hasWhatsAppDocs: boolean,
  hasPageDocs: boolean
): 'whatsapp' | 'page' | 'mixed' | null {
  if (hasWhatsAppDocs && hasPageDocs) {
    return 'mixed';
  }
  if (hasWhatsAppDocs) {
    return 'whatsapp';
  }
  if (hasPageDocs) {
    return 'page';
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// DOCUMENT RECOVERY
// ═══════════════════════════════════════════════════════════════

/**
 * Maps AI-detected document type to FileType
 */
export function mapToFileType(docType: DocumentType): FileType | null {
  if (docType === 'unknown') {
    return null;
  }
  return docType as FileType;
}

/**
 * Check if a Bitrix stage is eligible for document collection
 */
export function isDocumentCollectionStage(bitrixStage: string | null): boolean {
  if (!bitrixStage) return false;
  
  // Load stages from config
  const configCache = new Map<string, string>();
  const stagesJson = getConfigValue(
    'doc_collection_stages', 
    '["proposta_inicial_enviada","analise_documentos","proposta_definitiva","aguardando_documentos"]',
    configCache
  );
  
  let documentStages: string[];
  try {
    documentStages = JSON.parse(stagesJson);
  } catch {
    documentStages = [
      'proposta_inicial_enviada',
      'analise_documentos',
      'proposta_definitiva',
      'aguardando_documentos',
    ];
  }
  
  return documentStages.some(stage => 
    bitrixStage.toLowerCase().includes(stage.toLowerCase())
  );
}

// ═══════════════════════════════════════════════════════════════
// PAGE SUBMISSION HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Check if client has submitted documents via the public proposal page
 */
export async function checkDocsSubmittedViaPage(
  supabaseClient: any,
  propostaId: string | null
): Promise<DocsSubmittedViaPage> {
  const defaultResult: DocsSubmittedViaPage = {
    hasSubmission: false,
    documentoIdentidade: false,
    fatura: false,
    contratoSocial: false,
    status: null,
  };
  
  if (!propostaId) {
    return defaultResult;
  }
  
  try {
    const { data, error } = await supabaseClient
      .from('solicitacoes_proposta_definitiva')
      .select('id, status, documento_identidade_url, conta_luz_url, contrato_social_url')
      .eq('proposta_id', propostaId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (error || !data) {
      return defaultResult;
    }
    
    return {
      hasSubmission: true,
      documentoIdentidade: !!data.documento_identidade_url,
      fatura: !!data.conta_luz_url,
      contratoSocial: !!data.contrato_social_url,
      status: data.status,
    };
  } catch (err) {
    console.error('[checkDocsSubmittedViaPage] Error:', err);
    return defaultResult;
  }
}

// ═══════════════════════════════════════════════════════════════
// VALIDATION HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Validate file size for document upload
 */
export function validateDocumentSize(sizeBytes: number, maxMB?: number): boolean {
  const configCache = new Map<string, string>();
  const configMaxMB = parseInt(getConfigValue('doc_max_size_mb', '15', configCache));
  const effectiveMaxMB = maxMB ?? configMaxMB;
  return sizeBytes <= effectiveMaxMB * 1024 * 1024;
}

/**
 * Get error message for oversized document
 */
export function getOversizedDocumentMessage(docType: 'image' | 'pdf'): string {
  if (docType === 'pdf') {
    return '[PDF muito grande para análise. Por favor, envie um arquivo menor ou as páginas principais como imagens.]';
  }
  return '[Imagem muito grande para análise. Por favor, envie uma imagem menor.]';
}

/**
 * Determine MIME type from URL or filename
 */
export function getMimeTypeFromUrl(url: string): string {
  const lowerUrl = url.toLowerCase();
  
  if (lowerUrl.includes('.png')) return 'image/png';
  if (lowerUrl.includes('.webp')) return 'image/webp';
  if (lowerUrl.includes('.gif')) return 'image/gif';
  if (lowerUrl.includes('.pdf')) return 'application/pdf';
  
  // Default to JPEG for images
  return 'image/jpeg';
}
