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

  it('reconhece instagram, tiktok e linkedin', () => {
    expect(logoDeMarca('Instagram')).toBe('https://img.logo.dev/instagram.com?token=pk_A3_K-y1HSoORzn7QksCwNA&size=80&format=png');
    expect(logoDeMarca('TikTok')).toBe('https://img.logo.dev/tiktok.com?token=pk_A3_K-y1HSoORzn7QksCwNA&size=80&format=png');
    expect(logoDeMarca('LinkedIn')).toBe('https://img.logo.dev/linkedin.com?token=pk_A3_K-y1HSoORzn7QksCwNA&size=80&format=png');
  });
});
