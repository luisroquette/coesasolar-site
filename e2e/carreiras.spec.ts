import { expect, test } from "@playwright/test"

const SLUG = "/carreiras/desenvolvedora-junior-ai-first"

test("vaga tem marca, CTA focável e formulário progressivo", async ({ page }) => {
  let extracoes = 0
  let envios = 0
  let envioMultipart = ""
  await page.route("**/api/carreiras/extrair-cv", async (route) => {
    extracoes++
    await route.fulfill({ json: {
      nome: "Teste E2E sem envio", email: null, whatsapp: null, cidade: null,
      resumo_profissional: "Perfil extraído do currículo de teste.", anos_experiencia: 3,
      cargo_atual: "Desenvolvedora", formacoes: [{ instituicao: "UFMG", curso: "Sistemas de Informação" }],
      experiencias: [{ empresa: "Acme", cargo: "Desenvolvedora", inicio: "2024-01", atual: true }],
      habilidades: ["TypeScript", "React"], idiomas: [{ idioma: "Inglês", nivel: "avancado" }],
      certificacoes: ["AWS Cloud Practitioner"],
    } })
  })
  await page.route("**/api/carreiras/candidaturas", async (route) => {
    envios++
    envioMultipart = route.request().postDataBuffer()?.toString() ?? ""
    await route.fulfill({ status: 201, json: { ok: true } })
  })
  await page.goto(SLUG)
  await expect(page.getByRole("img", { name: "Coesa Energia" }).first()).toBeVisible()
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/AI FIRST/i)
  await expect(page.getByText(/envie (?:seu )?currículo/i)).toHaveCount(0)
  await expect(page.getByRole("heading", { name: /remuneração e benefícios/i })).toHaveCount(1)

  await page.getByRole("link", { name: "Candidate-se agora" }).first().click()
  await expect(page.locator("#cv")).toBeFocused()
  await page.locator("#cv").setInputFiles({ name: "cv.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 test") })
  expect(extracoes).toBe(0)
  await page.locator("#consent").click()
  await page.locator("#consent-ia").click()
  await page.getByRole("button", { name: "Preencher campos com IA" }).click()
  await expect.poll(() => extracoes).toBe(1)
  await expect(page.getByLabel("Nome completo *")).toBeVisible()

  await expect(page.getByLabel("Nome completo *")).toHaveValue("Teste E2E sem envio")
  await page.getByLabel("E-mail *").fill("nao-enviar@example.com")
  await page.getByLabel("WhatsApp *").fill("31999998888")
  await page.getByLabel("Cidade *").fill("Belo Horizonte")
  await page.getByRole("button", { name: "Continuar" }).click()

  await expect(page.getByLabel("Cargo atual ou mais recente (opcional)")).toHaveValue("Desenvolvedora")
  await expect(page.getByLabel("Empresa *")).toHaveValue("Acme")
  await expect(page.getByLabel("Instituição *")).toHaveValue("UFMG")
  await page.getByRole("button", { name: "Continuar" }).click()
  await expect(page.getByText("Revise antes de enviar")).toBeVisible()
  await expect(page.getByText(/^Portfólio \*$/)).toBeVisible()
  await page.getByRole("button", { name: "Link", exact: true }).click()
  await page.locator("#portfolio-url").fill("https://example.com/portfolio")
  for (const campo of await page.locator('[data-etapa="4"] input[required], [data-etapa="4"] textarea[required]').all()) {
    if (await campo.inputValue()) continue
    if (await campo.getAttribute("type") === "file") await campo.setInputFiles({ name: "anexo.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 test") })
    else await campo.fill("Resposta E2E")
  }
  for (const campo of await page.locator('[data-etapa="4"] select[required]').all()) await campo.selectOption({ index: 1 })
  await page.getByRole("button", { name: "Enviar candidatura" }).click()
  await expect(page.getByRole("heading", { name: "Candidatura enviada!" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Ver outras oportunidades" })).toBeVisible()
  expect(envios).toBe(1)
  expect(envioMultipart).toContain('name="formacoes"')
  expect(envioMultipart).toContain("UFMG")
  expect(envioMultipart).toContain('name="experiencias"')
  expect(envioMultipart).toContain("Acme")
})

test("lista mantém a área persistida da vaga", async ({ page }) => {
  await page.goto("/carreiras")
  await expect(page.getByText("TECH, DEV & AI", { exact: true })).toBeVisible()
  await expect(page.getByRole("link", { name: /Desenvolvedor.*AI First/i })).toBeVisible()
})
