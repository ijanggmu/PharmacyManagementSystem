import { test } from "@playwright/test"
import { expect, Guide } from "../helpers/guide"
import { readState, signIn } from "../helpers/run-state"

/**
 * Flow 27 — Reports.
 * The owner reviews the business reports: sales performance and payment mix, inventory, products, customers and
 * compliance tabs, exports sales to Excel, and checks dead stock, the audit log and the approvals log.
 */
test("27 · Reports", async ({ page }, testInfo) => {
  const state = readState()
  const guide = new Guide(page, testInfo, "27 · Reports", 12)
  await guide.install()

  await signIn(page, state.tenant, state.ownerEmail, state.ownerPassword)
  await page.goto("/dashboard/reports")
  await guide.step("Reports", "Sales, stock and customer performance for the period — revenue, invoices, average sale and discounts.", 3500)
  await guide.check(
    "Sales performance shows this run's invoices",
    async () => expect(await page.getByRole("region", { name: "Sales performance" }).innerText()).toMatch(/Sales\s+[1-9]\d*\s+Invoices in period/),
    { severity: "major" },
  )
  await guide.check(
    "Payment methods use their proper names (eSewa)",
    () => expect(page.getByRole("tabpanel", { name: "Sales" }).getByText(/\bEsewa\b/)).toHaveCount(0),
    { severity: "cosmetic", expected: "'eSewa' as on the counter, not 'Esewa'" },
  )

  for (const [tab, detail] of [
    ["Inventory", "Stock value, low stock and expiry at a glance."],
    ["Products", "Best and slowest sellers, with margin."],
    ["Customers", "Top customers, credit owed and new customers."],
    ["Compliance", "Prescriptions and controlled-drug dispensing for inspections."],
  ] as const) {
    await page.getByRole("tab", { name: tab }).click()
    await guide.step(`${tab} report`, detail, 2500)
    await guide.check(`The ${tab} tab loads`, () => expect(page.getByRole("tabpanel", { name: tab })).toBeVisible(), { severity: "major" })
  }

  // Only decidable when the period's first day is after the 12th (17/09 vs 9/17).
  if (new Date().getDate() > 12) await guide.check(
    "The reporting period keeps one date format (day/month/year)",
    async () => expect(await page.getByText(/^\d{1,2}\/\d{1,2}\/\d{4} – /).first().innerText()).toMatch(/^(1[3-9]|2\d|3[01])\/\d{2}\//),
    { severity: "cosmetic", expected: "17/09/2026 – 17/10/2026 throughout (it switches to 9/17/2026 – 10/17/2026 after changing tabs)" },
  )
  const downloadPromise = page.waitForEvent("download", { timeout: 20_000 }).catch(() => null)
  await page.getByRole("button", { name: /^Export .*Excel$/ }).click()
  const download = await downloadPromise
  await guide.step("Export to Excel", "The period's sales as a spreadsheet for the accountant.")
  await guide.check("A sales spreadsheet downloads", async () => expect(download?.suggestedFilename() ?? "").toMatch(/\.(xlsx|csv)$/i), {
    severity: "major",
  })

  await page.goto("/dashboard/reports/dead-stock")
  await guide.step("Dead stock", "Medicines that haven't sold — candidates to return, discount or stop ordering.", 3000)
  await guide.check("The dead-stock report loads", () => expect(page.getByRole("heading", { level: 1 })).toBeVisible(), { severity: "major" })

  await page.goto("/dashboard/reports")
  await guide.check(
    "Reports only links to logs the user can open",
    async () => {
      const auditCard = page.getByRole("link", { name: /^Audit log/ })
      if (await auditCard.count()) {
        await auditCard.first().click()
        await expect(page.getByText("You don't have access to this page")).toHaveCount(0)
      }
    },
    { severity: "minor", expected: "No Audit log card for a role that can't open the audit log" },
  )

  await page.goto("/dashboard/reports/approvals")
  await guide.step("Approvals log", "Manager approvals: the over-limit discount from flow 09, with who approved it and why.", 3000)
  await guide.check(
    "The discount approval by Ram Manager is logged",
    async () => {
      const row = page.getByRole("row").filter({ hasText: /Ram Manager/ }).first()
      await expect(row).toBeVisible({ timeout: 15_000 })
      await expect(row).toContainText(/discount/i)
    },
    { severity: "major" },
  )

  await guide.finish("27-reports")
})
