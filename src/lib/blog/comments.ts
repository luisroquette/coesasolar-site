// src/lib/blog/comments.ts
// Comentários com moderação: público só lê aprovados; insert entra pendente.
import { getServiceClient } from '@/lib/blog/supabase-blog';

const getClient = getServiceClient;

export interface CommentInput {
  articleSlug: string;
  authorName: string;
  content: string;
  website?: string | null; // honeypot — campo invisível que só bots preenchem
}

export interface CommentValidation {
  ok: boolean;
  errors: string[];
}

export function validateComment(input: CommentInput): CommentValidation {
  const errors: string[] = [];
  const name = (input.authorName ?? '').trim();
  const content = (input.content ?? '').trim();

  if (name.length < 2 || name.length > 60) errors.push('author_name_invalid');
  if (content.length < 5 || content.length > 1000) errors.push('content_invalid');
  return { ok: errors.length === 0, errors };
}

export function isCommentHoneypot(input: CommentInput): boolean {
  return !!input.website && input.website.trim().length > 0;
}

export interface Comment {
  id: string;
  article_slug: string;
  author_name: string;
  content: string;
  approved: boolean;
  created_at: string;
}

export async function insertComment(input: CommentInput): Promise<void> {
  const supabase = getClient();
  const { error } = await supabase.from('coesa_blog_comments').insert({
    article_slug: input.articleSlug,
    author_name: input.authorName.trim(),
    content: input.content.trim(),
  });
  if (error) throw new Error(`comment_insert_failed: ${error.message}`);
}

export async function getApprovedComments(slug: string): Promise<Comment[]> {
  const supabase = getClient();
  const { data } = await supabase
    .from('coesa_blog_comments')
    .select('id, article_slug, author_name, content, approved, created_at')
    .eq('article_slug', slug)
    .eq('approved', true)
    .order('created_at', { ascending: true })
    .limit(100); // teto de render — artigo com 500 comentários não pesa o ISR
  return data ?? [];
}

/** Pendentes de moderação — também a fonte de ideias de pauta do calendário editorial. */
export async function getPendingComments(): Promise<Comment[]> {
  const supabase = getClient();
  const { data } = await supabase
    .from('coesa_blog_comments')
    .select('id, article_slug, author_name, content, approved, created_at')
    .eq('approved', false)
    .order('created_at', { ascending: true })
    .limit(100); // teto contra flood de spam no payload da moderação
  return data ?? [];
}

/** Aprova (ou rejeita) um comentário e devolve o slug para revalidar a página. */
export async function setCommentApproval(id: string, approved: boolean): Promise<string | null> {
  const supabase = getClient();
  const { data: existing } = await supabase
    .from('coesa_blog_comments')
    .select('article_slug')
    .eq('id', id)
    .single();
  if (!existing) return null;

  const { error } = await supabase
    .from('coesa_blog_comments')
    .update({ approved })
    .eq('id', id);
  if (error) throw new Error(`comment_update_failed: ${error.message}`);
  return (existing as { article_slug: string }).article_slug;
}

/** Remove um comentário (spam/abuso) e devolve o slug para revalidar. */
export async function deleteComment(id: string): Promise<string | null> {
  const supabase = getClient();
  const { data: existing } = await supabase
    .from('coesa_blog_comments')
    .select('article_slug')
    .eq('id', id)
    .single();
  if (!existing) return null;

  const { error } = await supabase.from('coesa_blog_comments').delete().eq('id', id);
  if (error) throw new Error(`comment_delete_failed: ${error.message}`);
  return (existing as { article_slug: string }).article_slug;
}
