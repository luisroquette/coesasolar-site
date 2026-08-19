// REGRESSÃO: parser de embed de vídeo — allowlist YouTube/Vimeo.
import { describe, it, expect } from 'vitest';
import { parseVideoEmbed } from './video-embed';

describe('REGRESSÃO: parseVideoEmbed (allowlist YouTube/Vimeo)', () => {
  it('aceita youtube.com/watch', () => {
    const v = parseVideoEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(v?.provider).toBe('youtube');
    expect(v?.embedUrl).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ');
  });

  it('watchUrl aponta para a página real do vídeo (nunca /embed/ pelado)', () => {
    const yt = parseVideoEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ')!;
    expect(yt.watchUrl).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    const vimeo = parseVideoEmbed('https://vimeo.com/76979871')!;
    expect(vimeo.watchUrl).toBe('https://vimeo.com/76979871');
  });

  it('aceita youtu.be e shorts', () => {
    expect(parseVideoEmbed('https://youtu.be/dQw4w9WgXcQ')?.id).toBe('dQw4w9WgXcQ');
    expect(parseVideoEmbed('https://youtube.com/shorts/dQw4w9WgXcQ')?.provider).toBe('youtube');
  });

  it('aceita vimeo.com/ID', () => {
    const v = parseVideoEmbed('https://vimeo.com/76979871');
    expect(v?.provider).toBe('vimeo');
    expect(v?.embedUrl).toBe('https://player.vimeo.com/video/76979871');
  });

  it('rejeita hosts fora da allowlist (segurança)', () => {
    expect(parseVideoEmbed('https://evil.com/video/dQw4w9WgXcQ')).toBeNull();
    expect(parseVideoEmbed('https://www.youtube.com.evil.com/watch?v=abc')).toBeNull();
    expect(parseVideoEmbed('javascript:alert(1)')).toBeNull();
  });

  it('rejeita IDs malformados', () => {
    expect(parseVideoEmbed('https://www.youtube.com/watch?v=curto')).toBeNull();
    expect(parseVideoEmbed('https://vimeo.com/abc')).toBeNull();
  });
});
