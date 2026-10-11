/**
 * Workflow durável de geração de artigo — substitui a chamada síncrona de
 * runPipeline() dentro de app/api/blog/generate/route.ts.
 *
 * Migração 13/09/2026 (mesma causa raiz já corrigida no cfgauss-site, PR
 * #600/#605/#610/#617, e no gaussmob-nextjs/mova-nextjs, PR #155): rota
 * síncrona com maxDuration=800 como teto artificial, Promise.race(runPipeline,
 * deadline) como workaround manual — o próprio comentário do código admitia
 * "Promise.race não cancela o perdedor: se o deadline vencer, runPipeline()
 * segue rodando em segundo plano até a Vercel matar o processo". 3 incidentes
 * reais de pipeline_deadline_exceeded documentados (27/08, 01/09, 02/09,
 * depois recorrente quase toda semana de setembro). Cada fase agora é um
 * step durável — cacheado e retryado pelo runtime do Workflow DevKit,
 * sobrevive a reinício de processo, sem teto de tempo total.
 *
 * Diferenças estruturais reais vs. cfgauss/gaussmob (não é find-and-replace):
 *   - coesa_articles nunca tem linha 'generating'/'failed' — a RPC
 *     coesa_blog_insert_article sempre insere 'published'. Rastreamento de
 *     falha vive só em coesa_blog_run_log (status running/success/error),
 *     já com self-healing em SQL puro (migrations de reclaim/cleanup) — não
 *     precisa de equivalente a reserveArticleSlot/markArticleFailed.
 *   - Sem cron de retry separado: vercel.json dispara esta rota 3x/dia útil;
 *     a idempotência de claimBlogRunToday() JÁ é a estratégia de retry.
 *   - writeSection() retenta três vezes e lança se a seção continuar fora
 *     de 400–700 palavras; o workflow registra a falha sem publicar briefing.
 *   - Nenhum módulo do pipeline tem side-effect de módulo Node.js no nível
 *     do módulo (grep confirmado: zero AsyncLocalStorage/instanciação
 *     top-level) — diferente do gaussmob, todos os imports abaixo são
 *     ESTÁTICOS, sem necessidade do padrão de import dinâmico.
 *
 * Decisão do dono (13/09/2026): o mecanismo de "orçamento de tempo"
 * (hasTimeBudget/PUBLISH_SAFETY_MARGIN_MS/STRUCTURE_SAFETY_MARGIN_MS/
 * hasStructureBudget), que pulava fases opcionais quando o relógio
 * compartilhado estava acabando, foi REMOVIDO por completo — sem teto de
 * 800s, esse mecanismo seria o mesmo tipo de workaround que esta migração
 * elimina. Cada fase já falha aberto sozinha (retorna null/skipped em erro
 * próprio); um dia ruim agora demora mais em vez de degradar cedo pulando
 * fases — trade-off aceito explicitamente.
 */
import { revalidatePath } from 'next/cache';
import {
  claimBlogRunToday,
  insertArticle,
  insertRunLog,
  getPublishedKeywords,
  getLinkCandidates,
  markAlertedIfFirstFailureToday,
} from '@/lib/blog/supabase-blog';
import { sendFailureAlertEmail } from '@/lib/blog/alert';
import { getNextPlannedEntry, markPublished, saveOutlineStructure, type EditorialBrief } from '@/lib/blog/editorial-calendar';
import { fetchTopKeyword } from '@/lib/blog/gsc';
import {
  generateArticleStructure,
  writeSection,
  enrichSectionBriefs,
  buildArticleFromSections,
  assembleArticleMarkdown,
  regenerateSectionsWithFeedback,
  injectSectionImages,
  fixSimpleValidationIssues,
  type ArticleContent,
  type ArticleStructure,
  type ArticleWithSections,
  type InternalLink,
} from '@/lib/blog/deepseek';
import { generateAndUploadCover, generateAndUploadBodyImages, generateAndUploadInfographic } from '@/lib/blog/image-gen';
import { injectInfographic, injectInlineCtas, type InlineCta } from '@/lib/blog/image-body';
import { countArticleWords, MIN_ACCEPTABLE_ARTICLE_WORDS, MIN_ARTICLE_WORDS, validateArticle } from '@/lib/blog/validate';
import { runQualityGateLoop, type QualityGateResult, type JudgeIssue } from '@/lib/blog/quality-gate';
import { checkOpenRouterBalance } from '@/lib/blog/openrouter-budget';
import { scoreInternalLinks } from '@/lib/blog/internal-links';
import { distributeArticle, buildDistributionArticle } from '@/lib/blog/distribution';
import { AUTOBLOG_PROFILE } from '@/lib/autoblog-profile';

export type GenerateArticleResult = { slug: string | null; warnings?: string[]; error?: string };

// ─── Steps ──────────────────────────────────────────────────────────────────

export async function checkBalanceStep(): Promise<void> {
  'use step';
  const balance = await checkOpenRouterBalance();
  if (!balance.ok) {
    throw new Error(`openrouter_balance_low:$${balance.remaining?.toFixed(2)}`);
  }
}

async function resolveKeywordAndBriefStep(): Promise<{ keyword: string; brief: EditorialBrief | null }> {
  'use step';
  let brief: EditorialBrief | null = null;
  let keyword: string | undefined;
  try {
    const planned = await getNextPlannedEntry();
    if (planned) {
      keyword = planned.keyword;
      brief = planned;
    }
  } catch (err) {
    console.warn('[workflow/generate-article] Calendário indisponível:', err);
  }
  if (!keyword) {
    const existingKeywords = await getPublishedKeywords();
    keyword = await fetchTopKeyword(existingKeywords);
  }
  if (!keyword) throw new Error('keyword_not_resolved');
  return { keyword, brief };
}

async function resolveInternalLinksStep(keyword: string): Promise<InternalLink[]> {
  'use step';
  const profileLinks: InternalLink[] = AUTOBLOG_PROFILE.editorial.internalLinks.map(l => ({
    label: l.label,
    url: l.url,
  }));
  let dynamicLinks: InternalLink[] = [];
  try {
    const profileUrls = new Set(profileLinks.map(l => l.url));
    dynamicLinks = scoreInternalLinks(keyword, await getLinkCandidates())
      .filter(l => !profileUrls.has(l.url));
  } catch (err) {
    console.warn('[workflow/generate-article] Interlinkagem indisponível:', err);
  }
  return [...profileLinks, ...dynamicLinks];
}

export async function generateStructureStep(
  keyword: string,
  internalLinks: InternalLink[],
  brief: EditorialBrief | null,
): Promise<ArticleStructure> {
  'use step';
  const rawStructure = await generateArticleStructure(keyword, internalLinks, brief);
  const structure: ArticleStructure = {
    ...rawStructure,
    sections: enrichSectionBriefs(rawStructure.sections, keyword, internalLinks),
  };
  await saveOutlineStructure(keyword, JSON.stringify(structure)).catch(() => {});
  return structure;
}
// generateArticleStructure já controla a chamada inicial e os dois retries de provedor.
generateStructureStep.maxRetries = 0;

export async function writeSectionStep(
  keyword: string,
  section: ArticleStructure['sections'][number],
  index: number,
  total: number,
): Promise<string> {
  'use step';
  return writeSection(keyword, section, index, total);
}
writeSectionStep.maxRetries = 1;

async function generateCoverStep(prompt: string, slug: string): Promise<string | null> {
  'use step';
  return generateAndUploadCover(prompt, slug);
}

async function generateBodyImagesStep(prompts: string[], slug: string, keyword: string): Promise<Array<{ url: string; alt: string } | null>> {
  'use step';
  return generateAndUploadBodyImages(prompts, slug, keyword);
}

async function generateInfographicStep(prompt: string, slug: string): Promise<string | null> {
  'use step';
  return generateAndUploadInfographic(prompt, slug);
}

export async function qualityGateAndPublishStep(
  keyword: string,
  article: ArticleWithSections,
  contentWithCtas: string,
  coverUrl: string | null,
  sectionImages: Array<{ url: string; alt: string } | null>,
  infographicUrl: string | null,
  cta: InlineCta | null,
): Promise<{ slug: string; warnings: string[] } | { error: string }> {
  'use step';
  type GateContent = { article: ArticleWithSections; content: string };

  const regenerateWithIssues = async ({ article: a }: GateContent, issues: JudgeIssue[]): Promise<GateContent> => {
    const newBodies = await regenerateSectionsWithFeedback(keyword, a.structure, a.bodies, issues);
    const newContent = assembleArticleMarkdown(a.structure, newBodies);
    const revised = { ...a, bodies: newBodies, content: newContent };
    // As imagens de seção/infográfico JÁ GERADAS continuam válidas — só
    // reinjeta nos NOVOS corpos regenerados, sem gerar imagem de novo
    // (mesmo comportamento do runPipeline síncrono original).
    const regenBody = injectSectionImages(newContent, sectionImages);
    const regenWithInfographic = injectInfographic(
      regenBody,
      infographicUrl ? { url: infographicUrl, alt: `${keyword} — infográfico` } : null,
    );
    return { article: revised, content: injectInlineCtas(regenWithInfographic, cta) };
  };

  const gateResult = await runQualityGateLoop<GateContent>(
    { article, content: contentWithCtas },
    ({ article: a, content }) => `# ${a.title}\n\nMeta description: ${a.meta_desc}\n\n${content}`,
    (content, issues) => {
      console.warn('[workflow/generate-article] Quality gate abaixo de 90 — regenerando:', issues);
      return regenerateWithIssues(content, issues);
    },
  );

  let finalContent = gateResult.content;
  if (!gateResult.judged.skipped) {
    console.warn(`[workflow/generate-article] Quality gate score final: ${gateResult.judged.score}`);
  }

  let finalWordCount = countArticleWords(finalContent.content);
  // REGRESSÃO 14/09/2026 (achado real: 3826/4050): o gate de qualidade por LLM acima
  // nunca avalia tamanho (suas 5 categorias são conteúdo/SEO/E-E-A-T/técnico/GEO) — um
  // artigo pode pontuar >=90 e sair curto do mesmo jeito, sem NUNCA passar pelo loop de
  // regeneração. Antes deste fix, isso reprovava o dia inteiro na 1ª geração curta. Uma
  // tentativa extra, reaproveitando o MESMO regenerate do gate de qualidade, com uma
  // issue sintética pedindo mais profundidade — mesma classe de correção, agora fechada
  // pra tamanho.
  if (finalWordCount < MIN_ACCEPTABLE_ARTICLE_WORDS) {
    console.warn(`[workflow/generate-article] Artigo com ${finalWordCount} palavras (piso ${MIN_ACCEPTABLE_ARTICLE_WORDS}) — regenerando com pedido de expansão.`);
    // regenerateSectionsWithFeedback só regenera seções cujo `issue.section` bate
    // EXATAMENTE com um h2 da estrutura (findIndex por igualdade) — uma issue genérica
    // ("geral") não casa com nenhuma seção e é descartada em silêncio (secoesComIssue
    // fica vazio, currentBodies volta inalterado). Uma issue por seção real é o que
    // aciona a regeneração de todas elas.
    const expandAllSections: JudgeIssue[] = finalContent.article.structure.sections.map(s => ({
      severity: 'P0',
      category: 'content_quality',
      section: s.h2,
      problem: `Artigo com ${finalWordCount} palavras no total, abaixo do piso de ${MIN_ACCEPTABLE_ARTICLE_WORDS}.`,
      fix_instruction: `Expanda esta seção com mais profundidade, exemplos e detalhes práticos — contribua para o artigo somar pelo menos ${MIN_ARTICLE_WORDS} palavras no total, sem redundância nem enrolação.`,
    }));
    finalContent = await regenerateWithIssues(finalContent, expandAllSections);
    finalWordCount = countArticleWords(finalContent.content);
  }

  const finalArticle = finalContent.article;
  const finalContentWithCtas = finalContent.content;
  const warnings: string[] = [];
  // DECISÃO DO DONO 14/09/2026: bloquear a publicação por piso de palavras reprovava o DIA
  // INTEIRO — zero artigo, mesmo com milhares de palavras de conteúdo substancial já
  // prontas, só porque uma métrica de tamanho não bateu mesmo depois da tentativa extra de
  // expansão acima. O LLM é probabilístico — nenhuma quantidade de retry é garantia
  // matemática de bater o piso exato. A garantia real pedida foi inverter a prioridade:
  // publicar SEMPRE (best-effort de tamanho já feito acima), nunca mais bloquear por isso.
  // Mesmo tratamento que o checklist on-page já dá a outras issues não-fatais — aviso, não
  // bloqueio. Consequência direta: essa causa nunca mais dispara o alerta de falha do dia
  // (recordFailureStep só roda pra erro real de pipeline, não pra isso).
  if (finalWordCount < MIN_ACCEPTABLE_ARTICLE_WORDS) {
    const warning = `article_below_${MIN_ACCEPTABLE_ARTICLE_WORDS}_words:${finalWordCount}`;
    console.warn(`[workflow/generate-article] Publicando mesmo assim com ${finalWordCount} palavras (piso ${MIN_ACCEPTABLE_ARTICLE_WORDS}) — piso de palavras não bloqueia mais publicação.`);
    warnings.push(warning);
  }

  const finalSlug = await insertArticle({
    slug: finalArticle.slug,
    title: finalArticle.title,
    page_title: finalArticle.page_title ?? null,
    meta_desc: finalArticle.meta_desc,
    content: finalContentWithCtas,
    cover_url: coverUrl,
    cover_alt: finalArticle.cover_alt ?? null,
    keyword,
    category: finalArticle.category ?? null,
  });

  // Log de sucesso — feito IMEDIATAMENTE após insert do artigo. Crítico: se
  // revalidate/markPublished/distribute abaixo falharem, o log já existe e
  // o próximo cron run (3x/dia) vê 'success' e não duplica o artigo.
  await insertRunLog({ keyword, status: 'success' });

  return { slug: finalSlug, warnings };
}
qualityGateAndPublishStep.maxRetries = 0;

async function markPublishedStep(keyword: string, slug: string): Promise<void> {
  'use step';
  await markPublished(keyword, slug);
}

async function revalidateStep(slug: string, category: string | null | undefined): Promise<void> {
  'use step';
  revalidatePath('/blog');
  revalidatePath(`/blog/${slug}`);
  revalidatePath('/sitemap.xml');
  if (category) revalidatePath(`/categoria/${category}`);
}

async function distributeStep(
  article: { title: string; page_title: string | null; keyword: string },
  slug: string,
): Promise<void> {
  'use step';
  const distConfig = AUTOBLOG_PROFILE.integrations.distribution;
  if (!distConfig.enabled || distConfig.channels.length === 0) return;
  try {
    const results = await distributeArticle(
      buildDistributionArticle({
        title: article.title,
        pageTitle: article.page_title,
        slug,
        metaDesc: '',
        keyword: article.keyword,
      }),
      [...distConfig.channels],
    );
    for (const result of results) {
      if (!result.ok) {
        console.warn(`[workflow/generate-article] Divulgação '${result.channel}' falhou:`, result.error);
      }
    }
  } catch (err) {
    console.warn('[workflow/generate-article] Divulgação indisponível:', err);
  }
}

export async function recordFailureStep(keyword: string | undefined, errorMsg: string): Promise<void> {
  'use step';
  await insertRunLog({ keyword, status: 'error', error: errorMsg }).catch(() => {});
  const isFirstFailureToday = await markAlertedIfFirstFailureToday().catch(() => false);
  if (isFirstFailureToday) {
    const runDate = new Date().toISOString().slice(0, 10);
    await sendFailureAlertEmail({ keyword, error: errorMsg, runDate }).catch(() => {});
  }
}

// ─── Workflow ───────────────────────────────────────────────────────────────

export async function generateArticleWorkflow(): Promise<GenerateArticleResult> {
  'use workflow';

  let keyword: string | undefined;

  try {
    await checkBalanceStep();

    const resolved = await resolveKeywordAndBriefStep();
    keyword = resolved.keyword;
    const kw = resolved.keyword;

    const internalLinks = await resolveInternalLinksStep(kw);

    const structure = await generateStructureStep(kw, internalLinks, resolved.brief);
    const bodies = await Promise.all(
      structure.sections.map((section, index) =>
        writeSectionStep(kw, section, index, structure.sections.length),
      ),
    );
    let article = buildArticleFromSections(structure, bodies);

    // Validação on-page (pura, sem I/O — roda no corpo do workflow) + fix
    // determinístico se falhar (também puro). Regenerar o artigo INTEIRO
    // aqui é o que estourava o antigo maxDuration=800s na 2ª rodada — fix
    // determinístico é instantâneo; o que sobrar publica com aviso.
    const validate = (a: ArticleContent) =>
      validateArticle({
        keyword: kw,
        title: a.title,
        pageTitle: a.page_title ?? null,
        metaDesc: a.meta_desc,
        content: a.content,
        siteUrl: AUTOBLOG_PROFILE.brand.siteUrl,
        ctaUrl: AUTOBLOG_PROFILE.cta.url,
        coverAlt: a.cover_alt ?? null,
        category: a.category ?? null,
        allowedCategories: AUTOBLOG_PROFILE.editorial.categories.map(c => c.slug),
      });
    let report = validate(article);
    if (!report.ok) {
      console.warn('[workflow/generate-article] Checklist on-page falhou — aplicando fix determinístico:', report.issues);
      article = { ...article, ...fixSimpleValidationIssues(article, kw, report.issues.map(i => i.rule)) };
      report = validate(article);
    }
    const warnings = report.ok ? [] : report.issues;

    const coverUrl = await generateCoverStep(article.image_prompt, article.slug);
    const sectionImages = await generateBodyImagesStep(article.sectionImagePrompts, article.slug, kw);
    const contentWithImages = injectSectionImages(article.content, sectionImages);

    const infographicUrl = await generateInfographicStep(article.image_prompt, article.slug);
    const contentWithInfographic = injectInfographic(
      contentWithImages,
      infographicUrl ? { url: infographicUrl, alt: `${kw} — infográfico` } : null,
    );

    const cta = AUTOBLOG_PROFILE.cta.url.trim() ? AUTOBLOG_PROFILE.cta : null;
    const contentWithCtas = injectInlineCtas(contentWithInfographic, cta);

    const published = await qualityGateAndPublishStep(kw, article, contentWithCtas, coverUrl, sectionImages, infographicUrl, cta);
    if ('error' in published) {
      await recordFailureStep(kw, published.error);
      return { slug: null, error: published.error };
    }

    // REGRESSÃO 14/09/2026 (achado da auditoria "garantia irrestrita de publicação"): daqui
    // pra baixo o artigo JÁ está publicado — coesa_articles + insertRunLog(success) já
    // gravados dentro de qualityGateAndPublishStep. markPublished/revalidate/distribute são
    // acessórios (calendário, cache, redes sociais); um deles lançando (ex.: revalidatePath
    // fora do contexto de request do Next.js) não pode mais virar "o dia não teve artigo" —
    // isso já aconteceu: o catch externo tratava qualquer exceção daqui como falha total do
    // pipeline e disparava recordFailureStep, que envia um alerta de falha FALSO (a RPC
    // coesa_blog_mark_alerted não verifica status, só `alerted=false` — dispara mesmo com o
    // artigo já publicado). Cada passo já é fail-open por dentro (markPublished/
    // distributeArticle nunca lançam de fato), mas o guard aqui cobre qualquer exceção
    // residual sem depender de cada implementação individual permanecer fail-open pra sempre.
    try {
      await markPublishedStep(kw, published.slug);
      await revalidateStep(published.slug, article.category);
      await distributeStep({ title: article.title, page_title: article.page_title ?? null, keyword: kw }, published.slug);
    } catch (err) {
      console.warn('[workflow/generate-article] Passo pós-publicação falhou (artigo já está no ar, não bloqueia):', err);
    }

    if (warnings.length) {
      console.warn('[workflow/generate-article] Publicado com ressalvas do checklist:', warnings);
    }

    // REGRESSÃO 14/09/2026 (achado da 2ª passada da auditoria): published.warnings (ex.: o
    // aviso de piso de palavras do PR #76) era computado dentro de qualityGateAndPublishStep
    // mas nunca chegava até aqui — só os warnings do checklist on-page eram propagados. O
    // artigo publicava certo, mas quem consome o resultado (rota, e-mail, dashboard) nunca
    // via o aviso de tamanho.
    return { slug: published.slug, warnings: [...warnings.map(w => w.message), ...published.warnings] };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[workflow/generate-article] Pipeline falhou:', errorMsg);
    await recordFailureStep(keyword, errorMsg);
    return { slug: null, error: errorMsg };
  }
}
