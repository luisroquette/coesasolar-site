/**
 * Disqualification Messages Module
 * 
 * Provides database-driven disqualification messages for different rejection reasons.
 * Messages are cached for 10 minutes to reduce database calls.
 */

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type MotivoDescarte = 
  | 'distribuidora_nao_atendida' 
  | 'distribuidora_nao_reconhecida'
  | 'grupo_a' 
  | 'tarifa_social' 
  | 'outro';

export interface DisqualificationMessage {
  motivo: MotivoDescarte;
  motivo_label: string;
  mensagem_cliente: string;
  mensagem_crm: string;
  emoji: string;
  is_active: boolean;
}

// ═══════════════════════════════════════════════════════════════
// CACHE
// ═══════════════════════════════════════════════════════════════

interface DisqualificationCache {
  messages: Map<MotivoDescarte, DisqualificationMessage>;
  loadedAt: number;
}

let disqualificationCache: DisqualificationCache | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// ═══════════════════════════════════════════════════════════════
// FALLBACK MESSAGES (used if DB is unavailable)
// ═══════════════════════════════════════════════════════════════

const FALLBACK_MESSAGES: Record<MotivoDescarte, DisqualificationMessage> = {
  grupo_a: {
    motivo: 'grupo_a',
    motivo_label: 'Cliente do Grupo A (alta tensão)',
    mensagem_cliente: `Entendi! Você está no *Grupo A* (alta tensão) 🏭

Infelizmente, nosso modelo atual atende exclusivamente clientes do *Grupo B* (baixa tensão/residencial e pequenos comércios).

Mas não se preocupe! Posso anotar seu contato para quando expandirmos para o Grupo A. Deseja que eu faça isso? 📋`,
    mensagem_crm: 'Cliente do Grupo A (alta tensão) - fora do escopo',
    emoji: '🏭',
    is_active: true,
  },
  tarifa_social: {
    motivo: 'tarifa_social',
    motivo_label: 'Cliente com tarifa social/baixa renda',
    mensagem_cliente: `Notei que você conta com o benefício da *Tarifa Social*! 🏠

Esse é um ótimo programa que já oferece um desconto significativo na sua conta de energia. Nosso modelo de economia por assinatura solar não se aplica a contas com esse benefício.

Ficamos felizes que você já tem esse apoio! Se sua situação mudar no futuro, pode nos chamar. 💚`,
    mensagem_crm: 'Cliente com tarifa social/baixa renda',
    emoji: '🏠',
    is_active: true,
  },
  distribuidora_nao_atendida: {
    motivo: 'distribuidora_nao_atendida',
    motivo_label: 'Distribuidora não atendida pela COESA',
    mensagem_cliente: `Hmm... Sentimos muito, mas ainda não atendemos a sua região. 😔

A distribuidora que você mencionou está no nosso plano de expansão e, em breve, estaremos por aí!

Posso salvar seu contato e te chamar quando iniciarmos as operações na sua área? 📋`,
    mensagem_crm: 'Distribuidora não atendida pela COESA',
    emoji: '😔',
    is_active: true,
  },
  distribuidora_nao_reconhecida: {
    motivo: 'distribuidora_nao_reconhecida',
    motivo_label: 'Distribuidora não reconhecida',
    mensagem_cliente: `Hmm... Não reconheci essa distribuidora. 🤔

Se você for de outra região, posso salvar seu contato para avisá-lo quando expandirmos! 📋`,
    mensagem_crm: 'Distribuidora não reconhecida pelo sistema',
    emoji: '🤔',
    is_active: true,
  },
  outro: {
    motivo: 'outro',
    motivo_label: 'Outro motivo de desqualificação',
    mensagem_cliente: `Infelizmente não conseguimos prosseguir com sua solicitação neste momento.

Mas seu contato ficará salvo, e entraremos em contato assim que pudermos atendê-lo! 📋`,
    mensagem_crm: 'Outro motivo de desqualificação',
    emoji: '🚫',
    is_active: true,
  },
};

// ═══════════════════════════════════════════════════════════════
// LOADER
// ═══════════════════════════════════════════════════════════════

/**
 * Load disqualification messages from database with caching
 */
export async function loadDisqualificationMessages(
  supabase: any,
  forceRefresh = false
): Promise<Map<MotivoDescarte, DisqualificationMessage>> {
  const now = Date.now();

  // Return cached if valid
  if (!forceRefresh && disqualificationCache && (now - disqualificationCache.loadedAt) < CACHE_TTL_MS) {
    console.log('[disqualification-messages] Using cached messages');
    return disqualificationCache.messages;
  }

  try {
    console.log('[disqualification-messages] Loading from database...');

    const { data, error } = await supabase
      .from('mensagens_desqualificacao')
      .select('*')
      .eq('is_active', true);

    if (error) {
      console.error('[disqualification-messages] Database error:', error);
      return getFallbackMap();
    }

    if (!data || data.length === 0) {
      console.warn('[disqualification-messages] No messages found, using fallbacks');
      return getFallbackMap();
    }

    const messages = new Map<MotivoDescarte, DisqualificationMessage>();
    for (const row of data) {
      messages.set(row.motivo as MotivoDescarte, {
        motivo: row.motivo,
        motivo_label: row.motivo_label,
        mensagem_cliente: row.mensagem_cliente,
        mensagem_crm: row.mensagem_crm,
        emoji: row.emoji || '🚫',
        is_active: row.is_active,
      });
    }

    // Update cache
    disqualificationCache = {
      messages,
      loadedAt: now,
    };

    console.log(`[disqualification-messages] Loaded ${messages.size} messages from DB`);
    return messages;

  } catch (err) {
    console.error('[disqualification-messages] Error loading:', err);
    return getFallbackMap();
  }
}

function getFallbackMap(): Map<MotivoDescarte, DisqualificationMessage> {
  const map = new Map<MotivoDescarte, DisqualificationMessage>();
  for (const [key, value] of Object.entries(FALLBACK_MESSAGES)) {
    map.set(key as MotivoDescarte, value);
  }
  return map;
}

// ═══════════════════════════════════════════════════════════════
// GETTERS
// ═══════════════════════════════════════════════════════════════

/**
 * Get the client-facing message for a disqualification reason
 */
export async function getClientMessage(
  supabase: any,
  motivo: MotivoDescarte,
  variables?: Record<string, string>
): Promise<string> {
  const messages = await loadDisqualificationMessages(supabase);
  const msg = messages.get(motivo) || FALLBACK_MESSAGES[motivo] || FALLBACK_MESSAGES.outro;
  
  let result = msg.mensagem_cliente;
  
  // Replace variables if provided
  if (variables) {
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }
  }
  
  return result;
}

/**
 * Get the CRM label for a disqualification reason
 */
export async function getCRMLabel(
  supabase: any,
  motivo: MotivoDescarte
): Promise<string> {
  const messages = await loadDisqualificationMessages(supabase);
  const msg = messages.get(motivo) || FALLBACK_MESSAGES[motivo] || FALLBACK_MESSAGES.outro;
  return msg.mensagem_crm;
}

/**
 * Get the full message object for a disqualification reason
 */
export async function getDisqualificationMessage(
  supabase: any,
  motivo: MotivoDescarte
): Promise<DisqualificationMessage> {
  const messages = await loadDisqualificationMessages(supabase);
  return messages.get(motivo) || FALLBACK_MESSAGES[motivo] || FALLBACK_MESSAGES.outro;
}

/**
 * Build CRM comment for lead disqualification
 */
export async function buildCRMComment(
  supabase: any,
  motivo: MotivoDescarte,
  agentName: string,
  detalhes?: string
): Promise<string> {
  const msg = await getDisqualificationMessage(supabase, motivo);
  
  return `🚫 Lead movido para "Lead Descartado" automaticamente

📋 Motivo: ${msg.mensagem_crm}
${detalhes ? `📝 Detalhes: ${detalhes}` : ''}

⏰ Data: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
🤖 Agente: ${agentName}`;
}

/**
 * Clear the message cache (useful for testing or after updates)
 */
export function clearDisqualificationCache(): void {
  disqualificationCache = null;
  console.log('[disqualification-messages] Cache cleared');
}

// ═══════════════════════════════════════════════════════════════
// LEGACY COMPATIBILITY
// ═══════════════════════════════════════════════════════════════

/**
 * Get motivo texto map for backwards compatibility
 */
export function getMotivoTextoMap(): Record<MotivoDescarte, string> {
  return {
    distribuidora_nao_atendida: FALLBACK_MESSAGES.distribuidora_nao_atendida.mensagem_crm,
    distribuidora_nao_reconhecida: FALLBACK_MESSAGES.distribuidora_nao_reconhecida.mensagem_crm,
    grupo_a: FALLBACK_MESSAGES.grupo_a.mensagem_crm,
    tarifa_social: FALLBACK_MESSAGES.tarifa_social.mensagem_crm,
    outro: FALLBACK_MESSAGES.outro.mensagem_crm,
  };
}
