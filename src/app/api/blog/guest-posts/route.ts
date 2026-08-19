// src/app/api/blog/guest-posts/route.ts
// POST protegido por CRON_SECRET: publica um guest post (texto de convidado).
// Valida, insere com byline, revalida e dispara a divulgação configurada.
// A revisão editorial do texto continua sendo do dono ANTES desta chamada.
import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { insertArticle } from '@/lib/blog/supabase-blog';
import { validateGuestPost, extractGuestBacklinks, type GuestPostInput } from '@/lib/blog/guest-posts';
import { injectInlineCtas } from '@/lib/blog/image-body';
import { distributeArticle, buildDistributionArticle } from '@/lib/blog/distribution';
import { AUTOBLOG_PROFILE } from '@/lib/autoblog-profile';

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization') ?? '';
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const raw = (body ?? {}) as Record<string, unknown>;
  const input: GuestPostInput = {
    title: typeof raw.title === 'string' ? raw.title : '',
    page_title: typeof raw.page_title === 'string' ? raw.page_title : null,
    slug: typeof raw.slug === 'string' ? raw.slug : '',
    meta_desc: typeof raw.meta_desc === 'string' ? raw.meta_desc : '',
    content: typeof raw.content === 'string' ? raw.content : '',
    keyword: typeof raw.keyword === 'string' ? raw.keyword : '',
    category: typeof raw.category === 'string' ? raw.category : null,
    cover_url: typeof raw.cover_url === 'string' ? raw.cover_url : null,
    guest_author: typeof raw.guest_author === 'string' ? raw.guest_author : '',
    guest_bio: typeof raw.guest_bio === 'string' ? raw.guest_bio : null,
    guest_url: typeof raw.guest_url === 'string' ? raw.guest_url : '',
  };

  const validation = validateGuestPost(
    input,
    AUTOBLOG_PROFILE.editorial.categories.map(c => c.slug),
  );
  if (!validation.ok) {
    return NextResponse.json(
      { error: 'invalid_guest_post', details: validation.errors },
      { status: 400 },
    );
  }

  try {
    // Mesma regra editorial do pipeline: um CTA após cada imagem do corpo
    const cta = AUTOBLOG_PROFILE.cta.url.trim() ? AUTOBLOG_PROFILE.cta : null;
    const contentWithCtas = injectInlineCtas(input.content, cta);

    const finalSlug = await insertArticle({
      slug: input.slug,
      title: input.title,
      page_title: input.page_title ?? null,
      meta_desc: input.meta_desc,
      content: contentWithCtas,
      cover_url: input.cover_url ?? null,
      cover_alt: null,
      keyword: input.keyword,
      category: input.category ?? null,
      guest_author: input.guest_author,
      guest_bio: input.guest_bio ?? null,
      guest_url: input.guest_url,
    });

    revalidatePath('/blog');
    revalidatePath(`/blog/${finalSlug}`);
    if (input.category) revalidatePath(`/categoria/${input.category}`);

    // Divulgação reusada — guest post entra nos mesmos plugs do pipeline
    const distConfig = AUTOBLOG_PROFILE.integrations.distribution;
    if (distConfig.enabled && distConfig.channels.length > 0) {
      try {
        const results = await distributeArticle(
          buildDistributionArticle({
            title: input.title,
            pageTitle: input.page_title ?? null,
            slug: finalSlug,
            metaDesc: input.meta_desc,
            keyword: input.keyword,
          }),
          [...distConfig.channels],
        );
        for (const result of results) {
          if (!result.ok) {
            console.warn(`[blog/guest-posts] Divulgação '${result.channel}' falhou:`, result.error);
          }
        }
      } catch (err) {
        console.warn('[blog/guest-posts] Divulgação indisponível:', err);
      }
    }

    const externalLinks = extractGuestBacklinks(input.content, AUTOBLOG_PROFILE.brand.siteUrl);
    return NextResponse.json({ success: true, slug: finalSlug, externalLinks }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[blog/guest-posts] Falhou:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
