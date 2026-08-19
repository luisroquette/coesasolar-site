// src/app/api/blog/comments/moderate/route.ts
// Moderação protegida por CRON_SECRET (mesmo padrão do endpoint de geração).
//   POST {action:'approve'|'delete', id} → executa e revalida a página do artigo.
//   GET → lista pendentes (fonte de ideias de pauta do calendário editorial).
import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getPendingComments, setCommentApproval, deleteComment } from '@/lib/blog/comments';

function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization') ?? '';
  const cronSecret = process.env.CRON_SECRET;
  return !!cronSecret && authHeader === `Bearer ${cronSecret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const pending = await getPendingComments();
    return NextResponse.json({ pending });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const raw = (body ?? {}) as Record<string, unknown>;
  const id = typeof raw.id === 'string' ? raw.id : '';
  const action = typeof raw.action === 'string' ? raw.action : '';
  if (!id || (action !== 'approve' && action !== 'delete')) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  try {
    const slug = action === 'approve'
      ? await setCommentApproval(id, true)
      : await deleteComment(id);
    if (!slug) return NextResponse.json({ error: 'comment_not_found' }, { status: 404 });

    if (slug) revalidatePath(`/blog/${slug}`);
    return NextResponse.json({ success: true, slug });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[blog/comments/moderate] Falha na moderação:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
