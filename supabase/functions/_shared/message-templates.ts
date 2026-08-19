/**
 * Message Templates Module
 * Loads and renders dynamic message templates from database
 * Eliminates hardcoded messages from sofia-webhook
 */

// Template entry structure
export interface MessageTemplate {
  id: string;
  category: string;
  subcategory: string | null;
  template_key: string;
  template_text: string;
  variables: string[];
  is_active: boolean;
  priority: number;
  description: string | null;
}

// Cache structure
interface TemplateCache {
  templates: Map<string, MessageTemplate>;
  timestamp: number;
}

// Module-level cache
let templateCache: TemplateCache | null = null;
const TEMPLATE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Generate cache key from category and template_key
 */
function getCacheKey(category: string, templateKey: string): string {
  return `${category}:${templateKey}`;
}

/**
 * Load message templates from database with caching
 */
export async function loadMessageTemplates(
  supabaseClient: any
): Promise<Map<string, MessageTemplate>> {
  const now = Date.now();
  
  if (templateCache && (now - templateCache.timestamp) < TEMPLATE_CACHE_TTL_MS) {
    return templateCache.templates;
  }
  
  try {
    const { data, error } = await supabaseClient
      .from('sofia_message_templates')
      .select('*')
      .eq('is_active', true)
      .order('priority', { ascending: false });
    
    if (error) {
      console.error('[TEMPLATES] Error loading templates:', error);
      return templateCache?.templates || new Map();
    }
    
    const templateMap = new Map<string, MessageTemplate>();
    
    for (const row of (data || [])) {
      const key = getCacheKey(row.category, row.template_key);
      templateMap.set(key, row as MessageTemplate);
    }
    
    templateCache = { templates: templateMap, timestamp: now };
    console.log(`[TEMPLATES] Loaded ${templateMap.size} message templates`);
    
    return templateMap;
  } catch (err) {
    console.error('[TEMPLATES] Exception:', err);
    return templateCache?.templates || new Map();
  }
}

/**
 * Get current template cache
 */
export function getTemplateCache(): Map<string, MessageTemplate> | null {
  return templateCache?.templates || null;
}

/**
 * Clear template cache (for testing or manual refresh)
 */
export function clearTemplateCache(): void {
  templateCache = null;
}

/**
 * Get a template by category and key
 */
export function getTemplate(
  category: string,
  templateKey: string,
  templates?: Map<string, MessageTemplate>
): MessageTemplate | null {
  const templatesToUse = templates || templateCache?.templates;
  if (!templatesToUse) return null;
  
  const key = getCacheKey(category, templateKey);
  return templatesToUse.get(key) || null;
}

/**
 * Render a template by replacing variables with values
 * Variables in template use format: {variable_name}
 */
export function renderTemplate(
  template: MessageTemplate | string,
  variables: Record<string, string | number | null | undefined>
): string {
  const templateText = typeof template === 'string' ? template : template.template_text;
  
  let result = templateText;
  
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{${key}}`;
    result = result.replace(new RegExp(placeholder, 'g'), String(value ?? ''));
  }
  
  return result;
}

/**
 * Get and render a template in one call
 */
export function getRenderedTemplate(
  category: string,
  templateKey: string,
  variables: Record<string, string | number | null | undefined> = {},
  templates?: Map<string, MessageTemplate>,
  fallback?: string
): string {
  const template = getTemplate(category, templateKey, templates);
  
  if (!template) {
    console.warn(`[TEMPLATES] Template not found: ${category}:${templateKey}`);
    return fallback || '';
  }
  
  return renderTemplate(template, variables);
}

// ═══════════════════════════════════════════════════════════════
// SPECIALIZED TEMPLATE GETTERS
// ═══════════════════════════════════════════════════════════════

/**
 * Get triage redirect message for a department
 */
export function getTriageRedirectMessage(
  department: string,
  contactName: string,
  whatsappLink: string,
  templates?: Map<string, MessageTemplate>
): string {
  const template = getTemplate('triage', 'redirect', templates) || 
                   getTemplate('triage', `redirect_${department}`, templates);
  
  // Try department-specific first, then default
  const specificTemplate = getTemplate('triage', department, templates);
  const defaultTemplate = getTemplate('triage', 'default', templates);
  
  const templateToUse = specificTemplate || defaultTemplate;
  
  if (!templateToUse) {
    // Ultimate fallback
    return `Entendido! 📞\n\nVou te transferir para nosso *${contactName}*.\n\n📞 Clique aqui para ser atendido:\n${whatsappLink}`;
  }
  
  return renderTemplate(templateToUse, {
    contact_name: contactName,
    whatsapp_link: whatsappLink,
  });
}

/**
 * Get triage fallback message when contact not found
 */
export function getTriageFallbackMessage(
  deptName: string,
  templates?: Map<string, MessageTemplate>
): string {
  return getRenderedTemplate(
    'triage',
    'fallback',
    { dept_name: deptName },
    templates,
    `Entendido! Infelizmente não consegui localizar o contato do ${deptName} no momento.`
  );
}

/**
 * Get existing client detection prompt
 */
export function getExistingClientPrompt(
  clientFirstName: string | null,
  templates?: Map<string, MessageTemplate>
): string {
  if (clientFirstName) {
    return getRenderedTemplate(
      'triage',
      'existing_client_prompt',
      { client_first_name: clientFirstName },
      templates,
      `Olá ${clientFirstName}! 😊\n\nPelo que entendi, você deseja atendimento para quem *já é cliente COESA Energia Inteligente*.\n\nSe eu estiver correta, me responda:\n\n*1.* Já sou cliente\n*2.* Quero ser cliente`
    );
  }
  
  return getRenderedTemplate(
    'triage',
    'existing_client_prompt_anonymous',
    {},
    templates,
    `Olá! 😊\n\nPelo que entendi, você deseja atendimento para quem *já é cliente COESA Energia Inteligente*.\n\nSe eu estiver correta, me responda:\n\n*1.* Já sou cliente\n*2.* Quero ser cliente`
  );
}

/**
 * Get escalation message
 */
export function getEscalationMessage(
  templates?: Map<string, MessageTemplate>
): string {
  return getRenderedTemplate(
    'triage',
    'default',
    {},
    templates,
    `Entendo sua urgência e quero garantir que você seja atendido da melhor forma. 🤝\n\nVou transferir você para nossa equipe especializada.\n\nAguarde um momento, em breve um atendente vai entrar em contato.`
  );
}

/**
 * Get audio offer message based on reason
 */
export function getAudioOfferMessage(
  reason: 'multiple_doubts' | 'long_response' | 'complex_topic' | 'default',
  templates?: Map<string, MessageTemplate>
): string {
  const fallbacks: Record<string, string> = {
    multiple_doubts: '\n\n🎧 _Você prefere que eu te envie um áudio explicando tudo? Assim fica mais fácil de entender!_',
    long_response: '\n\n💡 _Percebi que essa explicação ficou um pouco longa. Quer que eu te envie por áudio? Fica mais fácil de entender!_',
    complex_topic: '\n\n🎧 _Esse assunto é importante! Quer que eu te explique por áudio? Às vezes ajuda bastante._',
    default: '\n\n💡 _Quer que eu te envie por áudio? Fica mais fácil de entender!_',
  };
  
  return getRenderedTemplate(
    'audio',
    reason,
    {},
    templates,
    fallbacks[reason] || fallbacks.default
  );
}

/**
 * Get audio timeout fallback message
 */
export function getAudioTimeoutFallback(
  templates?: Map<string, MessageTemplate>
): string {
  return getRenderedTemplate(
    'audio',
    'audio_timeout',
    {},
    templates,
    `Desculpa a demora! 😅 Infelizmente não consegui encaminhar o áudio, mas vou te enviar as informações aqui mesmo por escrito.\n\nQualquer dúvida, vamos conversando de forma direta pra economizar seu tempo também! 📝`
  );
}

/**
 * Get validation error fallback message
 */
export function getValidationFallback(
  type: string,
  templates?: Map<string, MessageTemplate>
): string {
  return getRenderedTemplate(
    'fallback',
    type,
    {},
    templates,
    `Não foi possível validar. Por favor, tente novamente em instantes.`
  );
}

/**
 * Get all prompt rules as array of strings
 */
export async function getPromptRules(
  supabaseClient: any
): Promise<string[]> {
  const templates = await loadMessageTemplates(supabaseClient);
  const rules: string[] = [];
  
  for (const [key, template] of templates.entries()) {
    if (key.startsWith('prompt:rules:')) {
      rules.push(template.template_text);
    }
  }
  
  return rules;
}

/**
 * Build prompt rules block for system prompt
 */
export async function buildPromptRulesBlock(
  supabaseClient: any
): Promise<string> {
  const rules = await getPromptRules(supabaseClient);
  
  if (rules.length === 0) {
    return '';
  }
  
  return `
═══════════════════════════════════════════════════════════════
⚠️ REGRAS CRÍTICAS (SEMPRE SEGUIR)
═══════════════════════════════════════════════════════════════
${rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}`;
}

// ═══════════════════════════════════════════════════════════════
// PHASE 4: DATA COLLECTION & DIVERGENCE TEMPLATES
// ═══════════════════════════════════════════════════════════════

/**
 * Get missing data question from templates
 */
export function getMissingDataQuestion(
  field: string,
  templates?: Map<string, MessageTemplate>
): string {
  const fallbacks: Record<string, string> = {
    nome: 'Para eu gerar sua proposta personalizada, preciso saber seu nome completo. Como posso te chamar?',
    email: 'Qual o seu e-mail? Vou precisar dele para te enviar a proposta e o contrato.',
    valorFatura: 'Qual o valor aproximado da sua última conta de luz? (pode ser só o número, ex: 500)',
    distribuidora: 'Qual a sua distribuidora de energia? (Ex: CEMIG, Energisa MG)',
    consumo: 'Qual o consumo aproximado em kWh da sua última conta de luz?',
    cep: 'Qual o CEP do local de instalação?',
  };
  
  return getRenderedTemplate(
    'data_collection',
    field,
    {},
    templates,
    fallbacks[field] || `Por favor, informe o(a) ${field}.`
  );
}

/**
 * Get divergence intro message (with random variation)
 */
export function getDivergenceIntro(
  variationIndex?: number,
  templates?: Map<string, MessageTemplate>
): string {
  const variant = variationIndex !== undefined 
    ? variationIndex 
    : Math.floor(Math.random() * 3) + 1;
  
  const fallbacks: Record<number, string> = {
    1: '📋 *Olha só*, percebi algumas diferenças entre o que você informou e os dados do documento:',
    2: '📋 *Confirmando* alguns dados que encontrei no documento:',
    3: '📋 Vi que alguns dados do documento são *diferentes* do que você mencionou:',
  };
  
  return getRenderedTemplate(
    'divergence',
    `variant_${variant}`,
    {},
    templates,
    fallbacks[variant] || fallbacks[1]
  );
}

/**
 * Get divergence field message
 */
export function getDivergenceField(
  fieldName: string,
  valorAntigo: string | number | null | undefined,
  valorNovo: string | number | null | undefined,
  templates?: Map<string, MessageTemplate>
): string {
  const fieldMap: Record<string, string> = {
    'Nome': 'nome',
    'CPF': 'cpf',
    'CNPJ': 'cnpj',
    'Consumo': 'consumo',
    'Valor da Fatura': 'valor_fatura',
    'Distribuidora': 'distribuidora',
    'Nº Instalação': 'instalacao',
  };
  
  const templateKey = fieldMap[fieldName] || fieldName.toLowerCase();
  
  return getRenderedTemplate(
    'divergence',
    templateKey,
    {
      valor_antigo: String(valorAntigo ?? '(não informado)'),
      valor_novo: String(valorNovo ?? '(não informado)'),
    },
    templates,
    `• *${fieldName}:* ${valorAntigo ?? '(não informado)'} → ${valorNovo ?? '(não informado)'}`
  );
}

/**
 * Get divergence closing message
 */
export function getDivergenceClosing(
  askConfirmation: boolean = true,
  templates?: Map<string, MessageTemplate>
): string {
  const key = askConfirmation ? 'confirmation' : 'update_notice';
  const fallback = askConfirmation 
    ? '\n\nQual dado está correto? *O que você informou antes* ou *o do documento*?'
    : '\n\nVou atualizar com os dados do documento, ok? 😊';
  
  return getRenderedTemplate(
    'divergence',
    key,
    {},
    templates,
    fallback
  );
}

/**
 * Get timeout message for pending tasks
 */
export function getTimeoutMessage(
  type: 'retry' | 'continuation',
  templates?: Map<string, MessageTemplate>
): string {
  const key = type === 'retry' ? 'retry_message' : 'continuation_message';
  const fallbacks: Record<string, string> = {
    retry_message: 'Desculpa a demora! Estou verificando um detalhe técnico aqui. Enquanto isso, posso te ajudar com mais alguma dúvida? 😊',
    continuation_message: 'Oi! Tô aqui sim! 😊 Me conta, como posso te ajudar agora?',
  };
  
  return getRenderedTemplate(
    'timeout',
    key,
    {},
    templates,
    fallbacks[key]
  );
}

/**
 * Get status not found message
 */
export function getStatusNotFoundMessage(
  templates?: Map<string, MessageTemplate>
): string {
  return getRenderedTemplate(
    'status',
    'no_conversation',
    {},
    templates,
    '❌ *Nenhuma conversa ativa encontrada*\n\nEnvie qualquer mensagem para iniciar uma nova conversa.'
  );
}

// ═══════════════════════════════════════════════════════════════
// RAG CATEGORY LABELS - Dynamic from database
// ═══════════════════════════════════════════════════════════════

interface RAGCategoryLabel {
  category_key: string;
  display_label: string;
  priority: number;
}

let ragLabelsCache: Map<string, string> | null = null;
let ragLabelsCacheTimestamp = 0;
const RAG_LABELS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Load RAG category labels from database
 */
export async function loadRAGCategoryLabels(
  supabaseClient: any
): Promise<Map<string, string>> {
  const now = Date.now();
  
  if (ragLabelsCache && (now - ragLabelsCacheTimestamp) < RAG_LABELS_CACHE_TTL_MS) {
    return ragLabelsCache;
  }
  
  try {
    const { data, error } = await supabaseClient
      .from('rag_category_labels')
      .select('category_key, display_label')
      .eq('is_active', true)
      .order('priority', { ascending: false });
    
    if (error) {
      console.error('[RAG_LABELS] Error loading labels:', error);
      return ragLabelsCache || getDefaultRAGLabels();
    }
    
    const labels = new Map<string, string>();
    for (const row of (data || [])) {
      labels.set(row.category_key, row.display_label);
    }
    
    ragLabelsCache = labels;
    ragLabelsCacheTimestamp = now;
    console.log(`[RAG_LABELS] Loaded ${labels.size} category labels`);
    
    return labels;
  } catch (err) {
    console.error('[RAG_LABELS] Exception:', err);
    return ragLabelsCache || getDefaultRAGLabels();
  }
}

/**
 * Get default RAG labels (fallback)
 */
function getDefaultRAGLabels(): Map<string, string> {
  return new Map([
    ['kb_vendas', 'Base de Conhecimento Comercial'],
    ['faq', 'Perguntas Frequentes'],
    ['objecoes', 'Tratamento de Objeções'],
    ['scripts', 'Scripts de Conversão'],
    ['politicas', 'Políticas e Regras'],
    ['institucional', 'Informações Institucionais'],
    ['planos', 'Planos Comerciais'],
    ['guardrails', 'Guardrails e Limites'],
    ['credibilidade', 'Credibilidade e Confiança'],
    ['financeiro', 'Informações Financeiras'],
  ]);
}

/**
 * Get RAG category label from cache
 */
export function getRAGCategoryLabel(
  categoryKey: string,
  labelsCache?: Map<string, string>
): string {
  const labels = labelsCache || ragLabelsCache || getDefaultRAGLabels();
  return labels.get(categoryKey) || categoryKey;
}

/**
 * Format RAG categories for display
 */
export function formatRAGCategories(
  categories: string[],
  labelsCache?: Map<string, string>
): string {
  return categories
    .map(cat => getRAGCategoryLabel(cat, labelsCache))
    .join(', ');
}

/**
 * Clear RAG labels cache
 */
export function clearRAGLabelsCache(): void {
  ragLabelsCache = null;
  ragLabelsCacheTimestamp = 0;
}

// ═══════════════════════════════════════════════════════════════
// SYSTEM CONSTANTS - Dynamic from configuracoes_sistema
// ═══════════════════════════════════════════════════════════════

interface SystemConstantsCache {
  constants: Map<string, string | number>;
  timestamp: number;
}

let systemConstantsCache: SystemConstantsCache | null = null;
const CONSTANTS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Default constants (fallback)
const DEFAULT_CONSTANTS: Record<string, number> = {
  pending_task_timeout_ms: 180000,
  max_task_retries: 2,
  rag_min_message_length: 8,
  rag_cache_ttl_ms: 120000,
  distribuidora_cache_ttl_ms: 600000,
  agent_cache_ttl_ms: 300000,
  template_cache_ttl_ms: 300000,
  divergence_tolerance_percent: 5,
};

/**
 * Load system constants from database
 */
export async function loadSystemConstants(
  supabaseClient: any
): Promise<Map<string, string | number>> {
  const now = Date.now();
  
  if (systemConstantsCache && (now - systemConstantsCache.timestamp) < CONSTANTS_CACHE_TTL_MS) {
    return systemConstantsCache.constants;
  }
  
  try {
    const { data, error } = await supabaseClient
      .from('configuracoes_sistema')
      .select('chave, valor')
      .in('chave', Object.keys(DEFAULT_CONSTANTS));
    
    if (error) {
      console.error('[CONSTANTS] Error loading constants:', error);
      return getDefaultConstants();
    }
    
    const constants = new Map<string, string | number>();
    
    // Start with defaults
    for (const [key, value] of Object.entries(DEFAULT_CONSTANTS)) {
      constants.set(key, value);
    }
    
    // Override with DB values
    for (const row of (data || [])) {
      const numValue = Number(row.valor);
      constants.set(row.chave, isNaN(numValue) ? row.valor : numValue);
    }
    
    systemConstantsCache = { constants, timestamp: now };
    console.log(`[CONSTANTS] Loaded ${constants.size} system constants`);
    
    return constants;
  } catch (err) {
    console.error('[CONSTANTS] Exception:', err);
    return getDefaultConstants();
  }
}

function getDefaultConstants(): Map<string, string | number> {
  const map = new Map<string, string | number>();
  for (const [key, value] of Object.entries(DEFAULT_CONSTANTS)) {
    map.set(key, value);
  }
  return map;
}

/**
 * Get a specific constant value
 */
export function getSystemConstant(
  key: string,
  defaultValue: number,
  cache?: Map<string, string | number>
): number {
  const constants = cache || systemConstantsCache?.constants;
  if (!constants) return defaultValue;
  
  const value = constants.get(key);
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const num = Number(value);
    return isNaN(num) ? defaultValue : num;
  }
  return defaultValue;
}

/**
 * Clear system constants cache
 */
export function clearSystemConstantsCache(): void {
  systemConstantsCache = null;
}

// ═══════════════════════════════════════════════════════════════
// PHASE 5: MEDIA, DELAY, RAG-FIRST, OPERATOR TEMPLATES
// ═══════════════════════════════════════════════════════════════

/**
 * Get media capability message (audio disabled, image failed, etc.)
 */
export function getMediaCapabilityMessage(
  type: 'audio_disabled' | 'audio_inaudible' | 'image_disabled' | 'image_analysis_failed' | 'pdf_disabled' | 'pdf_analysis_failed' | 'unsupported_document',
  templates?: Map<string, MessageTemplate>
): string {
  const fallbacks: Record<string, string> = {
    audio_disabled: 'Oi! 👋 No momento estou com a transcrição de áudio em manutenção. Pode me enviar por texto? 📝',
    audio_inaudible: 'Desculpa, não consegui ouvir o áudio. Pode repetir por texto? 🎤',
    image_disabled: 'Oi! 👋 No momento estou com a análise de imagens em manutenção. Pode me descrever o que está na imagem? 📝\n\nSe for sua conta de luz, me informe:\n• Valor da última fatura\n• Nome da distribuidora (CEMIG ou Energisa MG)',
    image_analysis_failed: 'Recebi sua imagem! 📷 Infelizmente não consegui analisá-la. Pode me descrever o que ela mostra?',
    pdf_disabled: 'Oi! 👋 No momento estou com a leitura de PDFs em manutenção. Pode me enviar como *foto* ou me descrever o conteúdo? 📝\n\nSe for sua conta de luz, me informe:\n• Valor da última fatura\n• Nome da distribuidora (CEMIG ou Energisa MG)',
    pdf_analysis_failed: 'Recebi seu PDF! 📄 Infelizmente não consegui ler o conteúdo. Pode me enviar como imagem ou me contar o que tem nele?',
    unsupported_document: 'Recebi seu documento! 📄 No momento, só consigo analisar arquivos PDF. Pode me enviar nesse formato?',
  };
  
  return getRenderedTemplate(
    'media_capability',
    type,
    {},
    templates,
    fallbacks[type] || fallbacks.audio_disabled
  );
}

/**
 * Get delay intent acknowledgment message
 */
export function getDelayIntentAcknowledgment(
  templates?: Map<string, MessageTemplate>
): string {
  return getRenderedTemplate(
    'delay_intent',
    'acknowledgment',
    {},
    templates,
    'Perfeito, fico no aguardo! 😊'
  );
}

/**
 * Build RAG-FIRST prompt section using dynamic templates
 */
export function buildRAGFirstSection(
  ragContent: string,
  resultsCount: number,
  formattedCategories: string,
  templates?: Map<string, MessageTemplate>
): string {
  const templatesToUse = templates || templateCache?.templates;
  
  // Get individual pieces from templates
  const header = getRenderedTemplate('rag_first', 'header', {}, templatesToUse,
    '═══════════════════════════════════════════════════════════════\n🎯 FONTE PRIMÁRIA DE CONHECIMENTO (RAG-FIRST)\n═══════════════════════════════════════════════════════════════');
  
  const attention = getRenderedTemplate('rag_first', 'attention', {}, templatesToUse,
    '⚠️ ATENÇÃO CRÍTICA: Os documentos abaixo foram recuperados especificamente \npara responder à pergunta do cliente. ELES TÊM PRIORIDADE SOBRE TUDO.');
  
  const sourcesLine = getRenderedTemplate('rag_first', 'sources_line', 
    { formatted_categories: formattedCategories, results_count: resultsCount }, templatesToUse,
    `📂 Fontes consultadas: ${formattedCategories}\n📊 Documentos relevantes: ${resultsCount}`);
  
  const protocolHeader = getRenderedTemplate('rag_first', 'protocol_header', {}, templatesToUse,
    '📋 PROTOCOLO RAG-FIRST (OBRIGATÓRIO):');
  
  const rules = [1, 2, 3, 4, 5].map(i => 
    getRenderedTemplate('rag_first', `protocol_rule_${i}`, {}, templatesToUse, '')
  ).filter(r => r).join('\n');
  
  const donts = [1, 2, 3].map(i => 
    getRenderedTemplate('rag_first', `protocol_dont_${i}`, {}, templatesToUse, '')
  ).filter(r => r).join('\n');
  
  return `

${header}

${attention}

${sourcesLine}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${ragContent}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${protocolHeader}

${rules}

❌ NÃO FAÇA:
${donts}

`;
}

/**
 * Get operator takeover confirmation message
 */
export function getOperatorTakeoverMessage(
  clientName: string,
  phone: string,
  templates?: Map<string, MessageTemplate>
): string {
  return getRenderedTemplate(
    'operator',
    'takeover_detected',
    { client_name: clientName || 'cliente', phone },
    templates,
    `✅ *COMANDO DETECTADO*\n\n🔇 IA pausada para *${clientName || 'cliente'}*\n📱 ${phone}\n\n_Detectado via histórico. Use #RESOLVIDO quando terminar._`
  );
}

// ═══════════════════════════════════════════════════════════════
// PHASE 5C: OPERATOR COMMAND MESSAGES (from DB)
// ═══════════════════════════════════════════════════════════════

/**
 * Get help message (assembled from sections)
 */
export function getHelpMessage(templates?: Map<string, MessageTemplate>): string {
  const templatesToUse = templates || templateCache?.templates;
  
  const header = getRenderedTemplate('operator', 'help_header', {}, templatesToUse,
    '📋 *COMANDOS DISPONÍVEIS*');
  
  const testSection = getRenderedTemplate('operator', 'help_test_section', {}, templatesToUse,
    `🔧 *Comandos de Teste:*\n\n• *#PING_TESTE* - Verifica se a sofIA está online e funcionando\n\n• *#STATUS_TESTE* - Mostra o estado atual da sua conversa\n\n• *#VOZ_TESTE* - Testa a voz da sofIA\n\n• *#RESET_TESTE* - Limpa todos os dados da conversa`);
  
  const attendantSection = getRenderedTemplate('operator', 'help_attendant_section', {}, templatesToUse,
    `👤 *Comandos de Atendimento:*\n\n• *#ASSUMIR <telefone>* - Assume o cliente pelo telefone\n  Ex: #ASSUMIR 31999999999\n\n• *#RESOLVIDO <telefone>* - Devolve cliente específico para a sofIA\n\n• *#RESOLVIDO* (sem telefone) - Devolve todos os seus atendimentos`);
  
  const footer = getRenderedTemplate('operator', 'help_footer', {}, templatesToUse,
    '⚠️ *Importante:* Atendentes precisam estar cadastrados.\n💡 _Use o telefone com DDD, sem o 55._');
  
  return `${header}\n\n${testSection}\n\n${attendantSection}\n\n${footer}`;
}

/**
 * Get takeover confirmation message for attendant
 */
export function getTakeoverConfirmationMessage(
  clientName: string | null,
  phone: string | null,
  returnCmd: string,
  templates?: Map<string, MessageTemplate>
): string {
  return getRenderedTemplate(
    'operator',
    'takeover_confirmation',
    { 
      client_name: clientName || 'Não identificado', 
      phone: phone || 'Não informado',
      return_cmd: returnCmd 
    },
    templates,
    `✅ *Atendimento Assumido*\n\n👤 Cliente: ${clientName || 'Não identificado'}\n📱 Telefone: ${phone || 'Não informado'}\n\nA sofIA parou de responder. Você pode falar diretamente com o cliente.\n\n_Use ${returnCmd} para devolver._`
  );
}

/**
 * Get return confirmation message for attendant
 */
export function getReturnConfirmationMessage(
  clientName: string | null,
  phone: string | null,
  timeMinutes: number,
  agentName: string = 'sofIA',
  templates?: Map<string, MessageTemplate>
): string {
  return getRenderedTemplate(
    'operator',
    'return_confirmation',
    { 
      client_name: clientName || 'Não identificado', 
      phone: phone || 'Não informado',
      time_minutes: timeMinutes.toString(),
      agent_name: agentName
    },
    templates,
    `✅ *Atendimento Devolvido*\n\n👤 Cliente: ${clientName || 'Não identificado'}\n📱 Telefone: ${phone || 'Não informado'}\n⏱️ Tempo de atendimento: ${timeMinutes} min\n\nA ${agentName} voltou a responder automaticamente.`
  );
}

/**
 * Get bulk return confirmation message
 */
export function getBulkReturnConfirmationMessage(
  clientsList: string,
  count: number,
  agentName: string = 'sofIA',
  templates?: Map<string, MessageTemplate>
): string {
  return getRenderedTemplate(
    'operator',
    'bulk_return_confirmation',
    { agent_name: agentName, clients_list: clientsList, count: count.toString() },
    templates,
    `✅ *Atendimentos Devolvidos*\n\nDevolvidos para a ${agentName}:\n${clientsList}\n\nTotal: ${count} cliente(s)`
  );
}

/**
 * Get farewell message to client when human takes over
 */
export function getFarewellToClientMessage(
  clientName: string | null,
  templates?: Map<string, MessageTemplate>
): string {
  const firstName = clientName?.split(' ')[0] || '';
  return getRenderedTemplate(
    'operator',
    'farewell_to_client',
    { client_name: firstName || 'Cliente' },
    templates,
    `${firstName || 'Cliente'}, vou transferir seu atendimento para um especialista da equipe. Você está em boas mãos! 😊`
  );
}

/**
 * Get return message to client when AI resumes
 */
export function getReturnToClientMessage(
  clientName: string | null,
  agentName: string,
  attendantName: string,
  templates?: Map<string, MessageTemplate>
): string {
  const firstName = clientName?.split(' ')[0] || '';
  return getRenderedTemplate(
    'operator',
    'return_to_client',
    { client_name: firstName || '', agent_name: agentName, attendant_name: attendantName },
    templates,
    `Oi ${firstName || ''}! Sou a ${agentName} e voltei para continuar te ajudando. 😊\n\nVi que você estava conversando com ${attendantName}. Posso continuar de onde paramos!`
  );
}

/**
 * Get conversation not found error message
 */
export function getConversationNotFoundMessage(
  phone: string,
  templates?: Map<string, MessageTemplate>
): string {
  return getRenderedTemplate(
    'operator',
    'conversation_not_found',
    { phone },
    templates,
    `⚠️ Nenhuma conversa encontrada para o telefone ${phone}.\n\nVerifique se o número está correto (com DDD, sem 55).`
  );
}

/**
 * Get no escalated conversations message
 */
export function getNoEscalatedMessage(templates?: Map<string, MessageTemplate>): string {
  return getRenderedTemplate(
    'operator',
    'no_escalated_conversations',
    {},
    templates,
    'ℹ️ Você não tem atendimentos pausados no momento.\n\nUse #ASSUMIR <telefone> para assumir um cliente específico.'
  );
}

/**
 * Get combined takeover message (for z-api-webhook)
 */
export function getTakeoverCombinedMessage(
  clientName: string | null,
  agentName: string,
  templates?: Map<string, MessageTemplate>
): string {
  const firstName = clientName?.split(' ')[0] || 'Cliente';
  return getRenderedTemplate(
    'operator',
    'takeover_combined',
    { client_name: firstName, agent_name: agentName },
    templates,
    `✅ *Atendimento assumido por humano*\n\n${firstName}, vou transferir seu atendimento para um especialista da equipe. Você está em boas mãos! 😊\n\n_${agentName} pausada. Use #RESOLVIDO para reativar._`
  );
}

// ═══════════════════════════════════════════════════════════════
// PHASE 6: TECHNICAL ISSUE & TYPO MESSAGES (from DB)
// ═══════════════════════════════════════════════════════════════

/**
 * Get technical issue resolution message
 */
export function getTechIssueMessage(
  issueType: string,
  attemptNumber: number,
  hasName: boolean,
  variables: Record<string, string | number | null | undefined> = {},
  templates?: Map<string, MessageTemplate>
): string {
  // Build template key based on issue type and attempt
  let templateKey: string;
  
  if (attemptNumber > 2) {
    templateKey = hasName ? 'escalation_message' : 'escalation_message_no_name';
  } else {
    const attemptSuffix = attemptNumber > 1 ? `_attempt_${attemptNumber}` : '_attempt_1';
    const nameSuffix = hasName ? '' : '_no_name';
    
    switch (issueType) {
      case 'link_quebrado':
      case 'pdf_nao_carrega':
      case 'proposta_nao_recebida':
        templateKey = variables.link 
          ? `link_regen${attemptSuffix}${nameSuffix}` 
          : `no_proposal_found${nameSuffix}`;
        break;
      case 'email_nao_recebido':
        templateKey = attemptNumber === 1 
          ? `email_verify${attemptSuffix}${nameSuffix}`
          : (variables.link ? `whatsapp_offer${nameSuffix}` : `email_no_proposal${nameSuffix}`);
        break;
      case 'contrato_nao_chegou':
        templateKey = `contract_status_check${nameSuffix}`;
        break;
      default:
        templateKey = `generic_issue${nameSuffix}`;
    }
  }
  
  return getRenderedTemplate('tech_issue', templateKey, variables, templates, 
    'Me conta melhor o que está acontecendo? Assim posso te ajudar da melhor forma! 🤔');
}

/**
 * Get typo suggestion message
 */
export function getTypoSuggestionMessage(
  typoDetected: string,
  suggested: string,
  templates?: Map<string, MessageTemplate>
): string {
  return getRenderedTemplate(
    'typo',
    'suggestion_message',
    { typo_detected: typoDetected, suggested },
    templates,
    `Hmm, você digitou "*${typoDetected}*"... Você quis dizer *${suggested}*? 🤔`
  );
}

/**
 * Get typo rejection clarification message
 */
export function getTypoRejectionMessage(templates?: Map<string, MessageTemplate>): string {
  return getRenderedTemplate(
    'typo',
    'rejection_clarify',
    {},
    templates,
    `Desculpa, não consegui identificar sua distribuidora. 🤔\n\nQual é o nome que aparece na sua conta de luz? (Ex: *CEMIG*, *COELBA*, *CPFL Paulista*...)`
  );
}

// ═══════════════════════════════════════════════════════════════
// PHASE 7B: DISQUALIFICATION MESSAGES (from DB)
// ═══════════════════════════════════════════════════════════════

/**
 * Get disqualification message by reason
 */
export function getDisqualificationMessage(
  reason: string,
  variables: Record<string, string | number | null | undefined> = {},
  templates?: Map<string, MessageTemplate>
): string {
  // Fallback messages
  const fallbacks: Record<string, string> = {
    grupo_a: 'Infelizmente não atendemos clientes do Grupo A (alta tensão). Nosso serviço é voltado para Grupo B (residencial/comercial baixa tensão).',
    tarifa_social: 'Infelizmente não podemos atender clientes com Tarifa Social/Baixa Renda, pois vocês já possuem um desconto especial do governo.',
    consumo_baixo: 'Seu consumo está abaixo do mínimo necessário para que nossa economia faça sentido. Recomendamos a partir de 200 kWh ou R$ 150/mês.',
    area_nao_atendida: 'Infelizmente ainda não atendemos sua região. Atualmente operamos em MG, BA, SP e RJ.',
    geracao_propria: 'Se você já possui painéis solares instalados, nosso serviço não é compatível. Atendemos apenas quem ainda não tem geração própria.',
  };
  
  return getRenderedTemplate(
    'disqualification',
    reason,
    variables,
    templates,
    fallbacks[reason] || 'Infelizmente não podemos atender seu caso no momento.'
  );
}
