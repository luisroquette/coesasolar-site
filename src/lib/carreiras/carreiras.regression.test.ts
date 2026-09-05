import { describe, it, expect } from "vitest"
import { normalizeVaga } from "./supabase"

describe("REGRESSÃO: normalização de vaga pública", () => {
  it("arrays null viram [] e campos ausentes viram null", () => {
    const v = normalizeVaga({ slug: "dev", titulo: "Dev", regime: "CLT", modalidade: "Remoto", local: "BH", feedback_dias: 30, o_que_fara: null })
    expect(v.o_que_fara).toEqual([])
    expect(v.beneficios).toEqual([])
    expect(v.area).toBeNull()
  })
})
