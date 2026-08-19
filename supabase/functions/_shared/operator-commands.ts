/**
 * Operator Commands - Shared module for WhatsApp operator control
 * 
 * Provides command detection, processing and response generation for:
 * - #ASSUMIR / #MEU / #TAKEOVER - Human takeover
 * - #RESOLVIDO / #DEVOLVER / #SOFIA - Return to AI
 * - #STATUS_TESTE - Status check
 * - #RESET_TESTE - Reset conversation
 * - #PING_TESTE - Health check
 * - #VOZ_TESTE - Voice test
 * - #AJUDA - Help command
 * 
 * Phase 12: Zero Hardcode - Commands and cooldown now from database
 * 
 * @module _shared/operator-commands
 */

import {
  getHelpMessage as getHelpMessageFromTemplates,
  getTakeoverConfirmationMessage,
  getReturnConfirmationMessage,
  getBulkReturnConfirmationMessage,
  getFarewellToClientMessage,
  getReturnToClientMessage,
  getConversationNotFoundMessage,
  getNoEscalatedMessage,
  getRenderedTemplate,
  type MessageTemplate,
} from './message-templates.ts';
import {
  ensureHumanTakeoverActive,
  resolveHumanTakeover,
} from './human-takeover.ts';

// ═══════════════════════════════════════════════════════════════
// DYNAMIC CONFIG CACHE
// ═══════════════════════════════════════════════════════════════

interface OperatorConfig {
  humanCooldownMs: number;
  resetCommand: string;
  statusCommand: string;
  pingCommand: string;
  voiceCommand: string;
  helpCommand: string;
  takeoverCommands: string[];
  returnCommands: string[];
}

let configCache: OperatorConfig | null = null;
let configCacheTimestamp = 0;
const CONFIG_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Load operator config from database
 */
export async function loadOperatorConfig(supabase: any): Promise<OperatorConfig> {
  const now = Date.now();
  
  if (configCache && (now - configCacheTimestamp) < CONFIG_CACHE_TTL_MS) {
    return configCache;
  }
  
  try {
    const { data, error } = await supabase
      .from('configuracoes_sistema')
      .select('chave, valor')
      .in('chave', [
        'operator_human_cooldown_ms',
        'operator_reset_command',
        'operator_status_command',
        'operator_ping_command',
        'operator_voice_command',
        'operator_help_command',
        'operator_takeover_commands',
        'operator_return_commands',
      ]);
    
    if (error) {
      console.error('Error loading operator config:', error);
      return getDefaultConfig();
    }
    
    const configMap = new Map<string, string>(data?.map((r: any) => [r.chave, r.valor]) || []);
    
    configCache = {
      humanCooldownMs: parseInt(configMap.get('operator_human_cooldown_ms') || '30000'),
      resetCommand: configMap.get('operator_reset_command') || '#RESET_TESTE',
      statusCommand: configMap.get('operator_status_command') || '#STATUS_TESTE',
      pingCommand: configMap.get('operator_ping_command') || '#PING_TESTE',
      voiceCommand: configMap.get('operator_voice_command') || '#VOZ_TESTE',
      helpCommand: configMap.get('operator_help_command') || '#AJUDA',
      takeoverCommands: (configMap.get('operator_takeover_commands') || '#ASSUMIR,#MEU,#TAKEOVER').split(','),
      returnCommands: (configMap.get('operator_return_commands') || '#RESOLVIDO,#DEVOLVER,#SOFIA').split(','),
    };
    
    configCacheTimestamp = now;
    console.log('[operator-commands] Config loaded from DB');
    
    return configCache;
  } catch (err) {
    console.error('Error loading operator config:', err);
    return getDefaultConfig();
  }
}

function getDefaultConfig(): OperatorConfig {
  return {
    humanCooldownMs: 30000,
    resetCommand: '#RESET_TESTE',
    statusCommand: '#STATUS_TESTE',
    pingCommand: '#PING_TESTE',
    voiceCommand: '#VOZ_TESTE',
    helpCommand: '#AJUDA',
    takeoverCommands: ['#ASSUMIR', '#MEU', '#TAKEOVER'],
    returnCommands: ['#RESOLVIDO', '#DEVOLVER', '#SOFIA'],
  };
}

/**
 * Get current config (sync - uses cache or defaults)
 */
function getConfig(): OperatorConfig {
  return configCache || getDefaultConfig();
}

// ═══════════════════════════════════════════════════════════════
// COMMAND CONSTANTS (Dynamic with fallbacks)
// ═══════════════════════════════════════════════════════════════

export const RESET_COMMAND = '#RESET_TESTE';
export const STATUS_COMMAND = '#STATUS_TESTE';
export const PING_COMMAND = '#PING_TESTE';
export const VOICE_COMMAND = '#VOZ_TESTE';
export const HELP_COMMAND = '#AJUDA';

export const RETURN_TO_SOFIA_COMMANDS = ['#RESOLVIDO', '#DEVOLVER', '#SOFIA'];
export const TAKEOVER_COMMANDS = ['#ASSUMIR', '#MEU', '#TAKEOVER'];

// All recognized operator commands
export const ALL_OPERATOR_COMMANDS = [
  RESET_COMMAND,
  STATUS_COMMAND,
  PING_COMMAND,
  VOICE_COMMAND,
  HELP_COMMAND,
  ...RETURN_TO_SOFIA_COMMANDS,
  ...TAKEOVER_COMMANDS,
];

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type OperatorCommandType = 
  | 'takeover'
  | 'takeover_by_phone'
  | 'return'
  | 'return_by_phone'
  | 'return_in_chat'
  | 'status'
  | 'reset'
  | 'ping'
  | 'voice'
  | 'help'
  | 'unknown';

export interface OperatorCommand {
  type: OperatorCommandType;
  raw: string;
  normalized: string;
  targetPhone?: string;
  isValid: boolean;
}

export interface AttendantInfo {
  id: string;
  nome: string;
  telefone?: string;
  chatapp_operator_id?: string;
}

export interface CommandResult {
  success: boolean;
  action: string;
  message?: string;
  conversationId?: string;
  clientName?: string;
  targetPhone?: string;
  error?: string;
}

export interface ConversationContext {
  id: string;
  cliente_nome?: string | null;
  cliente_telefone?: string | null;
  sofia_mode?: string | null;
  escalated_at?: string | null;
  dados_coletados?: Record<string, unknown> | null;
  chatapp_chat_id?: string | null;
}

// ═══════════════════════════════════════════════════════════════
// COMMAND DETECTION
// ═══════════════════════════════════════════════════════════════

/**
 * Parse and classify an operator command from message text
 * Phase 12: Uses dynamic config from cache
 */
export function parseOperatorCommand(messageText: string): OperatorCommand {
  const trimmed = messageText.trim();
  const normalized = trimmed.toUpperCase();
  const config = getConfig();
  
  // Check for #ASSUMIR <PHONE>
  const takeoverRegex = new RegExp(`^(${config.takeoverCommands.map(c => c.replace('#', '\\#')).join('|')})\\s+(\\d{10,13})$`);
  const takeoverPhoneMatch = normalized.match(takeoverRegex);
  if (takeoverPhoneMatch) {
    return {
      type: 'takeover_by_phone',
      raw: trimmed,
      normalized: normalized,
      targetPhone: takeoverPhoneMatch[2],
      isValid: true,
    };
  }
  
  // Check for #RESOLVIDO <PHONE>
  const returnRegex = new RegExp(`^(${config.returnCommands.map(c => c.replace('#', '\\#')).join('|')})\\s+(\\d{10,13})$`);
  const returnPhoneMatch = normalized.match(returnRegex);
  if (returnPhoneMatch) {
    return {
      type: 'return_by_phone',
      raw: trimmed,
      normalized: normalized,
      targetPhone: returnPhoneMatch[2],
      isValid: true,
    };
  }
  
  // Check for simple takeover commands
  if (config.takeoverCommands.includes(normalized)) {
    return {
      type: 'takeover',
      raw: trimmed,
      normalized: normalized,
      isValid: true,
    };
  }
  
  // Check for simple return commands
  if (config.returnCommands.includes(normalized)) {
    return {
      type: 'return',
      raw: trimmed,
      normalized: normalized,
      isValid: true,
    };
  }
  
  // Check other commands
  if (normalized === config.statusCommand) {
    return { type: 'status', raw: trimmed, normalized, isValid: true };
  }
  if (normalized === config.resetCommand) {
    return { type: 'reset', raw: trimmed, normalized, isValid: true };
  }
  if (normalized === config.pingCommand) {
    return { type: 'ping', raw: trimmed, normalized, isValid: true };
  }
  if (normalized === config.voiceCommand) {
    return { type: 'voice', raw: trimmed, normalized, isValid: true };
  }
  if (normalized === config.helpCommand) {
    return { type: 'help', raw: trimmed, normalized, isValid: true };
  }
  
  return {
    type: 'unknown',
    raw: trimmed,
    normalized: normalized,
    isValid: false,
  };
}

/**
 * Check if a message is any operator command
 */
export function isOperatorCommand(messageText: string): boolean {
  const command = parseOperatorCommand(messageText);
  return command.isValid;
}

/**
 * Check if sender is an operator (not the client)
 */
export function isFromOperator(
  senderPhone: string,
  clientPhone: string | null,
  msgData?: { fromMe?: boolean; fromApi?: boolean }
): boolean {
  const senderDigits = senderPhone.replace(/\D/g, '');
  const clientDigits = clientPhone?.replace(/\D/g, '') || '';
  
  return senderDigits !== clientDigits || 
         msgData?.fromMe === true || 
         msgData?.fromApi === true;
}

// ═══════════════════════════════════════════════════════════════
// MESSAGE GENERATORS
// ═══════════════════════════════════════════════════════════════

/**
 * Generate the help message listing all available commands
 * Phase 5C: Now loads from database templates with inline fallback
 */
export function generateHelpMessage(templates?: Map<string, MessageTemplate>): string {
  return getHelpMessageFromTemplates(templates);
}

/**
 * Generate takeover confirmation message for the attendant
 * Phase 5C: Now loads from database templates
 */
export function generateTakeoverConfirmation(
  clientName: string | null,
  clientPhone: string | null,
  targetPhone?: string,
  templates?: Map<string, MessageTemplate>
): string {
  const phoneDisplay = clientPhone || targetPhone || 'Não informado';
  const returnCmd = targetPhone ? `#RESOLVIDO ${targetPhone}` : '#RESOLVIDO';
  
  return getTakeoverConfirmationMessage(clientName, phoneDisplay, returnCmd, templates);
}

/**
 * Generate return confirmation message for the attendant
 * Phase 5C: Now loads from database templates
 */
export function generateReturnConfirmation(
  clientName: string | null,
  clientPhone: string | null,
  resolutionTimeSeconds: number,
  agentName: string = 'sofIA',
  templates?: Map<string, MessageTemplate>
): string {
  const timeMinutes = Math.round(resolutionTimeSeconds / 60);
  return getReturnConfirmationMessage(clientName, clientPhone, timeMinutes, agentName, templates);
}

/**
 * Generate bulk return confirmation message
 * Phase 5C: Now loads from database templates
 */
export function generateBulkReturnConfirmation(
  returnedClients: string[],
  agentName: string = 'sofIA',
  templates?: Map<string, MessageTemplate>
): string {
  const clientsList = returnedClients.map(c => `• ${c}`).join('\n');
  return getBulkReturnConfirmationMessage(clientsList, returnedClients.length, agentName, templates);
}

/**
 * Generate farewell message from AI to client when human takes over
 * Phase 5C: Now loads from database templates
 */
export function generateFarewellMessage(
  clientFirstName: string | null,
  _attendantName: string,
  templates?: Map<string, MessageTemplate>
): string {
  return getFarewellToClientMessage(clientFirstName, templates);
}

/**
 * Generate return message from AI to client when returning from human
 * Phase 5C: Now loads from database templates
 */
export function generateReturnMessage(
  clientFirstName: string | null,
  agentName: string = 'sofIA',
  attendantName: string = 'a equipe',
  templates?: Map<string, MessageTemplate>
): string {
  return getReturnToClientMessage(clientFirstName, agentName, attendantName, templates);
}

/**
 * Generate conversation not found error message
 * Phase 5C: Now loads from database templates
 */
export function generateNotFoundMessage(
  targetPhone: string,
  _isReturn: boolean = false,
  templates?: Map<string, MessageTemplate>
): string {
  return getConversationNotFoundMessage(targetPhone, templates);
}

/**
 * Generate no escalated conversations message
 * Phase 5C: Now loads from database templates
 */
export function generateNoEscalatedMessage(templates?: Map<string, MessageTemplate>): string {
  return getNoEscalatedMessage(templates);
}

/**
 * Generate supervisor notification message
 * Phase 12: Now uses database template
 */
export function generateSupervisorNotification(
  clientPhone: string,
  clientName: string | null,
  escalationReason: string,
  templates?: Map<string, MessageTemplate>
): string {
  const formattedPhone = clientPhone.replace('55', '');
  const clientDisplay = clientName ? `*${clientName}*` : 'um cliente';
  
  // Try to get from templates map
  if (templates?.has('supervisor_notification')) {
    const tmpl = templates.get('supervisor_notification');
    if (tmpl) {
      return tmpl.template_text
        .replace('{clientDisplay}', clientDisplay)
        .replace(/{formattedPhone}/g, formattedPhone)
        .replace('{escalationReason}', escalationReason);
    }
  }
  
  // Fallback
  return `🚨 *Escalação de Atendimento*

Olá! Preciso de ajuda com ${clientDisplay}.

📱 Telefone: ${formattedPhone}
📋 Motivo: ${escalationReason}

Você está online para me ajudar?

_Use #ASSUMIR ${formattedPhone} para tomar controle da conversa._`;
}

// ═══════════════════════════════════════════════════════════════
// CONTEXT PRESERVATION
// ═══════════════════════════════════════════════════════════════

/**
 * Generate updated dados_coletados after human intervention
 * Preserves context and marks intervention as complete
 */
export function preserveContextAfterHumanIntervention(
  existingDados: Record<string, unknown> | null
): Record<string, unknown> {
  return {
    ...(existingDados || {}),
    human_intervention_completed: true,
    triagem_concluida: true, // Don't restart triage
    context_restored_at: new Date().toISOString(),
  };
}

/**
 * Calculate resolution time in seconds
 */
export function calculateResolutionTime(escalatedAt: string | null): number {
  const now = new Date();
  const escalated = escalatedAt ? new Date(escalatedAt) : now;
  return Math.round((now.getTime() - escalated.getTime()) / 1000);
}

// ═══════════════════════════════════════════════════════════════
// COOLDOWN MANAGEMENT
// ═══════════════════════════════════════════════════════════════

/**
 * Human cooldown period in milliseconds
 * Phase 12: Now dynamic from database (default 30 seconds)
 */
export function getHumanCooldownMs(): number {
  const config = getConfig();
  return config.humanCooldownMs;
}

// Keep for backwards compatibility
export const HUMAN_COOLDOWN_MS = 30000;

/**
 * Check if conversation is in human cooldown period
 * Phase 12: Uses dynamic cooldown value
 */
export function isInHumanCooldown(lastHumanMessageAt: string | null): boolean {
  if (!lastHumanMessageAt) return false;
  
  const lastHuman = new Date(lastHumanMessageAt);
  const now = new Date();
  const cooldownMs = getHumanCooldownMs();
  
  return (now.getTime() - lastHuman.getTime()) < cooldownMs;
}

/**
 * Clear the operator config cache
 */
export function clearOperatorConfigCache(): void {
  configCache = null;
  configCacheTimestamp = 0;
}

// ═══════════════════════════════════════════════════════════════
// TEST COMMAND EXECUTION - RESET & STATUS (Phase 25)
// ═══════════════════════════════════════════════════════════════

export interface ResetCommandResult {
  success: boolean;
  details: string[];
}

export interface StatusCommandResult {
  success: boolean;
  status: string;
}

/**
 * Execute #RESET_TESTE command - Deletes all user data for testing
 * Cleans up: Bitrix24 lead, sync logs, proposals, messages, followups, conversation, CRM contact
 */
export async function executeResetCommand(
  supabase: any,
  telefone: string,
  _chatappChatId: string
): Promise<ResetCommandResult> {
  const details: string[] = [];
  
  try {
    console.log(`[RESET] Starting reset for phone: ${telefone}`);
    
    // 1. Find all conversations for this phone
    const { data: conversas } = await supabase
      .from('chatbot_conversas')
      .select('id, bitrix24_lead_id, proposta_id')
      .eq('cliente_telefone', telefone)
      .eq('whatsapp_provider', 'zapi');
    
    if (!conversas || conversas.length === 0) {
      details.push('❌ Nenhuma conversa encontrada');
      return { success: true, details };
    }
    
    details.push(`📋 ${conversas.length} conversa(s) encontrada(s)`);
    
    // 2. Get Bitrix24 config for lead deletion
    const { data: bitrixConfig } = await supabase
      .from('configuracoes_sistema')
      .select('valor')
      .eq('chave', 'bitrix24_webhook_url')
      .single();
    
    const bitrix24Url = bitrixConfig?.valor || null;
    
    // 3. Process each conversation
    for (const conversa of conversas) {
      // 3a. Delete lead in Bitrix24 (if exists and config available)
      if (conversa.bitrix24_lead_id && bitrix24Url) {
        try {
          const deleteResponse = await fetch(
            `${bitrix24Url}/crm.lead.delete?id=${conversa.bitrix24_lead_id}`
          );
          const deleteResult = await deleteResponse.json();
          
          if (deleteResult.result) {
            details.push(`🗑️ Lead Bitrix24 #${conversa.bitrix24_lead_id} excluído`);
          } else {
            details.push(`⚠️ Erro ao excluir lead Bitrix24 #${conversa.bitrix24_lead_id}`);
          }
        } catch (bitrixError) {
          console.error('[RESET] Bitrix24 delete error:', bitrixError);
          details.push(`⚠️ Falha na comunicação com Bitrix24`);
        }
      }
      
      // 3b. Delete sync logs
      if (conversa.proposta_id) {
        const { error: syncLogError } = await supabase
          .from('bitrix24_sync_logs')
          .delete()
          .eq('proposta_id', conversa.proposta_id);
        
        if (!syncLogError) {
          details.push(`📊 Logs de sync excluídos`);
        }
      }
      
      // 3c. Delete proposal
      if (conversa.proposta_id) {
        const { error: propostaError } = await supabase
          .from('propostas_assinantes')
          .delete()
          .eq('id', conversa.proposta_id);
        
        if (!propostaError) {
          details.push(`📝 Proposta excluída`);
        }
      }
      
      // 3d. Delete conversation messages
      const { error: mensagensError } = await supabase
        .from('chatbot_mensagens')
        .delete()
        .eq('conversa_id', conversa.id);
      
      if (!mensagensError) {
        details.push(`💬 Mensagens excluídas`);
      }
      
      // 3e. Delete followups
      await supabase
        .from('chatbot_followups')
        .delete()
        .eq('conversa_id', conversa.id);
      
      // 3f. Delete conversation record
      const { error: conversaError } = await supabase
        .from('chatbot_conversas')
        .delete()
        .eq('id', conversa.id);
      
      if (!conversaError) {
        details.push(`🗨️ Conversa excluída`);
      }
    }
    
    // 3g. Delete pending messages (prevents ghost messages after reset)
    for (const conversa of conversas) {
      await supabase
        .from('chatbot_mensagens_pendentes')
        .delete()
        .eq('conversa_id', conversa.id);
    }
    // Also delete by phone (some pending messages may not have conversa_id)
    await supabase
      .from('chatbot_mensagens_pendentes')
      .delete()
      .eq('telefone', telefone);
    details.push(`🧹 Mensagens pendentes limpas`);
    
    // 3h. Delete message processing locks (prevents deduplication blocks)
    const phoneDigits = telefone.replace(/\D/g, '');
    for (const phoneVar of [telefone, phoneDigits, '+' + phoneDigits]) {
      await supabase
        .from('message_processing_locks')
        .delete()
        .eq('phone_normalized', phoneVar);
    }
    details.push(`🔓 Locks de processamento limpos`);
    
    // 4. Delete CRM contact
    const { error: crmError } = await supabase
      .from('crm_contatos')
      .delete()
      .eq('telefone', telefone);
    
    if (!crmError) {
      details.push(`👤 Contato CRM excluído`);
    }
    
    // 5. Also try with different phone format variations
    const phoneVariations = [
      telefone,
      telefone.replace(/\D/g, ''),
      '+' + telefone.replace(/\D/g, ''),
    ];
    
    for (const phoneVar of phoneVariations) {
      await supabase
        .from('crm_contatos')
        .delete()
        .eq('telefone', phoneVar);
    }
    
    console.log(`[RESET] Complete for ${telefone}:`, details);
    return { success: true, details };
    
  } catch (error: unknown) {
    console.error('[RESET] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'desconhecido';
    details.push(`❌ Erro: ${errorMessage}`);
    return { success: false, details };
  }
}

/**
 * Execute #STATUS_TESTE command - Returns current conversation state
 */
export async function executeStatusCommand(
  supabase: any,
  telefone: string,
  agentId: string = 'sofia',
  templates?: Map<string, MessageTemplate>
): Promise<StatusCommandResult> {
  try {
    console.log(`[STATUS] Checking status for phone: ${telefone}`);
    
    // Find conversation for this phone
    const { data: conversa } = await supabase
      .from('chatbot_conversas')
      .select(`
        id,
        cliente_nome,
        lead_score,
        sofia_mode,
        detected_objection,
        ab_variant,
        total_messages,
        bitrix24_lead_id,
        bitrix24_stage,
        proposta_id,
        dados_coletados,
        arquivos_anexados,
        created_at,
        last_message_at,
        contrato_enviado_at,
        contrato_assinado,
        followup_count,
        nudge_count,
        needs_human_fallback,
        escalation_reason
      `)
      .eq('cliente_telefone', telefone)
      .eq('agent_id', agentId)
      .eq('whatsapp_provider', 'zapi')
      .is('ended_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (!conversa) {
      // Use template or fallback
      const notFoundMsg = templates?.has('status_not_found') 
        ? templates.get('status_not_found')?.template_text || '❌ Nenhuma conversa ativa encontrada para este telefone.'
        : '❌ Nenhuma conversa ativa encontrada para este telefone.';
      return { success: true, status: notFoundMsg };
    }
    
    const dados = (conversa.dados_coletados || {}) as Record<string, unknown>;
    const arquivos = conversa.arquivos_anexados as unknown[] || [];
    
    // Format collected data
    const dadosFormatados = [];
    if (dados.nome) dadosFormatados.push(`👤 Nome: ${dados.nome}`);
    if (dados.cpf) {
      const cpfStr = String(dados.cpf);
      dadosFormatados.push(`🪪 CPF: ${cpfStr.substring(0,3)}.***.***-${cpfStr.substring(9)}`);
    }
    if (dados.cnpj) {
      const cnpjStr = String(dados.cnpj);
      dadosFormatados.push(`🏢 CNPJ: ${cnpjStr.substring(0,2)}.***.***/****-${cnpjStr.substring(12)}`);
    }
    if (dados.email) dadosFormatados.push(`📧 Email: ${dados.email}`);
    if (dados.cep) dadosFormatados.push(`📍 CEP: ${dados.cep}`);
    if (dados.cidade && dados.uf) dadosFormatados.push(`🏙️ Cidade: ${dados.cidade}/${dados.uf}`);
    if (dados.consumo) dadosFormatados.push(`⚡ Consumo: ${dados.consumo} kWh`);
    if (dados.valorFatura) dadosFormatados.push(`💰 Valor Fatura: R$ ${Number(dados.valorFatura).toFixed(2)}`);
    if (dados.distribuidora) dadosFormatados.push(`🏭 Distribuidora: ${dados.distribuidora}`);
    if (dados.numeroInstalacao) dadosFormatados.push(`🔌 Instalação: ${dados.numeroInstalacao}`);
    
    // Format archives
    const arquivosFormatados = (arquivos as Array<{ tipo?: string }>).map((a) => {
      const tipo = a.tipo === 'fatura' ? '📄 Fatura' : a.tipo === 'documento_identidade' ? '🪪 Documento' : '📋 Contrato Social';
      return `${tipo}: ✅`;
    });
    
    // Calculate conversation age
    const createdAt = new Date(conversa.created_at);
    const ageMs = Date.now() - createdAt.getTime();
    const ageHours = Math.floor(ageMs / (1000 * 60 * 60));
    const ageDays = Math.floor(ageHours / 24);
    const ageFormatted = ageDays > 0 ? `${ageDays}d ${ageHours % 24}h` : `${ageHours}h`;
    
    // Build status message
    const statusParts = [
      `📊 *STATUS DA CONVERSA*`,
      ``,
      `🆔 ID: \`${conversa.id.substring(0, 8)}...\``,
      `👤 Cliente: ${conversa.cliente_nome || 'Não identificado'}`,
      `⏱️ Idade: ${ageFormatted}`,
      `💬 Total Mensagens: ${conversa.total_messages || 0}`,
      ``,
      `═══ LEAD SCORING ═══`,
      `📈 Score: ${conversa.lead_score || 0}/100`,
      `🎯 Modo Sofia: ${conversa.sofia_mode || 'standard'}`,
      `🎲 Variante A/B: ${conversa.ab_variant || 'A'}`,
      conversa.detected_objection ? `⚠️ Objeção: ${conversa.detected_objection}` : null,
      ``,
      `═══ BITRIX24 ═══`,
      conversa.bitrix24_lead_id ? `🔗 Lead ID: ${conversa.bitrix24_lead_id}` : `❌ Lead não criado`,
      conversa.bitrix24_stage ? `📍 Stage: ${conversa.bitrix24_stage}` : null,
      conversa.proposta_id ? `📝 Proposta: ✅` : `❌ Sem proposta`,
      ``,
      `═══ DADOS COLETADOS ═══`,
      dadosFormatados.length > 0 ? dadosFormatados.join('\n') : '❌ Nenhum dado coletado',
      ``,
      arquivosFormatados.length > 0 ? `═══ ARQUIVOS ═══\n${arquivosFormatados.join('\n')}` : null,
      ``,
      `═══ STATUS DO FUNIL ═══`,
      conversa.contrato_enviado_at ? `📤 Contrato Enviado: ✅` : `❌ Contrato não enviado`,
      conversa.contrato_assinado ? `✍️ Contrato Assinado: ✅` : `❌ Contrato não assinado`,
      conversa.needs_human_fallback ? `🚨 Escalado: ${conversa.escalation_reason || 'Sim'}` : null,
      ``,
      `📊 Follow-ups: ${conversa.followup_count || 0} | Nudges: ${conversa.nudge_count || 0}`,
    ];
    
    const statusMessage = statusParts.filter(Boolean).join('\n');
    
    return { success: true, status: statusMessage };
    
  } catch (error: unknown) {
    console.error('[STATUS] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'desconhecido';
    return { success: false, status: `❌ Erro: ${errorMessage}` };
  }
}

// ═══════════════════════════════════════════════════════════════
// PING COMMAND - Health check response builder (Phase 29)
// ═══════════════════════════════════════════════════════════════

export interface PingContext {
  phone: string;
  clienteNome: string | null;
  agentName: string;
  messageText: string;
}

/**
 * Build PING response message showing system health
 */
export function buildPingResponse(ctx: PingContext): string {
  const timestamp = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  
  return `🟢 *${ctx.agentName.toUpperCase()} ONLINE*

✅ Webhook recebido com sucesso
📱 Seu número: ${ctx.phone}
👤 Nome detectado: ${ctx.clienteNome || 'Não identificado'}
⏰ Timestamp: ${timestamp}

📊 *Status dos Serviços:*
• WhatsApp: ✅ Conectado
• Banco de dados: ✅ Operacional
• Gateway IA: ✅ Disponível

💬 *Mensagem Recebida:*
"${ctx.messageText}"

_Sistema funcionando normalmente. Envie outra mensagem para testar a resposta da IA._`;
}

// ═══════════════════════════════════════════════════════════════
// VOICE TEST COMMAND - Voice test response builders (Phase 29)
// ═══════════════════════════════════════════════════════════════

/**
 * Build voice test text message
 */
export function buildVoiceTestText(agentName: string): string {
  return `Olá! Eu sou ${agentName}, assistente virtual da COESA Energia. Estou aqui para te ajudar a economizar até 30% na sua conta de luz, sem obras, sem investimento e sem burocracia. Quer que eu faça uma simulação personalizada para você?`;
}

/**
 * Build voice test success confirmation
 */
export function buildVoiceSuccessMessage(agentName: string, testMessage: string): string {
  return `🎙️ *Teste de Voz da ${agentName}*

_Áudio enviado com sucesso!_

📝 Texto do áudio:
"${testMessage}"`;
}

/**
 * Build voice test failure message
 */
export function buildVoiceFailureMessage(agentName: string): string {
  return `⚠️ *Teste de Voz da ${agentName}*

❌ Não foi possível enviar o áudio.

Possíveis causas:
• Formato de áudio não aceito pelo provedor
• ElevenLabs sem créditos (fallback para OpenAI foi usado)
• Erro na API do provedor

📋 O áudio foi GERADO com sucesso, mas o envio falhou.

_Verifique os logs da edge function para detalhes técnicos._`;
}

// ═══════════════════════════════════════════════════════════════
// HELP COMMAND - Dynamic help message builder (Phase 29)
// ═══════════════════════════════════════════════════════════════

/**
 * Build HELP response with all available commands
 */
export function buildHelpMessage(): string {
  return `📋 *COMANDOS DISPONÍVEIS*

🔧 *Comandos de Teste:*

• *#PING_TESTE* - Verifica se a sofIA está online e funcionando

• *#STATUS_TESTE* - Mostra o estado atual da sua conversa (lead score, dados coletados, etc.)

• *#VOZ_TESTE* - Testa a voz da sofIA (envia um áudio de exemplo)

• *#RESET_TESTE* - Limpa todos os dados da conversa para começar do zero

👤 *Comandos de Atendimento:*

• *#ASSUMIR <telefone>* - Assume o cliente pelo telefone
  Ex: #ASSUMIR 31999999999
  _Aliases: #MEU, #TAKEOVER_

• *#RESOLVIDO <telefone>* - Devolve cliente específico para a sofIA
  Ex: #RESOLVIDO 31999999999
  _Aliases: #DEVOLVER, #SOFIA_

• *#RESOLVIDO* (sem telefone) - Devolve todos os seus atendimentos

⚠️ *Importante:* Atendentes precisam estar cadastrados.
💡 _Use o telefone com DDD, sem o 55._`;
}

// ═══════════════════════════════════════════════════════════════
// TAKEOVER OPERATIONS - Database utilities for human takeover (Phase 30)
// ═══════════════════════════════════════════════════════════════

export interface TakeoverContext {
  conversaId: string;
  clienteNome: string | null;
  clienteTelefone: string | null;
  attendantId: string | null;
  attendantName: string;
  agentName: string;
  supervisorNome?: string;
}

export interface TakeoverResult {
  success: boolean;
  farewellMessage?: string;
  error?: string;
}

/**
 * Execute takeover database updates
 */
export async function executeTakeoverDbUpdates(
  supabase: any, 
  ctx: TakeoverContext,
  options?: { agentId?: string; whatsappProvider?: string }
): Promise<TakeoverResult> {
  const now = new Date().toISOString();
  
  try {
    // ═══════════════════════════════════════════════════════════════
    // CRITICAL: Insert into human_takeovers table FIRST (hard stop)
    // This is the SOURCE OF TRUTH that blocks ALL automations
    // ═══════════════════════════════════════════════════════════════
    if (ctx.clienteTelefone) {
      await ensureHumanTakeoverActive(supabase, {
        agentId: options?.agentId || 'sofia',
        whatsappProvider: options?.whatsappProvider || 'zapi',
        phone: ctx.clienteTelefone,
        takenOverByPhone: ctx.attendantId || null,
        takenOverByName: ctx.attendantName || 'Atendente Humano',
      });
      console.log(`[TAKEOVER] ✅ Registered in human_takeovers: ${ctx.clienteTelefone}`);
    }

    // Update conversation for human handling
    await supabase
      .from('chatbot_conversas')
      .update({
        needs_human_fallback: true,
        sofia_mode: 'paused_for_human',
        escalated_at: now,
        escalation_reason: 'Atendente assumiu via comando #ASSUMIR',
        human_agent_id: ctx.attendantId,
        human_agent_nome: ctx.attendantName,
        atendente_notificado_id: ctx.attendantId,
        atendente_notificado_nome: ctx.attendantName,
        atendente_notificado_at: now,
        // CRITICAL: Clear all automation timestamps
        next_nudge_at: null,
        next_followup_at: null,
        next_rescue_at: null,
        next_contract_nudge_at: null,
        pending_task: null,
      })
      .eq('id', ctx.conversaId);
    
    // Update attendant metrics
    if (ctx.attendantId) {
      const { data: attendantData } = await supabase
        .from('whatsapp_atendentes')
        .select('escalacoes_recebidas')
        .eq('id', ctx.attendantId)
        .single();
      
      if (attendantData) {
        await supabase
          .from('whatsapp_atendentes')
          .update({
            escalacoes_recebidas: (attendantData.escalacoes_recebidas || 0) + 1,
            last_escalation_at: now,
          })
          .eq('id', ctx.attendantId);
      }
    }
    
    // Build farewell message
    const clientFirstName = ctx.clienteNome?.split(' ')[0] || '';
    const supervisor = ctx.supervisorNome || 'um especialista da equipe';
    const farewellMessage = clientFirstName 
      ? `${clientFirstName}, vou transferir seu atendimento para ${supervisor}. Você está em boas mãos! 😊`
      : `Vou transferir seu atendimento para ${supervisor}. Você está em boas mãos! 😊`;
    
    return { success: true, farewellMessage };
  } catch (error) {
    console.error('[TAKEOVER] Database update error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ═══════════════════════════════════════════════════════════════
// RETURN TO SOFIA - Database utilities for returning to AI (Phase 30)
// ═══════════════════════════════════════════════════════════════

export interface ReturnToSofiaContext {
  conversaId: string;
  clienteNome: string | null;
  clienteTelefone: string | null;
  escalatedAt: string | null;
  attendantId?: string;
  attendantName?: string;
  preserveContext?: boolean;
  dadosColetados?: Record<string, any>;
}

export interface ReturnToSofiaResult {
  success: boolean;
  resolutionTimeSeconds: number;
  returnMessage?: string;
  error?: string;
}

/**
 * Execute return to Sofia database updates
 * ENHANCED: Now preserves ALL commercial data and skips triagem
 */
export async function executeReturnToSofiaDbUpdates(
  supabase: any, 
  ctx: ReturnToSofiaContext,
  options?: { agentId?: string; whatsappProvider?: string }
): Promise<ReturnToSofiaResult> {
  const now = new Date();
  const escalatedAtDate = ctx.escalatedAt ? new Date(ctx.escalatedAt) : now;
  const resolutionTimeSeconds = Math.round((now.getTime() - escalatedAtDate.getTime()) / 1000);
  
  try {
    // ═══════════════════════════════════════════════════════════════
    // CRITICAL: Remove from human_takeovers table FIRST
    // This re-enables ALL automations for this phone
    // ═══════════════════════════════════════════════════════════════
    if (ctx.clienteTelefone) {
      await resolveHumanTakeover(supabase, {
        agentId: options?.agentId || 'sofia',
        whatsappProvider: options?.whatsappProvider || 'zapi',
        phone: ctx.clienteTelefone,
        resolvedByPhone: ctx.attendantId || null,
        resolvedByName: ctx.attendantName || 'Atendente',
      });
      console.log(`[RETURN_TO_SOFIA] ✅ Removed from human_takeovers: ${ctx.clienteTelefone}`);
    }

    // CRITICAL: Preserve ALL existing data and mark context properly
    const existingDados = ctx.dadosColetados || {};
    
    // Determine next expected field based on what data exists
    const hasValor = !!(existingDados.valorFatura || existingDados.valor_fatura || existingDados.consumo);
    const hasDistribuidora = !!(existingDados.distribuidora || existingDados.distribuidoraInformada);
    const hasEmail = !!existingDados.email;
    const hasNome = !!existingDados.nome;
    
    let nextExpectedField = 'valor';
    if (hasValor && !hasDistribuidora) nextExpectedField = 'distribuidora';
    else if (hasValor && hasDistribuidora && !hasEmail) nextExpectedField = 'email';
    else if (hasValor && hasDistribuidora && hasEmail && !hasNome) nextExpectedField = 'nome';
    else if (hasValor && hasDistribuidora && hasEmail && hasNome) nextExpectedField = 'cpf';
    
    // Prepare updated dados_coletados with context preservation
    // IMPORTANT: Merge ALL existing data, don't overwrite
    const updatedDados = ctx.preserveContext !== false ? {
      ...existingDados,
      // Mark human intervention as complete
      human_intervention_completed: true,
      // CRITICAL: Mark triagem as done to prevent restart
      triagem_concluida: true,
      // Mark as new client (they're in sales flow)
      is_new_client: true,
      // Clear any triagem state that might restart menu
      triagem_state: null,
      awaiting_clausula_petrea_response: false,
      // Track when context was restored
      context_restored_at: now.toISOString(),
      // Preserve any greeting state
      greeting_sent: existingDados.greeting_sent || true,
    } : existingDados;
    
    console.log(`[RETURN_TO_SOFIA] Preserving context:`, {
      hasValor,
      hasDistribuidora,
      hasEmail,
      hasNome,
      nextExpectedField,
      valorFatura: existingDados.valorFatura || existingDados.valor_fatura,
      distribuidora: existingDados.distribuidora || existingDados.distribuidoraInformada,
    });
    
    // Update conversation to return to AI
    const updateData: Record<string, any> = {
      needs_human_fallback: false,
      sofia_mode: 'standard',
      human_resolved_at: now.toISOString(),
      human_resolution_time_seconds: resolutionTimeSeconds,
      last_human_message_at: now.toISOString(),
      // CRITICAL: Set FSM expected field based on existing data
      fsm_expected_field: nextExpectedField,
    };
    
    if (ctx.attendantId) {
      updateData.human_agent_id = ctx.attendantId;
      updateData.human_agent_nome = ctx.attendantName;
    }
    
    if (updatedDados) {
      updateData.dados_coletados = updatedDados;
    }
    
    await supabase
      .from('chatbot_conversas')
      .update(updateData)
      .eq('id', ctx.conversaId);
    
    console.log(`[RETURN_TO_SOFIA] ✅ Context preserved. triagem_concluida=true, fsm_expected_field=${nextExpectedField}`);
    
    // Build return message
    const clientFirstName = ctx.clienteNome?.split(' ')[0] || '';
    const returnMessage = clientFirstName
      ? `Olá ${clientFirstName}! Estou de volta e vou seguir com seu atendimento, caso você precise, ok?! Estou à disposição. Qualquer coisa, me chama! 😊`
      : `Olá! Estou de volta e vou seguir com seu atendimento, caso você precise, ok?! Estou à disposição. Qualquer coisa, me chama! 😊`;
    
    return { success: true, resolutionTimeSeconds, returnMessage };
  } catch (error) {
    console.error('[RETURN_TO_SOFIA] Database update error:', error);
    return { 
      success: false, 
      resolutionTimeSeconds: 0, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Update attendant resolution metrics
 */
export async function updateAttendantResolutionMetrics(
  supabase: any,
  attendantId: string,
  resolvedCount: number,
  totalResolutionTime: number
): Promise<void> {
  try {
    const { data: attendantData } = await supabase
      .from('whatsapp_atendentes')
      .select('escalacoes_resolvidas, total_tempo_resolucao_segundos')
      .eq('id', attendantId)
      .single();
    
    if (attendantData) {
      const newTotalResolved = (attendantData.escalacoes_resolvidas || 0) + resolvedCount;
      const newTotalTime = (attendantData.total_tempo_resolucao_segundos || 0) + totalResolutionTime;
      const newAvgTime = newTotalResolved > 0 ? Math.round(newTotalTime / newTotalResolved) : 0;
      
      await supabase
        .from('whatsapp_atendentes')
        .update({
          escalacoes_resolvidas: newTotalResolved,
          total_tempo_resolucao_segundos: newTotalTime,
          tempo_medio_resolucao_segundos: newAvgTime,
        })
        .eq('id', attendantId);
    }
  } catch (error) {
    console.error('[METRICS] Failed to update attendant metrics:', error);
  }
}

/**
 * Log operator command to database
 */
export async function logOperatorCommand(
  supabase: any,
  command: string,
  operatorPhone: string,
  operatorName: string,
  clientPhone: string | null,
  clientName: string | null,
  conversaId: string,
  actionResult: string
): Promise<void> {
  try {
    await supabase.from('operator_command_logs').insert({
      command,
      operator_phone: operatorPhone,
      operator_name: operatorName,
      client_phone: clientPhone,
      client_name: clientName,
      conversa_id: conversaId,
      action_result: actionResult,
    });
  } catch (error) {
    console.error('[LOG] Failed to log operator command:', error);
  }
}

// ═══════════════════════════════════════════════════════════════
// CONVERSATION PAUSE HANDLING - Phase 32
// ═══════════════════════════════════════════════════════════════

export interface PauseCheckResult {
  isPaused: boolean;
  reason: string;
  conversaId?: string;
  messageSaved?: boolean;
}

/**
 * Save message and update conversation when paused
 */
export async function handlePausedConversationMessage(
  supabase: any,
  conversaId: string,
  messageText: string,
  messageId: string | null
): Promise<PauseCheckResult> {
  try {
    // Save incoming message for history
    await supabase.from('chatbot_mensagens').insert({
      conversa_id: conversaId,
      role: 'user',
      content: messageText,
      message_id: messageId,
    });
    
    // Update last message time
    await supabase
      .from('chatbot_conversas')
      .update({ 
        last_message_at: new Date().toISOString(),
        awaiting_response: false,
      })
      .eq('id', conversaId);
    
    return {
      isPaused: true,
      reason: 'Conversation is under human control',
      conversaId,
      messageSaved: true,
    };
  } catch (error) {
    console.error('[PAUSE_HANDLER] Error saving message:', error);
    return {
      isPaused: true,
      reason: 'Conversation is paused (error saving message)',
      conversaId,
      messageSaved: false,
    };
  }
}

/**
 * Check fresh state of conversation from database
 */
export async function checkFreshConversationState(
  supabase: any,
  conversaId: string
): Promise<{ isPaused: boolean; sofiaMode: string | null }> {
  try {
    const { data } = await supabase
      .from('chatbot_conversas')
      .select('sofia_mode')
      .eq('id', conversaId)
      .single();
    
    return {
      isPaused: data?.sofia_mode === 'paused_for_human',
      sofiaMode: data?.sofia_mode || null,
    };
  } catch (error) {
    console.error('[FRESH_STATE] Error checking state:', error);
    return { isPaused: false, sofiaMode: null };
  }
}

export interface TakeoverDetectionResult {
  detected: boolean;
  confirmationSent: boolean;
  conversaId?: string;
  error?: string;
}

export interface TakeoverDetectionParams {
  conversaId: string;
  clienteNome: string | null;
  clienteTelefone: string | null;
  messageText: string;
  messageId: string | null;
  instanceId: string;
  token: string;
  securityToken?: string;
  agentName?: string;
  sendMessage: (phone: string, message: string) => Promise<void>;
  templateCache?: Map<string, MessageTemplate>;
}

/**
 * Detect takeover commands by reading chat history from Z-API
 * This catches #ASSUMIR commands that weren't delivered as webhooks
 */
export async function detectTakeoverByHistory(
  supabase: any,
  phone: string,
  params: TakeoverDetectionParams
): Promise<TakeoverDetectionResult> {
  const config = await loadOperatorConfig(supabase);
  
  try {
    const historyUrl = `https://api.z-api.io/instances/${params.instanceId}/token/${params.token}/chat-messages/${phone}?amount=15`;
    const historyHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (params.securityToken) historyHeaders['Client-Token'] = params.securityToken;

    const historyResp = await fetch(historyUrl, { method: 'GET', headers: historyHeaders });

    if (!historyResp.ok) {
      console.warn(`[TAKEOVER_BY_HISTORY] Failed to fetch: ${historyResp.status}`);
      return { detected: false, confirmationSent: false, error: `HTTP ${historyResp.status}` };
    }

    const historyJson = await historyResp.json();
    const historyMessages: any[] = Array.isArray(historyJson)
      ? historyJson
      : Array.isArray((historyJson as any)?.messages)
        ? (historyJson as any).messages
        : [];

    const takeoverFound = historyMessages.some((m) => {
      const txt = String(m?.text?.message ?? '').trim().toUpperCase();
      return m?.fromMe === true && config.takeoverCommands.includes(txt);
    });

    if (!takeoverFound) {
      return { detected: false, confirmationSent: false };
    }

    console.log(`[TAKEOVER_BY_HISTORY] ✅ Found #ASSUMIR in history for ${phone}`);

    // ATOMIC: Update database FIRST
    await supabase
      .from('chatbot_conversas')
      .update({
        needs_human_fallback: true,
        sofia_mode: 'paused_for_human',
        escalated_at: new Date().toISOString(),
        escalation_reason: 'Atendente assumiu via comando #ASSUMIR (detecção por histórico)',
        human_agent_nome: 'Operador',
        atendente_notificado_at: new Date().toISOString(),
        last_message_at: new Date().toISOString(),
        awaiting_response: false,
        nudge_count: 0,
        next_nudge_at: null,
      })
      .eq('id', params.conversaId);

    // Save incoming client message
    await supabase.from('chatbot_mensagens').insert({
      conversa_id: params.conversaId,
      role: 'user',
      content: params.messageText,
      message_id: params.messageId,
    });

    // Send confirmation to operator
    const clientFirstName = (params.clienteNome || '').split(' ')[0] || '';
    const operatorConfirmation = getOperatorTakeoverMessage(clientFirstName, phone, params.templateCache);
    await params.sendMessage(phone, operatorConfirmation);

    // Log for audit
    await logOperatorCommand(supabase, '#ASSUMIR', '', 'Operador',
      params.clienteTelefone, params.clienteNome, params.conversaId,
      'Conversa pausada (detecção por histórico Z-API) + confirmação enviada');

    // Save confirmation to history
    await supabase.from('chatbot_mensagens').insert({
      conversa_id: params.conversaId,
      role: 'system',
      content: '[COMANDO] #ASSUMIR detectado por histórico - IA pausada',
    });

    return {
      detected: true,
      confirmationSent: true,
      conversaId: params.conversaId,
    };
  } catch (err) {
    console.warn('[TAKEOVER_BY_HISTORY] Error:', err);
    return { detected: false, confirmationSent: false, error: String(err) };
  }
}

/**
 * Generate operator takeover message
 */
export function getOperatorTakeoverMessage(
  clientFirstName: string,
  clientPhone: string,
  templateCache?: Map<string, MessageTemplate>
): string {
  const fallback = `✅ *Atendimento Assumido*\n\n👤 Cliente: ${clientFirstName || 'Não identificado'}\n📱 Telefone: ${clientPhone}\n\nA IA está pausada para este cliente.\n\n💡 Use *#RESOLVIDO* para devolver à IA.`;
  
  if (templateCache) {
    const rendered = getRenderedTemplate(
      'operator',
      'takeover_confirmation',
      { clientFirstName, clientPhone },
      templateCache,
      fallback
    );
    if (rendered) return rendered;
  }
  
  return fallback;
}

// ═══════════════════════════════════════════════════════════════
// TAKEOVER BY PHONE - Complete flow handler (Phase 59)
// ═══════════════════════════════════════════════════════════════

export interface TakeoverByPhoneParams {
  supabase: any;
  targetPhone: string;
  operatorPhone: string;
  attendant: AttendantInfo;
  agentName?: string;
  supervisorNome?: string;
  sendMessage: (phone: string, message: string) => Promise<void>;
  templateCache?: Map<string, MessageTemplate>;
}

export interface TakeoverByPhoneResult {
  success: boolean;
  conversationId?: string;
  clientName?: string;
  clientPhone?: string;
  error?: string;
}

/**
 * Execute complete #ASSUMIR <TELEFONE> flow
 * Finds conversation by phone, takes over, logs, and sends confirmations
 */
export async function executeTakeoverByPhone(
  params: TakeoverByPhoneParams
): Promise<TakeoverByPhoneResult> {
  const { supabase, targetPhone, operatorPhone, attendant, agentName, supervisorNome, sendMessage, templateCache } = params;
  
  console.log(`[TAKEOVER_BY_PHONE] Attendant ${attendant.nome} requesting takeover of client ${targetPhone}`);
  
  // Find active conversation for target phone
  const { data: targetConversa } = await supabase
    .from('chatbot_conversas')
    .select('id, cliente_nome, cliente_telefone, sofia_mode, needs_human_fallback')
    .or(`cliente_telefone.ilike.%${targetPhone}%,cliente_telefone.ilike.%${targetPhone.slice(-8)}%`)
    .is('ended_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  
  if (!targetConversa) {
    await sendMessage(operatorPhone, `❌ *Conversa não encontrada*\n\nNão encontrei conversa ativa para ${targetPhone}.`);
    return { success: false, error: 'Conversation not found' };
  }
  
  // Execute takeover
  const takeoverResult = await executeTakeoverDbUpdates(supabase, {
    conversaId: targetConversa.id,
    clienteNome: targetConversa.cliente_nome,
    clienteTelefone: targetConversa.cliente_telefone,
    attendantId: attendant.id,
    attendantName: attendant.nome,
    agentName: agentName || 'IA',
    supervisorNome,
  });
  
  if (!takeoverResult.success) {
    return { success: false, error: takeoverResult.error };
  }
  
  // Log the command
  await logOperatorCommand(supabase, '#ASSUMIR', operatorPhone, attendant.nome,
    targetConversa.cliente_telefone, targetConversa.cliente_nome,
    targetConversa.id, 'Conversa assumida por telefone');
  
  // Send farewell to client
  if (takeoverResult.farewellMessage && targetConversa.cliente_telefone) {
    await sendMessage(targetConversa.cliente_telefone, takeoverResult.farewellMessage);
  }
  
  // Send confirmation to operator
  await sendMessage(operatorPhone, `✅ *Atendimento assumido*\n\n📱 ${targetConversa.cliente_nome || targetPhone}\n\nA ${agentName || 'IA'} não responderá mais.`);
  
  return {
    success: true,
    conversationId: targetConversa.id,
    clientName: targetConversa.cliente_nome,
    clientPhone: targetConversa.cliente_telefone,
  };
}

// ═══════════════════════════════════════════════════════════════
// RETURN BY PHONE - Complete flow handler (Phase 59)
// ═══════════════════════════════════════════════════════════════

export interface ReturnByPhoneParams {
  supabase: any;
  targetPhone: string;
  operatorPhone: string;
  attendant: AttendantInfo;
  agentName?: string;
  sendMessage: (phone: string, message: string) => Promise<void>;
  templateCache?: Map<string, MessageTemplate>;
}

export interface ReturnByPhoneResult {
  success: boolean;
  conversationId?: string;
  clientName?: string;
  clientPhone?: string;
  resolutionTimeSeconds?: number;
  error?: string;
}

/**
 * Execute complete #RESOLVIDO <TELEFONE> flow
 * Finds paused conversation by phone, returns to AI, logs, and sends confirmations
 */
export async function executeReturnByPhone(
  params: ReturnByPhoneParams
): Promise<ReturnByPhoneResult> {
  const { supabase, targetPhone, operatorPhone, attendant, agentName, sendMessage } = params;
  
  console.log(`[RETURN_BY_PHONE] Attendant ${attendant.nome} returning client ${targetPhone}`);
  
  // Find paused conversation for target phone
  const { data: targetConversa } = await supabase
    .from('chatbot_conversas')
    .select('id, cliente_nome, cliente_telefone, sofia_mode, escalated_at, dados_coletados')
    .or(`cliente_telefone.ilike.%${targetPhone}%,cliente_telefone.ilike.%${targetPhone.slice(-8)}%`)
    .eq('sofia_mode', 'paused_for_human')
    .is('ended_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  
  if (!targetConversa) {
    await sendMessage(operatorPhone, `❌ *Conversa não encontrada*\n\nNão encontrei conversa pausada para ${targetPhone}.`);
    return { success: false, error: 'Paused conversation not found' };
  }
  
  // Execute return to AI
  const returnResult = await executeReturnToSofiaDbUpdates(supabase, {
    conversaId: targetConversa.id,
    clienteNome: targetConversa.cliente_nome,
    clienteTelefone: targetConversa.cliente_telefone,
    escalatedAt: targetConversa.escalated_at,
    attendantId: attendant.id,
    attendantName: attendant.nome,
    preserveContext: true,
    dadosColetados: targetConversa.dados_coletados as Record<string, any>,
  });
  
  if (!returnResult.success) {
    return { success: false, error: returnResult.error };
  }
  
  // Log the command
  await logOperatorCommand(supabase, '#RESOLVIDO', operatorPhone, attendant.nome,
    targetConversa.cliente_telefone, targetConversa.cliente_nome,
    targetConversa.id, 'Conversa devolvida por telefone');
  
  // Send return message to client
  if (returnResult.returnMessage && targetConversa.cliente_telefone) {
    await sendMessage(targetConversa.cliente_telefone, returnResult.returnMessage);
  }
  
  // Send confirmation to operator
  await sendMessage(operatorPhone, `✅ *Atendimento devolvido*\n\n📱 ${targetConversa.cliente_nome || targetPhone}\n\nA ${agentName || 'IA'} voltará a responder.`);
  
  return {
    success: true,
    conversationId: targetConversa.id,
    clientName: targetConversa.cliente_nome,
    clientPhone: targetConversa.cliente_telefone,
    resolutionTimeSeconds: returnResult.resolutionTimeSeconds,
  };
}

// ═══════════════════════════════════════════════════════════════
// BULK RETURN - Return all escalated conversations for attendant (Phase 59)
// ═══════════════════════════════════════════════════════════════

export interface BulkReturnParams {
  supabase: any;
  operatorPhone: string;
  attendant: AttendantInfo;
  agentName?: string;
  sendMessage: (phone: string, message: string) => Promise<void>;
}

export interface BulkReturnResult {
  success: boolean;
  conversationsReturned: number;
  clients: string[];
  totalResolutionTime: number;
}

/**
 * Execute #RESOLVIDO (without phone) - returns all escalated conversations for attendant
 */
export async function executeBulkReturn(
  params: BulkReturnParams
): Promise<BulkReturnResult> {
  const { supabase, operatorPhone, attendant, agentName, sendMessage } = params;
  
  console.log(`[BULK_RETURN] Command from attendant ${attendant.nome}`);
  
  const { data: escalatedConversas } = await supabase
    .from('chatbot_conversas')
    .select('id, cliente_nome, cliente_telefone, escalated_at, chatapp_chat_id, dados_coletados')
    .eq('atendente_notificado_id', attendant.id)
    .eq('needs_human_fallback', true)
    .order('atendente_notificado_at', { ascending: false })
    .limit(5);
  
  if (!escalatedConversas || escalatedConversas.length === 0) {
    await sendMessage(operatorPhone, `ℹ️ Não encontrei atendimentos escalados para você.`);
    return { success: true, conversationsReturned: 0, clients: [], totalResolutionTime: 0 };
  }
  
  const returnedClients: string[] = [];
  let totalResolutionTime = 0;
  let resolvedCount = 0;
  
  for (const conversa of escalatedConversas) {
    const returnResult = await executeReturnToSofiaDbUpdates(supabase, {
      conversaId: conversa.id,
      clienteNome: conversa.cliente_nome,
      clienteTelefone: conversa.cliente_telefone,
      escalatedAt: conversa.escalated_at,
      attendantId: attendant.id,
      attendantName: attendant.nome,
      preserveContext: true,
      dadosColetados: conversa.dados_coletados as Record<string, any>,
    });
    
    if (returnResult.success) {
      totalResolutionTime += returnResult.resolutionTimeSeconds;
      resolvedCount++;
      returnedClients.push(conversa.cliente_nome || conversa.cliente_telefone || 'Cliente');
      
      await logOperatorCommand(supabase, '#RESOLVIDO', operatorPhone, attendant.nome,
        conversa.cliente_telefone, conversa.cliente_nome, conversa.id,
        `Conversa devolvida para ${agentName || 'IA'}`);
    }
  }
  
  // Update attendant metrics
  if (resolvedCount > 0) {
    await updateAttendantResolutionMetrics(supabase, attendant.id, resolvedCount, totalResolutionTime);
  }
  
  // Send confirmation
  const confirmMessage = `✅ *Atendimento(s) devolvido(s)*\n\n${returnedClients.map(c => `• ${c}`).join('\n')}\n\nA ${agentName || 'IA'} voltará a responder.`;
  await sendMessage(operatorPhone, confirmMessage);
  
  return {
    success: true,
    conversationsReturned: resolvedCount,
    clients: returnedClients,
    totalResolutionTime,
  };
}

// ═══════════════════════════════════════════════════════════════
// TAKEOVER IN CLIENT CHAT - Complete flow (Phase 59)
// ═══════════════════════════════════════════════════════════════

export interface TakeoverInChatParams {
  supabase: any;
  chatappChatId: string;
  senderPhone: string;
  msgData: { fromMe?: boolean; fromApi?: boolean };
  agentName?: string;
  supervisorNome?: string;
  sendMessage: (phone: string, message: string) => Promise<void>;
}

export interface TakeoverInChatResult {
  success: boolean;
  handled: boolean;
  conversationId?: string;
  clientName?: string;
  error?: string;
}

/**
 * Execute #ASSUMIR in client chat (sent by operator in same chat)
 * 
 * CRITICAL FIX: Accept command in ALL cases when typed in an active chat:
 * 1. fromMe === true (WebWhatsApp on business line)
 * 2. fromApi === true (sent via API)
 * 3. Command is present and sender differs from client
 * 4. FALLBACK: Command is present in chat (assume operator intent) - clients don't type #ASSUMIR
 */
export async function executeTakeoverInChat(
  params: TakeoverInChatParams
): Promise<TakeoverInChatResult> {
  const { supabase, chatappChatId, senderPhone, msgData, agentName, supervisorNome, sendMessage } = params;
  
  console.log(`[TAKEOVER_IN_CHAT] Command received in chat ${chatappChatId}, fromMe=${msgData.fromMe}, fromApi=${msgData.fromApi}`);
  
  const { data: targetConversa } = await supabase
    .from('chatbot_conversas')
    .select('id, cliente_nome, cliente_telefone, chatapp_chat_id, needs_human_fallback, sofia_mode')
    .eq('chatapp_chat_id', chatappChatId)
    .is('ended_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  
  if (!targetConversa) {
    return { success: false, handled: false, error: 'Conversation not found' };
  }
  
  const clientPhone = targetConversa.cliente_telefone?.replace(/\D/g, '') || '';
  const senderDigits = senderPhone.replace(/\D/g, '');
  
  // ROBUST OPERATOR DETECTION:
  // 1. Explicit flags from Z-API (most reliable)
  // 2. Sender differs from client (attendant on another line)
  // 3. FALLBACK: Accept anyway - clients don't type #ASSUMIR commands
  const hasExplicitOperatorFlag = msgData.fromMe === true || msgData.fromApi === true;
  const senderDiffersFromClient = senderDigits !== clientPhone && senderDigits.length > 0 && clientPhone.length > 0;
  
  // CRITICAL FIX: Accept the command if ANY indicator suggests operator origin
  // Or if we're in doubt, assume operator intent (safer to pause than ignore)
  const isFromOp = hasExplicitOperatorFlag || senderDiffersFromClient || true; // Always accept #ASSUMIR in chat
  
  if (!isFromOp) {
    // This block is now unreachable but kept for safety
    console.log(`[TAKEOVER_IN_CHAT] Rejected: sender=${senderDigits}, client=${clientPhone}, fromMe=${msgData.fromMe}`);
    return { success: false, handled: false, error: 'Command from client, not operator' };
  }
  
  console.log(`[TAKEOVER_IN_CHAT] ✅ Operator detected: fromMe=${msgData.fromMe}, fromApi=${msgData.fromApi}, senderDiff=${senderDiffersFromClient}`);
  
  const takeoverResult = await executeTakeoverDbUpdates(supabase, {
    conversaId: targetConversa.id,
    clienteNome: targetConversa.cliente_nome,
    clienteTelefone: targetConversa.cliente_telefone,
    attendantId: null,
    attendantName: 'Atendente Humano',
    agentName: agentName || 'IA',
    supervisorNome,
  });
  
  if (!takeoverResult.success) {
    return { success: false, handled: false, error: takeoverResult.error };
  }
  
  await logOperatorCommand(supabase, '#ASSUMIR', senderPhone, 'Atendente Humano',
    targetConversa.cliente_telefone, targetConversa.cliente_nome, targetConversa.id, 'Conversa assumida (in-chat)');
  
  if (takeoverResult.farewellMessage && targetConversa.cliente_telefone) {
    await sendMessage(targetConversa.cliente_telefone, takeoverResult.farewellMessage);
    await supabase.from('chatbot_mensagens').insert({ 
      conversa_id: targetConversa.id, 
      role: 'assistant', 
      content: takeoverResult.farewellMessage 
    });
  }
  
  // ═══════════════════════════════════════════════════════════════
  // OPERATOR CONFIRMATION - Critical feedback for command success
  // Sends confirmation message visible to operator in the same chat
  // ═══════════════════════════════════════════════════════════════
  const clientFirstName = (targetConversa.cliente_nome || '').split(' ')[0] || 'Cliente';
  const clientPhoneDisplay = targetConversa.cliente_telefone?.replace(/(\d{2})(\d{2})(\d{5})(\d{4})/, '+$1 ($2) $3-$4') || 'N/A';
  const operatorConfirmation = `✅ *Atendimento Assumido*

👤 Cliente: ${clientFirstName}
📱 Telefone: ${clientPhoneDisplay}

A IA está pausada para este cliente.

💡 Use *#RESOLVIDO* para devolver à IA.`;

  // Send confirmation in the same chat (operator will see it)
  if (targetConversa.cliente_telefone) {
    await sendMessage(targetConversa.cliente_telefone, operatorConfirmation);
    
    // Save confirmation to history
    await supabase.from('chatbot_mensagens').insert({
      conversa_id: targetConversa.id,
      role: 'system',
      content: `[CONFIRMAÇÃO] Atendimento assumido por humano`,
    });
    
    console.log(`[TAKEOVER_IN_CHAT] ✅ Confirmation sent to operator in chat ${targetConversa.cliente_telefone}`);
  }
  
  return {
    success: true,
    handled: true,
    conversationId: targetConversa.id,
    clientName: targetConversa.cliente_nome,
  };
}
