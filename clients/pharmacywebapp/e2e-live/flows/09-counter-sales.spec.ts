import { test, type Page } from "@playwright/test"
import { expect, Guide } from "../helpers/guide"
import { visibleSoon } from "../helpers/ui"
import { readState, signIn, updateExtra } from "../helpers/run-state"

/**
 * Flow 09 — Counter sales.
 * The cashier (shift opened in flow 08) rings up the everyday kinds of sale: cash with change, by tablet / strip /
 * box, a barcode scan, card, a wallet, a split bill, line and bill discounts, a bill held and recalled, and a credit
 * sale to a registered customer. Each completed sale prints a tax invoice.
 */
type Pay = ReturnType<Page["getByRole"]>

async function openPay(page: Page): Promise<Pay> {
  await page.getByRole("button", { name: "Review & pay" }).click()
  const pay = page.getByRole("dialog", { name: "Review & pay" })
  await pay.waitFor()
  return pay
}

interface Approver {
  email: string
  password: string
}

/** Fills the manager-approval prompt (shown when a discount is above the cashier's limit). */
async function approve(page: Page, guide: Guide, approver: Approver | undefined, reason: string): Promise<boolean> {
  const dialog = page.getByRole("dialog", { name: "Manager approval needed" })
  if (!(await visibleSoon(dialog, 3_000))) return false
  await guide.step(
    "Manager approval",
    "The discount is above the cashier's 5% limit, so a manager approves it with their own sign-in. It is recorded with their name.",
    3000,
  )
  if (!approver) return true
  await dialog.getByRole("textbox", { name: "Approver email or username" }).fill(approver.email)
  await dialog.getByLabel("Approver password").fill(approver.password)
  await dialog.getByRole("textbox", { name: "Reason (optional)" }).fill(reason)
  await guide.pause(1000)
  await dialog.getByRole("button", { name: "Approve" }).click()
  await guide.check("The manager's approval is accepted", () => expect(dialog).toBeHidden({ timeout: 30_000 }), {
    severity: "major",
  })
  return true
}

/** Empties the counter after a failed step so the next sale starts clean. */
async function resetCounter(page: Page): Promise<void> {
  for (let i = 0; i < 3; i++) await page.keyboard.press("Escape")
  await page.getByRole("button", { name: "Clear all items from cart" }).click({ timeout: 3_000 }).catch(() => undefined)
  const confirm = page.getByRole("alertdialog")
  if (await visibleSoon(confirm, 1_000)) {
    await confirm.getByRole("button", { name: /Clear|Yes|Confirm/ }).first().click()
  }
}

/** Completes the sale and returns the invoice number shown on the print preview (or null). */
async function complete(page: Page, guide: Guide, pay: Pay, label: string, approver?: Approver): Promise<string | null> {
  await pay.getByRole("button", { name: /^Complete sale/ }).click()
  // The approval prompt only shows once the server answers, so wait for whichever comes first.
  const prompt = page.getByRole("dialog", { name: "Manager approval needed" })
  await prompt.or(page.getByRole("dialog", { name: /^Print invoice/ })).first().waitFor({ timeout: 20_000 }).catch(() => undefined)
  if (await approve(page, guide, approver, "Regular customer, monthly diabetes medicine")) {
    const again = pay.getByRole("button", { name: /^Complete sale/ })
    if (await visibleSoon(again, 2_000)) await again.click()
  }
  const preview = page.getByRole("dialog", { name: /^Print invoice/ })
  const ok = await guide.check(
    `${label}: the sale completes and the invoice opens`,
    () => expect(preview).toBeVisible({ timeout: 20_000 }),
    { severity: "blocker" },
  )
  if (!ok) {
    await guide.pause(1500)
    await resetCounter(page)
    return null
  }
  const title = (await preview.getByRole("heading").first().innerText()).trim()
  await guide.pause(2200)
  await preview.getByRole("button", { name: "Close" }).first().click()
  return title.replace(/^Print invoice\s*/, "") || null
}

test("09 · Counter sales", async ({ page }, testInfo) => {
  const state = readState()
  const staff = state.extra.staff as Record<string, Approver> | undefined
  const cashier = staff?.cashier
  const manager = staff?.manager
  const guide = new Guide(page, testInfo, "09 · Counter sales", 20)
  await guide.install()
  const invoices: Record<string, string | null> = {}

  await signIn(page, state.tenant, cashier?.email ?? state.ownerEmail, cashier?.password ?? state.ownerPassword)
  await page.goto("/dashboard/sales/new")
  await guide.step("The counter", "Search or scan medicines on the left; the bill builds on the right. Each line shows the batch and rack to pick from.")

  // 1. Cash with change — one strip of Cetamol and two Omeprazole capsules.
  await page.getByRole("button", { name: "Add 1 pack (10 tablets) of Cetamol 500mg to cart" }).click()
  await page.getByRole("button", { name: "Add Omeprazole 20mg to cart" }).click()
  await page.getByRole("button", { name: "One more capsule of Omeprazole 20mg" }).click()
  await guide.step("Cash sale", "1 strip of Cetamol (₨20, VAT-exempt) + 2 Omeprazole capsules (₨12, VAT included) = ₨32.")
  await guide.check(
    "The bill totals ₨32",
    () => expect(page.getByRole("complementary", { name: "Current sale" }).getByText("रू32.00").last()).toBeVisible(),
    { severity: "major" },
  )
  let pay = await openPay(page)
  await pay.getByRole("textbox", { name: "Cash received (optional)" }).fill("50")
  await guide.step("Customer hands over ₨50", "The change to give back is worked out: ₨18.")
  await guide.check("Change shows ₨18", () => expect(pay.getByText("रू18.00").first()).toBeVisible(), { severity: "major" })
  invoices.cash = await complete(page, guide, pay, "Cash sale")
  await guide.check(
    "The invoice number follows INV-<branch>-<fiscal year>-<number>",
    async () => expect(invoices.cash ?? "").toMatch(/^INV-MAIN-\d{4}\/\d{2}-\d{5}$/),
    { severity: "minor" },
  )

  // 2. Sell by the box, pay by card.
  await page.getByRole("button", { name: "Add Cetamol 500mg to cart" }).click()
  await page.getByRole("radio", { name: "box" }).click()
  await guide.step("Sell a whole box", "The same medicine can go by tablet, strip or box — stock is always counted in tablets.")
  await guide.check(
    "One box of Cetamol is ₨200 (100 tablets × ₨2)",
    () => expect(page.getByRole("complementary", { name: "Current sale" }).getByText("रू200.00").last()).toBeVisible(),
    { severity: "major" },
  )
  pay = await openPay(page)
  await pay.getByRole("radio", { name: "Card" }).click()
  await pay.getByRole("textbox", { name: /Card slip/ }).fill("004512")
  await guide.step("Pay by card", "Card money goes to the bank account, not the drawer. The slip number is kept for matching.")
  invoices.card = await complete(page, guide, pay, "Card sale")

  // 3. Barcode scan, pay by eSewa.
  const search = page.getByRole("searchbox", { name: /Search medicines/ })
  await search.fill("8901234500017")
  await search.press("Enter")
  await guide.step("Scan a barcode", "A scanner types the code and presses Enter — the medicine drops straight into the bill.")
  const scanned = await guide.check(
    "Scanning the barcode adds Cetamol to the bill",
    () => expect(page.getByRole("list", { name: "Cart items" }).getByText("Cetamol 500mg").first()).toBeVisible(),
    { severity: "major" },
  )
  if (!scanned) await page.getByRole("button", { name: "Add Cetamol 500mg to cart" }).click()
  pay = await openPay(page)
  await pay.getByRole("radio", { name: "eSewa" }).click()
  await guide.step("Pay by eSewa", "Wallet payments (eSewa, Khalti, Fonepay) take the transaction ID; the money lands in the wallet account.")
  const ref = pay.getByRole("textbox", { name: /transaction ID/i })
  if (await ref.isVisible().catch(() => false)) await ref.fill("ES-778812")
  invoices.wallet = await complete(page, guide, pay, "eSewa sale")

  // 4. Line + bill discounts.
  await page.getByRole("button", { name: "Add 1 pack (10 tablets) of Metformin 500mg to cart" }).click()
  await page.getByRole("button", { name: "Add 1 pack (10 tablets) of Metformin 500mg to cart" }).click()
  await page.getByRole("spinbutton", { name: "Discount percent for Metformin 500mg" }).fill("10")
  await page.getByRole("spinbutton", { name: "Bill discount" }).fill("5")
  await guide.step("Discounts", "2 strips of Metformin = ₨50. 10% off the line → ₨45, then 5% off the bill → ₨42.75.")
  await guide.check(
    "The total after both discounts is ₨42.75",
    () => expect(page.getByRole("complementary", { name: "Current sale" }).getByText("रू42.75").last()).toBeVisible(),
    { severity: "major" },
  )
  pay = await openPay(page)
  await pay.getByRole("button", { name: "Exact" }).click()
  invoices.discount = await complete(page, guide, pay, "Discounted sale", manager)

  // 5. Split bill: part cash, part Fonepay. First: a bill discount in % should stay a % when more is added.
  await page.getByRole("button", { name: "Add 1 pack (10 capsules) of Omeprazole 20mg to cart" }).click()
  await page.getByRole("spinbutton", { name: "Bill discount" }).fill("2")
  await page.getByRole("button", { name: "Add 1 pack (10 tablets) of Vitamin C 500mg to cart" }).click()
  await guide.check(
    "A bill discount typed as 2% stays 2% when another item is added",
    () => expect(page.getByRole("spinbutton", { name: "Bill discount" })).toHaveValue(/^2(\.0+)?$/),
    { severity: "major", expected: "Bill discount still 2% (₨2 on ₨100)" },
  )
  await page.getByRole("spinbutton", { name: "Bill discount" }).fill("0")
  pay = await openPay(page)
  await pay.getByRole("button", { name: "Split payment" }).click()
  await pay.getByRole("textbox", { name: "Cash amount" }).fill("60")
  await pay.getByRole("button", { name: "Remaining" }).last().click()
  await guide.step("Split the bill", "₨100: the customer pays ₨60 in cash and the remaining ₨40 by Fonepay.")
  await guide.check(
    "The two payments cover the bill",
    () => expect(pay.getByRole("textbox", { name: "Fonepay amount" })).toHaveValue(/^40(\.00)?$/),
    { severity: "major" },
  )
  invoices.split = await complete(page, guide, pay, "Split sale")

  // 6. Hold a bill and recall it.
  await page.getByRole("button", { name: "Add Omeprazole 20mg to cart" }).click()
  await page.getByRole("button", { name: "Hold F6" }).click()
  const hold = page.getByRole("dialog", { name: "Hold this bill" })
  await hold.getByRole("textbox", { name: "Name for this bill" }).fill("Customer went to the ATM")
  await guide.step("Hold a bill", "The customer steps away — park the bill, serve the next person, and recall it later.")
  await hold.getByRole("button", { name: "Hold bill" }).click()
  await guide.check(
    "Holding clears the counter",
    () => expect(page.getByRole("heading", { name: "No items yet" })).toBeVisible(),
    { severity: "major" },
  )
  await page.getByRole("button", { name: "Held bills F7" }).click()
  await guide.step("Recall it", "Held bills are listed by name; pick one to bring it back.")
  const held = page.getByRole("dialog")
  await held.getByText("Customer went to the ATM").first().click()
  const recall = held.getByRole("button", { name: /Recall|Resume|Open/ }).first()
  if (await visibleSoon(recall, 2_000)) await recall.click()
  await guide.check(
    "The held bill comes back with its items",
    () => expect(page.getByRole("list", { name: "Cart items" }).getByText("Omeprazole 20mg").first()).toBeVisible(),
    { severity: "major" },
  )
  pay = await openPay(page)
  await pay.getByRole("button", { name: "Exact" }).click()
  invoices.held = await complete(page, guide, pay, "Recalled sale")

  // 7. Credit needs a customer.
  await page.getByRole("button", { name: "Add 1 pack (10 tablets) of Cetrizine 10mg to cart" }).click()
  pay = await openPay(page)
  await pay.getByRole("radio", { name: "Credit" }).click()
  await guide.step("Credit needs a customer", "A walk-in can't buy on credit — there is nobody to collect from.")
  await guide.check(
    "Credit is not allowed for a walk-in sale",
    async () => {
      await pay.getByRole("button", { name: /^Complete sale/ }).click({ timeout: 3_000 }).catch(() => undefined)
      await expect(page.getByRole("dialog", { name: /^Print invoice/ })).toBeHidden({ timeout: 3_000 })
    },
    { severity: "major", expected: "Credit refused without a customer" },
  )
  await guide.pause(1500)
  await page.getByRole("button", { name: "Back to cart" }).click().catch(() => page.keyboard.press("Escape"))

  await page.getByRole("combobox", { name: /Select customer/ }).click()
  await page.getByRole("option", { name: /Ram Bahadur Thapa/ }).click()
  await guide.step("Sell on credit to Ram Bahadur Thapa", "His credit limit is ₨5,000; the bill goes on his account and he pays later (flow 13).")
  pay = await openPay(page)
  await pay.getByRole("radio", { name: "Credit" }).click()
  invoices.credit = await complete(page, guide, pay, "Credit sale")

  await page.goto("/dashboard/sales")
  await guide.step("Sales history", "Every invoice of the day with its payment method — open one to reprint, return or refund.", 3000)
  await guide.check(
    "Today's sales are listed",
    () => expect(page.getByText(invoices.cash ?? "INV-").first()).toBeVisible(),
    { severity: "major" },
  )

  updateExtra({ invoices })
  await guide.finish("09-counter-sales")
})
