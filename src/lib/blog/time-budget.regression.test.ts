import { describe, it, expect } from 'vitest';
import { hasTimeBudget } from './time-budget';

/**
 * REGRESSÃO 02/09/2026: run_log preso em 'running' desde 27/08, 01/09 e 02/09 — a Vercel
 * mata a função (SIGKILL) ao bater maxDuration=300s no meio das imagens de corpo/infográfico/
 * quality gate, matando o catch antes do insertRunLog de erro. Confirmado no runtime log real:
 * "capa gerada: +255s" seguido de "Vercel Runtime Timeout Error: Task timed out after 300
 * seconds" — só sobravam 45s pras 3 fases opcionais que vêm depois da capa.
 * hasTimeBudget é o guard que pula essas fases (fail-open, mesmo padrão já usado pra falha
 * de API de imagem/LLM) quando não sobra margem segura pro publish terminar antes do kill.
 */
describe('REGRESSÃO 02/09/2026: budget de tempo antes do hard-kill de 300s da Vercel', () => {
  it('nega orçamento quando já passou do ponto observado no incidente real (255s de 300s, margem de 60s)', () => {
    expect(hasTimeBudget(255_000, 300, 60_000)).toBe(false);
  });

  it('concede orçamento numa rodada saudável (pipeline ainda em 100s de 300s)', () => {
    expect(hasTimeBudget(100_000, 300, 60_000)).toBe(true);
  });

  it('nega orçamento exatamente na fronteira (300s - margem)', () => {
    expect(hasTimeBudget(240_000, 300, 60_000)).toBe(false);
  });

  it('concede orçamento 1ms antes da fronteira', () => {
    expect(hasTimeBudget(239_999, 300, 60_000)).toBe(true);
  });
});
