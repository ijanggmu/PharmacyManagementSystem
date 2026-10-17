import { defineConfig, devices } from "@playwright/test"

/**
 * Guided walkthroughs against a REAL running app + .NET API (no mocks) — the "e2e-live" suite.
 *
 * Each flow drives the app the way a pharmacy would, shows an on-screen caption for every step and records a
 * video, so the run is both a regression test and a training video. Problems are logged as findings (see
 * helpers/guide.ts) instead of stopping the flow, so one bug does not hide the rest.
 *
 * Target: LIVE_BASE_URL (default http://localhost:3001 — the BFF in front of a local API). The live site works
 * the same way: LIVE_BASE_URL=https://pharmacare.codehop.codes yarn test:live
 *
 * Flows share one fresh pharmacy, created by 00-create-pharmacy and kept in e2e-live/.run/state.json, so they
 * run in order on one worker.
 */
const baseURL = process.env.LIVE_BASE_URL ?? "http://localhost:3001"
const slowMo = Number(process.env.LIVE_SLOWMO ?? 350)

export default defineConfig({
  testDir: "./flows",
  outputDir: "./.run/output",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // A guided flow is long by design (captions + slow motion).
  timeout: 20 * 60_000,
  expect: { timeout: 20_000 },
  reporter: [["list"], ["json", { outputFile: "./.run/results.json" }]],
  use: {
    baseURL,
    viewport: { width: 1440, height: 900 },
    video: { mode: "on", size: { width: 1440, height: 900 } },
    screenshot: "only-on-failure",
    actionTimeout: 30_000,
    navigationTimeout: 120_000,
    ignoreHTTPSErrors: true,
    launchOptions: { slowMo },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
})
