// REGRESSÃO: interlinkagem automática — artigos publicados alimentam o prompt.
import { describe, it, expect } from 'vitest';
import { scoreInternalLinks, type LinkCandidate } from './internal-links';

const ARTICLES: LinkCandidate[] = [
  { slug: 'como-avaliar-solucao-b2b', title: 'Como avaliar solução B2B sem riscos' },
  { slug: 'contratos-de-suporte', title: 'Contratos de suporte: o que exigir' },
  { slug: 'planilha-de-custos', title: 'Planilha de custos para fornecedores' },
  { slug: 'guia-de-sla', title: 'Guia de SLA para iniciantes' },
];

describe('REGRESSÃO: interlinkagem automática', () => {
  it('prioriza artigos com overlap de tokens com a keyword', () => {
    const links = scoreInternalLinks('como avaliar solução b2b', ARTICLES);
    expect(links[0].url).toBe('/blog/como-avaliar-solucao-b2b');
  });

  it('casa tokens sem diferenciar maiúsculas e acentos', () => {
    const links = scoreInternalLinks('SOLUÇÃO B2B', ARTICLES, 4);
    expect(links[0].url).toBe('/blog/como-avaliar-solucao-b2b'); // 'SOLUÇÃO' → 'solucao'
  });

  it('usa os artigos mais recentes como fallback quando nada casa', () => {
    const links = scoreInternalLinks('energia solar residencial', ARTICLES, 2);
    expect(links).toHaveLength(2);
    expect(links[0].url).toBe('/blog/como-avaliar-solucao-b2b'); // primeiro da lista = mais recente
  });

  it('respeita o limite pedido', () => {
    expect(scoreInternalLinks('suporte', ARTICLES, 1)).toHaveLength(1);
  });

  it('ignora stopwords na comparação', () => {
    // 'como' e 'para' não devem gerar match falso entre 'como avaliar...' e 'Guia para iniciantes'
    const links = scoreInternalLinks('como fazer um guia', ARTICLES, 4);
    const slugs = links.map(l => l.url);
    expect(slugs).toContain('/blog/guia-de-sla'); // 'guia' casa
    expect(slugs).not.toContain('/blog/contratos-de-suporte'); // nenhum token relevante casa
  });
});
