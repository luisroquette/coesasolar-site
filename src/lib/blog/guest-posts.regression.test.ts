// REGRESSÃO: guest posts — gate de validação e extração de links externos.
import { describe, it, expect } from 'vitest';
import { validateGuestPost, extractGuestBacklinks, type GuestPostInput } from './guest-posts';

const SITE = 'https://seudominio.com.br';
const ALLOWED = ['guias', 'comparativos', 'listas', 'faq'];

function makeGuestPost(overrides: Partial<GuestPostInput> = {}): GuestPostInput {
  return {
    title: 'O guia definitivo que nosso convidado escreveu para o blog',
    slug: 'guia-definitivo-do-convidado',
    meta_desc: 'Um guia definitivo com critérios práticos para avaliar soluções antes de contratar',
    content: `Lead com contexto.\n\n${'Parágrafo com substância. '.repeat(400)}`,
    keyword: 'avaliar soluções',
    category: 'guias',
    guest_author: 'Ana Convidadão',
    guest_bio: 'Especialista em compras B2B há 12 anos.',
    guest_url: 'https://anaconvidada.com.br',
    ...overrides,
  };
}

describe('REGRESSÃO: guest posts', () => {
  it('aceita guest post válido', () => {
    const result = validateGuestPost(makeGuestPost(), ALLOWED);
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejeita título curto, conteúdo raso e keyword ausente', () => {
    const result = validateGuestPost(
      makeGuestPost({ title: 'Curto', content: 'Texto curto demais.', keyword: '' }),
      ALLOWED,
    );
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('title_invalid');
    expect(result.errors).toContain('content_too_short');
    expect(result.errors).toContain('keyword_missing');
  });

  it('rejeita slug fora do padrão kebab', () => {
    const result = validateGuestPost(makeGuestPost({ slug: 'Guia Inválido!!' }), ALLOWED);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('slug_invalid');
  });

  it('rejeita guest_url que não é http(s)', () => {
    expect(validateGuestPost(makeGuestPost({ guest_url: 'ftp://x.com' }), ALLOWED).errors).toContain('guest_url_invalid');
    expect(validateGuestPost(makeGuestPost({ guest_url: 'javascript:alert(1)' }), ALLOWED).errors).toContain('guest_url_invalid');
    expect(validateGuestPost(makeGuestPost({ guest_url: 'não-é-url' }), ALLOWED).errors).toContain('guest_url_invalid');
  });

  it('rejeita autor com menos de 2 chars e bio acima de 300', () => {
    const result = validateGuestPost(
      makeGuestPost({ guest_author: 'A', guest_bio: 'x'.repeat(301) }),
      ALLOWED,
    );
    expect(result.errors).toContain('guest_author_invalid');
    expect(result.errors).toContain('guest_bio_invalid');
  });

  it('rejeita categoria fora da lista do perfil (artigo órfão)', () => {
    const result = validateGuestPost(makeGuestPost({ category: 'categoria-fantasma' }), ALLOWED);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('category_invalid');
    expect(validateGuestPost(makeGuestPost({ category: 'guias' }), ALLOWED).ok).toBe(true);
  });

  it('rejeita page_title presente fora de 10-60 chars e aceita ausente', () => {
    expect(validateGuestPost(makeGuestPost({ page_title: 'Curto' }), ALLOWED).errors).toContain('page_title_invalid');
    expect(validateGuestPost(makeGuestPost({ page_title: 'x'.repeat(61) }), ALLOWED).errors).toContain('page_title_invalid');
    expect(validateGuestPost(makeGuestPost({ page_title: null }), ALLOWED).ok).toBe(true);
  });

  it('extractGuestBacklinks devolve só links externos, sem duplicatas', () => {
    const content = [
      'Veja [nosso guia](/blog/guia-interno) e também [o site da autora](https://anaconvidada.com.br).',
      'De novo [o site da autora](https://anaconvidada.com.br) e [uma fonte](https://fonte-externa.com/estudo).',
    ].join('\n');
    const backlinks = extractGuestBacklinks(content, SITE);
    expect(backlinks).toEqual(['https://anaconvidada.com.br', 'https://fonte-externa.com/estudo']);
  });
});
