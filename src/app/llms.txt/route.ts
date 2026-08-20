// src/app/llms.txt/route.ts
// GEO: arquivo de acesso para LLMs (padrão llms.txt) — dá às ferramentas de IA
// um mapa citável do site, em texto plano e visível (nada de conteúdo oculto).
import { AUTOBLOG_PROFILE } from '@/lib/autoblog-profile';

// Conteúdo muda só quando o perfil muda — cache de 24h evita render por request.
export const revalidate = 86400;

export async function GET() {
  const { brand, editorial } = AUTOBLOG_PROFILE;
  const categories = editorial.categories
    .map(c => `- [${c.label}](${brand.siteUrl}/categoria/${c.slug}): artigos da categoria ${c.label}`)
    .join('\n');

  const text = `# ${brand.name}

> ${editorial.businessDescription}
${editorial.audience ? `>\n> Público: ${editorial.audience}` : ''}

- [Blog](${brand.siteUrl}/blog): todos os artigos publicados
${categories}
- [Sitemap](${brand.siteUrl}/sitemap.xml)

Os artigos são publicados em ${brand.siteUrl}/blog e cada página traz o conteúdo completo.`;

  return new Response(text, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
