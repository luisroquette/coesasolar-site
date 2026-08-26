// Blog do coesasolar.com.br: tabelas prefixadas coesa_* no schema public
// de um Supabase DEDICADO ao coesasolar (projeto sapsikmekwfwcnpyvzed,
// regiao sa-east-1 — Sao Paulo, menor latencia do Brasil). Ate 24/08/2026
// dividia banco com o CF Gauss (fvyknyvetpbxtdagrxqr) — desacoplado por
// decisao do dono (coesasolar nao tem nada a ver com cfgauss). Um projeto
// intermediario (pwxqcfmrmxmwxgqkvdui, us-east-2) existiu por ~1h antes
// de ser recriado na regiao certa. Schema, RPCs e os 6 artigos publicados
// foram migrados 1:1 e verificados por hash MD5; prefixo coesa_ mantido de
// proposito so pra nao precisar tocar em codigo.
//
// Escritas do pipeline (artigo diário + run log) usam RPCs SECURITY DEFINER
// (coesa_blog_claim_run / coesa_blog_insert_article / coesa_blog_insert_run_log)
// que validam o CRON_SECRET por hash — sem service_role parado no runtime.
// Novas tabelas (comentários, métricas, links, pauta, guest posts) são
// servidor-only: escrevem com service role via getServiceClient(), sempre
// atrás de rotas autenticadas (CRON_SECRET ou chave de API própria).
import { createClient } from '@supabase/supabase-js';

const TABLES = {
  articles: 'coesa_articles',
  runLog: 'coesa_blog_run_log',
} as const;

function getClient() {
  const url = process.env.BLOG_SUPABASE_URL!;
  const key = process.env.BLOG_SUPABASE_ANON_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Cliente com service role — SOMENTE em código server (rotas de API/cron). */
export function getServiceClient() {
  const url = process.env.BLOG_SUPABASE_URL!;
  const key = process.env.BLOG_SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

function getCronSecret(): string {
  return process.env.CRON_SECRET ?? '';
}

export interface Article {
  id: string;
  slug: string;
  title: string;
  page_title: string | null;
  meta_desc: string | null;
  content: string;
  cover_url: string | null;
  cover_alt: string | null;
  keyword: string | null;
  category: string | null;
  published_at: string;
  // Guest post (migration 008) — opcionais porque tabelas antigas podem não ter
  guest_author?: string | null;
  guest_bio?: string | null;
  guest_url?: string | null;
}

/** Campos leves para listagem — sem `content`, que pesa centenas de KB no ISR. */
export interface ArticleSummary {
  slug: string;
  title: string;
  meta_desc: string | null;
  cover_url: string | null;
  keyword: string | null;
  category: string | null;
  published_at: string;
}

export interface InsertArticleInput {
  slug: string;
  title: string;
  page_title: string | null;
  meta_desc: string | null;
  content: string;
  cover_url: string | null;
  cover_alt: string | null;
  keyword: string | null;
  category: string | null;
  // Guest post (rota protegida por CRON_SECRET): quando presentes, o insert
  // usa service role direto em vez do RPC (byline de convidado).
  guest_author?: string | null;
  guest_bio?: string | null;
  guest_url?: string | null;
}

/** Resultado do claim do dia: distingue "pode publicar", "já publicou" e "claim falhou". */
export type BlogClaimResult = 'claimed' | 'already_run' | 'error';

/** Pura: interpreta a resposta do RPC de claim SEM confundir erro de infra com "já rodou hoje".
 *  REGRESSÃO 17/08/2026: um erro no coesa_blog_claim_run (RPC ausente/secret/transitório)
 *  virava `false` e a rota respondia 200 "already_run_today" — dia perdido em silêncio
 *  (sem artigo, sem run_log, sem erro). Agora erro vira 'error' e a rota responde 500.
 *
 *  REGRESSÃO 18/08/2026 (dia útil perdido): o MESMO buraco ainda existia para o caso
 *  em que o RPC responde sem erro mas devolve `data` nulo/não-booleano — o código antigo
 *  caía em `data === true ? ... : 'already_run'` e respondia 200 "already_run_today",
 *  pulando o dia em silêncio. Só `false` explícito significa "já rodou"; qualquer outro
 *  retorno inesperado agora vira 'error' (500, visível e re-tentável pelo cron das 13:30). */
export function interpretClaimResult(
  data: unknown,
  error: { message?: string } | null,
): BlogClaimResult {
  if (error) return 'error';
  if (data === true) return 'claimed';
  if (data === false) return 'already_run';
  return 'error';
}

/** Claims today's run before generation, preventing concurrent cron duplicates. */
export async function claimBlogRunToday(): Promise<BlogClaimResult> {
  const supabase = getClient();
  const { data, error } = await supabase.rpc('coesa_blog_claim_run', {
    p_secret: getCronSecret(),
  });
  if (error) console.error('[claimBlogRunToday] RPC error:', error.message);
  return interpretClaimResult(data, error);
}

export async function getPublishedKeywords(): Promise<string[]> {
  const supabase = getClient();
  const { data } = await supabase
    .from(TABLES.articles)
    .select('keyword')
    .eq('status', 'published');
  return (data ?? []).map((r: { keyword: string | null }) => r.keyword ?? '').filter(Boolean);
}

export async function insertArticle(input: InsertArticleInput): Promise<string> {
  // Guest post: insert direto com service role (byline de convidado). A rota
  // /api/blog/guest-posts é protegida por CRON_SECRET — nunca rota pública.
  if (input.guest_author) {
    const supabase = getServiceClient();
    const candidates = [input.slug, `${input.slug}-2`, `${input.slug}-3`];
    for (const slug of candidates) {
      const { error } = await supabase
        .from(TABLES.articles)
        .insert({
          slug,
          title: input.title,
          page_title: input.page_title,
          meta_desc: input.meta_desc,
          content: input.content,
          cover_url: input.cover_url,
          cover_alt: input.cover_alt,
          keyword: input.keyword,
          category: input.category,
          guest_author: input.guest_author,
          guest_bio: input.guest_bio ?? null,
          guest_url: input.guest_url ?? null,
        });
      if (!error) return slug;
      if (error.code !== '23505') throw new Error(`Supabase insert error: ${error.message}`);
    }
    throw new Error('slug_collision');
  }

  const supabase = getClient();
  const { data, error } = await supabase.rpc('coesa_blog_insert_article', {
    p_secret: getCronSecret(),
    p_slug: input.slug,
    p_title: input.title,
    p_page_title: input.page_title,
    p_meta_desc: input.meta_desc,
    p_content: input.content,
    p_cover_url: input.cover_url,
    p_cover_alt: input.cover_alt,
    p_keyword: input.keyword,
    p_category: input.category,
  });
  if (error) throw new Error(`Supabase insert error: ${error.message}`);
  if (!data) throw new Error('slug_collision');
  return data as string;
}

export async function insertRunLog(params: {
  keyword?: string;
  status: 'success' | 'error';
  error?: string;
}): Promise<void> {
  const supabase = getClient();
  const { error } = await supabase.rpc('coesa_blog_insert_run_log', {
    p_secret: getCronSecret(),
    p_keyword: params.keyword ?? null,
    p_status: params.status,
    p_error: params.error ?? null,
  });
  if (error) console.error('[insertRunLog] RPC error:', error.message);
}

/** Candidatos de interlinkagem: slugs/títulos publicados para alimentar o prompt. */
export async function getLinkCandidates(): Promise<Array<{ slug: string; title: string }>> {
  const supabase = getClient();
  const { data } = await supabase
    .from(TABLES.articles)
    .select('slug, title')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(30);
  return data ?? [];
}

export async function getAllArticles(): Promise<ArticleSummary[]> {
  const supabase = getClient();
  const { data } = await supabase
    .from(TABLES.articles)
    .select('slug, title, meta_desc, cover_url, keyword, category, published_at')
    .eq('status', 'published')
    .order('published_at', { ascending: false });
  return data ?? [];
}

export async function getArticlesByCategory(category: string): Promise<ArticleSummary[]> {
  const supabase = getClient();
  const { data } = await supabase
    .from(TABLES.articles)
    .select('slug, title, meta_desc, cover_url, keyword, category, published_at')
    .eq('status', 'published')
    .eq('category', category)
    .order('published_at', { ascending: false });
  return data ?? [];
}

/** Slug + content de todos os publicados — usado na auditoria de links. */
export async function getAllArticleContents(): Promise<Array<{ slug: string; content: string }>> {
  const supabase = getClient();
  const { data } = await supabase
    .from(TABLES.articles)
    .select('slug, content')
    .eq('status', 'published');
  return data ?? [];
}

/** Checagem barata de existência (sem baixar content) — validação de comentários. */
export async function articleSlugExists(slug: string): Promise<boolean> {
  const supabase = getClient();
  const { data } = await supabase
    .from(TABLES.articles)
    .select('slug')
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle();
  return !!data;
}

export async function getArticleBySlug(slug: string): Promise<Article | null> {
  const supabase = getClient();
  const { data } = await supabase
    .from(TABLES.articles)
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .single();
  return data ?? null;
}

/** Upload genérico no bucket blog-covers (capa e imagens do corpo). */
export async function uploadImageToStorage(
  path: string,
  buffer: Buffer,
  contentType: string,
): Promise<string | null> {
  const supabase = getServiceClient();
  const { error } = await supabase.storage
    .from('blog-covers')
    .upload(path, buffer, { contentType, upsert: true });
  if (error) {
    console.error('[uploadImageToStorage] Storage error:', error.message);
    return null;
  }
  const { data } = supabase.storage.from('blog-covers').getPublicUrl(path);
  return data.publicUrl;
}
