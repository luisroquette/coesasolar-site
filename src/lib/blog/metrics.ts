// src/lib/blog/metrics.ts
// Métricas próprias do blog: views, engajamento e cliques de CTA por variante.
// GA4 é um PLUG opcional (measurement id no perfil) — esta tabela funciona sem ele.
import { getServiceClient } from '@/lib/blog/supabase-blog';

const getClient = getServiceClient;

export const METRIC_EVENTS = ['view', 'scroll50', 'end', 'cta'] as const;
export type MetricEvent = (typeof METRIC_EVENTS)[number];

export function isValidMetricEvent(value: unknown): value is MetricEvent {
  return typeof value === 'string' && (METRIC_EVENTS as readonly string[]).includes(value);
}

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Slug kebab válido ou null — barra injeção/lixo antes de tocar o banco. */
export function sanitizeSlug(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (value.length > 200) return null;
  return SLUG_REGEX.test(value) ? value : null;
}

const BOT_PATTERNS = [
  /bot/i,
  /crawler/i,
  /spider/i,
  /slurp/i,
  /bytespider/i,
  /perplexity/i,
  /headless/i,
  /curl/i,
  /wget/i,
];

/** Crawlers executam JS e disparariam o beacon — inflam views sem ser leitores. */
export function isLikelyBot(userAgent: string | null): boolean {
  if (!userAgent) return false; // UA ausente não é indício de bot
  return BOT_PATTERNS.some(pattern => pattern.test(userAgent));
}

export async function insertMetric(
  slug: string,
  event: MetricEvent,
  variant?: string | null,
): Promise<void> {
  const supabase = getClient();
  const { error } = await supabase.from('coesa_blog_metrics').insert({
    article_slug: slug,
    event,
    variant: variant && variant.length <= 40 ? variant : null,
  });
  if (error) console.warn('[metrics] insert:', error.message);
}

/** Relatório de um artigo: contagem por evento + cliques de CTA por variante. */
export async function getArticleMetrics(slug: string): Promise<{
  view: number;
  scroll50: number;
  end: number;
  cta: number;
  ctaByVariant: Record<string, number>;
}> {
  const supabase = getClient();
  const counts: Record<MetricEvent, number> = { view: 0, scroll50: 0, end: 0, cta: 0 };

  for (const event of METRIC_EVENTS) {
    const { count } = await supabase
      .from('coesa_blog_metrics')
      .select('id', { count: 'exact', head: true })
      .eq('article_slug', slug)
      .eq('event', event);
    counts[event] = count ?? 0;
  }

  const { data: ctaRows } = await supabase
    .from('coesa_blog_metrics')
    .select('variant')
    .eq('article_slug', slug)
    .eq('event', 'cta');
  const byVariant: Record<string, number> = {};
  for (const row of ctaRows ?? []) {
    const key = row.variant ?? 'padrao';
    byVariant[key] = (byVariant[key] ?? 0) + 1;
  }

  return { ...counts, ctaByVariant: byVariant };
}
