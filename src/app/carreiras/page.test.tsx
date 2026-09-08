/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"

vi.mock("@/lib/carreiras/supabase", () => ({
  getVagasPublicadas: vi.fn(async () => [
    { slug: "vaga-1", titulo: "Analista Comercial", area: "Vendas", regime: "PJ", modalidade: "Remoto", local: "Belo Horizonte" },
  ]),
}))

import CarreirasPage from "./page"

// Pedido do dono (08/09/2026): Modalidade (Presencial/Remoto/Híbrido) ficava
// diluída numa linha de metadados minúscula junto com regime/local — fácil
// de passar batido. Precisa ser um destaque visual separado.
describe("CarreirasPage — Modalidade em destaque", () => {
  it("mostra a modalidade como badge separado, não só na linha de metadados", async () => {
    const jsx = await CarreirasPage()
    render(jsx)
    const badge = screen.getByText("Remoto")
    expect(badge.tagName).toBe("DIV") // é o componente Badge, não texto solto na <p>
  })

  it("não repete a modalidade na linha de metadados (regime · local)", async () => {
    const jsx = await CarreirasPage()
    render(jsx)
    const metadados = screen.getByText(/PJ/).closest("p")!
    expect(metadados).toHaveTextContent("PJ · Belo Horizonte")
    expect(metadados).not.toHaveTextContent("Remoto")
  })
})
