// Testa os steps do workflow DIRETAMENTE, sem bundler: "use step"/"use
// workflow" são strings literais sem efeito em runtime de teste — as
// funções são chamáveis como funções JS comuns (mesmo padrão documentado
// pelo Workflow DevKit: "Steps are just functions; without the compiler,
// 'use step' is a no-op. Test them directly").
//
// Estes testes substituem a cobertura que route.regression.test.ts tinha
// antes da migração pro Workflow DevKit (13/09/2026) — os invariantes de
// negócio (piso de palavras, alerta na 1ª falha do dia, circuit breaker de
// saldo) migraram da rota síncrona pra dentro do workflow, mas continuam
// sendo os MESMOS invariantes, testados com os MESMOS valores reais.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const insertArticle = vi.fn();
const insertRunLog = vi.fn();
const markAlertedIfFirstFailureToday = vi.fn();
vi.mock('@/lib/blog/supabase-blog', () => ({
  claimBlogRunToday: vi.fn(),
  insertArticle,
  insertRunLog,
  getPublishedKeywords: vi.fn(),
  getLinkCandidates: vi.fn(),
  markAlertedIfFirstFailureToday,
}));

const sendFailureAlertEmail = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/blog/alert', () => ({ sendFailureAlertEmail }));

const checkOpenRouterBalance = vi.fn();
vi.mock('@/lib/blog/openrouter-budget', () => ({ checkOpenRouterBalance }));

const getNextPlannedEntry = vi.fn();
const saveOutlineStructure = vi.fn();
vi.mock('@/lib/blog/editorial-calendar', () => ({
  getNextPlannedEntry,
  markPublished: vi.fn(),
  saveOutlineStructure,
}));
vi.mock('@/lib/blog/gsc', () => ({ fetchTopKeyword: vi.fn() }));
const regenerateSectionsWithFeedback = vi.fn();
const generateArticleStructure = vi.fn();
const writeSection = vi.fn();
const buildArticleFromSections = vi.fn();
vi.mock('@/lib/blog/deepseek', () => ({
  generateArticleStructure,
  writeSection,
  enrichSectionBriefs: vi.fn((sections: unknown) => sections),
  buildArticleFromSections,
  assembleArticleMarkdown: vi.fn(() => 'conteúdo regenerado'),
  regenerateSectionsWithFeedback,
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
  MIN_ACCEPTABLE_ARTICLE_WORDS: 4050,
  MIN_ARTICLE_WORDS: 4500,
  validateArticle: vi.fn(() => ({ ok: true, issues: [] })),
}));

const runQualityGateLoop = vi.fn();
vi.mock('@/lib/blog/quality-gate', () => ({ runQualityGateLoop }));

vi.mock('@/lib/blog/internal-links', () => ({ scoreInternalLinks: vi.fn(() => []) }));
vi.mock('@/lib/blog/distribution', () => ({ distributeArticle: vi.fn(), buildDistributionArticle: vi.fn() }));
const revalidatePath = vi.fn();
vi.mock('next/cache', () => ({ revalidatePath }));

const {
  checkBalanceStep,
  qualityGateAndPublishStep,
  recordFailureStep,
  generateArticleWorkflow,
  generateStructureStep,
} = await import('./generate-article');

const ARTICLE_STUB = {
  title: 'T', slug: 'slug-ok', meta_desc: 'M', image_prompt: 'p', content: 'conteúdo',
  structure: {
    sections: [{ h2: 'Seção 1' }, { h2: 'Seção 2' }],
    faq: [], summary_bullets: [], title: 'T', page_title: 'T', slug: 'slug-ok', meta_desc: 'M',
    cover_image_prompt: 'p', cover_alt: null, category: null,
  },
  bodies: [], sectionImagePrompts: [], cover_alt: null, category: null,
} as unknown as Parameters<typeof qualityGateAndPublishStep>[1];

describe('steps duráveis — estrutura e seções isoladas', () => {
  beforeEach(() => vi.clearAllMocks());

  it('persiste a estrutura antes de iniciar qualquer seção', async () => {
    generateArticleStructure.mockResolvedValue(ARTICLE_STUB.structure);
    saveOutlineStructure.mockResolvedValue(undefined);

    await expect(generateStructureStep('kw', [], null)).resolves.toEqual(ARTICLE_STUB.structure);

    expect(saveOutlineStructure).toHaveBeenCalledWith('kw', JSON.stringify(ARTICLE_STUB.structure));
    expect(writeSection).not.toHaveBeenCalled();
  });

  it('mantém steps separados e seções paralelas no source do workflow', () => {
    const source = readFileSync(join(process.cwd(), 'src/workflows/generate-article.ts'), 'utf8');

    expect(source).not.toContain('generateStructureAndSectionsStep');
    expect(source).toContain('generateStructureStep.maxRetries = 0');
    expect(source).toContain('writeSectionStep.maxRetries = 1');
    expect(source).toMatch(/Promise\.all\([\s\S]*writeSectionStep/);
  });
});

describe('checkBalanceStep — circuit breaker de saldo (REGRESSÃO 02/09/2026)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('saldo baixo: lança openrouter_balance_low com o valor restante', async () => {
    checkOpenRouterBalance.mockResolvedValue({ ok: false, remaining: 0.42 });
    await expect(checkBalanceStep()).rejects.toThrow('openrouter_balance_low:$0.42');
  });

  it('saldo ok: resolve sem lançar', async () => {
    checkOpenRouterBalance.mockResolvedValue({ ok: true, remaining: 50 });
    await expect(checkBalanceStep()).resolves.toBeUndefined();
  });
});

// REGRESSÃO 02/09/2026 (achado real em produção): o gate exigia o piso EXATO de 4500
// palavras contra um total que é SOMA de 7-9 seções escritas "sem contar palavra"
// (instrução deliberada — contar produz prosa artificialmente inchada). Achado real:
// artigo com 4421/4500 (1,8% abaixo) derrubado e descartado inteiro. Tolerância de 10%
// no gate de PUBLICAÇÃO — decisão do dono, preservada na migração.
describe('qualityGateAndPublishStep — tolerância de 10% no piso de palavras', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runQualityGateLoop.mockImplementation(async (initial: unknown) => ({
      content: initial,
      judged: { skipped: true, score: null, issues: [], categories: null },
      attempts: 0,
    }));
    insertArticle.mockResolvedValue('slug-ok');
    insertRunLog.mockResolvedValue(undefined);
    regenerateSectionsWithFeedback.mockResolvedValue([]);
  });

  it('4421 palavras (achado real, 1,8% abaixo de 4500) publica — dentro da tolerância', async () => {
    countArticleWords.mockReturnValueOnce(4421);
    const result = await qualityGateAndPublishStep('kw', ARTICLE_STUB, 'conteúdo', null, [], null, null);
    expect(result).toEqual({ slug: 'slug-ok', warnings: [] });
    expect(insertArticle).toHaveBeenCalled();
  });

  it('4050 palavras (exatamente 90% de 4500) publica — fronteira inclusiva', async () => {
    countArticleWords.mockReturnValueOnce(4050);
    const result = await qualityGateAndPublishStep('kw', ARTICLE_STUB, 'conteúdo', null, [], null, null);
    expect('slug' in result).toBe(true);
  });

  // DECISÃO DO DONO 14/09/2026: piso de palavras nunca mais bloqueia publicação (ver
  // REGRESSÃO 14/09/2026 abaixo) — mesmo sem melhora na regeneração extra, publica com
  // aviso em vez de reprovar o dia inteiro.
  it('4049 palavras (1 abaixo da fronteira de 90%), sem melhora na regeneração extra, PUBLICA com aviso', async () => {
    countArticleWords.mockReturnValueOnce(4049).mockReturnValueOnce(4049);
    const result = await qualityGateAndPublishStep('kw', ARTICLE_STUB, 'conteúdo', null, [], null, null);
    expect(result).toEqual({ slug: 'slug-ok', warnings: ['article_below_4050_words:4049'] });
    expect(insertArticle).toHaveBeenCalled();
  });
});

// REGRESSÃO 14/09/2026 (achado real em produção: 3826/4050): o gate de qualidade por LLM
// (runQualityGateLoop) nunca avalia tamanho — só pontua conteúdo/SEO/E-E-A-T/técnico/GEO.
// Antes deste fix, um artigo podia passar no gate de qualidade e ainda assim reprovar
// direto no piso de palavras, sem NUNCA tentar corrigir o próprio motivo da reprovação.
describe('qualityGateAndPublishStep — retry de tamanho quando o gate de qualidade passa mas o artigo sai curto (REGRESSÃO 14/09/2026)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runQualityGateLoop.mockImplementation(async (initial: unknown) => ({
      content: initial,
      judged: { skipped: true, score: null, issues: [], categories: null },
      attempts: 0,
    }));
    insertArticle.mockResolvedValue('slug-ok');
    insertRunLog.mockResolvedValue(undefined);
    regenerateSectionsWithFeedback.mockResolvedValue([]);
  });

  it('artigo curto dispara UMA regeneração extra e publica se ela corrigir', async () => {
    countArticleWords.mockReturnValueOnce(3826).mockReturnValueOnce(4200);
    const result = await qualityGateAndPublishStep('kw', ARTICLE_STUB, 'conteúdo', null, [], null, null);
    expect(regenerateSectionsWithFeedback).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ slug: 'slug-ok', warnings: [] });
  });

  // REGRESSÃO 14/09/2026 (2ª rodada — achado real de produção 3902/4050, DEPOIS do fix
  // acima já estar no ar): regenerateSectionsWithFeedback só regenera seções cujo
  // `issue.section` bate EXATAMENTE com um h2 da estrutura (findIndex por igualdade) — a
  // 1ª versão deste fix mandava `section: 'geral'`, que não casa com NENHUM h2 real; a
  // regeneração virava no-op silencioso (currentBodies inalterado) e o artigo continuava
  // curto. Esta issue trava que as issues sintéticas usam os h2 REAIS da estrutura.
  it('a issue sintética de expansão usa os h2 REAIS da estrutura, não um rótulo genérico', async () => {
    countArticleWords.mockReturnValueOnce(3826).mockReturnValueOnce(4200);
    await qualityGateAndPublishStep('kw', ARTICLE_STUB, 'conteúdo', null, [], null, null);
    const issuesPassadas = regenerateSectionsWithFeedback.mock.calls[0]?.[3];
    expect(issuesPassadas).toHaveLength(2);
    expect(issuesPassadas.map((i: { section: string }) => i.section)).toEqual(['Seção 1', 'Seção 2']);
  });

  // REGRESSÃO 14/09/2026 (3ª rodada — decisão do dono): reprovar o dia inteiro por causa de
  // uma métrica de tamanho, mesmo depois de já ter tentado corrigir, era o oposto da
  // garantia que o dono queria ("a publicação VAI SAIR todo dia"). Uma tentativa a mais é
  // best-effort; nunca é motivo pra bloquear. Publica com aviso mesmo sem melhora.
  it('se a regeneração extra ainda sair curta, PUBLICA com aviso — não bloqueia, não tenta infinitamente', async () => {
    countArticleWords.mockReturnValueOnce(3826).mockReturnValueOnce(3900);
    const result = await qualityGateAndPublishStep('kw', ARTICLE_STUB, 'conteúdo', null, [], null, null);
    expect(regenerateSectionsWithFeedback).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ slug: 'slug-ok', warnings: ['article_below_4050_words:3900'] });
    expect(insertArticle).toHaveBeenCalled();
  });

  it('artigo já dentro do piso NÃO dispara regeneração extra', async () => {
    countArticleWords.mockReturnValueOnce(4200);
    const result = await qualityGateAndPublishStep('kw', ARTICLE_STUB, 'conteúdo', null, [], null, null);
    expect(regenerateSectionsWithFeedback).not.toHaveBeenCalled();
    expect(result).toEqual({ slug: 'slug-ok', warnings: [] });
  });

  // REGRESSÃO 14/09/2026 (garantia pedida pelo dono, verbatim: "eu quero o fix no código
  // garantido que a publicação VAI SAIR"): qualityGateAndPublishStep NUNCA retorna
  // `{ error }` por piso de palavras, nem no pior caso extremo — só publica com aviso.
  // Isso é o que garante que o dia nunca fica sem artigo por essa causa: `'error' in
  // result` é sempre falso aqui, então generateArticleWorkflow nunca cai no branch de
  // recordFailureStep/sendFailureAlertEmail por causa de tamanho.
  it('GARANTIA: mesmo com 100 palavras (bem abaixo do piso), publica — piso de palavras nunca bloqueia', async () => {
    countArticleWords.mockReturnValueOnce(100).mockReturnValueOnce(100);
    const result = await qualityGateAndPublishStep('kw', ARTICLE_STUB, 'conteúdo', null, [], null, null);
    expect('error' in result).toBe(false);
    expect(result).toEqual({ slug: 'slug-ok', warnings: ['article_below_4050_words:100'] });
    expect(insertArticle).toHaveBeenCalled();
  });
});

// REGRESSÃO 02/09/2026: falha só ficava visível no relatório do Sentinel do dia SEGUINTE.
// markAlertedIfFirstFailureToday é atômico: só true na 1ª falha do dia — retries de cron
// subsequentes no mesmo dia não devem reenviar o alerta.
describe('recordFailureStep — alerta em tempo real na 1ª falha do dia', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertRunLog.mockResolvedValue(undefined);
  });

  it('1ª falha do dia (RPC devolve true): dispara o alerta com o erro e a keyword certos', async () => {
    markAlertedIfFirstFailureToday.mockResolvedValue(true);
    await recordFailureStep('energia solar teste', 'deepseek_structure_failed');
    expect(sendFailureAlertEmail).toHaveBeenCalledWith(
      expect.objectContaining({ keyword: 'energia solar teste', error: 'deepseek_structure_failed' }),
    );
  });

  it('falha subsequente no mesmo dia (RPC devolve false): NÃO reenvia o alerta', async () => {
    markAlertedIfFirstFailureToday.mockResolvedValue(false);
    await recordFailureStep('energia solar teste', 'outro erro');
    expect(sendFailureAlertEmail).not.toHaveBeenCalled();
  });

  it('sempre grava insertRunLog com status error, mesmo antes de saber se é a 1ª falha', async () => {
    markAlertedIfFirstFailureToday.mockResolvedValue(false);
    await recordFailureStep('energia solar teste', 'algum erro');
    expect(insertRunLog).toHaveBeenCalledWith({ keyword: 'energia solar teste', status: 'error', error: 'algum erro' });
  });
});

// REGRESSÃO 14/09/2026 (achado da auditoria pedida pelo dono, "garantia irrestrita de
// publicação"): markPublishedStep/revalidateStep/distributeStep rodam DEPOIS de
// qualityGateAndPublishStep já ter inserido o artigo (coesa_articles) e gravado
// insertRunLog(success) — mas as 3 chamadas ficam dentro do MESMO try/catch do workflow.
// Se qualquer uma lançar (ex.: revalidatePath fora do contexto de request do Next.js —
// erro documentado do framework: "Invariant: static generation store missing"), o catch
// externo tratava isso como falha TOTAL do pipeline: recordFailureStep disparava um alerta
// de e-mail dizendo que o artigo NÃO publicou, quando na verdade já estava em produção.
// coesa_blog_insert_run_log (lida ao vivo no Supabase) só faz UPDATE quando status='running'
// — não sobrescreve um 'success' já gravado — mas coesa_blog_mark_alerted não tem essa
// mesma trava (só checa `alerted=false`), então o e-mail falso disparava mesmo assim.
describe('generateArticleWorkflow — passos pós-publicação não derrubam um artigo já publicado (REGRESSÃO 14/09/2026)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkOpenRouterBalance.mockResolvedValue({ ok: true, remaining: 50 });
    getNextPlannedEntry.mockResolvedValue({ keyword: 'kw-workflow-test' });
    generateArticleStructure.mockResolvedValue(ARTICLE_STUB.structure);
    writeSection.mockResolvedValue('corpo da seção');
    buildArticleFromSections.mockReturnValue(ARTICLE_STUB);
    runQualityGateLoop.mockImplementation(async (initial: unknown) => ({
      content: initial,
      judged: { skipped: true, score: null, issues: [], categories: null },
      attempts: 0,
    }));
    insertArticle.mockResolvedValue('slug-workflow-test');
    insertRunLog.mockResolvedValue(undefined);
    markAlertedIfFirstFailureToday.mockResolvedValue(false);
    saveOutlineStructure.mockResolvedValue(undefined);
  });

  it('revalidatePath falhando DEPOIS do artigo já inserido NÃO derruba a publicação nem dispara alerta falso', async () => {
    revalidatePath.mockImplementationOnce(() => {
      throw new Error('Invariant: static generation store missing in revalidatePath');
    });

    const result = await generateArticleWorkflow();

    expect(result).toEqual({ slug: 'slug-workflow-test', warnings: [] });
    expect(insertArticle).toHaveBeenCalled();
    expect(insertRunLog).toHaveBeenCalledWith({ keyword: 'kw-workflow-test', status: 'success' });
    expect(insertRunLog).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'error' }));
    expect(sendFailureAlertEmail).not.toHaveBeenCalled();
  });

  it('caso positivo: sem falha nos passos pós-publicação, publica normalmente', async () => {
    const result = await generateArticleWorkflow();
    expect(result).toEqual({ slug: 'slug-workflow-test', warnings: [] });
    expect(generateArticleStructure).toHaveBeenCalledTimes(1);
    expect(writeSection).toHaveBeenCalledTimes(ARTICLE_STUB.structure.sections.length);
  });

  // REGRESSÃO 14/09/2026 (achado da 2ª passada da auditoria): published.warnings (o aviso de
  // piso de palavras do PR #76) era computado dentro de qualityGateAndPublishStep mas nunca
  // chegava ao retorno final de generateArticleWorkflow — só os warnings do checklist
  // on-page eram propagados. O artigo publicava certo, mas o aviso de tamanho desaparecia
  // silenciosamente pra quem consome o resultado (rota, e-mail, dashboard).
  it('aviso de piso de palavras chega até o retorno final do workflow, não só até qualityGateAndPublishStep', async () => {
    countArticleWords.mockReturnValueOnce(3900).mockReturnValueOnce(3900);
    const result = await generateArticleWorkflow();
    expect(result).toEqual({
      slug: 'slug-workflow-test',
      warnings: ['article_below_4050_words:3900'],
    });
  });
});
