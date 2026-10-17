import { test, type Page } from "@playwright/test"
import { expect, Guide } from "../helpers/guide"
import { readState, signIn, updateExtra, type RunState } from "../helpers/run-state"

/**
 * Flow 12 — Refunds (money back, no goods).
 * The cashier raises two refund requests; they wait as Pending. The manager approves one and rejects the other,
 * and the cashier pays the approved one out, which completes it and issues a credit note.
 */
type Account = { email: string; password: string }

async function createRefund(
  page: Page,
  guide: Guide,
  invoice: string,
  medicine: string,
  qty: string,
  reason: string,
  note: string,
) {
  await page.goto("/dashboard/refunds")
  await page.getByRole("button", { name: "New refund" }).first().click()
  const dialog = page.getByRole("dialog", { name: "New refund" })
  await dialog.getByRole("combobox", { name: "Sale" }).click()
  await page.keyboard.type(invoice.slice(-5))
  await page.getByRole("option", { name: new RegExp(invoice.replace(/[/]/g, "\\/")) }).first().click()
  await dialog.getByRole("combobox", { name: "Refund reason" }).click()
  await page.getByRole("option", { name: reason, exact: true }).click()
  await dialog.getByRole("group", { name: medicine }).getByRole("spinbutton", { name: "Refund quantity" }).fill(qty)
  await dialog.getByRole("textbox", { name: "Notes" }).fill(note)
  await guide.pause(1500)
  await dialog.getByRole("button", { name: /^Create refund/ }).click()
  return guide.check(`The refund on ${invoice} is created as Pending`, async () => {
    await expect(dialog).toBeHidden({ timeout: 15_000 })
    await expect(page.getByRole("row").filter({ hasText: invoice }).first()).toContainText(/Pending/i)
  }, { severity: "blocker" })
}

async function rowAction(page: Page, invoice: string, action: string) {
  const row = page.getByRole("row").filter({ hasText: invoice }).first()
  await row.getByRole("button", { name: /^Actions for refund/ }).click()
  await page.getByRole("menuitem", { name: action }).click()
}

async function switchUser(page: Page, state: RunState, account: Account | undefined) {
  await page.context().clearCookies()
  await signIn(page, state.tenant, account?.email ?? state.ownerEmail, account?.password ?? state.ownerPassword)
}

test("12 · Refunds", async ({ page }, testInfo) => {
  const state = readState()
  const staff = state.extra.staff as Record<string, Account> | undefined
  const invoices = (state.extra.invoices ?? {}) as Record<string, string | null>
  const guide = new Guide(page, testInfo, "12 · Refunds", 10)
  await guide.install()
  const approveInvoice = invoices.split ?? ""
  const rejectInvoice = invoices.held ?? ""

  await switchUser(page, state, staff?.cashier)
  await page.goto("/dashboard/refunds")
  await guide.step(
    "Refund = money back only",
    "Use a refund when the customer is owed money but no goods come back (e.g. overcharged). Goods coming back is a return (flow 11).",
  )
  await guide.check(
    "The empty refunds message reads correctly",
    () => expect(page.getByText(/paid sale\.\./)).toHaveCount(0),
    { severity: "cosmetic", expected: "\"…for a paid sale.\" (one full stop)" },
  )

  await guide.step("Refund request 1", `${approveInvoice}: the customer was charged for 10 Vitamin C tablets they never received.`)
  await createRefund(page, guide, approveInvoice, "Vitamin C 500mg", "10", "Other", "Pack was missing from the bag")
  await guide.step("Refund request 2", `${rejectInvoice}: the customer asks for money back on an Omeprazole capsule they kept.`)
  await createRefund(page, guide, rejectInvoice, "Omeprazole 20mg", "1", "Customer dissatisfaction", "Changed mind after taking it")
  await guide.step("Both wait for a manager", "A cashier can request refunds but not approve them.")
  await page.getByRole("row").filter({ hasText: approveInvoice }).first().getByRole("button", { name: /^Actions for refund/ }).click()
  const offered = await page.getByRole("menuitem", { name: "Approve refund" }).isVisible().catch(() => false)
  if (offered) {
    await page.getByRole("menuitem", { name: "Approve refund" }).click()
    await guide.check(
      "A cashier can't approve a refund",
      async () => {
        await expect(page.getByText(/isn't allowed/).first()).toBeVisible()
        await expect(page.getByRole("row").filter({ hasText: approveInvoice }).first()).toContainText(/Pending/i)
      },
      { severity: "blocker" },
    )
    await guide.finding({
      severity: "minor",
      title: "Refund actions menu offers Approve / Mark as completed to a cashier, who is then refused",
      expected: "Actions the role isn't allowed to do are hidden (as elsewhere in the app)",
      actual: "Cashier sees 'Approve refund' and 'Mark as completed'; clicking shows 'Your role isn't allowed to do this'",
    })
  } else {
    await page.keyboard.press("Escape")
  }

  await switchUser(page, state, staff?.manager)
  await page.goto("/dashboard/refunds")
  await guide.step("The manager reviews", "Approve the missing pack; reject the capsule the customer kept.")
  await guide.check(
    "Before anything is paid, Total refunded is ₨0",
    () => expect(page.getByText("Total refunded").locator("..").locator("..")).toContainText("रू0.00"),
    { severity: "major", expected: "Total refunded ₨0 while both refunds are only pending" },
  )
  await rowAction(page, approveInvoice, "Approve refund")
  await guide.check(
    "Approved",
    () => expect(page.getByRole("row").filter({ hasText: approveInvoice }).first()).toContainText(/Approved/i),
    { severity: "blocker" },
  )
  await rowAction(page, rejectInvoice, "Reject refund…")
  await page.getByRole("alertdialog").or(page.getByRole("dialog")).getByRole("button", { name: "Reject refund" }).click()
  await guide.check(
    "Rejected",
    () => expect(page.getByRole("row").filter({ hasText: rejectInvoice }).first()).toContainText(/Rejected/i),
    { severity: "blocker" },
  )
  await guide.pause(1500)

  await guide.step("Pay it out", "The manager hands over the ₨40 and marks the refund completed — it is posted to the books.")
  await rowAction(page, approveInvoice, "Mark as completed")
  await guide.check(
    "Completed, with a credit note",
    async () => {
      const row = page.getByRole("row").filter({ hasText: approveInvoice }).first()
      await expect(row).toContainText(/Completed/i)
      await expect(row).toContainText(/CN-/)
    },
    { severity: "blocker" },
  )
  await guide.check(
    "Total refunded counts only the refund actually paid (₨40)",
    () => expect(page.getByText("Total refunded").locator("..").locator("..")).toContainText("रू40.00"),
    { severity: "major", expected: "Total refunded ₨40 — the rejected ₨6 refund paid nothing" },
  )
  await guide.step("Paid out", "Completed refunds post to the books and the VAT credit-note register; rejected ones pay nothing.", 2500)

  updateExtra({ refunds: { completed: approveInvoice, rejected: rejectInvoice } })
  await guide.finish("12-refunds")
})
