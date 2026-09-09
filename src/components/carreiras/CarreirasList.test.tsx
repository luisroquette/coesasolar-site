import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { CarreirasList } from "./CarreirasList"
import type { VagaPublica } from "@/lib/carreiras/supabase"

const vaga = (titulo: string, area: string): VagaPublica => ({
  slug: titulo.toLowerCase(), titulo, area, regime: "PJ", modalidade: "Remoto", local: "Brasil",
  remuneracao: null, comissionamento: null, pitch: null, o_que_fara: [], o_que_buscamos: [],
  diferenciais: [], beneficios: [], observacoes: null, portfolio_obrigatorio: false,
  feedback_dias: 30, publicado_em: null, campos: [],
})

describe("lista pública de carreiras", () => {
  it("agrupa pela área persistida sem jogar TECH, DEV & AI em Outras", () => {
    render(<CarreirasList vagas={[vaga("Dev", "TECH, DEV & AI")]} />)
    expect(screen.getByText("TECH, DEV & AI")).toBeInTheDocument()
    expect(screen.queryByText("Outras")).not.toBeInTheDocument()
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument()
  })

  it("mostra busca quando há pelo menos duas vagas", () => {
    render(<CarreirasList vagas={[vaga("Dev", "Tech"), vaga("Vendas", "Comercial")]} />)
    expect(screen.getByRole("searchbox")).toBeInTheDocument()
  })
})
