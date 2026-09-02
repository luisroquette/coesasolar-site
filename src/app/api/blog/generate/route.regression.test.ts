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
const markAlertedIfFirstFailureToday = vi.fn();
vi.mock('@/lib/blog/supabase-blog', () => ({
  claimBlogRunToday,
  insertArticle,
  insertRunLog,
  getPublishedKeywords,
  getLinkCandidates,
  markAlertedIfFirstFailureToday,
}));

const sendFailureAlertEmail = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/blog/alert', () => ({ sendFailureAlertEmail }));

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

const countArticleWords = vi.fn(() => 5000);
vi.mock('@/lib/blog/validate', () => ({
  countArticleWords,
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
    markAlertedIfFirstFailureToday.mockResolvedValue(true);
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

  async function setupHappyPathMocks() {
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
  }

  it('pipeline normal (sem travamento) não é afetado pelo deadline — resolve e limpa o timer', async () => {
    await setupHappyPathMocks();

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

// REGRESSÃO 02/09/2026 (achado real em produção): o gate exigia o piso EXATO de 4500
// palavras contra um total que é SOMA de 7-9 seções escritas "sem contar palavra"
// (instrução deliberada no prompt — contar produz prosa artificialmente inchada). Achado
// real: artigo com 4421/4500 (1,8% abaixo) derrubado e descartado inteiro. Tolerância de
// 10% no gate de PUBLICAÇÃO — decisão do dono.
describe('REGRESSÃO 02/09/2026: tolerância de 10% no piso de palavras do gate de publicação', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'test-secret';
    claimBlogRunToday.mockResolvedValue('claimed');
    getNextPlannedEntry.mockResolvedValue({
      keyword: 'energia solar teste', relatedKeywords: [], competitors: [], attentionPoints: '',
    });
    insertRunLog.mockResolvedValue(undefined);
    saveOutlineStructure.mockResolvedValue(undefined);
    markPublished.mockResolvedValue(undefined);
    markAlertedIfFirstFailureToday.mockResolvedValue(true);
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  async function setupHappyPathMocks() {
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
  }

  it('4421 palavras (achado real, 1,8% abaixo de 4500) publica — dentro da tolerância de 10%', async () => {
    await setupHappyPathMocks();
    countArticleWords.mockReturnValueOnce(4421);

    const { GET } = await import('./route');
    const request = new NextRequest('https://coesasolar.com.br/api/blog/generate', {
      headers: { authorization: 'Bearer test-secret' },
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(insertArticle).toHaveBeenCalled();
  });

  it('4050 palavras (exatamente 90% de 4500) publica — fronteira inclusiva', async () => {
    await setupHappyPathMocks();
    countArticleWords.mockReturnValueOnce(4050);

    const { GET } = await import('./route');
    const request = new NextRequest('https://coesasolar.com.br/api/blog/generate', {
      headers: { authorization: 'Bearer test-secret' },
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
  });

  it('4049 palavras (1 abaixo da fronteira de 90%) ainda reprova — tolerância não é ilimitada', async () => {
    await setupHappyPathMocks();
    countArticleWords.mockReturnValueOnce(4049);

    const { GET } = await import('./route');
    const request = new NextRequest('https://coesasolar.com.br/api/blog/generate', {
      headers: { authorization: 'Bearer test-secret' },
    });
    const response = await GET(request);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe('article_below_4050_words:4049');
    expect(insertArticle).not.toHaveBeenCalled();
  });
});

// REGRESSÃO 02/09/2026: falha só ficava visível no relatório do Sentinel do dia SEGUINTE —
// tarde demais pra intervenção no mesmo dia útil (foi a intervenção manual do dono que
// salvou a publicação de hoje). markAlertedIfFirstFailureToday é atômico: só true na 1ª
// falha do dia — retries de cron subsequentes no mesmo dia não devem reenviar o alerta.
describe('REGRESSÃO 02/09/2026: alerta em tempo real na 1ª falha do dia', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'test-secret';
    claimBlogRunToday.mockResolvedValue('claimed');
    getNextPlannedEntry.mockResolvedValue({
      keyword: 'energia solar teste', relatedKeywords: [], competitors: [], attentionPoints: '',
    });
    insertRunLog.mockResolvedValue(undefined);
    saveOutlineStructure.mockResolvedValue(undefined);
    markPublished.mockResolvedValue(undefined);
    generateArticleWithSections.mockRejectedValue(new Error('deepseek_structure_failed'));
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it('1ª falha do dia (RPC devolve true): dispara o alerta com o erro e a keyword certos', async () => {
    markAlertedIfFirstFailureToday.mockResolvedValue(true);

    const { GET } = await import('./route');
    const request = new NextRequest('https://coesasolar.com.br/api/blog/generate', {
      headers: { authorization: 'Bearer test-secret' },
    });
    await GET(request);

    expect(sendFailureAlertEmail).toHaveBeenCalledWith(
      expect.objectContaining({ keyword: 'energia solar teste', error: 'deepseek_structure_failed' }),
    );
  });

  it('falha subsequente no mesmo dia (RPC devolve false): NÃO reenvia o alerta', async () => {
    markAlertedIfFirstFailureToday.mockResolvedValue(false);

    const { GET } = await import('./route');
    const request = new NextRequest('https://coesasolar.com.br/api/blog/generate', {
      headers: { authorization: 'Bearer test-secret' },
    });
    await GET(request);

    expect(sendFailureAlertEmail).not.toHaveBeenCalled();
  });

  it('falha no claim (infra) também conta como 1ª falha do dia e dispara alerta', async () => {
    claimBlogRunToday.mockResolvedValue('error');
    markAlertedIfFirstFailureToday.mockResolvedValue(true);

    const { GET } = await import('./route');
    const request = new NextRequest('https://coesasolar.com.br/api/blog/generate', {
      headers: { authorization: 'Bearer test-secret' },
    });
    const response = await GET(request);

    expect(response.status).toBe(500);
    expect(sendFailureAlertEmail).toHaveBeenCalledWith(expect.objectContaining({ error: 'claim_failed' }));
  });
});
