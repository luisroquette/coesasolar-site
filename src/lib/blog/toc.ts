// src/lib/blog/toc.ts
// Sumário navegável por âncoras gerado NO CÓDIGO (nunca confiar no LLM pra gerar
// slugs exatos). Os slugs usam github-slugger — o MESMO algoritmo do rehype-slug
// que adiciona os ids aos headings no ArticleBody, então link e destino batem.
import GithubSlugger from 'github-slugger';

export interface TocItem {
  depth: 2 | 3;
  text: string;
  slug: string;
}

/** Remove markdown inline para deixar só o texto visível do heading. */
function cleanInline(s: string): string {
  return s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // imagens
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links → texto da âncora
    .replace(/`([^`]*)`/g, '$1') // código inline
    .replace(/\*\*([^*]+)\*\*/g, '$1') // negrito
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1$2') // itálico
    .trim();
}

/** Extrai H2/H3 do markdown (H1 fica fora — já é o título da página). */
export function extractToc(content: string): TocItem[] {
  // Headings dentro de fenced code não são conteúdo do artigo.
  const codeStripped = content.replace(/```[\s\S]*?```/g, '');
  const slugger = new GithubSlugger();
  const items: TocItem[] = [];

  for (const line of codeStripped.split('\n')) {
    const m = line.match(/^(#{2,3})\s+(.+)$/);
    if (!m) continue;
    const text = cleanInline(m[2]);
    if (!text) continue;
    items.push({
      depth: m[1].length === 2 ? 2 : 3,
      text,
      slug: slugger.slug(text),
    });
  }

  return items;
}
