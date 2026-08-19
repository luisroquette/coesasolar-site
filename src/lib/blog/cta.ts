// src/lib/blog/cta.ts
// CTA de fim de artigo: primário (configurado no perfil) ou FALLBACK de
// compartilhamento + newsletter quando o dono ainda não tem CTA próprio.
// Guia Neil: o fechamento sempre leva a UMA ação — sem CTA configurado,
// a ação passa a ser divulgar o artigo.

export interface ShareUrls {
  x: string;
  whatsapp: string;
  linkedin: string;
}

export function buildShareUrls(url: string, title: string): ShareUrls {
  const encodedUrl = encodeURIComponent(url);
  const encodedText = encodeURIComponent(title);
  return {
    x: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
    whatsapp: `https://wa.me/?text=${encodedText}%20${encodedUrl}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
  };
}

/** CTA primário existe quando o dono configurou uma URL (vazia = fallback). */
export function hasPrimaryCta(ctaUrl: string): boolean {
  return !!ctaUrl.trim();
}

export interface CtaVariant {
  title: string;
  subtitle: string;
  buttonLabel: string;
  url: string;
}

/** Variante do A/B: determinística por slug+semana (mesmo leitor vê a mesma
 *  variante na semana inteira; sem cookie). Null = lista vazia (sem teste). */
export function resolveCtaVariant(
  slug: string,
  weekIndex: number,
  variants: readonly CtaVariant[],
): number | null {
  if (variants.length === 0) return null;
  const key = `${slug}:${weekIndex}`;
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return hash % variants.length;
}
