import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsPrelight, errorResponse, getStrictCorsHeaders } from '../_shared/security-helpers.ts';
import { validateSofiaBitrixLead, parseAndValidate } from '../_shared/zod-schemas.ts';
import {
  loadProposalRequirements,
  getRequiredFieldIds,
  getRequiredFileIds,
  type UnifiedRequirementsConfig,
} from '../_shared/proposal-requirements.ts';

// ═══════════════════════════════════════════════════════════════
// BITRIX CLIENT - Shared module for Bitrix24 API calls
// ═══════════════════════════════════════════════════════════════
import {
  formatPhoneForBitrix as formatPhone,
  normalizarDistribuidoraParaBitrix,
  resolveBitrixEnumId,
  executeBitrixBatch,
  batchUpdateBitrixLead,
  findLeadByPhone,
  findContactByPhone,
  createBitrixLead,
  getBitrixLead,
  getBitrixContact,
  type BatchCommand,
} from '../_shared/bitrix-client.ts';

// ═══════════════════════════════════════════════════════════════
// DYNAMIC PATTERN LOADING FROM DATABASE
// ═══════════════════════════════════════════════════════════════
interface PatternEntry {
  keywords: string[];
  regexPatterns: RegExp[];
  templates: Map<string, string>;
}

let extractionPatterns: Map<string, PatternEntry> = new Map();
let patternsLoadedAt = 0;
const PATTERNS_TTL_MS = 10 * 60 * 1000; // 10 minutes cache

interface PatternRow {
  category: string;
  pattern: string;
  pattern_type: string;
  response_template: string | null;
  priority: number;
}

async function loadExtractionPatterns(supabase: any): Promise<void> {
  const now = Date.now();
  if (extractionPatterns.size > 0 && (now - patternsLoadedAt) < PATTERNS_TTL_MS) {
    return; // Use cached patterns
  }

  try {
    const { data, error } = await supabase
      .from('sofia_detection_patterns')
      .select('category, pattern, pattern_type, response_template, priority')
      .like('category', 'extract_%')
      .eq('is_active', true)
      .order('priority', { ascending: false });

    if (error) {
      console.error('[sofia-bitrix-lead] Failed to load extraction patterns:', error);
      return;
    }

    const newPatterns = new Map<string, PatternEntry>();
    const rows = (data || []) as PatternRow[];

    for (const row of rows) {
      if (!newPatterns.has(row.category)) {
        newPatterns.set(row.category, { keywords: [], regexPatterns: [], templates: new Map() });
      }
      const entry = newPatterns.get(row.category)!;
      
      if (row.pattern_type === 'keyword') {
        entry.keywords.push(row.pattern.toLowerCase());
      } else if (row.pattern_type === 'regex') {
        try {
          entry.regexPatterns.push(new RegExp(row.pattern, 'i'));
        } catch (e) {
          console.warn(`[sofia-bitrix-lead] Invalid regex pattern: ${row.pattern}`, e);
        }
      }
      
      if (row.response_template) {
        entry.templates.set(row.pattern.toLowerCase(), row.response_template);
      }
    }

    extractionPatterns = newPatterns;
    patternsLoadedAt = now;
    console.log(`[sofia-bitrix-lead] Loaded ${rows.length} extraction patterns in ${extractionPatterns.size} categories`);
  } catch (e) {
    console.error('[sofia-bitrix-lead] Error loading extraction patterns:', e);
  }
}

function getPatternsByCategory(category: string): PatternEntry | null {
  return extractionPatterns.get(category) || null;
}

function matchFirstPattern(text: string, category: string): RegExpMatchArray | null {
  const entry = getPatternsByCategory(category);
  if (!entry) return null;
  
  for (const regex of entry.regexPatterns) {
    const match = text.match(regex);
    if (match) return match;
  }
  return null;
}

function matchesAnyKeyword(text: string, category: string): string | null {
  const entry = getPatternsByCategory(category);
  if (!entry) return null;
  
  const lowerText = text.toLowerCase();
  for (const kw of entry.keywords) {
    if (lowerText.includes(kw)) return kw;
  }
  return null;
}

function getDistribuidoraKeywords(): string[] {
  const entry = getPatternsByCategory('extract_distribuidora');
  return entry?.keywords || [];
}

// Data collected from client during conversation
interface ExtractedClientData {
  nome?: string;
  cpf?: string;
  cnpj?: string;
  email?: string;
  telefone?: string;
  endereco?: string;
  cidade?: string;
  uf?: string;
  cep?: string;
  consumo?: number;
  valorFatura?: number;
  distribuidora?: string;
  numeroInstalacao?: string;
  tipoCliente?: 'PF' | 'PJ';
  rawAnalysis?: string;
}

// File types that can be attached
type FileType = 'fatura' | 'documento_identidade' | 'contrato_social';

interface SyncRequest {
  conversaId: string;
  phone: string;
  clienteNome?: string;
  dadosColetados: ExtractedClientData;
  arquivoNovo?: {
    tipo: FileType;
    base64: string;
    mimeType: string;
    fileName: string;
  };
  forcarMovimentacao?: boolean;
  // Agent identity - enables proper CRM attribution for any agent
  agent_id?: string;
}

// Bitrix24 stage definitions and requirements
interface StageRequirements {
  id: string;
  name: string;
  requiredFields: string[];
  requiredFiles: FileType[];
}

// ═══════════════════════════════════════════════════════════════
// BITRIX24 STAGE DEFINITIONS (FLUXOGRAMA SOFIA)
// ═══════════════════════════════════════════════════════════════
// FLUXO:
// 1. NOVO_LEAD → Cliente entra no chat (1ª mensagem)
// 2. AGUARDANDO_DADOS → Sofia começa a atender
// 3. PROPOSTA_INICIAL → Cliente mandou os dados (valor + distribuidora)
// 4. LEAD_FRIO → Cliente não respondeu após 3 nudges (automação via Mail MKT)
// ═══════════════════════════════════════════════════════════════

// Default stage IDs (fallback if not configured in database)
const DEFAULT_STAGE_IDS = {
  NOVO_LEAD: 'NEW',
  AGUARDANDO_DADOS: 'UC_AGUARDANDO_DADOS',
  PROPOSTA_INICIAL: 'UC_9SLRPP',
  LEAD_FRIO: 'UC_LEAD_FRIO',
  LEAD_DESCARTADO: 'JUNK', // Lead desqualificado (Grupo A, tarifa social, baixo consumo)
  CONCESSIONARIA_NAO_ATENDIDA: 'UC_56ZLAR', // Distribuidora não atendida - para reativação futura
  PROPOSTA_DEFINITIVA: 'UC_JENEX5',
  AGUARDANDO_ASSINATURA: 'UC_AGUARDANDO_ASSINATURA',
  FECHADO: 'WON',
  PERDIDO: 'LOSE',
};

// Module-level variable that gets populated from config
// ═══════════════════════════════════════════════════════════════
// REQUISITOS DINÂMICOS - Carregados do banco de dados
// Chaves: automation_required_fields_inicial, automation_required_files_inicial
//         automation_required_fields_definitiva, automation_required_files_definitiva
// ═══════════════════════════════════════════════════════════════

// Default requirements (fallback if database config is not available)
// IMPORTANTE: email é OBRIGATÓRIO para proposta inicial (confirmado pelo usuário)
const DEFAULT_REQUIRED_FIELDS_INICIAL = ['nome', 'email', 'concessionaria', 'valorConta'];
const DEFAULT_REQUIRED_FILES_INICIAL: FileType[] = [];
const DEFAULT_REQUIRED_FIELDS_DEFINITIVA = ['nome', 'whatsappOuEmail', 'concessionaria', 'cpfCnpj', 'endereco', 'tipoInstalacao'];
const DEFAULT_REQUIRED_FILES_DEFINITIVA: FileType[] = ['fatura', 'documento_identidade'];

// Dynamic requirements loaded from database
let dynamicRequiredFieldsInicial: string[] = DEFAULT_REQUIRED_FIELDS_INICIAL;
let dynamicRequiredFilesInicial: FileType[] = DEFAULT_REQUIRED_FILES_INICIAL;
let dynamicRequiredFieldsDefinitiva: string[] = DEFAULT_REQUIRED_FIELDS_DEFINITIVA;
let dynamicRequiredFilesDefinitiva: FileType[] = DEFAULT_REQUIRED_FILES_DEFINITIVA;

const BITRIX_STAGES: Record<string, StageRequirements> = {
  NOVO_LEAD: { id: DEFAULT_STAGE_IDS.NOVO_LEAD, name: 'Novo Lead', requiredFields: ['telefone'], requiredFiles: [] },
  AGUARDANDO_DADOS: { id: DEFAULT_STAGE_IDS.AGUARDANDO_DADOS, name: 'Aguardando Dados - Whatsapp', requiredFields: ['telefone'], requiredFiles: [] },
  // PROPOSTA INICIAL: Requisitos carregados dinamicamente
  PROPOSTA_INICIAL: { id: DEFAULT_STAGE_IDS.PROPOSTA_INICIAL, name: 'Proposta Inicial', requiredFields: [], requiredFiles: [] },
  LEAD_FRIO: { id: DEFAULT_STAGE_IDS.LEAD_FRIO, name: 'Lead Frio - Mail MKT', requiredFields: [], requiredFiles: [] },
  LEAD_DESCARTADO: { id: DEFAULT_STAGE_IDS.LEAD_DESCARTADO, name: 'Lead Descartado', requiredFields: [], requiredFiles: [] },
  // Concessionária Não Atendida: Para reativação futura quando expandir operações
  CONCESSIONARIA_NAO_ATENDIDA: { id: DEFAULT_STAGE_IDS.CONCESSIONARIA_NAO_ATENDIDA, name: 'Concessionária Não Atendida', requiredFields: [], requiredFiles: [] },
  // PROPOSTA DEFINITIVA: Requisitos carregados dinamicamente
  PROPOSTA_DEFINITIVA: { id: DEFAULT_STAGE_IDS.PROPOSTA_DEFINITIVA, name: 'Proposta Definitiva', requiredFields: [], requiredFiles: [] },
};

// Function to load and update stage IDs and dynamic requirements from config
function loadStageIdsFromConfig(config: Record<string, string>): void {
  const stageMapping: Record<string, string> = {
    'bitrix24_stage_novo_lead': 'NOVO_LEAD',
    'bitrix24_stage_aguardando_dados': 'AGUARDANDO_DADOS',
    'bitrix24_stage_proposta_inicial': 'PROPOSTA_INICIAL',
    'bitrix24_stage_lead_frio': 'LEAD_FRIO',
    'bitrix24_stage_descartado': 'LEAD_DESCARTADO',
    'bitrix24_stage_concessionaria_nao_atendida': 'CONCESSIONARIA_NAO_ATENDIDA',
    'bitrix24_stage_proposta_definitiva': 'PROPOSTA_DEFINITIVA',
  };

  for (const [configKey, stageKey] of Object.entries(stageMapping)) {
    if (config[configKey] && BITRIX_STAGES[stageKey]) {
      BITRIX_STAGES[stageKey].id = config[configKey];
      console.log(`[sofia-bitrix-lead] Stage ${stageKey} ID loaded from config: ${config[configKey]}`);
    }
  }

  // Load dynamic required fields for PROPOSTA_INICIAL
  if (config.automation_required_fields_inicial) {
    try {
      const parsed = JSON.parse(config.automation_required_fields_inicial);
      if (Array.isArray(parsed) && parsed.length > 0) {
        dynamicRequiredFieldsInicial = parsed;
        console.log(`[sofia-bitrix-lead] Loaded ${parsed.length} required fields for PROPOSTA_INICIAL from config`);
      }
    } catch (e) {
      console.warn('[sofia-bitrix-lead] Failed to parse automation_required_fields_inicial:', e);
    }
  }

  // Load dynamic required files for PROPOSTA_INICIAL
  if (config.automation_required_files_inicial) {
    try {
      const parsed = JSON.parse(config.automation_required_files_inicial);
      if (Array.isArray(parsed)) {
        dynamicRequiredFilesInicial = parsed as FileType[];
        console.log(`[sofia-bitrix-lead] Loaded ${parsed.length} required files for PROPOSTA_INICIAL from config`);
      }
    } catch (e) {
      console.warn('[sofia-bitrix-lead] Failed to parse automation_required_files_inicial:', e);
    }
  }

  // Load dynamic required fields for PROPOSTA_DEFINITIVA
  if (config.automation_required_fields_definitiva) {
    try {
      const parsed = JSON.parse(config.automation_required_fields_definitiva);
      if (Array.isArray(parsed) && parsed.length > 0) {
        dynamicRequiredFieldsDefinitiva = parsed;
        console.log(`[sofia-bitrix-lead] Loaded ${parsed.length} required fields for PROPOSTA_DEFINITIVA from config`);
      }
    } catch (e) {
      console.warn('[sofia-bitrix-lead] Failed to parse automation_required_fields_definitiva:', e);
    }
  }

  // Load dynamic required files for PROPOSTA_DEFINITIVA
  if (config.automation_required_files_definitiva) {
    try {
      const parsed = JSON.parse(config.automation_required_files_definitiva);
      if (Array.isArray(parsed)) {
        dynamicRequiredFilesDefinitiva = parsed as FileType[];
        console.log(`[sofia-bitrix-lead] Loaded ${parsed.length} required files for PROPOSTA_DEFINITIVA from config`);
      }
    } catch (e) {
      console.warn('[sofia-bitrix-lead] Failed to parse automation_required_files_definitiva:', e);
    }
  }

  // Update BITRIX_STAGES with dynamic requirements
  BITRIX_STAGES.PROPOSTA_INICIAL.requiredFields = dynamicRequiredFieldsInicial;
  BITRIX_STAGES.PROPOSTA_INICIAL.requiredFiles = dynamicRequiredFilesInicial;
  BITRIX_STAGES.PROPOSTA_DEFINITIVA.requiredFields = dynamicRequiredFieldsDefinitiva;
  BITRIX_STAGES.PROPOSTA_DEFINITIVA.requiredFiles = dynamicRequiredFilesDefinitiva;
}

// Export stage IDs for use in other functions
export const BITRIX_STAGE_IDS = DEFAULT_STAGE_IDS;

// Export dynamic requirements for use in other functions
export function getDynamicRequirements(tipo: 'inicial' | 'definitiva'): { fields: string[]; files: FileType[] } {
  if (tipo === 'inicial') {
    return { fields: dynamicRequiredFieldsInicial, files: dynamicRequiredFilesInicial };
  }
  return { fields: dynamicRequiredFieldsDefinitiva, files: dynamicRequiredFilesDefinitiva };
}

// Parse the AI analysis to extract structured data
// Now uses dynamic patterns from database
function parseInvoiceAnalysis(analysis: string): ExtractedClientData {
  const data: ExtractedClientData = {};
  const lowerAnalysis = analysis.toLowerCase();
  
  // Extract consumption (kWh) using dynamic patterns
  const consumoMatch = matchFirstPattern(analysis, 'extract_invoice_consumo');
  if (consumoMatch && consumoMatch[1]) {
    data.consumo = parseFloat(consumoMatch[1].replace(',', '.'));
  }
  
  // Extract bill value (R$) using dynamic patterns
  const valorMatch = matchFirstPattern(analysis, 'extract_invoice_valor');
  if (valorMatch && valorMatch[1]) {
    data.valorFatura = parseFloat(valorMatch[1].replace('.', '').replace(',', '.'));
  }
  
  // Extract distributor using dynamic keywords
  const distKeywords = getDistribuidoraKeywords();
  for (const dist of distKeywords) {
    if (lowerAnalysis.includes(dist)) {
      data.distribuidora = dist.toUpperCase();
      break;
    }
  }
  
  // Extract installation number using dynamic patterns
  const instalacaoMatch = matchFirstPattern(analysis, 'extract_invoice_instalacao');
  if (instalacaoMatch && instalacaoMatch[1]) {
    data.numeroInstalacao = instalacaoMatch[1];
  }
  
  // Extract CPF/CNPJ using dynamic patterns
  const cnpjMatch = matchFirstPattern(analysis, 'extract_invoice_cnpj');
  const cpfMatch = matchFirstPattern(analysis, 'extract_invoice_cpf');
  
  if (cnpjMatch && cnpjMatch[1]) {
    data.cnpj = cnpjMatch[1].replace(/[.\s\/-]/g, '');
    data.tipoCliente = 'PJ';
  } else if (cpfMatch && cpfMatch[1]) {
    data.cpf = cpfMatch[1].replace(/[.\s-]/g, '');
    data.tipoCliente = 'PF';
  }

  // Extract name from invoice/document using dynamic patterns
  const nomeMatch = matchFirstPattern(analysis, 'extract_invoice_nome');
  if (nomeMatch && nomeMatch[1] && nomeMatch[1].trim().length > 3) {
    data.nome = nomeMatch[1].trim();
  }

  // Extract address using dynamic patterns
  const enderecoMatch = matchFirstPattern(analysis, 'extract_invoice_endereco');
  if (enderecoMatch && enderecoMatch[1] && enderecoMatch[1].trim().length > 10) {
    data.endereco = enderecoMatch[1].trim().replace(/,\s*$/, '');
  }

  // Extract CEP using dynamic patterns
  const cepMatch = matchFirstPattern(analysis, 'extract_invoice_cep');
  if (cepMatch && cepMatch[1]) {
    data.cep = cepMatch[1].replace(/[-.\s]/g, '');
  }
  
  return data;
}

// Extract data from text messages
// Now uses dynamic patterns from database for flexibility
function extractDataFromText(message: string, existingData: ExtractedClientData): ExtractedClientData {
  const data = { ...existingData };
  const lowerMessage = message.toLowerCase();
  const _trimmedMessage = message.trim();
  
  // Extract CPF using dynamic patterns
  if (!data.cpf) {
    const cpfMatch = matchFirstPattern(message, 'extract_cpf');
    if (cpfMatch && cpfMatch[1]) {
      data.cpf = cpfMatch[1].replace(/[.\-]/g, '');
      data.tipoCliente = 'PF';
    }
  }
  
  // Extract CNPJ using dynamic patterns
  if (!data.cnpj) {
    const cnpjMatch = matchFirstPattern(message, 'extract_cnpj');
    if (cnpjMatch && cnpjMatch[1]) {
      data.cnpj = cnpjMatch[1].replace(/[.\/\-]/g, '');
      data.tipoCliente = 'PJ';
    }
  }
  
  // Extract CEP using dynamic patterns
  if (!data.cep) {
    const cepMatch = matchFirstPattern(message, 'extract_cep');
    if (cepMatch && cepMatch[1]) {
      data.cep = cepMatch[1].replace(/[-.]/, '');
    }
  }
  
  // ═══════════════════════════════════════════════════════════════
  // BILL VALUE EXTRACTION - Uses dynamic patterns from DB
  // Supports multiple formats including natural language
  // ═══════════════════════════════════════════════════════════════
  if (!data.valorFatura) {
    let extractedValue: number | null = null;
    
    // Check for "um mil" / "mil reais" first using database keywords
    const milKeyword = matchesAnyKeyword(lowerMessage, 'extract_valor_mil');
    if (milKeyword && !/\d+\s*mil/i.test(lowerMessage)) {
      extractedValue = 1000;
      console.log(`[sofia-bitrix-lead] Bill value extracted (um mil keyword): ${extractedValue}`);
    }
    
    // Try all extract_valor patterns from database (sorted by priority)
    if (!extractedValue) {
      const valorPatterns = getPatternsByCategory('extract_valor');
      if (valorPatterns) {
        for (const regex of valorPatterns.regexPatterns) {
          const match = message.match(regex) || lowerMessage.match(regex);
          if (match) {
            // Handle different capture group patterns
            if (match[2] !== undefined) {
              // Pattern with two groups (integer + decimals or range)
              const val1 = parseInt(match[1]);
              const val2Match = match[2];
              
              // Check if it's a range pattern (entre X a Y)
              if (/entre/.test(regex.source)) {
                const val2 = parseInt(val2Match);
                extractedValue = Math.max(val1, val2);
              } else if (val2Match.length === 2) {
                // Decimal pattern
                extractedValue = val1 + parseInt(val2Match) / 100;
              } else {
                // "mil e X" pattern
                extractedValue = val1 * 1000 + (val2Match ? parseInt(val2Match) : 0);
              }
            } else if (match[1]) {
              // Single group pattern
              const rawValue = match[1].replace(/\./g, '').replace(',', '.');
              extractedValue = parseFloat(rawValue);
            }
            
            // Validate range
            if (extractedValue && extractedValue >= 50 && extractedValue <= 100000) {
              console.log(`[sofia-bitrix-lead] Bill value extracted (dynamic pattern): ${extractedValue}`);
              break;
            } else {
              extractedValue = null;
            }
          }
        }
      }
    }
    
    // Save extracted value if valid
    if (extractedValue && extractedValue >= 50 && extractedValue <= 100000) {
      data.valorFatura = extractedValue;
    }
  }
  
  // Extract consumption (XXX kWh) using dynamic patterns
  if (!data.consumo) {
    const consumoMatch = matchFirstPattern(message, 'extract_consumo');
    if (consumoMatch && consumoMatch[1]) {
      data.consumo = parseInt(consumoMatch[1]);
    }
  }
  
  // Detect distributor using dynamic keywords from database
  if (!data.distribuidora) {
    const distKeywords = getDistribuidoraKeywords();
    for (const dist of distKeywords) {
      if (lowerMessage.includes(dist)) {
        // Normalize known variations
        if (dist.includes('coelba') || (dist === 'neoenergia' && lowerMessage.includes('coelba'))) {
          data.distribuidora = 'NEOENERGIA COELBA';
        } else if (dist.includes('cpfl') && (lowerMessage.includes('paulista') || dist === 'cpfl paulista')) {
          data.distribuidora = 'CPFL PAULISTA';
        } else {
          data.distribuidora = dist.toUpperCase();
        }
        break;
      }
    }
  }
  
  // Extract email using dynamic patterns
  if (!data.email) {
    const emailMatch = matchFirstPattern(message, 'extract_email');
    if (emailMatch && emailMatch[0]) {
      data.email = emailMatch[0];
    }
  }

  // Try to extract name using dynamic patterns
  if (!data.nome) {
    const nomeMatch = matchFirstPattern(message, 'extract_nome');
    if (nomeMatch && nomeMatch[1] && nomeMatch[1].trim().length > 2) {
      data.nome = nomeMatch[1].trim();
    }
  }
  
  return data;
}

// ═══════════════════════════════════════════════════════════════
// PHONE FORMATTING - NOW IMPORTED FROM _shared/bitrix-client.ts
// Function: formatPhoneForBitrix (aliased as formatPhone for compatibility)
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// BITRIX24 ENUM (LIST) HELPERS - NOW IMPORTED FROM _shared/bitrix-client.ts
// Functions: normalizeEnumKey, resolveBitrixEnumId, normalizarDistribuidoraParaBitrix
// ═══════════════════════════════════════════════════════════════

// Check if data meets requirements for a stage
// REQUISITOS DINÂMICOS - Carregados do banco de dados (automation_required_fields_*)
function checkStageRequirements(dados: ExtractedClientData, arquivos: FileType[], stage: StageRequirements): boolean {
  // Check required fields based on dynamic configuration
  for (const field of stage.requiredFields) {
    // Handle combined fields
    if (field === 'consumo_ou_valor' || field === 'valorConta') {
      if (!dados.consumo && !dados.valorFatura) {
        console.log(`[checkStageRequirements] Missing: consumo_ou_valor (consumo=${dados.consumo}, valorFatura=${dados.valorFatura})`);
        return false;
      }
    } else if (field === 'cpf_cnpj' || field === 'cpfCnpj') {
      if (!dados.cpf && !dados.cnpj) {
        console.log(`[checkStageRequirements] Missing: cpf_cnpj`);
        return false;
      }
    } else if (field === 'whatsappOuEmail') {
      // WhatsApp is implicit (always present from conversation), but email should be validated
      if (!dados.email && !dados.telefone) {
        console.log(`[checkStageRequirements] Missing: whatsappOuEmail`);
        return false;
      }
    } else if (field === 'nome') {
      if (!dados.nome || dados.nome.trim().length < 2) {
        console.log(`[checkStageRequirements] Missing: nome (value=${dados.nome})`);
        return false;
      }
    } else if (field === 'email') {
      if (!dados.email || !dados.email.includes('@')) {
        console.log(`[checkStageRequirements] Missing: email (value=${dados.email})`);
        return false;
      }
    } else if (field === 'concessionaria' || field === 'distribuidora') {
      if (!dados.distribuidora) {
        console.log(`[checkStageRequirements] Missing: distribuidora`);
        return false;
      }
    } else if (field === 'tipoInstalacao') {
      // deno-lint-ignore no-explicit-any
      const tipoInstalacao = (dados as any).tipoInstalacao;
      if (!tipoInstalacao || !['Monofásico', 'Bifásico', 'Trifásico', 'monofasico', 'bifasico', 'trifasico'].includes(tipoInstalacao)) {
        console.log(`[checkStageRequirements] Missing: tipoInstalacao (value=${tipoInstalacao})`);
        return false;
      }
    } else if (field === 'endereco') {
      if (!dados.endereco && !dados.cep) {
        console.log(`[checkStageRequirements] Missing: endereco`);
        return false;
      }
    } else if (field === 'consumoMedio') {
      if (!dados.consumo) {
        console.log(`[checkStageRequirements] Missing: consumoMedio`);
        return false;
      }
    } else if (field === 'numeroInstalacao') {
      if (!dados.numeroInstalacao) {
        console.log(`[checkStageRequirements] Missing: numeroInstalacao`);
        return false;
      }
    } else {
      // Generic field check
      // deno-lint-ignore no-explicit-any
      if (!(dados as any)[field]) {
        console.log(`[checkStageRequirements] Missing: ${field}`);
        return false;
      }
    }
  }
  
  // Check required files (dynamic configuration)
  for (const fileType of stage.requiredFiles) {
    // Skip contrato_social for PF (only required for PJ)
    if (fileType === 'contrato_social' && !dados.cnpj) {
      continue;
    }
    if (!arquivos.includes(fileType)) {
      console.log(`[checkStageRequirements] Missing file: ${fileType}`);
      return false;
    }
  }
  
  console.log(`[checkStageRequirements] All requirements met for stage: ${stage.name}`);
  return true;
}

// ═══════════════════════════════════════════════════════════════
// DETERMINE NEXT STAGE - FLUXOGRAMA SOFIA
// ═══════════════════════════════════════════════════════════════
// Fluxo:
// NEW (Novo Lead) → UC_AGUARDANDO_DADOS (Aguardando Dados - Whatsapp) → UC_9SLRPP (Proposta Inicial)
// Se cliente não responder após 3 nudges → UC_LEAD_FRIO (Lead Frio - Mail MKT)
// ═══════════════════════════════════════════════════════════════

function determineNextStage(
  currentStage: string | null,
  dados: ExtractedClientData,
  arquivos: FileType[],
  context?: { sofiaRespondeu?: boolean; leadFrio?: boolean }
): { stage: string; stageName: string } | null {
  
  // Se foi marcado como lead frio (3 nudges sem resposta), mover para Lead Frio
  if (context?.leadFrio) {
    return { 
      stage: BITRIX_STAGES.LEAD_FRIO.id, 
      stageName: BITRIX_STAGES.LEAD_FRIO.name 
    };
  }
  
  // ═══════════════════════════════════════════════════════════════
  // RESGATE DE LEAD FRIO: Se o lead está em Lead Frio e cliente volta a responder
  // com dados suficientes, resgatar para o fluxo comercial
  // ═══════════════════════════════════════════════════════════════
  if (currentStage === BITRIX_STAGES.LEAD_FRIO.id) {
    const hasEnoughDataForProposal = checkStageRequirements(dados, arquivos, BITRIX_STAGES.PROPOSTA_INICIAL);
    
    if (hasEnoughDataForProposal) {
      console.log(`[determineNextStage] 🔥 RESGATANDO lead de LEAD_FRIO → PROPOSTA_INICIAL (cliente voltou com dados completos)`);
      return { 
        stage: BITRIX_STAGES.PROPOSTA_INICIAL.id, 
        stageName: BITRIX_STAGES.PROPOSTA_INICIAL.name 
      };
    }
    
    // Se tem dados parciais, mover para AGUARDANDO_DADOS (reativar lead)
    const hasAnyData = !!(
      dados.valorFatura || 
      dados.consumo || 
      dados.distribuidora || 
      dados.email ||
      dados.nome
    );
    
    if (hasAnyData) {
      console.log(`[determineNextStage] 🔥 RESGATANDO lead de LEAD_FRIO → AGUARDANDO_DADOS (cliente voltou com dados parciais)`);
      return { 
        stage: BITRIX_STAGES.AGUARDANDO_DADOS.id, 
        stageName: BITRIX_STAGES.AGUARDANDO_DADOS.name 
      };
    }
    
    // Sem dados, permanece em Lead Frio
    console.log(`[determineNextStage] Lead em LEAD_FRIO, cliente respondeu mas sem dados relevantes`);
    return null;
  }
  
  // Fluxo normal de progressão
  const stageOrder = ['NOVO_LEAD', 'AGUARDANDO_DADOS', 'PROPOSTA_INICIAL', 'PROPOSTA_DEFINITIVA'];
  
  // ═══════════════════════════════════════════════════════════════
  // FIX "CASO EDSON": Map unknown stages (IN_PROCESS, etc.) to collection phase
  // The Bitrix24 may have custom/intermediate stages not in our mapping
  // These should be treated as AGUARDANDO_DADOS for progression purposes
  // ═══════════════════════════════════════════════════════════════
  const COLLECTION_PHASE_ALIASES = ['IN_PROCESS', 'UC_TRIAGEM', 'UC_IN_PROGRESS', 'PREPARATION'];
  const isCollectionPhaseAlias = COLLECTION_PHASE_ALIASES.includes(currentStage || '');
  
  // Find current stage index based on stage ID
  let currentIndex = -1;
  for (let i = 0; i < stageOrder.length; i++) {
    const stageKey = stageOrder[i];
    if (BITRIX_STAGES[stageKey]?.id === currentStage) {
      currentIndex = i;
      break;
    }
  }
  
  // If unknown stage but looks like collection phase, treat as AGUARDANDO_DADOS
  if (currentIndex === -1 && isCollectionPhaseAlias) {
    console.log(`[determineNextStage] ⚠️ Unmapped stage "${currentStage}" detected - treating as AGUARDANDO_DADOS for progression`);
    currentIndex = 1; // AGUARDANDO_DADOS position
  }
  
  // ═══════════════════════════════════════════════════════════════
  // LÓGICA DE PROGRESSÃO DE NEW → AGUARDANDO_DADOS
  // Só move quando o cliente enviar o 1º dado (valorFatura, distribuidora, etc.)
  // Não depende mais de "sofiaRespondeu" - depende de "hasAnyData"
  // ═══════════════════════════════════════════════════════════════
  if (currentStage === 'NEW' || currentStage === null || currentIndex === 0) {
    // Função auxiliar para verificar se há dados coletados
    const hasAnyData = !!(
      dados.valorFatura || 
      dados.consumo || 
      dados.distribuidora || 
      dados.cpf || 
      dados.cnpj || 
      dados.email ||
      dados.cep ||
      dados.endereco ||
      dados.nome
    );
    
    // Só progride se tiver algum dado coletado
    if (!hasAnyData) {
      console.log(`[determineNextStage] Lead em NEW, aguardando 1º dado do cliente`);
      return null; // Permanece em NEW até o cliente enviar dados
    }
    
    // Verifica se já tem dados suficientes para pular direto para proposta
    const hasEnoughDataForProposal = checkStageRequirements(dados, arquivos, BITRIX_STAGES.PROPOSTA_INICIAL);
    
    if (hasEnoughDataForProposal) {
      // Pular direto para Proposta Inicial se já tem os dados
      console.log(`[determineNextStage] Lead tem dados completos, movendo de NEW → PROPOSTA_INICIAL`);
      return { 
        stage: BITRIX_STAGES.PROPOSTA_INICIAL.id, 
        stageName: BITRIX_STAGES.PROPOSTA_INICIAL.name 
      };
    }
    
    // Mover para Aguardando Dados (tem dados parciais)
    console.log(`[determineNextStage] Lead tem dados parciais, movendo de NEW → AGUARDANDO_DADOS`);
    return { 
      stage: BITRIX_STAGES.AGUARDANDO_DADOS.id, 
      stageName: BITRIX_STAGES.AGUARDANDO_DADOS.name 
    };
  }
  
  // Se está em AGUARDANDO_DADOS (ou alias) e tem dados suficientes, mover para PROPOSTA_INICIAL
  if (currentStage === BITRIX_STAGES.AGUARDANDO_DADOS.id || currentIndex === 1 || isCollectionPhaseAlias) {
    if (checkStageRequirements(dados, arquivos, BITRIX_STAGES.PROPOSTA_INICIAL)) {
      console.log(`[determineNextStage] Lead em ${currentStage} tem dados completos → PROPOSTA_INICIAL`);
      return { 
        stage: BITRIX_STAGES.PROPOSTA_INICIAL.id, 
        stageName: BITRIX_STAGES.PROPOSTA_INICIAL.name 
      };
    }
    return null; // Ainda aguardando dados
  }
  
  // Se está em PROPOSTA_INICIAL e tem todos os requisitos dinâmicos, mover para PROPOSTA_DEFINITIVA
  if (currentStage === BITRIX_STAGES.PROPOSTA_INICIAL.id || currentIndex === 2) {
    // Use dynamic requirements from configuration
    const requirements = getDynamicRequirements('definitiva');
    
    // Check all dynamic requirements using the stage configuration
    const meetsAllRequirements = checkStageRequirements(dados, arquivos, {
      id: BITRIX_STAGES.PROPOSTA_DEFINITIVA.id,
      name: BITRIX_STAGES.PROPOSTA_DEFINITIVA.name,
      requiredFields: requirements.fields,
      requiredFiles: requirements.files,
    });
    
    if (meetsAllRequirements) {
      console.log(`[determineNextStage] All dynamic validations passed, moving to PROPOSTA_DEFINITIVA`);
      console.log(`[determineNextStage] Required fields: ${requirements.fields.join(', ')}`);
      console.log(`[determineNextStage] Required files: ${requirements.files.join(', ')}`);
      return { 
        stage: BITRIX_STAGES.PROPOSTA_DEFINITIVA.id, 
        stageName: BITRIX_STAGES.PROPOSTA_DEFINITIVA.name 
      };
    }
    return null; // Still waiting for required data/documents
  }
  
  // Progressão normal para os próximos estágios
  for (let i = currentIndex + 1; i < stageOrder.length; i++) {
    const stageKey = stageOrder[i];
    const stage = BITRIX_STAGES[stageKey];
    
    if (stage && checkStageRequirements(dados, arquivos, stage)) {
      return { stage: stage.id, stageName: stage.name };
    } else {
      // Can't skip stages - stop at first stage we don't qualify for
      break;
    }
  }
  
  return null;
}

// ═══════════════════════════════════════════════════════════════
// FUNÇÃO PARA MOVER LEAD PARA "LEAD FRIO"
// Chamada quando cliente não responde após 3 nudges
// Suporta agentes dinâmicos (marIA, julIA, etc.)
// REFATORADO: Usa executeBitrixBatch para consolidar 2 chamadas em 1
// ═══════════════════════════════════════════════════════════════

// agentId parameter enables proper CRM attribution for any agent (marIA, julIA, etc.)
export async function moveToLeadFrio(
  supabase: any,
  bitrix24Url: string,
  leadId: string,
  conversaId: string,
  agentId: string = 'sofia'
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`[sofia-bitrix-lead] Moving lead ${leadId} to Lead Frio - agent: ${agentId}`);
    
    // Fetch agent's Bitrix24 user ID dynamically
    const { data: agentConfig } = await supabase
      .from('ai_agents')
      .select('bitrix24_user_id, name')
      .eq('agent_id', agentId)
      .single();
    
    const agentBitrixUserId = agentConfig?.bitrix24_user_id;
    const agentName = agentConfig?.name || 'IA';
    
    const comentario = `Lead movido para "Lead Frio" automaticamente após 3 tentativas de contato sem resposta.`;
    const commentText = `🔴 Lead movido para "Lead Frio - Mail MKT"\n\nMotivo: Cliente não respondeu após 3 tentativas de contato via WhatsApp.\nAgente: ${agentName}\nData: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`;
    
    // Build batch commands for lead update + timeline comment (2 → 1 HTTP)
    const commands: Record<string, BatchCommand> = {
      'update_lead': {
        method: 'crm.lead.update',
        params: {
          id: leadId,
          fields: {
            STATUS_ID: BITRIX_STAGES.LEAD_FRIO.id,
            COMMENTS: comentario
          }
        }
      },
      'add_comment': {
        method: 'crm.timeline.comment.add',
        params: {
          fields: {
            ENTITY_ID: leadId,
            ENTITY_TYPE: 'lead',
            COMMENT: commentText,
            ...(agentBitrixUserId ? { AUTHOR_ID: agentBitrixUserId } : {})
          }
        }
      }
    };
    
    // Execute batch (2 commands → 1 HTTP request)
    const results = await executeBitrixBatch(bitrix24Url, commands);
    
    // Check for errors
    const updateResult = results.get('update_lead');
    if (!updateResult?.success) {
      throw new Error(`Bitrix24 batch error: ${updateResult?.error || 'Unknown error'}`);
    }
    
    // Update conversation with new stage
    await supabase
      .from('chatbot_conversas')
      .update({ 
        bitrix24_stage: BITRIX_STAGES.LEAD_FRIO.id,
        sofia_mode: 'lead_frio',
        ended_at: new Date().toISOString(),
      })
      .eq('id', conversaId);
    
    console.log(`[sofia-bitrix-lead] Lead ${leadId} moved to Lead Frio successfully (batch: 2→1)`);
    return { success: true };
    
  } catch (error) {
    console.error('[sofia-bitrix-lead] Error moving to Lead Frio:', error);
    return { success: false, error: String(error) };
  }
}

// ═══════════════════════════════════════════════════════════════
// FUNÇÃO PARA MOVER LEAD PARA "LEAD DESCARTADO" (JUNK)
// Chamada quando cliente é desqualificado (distribuidora não atendida, Grupo A, tarifa social)
// Usa mensagens configuráveis do banco de dados via _shared/disqualification-messages.ts
// ═══════════════════════════════════════════════════════════════

// Import from shared module for database-driven messages
import { 
  type MotivoDescarte as SharedMotivoDescarte,
  buildCRMComment,
  getCRMLabel as _getCRMLabel,
} from '../_shared/disqualification-messages.ts';

// Re-export the type for backwards compatibility
export type MotivoDescarte = SharedMotivoDescarte;

// agentId parameter enables proper CRM attribution for any agent (marIA, julIA, etc.)
// REFATORADO: Usa executeBitrixBatch para consolidar chamadas
export async function moveToLeadDescartado(
  supabase: any,
  bitrix24Url: string,
  leadId: string,
  conversaId: string,
  motivo: MotivoDescarte,
  detalhes?: string,
  agentId: string = 'sofia'
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`[sofia-bitrix-lead] Moving lead ${leadId} to Lead Descartado (${motivo}) - agent: ${agentId}`);
    
    // Buscar user ID do agente dinâmico (não mais hardcoded para 'sofia')
    const { data: agentConfig } = await supabase
      .from('ai_agents')
      .select('bitrix24_user_id, name')
      .eq('agent_id', agentId)
      .single();
    
    const agentBitrixUserId = agentConfig?.bitrix24_user_id;
    const agentName = agentConfig?.name || 'IA';
    
    // Build comment from database-driven messages
    const comentario = await buildCRMComment(supabase, motivo, agentName, detalhes);

    // Build batch commands for lead update + timeline comment
    const commands: Record<string, BatchCommand> = {
      'update_lead': {
        method: 'crm.lead.update',
        params: {
          id: leadId,
          fields: {
            STATUS_ID: BITRIX_STAGES.LEAD_DESCARTADO.id,
            COMMENTS: comentario
          }
        }
      },
      'add_comment': {
        method: 'crm.timeline.comment.add',
        params: {
          fields: {
            ENTITY_ID: leadId,
            ENTITY_TYPE: 'lead',
            COMMENT: `${comentario}\n\nAgente: ${agentName}`,
            ...(agentBitrixUserId ? { AUTHOR_ID: agentBitrixUserId } : {})
          }
        }
      }
    };
    
    // Execute batch (2 commands → 1 HTTP request)
    const results = await executeBitrixBatch(bitrix24Url, commands);
    
    // Check for errors
    const updateResult = results.get('update_lead');
    if (!updateResult?.success) {
      throw new Error(`Bitrix24 batch error: ${updateResult?.error || 'Unknown error'}`);
    }
    
    // Update conversation with new stage
    await supabase
      .from('chatbot_conversas')
      .update({ 
        bitrix24_stage: BITRIX_STAGES.LEAD_DESCARTADO.id,
        sofia_mode: 'descartado',
        ended_at: new Date().toISOString(),
        dados_coletados: supabase.raw(`dados_coletados || '{"motivoDescarte": "${motivo}"}'::jsonb`),
      })
      .eq('id', conversaId);
    
    console.log(`[sofia-bitrix-lead] Lead ${leadId} moved to Lead Descartado successfully (${motivo}) (batch)`);
    return { success: true };
    
  } catch (error) {
    console.error('[sofia-bitrix-lead] Error moving to Lead Descartado:', error);
    return { success: false, error: String(error) };
  }
}

Deno.serve(async (req) => {
  console.log('[sofia-bitrix-lead] Function called:', req.method);

  // Use strict CORS - internal API only
  const corsHeaders = getStrictCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return handleCorsPrelight(req, { mode: 'strict' });
  }

  try {
    // Validate payload
    const validation = await parseAndValidate(req, validateSofiaBitrixLead);
    if (!validation.success) {
      return errorResponse(validation.error, validation.status, req);
    }
    
    const body = validation.data;
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Load extraction patterns from database (cached for 10 minutes)
    await loadExtractionPatterns(supabase);

    console.log('[sofia-bitrix-lead] Sync request:', JSON.stringify({
      conversaId: body.conversaId,
      phone: body.phone,
      clienteNome: body.clienteNome,
      hasArquivoNovo: !!body.arquivoNovo,
      dadosKeys: Object.keys(body.dadosColetados || {}),
    }));

    // Get Bitrix24 configuration AND public URL settings AND Sofia user ID AND dynamic automation settings
    const { data: configData } = await supabase
      .from('configuracoes_sistema')
      .select('chave, valor')
      .or(`chave.like.bitrix24%,chave.eq.public_app_url,chave.eq.public_cache_bust,chave.like.automation_%`);

    const config: Record<string, string> = {};
    configData?.forEach((c) => {
      config[c.chave] = c.valor;
    });

    // Load stage IDs from config (updates module-level BITRIX_STAGES)
    loadStageIdsFromConfig(config);

    // Buscar bitrix24_user_id do agente dinâmico da tabela ai_agents
    // Agora suporta qualquer agente (sofIA, marIA, julIA, etc.)
    const requestAgentId = body.agent_id || 'sofia';
    const { data: agentConfig } = await supabase
      .from('ai_agents')
      .select('bitrix24_user_id, name')
      .eq('agent_id', requestAgentId)
      .single();
    
    if (agentConfig?.bitrix24_user_id) {
      config.bitrix24_agent_user_id = agentConfig.bitrix24_user_id;
      console.log(`[sofia-bitrix-lead] Agent ${requestAgentId} (${agentConfig.name}) Bitrix24 user ID: ${agentConfig.bitrix24_user_id}`);
    }

    const bitrix24Url = config.bitrix24_webhook_url;
    const bitrix24Enabled = config.bitrix24_enabled === 'true';

    if (!bitrix24Url || !bitrix24Enabled) {
      console.log('[sofia-bitrix-lead] Bitrix24 not configured or disabled');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Bitrix24 not configured',
          leadCreated: false 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse extracted data from raw analysis if provided
    // Importante: rawAnalysis pode trazer e-mail/nome mesmo quando já existe consumo.
    const parsedData = body.dadosColetados || {};
    if (parsedData.rawAnalysis) {
      const extracted = parseInvoiceAnalysis(parsedData.rawAnalysis);
      // only fill missing fields (never override explicitly collected data)
      for (const [key, value] of Object.entries(extracted)) {
        if (value !== undefined && value !== null && value !== '') {
          // deno-lint-ignore no-explicit-any
          const current = (parsedData as any)[key];
          if (current === undefined || current === null || current === '') {
            // deno-lint-ignore no-explicit-any
            (parsedData as any)[key] = value;
          }
        }
      }
    }

    console.log('[sofia-bitrix-lead] Parsed data:', JSON.stringify(parsedData));

    const formattedPhone = formatPhone(body.phone);

    // Get current conversation state
    let currentBitrixLeadId: string | null = null;
    let currentBitrixStage: string | null = null;
    let currentDadosColetados: ExtractedClientData = {};
    let currentArquivosAnexados: FileType[] = [];

    // Track if client confirmed proposal generation
    let pendingTask: string | null = null;

    if (body.conversaId) {
      const { data: conversa } = await supabase
        .from('chatbot_conversas')
        .select('bitrix24_lead_id, bitrix24_stage, dados_coletados, arquivos_anexados, pending_task')
        .eq('id', body.conversaId)
        .single();

      if (conversa) {
        currentBitrixLeadId = conversa.bitrix24_lead_id;
        currentBitrixStage = conversa.bitrix24_stage;
        currentDadosColetados = (conversa.dados_coletados as ExtractedClientData) || {};
        currentArquivosAnexados = (conversa.arquivos_anexados as FileType[]) || [];
        pendingTask = conversa.pending_task;
      }
    }

    // Merge new data with existing data (new data takes precedence for non-empty values)
    const mergedData: ExtractedClientData = { ...currentDadosColetados };
    for (const [key, value] of Object.entries(parsedData)) {
      if (value !== undefined && value !== null && value !== '') {
        // deno-lint-ignore no-explicit-any
        (mergedData as any)[key] = value;
      }
    }

    // Add client name from request if not in merged data
    if (body.clienteNome && !mergedData.nome) {
      mergedData.nome = body.clienteNome;
    }

    // Add telefone from request to mergedData for stage requirement validation
    // This fixes the issue where leads with WhatsApp but no email were stuck in "Aguardando Dados"
    if (body.phone && !mergedData.telefone) {
      mergedData.telefone = formatPhone(body.phone);
      console.log(`[sofia-bitrix-lead] Added telefone to mergedData: ${mergedData.telefone}`);
    }

    console.log('[sofia-bitrix-lead] Merged data:', JSON.stringify(mergedData));

    // ═══════════════════════════════════════════════════════════════
    // FALLBACK: Recover missing critical data from recent user messages
    // This ensures data mentioned by the client is not lost due to 
    // extraction timing issues between webhook calls.
    // ═══════════════════════════════════════════════════════════════
    const needsMessageRecovery = !mergedData.distribuidora || 
                                  !mergedData.valorFatura || 
                                  !mergedData.email || 
                                  !mergedData.nome;

    if (body.conversaId && needsMessageRecovery) {
      const { data: recentUserMsgs, error: recentMsgsErr } = await supabase
        .from('chatbot_mensagens')
        .select('content, created_at')
        .eq('conversa_id', body.conversaId)
        .eq('role', 'user')
        .order('created_at', { ascending: false })
        .limit(20);

      if (recentMsgsErr) {
        console.warn('[sofia-bitrix-lead] Could not load recent user messages:', recentMsgsErr);
      } else if (recentUserMsgs?.length) {
        console.log(`[sofia-bitrix-lead] Checking ${recentUserMsgs.length} recent messages for missing data...`);
        
        for (const msg of recentUserMsgs) {
          const extracted = extractDataFromText(String(msg.content || ''), {});
          
          // Recover distribuidora
          if (!mergedData.distribuidora && extracted.distribuidora) {
            mergedData.distribuidora = extracted.distribuidora;
            console.log(`[sofia-bitrix-lead] ✅ Recovered distribuidora from messages: "${mergedData.distribuidora}"`);
          }
          
          // Recover valorFatura
          if (!mergedData.valorFatura && extracted.valorFatura) {
            mergedData.valorFatura = extracted.valorFatura;
            console.log(`[sofia-bitrix-lead] ✅ Recovered valorFatura from messages: R$ ${mergedData.valorFatura}`);
          }
          
          // Recover consumo (if no valorFatura)
          if (!mergedData.valorFatura && !mergedData.consumo && extracted.consumo) {
            mergedData.consumo = extracted.consumo;
            console.log(`[sofia-bitrix-lead] ✅ Recovered consumo from messages: ${mergedData.consumo} kWh`);
          }
          
          // Recover email
          if (!mergedData.email && extracted.email) {
            mergedData.email = extracted.email;
            console.log(`[sofia-bitrix-lead] ✅ Recovered email from messages: "${mergedData.email}"`);
          }
          
          // Recover nome
          if (!mergedData.nome && extracted.nome) {
            mergedData.nome = extracted.nome;
            console.log(`[sofia-bitrix-lead] ✅ Recovered nome from messages: "${mergedData.nome}"`);
          }
          
          // Also check distribuidoraInformada which may contain the distributor name
          // deno-lint-ignore no-explicit-any
          const distribInformada = (extracted as any).distribuidoraInformada;
          if (!mergedData.distribuidora && distribInformada) {
            mergedData.distribuidora = distribInformada;
            console.log(`[sofia-bitrix-lead] ✅ Recovered distribuidora (via informada) from messages: "${mergedData.distribuidora}"`);
          }
          
          // If all critical fields are now populated, stop searching
          if (mergedData.distribuidora && (mergedData.valorFatura || mergedData.consumo) && 
              mergedData.email && mergedData.nome) {
            console.log('[sofia-bitrix-lead] All critical fields recovered, stopping message scan');
            break;
          }
        }
      }
    }

    // Fallback #2: inferir distribuidora por UF quando existir (MG/BA/SP/CE)
    if (!mergedData.distribuidora && mergedData.uf) {
      const uf = mergedData.uf.toUpperCase().trim();
      const ufToDistribuidora: Record<string, string> = {
        MG: 'CEMIG',
        BA: 'NEOENERGIA COELBA',
        SP: 'CPFL PAULISTA',
        CE: 'ENEL',
      };
      if (ufToDistribuidora[uf]) {
        mergedData.distribuidora = ufToDistribuidora[uf];
        console.log(`[sofia-bitrix-lead] Inferred distribuidora from UF=${uf}: "${mergedData.distribuidora}"`);
      }
    }

    let leadId = currentBitrixLeadId;
    let leadExists = !!currentBitrixLeadId;

    // If no lead ID yet, search by phone or create new
    if (!leadId) {
      // Search for existing lead using centralized function
      const existingLead = await findLeadByPhone(bitrix24Url, formattedPhone);
      
      if (existingLead?.ID) {
        leadId = String(existingLead.ID);
        leadExists = true;
        console.log('[sofia-bitrix-lead] Found existing lead by phone (batch-client):', leadId);
      } else {
        // Create new lead using centralized function
        const agentUserId = config.bitrix24_agent_user_id;
        const agentDisplayName = agentConfig?.name || 'IA';
        
        const leadFields: Record<string, unknown> = {
          TITLE: `[${agentDisplayName}] ${mergedData.nome || body.clienteNome || 'Cliente WhatsApp'}`,
          NAME: mergedData.nome || body.clienteNome || 'Cliente',
          PHONE: [{ VALUE: formattedPhone, VALUE_TYPE: 'MOBILE' }],
          SOURCE_ID: 'WEB',
          STATUS_ID: 'NEW',
          COMMENTS: `Lead criado automaticamente pela ${agentDisplayName} via WhatsApp.\n\nTelefone: ${formattedPhone}`,
        };
        
        // Assign lead to the specific agent if configured
        if (agentUserId) {
          leadFields.ASSIGNED_BY_ID = agentUserId;
          console.log(`[sofia-bitrix-lead] Assigning new lead to ${agentDisplayName} (user_id: ${agentUserId})`);
        }

        // Add email if available
        if (mergedData.email) {
          leadFields.EMAIL = [{ VALUE: mergedData.email, VALUE_TYPE: 'WORK' }];
        }

        console.log('[sofia-bitrix-lead] Creating new lead via bitrix-client...');
        
        const newLeadId = await createBitrixLead(bitrix24Url, leadFields);
        
        if (!newLeadId) {
          throw new Error('Failed to create lead in Bitrix24');
        }

        leadId = newLeadId;
        console.log('[sofia-bitrix-lead] Created new lead (batch-client):', leadId);
      }
    }

    // Now update the lead with collected data (incremental update)
    const updateFields: Record<string, unknown> = {};

    // ═══════════════════════════════════════════════════════════════
    // ASSIGN LEAD TO AGENT (for commission tracking)
    // Only assign if not already assigned to someone else
    // Supports any agent (sofIA, marIA, julIA, etc.)
    // ═══════════════════════════════════════════════════════════════
    const agentUserIdForAssignment = config.bitrix24_agent_user_id;
    if (agentUserIdForAssignment && !leadExists) {
      // For new leads, always assign to the handling agent
      updateFields.ASSIGNED_BY_ID = agentUserIdForAssignment;
    }

    // ═══════════════════════════════════════════════════════════════
    // FIX: Get existing phone/email records AND linked contact from Lead
    // Bitrix24 adds duplicates if we don't pass existing IDs.
    // Also, the "Contato do Lead" shown in the UI is the Contact linked
    // via CONTACT_ID, so we must update THAT specific contact.
    // ═══════════════════════════════════════════════════════════════
    let existingLeadPhones: Array<{ ID?: string; VALUE?: string }> = [];
    let existingLeadEmails: Array<{ ID?: string; VALUE?: string }> = [];
    let leadContactId: string | null = null;

    try {
      // Use centralized getBitrixLead function
      const leadDetails = await getBitrixLead(bitrix24Url, leadId);

      if (leadDetails) {
        existingLeadPhones = (leadDetails.PHONE as Array<{ ID?: string; VALUE?: string }>) || [];
        existingLeadEmails = (leadDetails.EMAIL as Array<{ ID?: string; VALUE?: string }>) || [];
        leadContactId = leadDetails.CONTACT_ID ? String(leadDetails.CONTACT_ID) : null;
        console.log(
          `[sofia-bitrix-lead] Lead details (batch-client): phones=${existingLeadPhones.length}, emails=${existingLeadEmails.length}, contact_id=${leadContactId || 'null'}`
        );
      }
    } catch (err) {
      console.error('[sofia-bitrix-lead] Error fetching lead details:', err);
    }
    
    // Build phone update array - delete existing, add new
    const phoneUpdate: Array<Record<string, unknown>> = [];
    for (const existingPhone of existingLeadPhones) {
      if (existingPhone.ID) {
        // Mark for deletion by setting empty VALUE
        phoneUpdate.push({ ID: existingPhone.ID, VALUE: '' });
      }
    }
    // Add the correct formatted phone
    phoneUpdate.push({ VALUE: formattedPhone, VALUE_TYPE: 'MOBILE' });
    updateFields.PHONE = phoneUpdate;
    
    console.log(`[sofia-bitrix-lead] Phone update: removing ${existingLeadPhones.length} old phones, adding ${formattedPhone}`);
    
    // Also update custom phone fields (telefone_lead and telefone_form)
    if (config.bitrix24_custom_field_telefone_lead) {
      updateFields[config.bitrix24_custom_field_telefone_lead] = formattedPhone;
    }
    if (config.bitrix24_custom_field_telefone_form) {
      updateFields[config.bitrix24_custom_field_telefone_form] = formattedPhone;
    }

    // Map collected data to Bitrix24 fields
    if (mergedData.nome) {
      updateFields.TITLE = mergedData.nome;
      const nameParts = mergedData.nome.split(' ');
      updateFields.NAME = nameParts[0];
      if (nameParts.length > 1) {
        updateFields.LAST_NAME = nameParts.slice(1).join(' ');
      }
    }
    if (mergedData.email) {
      // Build email update array - delete existing, add new (same logic as phone)
      const emailUpdate: Array<Record<string, unknown>> = [];
      for (const existingEmail of existingLeadEmails) {
        if (existingEmail.ID) {
          emailUpdate.push({ ID: existingEmail.ID, VALUE: '' });
        }
      }
      emailUpdate.push({ VALUE: mergedData.email, VALUE_TYPE: 'WORK' });
      updateFields.EMAIL = emailUpdate;
      
      console.log(`[sofia-bitrix-lead] Email update: removing ${existingLeadEmails.length} old emails, adding ${mergedData.email}`);

      // Custom email field used in the Kanban card (UF_CRM_1758742093 via config)
      if (config.bitrix24_custom_field_email_lead) {
        updateFields[config.bitrix24_custom_field_email_lead] = mergedData.email;
      }
    }

    // Add custom fields - VALUE AND CONSUMPTION
    if (mergedData.consumo && config.bitrix24_custom_field_consumo_medio) {
      updateFields[config.bitrix24_custom_field_consumo_medio] = mergedData.consumo;
    }
    if (mergedData.valorFatura && config.bitrix24_custom_field_valor_conta) {
      updateFields[config.bitrix24_custom_field_valor_conta] = mergedData.valorFatura;
    }
    
    // FIX #3: CONCESSIONÁRIA (lista suspensa do Bitrix)
    // Campo principal confirmado pelo CRM: UF_CRM_1759750064
    // Opções (exatas): CEMIG - MG | ENEL - CE | COELBA - BA | CPFL Paulista - SP | OUTROS - ANOTAÇÃO
    const CONCESSIONARIA_FIELD = 'UF_CRM_1759750064';

    if (mergedData.distribuidora) {
      const rawDistribuidora = mergedData.distribuidora;
      const bitrixDistribuidora = normalizarDistribuidoraParaBitrix(rawDistribuidora);

      const enumId = await resolveBitrixEnumId({
        bitrix24Url,
        fieldName: CONCESSIONARIA_FIELD,
        desiredValue: bitrixDistribuidora,
      });

      updateFields[CONCESSIONARIA_FIELD] = enumId ?? bitrixDistribuidora;

      console.log(
        `[sofia-bitrix-lead] Setting concessionaria ${CONCESSIONARIA_FIELD}: "${rawDistribuidora}" → "${bitrixDistribuidora}" enumId=${enumId ?? 'N/A (sent text)'}`
      );
    }

    // ═══════════════════════════════════════════════════════════════
    // FIX #4: APPLY DEFAULT PLAN/DISCOUNT FOR INITIAL PROPOSALS
    // Per memory: 25% / 3 years for consumption <= 3000 kWh
    //             30% / 4 years (UNLOCK) for consumption > 3000 kWh
    // ═══════════════════════════════════════════════════════════════
    // Estimate consumption from bill value if not provided (using ~R$0.90/kWh average)
    const consumoEstimado = mergedData.consumo || (mergedData.valorFatura ? Math.round(mergedData.valorFatura / 0.9) : 0);
    
    // Apply default discount if not already set
    const defaultDesconto = consumoEstimado > 3000 ? 30 : 25;
    const defaultPrazo = consumoEstimado > 3000 ? 48 : 36; // months
    
    // Set discount fields
    if (config.bitrix24_custom_field_desconto_contratado) {
      updateFields[config.bitrix24_custom_field_desconto_contratado] = defaultDesconto;
    }
    if (config.bitrix24_custom_field_desconto_medio) {
      updateFields[config.bitrix24_custom_field_desconto_medio] = defaultDesconto;
    }
    
    // Set contract term / fidelity fields
    if (config.bitrix24_custom_field_prazo_contrato) {
      updateFields[config.bitrix24_custom_field_prazo_contrato] = defaultPrazo;
    }
    
    // ═══════════════════════════════════════════════════════════════
    // BITRIX24 LIST FIELDS FOR FIDELITY
    // Tipo de Fidelidade: always "Com fidelidade" (ID varies by Bitrix24 config)
    // Fidelidade Desejada: use the plan option that matches desconto/prazo
    // Format for list fields: send the text value, Bitrix24 will match it
    // ═══════════════════════════════════════════════════════════════
    
    // Always set "Tipo de Fidelidade" = "Com fidelidade"
    // Campo pode ser LIST no Bitrix24 (precisa do ID da opção)
    if (config.bitrix24_custom_field_tipo_fidelidade) {
      const tipoFidelidadeText = 'Com fidelidade';

      const tipoFidelidadeEnumId = await resolveBitrixEnumId({
        bitrix24Url,
        fieldName: config.bitrix24_custom_field_tipo_fidelidade,
        desiredValue: tipoFidelidadeText,
      });

      if (tipoFidelidadeEnumId) {
        updateFields[config.bitrix24_custom_field_tipo_fidelidade] = tipoFidelidadeEnumId;
        console.log(`[sofia-bitrix-lead] Setting tipo_fidelidade = "${tipoFidelidadeText}" (ID: ${tipoFidelidadeEnumId})`);
      } else {
        // fallback para caso o campo seja texto (ou se não acharmos a opção)
        updateFields[config.bitrix24_custom_field_tipo_fidelidade] = tipoFidelidadeText;
        console.warn(`[sofia-bitrix-lead] Could not resolve enum ID for tipo_fidelidade; sending text "${tipoFidelidadeText}"`);
      }
    }
    
    // Set "Fidelidade Desejada" based on plan (matching Bitrix24 list options)
    // Campo é do tipo LIST - precisa resolver o ID da opção
    if (config.bitrix24_custom_field_fidelidade_desejada) {
      const fidelidadeOption = defaultDesconto === 30 
        ? '36 meses - 30% de desconto' 
        : '36 meses - 25% de desconto';
      
      // Resolve enum ID for fidelidade_desejada (it's a LIST field in Bitrix24)
      const fidelidadeEnumId = await resolveBitrixEnumId({
        bitrix24Url,
        fieldName: config.bitrix24_custom_field_fidelidade_desejada,
        desiredValue: fidelidadeOption,
      });
      
      if (fidelidadeEnumId) {
        updateFields[config.bitrix24_custom_field_fidelidade_desejada] = fidelidadeEnumId;
        console.log(`[sofia-bitrix-lead] Setting fidelidade_desejada = "${fidelidadeOption}" (ID: ${fidelidadeEnumId})`);
      } else {
        console.warn(`[sofia-bitrix-lead] Could not resolve enum ID for fidelidade_desejada: "${fidelidadeOption}"`);
      }
    }
    
    console.log(`[sofia-bitrix-lead] Applying defaults: consumo=${consumoEstimado}kWh, desconto=${defaultDesconto}%, prazo=${defaultPrazo}m`);
    // ═══════════════════════════════════════════════════════════════
    
    // ═══════════════════════════════════════════════════════════════
    // TIPO DE INSTALAÇÃO (Monofásico/Bifásico/Trifásico)
    // Campo obrigatório no Bitrix24 para mover lead para PROPOSTA_DEFINITIVA
    // UF_CRM_LEAD_1759426797107 é um campo do tipo LIST (enumeration)
    // ═══════════════════════════════════════════════════════════════
    const TIPO_INSTALACAO_FIELD = config.bitrix24_custom_field_tipo_instalacao || 'UF_CRM_LEAD_1759426797107';
    
    // deno-lint-ignore no-explicit-any
    const tipoInstalacao = (mergedData as any).tipoInstalacao;
    if (tipoInstalacao) {
      // Map to Bitrix24 list values
      const tipoMap: Record<string, string> = {
        'Monofásico': 'Monofásico',
        'Bifásico': 'Bifásico',
        'Trifásico': 'Trifásico',
        'monofasico': 'Monofásico',
        'bifasico': 'Bifásico',
        'trifasico': 'Trifásico',
      };
      
      const tipoNormalizado = tipoMap[tipoInstalacao] || tipoInstalacao;
      
      // Resolve enum ID for the LIST field
      const tipoEnumId = await resolveBitrixEnumId({
        bitrix24Url,
        fieldName: TIPO_INSTALACAO_FIELD,
        desiredValue: tipoNormalizado,
      });
      
      if (tipoEnumId) {
        updateFields[TIPO_INSTALACAO_FIELD] = tipoEnumId;
        console.log(`[sofia-bitrix-lead] Setting tipo_instalacao = "${tipoNormalizado}" (ID: ${tipoEnumId})`);
      } else {
        // Fallback: try fixed IDs based on common Bitrix24 configs
        const fixedIdMap: Record<string, string> = {
          'Monofásico': '661',
          'Bifásico': '665',
          'Trifásico': '663',
        };
        const fixedId = fixedIdMap[tipoNormalizado];
        if (fixedId) {
          updateFields[TIPO_INSTALACAO_FIELD] = fixedId;
          console.log(`[sofia-bitrix-lead] Setting tipo_instalacao = "${tipoNormalizado}" (fixed ID: ${fixedId})`);
        } else {
          console.warn(`[sofia-bitrix-lead] Could not resolve enum ID for tipo_instalacao: "${tipoNormalizado}"`);
        }
      }
    }
    // ═══════════════════════════════════════════════════════════════
    
    if (mergedData.numeroInstalacao && config.bitrix24_custom_field_num_instalacao) {
      updateFields[config.bitrix24_custom_field_num_instalacao] = mergedData.numeroInstalacao;
    }
    if ((mergedData.cpf || mergedData.cnpj) && config.bitrix24_custom_field_cpf_cnpj) {
      updateFields[config.bitrix24_custom_field_cpf_cnpj] = mergedData.cpf || mergedData.cnpj;
    }
    if (mergedData.endereco && config.bitrix24_custom_field_endereco) {
      updateFields[config.bitrix24_custom_field_endereco] = mergedData.endereco;
    }
    if (mergedData.cep && config.bitrix24_custom_field_cep) {
      updateFields[config.bitrix24_custom_field_cep] = mergedData.cep;
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 1: HANDLE FILE ATTACHMENT FIRST
    // Files must be uploaded separately due to Bitrix24 API limitation
    // We need updatedArquivos populated before determining stage transition
    // ═══════════════════════════════════════════════════════════════
    let fileUploaded = false;
    const updatedArquivos = [...currentArquivosAnexados];

    if (body.arquivoNovo?.base64) {
      const fileType = body.arquivoNovo.tipo;
      
      // Determine field code based on file type
      let fileFieldCode = config.bitrix24_custom_field_conta_energia || 'UF_CRM_1753275522';
      if (fileType === 'documento_identidade') {
        fileFieldCode = config.bitrix24_custom_field_documento_identidade || 'UF_CRM_DOC_ID';
      } else if (fileType === 'contrato_social') {
        fileFieldCode = config.bitrix24_custom_field_contrato_social || 'UF_CRM_CONTRATO';
      }
      
      // Clean base64
      let cleanBase64 = body.arquivoNovo.base64;
      if (cleanBase64.includes(',')) {
        cleanBase64 = cleanBase64.split(',')[1];
      }

      // Use executeBitrixBatch for file upload
      const fileUploadCommands: Record<string, BatchCommand> = {
        'upload_file': {
          method: 'crm.lead.update',
          params: {
            id: leadId,
            fields: {
              [fileFieldCode]: {
                fileData: [body.arquivoNovo.fileName, cleanBase64],
              },
            },
          }
        }
      };

      console.log('[sofia-bitrix-lead] Uploading file to field via batch:', fileFieldCode, 'type:', fileType);

      const uploadResults = await executeBitrixBatch(bitrix24Url, fileUploadCommands);
      const uploadResult = uploadResults.get('upload_file');
      
      if (uploadResult?.success) {
        fileUploaded = true;
        if (!updatedArquivos.includes(fileType)) {
          updatedArquivos.push(fileType);
        }
        console.log('[sofia-bitrix-lead] ✅ File uploaded successfully (batch-client)');
      } else {
        console.error('[sofia-bitrix-lead] File upload failed:', uploadResult?.error);
      }
    }
    
    // ═══════════════════════════════════════════════════════════════
    // STEP 2: BATCH OPTIMIZATION - Combine field updates with stage movement
    // Now that files are uploaded and updatedArquivos is current, determine stage
    // Instead of 2 separate crm.lead.update calls, we send fields + STATUS_ID together
    // ═══════════════════════════════════════════════════════════════
    
    let stageUpdated = false;
    let newStage: string | null = null;
    let newStageName: string | null = null;
    
    // Context for stage determination
    const stageContext = {
      sofiaRespondeu: true,
      leadFrio: false,
    };
    
    const nextStageInfo = determineNextStage(currentBitrixStage, mergedData, updatedArquivos, stageContext);
    
    // If we have a stage transition, add STATUS_ID to updateFields
    if (nextStageInfo) {
      const isMovingToPropostaInicial = nextStageInfo.stage === BITRIX_STAGES.PROPOSTA_INICIAL.id;
      
      if (isMovingToPropostaInicial) {
        console.log('[sofia-bitrix-lead] ✅ AUTO-ADVANCE: Moving to PROPOSTA_INICIAL (all required data present)');
        console.log('[sofia-bitrix-lead] Data validated: nome, email, distribuidora, valorConta');
      }
      
      // BATCH: Include stage in the same update call
      updateFields['STATUS_ID'] = nextStageInfo.stage;
      stageUpdated = true;
      newStage = nextStageInfo.stage;
      newStageName = nextStageInfo.stageName;
      
      console.log(`[sofia-bitrix-lead] 🔄 BATCH: Including stage move to ${nextStageInfo.stageName} in field update`);
    }
    
    // ═══════════════════════════════════════════════════════════════
    // REFATORADO: Uso de batchUpdateBitrixLead + executeBitrixBatch
    // Consolida lead update + timeline comment em 1 HTTP request
    // ═══════════════════════════════════════════════════════════════
    
    // Build timeline comment if there are significant updates
    const hasSignificantUpdate = fileUploaded || stageUpdated || 
      (mergedData.consumo && !currentDadosColetados.consumo) ||
      (mergedData.valorFatura && !currentDadosColetados.valorFatura) ||
      ((mergedData.cpf || mergedData.cnpj) && !currentDadosColetados.cpf && !currentDadosColetados.cnpj);
    
    let commentText: string | null = null;
    if (hasSignificantUpdate) {
      const updates: string[] = [];
      
      if (fileUploaded) {
        updates.push(`📎 Arquivo anexado: ${body.arquivoNovo?.tipo === 'fatura' ? 'Fatura de Energia' : body.arquivoNovo?.tipo === 'documento_identidade' ? 'Documento de Identidade' : 'Contrato Social'}`);
      }
      if (mergedData.consumo && !currentDadosColetados.consumo) {
        updates.push(`⚡ Consumo informado: ${mergedData.consumo} kWh`);
      }
      if (mergedData.valorFatura && !currentDadosColetados.valorFatura) {
        updates.push(`💰 Valor da conta: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(mergedData.valorFatura)}`);
      }
      if (mergedData.distribuidora && !currentDadosColetados.distribuidora) {
        updates.push(`🏭 Distribuidora: ${mergedData.distribuidora}`);
      }
      if ((mergedData.cpf || mergedData.cnpj) && !currentDadosColetados.cpf && !currentDadosColetados.cnpj) {
        updates.push(`🆔 CPF/CNPJ informado: ${mergedData.cpf || mergedData.cnpj}`);
      }
      if (stageUpdated && newStageName) {
        updates.push(`\n🚀 Lead movido para: ${newStageName}`);
      }
      
      commentText = `🤖 ATUALIZAÇÃO AUTOMÁTICA (sofIA)\n\n${updates.join('\n')}`;
    }
    
    // Execute BATCH: lead update + timeline comment in single HTTP request
    if (Object.keys(updateFields).length > 0 || commentText) {
      const batchCommands: Record<string, BatchCommand> = {};
      
      // Add lead update command if there are fields to update
      if (Object.keys(updateFields).length > 0) {
        batchCommands['update_lead'] = {
          method: 'crm.lead.update',
          params: { id: leadId, fields: updateFields }
        };
      }
      
      // Add timeline comment command if there's a significant update
      if (commentText) {
        const commentFields: Record<string, unknown> = {
          ENTITY_ID: leadId,
          ENTITY_TYPE: 'lead',
          COMMENT: commentText
        };
        
        // Add author (agent's user ID) if configured
        const agentUserIdForComment = config.bitrix24_agent_user_id;
        if (agentUserIdForComment) {
          commentFields.AUTHOR_ID = agentUserIdForComment;
        }
        
        batchCommands['add_comment'] = {
          method: 'crm.timeline.comment.add',
          params: { fields: commentFields }
        };
      }
      
      console.log(`[sofia-bitrix-lead] 📦 BATCH: ${Object.keys(batchCommands).length} commands (${Object.keys(updateFields).length} fields${commentText ? ' + comment' : ''}${stageUpdated ? ' + stage' : ''})`);
      
      const batchResults = await executeBitrixBatch(bitrix24Url, batchCommands);
      
      // Check results
      const leadResult = batchResults.get('update_lead');
      if (leadResult && !leadResult.success) {
        console.error('[sofia-bitrix-lead] Lead update error:', leadResult.error);
      } else if (leadResult) {
        console.log('[sofia-bitrix-lead] ✅ Lead batch update successful');
      }
      
      const commentResult = batchResults.get('add_comment');
      if (commentResult && !commentResult.success) {
        console.error('[sofia-bitrix-lead] Comment add error:', commentResult.error);
      }
      
      // ═══════════════════════════════════════════════════════════════
      // PHASE 4 "CASO EDSON": POST-UPDATE STAGE VERIFICATION WITH RETRY
      // After successful batch update, verify the stage was actually changed
      // If forcarMovimentacao=true and stage is wrong, force it again
      // ═══════════════════════════════════════════════════════════════
      if (stageUpdated && body.forcarMovimentacao && leadId) {
        console.log(`[sofia-bitrix-lead] [STAGE_VERIFY] Verifying stage was updated to ${newStage}...`);
        
        // Wait a moment for Bitrix24 to process
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Fetch lead again to verify stage
        const verifyLead = await getBitrixLead(bitrix24Url, leadId);
        const actualStage = verifyLead?.STATUS_ID;
        
        if (actualStage && actualStage !== newStage) {
          console.log(`[sofia-bitrix-lead] [STAGE_VERIFY] ⚠️ Stage mismatch! Expected: ${newStage}, Got: ${actualStage}`);
          
          // RETRY: Force stage update directly
          console.log(`[sofia-bitrix-lead] [STAGE_VERIFY] 🔄 Retrying stage update...`);
          
          const retryCommands: Record<string, BatchCommand> = {
            'force_stage': {
              method: 'crm.lead.update',
              params: { id: leadId, fields: { STATUS_ID: newStage } }
            }
          };
          
          const retryResults = await executeBitrixBatch(bitrix24Url, retryCommands);
          const retryResult = retryResults.get('force_stage');
          
          if (retryResult?.success) {
            console.log(`[sofia-bitrix-lead] [STAGE_VERIFY] ✅ Stage forced successfully to ${newStage}`);
          } else {
            console.error(`[sofia-bitrix-lead] [STAGE_VERIFY] ❌ Retry failed:`, retryResult?.error);
            
            // Create admin notification for failed stage update
            await supabase.from('admin_notifications').insert({
              title: '❌ Bitrix Stage Update Failed',
              message: `Lead ${leadId} não conseguiu mudar para estágio ${newStageName}. Status atual: ${actualStage}. Telefone: ${formattedPhone}`,
              type: 'stage_update_failed',
              entity_type: 'bitrix_lead',
              entity_id: leadId,
            });
          }
        } else if (actualStage === newStage) {
          console.log(`[sofia-bitrix-lead] [STAGE_VERIFY] ✅ Stage confirmed: ${newStage}`);
        } else {
          console.warn(`[sofia-bitrix-lead] [STAGE_VERIFY] Could not verify stage (actualStage=${actualStage})`);
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // CONTACT UPDATE - Using batch where possible
    // Note: contact.list/get must happen before update (need ID first)
    // But contact.update now uses batchUpdateBitrixLead pattern
    // ═══════════════════════════════════════════════════════════════
    try {
      // The correct place is the Contact linked to the lead (CONTACT_ID).
      // If not present, fallback to searching by phone.
      let bitrixContactId: string | null = leadContactId;
      let existingContactData: Record<string, unknown> | null = null;

      if (!bitrixContactId) {
        // Use centralized findContactByPhone function
        const foundContact = await findContactByPhone(bitrix24Url, formattedPhone);
        if (foundContact?.ID) {
          bitrixContactId = String(foundContact.ID);
          console.log('[sofia-bitrix-lead] Found Bitrix24 contact by phone (batch-client):', bitrixContactId);
        }
      } else {
        console.log('[sofia-bitrix-lead] Using lead CONTACT_ID as Bitrix24 contact:', bitrixContactId);
      }

      // Fetch full contact data using centralized getBitrixContact
      if (bitrixContactId) {
        const contactData = await getBitrixContact(bitrix24Url, bitrixContactId);
        if (contactData) {
          existingContactData = contactData as Record<string, unknown>;
          console.log('[sofia-bitrix-lead] Contact details loaded (batch-client)');
        }
      }
      
      // If contact exists, update it with all collected data using batch
      if (bitrixContactId) {
        const contactUpdateFields: Record<string, unknown> = {};
        
        // Name
        if (mergedData.nome) {
          const nameParts = mergedData.nome.split(' ');
          contactUpdateFields.NAME = nameParts[0];
          if (nameParts.length > 1) {
            contactUpdateFields.LAST_NAME = nameParts.slice(1).join(' ');
          }
        }
        
        // Email - Replace all existing emails with the new one
        if (mergedData.email) {
          const existingEmails = (existingContactData?.EMAIL as Array<{ ID?: string }>) || [];
          const emailUpdate: Array<Record<string, unknown>> = [];
          for (const existingEmail of existingEmails) {
            if (existingEmail.ID) {
              emailUpdate.push({ ID: existingEmail.ID, DELETE: 'Y' });
            }
          }
          emailUpdate.push({ VALUE: mergedData.email, VALUE_TYPE: 'WORK' });
          contactUpdateFields.EMAIL = emailUpdate;
        }

        // Phone - Replace all existing phones with the correct formatted one
        const existingPhones = (existingContactData?.PHONE as Array<{ ID?: string }>) || [];
        const phoneUpdate: Array<Record<string, unknown>> = [];
        for (const existingPhone of existingPhones) {
          if (existingPhone.ID) {
            phoneUpdate.push({ ID: existingPhone.ID, DELETE: 'Y' });
          }
        }
        phoneUpdate.push({ VALUE: formattedPhone, VALUE_TYPE: 'MOBILE' });
        contactUpdateFields.PHONE = phoneUpdate;
        
        // CPF/CNPJ - Custom field
        if ((mergedData.cpf || mergedData.cnpj) && config.bitrix24_contact_field_cpf_cnpj) {
          contactUpdateFields[config.bitrix24_contact_field_cpf_cnpj] = mergedData.cpf || mergedData.cnpj;
        }
        
        // Address components - Custom fields
        if (mergedData.endereco) {
          if (config.bitrix24_contact_field_endereco_completo) {
            contactUpdateFields[config.bitrix24_contact_field_endereco_completo] = mergedData.endereco;
          }
          if (config.bitrix24_contact_field_logradouro) {
            contactUpdateFields[config.bitrix24_contact_field_logradouro] = mergedData.endereco;
          }
        }
        
        if (mergedData.cep && config.bitrix24_contact_field_cep) {
          contactUpdateFields[config.bitrix24_contact_field_cep] = mergedData.cep;
        }
        
        if (mergedData.cidade && config.bitrix24_contact_field_cidade) {
          contactUpdateFields[config.bitrix24_contact_field_cidade] = mergedData.cidade;
        }
        
        if (mergedData.uf) {
          if (config.bitrix24_contact_field_estado) {
            contactUpdateFields[config.bitrix24_contact_field_estado] = mergedData.uf;
          }
          if (config.bitrix24_contact_field_uf) {
            contactUpdateFields[config.bitrix24_contact_field_uf] = mergedData.uf;
          }
        }
        
        // Execute contact update via batch
        if (Object.keys(contactUpdateFields).length > 0) {
          console.log('[sofia-bitrix-lead] Updating Bitrix24 contact via batch:', Object.keys(contactUpdateFields).length, 'fields');
          
          const contactBatchCommands: Record<string, BatchCommand> = {
            'update_contact': {
              method: 'crm.contact.update',
              params: { id: bitrixContactId, fields: contactUpdateFields }
            }
          };
          
          const contactResults = await executeBitrixBatch(bitrix24Url, contactBatchCommands);
          const contactResult = contactResults.get('update_contact');
          
          if (contactResult?.success) {
            console.log('[sofia-bitrix-lead] ✅ Contact batch update successful:', bitrixContactId);
          } else {
            console.error('[sofia-bitrix-lead] Contact update error:', contactResult?.error);
          }
        }
      } else {
        console.log('[sofia-bitrix-lead] No existing Bitrix24 contact found for phone:', formattedPhone);
      }
    } catch (contactErr) {
      console.error('[sofia-bitrix-lead] Error updating Bitrix24 contact:', contactErr);
    }
    // ═══════════════════════════════════════════════════════════════

    // Update conversation with new state
    if (body.conversaId) {
      const conversaUpdateData: Record<string, unknown> = {
        bitrix24_lead_id: leadId,
        dados_coletados: mergedData,
        arquivos_anexados: updatedArquivos,
      };

      if (stageUpdated && newStage) {
        conversaUpdateData.bitrix24_stage = newStage;
      }

      await supabase
        .from('chatbot_conversas')
        .update(conversaUpdateData)
        .eq('id', body.conversaId);

      console.log('[sofia-bitrix-lead] Updated conversation:', body.conversaId);
    }

    // Log the sync
    await supabase.from('bitrix24_sync_logs').insert({
      bitrix24_lead_id: leadId,
      action: 'sofia_sync',
      status: 'success',
      request_data: { 
        phone: formattedPhone,
        mergedData,
        fileUploaded,
        stageUpdated,
        newStage,
        leadExists,
        conversaId: body.conversaId,
      },
    });

    // ═══════════════════════════════════════════════════════════════
    // NOTA: A criação de propostas foi REMOVIDA desta Edge Function.
    // Propostas são geradas APENAS pelo bitrix24-webhook quando o lead
    // é movido para a etapa "Proposta Inicial" (UC_9SLRPP).
    // 
    // Esta função apenas sincroniza dados coletados para o Bitrix24.
    // A geração de proposta + link é responsabilidade do bitrix24-webhook.
    // ═══════════════════════════════════════════════════════════════
    
    // Create/update CRM contact for tracking (without creating proposal)
    let crmContatoId: string | null = null;
    
    if (body.conversaId && (mergedData.nome || mergedData.email || mergedData.cpf || mergedData.cnpj)) {
      try {
        // Get a system user (admin) to associate the contact
        const { data: systemUser } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('role', 'admin')
          .limit(1)
          .single();

        if (systemUser?.user_id) {
          const cpfCnpjClean = (mergedData.cpf || mergedData.cnpj)?.replace(/[^\d]/g, '') || null;
          const emailClean = mergedData.email?.toLowerCase().trim() || null;
          const telefoneClean = formattedPhone?.replace(/[^\d]/g, '') || null;
          
          let existingContact: { id: string } | null = null;
          
          // 1. Buscar por CPF/CNPJ
          if (cpfCnpjClean && cpfCnpjClean.length >= 11) {
            const { data } = await supabase
              .from('crm_contatos')
              .select('id')
              .or(`cpf_cnpj.eq.${cpfCnpjClean},cpf_cnpj.ilike.%${cpfCnpjClean}%`)
              .limit(1)
              .maybeSingle();
            if (data) {
              existingContact = data;
              console.log(`[sofia-bitrix-lead] Found existing contact by CPF/CNPJ: ${cpfCnpjClean}`);
            }
          }
          
          // 2. Buscar por e-mail
          if (!existingContact && emailClean && emailClean.includes('@')) {
            const { data } = await supabase
              .from('crm_contatos')
              .select('id')
              .ilike('email', emailClean)
              .limit(1)
              .maybeSingle();
            if (data) {
              existingContact = data;
              console.log(`[sofia-bitrix-lead] Found existing contact by email: ${emailClean}`);
            }
          }
          
          // 3. Buscar por telefone (últimos 9 dígitos)
          if (!existingContact && telefoneClean && telefoneClean.length >= 10) {
            const telefoneSearch = telefoneClean.slice(-9);
            const { data } = await supabase
              .from('crm_contatos')
              .select('id')
              .ilike('telefone', `%${telefoneSearch}`)
              .limit(1)
              .maybeSingle();
            if (data) {
              existingContact = data;
              console.log(`[sofia-bitrix-lead] Found existing contact by phone: ${telefoneSearch}`);
            }
          }
          
          // 4. Buscar por bitrix24_lead_id
          if (!existingContact && leadId) {
            const { data } = await supabase
              .from('crm_contatos')
              .select('id')
              .eq('bitrix24_lead_id', leadId)
              .maybeSingle();
            if (data) {
              existingContact = data;
              console.log(`[sofia-bitrix-lead] Found existing contact by bitrix24_lead_id: ${leadId}`);
            }
          }
          
          if (existingContact) {
            // Atualizar contato existente
            crmContatoId = existingContact.id;
            
            const updateData: Record<string, unknown> = {
              updated_at: new Date().toISOString(),
              ultima_interacao: new Date().toISOString(),
              bitrix24_lead_id: leadId,
            };
            
            if (mergedData.nome || body.clienteNome) updateData.nome = mergedData.nome || body.clienteNome;
            if (mergedData.email) updateData.email = mergedData.email;
            if (formattedPhone) updateData.telefone = formattedPhone;
            if (cpfCnpjClean) updateData.cpf_cnpj = cpfCnpjClean;
            if (mergedData.endereco) updateData.endereco = mergedData.endereco;
            if (mergedData.cep) updateData.cep = mergedData.cep;
            
            await supabase
              .from('crm_contatos')
              .update(updateData)
              .eq('id', existingContact.id);
            
            console.log(`[sofia-bitrix-lead] Updated CRM contact ${existingContact.id}`);
          } else {
            // Criar novo contato
            const { data: newContact, error: crmError } = await supabase
              .from('crm_contatos')
              .insert({
                user_id: systemUser.user_id,
                nome: mergedData.nome || body.clienteNome || 'Cliente WhatsApp',
                email: mergedData.email || null,
                telefone: formattedPhone,
                cpf_cnpj: cpfCnpjClean || null,
                endereco: mergedData.endereco || null,
                cep: mergedData.cep || null,
                origem: 'whatsapp_sofia',
                proposta_tipo: 'assinante',
                bitrix24_lead_id: leadId,
                criado_por_email: 'sofia@coesa.com',
                criado_por_nome: 'sofIA WhatsApp',
                status: 'novo',
              })
              .select('id')
              .single();
            
            if (crmError) {
              console.error('[sofia-bitrix-lead] Error creating CRM contact:', crmError);
            } else {
              crmContatoId = newContact.id;
              console.log('[sofia-bitrix-lead] Created CRM contact:', newContact.id);
            }
          }
        }
      } catch (crmErr) {
        console.error('[sofia-bitrix-lead] Error in CRM contact creation/update:', crmErr);
      }
    }

    console.log('[sofia-bitrix-lead] Sync completed:', {
      leadId,
      leadExists,
      fileUploaded,
      stageUpdated,
      newStage: newStageName,
      crmContatoId,
    });

    return new Response(
      JSON.stringify({
        success: true,
        leadId,
        leadExists,
        fileUploaded,
        stageUpdated,
        newStage,
        newStageName,
        crmContatoId,
        mergedData,
        message: stageUpdated 
          ? `Lead ${leadId} atualizado e movido para ${newStageName}`
          : `Lead ${leadId} atualizado com novos dados`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[sofia-bitrix-lead] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage, success: false }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Export helper functions for use in sofia-webhook
export { extractDataFromText, parseInvoiceAnalysis };
