import type { MetadataRoute } from 'next';
import { getAllArticles } from '@/lib/blog/supabase-blog';
import { AUTOBLOG_PROFILE } from '@/lib/autoblog-profile';

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
