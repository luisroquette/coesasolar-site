// REGRESSÃO 17/08/2026: um erro no RPC coesa_blog_claim_run era tratado como
// "já rodou hoje" (false) e a rota /api/blog/generate respondia 200
// "already_run_today". Resultado: dia útil perdido em silêncio — sem artigo,
// sem run_log e sem sinal de erro (o cron da Vercel via 200 e não re-tentava).
// O claim agora distingue 'claimed' | 'already_run' | 'error'.
//
// REGRESSÃO 18/08/2026: o MESMO buraco ainda existia quando o RPC respondia
// sem erro mas com `data` nulo/não-booleano — o ternário antigo
// (`data === true ? ... : 'already_run'`) tratava QUALQUER retorno inesperado
// como "já rodou hoje" e pulava o dia em silêncio. Só `false` explícito é
// "já rodou"; qualquer outro retorno inesperado vira 'error' (500, re-tentável).
import { describe, it, expect } from 'vitest';
import { interpretClaimResult } from './supabase-blog';

describe('REGRESSÃO: claim do artigo diário não confunde erro/ambiguidade com "já rodou hoje"', () => {
  it('erro no RPC de claim vira "error" (nunca "already_run")', () => {
    expect(interpretClaimResult(null, { message: 'connection refused' })).toBe('error');
  });

  it('claim === true vira "claimed" (pipeline segue para publicar)', () => {
    expect(interpretClaimResult(true, null)).toBe('claimed');
  });

  it('claim === false vira "already_run" (dia já publicado, no-op correto)', () => {
    expect(interpretClaimResult(false, null)).toBe('already_run');
  });

  it('claim sem retorno e sem erro vira "error" (nunca "already_run" — dia não se perde em silêncio)', () => {
    expect(interpretClaimResult(null, null)).toBe('error');
  });

  it('claim com retorno não-booleano vira "error" (nunca "already_run")', () => {
    expect(interpretClaimResult(undefined, null)).toBe('error');
    expect(interpretClaimResult(0, null)).toBe('error');
    expect(interpretClaimResult(1, null)).toBe('error');
    expect(interpretClaimResult('true', null)).toBe('error');
  });
});
