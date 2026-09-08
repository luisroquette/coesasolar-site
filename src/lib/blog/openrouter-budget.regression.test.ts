// REGRESSÃO 02/09/2026: circuit breaker de saldo — a conta OpenRouter compartilhada já
// zerou uma vez (Doctor do ig-sentinel). Fail-open obrigatório: só um saldo baixo
// CONFIRMADO bloqueia; qualquer falha na própria checagem deixa passar.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkOpenRouterBalance } from './openrouter-budget';

describe('REGRESSÃO 02/09/2026: checkOpenRouterBalance', () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.COESASOLAR_OPENROUTER_API_KEY;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
    process.env.COESASOLAR_OPENROUTER_API_KEY = 'sk-test';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.COESASOLAR_OPENROUTER_API_KEY;
    else process.env.COESASOLAR_OPENROUTER_API_KEY = originalKey;
  });

  it('sem chave configurada: ok=true, remaining=null (não é problema deste breaker)', async () => {
    delete process.env.COESASOLAR_OPENROUTER_API_KEY;
    const result = await checkOpenRouterBalance();
    expect(result).toEqual({ ok: true, remaining: null });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('saldo suficiente: ok=true com o remaining calculado', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ data: { total_credits: 50, total_usage: 10 } }),
    });
    const result = await checkOpenRouterBalance();
    expect(result).toEqual({ ok: true, remaining: 40 });
  });

  it('saldo abaixo do piso: ok=false', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ data: { total_credits: 50, total_usage: 49.5 } }),
    });
    const result = await checkOpenRouterBalance();
    expect(result.ok).toBe(false);
    expect(result.remaining).toBeCloseTo(0.5);
  });

  it('saldo exatamente no piso (1.0): ok=true (fronteira inclusiva)', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ data: { total_credits: 10, total_usage: 9 } }),
    });
    const result = await checkOpenRouterBalance();
    expect(result.ok).toBe(true);
  });

  it('API responde erro HTTP: fail-open (ok=true, remaining=null)', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 401 });
    const result = await checkOpenRouterBalance();
    expect(result).toEqual({ ok: true, remaining: null });
  });

  it('resposta em formato inesperado: fail-open', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ data: {} }),
    });
    const result = await checkOpenRouterBalance();
    expect(result).toEqual({ ok: true, remaining: null });
  });

  it('fetch lança (rede indisponível): fail-open, nunca propaga', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network down'));
    await expect(checkOpenRouterBalance()).resolves.toEqual({ ok: true, remaining: null });
  });
});

// REGRESSÃO 08/09/2026: causa raiz de pipeline_deadline_exceeded recorrente (09-03, 09-04,
// 09-07, 09-08) — checkOpenRouterBalance é o PRIMEIRO passo do pipeline (route.ts) e nunca
// teve timeout no fetch; uma resposta travada da API consumia o orçamento inteiro do
// deadline interno (270s) sozinha, antes de qualquer outra fase rodar. Fail-open já existia
// para erro de rede — faltava cobrir "nunca responde" (nem resolve nem rejeita).
describe('REGRESSÃO 08/09/2026: checkOpenRouterBalance nunca trava indefinidamente', () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.COESASOLAR_OPENROUTER_API_KEY;

  beforeEach(() => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn();
    process.env.COESASOLAR_OPENROUTER_API_KEY = 'sk-test';
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.COESASOLAR_OPENROUTER_API_KEY;
    else process.env.COESASOLAR_OPENROUTER_API_KEY = originalKey;
  });

  it('fetch travado pra sempre: aborta em 10s e resolve fail-open, nunca fica pendente', async () => {
    // Simula o comportamento real do fetch com AbortSignal: a promise só rejeita quando o
    // signal aborta (nunca resolve/rejeita sozinha) — replica exatamente o cenário de rede
    // travada que causava o pipeline_deadline_exceeded.
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation((_url: string, options: RequestInit) => {
      return new Promise((_resolve, reject) => {
        options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      });
    });

    const resultPromise = checkOpenRouterBalance();
    await vi.advanceTimersByTimeAsync(10_000);
    const result = await resultPromise;

    expect(result).toEqual({ ok: true, remaining: null });
  });
});
