// REGRESSÃO checklist 25/08/2026 (Task 4, motor-padrao-cfgauss): generateAndUploadBodyImages
// fazia `results.push` só no sucesso — se a imagem da seção 3 falhasse, o array `results`
// ficava mais curto que `prompts`, e sectionImages[i] passava a apontar pra imagem da
// seção ERRADA a partir dali (desalinhamento posicional). Fix: `null` na posição em vez de
// pular, preservando o índice — sectionImages[i] sempre corresponde à seção i.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const generateMock = vi.fn();
const uploadMock = vi.fn();

vi.stubGlobal('fetch', generateMock);

vi.mock('sharp', () => ({
  default: () => ({
    resize: () => ({
      webp: () => ({
        toBuffer: async () => Buffer.from('webp-fake'),
      }),
    }),
  }),
}));

vi.mock('./supabase-blog', () => ({
  uploadImageToStorage: uploadMock,
}));

vi.mock('@/lib/autoblog-profile', () => ({
  AUTOBLOG_PROFILE: { brand: { siteUrl: 'https://coesasolar.com.br' }, integrations: { imageGenerationEnabled: true } },
}));

const { generateAndUploadBodyImages, generateAndUploadCover } = await import('./image-gen');

beforeEach(() => {
  vi.stubEnv('COESASOLAR_OPENROUTER_API_KEY', 'test-key');
  generateMock.mockReset();
  uploadMock.mockReset();
});

describe('REGRESSÃO checklist 25/08/2026: generateAndUploadBodyImages preserva posição (null, nunca pula)', () => {
  it('usa Seedream 4.5 em 2K e 16:9 via OpenRouter', async () => {
    generateMock.mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ b64_json: 'aaa' }] }) });
    uploadMock.mockResolvedValueOnce('https://x/cover.webp');

    await generateAndUploadCover('painéis solares', 'energia-solar');

    const request = generateMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      model: 'bytedance-seed/seedream-4.5',
      user: 'coesasolar/blog/cover',
      resolution: '2K',
      aspect_ratio: '16:9',
      n: 1,
    });
  });

  it('imagem do meio falha (sem b64): array mantém o tamanho de prompts, null na posição certa', async () => {
    generateMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ b64_json: 'aaa' }] }) }) // seção 0: ok
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{}] }) }) // seção 1: sem b64_json — falha
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ b64_json: 'ccc' }] }) }); // seção 2: ok
    uploadMock
      .mockResolvedValueOnce('https://x/s0.webp')
      .mockResolvedValueOnce('https://x/s2.webp');

    const result = await generateAndUploadBodyImages(['prompt 0', 'prompt 1', 'prompt 2'], 'slug', 'kw');

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ url: 'https://x/s0.webp', alt: 'kw — ilustração 1' });
    expect(result[1]).toBeNull(); // nunca deslocado pra posição 1 vindo da seção 2
    expect(result[2]).toEqual({ url: 'https://x/s2.webp', alt: 'kw — ilustração 3' });
  });

  it('upload falha (throw): posição vira null, não interrompe as seguintes', async () => {
    generateMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ b64_json: 'aaa' }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ b64_json: 'bbb' }] }) });
    uploadMock
      .mockRejectedValueOnce(new Error('storage indisponível'))
      .mockResolvedValueOnce('https://x/s1.webp');

    const result = await generateAndUploadBodyImages(['prompt 0', 'prompt 1'], 'slug', 'kw');

    expect(result[0]).toBeNull();
    expect(result[1]).toEqual({ url: 'https://x/s1.webp', alt: 'kw — ilustração 2' });
  });

  it('prompt vazio: posição vira null sem chamar a API paga', async () => {
    generateMock.mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ b64_json: 'aaa' }] }) });
    uploadMock.mockResolvedValueOnce('https://x/s1.webp');

    const result = await generateAndUploadBodyImages(['', 'prompt 1'], 'slug', 'kw');

    expect(result[0]).toBeNull();
    expect(generateMock).toHaveBeenCalledTimes(1); // só a seção 1 chamou a API
  });

  it('caso positivo: todas as N seções com imagem — array de {url,alt} sem nenhum null', async () => {
    generateMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ b64_json: 'aaa' }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ b64_json: 'bbb' }] }) });
    uploadMock
      .mockResolvedValueOnce('https://x/s0.webp')
      .mockResolvedValueOnce('https://x/s1.webp');

    const result = await generateAndUploadBodyImages(['prompt 0', 'prompt 1'], 'slug', 'kw');

    expect(result).toEqual([
      { url: 'https://x/s0.webp', alt: 'kw — ilustração 1' },
      { url: 'https://x/s1.webp', alt: 'kw — ilustração 2' },
    ]);
  });
});

describe('REGRESSÃO 26/08/2026: falha de crédito nunca publica capa nula', () => {
  it('429 usa fallback próprio e abre circuito para não repetir chamadas pagas no corpo', async () => {
    generateMock.mockResolvedValueOnce({ ok: false, status: 429 });

    const cover = await generateAndUploadCover('painéis solares', 'energia-compartilhada');
    const body = await generateAndUploadBodyImages(['a', 'b'], 'slug', 'kw');

    expect(cover).toBe('https://coesasolar.com.br/api/blog/fallback-cover?slug=energia-compartilhada');
    expect(body).toEqual([null, null]);
    expect(generateMock).toHaveBeenCalledTimes(1);
  });
});
