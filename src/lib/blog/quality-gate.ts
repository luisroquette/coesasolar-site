// src/lib/blog/quality-gate.ts
// GATE de validação por LLM (score 0-100, 5 categorias) — roda DEPOIS do checklist
// Yoast-style (validate.ts) e ANTES de insertArticle. Precisa acontecer 100% em
// memória porque a RPC coesa_blog_insert_article não aceita p_status (sempre
// insere como published) — não há como marcar um artigo como "draft" no banco hoje.
//
// Fail-open obrigatório: sem DEEPSEEK_API_KEY, resposta sem texto, ou JSON
// malformado → { skipped: true, score: null }, sem lançar erro. O pipeline
// sempre segue publicando, mesmo se o gate não puder rodar.

import OpenAI from 'openai';

export type JudgeSeverity = 'P0' | 'P1' | 'P2';

export interface JudgeIssue {
  severity: JudgeSeverity;
  category: string;
  section: string;
  problem: string;
  fix_instruction: string;
}

export interface JudgeCategories {
  content_quality: number;
  seo: number;
  eeat: number;
  technical: number;
  geo: number;
}

export interface JudgeResult {
  total_score: number;
  categories: JudgeCategories;
  issues: JudgeIssue[];
}

export interface QualityGateResult {
  skipped: boolean;
  score: number | null;
  issues: JudgeIssue[];
  categories: JudgeCategories | null;
}

const JUDGE_SYSTEM_PROMPT = `Você é um editor sênior avaliando um artigo de blog já pronto,
prestes a ser publicado. Julgue com rigor — o objetivo é pegar o que passou pelo checklist
estrutural automático mas ainda tem problema de qualidade real.

Pontue de 0 a 100, dividido em 5 categorias (o total_score é a soma exata das 5):

1. Qualidade de conteúdo (0-30): profundidade real, clareza, originalidade, ZERO clichês
   de IA ("é importante ressaltar", "no cenário atual", "cada vez mais", "solução inovadora",
   "vários"/"alguns" sem número), argumentação sólida, sem redundância.
2. SEO (0-25): qualidade REAL da otimização — não apenas presença mecânica da keyword, mas
   naturalidade do texto, intenção de busca atendida, estrutura de headings que ajuda o
   leitor e o rastreador ao mesmo tempo.
3. E-E-A-T (0-15): fontes e citações REAIS e verificáveis (nunca invented), sinais de
   experiência prática concreta, honestidade sobre limitações quando cabível — não apenas
   menção genérica a "especialistas".
4. Técnico (0-15): estrutura/schema implícito coerente, alt text presente e descritivo,
   markdown limpo (sem HTML solto, sem markdown quebrado, sem headings fora de hierarquia).
5. GEO/citabilidade (0-15): box "Em resumo" com bullets auto-contidos, parágrafos que
   respondem por completo sem depender do resto do artigo — trecho citável isoladamente
   por uma IA de busca.

Para cada problema real encontrado, gere um item em "issues" com severidade:
- "P0": bloqueia publicação (erro factual, clichê óbvio de IA, alucinação, fonte inventada)
- "P1": importante mas não bloqueante (fraqueza estrutural, falta de profundidade)
- "P2": menor (polimento, nuance de estilo)

Responda SOMENTE com um JSON válido (sem markdown ao redor, sem texto antes ou depois),
exatamente neste formato:
{
  "total_score": <número 0-100>,
  "categories": {
    "content_quality": <número 0-30>,
    "seo": <número 0-25>,
    "eeat": <número 0-15>,
    "technical": <número 0-15>,
    "geo": <número 0-15>
  },
  "issues": [
    {
      "severity": "P0" | "P1" | "P2",
      "category": "content_quality" | "seo" | "eeat" | "technical" | "geo",
      "section": "<onde no artigo o problema está>",
      "problem": "<o que está errado, especificamente>",
      "fix_instruction": "<instrução objetiva e acionável para corrigir>"
    }
  ]
}`;

function parseJudgeResult(raw: string): JudgeResult | null {
  try {
    const cleaned = raw
      .replace(/^```(?:json)?\n?/m, '')
      .replace(/\n?```$/m, '')
      .trim();
    const parsed = JSON.parse(cleaned);

    if (typeof parsed.total_score !== 'number') return null;

    const c = parsed.categories;
    if (
      !c ||
      typeof c.content_quality !== 'number' ||
      typeof c.seo !== 'number' ||
      typeof c.eeat !== 'number' ||
      typeof c.technical !== 'number' ||
      typeof c.geo !== 'number'
    ) {
      return null;
    }

    if (!Array.isArray(parsed.issues)) return null;

    return {
      total_score: parsed.total_score,
      categories: {
        content_quality: c.content_quality,
        seo: c.seo,
        eeat: c.eeat,
        technical: c.technical,
        geo: c.geo,
      },
      issues: parsed.issues,
    };
  } catch {
    return null;
  }
}

/**
 * Roda o gate de qualidade por LLM sobre o artigo final (título + meta + corpo com
 * CTAs já injetados). Fail-open: qualquer falha (sem API key, resposta sem texto,
 * JSON malformado, erro de rede) devolve { skipped: true, score: null } sem lançar
 * — o pipeline sempre segue publicando.
 */
export async function runQualityGate(articleContent: string): Promise<QualityGateResult> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    console.warn('[quality-gate] DEEPSEEK_API_KEY não configurada — gate pulado (fail-open).');
    return { skipped: true, score: null, issues: [], categories: null };
  }

  try {
    const client = new OpenAI({ apiKey, baseURL: 'https://api.deepseek.com/v1' });
    const response = await client.chat.completions.create({
      model: 'deepseek-v4-pro',
      messages: [
        { role: 'system', content: JUDGE_SYSTEM_PROMPT },
        { role: 'user', content: articleContent },
      ],
      max_tokens: 2000,
    });

    const text = response.choices[0]?.message?.content ?? '';
    if (!text) {
      console.warn('[quality-gate] Resposta do judge sem bloco de texto — gate pulado (fail-open).');
      return { skipped: true, score: null, issues: [], categories: null };
    }

    const judged = parseJudgeResult(text);
    if (!judged) {
      console.warn('[quality-gate] JSON do judge malformado — gate pulado (fail-open).');
      return { skipped: true, score: null, issues: [], categories: null };
    }

    return {
      skipped: false,
      score: judged.total_score,
      issues: judged.issues,
      categories: judged.categories,
    };
  } catch (err) {
    console.warn('[quality-gate] Chamada ao judge falhou — gate pulado (fail-open):', err);
    return { skipped: true, score: null, issues: [], categories: null };
  }
}

export interface QualityGateLoopResult<T> {
  content: T;
  judged: QualityGateResult;
  attempts: number;
}

/**
 * Roda o gate e, se score < 90, regenera até `maxAttempts` vezes via `regenerate`.
 * Publica de qualquer forma ao final — mesmo se o score continuar abaixo de 90 após
 * esgotar as tentativas (o gate nunca bloqueia o pipeline, só tenta melhorar).
 * `T` é decidido pelo chamador (ex.: ArticleContent + markdown com CTAs já injetados);
 * `buildInput` extrai o texto a julgar a partir do conteúdo atual.
 */
export async function runQualityGateLoop<T>(
  initial: T,
  buildInput: (content: T) => string,
  regenerate: (content: T, issues: JudgeIssue[]) => Promise<T>,
  maxAttempts = 2,
): Promise<QualityGateLoopResult<T>> {
  let content = initial;
  let attempts = 0;
  let judged = await runQualityGate(buildInput(content));

  while (!judged.skipped && judged.score !== null && judged.score < 90 && attempts < maxAttempts) {
    attempts++;
    content = await regenerate(content, judged.issues);
    judged = await runQualityGate(buildInput(content));
  }

  return { content, judged, attempts };
}
