import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * REGRESSÃO 24/08/2026: o run único das 09:00 UTC falhou com "Request timed out." e o dia
 * inteiro ficou SEM artigo — não existia nenhuma re-tentativa (o Sentinel flagrou como P1
 * infra_blocked e a janela de 3 dias do run_log 'error' seguiria alarmando). O claim
 * (coesa_blog_claim_run) já é idempotente: só 'success' bloqueia o dia — então um segundo
 * cron às 13:30 UTC re-gera quando a manhã falhou e vira no-op ("already_run_today") quando
 * deu certo. Vercel injeta Authorization: Bearer CRON_SECRET automaticamente nos crons.
 */
describe('REGRESSÃO 24/08/2026: cron de retry do artigo diário', () => {
  const vercelJson = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf-8')) as {
    crons: Array<{ path: string; schedule: string }>
  }

  it('existe um segundo agendamento de /api/blog/generate (retry) além do das 09:00', () => {
    const generateCrons = vercelJson.crons.filter((c) => c.path === '/api/blog/generate')
    expect(generateCrons.length).toBeGreaterThanOrEqual(2)
    expect(generateCrons.map((c) => c.schedule)).toContain('0 9 * * 1-5')
    expect(generateCrons.map((c) => c.schedule)).toContain('30 13 * * 1-5')
  })

  it('o retry só roda em dia útil (mesmo contrato de 1 artigo/dia útil do run principal)', () => {
    for (const cron of vercelJson.crons.filter((c) => c.path === '/api/blog/generate')) {
      expect(cron.schedule.endsWith('1-5')).toBe(true)
    }
  })
})
