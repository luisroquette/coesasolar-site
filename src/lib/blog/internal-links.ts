// src/lib/blog/internal-links.ts
// Interlinkagem automática: artigos já publicados alimentam o prompt do próximo
// artigo, ranqueados por overlap de tokens com a keyword do dia.

export interface LinkCandidate {
  slug: string;
  title: string;
}

const STOPWORDS = new Set([
  'como', 'para', 'que', 'com', 'sem', 'seu', 'sua', 'dos', 'das',
  'fazer', 'porque', 'sobre', 'quando', 'onde', 'mais', 'menos',
]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 3 && !STOPWORDS.has(t));
}

/**
 * Ranqueia candidatos por overlap de tokens com a keyword.
 * Sem nenhum match, cai nos primeiros da lista (mais recentes, na ordem do select).
 */
export function scoreInternalLinks(
  keyword: string,
  articles: LinkCandidate[],
  limit = 3,
): Array<{ label: string; url: string }> {
  const kwTokens = new Set(tokenize(keyword));

  const scored = articles
    .map(article => ({
      article,
      score: tokenize(article.title).filter(t => kwTokens.has(t)).length,
    }))
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score);

  const chosen = scored.length > 0
    ? scored.slice(0, limit).map(s => s.article)
    : articles.slice(0, limit);

  return chosen.map(a => ({ label: a.title, url: `/blog/${a.slug}` }));
}
