// REGRESSÃO: comentários — validação do payload e honeypot.
import { describe, it, expect } from 'vitest';
import { validateComment, isCommentHoneypot, type CommentInput } from './comments';

function makeComment(overrides: Partial<CommentInput> = {}): CommentInput {
  return {
    articleSlug: 'como-avaliar-solucao-b2b',
    authorName: 'Ricardo',
    content: 'Artigo muito útil, obrigado pela lista de critérios.',
    website: null,
    ...overrides,
  };
}

describe('REGRESSÃO: comentários', () => {
  it('aceita comentário válido', () => {
    const result = validateComment(makeComment());
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejeita nome com menos de 2 chars', () => {
    const result = validateComment(makeComment({ authorName: 'R' }));
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('author_name_invalid');
  });

  it('rejeita conteúdo com menos de 5 chars ou mais de 1000', () => {
    const short = validateComment(makeComment({ content: 'bom!' }));
    expect(short.ok).toBe(false);
    expect(short.errors).toContain('content_invalid');

    const long = validateComment(makeComment({ content: 'x'.repeat(1001) }));
    expect(long.ok).toBe(false);
    expect(long.errors).toContain('content_invalid');
  });

  it('aceita conteúdo no limite exato de 1000 chars', () => {
    const result = validateComment(makeComment({ content: 'x'.repeat(1000) }));
    expect(result.ok).toBe(true);
  });

  it('detecta honeypot preenchido (campo invisível)', () => {
    expect(isCommentHoneypot(makeComment())).toBe(false);
    expect(isCommentHoneypot(makeComment({ website: 'http://spam.com' }))).toBe(true);
  });
});
