import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { calculateDelay, wait, getAppropriateConfig, type RateLimitConfig } from '../_shared/rate-limiter.ts';
import { checkObjectionCooldown, performAntiSpamCheck } from '../_shared/anti-spam.ts';
import { getNotificationAuthorName } from '../_shared/agent-identity.ts';
import { 
  checkAutomationEligibility, 
  logEligibility, 
  type AutomationContext 
} from '../_shared/automation-eligibility.ts';
import { 
  getStrictCorsHeaders, 
  handleCorsPrelight, 
  jsonResponse, 
  errorResponse 
} from '../_shared/security-helpers.ts';
import {
  isPhoneBlockedByTakeover,
  getBlockedPhones,
  normalizeTakeoverPhone,
} from '../_shared/human-takeover.ts';
import { runAntiSpamGuards } from '../_shared/anti-spam-guards.ts';
// Unified Config Loader - duas camadas (agent override → global fallback)
import { 
  getUnifiedConfigLoader,
  isUnifiedQuietHours,
  getUnifiedNudgeDelays,
} from '../_shared/unified-config-loader.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// ═══════════════════════════════════════════════════════════════
// QUIET HOURS - Período de silêncio para FUPs (20:00 às 07:00)
// A Sofia NÃO envia FUPs durante esse período, apenas responde se provocada
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

interface ConversaForNudge {
  id: string;
  cliente_telefone: string;
  cliente_nome: string | null;
  cliente_email: string | null;
  nudge_count: number;
  last_sofia_message_at: string;
  // Contract nudge fields
  contrato_enviado_at: string | null;
  contract_nudge_count: number | null;
  sofia_mode: string | null;
  // Collected data for smart nudges
  dados_coletados: Record<string, unknown> | null;
  // Document collection fields (for proposta_inicial_enviada stage)
  arquivos_anexados: string[] | null;
  bitrix24_stage: string | null;
  // Objection cooldown
  detected_objection: string | null;
  objection_cooldown_until: string | null;
  // Agent identity - critical for segregation
  agent_id: string;
  // Contract status
  contrato_assinado: boolean | null;
  proposta_id: string | null;
}

// ═══════════════════════════════════════════════════════════════
// SMART DATA COLLECTION NUDGE MESSAGES
// Pergunta especificamente pelo dado faltante ao invés de genéricas
// ═══════════════════════════════════════════════════════════════
interface MissingFieldInfo {
  field: string;
  priority: number;
  messages: string[];
}

// Campos obrigatórios para proposta inicial e suas mensagens específicas
const MISSING_FIELD_NUDGES: MissingFieldInfo[] = [
  {
    field: 'email',
    priority: 1,
    messages: [
      'Pra eu te enviar a proposta, preciso do seu e-mail. Pode me passar? 📧',
      'Qual é seu e-mail pra eu encaminhar a proposta personalizada?',
      'Me envia seu melhor e-mail que eu já preparo sua proposta! 📬',
      'Só falta o e-mail pra gente continuar! Pode compartilhar?',
    ],
  },
  {
    field: 'valorFatura',
    priority: 2,
    messages: [
      'Pra calcular sua economia, preciso saber: quanto você paga de luz por mês, mais ou menos? 💡',
      'Qual o valor médio da sua conta de energia? Assim calculo o desconto exato!',
      'Você sabe quanto vem na sua conta de luz? É pra eu simular sua economia! ⚡',
      'Me conta: quanto você gasta de luz por mês? Vou te mostrar quanto pode economizar!',
    ],
  },
  {
    field: 'distribuidora',
    priority: 3,
    messages: [
      'Qual a distribuidora de energia da sua região? (Ex: CEMIG, Enel, CPFL...)',
      'Me passa qual é sua concessionária de energia? Preciso disso pra calcular a tarifa certa!',
      'Você sabe qual empresa fornece sua energia? CEMIG, Enel, Light...?',
      'Qual a distribuidora que aparece na sua conta de luz?',
    ],
  },
  {
    field: 'nome',
    priority: 4,
    messages: [
      'Antes de continuar, como você gostaria de ser chamado(a)?',
      'Qual seu nome? Assim posso personalizar a proposta pra você! 😊',
      'Me conta seu nome pra eu preparar tudo certinho!',
    ],
  },
];

// ═══════════════════════════════════════════════════════════════
// DOCUMENT COLLECTION NUDGES (Para estágio proposta_inicial_enviada)
// Cobra especificamente os documentos faltantes para proposta definitiva
// ═══════════════════════════════════════════════════════════════
const DOCUMENT_COLLECTION_NUDGES: MissingFieldInfo[] = [
  {
    field: 'documento_identidade',
    priority: 1,
    messages: [
      '🔐 Pra gerar seu contrato, preciso do seu documento de identidade. Você pode enviar de forma segura pelo link da sua proposta ou aqui pelo WhatsApp. Qual prefere?',
      'Só falta seu documento! 🔐 Recomendo enviar pelo link da proposta (mais seguro) ou pode mandar aqui mesmo. Como prefere?',
      'Oi! Pra avançar, preciso do seu RG ou CNH. Você pode fazer upload seguro pelo link "Solicitar Contrato" ou me enviar aqui. Qual opção?',
      '🔐 Prezamos pela sua segurança! Seu documento de identidade pode ser enviado pelo link da proposta ou aqui pelo WhatsApp. Qual prefere?',
    ],
  },
  {
    field: 'fatura',
    priority: 2,
    messages: [
      'Pra calcular tudo certinho, preciso da sua última fatura de luz. 🔐 Pode enviar pelo link da proposta ou aqui pelo WhatsApp!',
      'Me envia a última conta de energia? Pelo link da proposta (mais seguro) ou aqui mesmo! ⚡',
      'Preciso da fatura de energia pra finalizar. Você escolhe: link da proposta ou aqui pelo WhatsApp!',
      'Sua última conta de luz é o que falta! 🔐 Pode enviar pelo link da proposta ou mandar aqui!',
    ],
  },
  {
    field: 'contrato_social',
    priority: 3,
    messages: [
      'Por ser empresa, preciso do contrato social. 🔐 Pode enviar pelo link da proposta (mais seguro) ou aqui pelo WhatsApp!',
      'Pra PJ, preciso do contrato social. Você escolhe: upload seguro pelo link ou aqui mesmo!',
      'Me envia o contrato social? 🔐 Pelo link "Solicitar Contrato" ou aqui pelo WhatsApp!',
      'Falta só o contrato social! 🔐 Acesse sua proposta e clique em "Solicitar Contrato" ou mande aqui!',
    ],
  },
];

// ═══════════════════════════════════════════════════════════════
// DOCUMENT URGENCY NUDGES - REGRA DOS 30 MINUTOS
// 80% de queda na conversão se documentos não chegam em 30 minutos!
// Delays MUITO mais agressivos para janela crítica de vendas
// ═══════════════════════════════════════════════════════════════
const DEFAULT_DOCUMENT_NUDGE_DELAYS = {
  1: 5 * 60 * 1000,   // 5 minutos - primeiro lembrete rápido
  2: 10 * 60 * 1000,  // 10 minutos - segundo lembrete
  3: 15 * 60 * 1000,  // 15 minutos - terceiro (urgência!)
  4: 25 * 60 * 1000,  // 25 minutos - quase no limite dos 30min
  5: 60 * 60 * 1000,  // 1 hora - ainda tentando
  6: 4 * 60 * 60 * 1000, // 4 horas - follow-up final
};

const DOCUMENT_URGENCY_NUDGES: Record<number, string[]> = {
  1: [ // 5 min - Lembrete gentil com opção segura
    '🔐 Só falta enviar os documentos! Você pode fazer upload pelo link da proposta (mais seguro) ou mandar aqui. Qual prefere?',
    'Oi! Pra avançar com seu contrato, preciso dos docs. Pelo link ou aqui pelo WhatsApp?',
    'Lembrete: seus documentos podem ser enviados pelo link "Solicitar Contrato" ou aqui mesmo!',
  ],
  2: [ // 10 min - Reforço com escolha
    '🔐 Seus documentos são a única coisa que falta! Acesse sua proposta → "Solicitar Contrato" ou mande aqui.',
    'Tô aqui aguardando! Você pode enviar pelo link da proposta (mais seguro) ou aqui pelo WhatsApp.',
    'Só falta os documentos! 🔐 Pelo link da proposta ou aqui, como preferir!',
  ],
  3: [ // 15 min - Urgência com segurança
    '⚡ Falta só os documentos! 🔐 Prezamos pela sua segurança: envie pelo link da proposta ou aqui pelo WhatsApp.',
    'Sua proposta tá quase pronta! Pode enviar de forma segura pelo link ou aqui mesmo!',
    'Os documentos são o último passo! 🔐 Upload pelo link (recomendado) ou aqui pelo WhatsApp.',
  ],
  4: [ // 25 min - Alerta com escolha
    '⚠️ Não deixa essa economia escapar! 🔐 Envie seus documentos pelo link da proposta ou aqui.',
    'Última chance de garantir sua proposta hoje! Pelo link (mais seguro) ou aqui pelo WhatsApp!',
    '⏰ Seu desconto tá esperando! 🔐 Pode enviar pelo link da proposta ou aqui.',
  ],
  5: [ // 1 hora - Resgate com empatia
    'Oi! Vi que ainda não recebi seus documentos. 🔐 Se preferir mais segurança, acesse sua proposta e clique em "Quero minha Proposta Definitiva"!',
    'Passando pra lembrar: você pode enviar de forma segura pelo link ou aqui pelo WhatsApp. Posso ajudar?',
    'Tô aqui pra ajudar! 🔐 Se tiver receio de enviar aqui, use o link seguro da sua proposta.',
  ],
  6: [ // 4 horas - Final com opções
    'Seus documentos são tudo que falta! 🔐 Pelo link da proposta (mais seguro) ou aqui pelo WhatsApp.',
    'Última mensagem: você pode enviar pelo link "Quero minha Proposta Definitiva" ou aqui mesmo! 🚀',
    '🔐 Lembrando: para sua segurança, recomendamos enviar pelo link da proposta. Mas aqui pelo WhatsApp também funciona!',
  ],
};

// Regular nudge messages bank
const NUDGE_MESSAGES = {
  1: [
    'Oi, você ainda está aí? 😊',
    'Ficou alguma dúvida sobre o que conversamos?',
    'Posso te ajudar com mais alguma coisa?',
    'Tudo certo por aí? Estou aqui se precisar!',
    'Ei, ainda estou aqui caso precise de algo! 👋',
  ],
  2: [
    'Sem problemas se estiver ocupado(a)! Fico por aqui quando precisar.',
    'Sei que o dia é corrido. Quando puder, a gente continua! 😊',
    'Fique à vontade pra responder quando der!',
    'Entendo que pode estar ocupado(a). Continuo disponível aqui!',
    'Tá tudo bem! Quando tiver um minutinho, me avisa.',
  ],
  3: [
    'Quando puder, me avisa que a gente retoma de onde parou! 😉',
    'Vou deixar a conversa salva aqui. É só mandar um "oi" quando quiser continuar!',
    'Fico no aguardo! Qualquer coisa, é só chamar.',
    'A conversa fica salva aqui. Volta quando quiser continuar! 👋',
    'Estarei por aqui. Só me mandar uma mensagem quando tiver tempo!',
  ],
};

// Contract-specific nudge messages
const CONTRACT_NUDGE_MESSAGES = {
  1: [
    'E aí, conseguiu dar uma olhada no contrato? Posso resumir os pontos principais se quiser!',
    'Tudo certo com o e-mail do contrato? Se não encontrou, posso pedir pra reenviar.',
    'Ficou alguma dúvida sobre o contrato? Tô aqui pra ajudar!',
    'Vi que o contrato foi enviado. Quer que eu explique alguma cláusula?',
  ],
  2: [
    'Oi! Passando pra lembrar que seu contrato tá esperando assinatura. Menos de 1 minuto e você já começa a economizar! 💚',
    'Seu desconto está a uma assinatura de distância! Posso ajudar com algo?',
    'Vi que o contrato ainda não foi assinado. Tem algo que posso esclarecer?',
    'Lembrete gentil: seu contrato digital está aguardando. Alguma dúvida sobre as cláusulas?',
  ],
  3: [
    'Olá! Notei que o contrato ainda está pendente. Se tiver qualquer dúvida, estou à disposição!',
    'Última lembrança: seu contrato está aguardando assinatura. Após assinar, a economia começa em até 90 dias!',
    'Posso ajudar com alguma cláusula específica? Tô aqui pra descomplicar 😊',
    'Seu contrato segue disponível para assinatura. Me avisa se precisar de ajuda com algum ponto!',
  ],
};

// Regular nudge delays (in milliseconds)
const DEFAULT_NUDGE_DELAYS = {
  1: 10 * 60 * 1000,  // 10 minutes
  2: 30 * 60 * 1000,  // 30 minutes  
  3: 120 * 60 * 1000, // 2 hours
};

// Contract nudge delays (in milliseconds)
const DEFAULT_CONTRACT_NUDGE_DELAYS = {
  1: 2 * 60 * 60 * 1000,   // 2 hours
  2: 24 * 60 * 60 * 1000,  // 24 hours
  3: 48 * 60 * 60 * 1000,  // 48 hours
};

// ═══════════════════════════════════════════════════════════════
// SMART NUDGE: Detecta dados faltantes e retorna mensagem específica
// ═══════════════════════════════════════════════════════════════
function getMissingFields(dadosColetados: Record<string, unknown> | null): string[] {
  const collected = dadosColetados || {};
  const missing: string[] = [];
  
  // Verifica cada campo obrigatório
  if (!collected.email && !collected.cliente_email) {
    missing.push('email');
  }
  if (!collected.valorFatura && !collected.consumo && !collected.consumo_ou_valor) {
    missing.push('valorFatura');
  }
  if (!collected.distribuidora && !collected.concessionaria) {
    missing.push('distribuidora');
  }
  if (!collected.nome && !collected.cliente_nome) {
    missing.push('nome');
  }
  
  return missing;
}

// ═══════════════════════════════════════════════════════════════
// DOCUMENT CHECK: Verifica documentos faltantes para proposta definitiva
// ═══════════════════════════════════════════════════════════════
function getMissingDocuments(
  arquivosAnexados: string[] | null,
  dadosColetados: Record<string, unknown> | null
): string[] {
  const arquivos = arquivosAnexados || [];
  const dados = dadosColetados || {};
  const missing: string[] = [];
  
  // Verificar documento de identidade
  if (!arquivos.includes('documento_identidade')) {
    missing.push('documento_identidade');
  }
  
  // Verificar fatura
  if (!arquivos.includes('fatura')) {
    missing.push('fatura');
  }
  
  // Verificar contrato social (apenas se for PJ)
  const isPJ = dados.tipoCliente === 'PJ' || 
               !!dados.cnpj || 
               (typeof dados.cpf_cnpj === 'string' && dados.cpf_cnpj.length > 14);
  
  if (isPJ && !arquivos.includes('contrato_social')) {
    missing.push('contrato_social');
  }
  
  return missing;
}

function getDocumentNudgeMessage(
  missingDocs: string[],
  nudgeCount: number,
  clienteNome: string | null
): { message: string; targetField: string | null } {
  if (missingDocs.length === 0) {
    return { message: '', targetField: null };
  }
  
  // Rotacionar entre documentos faltantes baseado no nudge count
  const targetIndex = (nudgeCount - 1) % missingDocs.length;
  const targetDoc = missingDocs[targetIndex];
  
  // Encontrar as mensagens para este documento
  const docNudge = DOCUMENT_COLLECTION_NUDGES.find(d => d.field === targetDoc);
  if (!docNudge) {
    return { message: '', targetField: null };
  }
  
  // Escolher mensagem aleatória
  let message = docNudge.messages[Math.floor(Math.random() * docNudge.messages.length)];
  
  // Personalizar com nome se disponível
  if (clienteNome && Math.random() > 0.4) {
    const firstName = clienteNome.split(' ')[0];
    if (!message.includes(firstName)) {
      message = `${firstName}, ${message.charAt(0).toLowerCase()}${message.slice(1)}`;
    }
  }
  
  return { message, targetField: targetDoc };
}

// ═══════════════════════════════════════════════════════════════
// DOCUMENT URGENCY NUDGE - Mensagens agressivas para coleta de docs
// Usa banco de mensagens específico por número de nudge (urgência progressiva)
// ═══════════════════════════════════════════════════════════════
function getDocumentUrgencyNudgeMessage(
  nudgeCount: number,
  clienteNome: string | null,
  missingDocs: string[]
): { message: string; targetField: string | null } {
  // Limitar ao máximo de nudges disponíveis
  const effectiveNudgeCount = Math.min(nudgeCount, 6);
  const messages = DOCUMENT_URGENCY_NUDGES[effectiveNudgeCount] || DOCUMENT_URGENCY_NUDGES[1];
  
  let message = messages[Math.floor(Math.random() * messages.length)];
  
  // Personalizar com nome se disponível
  if (clienteNome && Math.random() > 0.3) {
    const firstName = clienteNome.split(' ')[0];
    if (!message.includes(firstName)) {
      message = `${firstName}, ${message.charAt(0).toLowerCase()}${message.slice(1)}`;
    }
  }
  
  // Adicionar indicação do documento específico em alguns casos
  if (missingDocs.length === 1 && Math.random() > 0.5) {
    const docName = missingDocs[0] === 'documento_identidade' ? 'RG/CNH' : 
                    missingDocs[0] === 'fatura' ? 'fatura de luz' : 
                    missingDocs[0] === 'contrato_social' ? 'contrato social' : 'documento';
    message = message.replace('documentos', docName).replace('docs', docName);
  }
  
  return { message, targetField: missingDocs[0] || null };
}

function getSmartNudgeMessage(
  dadosColetados: Record<string, unknown> | null,
  clienteNome: string | null,
  nudgeCount: number,
  arquivosAnexados?: string[] | null,
  bitrixStage?: string | null
): { message: string; targetField: string | null; isDocumentNudge?: boolean } {
  
  // ═══════════════════════════════════════════════════════════════
  // PRIORIDADE MÁXIMA: Coleta de documentos no estágio proposta_inicial_enviada
  // Stage UC_9SLRPP = Proposta Inicial (já enviada)
  // REGRA DOS 30 MINUTOS: 80% de queda na conversão após esse tempo!
  // ═══════════════════════════════════════════════════════════════
  if (bitrixStage === 'UC_9SLRPP') {
    const missingDocs = getMissingDocuments(arquivosAnexados || null, dadosColetados);
    
    if (missingDocs.length > 0) {
      // Usar mensagens de urgência progressiva para documentos
      const result = getDocumentUrgencyNudgeMessage(nudgeCount, clienteNome, missingDocs);
      return { ...result, isDocumentNudge: true };
    }
    // Se todos os documentos foram enviados, não precisa de nudge de documento
  }
  
  // Nudges normais para coleta de dados
  const missingFields = getMissingFields(dadosColetados);
  
  if (missingFields.length === 0) {
    // Todos os dados coletados - usa nudge genérico
    return { 
      message: getRandomNudgeMessage(nudgeCount, clienteNome, false),
      targetField: null 
    };
  }
  
  // Encontra o campo faltante de maior prioridade
  const sortedMissing = MISSING_FIELD_NUDGES
    .filter(f => missingFields.includes(f.field))
    .sort((a, b) => a.priority - b.priority);
  
  if (sortedMissing.length === 0) {
    return { 
      message: getRandomNudgeMessage(nudgeCount, clienteNome, false),
      targetField: null 
    };
  }
  
  // Rotaciona entre campos faltantes baseado no nudge count
  const targetIndex = (nudgeCount - 1) % sortedMissing.length;
  const targetFieldInfo = sortedMissing[targetIndex];
  
  // Escolhe mensagem aleatória para o campo
  const messages = targetFieldInfo.messages;
  let message = messages[Math.floor(Math.random() * messages.length)];
  
  // Personaliza com nome se disponível
  if (clienteNome && Math.random() > 0.4) {
    const firstName = clienteNome.split(' ')[0];
    if (!message.includes(firstName)) {
      message = `${firstName}, ${message.charAt(0).toLowerCase()}${message.slice(1)}`;
    }
  }
  
  return { message, targetField: targetFieldInfo.field };
}

function getRandomNudgeMessage(nudgeNumber: number, clienteNome: string | null, isContractNudge: boolean): string {
  const messageBank = isContractNudge ? CONTRACT_NUDGE_MESSAGES : NUDGE_MESSAGES;
  const messages = messageBank[nudgeNumber as keyof typeof messageBank] || messageBank[1];
  const randomMessage = messages[Math.floor(Math.random() * messages.length)];
  
  // Optionally personalize with name
  if (clienteNome && Math.random() > 0.5) {
    const firstName = clienteNome.split(' ')[0];
    return randomMessage.replace(/^(Oi|Ei|E aí|Olá|Tudo certo)/, `$1, ${firstName}`);
  }
  
  return randomMessage;
}

function formatWhatsAppNumber(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('0')) cleaned = cleaned.substring(1);
  if (!cleaned.startsWith('55')) cleaned = '55' + cleaned;
  return cleaned;
}

// Send WhatsApp message via Z-API (calling z-api-send-message edge function)
// Now accepts agentId to fetch correct Z-API credentials
async function sendWhatsAppViaZApi(
  phone: string, 
  message: string,
  agentId: string = 'sofia'
): Promise<{ success: boolean; error?: string }> {
  const formattedPhone = formatWhatsAppNumber(phone);
  
  console.log(`[nudge-scheduler] Sending nudge to ${formattedPhone} via Z-API (agent: ${agentId})`);
  
  try {
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
      console.error(`[nudge-scheduler] Z-API error for agent ${agentId}:`, response.status, errorText);
      return { success: false, error: `Z-API error: ${response.status}` };
    }

    return { success: true };
  } catch (error) {
    console.error('[nudge-scheduler] Error sending via Z-API:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// deno-lint-ignore no-explicit-any
async function getNudgeDelays(supabase: any): Promise<Record<number, number>> {
  const { data: configs } = await supabase
    .from('configuracoes_sistema')
    .select('chave, valor')
    .in('chave', ['nudge_1_delay_minutes', 'nudge_2_delay_minutes', 'nudge_3_delay_minutes']);
  
  const delays = { ...DEFAULT_NUDGE_DELAYS };
  
  if (configs && Array.isArray(configs)) {
    for (const config of configs) {
      const cfg = config as { chave: string; valor: string };
      const minutes = parseInt(cfg.valor);
      if (!isNaN(minutes)) {
        if (cfg.chave === 'nudge_1_delay_minutes') delays[1] = minutes * 60 * 1000;
        if (cfg.chave === 'nudge_2_delay_minutes') delays[2] = minutes * 60 * 1000;
        if (cfg.chave === 'nudge_3_delay_minutes') delays[3] = minutes * 60 * 1000;
      }
    }
  }
  
  return delays;
}

// deno-lint-ignore no-explicit-any
async function getContractNudgeDelays(supabase: any): Promise<Record<number, number>> {
  const { data: configs } = await supabase
    .from('configuracoes_sistema')
    .select('chave, valor')
    .in('chave', ['contract_nudge_1_delay_hours', 'contract_nudge_2_delay_hours', 'contract_nudge_3_delay_hours']);
  
  const delays = { ...DEFAULT_CONTRACT_NUDGE_DELAYS };
  
  if (configs && Array.isArray(configs)) {
    for (const config of configs) {
      const cfg = config as { chave: string; valor: string };
      const hours = parseInt(cfg.valor);
      if (!isNaN(hours)) {
        if (cfg.chave === 'contract_nudge_1_delay_hours') delays[1] = hours * 60 * 60 * 1000;
        if (cfg.chave === 'contract_nudge_2_delay_hours') delays[2] = hours * 60 * 60 * 1000;
        if (cfg.chave === 'contract_nudge_3_delay_hours') delays[3] = hours * 60 * 60 * 1000;
      }
    }
  }
  
  return delays;
}

// deno-lint-ignore no-explicit-any
async function getCustomMessages(supabase: any, key: string): Promise<string[] | null> {
  const { data: config } = await supabase
    .from('configuracoes_sistema')
    .select('valor')
    .eq('chave', key)
    .single();
  
  if (config?.valor) {
    const messages = config.valor.split('\n').filter((m: string) => m.trim() !== '');
    if (messages.length > 0) return messages;
  }
  
  return null;
}

serve(async (req) => {
  const corsHeaders = getStrictCorsHeaders(req);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log('[nudge-scheduler] Starting nudge processing...');
  
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const now = new Date();
    
    // ═══════════════════════════════════════════════════════════════
    // CARREGAR TODAS AS CONFIGURAÇÕES NECESSÁRIAS
    // ═══════════════════════════════════════════════════════════════
    const { data: allConfigData } = await supabase
      .from('configuracoes_sistema')
      .select('chave, valor')
      .in('chave', [
        'sofia_followups_enabled',
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
      console.log('[nudge-scheduler] 🌙 QUIET HOURS ACTIVE - Suppressing all nudges');
      
      // Reagendar nudges pendentes
      const { data: nudgesToReschedule } = await supabase
        .from('chatbot_conversas')
        .select('id')
        .eq('awaiting_response', true)
        .lt('next_nudge_at', now.toISOString())
        .is('ended_at', null);
      
      if (nudgesToReschedule && nudgesToReschedule.length > 0) {
        const nextTime = getNextAvailableTime(quietConfig);
        
        for (const conversa of nudgesToReschedule) {
          await supabase
            .from('chatbot_conversas')
            .update({ next_nudge_at: nextTime.toISOString() })
            .eq('id', conversa.id);
        }
        
        console.log(`[nudge-scheduler] Rescheduled ${nudgesToReschedule.length} nudges to ${nextTime.toISOString()}`);
      }
      
      // Reagendar contract nudges também
      const { data: contractNudgesToReschedule } = await supabase
        .from('chatbot_conversas')
        .select('id')
        .not('contrato_enviado_at', 'is', null)
        .lt('next_contract_nudge_at', now.toISOString())
        .is('contrato_assinado', false);
      
      if (contractNudgesToReschedule && contractNudgesToReschedule.length > 0) {
        const nextTime = getNextAvailableTime(quietConfig);
        
        for (const conversa of contractNudgesToReschedule) {
          await supabase
            .from('chatbot_conversas')
            .update({ next_contract_nudge_at: nextTime.toISOString() })
            .eq('id', conversa.id);
        }
        
        console.log(`[nudge-scheduler] Rescheduled ${contractNudgesToReschedule.length} contract nudges to ${nextTime.toISOString()}`);
      }
      
      return new Response(JSON.stringify({ 
        success: true, 
        quietHours: true,
        rescheduledNudges: nudgesToReschedule?.length || 0,
        rescheduledContractNudges: contractNudgesToReschedule?.length || 0,
        nextAvailableTime: getNextAvailableTime(quietConfig).toISOString(),
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // Check if followups capability is enabled
    const followupsEnabled = configMap.sofia_followups_enabled !== 'false';
    
    if (!followupsEnabled) {
      console.log('[nudge-scheduler] Followups capability DISABLED, skipping all nudges');
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Followups disabled by capability setting',
        skipped: true 
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // Get nudge delays from config
    const nudgeDelays = await getNudgeDelays(supabase);
    const contractNudgeDelays = await getContractNudgeDelays(supabase);
    console.log('[nudge-scheduler] Nudge delays:', nudgeDelays);
    console.log('[nudge-scheduler] Contract nudge delays:', contractNudgeDelays);
    
    const results = {
      processed: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      skipped_cooldown: 0,
      skipped_blacklist: 0,
      skipped_warmup: 0,
      regular_nudges: 0,
      smart_nudges: 0,
      contract_nudges: 0,
    };
    
    // ========================
    // PART 1: REGULAR NUDGES (inclui coleta de documentos com limite estendido)
    // Para documentos: até 6 nudges em intervalos curtos (regra dos 30 min)
    // Para dados normais: até 3 nudges em intervalos maiores
    // ========================
    const { data: regularConversas, error: regularFetchError } = await supabase
      .from('chatbot_conversas')
      .select('id, cliente_telefone, cliente_nome, cliente_email, nudge_count, last_sofia_message_at, contrato_enviado_at, contract_nudge_count, sofia_mode, dados_coletados, arquivos_anexados, bitrix24_stage, detected_objection, objection_cooldown_until, agent_id, contrato_assinado, proposta_id')
      .eq('awaiting_response', true)
      .eq('needs_human_fallback', false)
      .is('ended_at', null)
      .is('human_agent_id', null) // 🚫 NUNCA nudge se atendente humano assumiu
      .is('contrato_enviado_at', null) // Only regular conversations (not in contract mode)
      .neq('contrato_assinado', true) // 🚫 NUNCA nudge se contrato já foi assinado
      .not('sofia_mode', 'eq', 'descartado') // 🚫 NUNCA enviar nudge para leads descartados
      .not('sofia_mode', 'eq', 'paused_for_human') // 🚫 NUNCA nudge quando humano está atendendo
      .not('bitrix24_stage', 'eq', 'JUNK') // 🚫 NUNCA enviar nudge para leads JUNK
      .not('bitrix24_stage', 'eq', 'WON') // 🚫 NUNCA nudge se lead já GANHO
      .lt('next_nudge_at', now.toISOString())
      .lt('nudge_count', 6) // Aumentado para 6 para suportar nudges de documentos agressivos
      .or('objection_cooldown_until.is.null,objection_cooldown_until.lt.' + now.toISOString()) // Skip conversations in cooldown
      .order('next_nudge_at', { ascending: true })
      .limit(50);
    
    if (regularFetchError) {
      console.error('[nudge-scheduler] Error fetching regular conversations:', regularFetchError);
      throw regularFetchError;
    }
    
    console.log(`[nudge-scheduler] Found ${regularConversas?.length || 0} regular conversations needing nudges`);
    
    // ═══════════════════════════════════════════════════════════════
    // 🛑 HUMAN TAKEOVER CHECK - Block ALL phones that are under human control
    // This is the SOURCE OF TRUTH for blocking automations
    // ═══════════════════════════════════════════════════════════════
    const allPhones = (regularConversas || []).map((c: any) => c.cliente_telefone).filter(Boolean);
    const blockedPhones = await getBlockedPhones(supabase, allPhones, 'sofia', 'zapi');
    
    if (blockedPhones.size > 0) {
      console.log(`[nudge-scheduler] 🛑 Blocking ${blockedPhones.size} phones due to active human takeover`);
    }
    
    // ═══════════════════════════════════════════════════════════════
    // RATE LIMITING - Evitar disparo em massa e bloqueio pela Meta
    // ═══════════════════════════════════════════════════════════════
    const totalRegularConversas = regularConversas?.length || 0;
    const rateLimitConfig = getAppropriateConfig(totalRegularConversas, totalRegularConversas > 20);
    console.log(`[nudge-scheduler] 🚦 Rate limiting: ${totalRegularConversas} messages, base delay ${rateLimitConfig.baseDelayMs}ms`);
    
    let messageIndex = 0;
    for (const conversa of (regularConversas || []) as ConversaForNudge[]) {
      results.processed++;
      
      // ═══════════════════════════════════════════════════════════════
      // 🛑 ABSOLUTE FIRST CHECK: Human takeover blocks EVERYTHING
      // ═══════════════════════════════════════════════════════════════
      const normalizedPhone = normalizeTakeoverPhone(conversa.cliente_telefone);
      if (blockedPhones.has(normalizedPhone)) {
        console.log(`[nudge-scheduler] 🛑 BLOCKED: ${conversa.cliente_telefone} - Active human takeover`);
        results.skipped++;
        // Clear any pending nudge to prevent retry loops
        await supabase
          .from('chatbot_conversas')
          .update({ next_nudge_at: null, awaiting_response: false })
          .eq('id', conversa.id);
        continue;
      }
      
      try {
        // ═══════════════════════════════════════════════════════════════
        // 🛡️ ANTI-SPAM GUARDS: Daily limit + Cross-conversation takeover
        // ═══════════════════════════════════════════════════════════════
        const guardResult = await runAntiSpamGuards(supabase, conversa.id, conversa.cliente_telefone);
        if (!guardResult.allowed) {
          console.log(`[nudge-scheduler] 🛡️ GUARD BLOCKED: ${conversa.cliente_telefone} - ${guardResult.reason}`);
          if (guardResult.crossConvTakeover?.blocked) {
            await supabase
              .from('chatbot_conversas')
              .update({ next_nudge_at: null, awaiting_response: false, sofia_mode: 'paused_for_human' })
              .eq('id', conversa.id);
          }
          results.skipped++;
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
          last_message_at: conversa.last_sofia_message_at,
          last_human_message_at: null,
          ended_at: null, // Already filtered in query
          contrato_enviado_at: conversa.contrato_enviado_at,
          bitrix24_stage: conversa.bitrix24_stage,
          contrato_assinado: conversa.contrato_assinado,
          event_conversion: null,
          event_drop: null,
          dados_coletados: conversa.dados_coletados,
          has_simulation: null,
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
        
        const eligibility = checkAutomationEligibility(eligibilityContext, 'nudge', configCache);
        logEligibility('nudge-scheduler', conversa.id, conversa.cliente_telefone, eligibility);
        
        if (!eligibility.eligible) {
          // Take action based on recommended action
          if (eligibility.action === 'cleanup') {
            // Disqualified lead - clean up automations
            await supabase
              .from('chatbot_conversas')
              .update({
                sofia_mode: eligibilityContext.sofia_mode === 'descartado' ? 'descartado' : eligibilityContext.sofia_mode,
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
              .update({ next_nudge_at: rescheduleTime.toISOString() })
              .eq('id', conversa.id);
          }
          // Skip (no action needed) is handled by continuing
          
          results.skipped++;
          continue;
        }
        
        // ═══════════════════════════════════════════════════════════════
        // HARD STOP: If Proposta Definitiva is already ready, NEVER send
        // document nudges. Check proposta.definitive_ready_at via proposta_id.
        // ═══════════════════════════════════════════════════════════════
        const conversaPropostaId = (conversa as any).proposta_id;
        if (conversaPropostaId && conversa.bitrix24_stage === 'UC_9SLRPP') {
          // Document nudges are triggered by stage UC_9SLRPP, but if definitive
          // is already ready, we should NOT send more document requests
          const { data: propostaData } = await supabase
            .from('propostas_assinantes')
            .select('definitive_ready_at')
            .eq('id', conversaPropostaId)
            .maybeSingle();
          
          if (propostaData?.definitive_ready_at) {
            console.log(`[nudge-scheduler] 🚫 SKIP: ${conversa.cliente_telefone} - Proposta Definitiva already ready (${propostaData.definitive_ready_at}), no document nudge needed`);
            // Clear nudges as documents are done
            await supabase
              .from('chatbot_conversas')
              .update({
                awaiting_response: false,
                next_nudge_at: null,
              })
              .eq('id', conversa.id);
            results.skipped++;
            continue;
          }
        }

        // ═══════════════════════════════════════════════════════════════
        // PAUSE FOLLOWUP CHECK - Client requested time to analyze
        // ═══════════════════════════════════════════════════════════════
        const dadosColetados = conversa.dados_coletados || {};
        if ((dadosColetados as any).pauseFollowupRequested === true) {
          console.log(`[nudge-scheduler] ⏸️ Skipping ${conversa.cliente_telefone}: client requested pause (vou analisar)`);
          results.skipped++;
          // Extend nudge time to 48h instead of blocking forever
          const nextNudgeIn48h = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
          await supabase
            .from('chatbot_conversas')
            .update({ next_nudge_at: nextNudgeIn48h })
            .eq('id', conversa.id);
          continue;
        }
        
        // ═══════════════════════════════════════════════════════════════
        // ANTI-SPAM CHECK - Verify cooldown and blacklist before sending
        // ═══════════════════════════════════════════════════════════════
        const antiSpamCheck = await performAntiSpamCheck(supabase, conversa.cliente_telefone, conversa.id);
        if (!antiSpamCheck.canSend) {
          console.log(`[nudge-scheduler] 🚫 Skipping ${conversa.cliente_telefone}: ${antiSpamCheck.reason}`);
          
          if (antiSpamCheck.reason?.includes('blacklist')) {
            results.skipped_blacklist++;
          } else if (antiSpamCheck.reason?.includes('cooldown') || antiSpamCheck.reason?.includes('objeção')) {
            results.skipped_cooldown++;
          } else if (antiSpamCheck.reason?.includes('warm-up') || antiSpamCheck.reason?.includes('limite')) {
            results.skipped_warmup++;
            // Stop processing more messages if warm-up limit reached
            console.log(`[nudge-scheduler] ⚠️ Warm-up limit reached, stopping batch processing`);
            break;
          }
          
          results.skipped++;
          continue;
        }
        
        const newNudgeCount = conversa.nudge_count + 1;
        
        // ═══════════════════════════════════════════════════════════════
        // SMART NUDGE: Usa mensagem específica para dados/documentos faltantes
        // Agora inclui nudges de documentos para o estágio proposta_inicial_enviada
        // ═══════════════════════════════════════════════════════════════
        const smartNudge = getSmartNudgeMessage(
          conversa.dados_coletados,
          conversa.cliente_nome,
          newNudgeCount,
          conversa.arquivos_anexados,
          conversa.bitrix24_stage
        );
        
        let nudgeMessage = smartNudge.message;
        const targetField = smartNudge.targetField;
        
        // Se há mensagens customizadas configuradas, usa elas como fallback
        // apenas se não houver campo faltante específico
        if (!targetField) {
          const customMessages = await getCustomMessages(supabase, `nudge_${newNudgeCount}_messages`);
          if (customMessages && customMessages.length > 0) {
            nudgeMessage = customMessages[Math.floor(Math.random() * customMessages.length)];
            if (conversa.cliente_nome && Math.random() > 0.5) {
              const firstName = conversa.cliente_nome.split(' ')[0];
              nudgeMessage = nudgeMessage.replace(/^(Oi|Ei|Tudo certo)/, `$1, ${firstName}`);
            }
          }
        }
        
        const nudgeType = targetField ? `SMART_NUDGE:${targetField}` : 'NUDGE';
        
        // ═══════════════════════════════════════════════════════════════
        // RATE LIMITING - Aplicar delay antes do envio
        // ═══════════════════════════════════════════════════════════════
        const delay = calculateDelay(messageIndex, totalRegularConversas, rateLimitConfig);
        if (delay > 0) {
          console.log(`[nudge-scheduler] 🕐 Rate limit: waiting ${delay}ms before message ${messageIndex + 1}/${totalRegularConversas}`);
          await wait(delay);
        }
        messageIndex++;
        
        console.log(`[nudge-scheduler] Sending ${nudgeType} #${newNudgeCount} to ${conversa.cliente_telefone}${targetField ? ` (missing: ${targetField})` : ''}`);
        
        // Use agent_id from conversation to fetch correct Z-API credentials
        const agentId = (conversa as any).agent_id || 'sofia';
        const sendResult = await sendWhatsAppViaZApi(conversa.cliente_telefone, nudgeMessage, agentId);
        
        if (!sendResult.success) {
          console.error(`[nudge-scheduler] Failed to send nudge to ${conversa.cliente_telefone}:`, sendResult.error);
          results.failed++;
          continue;
        }
        
        // Save nudge message to chat history (with smart nudge indicator)
        await supabase.from('chatbot_mensagens').insert({
          conversa_id: conversa.id,
          role: 'assistant',
          content: `[${nudgeType} ${newNudgeCount}] ${nudgeMessage}`,
        });
        
        // ═══════════════════════════════════════════════════════════════
        // DELAYS DINÂMICOS: Documentos usam delays agressivos, outros usam padrão
        // ═══════════════════════════════════════════════════════════════
        const isDocumentNudge = smartNudge.isDocumentNudge === true;
        const nextNudgeNumber = newNudgeCount + 1;
        
        let nextNudgeDelay: number | null = null;
        let maxNudges = 3; // padrão para nudges normais
        
        if (isDocumentNudge) {
          // Documentos: até 6 nudges com delays agressivos
          maxNudges = 6;
          nextNudgeDelay = nextNudgeNumber <= 6 
            ? (DEFAULT_DOCUMENT_NUDGE_DELAYS[nextNudgeNumber as keyof typeof DEFAULT_DOCUMENT_NUDGE_DELAYS] || null)
            : null;
        } else {
          // Nudges normais: até 3 com delays configuráveis
          nextNudgeDelay = nextNudgeNumber <= 3 ? nudgeDelays[nextNudgeNumber] : null;
        }
        
        const nextNudgeAt = nextNudgeDelay ? new Date(now.getTime() + nextNudgeDelay).toISOString() : null;
        
        // Update conversation
        await supabase
          .from('chatbot_conversas')
          .update({
            nudge_count: newNudgeCount,
            next_nudge_at: nextNudgeAt,
            awaiting_response: newNudgeCount < maxNudges,
            last_message_at: now.toISOString(),
          })
          .eq('id', conversa.id);
        
        // ═══════════════════════════════════════════════════════════════
        // MOVE TO "LEAD FRIO" AFTER 3 NUDGES WITHOUT RESPONSE
        // ═══════════════════════════════════════════════════════════════
        // Mover para Lead Frio apenas quando atingir o máximo de nudges (3 para dados, 6 para docs)
        const shouldMoveToLeadFrio = isDocumentNudge ? newNudgeCount >= 6 : newNudgeCount >= 3;
        
        if (shouldMoveToLeadFrio) {
          console.log(`[nudge-scheduler] Max nudges (${newNudgeCount}) sent to ${conversa.cliente_telefone} - moving to Lead Frio`);
          
          // Get Bitrix24 configuration
          const { data: bitrixConfig } = await supabase
            .from('configuracoes_sistema')
            .select('chave, valor')
            .or('chave.eq.bitrix24_webhook_url,chave.eq.bitrix24_enabled,chave.eq.bitrix24_stage_lead_frio');
          
          const config: Record<string, string> = {};
          bitrixConfig?.forEach((c: { chave: string; valor: string }) => {
            config[c.chave] = c.valor;
          });
          
          const bitrix24Url = config.bitrix24_webhook_url;
          const bitrix24Enabled = config.bitrix24_enabled === 'true';
          
          // Get lead ID from conversation
          const { data: conversaData } = await supabase
            .from('chatbot_conversas')
            .select('bitrix24_lead_id')
            .eq('id', conversa.id)
            .single();
          
          if (bitrix24Url && bitrix24Enabled && conversaData?.bitrix24_lead_id) {
            const leadId = conversaData.bitrix24_lead_id;
            
            // Move lead to "Lead Frio - Mail MKT" stage (use config or default)
            const LEAD_FRIO_STAGE_ID = config.bitrix24_stage_lead_frio || 'UC_LEAD_FRIO';
            
            try {
              await fetch(`${bitrix24Url}/crm.lead.update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                  id: leadId, 
                  fields: { STATUS_ID: LEAD_FRIO_STAGE_ID } 
                }),
              });
              
              // Add timeline comment
              await fetch(`${bitrix24Url}/crm.timeline.comment.add`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  fields: {
                    ENTITY_ID: leadId,
                    ENTITY_TYPE: 'lead',
                    COMMENT: `🔴 Lead movido para "Lead Frio - Mail MKT"\n\nMotivo: Cliente não respondeu após 3 tentativas de contato via WhatsApp.\nData: ${now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
                  },
                }),
              });
              
              // Update conversation with new stage
              await supabase
                .from('chatbot_conversas')
                .update({ 
                  bitrix24_stage: LEAD_FRIO_STAGE_ID,
                  sofia_mode: 'lead_frio',
                  ended_at: now.toISOString(),
                })
                .eq('id', conversa.id);
              
              console.log(`[nudge-scheduler] Lead ${leadId} moved to Lead Frio successfully`);
              
            } catch (bitrixError) {
              console.error(`[nudge-scheduler] Error moving lead ${leadId} to Lead Frio:`, bitrixError);
            }
          }
        }
        
        results.sent++;
        results.regular_nudges++;
        if (targetField) results.smart_nudges++;
        console.log(`[nudge-scheduler] ${nudgeType} #${newNudgeCount} sent to ${conversa.cliente_telefone}`);
        
      } catch (convError) {
        console.error(`[nudge-scheduler] Error processing regular conversation ${conversa.id}:`, convError);
        results.failed++;
      }
    }
    
    // ========================
    // PART 2: CONTRACT NUDGES
    // ========================
    const { data: contractConversas, error: contractFetchError } = await supabase
      .from('chatbot_conversas')
      .select('id, cliente_telefone, cliente_nome, nudge_count, last_sofia_message_at, contrato_enviado_at, contract_nudge_count, sofia_mode, agent_id, contrato_assinado')
      .eq('sofia_mode', 'contract_closer')
      .eq('contrato_assinado', false) // 🚫 NUNCA nudge se contrato já foi assinado
      .eq('needs_human_fallback', false)
      .is('ended_at', null)
      .is('human_agent_id', null) // 🚫 NUNCA nudge se atendente humano assumiu
      .not('contrato_enviado_at', 'is', null)
      .not('bitrix24_stage', 'eq', 'JUNK') // 🚫 NUNCA enviar nudge para leads JUNK
      .not('bitrix24_stage', 'eq', 'WON') // 🚫 NUNCA nudge se lead já GANHO
      .lt('next_contract_nudge_at', now.toISOString())
      .lt('contract_nudge_count', 3)
      .order('next_contract_nudge_at', { ascending: true })
      .limit(50);
    
    if (contractFetchError) {
      console.error('[nudge-scheduler] Error fetching contract conversations:', contractFetchError);
      throw contractFetchError;
    }
    
    console.log(`[nudge-scheduler] Found ${contractConversas?.length || 0} contract conversations needing nudges`);
    
    for (const conversa of (contractConversas || []) as unknown as Array<{id: string; cliente_telefone: string; cliente_nome: string | null; nudge_count: number; last_sofia_message_at: string; contrato_enviado_at: string | null; contract_nudge_count: number | null; sofia_mode: string | null; agent_id: string}>) {
      results.processed++;
      
      try {
        const newContractNudgeCount = (conversa.contract_nudge_count || 0) + 1;
        
        // Check for custom contract messages
        const customMessages = await getCustomMessages(supabase, `contract_nudge_${newContractNudgeCount}_messages`);
        let nudgeMessage: string;
        
        if (customMessages && customMessages.length > 0) {
          nudgeMessage = customMessages[Math.floor(Math.random() * customMessages.length)];
          // Personalize
          if (conversa.cliente_nome && Math.random() > 0.5) {
            const firstName = conversa.cliente_nome.split(' ')[0];
            nudgeMessage = nudgeMessage.replace(/^(Oi|E aí|Olá)/, `$1, ${firstName}`);
          }
        } else {
          nudgeMessage = getRandomNudgeMessage(newContractNudgeCount, conversa.cliente_nome, true);
        }
        
        console.log(`[nudge-scheduler] Sending contract nudge #${newContractNudgeCount} to ${conversa.cliente_telefone}`);
        
        // Use agent_id from conversation to fetch correct Z-API credentials
        const agentId = conversa.agent_id || 'sofia';
        const sendResult = await sendWhatsAppViaZApi(conversa.cliente_telefone, nudgeMessage, agentId);
        
        if (!sendResult.success) {
          console.error(`[nudge-scheduler] Failed to send contract nudge to ${conversa.cliente_telefone}:`, sendResult.error);
          results.failed++;
          continue;
        }
        
        // Save nudge message to chat history
        await supabase.from('chatbot_mensagens').insert({
          conversa_id: conversa.id,
          role: 'assistant',
          content: `[CONTRACT_NUDGE ${newContractNudgeCount}] ${nudgeMessage}`,
        });
        
        // Calculate next contract nudge time
        const nextNudgeNumber = newContractNudgeCount + 1;
        const nextNudgeDelay = nextNudgeNumber <= 3 ? contractNudgeDelays[nextNudgeNumber] : null;
        const nextContractNudgeAt = nextNudgeDelay ? new Date(now.getTime() + nextNudgeDelay).toISOString() : null;
        
        // Update conversation
        await supabase
          .from('chatbot_conversas')
          .update({
            contract_nudge_count: newContractNudgeCount,
            next_contract_nudge_at: nextContractNudgeAt,
            last_message_at: now.toISOString(),
            last_sofia_message_at: now.toISOString(),
            awaiting_response: true,
          })
          .eq('id', conversa.id);
        
        results.sent++;
        results.contract_nudges++;
        console.log(`[nudge-scheduler] Contract nudge #${newContractNudgeCount} sent to ${conversa.cliente_telefone}`);
        
        // If this was the 3rd contract nudge, notify admins
        if (newContractNudgeCount >= 3) {
          console.log(`[nudge-scheduler] Max contract nudges reached for ${conversa.id}, notifying admins`);
          
          await supabase.from('admin_notifications').insert({
            admin_user_id: null,
            title: '⚠️ Contrato não assinado após 3 nudges',
            message: `Cliente ${conversa.cliente_nome || conversa.cliente_telefone} recebeu 3 lembretes sobre o contrato mas ainda não assinou.`,
            type: 'contract_pending',
            entity_type: 'chatbot_conversa',
            entity_id: conversa.id,
            created_by_nome: getNotificationAuthorName(conversa.agent_id, null, 'Nudge de Contrato'),
          });
        }
        
      } catch (convError) {
        console.error(`[nudge-scheduler] Error processing contract conversation ${conversa.id}:`, convError);
        results.failed++;
      }
    }
    
    console.log(`[nudge-scheduler] Completed. Processed: ${results.processed}, Sent: ${results.sent} (Regular: ${results.regular_nudges}, Smart: ${results.smart_nudges}, Contract: ${results.contract_nudges}), Failed: ${results.failed}`);
    
    // ========================
    // PART 3: HIGH-VALUE LEAD ALERTS (REGRA DOS 30 MINUTOS)
    // Alerta admins quando leads de alto valor não enviam documentos em 30 minutos
    // ========================
    const highValueAlerts = { processed: 0, alerted: 0 };
    
    try {
      // Buscar configuração de valor mínimo para alerta (padrão: R$ 500)
      const { data: configData } = await supabase
        .from('configuracoes_sistema')
        .select('valor')
        .eq('chave', 'high_value_lead_threshold')
        .single();
      
      const HIGH_VALUE_THRESHOLD = configData?.valor ? parseFloat(configData.valor) : 500;
      
      // Timestamp de 30 minutos atrás
      const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
      
      // Buscar conversas no estágio de proposta_inicial_enviada que:
      // 1. Estão há mais de 30 minutos sem receber documentos
      // 2. Ainda não têm documentos anexados
      // 3. Ainda não foram alertadas (usando campo auxiliar ou notificação existente)
      const { data: highValueLeads, error: hvError } = await supabase
        .from('chatbot_conversas')
        .select(`
          id, 
          cliente_telefone, 
          cliente_nome, 
          cliente_email,
          dados_coletados,
          arquivos_anexados,
          bitrix24_lead_id,
          bitrix24_stage,
          created_at,
          last_message_at,
          agent_id
        `)
        .eq('bitrix24_stage', 'UC_9SLRPP') // Proposta Inicial Enviada
        .is('ended_at', null)
        .is('contrato_enviado_at', null) // Ainda não enviou proposta definitiva
        .lt('last_message_at', thirtyMinutesAgo) // Última mensagem há mais de 30 min
        .limit(20);
      
      if (hvError) {
        console.error('[nudge-scheduler] Error fetching high-value leads:', hvError);
      } else {
        console.log(`[nudge-scheduler] Checking ${highValueLeads?.length || 0} potential high-value leads for 30-min alert`);
        
        for (const lead of (highValueLeads || [])) {
          highValueAlerts.processed++;
          
          // Verificar se é high-value com base no valor da fatura
          const dadosColetados = lead.dados_coletados as Record<string, unknown> | null;
          const valorFatura = dadosColetados?.valorFatura as number | null;
          
          if (!valorFatura || valorFatura < HIGH_VALUE_THRESHOLD) {
            continue; // Não é lead de alto valor
          }
          
          // Verificar se já tem documentos anexados
          const arquivos = lead.arquivos_anexados as string[] | null;
          if (arquivos && arquivos.length > 0) {
            continue; // Já tem documentos, não precisa alertar
          }
          
          // Verificar se já existe notificação recente para este lead
          const { data: existingNotification } = await supabase
            .from('admin_notifications')
            .select('id')
            .eq('entity_id', lead.id)
            .eq('type', 'high_value_docs_pending')
            .gte('created_at', new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()) // Últimas 24h
            .limit(1);
          
          if (existingNotification && existingNotification.length > 0) {
            continue; // Já foi notificado nas últimas 24h
          }
          
          // Calcular tempo sem resposta
          const lastMessageTime = new Date(lead.last_message_at as string);
          const minutesSinceLastMessage = Math.floor((now.getTime() - lastMessageTime.getTime()) / (1000 * 60));
          
          // Criar alerta para admins - usando identidade do agente da conversa
          const leadAgentId = (lead as any).agent_id || 'sofia';
          const { error: notifyError } = await supabase.from('admin_notifications').insert({
            admin_user_id: null, // Notifica todos os admins
            title: '🚨 Lead de Alto Valor sem Documentos',
            message: `Cliente ${lead.cliente_nome || lead.cliente_telefone} (fatura R$ ${valorFatura.toFixed(2)}) está há ${minutesSinceLastMessage} min sem enviar documentos! Risco de perda: conversão cai 80% após 30 min.`,
            type: 'high_value_docs_pending',
            entity_type: 'chatbot_conversa',
            entity_id: lead.id,
            created_by_nome: getNotificationAuthorName(leadAgentId, null, 'Alerta de Alto Valor'),
          });
          
          if (notifyError) {
            console.error(`[nudge-scheduler] Error creating high-value alert for ${lead.id}:`, notifyError);
          } else {
            highValueAlerts.alerted++;
            console.log(`[nudge-scheduler] 🚨 HIGH-VALUE ALERT: ${lead.cliente_nome || lead.cliente_telefone} (R$ ${valorFatura}) - ${minutesSinceLastMessage} min sem docs`);
          }
        }
        
        console.log(`[nudge-scheduler] High-value alerts: Processed ${highValueAlerts.processed}, Alerted ${highValueAlerts.alerted}`);
      }
    } catch (hvError) {
      console.error('[nudge-scheduler] Error in high-value lead alerting:', hvError);
    }
    
    return new Response(JSON.stringify({
      status: 'success',
      results: {
        ...results,
        high_value_alerts: highValueAlerts,
      },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    console.error('[nudge-scheduler] Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
