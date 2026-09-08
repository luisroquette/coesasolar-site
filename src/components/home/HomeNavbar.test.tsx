import { render, screen } from "@testing-library/react"
import { describe, it, expect } from "vitest"
import { HomeNavbar } from "./HomeNavbar"

describe("HomeNavbar", () => {
  it("tem o link Carreiras apontando para /carreiras", () => {
    render(<HomeNavbar />)
    const link = screen.getByRole("link", { name: "Carreiras" })
    expect(link).toHaveAttribute("href", "/carreiras")
  })

  describe("REGRESSÃO: botão Acesso sem contraste (texto branco em fundo branco)", () => {
    // variant="outline" do Button já define bg-background (branco) — sem
    // bg-transparent no className, o fundo branco do variant vence e o
    // text-white fica ilegível. CTASection.tsx e HeroSection.tsx já tinham
    // bg-transparent; só o HomeNavbar esqueceu.
    it("o botão Acesso do menu desktop tem bg-transparent", () => {
      render(<HomeNavbar />)
      const links = screen.getAllByRole("link", { name: "Acesso" })
      expect(links[0].className).toContain("bg-transparent")
    })
  })
})
