// src/app/api/blog/metrics/route.ts
// POST público (fire-and-forget do beacon) e GET protegido por CRON_SECRET
// para o dono consultar o relatório de um artigo.
import { NextRequest, NextResponse } from 'next/server';
import {
  insertMetric,
  isValidMetricEvent,
  sanitizeSlug,
  isLikelyBot,
  getArticleMetrics,
} from '@/lib/blog/metrics';

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const raw = (body ?? {}) as Record<string, unknown>;
  const slug = sanitizeSlug(raw.articleSlug);
  if (!slug || !isValidMetricEvent(raw.event)) {
    return NextResponse.json({ error: 'invalid_metric' }, { status: 400 });
  }

  // Crawler com JS dispara o beacon e infla views — descarta sem registrar.
  if (isLikelyBot(request.headers.get('user-agent'))) {
    return NextResponse.json({ success: true }, { status: 200 });
  }

  await insertMetric(slug, raw.event, typeof raw.variant === 'string' ? raw.variant : null);
  return NextResponse.json({ success: true }, { status: 201 });
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization') ?? '';
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const slug = sanitizeSlug(request.nextUrl.searchParams.get('slug'));
  if (!slug) return NextResponse.json({ error: 'invalid_slug' }, { status: 400 });

  try {
    const metrics = await getArticleMetrics(slug);
    return NextResponse.json({ slug, metrics });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
