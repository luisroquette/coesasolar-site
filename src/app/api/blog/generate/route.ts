export const maxDuration = 300; // Vercel Pro — até 300s para pipeline completo
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { claimBlogRunToday, insertArticle, insertRunLog, getPublishedKeywords, getLinkCandidates } from '@/lib/blog/supabase-blog';
import { getNextPlannedEntry, markPublished, saveOutlineStructure, type EditorialBrief } from '@/lib/blog/editorial-calendar';
import { fetchTopKeyword } from '@/lib/blog/gsc';
import {
  generateArticleWithSections,
  assembleArticleMarkdown,
  regenerateSectionsWithFeedback,
  injectSectionImages,
  fixSimpleValidationIssues,
  type ArticleContent,
  type InternalLink,
} from '@/lib/blog/deepseek';
import { generateAndUploadCover, generateAndUploadBodyImages, generateAndUploadInfographic } from '@/lib/blog/image-gen';
import { injectInfographic, injectInlineCtas } from '@/lib/blog/image-body';
import { countArticleWords, MIN_ARTICLE_WORDS, validateArticle } from '@/lib/blog/validate';
import { runQualityGateLoop, type QualityGateResult } from '@/lib/blog/quality-gate';
import { hasTimeBudget } from '@/lib/blog/time-budget';
import { scoreInternalLinks } from '@/lib/blog/internal-links';
import { distributeArticle, buildDistributionArticle } from '@/lib/blog/distribution';
import { AUTOBLOG_PROFILE } from '@/lib/autoblog-profile';

// REGRESSÃO 02/09/2026: a Vercel mata a função (SIGKILL) no maxDuration sem deixar o catch
// rodar — insertRunLog nunca é chamado e a linha do claim fica presa em 'running' pra sempre
// (só é reclamada pelo cron do dia seguinte, perdendo o dia sem publicar e sem erro visível).
// Recorrência confirmada em 27/08, 01/09 e 02/09 — o guard de fases opcionais (abaixo) reduz a
// chance, mas não cobre TODA fase (estrutura/seções, capa, insertArticle continuam sem guard,
// e uma fase nova futura sem guard reabriria o mesmo buraco). DEADLINE_MS é o backstop: um
// timer em JS (checável) que SEMPRE vence a corrida contra o SIGKILL da Vercel (não checável)
// porque dispara antes — 30s de margem pro catch + insertRunLog(error) + response terminarem.
const DEADLINE_MARGIN_MS = 30_000;
const PIPELINE_DEADLINE_MS = maxDuration * 1000 - DEADLINE_MARGIN_MS;

class PipelineDeadlineError extends Error {
  constructor() {
    super('pipeline_deadline_exceeded');
    this.name = 'PipelineDeadlineError';
  }
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization') ?? '';
  const cronSecret = process.env.CRON_SECRET;
  const isAuthorized = !!cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Claim atômico antes de qualquer chamada externa: evita publicação duplicada
  // quando cron/manual chegam quase simultaneamente.
  const claim = await claimBlogRunToday();
  if (claim === 'already_run') {
    return NextResponse.json({ message: 'already_run_today' }, { status: 200 });
  }
  if (claim === 'error') {
    // Claim falhou por infra (RPC ausente/secret/transitório): NUNCA responder 200 aqui —
    // senão o cron da Vercel marca como sucesso, não re-tenta e o dia fica sem artigo em silêncio.
    return NextResponse.json({ error: 'claim_failed' }, { status: 500 });
  }

  let keyword: string | undefined;
  const t0 = Date.now();
  const lap = (label: string) => console.warn(`[blog/generate] ${label}: +${Math.round((Date.now() - t0) / 1000)}s`);

  // generateAndUploadBodyImages/Infographic/runQualityGateLoop são as fases opcionais mais
  // caras e vêm DEPOIS da capa — pular cada uma se não sobrar tempo seguro evita bater no
  // DEADLINE_MS na maioria dos dias, publicando com o que já foi gerado em vez de perder o
  // artigo inteiro. Camada 1 de defesa (graceful); PIPELINE_DEADLINE_MS é a camada 2 (backstop).
  const PUBLISH_SAFETY_MARGIN_MS = 60_000;
  const withinBudget = () => hasTimeBudget(Date.now() - t0, maxDuration, PUBLISH_SAFETY_MARGIN_MS);

  const runPipeline = async (): Promise<NextResponse> => {
    // 1. Keyword do dia: pauta do calendário TEM precedência (o dono agenda);
    //    dia sem pauta cai no seed rotativo/GSC.
    let brief: EditorialBrief | null = null;
    try {
      const planned = await getNextPlannedEntry();
      if (planned) {
        keyword = planned.keyword;
        brief = planned;
      }
    } catch (err) {
      console.warn('[blog/generate] Calendário indisponível:', err);
    }
    if (!keyword) {
      // getPublishedKeywords só é necessário no fallback — economiza 1 query
      // quando a pauta veio do calendário.
      const existingKeywords = await getPublishedKeywords();
      keyword = await fetchTopKeyword(existingKeywords);
    }
    if (!keyword) throw new Error('keyword_not_resolved');
    const kw = keyword; // string narrowed — closure do validador não refina variável let

    // 1.5. Links internos: fixos do perfil + dinâmicos dos artigos publicados (overlap de tokens)
    const profileLinks: InternalLink[] = AUTOBLOG_PROFILE.editorial.internalLinks.map(l => ({
      label: l.label,
      url: l.url,
    }));
    let dynamicLinks: InternalLink[] = [];
    try {
      const profileUrls = new Set(profileLinks.map(l => l.url));
      dynamicLinks = scoreInternalLinks(kw, await getLinkCandidates())
        .filter(l => !profileUrls.has(l.url)); // sem duplicata com os links fixos do perfil
    } catch (err) {
      console.warn('[blog/generate] Interlinkagem indisponível:', err);
    }
    const internalLinks = [...profileLinks, ...dynamicLinks];

    // 2. Gerar artigo (motor por seções, checklist 25/08/2026 — estrutura 7-9 H2s + FAQ-7,
    //    1 chamada por seção com max_tokens explícito, nunca o artigo inteiro numa chamada
    //    só) + validar checklist on-page (Yoast-style).
    //    Falhou → regenera UMA vez; falhou de novo → publica com avisos no response.
    //    NOTA: substitui os dois caminhos antigos (generateArticle de chamada única e o
    //    outline-then-body de generateArticleFromOutline, hoje atrás da flag
    //    twoStageGenerationEnabled=false) — generateArticleWithSections já faz outline
    //    internamente (a estrutura) antes de escrever, cobrindo o propósito da flag com o
    //    limite de tokens por seção que a chamada única não tinha.
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

    let article = await generateArticleWithSections(kw, internalLinks, brief);
    lap('estrutura+seções geradas');
    // Guarda a estrutura aprovada na pauta do calendário (no-op se a keyword veio do seed)
    await saveOutlineStructure(kw, JSON.stringify(article.structure)).catch(() => {});

    let report = validate(article);
    if (!report.ok) {
      // ACHADO 25/08/2026: regenerar o ARTIGO INTEIRO aqui (chamada completa, ~190s)
      // é o que fazia o pipeline estourar maxDuration=300s na 2ª rodada — mesmo quando
      // só sobrava 1-2 issues pequenas. Fix determinístico primeiro (instantâneo, sem
      // custo de LLM); o que sobrar publica com aviso (fail-open, nunca bloqueia).
      console.warn('[blog/generate] Checklist on-page falhou — aplicando fix determinístico:', report.issues);
      article = fixSimpleValidationIssues(article, kw, report.issues.map(i => i.rule));
      report = validate(article);
      lap('fix determinístico do checklist aplicado');
    }
    const warnings = report.ok ? [] : report.issues;

    // 3. Gerar imagem de capa (falha silenciosa — não bloqueia publicação)
    const coverUrl = await generateAndUploadCover(article.image_prompt, article.slug);
    lap('capa gerada');

    // 3.5 Imagens do corpo: 1 por seção (7-9), alt com keyword (flag imageGenerationEnabled).
    //     generateAndUploadBodyImages preserva posição (null nas falhas) — sectionImages[i]
    //     sempre corresponde à seção i, mesmo se uma imagem no meio da lista falhar.
    let sectionImages: Awaited<ReturnType<typeof generateAndUploadBodyImages>>;
    if (withinBudget()) {
      sectionImages = await generateAndUploadBodyImages(article.sectionImagePrompts, article.slug, kw);
    } else {
      console.warn('[blog/generate] Pulando imagens de corpo — budget insuficiente antes do hard-kill de 300s');
      sectionImages = article.sectionImagePrompts.map(() => null);
    }
    lap('imagens de corpo geradas');
    const finalContent = injectSectionImages(article.content, sectionImages);

    // 3.6 Infográfico (flag infographicsEnabled): resumo visual antes do fechamento
    let infographicUrl: string | null;
    if (withinBudget()) {
      infographicUrl = await generateAndUploadInfographic(article.image_prompt, article.slug);
    } else {
      console.warn('[blog/generate] Pulando infográfico — budget insuficiente antes do hard-kill de 300s');
      infographicUrl = null;
    }
    lap('infográfico (flag off = instantâneo)');
    const finalContentWithInfographic = injectInfographic(
      finalContent,
      infographicUrl ? { url: infographicUrl, alt: `${kw} — infográfico` } : null,
    );

    // 3.7 Um CTA após CADA imagem do corpo (regra editorial do dono)
    const cta = AUTOBLOG_PROFILE.cta.url.trim()
      ? AUTOBLOG_PROFILE.cta
      : null;
    const contentWithCtas = injectInlineCtas(finalContentWithInfographic, cta);

    // 3.8 Gate de qualidade por LLM (score 0-100, 5 categorias) — roda 100% em memória
    //     porque insertArticle usa a RPC coesa_blog_insert_article, que não aceita
    //     p_status (sempre insere published). Fail-open: sem a chave OpenRouter o gate
    //     é pulado e o pipeline publica normalmente. Reusa coverUrl/sectionImages/infographic
    //     já gerados — não regenera imagens, só reescreve as seções com issue
    //     (regenerateSectionsWithFeedback, nunca o artigo inteiro numa chamada — mesmo motivo
    //     da Task 2). Publica de qualquer forma ao final, mesmo se o score continuar < 90.
    type GateContent = { article: typeof article; content: string };
    let gateResult: { content: GateContent; judged: QualityGateResult; attempts: number };
    if (withinBudget()) {
      gateResult = await runQualityGateLoop(
        { article, content: contentWithCtas },
        ({ article: a, content }) => `# ${a.title}\n\nMeta description: ${a.meta_desc}\n\n${content}`,
        async ({ article: a }, issues) => {
          console.warn('[blog/generate] Quality gate abaixo de 90 — regenerando:', issues);
          const newBodies = await regenerateSectionsWithFeedback(kw, a.structure, a.bodies, issues);
          const newContent = assembleArticleMarkdown(a.structure, newBodies);
          const revised = { ...a, bodies: newBodies, content: newContent };
          const regenBody = injectSectionImages(newContent, sectionImages);
          const regenWithInfographic = injectInfographic(
            regenBody,
            infographicUrl ? { url: infographicUrl, alt: `${kw} — infográfico` } : null,
          );
          return { article: revised, content: injectInlineCtas(regenWithInfographic, cta) };
        },
      );
    } else {
      console.warn('[blog/generate] Pulando quality gate — budget insuficiente antes do hard-kill de 300s');
      gateResult = {
        content: { article, content: contentWithCtas },
        judged: { skipped: true, score: null, issues: [], categories: null },
        attempts: 0,
      };
    }
    article = gateResult.content.article;
    const finalContentWithCtas = gateResult.content.content;
    lap(`gate de qualidade concluído (attempts=${gateResult.attempts}, skipped=${gateResult.judged.skipped})`);
    if (!gateResult.judged.skipped) {
      console.warn(`[blog/generate] Quality gate score final: ${gateResult.judged.score}`);
    }

    // REGRESSÃO 02/09/2026: gate exigia o piso EXATO (4500) contra um total que é SOMA de
    // 7-9 seções escritas "sem contar palavra" (instrução deliberada — contar produz prosa
    // artificialmente inchada). LLM não bate número exato por composição; variância de 1-2%
    // pra menos é normal e derrubava artigos praticamente prontos (achado real: 4421/4500,
    // 1,8% abaixo). Tolerância de 10% no GATE DE PUBLICAÇÃO — MIN_ARTICLE_WORDS continua
    // intocado como alvo passado ao modelo (isValidStructure/prompt de estrutura), só o piso
    // de aceitar-e-publicar fica mais realista.
    const PUBLISH_WORD_COUNT_TOLERANCE = 0.9;
    const minPublishableWords = Math.floor(MIN_ARTICLE_WORDS * PUBLISH_WORD_COUNT_TOLERANCE);
    const finalWordCount = countArticleWords(finalContentWithCtas);
    if (finalWordCount < minPublishableWords) {
      throw new Error(`article_below_${minPublishableWords}_words:${finalWordCount}`);
    }

    // 4. Salvar artigo (com collision handling interno)
    const finalSlug = await insertArticle({
      slug: article.slug,
      title: article.title,
      page_title: article.page_title ?? null,
      meta_desc: article.meta_desc,
      content: finalContentWithCtas,
      cover_url: coverUrl,
      cover_alt: article.cover_alt ?? null,
      keyword,
      category: article.category ?? null,
    });

    // 5. Log de sucesso — feito IMEDIATAMENTE após insert do artigo.
    // Crítico: se o revalidatePath abaixo falhar, o log já existe e o próximo
    // cron run verá 'success' e não vai duplicar o artigo.
    await insertRunLog({ keyword, status: 'success' });

    // 5.5. Marca a pauta como publicada (no-op se a keyword veio do seed)
    await markPublished(kw, finalSlug);

    // 6. Revalidar páginas ISR — inclui a categoria do artigo novo (senão fica 1h stale)
    revalidatePath('/blog');
    revalidatePath(`/blog/${finalSlug}`);
    revalidatePath('/sitemap.xml');
    if (article.category) revalidatePath(`/categoria/${article.category}`);

    // 7. Divulgação pós-publish: plugs ativos do perfil (falha de canal não derruba o pipeline)
    const distConfig = AUTOBLOG_PROFILE.integrations.distribution;
    if (distConfig.enabled && distConfig.channels.length > 0) {
      try {
        const results = await distributeArticle(
          buildDistributionArticle({
            title: article.title,
            pageTitle: article.page_title ?? null,
            slug: finalSlug,
            metaDesc: article.meta_desc,
            keyword: kw,
          }),
          [...distConfig.channels],
        );
        for (const result of results) {
          if (!result.ok) {
            console.warn(`[blog/generate] Divulgação '${result.channel}' falhou:`, result.error);
          }
        }
      } catch (err) {
        console.warn('[blog/generate] Divulgação indisponível:', err);
      }
    }

    if (warnings.length) {
      console.warn('[blog/generate] Publicado com ressalvas do checklist:', warnings);
    }

    return NextResponse.json({ success: true, slug: finalSlug, warnings });
  };

  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  const pipelineDeadline = new Promise<never>((_, reject) => {
    deadlineTimer = setTimeout(() => reject(new PipelineDeadlineError()), PIPELINE_DEADLINE_MS);
  });

  try {
    // Promise.race não cancela o perdedor: se o deadline vencer, runPipeline() segue rodando
    // em segundo plano até a Vercel matar o processo em maxDuration — mas como o RPC de
    // insertRunLog só atualiza linhas com status='running' (coesa_blog_insert_run_log), a
    // escrita de erro abaixo já muda o status e qualquer insertRunLog tardio do runPipeline
    // abandonado vira no-op (0 linhas afetadas), nunca sobrescreve nem duplica o veredito.
    return await Promise.race([runPipeline(), pipelineDeadline]);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[blog/generate] Pipeline falhou:', errorMsg);

    await insertRunLog({
      keyword,
      status: 'error',
      error: errorMsg,
    }).catch(() => {}); // não deixar o log falhar silenciar o erro principal

    return NextResponse.json({ error: errorMsg }, { status: 500 });
  } finally {
    clearTimeout(deadlineTimer);
  }
}
