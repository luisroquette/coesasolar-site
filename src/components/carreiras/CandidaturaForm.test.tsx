import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { CandidaturaForm } from "./CandidaturaForm"

describe("formulário progressivo de candidatura", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()))

  it("não envia o currículo à IA ao selecionar o arquivo", () => {
    render(<CandidaturaForm vagaSlug="dev" />)
    const arquivo = new File(["%PDF-1.4"], "cv.pdf", { type: "application/pdf" })
    fireEvent.change(screen.getByLabelText(/Currículo/), { target: { files: [arquivo] } })
    expect(fetch).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Preencher campos com IA" })).toBeDisabled()
  })

  it("inicia na primeira de três etapas", () => {
    render(<CandidaturaForm vagaSlug="dev" />)
    expect(screen.getByText("1. Currículo e consentimento")).toHaveClass("font-semibold")
    expect(screen.getByText("3. Perfil e revisão")).toBeInTheDocument()
  })
})
