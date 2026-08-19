// src/lib/blog/lead-capture.ts
// Captura de leads: o formulário entrega para um PLUG de CRM (decisão de
// produto: nunca tabela própria — o dono da instalação escolhe o destino).
// Cada plug recebe o mesmo payload e decide o que fazer com ele.
import { AUTOBLOG_PROFILE } from '@/lib/autoblog-profile';

export interface LeadPayload {
  name: string;
  email: string;
  source: string; // ex.: "/blog/como-avaliar-solucao-b2b"
  keyword?: string | null;
  note?: string | null; // honeypot — campo invisível que só bots preenchem
}

export interface LeadValidation {
  ok: boolean;
  errors: string[];
}

export function validateLead(input: LeadPayload): LeadValidation {
  const errors: string[] = [];
  const name = (input.name ?? '').trim();
  const email = (input.email ?? '').trim();

  if (name.length < 2 || name.length > 80) errors.push('name_invalid');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 120) {
    errors.push('email_invalid');
  }
  return { ok: errors.length === 0, errors };
}

export function isHoneypot(input: LeadPayload): boolean {
  return !!input.note && input.note.trim().length > 0;
}

export type LeadDestination = (lead: LeadPayload) => Promise<void>;

/** 1ª integração de CRM: cria um card na lista do Trello. */
async function trelloCreateCard(lead: LeadPayload): Promise<void> {
  const key = process.env.TRELLO_API_KEY;
  const token = process.env.TRELLO_TOKEN;
  const listId = process.env.TRELLO_LIST_ID;
  if (!key || !token || !listId) throw new Error('trello_envs_missing');

  const desc = [
    `Fonte: ${lead.source}`,
    lead.keyword ? `Keyword: ${lead.keyword}` : null,
    `Data: ${new Date().toISOString()}`,
  ]
    .filter(Boolean)
    .join('\n');

  const response = await fetch('https://api.trello.com/1/cards', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `${lead.name} — ${lead.email}`,
      desc,
      idList: listId,
      key,
      token,
    }),
  });
  if (!response.ok) throw new Error(`trello_http_${response.status}`);
}

/** Registry de plugs de CRM — novo destino = nova entrada aqui + envs no .env. */
export const LEAD_PLUGINS: Record<string, LeadDestination> = {
  trello: trelloCreateCard,
};

export function resolveLeadPlugin(destination: string): LeadDestination | null {
  return LEAD_PLUGINS[destination] ?? null;
}

/** Entrega o lead ao destino configurado no perfil. Sem plug → erro explícito. */
export async function deliverLead(lead: LeadPayload): Promise<void> {
  const destination = AUTOBLOG_PROFILE.integrations.leadCapture.destination;
  const plugin = resolveLeadPlugin(destination);
  if (!plugin) throw new Error(`lead_destination_not_configured: ${destination}`);
  await plugin(lead);
}
