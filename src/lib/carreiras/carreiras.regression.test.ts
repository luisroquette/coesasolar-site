import { describe, it, expect } from "vitest"
import { normalizeVaga, getConfigRhPublica } from "./supabase"

describe("REGRESSÃO: normalização de vaga pública", () => {
  it("arrays null viram [] e campos ausentes viram null", () => {
    const v = normalizeVaga({ slug: "dev", titulo: "Dev", regime: "CLT", modalidade: "Remoto", local: "BH", feedback_dias: 30, o_que_fara: null })
    expect(v.o_que_fara).toEqual([])
    expect(v.beneficios).toEqual([])
    expect(v.area).toBeNull()
  })
})

describe("REGRESSÃO: getConfigRhPublica fail-graceful", () => {
  it("sem env vars, retorna null sem lançar", async () => {
    const originalUrl = process.env.RH_SUPABASE_URL
    const originalKey = process.env.RH_SUPABASE_ANON_KEY
    delete process.env.RH_SUPABASE_URL
    delete process.env.RH_SUPABASE_ANON_KEY
    await expect(getConfigRhPublica()).resolves.toBeNull()
    if (originalUrl) process.env.RH_SUPABASE_URL = originalUrl
    if (originalKey) process.env.RH_SUPABASE_ANON_KEY = originalKey
  })
})

describe("REGRESSÃO: campos extras embutidos na vaga pública (Fase 3a)", () => {
  it("normalizeVaga inclui campos (array vazio se ausente)", () => {
    const v = normalizeVaga({ slug: "dev", titulo: "Dev", regime: "CLT", modalidade: "Remoto", local: "BH", feedback_dias: 30 })
    expect(v.campos).toEqual([])
  })

  it("normalizeVaga mapeia rh_vaga_campos embutido", () => {
    const v = normalizeVaga({
      slug: "dev", titulo: "Dev", regime: "CLT", modalidade: "Remoto", local: "BH", feedback_dias: 30,
      rh_vaga_campos: [{ id: "1", tipo: "texto_curto", label: "Anos de experiência", obrigatorio: true, opcoes: [] }],
    })
    expect(v.campos).toEqual([{ id: "1", tipo: "texto_curto", label: "Anos de experiência", obrigatorio: true, opcoes: [] }])
  })
})
