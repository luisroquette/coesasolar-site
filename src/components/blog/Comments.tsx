// src/components/blog/Comments.tsx
// Lista de comentários APROVADOS (server component — nada de JS extra no bundle).
import { getApprovedComments } from '@/lib/blog/comments';

export default async function Comments({ slug }: { slug: string }) {
  let comments: Awaited<ReturnType<typeof getApprovedComments>> = [];
  try {
    comments = await getApprovedComments(slug);
  } catch {
    // Supabase indisponível — renderiza sem comentários (não derruba o artigo)
  }

  if (comments.length === 0) return null;

  return (
    <section className="mt-12" aria-label="Comentários">
      <h2 className="text-xl font-bold text-foreground mb-6">
        Comentários ({comments.length})
      </h2>
      <ul className="space-y-4">
        {comments.map(comment => (
          <li key={comment.id} className="p-4 rounded-xl border border-border bg-card">
            <p className="text-sm font-semibold text-foreground mb-1">{comment.author_name}</p>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{comment.content}</p>
            <p className="text-xs text-muted-foreground mt-2">
              {new Date(comment.created_at).toLocaleDateString('pt-BR', {
                day: 'numeric', month: 'long', year: 'numeric',
              })}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
