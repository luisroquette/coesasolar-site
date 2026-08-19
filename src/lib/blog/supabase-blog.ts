// Autoblog do auditoria.coesasolar.com.br — plano B (19/08/2026):
// tabelas prefixadas coesa_* no schema public do Supabase do CF Gauss
// (projeto fvyknyvetpbxtdagrxqr), porque o Supabase do próprio site
// (ztailhc...) está em conta inacessível.
//
// Sem service_role: leituras usam a chave anon (RLS permite SELECT público
// de artigos published); escritas usam RPCs SECURITY DEFINER
// (coesa_blog_claim_run / coesa_blog_insert_article / coesa_blog_insert_run_log)
// que validam o CRON_SECRET por hash — mesmo padrão dos gates admin_tem_*.
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

function getCronSecret(): string {
  return process.env.CRON_SECRET ?? '';
}

export interface Article {
  id: string;
  slug: string;
  title: string;
  meta_desc: string | null;
  content: string;
  cover_url: string | null;
  keyword: string | null;
  published_at: string;
}

export interface InsertArticleInput {
  slug: string;
  title: string;
  meta_desc: string | null;
  content: string;
  cover_url: string | null;
  keyword: string | null;
}

/** Claims today's run before generation, preventing concurrent cron duplicates. */
export async function claimBlogRunToday(): Promise<boolean> {
  const supabase = getClient();
  const { data, error } = await supabase.rpc('coesa_blog_claim_run', {
    p_secret: getCronSecret(),
  });
  if (error) {
    console.error('[claimBlogRunToday] RPC error:', error.message);
    return false;
  }
  return data === true;
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
  const supabase = getClient();
  const { data, error } = await supabase.rpc('coesa_blog_insert_article', {
    p_secret: getCronSecret(),
    p_slug: input.slug,
    p_title: input.title,
    p_meta_desc: input.meta_desc,
    p_content: input.content,
    p_cover_url: input.cover_url,
    p_keyword: input.keyword,
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

export async function getAllArticles(): Promise<Article[]> {
  const supabase = getClient();
  const { data } = await supabase
    .from(TABLES.articles)
    .select('*')
    .eq('status', 'published')
    .order('published_at', { ascending: false });
  return data ?? [];
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

export async function uploadCoverImage(
  slug: string,
  buffer: Buffer
): Promise<string | null> {
  // Capas desligadas nesta instalação (imageGenerationEnabled: false).
  // Sem service_role no env, o bucket não é gravável — retorna null.
  const serviceKey = process.env.BLOG_SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return null;

  const supabase = createClient(process.env.BLOG_SUPABASE_URL!, serviceKey, {
    auth: { persistSession: false },
  });
  const path = `${slug}.png`;
  const { error } = await supabase.storage
    .from('blog-covers')
    .upload(path, buffer, { contentType: 'image/png', upsert: true });
  if (error) {
    console.error('[uploadCoverImage] Storage error:', error.message);
    return null;
  }
  const { data } = supabase.storage.from('blog-covers').getPublicUrl(path);
  return data.publicUrl;
}
