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

  it("inicia na primeira de quatro etapas, incluindo experiência e formação", () => {
    render(<CandidaturaForm vagaSlug="dev" />)
    expect(screen.getByText("1. Currículo")).toHaveClass("font-semibold")
    expect(screen.getByText("1. Currículo")).toHaveAttribute("aria-current", "step")
    expect(screen.getByText("3. Experiência e formação")).toBeInTheDocument()
    expect(screen.getByText("4. Perfil e revisão")).toBeInTheDocument()
  })

  it("associa mensagens de validação aos campos inválidos", () => {
    render(<CandidaturaForm vagaSlug="dev" />)
    fireEvent.submit(screen.getByRole("button", { name: "Continuar" }).closest("form")!)

    const curriculo = screen.getByLabelText(/Currículo/)
    expect(curriculo).toHaveAttribute("aria-describedby", "cv-erro")
    expect(document.getElementById("cv-erro")).toHaveTextContent("Anexe seu currículo em PDF.")
  })

  it("rejeita link com protocolo não web antes do envio", () => {
    render(<CandidaturaForm vagaSlug="dev" />)
    const form = screen.getByRole("button", { name: "Continuar" }).closest("form")!
    fireEvent.change(screen.getByLabelText(/Currículo/), { target: { files: [new File(["%PDF-1.4"], "cv.pdf", { type: "application/pdf" })] } })
    fireEvent.click(screen.getByRole("checkbox", { name: /Autorizo o uso dos meus dados/ }))
    fireEvent.submit(form)
    fireEvent.change(screen.getByLabelText("Nome completo *"), { target: { value: "Ana" } })
    fireEvent.change(screen.getByLabelText("E-mail *"), { target: { value: "ana@example.com" } })
    fireEvent.change(screen.getByLabelText("WhatsApp *"), { target: { value: "31999999999" } })
    fireEvent.change(screen.getByLabelText("Cidade *"), { target: { value: "BH" } })
    fireEvent.submit(form)
    fireEvent.submit(form)
    fireEvent.change(screen.getByLabelText("LinkedIn (opcional)"), { target: { value: "javascript:alert(1)" } })
    fireEvent.submit(form)

    expect(screen.getAllByText("Use um link iniciado por http:// ou https://.").length).toBeGreaterThan(0)
    expect(fetch).not.toHaveBeenCalled()
  })

  it("avança automaticamente e preenche os dados quando a extração termina", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ nome: "Ana Solar", email: "ana@example.com", cidade: "Belo Horizonte" }),
    } as Response)
    render(<CandidaturaForm vagaSlug="dev" />)

    fireEvent.change(screen.getByLabelText(/Currículo/), { target: { files: [new File(["%PDF-1.4"], "cv.pdf", { type: "application/pdf" })] } })
    fireEvent.click(screen.getByRole("checkbox", { name: /Autorizo o uso dos meus dados/ }))
    fireEvent.click(screen.getByRole("checkbox", { name: /serviço de IA/ }))
    fireEvent.click(screen.getByRole("button", { name: "Preencher campos com IA" }))

    expect(await screen.findByDisplayValue("Ana Solar")).toHaveFocus()
    expect(screen.getByText("2. Dados pessoais")).toHaveClass("font-semibold")
  })

  it("mantém a primeira etapa e destaca o erro quando a extração falha", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Currículo protegido por senha." }),
    } as Response)
    render(<CandidaturaForm vagaSlug="dev" />)

    fireEvent.change(screen.getByLabelText(/Currículo/), { target: { files: [new File(["%PDF-1.4"], "cv.pdf", { type: "application/pdf" })] } })
    fireEvent.click(screen.getByRole("checkbox", { name: /Autorizo o uso dos meus dados/ }))
    fireEvent.click(screen.getByRole("checkbox", { name: /serviço de IA/ }))
    fireEvent.click(screen.getByRole("button", { name: "Preencher campos com IA" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Currículo protegido por senha.")
    expect(screen.getByText("1. Currículo")).toHaveClass("font-semibold")
  })

  it("celebra a candidatura enviada com destaque e próximo caminho", async () => {
    vi.mocked(fetch).mockResolvedValue({ status: 201 } as Response)
    render(<CandidaturaForm vagaSlug="dev" feedbackDias={5} />)

    fireEvent.change(screen.getByLabelText(/Currículo/), { target: { files: [new File(["%PDF-1.4"], "cv.pdf", { type: "application/pdf" })] } })
    fireEvent.click(screen.getByRole("checkbox", { name: /Autorizo o uso dos meus dados/ }))
    const form = screen.getByRole("button", { name: "Continuar" }).closest("form")!
    fireEvent.submit(form)
    fireEvent.change(screen.getByLabelText("Nome completo *"), { target: { value: "Ana Solar" } })
    fireEvent.change(screen.getByLabelText("E-mail *"), { target: { value: "ana@example.com" } })
    fireEvent.change(screen.getByLabelText("WhatsApp *"), { target: { value: "31999999999" } })
    fireEvent.change(screen.getByLabelText("Cidade *"), { target: { value: "Belo Horizonte" } })
    fireEvent.submit(form)
    fireEvent.submit(form)
    fireEvent.submit(form)

    expect(await screen.findByRole("heading", { name: "Candidatura enviada!" })).toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveClass("bg-gradient-to-br", "motion-safe:animate-fade-in")
    expect(screen.getByRole("link", { name: "Ver outras oportunidades" })).toHaveAttribute("href", "/carreiras")
  })
})
