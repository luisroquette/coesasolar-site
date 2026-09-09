import { defineConfig, devices } from "@playwright/test"

const remote = process.env.PLAYWRIGHT_BASE_URL

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: { baseURL: remote ?? "http://127.0.0.1:3000", trace: "retain-on-failure" },
  webServer: remote ? undefined : { command: "npm run dev", url: "http://127.0.0.1:3000", reuseExistingServer: true },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"] } },
  ],
})
