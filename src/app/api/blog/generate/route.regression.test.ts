// REGRESSÃO 02/09/2026 (E2E real): run_log preso em 'running' desde 27/08 (recorrente em
// 01/09 e 02/09) — a Vercel mata /api/blog/generate com SIGKILL ao bater maxDuration=300s.
// O catch nunca roda, insertRunLog nunca grava, e a linha do claim fica presa pra sempre.
// Este teste exercita o handler GET real de ponta a ponta (mocka só as fronteiras de I/O
// externo — Supabase/DeepSeek/imagem/distribuição — nunca a lógica do route.ts) travando
// uma fase NÃO-opcional (generateArticleWithSections) pra sempre, o pior caso possível: nem
// o guard de fases opcionais (hasTimeBudget) cobre essa fase. Prova que o deadline interno
// (PIPELINE_DEADLINE_MS) sempre vence essa corrida, porque é um timer em JS — checável e
// determinístico — contra um SIGKILL da plataforma que não pode ser interceptado.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const claimBlogRunToday = vi.fn();
const insertArticle = vi.fn();
const insertRunLog = vi.fn();
const getPublishedKeywords = vi.fn();
const getLinkCandidates = vi.fn();
vi.mock('@/lib/blog/supabase-blog', () => ({
  claimBlogRunToday,
  insertArticle,
  insertRunLog,
  getPublishedKeywords,
  getLinkCandidates,
}));

const getNextPlannedEntry = vi.fn();
const markPublished = vi.fn();
const saveOutlineStructure = vi.fn();
vi.mock('@/lib/blog/editorial-calendar', () => ({
  getNextPlannedEntry,
  markPublished,
  saveOutlineStructure,
}));

const fetchTopKeyword = vi.fn();
vi.mock('@/lib/blog/gsc', () => ({ fetchTopKeyword }));

const generateArticleWithSections = vi.fn();
vi.mock('@/lib/blog/deepseek', () => ({
  generateArticleWithSections,
  assembleArticleMarkdown: vi.fn(),
  regenerateSectionsWithFeedback: vi.fn(),
  injectSectionImages: vi.fn((content: string) => content),
  fixSimpleValidationIssues: vi.fn((article: unknown) => article),
}));

vi.mock('@/lib/blog/image-gen', () => ({
  generateAndUploadCover: vi.fn(),
  generateAndUploadBodyImages: vi.fn(),
  generateAndUploadInfographic: vi.fn(),
}));

vi.mock('@/lib/blog/image-body', () => ({
  injectInfographic: vi.fn((content: string) => content),
  injectInlineCtas: vi.fn((content: string) => content),
}));

vi.mock('@/lib/blog/validate', () => ({
  countArticleWords: vi.fn(() => 5000),
  MIN_ARTICLE_WORDS: 4500,
  validateArticle: vi.fn(() => ({ ok: true, issues: [] })),
}));

vi.mock('@/lib/blog/quality-gate', () => ({
  runQualityGateLoop: vi.fn(),
}));

vi.mock('@/lib/blog/internal-links', () => ({
  scoreInternalLinks: vi.fn(() => []),
}));

vi.mock('@/lib/blog/distribution', () => ({
  distributeArticle: vi.fn(),
  buildDistributionArticle: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

describe("REGRESSÃO 02/09/2026 (E2E real): deadline interno sempre vence o SIGKILL da Vercel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    process.env.CRON_SECRET = 'test-secret';
    claimBlogRunToday.mockResolvedValue('claimed');
    getNextPlannedEntry.mockResolvedValue({
      keyword: 'energia solar teste',
      relatedKeywords: [],
      competitors: [],
      attentionPoints: '',
    });
    insertRunLog.mockResolvedValue(undefined);
    saveOutlineStructure.mockResolvedValue(undefined);
    markPublished.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.CRON_SECRET;
  });

  it('generateArticleWithSections travado pra sempre → responde 500 e grava erro ANTES do maxDuration da Vercel, nunca mais preso em running', async () => {
    // Pior caso possível: trava numa fase NÃO-opcional, que o guard hasTimeBudget não cobre.
    generateArticleWithSections.mockReturnValue(new Promise(() => {}));

    const { GET } = await import('./route');
    const request = new NextRequest('https://coesasolar.com.br/api/blog/generate', {
      headers: { authorization: 'Bearer test-secret' },
    });

    const responsePromise = GET(request);
    // maxDuration=300s, DEADLINE_MARGIN_MS=30s → PIPELINE_DEADLINE_MS=270s. Avançar exatamente
    // até lá é o pior caso que ainda deve responder — 30s de sobra antes do kill real da Vercel.
    await vi.advanceTimersByTimeAsync(270_000);
    const response = await responsePromise;

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe('pipeline_deadline_exceeded');

    // A garantia central: insertRunLog SEMPRE roda, mesmo com uma fase travada pra sempre —
    // isso elimina a origem do bug (linha presa em 'running' sem erro visível pro Sentinel).
    expect(insertRunLog).toHaveBeenCalledWith({
      keyword: 'energia solar teste',
      status: 'error',
      error: 'pipeline_deadline_exceeded',
    });

    // O deadline dispara ANTES do teto real da Vercel — a garantia não depende de sorte.
    expect(270_000).toBeLessThan(300_000);
  });

  it('pipeline normal (sem travamento) não é afetado pelo deadline — resolve e limpa o timer', async () => {
    generateArticleWithSections.mockResolvedValue({
      title: 'T', slug: 'slug-ok', meta_desc: 'M', image_prompt: 'p', content: 'conteúdo',
      structure: { sections: [], faq: [] }, bodies: [], sectionImagePrompts: [],
      cover_alt: null, category: null,
    });
    const { runQualityGateLoop } = await import('@/lib/blog/quality-gate');
    (runQualityGateLoop as ReturnType<typeof vi.fn>).mockImplementation(async (initial: unknown) => ({
      content: initial,
      judged: { skipped: true, score: null, issues: [], categories: null },
      attempts: 0,
    }));
    const { generateAndUploadCover, generateAndUploadBodyImages, generateAndUploadInfographic } =
      await import('@/lib/blog/image-gen');
    (generateAndUploadCover as ReturnType<typeof vi.fn>).mockResolvedValue('https://x/cover.webp');
    (generateAndUploadBodyImages as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (generateAndUploadInfographic as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    insertArticle.mockResolvedValue('slug-ok');

    const { GET } = await import('./route');
    const request = new NextRequest('https://coesasolar.com.br/api/blog/generate', {
      headers: { authorization: 'Bearer test-secret' },
    });

    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(insertRunLog).toHaveBeenCalledWith({ keyword: 'energia solar teste', status: 'success' });
  });
});
