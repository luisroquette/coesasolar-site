import { describe, expect, it } from 'vitest';
import { SEED_KEYWORDS } from './seed-keywords';
import { getSeedSkippingPublished } from './gsc';

describe('REGRESSÃO 11/09/2026: fallback não recicla pauta publicada', () => {
  it('retorna undefined quando todo o catálogo já foi publicado', () => {
    expect(getSeedSkippingPublished(SEED_KEYWORDS, 0)).toBeUndefined();
  });
});
