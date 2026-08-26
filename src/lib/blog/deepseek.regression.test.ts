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

const {
  regenerateWithFeedback,
  generateArticle,
  REQUIRED_FIELDS,
  isValidStructure,
  parseStructure,
  writeSection,
  generateArticleWithSections,
  injectSectionImages,
  enrichSectionBriefs,
  fixSimpleValidationIssues,
  regenerateSectionsWithFeedback,
  assembleArticleMarkdown,
  generateArticleStructure,
} = await import('./deepseek');

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

describe('REGRESSÃO checklist 25/08/2026: estrutura precisa de 7-9 seções e 7 FAQs (padrão cfgauss)', () => {
  const ESTRUTURA_VALIDA = {
    title: 'Como Escolher Placa Solar em 2026',
    page_title: 'Como Escolher Placa Solar 2026',
    slug: 'como-escolher-placa-solar',
    meta_desc: 'Descubra como escolher a placa solar certa e economize até R$ 400/mês',
    cover_image_prompt: 'Photorealistic solar panels on a Brazilian rooftop, no text',
    cover_alt: 'Placas solares em telhado residencial',
    category: 'guias',
    sections: Array.from({ length: 7 }, (_, i) => ({
      h2: `Seção ${i + 1}`,
      content_brief: 'Instrução de 150-200 palavras para o redator.',
      word_target: 500,
      image_prompt: 'Photorealistic detail shot, no text',
    })),
    faq: Array.from({ length: 7 }, (_, i) => ({ question: `Pergunta ${i + 1}?`, answer: 'Resposta.' })),
    summary_bullets: ['Bullet 1', 'Bullet 2', 'Bullet 3'],
  };

  it('estrutura com 7 seções e 7 FAQ é válida', () => {
    expect(isValidStructure(ESTRUTURA_VALIDA, 'placa solar')).toBe(true);
  });
  it('estrutura com 3 seções é inválida (mínimo 7)', () => {
    expect(isValidStructure({ ...ESTRUTURA_VALIDA, sections: ESTRUTURA_VALIDA.sections.slice(0, 3) }, 'placa solar')).toBe(false);
  });
  it('estrutura com 10 seções é inválida (máximo 9)', () => {
    const extra = [...ESTRUTURA_VALIDA.sections, ESTRUTURA_VALIDA.sections[0]!, ESTRUTURA_VALIDA.sections[0]!, ESTRUTURA_VALIDA.sections[0]!];
    expect(isValidStructure({ ...ESTRUTURA_VALIDA, sections: extra }, 'placa solar')).toBe(false);
  });
  it('estrutura com 5 perguntas de FAQ é inválida (exatas 7)', () => {
    expect(isValidStructure({ ...ESTRUTURA_VALIDA, faq: ESTRUTURA_VALIDA.faq.slice(0, 5) }, 'placa solar')).toBe(false);
  });
  it('estrutura sem a keyword no título é inválida', () => {
    expect(isValidStructure({ ...ESTRUTURA_VALIDA, title: 'Guia genérico sem o termo' }, 'placa solar')).toBe(false);
  });
  it('parseStructure: JSON malformado devolve null (nunca lança)', () => {
    expect(parseStructure('não é json')).toBeNull();
  });
});

describe('REGRESSÃO checklist 25/08/2026: writeSection nunca depende do default de max_tokens da API', () => {
  it('max_tokens é explícito e proporcional ao word_target', async () => {
    createMock.mockResolvedValueOnce({ choices: [{ message: { content: 'Corpo da seção.' } }] });
    await writeSection('placa solar', { h2: 'X', content_brief: 'brief', word_target: 600, image_prompt: 'p' }, 0, 8);
    const args = createMock.mock.calls[0][0];
    expect(args.max_tokens).toBeGreaterThanOrEqual(1200); // ~2 tokens/palavra PT-BR de folga
    expect(args.model).toBe('deepseek-v4-flash');
  });

  it('REGRESSÃO 25/08/2026 (achado E2E: 1 de 8 seções voltou vazia em produção): retenta 1x se vier vazio', async () => {
    createMock
      .mockResolvedValueOnce({ choices: [{ message: { content: '' } }] })
      .mockResolvedValueOnce({ choices: [{ message: { content: 'Corpo real na 2ª tentativa.' } }] });

    const body = await writeSection('placa solar', { h2: 'X', content_brief: 'brief', word_target: 600, image_prompt: 'p' }, 0, 8);

    expect(body).toBe('Corpo real na 2ª tentativa.');
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it('REGRESSÃO 25/08/2026 (lapidação — achado no motor irmão gaussmob-nextjs): vazio nas 2 tentativas cai no content_brief, nunca publica H2 sem corpo', async () => {
    createMock
      .mockResolvedValueOnce({ choices: [{ message: { content: '' } }] })
      .mockResolvedValueOnce({ choices: [{ message: { content: '' } }] });

    const body = await writeSection('placa solar', { h2: 'X', content_brief: 'Instrução do brief como corpo mínimo.', word_target: 600, image_prompt: 'p' }, 0, 8);

    expect(body).toBe('Instrução do brief como corpo mínimo.');
    expect(body).not.toBe('');
    expect(createMock).toHaveBeenCalledTimes(2);
  });
});

describe('REGRESSÃO 25/08/2026 (lapidação Task 6): generateArticleStructure nunca depende do default de max_tokens da API', () => {
  const ESTRUTURA_VALIDA_MAXTOKENS = {
    title: 'Como Escolher Placa Solar',
    page_title: 'Como Escolher Placa Solar',
    slug: 'como-escolher-placa-solar',
    meta_desc: 'meta',
    cover_image_prompt: 'cover',
    cover_alt: 'alt',
    category: 'guias',
    sections: Array.from({ length: 7 }, (_, i) => ({
      h2: `Seção ${i + 1}`, content_brief: 'brief', word_target: 500, image_prompt: 'p',
    })),
    faq: Array.from({ length: 7 }, (_, i) => ({ question: `P${i}?`, answer: 'R' })),
    summary_bullets: ['B1', 'B2', 'B3'],
  };

  it('max_tokens é explícito (9 seções + 7 FAQs correm o mesmo risco de truncamento que writeSection evita)', async () => {
    createMock.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify(ESTRUTURA_VALIDA_MAXTOKENS) } }],
    });

    await generateArticleStructure('placa solar');

    const args = createMock.mock.calls[0][0];
    expect(args.max_tokens).toBeGreaterThanOrEqual(4000); // generoso o bastante pra 9 seções + FAQ-7
    expect(args.model).toBe('deepseek-v4-flash');
  });
});

describe('REGRESSÃO checklist 25/08/2026: montagem por seções (generateArticleWithSections)', () => {
  const ESTRUTURA_MONTAGEM = {
    title: 'Como Escolher Placa Solar em 2026',
    page_title: 'Como Escolher Placa Solar 2026',
    slug: 'como-escolher-placa-solar',
    meta_desc: 'Descubra como escolher a placa solar certa e economize até R$ 400/mês',
    cover_image_prompt: 'Photorealistic solar panels on a Brazilian rooftop, no text',
    cover_alt: 'Placas solares em telhado residencial',
    category: 'guias',
    sections: Array.from({ length: 7 }, (_, i) => ({
      h2: `Seção ${i + 1}`,
      content_brief: 'Instrução de 150-200 palavras para o redator.',
      word_target: 500,
      image_prompt: 'Photorealistic detail shot, no text',
    })),
    faq: Array.from({ length: 7 }, (_, i) => ({ question: `Pergunta ${i + 1}?`, answer: 'Resposta.' })),
    summary_bullets: ['Bullet 1', 'Bullet 2', 'Bullet 3'],
  };

  it('artigo montado tem 1 slot de imagem por seção + FAQ com 7 blocos', async () => {
    createMock
      .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(ESTRUTURA_MONTAGEM) } }] })
      .mockResolvedValue({ choices: [{ message: { content: 'Corpo de exemplo da seção, texto suficiente.' } }] });

    const article = await generateArticleWithSections('placa solar');

    const slotCount = (article.content.match(/<!-- IMG_SLOT:\d+ -->/g) ?? []).length;
    expect(slotCount).toBe(ESTRUTURA_MONTAGEM.sections.length);
    expect(article.sectionImagePrompts).toHaveLength(ESTRUTURA_MONTAGEM.sections.length);
    expect(article.image_prompt).toBe(ESTRUTURA_MONTAGEM.cover_image_prompt);
    expect(article.content).toContain('## ' + ESTRUTURA_MONTAGEM.sections[0]!.h2);
    expect(article.content).toContain('## Perguntas Frequentes');
    expect((article.content.match(/^### /gm) ?? []).length).toBe(7);
  });

  it('REGRESSÃO 25/08/2026 (achado E2E): monta o H2 "Em resumo" com ≥3 bullets ANTES do FAQ — validateArticle exige isso e o motor por seções não gerava', async () => {
    createMock
      .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(ESTRUTURA_MONTAGEM) } }] })
      .mockResolvedValue({ choices: [{ message: { content: 'Corpo de exemplo da seção, texto suficiente.' } }] });

    const article = await generateArticleWithSections('placa solar');

    expect(article.content).toContain('## Em resumo');
    const bulletCount = (article.content.match(/^- /gm) ?? []).length;
    expect(bulletCount).toBeGreaterThanOrEqual(3);
    expect(article.content.indexOf('## Em resumo')).toBeLessThan(article.content.indexOf('## Perguntas Frequentes'));
  });

  it('injectSectionImages: slot sem imagem correspondente (upload falhou) é removido, nunca publica placeholder cru', () => {
    const content = 'texto\n<!-- IMG_SLOT:0 -->\nmais texto\n<!-- IMG_SLOT:1 -->';
    const out = injectSectionImages(content, [{ url: 'https://x/a.webp', alt: 'a' }, null]);
    expect(out).toContain('![a](https://x/a.webp)');
    expect(out).not.toContain('IMG_SLOT');
  });
});

describe('REGRESSÃO checklist 25/08/2026: regenerateSectionsWithFeedback só reescreve seção com issue', () => {
  beforeEach(() => createMock.mockReset());

  const ESTRUTURA_3_SECOES = {
    title: 'Financiamento Solar 2026',
    page_title: 'Financiamento Solar',
    slug: 'financiamento-solar',
    meta_desc: 'meta',
    cover_image_prompt: 'cover',
    cover_alt: 'alt',
    category: 'guias',
    sections: [
      { h2: 'Seção 1', content_brief: 'brief 1', word_target: 400, image_prompt: 'p1' },
      { h2: 'Seção 2', content_brief: 'brief 2', word_target: 400, image_prompt: 'p2' },
      { h2: 'Seção 3', content_brief: 'brief 3', word_target: 400, image_prompt: 'p3' },
    ],
    faq: [],
    summary_bullets: ['Bullet 1', 'Bullet 2', 'Bullet 3'],
  };
  const BODIES_ATUAIS = ['Corpo original 1', 'Corpo original 2', 'Corpo original 3'];

  it('reescreve só a seção citada na issue, mantém as outras intactas', async () => {
    createMock.mockResolvedValueOnce({ choices: [{ message: { content: 'Corpo revisado 2' } }] });

    const novos = await regenerateSectionsWithFeedback('financiamento solar', ESTRUTURA_3_SECOES, BODIES_ATUAIS, [
      { severity: 'P1', category: 'seo', section: 'Seção 2', problem: 'fraco', fix_instruction: 'aprofundar' },
    ]);

    expect(novos[0]).toBe('Corpo original 1');
    expect(novos[1]).toBe('Corpo revisado 2');
    expect(novos[2]).toBe('Corpo original 3');
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it('issue sem seção correspondente na estrutura: no-op, nunca chama a API', async () => {
    const novos = await regenerateSectionsWithFeedback('financiamento solar', ESTRUTURA_3_SECOES, BODIES_ATUAIS, [
      { severity: 'P1', category: 'seo', section: 'Seção inexistente', problem: 'x', fix_instruction: 'y' },
    ]);

    expect(novos).toBe(BODIES_ATUAIS);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('regeneração da seção falha (erro de rede): mantém o corpo anterior daquela seção, não quebra', async () => {
    createMock.mockRejectedValueOnce(new Error('timeout'));

    const novos = await regenerateSectionsWithFeedback('financiamento solar', ESTRUTURA_3_SECOES, BODIES_ATUAIS, [
      { severity: 'P1', category: 'seo', section: 'Seção 1', problem: 'fraco', fix_instruction: 'aprofundar' },
    ]);

    expect(novos[0]).toBe('Corpo original 1'); // writeSection lança, catch mantém o anterior
    expect(novos[1]).toBe('Corpo original 2');
    expect(novos[2]).toBe('Corpo original 3');
  });
});

describe('REGRESSÃO checklist 25/08/2026: assembleArticleMarkdown é reusada por generateArticleWithSections e pelo re-montador do gate', () => {
  it('mesma saída para as mesmas structure+bodies (determinístico, sem chamada de rede)', () => {
    const structure = {
      title: 't', page_title: 't', slug: 's', meta_desc: 'm', cover_image_prompt: 'c',
      cover_alt: 'a', category: 'cat',
      sections: [{ h2: 'H2 único', content_brief: 'b', word_target: 100, image_prompt: 'p' }],
      faq: [{ question: 'Pergunta?', answer: 'Resposta.' }],
      summary_bullets: ['Bullet 1', 'Bullet 2', 'Bullet 3'],
    };
    const md1 = assembleArticleMarkdown(structure, ['corpo']);
    const md2 = assembleArticleMarkdown(structure, ['corpo']);
    expect(md1).toBe(md2);
    expect(md1).toContain('<!-- IMG_SLOT:0 -->');
    expect(md1).toContain('## Perguntas Frequentes');
  });
});

describe('REGRESSÃO 25/08/2026 (achado E2E): enrichSectionBriefs injeta obrigações editoriais sem chamada de rede', () => {
  const SECOES_7 = Array.from({ length: 7 }, (_, i) => ({
    h2: `Seção ${i + 1}`, content_brief: `brief ${i + 1}`, word_target: 500, image_prompt: 'p',
  }));
  const LINKS = [{ label: 'Guia de instalação', url: '/blog/guia-instalacao' }];

  it('seção 0 ganha instrução de abrir com a keyword na 1ª frase', () => {
    const out = enrichSectionBriefs(SECOES_7, 'placa solar', LINKS);
    expect(out[0]!.content_brief).toContain('Abra a primeira frase já citando "placa solar"');
  });

  it('última seção ganha CTA de fechamento', () => {
    const out = enrichSectionBriefs(SECOES_7, 'placa solar', LINKS);
    expect(out[out.length - 1]!.content_brief).toContain('Feche com CTA explícito');
  });

  it('link interno só é injetado quando internalLinks não está vazio', () => {
    const comLink = enrichSectionBriefs(SECOES_7, 'placa solar', LINKS);
    const semLink = enrichSectionBriefs(SECOES_7, 'placa solar', []);
    expect(comLink[1]!.content_brief).toContain('/blog/guia-instalacao');
    expect(semLink.some(s => s.content_brief.includes('link interno'))).toBe(false);
  });

  it('link externo e citação são injetados em seções distintas do link interno e do CTA', () => {
    const out = enrichSectionBriefs(SECOES_7, 'placa solar', LINKS);
    expect(out[2]!.content_brief).toContain('link externo real');
    expect(out[3]!.content_brief).toContain('citação em blockquote');
  });

  it('lista vazia de seções: no-op, nunca lança', () => {
    expect(enrichSectionBriefs([], 'placa solar', LINKS)).toEqual([]);
  });

  it('não muta o array/objetos originais (cópia defensiva)', () => {
    const original = JSON.parse(JSON.stringify(SECOES_7));
    enrichSectionBriefs(SECOES_7, 'placa solar', LINKS);
    expect(SECOES_7).toEqual(original);
  });
});

describe('REGRESSÃO 25/08/2026 (achado E2E): fixSimpleValidationIssues corrige sem chamar o LLM de novo', () => {
  const ARTICLE_BASE = {
    title: 'Como Escolher Placa Solar',
    slug: 'como-escolher-placa-solar',
    meta_desc: 'Guia completo com critérios práticos para escolher',
    image_prompt: 'p',
    cover_alt: 'Painel solar instalado em telhado residencial',
    content: 'conteúdo',
  };

  it('meta_keyword: prepend a keyword quando ausente da meta_desc', () => {
    const fixed = fixSimpleValidationIssues(ARTICLE_BASE, 'placa solar', ['meta_keyword']);
    expect(fixed.meta_desc.toLowerCase()).toContain('placa solar');
    expect(fixed.meta_desc.length).toBeLessThanOrEqual(155);
  });

  it('cover_alt_keyword: acrescenta a keyword quando ausente do alt da capa', () => {
    const fixed = fixSimpleValidationIssues(ARTICLE_BASE, 'placa solar', ['cover_alt_keyword']);
    expect(fixed.cover_alt!.toLowerCase()).toContain('placa solar');
  });

  it('issue não coberta (ex.: citation_blocks): não mexe no artigo, nunca inventa conteúdo', () => {
    const fixed = fixSimpleValidationIssues(ARTICLE_BASE, 'placa solar', ['citation_blocks']);
    expect(fixed).toEqual(ARTICLE_BASE);
  });

  it('campo já correto: no-op, não duplica a keyword', () => {
    const jaCorreto = { ...ARTICLE_BASE, meta_desc: 'Placa solar: guia completo com critérios' };
    const fixed = fixSimpleValidationIssues(jaCorreto, 'placa solar', ['meta_keyword']);
    expect(fixed.meta_desc).toBe(jaCorreto.meta_desc); // já continha, condição não dispara
  });

  it('meta_desc muito longa após o fix é truncada em 155 chars', () => {
    const longa = { ...ARTICLE_BASE, meta_desc: 'x'.repeat(150) };
    const fixed = fixSimpleValidationIssues(longa, 'financiamento de energia solar residencial', ['meta_keyword']);
    expect(fixed.meta_desc.length).toBeLessThanOrEqual(155);
  });
});

describe('REGRESSÃO 26/08/2026: isValidStructure aceita keyword separada por pontuação no título (pipeline preso no seed)', () => {
  const makeEstrutura = (title: string) => ({
    title,
    page_title: title,
    slug: 'geracao-distribuida-compartilhada-vale-a-pena',
    meta_desc: 'meta',
    cover_image_prompt: 'cover',
    cover_alt: 'alt',
    category: 'faq',
    sections: Array.from({ length: 7 }, (_, i) => ({
      h2: `Seção ${i + 1}`,
      content_brief: 'brief',
      word_target: 500,
      image_prompt: 'p',
    })),
    faq: Array.from({ length: 7 }, (_, i) => ({ question: `Pergunta ${i + 1}?`, answer: 'Resposta.' })),
    summary_bullets: ['Bullet 1', 'Bullet 2', 'Bullet 3'],
  });

  it('título com ":" separando a keyword ainda é aceito (pontuação não reprova)', () => {
    const estrutura = makeEstrutura('Geração Distribuída Compartilhada: Vale a Pena? Entenda os Custos');
    expect(isValidStructure(estrutura, 'geração distribuída compartilhada vale a pena')).toBe(true);
  });

  it('título sem a keyword (ordem quebrada) continua reprovado', () => {
    const estrutura = makeEstrutura('Vale a Pena Investir em Geração Compartilhada?');
    expect(isValidStructure(estrutura, 'geração distribuída compartilhada vale a pena')).toBe(false);
  });
});

describe('REGRESSÃO 26/08/2026: generateArticleStructure dá feedback à 2ª tentativa em vez de repetir o mesmo prompt', () => {
  const makeEstrutura = (title: string) => ({
    title,
    page_title: title,
    slug: 'geracao-distribuida-compartilhada-vale-a-pena',
    meta_desc: 'meta',
    cover_image_prompt: 'cover',
    cover_alt: 'alt',
    category: 'faq',
    sections: Array.from({ length: 7 }, (_, i) => ({
      h2: `Seção ${i + 1}`,
      content_brief: 'brief',
      word_target: 500,
      image_prompt: 'p',
    })),
    faq: Array.from({ length: 7 }, (_, i) => ({ question: `Pergunta ${i + 1}?`, answer: 'Resposta.' })),
    summary_bullets: ['Bullet 1', 'Bullet 2', 'Bullet 3'],
  });

  it('2ª tentativa recebe instrução com a keyword exata quando a 1ª estrutura é rejeitada', async () => {
    const invalida = makeEstrutura('Vale a Pena Investir em Geração Compartilhada?');
    const valida = makeEstrutura('Geração Distribuída Compartilhada Vale a Pena? Entenda os Custos');
    createMock
      .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(invalida) } }] })
      .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(valida) } }] });

    const result = await generateArticleStructure('geração distribuída compartilhada vale a pena');

    expect(result.title).toBe('Geração Distribuída Compartilhada Vale a Pena? Entenda os Custos');
    expect(createMock).toHaveBeenCalledTimes(2);

    const firstUser = createMock.mock.calls[0][0].messages[1].content;
    const secondUser = createMock.mock.calls[1][0].messages[1].content;
    expect(firstUser).not.toContain('tentativa anterior foi rejeitada');
    expect(secondUser).toContain('tentativa anterior foi rejeitada');
    expect(secondUser).toContain('geração distribuída compartilhada vale a pena');
  });
});
