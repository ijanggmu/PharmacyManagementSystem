import { test, type Page } from "@playwright/test"
import { expect, Guide } from "../helpers/guide"
import { readState, signIn, updateExtra } from "../helpers/run-state"

/**
 * Flow 17 — Supplier payments.
 * The owner pays suppliers: Everest's PO bill in full by bank transfer, part of Himalayan's balance in cash, and
 * part of Annapurna's opening payable by bank. Each supplier's balance and bills update.
 */
function amountIn(text: string): number {
  const m = text.match(/रू([\d,]+\.\d\d)/)
  return m ? Number(m[1].replace(/,/g, "")) : NaN
}

async function payableOf(page: Page, supplier: string): Promise<number> {
  await page.goto("/dashboard/suppliers")
  return amountIn(await page.getByRole("row").filter({ hasText: supplier }).first().innerText({ timeout: 10_000 }))
}

async function openSupplier(page: Page, supplier: string) {
  await page.goto("/dashboard/suppliers")
  await page.getByRole("table").getByText(supplier, { exact: true }).click()
  const sheet = page.getByRole("dialog", { name: supplier })
  await sheet.waitFor()
  await page.waitForLoadState("networkidle").catch(() => undefined)
  return sheet
}

async function choose(page: Page, combobox: ReturnType<Page["getByRole"]>, option: RegExp): Promise<void> {
  await combobox.click()
  await page.getByRole("option", { name: option }).first().click()
}

test("17 · Supplier payments", async ({ page }, testInfo) => {
  const state = readState()
  const guide = new Guide(page, testInfo, "17 · Supplier payments", 10)
  await guide.install()

  await signIn(page, state.tenant, state.ownerEmail, state.ownerPassword)
  const everest0 = await payableOf(page, "Everest Medical Suppliers")
  const himalayan0 = await payableOf(page, "Himalayan Pharma Distributors")
  const annapurna0 = await payableOf(page, "Annapurna Drug House")
  await guide.step("What we owe", "Each supplier's payable: their unpaid bills plus any opening balance.")

  // 1. Pay a specific bill in full.
  let sheet = await openSupplier(page, "Everest Medical Suppliers")
  await guide.step("Everest's bills", "Each bill with its PO, the supplier's bill number and due date. Pay one bill directly.")
  await sheet.getByRole("button", { name: /^Pay PO-/ }).first().click()
  let pay = page.getByRole("dialog", { name: "Record supplier payment" })
  await pay.waitFor()
  await page.waitForLoadState("networkidle").catch(() => undefined)
  await guide.check(
    "Paying a bill fills in that bill's amount (₨1,932.30)",
    () => expect(pay.getByRole("textbox", { name: "Amount" })).toHaveValue("1932.30"),
    { severity: "major" },
  )
  await choose(page, pay.getByRole("combobox", { name: "Paid by" }), /Bank/)
  await pay.getByRole("textbox", { name: "Reference" }).fill("TXN-55120")
  await guide.step("Pay by bank transfer", "₨1,932.30 for bill EMS-7781, reference TXN-55120 — it comes out of the bank account.")
  await guide.pause(800)
  await pay.getByRole("button", { name: "Record payment" }).click()
  await guide.check("The payment is recorded", () => expect(pay).toBeHidden({ timeout: 15_000 }), { severity: "blocker" })
  await page.keyboard.press("Escape")

  // 2. Part payment, oldest bills first.
  sheet = await openSupplier(page, "Himalayan Pharma Distributors")
  await sheet.getByRole("button", { name: "Record payment" }).click()
  pay = page.getByRole("dialog", { name: "Record supplier payment" })
  await pay.waitFor()
  await page.waitForLoadState("networkidle").catch(() => undefined)
  await pay.getByRole("textbox", { name: "Amount" }).fill("1000")
  await pay.getByRole("textbox", { name: "Note" }).fill("Part payment to the salesman")
  await guide.step("Part payment in cash", "₨1,000 to Himalayan's salesman. With no bill chosen, it settles the oldest bills first.")
  await guide.pause(800)
  await pay.getByRole("button", { name: "Record payment" }).click()
  await guide.check("The cash payment is recorded", () => expect(pay).toBeHidden({ timeout: 15_000 }), { severity: "blocker" })
  await page.keyboard.press("Escape")

  // 3. Part of an opening payable.
  sheet = await openSupplier(page, "Annapurna Drug House")
  await sheet.getByRole("button", { name: "Record payment" }).click()
  pay = page.getByRole("dialog", { name: "Record supplier payment" })
  await pay.waitFor()
  await page.waitForLoadState("networkidle").catch(() => undefined)
  await pay.getByRole("textbox", { name: "Amount" }).fill("10000")
  await choose(page, pay.getByRole("combobox", { name: "Paid by" }), /Bank/)
  await pay.getByRole("textbox", { name: "Reference" }).fill("CHQ-000231")
  await guide.step("Against the opening balance", "₨10,000 by bank toward the ₨25,000 we owed Annapurna before going live.")
  await guide.pause(800)
  await pay.getByRole("button", { name: "Record payment" }).click()
  await guide.check("The bank payment is recorded", () => expect(pay).toBeHidden({ timeout: 15_000 }), { severity: "blocker" })
  await page.keyboard.press("Escape")

  const everest1 = await payableOf(page, "Everest Medical Suppliers")
  const himalayan1 = await payableOf(page, "Himalayan Pharma Distributors")
  const annapurna1 = await payableOf(page, "Annapurna Drug House")
  await guide.step("Balances updated", "Everest −₨1,932.30, Himalayan −₨1,000, Annapurna −₨10,000.", 3000)
  await guide.check("Everest's payable drops by ₨1,932.30", async () => expect(Math.round((everest0 - everest1) * 100) / 100).toBe(1932.3), {
    severity: "major",
  })
  await guide.check("Himalayan's payable drops by ₨1,000", async () => expect(Math.round((himalayan0 - himalayan1) * 100) / 100).toBe(1000), {
    severity: "major",
  })
  await guide.check("Annapurna's payable drops by ₨10,000", async () => expect(Math.round((annapurna0 - annapurna1) * 100) / 100).toBe(10000), {
    severity: "major",
  })

  sheet = await openSupplier(page, "Everest Medical Suppliers")
  await sheet.getByRole("switch", { name: "Show paid bills" }).click()
  await guide.step("Paid bills", "Turn on Show paid bills: EMS-7781 is marked paid.", 2500)
  await guide.check(
    "Bill EMS-7781 shows as paid",
    () => expect(sheet.getByRole("row").filter({ hasText: "EMS-7781" })).toContainText(/Paid/),
    { severity: "major" },
  )

  updateExtra({ supplierPayments: { bank: 11932.3, cash: 1000 } })
  await guide.finish("17-supplier-payments")
})
