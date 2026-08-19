// REGRESSÃO: auditoria de links — extração do markdown, classificação interno/externo e status quebrado.
import { describe, it, expect } from 'vitest';
import { extractMarkdownLinks, isInternalLink, isBrokenStatus } from './link-audit';

const SITE = 'https://seudominio.com.br';

describe('REGRESSÃO: auditoria de links', () => {
  it('extrai links markdown do conteúdo', () => {
    const content = [
      'Veja o [guia interno](/blog/guia) e a [fonte](https://exemplo.com/fonte).',
      'Também [outro link](https://exemplo.com/b "título").',
    ].join('\n');
    const links = extractMarkdownLinks(content);
    expect(links).toEqual(['/blog/guia', 'https://exemplo.com/fonte', 'https://exemplo.com/b']);
  });

  it('ignora âncoras (#), mailto:, tel: e imagens ![]()', () => {
    const content = [
      '[âncora](#secao)',
      '[mail](mailto:contato@exemplo.com)',
      '[tel](tel:+5511999999999)',
      '![imagem](https://cdn.exemplo.com/capa.webp)',
      '[válido](https://exemplo.com/pagina)',
    ].join('\n');
    expect(extractMarkdownLinks(content)).toEqual(['https://exemplo.com/pagina']);
  });

  it('isInternalLink classifica por host', () => {
    expect(isInternalLink('/blog/x', SITE)).toBe(true);
    expect(isInternalLink('blog/x', SITE)).toBe(true);
    expect(isInternalLink('https://seudominio.com.br/blog/x', SITE)).toBe(true);
    expect(isInternalLink('https://exemplo.com/x', SITE)).toBe(false);
    expect(isInternalLink('//cdn.externo.com/img.webp', SITE)).toBe(false);
  });

  it('isBrokenStatus marca só 404/410/5xx/erro como quebrado', () => {
    expect(isBrokenStatus(200)).toBe(false);
    expect(isBrokenStatus(301)).toBe(false);
    expect(isBrokenStatus(403)).toBe(false); // WAF bloqueia bots — falso positivo
    expect(isBrokenStatus(404)).toBe(true);
    expect(isBrokenStatus(410)).toBe(true);
    expect(isBrokenStatus(500)).toBe(true);
    expect(isBrokenStatus(503)).toBe(true);
    expect(isBrokenStatus(null)).toBe(true); // timeout/DNS
  });
});
