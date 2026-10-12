import { defineConfig, devices } from '@playwright/test'

// Ponta a ponta com dados fictícios: Postgres local + servidor de demonstração + Vite.
const chromium = process.env.JC_CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    launchOptions: { executablePath: chromium },
  },
  projects: [
    { name: 'tablet', use: { ...devices['Galaxy Tab S4'], browserName: 'chromium', launchOptions: { executablePath: chromium } } },
  ],
  webServer: [
    {
      command: 'JORNADA_DEV_BANCO=jornada_e2e JORNADA_DEV_RECRIAR=true npx tsx dev/servidor.ts',
      url: 'http://127.0.0.1:8787/dev/usuarios',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'npx vite --config web/vite.config.ts --strictPort',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
})
