import { describe, it, expect } from "vitest"
import { coletarUtm, validarClient, montarLinkWhatsapp, formatarWhatsapp, preencherSeVazio, montarFormData } from "./form-utils"

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
  it("DDD 55 sem código do país (11 dígitos) antepõe 55 do país", () => {
    expect(montarLinkWhatsapp("55991234567")).toBe("https://wa.me/5555991234567")
  })
  it("número formatado normaliza e funciona igual", () => {
    expect(montarLinkWhatsapp("(31) 99999-8888")).toBe("https://wa.me/5531999998888")
  })
})

describe("REGRESSÃO: máscara de WhatsApp e portfólio (Fase 2)", () => {
  it("aplica máscara progressivamente enquanto digita", () => {
    expect(formatarWhatsapp("31")).toBe("(31")
    expect(formatarWhatsapp("3199999")).toBe("(31) 99999")
    expect(formatarWhatsapp("31999998888")).toBe("(31) 99999-8888")
  })

  it("ignora caracteres não numéricos e trunca em 11 dígitos", () => {
    expect(formatarWhatsapp("(31) 99999-8888extra")).toBe("(31) 99999-8888")
  })

  it("validarClient rejeita portfolio_url e portfolio (arquivo) juntos", () => {
    const pdf = new File([new Uint8Array(10)], "cv.pdf", { type: "application/pdf" })
    const base = { nome: "Ana", email: "a@b.co", whatsapp: "31999998888", cidade: "BH", consent: true, cv: pdf }
    const erros = validarClient({ ...base, portfolioUrl: "https://x.com", portfolioArquivo: pdf })
    expect(erros.length).toBeGreaterThan(0)
  })
})

describe("REGRESSÃO: respostas de campos extras no form (Fase 3a)", () => {
  it("montarFormData inclui respostas_extras como JSON e arquivos com prefixo resposta_", () => {
    const arquivo = new File([new Uint8Array(5)], "anexo.pdf", { type: "application/pdf" });
    const fd = montarFormData(
      { nome: "Ana", email: "a@b.co", whatsapp: "31999998888", cidade: "BH", consent: true, cv: null, website: "" },
      "vaga-x",
      {},
      { respostasExtras: { "campo-1": "5 anos" }, arquivosExtras: { "campo-2": arquivo } },
    );
    expect(JSON.parse(fd.get("respostas_extras") as string)).toEqual({ "campo-1": "5 anos" });
    expect(fd.get("resposta_arquivo_campo-2")).toBe(arquivo);
  });

  it("validarClient rejeita campo extra obrigatório vazio", () => {
    const campos = [{ id: "campo-1", tipo: "texto_curto" as const, label: "Anos de experiência", obrigatorio: true, opcoes: [] }];
    const base = { nome: "Ana", email: "a@b.co", whatsapp: "31999998888", cidade: "BH", consent: true, cv: new File([new Uint8Array(1)], "cv.pdf", { type: "application/pdf" }) };
    const erros = validarClient({ ...base, camposExtras: campos, respostasExtras: {} });
    expect(erros).toContain("Informe: Anos de experiência.");
  });
});

describe("REGRESSÃO: autopreenchimento por IA não sobrescreve campo já preenchido (race da extração de CV)", () => {
  it("campo vazio recebe o valor extraído", () => {
    expect(preencherSeVazio("", "João da Silva")).toBe("João da Silva")
  })

  it("campo já preenchido pelo candidato (mesmo durante a extração em andamento) NUNCA é sobrescrito", () => {
    // Simula a corrida: o candidato digitou "Maria" enquanto o fetch de extração
    // ainda estava pendente; quando a resposta chega, `atual` é o valor mais
    // recente (lido no updater funcional do setState no momento da escrita),
    // não o valor vazio capturado no início da extração.
    expect(preencherSeVazio("Maria", "João da Silva")).toBe("Maria")
  })

  it("nada extraído (undefined) preserva o valor atual, vazio ou não", () => {
    expect(preencherSeVazio("", undefined)).toBe("")
    expect(preencherSeVazio("Maria", undefined)).toBe("Maria")
  })
})
