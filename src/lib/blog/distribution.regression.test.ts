// REGRESSÃO: divulgação pós-publish — post social por canal, payload do digest e isolamento de falha.
import { AUTOBLOG_PROFILE } from '@/lib/autoblog-profile';
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  buildSocialPost,
  buildEmailDigestPayload,
  buildDistributionArticle,
  distributeArticle,
  resolveDistributionChannel,
  escapeTelegramMarkdown,
  type DistributionArticle,
} from './distribution';

function makeArticle(overrides: Partial<DistributionArticle> = {}): DistributionArticle {
  return {
    title: 'Como Avaliar Solução B2B sem Riscos',
    pageTitle: 'Como avaliar solução b2b: guia prático',
    slug: 'como-avaliar-solucao-b2b',
    metaDesc: 'Guia prático para avaliar soluções B2B sem riscos',
    keyword: 'como avaliar solução b2b',
    url: 'https://seudominio.com.br/blog/como-avaliar-solucao-b2b',
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('REGRESSÃO: divulgação pós-publish', () => {
  it('post do X trunca no limite de 280 e remove markdown', () => {
    const longTitle = `**${'Título '.repeat(60).trim()}**`;
    const article = makeArticle({ title: longTitle, pageTitle: longTitle });
    const post = buildSocialPost(article, 'x');
    expect(post.length).toBeLessThanOrEqual(280);
    expect(post).not.toContain('**');
    expect(post).toContain(article.url);
  });

  it('post do Telegram mantém markdown e inclui a URL', () => {
    const post = buildSocialPost(makeArticle(), 'telegram');
    expect(post).toContain('**Como avaliar solução b2b: guia prático**');
    expect(post).toContain('👉 https://seudominio.com.br/blog/como-avaliar-solucao-b2b');
    expect(post.length).toBeLessThanOrEqual(4000);
  });

  it('post do Telegram escapa caracteres reservados do Markdown (parse_mode não quebra)', () => {
    const article = makeArticle({
      pageTitle: 'Melhor solução_1 (guia*) [completo]',
      metaDesc: 'Guia com *asteriscos* e [link](x).',
    });
    const post = buildSocialPost(article, 'telegram');
    expect(post).toContain('Melhor solução\\_1 \\(guia\\*\\) \\[completo\\]');
    expect(post).toContain('\\*asteriscos\\*');
    expect(post).toContain('\\[link\\]\\(x\\)');
  });

  it('post do X com URL longa devolve só a URL (não estoura o limite)', () => {
    const longUrl = `https://seudominio.com.br/blog/${'slug-muito-longo-'.repeat(30)}`;
    const article = makeArticle({ url: longUrl });
    const post = buildSocialPost(article, 'x');
    expect(post).toBe(longUrl);
  });

  it('escapeTelegramMarkdown é estável para texto sem caracteres reservados', () => {
    expect(escapeTelegramMarkdown('Título simples sem símbolos')).toBe('Título simples sem símbolos');
  });

  it('post do LinkedIn é texto puro com quebra de linha', () => {
    const post = buildSocialPost(makeArticle(), 'linkedin');
    expect(post).toContain('\n\n');
    expect(post).not.toContain('**');
  });

  it('payload do digest de e-mail carrega o artigo completo', () => {
    const payload = buildEmailDigestPayload(makeArticle());
    expect(payload.type).toBe('new_article');
    expect(payload.article.title).toBe('Como Avaliar Solução B2B sem Riscos');
    expect(payload.article.url).toContain('/blog/como-avaliar-solucao-b2b');
  });

  it('resolveDistributionChannel devolve null para canal desconhecido', () => {
    expect(resolveDistributionChannel('nao-existe')).toBeNull();
    expect(resolveDistributionChannel('telegram')).not.toBeNull();
  });

  it('buildDistributionArticle monta a URL com o siteUrl do perfil', () => {
    const article = buildDistributionArticle({
      title: 'T',
      pageTitle: null,
      slug: 'x',
      metaDesc: null,
      keyword: null,
    });
    expect(article.url).toBe(
      `${AUTOBLOG_PROFILE.brand.siteUrl}/blog/x`
    );
  });

  it('distributeArticle isola a falha de um canal sem derrubar os outros', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'tok');
    vi.stubEnv('TELEGRAM_CHAT_ID', 'chat');
    vi.stubEnv('EMAIL_DIGEST_WEBHOOK_URL', 'https://webhook.exemplo.com/digest');

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 })) // telegram ok
      .mockResolvedValueOnce(new Response('', { status: 500 })); // digest falha
    vi.stubGlobal('fetch', fetchMock);

    const results = await distributeArticle(makeArticle(), ['telegram', 'email_digest']);

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ channel: 'telegram', ok: true });
    expect(results[1].channel).toBe('email_digest');
    expect(results[1].ok).toBe(false);
    expect(results[1].error).toBe('email_digest_http_500');
  });

  it('distributeArticle reporta canal sem envs como falha (sem derrubar)', async () => {
    // sem envs configuradas → cada plug falha com *_envs_missing antes do fetch
    const results = await distributeArticle(makeArticle(), ['telegram', 'social_webhook']);
    expect(results.every(r => !r.ok)).toBe(true);
    expect(results[0].error).toBe('telegram_envs_missing');
    expect(results[1].error).toBe('social_webhook_envs_missing');
  });
});
