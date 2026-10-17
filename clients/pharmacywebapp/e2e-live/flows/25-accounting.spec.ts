import { test, type Page } from "@playwright/test"
import { expect, Guide } from "../helpers/guide"
import { readState, signIn, updateExtra } from "../helpers/run-state"

/**
 * Flow 25 — Accounting.
 * Everything done so far has posted itself to the books. The accountant checks the overview, the trial balance,
 * profit & loss and balance sheet, looks at the voucher register, and posts one manual journal (bank charges).
 */
async function choose(page: Page, combobox: ReturnType<Page["getByRole"]>, option: RegExp): Promise<void> {
  await combobox.click()
  await page.getByRole("option", { name: option }).first().click()
}

test("25 · Accounting", async ({ page }, testInfo) => {
  const state = readState()
  const accountant = (state.extra.staff as Record<string, { email: string; password: string }> | undefined)?.accountant
  const guide = new Guide(page, testInfo, "25 · Accounting", 11)
  await guide.install()

  await signIn(page, state.tenant, accountant?.email ?? state.ownerEmail, accountant?.password ?? state.ownerPassword)
  await page.goto("/dashboard/reports/accounting")
  await page.getByRole("button", { name: "FY 2083/84" }).click()
  await guide.step(
    "Accounting overview",
    "Signed in as the accountant. Sales, purchases, payments, payroll and expenses have all posted their own vouchers.",
    3500,
  )
  await guide.check(
    "Receivables show the ₨500 Krishna still owes",
    () => expect(page.getByRole("main").getByRole("link", { name: /^Receivables रू/ })).toContainText("500.00"),
    { severity: "major" },
  )
  await guide.check(
    "Books health: trial balance balanced, no drafts waiting",
    async () => {
      await expect(page.getByRole("link", { name: /^Trial balance Balanced/ })).toBeVisible()
      await expect(page.getByRole("link", { name: /^Draft vouchers None/ })).toBeVisible()
    },
    { severity: "blocker" },
  )

  await page.goto("/dashboard/reports/accounting/statements")
  await page.getByRole("button", { name: "FY 2083/84" }).click()
  await page.getByRole("tab", { name: "Trial balance" }).click()
  await guide.step("Trial balance", "Every account's opening, movement and closing balance — debits equal credits.", 3000)
  await guide.check("The trial balance is balanced", () => expect(page.getByRole("tabpanel")).toContainText("Balanced"), {
    severity: "blocker",
  })

  await page.getByRole("tab", { name: "Profit & loss" }).click()
  await guide.step("Profit & loss", "Sales less returns, cost of goods sold, expenses, salaries and the cash shortage from flow 14.", 3500)
  await guide.check(
    "Expenses include rent and electricity (₨28,000 net of VAT) and salaries",
    async () => {
      const panel = page.getByRole("tabpanel")
      await expect(panel).toContainText("General Expenses")
      await expect(panel).toContainText("Salary Expense")
      await expect(panel).toContainText("Cash Short & Over")
    },
    { severity: "major" },
  )

  await page.getByRole("tab", { name: "Balance sheet" }).click()
  await guide.step("Balance sheet", "What the pharmacy owns and owes: cash, bank, stock, receivables; payables, VAT, TDS, SSF; equity.", 3500)
  await guide.check(
    "The balance sheet balances",
    () => expect(page.getByRole("tabpanel")).toContainText("Balanced — assets = liabilities + equity"),
    { severity: "blocker" },
  )

  await page.goto("/dashboard/reports/accounting/register")
  await guide.step("Voucher register", "Every voucher with its type and narration — sales, receipts, payments, journals.", 3000)
  await page.getByRole("button", { name: "FY 2083/84" }).click()
  await page.getByRole("row").nth(1).waitFor({ timeout: 15_000 }).catch(() => undefined)
  const narrations = await page.getByRole("table").locator("tbody tr").allInnerTexts()
  const withIds = narrations.filter((t) => /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-|[0-9a-f]{8}…/i.test(t))
  await guide.check(
    "Voucher narrations name the document or party, not an internal id",
    async () => expect(withIds.map((t) => t.split("	").slice(2, 4).join(" · "))).toEqual([]),
    { severity: "minor", expected: "e.g. 'Sale INV-MAIN-2083/84-00005', 'Consignment settlement for Annapurna Drug House'" },
  )

  // A manual journal: bank charges.
  await page.goto("/dashboard/reports/accounting")
  await page.getByRole("button", { name: "New journal" }).click()
  const jv = page.getByRole("dialog", { name: "New journal entry" })
  await jv.getByRole("textbox", { name: "Narration" }).fill("Bank service charge for Ashwin")
  await choose(page, jv.getByRole("combobox", { name: "Line 1 account" }), /^5100 General Expenses/)
  await jv.getByRole("textbox", { name: "Line 1 debit" }).fill("150")
  await choose(page, jv.getByRole("combobox", { name: "Line 2 account" }), /^1010 Bank/)
  await jv.getByRole("textbox", { name: "Line 2 credit" }).fill("150")
  await guide.step(
    "A manual journal",
    "The bank took a ₨150 service charge: Dr General Expenses, Cr Bank. Save is allowed once debits equal credits.",
    3000,
  )
  await jv.getByRole("button", { name: "Save & post" }).click()
  await guide.check("The journal is saved", () => expect(jv).toBeHidden({ timeout: 15_000 }), { severity: "blocker" })
  await page.goto("/dashboard/reports/accounting/register")
  await page.getByPlaceholder(/^Voucher no/).fill("Bank service charge")
  await guide.check(
    "It appears in the register as a posted manual journal",
    () => expect(page.getByRole("row").filter({ hasText: "Bank service charge for Ashwin" }).filter({ hasText: "Posted" }).first()).toBeVisible({ timeout: 15_000 }),
    { severity: "major" },
  )
  await guide.step("In the register", "Manual journals show as MJE; once posted they can only be reversed, not edited.", 2500)

  updateExtra({ journal: "Bank service charge for Ashwin" })
  await guide.finish("25-accounting")
})
