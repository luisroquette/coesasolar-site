import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/components/home/HomeFooter", () => ({ HomeFooter: () => <footer>Rodapé</footer> }))
vi.mock("@/components/carreiras/CareersHeader", () => ({ CareersHeader: () => <header>Carreiras</header> }))
vi.mock("@/components/carreiras/CandidaturaForm", () => ({ CandidaturaForm: () => <form aria-label="Candidatura" /> }))

import BancoDeTalentosPage, { metadata } from "./page"

describe("BancoDeTalentosPage", () => {
  it("usa o mesmo tema e navegação das demais páginas de carreiras", () => {
    const { container } = render(<BancoDeTalentosPage />)

    expect(screen.getByText("Carreiras")).toBeInTheDocument()
    expect(screen.getByRole("form", { name: "Candidatura" })).toBeInTheDocument()
    expect(container.querySelector("main")).toHaveClass("bg-[#06110d]", "text-white")
    expect(metadata.alternates).toEqual({ canonical: "https://coesasolar.com.br/carreiras/banco-de-talentos" })
  })
})
