// src/app/blog/[slug]/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getArticleBySlug } from '@/lib/blog/supabase-blog';
import ArticleBody from '@/components/blog/ArticleBody';
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
    title: `${article.title} | ${AUTOBLOG_PROFILE.brand.name}`,
    description: article.meta_desc ?? undefined,
    alternates: { canonical: `${AUTOBLOG_PROFILE.brand.siteUrl}/blog/${slug}` },
    openGraph: {
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

  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.meta_desc,
    image: article.cover_url,
    datePublished: publishedDate,
    dateModified: publishedDate,
    author: { '@type': 'Organization', name: AUTOBLOG_PROFILE.brand.name, url: AUTOBLOG_PROFILE.brand.siteUrl },
    publisher: {
      '@type': 'Organization',
      name: AUTOBLOG_PROFILE.brand.name,
      url: AUTOBLOG_PROFILE.brand.siteUrl,
      logo: { '@type': 'ImageObject', url: AUTOBLOG_PROFILE.brand.logoUrl },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${AUTOBLOG_PROFILE.brand.siteUrl}/blog/${slug}` },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
      />
      <main className="min-h-screen bg-background">
        <div className="container max-w-3xl mx-auto px-4 py-16">
          <Link
            href="/blog"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors mb-8 inline-block"
          >
            ← Blog
          </Link>

          {/* Usar <img> padrão, NÃO next/image — evita configurar remotePatterns para Supabase Storage */}
          {article.cover_url && (
            <img
              src={article.cover_url}
              alt={article.title}
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
              {AUTOBLOG_PROFILE.brand.name} · <time dateTime={publishedDate}>{readableDate}</time>
            </p>
          </header>

          <ArticleBody content={article.content} />

          <div className="mt-12 p-6 rounded-2xl border border-primary/30 bg-primary/5 text-center">
            <p className="font-semibold text-foreground mb-2">{AUTOBLOG_PROFILE.cta.title}</p>
            <p className="text-sm text-muted-foreground mb-4">{AUTOBLOG_PROFILE.cta.subtitle}</p>
            <a
              href={AUTOBLOG_PROFILE.cta.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-full px-6 py-3 font-semibold text-sm transition-all"
            >
              {AUTOBLOG_PROFILE.cta.buttonLabel}
            </a>
          </div>
        </div>
      </main>
    </>
  );
}
