import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// O visual aprovado usa títulos técnicos e compactos, sem emojis decorativos.
describe("REGRESSÃO: página pública da vaga mantém títulos sem emoji", () => {
  it("page.tsx contém os títulos de seção e nenhum dos emojis antigos", () => {
    const fonte = readFileSync(join(__dirname, "page.tsx"), "utf-8")

    for (const titulo of ["O que você fará", "O que buscamos", "Diferenciais", "Remuneração e benefícios"]) expect(fonte).toContain(titulo)
    expect(fonte).not.toMatch(/[💻🔍⭐💰]/u)
  })
})
