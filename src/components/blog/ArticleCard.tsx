// src/components/blog/ArticleCard.tsx
import Link from 'next/link';
import type { Article } from '@/lib/blog/supabase-blog';

interface ArticleCardProps {
  article: Pick<Article, 'slug' | 'title' | 'meta_desc' | 'cover_url' | 'keyword' | 'published_at'>;
}

export default function ArticleCard({ article }: ArticleCardProps) {
  const date = new Date(article.published_at).toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <Link
      href={`/blog/${article.slug}`}
      className="group rounded-2xl border border-border bg-card hover:bg-card/80 overflow-hidden flex flex-col transition-all hover:border-primary/40"
    >
      {article.cover_url ? (
        <img
          src={article.cover_url}
          alt={article.title}
          className="w-full h-48 object-cover"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-48 bg-primary/5 flex items-center justify-center">
          <span className="text-4xl">⚡</span>
        </div>
      )}
      <div className="p-5 flex flex-col gap-2 flex-1">
        {article.keyword && (
          <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-primary">
            {article.keyword}
          </span>
        )}
        <h2 className="font-display font-semibold text-sm text-foreground leading-snug group-hover:text-primary transition-colors line-clamp-2">
          {article.title}
        </h2>
        {article.meta_desc && (
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
            {article.meta_desc}
          </p>
        )}
        <p className="text-[10px] text-muted-foreground mt-auto">{date}</p>
      </div>
    </Link>
  );
}
