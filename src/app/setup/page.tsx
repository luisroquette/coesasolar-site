// src/app/setup/page.tsx
// Wizard de setup: checklist de conexões da instalação.
// Mostra SÓ presença de envs (booleano) e flags do perfil — nenhum segredo sai daqui.
export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { AUTOBLOG_PROFILE } from '@/lib/autoblog-profile';

function envPresent(name: string): boolean {
  return !!process.env[name]?.trim();
}

/** Detecta se a migration da tabela foi aplicada (query sem erro = tabela existe). */
async function tableExists(table: string): Promise<boolean> {
  const url = process.env.BLOG_SUPABASE_URL;
  const key = process.env.BLOG_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;
  try {
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const { error } = await supabase
      .from(table)
      .select('id', { count: 'exact', head: true });
    return !error;
  } catch {
    return false;
  }
}

interface SetupItem {
  name: string;
  ready: boolean;
  action: string;
}

function SetupGroup({ title, items }: { title: string; items: SetupItem[] }) {
  const done = items.filter(i => i.ready).length;
  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold text-foreground mb-3">
        {title} <span className="text-sm font-normal text-muted-foreground">({done}/{items.length})</span>
      </h2>
      <ul className="space-y-2">
        {items.map(item => (
          <li
            key={item.name}
            className="flex items-start gap-3 p-3 rounded-xl border border-border bg-card text-sm"
          >
            <span
              aria-hidden="true"
              className={item.ready ? 'text-green-600' : 'text-muted-foreground'}
            >
              {item.ready ? '✓' : '✗'}
            </span>
            <span className="sr-only">{item.ready ? 'Pronto:' : 'Pendente:'}</span>
            <span className="flex-1">
              <span className="font-medium text-foreground">{item.name}</span>
              {!item.ready && <span className="block text-muted-foreground">{item.action}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function SetupPage() {
  const calendarReady = await tableExists('coesa_editorial_calendar');
  const commentsReady = await tableExists('coesa_blog_comments');
  // 24/08/2026: métricas saíram do Postgres pra Redis (Upstash) — não é mais
  // uma migration de tabela, é presença das envs que a integração Vercel cria.
  const metricsReady = envPresent('KV_REST_API_URL') && envPresent('KV_REST_API_TOKEN');
  const brokenLinksReady = await tableExists('coesa_blog_broken_links');

  const supabase =
    envPresent('BLOG_SUPABASE_URL') && envPresent('BLOG_SUPABASE_SERVICE_ROLE_KEY');
  const deepseek = envPresent('COESASOLAR_OPENROUTER_API_KEY');
  const gsc =
    envPresent('GOOGLE_CLIENT_ID') &&
    envPresent('GOOGLE_CLIENT_SECRET') &&
    envPresent('GOOGLE_REFRESH_TOKEN');
  const images = deepseek;
  const trello =
    envPresent('TRELLO_API_KEY') && envPresent('TRELLO_TOKEN') && envPresent('TRELLO_LIST_ID');
  const telegram =
    envPresent('TELEGRAM_BOT_TOKEN') && envPresent('TELEGRAM_CHAT_ID');
  const emailDigest = envPresent('EMAIL_DIGEST_WEBHOOK_URL');
  const socialWebhook = envPresent('SOCIAL_WEBHOOK_URL');
  const cronSecret = envPresent('CRON_SECRET');

  return (
    <main className="min-h-screen bg-background">
      <div className="container max-w-2xl mx-auto px-4 py-16">
        <header className="mb-10">
          <p className="text-sm text-muted-foreground mb-2">
            <Link href="/blog" className="hover:text-foreground transition-colors">← Blog</Link>
          </p>
          <h1 className="font-display text-3xl font-bold text-foreground">Setup do blog</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            O que está conectado nesta instalação e o que falta para ligar cada recurso.
            Credenciais ficam nas envs do seu ambiente — nunca no código.
          </p>
        </header>

        <SetupGroup
          title="Fundamentos"
          items={[
            {
              name: 'Supabase',
              ready: supabase,
              action: 'Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.',
            },
            {
              name: 'DeepSeek (redação)',
              ready: deepseek,
              action: 'Defina COESASOLAR_OPENROUTER_API_KEY.',
            },
            {
              name: 'CRON_SECRET',
              ready: cronSecret,
              action: 'Defina CRON_SECRET para proteger o endpoint de geração.',
            },
          ]}
        />

        <SetupGroup
          title="SEO"
          items={[
            {
              name: 'Google Search Console',
              ready: gsc && AUTOBLOG_PROFILE.integrations.googleSearchConsoleEnabled,
              action: gsc
                ? 'Ligue googleSearchConsoleEnabled no perfil (autoblog-profile.ts).'
                : 'Defina GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e GOOGLE_REFRESH_TOKEN, e ligue a flag.',
            },
            {
              name: 'Google Analytics (GA4)',
              ready: !!AUTOBLOG_PROFILE.integrations.googleAnalyticsMeasurementId.trim(),
              action: 'Preencha googleAnalyticsMeasurementId no perfil (G-XXXXXXX).',
            },
          ]}
        />

        <SetupGroup
          title="Conteúdo visual"
          items={[
            {
              name: 'Capa e imagens do corpo (Seedream 4.5 2K)',
              ready: images && AUTOBLOG_PROFILE.integrations.imageGenerationEnabled,
              action: images
                ? 'Ligue imageGenerationEnabled no perfil e crie o bucket público blog-covers no Supabase.'
                : 'Defina COESASOLAR_OPENROUTER_API_KEY, crie o bucket blog-covers e ligue imageGenerationEnabled.',
            },
          ]}
        />

        <SetupGroup
          title="Captura de leads (plugs de CRM)"
          items={[
            {
              name: 'Trello',
              ready: trello && AUTOBLOG_PROFILE.integrations.leadCapture.enabled,
              action: trello
                ? 'Ligue leadCapture.enabled no perfil.'
                : 'Defina TRELLO_API_KEY, TRELLO_TOKEN e TRELLO_LIST_ID, e ligue leadCapture.enabled.',
            },
          ]}
        />

        <SetupGroup
          title="Divulgação pós-publish (plugs de canal)"
          items={[
            {
              name: 'Telegram',
              ready: telegram,
              action: 'Defina TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID; adicione "telegram" em distribution.channels.',
            },
            {
              name: 'Digest por e-mail (webhook — plugue o MailMKT da família)',
              ready: emailDigest,
              action: 'Defina EMAIL_DIGEST_WEBHOOK_URL; adicione "email_digest" em distribution.channels.',
            },
            {
              name: 'Redes sociais via webhook (Zapier/n8n/Make)',
              ready: socialWebhook,
              action: 'Defina SOCIAL_WEBHOOK_URL; adicione "social_webhook" em distribution.channels.',
            },
            {
              name: 'Distribuição ligada no perfil',
              ready: AUTOBLOG_PROFILE.integrations.distribution.enabled,
              action: 'Ligue distribution.enabled no perfil.',
            },
          ]}
        />

        <SetupGroup
          title="Banco de dados (migrations)"
          items={[
            {
              name: 'Calendário editorial (004_editorial_calendar)',
              ready: calendarReady,
              action: 'Aplicar a migration 004 no Supabase (SQL Editor).',
            },
            {
              name: 'Comentários (005_blog_comments)',
              ready: commentsReady,
              action: 'Aplicar a migration 005 no Supabase (SQL Editor).',
            },
            {
              name: 'Métricas (Redis via `vercel install upstash/upstash-kv`)',
              ready: metricsReady,
              action: 'Rodar `vercel install upstash/upstash-kv -e production` e conectar ao projeto.',
            },
            {
              name: 'Auditoria de links (007_blog_broken_links)',
              ready: brokenLinksReady,
              action: 'Aplicar a migration 007 no Supabase (SQL Editor).',
            },
          ]}
        />
      </div>
    </main>
  );
}
