import { test } from "@playwright/test"
import { expect, Guide } from "../helpers/guide"
import { readState, signIn } from "../helpers/run-state"

/**
 * Flow 26 — VAT & IRD.
 * The accountant prepares the month's VAT return: output VAT from sales (less returns), input VAT from purchase
 * bills (less debit notes), the credit carried forward, TDS withheld, and the IRD sales/purchase registers
 * (Annex 13 / 14) for filing.
 */
test("26 · VAT & IRD", async ({ page }, testInfo) => {
  const state = readState()
  const accountant = (state.extra.staff as Record<string, { email: string; password: string }> | undefined)?.accountant
  const guide = new Guide(page, testInfo, "26 · VAT & IRD", 10)
  await guide.install()

  await signIn(page, state.tenant, accountant?.email ?? state.ownerEmail, accountant?.password ?? state.ownerPassword)
  await page.goto("/dashboard/reports/accounting/vat")
  await guide.step("VAT return", "IRD's monthly layout: taxable and exempt sales, returns, purchases and debit notes, and the VAT on each.", 3500)
  const panel = page.getByRole("tabpanel", { name: "VAT return" })
  const rowText = (label: RegExp) => panel.getByRole("row").filter({ hasText: label }).first().innerText()
  await guide.check(
    "Sales are split into taxable and exempt (Cetamol is VAT-exempt)",
    async () => {
      expect(await rowText(/^Taxable sales/)).toMatch(/\d/)
      expect(await rowText(/^Exempt sales/)).not.toMatch(/Exempt sales\s+0\.00/)
    },
    { severity: "major" },
  )
  await guide.check(
    "Sales returns reduce output VAT",
    async () => expect(await rowText(/^Less: sales returns \/ credit notes \(taxable\)/)).not.toMatch(/\b0 cancellation/),
    { severity: "major" },
  )
  await guide.check(
    "Debit notes to suppliers (flow 18) reduce input VAT",
    async () => expect(await rowText(/^Less: purchase returns \/ debit notes \(taxable\)/)).not.toMatch(/\b0 debit note/),
    { severity: "major", expected: "The Himalayan debit note and the Everest expiry-claim debit note are counted" },
  )
  await guide.step("Credit or payable", "If input VAT is higher than output VAT, the credit carries forward; otherwise Record VAT payment.", 3000)

  await page.getByRole("tab", { name: "TDS" }).click()
  await guide.step("TDS", "Tax withheld from vendors (rent, services) and owed to IRD, by vendor and PAN.", 3000)

  await page.goto("/dashboard/reports/ird")
  await guide.step("IRD sales register", "Every tax invoice and credit note with taxable value, VAT and IRD sync status.", 3500)
  await guide.check(
    "The sales register lists today's invoices",
    () => expect(page.getByRole("row").filter({ hasText: /INV-MAIN-/ }).first()).toBeVisible(),
    { severity: "blocker" },
  )
  await guide.check(
    "No mismatch warning when the register and ledger agree after returns",
    () => expect(page.getByText("Register VAT differs from the posted ledger")).toHaveCount(0),
    {
      severity: "minor",
      expected: "No warning: the gap equals the sales-return VAT, which is already in both the VAT return and the balance sheet",
    },
  )

  await page.getByRole("radio", { name: /^Annex 13/ }).click()
  await guide.step("Annex 13 — sales book", "The IRD sales schedule: taxable value and VAT per invoice.", 2500)
  await page.getByRole("radio", { name: /^Purchase register/ }).click()
  await guide.step("Purchase register", "Received bills with the supplier's invoice number, taxable value and VAT.", 2500)
  await guide.check(
    "The purchase register lists the supplier bills (EMS-7781, HPD-4410)",
    async () => {
      await expect(page.getByRole("row").filter({ hasText: "EMS-7781" }).first()).toBeVisible()
      await expect(page.getByRole("row").filter({ hasText: "HPD-4410" }).first()).toBeVisible()
    },
    { severity: "major" },
  )
  await guide.check(
    "Order ref shows the PO / receipt number",
    async () => expect(await page.getByRole("row").filter({ hasText: "HPD-4410" }).first().innerText()).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i),
    { severity: "cosmetic", expected: "e.g. GRN-MAIN-2083/84-00003 — not 01a145d0-c467-…" },
  )
  await page.getByRole("radio", { name: /^Annex 14/ }).click()
  await guide.step("Annex 14 — purchase book", "The IRD purchase schedule per supplier bill. Print, Excel or CSV for filing.", 2500)

  await guide.finish("26-vat-and-ird")
})
