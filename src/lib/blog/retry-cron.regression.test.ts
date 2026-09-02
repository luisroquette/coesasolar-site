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

  it('o retry roda DEPOIS do run principal no MESMO dia útil (13:30 > 09:00) — retry no dia seguinte não recuperaria o dia perdido', () => {
    const parse = (schedule: string) => {
      const [minute, hour] = schedule.split(' ').map(Number)
      return { minute, hour }
    }
    const generateCrons = vercelJson.crons
      .filter((c) => c.path === '/api/blog/generate')
      .map((c) => ({ ...c, ...parse(c.schedule) }))
    const main = generateCrons.find((c) => c.hour === 9)
    const retry = generateCrons.find((c) => c.hour === 13 && c.minute === 30)
    expect(main).toBeTruthy()
    expect(retry).toBeTruthy()
    expect(retry!.hour * 60 + retry!.minute).toBeGreaterThan(main!.hour * 60 + main!.minute)
  })
})

/**
 * REGRESSÃO 02/09/2026: 3 tentativas/dia era pouco quando o problema é o MODELO (não só
 * infra) — as 3 podiam usar o mesmo modelo num dia ruim do provedor. Ampliado pra 5,
 * espaçadas ao longo do dia útil, dando mais chances de acerto além do fallback de modelo
 * (dentro de cada tentativa, generateArticleStructure já troca de modelo na 3ª sub-tentativa).
 */
describe('REGRESSÃO 02/09/2026: 5 janelas de tentativa/dia (mais recuperação intradiária)', () => {
  const vercelJson = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf-8')) as {
    crons: Array<{ path: string; schedule: string }>
  }
  const generateCrons = vercelJson.crons.filter((c) => c.path === '/api/blog/generate')

  it('existem 5 agendamentos de /api/blog/generate', () => {
    expect(generateCrons.length).toBe(5)
  })

  it('todas as 5 janelas rodam só em dia útil e em horários distintos', () => {
    const schedules = generateCrons.map((c) => c.schedule)
    expect(new Set(schedules).size).toBe(5) // sem duplicata
    for (const schedule of schedules) {
      expect(schedule.endsWith('1-5')).toBe(true)
    }
  })

  it('as janelas cobrem o dia útil espaçadas, não empilhadas no mesmo horário', () => {
    const parse = (schedule: string) => {
      const [minute, hour] = schedule.split(' ').map(Number)
      return hour * 60 + minute
    }
    const minutesOfDay = generateCrons.map((c) => parse(c.schedule)).sort((a, b) => a - b)
    for (let i = 1; i < minutesOfDay.length; i++) {
      expect(minutesOfDay[i] - minutesOfDay[i - 1]).toBeGreaterThanOrEqual(60) // pelo menos 1h de folga
    }
  })
})
