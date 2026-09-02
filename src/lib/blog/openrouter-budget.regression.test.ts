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
