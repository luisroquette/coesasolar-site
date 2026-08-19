'use client';

// Formulário de comentário — entra PENDENTE; o dono aprova via /api/blog/comments/moderate.
// Honeypot: campo "website" invisível; humanos nunca preenchem, bots sim.
import { useState } from 'react';

export default function CommentForm({ slug }: { slug: string }) {
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === 'sending') return;
    setStatus('sending');

    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/blog/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          articleSlug: slug,
          authorName: form.get('authorName'),
          content: form.get('content'),
          website: form.get('website'),
        }),
      });
      setStatus(response.ok ? 'done' : 'error');
    } catch {
      setStatus('error');
    }
  }

  if (status === 'done') {
    return (
      <p className="mt-4 p-4 rounded-xl border border-border bg-card text-sm text-muted-foreground">
        Comentário enviado! Ele aparecerá aqui depois da moderação.
      </p>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-8 p-6 rounded-2xl border border-border bg-card"
      aria-label="Formulário de comentário"
    >
      <p className="font-semibold text-foreground mb-4">Deixe seu comentário</p>

      {/* Honeypot: invisível para humanos, preenchido por bots */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
      />

      <label className="sr-only" htmlFor="comment-name">Nome</label>
      <input
        id="comment-name"
        name="authorName"
        type="text"
        required
        minLength={2}
        maxLength={60}
        placeholder="Seu nome"
        className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary mb-3"
      />
      <label className="sr-only" htmlFor="comment-content">Comentário</label>
      <textarea
        id="comment-content"
        name="content"
        required
        minLength={5}
        maxLength={1000}
        rows={4}
        placeholder="O que você achou deste artigo? Sua pergunta pode virar um novo guia."
        className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary mb-4"
      />
      <button
        type="submit"
        disabled={status === 'sending'}
        className="inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-full px-6 py-2.5 font-semibold text-sm transition-all disabled:opacity-60"
      >
        {status === 'sending' ? 'Enviando…' : 'Enviar comentário'}
      </button>

      {status === 'error' && (
        <p className="text-sm text-destructive mt-3">Não foi possível enviar. Tente novamente.</p>
      )}
    </form>
  );
}
