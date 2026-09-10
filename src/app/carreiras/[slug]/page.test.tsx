/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest"
import { render, screen, within } from "@testing-library/react"
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
describe("VagaDetalhePage — resumo e metadados", () => {
  it("mostra a modalidade no hero e no resumo lateral", async () => {
    const jsx = await VagaDetalhePage({ params: Promise.resolve({ slug: "vaga-1" }) })
    render(jsx)
    expect(screen.getAllByText("Híbrido")).toHaveLength(2)
    expect(screen.getByRole("heading", { name: "Resumo da vaga" })).toBeInTheDocument()
  })

  it("mantém todos os dados no resumo lateral", async () => {
    const jsx = await VagaDetalhePage({ params: Promise.resolve({ slug: "vaga-1" }) })
    render(jsx)
    const resumo = screen.getByRole("heading", { name: "Resumo da vaga" }).closest("div")!
    for (const texto of ["Híbrido", "Vendas", "PJ", "Belo Horizonte"]) expect(within(resumo).getByText(texto)).toBeInTheDocument()
  })
})
