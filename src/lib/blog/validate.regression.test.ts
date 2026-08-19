// REGRESSÃO: validador pós-geração Yoast-style.
// Protege o checklist on-page dos guias Neil Patel / RD Station contra regressão:
// se o validador perder uma regra, um teste abaixo quebra.
import { describe, it, expect } from 'vitest';
import { validateArticle, type ValidationInput } from './validate';

const SITE_URL = 'https://exemplo.com.br';
const CTA_URL = '/contato';
const KEYWORD = 'como avaliar solução b2b';

/** Gera N frases de filler (~13 palavras cada) para controlar o word count. */
function fill(n: number): string {
  return Array.from(
    { length: n },
    (_, i) => `Critério ${i + 1}: compare entrega, suporte, contrato e custo total antes de decidir.`
  ).join('\n\n');
}

/** Artigo válido que passa em TODAS as regras. */
function makeValidInput(overrides: Partial<ValidationInput> = {}): ValidationInput {
  const content = [
    `${KEYWORD} é a primeira decisão de quem compra para empresa. O erro custa tempo, dinheiro e contrato refeito.`,
    '',
    '## Como avaliar solução b2b com método',
    '',
    fill(20),
    '',
    '### Orçamento realista',
    '',
    fill(10),
    '',
    '### Prazo de implementação',
    '',
    fill(10),
    '',
    '## Erros comuns na avaliação',
    '',
    fill(15),
    '',
    '- Cobrar só o preço inicial e ignorar o custo total',
    '- Assinar contrato sem prazo de resposta do suporte',
    '',
    '## Como comparar fornecedores',
    '',
    '**Compare três propostas lado a lado.** Não decida pela primeira apresentação.',
    '',
    fill(15),
    '',
    '## Sinais de um bom contrato',
    '',
    fill(10),
    '',
    '## Conclusão',
    '',
    fill(10),
    '',
    `Fale com a equipe no [botão de contato](${CTA_URL}). Leia também [nosso guia interno](/blog/guia-anterior) e a [fonte externa](https://exemplo.org/fonte-confiável).`,
  ].join('\n');

  return {
    keyword: KEYWORD,
    title: 'Como Avaliar Solução B2B sem Riscos',
    metaDesc: `${KEYWORD} com critérios práticos, erros comuns e escolha com confiança`,
    content,
    siteUrl: SITE_URL,
    ctaUrl: CTA_URL,
    ...overrides,
  };
}

/** Roda o validador e retorna os nomes das regras violadas. */
function rules(input: ValidationInput): string[] {
  return validateArticle(input).issues.map(i => i.rule);
}

describe('REGRESSÃO: validador pós-geração (checklist Neil/RD)', () => {
  it('aprova um artigo que cumpre todo o checklist', () => {
    const result = validateArticle(makeValidInput());
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('word_count: reprova artigo com menos de 1000 palavras', () => {
    const input = makeValidInput();
    input.content = 'Artigo curto demais para ranquear.\n\n## Só isso\n\nFim.';
    expect(rules(input)).toContain('word_count');
  });

  it('title_length: reprova título com mais de 60 caracteres', () => {
    const input = makeValidInput();
    input.title = 'Um título absurdamente longo que ultrapassa o limite de sessenta caracteres sem necessidade alguma';
    expect(rules(input)).toContain('title_length');
  });

  it('title_keyword: reprova título sem a keyword', () => {
    const input = makeValidInput();
    input.title = 'Guia para não errar na compra';
    expect(rules(input)).toContain('title_keyword');
  });

  it('meta_length: reprova meta description com mais de 155 caracteres', () => {
    const input = makeValidInput();
    input.metaDesc = 'X'.repeat(200);
    expect(rules(input)).toContain('meta_length');
  });

  it('meta_keyword: reprova meta description sem a keyword', () => {
    const input = makeValidInput();
    input.metaDesc = 'Dicas rápidas para decidir bem.';
    expect(rules(input)).toContain('meta_keyword');
  });

  it('h2_count: reprova fora do intervalo de 4 a 6 H2s', () => {
    const input = makeValidInput();
    input.content = `## Primeiro\n\n## Segundo\n\n${fill(80)}`;
    expect(rules(input)).toContain('h2_count');
  });

  it('keyword_first_sentence: reprova quando a keyword não abre o texto', () => {
    const input = makeValidInput();
    input.content = input.content.replace(
      `${KEYWORD} é a primeira decisão`,
      'Muitas empresas erram na primeira decisão'
    );
    expect(rules(input)).toContain('keyword_first_sentence');
  });

  it('internal_link: reprova artigo sem nenhum link interno', () => {
    const input = makeValidInput();
    input.content = input.content
      .replace('[nosso guia interno](/blog/guia-anterior)', 'nosso guia interno')
      .replace(`[botão de contato](${CTA_URL})`, 'botão de contato');
    expect(rules(input)).toContain('internal_link');
  });

  it('external_link: reprova artigo sem nenhum link externo', () => {
    const input = makeValidInput();
    input.content = input.content.replace(' e a [fonte externa](https://exemplo.org/fonte-confiável)', '');
    expect(rules(input)).toContain('external_link');
  });

  it('heading_hierarchy: reprova H3 sem H2 aberto antes', () => {
    const input = makeValidInput();
    input.content = `### Subseção órfã\n\n${fill(80)}`;
    expect(rules(input)).toContain('heading_hierarchy');
  });

  it('closing_cta: reprova artigo sem o CTA no fechamento', () => {
    const input = makeValidInput();
    input.content = input.content.replace(`[botão de contato](${CTA_URL})`, 'botão de contato');
    expect(rules(input)).toContain('closing_cta');
  });

  it('scannability: reprova artigo sem bullets nem negrito', () => {
    const input = makeValidInput();
    input.content = input.content
      .replace('- Cobrar só o preço inicial e ignorar o custo total\n', '')
      .replace('- Assinar contrato sem prazo de resposta do suporte\n', '')
      .replace('**Compare três propostas lado a lado.** ', '');
    expect(rules(input)).toContain('scannability');
  });

  it('coherence: reprova quando a keyword não aparece no corpo', () => {
    const input = makeValidInput();
    const without = input.content.split(' ').filter(w => w.toLowerCase() !== 'avaliar').join(' ');
    input.content = without;
    expect(rules(input)).toContain('keyword_in_content');
  });

  it('no_image_markdown: reprova markdown de imagem no content', () => {
    const input = makeValidInput();
    input.content += '\n\n![imagem](./capa.png)';
    expect(rules(input)).toContain('no_image_markdown');
  });

  it('paragraph_length: reprova parágrafo com mais de 4 linhas', () => {
    const input = makeValidInput();
    input.content += `\n\nLinha um\nLinha dois\nLinha três\nLinha quatro\nLinha cinco\nLinha seis`;
    expect(rules(input)).toContain('paragraph_length');
  });

  it('grammar: reprova espaço antes de pontuação', () => {
    const input = makeValidInput();
    input.content += '\n\nFrase com erro de digitação , aqui.';
    expect(rules(input)).toContain('grammar_basics');
  });

  it('keyword normalizada com acento casa com keyword sem acento', () => {
    const input = makeValidInput();
    input.title = 'Como Avaliar Solução B2B — Solução B2b sem Riscos'.slice(0, 60);
    input.keyword = 'solucao b2b';
    // keyword sem acento + título com acento: title_keyword não deve disparar
    expect(rules(input)).not.toContain('title_keyword');
  });

  it('title_keyword_start: reprova keyword fora das primeiras palavras do título', () => {
    const input = makeValidInput();
    input.title = 'Tudo o que você precisa saber antes de contratar: como avaliar solução b2b';
    expect(rules(input)).toContain('title_keyword_start');
  });

  it('h2_keyword: reprova quando nenhum H2 contém a keyword', () => {
    const input = makeValidInput();
    input.content = input.content.replace('## Como avaliar solução b2b com método', '## Método de avaliação');
    expect(rules(input)).toContain('h2_keyword');
  });

  it('meta_no_final_period: reprova meta description com ponto final', () => {
    const input = makeValidInput();
    input.metaDesc = `${input.metaDesc}.`;
    expect(rules(input)).toContain('meta_no_final_period');
  });

  it('page_title: reprova longo demais ou sem keyword', () => {
    const long = makeValidInput({ pageTitle: 'X'.repeat(70) });
    expect(rules(long)).toContain('page_title_length');
    const noKw = makeValidInput({ pageTitle: 'Um título sem a palavra certa' });
    expect(rules(noKw)).toContain('page_title_keyword');
  });

  it('page_title válido passa e page_title ausente não é cobrado', () => {
    const ok = makeValidInput({ pageTitle: `Como avaliar solução b2b: guia prático`.slice(0, 60) });
    expect(rules(ok)).not.toContain('page_title_length');
    expect(rules(ok)).not.toContain('page_title_keyword');
    expect(rules(makeValidInput())).toEqual([]);
  });

  it('cover_alt_keyword: reprova alt da capa sem a keyword', () => {
    const input = makeValidInput({ coverAlt: 'Uma foto bonita de escritório' });
    expect(rules(input)).toContain('cover_alt_keyword');
  });

  it('category_allowed: reprova categoria fora da lista do perfil', () => {
    const input = makeValidInput({ category: 'receitas', allowedCategories: ['guias', 'faq'] });
    expect(rules(input)).toContain('category_allowed');
    const ok = makeValidInput({ category: 'guias', allowedCategories: ['guias', 'faq'] });
    expect(rules(ok)).not.toContain('category_allowed');
  });

  it('cover_alt com keyword passa e alt ausente não é cobrado', () => {
    const ok = makeValidInput({ coverAlt: `Imagem sobre ${KEYWORD} em uma mesa de reunião` });
    expect(rules(ok)).not.toContain('cover_alt_keyword');
    expect(rules(makeValidInput())).not.toContain('cover_alt_keyword');
  });

  it('ignora blocos de código markdown nas medições (fenced code)', () => {
    const input = makeValidInput();
    // Palavras dentro de ``` não contam como conteúdo — sem o strip o word count
    // deste caso passaria do piso; com o strip, reprova por article curto demais.
    input.content = `Artigo mínimo de exemplo.\n\n\`\`\`\n${fill(80)}\n\`\`\``;
    expect(rules(input)).toContain('word_count');
  });
});
