# Motor do coesasolar.com.br/blog → padrão cfgauss (checklist 25/08) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unificar o motor de artigos do coesasolar.com.br/blog ao padrão do cfgauss.com.br/blog (checklist do dono, 25/08/2026): mínimo 4.500 palavras (7-9 seções H2, 400-700 cada), 1 capa + 1 imagem por seção (8-10 imagens/artigo), FAQ com 7 perguntas (100-150 palavras cada).

**Architecture:** O gerador atual do coesasolar (`lib/blog/deepseek.ts::generateArticle`) pede o artigo INTEIRO em **uma única chamada** ao DeepSeek, sem `max_tokens` explícito — viável pra 1.500-2.500 palavras, mas arriscado pra 4.500+ (achado da investigação: nem essa chamada nem `regenerateWithFeedback` limitam `max_tokens`, dependendo do default da API; um artigo 3x maior em uma resposta só é candidato real a truncamento silencioso, que quebra o `JSON.parse`). O cfgauss NÃO gera o artigo inteiro numa chamada: gera uma ESTRUTURA (títulos de seção + briefs + metas de palavras + prompt de imagem por seção) e depois escreve CADA SEÇÃO em chamada separada, montando o HTML final por concatenação. Este plano replica esse padrão dentro da identidade/persona do coesasolar (`AUTOBLOG_PROFILE`), sem importar campos do cfgauss que o checklist não pediu (citability_block, cta_type, has_table ficam de fora — YAGNI).

**Tech Stack:** TypeScript, Next.js API route, DeepSeek (`deepseek-v4-flash`), `gpt-image-1` via `image-gen.ts` (já genérico o bastante pra N prompts — não precisa mudar). Repos: `coesasolar-site` (motor) + `ig-sentinel` (ajuste do piso de palavras que o Sentinel cobra).

## Global Constraints

- **YAGNI**: só os 3 alvos do checklist (palavras, imagens, FAQ) — nada de citability_block/cta_type/has_table do cfgauss que não foi pedido.
- **`max_tokens` obrigatório e explícito em TODA chamada de geração de seção** — nunca depender do default da API pra um output desse tamanho (a causa raiz do risco de truncamento).
- **O pipeline nunca quebra por falha do gate/regeneração** (regra já documentada em `deepseek.ts:261`) — preservar esse contrato na versão por-seção.
- **Zero URL inventada** (imagem, vídeo, link externo) — regra já existente no prompt, preservar literalmente nas novas seções.
- **Nunca publicar sem capa nem com prompt de imagem vazio** (guard já existente em `image-gen.ts:35/56/89` — `if (!prompt?.trim()) return null`) — preservar.
- **Compatibilidade com o pipeline downstream**: `insertArticle`, `distributeArticle`, `validateArticle`, `runQualityGateLoop` recebem hoje um `ArticleContent` com `content: string` (markdown/HTML final) — a nova geração PRECISA terminar assemblada nesse mesmo formato, para não reescrever route.ts inteiro.
- Teste de regressão no MESMO commit citando este plano; rodar a suíte de testes do repo antes de cada commit.
- Fora de escopo (deliberado): `generateArticleOutline`/`generateArticleFromOutline`/`twoStageGenerationEnabled` (modo 2 etapas pré-existente, hoje desligado) ficam intocados — dead code pré-existente, não mexer sem pedido.

---

### Task 1: Novo schema de estrutura (outline com seções + FAQ)

**Files:**
- Modify: `src/lib/blog/deepseek.ts` (novos tipos e novo prompt de estrutura — não remover os existentes)
- Test: `src/lib/blog/deepseek.regression.test.ts` (criar — confirmado: runner é `vitest run`, convenção do repo é sufixo `.regression.test.ts` em `src/lib/blog/*`, ex. `distribution.regression.test.ts`, `image-body.regression.test.ts`)

**Interfaces:**
- Consumes: `AUTOBLOG_PROFILE` (brand/editorial/cta), `buildEditorialBriefSection`, `InternalLink` — todos já existentes, reusar sem mudar assinatura.
- Produces: `ArticleStructure` (novo tipo) e `generateArticleStructure(keyword, internalLinks, brief): Promise<ArticleStructure>` — consumida pela Task 2.

**IMPORTANTE (verificado 25/08):** `deepseek.regression.test.ts` JÁ EXISTE com um mock de módulo top-level de `openai` (`const createMock = vi.fn(); vi.mock('openai', () => ({ default: class OpenAI { chat = { completions: { create: createMock } } } }))`) e `beforeEach(() => createMock.mockReset())`, cobrindo `regenerateWithFeedback`/`generateArticle`. TODOS os testes deste plano (Tasks 1-3) são NOVOS `describe` blocks ADICIONADOS a esse mesmo arquivo, reusando o `createMock` já declarado — nunca criar um segundo `vi.mock('openai', ...)` no mesmo arquivo (o Vitest não empilha mocks de módulo).

- [X] **Step 1: Escrever o teste (falha antes)**

```typescript
// ADICIONAR ao final de src/lib/blog/deepseek.regression.test.ts. Reusa createMock e os
// imports do topo do arquivo. A linha existente
//   const { regenerateWithFeedback, generateArticle, REQUIRED_FIELDS } = await import('./deepseek');
// vira (adicionar os novos símbolos ao MESMO destructure — é o import dinâmico pós-mock
// que o arquivo já usa; não criar um segundo import estático nem dinâmico):
//   const { regenerateWithFeedback, generateArticle, REQUIRED_FIELDS, isValidStructure,
//     parseStructure, writeSection, generateArticleWithSections, injectSectionImages } =
//     await import('./deepseek');
import type { ArticleStructure } from "./deepseek";

const ESTRUTURA_VALIDA: ArticleStructure = {
  title: "Como Escolher Placa Solar em 2026",
  page_title: "Como Escolher Placa Solar 2026",
  slug: "como-escolher-placa-solar",
  meta_desc: "Descubra como escolher a placa solar certa e economize até R$ 400/mês",
  cover_image_prompt: "Photorealistic solar panels on a Brazilian rooftop, no text",
  cover_alt: "Placas solares em telhado residencial",
  category: "guias",
  sections: Array.from({ length: 7 }, (_, i) => ({
    h2: `Seção ${i + 1}`,
    content_brief: "Instrução de 150-200 palavras para o redator.",
    word_target: 500,
    image_prompt: "Photorealistic detail shot, no text",
  })),
  faq: Array.from({ length: 7 }, (_, i) => ({ question: `Pergunta ${i + 1}?`, answer: "Resposta." })),
};

describe("REGRESSÃO checklist 25/08/2026: estrutura precisa de 7-9 seções e 7 FAQs", () => {
  it("estrutura com 7 seções e 7 FAQ é válida", () => {
    expect(isValidStructure(ESTRUTURA_VALIDA, "placa solar")).toBe(true);
  });
  it("estrutura com 3 seções é inválida (mínimo 7)", () => {
    expect(isValidStructure({ ...ESTRUTURA_VALIDA, sections: ESTRUTURA_VALIDA.sections.slice(0, 3) }, "placa solar")).toBe(false);
  });
  it("estrutura com 10 seções é inválida (máximo 9)", () => {
    const extra = [...ESTRUTURA_VALIDA.sections, ESTRUTURA_VALIDA.sections[0]!, ESTRUTURA_VALIDA.sections[0]!, ESTRUTURA_VALIDA.sections[0]!];
    expect(isValidStructure({ ...ESTRUTURA_VALIDA, sections: extra }, "placa solar")).toBe(false);
  });
  it("estrutura com 5 perguntas de FAQ é inválida (exatas 7)", () => {
    expect(isValidStructure({ ...ESTRUTURA_VALIDA, faq: ESTRUTURA_VALIDA.faq.slice(0, 5) }, "placa solar")).toBe(false);
  });
  it("estrutura sem a keyword no título é inválida", () => {
    expect(isValidStructure({ ...ESTRUTURA_VALIDA, title: "Guia genérico sem o termo" }, "placa solar")).toBe(false);
  });
  it("parseStructure: JSON malformado devolve null (nunca lança)", () => {
    expect(parseStructure("não é json")).toBeNull();
  });
});
```

- [X] **Step 2: Implementar tipos + prompt + parse/validação**

```typescript
// src/lib/blog/deepseek.ts — adicionar (não remover nada existente)

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
}

// Alvo do checklist do dono (25/08/2026): mínimo 4.500 palavras totais, 7-9 seções H2 de
// 400-700 palavras cada, FAQ com exatamente 7 perguntas de 100-150 palavras. Mesmos números
// do padrão cfgauss.com.br/blog — ver docs/superpowers/plans/2026-08-25-motor-padrao-cfgauss.md.
const MIN_SECTIONS = 7;
const MAX_SECTIONS = 9;
const FAQ_COUNT = 7;

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
      "content_brief": "Instrução de 150-200 palavras para o redator escrever esta seção: quais pontos cobrir, exemplos práticos da persona, dados/fatos, tom.",
      "word_target": 550,
      "image_prompt": "Cena fotorrealista em inglês para esta seção, sem texto, sem logos"
    }
  ],
  "faq": [
    { "question": "Pergunta frequente sobre o tema?", "answer": "Resposta completa de 100-150 palavras." }
  ]
}

REGRAS OBRIGATÓRIAS:
- Entre ${MIN_SECTIONS} e ${MAX_SECTIONS} seções H2, cada uma sobre um aspecto distinto do tema (sem sobreposição).
- word_target por seção: 400-700 (soma total mínima 4.500 palavras).
- Exatamente ${FAQ_COUNT} perguntas no FAQ, cada resposta com 100-150 palavras de instrução.
- cover_image_prompt e image_prompt de cada seção sempre em inglês, fotorrealista, sem texto/logo.
- Manter a persona, tom e vocabulário proibido do prompt de redação do ${brand.name}.`;

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

export function isValidStructure(s: ArticleStructure, keyword: string): boolean {
  const norm = (str: string) => str.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return (
    !!s?.title && norm(s.title).includes(norm(keyword)) &&
    !!s.slug && !!s.meta_desc && !!s.cover_image_prompt &&
    Array.isArray(s.sections) && s.sections.length >= MIN_SECTIONS && s.sections.length <= MAX_SECTIONS &&
    s.sections.every(sec => !!sec.h2 && !!sec.content_brief && !!sec.image_prompt && sec.word_target >= 400 && sec.word_target <= 700) &&
    Array.isArray(s.faq) && s.faq.length === FAQ_COUNT &&
    s.faq.every(f => !!f.question && !!f.answer)
  );
}

export async function generateArticleStructure(
  keyword: string,
  internalLinks: InternalLink[] = [],
  brief: EditorialBrief | null = null,
): Promise<ArticleStructure> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const text = await askDeepseek(STRUCTURE_SYSTEM_PROMPT, buildStructureUserPrompt(keyword, internalLinks, brief));
    const structure = parseStructure(text);
    if (structure && isValidStructure(structure, keyword)) return structure;
    if (attempt === 2) break;
    console.warn(`[deepseek] Estrutura inválida na tentativa ${attempt}. Retentando...`);
  }
  throw new Error('deepseek_structure_failed');
}
```

(`askDeepseek` já existe no arquivo — linha 343 — reusar sem alteração; ela já não define `max_tokens`, o que é aceitável aqui porque a ESTRUTURA é pequena, não o artigo inteiro.)

- [X] **Step 3: Testes até verde + commit**

```bash
npx vitest run src/lib/blog/deepseek.regression.test.ts
git add src/lib/blog/deepseek.ts src/lib/blog/deepseek.regression.test.ts
git commit -m "feat(blog): estrutura de artigo com 7-9 seções + FAQ 7 (checklist 25/08, padrão cfgauss)"
```

---

### Task 2: Geração por seção (1 chamada por seção, com max_tokens explícito)

**Files:**
- Modify: `src/lib/blog/deepseek.ts` (nova função `writeSection`)
- Test: `src/lib/blog/deepseek.regression.test.ts`

**Interfaces:**
- Consumes: `ArticleSection` (Task 1).
- Produces: `writeSection(keyword: string, section: ArticleSection, sectionIndex: number, totalSections: number): Promise<string>` (markdown do corpo da seção, SEM o `##` do H2 — quem monta o H2 é a Task 3) — consumida pela Task 3.

- [X] **Step 1: Teste (falha antes)**

```typescript
// writeSection já está no destructure único do topo do arquivo (ver nota da Task 1) —
// nenhum import novo aqui.
it("writeSection: max_tokens é explícito e proporcional ao word_target (nunca depende do default da API)", async () => {
  createMock.mockResolvedValueOnce({ choices: [{ message: { content: "Corpo da seção." } }] });
  await writeSection("placa solar", { h2: "X", content_brief: "brief", word_target: 600, image_prompt: "p" }, 0, 8);
  const args = createMock.mock.calls[0][0];
  expect(args.max_tokens).toBeGreaterThanOrEqual(1200); // ~2 tokens/palavra PT-BR de folga
});
```

- [X] **Step 2: Implementar**

```typescript
// src/lib/blog/deepseek.ts

// Chamada por SEÇÃO — nunca o artigo inteiro numa resposta só. Achado da investigação
// (25/08/2026): generateArticle/regenerateWithFeedback não definem max_tokens, dependendo
// do default da API — viável pra 1500-2500 palavras, arriscado pra 4500+ (resposta truncada
// quebra o JSON.parse silenciosamente, sem sinal claro de causa). max_tokens aqui é
// EXPLÍCITO e generoso: ~2.2 tokens por palavra em PT-BR + margem de formatação.
function maxTokensForSection(wordTarget: number): number {
  return Math.ceil(wordTarget * 2.2) + 200;
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
- Comprimento alvo: ${'${wordTarget}'} palavras (não conte, escreva naturalmente até cobrir o brief).`;

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
Alvo: ${section.word_target} palavras.`;

  const response = await client.chat.completions.create({
    model: 'deepseek-v4-flash',
    messages: [
      { role: 'system', content: SECTION_SYSTEM_PROMPT.replace('${wordTarget}', String(section.word_target)) },
      { role: 'user', content: user },
    ],
    temperature: 0.7,
    max_tokens: maxTokensForSection(section.word_target),
  });
  return response.choices[0]?.message?.content?.trim() ?? '';
}
```

- [X] **Step 3: Testes até verde + commit**

```bash
npx vitest run src/lib/blog/deepseek.regression.test.ts
git add src/lib/blog/deepseek.ts src/lib/blog/deepseek.regression.test.ts
git commit -m "feat(blog): geração de seção com max_tokens explícito (evita truncamento em artigo 4.5k+ palavras)"
```

---

### Task 3: Montagem (estrutura + seções + FAQ + imagens → ArticleContent)

**Files:**
- Modify: `src/lib/blog/deepseek.ts` (nova função `assembleArticle`)
- Modify: `src/lib/blog/image-body.ts` (NÃO precisa mudar — `generateAndUploadBodyImages`/injeção antigos deixam de ser chamados pela rota nova; funções ficam intocadas, dead-code-safe para o modo antigo se algum dia for reativado)
- Test: `src/lib/blog/deepseek.regression.test.ts`

**Interfaces:**
- Consumes: `ArticleStructure` (Task 1), `writeSection` (Task 2).
- Produces: `generateArticleWithSections(keyword, internalLinks?, brief?): Promise<ArticleContent>` — MESMO tipo de retorno que `generateArticle` já produz hoje, para não quebrar `route.ts` além do necessário. Consumida pela Task 4.

- [X] **Step 1: Teste (falha antes)**

**Mock pelo LIMITE do módulo, nunca `vi.spyOn` de função interna** — o arquivo mocka a fronteira real (`openai`'s `create()`), e named exports ESM não são confiavelmente espiáveis com `vi.spyOn` sem config extra. Encadear `createMock` na ORDEM real de chamadas: 1ª = estrutura, 2ª em diante = 1 por seção (em lotes de 3 — ver Task 3 Step 2).

```typescript
it("REGRESSÃO checklist 25/08/2026: artigo montado tem 1 slot de imagem por seção + FAQ com 7 blocos", async () => {
  createMock
    .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(ESTRUTURA_VALIDA) } }] }) // estrutura
    .mockResolvedValue({ choices: [{ message: { content: "Corpo de exemplo da seção, texto suficiente." } }] }); // toda seção

  // generateArticleWithSections já está no destructure único do topo do arquivo.
  const article = await generateArticleWithSections("placa solar");

  const slotCount = (article.content.match(/<!-- IMG_SLOT:\d+ -->/g) ?? []).length;
  expect(slotCount).toBe(ESTRUTURA_VALIDA.sections.length); // 1 slot por seção
  expect(article.sectionImagePrompts).toHaveLength(ESTRUTURA_VALIDA.sections.length);
  expect(article.image_prompt).toBe(ESTRUTURA_VALIDA.cover_image_prompt); // capa fora do content
  expect(article.content).toContain("## " + ESTRUTURA_VALIDA.sections[0]!.h2);
  expect(article.content).toContain("## Perguntas Frequentes");
  expect((article.content.match(/^### /gm) ?? []).length).toBe(7); // 7 perguntas do FAQ
});

it("injectSectionImages: slot sem imagem correspondente (upload falhou) é removido, nunca publica placeholder cru", () => {
  // injectSectionImages já está no destructure único do topo do arquivo.
  const content = "texto\n<!-- IMG_SLOT:0 -->\nmais texto\n<!-- IMG_SLOT:1 -->";
  const out = injectSectionImages(content, [{ url: "https://x/a.webp", alt: "a" }, null]);
  expect(out).toContain("![a](https://x/a.webp)");
  expect(out).not.toContain("IMG_SLOT");
});
```

- [X] **Step 2: Implementar (o desafio: imagem-por-seção só existe DEPOIS do upload, mas o texto é montado ANTES)**

Decisão de design: `assembleArticle` monta o markdown com um **placeholder** por seção (`<!-- IMG_SLOT:N -->`), e uma função separada `injectSectionImages` (análoga a `injectBodyImages`, mas por slot nomeado em vez de índice de H2) substitui os slots depois que as N imagens já foram geradas e hospedadas — mesma divisão de responsabilidade que a rota já faz hoje para capa/corpo/infográfico.

```typescript
// src/lib/blog/deepseek.ts

export async function generateArticleWithSections(
  keyword: string,
  internalLinks: InternalLink[] = [],
  brief: EditorialBrief | null = null,
): Promise<ArticleContent & { sectionImagePrompts: string[] }> {
  const structure = await generateArticleStructure(keyword, internalLinks, brief);

  // Seções em paralelo, teto de 3 concorrentes (mesmo espírito do "batch de 3" que o
  // cfgauss usa pra geração de imagem — evita rate limit da API do DeepSeek).
  const bodies: string[] = [];
  for (let i = 0; i < structure.sections.length; i += 3) {
    const batch = structure.sections.slice(i, i + 3);
    const batchBodies = await Promise.all(
      batch.map((s, j) => writeSection(keyword, s, i + j, structure.sections.length))
    );
    bodies.push(...batchBodies);
  }

  const sectionsMd = structure.sections
    .map((s, i) => `## ${s.h2}\n\n${bodies[i]}\n\n<!-- IMG_SLOT:${i} -->`)
    .join('\n\n');

  const faqMd = [
    '## Perguntas Frequentes',
    ...structure.faq.map(f => `### ${f.question}\n\n${f.answer}`),
  ].join('\n\n');

  const content = `${sectionsMd}\n\n${faqMd}`;

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
  };
}

/** Substitui os placeholders <!-- IMG_SLOT:N --> pelas imagens já geradas/hospedadas.
 *  Slot sem imagem correspondente (upload falhou) é removido — nunca publica placeholder cru. */
export function injectSectionImages(content: string, images: Array<{ url: string; alt: string } | null>): string {
  return content.replace(/<!-- IMG_SLOT:(\d+) -->/g, (_match, idxStr) => {
    const img = images[Number(idxStr)];
    return img ? `![${img.alt}](${img.url})` : '';
  });
}
```

- [X] **Step 3: Testes até verde + commit**

```bash
npx vitest run src/lib/blog/deepseek.regression.test.ts
git add src/lib/blog/deepseek.ts src/lib/blog/deepseek.regression.test.ts
git commit -m "feat(blog): montagem do artigo por seções + FAQ + slots de imagem"
```

---

### Task 4: Wiring na rota de publicação

**Files:**
- Modify: `src/app/api/blog/generate/route.ts`
- Test: teste de integração existente da rota, se houver (`ls src/app/api/blog/generate/*.test.ts`); senão, teste manual documentado no Step 3

**Interfaces:**
- Consumes: `generateArticleWithSections` (Task 3), `injectSectionImages` (Task 3), `generateAndUploadBodyImages` (já existente em `image-gen.ts` — GENÉRICO, aceita array de N prompts, não precisa mudar).
- Produces: artigo publicado com 1 capa + N imagens de seção (8-10 total pro alvo de 7-9 seções).

- [X] **Step 1: Substituir a chamada de geração**

```typescript
// route.ts — ANTES (trecho aproximado, conferir linhas reais no arquivo):
import { generateArticle, /* ...outros já existentes... */ } from '@/lib/blog/deepseek';
// ...
const article = await generateArticle(keyword, internalLinks, brief);
// ...
const coverUrl = await generateAndUploadCover(article.image_prompt, article.slug);
const bodyImages = await generateAndUploadBodyImages(
  [`${article.image_prompt}, wide establishing shot, no text`, `${article.image_prompt}, detail close-up, no text`],
  article.slug, keyword,
);
const finalContent = injectBodyImages(article.content, bodyImages);

// DEPOIS:
import { generateArticleWithSections, injectSectionImages, /* ...existentes... */ } from '@/lib/blog/deepseek';
// ...
const article = await generateArticleWithSections(keyword, internalLinks, brief);
// ...
const coverUrl = await generateAndUploadCover(article.image_prompt, article.slug);
// generateAndUploadBodyImages já é genérica (loop sobre prompts.length) — só troca o array
// de 2 prompts fixos por 1 prompt por SEÇÃO (7-9), alcançando o alvo de 8-10 imagens/artigo
// (1 capa + 7-9 seção) do checklist 25/08/2026.
const sectionImages = await generateAndUploadBodyImages(article.sectionImagePrompts, article.slug, keyword);
const finalContent = injectSectionImages(
  article.content,
  article.sectionImagePrompts.map((_, i) => sectionImages[i] ?? null),
);
```

**CUIDADO** (achado real na leitura de `image-gen.ts:87-100`): `generateAndUploadBodyImages` faz `results.push` só quando o upload dá certo — se uma imagem falhar no meio, o array `results` fica MAIS CURTO que `prompts`, e o índice `sectionImages[i]` desalinha com a seção `i` (pode injetar a imagem da seção 3 na seção 5). Corrigir isso é pré-requisito deste task, não um nice-to-have:

```typescript
// src/lib/blog/image-gen.ts — ajuste MÍNIMO e cirúrgico: preservar posição com null em vez
// de pular. Assinatura de retorno muda de Array<{url,alt}> para Array<{url,alt}|null> —
// mesmo shape que injectSectionImages (Task 3) já espera.
export async function generateAndUploadBodyImages(
  prompts: string[],
  slug: string,
  keyword: string,
): Promise<Array<{ url: string; alt: string } | null>> {
  if (!AUTOBLOG_PROFILE.integrations.imageGenerationEnabled) return prompts.map(() => null);

  const results: Array<{ url: string; alt: string } | null> = [];
  for (let i = 0; i < prompts.length; i++) {
    if (!prompts[i]?.trim()) { results.push(null); continue; }
    try {
      const b64 = await generateImageB64(prompts[i]);
      if (!b64) { results.push(null); continue; }
      const webp = await optimizeToWebp(Buffer.from(b64, 'base64'));
      const url = await uploadImageToStorage(`${slug}-body-${i + 1}.webp`, webp, 'image/webp');
      results.push(url ? { url, alt: `${keyword} — ilustração ${i + 1}` } : null);
    } catch (err) {
      console.warn(`[image-gen] Imagem ${i + 1} do corpo falhou (não bloqueia publicação):`, err);
      results.push(null);
    }
  }
  return results;
}
```

Isso muda o tipo de retorno — checar se algum OUTRO consumidor de `generateAndUploadBodyImages` além desta rota existe (`grep -rn "generateAndUploadBodyImages" src`) e ajustar (o modo antigo de `injectBodyImages` filtra `x.image !== undefined` — com `null` no lugar de ausência, trocar esse filtro pra `x.image !== null`, ou deixar `injectBodyImages` como está se ele só for usado por um caminho que este plano não toca).

- [X] **Step 2: `regenerateWithFeedback` — decisão de escopo**

O gate de qualidade (`runQualityGateLoop`) pode pedir regeneração se `score < 90`. A função antiga `regenerateWithFeedback` reenvia o ARTIGO INTEIRO numa chamada — mesmo risco de truncamento que motivou este plano inteiro. Two opções, ESCOLHER UMA (não implementar as duas):

- **(A) Regenerar só as seções com issue** (recomendado): `JudgeIssue.section` já existe (`quality-gate.ts` — `i.section` usado em `regenerateWithFeedback` hoje). Escrever `regenerateSectionsWithFeedback(article, structure, issues)` que chama `writeSection` de novo SÓ para as seções citadas nas issues, remonta com `assembleArticle`-equivalente, e mantém `runQualityGateLoop` funcionando sobre o texto completo (o judge continua vendo o artigo inteiro — só a REESCRITA fica por seção).
- **(B) Manter regeneração de artigo inteiro, só subir max_tokens** — mais simples, mas reintroduz o risco que a Task 2 eliminou. Só escolher se (A) se mostrar grande demais pro escopo deste commit.

Implementar (A):

```typescript
// deepseek.ts — precisa guardar a ArticleStructure original pra poder regenerar seção por índice.
// generateArticleWithSections passa a devolver também `structure` (além dos campos já listados).
export async function regenerateSectionsWithFeedback(
  keyword: string,
  structure: ArticleStructure,
  currentBodies: string[],
  issues: JudgeIssue[],
): Promise<string[]> {
  const secoesComIssue = new Set(
    issues.map(i => structure.sections.findIndex(s => s.h2 === i.section)).filter(idx => idx >= 0)
  );
  if (secoesComIssue.size === 0) return currentBodies; // nada acionável — mesmo contrato do original
  const novos = [...currentBodies];
  for (const idx of secoesComIssue) {
    const fixInstruction = issues.filter(i => i.section === structure.sections[idx]!.h2).map(i => i.fix_instruction).join(' ');
    const secaoAjustada = { ...structure.sections[idx]!, content_brief: `${structure.sections[idx]!.content_brief}\n\nCORREÇÃO OBRIGATÓRIA: ${fixInstruction}` };
    try {
      novos[idx] = await writeSection(keyword, secaoAjustada, idx, structure.sections.length);
    } catch {
      // mesma filosofia do original: falha na regeneração mantém o conteúdo anterior, nunca quebra o pipeline
    }
  }
  return novos;
}
```

- [ ] **Step 3: Teste manual documentado (gerar 1 artigo real em ambiente de preview)**

```bash
# Vercel preview (NUNCA produção direto) — confirmar CRON_SECRET do preview antes
curl -s -X GET "https://<preview-url>/api/blog/generate" -H "Authorization: Bearer $CRON_SECRET_PREVIEW"
```

Conferir manualmente no artigo publicado: contagem de palavras ≥4.500 (`select word_count from articles order by created_at desc limit 1` no Supabase do coesasolar), 8-10 imagens no `content` (contar `![`), 7 blocos `### ` no FAQ.

- [X] **Step 4: Commit**

```bash
git add src/app/api/blog/generate/route.ts src/lib/blog/deepseek.ts src/lib/blog/image-gen.ts
git commit -m "feat(blog): wiring do motor por seções na rota de geração (checklist 25/08)"
```

---

### Task 5: Ajustar o piso que o Sentinel cobra (cross-repo)

**Files:**
- Modify: `ig-sentinel/sentinel/src/db/coesasolar-blog.ts:22` (`MIN_WORDS = 1500` → `4500`)
- Modify: `ig-sentinel/sentinel/src/db/coesasolar-blog.test.ts` (testes que fixam 1500 — o guard segue a verdade, mover pro valor novo)

**Interfaces:** nenhuma — ajuste de constante isolado no OUTRO repo.

- [ ] **Step 1: Ajustar e testar**

```typescript
// ig-sentinel/sentinel/src/db/coesasolar-blog.ts:22
// Piso alinhado ao motor (25/08/2026, checklist do dono — mesmo padrão do cfgauss):
const MIN_WORDS = 4500;
```

```bash
cd /Users/luisroquette/ig-sentinel/sentinel && npm test
```

Se algum teste fixava 1500/2000 como limiar de `thin_content`, mover pro novo valor (citar este plano no commit).

- [ ] **Step 2: Commit + push (repo separado, branch própria)**

```bash
cd /Users/luisroquette/ig-sentinel
git switch -c coesasolar-piso-4500
git add sentinel/src/db/coesasolar-blog.ts sentinel/src/db/coesasolar-blog.test.ts
git commit -m "tune(sentinel): piso de palavras do coesasolar 1500->4500 (motor alinhado ao padrão cfgauss)"
git push origin HEAD
```

**NÃO fazer merge/push pra `main` do ig-sentinel até o motor do coesasolar (Tasks 1-4) estar DEPLOYADO e gerando 4.500+ palavras de verdade** — subir o piso do Sentinel antes disso faria todo artigo do dia virar `thin_content` (P1) com o motor antigo ainda no ar. Ordem: motor primeiro, Sentinel depois.

---

### Task 6: Deploy e fechamento

- [ ] **Step 1: Deploy do coesasolar-site (push na main — git-triggered, nunca `vercel --prod` redundante)**

```bash
cd /Users/luisroquette/Projects/coesasolar-site
git push origin HEAD
```

- [ ] **Step 2: Validar 1 ciclo real de publicação** (próximo cron ou disparo manual autorizado) e confirmar no banco: `word_count ≥ 4500`, contagem de imagens no `content`, FAQ com 7 itens.

- [ ] **Step 3: SÓ ENTÃO subir o piso do Sentinel (Task 5) e dar merge**

```bash
cd /Users/luisroquette/ig-sentinel
git switch main && git pull
git merge coesasolar-piso-4500 && git push origin main
```

- [ ] **Step 4: Atualizar o Excel do dono**

Seção 2, linha `coesasolar.com.br/blog`, coluna Status → ✅ (remover a nota "PADRONIZADO, hoje 1.500... rewrite pendente").
