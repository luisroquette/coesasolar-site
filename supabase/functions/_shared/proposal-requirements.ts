/**
 * PROPOSAL REQUIREMENTS - SINGLE SOURCE OF TRUTH
 * 
 * Este módulo unifica TODAS as definições de campos obrigatórios para propostas.
 * Elimina a fragmentação entre:
 * - automation_required_fields_* (Bitrix)
 * - sofia_required_fields_* (IA)
 * - SOFIA_REQUIRED_FIELDS hardcoded (adapters)
 * 
 * @module _shared/proposal-requirements
 */

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type ProposalStage = 'inicial' | 'definitiva';
export type RequirementType = 'field' | 'file';

export interface RequirementDefinition {
  id: string;
  label: string;
  type: RequirementType;
  priority: number;
  description?: string;
  alternatives?: string[]; // Campos alternativos aceitos (ex: cpf ou cpf_cnpj)
  validationRegex?: string;
}

export interface ProposalRequirements {
  stage: ProposalStage;
  fields: RequirementDefinition[];
  files: RequirementDefinition[];
}

export interface UnifiedRequirementsConfig {
  proposta_inicial: ProposalRequirements;
  proposta_definitiva: ProposalRequirements;
  lastLoaded: number;
}

// ═══════════════════════════════════════════════════════════════
// DEFAULT FALLBACKS (usado se banco não tiver config)
// ═══════════════════════════════════════════════════════════════

const DEFAULT_FIELDS_INICIAL: RequirementDefinition[] = [
  { id: 'nome', label: 'Nome', type: 'field', priority: 1, alternatives: ['nome_completo', 'cliente_nome'] },
  { id: 'email', label: 'E-mail', type: 'field', priority: 2, alternatives: ['whatsappOuEmail'] },
  { id: 'distribuidora', label: 'Distribuidora', type: 'field', priority: 3, alternatives: ['concessionaria'] },
  { id: 'valorConta', label: 'Valor da Conta', type: 'field', priority: 4, alternatives: ['consumo', 'consumo_kwh'] },
];

const DEFAULT_FILES_INICIAL: RequirementDefinition[] = [
  // Nenhum arquivo obrigatório na proposta inicial
];

const DEFAULT_FIELDS_DEFINITIVA: RequirementDefinition[] = [
  { id: 'tipoInstalacao', label: 'Tipo de Instalação', type: 'field', priority: 1, alternatives: ['tipo_instalacao'] },
  { id: 'cpfCnpj', label: 'CPF/CNPJ', type: 'field', priority: 2, alternatives: ['cpf', 'cnpj', 'cpf_cnpj'] },
  { id: 'endereco', label: 'Endereço', type: 'field', priority: 3, alternatives: ['endereco_completo', 'cep'] },
];

const DEFAULT_FILES_DEFINITIVA: RequirementDefinition[] = [
  { id: 'fatura', label: 'Fatura de Energia', type: 'file', priority: 1, alternatives: ['conta_luz', 'fatura_energia'] },
  { id: 'documento_identidade', label: 'Documento de Identidade', type: 'file', priority: 2, alternatives: ['rg', 'cnh', 'rg_cnh'] },
];

// ═══════════════════════════════════════════════════════════════
// CACHE
// ═══════════════════════════════════════════════════════════════

let cachedRequirements: UnifiedRequirementsConfig | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

// ═══════════════════════════════════════════════════════════════
// MAIN LOADER
// ═══════════════════════════════════════════════════════════════

/**
 * Carrega requisitos unificados do banco de dados
 * Unifica automation_required_* e sofia_required_* em uma única estrutura
 */
export async function loadProposalRequirements(supabase: any): Promise<UnifiedRequirementsConfig> {
  // Check cache
  if (cachedRequirements && Date.now() - cachedRequirements.lastLoaded < CACHE_TTL_MS) {
    return cachedRequirements;
  }

  try {
    const { data, error } = await supabase
      .from('configuracoes_sistema')
      .select('chave, valor')
      .in('chave', [
        // Automation (Bitrix) keys
        'automation_required_fields_inicial',
        'automation_required_fields_definitiva',
        'automation_required_files_inicial',
        'automation_required_files_definitiva',
        // Sofia (IA) keys - legacy, mas ainda lemos para compatibilidade
        'sofia_required_fields_proposta_inicial',
        'sofia_required_fields_proposta_definitiva',
      ]);

    if (error) {
      console.error('[proposal-requirements] Error loading configs:', error);
      return getDefaultRequirements();
    }

    const configMap: Record<string, string> = {};
    (data || []).forEach((c: { chave: string; valor: string }) => {
      configMap[c.chave] = c.valor;
    });

    // Merge configs - automation tem prioridade, sofia é fallback
    const requirements: UnifiedRequirementsConfig = {
      proposta_inicial: {
        stage: 'inicial',
        fields: parseFieldsConfig(
          configMap.automation_required_fields_inicial,
          configMap.sofia_required_fields_proposta_inicial,
          DEFAULT_FIELDS_INICIAL
        ),
        files: parseFilesConfig(
          configMap.automation_required_files_inicial,
          DEFAULT_FILES_INICIAL
        ),
      },
      proposta_definitiva: {
        stage: 'definitiva',
        fields: parseFieldsConfig(
          configMap.automation_required_fields_definitiva,
          configMap.sofia_required_fields_proposta_definitiva,
          DEFAULT_FIELDS_DEFINITIVA
        ),
        files: parseFilesConfig(
          configMap.automation_required_files_definitiva,
          DEFAULT_FILES_DEFINITIVA
        ),
      },
      lastLoaded: Date.now(),
    };

    cachedRequirements = requirements;
    console.log('[proposal-requirements] Loaded unified requirements successfully');
    return requirements;
  } catch (err) {
    console.error('[proposal-requirements] Exception loading configs:', err);
    return getDefaultRequirements();
  }
}

// ═══════════════════════════════════════════════════════════════
// PARSERS
// ═══════════════════════════════════════════════════════════════

/**
 * Parse field config from JSON array or CSV string
 */
function parseFieldsConfig(
  automationConfig: string | undefined,
  sofiaConfig: string | undefined,
  fallback: RequirementDefinition[]
): RequirementDefinition[] {
  // Try automation config first (JSON array)
  if (automationConfig) {
    try {
      const parsed = JSON.parse(automationConfig);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return convertToRequirements(parsed, 'field');
      }
    } catch (e) {
      console.warn('[proposal-requirements] Failed to parse automation fields:', e);
    }
  }

  // Fallback to sofia config (CSV string)
  if (sofiaConfig) {
    const fields = sofiaConfig.split(',').map(f => f.trim()).filter(Boolean);
    if (fields.length > 0) {
      return convertToRequirements(fields, 'field');
    }
  }

  return fallback;
}

/**
 * Parse file config from JSON array
 */
function parseFilesConfig(
  config: string | undefined,
  fallback: RequirementDefinition[]
): RequirementDefinition[] {
  if (config) {
    try {
      const parsed = JSON.parse(config);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return convertToRequirements(parsed, 'file');
      }
    } catch (e) {
      console.warn('[proposal-requirements] Failed to parse files config:', e);
    }
  }
  return fallback;
}

/**
 * Convert string array to RequirementDefinition array
 */
function convertToRequirements(
  items: string[],
  type: RequirementType
): RequirementDefinition[] {
  return items.map((id, index) => ({
    id,
    label: formatLabel(id),
    type,
    priority: index + 1,
    alternatives: getAlternatives(id),
  }));
}

/**
 * Get known alternatives for a field ID
 */
function getAlternatives(id: string): string[] {
  const ALTERNATIVES_MAP: Record<string, string[]> = {
    nome: ['nome_completo', 'cliente_nome'],
    email: ['whatsappOuEmail', 'e-mail'],
    distribuidora: ['concessionaria', 'distribuidora_energia'],
    valorConta: ['consumo', 'consumo_kwh', 'valor_conta', 'valorFatura'],
    tipoInstalacao: ['tipo_instalacao', 'tipo'],
    cpfCnpj: ['cpf', 'cnpj', 'cpf_cnpj', 'documento'],
    endereco: ['endereco_completo', 'cep', 'logradouro'],
    fatura: ['conta_luz', 'fatura_energia', 'conta_energia'],
    documento_identidade: ['rg', 'cnh', 'rg_cnh', 'identidade'],
    consumo_ou_valor: ['consumo', 'valorConta', 'valorFatura'],
  };
  return ALTERNATIVES_MAP[id] || [];
}

/**
 * Format camelCase/snake_case to human-readable label
 */
function formatLabel(id: string): string {
  return id
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^\s/, '')
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Get default requirements (no DB)
 */
function getDefaultRequirements(): UnifiedRequirementsConfig {
  return {
    proposta_inicial: {
      stage: 'inicial',
      fields: DEFAULT_FIELDS_INICIAL,
      files: DEFAULT_FILES_INICIAL,
    },
    proposta_definitiva: {
      stage: 'definitiva',
      fields: DEFAULT_FIELDS_DEFINITIVA,
      files: DEFAULT_FILES_DEFINITIVA,
    },
    lastLoaded: Date.now(),
  };
}

// ═══════════════════════════════════════════════════════════════
// VALIDATION HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Check if collected data meets stage requirements
 */
export function checkRequirementsMet(
  dadosColetados: Record<string, any>,
  arquivos: { tipo: string }[],
  requirements: ProposalRequirements
): { met: boolean; missing: RequirementDefinition[] } {
  const missing: RequirementDefinition[] = [];

  // Check fields
  for (const req of requirements.fields) {
    const hasField = hasRequiredField(dadosColetados, req);
    if (!hasField) {
      missing.push(req);
    }
  }

  // Check files
  for (const req of requirements.files) {
    const hasFile = hasRequiredFile(arquivos, req);
    if (!hasFile) {
      missing.push(req);
    }
  }

  return {
    met: missing.length === 0,
    missing,
  };
}

/**
 * Check if a required field exists in collected data
 */
function hasRequiredField(dados: Record<string, any>, req: RequirementDefinition): boolean {
  // Check main ID
  if (dados[req.id] && String(dados[req.id]).trim()) {
    return true;
  }
  
  // Check alternatives
  for (const alt of req.alternatives || []) {
    if (dados[alt] && String(dados[alt]).trim()) {
      return true;
    }
  }
  
  return false;
}

/**
 * Check if a required file exists in file list
 */
function hasRequiredFile(arquivos: { tipo: string }[], req: RequirementDefinition): boolean {
  const allTypes = [req.id, ...(req.alternatives || [])];
  return arquivos.some(a => allTypes.includes(a.tipo));
}

// ═══════════════════════════════════════════════════════════════
// CONVENIENCE GETTERS
// ═══════════════════════════════════════════════════════════════

/**
 * Get requirements for specific stage
 */
export async function getStageRequirements(
  supabase: any,
  stage: ProposalStage
): Promise<ProposalRequirements> {
  const config = await loadProposalRequirements(supabase);
  return stage === 'inicial' ? config.proposta_inicial : config.proposta_definitiva;
}

/**
 * Get only field IDs for a stage (for backward compatibility)
 */
export async function getRequiredFieldIds(
  supabase: any,
  stage: ProposalStage
): Promise<string[]> {
  const requirements = await getStageRequirements(supabase, stage);
  return requirements.fields.map(f => f.id);
}

/**
 * Get only file IDs for a stage (for backward compatibility)
 */
export async function getRequiredFileIds(
  supabase: any,
  stage: ProposalStage
): Promise<string[]> {
  const requirements = await getStageRequirements(supabase, stage);
  return requirements.files.map(f => f.id);
}

/**
 * Get missing requirements for a stage given current data
 */
export async function getMissingRequirements(
  supabase: any,
  stage: ProposalStage,
  dadosColetados: Record<string, any>,
  arquivos: { tipo: string }[] = []
): Promise<RequirementDefinition[]> {
  const requirements = await getStageRequirements(supabase, stage);
  const { missing } = checkRequirementsMet(dadosColetados, arquivos, requirements);
  return missing;
}

/**
 * Clear cached requirements (for testing/debugging)
 */
export function clearRequirementsCache(): void {
  cachedRequirements = null;
}

/**
 * Get cached requirements without loading (sync access)
 */
export function getCachedRequirements(): UnifiedRequirementsConfig | null {
  return cachedRequirements;
}

// ═══════════════════════════════════════════════════════════════
// AGENTS.MD v3.5: PROPOSAL READINESS CHECKLIST
// Validates all requirements before sending proposal
// ═══════════════════════════════════════════════════════════════

export interface ProposalChecklist {
  contaMinima: boolean;               // ≥ R$ 50
  concessionariaValida: boolean;      // CEMIG-MG ou ENERGISA-MG
  nomeColetado: boolean;
  emailColetado: boolean;
  telefoneDisponivel: boolean;        // Já tem do WhatsApp
  clienteConfirmouInteresse: boolean; // "sim", "quero", "me manda"
}

export interface ProposalChecklistResult {
  ready: boolean;
  checklist: ProposalChecklist;
  missingItems: string[];
  nextAction: string | null;
}

/**
 * Extracted client data interface for validation
 */
export interface ExtractedClientDataForChecklist {
  nome?: string | null;
  email?: string | null;
  valorFatura?: number | null;
  consumo?: number | null;
  distribuidora?: string | null;
  telefone?: string | null;
  clienteConfirmouInteresse?: boolean;
}

/**
 * AGENTS.md v3.5: Validate proposal readiness checklist
 * Based on the AGENTS.md canonical document checklist section
 * 
 * Checklist antes de enviar proposta:
 * - [ ] Conta ≥ R$ 50
 * - [ ] Concessionária = CEMIG-MG ou ENERGISA-MG
 * - [ ] Coletou: nome, email, telefone
 * - [ ] Cliente confirmou interesse ("sim", "quero", "me manda")
 */
export function validateProposalReadiness(
  dados: ExtractedClientDataForChecklist
): ProposalChecklistResult {
  const VALOR_MINIMO = 50;
  const CONCESSIONARIAS_VALIDAS = ['cemig', 'energisa', 'cemig-mg', 'energisa-mg', 'cemig mg', 'energisa mg'];
  
  // Build checklist
  const valorFatura = dados.valorFatura || 0;
  const distribuidora = (dados.distribuidora || '').toLowerCase().trim();
  
  const checklist: ProposalChecklist = {
    contaMinima: valorFatura >= VALOR_MINIMO,
    concessionariaValida: CONCESSIONARIAS_VALIDAS.some(c => distribuidora.includes(c)),
    nomeColetado: !!(dados.nome && dados.nome.trim().length > 1),
    emailColetado: !!(dados.email && dados.email.includes('@')),
    telefoneDisponivel: !!(dados.telefone && dados.telefone.length >= 10),
    clienteConfirmouInteresse: dados.clienteConfirmouInteresse === true,
  };
  
  // Find missing items
  const missingItems: string[] = [];
  
  if (!checklist.contaMinima) {
    if (valorFatura === 0) {
      missingItems.push('Valor da conta não informado');
    } else {
      missingItems.push(`Conta de R$ ${valorFatura} abaixo do mínimo de R$ ${VALOR_MINIMO}`);
    }
  }
  
  if (!checklist.concessionariaValida) {
    if (!distribuidora) {
      missingItems.push('Concessionária não informada');
    } else {
      missingItems.push(`Concessionária "${dados.distribuidora}" fora da área de atendimento`);
    }
  }
  
  if (!checklist.nomeColetado) missingItems.push('Nome não informado');
  if (!checklist.emailColetado) missingItems.push('E-mail não informado');
  if (!checklist.telefoneDisponivel) missingItems.push('Telefone não disponível');
  if (!checklist.clienteConfirmouInteresse) missingItems.push('Cliente não confirmou interesse');
  
  // Determine next action
  let nextAction: string | null = null;
  if (!checklist.contaMinima && valorFatura === 0) {
    nextAction = 'Perguntar: "Quanto vem sua conta de luz por mês?"';
  } else if (!checklist.contaMinima) {
    nextAction = 'Desqualificar educadamente: conta abaixo do mínimo';
  } else if (!checklist.concessionariaValida && !distribuidora) {
    nextAction = 'Perguntar: "Você é cliente da CEMIG ou ENERGISA?"';
  } else if (!checklist.concessionariaValida) {
    nextAction = 'Desqualificar: fora da área de atendimento';
  } else if (!checklist.nomeColetado) {
    nextAction = 'Perguntar: "Qual seu nome completo?"';
  } else if (!checklist.emailColetado) {
    nextAction = 'Perguntar: "Qual seu e-mail para eu te enviar a proposta?"';
  } else if (!checklist.clienteConfirmouInteresse) {
    nextAction = 'Perguntar: "Quer que eu te mande o link da proposta personalizada?"';
  }
  
  const ready = Object.values(checklist).every(v => v === true);
  
  return {
    ready,
    checklist,
    missingItems,
    nextAction,
  };
}

/**
 * Quick check if minimum data for proposal exists (without full validation)
 */
export function hasMinimumProposalData(dados: ExtractedClientDataForChecklist): boolean {
  const hasValor = !!(dados.valorFatura && dados.valorFatura >= 50);
  const hasDistribuidora = !!(dados.distribuidora);
  const hasEmail = !!(dados.email && dados.email.includes('@'));
  const hasNome = !!(dados.nome && dados.nome.trim().length > 1);
  
  return hasValor && hasDistribuidora && hasEmail && hasNome;
}
