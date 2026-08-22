import type { MetadataRoute } from 'next';
import { getAllArticles } from '@/lib/blog/supabase-blog';
import { AUTOBLOG_PROFILE } from '@/lib/autoblog-profile';

// REGRESSÃO 22/08/2026 — relatório do Sentinel (regras-universais.5, "artigo mais
// recente ausente do sitemap"): sem revalidate, esta rota é gerada 1x no build e fica
// congelada até o próximo deploy — artigos publicados pelo cron do autoblog depois do
// build nunca entram no sitemap.xml servido, mesmo semanas depois. As rotas irmãs
// (/blog, /categoria/[slug]) já usam ISR 1h; esta era a exceção.
export const revalidate = 3600; // ISR 1h — mesmo padrão de /blog e /categoria/[slug]

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = AUTOBLOG_PROFILE.brand.siteUrl;
  const entries: MetadataRoute.Sitemap = [
    {
      url: `${siteUrl}/blog`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    // Páginas de categoria: arquitetura da informação (RD) — indexar todas
    ...AUTOBLOG_PROFILE.editorial.categories.map(category => ({
      url: `${siteUrl}/categoria/${category.slug}`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.5,
    })),
  ];

  try {
    const articles = await getAllArticles();
    for (const article of articles) {
      entries.push({
        url: `${siteUrl}/blog/${article.slug}`,
        lastModified: new Date(article.published_at),
        changeFrequency: 'weekly',
        priority: 0.8,
      });
    }
  } catch {
    // Supabase indisponível em build time — sitemap sai só com a listagem
  }

  return entries;
}
