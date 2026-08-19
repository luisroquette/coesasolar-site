// Seção de blog da home. Client component (a home é o app Lovable client-only):
// lê os 3 artigos mais recentes direto do PostgREST com a chave anon
// (RLS expõe só published) — envs NEXT_PUBLIC_BLOG_*.
"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";

interface BlogArticle {
  slug: string;
  title: string;
  meta_desc: string | null;
  keyword: string | null;
  published_at: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function HomeBlogSection() {
  const [articles, setArticles] = useState<BlogArticle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_BLOG_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_BLOG_SUPABASE_ANON_KEY;
    if (!url || !anon) {
      setLoading(false);
      return;
    }
    fetch(
      `${url}/rest/v1/coesa_articles?select=slug,title,meta_desc,keyword,published_at&status=eq.published&order=published_at.desc&limit=3`,
      { headers: { apikey: anon, Authorization: `Bearer ${anon}` } }
    )
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setArticles(Array.isArray(data) ? data : []))
      .catch(() => setArticles([]))
      .finally(() => setLoading(false));
  }, []);

  if (!loading && articles.length === 0) return null;

  return (
    <section id="blog" className="py-20 lg:py-32 bg-white">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <p className="text-sm font-medium text-muted-foreground tracking-widest uppercase mb-4">
            Blog
          </p>
          <h2
            className="text-3xl md:text-4xl lg:text-5xl font-medium text-foreground"
            style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
          >
            Energia solar sem dor de cabeça
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mt-4">
            Guias e explicações para quem quer economizar na conta de luz sem
            obras, sem instalação e sem investimento.
          </p>
        </motion.div>

        {loading ? (
          <div className="grid gap-6 md:grid-cols-3 max-w-5xl mx-auto">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-sm border border-border p-6 space-y-3">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-4 w-5/6" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-3 max-w-5xl mx-auto">
            {articles.map((article) => (
              <a
                key={article.slug}
                href={`/blog/${article.slug}`}
                className="group block rounded-sm border border-border p-6 hover:border-primary/40 transition-colors bg-background"
              >
                {article.keyword && (
                  <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3 line-clamp-1">
                    {article.keyword}
                  </p>
                )}
                <h3
                  className="text-lg font-medium text-foreground group-hover:text-primary transition-colors leading-snug line-clamp-3 mb-2"
                  style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
                >
                  {article.title}
                </h3>
                {article.meta_desc && (
                  <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
                    {article.meta_desc}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-3">
                  {formatDate(article.published_at)}
                </p>
              </a>
            ))}
          </div>
        )}

        <div className="text-center mt-10">
          <a
            href="/blog"
            className="text-sm font-medium text-primary hover:text-primary/80 transition-colors"
          >
            Ver todos os artigos →
          </a>
        </div>
      </div>
    </section>
  );
}
