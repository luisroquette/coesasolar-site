import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// REGRESSÃO (achado #3, revisão final do plano rh-dp-vaga-form-ux): o painel
// (VagaForm.tsx) tem um teste que afirma os 4 títulos com emoji no preview,
// mas o site — que é a fonte real que aquele preview promete espelhar — não
// tinha nenhum. Sem isso, alguém podia tirar os emoji do site numa sessão
// futura, o preflight do site passar verde, e o painel continuar prometendo
// uma tela que não existe mais.
describe("REGRESSÃO: página pública da vaga mantém os títulos com emoji", () => {
  it("page.tsx contém os 4 títulos de seção com o emoji correspondente", () => {
    const fonte = readFileSync(join(__dirname, "page.tsx"), "utf-8")

    expect(fonte).toContain("💻 O que você fará")
    expect(fonte).toContain("🔍 O que buscamos")
    expect(fonte).toContain("⭐ Diferenciais")
    expect(fonte).toContain("💰 Remuneração e benefícios")
  })
})
