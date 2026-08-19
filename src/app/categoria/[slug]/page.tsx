import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getArticlesByCategory, type ArticleSummary } from '@/lib/blog/supabase-blog';
import BlogPagination from '@/components/blog/BlogPagination';
import { AUTOBLOG_PROFILE } from '@/lib/autoblog-profile';

export const revalidate = 3600; // ISR 1h

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const category = AUTOBLOG_PROFILE.editorial.categories.find(c => c.slug === slug);
  if (!category) return {};
  return {
    title: `${category.label} | ${AUTOBLOG_PROFILE.blog.title}`,
    description: `Artigos de ${category.label} — ${AUTOBLOG_PROFILE.blog.description}`,
    alternates: { canonical: `${AUTOBLOG_PROFILE.brand.siteUrl}/categoria/${slug}` },
  };
}

export default async function CategoryPage({ params }: Props) {
  const { slug } = await params;
  const category = AUTOBLOG_PROFILE.editorial.categories.find(c => c.slug === slug);
  if (!category) notFound();

  let articles: ArticleSummary[] = [];
  try {
    articles = await getArticlesByCategory(slug);
  } catch {
    // Supabase indisponível em build time — listagem vazia
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="container max-w-6xl mx-auto px-4 py-16">
        <header className="mb-12 text-center">
          <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-primary mb-2">
            Categoria
          </p>
          <h1 className="font-display text-4xl md:text-5xl font-bold text-foreground">
            {category.label}
          </h1>
          <Link
            href="/blog"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-block mt-3"
          >
            ← Blog
          </Link>
        </header>

        {articles.length === 0 ? (
          <p className="text-center text-muted-foreground">
            Nenhum artigo nesta categoria ainda.
          </p>
        ) : (
          <BlogPagination articles={articles} pageSize={12} />
        )}
      </div>
    </main>
  );
}
