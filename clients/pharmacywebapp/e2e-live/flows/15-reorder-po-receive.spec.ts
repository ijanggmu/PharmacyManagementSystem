import { test, type Page } from "@playwright/test"
import { expect, Guide } from "../helpers/guide"
import { readState, signIn, updateExtra } from "../helpers/run-state"
import { visibleSoon } from "../helpers/ui"

/**
 * Flow 15 — Reorder → purchase order → receive.
 * Cetrizine is below its reorder level, so the manager raises a purchase order from the low-stock list, adds
 * Amoxil, approves it, and receives the delivery: all the Cetrizine, but only part of the Amoxil. The balance goes
 * onto a backorder, stock goes up by batch, and the supplier's bill lands in what we owe them.
 */
async function stockOf(page: Page, medicine: string): Promise<number | null> {
  await page.goto("/dashboard/inventory")
  await page.getByRole("searchbox", { name: /Search medicines/ }).fill(medicine)
  const text = await page.getByRole("row").filter({ hasText: medicine }).first().innerText({ timeout: 10_000 }).catch(() => "")
  const m = text.match(/([\d,]+)\s+(capsules|tablets)\s+at this branch/)
  return m ? Number(m[1].replace(/,/g, "")) : null
}

async function payable(page: Page, supplier: string): Promise<string> {
  await page.goto("/dashboard/suppliers")
  return page.getByRole("row").filter({ hasText: supplier }).first().innerText({ timeout: 10_000 }).catch(() => "")
}

async function pickExpiry(page: Page, button: ReturnType<Page["getByRole"]>): Promise<void> {
  await button.click()
  await page.getByRole("button", { name: "+2 yr" }).click()
}

test("15 · Reorder → purchase order → receive", async ({ page }, testInfo) => {
  const state = readState()
  const manager = (state.extra.staff as Record<string, { email: string; password: string }> | undefined)?.manager
  const guide = new Guide(page, testInfo, "15 · Reorder → purchase order → receive", 13)
  await guide.install()

  await signIn(page, state.tenant, manager?.email ?? state.ownerEmail, manager?.password ?? state.ownerPassword)
  const cetBefore = await stockOf(page, "Cetrizine 10mg")
  const amxBefore = await stockOf(page, "Amoxil 500mg")
  const payBefore = await payable(page, "Everest Medical Suppliers")
  await guide.step("Payable before", `Everest Medical Suppliers — what we owe them now. Cetrizine on the shelf: ${cetBefore ?? "?"}.`)

  await page.goto("/dashboard/purchases")
  await page.getByRole("button", { name: "Reorder low stock" }).click()
  const po = page.getByRole("dialog", { name: "New purchase order" })
  await po.waitFor()
  await guide.step(
    "Reorder low stock",
    "The order starts from what is below its reorder level — Cetrizine, from the supplier it is linked to, topped up to its maximum.",
    3000,
  )
  await guide.check(
    "The low-stock reorder suggests Cetrizine from Everest",
    async () => {
      await expect(po.getByRole("combobox", { name: "Supplier" })).toContainText("Everest Medical Suppliers")
      await expect(po.getByText("Cetrizine 10mg").first()).toBeVisible()
    },
    { severity: "major" },
  )
  await po.getByRole("spinbutton", { name: "Quantity, line 1" }).fill("500")

  await po.getByRole("button", { name: "Add medicine" }).click()
  const line2 = po.getByRole("row").nth(2)
  await line2.getByRole("combobox").first().click()
  await page.keyboard.type("Amoxil")
  await page.getByRole("option", { name: /Amoxil 500mg/ }).first().click()
  await po.getByRole("spinbutton", { name: "Quantity, line 2" }).fill("200")
  await po.getByRole("textbox", { name: "Unit cost, line 2" }).fill("8")
  await po.getByRole("textbox", { name: "Notes" }).fill("Monthly top-up")
  await guide.step("Add Amoxil", "200 capsules at ₨8. VAT (13%) is added to the bill; the totals update as you type.")
  await guide.check(
    "The order is ₨2,350 before VAT (500 × ₨1.50 + 200 × ₨8)",
    () => expect(po.locator("xpath=.//dt[normalize-space()='Taxable']/following-sibling::dd[1]")).toContainText("2,350.00"),
    { severity: "major", expected: "Taxable ₨2,350.00" },
  )
  await guide.pause(1200)
  await po.getByRole("button", { name: "Create draft PO" }).click()
  await guide.check("The draft PO is created", () => expect(po).toBeHidden({ timeout: 15_000 }), { severity: "blocker" })

  const row = page.getByRole("row").filter({ hasText: "Everest Medical Suppliers" }).first()
  const poNo = ((await row.innerText().catch(() => "")).match(/PO-[\w/-]+/) ?? [null])[0]
  await guide.step("Draft → approve", `${poNo ?? "The PO"} is a draft until a manager approves it.`)
  await row.getByRole("button", { name: "Approve" }).click()
  await guide.check("The PO is approved", () => expect(row).toContainText("Approved"), { severity: "blocker" })

  // Cetrizine is now on order; reordering again should not suggest it a second time.
  await page.getByRole("button", { name: "Reorder low stock" }).click()
  const again = page.getByRole("dialog", { name: "New purchase order" })
  const offeredAgain = await visibleSoon(again.getByText("Cetrizine 10mg"), 4_000)
  await guide.check(
    "Reorder doesn't suggest Cetrizine again while it is on an open PO",
    async () => expect(offeredAgain).toBe(false),
    { severity: "minor", expected: "Items already on an approved, unreceived PO are left out (or shown as on order)" },
  )
  if (await visibleSoon(again, 2_000)) {
    await again.getByRole("button", { name: "Cancel" }).click()
    const discard = page.getByRole("dialog", { name: "Discard this purchase order?" })
    if (await visibleSoon(discard, 2_000)) await discard.getByRole("button", { name: "Discard", exact: true }).click()
    await again.waitFor({ state: "hidden", timeout: 10_000 }).catch(() => page.keyboard.press("Escape"))
  }

  await row.getByRole("button", { name: "Receive" }).click()
  const grn = page.getByRole("dialog", { name: "Receive goods" })
  await grn.waitFor()
  await guide.step("The delivery arrives", "All 500 Cetrizine came, but only 120 of the 200 Amoxil. Enter what actually arrived, with batch and expiry.")
  await grn.getByRole("textbox", { name: "Supplier tax invoice / bill no." }).fill("EMS-7781")
  await grn.getByRole("textbox", { name: "Batch number for Cetrizine 10mg" }).fill("CTZ-2501")
  await pickExpiry(page, grn.getByRole("button", { name: "Expiry date for Cetrizine 10mg" }))
  await grn.getByRole("spinbutton", { name: "Quantity to receive for Amoxil 500mg" }).fill("120")
  await grn.getByRole("textbox", { name: "Batch number for Amoxil 500mg" }).fill("AMX-2501")
  await pickExpiry(page, grn.getByRole("button", { name: "Expiry date for Amoxil 500mg" }))
  const sell = grn.getByRole("textbox", { name: "Selling price for Amoxil 500mg" })
  if (!(await sell.inputValue())) await sell.fill("12")
  const backorder = grn.locator("#create-backorder")
  await guide.step("Short delivery → backorder", "The 80 Amoxil still owed go onto a new draft PO, so nothing is forgotten.")
  await guide.check(
    "A backorder option appears for the short line, switched on",
    async () => {
      await expect(backorder).toBeVisible()
      await expect(backorder).toBeChecked()
    },
    { severity: "major" },
  )
  await guide.pause(1200)
  await grn.getByRole("button", { name: "Post GRN" }).click()
  await guide.check("The goods receipt posts", () => expect(grn).toBeHidden({ timeout: 20_000 }), { severity: "blocker" })

  await guide.step("Order received; backorder raised", "The PO closes at what arrived, and a new draft PO holds the 80 Amoxil.", 3000)
  await guide.check(
    "The original PO shows received and a backorder draft for Everest exists",
    async () => {
      await expect(page.getByRole("row").filter({ hasText: poNo ?? "PO-" }).first()).toContainText(/Received/i)
      await expect(page.getByRole("row").filter({ hasText: "Everest Medical Suppliers" }).filter({ hasText: "Draft" })).toHaveCount(1)
    },
    { severity: "major" },
  )

  const cetAfter = await stockOf(page, "Cetrizine 10mg")
  const amxAfter = await stockOf(page, "Amoxil 500mg")
  await guide.step("Stock went up", `Cetrizine ${cetBefore ?? "?"} → ${cetAfter ?? "?"}, Amoxil ${amxBefore ?? "?"} → ${amxAfter ?? "?"}.`)
  if (cetBefore !== null) {
    await guide.check("Cetrizine +500", async () => expect(cetAfter).toBe(cetBefore + 500), { severity: "blocker" })
  }
  if (amxBefore !== null) {
    await guide.check("Amoxil +120 (only what arrived)", async () => expect(amxAfter).toBe(amxBefore + 120), { severity: "blocker" })
  }
  await guide.check(
    "Cetrizine is no longer low stock",
    async () => {
      await page.goto("/dashboard/inventory")
      await page.getByRole("button", { name: /^Low stock/ }).click()
      await expect(page.getByRole("row").filter({ hasText: "Cetrizine 10mg" })).toHaveCount(0)
    },
    { severity: "major" },
  )

  const payAfter = await payable(page, "Everest Medical Suppliers")
  await guide.step("We owe Everest for what arrived", "The bill (EMS-7781) is for 500 Cetrizine + 120 Amoxil plus VAT, not the full order.")
  await guide.check(
    "Everest's payable grows by the bill (₨1,710 + 13% VAT = ₨1,932.30)",
    async () => {
      const before = Number((payBefore.match(/रू([\d,]+\.\d\d)/) ?? ["", "0"])[1].replace(/,/g, ""))
      const after = Number((payAfter.match(/रू([\d,]+\.\d\d)/) ?? ["", "0"])[1].replace(/,/g, ""))
      expect(Math.round((after - before) * 100) / 100).toBe(1932.3)
    },
    { severity: "major", expected: "Payable +₨1,932.30" },
  )
  if (await visibleSoon(page.getByRole("row").filter({ hasText: "Everest Medical Suppliers" }), 3_000)) {
    await page.getByRole("row").filter({ hasText: "Everest Medical Suppliers" }).first().getByText("Everest Medical Suppliers").click()
    await guide.step("Supplier profile → bills", "The bill shows with its PO number and due date (15-day terms).", 3000)
  }

  updateExtra({ purchaseOrder: poNo, supplierBill: "EMS-7781" })
  await guide.finish("15-reorder-po-receive")
})
