import { expect, test } from "@playwright/test"

const SLUG = "/carreiras/desenvolvedora-junior-ai-first"

test("vaga tem marca, CTA focável e formulário progressivo", async ({ page }) => {
  let extracoes = 0
  let envios = 0
  await page.route("**/api/carreiras/extrair-cv", async (route) => {
    extracoes++
    await route.fulfill({ json: { nome: "Teste E2E sem envio", email: null, whatsapp: null, cidade: null, resumo_profissional: null, anos_experiencia: null } })
  })
  await page.route("**/api/carreiras/candidaturas", async (route) => { envios++; await route.abort() })
  await page.goto(SLUG)
  await expect(page.getByRole("img", { name: "Coesa Energia" }).first()).toBeVisible()
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/AI FIRST/i)
  await expect(page.getByText(/envie (?:seu )?currículo/i)).toHaveCount(0)
  await expect(page.getByRole("heading", { name: /remuneração e benefícios/i })).toHaveCount(1)

  await page.getByRole("link", { name: "Candidate-se agora" }).first().click()
  await expect(page.locator("#cv")).toBeFocused()
  await page.locator("#cv").setInputFiles({ name: "cv.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 test") })
  expect(extracoes).toBe(0)
  await page.locator("#consent-ia").click()
  await page.getByRole("button", { name: "Preencher campos com IA" }).click()
  await expect.poll(() => extracoes).toBe(1)
  await page.locator("#consent").click()
  await page.getByRole("button", { name: "Continuar" }).click()
  await expect(page.getByLabel("Nome completo *")).toBeVisible()

  await expect(page.getByLabel("Nome completo *")).toHaveValue("Teste E2E sem envio")
  await page.getByLabel("E-mail *").fill("nao-enviar@example.com")
  await page.getByLabel("WhatsApp *").fill("31999998888")
  await page.getByLabel("Cidade *").fill("Belo Horizonte")
  await page.getByRole("button", { name: "Continuar" }).click()
  await expect(page.getByText("Revise antes de enviar")).toBeVisible()
  await expect(page.getByText(/^Portfólio \*$/)).toBeVisible()
  expect(envios).toBe(0)
})

test("lista mantém a área persistida da vaga", async ({ page }) => {
  await page.goto("/carreiras")
  await expect(page.getByText("TECH, DEV & AI", { exact: true })).toBeVisible()
  await expect(page.getByRole("link", { name: /Desenvolvedor.*AI First/i })).toBeVisible()
})
