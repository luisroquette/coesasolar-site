import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { calculateDelay, wait, getAppropriateConfig, type RateLimitConfig } from '../_shared/rate-limiter.ts';
import { 
  checkAutomationEligibility, 
  logEligibility, 
  type AutomationContext 
} from '../_shared/automation-eligibility.ts';
import { loadSchedulerConfig, type SchedulerConfig } from '../_shared/scheduler-config.ts';
import {
  getStrictCorsHeaders,
  handleCorsPrelight,
} from '../_shared/security-helpers.ts';
import {
  isPhoneBlockedByTakeover,
  getBlockedPhones,
  normalizeTakeoverPhone,
} from '../_shared/human-takeover.ts';
import { runAntiSpamGuards } from '../_shared/anti-spam-guards.ts';

/**
 * stuck-leads-rescue-scheduler: Internal cron-triggered scheduler
 * SECURITY: Uses strict CORS (internal API)
 */

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

// ═══════════════════════════════════════════════════════════════════════════
// STUCK LEADS RESCUE SCHEDULER - SISTEMA DE RESGATE DE LEADS TRAVADOS
// ═══════════════════════════════════════════════════════════════════════════
// Este scheduler identifica e resgata leads travados com:
// - Tentativas de resgate configuráveis dinamicamente
// - Timing agressivo de 30 minutos para primeira abordagem
// - Gatilhos de urgência progressiva (custo de espera)
// ═══════════════════════════════════════════════════════════════════════════

interface StuckLeadConversation {
  id: string;
  cliente_telefone: string;
  cliente_nome: string | null;
  cliente_email: string | null;
  last_message_at: string | null;
  last_sofia_message_at: string | null;
  dados_coletados: Record<string, unknown> | null;
  arquivos_anexados: string[] | null;
  bitrix24_lead_id: string | null;
  bitrix24_stage: string | null;
  proposta_id: string | null;
  rescue_attempts: number | null;
  last_rescue_at: string | null;
  rescue_reason: string | null;
  next_rescue_at: string | null;
  awaiting_response: boolean | null;
  needs_human_fallback: boolean | null;
  sofia_mode: string | null;
  ended_at: string | null;
  created_at: string;
  agent_id: string;
  has_simulation: boolean | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// RESCUE SCHEDULE - Agora carregado dinamicamente via loadSchedulerConfig
// ═══════════════════════════════════════════════════════════════════════════

// Fallback usado até carregar config dinâmica
let RESCUE_SCHEDULE: Record<number, { delay_minutes: number; urgency: string }> = {
  1: { delay_minutes: 30, urgency: 'low' },
  2: { delay_minutes: 60, urgency: 'low' },
  3: { delay_minutes: 120, urgency: 'medium' },
  4: { delay_minutes: 240, urgency: 'medium' },
  5: { delay_minutes: 24 * 60, urgency: 'high' },
  6: { delay_minutes: 72 * 60, urgency: 'high' },
  7: { delay_minutes: 168 * 60, urgency: 'critical' },
};

let MAX_RESCUE_ATTEMPTS = 7;

// ═══════════════════════════════════════════════════════════════════════════
// TIPOS DE TRAVAMENTO
// ═══════════════════════════════════════════════════════════════════════════
type StuckReason = 
  | 'missing_tipo_instalacao'
  | 'missing_distribuidora'
  | 'missing_consumo'
  | 'missing_cep'
  | 'missing_email'
  | 'missing_documento_identidade'
  | 'missing_fatura'
  | 'missing_contrato_social'
  | 'inactivity'
  | 'unknown';

interface StuckAnalysis {
  isStuck: boolean;
  stuckReason: StuckReason;
  missingData: string[];
  missingDocs: string[];
  inactivityMinutes: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// MENSAGENS DE RESGATE COM GATILHOS DE URGÊNCIA PROGRESSIVA
// ═══════════════════════════════════════════════════════════════════════════

// Mensagens específicas por tipo de dado faltante
const MISSING_DATA_RESCUE_MESSAGES: Record<string, Record<string, string[]>> = {
  missing_tipo_instalacao: {
    low: [
      '{nome}, sua proposta está quase pronta! 🎯 Só falta saber: sua instalação é Monofásica, Bifásica ou Trifásica? (aparece na sua conta de luz)',
      'Oi {nome}! Pra finalizar seu desconto, preciso saber o tipo da sua instalação elétrica. Pode ser 1 (Mono), 2 (Bi) ou 3 (Tri)!',
    ],
    medium: [
      '{nome}, ainda não conseguimos gerar sua proposta porque falta o tipo de instalação. ⚡ É rapidinho: Mono, Bi ou Trifásica?',
      'Ei {nome}! Seu desconto está esperando - só preciso saber: Monofásica, Bifásica ou Trifásica? Pode responder só com o número!',
    ],
    high: [
      '⚠️ {nome}, sua economia está parada! Só falta o tipo de instalação pra você começar a pagar menos. Me conta: 1 (Mono), 2 (Bi) ou 3 (Tri)?',
      '{nome}, última chamada! Seu desconto exclusivo está esperando. Me diz: instalação Mono, Bi ou Trifásica? 🔥',
    ],
    critical: [
      '🚨 {nome}, sua proposta vai expirar! Se não souber o tipo, chuta Monofásica (a mais comum) e depois a gente ajusta. Topa?',
      '{nome}, estou preocupada porque você pode perder esse desconto. Me responde com qualquer coisa que eu te ajudo! 💚',
    ],
  },
  missing_distribuidora: {
    low: [
      '{nome}, pra calcular certinho sua economia, preciso saber: qual a distribuidora de energia da sua região? (Ex: CEMIG, Enel, CPFL...)',
      'Oi {nome}! Qual concessionária fornece sua energia? Preciso dessa info pra aplicar a tarifa correta no seu desconto!',
    ],
    medium: [
      '{nome}, sua proposta está travada porque não sei qual a distribuidora. Me passa esse dado que libero seu desconto!',
      'Ei {nome}! Qual empresa aparece na sua conta de luz? CEMIG, Enel, Light, CPFL...? É o último dado pra sua proposta! ⚡',
    ],
    high: [
      '⚠️ {nome}, sem a distribuidora não consigo calcular sua economia. Me conta qual aparece na conta de luz e te respondo em segundos!',
      '{nome}, você está a uma informação de garantir seu desconto! Qual a distribuidora: CEMIG, Enel, Light, outra?',
    ],
    critical: [
      '🚨 {nome}, já tentei várias vezes! Se você não souber, me manda uma foto da conta de luz que eu descubro. Pode ser? 📷',
      '{nome}, última tentativa! Me diz qualquer concessionária ou manda foto da conta. Quero te ajudar a economizar! 💚',
    ],
  },
  missing_consumo: {
    low: [
      '{nome}, quanto você paga de luz por mês, mais ou menos? Preciso desse valor pra simular sua economia! 💡',
      'Oi {nome}! Pra calcular seu desconto, preciso saber o valor médio da sua conta de energia.',
    ],
    medium: [
      '{nome}, sua simulação está parada porque não sei o valor da sua conta. Qual o valor médio mensal? Pode ser aproximado!',
      'Ei {nome}! Me conta: quanto vem na sua conta de luz? R$ 200? R$ 500? R$ 1.000? Qualquer estimativa serve!',
    ],
    high: [
      '⚠️ {nome}, só falta o valor da conta pra você ver quanto vai economizar! Me passa um valor médio?',
      '{nome}, sem o valor da conta não consigo mostrar sua economia. Me diz uma média que eu calculo na hora! 🔥',
    ],
    critical: [
      '🚨 {nome}, me manda uma foto da sua última conta que eu extraio tudo automaticamente! É mais fácil assim. 📷',
      '{nome}, última chance! Manda qualquer valor aproximado ou uma foto da conta. Quero te mostrar quanto você vai economizar! 💚',
    ],
  },
  missing_cep: {
    low: [
      '{nome}, qual o CEP da sua residência? Preciso pra verificar a disponibilidade na sua região! 📍',
      'Oi {nome}! Me passa o CEP que verifico se atendemos sua região.',
    ],
    medium: [
      '{nome}, sua proposta está travada porque preciso do CEP. Pode me passar? São só 8 números!',
      'Ei {nome}! Qual seu CEP? Preciso verificar a cobertura na sua área pra liberar a proposta!',
    ],
    high: [
      '⚠️ {nome}, sem o CEP não consigo verificar se atendemos sua região. Me passa que respondo em segundos!',
      '{nome}, o CEP é o último dado que falta! Pode ser o do endereço onde fica o medidor de luz.',
    ],
    critical: [
      '🚨 {nome}, me conta sua cidade e estado que eu busco o CEP pra você! Não quero que perca essa oportunidade.',
      '{nome}, me diz o bairro e cidade que eu encontro o CEP. Preciso te ajudar a economizar! 💚',
    ],
  },
  missing_email: {
    low: [
      '{nome}, qual seu melhor e-mail? Vou te enviar a proposta completa por lá! 📧',
      'Oi {nome}! Me passa seu e-mail que envio a proposta personalizada.',
    ],
    medium: [
      '{nome}, sua proposta está pronta mas preciso do e-mail pra enviar. Pode me passar?',
      'Ei {nome}! Só falta o e-mail pra você receber a proposta completa. Qual é?',
    ],
    high: [
      '⚠️ {nome}, sua proposta está esperando! Me passa o e-mail que envio agora mesmo.',
      '{nome}, está tudo pronto! Só preciso do e-mail pra finalizar. Pode ser qualquer um que você acesse! 📬',
    ],
    critical: [
      '🚨 {nome}, posso enviar a proposta por WhatsApp mesmo, se preferir. Só me confirma!',
      '{nome}, se não quiser passar e-mail, me avisa que a gente resolve de outra forma! 💚',
    ],
  },
};

// Mensagens para documentos faltantes — LGPD COMPLIANT
// NUNCA pedir envio de documentos pelo WhatsApp. Sempre redirecionar para o link seguro da proposta.
const MISSING_DOCS_RESCUE_MESSAGES: Record<string, Record<string, string[]>> = {
  missing_documento_identidade: {
    low: [
      '{nome}, pra avançar com o contrato, seus documentos devem ser enviados com segurança! 🔒\n\n📎 Acesse: {proposalUrl}\n\nClique em *"Solicitar Contrato"* e anexe seu RG ou CNH por lá. Seus dados ficam protegidos! 💚',
      'Oi {nome}! Pra finalizar, precisamos do seu documento de identidade. Por segurança, envie pelo link da proposta:\n\n📎 {proposalUrl}\n\nÉ rápido e seguro! 🔒',
    ],
    medium: [
      '{nome}, seu contrato está quase pronto! Só falta o documento de identidade.\n\n🔒 Envie com segurança: {proposalUrl}\n\nSeus dados ficam protegidos na plataforma!',
      'Ei {nome}! O documento é o único que falta. Por segurança, envie pelo link:\n\n📎 {proposalUrl}\n\nClique em *"Solicitar Contrato"*! 📋',
    ],
    high: [
      '⚠️ {nome}, seu desconto está esperando só o documento! Envie com segurança pelo link:\n\n📎 {proposalUrl}\n\nÉ rápido e seus dados ficam protegidos! 🔒',
      '{nome}, sem o documento não consigo gerar o contrato. Acesse o link seguro pra enviar:\n\n📎 {proposalUrl} 🔥',
    ],
    critical: [
      '🚨 {nome}, última chance de garantir seu desconto! Envie o documento pelo link seguro:\n\n📎 {proposalUrl}\n\nSeus dados ficam protegidos! 💚',
      '{nome}, não deixa escapar essa economia! Acesse {proposalUrl} e envie o documento com segurança. Me avisa depois! 💚',
    ],
  },
  missing_fatura: {
    low: [
      '{nome}, pra calcular tudo certinho, preciso da sua fatura de luz. Envie com segurança pelo link:\n\n📎 {proposalUrl}\n\nAssim garanto os dados corretos! ⚡',
      'Oi {nome}! Me envia a última conta de energia pelo link seguro:\n\n📎 {proposalUrl}\n\nSeus dados ficam protegidos! 🔒',
    ],
    medium: [
      '{nome}, a fatura é essencial pra sua proposta definitiva! Envie pelo link seguro:\n\n📎 {proposalUrl}\n\nProcesso rápido! 📸',
      'Ei {nome}! Sua proposta está esperando a fatura. Envie com segurança:\n\n📎 {proposalUrl} 🔒',
    ],
    high: [
      '⚠️ {nome}, sem a fatura não consigo fechar sua proposta. Envie pelo link seguro:\n\n📎 {proposalUrl}\n\nTe respondo em minutos! 🔥',
      '{nome}, a fatura é o que falta pra garantir seu desconto! Acesse:\n\n📎 {proposalUrl} 🔒',
    ],
    critical: [
      '🚨 {nome}, última chamada! Envie qualquer fatura recente pelo link seguro:\n\n📎 {proposalUrl}\n\nSe tiver dificuldade, me fala!',
      '{nome}, não desiste agora! Acesse {proposalUrl} e envie a fatura. Me conta se precisar de ajuda! 💚',
    ],
  },
  missing_contrato_social: {
    low: [
      '{nome}, como é pessoa jurídica, preciso do contrato social. Envie com segurança pelo link:\n\n📎 {proposalUrl}\n\nSeus dados ficam protegidos! 📋',
      'Oi {nome}! Pra empresas, o contrato social é necessário. Envie pelo link seguro:\n\n📎 {proposalUrl} 🔒',
    ],
    medium: [
      '{nome}, só falta o contrato social pra fechar sua proposta PJ! Envie pelo link:\n\n📎 {proposalUrl} 🏢',
      'Ei {nome}! O contrato social é obrigatório pra PJ. Envie com segurança:\n\n📎 {proposalUrl} 🔒',
    ],
    high: [
      '⚠️ {nome}, sua empresa está a um documento de economizar! Envie o contrato social:\n\n📎 {proposalUrl} 🔒',
      '{nome}, a proposta PJ precisa do contrato social. Envie pelo link seguro:\n\n📎 {proposalUrl}\n\nSe tiver dificuldade, me fala! 🔥',
    ],
    critical: [
      '🚨 {nome}, pra empresas é obrigatório. Envie o contrato social pelo link seguro:\n\n📎 {proposalUrl}\n\nPrecisa de ajuda? Me conta!',
      '{nome}, última tentativa! Acesse {proposalUrl} e envie o documento. Se precisar de ajuda, estou aqui! 💚',
    ],
  },
};

// Mensagens para inatividade geral
const INACTIVITY_RESCUE_MESSAGES: Record<string, string[]> = {
  low: [
    'Oi {nome}! Sumiu? 😊 Continuo aqui se precisar de ajuda com a proposta.',
    '{nome}, tudo bem por aí? Sua proposta está salva, é só continuar quando puder!',
    'Ei {nome}! Ficou alguma dúvida sobre o que conversamos? Tô aqui!',
  ],
  medium: [
    '{nome}, ainda estou esperando você! Tem alguma dúvida que posso esclarecer?',
    'Oi {nome}! Não quero te pressionar, mas seu desconto está garantido. Quer continuar?',
    '{nome}, tudo certo? Me conta se ficou algo confuso que eu explico melhor.',
  ],
  high: [
    '⚠️ {nome}, sua economia está parada! Me responde qualquer coisa que a gente retoma.',
    '{nome}, entendo que pode estar ocupado(a). Mas não quero que perca essa oportunidade! Posso ajudar?',
    'Ei {nome}! Tô preocupada. Aconteceu algo? Me dá um sinal de vida! 💚',
  ],
  critical: [
    '🚨 {nome}, última mensagem sobre isso! Se mudar de ideia, é só me chamar que retomamos. Seu histórico fica salvo.',
    '{nome}, vou pausar os lembretes, ok? Mas continuo aqui se precisar. Foi um prazer conversar com você! 💚',
    'Tchau por enquanto, {nome}! Se quiser economizar na conta de luz, é só me chamar. Boa sorte! 🍀',
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// FUNÇÕES DE ANÁLISE
// ═══════════════════════════════════════════════════════════════════════════

function analyzeStuckLead(conversa: StuckLeadConversation): StuckAnalysis {
  const now = new Date();
  const lastActivity = new Date(conversa.last_message_at || conversa.created_at);
  const inactivityMinutes = Math.floor((now.getTime() - lastActivity.getTime()) / (1000 * 60));
  
  const dados = conversa.dados_coletados || {};
  const arquivos = conversa.arquivos_anexados || [];
  
  const missingData: string[] = [];
  const missingDocs: string[] = [];
  
  // Verificar dados faltantes
  if (!dados.tipoInstalacao) missingData.push('tipoInstalacao');
  if (!dados.distribuidora && !dados.concessionaria) missingData.push('distribuidora');
  if (!dados.valorFatura && !dados.consumo && !dados.consumo_ou_valor) missingData.push('consumo');
  if (!dados.cep && !dados.endereco) missingData.push('cep');
  if (!dados.email && !dados.cliente_email && !conversa.cliente_email) missingData.push('email');
  
  // Verificar documentos faltantes (apenas se já passou do estágio inicial)
  const isAfterPropostaInicial = conversa.bitrix24_stage === 'UC_9SLRPP' || 
                                   conversa.bitrix24_stage === 'UC_JENEX5' ||
                                   conversa.proposta_id;
  
  if (isAfterPropostaInicial) {
    if (!arquivos.includes('documento_identidade')) missingDocs.push('documento_identidade');
    if (!arquivos.includes('fatura')) missingDocs.push('fatura');
    
    // Verificar contrato social se for PJ
    const isPJ = !!dados.cnpj || (typeof dados.cpf_cnpj === 'string' && dados.cpf_cnpj.length > 14);
    if (isPJ && !arquivos.includes('contrato_social')) {
      missingDocs.push('contrato_social');
    }
  }
  
  // Determinar razão principal do travamento
  let stuckReason: StuckReason = 'unknown';
  
  if (missingDocs.length > 0) {
    // Prioridade para documentos se já passou da proposta inicial
    stuckReason = `missing_${missingDocs[0]}` as StuckReason;
  } else if (missingData.length > 0) {
    stuckReason = `missing_${missingData[0]}` as StuckReason;
  } else if (inactivityMinutes >= 30) {
    stuckReason = 'inactivity';
  }
  
  const isStuck = missingData.length > 0 || missingDocs.length > 0 || inactivityMinutes >= 30;
  
  return {
    isStuck,
    stuckReason,
    missingData,
    missingDocs,
    inactivityMinutes,
  };
}

function getRescueMessage(
  stuckReason: StuckReason,
  urgencyLevel: string,
  clienteNome: string | null,
  proposalUrl: string | null = null
): string {
  const firstName = clienteNome?.split(' ')[0] || 'Olá';
  
  let messageBank: Record<string, string[]>;
  
  // Selecionar banco de mensagens apropriado
  if (stuckReason.startsWith('missing_documento') || 
      stuckReason.startsWith('missing_fatura') || 
      stuckReason.startsWith('missing_contrato')) {
    messageBank = MISSING_DOCS_RESCUE_MESSAGES[stuckReason]?.[urgencyLevel] 
                  ? { [urgencyLevel]: MISSING_DOCS_RESCUE_MESSAGES[stuckReason][urgencyLevel] }
                  : { [urgencyLevel]: INACTIVITY_RESCUE_MESSAGES[urgencyLevel] };
  } else if (stuckReason === 'inactivity' || stuckReason === 'unknown') {
    messageBank = { [urgencyLevel]: INACTIVITY_RESCUE_MESSAGES[urgencyLevel] };
  } else {
    messageBank = MISSING_DATA_RESCUE_MESSAGES[stuckReason]?.[urgencyLevel]
                  ? { [urgencyLevel]: MISSING_DATA_RESCUE_MESSAGES[stuckReason][urgencyLevel] }
                  : { [urgencyLevel]: INACTIVITY_RESCUE_MESSAGES[urgencyLevel] };
  }
  
  const messages = messageBank[urgencyLevel] || INACTIVITY_RESCUE_MESSAGES.low;
  const message = messages[Math.floor(Math.random() * messages.length)];
  
  // Replace placeholders
  let finalMessage = message.replace(/{nome}/g, firstName);
  
  // Replace {proposalUrl} - if no URL available, use generic safe message
  if (proposalUrl) {
    finalMessage = finalMessage.replace(/{proposalUrl}/g, proposalUrl);
  } else {
    // If doc template requires URL but none available, replace with generic message
    finalMessage = finalMessage.replace(/\n\n📎 Acesse: \{proposalUrl\}[^\n]*/g, '');
    finalMessage = finalMessage.replace(/\n\n📎 \{proposalUrl\}[^\n]*/g, '');
    finalMessage = finalMessage.replace(/\{proposalUrl\}/g, 'o link seguro que você receberá em breve');
  }
  
  return finalMessage;
}

function calculateNextRescueTime(rescueAttempts: number): Date | null {
  const schedule = RESCUE_SCHEDULE[rescueAttempts as keyof typeof RESCUE_SCHEDULE];
  if (!schedule) return null;
  
  const nextRescue = new Date();
  nextRescue.setMinutes(nextRescue.getMinutes() + schedule.delay_minutes);
  return nextRescue;
}

function getUrgencyLevel(rescueAttempts: number): string {
  const schedule = RESCUE_SCHEDULE[rescueAttempts as keyof typeof RESCUE_SCHEDULE];
  return schedule?.urgency || 'low';
}

// ═══════════════════════════════════════════════════════════════════════════
// ENVIO DE MENSAGENS VIA Z-API
// ═══════════════════════════════════════════════════════════════════════════

async function sendWhatsAppMessage(
  phone: string, 
  message: string,
  agentId: string = 'sofia'
): Promise<{ success: boolean; error?: string }> {
  try {
    const cleanPhone = phone.replace(/\D/g, '');
    const formattedPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
    
    console.log(`[stuck-leads-rescue] Sending to ${formattedPhone} (agent: ${agentId})`);
    
    const response = await fetch(`${SUPABASE_URL}/functions/v1/z-api-send-message`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        phone: formattedPhone, 
        message,
        agentId, // Pass agentId so z-api-send-message can fetch correct credentials
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[stuck-leads-rescue] Z-API error for agent ${agentId}:`, response.status, errorText);
      return { success: false, error: `Z-API error: ${response.status}` };
    }

    return { success: true };
  } catch (error) {
    console.error('[stuck-leads-rescue] Error sending message:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HANDLER PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  console.log('[stuck-leads-rescue] Function called:', req.method);

  // Internal API - strict CORS
  if (req.method === 'OPTIONS') {
    return handleCorsPrelight(req, { mode: 'strict' });
  }

  const corsHeaders = getStrictCorsHeaders(req);

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const now = new Date();
    
    // ═══════════════════════════════════════════════════════════════
    // CARREGAR CONFIGURAÇÕES DINÂMICAS
    // ═══════════════════════════════════════════════════════════════
    const schedulerConfig = await loadSchedulerConfig(supabase);
    
    // Aplicar config dinâmica
    RESCUE_SCHEDULE = schedulerConfig.rescueSchedule as typeof RESCUE_SCHEDULE;
    MAX_RESCUE_ATTEMPTS = schedulerConfig.rescueMaxAttempts;
    const INACTIVITY_THRESHOLD = schedulerConfig.rescueInactivityThreshold;
    const BATCH_SIZE = schedulerConfig.rescueBatchSize;
    
    const { data: allConfigData } = await supabase
      .from('configuracoes_sistema')
      .select('chave, valor')
      .in('chave', [
        'stuck_leads_rescue_enabled',
        'quiet_hours_enabled', 
        'quiet_hours_start', 
        'quiet_hours_end', 
        'quiet_hours_timezone'
      ]);
    
    const configMap: Record<string, string> = {};
    allConfigData?.forEach((c: { chave: string; valor: string }) => {
      configMap[c.chave] = c.valor;
    });
    
    // ═══════════════════════════════════════════════════════════════
    // VERIFICAR QUIET HOURS
    // ═══════════════════════════════════════════════════════════════
    const quietConfig: Partial<QuietHoursConfig> = {
      quiet_hours_enabled: configMap.quiet_hours_enabled,
      quiet_hours_start: configMap.quiet_hours_start,
      quiet_hours_end: configMap.quiet_hours_end,
      quiet_hours_timezone: configMap.quiet_hours_timezone,
    };
    
    if (isQuietHours(quietConfig)) {
      console.log('[stuck-leads-rescue] 🌙 QUIET HOURS ACTIVE - Suppressing all rescues');
      
      // Reagendar rescues pendentes
      const { data: rescuesToReschedule } = await supabase
        .from('chatbot_conversas')
        .select('id')
        .lt('next_rescue_at', now.toISOString())
        .is('ended_at', null)
        .neq('needs_human_fallback', true);
      
      if (rescuesToReschedule && rescuesToReschedule.length > 0) {
        const nextTime = getNextAvailableTime(quietConfig);
        
        for (const conversa of rescuesToReschedule) {
          await supabase
            .from('chatbot_conversas')
            .update({ next_rescue_at: nextTime.toISOString() })
            .eq('id', conversa.id);
        }
        
        console.log(`[stuck-leads-rescue] Rescheduled ${rescuesToReschedule.length} rescues to ${nextTime.toISOString()}`);
      }
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          quietHours: true,
          rescheduled: rescuesToReschedule?.length || 0,
          nextAvailableTime: getNextAvailableTime(quietConfig).toISOString(),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Verificar se o resgate está habilitado
    if (configMap.stuck_leads_rescue_enabled === 'false') {
      console.log('[stuck-leads-rescue] Rescue scheduler disabled');
      return new Response(
        JSON.stringify({ success: true, message: 'Rescue scheduler disabled' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // ═══════════════════════════════════════════════════════════════
    // PROACTIVE PENDING TASK TIMEOUT (Alteração 3)
    // Check for conversations with expired pending_task BEFORE the 
    // main stuck leads logic. This ensures proactive action even 
    // when the client is silent.
    // ═══════════════════════════════════════════════════════════════
    const PENDING_TASK_TIMEOUT_MS = 2 * 60 * 1000; // 120s - must match pending-task-manager.ts
    const pendingTaskThreshold = new Date(now.getTime() - PENDING_TASK_TIMEOUT_MS).toISOString();
    
    const { data: expiredPendingTasks, error: pendingError } = await supabase
      .from('chatbot_conversas')
      .select('id, cliente_telefone, cliente_nome, pending_task, pending_task_retries, dados_coletados, agent_id')
      .not('pending_task', 'is', null)
      .lt('pending_task_created_at', pendingTaskThreshold)
      .is('ended_at', null)
      .neq('sofia_mode', 'paused_for_human')
      .neq('sofia_mode', 'descartado')
      .limit(20);
    
    if (pendingError) {
      console.error('[stuck-leads-rescue] Error fetching expired pending tasks:', pendingError.message);
    }
    
    let pendingTasksHandled = 0;
    
    if (expiredPendingTasks && expiredPendingTasks.length > 0) {
      console.log(`[stuck-leads-rescue] 🕐 Found ${expiredPendingTasks.length} conversations with expired pending tasks`);
      
      // Check blocked phones for pending tasks
      const pendingPhones = expiredPendingTasks.map((c: any) => c.cliente_telefone).filter(Boolean);
      const pendingBlockedPhones = await getBlockedPhones(supabase, pendingPhones, 'sofia', 'zapi');
      
      for (const conv of expiredPendingTasks) {
        const normalizedPh = normalizeTakeoverPhone(conv.cliente_telefone);
        if (pendingBlockedPhones.has(normalizedPh)) {
          console.log(`[stuck-leads-rescue] 🛑 Pending task BLOCKED for ${conv.cliente_telefone} - human takeover`);
          continue;
        }
        
        const retries = conv.pending_task_retries || 0;
        
        // For proposta_inicial with all data present, send reassurance
        if (conv.pending_task === 'proposta_inicial') {
          // GUARD: Skip if conversation is too young (< 60s, likely post-reset)
          const convCreatedAt = conv.created_at ? new Date(conv.created_at).getTime() : 0;
          const convAgeMs = Date.now() - convCreatedAt;
          if (convAgeMs < 60_000) {
            console.log(`[stuck-leads-rescue] ⏩ SKIP: Conv ${conv.id} too young (${Math.round(convAgeMs / 1000)}s) - likely post-reset`);
            await supabase
              .from('chatbot_conversas')
              .update({ pending_task: null, pending_task_created_at: null, pending_task_retries: 0 })
              .eq('id', conv.id);
            continue;
          }
          
          const firstName = conv.cliente_nome?.split(' ')[0] || 'Olá';
          const delayMessage = 'Oi! Vi que estávamos conversando e não consegui te responder. Posso te ajudar com alguma dúvida?';
          
          // Anti-spam: check if we already sent this exact message recently
          const { data: recentMsgs } = await supabase
            .from('chatbot_mensagens')
            .select('content')
            .eq('conversa_id', conv.id)
            .eq('role', 'assistant')
            .order('created_at', { ascending: false })
            .limit(3);
          
          const alreadySent = recentMsgs?.some((m: any) => 
            m.content?.includes('não consegui te responder') || m.content?.includes('demorando um pouquinho')
          );
          
          if (alreadySent) {
            console.log(`[stuck-leads-rescue] ⏩ Skipping duplicate delay message for ${conv.id}`);
            // Clear the pending task to avoid infinite loop
            await supabase
              .from('chatbot_conversas')
              .update({ pending_task: null, pending_task_created_at: null, pending_task_retries: 0 })
              .eq('id', conv.id);
            continue;
          }
          
          const sendResult = await sendWhatsAppMessage(conv.cliente_telefone, delayMessage, conv.agent_id);
          
          if (sendResult.success) {
            pendingTasksHandled++;
            
            // Save message
            await supabase.from('chatbot_mensagens').insert({
              conversa_id: conv.id,
              role: 'assistant',
              content: delayMessage,
              handler_type: 'proactive_pending_timeout',
            });
            
            // Notify operators
            await supabase.from('admin_notifications').insert({
              admin_user_id: null,
              title: '🕐 Proposta demorando - Cliente aguardando (proativo)',
              message: `Cliente ${conv.cliente_nome || conv.cliente_telefone} aguarda proposta há mais de 2 min. Detectado proativamente pelo scheduler.`,
              type: 'proposal_delay',
              entity_type: 'chatbot_conversa',
              entity_id: conv.id,
              created_by_nome: 'Sistema (Scheduler)',
            });
            
            // Increment retries or clear if max reached
            if (retries >= 2) {
              await supabase
                .from('chatbot_conversas')
                .update({ 
                  pending_task: null, 
                  pending_task_created_at: null, 
                  pending_task_retries: 0,
                  needs_human_fallback: true,
                  escalated_at: now.toISOString(),
                  escalation_reason: 'Proposta não entregue após múltiplas tentativas proativas',
                })
                .eq('id', conv.id);
            } else {
              await supabase
                .from('chatbot_conversas')
                .update({ 
                  pending_task_retries: retries + 1,
                  pending_task_created_at: now.toISOString(),
                })
                .eq('id', conv.id);
            }
          }
        } else {
          // For other pending tasks, just clear them after timeout
          console.log(`[stuck-leads-rescue] Clearing expired pending task "${conv.pending_task}" for ${conv.id}`);
          await supabase
            .from('chatbot_conversas')
            .update({ pending_task: null, pending_task_created_at: null, pending_task_retries: 0 })
            .eq('id', conv.id);
          pendingTasksHandled++;
        }
      }
      
      console.log(`[stuck-leads-rescue] 🕐 Handled ${pendingTasksHandled} expired pending tasks proactively`);
    }
    
    // Buscar leads potencialmente travados
    // Critérios: última atividade >= threshold (dinâmico), não encerrado, não em fallback humano
    const inactivityThresholdMs = INACTIVITY_THRESHOLD * 60 * 1000;
    const inactivityThreshold = new Date(now.getTime() - inactivityThresholdMs);
    
    const { data: stuckLeads, error: fetchError } = await supabase
      .from('chatbot_conversas')
      .select(`
        id,
        cliente_telefone,
        cliente_nome,
        cliente_email,
        last_message_at,
        last_sofia_message_at,
        dados_coletados,
        arquivos_anexados,
        bitrix24_lead_id,
        bitrix24_stage,
        proposta_id,
        rescue_attempts,
        last_rescue_at,
        rescue_reason,
        next_rescue_at,
        awaiting_response,
        needs_human_fallback,
        sofia_mode,
        ended_at,
        created_at,
        agent_id,
        contrato_assinado,
        has_simulation
      `)
      .is('ended_at', null)
      .is('human_agent_id', null) // 🚫 NUNCA rescue se atendente humano assumiu
      .neq('needs_human_fallback', true)
      .neq('contrato_assinado', true) // 🚫 NUNCA rescue se contrato já foi assinado
      .neq('sofia_mode', 'paused_for_human') // 🚫 NUNCA rescue quando humano está atendendo
      .neq('sofia_mode', 'descartado') // 🚫 NUNCA rescue leads descartados
      .neq('sofia_mode', 'sac_redirect') // 🚫 NUNCA rescue clientes redirecionados ao SAC
      .neq('bitrix24_stage', 'JUNK') // 🚫 NUNCA rescue leads JUNK
      .neq('bitrix24_stage', 'WON') // 🚫 NUNCA rescue leads GANHOS
      .or(`last_message_at.lt.${inactivityThreshold.toISOString()},last_message_at.is.null`)
      .lt('rescue_attempts', MAX_RESCUE_ATTEMPTS)
      .order('last_message_at', { ascending: true })
      .limit(BATCH_SIZE);
    
    if (fetchError) {
      throw new Error(`Error fetching stuck leads: ${fetchError.message}`);
    }
    
    console.log(`[stuck-leads-rescue] Found ${stuckLeads?.length || 0} potential stuck leads (inactivity threshold: ${INACTIVITY_THRESHOLD}min)`);
    
    // ═══════════════════════════════════════════════════════════════
    // 🛑 HUMAN TAKEOVER CHECK - Block ALL phones that are under human control
    // This is the SOURCE OF TRUTH for blocking automations
    // ═══════════════════════════════════════════════════════════════
    const allPhones = (stuckLeads || []).map((c: any) => c.cliente_telefone).filter(Boolean);
    const blockedPhones = await getBlockedPhones(supabase, allPhones, 'sofia', 'zapi');
    
    if (blockedPhones.size > 0) {
      console.log(`[stuck-leads-rescue] 🛑 Blocking ${blockedPhones.size} phones due to active human takeover`);
    }
    
    const results = {
      processed: 0,
      rescued: 0,
      escalated: 0,
      skipped: 0,
      errors: 0,
    };
    
    // ═══════════════════════════════════════════════════════════════
    // RATE LIMITING - Evitar disparo em massa e bloqueio pela Meta
    // ═══════════════════════════════════════════════════════════════
    const totalLeads = stuckLeads?.length || 0;
    const rateLimitConfig = getAppropriateConfig(totalLeads, totalLeads > 15);
    console.log(`[stuck-leads-rescue] 🚦 Rate limiting: ${totalLeads} leads, base delay ${rateLimitConfig.baseDelayMs}ms`);
    
    let messageIndex = 0;
    for (const conversa of (stuckLeads || []) as StuckLeadConversation[]) {
      results.processed++;
      
      // ═══════════════════════════════════════════════════════════════
      // 🛑 ABSOLUTE FIRST CHECK: Human takeover blocks EVERYTHING
      // ═══════════════════════════════════════════════════════════════
      const normalizedPhone = normalizeTakeoverPhone(conversa.cliente_telefone);
      if (blockedPhones.has(normalizedPhone)) {
        console.log(`[stuck-leads-rescue] 🛑 BLOCKED: ${conversa.cliente_telefone} - Active human takeover`);
        results.skipped++;
        // Clear any pending rescue to prevent retry loops
        await supabase
          .from('chatbot_conversas')
          .update({ next_rescue_at: null })
          .eq('id', conversa.id);
        continue;
      }
      
      // ═══════════════════════════════════════════════════════════════
      // UNIFIED ELIGIBILITY CHECK (from _shared/automation-eligibility.ts)
      // Centralizes all disqualification and blocking logic
      // ═══════════════════════════════════════════════════════════════
      const eligibilityContext: AutomationContext = {
        id: conversa.id,
        cliente_telefone: conversa.cliente_telefone,
        cliente_nome: conversa.cliente_nome,
        human_agent_id: null, // Already filtered in query
        sofia_mode: conversa.sofia_mode,
        last_message_at: conversa.last_message_at,
        last_human_message_at: null,
        ended_at: conversa.ended_at,
        contrato_enviado_at: null,
        bitrix24_stage: conversa.bitrix24_stage,
        contrato_assinado: null,
        event_conversion: null,
        event_drop: null,
        dados_coletados: conversa.dados_coletados,
        has_simulation: conversa.has_simulation,
      };
      
      // Load config cache for eligibility check
      const configCache = new Map<string, string>();
      const { data: configData } = await supabase
        .from('configuracoes_sistema')
        .select('chave, valor')
        .in('chave', ['automation_activity_cooldown_minutes']);
      configData?.forEach((c: { chave: string; valor: string }) => {
        configCache.set(c.chave, c.valor);
      });
      
      const eligibility = checkAutomationEligibility(eligibilityContext, 'rescue', configCache);
      logEligibility('stuck-leads-rescue', conversa.id, conversa.cliente_telefone, eligibility);
      
      if (!eligibility.eligible) {
        // Take action based on recommended action
        if (eligibility.action === 'cleanup') {
          // Disqualified lead - clean up automations
          await supabase
            .from('chatbot_conversas')
            .update({
              awaiting_response: false,
              next_nudge_at: null,
              next_followup_at: null,
              next_rescue_at: null,
              ...(eligibility.reason.includes('Disqualified') ? { 
                sofia_mode: 'descartado',
                ended_at: new Date().toISOString(),
              } : {}),
            })
            .eq('id', conversa.id);
        } else if (eligibility.action === 'reschedule') {
          // Activity cooldown - reschedule for later
          const rescheduleTime = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
          await supabase
            .from('chatbot_conversas')
            .update({ next_rescue_at: rescheduleTime.toISOString() })
            .eq('id', conversa.id);
        }
        // Skip (no action needed) is handled by continuing
        
        results.skipped++;
        continue;
      }
      
      // ═══════════════════════════════════════════════════════════════
      // 🛡️ ANTI-SPAM GUARDS: Daily limit + Cross-conversation takeover
      // ═══════════════════════════════════════════════════════════════
      const guardResult = await runAntiSpamGuards(supabase, conversa.id, conversa.cliente_telefone);
      if (!guardResult.allowed) {
        console.log(`[stuck-leads-rescue] 🛡️ GUARD BLOCKED: ${conversa.cliente_telefone} - ${guardResult.reason}`);
        results.skipped++;
        // If daily limit reached, clear next_rescue to avoid retrying endlessly today
        if (guardResult.dailyLimit?.blocked) {
          await supabase
            .from('chatbot_conversas')
            .update({ next_rescue_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() })
            .eq('id', conversa.id);
        }
        // If cross-conv takeover, block permanently
        if (guardResult.crossConvTakeover?.blocked) {
          await supabase
            .from('chatbot_conversas')
            .update({ next_rescue_at: null, sofia_mode: 'paused_for_human' })
            .eq('id', conversa.id);
        }
        continue;
      }

      // Verificar se já está na hora do próximo resgate
      if (conversa.next_rescue_at) {
        const nextRescue = new Date(conversa.next_rescue_at);
        if (now < nextRescue) {
          console.log(`[stuck-leads-rescue] ${conversa.id} - Not yet time for rescue (${nextRescue.toISOString()})`);
          results.skipped++;
          continue;
        }
      }
      
      // ═══════════════════════════════════════════════════════════════
      // 🛡️ ANTI-SPAM: Verificar mensagens recentes antes de enviar
      // Evita spam mesmo se scheduler executar com frequência alta
      // ═══════════════════════════════════════════════════════════════
      const { data: recentMessages } = await supabase
        .from('chatbot_mensagens')
        .select('created_at')
        .eq('conversa_id', conversa.id)
        .eq('role', 'assistant')
        .order('created_at', { ascending: false })
        .limit(1);
      
      const lastMsgTime = recentMessages?.[0]?.created_at;
      
      // Load min interval from config (default: 60 minutes)
      const { data: intervalConfig } = await supabase
        .from('configuracoes_sistema')
        .select('valor')
        .eq('chave', 'min_interval_between_nudges_minutes')
        .maybeSingle();
      
      const minIntervalMinutes = parseInt(intervalConfig?.valor || '60');
      const minIntervalMs = minIntervalMinutes * 60 * 1000;
      
      if (lastMsgTime && (Date.now() - new Date(lastMsgTime).getTime()) < minIntervalMs) {
        const minutesSinceLastMsg = Math.round((Date.now() - new Date(lastMsgTime).getTime()) / 60000);
        console.log(`[stuck-leads-rescue] ⏸️ ANTI-SPAM Skip: ${conversa.cliente_telefone} - mensagem há ${minutesSinceLastMsg}min (min: ${minIntervalMinutes}min)`);
        results.skipped++;
        continue;
      }
      
      // Analisar o lead
      const analysis = analyzeStuckLead(conversa);
      
      if (!analysis.isStuck) {
        console.log(`[stuck-leads-rescue] ${conversa.id} - Not stuck (all data complete)`);
        results.skipped++;
        continue;
      }
      
      const rescueAttempts = (conversa.rescue_attempts || 0) + 1;
      
      // Verificar se excedeu máximo de tentativas
      if (rescueAttempts > MAX_RESCUE_ATTEMPTS) {
        console.log(`[stuck-leads-rescue] ${conversa.id} - Max attempts exceeded, escalating`);
        
        // Escalar para humano
        await supabase
          .from('chatbot_conversas')
          .update({
            needs_human_fallback: true,
            escalation_reason: `Lead travado após ${MAX_RESCUE_ATTEMPTS} tentativas de resgate. Motivo: ${analysis.stuckReason}`,
            escalated_at: now.toISOString(),
          })
          .eq('id', conversa.id);
        
        // Notificar admin
        await supabase
          .from('admin_notifications')
          .insert({
            title: 'Lead travado precisa de intervenção',
            message: `O lead ${conversa.cliente_nome || conversa.cliente_telefone} não respondeu após ${MAX_RESCUE_ATTEMPTS} tentativas. Motivo: ${analysis.stuckReason}. Dados faltantes: ${analysis.missingData.join(', ')}. Docs faltantes: ${analysis.missingDocs.join(', ')}.`,
            type: 'warning',
            entity_type: 'chatbot_conversa',
            entity_id: conversa.id,
          });
        
        results.escalated++;
        continue;
      }
      
      // Construir URL da proposta para templates de documentos (LGPD)
      let proposalUrl: string | null = null;
      if (conversa.proposta_id) {
        // Buscar public_app_url da config
        const { data: urlConfig } = await supabase
          .from('configuracoes_sistema')
          .select('chave, valor')
          .in('chave', ['public_app_url', 'public_cache_bust']);
        const publicAppUrl = urlConfig?.find((c: any) => c.chave === 'public_app_url')?.valor || 'https://coesa-propose-craft.lovable.app';
        const cacheBust = urlConfig?.find((c: any) => c.chave === 'public_cache_bust')?.valor;
        const baseUrl = publicAppUrl.replace(/\/$/, '');
        proposalUrl = `${baseUrl}/proposta-inicial/${conversa.proposta_id}${cacheBust ? `?v=${cacheBust}` : ''}`;
      }
      
      // Obter mensagem de resgate
      const urgencyLevel = getUrgencyLevel(rescueAttempts);
      const message = getRescueMessage(analysis.stuckReason, urgencyLevel, conversa.cliente_nome, proposalUrl);
      
      // ═══════════════════════════════════════════════════════════════
      // RATE LIMITING - Aplicar delay antes do envio
      // ═══════════════════════════════════════════════════════════════
      const delay = calculateDelay(messageIndex, totalLeads, rateLimitConfig);
      if (delay > 0) {
        console.log(`[stuck-leads-rescue] 🕐 Rate limit: waiting ${delay}ms before message ${messageIndex + 1}/${totalLeads}`);
        await wait(delay);
      }
      messageIndex++;
      
      console.log(`[stuck-leads-rescue] ${conversa.id} - Attempt ${rescueAttempts}/${MAX_RESCUE_ATTEMPTS} (${urgencyLevel}): ${analysis.stuckReason}`);
      
      // Enviar mensagem usando credenciais do agente
      const agentId = conversa.agent_id || 'sofia';
      const sendResult = await sendWhatsAppMessage(conversa.cliente_telefone, message, agentId);
      
      if (!sendResult.success) {
        console.error(`[stuck-leads-rescue] Failed to send message: ${sendResult.error}`);
        results.errors++;
        continue;
      }
      
      // Calcular próximo resgate
      const nextRescueTime = calculateNextRescueTime(rescueAttempts + 1);
      
      // Atualizar conversa
      await supabase
        .from('chatbot_conversas')
        .update({
          rescue_attempts: rescueAttempts,
          last_rescue_at: now.toISOString(),
          rescue_reason: analysis.stuckReason,
          next_rescue_at: nextRescueTime?.toISOString() || null,
          last_sofia_message_at: now.toISOString(),
        })
        .eq('id', conversa.id);
      
      // Registrar mensagem
      await supabase
        .from('chatbot_mensagens')
        .insert({
          conversa_id: conversa.id,
          role: 'assistant',
          content: message,
        });
      
      // Log de atividade
      await supabase
        .from('activity_logs')
        .insert({
          action: 'stuck_lead_rescue_sent',
          entity_type: 'chatbot_conversa',
          entity_id: conversa.id,
          entity_name: conversa.cliente_nome || conversa.cliente_telefone,
          details: {
            rescue_attempt: rescueAttempts,
            stuck_reason: analysis.stuckReason,
            urgency_level: urgencyLevel,
            missing_data: analysis.missingData,
            missing_docs: analysis.missingDocs,
            inactivity_minutes: analysis.inactivityMinutes,
          },
        });
      
      results.rescued++;
    }
    
    console.log('[stuck-leads-rescue] Results:', results);
    
    return new Response(
      JSON.stringify({
        success: true,
        results,
        timestamp: now.toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('[stuck-leads-rescue] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
