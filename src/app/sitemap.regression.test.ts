// REGRESSÃO 22/08/2026 — relatório do Sentinel de 22/08 (coesasolar_blog,
// "Artigo mais recente (energia-solar-por-assinatura-como-funciona) ausente do
// sitemap.xml", verificado ao vivo: sitemap real respondeu 200 com 10 URLs, nenhuma
// batendo o slug). Causa raiz: sitemap.ts nunca teve `export const revalidate` —
// rota gerada 1x no build e congelada até o próximo deploy, enquanto o autoblog
// publica via cron sem novo deploy. As rotas irmãs (/blog, /categoria/[slug]) já
// usam ISR 1h (ver src/app/blog/page.tsx, src/app/categoria/[slug]/page.tsx).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function semComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

describe('REGRESSÃO: sitemap.xml precisa revalidar (não pode ficar preso ao build)', () => {
  it('sitemap.ts declara export const revalidate com um teto numérico, não force-static', () => {
    const src = readFileSync(join(__dirname, 'sitemap.ts'), 'utf-8')
    const semComment = semComentarios(src)
    const match = semComment.match(/export const revalidate\s*=\s*(\d+)/)
    expect(match, 'sitemap.ts sem export const revalidate — volta a ficar congelado no build').not.toBeNull()
    const seconds = Number(match![1])
    expect(seconds).toBeGreaterThan(0)
    expect(seconds).toBeLessThanOrEqual(86400) // no máximo 24h — nunca mais frouxo que a página de artigo
  })

  it('a publicação revalida explicitamente o sitemap', () => {
    const route = readFileSync(join(__dirname, 'api/blog/generate/route.ts'), 'utf-8')
    expect(semComentarios(route)).toContain("revalidatePath('/sitemap.xml')")
  })
})
