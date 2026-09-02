// REGRESSÃO 17/08/2026 (dia útil perdido em silêncio — ex.: 13/08 sem artigo):
// quando o claim do dia falhava (RPC coesa_blog_claim_run ausente/secret/transitório),
// a rota /api/blog/generate interpretava o erro como "já rodou hoje" e respondia
// 200 "already_run_today". O cron da Vercel via sucesso, não re-tentava e o dia útil
// ficava SEM artigo, SEM run_log e SEM sinal de erro. A rota agora distingue o erro
// e responde 500 "claim_failed", deixando a falha visível e re-tentável.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const claimMock = vi.fn();

vi.mock('@/lib/blog/supabase-blog', () => ({
  claimBlogRunToday: () => claimMock(),
  insertArticle: vi.fn(),
  insertRunLog: vi.fn(),
  getPublishedKeywords: vi.fn(),
  getLinkCandidates: vi.fn(),
  markAlertedIfFirstFailureToday: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/lib/blog/alert', () => ({ sendFailureAlertEmail: vi.fn().mockResolvedValue(undefined) }));

vi.mock('@/lib/blog/editorial-calendar', () => ({
  getNextPlannedEntry: vi.fn(),
  markPublished: vi.fn(),
  saveOutlineStructure: vi.fn(),
}));

vi.mock('@/lib/blog/gsc', () => ({ fetchTopKeyword: vi.fn() }));

vi.mock('@/lib/blog/deepseek', () => ({
  generateArticleWithSections: vi.fn(),
  assembleArticleMarkdown: vi.fn(),
  regenerateSectionsWithFeedback: vi.fn(),
  injectSectionImages: vi.fn(),
  fixSimpleValidationIssues: vi.fn(),
}));

vi.mock('@/lib/blog/image-gen', () => ({
  generateAndUploadCover: vi.fn(),
  generateAndUploadBodyImages: vi.fn(),
  generateAndUploadInfographic: vi.fn(),
}));

vi.mock('@/lib/blog/image-body', () => ({
  injectInfographic: vi.fn(),
  injectInlineCtas: vi.fn(),
}));

vi.mock('@/lib/blog/validate', () => ({ validateArticle: vi.fn() }));
vi.mock('@/lib/blog/quality-gate', () => ({ runQualityGateLoop: vi.fn() }));
vi.mock('@/lib/blog/internal-links', () => ({ scoreInternalLinks: vi.fn() }));
vi.mock('@/lib/blog/distribution', () => ({
  distributeArticle: vi.fn(),
  buildDistributionArticle: vi.fn(),
}));
vi.mock('@/lib/autoblog-profile', () => ({ AUTOBLOG_PROFILE: {} }));

const { GET } = await import('@/app/api/blog/generate/route');

function authorizedRequest(): NextRequest {
  return new NextRequest('http://localhost/api/blog/generate', {
    headers: { authorization: 'Bearer test-secret' },
  });
}

describe('REGRESSÃO: /api/blog/generate não responde 200 "already_run_today" quando o claim falha', () => {
  beforeEach(() => {
    claimMock.mockReset();
    process.env.CRON_SECRET = 'test-secret';
  });

  it('claim com erro responde 500 (nunca 200) — dia útil não fica perdido em silêncio', async () => {
    claimMock.mockResolvedValue('error');

    const res = await GET(authorizedRequest());

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'claim_failed' });
  });

  it('claim === already_run responde 200 already_run_today (no-op correto de dia já publicado)', async () => {
    claimMock.mockResolvedValue('already_run');

    const res = await GET(authorizedRequest());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: 'already_run_today' });
  });

  it('sem Authorization válida responde 401 antes de qualquer claim', async () => {
    claimMock.mockResolvedValue('claimed');
    process.env.CRON_SECRET = 'test-secret';

    const res = await GET(new NextRequest('http://localhost/api/blog/generate'));

    expect(res.status).toBe(401);
    expect(claimMock).not.toHaveBeenCalled();
  });
});
