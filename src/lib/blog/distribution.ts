// src/lib/blog/distribution.ts
// Divulgação pós-publish: cada canal é um PLUG ativado no perfil.
// Falha de um canal não derruba os outros nem o pipeline (o dono é avisado no log).
// Publicação direta em X/LinkedIn exige APIs pagas — o plug 'social_webhook'
// entrega o post pronto (título adaptado por canal) para Zapier/n8n/Make.
import { AUTOBLOG_PROFILE } from '@/lib/autoblog-profile';

export interface DistributionArticle {
  title: string;
  pageTitle: string | null;
  slug: string;
  metaDesc: string | null;
  keyword: string | null;
  url: string;
}

export interface DistributionResult {
  channel: string;
  ok: boolean;
  error?: string;
}

const MAX_X = 280;
const MAX_TELEGRAM = 4000; // limite real 4096 — folga para o parse_mode
const MAX_LINKEDIN = 3000;

function stripMarkdown(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(text: string, max: number): string {
  if (max <= 1) return '…';
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1).trimEnd();
  return `${cut}…`;
}

/** Escapa caracteres reservados do parse_mode Markdown do Telegram. */
export function escapeTelegramMarkdown(text: string): string {
  return text.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

/** Título social adaptado ao canal (regras de tamanho e formato de cada um). */
export function buildSocialPost(article: DistributionArticle, channel: string): string {
  const title = article.pageTitle ?? article.title;

  switch (channel) {
    case 'x': {
      // X: texto limpo, título truncado para caber com a URL
      const budget = Math.max(0, MAX_X - article.url.length - 2);
      if (budget <= 1) return article.url; // URL sozinha já ocupa o limite
      return truncate(stripMarkdown(title), budget) + ' ' + article.url;
    }
    case 'telegram':
      // Telegram: markdown (negrito + emoji) — formato que o parse_mode aceita
      return truncate(
        `**${escapeTelegramMarkdown(title)}**\n\n${escapeTelegramMarkdown(article.metaDesc ?? '')}\n\n👉 ${article.url}`,
        MAX_TELEGRAM,
      );
    case 'linkedin':
      // LinkedIn: texto puro com quebra de linha
      return truncate(
        `${title}\n\n${article.metaDesc ?? ''}\n\n${article.url}`,
        MAX_LINKEDIN,
      );
    default: {
      const budget = Math.max(0, MAX_X - article.url.length - 2);
      if (budget <= 1) return article.url;
      return truncate(stripMarkdown(title), budget) + ' ' + article.url;
    }
  }
}

/** Payload do webhook de digest por e-mail (plug onde o MailMKT da família encaixa). */
export function buildEmailDigestPayload(article: DistributionArticle) {
  return {
    type: 'new_article',
    publishedAt: new Date().toISOString(),
    article: {
      title: article.title,
      pageTitle: article.pageTitle,
      slug: article.slug,
      url: article.url,
      metaDesc: article.metaDesc,
      keyword: article.keyword,
    },
  };
}

export type DistributionChannel = (article: DistributionArticle) => Promise<void>;

async function sendTelegram(article: DistributionArticle): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) throw new Error('telegram_envs_missing');

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: buildSocialPost(article, 'telegram'),
      parse_mode: 'Markdown',
    }),
  });
  if (!response.ok) throw new Error(`telegram_http_${response.status}`);
}

async function sendEmailDigestWebhook(article: DistributionArticle): Promise<void> {
  const url = process.env.EMAIL_DIGEST_WEBHOOK_URL;
  if (!url) throw new Error('email_digest_envs_missing');

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildEmailDigestPayload(article)),
  });
  if (!response.ok) throw new Error(`email_digest_http_${response.status}`);
}

/** Webhook genérico de redes: entrega o post adaptado por canal para o autômato do dono. */
async function sendSocialWebhook(article: DistributionArticle): Promise<void> {
  const url = process.env.SOCIAL_WEBHOOK_URL;
  if (!url) throw new Error('social_webhook_envs_missing');

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'new_article',
      publishedAt: new Date().toISOString(),
      article: { title: article.title, url: article.url },
      socialPosts: {
        x: buildSocialPost(article, 'x'),
        telegram: buildSocialPost(article, 'telegram'),
        linkedin: buildSocialPost(article, 'linkedin'),
      },
    }),
  });
  if (!response.ok) throw new Error(`social_webhook_http_${response.status}`);
}

export const DISTRIBUTION_CHANNELS: Record<string, DistributionChannel> = {
  telegram: sendTelegram,
  email_digest: sendEmailDigestWebhook,
  social_webhook: sendSocialWebhook,
};

export function resolveDistributionChannel(id: string): DistributionChannel | null {
  return DISTRIBUTION_CHANNELS[id] ?? null;
}

/** Dispara os canais ativos do perfil, isolando a falha de cada um. */
export async function distributeArticle(
  article: DistributionArticle,
  channelIds: string[],
): Promise<DistributionResult[]> {
  const results: DistributionResult[] = [];
  for (const id of channelIds) {
    const channel = resolveDistributionChannel(id);
    if (!channel) {
      results.push({ channel: id, ok: false, error: `unknown_channel: ${id}` });
      continue;
    }
    try {
      await channel(article);
      results.push({ channel: id, ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ channel: id, ok: false, error: message });
    }
  }
  return results;
}

/** Entrada do pipeline: monta o artigo de distribuição a partir do publicado. */
export function buildDistributionArticle(input: {
  title: string;
  pageTitle: string | null;
  slug: string;
  metaDesc: string | null;
  keyword: string | null;
}): DistributionArticle {
  return {
    ...input,
    url: `${AUTOBLOG_PROFILE.brand.siteUrl}/blog/${input.slug}`,
  };
}
