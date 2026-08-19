// REGRESSÃO: captura de leads — validação, honeypot e entrega via plug de CRM.
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  validateLead,
  isHoneypot,
  deliverLead,
  resolveLeadPlugin,
  type LeadPayload,
} from './lead-capture';

function makeLead(overrides: Partial<LeadPayload> = {}): LeadPayload {
  return {
    name: 'Marina Souza',
    email: 'marina@empresa.com.br',
    source: '/blog/como-avaliar-solucao-b2b',
    keyword: 'como avaliar solução b2b',
    note: null,
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('REGRESSÃO: captura de leads', () => {
  it('aceita lead válido', () => {
    const result = validateLead(makeLead());
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejeita nome com menos de 2 chars e email inválido', () => {
    const result = validateLead(makeLead({ name: 'A', email: 'nao-e-email' }));
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('name_invalid');
    expect(result.errors).toContain('email_invalid');
  });

  it('aceita email com domínio de 2 letras', () => {
    const result = validateLead(makeLead({ email: 'a@b.co' }));
    expect(result.ok).toBe(true);
  });

  it('rejeita email maior que 120 chars (mesmo passando na regex)', () => {
    const longEmail = `${'a'.repeat(115)}@b.com`; // 121 chars
    const result = validateLead(makeLead({ email: longEmail }));
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('email_invalid');
  });

  it('detecta honeypot preenchido (campo invisível)', () => {
    expect(isHoneypot(makeLead())).toBe(false);
    expect(isHoneypot(makeLead({ note: 'spam' }))).toBe(true);
  });

  it('resolveLeadPlugin devolve null para destino sem plug', () => {
    expect(resolveLeadPlugin('crm-inexistente')).toBeNull();
    expect(resolveLeadPlugin('trello')).not.toBeNull();
  });

  it('deliverLead cria card no Trello com nome e desc (fonte + keyword)', async () => {
    vi.stubEnv('TRELLO_API_KEY', 'chave');
    vi.stubEnv('TRELLO_TOKEN', 'token');
    vi.stubEnv('TRELLO_LIST_ID', 'lista-1');
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await deliverLead(makeLead());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.trello.com/1/cards');
    const body = JSON.parse(init.body as string);
    expect(body.idList).toBe('lista-1');
    expect(body.name).toBe('Marina Souza — marina@empresa.com.br');
    expect(body.desc).toContain('Fonte: /blog/como-avaliar-solucao-b2b');
    expect(body.desc).toContain('Keyword: como avaliar solução b2b');
  });

  it('deliverLead lança trello_envs_missing quando envs faltam', async () => {
    await expect(deliverLead(makeLead())).rejects.toThrow('trello_envs_missing');
  });

  it('deliverLead propaga falha HTTP do Trello', async () => {
    vi.stubEnv('TRELLO_API_KEY', 'chave');
    vi.stubEnv('TRELLO_TOKEN', 'token');
    vi.stubEnv('TRELLO_LIST_ID', 'lista-1');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })));

    await expect(deliverLead(makeLead())).rejects.toThrow('trello_http_401');
  });
});
