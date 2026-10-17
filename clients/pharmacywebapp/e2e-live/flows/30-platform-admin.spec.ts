import { test } from "@playwright/test"
import { expect, Guide } from "../helpers/guide"
import { readState, signIn } from "../helpers/run-state"
import { visibleSoon } from "../helpers/ui"

/**
 * Flow 30 — Platform admin.
 * The PharmaCare operator (root tenant) sees every pharmacy: finds the one this run created, opens its details,
 * reads the support ticket it raised in flow 29, and checks system health.
 *
 * Needs the operator's sign-in, which is never stored in the repo: set ROOT_EMAIL and ROOT_PASSWORD
 * (and ROOT_TENANT if it isn't "root") before running. Without them the flow is skipped.
 */
const ROOT_EMAIL = process.env.ROOT_EMAIL
const ROOT_PASSWORD = process.env.ROOT_PASSWORD
const ROOT_TENANT = process.env.ROOT_TENANT ?? "root"

test("30 · Platform admin", async ({ page }, testInfo) => {
  test.skip(!ROOT_EMAIL || !ROOT_PASSWORD, "Set ROOT_EMAIL and ROOT_PASSWORD to run the platform-admin flow.")
  const state = readState()
  const ticket = state.extra.ticket as string | undefined
  const guide = new Guide(page, testInfo, "30 · Platform admin", 8)
  await guide.install()

  await signIn(page, ROOT_TENANT, ROOT_EMAIL!, ROOT_PASSWORD!)
  await guide.step("The operator signs in", "The PharmaCare operator account sees every pharmacy on the platform.")

  await page.goto("/dashboard/tenants")
  await guide.step("All pharmacies", "Every pharmacy with its plan, subscription and status.", 3000)
  const search = page.getByRole("searchbox").or(page.getByRole("textbox", { name: /Search/i })).first()
  if (await visibleSoon(search, 3_000)) await search.fill(state.pharmacyName)
  const row = page.getByText(state.pharmacyName).first()
  await guide.check("This run's pharmacy is listed", () => expect(row).toBeVisible({ timeout: 15_000 }), { severity: "major" })
  if (await visibleSoon(row, 1_000)) {
    await row.click()
    await guide.step("Pharmacy details", "Its users, billing, lifecycle (suspend / reactivate) and audit trail.", 3500)
    await guide.check(
      "The pharmacy's owner shows in its details",
      () => expect(page.getByText(state.ownerEmail).first()).toBeVisible({ timeout: 15_000 }),
      { severity: "minor" },
    )
  }

  await page.goto("/dashboard/tickets/all-tenants")
  await guide.step("Support desk", "Tickets from every pharmacy, by status and priority.", 3000)
  if (ticket) {
    const t = page.getByText(ticket).first()
    await guide.check("The ticket from flow 29 reaches the support desk", () => expect(t).toBeVisible({ timeout: 15_000 }), {
      severity: "major",
    })
    if (await visibleSoon(t, 1_000)) {
      await t.click()
      await guide.step("The ticket", "What the pharmacy reported, with the page and browser details attached.", 3000)
    }
  }

  await page.goto("/dashboard/system-health")
  await guide.step("System health", "API, database, cache and background jobs — the operator's first stop when something is slow.", 3500)
  await guide.check("System health loads", () => expect(page.getByRole("heading", { level: 1 })).toBeVisible(), { severity: "major" })

  await guide.finish("30-platform-admin")
})
