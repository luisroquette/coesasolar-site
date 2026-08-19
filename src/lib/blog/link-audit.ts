// src/lib/blog/link-audit.ts
// Auditoria periódica de links quebrados (Neil: "links quebrados custam posições").
// Internos de /blog/* são checados na TABELA (barato); o resto via fetch com
// timeout e User-Agent próprio. 401/403 não contam como quebrados — bots são
// bloqueados por WAFs e isso viraria falso positivo.
import { articleSlugExists, getAllArticleContents, getServiceClient } from '@/lib/blog/supabase-blog';
import { AUTOBLOG_PROFILE } from '@/lib/autoblog-profile';

const getClient = getServiceClient;

// suporta [texto](url) e [texto](url "título") — título é descartado
const LINK_REGEX = /(?<!!)\[([^\]]+)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;
const IGNORED_SCHEMES = new Set(['mailto:', 'tel:', 'javascript:']);

/** Links markdown do conteúdo — ignora âncoras (#), mailto:/tel: e imagens ![](...). */
export function extractMarkdownLinks(content: string): string[] {
  const links: string[] = [];
  for (const match of content.matchAll(LINK_REGEX)) {
    const href = match[2] ?? '';
    if (href.startsWith('#')) continue;
    if ([...IGNORED_SCHEMES].some(scheme => href.toLowerCase().startsWith(scheme))) continue;
    links.push(href);
  }
  return links;
}

/** Interno = mesmo host do site (ou caminho relativo sem esquema). */
export function isInternalLink(href: string, siteUrl: string): boolean {
  try {
    const target = new URL(href, siteUrl);
    return target.host === new URL(siteUrl).host;
  } catch {
    // href sem esquema = relativo = interno; esquema desconhecido cai fora
    return !/^[a-z][a-z0-9+.-]*:/i.test(href);
  }
}

/** Quebrado = 404/410, erro 5xx ou falha de rede. 401/403/redirects = OK. */
export function isBrokenStatus(status: number | null): boolean {
  if (status === null) return true; // timeout/DNS/SSL — quebrado até prova em contrário
  if (status === 404 || status === 410) return true;
  return status >= 500 && status <= 599;
}

async function checkExternalLink(url: string, siteUrl: string): Promise<number | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const options: RequestInit = {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': `MyBlogLinkAudit/1.0 (+${siteUrl})` },
    };
    let response = await fetch(url, { ...options, method: 'HEAD' });
    // Alguns servidores bloqueiam HEAD — tenta GET uma vez
    if (response.status === 405 || response.status === 403) {
      response = await fetch(url, { ...options, method: 'GET' });
    }
    return response.status;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export interface AuditArticle {
  slug: string;
  content: string;
}

export interface BrokenLink {
  url: string;
  status: number | null;
}

export async function auditArticleLinks(
  article: AuditArticle,
  siteUrl: string,
): Promise<BrokenLink[]> {
  // Links do artigo checados EM PARALELO — o timeout de 8s por link viraria
  // minutos de execução sequencial em blogs grandes.
  const checks = extractMarkdownLinks(article.content).map(async href => {
    let status: number | null;
    if (isInternalLink(href, siteUrl)) {
      const pathname = new URL(href, siteUrl).pathname;
      const blogMatch = pathname.match(/^\/blog\/([a-z0-9-]+)$/);
      if (blogMatch) {
        // interno de blog: checa na tabela (barato, sem renderizar a página)
        status = (await articleSlugExists(blogMatch[1])) ? 200 : 404;
      } else {
        status = await checkExternalLink(new URL(href, siteUrl).toString(), siteUrl);
      }
    } else {
      status = await checkExternalLink(href, siteUrl);
    }
    return { href, status };
  });

  const results = await Promise.all(checks);
  return results
    .filter(({ status }) => isBrokenStatus(status))
    .map(({ href, status }) => ({ url: href, status }));
}

export interface AuditReport {
  checked: number;
  broken: Array<{ slug: string; url: string; status: number | null }>;
}

/** Snapshot por artigo: apaga o resultado anterior e grava o atual. */
async function replaceBrokenLinksSnapshot(slug: string, links: BrokenLink[]): Promise<void> {
  const supabase = getClient();
  const { error: deleteError } = await supabase
    .from('coesa_blog_broken_links')
    .delete()
    .eq('article_slug', slug);
  if (deleteError) console.warn('[link-audit] delete:', deleteError.message);

  if (links.length > 0) {
    const { error } = await supabase.from('coesa_blog_broken_links').insert(
      links.map(link => ({ article_slug: slug, url: link.url, status: link.status })),
    );
    if (error) console.warn('[link-audit] insert:', error.message);
  }
}

/** Varre todos os artigos publicados, grava o snapshot e devolve o relatório. */
export async function runLinkAudit(): Promise<AuditReport> {
  const articles = await getAllArticleContents();
  const siteUrl = AUTOBLOG_PROFILE.brand.siteUrl;
  const broken: AuditReport['broken'] = [];

  // Sequencial por artigo, paralelo por link — artigos têm poucos links e a
  // auditoria é semanal; simplicidade vale mais que concorrência.
  for (const article of articles) {
    const brokenLinks = await auditArticleLinks(article, siteUrl);
    await replaceBrokenLinksSnapshot(article.slug, brokenLinks);
    for (const link of brokenLinks) broken.push({ slug: article.slug, ...link });
  }

  return { checked: articles.length, broken };
}
