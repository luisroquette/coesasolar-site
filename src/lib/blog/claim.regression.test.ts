// REGRESSÃO 17/08/2026: um erro no RPC coesa_blog_claim_run era tratado como
// "já rodou hoje" (false) e a rota /api/blog/generate respondia 200
// "already_run_today". Resultado: dia útil perdido em silêncio — sem artigo,
// sem run_log e sem sinal de erro (o cron da Vercel via 200 e não re-tentava).
// O claim agora distingue 'claimed' | 'already_run' | 'error'.
import { describe, it, expect } from 'vitest';
import { interpretClaimResult } from './supabase-blog';

describe('REGRESSÃO: claim do artigo diário não confunde erro de infra com "já rodou hoje"', () => {
  it('erro no RPC de claim vira "error" (nunca "already_run")', () => {
    expect(interpretClaimResult(null, { message: 'connection refused' })).toBe('error');
  });

  it('claim === true vira "claimed" (pipeline segue para publicar)', () => {
    expect(interpretClaimResult(true, null)).toBe('claimed');
  });

  it('claim === false vira "already_run" (dia já publicado, no-op correto)', () => {
    expect(interpretClaimResult(false, null)).toBe('already_run');
  });

  it('claim sem retorno e sem erro vira "already_run" (não publica duplicado)', () => {
    expect(interpretClaimResult(null, null)).toBe('already_run');
  });
});
