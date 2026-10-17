import { test, type Page } from "@playwright/test"
import { expect, Guide } from "../helpers/guide"
import { visibleSoon } from "../helpers/ui"
import { readState, signIn, updateExtra } from "../helpers/run-state"

/**
 * Flow 13 — Customer payments.
 * Customers settle what they owe: Krishna Karki pays ₨1,000 cash against his ₨1,500 opening balance, and
 * Ram Bahadur Thapa clears his remaining credit by eSewa. Balances and statements update.
 */
type Account = { email: string; password: string }

async function openProfile(page: Page, name: string): Promise<void> {
  await page.goto("/dashboard/customers")
  await page.getByRole("table").getByRole("button", { name, exact: true }).click()
  // Let the profile finish loading before using it.
  await page.waitForLoadState("networkidle").catch(() => undefined)
}

async function openPayment(page: Page) {
  await page.getByRole("button", { name: "Record payment" }).first().click()
  const dialog = page.getByRole("dialog", { name: "Record customer payment" })
  await dialog.waitFor()
  await page.waitForLoadState("networkidle").catch(() => undefined)
  return dialog
}

async function balanceText(page: Page, name: string): Promise<string> {
  await page.goto("/dashboard/customers")
  return page.getByRole("row").filter({ hasText: name }).first().innerText()
}

test("13 · Customer payments", async ({ page }, testInfo) => {
  const state = readState()
  const staff = state.extra.staff as Record<string, Account> | undefined
  const guide = new Guide(page, testInfo, "13 · Customer payments", 11)
  await guide.install()

  // The cashier is at the counter when Krishna comes to pay.
  await signIn(page, state.tenant, staff?.cashier?.email ?? state.ownerEmail, staff?.cashier?.password ?? state.ownerPassword)
  await page.goto("/dashboard/customers")
  await guide.step("Who owes what", "Balance owed is shown against each customer's credit limit.")
  await guide.check(
    "Krishna owes his ₨1,500 opening balance; Ram owes ₨15 after his return",
    async () => {
      await expect(page.getByRole("row").filter({ hasText: "Krishna Karki" })).toContainText("रू1,500.00")
      await expect(page.getByRole("row").filter({ hasText: "Ram Bahadur Thapa" })).toContainText("रू15.00")
    },
    { severity: "major" },
  )

  await openProfile(page, "Krishna Karki")
  await guide.step("Krishna pays at the counter", "The cashier opens his profile and records ₨1,000 in cash.")
  let dialog = await openPayment(page)
  await dialog.getByRole("textbox", { name: "Amount" }).fill("1000")
  await dialog.getByRole("button", { name: "Record receipt" }).click()
  const refused = await visibleSoon(page.getByText(/isn't allowed/).first(), 8_000)
  if (refused) {
    await guide.step("The cashier's role can't take it", "The button is offered, but the cashier role may not record customer payments.", 3000)
    await guide.finding({
      severity: "major",
      title: "Cashier is offered 'Record payment' on a customer profile but the Cashier role isn't allowed to record customer payments",
      expected: "A cashier can take a customer's payment at the counter (the drawer counts 'cash customers paid on account'), or the button is hidden",
      actual: "Clicking Record receipt shows 'Record customer payment failed — Your role isn't allowed to do this'",
    })
    await page.keyboard.press("Escape")
    await page.context().clearCookies()
    await signIn(page, state.tenant, staff?.manager?.email ?? state.ownerEmail, staff?.manager?.password ?? state.ownerPassword)
    await guide.step("The manager records it", "Signed in as the manager instead.")
    await openProfile(page, "Krishna Karki")
    dialog = await openPayment(page)
  } else {
    await guide.check("The receipt is recorded", () => expect(dialog).toBeHidden({ timeout: 15_000 }), { severity: "blocker" })
  }

  if (refused) {
    await dialog.getByRole("textbox", { name: "Amount" }).fill("1000")
    await dialog.getByRole("textbox", { name: "Note" }).fill("Part payment, rest next month")
    await guide.step("₨1,000 in cash", "Received as Cash — it goes into the cash book.")
    await guide.pause(2500)
    await guide.check(
      "What was typed is still in the form",
      async () => {
        await expect(dialog.getByRole("textbox", { name: "Amount" })).toHaveValue("1000")
        await expect(dialog.getByRole("textbox", { name: "Note" })).toHaveValue("Part payment, rest next month")
      },
      { severity: "major" },
    )
    await dialog.getByRole("button", { name: "Record receipt" }).click()
    await guide.check("The receipt is recorded", () => expect(dialog).toBeHidden({ timeout: 15_000 }), { severity: "blocker" })
  }

  await page.getByRole("tab", { name: /Statement/ }).click()
  await guide.step("His statement", "Opening balance ₨1,500, payment ₨1,000 — ₨500 still owed.", 3000)
  await guide.check(
    "The statement shows the payment and ₨500 left",
    async () => {
      await expect(page.getByText("1,000.00").first()).toBeVisible()
      await expect(page.getByText("500.00").first()).toBeVisible()
    },
    { severity: "major" },
  )

  await openProfile(page, "Ram Bahadur Thapa")
  const ram = await openPayment(page)
  await ram.getByRole("button", { name: "Use full" }).click()
  await ram.getByRole("combobox", { name: "Received as" }).click()
  const wallet = page.getByRole("option", { name: /eSewa/i })
  if (await wallet.isVisible().catch(() => false)) await wallet.click()
  else await page.getByRole("option", { name: /Bank/i }).first().click()
  await ram.getByRole("textbox", { name: "Reference" }).fill("ES-990021")
  await guide.step("Ram clears his account by eSewa", "Use full fills what he owes (₨15). A wallet receipt doesn't touch the drawer.")
  await guide.pause(800)
  await ram.getByRole("button", { name: "Record receipt" }).click()
  await guide.check("Ram's receipt is recorded", () => expect(ram).toBeHidden({ timeout: 15_000 }), { severity: "blocker" })

  const krishna = await balanceText(page, "Krishna Karki")
  const ramRow = await balanceText(page, "Ram Bahadur Thapa")
  await guide.step("Balances updated", "Krishna owes ₨500; Ram owes nothing.")
  await guide.check("Krishna now owes ₨500", async () => expect(krishna).toContain("रू500.00"), { severity: "major" })
  await guide.check("Ram now owes nothing", async () => expect(ramRow).toMatch(/रू0\.00/), { severity: "major" })

  updateExtra({ customerReceipts: { cash: 1000, wallet: 15, by: refused ? "manager" : "cashier" } })
  await guide.finish("13-customer-payments")
})
