import { describe, it, expect } from "vitest"
import { coletarUtm, validarClient, montarLinkWhatsapp } from "./form-utils"

describe("REGRESSÃO: form de candidatura", () => {
  it("coleta só utm_*", () => {
    const p = new URLSearchParams("utm_source=meta&utm_campaign=vaga-dev&foo=1")
    expect(coletarUtm(p)).toEqual({ utm_source: "meta", utm_campaign: "vaga-dev" })
  })
  it("valida núcleo + CV pdf ≤4MB + consent", () => {
    const pdf = new File([new Uint8Array(10)], "cv.pdf", { type: "application/pdf" })
    expect(validarClient({ nome: "Ana", email: "a@b.co", whatsapp: "31999998888", cidade: "BH", consent: true, cv: pdf })).toEqual([])
    expect(validarClient({ nome: "", email: "x", whatsapp: "1", cidade: "", consent: false, cv: null }).length).toBeGreaterThan(3)
  })
})

describe("REGRESSÃO: montarLinkWhatsapp", () => {
  it("número puro sem 55 adiciona prefixo", () => {
    expect(montarLinkWhatsapp("31999998888")).toBe("https://wa.me/5531999998888")
  })
  it("número já com 55 não duplica", () => {
    expect(montarLinkWhatsapp("5531999998888")).toBe("https://wa.me/5531999998888")
  })
  it("número formatado normaliza e funciona igual", () => {
    expect(montarLinkWhatsapp("(31) 99999-8888")).toBe("https://wa.me/5531999998888")
  })
})
