// REGRESSÃO: gate de qualidade por LLM (score 0-100, 5 categorias).
// Fail-open é a regra inviolável aqui — qualquer falha do judge NUNCA pode lançar
// erro nem bloquear o pipeline de publicação. Mock do client OpenAI-compatible (DeepSeek), sem API real.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const createMock = vi.fn();

vi.mock('openai', () => ({
  default: class OpenAI {
    chat = { completions: { create: createMock } };
  },
}));

const { runQualityGate, runQualityGateLoop } = await import('./quality-gate');

function textResponse(json: unknown) {
  return { choices: [{ message: { content: JSON.stringify(json) } }] };
}

const VALID_JUDGE_JSON = {
  total_score: 95,
  categories: { content_quality: 28, seo: 24, eeat: 14, technical: 14, geo: 15 },
  issues: [],
};

beforeEach(() => {
  createMock.mockReset();
  vi.stubEnv('DEEPSEEK_API_KEY', 'test-key');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('REGRESSÃO: quality-gate — runQualityGate', () => {
  it('score válido: parseia total_score, categories e issues corretamente', async () => {
    createMock.mockResolvedValueOnce(textResponse(VALID_JUDGE_JSON));

    const result = await runQualityGate('# Artigo\n\nConteúdo qualquer.');

    expect(result.skipped).toBe(false);
    expect(result.score).toBe(95);
    expect(result.categories).toEqual(VALID_JUDGE_JSON.categories);
    expect(result.issues).toEqual([]);
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it('parseia issues com severidade quando o score é baixo', async () => {
    createMock.mockResolvedValueOnce(
      textResponse({
        total_score: 62,
        categories: { content_quality: 15, seo: 15, eeat: 10, technical: 12, geo: 10 },
        issues: [
          {
            severity: 'P0',
            category: 'content_quality',
            section: 'lead',
            problem: 'Clichê de IA no primeiro parágrafo.',
            fix_instruction: 'Reescrever sem "é importante ressaltar".',
          },
        ],
      }),
    );

    const result = await runQualityGate('# Artigo fraco');

    expect(result.skipped).toBe(false);
    expect(result.score).toBe(62);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].severity).toBe('P0');
  });

  it('fail-open sem DEEPSEEK_API_KEY: retorna skipped=true sem chamar o client', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', '');

    const result = await runQualityGate('# Artigo qualquer');

    expect(result).toEqual({ skipped: true, score: null, issues: [], categories: null });
    expect(createMock).not.toHaveBeenCalled();
  });

  it('fail-open com JSON malformado: nunca lança, retorna skipped=true', async () => {
    createMock.mockResolvedValueOnce({ choices: [{ message: { content: 'isto não é JSON {' } }] });

    const result = await runQualityGate('# Artigo qualquer');

    expect(result).toEqual({ skipped: true, score: null, issues: [], categories: null });
  });

  it('fail-open com JSON válido mas faltando campo obrigatório: skipped=true', async () => {
    createMock.mockResolvedValueOnce(
      textResponse({ total_score: 80, categories: { content_quality: 20 }, issues: [] }),
    );

    const result = await runQualityGate('# Artigo qualquer');

    expect(result.skipped).toBe(true);
    expect(result.score).toBeNull();
  });

  it('fail-open quando o client lança (erro de rede/API): nunca propaga o erro', async () => {
    createMock.mockRejectedValueOnce(new Error('network down'));

    const result = await runQualityGate('# Artigo qualquer');

    expect(result).toEqual({ skipped: true, score: null, issues: [], categories: null });
  });

  it('fail-open quando a resposta não tem texto', async () => {
    createMock.mockResolvedValueOnce({ choices: [{ message: {} }] });

    const result = await runQualityGate('# Artigo qualquer');

    expect(result.skipped).toBe(true);
    expect(result.score).toBeNull();
  });
});

describe('REGRESSÃO: quality-gate — runQualityGateLoop', () => {
  it('para no primeiro julgamento quando score >= 90 (não regenera)', async () => {
    createMock.mockResolvedValueOnce(textResponse(VALID_JUDGE_JSON));
    const regenerate = vi.fn();

    const result = await runQualityGateLoop(
      'artigo v1',
      content => content,
      regenerate,
    );

    expect(result.attempts).toBe(0);
    expect(result.content).toBe('artigo v1');
    expect(result.judged.score).toBe(95);
    expect(regenerate).not.toHaveBeenCalled();
  });

  it('regenera uma vez e para assim que o score cruza 90', async () => {
    createMock
      .mockResolvedValueOnce(
        textResponse({ total_score: 70, categories: { content_quality: 15, seo: 15, eeat: 10, technical: 15, geo: 15 }, issues: [{ severity: 'P1', category: 'seo', section: 'h2', problem: 'fraco', fix_instruction: 'melhorar' }] }),
      )
      .mockResolvedValueOnce(textResponse(VALID_JUDGE_JSON));

    const regenerate = vi.fn(async (content: string) => `${content}-revisado`);

    const result = await runQualityGateLoop('artigo v1', content => content, regenerate);

    expect(result.attempts).toBe(1);
    expect(result.content).toBe('artigo v1-revisado');
    expect(result.judged.score).toBe(95);
    expect(regenerate).toHaveBeenCalledTimes(1);
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it('esgota as 2 tentativas e publica mesmo com score < 90 (nunca bloqueia)', async () => {
    const lowScore = (n: number) =>
      textResponse({
        total_score: n,
        categories: { content_quality: 10, seo: 10, eeat: 10, technical: 10, geo: 10 },
        issues: [{ severity: 'P1', category: 'seo', section: 'geral', problem: 'fraco', fix_instruction: 'melhorar' }],
      });

    createMock
      .mockResolvedValueOnce(lowScore(50))
      .mockResolvedValueOnce(lowScore(60))
      .mockResolvedValueOnce(lowScore(70));

    const regenerate = vi.fn(async (content: string) => `${content}+`);

    const result = await runQualityGateLoop('artigo v1', content => content, regenerate, 2);

    expect(result.attempts).toBe(2);
    expect(result.content).toBe('artigo v1++');
    expect(result.judged.score).toBe(70);
    expect(regenerate).toHaveBeenCalledTimes(2);
    expect(createMock).toHaveBeenCalledTimes(3);
  });

  it('fail-open dentro do loop: se o gate for pulado, não regenera e publica direto', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', '');
    const regenerate = vi.fn();

    const result = await runQualityGateLoop('artigo v1', content => content, regenerate);

    expect(result.attempts).toBe(0);
    expect(result.judged.skipped).toBe(true);
    expect(result.content).toBe('artigo v1');
    expect(regenerate).not.toHaveBeenCalled();
  });
});
