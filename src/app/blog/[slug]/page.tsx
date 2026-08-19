// src/app/blog/[slug]/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getArticleBySlug } from '@/lib/blog/supabase-blog';
import ArticleBody from '@/components/blog/ArticleBody';
import EndCta from '@/components/blog/EndCta';
import LeadForm from '@/components/blog/LeadForm';
import Comments from '@/components/blog/Comments';
import CommentForm from '@/components/blog/CommentForm';
import ArticleMetrics from '@/components/blog/ArticleMetrics';
import { buildArticleSchema, buildFaqSchema, buildBreadcrumbSchema, extractFaq } from '@/lib/blog/schema';
import { AUTOBLOG_PROFILE } from '@/lib/autoblog-profile';

export const revalidate = 86400; // ISR 24h
// dynamicParams: true é o default — novos slugs renderizados on-demand sem 404

interface Props {
  params: Promise<{ slug: string }>; // Next.js 16: params é Promise
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);
  if (!article) return {};
  return {
    // page_title (SEO) pode divergir do H1 (editorial) — guias Neil/RD
    title: `${article.page_title ?? article.title} | ${AUTOBLOG_PROFILE.brand.name}`,
    description: article.meta_desc ?? undefined,
    alternates: { canonical: `${AUTOBLOG_PROFILE.brand.siteUrl}/blog/${slug}` },
    openGraph: {
      type: 'article',
      title: article.title,
      description: article.meta_desc ?? undefined,
      url: `${AUTOBLOG_PROFILE.brand.siteUrl}/blog/${slug}`,
      images: article.cover_url ? [{ url: article.cover_url, width: 1536, height: 1024 }] : [],
    },
  };
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);
  if (!article) notFound();

  const publishedDate = new Date(article.published_at).toISOString();
  const readableDate = new Date(article.published_at).toLocaleDateString('pt-BR', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  const articleSchema = buildArticleSchema(article, AUTOBLOG_PROFILE.brand);
  // Formato FAQ/PAA (H2s em forma de pergunta) ganha FAQPage JSON-LD
  const faq = extractFaq(article.content);
  const faqSchema = faq.length >= 2 ? buildFaqSchema(faq) : null;

  // Breadcrumbs: Blog > Categoria > Artigo (arquitetura da informação — RD)
  const category = AUTOBLOG_PROFILE.editorial.categories.find(c => c.slug === article.category);
  const breadcrumbItems = category
    ? [
        { name: 'Blog', url: `${AUTOBLOG_PROFILE.brand.siteUrl}/blog` },
        { name: category.label, url: `${AUTOBLOG_PROFILE.brand.siteUrl}/categoria/${category.slug}` },
        { name: article.title, url: `${AUTOBLOG_PROFILE.brand.siteUrl}/blog/${article.slug}` },
      ]
    : [];
  const breadcrumbSchema = breadcrumbItems.length > 0 ? buildBreadcrumbSchema(breadcrumbItems) : null;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
      />
      {faqSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
        />
      )}
      {breadcrumbSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
        />
      )}
      <main className="min-h-screen bg-background">
        <div className="container max-w-3xl mx-auto px-4 py-16">
          <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground mb-8 flex items-center gap-2">
            <Link href="/blog" className="hover:text-foreground transition-colors">
              Blog
            </Link>
            {category && (
              <>
                <span aria-hidden="true">›</span>
                <Link
                  href={`/categoria/${category.slug}`}
                  className="hover:text-foreground transition-colors"
                >
                  {category.label}
                </Link>
              </>
            )}
          </nav>

          {/* Usar <img> padrão, NÃO next/image — evita configurar remotePatterns para Supabase Storage.
              width/height fixos = ratio 3:2 conhecido, sem CLS na capa. */}
          {article.cover_url && (
            <img
              src={article.cover_url}
              alt={article.cover_alt ?? article.title}
              width={1536}
              height={1024}
              className="w-full rounded-2xl mb-8 object-cover max-h-[400px]"
            />
          )}

          <header className="mb-8">
            {article.keyword && (
              <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-primary mb-3 block">
                {article.keyword}
              </span>
            )}
            <h1 className="text-3xl md:text-4xl font-bold text-foreground leading-tight mb-3">
              {article.title}
            </h1>
            <p className="text-sm text-muted-foreground">
              {article.guest_author && (
                <>
                  Por{' '}
                  {article.guest_url ? (
                    <a
                      href={article.guest_url}
                      target="_blank"
                      rel="author noopener noreferrer"
                      className="underline hover:text-foreground transition-colors"
                    >
                      {article.guest_author}
                    </a>
                  ) : (
                    article.guest_author
                  )}{' '}
                  ·{' '}
                </>
              )}
              {AUTOBLOG_PROFILE.brand.name} · <time dateTime={publishedDate}>{readableDate}</time>
            </p>
          </header>

          <ArticleBody content={article.content} />

          <EndCta title={article.title} slug={article.slug} />

          {/* Bio do convidado: a moeda do guest post (visibilidade do autor) */}
          {article.guest_author && article.guest_bio && (
            <div className="mt-8 p-6 rounded-2xl border border-border bg-card">
              <p className="text-sm font-semibold text-foreground mb-2">
                Sobre {article.guest_author}
              </p>
              <p className="text-sm text-muted-foreground">{article.guest_bio}</p>
            </div>
          )}

          {/* Captura de leads: só renderiza com plug de CRM ligado no perfil */}
          {AUTOBLOG_PROFILE.integrations.leadCapture.enabled && (
            <LeadForm source={`/blog/${article.slug}`} keyword={article.keyword} />
          )}

          {/* Comentários: leitura pública de aprovados + formulário com moderação */}
          <Comments slug={article.slug} />
          <CommentForm slug={article.slug} />

          {/* Métricas próprias: beacon de view/scroll50/end (GA4 é plug opcional) */}
          <ArticleMetrics slug={article.slug} />
        </div>
      </main>
    </>
  );
}
