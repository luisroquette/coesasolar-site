// REGRESSÃO: sumário navegável por âncoras (TOC) gerado no código.
// Protege a regra editorial do dono (20/08): todo artigo tem sumário com âncoras.
// Os slugs usam o MESMO algoritmo do rehype-slug (github-slugger) — se um mudar,
// os links #slug quebram e um teste abaixo falha.
import { describe, it, expect } from 'vitest';
import { extractToc } from './toc';

describe('REGRESSÃO: sumário navegável (TOC)', () => {
  it('extrai H2 e H3 com profundidade, texto limpo e slug estável', () => {
    const toc = extractToc([
      '# Título do artigo',
      '',
      '## Como avaliar solução B2B',
      '',
      '### Orçamento realista',
      '',
      '## Erros comuns',
      '',
      '### Prazo de implementação',
    ].join('\n'));

    expect(toc).toEqual([
      { depth: 2, text: 'Como avaliar solução B2B', slug: 'como-avaliar-solução-b2b' },
      { depth: 3, text: 'Orçamento realista', slug: 'orçamento-realista' },
      { depth: 2, text: 'Erros comuns', slug: 'erros-comuns' },
      { depth: 3, text: 'Prazo de implementação', slug: 'prazo-de-implementação' },
    ]);
  });

  it('ignora o H1 (o título já está na página, não entra no sumário)', () => {
    const toc = extractToc('# Como Avaliar Solução B2B\n\n## Primeiro H2\n\ntexto');
    expect(toc.map(t => t.depth)).toEqual([2]);
  });

  it('ignora headings dentro de blocos de código markdown', () => {
    const toc = extractToc('## H2 real\n\n```\n## H2 fake em código\n```\n\n### H3 real');
    expect(toc.map(t => t.text)).toEqual(['H2 real', 'H3 real']);
  });

  it('remove markdown inline do texto do link (negrito, código, links)', () => {
    const toc = extractToc('## **Como avaliar** [solução](/blog/solucao) `b2b`\n\ntexto');
    expect(toc[0]).toEqual({
      depth: 2,
      text: 'Como avaliar solução b2b',
      slug: 'como-avaliar-solução-b2b',
    });
  });

  it('deduplica slugs repetidos na ordem do documento (bate com o rehype-slug)', () => {
    const toc = extractToc('## Orçamento realista\n\n## Orçamento realista\n\n## Orçamento realista');
    expect(toc.map(t => t.slug)).toEqual([
      'orçamento-realista',
      'orçamento-realista-1',
      'orçamento-realista-2',
    ]);
  });
});
