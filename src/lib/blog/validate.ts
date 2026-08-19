// src/lib/blog/validate.ts
// Validador pós-geração "Yoast-style": mede o checklist on-page dos guias
// Neil Patel / RD Station no artigo REAL, não confia no checklist do prompt.
// Falha → o pipeline regenera uma vez; se falhar de novo, publica com aviso.

export interface ValidationInput {
  keyword: string;
  title: string;
  pageTitle?: string | null;
  metaDesc: string;
  content: string;
  siteUrl: string;
  ctaUrl: string;
  coverAlt?: string | null;
  category?: string | null;
  allowedCategories?: string[];
}

export interface ValidationIssue {
  rule: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

/** Lowercase + sem acentos + espaços colapsados — comparações tolerantes. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const LINK_REGEX = /\[[^\]]*\]\((?!\s)([^)\s]+)\)/g;

export function validateArticle(input: ValidationInput): ValidationResult {
  const issues: ValidationIssue[] = [];
  const add = (rule: string, message: string) => issues.push({ rule, message });

  const { keyword, title, pageTitle, metaDesc, content, siteUrl, ctaUrl, coverAlt, category, allowedCategories } = input;
  const kw = normalize(keyword);
  // Blocos de código markdown não são conteúdo do artigo — ignorar nas medições estruturais.
  const codeStripped = content.replace(/```[\s\S]*?```/g, '');

  // 1. Word count ≥ 1000 (texto sem símbolos de markdown, mantendo o texto dos links)
  const plain = codeStripped
    .replace(/^#{1,6}\s.*$/gm, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^[-*]\s/gm, ' ')
    .replace(/[*>`|]/g, ' ');
  const words = plain.split(/\s+/).filter(Boolean).length;
  if (words < 1000) {
    add('word_count', `Artigo com ${words} palavras — piso de 1000 (guias Neil/RD).`);
  }

  // 2. Título: ≤ 60 chars, keyword presente e nas primeiras palavras
  if (title.length > 60) {
    add('title_length', `Título com ${title.length} chars — máximo 60.`);
  }
  if (!normalize(title).includes(kw)) {
    add('title_keyword', 'Título sem a keyword.');
  } else {
    const kwWords = kw.split(' ').length;
    const titleStart = normalize(title).split(' ').slice(0, Math.max(6, kwWords)).join(' ');
    if (!titleStart.includes(kw)) {
      add('title_keyword_start', 'Keyword não está nas primeiras palavras do título.');
    }
  }

  // 2b. page_title (se presente): ≤ 60 chars e keyword no início (título SEO da aba/Google)
  if (pageTitle) {
    if (pageTitle.length > 60) {
      add('page_title_length', `Page title com ${pageTitle.length} chars — máximo 60.`);
    }
    if (!normalize(pageTitle).includes(kw)) {
      add('page_title_keyword', 'Page title sem a keyword.');
    }
  }

  // 3. Meta description: ≤ 155 chars, keyword presente, sem ponto final (regra do prompt)
  if (metaDesc.length > 155) {
    add('meta_length', `Meta description com ${metaDesc.length} chars — máximo 155.`);
  }
  if (!normalize(metaDesc).includes(kw)) {
    add('meta_keyword', 'Meta description sem a keyword.');
  }
  if (metaDesc.trim().endsWith('.')) {
    add('meta_no_final_period', 'Meta description termina com ponto final.');
  }

  // 4. 4 a 6 H2s, com a keyword em pelo menos um deles
  const h2s = codeStripped.match(/^##\s.*$/gm) ?? [];
  if (h2s.length < 4 || h2s.length > 6) {
    add('h2_count', `${h2s.length} H2s — esperado entre 4 e 6.`);
  }
  if (!h2s.some(h => normalize(h).includes(kw))) {
    add('h2_keyword', 'Nenhum H2 contém a keyword (o prompt pede ≥2 com variações).');
  }

  // 5. Keyword na primeira frase do corpo (ignora headers)
  const firstParagraph = plain
    .split(/\n{2,}/)
    .map(p => p.trim())
    .find(Boolean) ?? '';
  const firstSentence = firstParagraph.split(/[.!?]/)[0] ?? '';
  if (!normalize(firstSentence).includes(kw)) {
    add('keyword_first_sentence', 'A keyword não abre o texto (1ª frase).');
  }

  // 6. Links internos (relativos ou do próprio domínio) e externos (https fora do domínio)
  const hrefs = [...content.matchAll(LINK_REGEX)].map(m => m[1]);
  const siteHost = normalize(siteUrl);
  const hasInternal = hrefs.some(h => h.startsWith('/') || h.startsWith('#') || normalize(h).includes(siteHost));
  const hasExternal = hrefs.some(h => /^https?:\/\//i.test(h) && !normalize(h).includes(siteHost));
  if (!hasInternal) add('internal_link', 'Nenhum link interno no artigo.');
  if (!hasExternal) add('external_link', 'Nenhum link externo real no artigo.');

  // 7. Hierarquia de headers: H3 exige H2 anterior; H4 exige H3 anterior
  const headers = codeStripped
    .split('\n')
    .map((line, index) => {
      const m = line.match(/^(#{2,4})\s/);
      return m ? { level: m[1].length, index } : null;
    })
    .filter((h): h is { level: number; index: number } => h !== null);
  for (const h of headers) {
    if (h.level >= 3) {
      const hasParent = headers.some(x => x.index < h.index && x.level === h.level - 1);
      if (!hasParent) {
        add('heading_hierarchy', `Header nível ${h.level} sem header nível ${h.level - 1} anterior.`);
      }
    }
  }

  // 8. CTA de fechamento presente
  if (!normalize(content).includes(normalize(ctaUrl))) {
    add('closing_cta', 'CTA de fechamento (link do perfil) ausente do artigo.');
  }

  // 8b. Alt da capa: se presente, deve conter a keyword (Google lê o alt)
  if (coverAlt && !normalize(coverAlt).includes(kw)) {
    add('cover_alt_keyword', 'Alt da capa sem a keyword.');
  }

  // 8c. Categoria: se presente, deve ser uma das categorias do perfil
  if (category && allowedCategories && !allowedCategories.includes(normalize(category))) {
    add('category_allowed', `Categoria "${category}" não está na lista do perfil.`);
  }

  // 9. Escaneabilidade: ao menos bullets ou negrito
  const hasBullet = /^[-*]\s/m.test(content);
  const hasBold = /\*\*[^*]+\*\*/.test(content);
  if (!hasBullet && !hasBold) {
    add('scannability', 'Sem bullets nem negrito — texto difícil de escanear.');
  }

  // 10. Coerência título × corpo: keyword aparece no conteúdo
  if (!normalize(content).includes(kw)) {
    add('keyword_in_content', 'A keyword não aparece no corpo do artigo.');
  }

  // 11. Zero markdown de imagem no content (capa é gerada à parte)
  if (/!\[[^\]]*\]\([^)]*\)/.test(content)) {
    add('no_image_markdown', 'Markdown de imagem (![]()) proibido no content.');
  }

  // 12. Parágrafos ≤ 4 linhas (ignora headers, listas, tabelas, citações e código)
  for (const block of content.split(/\n{2,}/)) {
    const trimmed = block.trim();
    if (!trimmed || '#-*|>`'.includes(trimmed[0])) continue;
    const lines = trimmed.split('\n').filter(l => l.trim());
    if (lines.length > 4) {
      add('paragraph_length', 'Parágrafo com mais de 4 linhas — quebrar para mobile.');
      break;
    }
  }

  // 13. Gramática básica: espaço antes de pontuação, ponto duplo (fora reticências)
  if (/[a-zà-ú0-9]\s+[,.;:!?]/i.test(content)) {
    add('grammar_basics', 'Espaço antes de pontuação no texto.');
  } else if (/\.\./.test(content.replace(/\.\.\./g, ''))) {
    add('grammar_basics', 'Ponto duplo fora de reticências no texto.');
  }

  return { ok: issues.length === 0, issues };
}
