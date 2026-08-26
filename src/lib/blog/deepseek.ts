// src/lib/blog/deepseek.ts
import OpenAI from 'openai';
import { AUTOBLOG_PROFILE } from '@/lib/autoblog-profile';
import { buildEditorialBriefSection, type EditorialBrief } from '@/lib/blog/editorial-calendar';
import type { JudgeIssue } from '@/lib/blog/quality-gate';

export interface ArticleContent {
  title: string;
  page_title?: string | null;
  slug: string;
  meta_desc: string;
  image_prompt: string;
  cover_alt?: string | null;
  category?: string | null;
  content: string;
}

const { brand, editorial, cta } = AUTOBLOG_PROFILE;

const SYSTEM_PROMPT = `Você redige blogposts para ${brand.name} (${brand.siteUrl}),
${editorial.businessDescription}. Público: ${editorial.audience}. Escreva em português brasileiro.

## PERSONA (para quem você escreve)
${editorial.persona}
Use exemplos do cotidiano dessa persona e escreva como quem entende o dia a dia dela.

## TOM DE VOZ
${editorial.tone}

## UMA ÚNICA GRANDE IDEIA
Antes de escrever, defina internamente UMA ideia central que o artigo defende do início
ao fim. Cada H2, exemplo e o fechamento reforçam essa única ideia — nada de tópicos soltos.

## FORMATO DO ARTIGO (escolha pelo tipo da keyword)
- Keyword "como fazer X" → guia passo a passo, seções em ordem de execução.
- Keyword de comparação ("X vs Y", "melhor X") → comparativo, com tabela markdown.
- Keyword de lista ("N dicas/erros/ferramentas") → post em lista numerada.
- Keyword de pergunta ("o que é", "por que", "quando") → resposta direta + FAQ;
  use H2s em forma de pergunta (PAA).
- Informacional amplo → guia definitivo, denso e completo.

## ESTRUTURA OBRIGATÓRIA
1. H1 com a keyword nas PRIMEIRAS palavras (máx 60 chars). Promessa concreta, não
   rótulo genérico — "Guia sobre X" é fraco, "Como Resolver X sem Y" é forte.
2. LEAD em exatamente 3 parágrafos:
   - Parágrafo 1: a keyword aparece já na primeira frase. Abra com UM destes gatilhos,
     priorizando impacto EMOCIONAL (emoção vende mais que razão): estatística
     surpreendente, pergunta direta, analogia, citação de autoridade, micro-história
     real, ou frase polêmica. Responda o essencial do lead jornalístico já no 1º
     parágrafo (o quê, quem, quando, onde, por quê, como — quantas couberem).
     NUNCA começar com "Neste artigo…"
   - Parágrafo 2: por que o problema importa AGORA (mercado, regulação, tendência)
   - Parágrafo 3: promessa explícita do artigo
3. 4 a 6 H2s com keyword/variações semânticas em ≥ 2 deles. HIERARQUIA: H2 é um
   bloco novo de assunto; se dentro dele houver subdivisão, use H3 (e H4 se o H3
   subdividir de novo); ao abrir um bloco novo não relacionado, volte para H2 —
   nunca gere tudo como H2 plano quando o conteúdo tem subitens naturais.
4. Parágrafos máx 4 linhas. Uma ideia por parágrafo.
5. Ao menos 1 link externo para uma fonte real e reconhecível (nunca inventar
   URL — se não tiver certeza de que o domínio/artigo existe, omita).
6. FECHAMENTO: recapitular a grande ideia em 1-2 frases, ANTECIPAR a principal
   objeção da persona e respondê-la, e terminar no CTA final com link de contato.

## CITAÇÕES (autoridade + quebra de ritmo)
- Inclua 1-2 citações durante o texto em blockquote markdown (linha iniciada com ">"),
  cada uma com no máximo 3 parágrafos curtos, SEMPRE com a fonte atribuída
  (nome real + veículo/cargo — nunca inventar pessoas nem frases; se não tiver
  certeza da atribuição, prefira paráfrase com fonte de dado citada no texto).
- Posicione a primeira citação após o 2º ou 3º bloco de conteúdo.

## EM RESUMO (box citável para IAs — GEO)
- H2 fixo "## Em resumo" imediatamente ANTES do fechamento, com 3 a 5 bullets.
- Cada bullet é auto-contido: 1-2 frases que entregam a ideia por completo, sem
  depender do resto do artigo — é o trecho que ferramentas de IA citam como resposta.

## RESPOSTA DIRETA (GEO)
- Logo após o lead, um parágrafo que responde por completo à pergunta central da
  keyword, auto-contido: quem (ou qual IA) ler SÓ esse parágrafo entende o essencial
  e a posição do artigo.

## REGRAS
- Mínimo 2 sinais de E-E-A-T: experiência prática, dado de mercado com fonte,
  norma técnica, ou posicionamento honesto (reconhecer limitações quando verdadeiro).
- Dados concretos > percentuais vagos: "R$ 3.200/mês" em vez de "até 40%".
- Storytelling: ilustre pelo menos 1 conceito com exemplo concreto da rotina da persona.
- Tabela markdown quando comparar opções, preços ou critérios (nunca tabela de 1 coluna).
- SIMPLIFICAÇÃO VISUAL: parágrafo é exceção, lista é regra. Use e abuse de bullets,
  listas numeradas e tabelas sempre que o conteúdo permitir. Processos (passos,
  decisões, fluxos) viram FLUXOGRAMA EM TEXTO: lista numerada com setas "→" entre as
  etapas, ou tabela de fluxo com colunas "Etapa | O que fazer | Resultado".
- Vídeo: quando um vídeo de fonte confiável ajudar o leitor, inclua o link do YouTube ou
  Vimeo em LINHA PRÓPRIA (no site vira embed). Nunca invente URL de vídeo.
- Vocabulário proibido: "solução inovadora", "cada vez mais", "é importante ressaltar",
  "de acordo com especialistas", "no contexto atual", "vários"/"alguns" sem número.

## TEMPLATE DO CTA FINAL
Recapitular o problema em 1 frase. Mencionar que ${brand.name} pode ajudar dentro do seu escopo.
Convidar para ação de baixo atrito: "${cta.buttonLabel}" com link ${cta.url}.`;

export interface InternalLink {
  label: string;
  url: string;
}

function buildInternalLinksSection(links: InternalLink[]): string {
  if (links.length === 0) return 'Nenhum link interno configurado; não invente URLs.';
  return links.map(link => `- [${link.label}](${link.url})`).join('\n');
}

// ---- Estrutura por seção (padrão cfgauss, checklist do dono 25/08/2026) ----
// Substitui o pedido de artigo INTEIRO numa chamada só (generateArticle acima) por: 1 chamada
// pequena pra ESTRUTURA (títulos de seção + briefs + metas de palavras + prompt de imagem) e
// depois 1 chamada por SEÇÃO (writeSection, abaixo) — evita o risco de truncamento silencioso
// que um artigo de 4.500+ palavras numa resposta só correria (nem generateArticle nem
// regenerateWithFeedback definem max_tokens, dependendo do default da API).

export interface ArticleSection {
  h2: string;
  content_brief: string;
  word_target: number;
  image_prompt: string;
}

export interface ArticleFaqItem {
  question: string;
  answer: string;
}

export interface ArticleStructure {
  title: string;
  page_title: string | null;
  slug: string;
  meta_desc: string;
  cover_image_prompt: string;
  cover_alt: string | null;
  category: string | null;
  sections: ArticleSection[];
  faq: ArticleFaqItem[];
  summary_bullets: string[];
}

// Alvo do checklist do dono (25/08/2026): mínimo 4.500 palavras totais, 7-9 seções H2 de
// 400-700 palavras cada, FAQ com exatamente 7 perguntas de 100-150 palavras. Mesmos números
// do padrão cfgauss.com.br/blog.
export const MIN_SECTIONS = 7;
export const MAX_SECTIONS = 9;
export const FAQ_COUNT = 7;

const STRUCTURE_SYSTEM_PROMPT = `Você é um estrategista de conteúdo SEO para ${brand.name} (${brand.siteUrl}),
${editorial.businessDescription}. Público: ${editorial.audience}.

Gere a ESTRUTURA de um artigo (não o texto completo). Retorne SOMENTE JSON válido:

{
  "title": "Título H1 com a keyword nas primeiras palavras (máx 60 chars), promessa concreta",
  "page_title": "Título para aba/Google (máx 60 chars, keyword no início)",
  "slug": "slug-kebab-case-com-a-keyword-max-6-palavras-sem-artigos",
  "meta_desc": "Keyword + ganho concreto do clique (máx 155 chars, sem ponto final)",
  "cover_image_prompt": "Cena fotorrealista em inglês, sem texto na imagem, sem logos, high quality, 4k",
  "cover_alt": "Frase curta em PT-BR descrevendo a cena da capa, com a keyword",
  "category": "slug de UMA categoria da lista fornecida",
  "sections": [
    {
      "h2": "Título da seção (H2)",
      "content_brief": "Instrução CURTA de 60-90 palavras para o redator: quais pontos cobrir, 1 exemplo prático da persona, tom.",
      "word_target": 550,
      "image_prompt": "Cena fotorrealista em inglês para esta seção, sem texto, sem logos"
    }
  ],
  "faq": [
    { "question": "Pergunta frequente sobre o tema?", "answer": "Resposta CURTA e completa de 50-80 palavras." }
  ],
  "summary_bullets": ["Bullet auto-contido 1", "Bullet auto-contido 2", "Bullet auto-contido 3"]
}

REGRAS OBRIGATÓRIAS:
- Entre ${MIN_SECTIONS} e ${MAX_SECTIONS} seções H2, cada uma sobre um aspecto distinto do tema (sem sobreposição).
- word_target por seção: 400-700 (soma total mínima 4.500 palavras) — este número é o alvo do REDATOR
  na próxima etapa; content_brief em si fica CURTO (60-90 palavras), é só a instrução, não o texto final.
- Exatamente ${FAQ_COUNT} perguntas no FAQ, cada resposta CURTA (50-80 palavras) — objetiva, sem enrolação.
- summary_bullets: 3 a 5 frases CURTAS, cada uma auto-contida (entrega a ideia sozinha, sem depender
  do resto do artigo) — vira o box "Em resumo" citável por IA de busca.
- cover_image_prompt e image_prompt de cada seção sempre em inglês, fotorrealista, sem texto/logo.
- Manter a persona, tom e vocabulário proibido do prompt de redação do ${brand.name}.
- Seja DIRETO: esta etapa é só planejamento, não é o artigo final. Não elabore demais.`;

function buildStructureUserPrompt(keyword: string, internalLinks: InternalLink[], brief: EditorialBrief | null): string {
  const categories = AUTOBLOG_PROFILE.editorial.categories.map(c => `- ${c.slug} (${c.label})`).join('\n');
  return `Planeje a estrutura de um artigo SEO completo sobre "${keyword}".

${buildEditorialBriefSection(brief)}
## CATEGORIA (escolha UMA da lista — retorne o slug)
${categories}

## LINKS INTERNOS DISPONÍVEIS (para orientar o conteúdo das seções, não citar URL aqui)
${buildInternalLinksSection(internalLinks)}

Retorne SOMENTE o JSON da estrutura.`;
}

export function parseStructure(text: string): ArticleStructure | null {
  try {
    const cleaned = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
    return JSON.parse(cleaned) as ArticleStructure;
  } catch {
    return null;
  }
}

/** Normaliza texto para casar keyword: minúsculas, sem acentos e SEM pontuação.
 *  REGRESSÃO 26/08/2026: a comparação contígua estrita reprovava títulos SEO naturais
 *  que separam a keyword com pontuação — ex. "Geração Distribuída Compartilhada: Vale a
 *  Pena?" (o ":" entre "compartilhada" e "vale" quebrava o `includes`) e o pipeline
 *  ficava preso no seed sem publicar. A keyword continua precisando aparecer na ordem;
 *  só o sinal gráfico deixa de reprovar. */
export function normalizeKeywordText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isValidStructure(s: ArticleStructure, keyword: string): boolean {
  return (
    !!s?.title && normalizeKeywordText(s.title).includes(normalizeKeywordText(keyword)) &&
    !!s.slug && !!s.meta_desc && !!s.cover_image_prompt &&
    Array.isArray(s.sections) && s.sections.length >= MIN_SECTIONS && s.sections.length <= MAX_SECTIONS &&
    s.sections.every(sec => !!sec.h2 && !!sec.content_brief && !!sec.image_prompt && sec.word_target >= 400 && sec.word_target <= 700) &&
    Array.isArray(s.faq) && s.faq.length === FAQ_COUNT &&
    s.faq.every(f => !!f.question && !!f.answer) &&
    Array.isArray(s.summary_bullets) && s.summary_bullets.length >= 3 && s.summary_bullets.length <= 5 &&
    s.summary_bullets.every(b => !!b)
  );
}

// Teto de saída da estrutura. ACHADO 25/08/2026 (teste E2E em produção): deepseek-v4-flash
// é modelo de raciocínio — parte do max_tokens vai pro campo interno reasoning_content,
// nunca aparece em `content` (reference_deepseek_v4_reasoning_gotchas.md, item 2-3). 8000
// deu content vazio; 24000 (sem streaming) deu erro de conexão "terminated" — provável
// timeout de rede no meio de uma resposta muito longa aberta sem stream. 12000 é o meio
// termo: 4x o valor que deu vazio, sem esticar a conexão o bastante pra derrubar de novo.
const STRUCTURE_MAX_TOKENS = 12000;

export async function generateArticleStructure(
  keyword: string,
  internalLinks: InternalLink[] = [],
  brief: EditorialBrief | null = null,
): Promise<ArticleStructure> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const tAttempt = Date.now();
    // REGRESSÃO 26/08/2026: a 2ª tentativa repetia o MESMO prompt e, quando o defeito
    // era determinístico (ex.: título sem a keyword exata), falhava do mesmo jeito. A
    // re-tentativa agora recebe o motivo do fracasso pra corrigir em vez de repetir o erro.
    const retryHint =
      attempt === 1
        ? ''
        : `\n\nATENÇÃO: a tentativa anterior foi rejeitada. O campo "title" DEVE conter a keyword EXATA "${keyword}" nas primeiras palavras, com a ordem preservada (a pontuação pode separar as palavras). Retorne SOMENTE o JSON válido da estrutura, sem texto ao redor.`;
    const text = await askDeepseek(
      STRUCTURE_SYSTEM_PROMPT,
      buildStructureUserPrompt(keyword, internalLinks, brief) + retryHint,
      STRUCTURE_MAX_TOKENS,
    );
    console.warn(`[deepseek] tentativa ${attempt} de estrutura levou ${Math.round((Date.now() - tAttempt) / 1000)}s`);
    const structure = parseStructure(text);
    if (structure && isValidStructure(structure, keyword)) return structure;
    if (attempt === 2) break;
    console.warn(`[deepseek] Estrutura inválida na tentativa ${attempt}. Retentando...`);
  }
  throw new Error('deepseek_structure_failed');
}

// Chamada por SEÇÃO — nunca o artigo inteiro numa resposta só. generateArticle/
// regenerateWithFeedback não definem max_tokens, dependendo do default da API — viável pra
// 1500-2500 palavras, arriscado pra 4500+ (resposta truncada quebra o JSON.parse silenciosamente).
// max_tokens aqui é EXPLÍCITO e generoso: ~2.2 tokens por palavra em PT-BR + margem de
// headroom pro reasoning_content do deepseek-v4-flash (mesma armadilha do achado 25/08/2026
// em STRUCTURE_MAX_TOKENS — margem pequena deixa o raciocínio comer o teto inteiro e o
// `content` volta vazio, HTTP 200, sem erro).
function maxTokensForSection(wordTarget: number): number {
  return Math.ceil(wordTarget * 2.2) + 3000;
}

const SECTION_SYSTEM_PROMPT = `Você redige UMA SEÇÃO de um blogpost para ${brand.name} (${brand.siteUrl}).
${editorial.businessDescription}. Público: ${editorial.audience}. Português brasileiro.
Persona: ${editorial.persona}. Tom: ${editorial.tone}.

Escreva SOMENTE o corpo desta seção em markdown — SEM o título H2 (será adicionado por fora),
SEM front-matter, SEM comentários. Regras:
- Parágrafos máx 4 linhas, uma ideia por parágrafo.
- Bullets/listas e tabelas markdown quando o conteúdo permitir (simplificação visual).
- Dados concretos > percentuais vagos ("R$ 3.200/mês" em vez de "até 40%").
- Vocabulário proibido: "solução inovadora", "cada vez mais", "é importante ressaltar",
  "de acordo com especialistas", "no contexto atual", "vários"/"alguns" sem número.
- ZERO markdown de imagem (sem ![]()) — a imagem é inserida por fora.
- Se a instrução abaixo pedir link interno/externo, citação em blockquote (">") ou CTA de
  fechamento, siga literalmente — cada seção só recebe essa obrigação quando é a responsável
  por ela (nem toda seção tem).`;

export async function writeSection(
  keyword: string,
  section: ArticleSection,
  sectionIndex: number,
  totalSections: number,
): Promise<string> {
  const client = new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: 'https://api.deepseek.com/v1',
    timeout: 90_000,
    maxRetries: 1,
  });
  const user = `Tema geral do artigo: "${keyword}" (seção ${sectionIndex + 1} de ${totalSections}).
Título desta seção (H2): ${section.h2}
Instrução: ${section.content_brief}
Alvo: ${section.word_target} palavras (não conte, escreva naturalmente até cobrir o brief).`;

  // ACHADO 25/08/2026 (teste E2E real): 1 de 8 seções voltou vazia (mesma armadilha de
  // reasoning_content do deepseek-v4-flash, ver reference_deepseek_v4_reasoning_gotchas.md) —
  // sem retry, essa seção publicava com H2 e nenhum corpo. 2 tentativas (mesmo padrão de
  // generateArticleStructure/generateArticle), nunca lança — retorna vazio no pior caso, o
  // pipeline segue publicável (mesmo contrato de antes).
  for (let attempt = 1; attempt <= 2; attempt++) {
    const response = await client.chat.completions.create({
      model: 'deepseek-v4-flash',
      messages: [
        { role: 'system', content: SECTION_SYSTEM_PROMPT },
        { role: 'user', content: user },
      ],
      temperature: 0.7,
      max_tokens: maxTokensForSection(section.word_target),
    });
    const text = response.choices[0]?.message?.content?.trim() ?? '';
    if (text) return text;
    if (attempt === 2) break;
    console.warn(`[deepseek] Seção "${section.h2}" voltou vazia na tentativa ${attempt}. Retentando...`);
  }
  // ACHADO na lapidação (mesmo dia, motor irmão gaussmob-nextjs): sem fallback textual, uma
  // seção que segue vazia nas 2 tentativas publica um H2 seguido de NADA — o mesmo defeito
  // real que o retry acima corrige na maioria dos casos, só que residual. Mesmo padrão já
  // aplicado em generateSection do gaussmob-nextjs (article-generator.ts): cai no content_brief
  // em vez de string vazia — pior que um resumo do brief, nunca é publicar em branco.
  console.warn(`[deepseek] Seção "${section.h2}" voltou vazia nas 2 tentativas — publicando o content_brief como corpo.`);
  return section.content_brief;
}

// ---- Montagem: estrutura + seções + FAQ + slots de imagem -> ArticleContent ----
// A imagem de cada seção só existe DEPOIS do upload (feito por fora, na rota) — o texto é
// montado ANTES disso. Solução: cada seção termina com um placeholder <!-- IMG_SLOT:N -->,
// substituído por injectSectionImages assim que as N imagens já estiverem hospedadas.

/** Monta o markdown final (seções + FAQ) a partir da estrutura e dos corpos já escritos —
 *  extraída para ser reusada por regenerateSectionsWithFeedback (Task 4), que reescreve só
 *  os `bodies` das seções com issue e precisa remontar o mesmo content. */
export function assembleArticleMarkdown(structure: ArticleStructure, bodies: string[]): string {
  const sectionsMd = structure.sections
    .map((s, i) => `## ${s.h2}\n\n${bodies[i]}\n\n<!-- IMG_SLOT:${i} -->`)
    .join('\n\n');

  // Box "Em resumo" (GEO) — validateArticle exige um H2 fixo com ≥3 bullets, ANTES do
  // fechamento (mesmo padrão do motor antigo, checklist regra 15). Vem da estrutura
  // (summary_bullets), nunca gerado por seção — mesmo raciocínio do FAQ.
  const summaryMd = ['## Em resumo', ...structure.summary_bullets.map(b => `- ${b}`)].join('\n');

  const faqMd = [
    '## Perguntas Frequentes',
    ...structure.faq.map(f => `### ${f.question}\n\n${f.answer}`),
  ].join('\n\n');

  return `${sectionsMd}\n\n${summaryMd}\n\n${faqMd}`;
}

/**
 * Injeta as 5 obrigações editoriais (keyword na 1ª frase, link interno, link externo,
 * citação em blockquote, CTA de fechamento) nos content_brief de seções específicas —
 * ACHADO 25/08/2026: pedir pro MODELO decidir e distribuir isso na fase de estrutura
 * inflava o raciocínio (95-105s por tentativa, chegando a truncar o JSON de novo). Fazer
 * isso em código puro é instantâneo, determinístico (nunca depende do modelo lembrar) e
 * não custa nenhum token extra na estrutura. Nunca lança — MIN_SECTIONS=7 garante os
 * índices usados (0,1,2,3,último) sempre existem sem colisão.
 */
export function enrichSectionBriefs(
  sections: ArticleSection[],
  keyword: string,
  internalLinks: InternalLink[],
): ArticleSection[] {
  const enriched = sections.map(s => ({ ...s }));
  if (enriched.length === 0) return enriched;

  enriched[0]!.content_brief = `Abra a primeira frase já citando "${keyword}". ${enriched[0]!.content_brief}`;

  if (internalLinks.length > 0) {
    const idx = Math.min(1, enriched.length - 1);
    const link = internalLinks[0]!;
    enriched[idx]!.content_brief = `${enriched[idx]!.content_brief} Inclua 1 link interno em markdown: [${link.label}](${link.url}).`;
  }

  const extIdx = Math.min(2, enriched.length - 1);
  enriched[extIdx]!.content_brief = `${enriched[extIdx]!.content_brief} Inclua 1 link externo real em markdown pra uma fonte reconhecível sobre o tema — nunca invente URL.`;

  const quoteIdx = Math.min(3, enriched.length - 1);
  enriched[quoteIdx]!.content_brief = `${enriched[quoteIdx]!.content_brief} Inclua 1 citação em blockquote (">") com fonte atribuída real (nome + veículo/cargo) — nunca invente.`;

  const lastIdx = enriched.length - 1;
  enriched[lastIdx]!.content_brief = `${enriched[lastIdx]!.content_brief} Feche com CTA explícito: "${cta.buttonLabel}" com link ${cta.url}.`;

  return enriched;
}

export async function generateArticleWithSections(
  keyword: string,
  internalLinks: InternalLink[] = [],
  brief: EditorialBrief | null = null,
): Promise<ArticleContent & { sectionImagePrompts: string[]; structure: ArticleStructure; bodies: string[] }> {
  const tStructure = Date.now();
  const rawStructure = await generateArticleStructure(keyword, internalLinks, brief);
  console.warn(`[deepseek] estrutura total (com retries) levou ${Math.round((Date.now() - tStructure) / 1000)}s, ${rawStructure.sections.length} seções`);
  const structure: ArticleStructure = {
    ...rawStructure,
    sections: enrichSectionBriefs(rawStructure.sections, keyword, internalLinks),
  };

  // Seções em lotes de 3 (mesmo espírito do "batch de 3" que o cfgauss usa pra geração de
  // imagem — evita rate limit da API do DeepSeek).
  const bodies: string[] = [];
  for (let i = 0; i < structure.sections.length; i += 3) {
    const tBatch = Date.now();
    const batch = structure.sections.slice(i, i + 3);
    const batchBodies = await Promise.all(
      batch.map((s, j) => writeSection(keyword, s, i + j, structure.sections.length))
    );
    console.warn(`[deepseek] lote de seções ${i}-${i + batch.length - 1} levou ${Math.round((Date.now() - tBatch) / 1000)}s`);
    bodies.push(...batchBodies);
  }

  const content = assembleArticleMarkdown(structure, bodies);

  return {
    title: structure.title,
    page_title: structure.page_title,
    slug: structure.slug,
    meta_desc: structure.meta_desc,
    image_prompt: structure.cover_image_prompt, // capa
    cover_alt: structure.cover_alt,
    category: structure.category,
    content,
    sectionImagePrompts: structure.sections.map(s => s.image_prompt),
    structure,
    bodies,
  };
}

/**
 * Regenera SÓ as seções citadas nas issues do quality gate (`i.section` casa com `h2`),
 * remontando o content com assembleArticleMarkdown. Evita reenviar o artigo inteiro numa
 * chamada (o mesmo risco de truncamento que motivou a Task 2) — só a(s) seção(ões) com
 * problema é(são) reescrita(s); as demais ficam intactas. Issue sem seção correspondente
 * na estrutura é ignorada (findIndex -1, filtrado); nenhuma seção acionável = no-op, mesmo
 * contrato de regenerateWithFeedback (nunca lança, sempre devolve algo publicável).
 */
export async function regenerateSectionsWithFeedback(
  keyword: string,
  structure: ArticleStructure,
  currentBodies: string[],
  issues: JudgeIssue[],
): Promise<string[]> {
  const secoesComIssue = new Set(
    issues.map(i => structure.sections.findIndex(s => s.h2 === i.section)).filter(idx => idx >= 0),
  );
  if (secoesComIssue.size === 0) return currentBodies;

  const novos = [...currentBodies];
  for (const idx of secoesComIssue) {
    const fixInstruction = issues
      .filter(i => i.section === structure.sections[idx]!.h2)
      .map(i => i.fix_instruction)
      .join(' ');
    const secaoAjustada: ArticleSection = {
      ...structure.sections[idx]!,
      content_brief: `${structure.sections[idx]!.content_brief}\n\nCORREÇÃO OBRIGATÓRIA: ${fixInstruction}`,
    };
    try {
      novos[idx] = await writeSection(keyword, secaoAjustada, idx, structure.sections.length);
    } catch {
      // mesma filosofia de regenerateWithFeedback: falha na regeneração mantém o
      // conteúdo anterior daquela seção, nunca quebra o pipeline.
    }
  }
  return novos;
}

/** Substitui os placeholders <!-- IMG_SLOT:N --> pelas imagens já geradas/hospedadas.
 *  Slot sem imagem correspondente (upload falhou) é removido — nunca publica placeholder cru. */
export function injectSectionImages(content: string, images: Array<{ url: string; alt: string } | null>): string {
  return content.replace(/<!-- IMG_SLOT:(\d+) -->/g, (_match, idxStr) => {
    const img = images[Number(idxStr)];
    return img ? `![${img.alt}](${img.url})` : '';
  });
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Corrige DETERMINISTICAMENTE (sem chamar o LLM de novo) as issues do checklist on-page
 * que dão pra resolver por concatenação simples de texto — meta_keyword e cover_alt_keyword.
 * ACHADO 25/08/2026: a rota antiga regenerava o ARTIGO INTEIRO quando qualquer issue
 * falhava (mesmo 1 issue pequena) — a 2ª chamada completa (~190s) é cara e arriscava
 * estourar o maxDuration de novo. Issues que este fix não cobre (ex.: citation_blocks)
 * continuam publicando com aviso — nunca inventa conteúdo (citação sem fonte real seria
 * pior que a ausência).
 */
export function fixSimpleValidationIssues<T extends ArticleContent>(
  article: T,
  keyword: string,
  issueRules: string[],
): T {
  const fixed = { ...article };
  if (issueRules.includes('meta_keyword') && !norm(fixed.meta_desc).includes(norm(keyword))) {
    const candidate = `${keyword}: ${fixed.meta_desc}`;
    fixed.meta_desc = candidate.length <= 155 ? candidate : candidate.slice(0, 152).trimEnd() + '...';
  }
  if (issueRules.includes('cover_alt_keyword') && fixed.cover_alt && !norm(fixed.cover_alt).includes(norm(keyword))) {
    fixed.cover_alt = `${fixed.cover_alt} — ${keyword}`;
  }
  return fixed;
}

function buildUserPrompt(
  keyword: string,
  internalLinks: InternalLink[],
  brief: EditorialBrief | null = null,
): string {
  const categories = AUTOBLOG_PROFILE.editorial.categories
    .map(c => `- ${c.slug} (${c.label})`)
    .join('\n');

  return `Escreva um artigo SEO completo sobre "${keyword}" seguindo TODAS as regras do system prompt.

${buildEditorialBriefSection(brief)}
## CATEGORIA DO ARTIGO (escolha UMA da lista — retorne o slug no JSON)
${categories}

## LINKS INTERNOS OBRIGATÓRIOS (âncoras naturais, distribuídas pelo texto)
${buildInternalLinksSection(internalLinks)}

Retorne SOMENTE um JSON válido (sem markdown ao redor, sem texto antes ou depois):
{
  "title": "Título H1 editorial com a keyword nas primeiras palavras (máx 60 chars)",
  "page_title": "Título para a aba do navegador/Google (máx 60 chars, keyword no início) — pode divergir do title se o H1 for mais editorial",
  "slug": "slug-kebab-case-com-a-keyword-max-6-palavras-sem-artigos",
  "meta_desc": "Keyword + resultado concreto que o leitor GANHA ao clicar (máx 155 chars, sem ponto final) — deve convencer o clique, não só descrever",
  "image_prompt": "Cena fotorrealista em inglês para o tema, sem texto na imagem, sem logos, high quality, 4k",
  "cover_alt": "Frase curta em PT-BR descrevendo a cena da capa, com a keyword (o Google lê esse texto)",
  "category": "slug de UMA categoria da lista fornecida",
  "content": "Artigo completo em markdown (1500–2500 palavras)"
}

CHECKLIST interno antes de gerar (valide cada item):
- [ ] Uma única grande ideia sustenta o artigo do início ao fim
- [ ] Formato escolhido combina com o tipo da keyword (guia/comparativo/lista/FAQ)
- [ ] H1 ≤ 60 chars, keyword nas primeiras palavras, promessa concreta (não rótulo genérico)
- [ ] page_title ≤ 60 chars, keyword no início (pode divergir do H1 editorial)
- [ ] Primeira frase do lead contém a keyword e abre com gatilho emocional (estatística/pergunta/analogia/citação/história/polêmica)
- [ ] Lead: exatamente 3 parágrafos (dor → contexto → promessa)
- [ ] Slug contém a keyword
- [ ] Meta description ≤ 155 chars com keyword, sem ponto final, promete o ganho do clique
- [ ] cover_alt: frase curta em PT-BR descrevendo a cena, com a keyword
- [ ] category: slug de UMA categoria da lista fornecida
- [ ] 4 a 6 H2s, keyword ou variação semântica em ≥ 2 deles
- [ ] Hierarquia de headers correta: H3 só dentro de um H2 que ele subdivide, H4 só dentro do H3; bloco novo e não relacionado volta para H2
- [ ] Parágrafos máx 4 linhas
- [ ] Tabela markdown presente quando há comparação de opções
- [ ] Bullets/listas predominam sobre parágrafos (simplificação visual)
- [ ] Processos têm fluxo visível: setas "→" entre etapas ou tabela de fluxo
- [ ] Link de vídeo (YouTube/Vimeo) em linha própria, se usado — nunca URL inventada
- [ ] ≥1 exemplo concreto da rotina da persona (storytelling)
- [ ] Fechamento recapitula a grande ideia, antecipa e responde 1 objeção, e leva ao CTA
- [ ] Mínimo 2 sinais de E-E-A-T presentes
- [ ] Nenhuma palavra do vocabulário proibido
- [ ] Links internos com âncoras naturais distribuídos no texto
- [ ] Ao menos 1 link externo real e relevante (nunca URL inventada; se não tiver certeza, omitir)
- [ ] 1-2 citações em blockquote (linha ">") com fonte real atribuída, primeira após o 2º/3º bloco
- [ ] Parágrafo de resposta direta auto-contido logo após o lead (GEO)
- [ ] H2 "## Em resumo" antes do fechamento com 3-5 bullets auto-contidos (GEO)
- [ ] CTA final com link de contato específico
- [ ] ZERO markdown de imagem no content (sem ![]() )`;
}

// Campos de ArticleContent que são `string` (sem `?`) no tipo — logo obrigatórios em
// runtime. Confirmado varrendo os consumidores downstream (route.ts, validate.ts,
// image-gen.ts): nenhum deles tem `?? fallback`/optional chaining para estes campos.
// Ausência ou string vazia aqui causa bug real: validateArticle chama
// `title.length`/`metaDesc.length`/`content.replace(...)` sem guard (TypeError cru), e
// route.ts interpola `image_prompt` em template literals sem `?.` — se faltar, vira a
// STRING "undefined, wide establishing shot, no text", que passa pelo guard
// `!prompt?.trim()` de generateAndUploadBodyImages (é truthy) e dispara uma chamada paga
// ao gpt-image-1 com prompt lixo. `slug` é usado cru em paths de storage e na URL final.
//
// Os campos com `?` no tipo (page_title, cover_alt, category) SEMPRE têm `?? null` ou
// `if (x)` no ponto de uso — por isso ficam de fora desta lista.
//
//⚠️ Ao adicionar um novo campo SEM `?` em ArticleContent, adicione o nome dele aqui
// também. TS puro não deriva isso do tipo em runtime sem uma lib de schema (zod etc.) —
// esta lista central substitui os `if (!parsed.campo)` soltos que cresciam um por bug.
export const REQUIRED_FIELDS: (keyof ArticleContent)[] = [
  'title',
  'slug',
  'meta_desc',
  'image_prompt',
  'content',
];

function isMissingOrEmpty(value: unknown): boolean {
  return typeof value !== 'string' || value.trim().length === 0;
}

function parseResponse(text: string): ArticleContent | null {
  try {
    const cleaned = text
      .replace(/^```(?:json)?\n?/m, '')
      .replace(/\n?```$/m, '')
      .trim();
    const parsed = JSON.parse(cleaned);
    if (REQUIRED_FIELDS.some(field => isMissingOrEmpty(parsed[field]))) return null;
    return parsed as ArticleContent;
  } catch {
    return null;
  }
}

export async function generateArticle(
  keyword: string,
  internalLinks: InternalLink[] = [],
  brief: EditorialBrief | null = null,
): Promise<ArticleContent> {
  // Timeout explícito: o default do SDK é 10min, bem acima do maxDuration=300s da rota
  // de geração — sem isso, uma chamada travada é morta pelo platform timeout em vez de
  // lançar um erro tratável, e o insertRunLog de erro no catch da rota nunca roda.
  const client = new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: 'https://api.deepseek.com/v1',
    timeout: 90_000,
    maxRetries: 1,
  });

  for (let attempt = 1; attempt <= 2; attempt++) {
    // 'deepseek-v4-flash' é o substituto oficial de 'deepseek-chat' (não-thinking) —
    // a DeepSeek desativou os nomes legados 'deepseek-chat'/'deepseek-reasoner' em
    // 2026-07-24 (anunciado 2026-04-24). Chamar com o nome antigo devolve erro do
    // provider a cada tentativa, quebrando a geração de artigo silenciosamente.
    const response = await client.chat.completions.create({
      model: 'deepseek-v4-flash',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(keyword, internalLinks, brief) },
      ],
      temperature: 0.7,
    });

    const text = response.choices[0]?.message?.content ?? '';
    const parsed = parseResponse(text);
    if (parsed) return parsed;

    if (attempt === 2) break;
    console.warn(`[deepseek] Tentativa ${attempt} retornou JSON inválido. Retentando...`);
  }

  throw new Error('deepseek_json_parse_failed');
}

// ---- Regeneração com feedback do quality gate LLM (src/lib/blog/quality-gate.ts) ----
// Mesmo padrão da regeneração Yoast já existente na rota: reenvia o artigo completo,
// mas aqui com as issues.fix_instruction do judge como instrução extra de correção.

/**
 * Revisa o artigo incorporando o feedback do quality gate LLM (score < 90).
 * Reenvia o artigo completo + os problemas apontados; pede correção pontual,
 * não reescrita do zero. Se a regeneração falhar (JSON inválido nas 2 tentativas),
 * devolve o artigo original — o pipeline nunca quebra por causa do gate.
 */
export async function regenerateWithFeedback(
  article: ArticleContent,
  issues: JudgeIssue[],
): Promise<ArticleContent> {
  const feedback = issues
    .map(i => `- [${i.severity}] (${i.category} — ${i.section}) ${i.problem}\n  Correção: ${i.fix_instruction}`)
    .join('\n');

  const user = `Revise o artigo abaixo corrigindo TODOS os problemas listados no feedback do revisor.
Mantenha tudo que já está bom — não reescreva do zero, apenas corrija o que foi apontado.

## ARTIGO ATUAL (JSON)
${JSON.stringify(article)}

## FEEDBACK DO REVISOR — corrija cada item
${feedback}

Retorne SOMENTE o JSON completo revisado, no MESMO formato do artigo atual (todos os
campos: title, page_title, slug, meta_desc, image_prompt, cover_alt, category, content).
Sem markdown ao redor, sem texto antes ou depois.`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    // askDeepseek pode lançar (timeout do client de 90s, erro de rede) — sem este
    // try/catch, o erro propaga por regenerate() dentro de runQualityGateLoop (que
    // não tem catch próprio) e aborta o pipeline inteiro de publicação, quebrando
    // o contrato documentado acima ("o pipeline nunca quebra por causa do gate").
    let text: string;
    try {
      text = await askDeepseek(SYSTEM_PROMPT, user);
    } catch (err) {
      // return direto (não break): a mensagem genérica abaixo do loop diz "falhou nas 2
      // tentativas", o que seria falso quando o erro de rede interrompe na 1ª tentativa —
      // essa linha já loga a causa real, sem precisar da mensagem genérica de JSON inválido.
      console.warn(`[deepseek] Regeneração com feedback: tentativa ${attempt} falhou (erro de rede/timeout) — mantendo artigo anterior.`, err);
      return article;
    }
    const parsed = parseResponse(text);
    if (parsed) return parsed;
    if (attempt === 2) break;
    console.warn(`[deepseek] Regeneração com feedback: tentativa ${attempt} retornou JSON inválido. Retentando...`);
  }

  console.warn('[deepseek] Regeneração com feedback falhou nas 2 tentativas — mantendo artigo anterior.');
  return article;
}

// ---- Pipeline em 2 etapas (opcional, flag twoStageGenerationEnabled) ----
// RD: "antes de escrever, faça um outline" — planejar evita artigo esparramado.

export interface ArticleOutline {
  title: string;
  h2s: string[];
  angle: string;
}

export function parseOutline(text: string): ArticleOutline | null {
  try {
    const cleaned = text
      .replace(/^```(?:json)?\n?/m, '')
      .replace(/\n?```$/m, '')
      .trim();
    const parsed = JSON.parse(cleaned);
    if (!parsed.title || !Array.isArray(parsed.h2s) || parsed.h2s.length === 0) return null;
    return parsed as ArticleOutline;
  } catch {
    return null;
  }
}

/** 4 a 6 H2s e keyword no título — o outline só vale se passa daqui. */
export function isValidOutline(outline: ArticleOutline, keyword: string): boolean {
  return (
    outline.h2s.length >= 4 &&
    outline.h2s.length <= 6 &&
    normalizeKeywordText(outline.title).includes(normalizeKeywordText(keyword))
  );
}

async function askDeepseek(system: string, user: string, maxTokens?: number): Promise<string> {
  // Mesmo motivo do timeout em generateArticle: default do SDK (10min) excede o
  // maxDuration da rota (300s) e mascara falhas de rede como platform kill sem log.
  // 150s (não 90s) quando maxTokens é passado (generateArticleStructure): achado 25/08/2026
  // — 90s cortava a conexão no meio de uma resposta de raciocínio longa antes dela terminar
  // (erro "terminated" do Undici), mesmo dentro do maxDuration=300s da rota.
  const client = new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: 'https://api.deepseek.com/v1',
    timeout: maxTokens !== undefined ? 150_000 : 90_000,
    maxRetries: 1,
  });
  // Mesmo motivo do comentário em generateArticle: 'deepseek-v4-flash' substitui o
  // nome legado 'deepseek-chat', desativado pela DeepSeek em 2026-07-24.
  // maxTokens é opcional (undefined preserva o comportamento antigo de generateArticleOutline/
  // regenerateWithFeedback) — generateArticleStructure passa um valor explícito porque a
  // estrutura (9 seções + 7 FAQs) é grande o bastante pra correr o MESMO risco de
  // truncamento silencioso que motivou max_tokens explícito em writeSection (Task 2).
  const response = await client.chat.completions.create({
    model: 'deepseek-v4-flash',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0.7,
    ...(maxTokens !== undefined ? { max_tokens: maxTokens } : {}),
  });
  return response.choices[0]?.message?.content ?? '';
}

const OUTLINE_SYSTEM = `Você planeja artigos de blog em português brasileiro para ${brand.name}.
Persona: ${editorial.persona}
Retorne SOMENTE um JSON válido (sem markdown ao redor):
{
  "title": "Título com a keyword nas primeiras palavras (máx 60 chars)",
  "h2s": ["H2 1", "H2 2", "H2 3", "H2 4", "H2 5"],
  "angle": "A grande ideia única do artigo em 1 frase"
}
Regras: 4 a 6 H2s, keyword ou variação em ≥ 2 deles, hierarquia pensada em blocos
(H3 subdivide um H2; bloco novo volta a H2), a grande ideia guia tudo.`;

export async function generateArticleOutline(keyword: string): Promise<ArticleOutline> {
  const user = `Planeje o outline do artigo sobre "${keyword}".
Use H2s em forma de pergunta quando a keyword for uma pergunta (formato FAQ).
Retorne somente o JSON.`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const text = await askDeepseek(OUTLINE_SYSTEM, user);
    const outline = parseOutline(text);
    if (outline && isValidOutline(outline, keyword)) return outline;
    if (attempt === 2) break;
    console.warn(`[deepseek] Outline inválido na tentativa ${attempt}. Retentando...`);
  }

  throw new Error('deepseek_outline_failed');
}

export async function generateArticleFromOutline(
  keyword: string,
  outline: ArticleOutline,
  internalLinks: InternalLink[] = [],
  brief: EditorialBrief | null = null,
): Promise<ArticleContent> {
  const outlineText = [
    `Título: ${outline.title}`,
    `Grande ideia: ${outline.angle}`,
    'H2s obrigatórios (nesta ordem):',
    ...outline.h2s.map(h => `- ${h}`),
  ].join('\n');

  const user = `${buildUserPrompt(keyword, internalLinks, brief)}

## OUTLINE VALIDADO — siga esta estrutura EXATAMENTE (não invente outros H2s)
${outlineText}

## EXCEÇÃO OBRIGATÓRIA: além dos H2s do outline, inclua SEMPRE o H2 fixo
"## Em resumo" com 3-5 bullets auto-contidos, imediatamente antes do fechamento
(regra do system prompt — o outline não lista esse H2, mas ele é obrigatório).`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const text = await askDeepseek(SYSTEM_PROMPT, user);
    const parsed = parseResponse(text);
    if (parsed) return parsed;
    if (attempt === 2) break;
    console.warn(`[deepseek] Tentativa ${attempt} retornou JSON inválido. Retentando...`);
  }

  throw new Error('deepseek_json_parse_failed');
}
