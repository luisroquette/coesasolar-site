// src/components/blog/BlogPagination.tsx
'use client';
import { useState } from 'react';
import ArticleCard from './ArticleCard';
import type { Article } from '@/lib/blog/supabase-blog';

interface BlogPaginationProps {
  articles: Article[];
  pageSize: number;
}

export default function BlogPagination({ articles, pageSize }: BlogPaginationProps) {
  const [page, setPage] = useState(1);
  const totalPages = Math.ceil(articles.length / pageSize);
  const visible = articles.slice((page - 1) * pageSize, page * pageSize);

  return (
    <>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {visible.map(article => (
          <ArticleCard key={article.slug} article={article} />
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-12">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={`w-9 h-9 rounded-full text-sm font-mono transition-all ${
                p === page
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border text-muted-foreground hover:border-primary/40'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
