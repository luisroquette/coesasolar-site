export const maxDuration = 300; // Vercel Pro — até 300s para pipeline completo
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { claimBlogRunToday, insertArticle, insertRunLog, getPublishedKeywords } from '@/lib/blog/supabase-blog';
import { fetchTopKeyword } from '@/lib/blog/gsc';
import { generateArticle } from '@/lib/blog/deepseek';
import { generateAndUploadCover, renderArticleImages } from '@/lib/blog/image-gen';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization') ?? '';
  const cronSecret = process.env.CRON_SECRET;
  const isAuthorized = !!cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Claim atômico antes de qualquer chamada externa: evita publicação duplicada
  // quando cron/manual chegam quase simultaneamente.
  if (!(await claimBlogRunToday())) {
    return NextResponse.json({ message: 'already_run_today' }, { status: 200 });
  }

  let keyword: string | undefined;

  try {
    // 1. Keyword do dia
    const existingKeywords = await getPublishedKeywords();
    keyword = await fetchTopKeyword(existingKeywords);

    // 2. Gerar artigo
    const article = await generateArticle(keyword);

    // 3. Gerar imagem de capa (falha silenciosa — não bloqueia publicação)
    const coverUrl = await generateAndUploadCover(article.image_prompt, article.slug);

    // 3.5 Imagens do corpo: substitui os marcadores {{IMAGEM:...}} do texto
    // por figuras geradas/upadas (falha por imagem é silenciosa).
    const renderedContent = await renderArticleImages(article.content, article.slug);

    // 4. Salvar artigo (com collision handling interno)
    const finalSlug = await insertArticle({
      slug: article.slug,
      title: article.title,
      meta_desc: article.meta_desc,
      content: renderedContent,
      cover_url: coverUrl,
      keyword,
    });

    // 5. Log de sucesso — feito IMEDIATAMENTE após insert do artigo.
    // Crítico: se o revalidatePath abaixo falhar, o log já existe e o próximo
    // cron run verá 'success' e não vai duplicar o artigo.
    await insertRunLog({ keyword, status: 'success' });

    // 6. Revalidar páginas ISR
    revalidatePath('/blog');
    revalidatePath(`/blog/${finalSlug}`);

    return NextResponse.json({ success: true, slug: finalSlug });

  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[blog/generate] Pipeline falhou:', errorMsg);

    await insertRunLog({
      keyword,
      status: 'error',
      error: errorMsg,
    }).catch(() => {}); // não deixar o log falhar silenciar o erro principal

    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
