import { test } from "@playwright/test"
import { expect, Guide } from "../helpers/guide"
import { readState, signIn, updateExtra } from "../helpers/run-state"
import { importFile, isoDaysFromNow, writeRunFile, visibleSoon } from "../helpers/ui"

/**
 * Flow 07 — Opening stock & balances.
 * Going live: older batches already on the shelf come in through the stock import (two of them close to expiry,
 * which flow 22 uses), then the cash in the till and money in the bank are posted as opening balances.
 * Customer and supplier balances were brought in with their files in flows 04–05, so they are not entered again.
 */
test("07 · Opening stock & balances", async ({ page }, testInfo) => {
  const state = readState()
  const guide = new Guide(page, testInfo, "07 · Opening stock & balances", 8)
  await guide.install()

  const nearExpiry = isoDaysFromNow(20)
  const csv = writeRunFile(
    "opening-stock.csv",
    [
      "Barcode,Medicine name,Strength,Form,Batch no,Expiry date,Quantity,Cost price,Selling price,Rack",
      `,Cetamol 500mg,500mg,Tablet,CTM-2401,${nearExpiry},150,1.1,2,Rack 1`,
      `,Vitamin C 500mg,500mg,Tablet,VTC-2401,${isoDaysFromNow(25)},50,1.9,4,Rack 4`,
    ].join("\n"),
  )

  await signIn(page, state.tenant, state.ownerEmail, state.ownerPassword)
  await page.goto("/dashboard/inventory")
  await guide.step(
    "Stock already on the shelf",
    "Older batches you already hold come in with their own batch numbers and expiry dates, valued at cost.",
  )
  const imported = await importFile(page, guide, "Import stock", csv)
  await guide.check("The opening stock file imports", async () => expect(imported).toMatch(/Imported/), { severity: "major" })

  await page.goto("/dashboard/inventory")
  await guide.step("Near-expiry batches are flagged", `Both imported batches expire within 30 days (Cetamol on ${nearExpiry}).`)
  await guide.check(
    "Expiring soon counts the two near-expiry batches",
    () => expect(page.getByRole("button", { name: /^Expiring soon [2-9]/ })).toBeVisible(),
    { severity: "major", expected: "Expiring soon shows 2" },
  )
  await guide.check(
    "Cetamol's stock adds the imported batch (500 + 150)",
    () => expect(page.getByRole("row").filter({ hasText: "Cetamol 500mg" })).toContainText("650"),
    { severity: "major" },
  )

  await page.goto("/dashboard/settings/opening-balances")
  await guide.step(
    "Opening balances",
    "Cash in the till and money in the bank on the go-live day. Stock, customers and suppliers came in with their imports.",
    3000,
  )
  await page.getByRole("button", { name: "Go-live date" }).click()
  await page.getByRole("button", { name: "Today", exact: true }).click()
  await page.getByRole("button", { name: "Next: enter balances" }).click()

  await page.getByRole("textbox", { name: "1000Cash" }).fill("20000")
  await page.getByRole("textbox", { name: "1010Bank" }).fill("150000")
  await guide.step("Cash ₨20,000 · Bank ₨150,000", "Whatever doesn't balance goes to Owner's Equity automatically.")
  await guide.pause(1000)
  await page.getByRole("button", { name: "Review" }).click()
  await guide.step("Review and post", "One balanced opening voucher: cash and bank on the debit side, Owner's Equity on the credit side.")
  await guide.check(
    "The review shows ₨170,000 to post",
    () => expect(page.getByText(/1,70,000|170,000/).first()).toBeVisible(),
    { severity: "major" },
  )
  await page.getByRole("button", { name: /^Post/ }).first().click()
  const confirm = page.getByRole("alertdialog").or(page.getByRole("dialog"))
  if (await visibleSoon(confirm, 2_000)) {
    await confirm.getByRole("button", { name: /^Post|Confirm/ }).first().click()
  }
  await guide.check(
    "Opening balances are posted",
    () => expect(page.getByRole("heading", { name: /Opening balances/ }).first()).not.toContainText("Not set", { timeout: 15_000 }),
    { severity: "blocker" },
  )
  await guide.step("Posted", "The trial balance, balance sheet and cash book now start from these figures.", 3000)

  updateExtra({ openingCash: 20000, openingBank: 150000 })
  await guide.finish("07-opening-stock-and-balances")
})
