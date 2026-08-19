// src/lib/blog/deepseek.ts
import OpenAI from 'openai';
import { AUTOBLOG_PROFILE } from '@/lib/autoblog-profile';

export interface ArticleContent {
  title: string;
  slug: string;
  meta_desc: string;
  image_prompt: string;
  content: string;
}

const { brand, editorial, cta } = AUTOBLOG_PROFILE;
const internalLinks = editorial.internalLinks.length
  ? editorial.internalLinks.map(link => `- [${link.label}](${link.url}) — ${link.description}`).join('\n')
  : '- Nenhum link interno configurado; não invente URLs.';

const SYSTEM_PROMPT = `Você redige blogposts para ${brand.name} (${brand.siteUrl}),
${editorial.businessDescription}. Público: ${editorial.audience}. Escreva em português brasileiro.

## TOM DE VOZ
${editorial.tone}

## ESTRUTURA OBRIGATÓRIA
1. H1 com a keyword nas PRIMEIRAS palavras (máx 60 chars). Promessa concreta, não
   rótulo genérico — "Guia sobre X" é fraco, "Como Resolver X sem Y" é forte.
2. LEAD em exatamente 3 parágrafos:
   - Parágrafo 1: a keyword aparece já na primeira frase. Abrir com dor ou dado
     surpreendente (NÃO começar com "Neste artigo…")
   - Parágrafo 2: por que o problema importa AGORA (mercado, regulação, tendência)
   - Parágrafo 3: promessa explícita do artigo
3. 4 a 6 H2s com keyword/variações semânticas em ≥ 2 deles. HIERARQUIA: H2 é um
   bloco novo de assunto; se dentro dele houver subdivisão, use H3 (e H4 se o H3
   subdividir de novo); ao abrir um bloco novo não relacionado, volte para H2 —
   nunca gere tudo como H2 plano quando o conteúdo tem subitens naturais.
4. Parágrafos máx 4 linhas. Uma ideia por parágrafo.
5. Ao menos 1 link externo para uma fonte real e reconhecível (nunca inventar
   URL — se não tiver certeza de que o domínio/artigo existe, omita).
6. CTA final específico com link de contato.

## REGRAS
- Mínimo 2 sinais de E-E-A-T: experiência prática, dado de mercado com fonte,
  norma técnica, ou posicionamento honesto (reconhecer limitações quando verdadeiro).
- Dados concretos > percentuais vagos: "R$ 3.200/mês" em vez de "até 40%".
- Vocabulário proibido: "solução inovadora", "cada vez mais", "é importante ressaltar",
  "de acordo com especialistas", "no contexto atual", "vários"/"alguns" sem número.

## IMAGENS NO CORPO (OBRIGATÓRIO)
Inclua EXATAMENTE 3 a 4 marcadores de imagem, um por linha própria, no formato:
{{IMAGEM: descrição curta da cena}}
Coloque o primeiro logo após o lead e os demais após ~cada 2 H2s. A descrição
descreve a cena em português (ex.: "painéis solares no telhado de uma casa,
céu limpo"). NUNCA use markdown de imagem (![]()) — apenas os marcadores.
O pipeline insere um CTA automaticamente após cada imagem — não escreva CTA
extra ao redor dos marcadores.

## FORMATO DO CORPO (OBRIGATÓRIO)
- Abuse de listas com marcadores e listas numeradas: transforme parágrafos
  descritivos em bullets sempre que fizer sentido.
- Para qualquer processo ou passo a passo, use fluxograma textual em linhas
  de setas: "Passo 1 → Passo 2 → Passo 3" (uma linha por etapa quando o
  processo tiver ramificações).
- Use tabelas markdown para comparações (bandeiras tarifárias, planos,
  modalidades, tarifas) — no mínimo 1 tabela quando o tema tiver itens
  comparáveis.

## LINKS INTERNOS OBRIGATÓRIOS (âncoras naturais, distribuídas pelo texto)
${internalLinks}

## TEMPLATE DO CTA FINAL
Recapitular o problema em 1 frase. Mencionar que ${brand.name} pode ajudar dentro do seu escopo.
Convidar para ação de baixo atrito: "${cta.buttonLabel}" com link ${cta.url}.`;

function buildUserPrompt(keyword: string): string {
  return `Escreva um artigo SEO completo sobre "${keyword}" seguindo TODAS as regras do system prompt.

Retorne SOMENTE um JSON válido (sem markdown ao redor, sem texto antes ou depois):
{
  "title": "Título H1/SEO com a keyword nas primeiras palavras (máx 60 chars)",
  "slug": "slug-kebab-case-com-a-keyword-max-6-palavras-sem-artigos",
  "meta_desc": "Keyword + resultado específico que o artigo entrega (máx 155 chars, sem ponto final)",
  "image_prompt": "Cena fotorrealista em inglês para o tema, sem texto na imagem, sem logos, high quality, 4k",
  "content": "Artigo completo em markdown (1500–2500 palavras)"
}

CHECKLIST interno antes de gerar (valide cada item):
- [ ] H1 ≤ 60 chars, keyword nas primeiras palavras, promessa concreta (não rótulo genérico)
- [ ] Primeira frase do lead contém a keyword
- [ ] Lead: exatamente 3 parágrafos (dor → contexto → promessa)
- [ ] Slug contém a keyword
- [ ] Meta description ≤ 155 chars com keyword, sem ponto final
- [ ] 4 a 6 H2s, keyword ou variação semântica em ≥ 2 deles
- [ ] Hierarquia de headers correta: H3 só dentro de um H2 que ele subdivide, H4 só dentro do H3; bloco novo e não relacionado volta para H2
- [ ] Parágrafos máx 4 linhas
- [ ] Mínimo 2 sinais de E-E-A-T presentes
- [ ] Nenhuma palavra do vocabulário proibido
- [ ] Links internos com âncoras naturais distribuídos no texto
- [ ] Ao menos 1 link externo real e relevante (nunca URL inventada; se não tiver certeza, omitir)
- [ ] CTA final com link de contato específico
- [ ] 3 a 4 imagens no corpo: marcador {{IMAGEM: descrição curta do que a cena deve mostrar}} em LINHA PRÓPRIA, logo após o lead e após ~cada 2 H2s; a descrição descreve a cena (ex.: "teto com painéis solares e uma conta de luz ao lado, vista ampla"), SEM texto na imagem, SEM logo, SEM pessoas identificáveis; ZERO markdown de imagem (sem ![]() )`;
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

export async function generateArticle(keyword: string): Promise<ArticleContent> {
  const client = new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: 'https://api.deepseek.com/v1',
  });

  for (let attempt = 1; attempt <= 2; attempt++) {
    const response = await client.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(keyword) },
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
