'use client';

// Formulário de captura de leads — entrega via plug de CRM em /api/blog/leads.
// Honeypot: campo "website" invisível; humanos nunca preenchem, bots sim.
import { useState } from 'react';
import { AUTOBLOG_PROFILE } from '@/lib/autoblog-profile';

interface LeadFormProps {
  source: string;
  keyword?: string | null;
}

export default function LeadForm({ source, keyword }: LeadFormProps) {
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === 'sending') return;
    setStatus('sending');

    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/blog/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.get('name'),
          email: form.get('email'),
          source,
          keyword: keyword ?? null,
          note: form.get('website'),
        }),
      });
      setStatus(response.ok ? 'done' : 'error');
    } catch {
      setStatus('error');
    }
  }

  if (status === 'done') {
    return (
      <p className="mt-8 p-6 rounded-2xl border border-primary/30 bg-primary/5 text-center text-foreground font-semibold">
        {AUTOBLOG_PROFILE.leadForm.successMessage}
      </p>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-8 p-6 rounded-2xl border border-primary/30 bg-primary/5"
      aria-label="Captura de leads"
    >
      <p className="font-semibold text-foreground mb-1">{AUTOBLOG_PROFILE.leadForm.title}</p>
      <p className="text-sm text-muted-foreground mb-4">{AUTOBLOG_PROFILE.leadForm.subtitle}</p>

      {/* Honeypot: invisível para humanos, preenchido por bots */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
      />

      <div className="flex flex-col sm:flex-row gap-3">
        <label className="sr-only" htmlFor="lead-name">Nome</label>
        <input
          id="lead-name"
          name="name"
          type="text"
          required
          minLength={2}
          maxLength={80}
          placeholder="Seu nome"
          className="flex-1 rounded-full border border-border bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <label className="sr-only" htmlFor="lead-email">E-mail</label>
        <input
          id="lead-email"
          name="email"
          type="email"
          required
          maxLength={120}
          placeholder="seu@email.com"
          className="flex-1 rounded-full border border-border bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <button
          type="submit"
          disabled={status === 'sending'}
          className="inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-full px-6 py-2.5 font-semibold text-sm transition-all disabled:opacity-60"
        >
          {status === 'sending' ? 'Enviando…' : AUTOBLOG_PROFILE.leadForm.buttonLabel}
        </button>
      </div>

      {status === 'error' && (
        <p className="text-sm text-destructive mt-3">
          Não foi possível enviar. Tente novamente.
        </p>
      )}
    </form>
  );
}
