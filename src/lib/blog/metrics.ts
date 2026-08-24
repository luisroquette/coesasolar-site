// src/lib/blog/metrics.ts
// Métricas próprias do blog: views, engajamento e cliques de CTA por variante.
// GA4 é um PLUG opcional (measurement id no perfil) — esta tabela funciona sem ele.
//
// 24/08/2026: migrado de Postgres (1 linha por evento de leitor, sem TTL) para
// Redis (Upstash, via integração Vercel `coesasolar-metrics`) — CLAUDE.md geral
// proíbe fila de alta escrita direto em Postgres; Redis/Valkey é a opção 1 na
// ordem de preferência (CDN/revalidate não se aplica, contador não é módulo
// local por causa do Fluid Compute). Contadores INCR, sem TTL — Upstash persiste
// em disco, não é dado efêmero, só está fora do caminho de escrita do Postgres.
import { Redis } from '@upstash/redis';

let redisClient: Redis | null = null;
function getRedis(): Redis {
  if (!redisClient) redisClient = Redis.fromEnv();
  return redisClient;
}

export const METRIC_EVENTS = ['view', 'scroll50', 'end', 'cta'] as const;
export type MetricEvent = (typeof METRIC_EVENTS)[number];

export function isValidMetricEvent(value: unknown): value is MetricEvent {
  return typeof value === 'string' && (METRIC_EVENTS as readonly string[]).includes(value);
}

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Slug kebab válido ou null — barra injeção/lixo antes de tocar a chave do Redis. */
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

const CTA_VARIANT_REGEX = /^[a-z0-9_-]{1,40}$/i;

/** Nome de variante seguro pra virar pedaço de chave Redis, ou null. */
function sanitizeVariant(variant: string | null | undefined): string | null {
  if (!variant) return null;
  return CTA_VARIANT_REGEX.test(variant) ? variant : null;
}

function eventKey(slug: string, event: MetricEvent): string {
  return `blog:metrics:${slug}:${event}`;
}
function ctaVariantKey(slug: string, variant: string): string {
  return `blog:metrics:${slug}:cta:variant:${variant}`;
}
function ctaVariantSetKey(slug: string): string {
  return `blog:metrics:${slug}:cta:variants`;
}

export async function insertMetric(
  slug: string,
  event: MetricEvent,
  variant?: string | null,
): Promise<void> {
  const redis = getRedis();
  try {
    await redis.incr(eventKey(slug, event));
    if (event === 'cta') {
      const safeVariant = sanitizeVariant(variant) ?? 'padrao';
      await Promise.all([
        redis.incr(ctaVariantKey(slug, safeVariant)),
        redis.sadd(ctaVariantSetKey(slug), safeVariant),
      ]);
    }
  } catch (error) {
    console.warn('[metrics] incr:', error instanceof Error ? error.message : error);
  }
}

/** Monta o relatório final a partir das contagens brutas — separado pra testar sem Redis. */
export function buildMetricsReport(
  counts: Record<MetricEvent, number | null>,
  variantCounts: Record<string, number | null>,
): {
  view: number;
  scroll50: number;
  end: number;
  cta: number;
  ctaByVariant: Record<string, number>;
} {
  const ctaByVariant: Record<string, number> = {};
  for (const [variant, count] of Object.entries(variantCounts)) {
    ctaByVariant[variant] = count ?? 0;
  }
  return {
    view: counts.view ?? 0,
    scroll50: counts.scroll50 ?? 0,
    end: counts.end ?? 0,
    cta: counts.cta ?? 0,
    ctaByVariant,
  };
}

/** Relatório de um artigo: contagem por evento + cliques de CTA por variante. */
export async function getArticleMetrics(slug: string): Promise<{
  view: number;
  scroll50: number;
  end: number;
  cta: number;
  ctaByVariant: Record<string, number>;
}> {
  const redis = getRedis();

  const [rawCounts, variants] = await Promise.all([
    redis.mget<Array<number | null>>(...METRIC_EVENTS.map(event => eventKey(slug, event))),
    redis.smembers(ctaVariantSetKey(slug)),
  ]);
  const counts = Object.fromEntries(
    METRIC_EVENTS.map((event, i) => [event, rawCounts[i]]),
  ) as Record<MetricEvent, number | null>;

  const variantCounts: Record<string, number | null> = {};
  if (variants.length > 0) {
    const variantValues = await redis.mget<Array<number | null>>(
      ...variants.map(variant => ctaVariantKey(slug, variant)),
    );
    variants.forEach((variant, i) => {
      variantCounts[variant] = variantValues[i];
    });
  }

  return buildMetricsReport(counts, variantCounts);
}
