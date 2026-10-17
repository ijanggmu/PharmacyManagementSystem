import { test, type Page } from "@playwright/test"
import { expect, Guide } from "../helpers/guide"
import { readState, signIn, updateExtra } from "../helpers/run-state"

/**
 * Flow 11 — Customer returns.
 * A walk-in brings back part of a cash sale: a sealed capsule goes back on the shelf, an opened strip is
 * quarantined, and the cash is paid back on a credit note. Then Ram Bahadur Thapa returns half of his credit
 * purchase, which comes off what he owes instead of being paid out.
 */
async function startReturn(page: Page, invoice: string) {
  await page.goto("/dashboard/returns")
  await page.getByRole("button", { name: "New customer return" }).first().click()
  const find = page.getByRole("dialog", { name: "New customer return" })
  await find.getByRole("textbox", { name: "Search sales" }).fill(invoice)
  await find.getByRole("button", { name: new RegExp(invoice.replace(/[/]/g, "\\/")) }).first().click()
  const dialog = page.getByRole("dialog", { name: new RegExp(`Process return`) })
  await dialog.waitFor()
  return dialog
}

async function stockOf(page: Page, medicine: string): Promise<number | null> {
  await page.goto("/dashboard/inventory")
  await page.getByRole("searchbox", { name: /Search medicines/ }).fill(medicine)
  const row = page.getByRole("row").filter({ hasText: medicine }).first()
  const text = await row.innerText({ timeout: 10_000 }).catch(() => "")
  const m = text.match(/([\d,]+)\s+(capsules|tablets)\s+at this branch/)
  return m ? Number(m[1].replace(/,/g, "")) : null
}

test("11 · Customer returns", async ({ page }, testInfo) => {
  const state = readState()
  const staff = state.extra.staff as Record<string, { email: string; password: string }> | undefined
  const invoices = (state.extra.invoices ?? {}) as Record<string, string | null>
  const cashier = staff?.cashier
  const guide = new Guide(page, testInfo, "11 · Customer returns", 11)
  await guide.install()

  await signIn(page, state.tenant, cashier?.email ?? state.ownerEmail, cashier?.password ?? state.ownerPassword)
  const omeBefore = await stockOf(page, "Omeprazole 20mg")
  await guide.step("Before the return", `Omeprazole on the shelf: ${omeBefore ?? "?"} capsules.`)

  // Part of the cash sale comes back.
  const cashInvoice = invoices.cash ?? "INV-MAIN"
  const dialog = await startReturn(page, cashInvoice)
  await guide.step("Find the sale", `The customer has the bill: ${cashInvoice} (₨32, paid in cash).`)
  await dialog.getByRole("spinbutton", { name: /Return quantity for Omeprazole/ }).fill("1")
  await dialog.getByRole("combobox", { name: "Packaging condition for Omeprazole 20mg" }).click()
  await page.getByRole("option", { name: /Sealed/ }).click()
  await dialog.getByRole("spinbutton", { name: /Return quantity for Cetamol/ }).fill("5")
  await dialog.getByRole("textbox", { name: "Reason for returning Cetamol 500mg" }).fill("Strip opened, fever gone")
  await dialog.getByRole("textbox", { name: "General return reason" }).fill("Customer no longer needs them")
  await guide.step(
    "What came back",
    "1 Omeprazole capsule, sealed → back to stock. 5 Cetamol tablets from an opened strip → quarantined, not resold.",
    3000,
  )
  await guide.check(
    "The return is worth ₨16 (₨6 + 5 × ₨2)",
    () => expect(dialog.getByText("रू16.00").first()).toBeVisible(),
    { severity: "major" },
  )
  await dialog.getByRole("button", { name: "Process return" }).click()
  const done = await guide.check(
    "The return is processed",
    () => expect(dialog).toBeHidden({ timeout: 15_000 }),
    { severity: "blocker" },
  )
  if (!done) await page.keyboard.press("Escape")
  await guide.step("Cash paid back on a credit note", "The ₨16 comes out of the drawer, so the drawer expects ₨16 less at close.")
  await guide.check(
    "The return is listed with a credit note",
    async () => {
      const row = page.getByRole("row").filter({ hasText: cashInvoice }).first()
      await expect(row).toBeVisible()
      await expect(row).toContainText(/CN-|Credit/i)
    },
    { severity: "major" },
  )

  const omeAfter = await stockOf(page, "Omeprazole 20mg")
  await guide.step("Sealed stock is back", `Omeprazole: ${omeBefore ?? "?"} → ${omeAfter ?? "?"} capsules. The opened Cetamol is not added back.`)
  if (omeBefore !== null) {
    await guide.check(
      "The sealed capsule is back in stock (+1)",
      async () => expect(omeAfter).toBe(omeBefore + 1),
      { severity: "major" },
    )
  }

  // A credit sale return reduces what the customer owes.
  if (invoices.credit) {
    const credit = await startReturn(page, invoices.credit)
    await guide.step("A credit sale comes back", `Ram Bahadur Thapa returns half of ${invoices.credit} (₨30 on his account).`)
    const qty = credit.getByRole("spinbutton", { name: /Return quantity for Cetrizine/ })
    await qty.fill("5")
    const unit = credit.getByRole("combobox", { name: "Return Cetrizine 10mg in" })
    if (await unit.isVisible().catch(() => false)) {
      await unit.click()
      await page.getByRole("option", { name: /tablet/i }).first().click()
    }
    await credit.getByRole("combobox", { name: "Packaging condition for Cetrizine 10mg" }).click()
    await page.getByRole("option", { name: /Sealed/ }).click()
    await credit.getByRole("textbox", { name: "General return reason" }).fill("Doctor changed the medicine")
    await guide.pause(1200)
    await credit.getByRole("button", { name: "Process return" }).click()
    await guide.check("The credit return is processed", () => expect(credit).toBeHidden({ timeout: 15_000 }), {
      severity: "blocker",
    })
    await guide.step("Comes off his account", "Nothing is paid out — the ₨15 is taken off what he owes (₨30 → ₨15).")
  }

  updateExtra({ returns: { cash: cashInvoice, credit: invoices.credit } })
  await guide.finish("11-returns")
})
