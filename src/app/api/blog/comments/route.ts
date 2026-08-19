// src/app/api/blog/comments/route.ts
// POST público: valida, descarta honeypot e insere PENDENTE (moderação obrigatória).
import { NextRequest, NextResponse } from 'next/server';
import {
  insertComment,
  isCommentHoneypot,
  validateComment,
  type CommentInput,
} from '@/lib/blog/comments';
import { articleSlugExists } from '@/lib/blog/supabase-blog';

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const raw = (body ?? {}) as Record<string, unknown>;
  const input: CommentInput = {
    articleSlug: typeof raw.articleSlug === 'string' ? raw.articleSlug : '',
    authorName: typeof raw.authorName === 'string' ? raw.authorName : '',
    content: typeof raw.content === 'string' ? raw.content : '',
    website: typeof raw.website === 'string' ? raw.website : null,
  };

  // Bot preencheu o campo invisível — responde sucesso e descarta silenciosamente.
  if (isCommentHoneypot(input)) {
    return NextResponse.json({ success: true }, { status: 200 });
  }

  const validation = validateComment(input);
  if (!validation.ok) {
    return NextResponse.json(
      { error: 'invalid_comment', details: validation.errors },
      { status: 400 },
    );
  }

  // Comentário em artigo inexistente = spam órfão — rejeita antes de inserir.
  try {
    const exists = await articleSlugExists(input.articleSlug);
    if (!exists) {
      return NextResponse.json({ error: 'article_not_found' }, { status: 404 });
    }
  } catch {
    return NextResponse.json({ error: 'storage_unavailable' }, { status: 503 });
  }

  try {
    await insertComment(input);
    return NextResponse.json({ success: true, moderated: true }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[blog/comments] Falha ao inserir comentário:', message);
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
