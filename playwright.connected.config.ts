import { defineConfig, devices } from "@playwright/test";

/**
 * Parcours du MODE CONNECTÉ contre une pile Supabase locale (`supabase start`).
 * Lancer via `npm run test:e2e:connected` (le script lit les clés locales de Supabase).
 */
const PORT = Number(process.env.E2E_CONNECTED_PORT ?? 3200);

export default defineConfig({
  testDir: "e2e",
  testMatch: /connected-.*\.spec\.ts/,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    launchOptions: { args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--ignore-gpu-blocklist"] },
  },
  projects: [{ name: "connected-mobile", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } } }],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      NEXT_PUBLIC_HORIZON_MODE: "connected",
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
      DATABASE_URL: process.env.DATABASE_URL ?? "",
    },
  },
});
