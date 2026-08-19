// REGRESSÃO: métricas — whitelist de eventos e sanitização de slug.
import { describe, it, expect } from 'vitest';
import { isValidMetricEvent, sanitizeSlug, isLikelyBot, METRIC_EVENTS } from './metrics';

describe('REGRESSÃO: métricas', () => {
  it('aceita somente os 4 eventos da whitelist', () => {
    expect(METRIC_EVENTS).toEqual(['view', 'scroll50', 'end', 'cta']);
    for (const event of METRIC_EVENTS) {
      expect(isValidMetricEvent(event)).toBe(true);
    }
    expect(isValidMetricEvent('delete')).toBe(false);
    expect(isValidMetricEvent('drop')).toBe(false);
    expect(isValidMetricEvent('VIEW')).toBe(false); // case-sensitive
    expect(isValidMetricEvent(42)).toBe(false);
    expect(isValidMetricEvent(null)).toBe(false);
  });

  it('sanitizeSlug aceita slug kebab válido', () => {
    expect(sanitizeSlug('como-avaliar-solucao-b2b')).toBe('como-avaliar-solucao-b2b');
    expect(sanitizeSlug('a1-b2-c3')).toBe('a1-b2-c3');
  });

  it('sanitizeSlug barra injeção, caixa alta e não-string', () => {
    expect(sanitizeSlug('"><script>alert(1)</script>')).toBeNull();
    expect(sanitizeSlug("x'; DROP TABLE blog_metrics; --")).toBeNull();
    expect(sanitizeSlug('COMO-AVALIAR')).toBeNull();
    expect(sanitizeSlug('como_avaliar')).toBeNull();
    expect(sanitizeSlug('como avaliar')).toBeNull();
    expect(sanitizeSlug(123)).toBeNull();
    expect(sanitizeSlug(null)).toBeNull();
    expect(sanitizeSlug(undefined)).toBeNull();
  });

  it('sanitizeSlug barra slug maior que 200 chars', () => {
    expect(sanitizeSlug('a'.repeat(202))).toBeNull();
    expect(sanitizeSlug('a'.repeat(200))).toBe('a'.repeat(200));
  });

  it('isLikelyBot identifica crawlers que inflam views', () => {
    expect(isLikelyBot('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')).toBe(true);
    expect(isLikelyBot('Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.0)')).toBe(true);
    expect(isLikelyBot('curl/8.1.2')).toBe(true);
    expect(isLikelyBot('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36')).toBe(false);
    expect(isLikelyBot('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Version/17.0 Mobile Safari/604.1')).toBe(false);
    expect(isLikelyBot(null)).toBe(false);
  });
});
