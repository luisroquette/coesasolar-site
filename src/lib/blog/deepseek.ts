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

function parseResponse(text: string): ArticleContent | null {
  try {
    const cleaned = text
      .replace(/^```(?:json)?\n?/m, '')
      .replace(/\n?```$/m, '')
      .trim();
    const parsed = JSON.parse(cleaned);
    if (!parsed.title || !parsed.slug || !parsed.content) return null;
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
  const client = new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: 'https://api.deepseek.com/v1',
  });

  for (let attempt = 1; attempt <= 2; attempt++) {
    const response = await client.chat.completions.create({
      model: 'deepseek-chat',
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
    const text = await askDeepseek(SYSTEM_PROMPT, user);
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
  const norm = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return (
    outline.h2s.length >= 4 &&
    outline.h2s.length <= 6 &&
    norm(outline.title).includes(norm(keyword))
  );
}

async function askDeepseek(system: string, user: string): Promise<string> {
  const client = new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: 'https://api.deepseek.com/v1',
  });
  const response = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0.7,
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
