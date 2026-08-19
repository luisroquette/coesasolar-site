// REGRESSÃO: JSON-LD — BlogPosting + FAQPage quando o formato do post for FAQ.
import { describe, it, expect } from 'vitest';
import { extractFaq, buildArticleSchema, buildFaqSchema, buildBreadcrumbSchema } from './schema';
import type { Article } from './supabase-blog';

const ARTICLE: Article = {
  id: 'x',
  slug: 'como-avaliar-solucao-b2b',
  title: 'Como Avaliar Solução B2B sem Riscos',
  page_title: 'Como avaliar solução b2b: guia prático',
  meta_desc: 'Guia prático de avaliação.',
  content: 'conteúdo',
  cover_url: 'https://cdn.exemplo.com/capa.webp',
  cover_alt: 'Imagem sobre como avaliar solução b2b',
  keyword: 'como avaliar solução b2b',
  category: 'guias',
  published_at: '2026-08-19T12:00:00.000Z',
};

const PROFILE = {
  brand: { name: 'Exemplo', siteUrl: 'https://exemplo.com.br', logoUrl: 'https://exemplo.com.br/logo.png' },
} as const;

function faqContent(): string {
  return [
    'Lead.',
    '',
    '## O que considerar antes de assinar um contrato?',
    '',
    'Resposta um com detalhes práticos.',
    '',
    '## Como comparar fornecedores?',
    '',
    'Resposta dois com critérios.',
    '',
    '## Qual o custo total de uma solução B2B?',
    '',
    'Resposta três.',
    '',
    '## Conclusão',
    '',
    'Fechamento.',
  ].join('\n');
}

describe('REGRESSÃO: schema JSON-LD', () => {
  it('buildArticleSchema emite BlogPosting com dateModified e Organization', () => {
    const schema = buildArticleSchema(ARTICLE, PROFILE.brand);
    expect(schema['@type']).toBe('BlogPosting');
    expect(schema.datePublished).toBeTruthy();
    expect(schema.dateModified).toBeTruthy();
    expect(schema.author['@type']).toBe('Organization');
    expect(schema.author.name).toBe('Exemplo');
  });

  it('extractFaq extrai pares pergunta/resposta de H2s com "?"', () => {
    const faq = extractFaq(faqContent());
    expect(faq).toHaveLength(3);
    expect(faq[0].question).toContain('O que considerar');
    expect(faq[0].answer).toContain('Resposta um');
  });

  it('extractFaq ignora artigos sem H2s em forma de pergunta', () => {
    const content = 'Lead.\n\n## Primeira seção\n\nTexto.\n\n## Segunda seção\n\nTexto.';
    expect(extractFaq(content)).toHaveLength(0);
  });

  it('extractFaq corta a resposta no próximo header', () => {
    const faq = extractFaq(faqContent());
    expect(faq[0].answer).not.toContain('Resposta dois');
  });

  it('extractFaq não devolve respostas vazias', () => {
    const content = '## Alguma pergunta?\n\n## Outra pergunta?\n\nTexto.';
    const faq = extractFaq(content);
    expect(faq).toHaveLength(1); // a 1ª pergunta não tem resposta → descartada
  });

  it('buildFaqSchema emite FAQPage válido', () => {
    const faq = extractFaq(faqContent());
    const schema = buildFaqSchema(faq);
    expect(schema['@type']).toBe('FAQPage');
    expect(schema.mainEntity).toHaveLength(3);
    expect(schema.mainEntity[0]['@type']).toBe('Question');
    expect(schema.mainEntity[0].acceptedAnswer['@type']).toBe('Answer');
  });

  it('extractFaq remove markdown do answer (rich snippet limpo)', () => {
    const content = [
      '## Como comparar fornecedores?',
      '',
      'Use **critérios objetivos** e veja nosso [guia interno](/blog/guia).',
      '',
      '## Qual o custo total?',
      '',
      'Considere `contrato` e taxas.',
    ].join('\n');
    const faq = extractFaq(content);
    expect(faq[0].answer).toBe('Use critérios objetivos e veja nosso guia interno.');
    expect(faq[0].answer).not.toContain('**');
    expect(faq[0].answer).not.toContain('](/blog/');
    expect(faq[1].answer).toBe('Considere contrato e taxas.');
  });

  it('buildBreadcrumbSchema emite BreadcrumbList com posições em ordem', () => {
    const schema = buildBreadcrumbSchema([
      { name: 'Blog', url: 'https://exemplo.com.br/blog' },
      { name: 'Guias', url: 'https://exemplo.com.br/categoria/guias' },
    ]);
    expect(schema['@type']).toBe('BreadcrumbList');
    expect(schema.itemListElement).toHaveLength(2);
    expect(schema.itemListElement[0].position).toBe(1);
    expect(schema.itemListElement[1].position).toBe(2);
    expect(schema.itemListElement[1].name).toBe('Guias');
  });
});
