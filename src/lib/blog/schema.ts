// src/lib/blog/schema.ts
// JSON-LD dos artigos: BlogPosting + FAQPage (quando o formato do post é FAQ).
import type { Article } from './supabase-blog';

export interface BrandRef {
  name: string;
  siteUrl: string;
  logoUrl: string;
}

export interface FaqEntry {
  question: string;
  answer: string;
}

export interface ArticleSchema {
  '@context': string;
  '@type': string;
  headline: string;
  description: string | null;
  image: string | null;
  datePublished: string;
  dateModified: string;
  author: { '@type': string; name: string; url: string };
  publisher: { '@type': string; name: string; url: string; logo: { '@type': string; url: string } };
  mainEntityOfPage: { '@type': string; '@id': string };
}

export interface FaqSchema {
  '@context': string;
  '@type': string;
  mainEntity: Array<{
    '@type': string;
    name: string;
    acceptedAnswer: { '@type': string; text: string };
  }>;
}

const MAX_ANSWER_CHARS = 500;

/** FAQPage não deve carregar markdown cru no rich snippet do Google. */
function stripMarkdown(s: string): string {
  return s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`#>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildArticleSchema(article: Article, brand: BrandRef): ArticleSchema {
  const published = new Date(article.published_at).toISOString();
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: article.title,
    description: article.meta_desc,
    image: article.cover_url,
    datePublished: published,
    dateModified: published,
    author: { '@type': 'Organization', name: brand.name, url: brand.siteUrl },
    publisher: {
      '@type': 'Organization',
      name: brand.name,
      url: brand.siteUrl,
      logo: { '@type': 'ImageObject', url: brand.logoUrl },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${brand.siteUrl}/blog/${article.slug}` },
  };
}

/**
 * Extrai pares pergunta/resposta de H2s em forma de pergunta (formato FAQ/PAA).
 * Resposta = texto até o próximo header. Perguntas sem resposta são descartadas.
 */
export function extractFaq(content: string): FaqEntry[] {
  const faq: FaqEntry[] = [];
  let current: FaqEntry | null = null;

  for (const line of content.split('\n')) {
    const h2 = line.match(/^##\s+(.+)$/);
    if (/^#{1,6}\s/.test(line)) {
      if (current && current.answer.trim()) {
        faq.push({ question: stripMarkdown(current.question), answer: stripMarkdown(current.answer) });
      }
      current = h2 && h2[1].trim().endsWith('?')
        ? { question: h2[1].trim(), answer: '' }
        : null;
      continue;
    }
    if (current && current.answer.length < MAX_ANSWER_CHARS) {
      const piece = line.trim();
      if (piece) current.answer += (current.answer ? ' ' : '') + piece;
    }
  }

  if (current && current.answer.trim()) {
    faq.push({ question: stripMarkdown(current.question), answer: stripMarkdown(current.answer) });
  }
  return faq;
}

export interface BreadcrumbSchema {
  '@context': string;
  '@type': string;
  itemListElement: Array<{ '@type': string; position: number; name: string; item: string }>;
}

export function buildBreadcrumbSchema(items: Array<{ name: string; url: string }>): BreadcrumbSchema {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function buildFaqSchema(faq: FaqEntry[]): FaqSchema {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map(f => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  };
}
