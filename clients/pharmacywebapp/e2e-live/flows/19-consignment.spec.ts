import { test, type Page } from "@playwright/test"
import { expect, Guide } from "../helpers/guide"
import { readState, signIn, updateExtra } from "../helpers/run-state"
import { visibleSoon } from "../helpers/ui"

/**
 * Flow 19 — Consignment stock.
 * Annapurna leaves 100 Metformin on consignment: the pharmacy sells it but owes nothing until it sells. After a
 * sale of 20, the outstanding position shows ₨24 owed; settling posts that to Annapurna's payable.
 */
function amountIn(text: string): number {
  const m = text.match(/रू([\d,]+\.\d\d)/)
  return m ? Number(m[1].replace(/,/g, "")) : NaN
}

async function payableOf(page: Page, supplier: string): Promise<number> {
  await page.goto("/dashboard/suppliers")
  return amountIn(await page.getByRole("row").filter({ hasText: supplier }).first().innerText({ timeout: 20_000 }))
}

test("19 · Consignment stock", async ({ page }, testInfo) => {
  const state = readState()
  const guide = new Guide(page, testInfo, "19 · Consignment stock", 10)
  await guide.install()

  await signIn(page, state.tenant, state.ownerEmail, state.ownerPassword)
  const payable0 = await payableOf(page, "Annapurna Drug House")

  await page.goto("/dashboard/inventory/consignment")
  await guide.step("Consignment", "Supplier-owned stock on your shelf: you pay only for what sells, when you settle.")
  await page.getByRole("button", { name: "Receive stock" }).first().click()
  const dialog = page.getByRole("dialog", { name: "Receive consignment stock" })
  await dialog.getByRole("combobox", { name: "Medicine" }).click()
  await page.keyboard.type("Metformin")
  await page.getByRole("option", { name: /Metformin 500mg/ }).first().click()
  await dialog.getByRole("combobox", { name: "Supplier" }).click()
  await page.getByRole("option", { name: /Annapurna Drug House/ }).first().click()
  await dialog.getByRole("spinbutton", { name: "Quantity" }).fill("100")
  await dialog.getByRole("spinbutton", { name: "Unit cost (NPR)" }).fill("1.2")
  await dialog.getByRole("textbox", { name: "Batch no. (optional)" }).fill("MET-C01")
  await dialog.getByRole("button", { name: "Expiry date (optional)" }).click()
  await page.getByRole("button", { name: "+1 yr" }).click()
  await dialog.getByRole("textbox", { name: "Shelf location (optional)" }).fill("Rack 3")
  await guide.step("Receive 100 Metformin on consignment", "From Annapurna at ₨1.20 each. It is sellable at once; nothing is owed yet.")
  await guide.pause(1000)
  await dialog.getByRole("button", { name: "Receive stock" }).click()
  await guide.check("The consignment stock is received", () => expect(dialog).toBeHidden({ timeout: 15_000 }), { severity: "blocker" })
  await guide.check(
    "The position shows 100 on hand, nothing sold",
    () => expect(page.getByRole("row").filter({ hasText: "MET-C01" }).first()).toBeVisible(),
    { severity: "major" },
  )
  await guide.check(
    "Receiving consignment doesn't add to what we owe Annapurna",
    async () => expect(await payableOf(page, "Annapurna Drug House")).toBe(payable0),
    { severity: "major" },
  )

  // Sell 20 (by card — the drawer was closed in flow 14). The consigned batch expires first, so it sells first.
  await page.goto("/dashboard/sales/new")
  await page.getByRole("button", { name: "Add Metformin 500mg to cart" }).click()
  await page.getByRole("spinbutton", { name: /Quantity for Metformin 500mg/ }).fill("20")
  await page.getByRole("spinbutton", { name: /Quantity for Metformin 500mg/ }).press("Tab")
  await guide.step("Sell 20 of them", "The consigned batch expires first, so it is picked first (FEFO).")
  await guide.check(
    "The counter picks the consigned batch MET-C01",
    () => expect(page.getByRole("list", { name: "Cart items" })).toContainText("MET-C01"),
    { severity: "major" },
  )
  await page.getByRole("button", { name: "Review & pay" }).click()
  const pay = page.getByRole("dialog", { name: "Review & pay" })
  await pay.getByRole("radio", { name: "Card" }).click()
  await pay.getByRole("button", { name: /^Complete sale/ }).click()
  const preview = page.getByRole("dialog", { name: /^Print invoice/ })
  await guide.check("The sale completes", () => expect(preview).toBeVisible({ timeout: 20_000 }), { severity: "blocker" })
  if (await visibleSoon(preview, 1_000)) await preview.getByRole("button", { name: "Close" }).first().click()

  await page.goto("/dashboard/inventory/consignment")
  const row = page.getByRole("row").filter({ hasText: "MET-C01" }).first()
  await guide.step("What we owe now", "20 sold × ₨1.20 = ₨24 owed to Annapurna, still unsettled.", 3000)
  await guide.check("The position shows 20 sold and ₨24 owed", () => expect(row).toContainText("24.00"), { severity: "major" })

  const settle = page.getByRole("button", { name: /Settle/ }).first()
  await settle.click()
  const confirm = page.getByRole("dialog").or(page.getByRole("alertdialog")).last()
  if (await visibleSoon(confirm, 3_000)) {
    await guide.step("Settle", "Settling posts what has sold (plus VAT) to Annapurna's payable; unsold stock stays theirs.")
    await guide.pause(1200)
    await confirm.getByRole("button", { name: /Settle|Confirm|Post/ }).last().click()
  }
  await guide.check(
    "A settlement is recorded",
    async () => {
      await page.getByRole("tab", { name: /Settlements/ }).click()
      await expect(page.getByRole("row").filter({ hasText: "Annapurna Drug House" }).first()).toContainText("24.00")
    },
    { severity: "blocker" },
  )
  // The settlement voucher posts a few seconds later.
  let payable1 = payable0
  await guide.check(
    "Annapurna's payable grows by ₨24 + 13% VAT = ₨27.12",
    () =>
      expect
        .poll(async () => {
          // A slow reload counts as "not yet" rather than failing the poll.
          const now = await payableOf(page, "Annapurna Drug House").catch(() => null)
          if (now === null) return null
          payable1 = now
          return Math.round((payable1 - payable0) * 100) / 100
        }, { timeout: 60_000, intervals: [2_000] })
        .toBe(27.12),
    { severity: "major" },
  )
  await guide.step("Payable updated", `Annapurna: ₨${payable0} → ₨${payable1} (₨24 for what sold, plus VAT).`)

  updateExtra({ consignment: { batch: "MET-C01", sold: 20, owed: 24 } })
  await guide.finish("19-consignment")
})
