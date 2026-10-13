import { defineConfig, devices } from "@playwright/test"

/**
 * Playwright config for the pharmacy web app (Next.js BFF). Two servers are started:
 *   - e2e/mock-dotnet/server.mjs — a stub of the .NET API with small deterministic fixtures;
 *   - `next dev`, pointed at the stub through DOTNET_API_URL.
 * So the real BFF code (session store, CSRF, /api/dotnet proxy) runs, and only the .NET API is mocked.
 * Specs may also intercept browser calls with page.route("**\/api/dotnet/**") for per-test data.
 * Dev mode (not `next start`) on purpose: production mode issues a __Host- CSRF cookie that needs HTTPS.
 */
const APP_PORT = 3100
const MOCK_PORT = 5199

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // next dev compiles each route on first hit; keep concurrency modest.
  workers: process.env.CI ? 2 : 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${APP_PORT}`,
    trace: "on-first-retry",
    actionTimeout: 15_000,
    navigationTimeout: 60_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node e2e/mock-dotnet/server.mjs",
      url: `http://127.0.0.1:${MOCK_PORT}/health`,
      env: { MOCK_DOTNET_PORT: String(MOCK_PORT) },
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: `yarn next dev -p ${APP_PORT}`,
      url: `http://localhost:${APP_PORT}/api/csrf/token`,
      env: {
        DOTNET_API_URL: `http://127.0.0.1:${MOCK_PORT}`,
        NEXT_PUBLIC_APP_URL: `http://localhost:${APP_PORT}`,
        NEXT_TELEMETRY_DISABLED: "1",
      },
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      stdout: "ignore",
      stderr: "pipe",
    },
  ],
})
