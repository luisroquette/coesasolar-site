import { describe, it, expect } from 'vitest';
import { logoDeMarca } from './marcas';

describe('REGRESSÃO: logo de marca em benefícios', () => {
  it('reconhece iFood, Wellhub, Gympass e Uber (case-insensitive)', () => {
    expect(logoDeMarca('Vale-alimentação iFood')).toContain('ifood.com.br');
    expect(logoDeMarca('WELLHUB')).toContain('wellhub.com');
    expect(logoDeMarca('Gympass')).toContain('wellhub.com');
    expect(logoDeMarca('uber para deslocamento')).toContain('uber.com');
  });

  it('benefício sem marca conhecida devolve null', () => {
    expect(logoDeMarca('Vale-refeição')).toBeNull();
    expect(logoDeMarca('Auxílio CNH')).toBeNull();
  });
});
