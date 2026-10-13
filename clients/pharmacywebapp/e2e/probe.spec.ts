import { test } from "./helpers/session"

// TEMPORARY exploration spec — dumps aria snapshots and BFF calls per page.
const pages = (process.env.PROBE_PAGES ?? "dashboard").split(",").map((p) => "/" + p)

for (const path of pages) {
  test(`probe ${path}`, async ({ authedPage: page }) => {
    const calls: string[] = []
    page.on("response", (r) => {
      if (r.url().includes("/api/")) calls.push(`${r.status()} ${r.request().method()} ${r.url().replace(/^https?:\/\/[^/]+/, "")}`)
    })
    await page.goto(path)
    await page.waitForLoadState("networkidle").catch(() => {})
    await page.waitForTimeout(Number(process.env.PROBE_WAIT ?? 3000))
    console.log("=== CALLS", path, "\n" + calls.join("\n"))
    console.log("=== ARIA", path, "\n" + (await page.locator("main").first().ariaSnapshot().catch(() => page.locator("body").ariaSnapshot())))
  })
}
