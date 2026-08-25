// REGRESSÃO checklist 25/08/2026 (Task 4, motor-padrao-cfgauss): generateAndUploadBodyImages
// fazia `results.push` só no sucesso — se a imagem da seção 3 falhasse, o array `results`
// ficava mais curto que `prompts`, e sectionImages[i] passava a apontar pra imagem da
// seção ERRADA a partir dali (desalinhamento posicional). Fix: `null` na posição em vez de
// pular, preservando o índice — sectionImages[i] sempre corresponde à seção i.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const generateMock = vi.fn();
const uploadMock = vi.fn();

vi.mock('openai', () => ({
  default: class OpenAI {
    images = { generate: generateMock };
  },
}));

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
  AUTOBLOG_PROFILE: { integrations: { imageGenerationEnabled: true } },
}));

const { generateAndUploadBodyImages } = await import('./image-gen');

beforeEach(() => {
  generateMock.mockReset();
  uploadMock.mockReset();
});

describe('REGRESSÃO checklist 25/08/2026: generateAndUploadBodyImages preserva posição (null, nunca pula)', () => {
  it('imagem do meio falha (sem b64): array mantém o tamanho de prompts, null na posição certa', async () => {
    generateMock
      .mockResolvedValueOnce({ data: [{ b64_json: 'aaa' }] }) // seção 0: ok
      .mockResolvedValueOnce({ data: [{}] }) // seção 1: sem b64_json — falha
      .mockResolvedValueOnce({ data: [{ b64_json: 'ccc' }] }); // seção 2: ok
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
      .mockResolvedValueOnce({ data: [{ b64_json: 'aaa' }] })
      .mockResolvedValueOnce({ data: [{ b64_json: 'bbb' }] });
    uploadMock
      .mockRejectedValueOnce(new Error('storage indisponível'))
      .mockResolvedValueOnce('https://x/s1.webp');

    const result = await generateAndUploadBodyImages(['prompt 0', 'prompt 1'], 'slug', 'kw');

    expect(result[0]).toBeNull();
    expect(result[1]).toEqual({ url: 'https://x/s1.webp', alt: 'kw — ilustração 2' });
  });

  it('prompt vazio: posição vira null sem chamar a API paga', async () => {
    generateMock.mockResolvedValueOnce({ data: [{ b64_json: 'aaa' }] });
    uploadMock.mockResolvedValueOnce('https://x/s1.webp');

    const result = await generateAndUploadBodyImages(['', 'prompt 1'], 'slug', 'kw');

    expect(result[0]).toBeNull();
    expect(generateMock).toHaveBeenCalledTimes(1); // só a seção 1 chamou a API
  });

  it('caso positivo: todas as N seções com imagem — array de {url,alt} sem nenhum null', async () => {
    generateMock
      .mockResolvedValueOnce({ data: [{ b64_json: 'aaa' }] })
      .mockResolvedValueOnce({ data: [{ b64_json: 'bbb' }] });
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
