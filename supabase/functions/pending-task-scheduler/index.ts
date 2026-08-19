import { createClient } from 'npm:@supabase/supabase-js@2.90.0';
import { calculateDelay, wait, getAppropriateConfig, type RateLimitConfig } from '../_shared/rate-limiter.ts';
import { getStrictCorsHeaders, handleCorsPrelight, errorResponse } from '../_shared/security-helpers.ts';
import {
  loadProposalRequirements,
  getMissingRequirements,
  type RequirementDefinition,
} from '../_shared/proposal-requirements.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// ═══════════════════════════════════════════════════════════════
// QUIET HOURS - Período de silêncio para FUPs (20:00 às 07:00)
// ═══════════════════════════════════════════════════════════════

interface QuietHoursConfig {
  quiet_hours_enabled: string;
  quiet_hours_start: string;
  quiet_hours_end: string;
  quiet_hours_timezone: string;
}

function isQuietHours(config: Partial<QuietHoursConfig>): boolean {
  if (config.quiet_hours_enabled !== 'true') return false;
  
  const startHour = parseInt(config.quiet_hours_start?.split(':')[0] || '20');
  const startMin = parseInt(config.quiet_hours_start?.split(':')[1] || '0');
  const endHour = parseInt(config.quiet_hours_end?.split(':')[0] || '7');
  const endMin = parseInt(config.quiet_hours_end?.split(':')[1] || '0');
  
  const now = new Date();
  const brasiliaOffset = -3 * 60;
  const utcOffset = now.getTimezoneOffset();
  const brasiliaTime = new Date(now.getTime() + (utcOffset + brasiliaOffset) * 60 * 1000);
  const currentHour = brasiliaTime.getHours();
  const currentMin = brasiliaTime.getMinutes();
  const currentTotalMinutes = currentHour * 60 + currentMin;
  
  const startTotalMinutes = startHour * 60 + startMin;
  const endTotalMinutes = endHour * 60 + endMin;
  
  if (startTotalMinutes > endTotalMinutes) {
    return currentTotalMinutes >= startTotalMinutes || currentTotalMinutes < endTotalMinutes;
  }
  
  return currentTotalMinutes >= startTotalMinutes && currentTotalMinutes < endTotalMinutes;
}

function getNextAvailableTime(config: Partial<QuietHoursConfig>): Date {
  const endHour = parseInt(config.quiet_hours_end?.split(':')[0] || '7');
  const endMin = parseInt(config.quiet_hours_end?.split(':')[1] || '0');
  
  const now = new Date();
  const brasiliaOffset = -3 * 60;
  const utcOffset = now.getTimezoneOffset();
  const brasiliaTime = new Date(now.getTime() + (utcOffset + brasiliaOffset) * 60 * 1000);
  
  brasiliaTime.setHours(endHour, endMin + 1, 0, 0);
  
  const currentHour = new Date(now.getTime() + (utcOffset + brasiliaOffset) * 60 * 1000).getHours();
  const startHour = parseInt(config.quiet_hours_start?.split(':')[0] || '20');
  
  if (currentHour >= startHour) {
    brasiliaTime.setDate(brasiliaTime.getDate() + 1);
  }
  
  const nextTimeUTC = new Date(brasiliaTime.getTime() - (utcOffset + brasiliaOffset) * 60 * 1000);
  console.log(`[quiet-hours] Next available time: ${nextTimeUTC.toISOString()}`);
  
  return nextTimeUTC;
}

// ═══════════════════════════════════════════════════════════════
// PENDING TASK SCHEDULER - AUTO-RESGATE DE LEADS TRAVADOS
// ═══════════════════════════════════════════════════════════════
// Este scheduler roda a cada 3 minutos e:
// 1. Busca conversas com pending_task não nulo e timeout expirado
// 2. Executa as ações pendentes (mover lead, perguntar dados faltantes)
// 3. Escala para humano se falhar repetidamente
// ═══════════════════════════════════════════════════════════════

interface PendingTaskConversation {
  id: string;
  cliente_telefone: string;
  cliente_nome: string | null;
  pending_task: string;
  pending_task_created_at: string;
  pending_task_retries: number;
  dados_coletados: Record<string, unknown> | null;
  arquivos_anexados: string[] | null;
  bitrix24_lead_id: string | null;
  bitrix24_stage: string | null;
  proposta_id: string | null;
}

// ═══════════════════════════════════════════════════════════════
// ZERO HARDCODE: Timeouts and retries loaded from database
// ═══════════════════════════════════════════════════════════════

// Fallback values (will be overwritten by dynamic config)
const DEFAULT_TASK_TIMEOUTS: Record<string, number> = {
  'proposta_inicial': 2,
  'gerar_proposta_definitiva': 3,
  'enviar_proposta': 3,
  'confirmar_tipo_instalacao': 10,
  'aguardando_tipo_instalacao': 10,
  'mover_para_definitiva': 3,
  'sincronizar_bitrix': 3,
  'default': 5,
};

let TASK_TIMEOUTS = { ...DEFAULT_TASK_TIMEOUTS };
let MAX_RETRIES = 3;

/**
 * Load pending task config from database
 */
async function loadPendingTaskConfig(supabase: any): Promise<void> {
  try {
    const { data } = await supabase
      .from('configuracoes_sistema')
      .select('chave, valor')
      .in('chave', ['pending_task_timeouts', 'pending_task_max_retries']);
    
    if (data && data.length > 0) {
      const configMap = new Map<string, string>(data.map((r: any) => [r.chave, r.valor]));
      
      // Parse timeouts JSON
      const timeoutsStr = configMap.get('pending_task_timeouts');
      if (timeoutsStr) {
        try {
          TASK_TIMEOUTS = { ...DEFAULT_TASK_TIMEOUTS, ...JSON.parse(timeoutsStr) };
          console.log('[pending-task-scheduler] Loaded task timeouts from DB');
        } catch (e) {
          console.warn('[pending-task-scheduler] Error parsing task timeouts:', e);
        }
      }
      
      MAX_RETRIES = parseInt(configMap.get('pending_task_max_retries') || '3');
      console.log(`[pending-task-scheduler] Config: maxRetries=${MAX_RETRIES}`);
    }
  } catch (err) {
    console.warn('[pending-task-scheduler] Error loading config, using defaults:', err);
  }
}

async function sendWhatsAppMessage(phone: string, message: string, config: Record<string, string>): Promise<boolean> {
  try {
    const zapiInstanceId = config.zapi_instance_id || Deno.env.get('ZAPI_INSTANCE_ID');
    const zapiToken = config.zapi_token || Deno.env.get('ZAPI_TOKEN');
    
    if (!zapiInstanceId || !zapiToken) {
      console.log('[pending-task-scheduler] Z-API not configured');
      return false;
    }

    const cleanPhone = phone.replace(/\D/g, '');
    const formattedPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
    
    const response = await fetch(
      `https://api.z-api.io/instances/${zapiInstanceId}/token/${zapiToken}/send-text`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: formattedPhone,
          message: message,
        }),
      }
    );

    const result = await response.json();
    console.log(`[pending-task-scheduler] Z-API response:`, result);
    return response.ok;
  } catch (error) {
    console.error('[pending-task-scheduler] Error sending WhatsApp message:', error);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// UNIFIED REQUIREMENTS - Uses proposal-requirements.ts module
// Removed duplicate parsing logic - now centralized
// ═══════════════════════════════════════════════════════════════

// Cache for loaded requirements
let cachedRequirements: { fields: string[]; files: string[] } | null = null;

async function loadDynamicRequirementsUnified(supabase: any): Promise<{ fields: string[]; files: string[] }> {
  if (cachedRequirements) return cachedRequirements;
  
  try {
    const config = await loadProposalRequirements(supabase);
    cachedRequirements = {
      fields: config.proposta_definitiva.fields.map(f => f.id),
      files: config.proposta_definitiva.files.map(f => f.id),
    };
    console.log(`[pending-task-scheduler] Loaded unified requirements: ${cachedRequirements.fields.length} fields, ${cachedRequirements.files.length} files`);
    return cachedRequirements;
  } catch (e) {
    console.error('[pending-task-scheduler] Failed to load unified requirements:', e);
    return { fields: ['tipoInstalacao', 'cpfCnpj', 'endereco'], files: ['documento_identidade', 'fatura'] };
  }
}

async function getMissingDataForDefinitivaUnified(
  supabase: any,
  dados: Record<string, unknown> | null,
  arquivos: string[] | null
): Promise<string[]> {
  const requirements = await loadDynamicRequirementsUnified(supabase);
  const missing: string[] = [];
  const data = dados || {};
  const files = arquivos || [];
  
  // Check required fields using alternatives logic
  for (const field of requirements.fields) {
    if (field === 'tipoInstalacao' && !data.tipoInstalacao && !data.tipo_instalacao) {
      missing.push('tipoInstalacao');
    } else if ((field === 'cpfCnpj' || field === 'cpf_cnpj') && !data.cpf && !data.cnpj && !data.cpfCnpj) {
      missing.push('cpf_cnpj');
    } else if (field === 'endereco' && !data.endereco && !data.cep && !data.endereco_completo) {
      missing.push('endereco');
    } else if (field === 'nome' && !data.nome && !data.nome_completo) {
      missing.push('nome');
    } else if (field === 'email' && !data.email) {
      missing.push('email');
    }
  }
  
  // Check required files
  for (const fileType of requirements.files) {
    // Skip contrato_social for PF (only required for PJ)
    if (fileType === 'contrato_social') {
      const isPJ = !!data.cnpj;
      if (isPJ && !files.includes(fileType)) {
        missing.push('contrato_social');
      }
    } else if (!files.includes(fileType)) {
      missing.push(fileType);
    }
  }
  
  return missing;
}

// Legacy wrapper for backward compatibility (sync version still available)
function getMissingDataForDefinitiva(dados: Record<string, unknown> | null, arquivos: string[] | null): string[] {
  const missing: string[] = [];
  const data = dados || {};
  const files = arquivos || [];
  const defaultFields = ['tipoInstalacao', 'cpfCnpj', 'endereco'];
  const defaultFiles = ['documento_identidade', 'fatura'];
  
  for (const field of cachedRequirements?.fields || defaultFields) {
    if (field === 'tipoInstalacao' && !data.tipoInstalacao) missing.push('tipoInstalacao');
    else if ((field === 'cpfCnpj' || field === 'cpf_cnpj') && !data.cpf && !data.cnpj) missing.push('cpf_cnpj');
    else if (field === 'endereco' && !data.endereco && !data.cep) missing.push('endereco');
    else if (field === 'nome' && !data.nome) missing.push('nome');
    else if (field === 'email' && !data.email) missing.push('email');
  }
  
  for (const fileType of cachedRequirements?.files || defaultFiles) {
    if (fileType === 'contrato_social') {
      if (!!data.cnpj && !files.includes(fileType)) missing.push('contrato_social');
    } else if (!files.includes(fileType)) {
      missing.push(fileType);
    }
  }
  
  return missing;
}

function buildMissingDataMessage(missing: string[], clienteNome: string | null): string {
  const firstName = clienteNome?.split(' ')[0] || '';
  const greeting = firstName ? `${firstName}, ` : '';
  
  // Se falta tipoInstalacao, perguntar diretamente
  if (missing.includes('tipoInstalacao')) {
    return `${greeting}pra eu finalizar sua proposta, preciso saber: sua instalação é Monofásica, Bifásica ou Trifásica? (como aparece na sua conta de luz) ⚡`;
  }
  
  // Se falta CPF/CNPJ
  if (missing.includes('cpf_cnpj')) {
    return `${greeting}só falta seu CPF ou CNPJ pra eu gerar a proposta definitiva. Pode me enviar?`;
  }
  
  // Se falta endereço
  if (missing.includes('endereco')) {
    return `${greeting}preciso do seu endereço completo pra finalizar. Pode me passar?`;
  }
  
  // Se falta documento de identidade — LGPD: redirecionar para link seguro
  if (missing.includes('documento_identidade')) {
    return `${greeting}pra finalizar sua proposta, seus documentos devem ser enviados com segurança pela plataforma! 🔒\n\nAssim que sua proposta estiver pronta, você receberá um link exclusivo para anexar os documentos. Aguarde! 💚`;
  }
  
  // Se falta fatura — LGPD: redirecionar para link seguro
  if (missing.includes('fatura')) {
    return `${greeting}ainda preciso da sua fatura de luz. Por segurança, ela deve ser enviada pela plataforma! 🔒\n\nVocê receberá um link seguro para anexar. Aguarde! ⚡`;
  }
  
  // Se falta contrato social — LGPD: redirecionar para link seguro
  if (missing.includes('contrato_social')) {
    return `${greeting}por ser empresa, preciso do contrato social. Por segurança, envie pela plataforma! 🔒\n\nVocê receberá um link seguro para anexar os documentos. 📋`;
  }
  
  return `${greeting}estou verificando sua proposta. Me avisa se precisar de algo!`;
}

// deno-lint-ignore no-explicit-any
async function handlePendingTask(
  supabase: any,
  conversa: PendingTaskConversation,
  config: Record<string, string>
): Promise<{ action: string; success: boolean; error?: string }> {
  
  const { id, pending_task, dados_coletados, arquivos_anexados, cliente_telefone, cliente_nome, bitrix24_lead_id, pending_task_retries } = conversa;
  
  console.log(`[pending-task-scheduler] Processing task "${pending_task}" for conversa ${id}`);
  
  try {
    switch (pending_task) {
      case 'gerar_proposta_definitiva':
      case 'enviar_proposta':
      case 'mover_para_definitiva': {
        // Check if we have all required data
        const missing = getMissingDataForDefinitiva(dados_coletados, arquivos_anexados);
        
        if (missing.length > 0) {
          console.log(`[pending-task-scheduler] Missing data for definitiva: ${missing.join(', ')}`);
          
          // Send message asking for missing data
          const message = buildMissingDataMessage(missing, cliente_nome);
          await sendWhatsAppMessage(cliente_telefone, message, config);
          
          // Update pending task to wait for response
          const newTask = missing.includes('tipoInstalacao') ? 'aguardando_tipo_instalacao' : 'aguardando_dados_faltantes';
          
          await supabase
            .from('chatbot_conversas')
            .update({
              pending_task: newTask,
              pending_task_created_at: new Date().toISOString(),
              pending_task_retries: (pending_task_retries || 0) + 1,
              last_sofia_message_at: new Date().toISOString(),
            })
            .eq('id', id);
          
          // Log to chatbot_mensagens
          await supabase
            .from('chatbot_mensagens')
            .insert({
              conversa_id: id,
              role: 'assistant',
              content: message,
            });
          
          return { action: 'asked_for_missing_data', success: true };
        }
        
        // All data present - try to move lead to Proposta Definitiva
        if (bitrix24_lead_id && config.bitrix24_enabled === 'true') {
          console.log(`[pending-task-scheduler] Moving lead ${bitrix24_lead_id} to Proposta Definitiva`);
          
          // Call sofia-bitrix-lead to do the move
          const syncResponse = await supabase.functions.invoke('sofia-bitrix-lead', {
            body: {
              conversaId: id,
              phone: cliente_telefone,
              clienteNome: cliente_nome,
              dadosColetados: dados_coletados,
              forcarMovimentacao: true,
            },
          });
          
          if (syncResponse.error) {
            throw new Error(`sofia-bitrix-lead error: ${syncResponse.error.message}`);
          }
          
          // Clear pending task
          await supabase
            .from('chatbot_conversas')
            .update({
              pending_task: null,
              pending_task_created_at: null,
              pending_task_retries: 0,
            })
            .eq('id', id);
          
          // WhatsApp confirmation removed — Bitrix24 automations handle notifications
          
          return { action: 'moved_to_definitiva', success: true };
        }
        
        return { action: 'no_bitrix_lead', success: false, error: 'No Bitrix24 lead ID' };
      }
      
      case 'aguardando_tipo_instalacao':
      case 'confirmar_tipo_instalacao': {
        // Check if we exceeded retries
        if ((pending_task_retries || 0) >= MAX_RETRIES) {
          console.log(`[pending-task-scheduler] Max retries exceeded for tipoInstalacao`);
          
          // Escalate to admin
          await supabase
            .from('admin_notifications')
            .insert({
              title: 'Lead travado aguardando tipo de instalação',
              message: `O lead ${cliente_nome || cliente_telefone} não respondeu sobre o tipo de instalação após ${MAX_RETRIES} tentativas. Intervenção humana necessária.`,
              type: 'warning',
              entity_type: 'chatbot_conversa',
              entity_id: id,
            });
          
          // Clear pending task and mark for human
          await supabase
            .from('chatbot_conversas')
            .update({
              pending_task: null,
              pending_task_created_at: null,
              needs_human_fallback: true,
              escalation_reason: 'Não respondeu tipo de instalação após múltiplas tentativas',
              escalated_at: new Date().toISOString(),
            })
            .eq('id', id);
          
          return { action: 'escalated_to_admin', success: true };
        }
        
        // Retry asking for tipoInstalacao
        const message = (pending_task_retries || 0) === 0
          ? `Olá! Preciso só de uma informação: sua instalação é Monofásica, Bifásica ou Trifásica? Pode responder com 1, 2 ou 3! ⚡`
          : `Ei, ainda preciso saber: sua instalação é Mono (1), Bi (2) ou Trifásica (3)? É rapidinho! 😊`;
        
        await sendWhatsAppMessage(cliente_telefone, message, config);
        
        await supabase
          .from('chatbot_conversas')
          .update({
            pending_task_retries: (pending_task_retries || 0) + 1,
            last_sofia_message_at: new Date().toISOString(),
          })
          .eq('id', id);
        
        await supabase
          .from('chatbot_mensagens')
          .insert({
            conversa_id: id,
            role: 'assistant',
            content: message,
          });
        
        return { action: 'retried_tipoInstalacao', success: true };
      }
      
      case 'aguardando_dados_faltantes': {
        // Similar logic - check if exceeded retries
        if ((pending_task_retries || 0) >= MAX_RETRIES) {
          await supabase
            .from('admin_notifications')
            .insert({
              title: 'Lead travado aguardando dados',
              message: `O lead ${cliente_nome || cliente_telefone} não enviou os dados solicitados após ${MAX_RETRIES} tentativas.`,
              type: 'warning',
              entity_type: 'chatbot_conversa',
              entity_id: id,
            });
          
          await supabase
            .from('chatbot_conversas')
            .update({
              pending_task: null,
              needs_human_fallback: true,
              escalation_reason: 'Não enviou dados faltantes após múltiplas tentativas',
              escalated_at: new Date().toISOString(),
            })
            .eq('id', id);
          
          return { action: 'escalated_to_admin', success: true };
        }
        
        const missing = getMissingDataForDefinitiva(dados_coletados, arquivos_anexados);
        const message = buildMissingDataMessage(missing, cliente_nome);
        
        await sendWhatsAppMessage(cliente_telefone, message, config);
        
        await supabase
          .from('chatbot_conversas')
          .update({
            pending_task_retries: (pending_task_retries || 0) + 1,
            last_sofia_message_at: new Date().toISOString(),
          })
          .eq('id', id);
        
        await supabase
          .from('chatbot_mensagens')
          .insert({
            conversa_id: id,
            role: 'assistant',
            content: message,
          });
        
        return { action: 'retried_missing_data', success: true };
      }
      
      case 'proposta_inicial': {
        // ═══════════════════════════════════════════════════════════════
        // MOVER LEAD PARA PROPOSTA INICIAL
        // Este case é um backup - o sofia-webhook tenta mover imediatamente
        // O scheduler só age se a movimentação imediata falhou
        // ═══════════════════════════════════════════════════════════════
        console.log(`[pending-task-scheduler] Processing proposta_inicial for conversa ${id}`);
        
        // Check if we have minimum data
        const hasNome = !!dados_coletados?.nome;
        const hasEmail = !!dados_coletados?.email;
        const hasValor = !!dados_coletados?.valorFatura || !!dados_coletados?.consumo;
        const hasDistribuidora = !!dados_coletados?.distribuidora;
        
        console.log(`[pending-task-scheduler] Data check: nome=${hasNome}, email=${hasEmail}, valor=${hasValor}, distribuidora=${hasDistribuidora}`);
        
        if (!hasNome || !hasEmail || !hasValor || !hasDistribuidora) {
          console.log(`[pending-task-scheduler] Missing data for proposta_inicial, cannot move lead`);
          
          // Check if exceeded retries
          if ((pending_task_retries || 0) >= MAX_RETRIES) {
            // Escalate to admin
            await supabase.from('admin_notifications').insert({
              title: 'Lead travado - dados incompletos para proposta inicial',
              message: `O lead ${cliente_nome || cliente_telefone} não tem todos os dados necessários para proposta inicial após ${MAX_RETRIES} tentativas. Faltam: ${!hasNome ? 'Nome, ' : ''}${!hasEmail ? 'Email, ' : ''}${!hasValor ? 'Valor, ' : ''}${!hasDistribuidora ? 'Distribuidora' : ''}`,
              type: 'warning',
              entity_type: 'chatbot_conversa',
              entity_id: id,
            });
            
            await supabase
              .from('chatbot_conversas')
              .update({ 
                pending_task: null, 
                pending_task_created_at: null,
                needs_human_fallback: true,
                escalation_reason: 'Dados incompletos para proposta inicial após múltiplas tentativas',
                escalated_at: new Date().toISOString(),
              })
              .eq('id', id);
            
            return { action: 'escalated_missing_data', success: true };
          }
          
          // Increment retries and wait
          await supabase
            .from('chatbot_conversas')
            .update({ pending_task_retries: (pending_task_retries || 0) + 1 })
            .eq('id', id);
          
          return { action: 'waiting_for_data', success: false };
        }
        
        // All data present - try to move lead to Proposta Inicial
        if (bitrix24_lead_id && config.bitrix24_enabled === 'true') {
          console.log(`[pending-task-scheduler] Moving lead ${bitrix24_lead_id} to Proposta Inicial`);
          
          // Call sofia-bitrix-lead to do the move
          const syncResponse = await supabase.functions.invoke('sofia-bitrix-lead', {
            body: {
              conversaId: id,
              phone: cliente_telefone,
              clienteNome: cliente_nome,
              dadosColetados: dados_coletados,
              forcarMovimentacao: true, // FORÇA A MOVIMENTAÇÃO
            },
          });
          
          if (syncResponse.error) {
            console.error('[pending-task-scheduler] Error moving to Proposta Inicial:', syncResponse.error);
            
            // Increment retries
            await supabase
              .from('chatbot_conversas')
              .update({ pending_task_retries: (pending_task_retries || 0) + 1 })
              .eq('id', id);
            
            return { action: 'move_failed', success: false, error: syncResponse.error.message };
          }
          
          console.log(`[pending-task-scheduler] ✅ Lead moved to Proposta Inicial successfully`);
          
          // Clear pending task after success
          await supabase
            .from('chatbot_conversas')
            .update({
              pending_task: null,
              pending_task_created_at: null,
              pending_task_retries: 0,
            })
            .eq('id', id);
          
          return { action: 'moved_to_proposta_inicial', success: true };
        }
        
        // No Bitrix lead - just clear the task
        console.log(`[pending-task-scheduler] No Bitrix lead for conversa ${id}, clearing task`);
        await supabase
          .from('chatbot_conversas')
          .update({
            pending_task: null,
            pending_task_created_at: null,
          })
          .eq('id', id);
        
        return { action: 'no_bitrix_lead', success: true };
      }
      
      default: {
        console.log(`[pending-task-scheduler] Unknown pending task: ${pending_task}`);
        
        // Clear unknown tasks after timeout
        await supabase
          .from('chatbot_conversas')
          .update({
            pending_task: null,
            pending_task_created_at: null,
          })
          .eq('id', id);
        
        return { action: 'cleared_unknown_task', success: true };
      }
    }
  } catch (error) {
    console.error(`[pending-task-scheduler] Error processing task ${pending_task}:`, error);
    
    // Increment retries
    await supabase
      .from('chatbot_conversas')
      .update({
        pending_task_retries: (conversa.pending_task_retries || 0) + 1,
      })
      .eq('id', id);
    
    return { action: 'error', success: false, error: String(error) };
  }
}

Deno.serve(async (req) => {
  const corsHeaders = getStrictCorsHeaders(req);
  console.log('[pending-task-scheduler] Function called:', req.method);

  if (req.method === 'OPTIONS') {
    return handleCorsPrelight(req, { mode: 'strict' });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const now = new Date();
    
    // Load dynamic config from database (for timeouts/retries)
    await loadPendingTaskConfig(supabase);
    
    // Get configuration including dynamic automation settings
    const { data: configData } = await supabase
      .from('configuracoes_sistema')
      .select('chave, valor')
      .or('chave.like.zapi%,chave.eq.bitrix24_enabled,chave.eq.quiet_hours_enabled,chave.eq.quiet_hours_start,chave.eq.quiet_hours_end,chave.eq.quiet_hours_timezone,chave.like.automation_%');
    
    const config: Record<string, string> = {};
    // deno-lint-ignore no-explicit-any
    configData?.forEach((c: any) => {
      config[c.chave] = c.valor;
    });
    
    // Load dynamic requirements from unified module
    await loadDynamicRequirementsUnified(supabase);
    
    // ═══════════════════════════════════════════════════════════════
    // VERIFICAR QUIET HOURS
    // ═══════════════════════════════════════════════════════════════
    const quietConfig: Partial<QuietHoursConfig> = {
      quiet_hours_enabled: config.quiet_hours_enabled,
      quiet_hours_start: config.quiet_hours_start,
      quiet_hours_end: config.quiet_hours_end,
      quiet_hours_timezone: config.quiet_hours_timezone,
    };
    
    if (isQuietHours(quietConfig)) {
      console.log('[pending-task-scheduler] 🌙 QUIET HOURS ACTIVE - Suppressing all pending tasks');
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          quietHours: true,
          message: 'Pending tasks suppressed during quiet hours',
          nextAvailableTime: getNextAvailableTime(quietConfig).toISOString(),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Check if scheduler is enabled (default: enabled)
    if (config.pending_task_scheduler_enabled === 'false') {
      console.log('[pending-task-scheduler] Scheduler is disabled');
      return new Response(
        JSON.stringify({ success: true, message: 'Scheduler disabled' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Find conversations with expired pending tasks
    
    const { data: pendingConversas, error: fetchError } = await supabase
      .from('chatbot_conversas')
      .select(`
        id,
        cliente_telefone,
        cliente_nome,
        pending_task,
        pending_task_created_at,
        pending_task_retries,
        dados_coletados,
        arquivos_anexados,
        bitrix24_lead_id,
        bitrix24_stage,
        proposta_id
      `)
      .not('pending_task', 'is', null)
      .not('pending_task_created_at', 'is', null)
      .is('ended_at', null)
      .is('needs_human_fallback', null)
      // ═══════════════════════════════════════════════════════════════
      // FILTROS DE DESCARTE - Não processar leads descartados/finalizados
      // ═══════════════════════════════════════════════════════════════
      .not('sofia_mode', 'eq', 'descartado')
      .not('sofia_mode', 'eq', 'paused_for_human')
      .not('sofia_mode', 'eq', 'sac_redirect')
      .not('bitrix24_stage', 'eq', 'JUNK')
      .not('bitrix24_stage', 'eq', 'WON');
    
    if (fetchError) {
      throw new Error(`Error fetching pending conversas: ${fetchError.message}`);
    }
    
    console.log(`[pending-task-scheduler] Found ${pendingConversas?.length || 0} conversations with pending tasks`);
    
    const results: { conversaId: string; task: string; result: string }[] = [];
    
    // ═══════════════════════════════════════════════════════════════
    // RATE LIMITING - Evitar disparo em massa e bloqueio pela Meta
    // ═══════════════════════════════════════════════════════════════
    const totalTasks = pendingConversas?.length || 0;
    const rateLimitConfig = getAppropriateConfig(totalTasks, totalTasks > 15);
    console.log(`[pending-task-scheduler] 🚦 Rate limiting: ${totalTasks} tasks, base delay ${rateLimitConfig.baseDelayMs}ms`);
    
    let messageIndex = 0;
    for (const conversa of (pendingConversas || []) as PendingTaskConversation[]) {
      // Calculate if task has timed out
      const createdAt = new Date(conversa.pending_task_created_at);
      const timeoutMinutes = TASK_TIMEOUTS[conversa.pending_task] || TASK_TIMEOUTS.default;
      const timeoutMs = timeoutMinutes * 60 * 1000;
      const elapsed = now.getTime() - createdAt.getTime();
      
      if (elapsed < timeoutMs) {
        console.log(`[pending-task-scheduler] Task "${conversa.pending_task}" for ${conversa.id} not yet timed out (${Math.round(elapsed/1000)}s / ${timeoutMinutes*60}s)`);
        continue;
      }
      
      // ═══════════════════════════════════════════════════════════════
      // RATE LIMITING - Aplicar delay antes do processamento
      // ═══════════════════════════════════════════════════════════════
      const delay = calculateDelay(messageIndex, totalTasks, rateLimitConfig);
      if (delay > 0) {
        console.log(`[pending-task-scheduler] 🕐 Rate limit: waiting ${delay}ms before task ${messageIndex + 1}/${totalTasks}`);
        await wait(delay);
      }
      messageIndex++;
      
      console.log(`[pending-task-scheduler] Task "${conversa.pending_task}" for ${conversa.id} timed out, processing...`);
      
      const result = await handlePendingTask(supabase, conversa, config);
      
      results.push({
        conversaId: conversa.id,
        task: conversa.pending_task,
        result: result.action,
      });
      
      // Log metric
      await supabase.from('activity_logs').insert({
        action: 'pending_task_processed',
        entity_type: 'chatbot_conversa',
        entity_id: conversa.id,
        details: {
          task: conversa.pending_task,
          action: result.action,
          success: result.success,
          error: result.error,
          retries: conversa.pending_task_retries,
        },
      });
    }
    
    console.log(`[pending-task-scheduler] Processed ${results.length} tasks`);
    
    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('[pending-task-scheduler] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
