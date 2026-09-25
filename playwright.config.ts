import { defineConfig, devices } from "@playwright/test";

/**
 * Tests de bout en bout. Par défaut contre un build de production (`npm run build:demo`
 * puis `next start`). E2E_DEV=1 utilise le serveur de développement.
 * Version de Playwright alignée sur le navigateur préinstallé (Chromium 1194 / 1.56.1).
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const useDev = process.env.E2E_DEV === "1";

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    launchOptions: { args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--ignore-gpu-blocklist"] },
  },
  projects: [
    { name: "mobile", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: false } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: useDev ? `npx next dev -p ${PORT}` : `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { NEXT_PUBLIC_HORIZON_MODE: "demo" },
  },
});
