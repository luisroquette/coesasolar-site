// REGRESSÃO: injeção de imagens no corpo do artigo (quebrar o texto, alt com keyword).
import { describe, it, expect } from 'vitest';
import { injectBodyImages, injectInfographic, injectInlineCtas, type InlineCta } from './image-body';

function makeContent(h2Count: number): string {
  const parts = ['Lead do artigo.'];
  for (let i = 1; i <= h2Count; i++) parts.push(`## Seção ${i}`, `Texto da seção ${i}.`);
  return parts.join('\n\n');
}

const IMAGES = [
  { url: 'https://cdn.exemplo.com/1.webp', alt: 'keyword — ilustração 1' },
  { url: 'https://cdn.exemplo.com/2.webp', alt: 'keyword — ilustração 2' },
];

describe('REGRESSÃO: injeção de imagens no corpo', () => {
  it('com 5+ H2s, insere imagens antes do 2º e do 4º H2', () => {
    const out = injectBodyImages(makeContent(5), IMAGES);
    const lines = out.split('\n');
    const h2s = lines.map((l, i) => (/^## /m.test(l) ? i : -1)).filter(i => i >= 0);
    expect(h2s).toHaveLength(5);
    // imagem antes do 2º H2 (índice h2s[1]) e do 4º (h2s[3])
    expect(lines[h2s[1] - 2]).toBe('![keyword — ilustração 1](https://cdn.exemplo.com/1.webp)');
    expect(lines[h2s[3] - 2]).toBe('![keyword — ilustração 2](https://cdn.exemplo.com/2.webp)');
  });

  it('com 2 H2s e 2 imagens, insere apenas 1 imagem (antes do 2º H2)', () => {
    const out = injectBodyImages(makeContent(2), IMAGES);
    expect((out.match(/!\[/g) ?? []).length).toBe(1);
    expect(out).not.toContain('2.webp');
  });

  it('sem imagens, devolve o conteúdo intacto', () => {
    const content = makeContent(5);
    expect(injectBodyImages(content, [])).toBe(content);
  });

  it('com menos de 2 H2s, não insere nada', () => {
    const content = 'Um texto sem H2s suficientes.\n\n## Único';
    expect(injectBodyImages(content, IMAGES)).toBe(content);
  });
});

describe('REGRESSÃO: injeção de infográfico', () => {
  const INFOGRAPHIC = { url: 'https://cdn.exemplo.com/info.webp', alt: 'keyword — infográfico' };

  it('insere antes do ÚLTIMO H2 (resumo visual antes do fechamento)', () => {
    const out = injectInfographic(makeContent(5), INFOGRAPHIC);
    const lines = out.split('\n');
    const h2s = lines.map((l, i) => (/^## /m.test(l) ? i : -1)).filter(i => i >= 0);
    expect(h2s).toHaveLength(5);
    expect(lines[h2s[4] - 2]).toBe('![keyword — infográfico](https://cdn.exemplo.com/info.webp)');
    expect(lines[h2s[3] - 2]).not.toContain('info.webp');
  });

  it('sem H2, insere no fim do conteúdo', () => {
    const content = 'Texto sem headers.';
    const out = injectInfographic(content, INFOGRAPHIC);
    expect(out).toContain('Texto sem headers.');
    expect(out).toContain('![keyword — infográfico](https://cdn.exemplo.com/info.webp)');
  });

  it('com infográfico null, devolve o conteúdo intacto', () => {
    const content = makeContent(5);
    expect(injectInfographic(content, null)).toBe(content);
  });
});

describe('REGRESSÃO: CTA após cada imagem', () => {
  const CTA: InlineCta = {
    title: 'Quer discutir o seu cenário?',
    subtitle: 'Fale com a equipe para avaliar os próximos passos.',
    buttonLabel: 'Entrar em contato',
    url: '/contato',
  };

  function contentWithImages(count: number): string {
    const parts = ['Lead do artigo.'];
    for (let i = 1; i <= count; i++) parts.push(`![imagem ${i}](https://cdn.exemplo.com/${i}.webp)`);
    return parts.join('\n\n');
  }

  it('insere um CTA logo após cada imagem', () => {
    const out = injectInlineCtas(contentWithImages(2), CTA);
    const lines = out.split('\n');
    const block = '> **[Quer discutir o seu cenário?](/contato)** — Fale com a equipe para avaliar os próximos passos.';

    const img1 = lines.findIndex(l => l.includes('1.webp'));
    expect(lines[img1 + 2]).toBe(block);

    const img2 = lines.findIndex(l => l.includes('2.webp'));
    expect(lines[img2 + 2]).toBe(block);
  });

  it('com 3 imagens (corpo + infográfico), insere 3 CTAs', () => {
    const out = injectInlineCtas(contentWithImages(3), CTA);
    expect((out.match(/Quer discutir o seu cenário/g) ?? []).length).toBe(3);
  });

  it('sem imagens no conteúdo, devolve intacto', () => {
    const content = 'Texto sem imagens.\n\n## Seção\n\nParágrafo.';
    expect(injectInlineCtas(content, CTA)).toBe(content);
  });

  it('sem CTA configurado (null), devolve intacto', () => {
    const content = contentWithImages(2);
    expect(injectInlineCtas(content, null)).toBe(content);
  });

  it('com URL do CTA vazia, devolve intacto', () => {
    const content = contentWithImages(2);
    expect(injectInlineCtas(content, { ...CTA, url: '   ' })).toBe(content);
  });
});
