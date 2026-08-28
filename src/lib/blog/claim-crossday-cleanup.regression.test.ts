import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * REGRESSÃO 27/08/2026: o último cron do dia (18:50) foi morto pela Vercel ao
 * exceder maxDuration=300s e o catch da rota NUNCA executou — a Vercel mata o
 * processo, não lança exceção JS. O run_log ficou 'running' para sempre, sem
 * mecanismo de limpeza cross-day. Resultado: o dia 27/08 nunca teve artigo e
 * o monitor (cs.1, cs.2, cs.8) seguiu alarmando backlog e cron travado.
 *
 * Este teste verifica que a migration de cleanup cross-day existe E contém a
 * lógica correta: ANTES do insert do claim do dia corrente, marcar como 'error'
 * qualquer run_date anterior com status 'running'.
 */
describe('REGRESSÃO 27/08/2026: cleanup cross-day de run_log "running" da Vercel', () => {
  const migration = readFileSync(
    join(process.cwd(), 'supabase/migrations/20260828150000_cleanup_stale_running_from_previous_days.sql'),
    'utf8',
  );

  it('marca runs "running" de dias anteriores como "error" com erro explicativo', () => {
    expect(migration).toContain("run_date < current_date");
    expect(migration).toContain("status = 'running'");
    expect(migration).toContain("status = 'error'");
    expect(migration).toContain('Vercel maxDuration exceeded');
  });

  it('o cleanup cross-day acontece ANTES do insert do claim do dia corrente', () => {
    const updateIdx = migration.indexOf("run_date < current_date");
    const insertIdx = migration.indexOf("insert into public.coesa_blog_run_log");
    expect(updateIdx).toBeGreaterThan(-1);
    expect(insertIdx).toBeGreaterThan(-1);
    expect(updateIdx).toBeLessThan(insertIdx);
  });

  it('a migration é um create-or-replace (atualiza a função existente, não cria outra)', () => {
    expect(migration).toContain('create or replace function public.coesa_blog_claim_run');
  });

  it('a reclaim no mesmo dia (6min) continua funcionando — não regride o fix do timeout intra-day', () => {
    expect(migration).toContain("created_at < now() - interval '6 minutes'");
  });
});