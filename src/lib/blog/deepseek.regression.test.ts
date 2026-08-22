// REGRESSÃO: regenerateWithFeedback (src/lib/blog/deepseek.ts) — usado como callback
// `regenerate` de runQualityGateLoop (quality-gate.ts), que NÃO tem try/catch em volta
// da chamada a `regenerate`. O contrato documentado é "o pipeline nunca quebra por
// causa do gate" — regenerateWithFeedback precisa engolir erro de rede/timeout do
// client OpenAI-compatible e devolver o artigo original, nunca propagar.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const createMock = vi.fn();

vi.mock('openai', () => ({
  default: class OpenAI {
    chat = { completions: { create: createMock } };
  },
}));

const { regenerateWithFeedback, generateArticle, REQUIRED_FIELDS } = await import('./deepseek');

const ARTICLE = {
  title: 'Título original',
  slug: 'titulo-original',
  meta_desc: 'Meta original',
  image_prompt: 'prompt original',
  content: 'Conteúdo original do artigo.',
};

const ISSUES = [
  {
    severity: 'P1' as const,
    category: 'seo',
    section: 'h2',
    problem: 'fraco',
    fix_instruction: 'melhorar',
  },
];

beforeEach(() => {
  createMock.mockReset();
});

describe('REGRESSÃO: deepseek — regenerateWithFeedback nunca propaga erro (fail-open)', () => {
  it('client lança timeout na 1ª tentativa: devolve o artigo original, não propaga', async () => {
    createMock.mockRejectedValueOnce(new Error('Request timed out.'));

    const result = await regenerateWithFeedback(ARTICLE, ISSUES);

    expect(result).toEqual(ARTICLE);
    expect(createMock).toHaveBeenCalledTimes(1); // não insiste numa 2ª tentativa após erro de rede
  });

  it('client lança erro de rede: devolve o artigo original, não propaga', async () => {
    createMock.mockRejectedValueOnce(new Error('ECONNRESET'));

    const result = await regenerateWithFeedback(ARTICLE, ISSUES);

    expect(result).toEqual(ARTICLE);
  });

  it('REGRESSÃO: erro de rede na 1ª tentativa não deve logar a mensagem genérica de "falhou nas 2 tentativas" (só 1 tentativa ocorreu)', async () => {
    createMock.mockRejectedValueOnce(new Error('Request timed out.'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await regenerateWithFeedback(ARTICLE, ISSUES);

    const messages = warnSpy.mock.calls.map(call => String(call[0]));
    expect(messages.some(m => m.includes('falhou nas 2 tentativas'))).toBe(false);
    expect(messages.some(m => m.includes('tentativa 1 falhou (erro de rede/timeout)'))).toBe(true);

    warnSpy.mockRestore();
  });

  it('caso positivo: resposta válida na 1ª tentativa retorna o artigo revisado', async () => {
    const revised = { ...ARTICLE, content: 'Conteúdo revisado.' };
    createMock.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(revised) } }] });

    const result = await regenerateWithFeedback(ARTICLE, ISSUES);

    expect(result).toEqual(revised);
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it('JSON inválido na 1ª tentativa, válido na 2ª: retenta e retorna o revisado', async () => {
    const revised = { ...ARTICLE, content: 'Conteúdo revisado na 2ª tentativa.' };
    createMock
      .mockResolvedValueOnce({ choices: [{ message: { content: 'isto não é JSON' } }] })
      .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(revised) } }] });

    const result = await regenerateWithFeedback(ARTICLE, ISSUES);

    expect(result).toEqual(revised);
    expect(createMock).toHaveBeenCalledTimes(2);
  });
});

describe('REGRESSÃO: deepseek — parseResponse valida sistematicamente TODOS os REQUIRED_FIELDS de ArticleContent', () => {
  // Causa raiz (rodadas 4 e 5 de revisão adversarial): parseResponse checava campo por
  // campo manualmente (`if (!parsed.title || !parsed.slug || ...)`), um `if` adicionado
  // a cada bug achado — primeiro faltou meta_desc (validateArticle chama
  // metaDesc.length/.trim() sem guard → TypeError cru), depois image_prompt (route.ts
  // interpola em template literals sem `?.` → STRING "undefined, ..." que passa pelo
  // guard `!prompt?.trim()` e dispara uma chamada paga ao gpt-image-1 com prompt lixo).
  // Fix: REQUIRED_FIELDS agora é uma lista central (exportada de deepseek.ts) e o teste
  // roda sobre ELA — se um novo campo obrigatório for adicionado à lista, este bloco
  // ganha cobertura automaticamente, sem precisar de mais um describe manual.
  const COMPLETE_JSON = {
    title: 'Como economizar energia solar',
    slug: 'como-economizar-energia-solar',
    meta_desc: 'Descubra como economizar com energia solar hoje mesmo',
    image_prompt: 'Photorealistic scene of solar panels on a residential roof, no text, 4k',
    content: 'Conteúdo completo do artigo sobre energia solar.',
  };

  it('REQUIRED_FIELDS cobre os 5 campos `string` (sem `?`) de ArticleContent', () => {
    // Trava a lista: se alguém remover um campo daqui sem querer, o teste denuncia.
    // page_title/cover_alt/category ficam de fora de propósito — têm `?` no tipo e
    // `?? null`/`if (x)` no ponto de uso downstream.
    expect(REQUIRED_FIELDS.sort()).toEqual(
      ['title', 'slug', 'meta_desc', 'image_prompt', 'content'].sort(),
    );
  });

  it.each(REQUIRED_FIELDS)(
    'campo obrigatório ausente ("%s"): 1ª tentativa é rejeitada, retenta e aceita a 2ª completa',
    async field => {
      const incomplete: Record<string, string> = { ...COMPLETE_JSON };
      delete incomplete[field];

      createMock
        .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(incomplete) } }] })
        .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(COMPLETE_JSON) } }] });

      const result = await generateArticle('energia solar residencial');

      expect(result).toEqual(COMPLETE_JSON);
      expect(createMock).toHaveBeenCalledTimes(2);
    },
  );

  it.each(REQUIRED_FIELDS)(
    'campo obrigatório vazio ("%s" = ""): tratado como ausente, mesma rejeição',
    async field => {
      const withEmptyField = { ...COMPLETE_JSON, [field]: '' };

      createMock
        .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(withEmptyField) } }] })
        .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(COMPLETE_JSON) } }] });

      const result = await generateArticle('energia solar residencial');

      expect(result).toEqual(COMPLETE_JSON);
      expect(createMock).toHaveBeenCalledTimes(2);
    },
  );

  it.each(REQUIRED_FIELDS)(
    'campo obrigatório ausente ("%s") nas 2 tentativas: lança deepseek_json_parse_failed (nunca devolve artigo incompleto)',
    async field => {
      const incomplete: Record<string, string> = { ...COMPLETE_JSON };
      delete incomplete[field];

      createMock
        .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(incomplete) } }] })
        .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(incomplete) } }] });

      await expect(generateArticle('energia solar residencial')).rejects.toThrow('deepseek_json_parse_failed');
      expect(createMock).toHaveBeenCalledTimes(2);
    },
  );

  it('caso positivo: JSON completo com todos os REQUIRED_FIELDS na 1ª tentativa é aceito direto', async () => {
    createMock.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(COMPLETE_JSON) } }] });

    const result = await generateArticle('energia solar residencial');

    expect(result).toEqual(COMPLETE_JSON);
    expect(createMock).toHaveBeenCalledTimes(1);
  });
});

describe('REGRESSÃO: deepseek — chamadas usam um model id ativo na DeepSeek, nunca o legado desativado', () => {
  // Causa raiz (rodada 6): a DeepSeek desativou os model ids 'deepseek-chat' e
  // 'deepseek-reasoner' em 2026-07-24 (anunciado 2026-04-24), substituídos por
  // 'deepseek-v4-flash' (não-thinking, mesma faixa de custo do antigo 'deepseek-chat')
  // e 'deepseek-v4-pro' (thinking, 3x o custo). generateArticle e askDeepseek (usado por
  // regenerateWithFeedback/generateArticleOutline/generateArticleFromOutline) ainda
  // chamavam com 'deepseek-chat' — desde a desativação, TODA chamada falha no provider,
  // quebrando a geração de artigo em produção sem nenhum sinal além do erro de rede.
  // Trava aqui: nunca o id legado, e usa o id de custo equivalente (flash, não pro).
  it('generateArticle chama com model="deepseek-v4-flash" (nunca o legado "deepseek-chat")', async () => {
    createMock.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(ARTICLE) } }] });

    await generateArticle('energia solar residencial');

    expect(createMock).toHaveBeenCalledTimes(1);
    const callArgs = createMock.mock.calls[0][0];
    expect(callArgs.model).toBe('deepseek-v4-flash');
    expect(callArgs.model).not.toBe('deepseek-chat');
  });

  it('regenerateWithFeedback (askDeepseek) chama com model="deepseek-v4-flash" (nunca o legado "deepseek-chat")', async () => {
    createMock.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(ARTICLE) } }] });

    await regenerateWithFeedback(ARTICLE, ISSUES);

    expect(createMock).toHaveBeenCalledTimes(1);
    const callArgs = createMock.mock.calls[0][0];
    expect(callArgs.model).toBe('deepseek-v4-flash');
    expect(callArgs.model).not.toBe('deepseek-chat');
  });
});
