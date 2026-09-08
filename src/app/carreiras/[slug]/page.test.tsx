/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"

const vagaBase = {
  slug: "vaga-1",
  titulo: "Analista Comercial",
  area: "Vendas",
  regime: "PJ",
  modalidade: "Híbrido",
  local: "Belo Horizonte",
  pitch: null,
  o_que_fara: [],
  o_que_buscamos: [],
  diferenciais: [],
  observacoes: null,
  remuneracao: null,
  comissionamento: null,
  beneficios: [],
  feedback_dias: 30,
  campos: [],
}

vi.mock("@/lib/carreiras/supabase", () => ({
  getVagaBySlug: vi.fn(async () => vagaBase),
  getConfigRhPublica: vi.fn(async () => null),
}))

import VagaDetalhePage from "./page"

// Pedido do dono (08/09/2026): Modalidade ficava diluída na linha de
// metadados junto com área/regime/local — precisa ser um destaque visual
// separado, próprio.
describe("VagaDetalhePage — Modalidade em destaque", () => {
  it("mostra a modalidade como badge separado, não só na linha de metadados", async () => {
    const jsx = await VagaDetalhePage({ params: Promise.resolve({ slug: "vaga-1" }) })
    render(jsx)
    const badge = screen.getByText("Híbrido")
    expect(badge.tagName).toBe("DIV")
  })

  it("não repete a modalidade na linha de metadados (área · regime · local)", async () => {
    const jsx = await VagaDetalhePage({ params: Promise.resolve({ slug: "vaga-1" }) })
    render(jsx)
    const metadados = screen.getByText(/Vendas/).closest("p")!
    expect(metadados).toHaveTextContent("Vendas · PJ · Belo Horizonte")
    expect(metadados).not.toHaveTextContent("Híbrido")
  })
})
