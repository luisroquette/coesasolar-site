// src/lib/blog/guest-posts.ts
// Processo de guest posts (Neil: único caminho seguro de backlinks).
// O texto é de UM humano convidado — a validação é um gate básico de qualidade,
// a revisão editorial continua sendo do dono ANTES de publicar.
import { extractMarkdownLinks, isInternalLink } from '@/lib/blog/link-audit';

export interface GuestPostInput {
  title: string;
  page_title?: string | null;
  slug: string;
  meta_desc: string;
  content: string;
  keyword: string;
  category?: string | null;
  cover_url?: string | null;
  guest_author: string;
  guest_bio?: string | null;
  guest_url: string;
}

export interface GuestPostValidation {
  ok: boolean;
  errors: string[];
}

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MIN_WORDS = 800;

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function validateGuestPost(
  input: GuestPostInput,
  allowedCategories: readonly string[] = [],
): GuestPostValidation {
  const errors: string[] = [];
  const title = (input.title ?? '').trim();
  const metaDesc = (input.meta_desc ?? '').trim();
  const content = (input.content ?? '').trim();
  const author = (input.guest_author ?? '').trim();
  const bio = (input.guest_bio ?? '').trim();
  const guestUrl = (input.guest_url ?? '').trim();
  const pageTitle = (input.page_title ?? '').trim();

  if (title.length < 10 || title.length > 120) errors.push('title_invalid');
  if (pageTitle && (pageTitle.length < 10 || pageTitle.length > 60)) errors.push('page_title_invalid');
  if (!SLUG_REGEX.test(input.slug) || input.slug.length > 200) errors.push('slug_invalid');
  if (metaDesc.length < 50 || metaDesc.length > 155) errors.push('meta_desc_invalid');
  if (content.split(/\s+/).length < MIN_WORDS) errors.push('content_too_short');
  if (!(input.keyword ?? '').trim()) errors.push('keyword_missing');
  if (author.length < 2 || author.length > 80) errors.push('guest_author_invalid');
  if (bio.length > 300) errors.push('guest_bio_invalid');
  if (!isValidHttpUrl(guestUrl)) errors.push('guest_url_invalid');
  // Categoria fora do perfil vira artigo órfão (página /categoria dá 404)
  if (input.category && !allowedCategories.includes(input.category)) {
    errors.push('category_invalid');
  }

  return { ok: errors.length === 0, errors };
}

/** Links EXTERNOS que o convidado inseriu no texto — transparência anti-spam:
 *  o dono revisa essa lista antes de aprovar a publicação. */
export function extractGuestBacklinks(content: string, siteUrl: string): string[] {
  const links = extractMarkdownLinks(content);
  const external = links.filter(href => !isInternalLink(href, siteUrl));
  return [...new Set(external)];
}
