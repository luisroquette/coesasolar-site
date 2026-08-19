// REGRESSÃO: CTA de fim de artigo — primário vs fallback de compartilhamento.
import { describe, it, expect } from 'vitest';
import { hasPrimaryCta, buildShareUrls, resolveCtaVariant, type CtaVariant } from './cta';

describe('REGRESSÃO: CTA de fim de artigo', () => {
  it('tem CTA primário quando a URL está preenchida', () => {
    expect(hasPrimaryCta('/contato')).toBe(true);
    expect(hasPrimaryCta('https://exemplo.com.br/fale-conosco')).toBe(true);
  });

  it('cai no fallback com URL vazia ou só espaços', () => {
    expect(hasPrimaryCta('')).toBe(false);
    expect(hasPrimaryCta('   ')).toBe(false);
  });

  it('monta share URLs com texto e URL encoded', () => {
    const share = buildShareUrls(
      'https://seudominio.com.br/blog/como-avaliar',
      'Como avaliar solução B2B sem riscos',
    );

    expect(share.x).toContain('https://twitter.com/intent/tweet');
    expect(share.x).toContain('Como%20avaliar%20solu%C3%A7%C3%A3o%20B2B');
    expect(share.x).toContain('https%3A%2F%2Fseudominio.com.br%2Fblog%2Fcomo-avaliar');

    expect(share.whatsapp).toContain('https://wa.me/?text=');
    expect(share.whatsapp).toContain('B2B%20sem%20riscos');

    expect(share.linkedin).toContain('https://www.linkedin.com/sharing/share-offsite/?url=');
    expect(share.linkedin).toContain('https%3A%2F%2Fseudominio.com.br');
  });
});

describe('REGRESSÃO: A/B de CTA', () => {
  const VARIANTS: CtaVariant[] = [
    { title: 'A', subtitle: 'sub a', buttonLabel: 'A', url: '/a' },
    { title: 'B', subtitle: 'sub b', buttonLabel: 'B', url: '/b' },
    { title: 'C', subtitle: 'sub c', buttonLabel: 'C', url: '/c' },
  ];

  it('sem variantes configuradas, retorna null (sem teste A/B)', () => {
    expect(resolveCtaVariant('slug-x', 100, [])).toBeNull();
  });

  it('mesma semana e slug sempre devolvem a mesma variante', () => {
    const first = resolveCtaVariant('como-avaliar-solucao-b2b', 100, VARIANTS);
    for (let i = 0; i < 5; i++) {
      expect(resolveCtaVariant('como-avaliar-solucao-b2b', 100, VARIANTS)).toBe(first);
    }
    expect(first).not.toBeNull();
  });

  it('índice devolvido está sempre dentro do range das variantes', () => {
    for (let w = 0; w < 50; w++) {
      const idx = resolveCtaVariant('slug-x', w, VARIANTS);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(VARIANTS.length);
    }
  });

  it('a rotação percorre mais de uma variante ao longo das semanas', () => {
    const seen = new Set<number>();
    for (let w = 0; w < 12; w++) {
      const idx = resolveCtaVariant('slug-x', w, VARIANTS);
      if (idx !== null) seen.add(idx);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('slug diferente na mesma semana pode receber variante diferente', () => {
    const a = resolveCtaVariant('artigo-a', 100, VARIANTS);
    const b = resolveCtaVariant('artigo-b', 100, VARIANTS);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    // com 3 variantes e 2 slugs, a chance de colisão é 1/3 — não assertamos diferença,
    // apenas que a resolução é independente do estado global (não há estado).
    expect(typeof a).toBe('number');
    expect(typeof b).toBe('number');
  });
});
