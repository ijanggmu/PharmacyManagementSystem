import { test, type Page } from "@playwright/test"
import { expect, Guide } from "../helpers/guide"
import { readState, signIn, updateExtra } from "../helpers/run-state"

/**
 * Flow 16 — Direct receipt (supplier bill without a PO).
 * A Himalayan Pharma salesman drops off Omeprazole with a bill: 100 capsules plus 10 free, 5% trade discount,
 * on 30-day credit. The manager records the bill as printed; free goods add stock but not cost.
 */
async function stockOf(page: Page, medicine: string): Promise<number | null> {
  await page.goto("/dashboard/inventory")
  await page.getByRole("searchbox", { name: /Search medicines/ }).fill(medicine)
  const text = await page.getByRole("row").filter({ hasText: medicine }).first().innerText({ timeout: 10_000 }).catch(() => "")
  const m = text.match(/([\d,]+)\s+(capsules|tablets)\s+at this branch/)
  return m ? Number(m[1].replace(/,/g, "")) : null
}

test("16 · Direct receipt (supplier bill)", async ({ page }, testInfo) => {
  const state = readState()
  const manager = (state.extra.staff as Record<string, { email: string; password: string }> | undefined)?.manager
  const guide = new Guide(page, testInfo, "16 · Direct receipt (supplier bill)", 9)
  await guide.install()

  await signIn(page, state.tenant, manager?.email ?? state.ownerEmail, manager?.password ?? state.ownerPassword)
  const before = await stockOf(page, "Omeprazole 20mg")

  await page.goto("/dashboard/purchases")
  await page.getByRole("tab", { name: "Goods received" }).click()
  await guide.step("Stock without a purchase order", "Goods that arrive with just a bill are recorded here, line by line as printed.")
  await page.getByRole("button", { name: "Record supplier bill" }).click()
  const bill = page.getByRole("dialog", { name: "Record supplier bill" })
  await bill.waitFor()

  await bill.getByRole("combobox", { name: "Supplier" }).click()
  await page.getByRole("option", { name: /Himalayan Pharma Distributors/ }).click()
  await bill.getByRole("textbox", { name: "Supplier invoice no." }).fill("HPD-4410")
  await bill.getByRole("row").nth(1).getByRole("combobox").first().click()
  await page.keyboard.type("Omeprazole")
  await page.getByRole("option", { name: /Omeprazole 20mg/ }).first().click()
  await bill.getByRole("textbox", { name: "Batch number, line 1" }).fill("OMZ-2502")
  await bill.getByRole("button", { name: "Expiry date, line 1" }).click()
  await page.getByRole("button", { name: "+2 yr" }).click()
  await bill.getByRole("textbox", { name: "Quantity, line 1", exact: true }).fill("100")
  await bill.getByRole("textbox", { name: "Free quantity, line 1" }).fill("10")
  await bill.getByRole("textbox", { name: "Rate, line 1" }).fill("3.5")
  await bill.getByRole("textbox", { name: "Discount, line 1 (percent)" }).fill("5")
  await bill.getByRole("textbox", { name: "Selling price per unit, line 1" }).fill("6")
  await guide.step(
    "Enter the bill as printed",
    "Himalayan bill HPD-4410: 100 Omeprazole + 10 free at ₨3.50, 5% discount, VAT 13%, on credit (30-day terms).",
    3500,
  )
  await guide.check(
    "Free goods lower the unit cost: ₨332.50 ÷ 110 = ₨3.02",
    () => expect(bill.getByRole("row").nth(1)).toContainText("3.02"),
    { severity: "major" },
  )
  await guide.check(
    "Net bill = ₨332.50 + 13% VAT = ₨375.73",
    () => expect(bill.locator("xpath=.//dt[normalize-space()='Net bill']/following-sibling::dd[1]")).toContainText("375.73"),
    { severity: "major" },
  )
  await guide.pause(1000)
  await bill.getByRole("button", { name: "Record bill" }).click()
  await guide.check("The bill is recorded", () => expect(bill).toBeHidden({ timeout: 15_000 }), { severity: "blocker" })

  const row = page.getByRole("row").filter({ hasText: "HPD-4410" }).first()
  await guide.step("Listed as a receipt", "With its GRN number, the supplier's bill number and the total.")
  await guide.check("The receipt shows bill HPD-4410 for ₨375.73", () => expect(row).toContainText("375.73"), { severity: "major" })
  await guide.check(
    "The receipt date is shown as a date",
    async () => expect(await row.innerText()).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/),
    { severity: "cosmetic", expected: "e.g. 16/10/2026 or 30 Ashwin 2083 — not 2026-10-16T16:47:38.703824Z" },
  )
  await row.getByRole("button", { name: /^View receipt/ }).click()
  await guide.step("The receipt", "Batch, expiry, quantity with free goods, cost per unit and VAT — what was posted to stock and the books.", 3000)
  await page.keyboard.press("Escape")

  const after = await stockOf(page, "Omeprazole 20mg")
  await guide.step("Stock went up by 110", `Omeprazole ${before ?? "?"} → ${after ?? "?"} (100 bought + 10 free).`)
  if (before !== null) {
    await guide.check("Omeprazole +110", async () => expect(after).toBe(before + 110), { severity: "blocker" })
  }

  updateExtra({ directBill: "HPD-4410" })
  await guide.finish("16-direct-receipt")
})
