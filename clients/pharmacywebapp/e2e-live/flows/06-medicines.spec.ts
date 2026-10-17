import path from "node:path"
import { test, type Page } from "@playwright/test"
import { expect, Guide } from "../helpers/guide"
import { readState, signIn, updateExtra } from "../helpers/run-state"
import { FIXTURES } from "../helpers/ui"
import { MEDICINES, type QaMedicine } from "../helpers/data"

/**
 * Flow 06 — Medicines.
 * The owner adds medicines one by one — with opening stock, batch, expiry, pack sizes, VAT, prescription and
 * controlled-drug flags, and a supplier — then bulk-imports three more from a CSV and searches by barcode.
 * The medicines added here are what later flows sell, order and count.
 */
async function addMedicine(page: Page, guide: Guide, m: QaMedicine): Promise<void> {
  await page.getByRole("button", { name: "Add medicine" }).first().click()
  await page.getByRole("menuitem", { name: "Add one medicine" }).click()
  const dialog = page.getByRole("dialog", { name: "Add medicine" })
  await dialog.waitFor()
  await guide.step(`Add ${m.name}`, m.note, 2600)
  await dialog.locator("#name").fill(m.name)
  await dialog.locator("#generic_name").fill(m.generic)
  await dialog.getByRole("combobox", { name: "Form" }).click()
  await page.getByRole("option", { name: m.form, exact: true }).click()
  // Dosage is optional and falls back to the strength.
  await dialog.locator("#strength").fill(m.strength)
  if (m.barcode) await dialog.locator("#barcode").fill(m.barcode)
  await dialog.locator("#unit_price").fill(m.price)
  await dialog.locator("#cost_price").fill(m.cost)
  if (!m.taxable) await dialog.locator("#is_taxable").click()
  await dialog.locator("#stock_quantity").fill(m.stock)
  await dialog.locator("#batch_number").fill(m.batch)
  await dialog.getByRole("button", { name: "Expiry date" }).click()
  await page.getByRole("button", { name: "+2 yr" }).click()
  await dialog.locator("#minimum_stock").fill(m.reorder)
  await dialog.locator("#maximum_stock").fill(m.max)
  if (m.unitsPerPack) await dialog.locator("#units_per_pack").fill(m.unitsPerPack)
  if (m.unitLabel) await dialog.locator("#unit_label").fill(m.unitLabel)
  if (m.stripsPerBox) await dialog.locator("#packs_per_box").fill(m.stripsPerBox)
  if (m.supplier) {
    await dialog.getByText("Select supplier...").click()
    await page.getByRole("option", { name: new RegExp(m.supplier) }).click()
  } else if (m.paidAs) {
    await dialog.getByRole("radio", { name: new RegExp(`^${m.paidAs}`) }).click()
  }
  if (m.rx) await dialog.locator("#prescription_required").click()
  if (m.controlled) await dialog.locator("#controlled_substance").click()
  await guide.pause(1200)
  await dialog.getByRole("button", { name: "Add medicine" }).click()
  const saved = await guide.check(
    `${m.name} is saved with its opening stock`,
    async () => {
      await expect(dialog).toBeHidden({ timeout: 15_000 })
      await expect(page.getByText(m.name).first()).toBeVisible()
    },
    { severity: "blocker" },
  )
  if (!saved) {
    await guide.pause(1500)
    await page.keyboard.press("Escape")
  }
}

test("06 · Medicines", async ({ page }, testInfo) => {
  const state = readState()
  const guide = new Guide(page, testInfo, "06 · Medicines", 4 + MEDICINES.length + 4)
  await guide.install()

  await signIn(page, state.tenant, state.ownerEmail, state.ownerPassword)
  await page.goto("/dashboard/inventory")
  await guide.step(
    "Medicines",
    "Every medicine you sell: price, VAT, stock by batch and expiry, pack sizes, and safety flags.",
  )

  for (const m of MEDICINES) await addMedicine(page, guide, m)


  await guide.step("All four are in stock", "Stock is kept per batch with its expiry; the oldest-expiring batch is sold first.")
  await guide.check(
    "The list shows the stock entered",
    async () => {
      await expect(page.getByRole("row").filter({ hasText: "Cetamol 500mg" })).toContainText("500")
      await expect(page.getByRole("row").filter({ hasText: "Tramadol 50mg" })).toContainText("60")
    },
    { severity: "major" },
  )
  await page.getByRole("button", { name: /^Low stock/ }).click()
  await guide.step("Low stock", "Cetrizine is below its reorder level, so it is flagged here and on the dashboard.")
  await guide.check(
    "Cetrizine shows under Low stock",
    async () => {
      await expect(page.getByRole("row").filter({ hasText: "Cetrizine 10mg" })).toBeVisible()
      await expect(page.getByRole("row").filter({ hasText: "Cetamol 500mg" })).toBeHidden()
    },
    { severity: "major" },
  )
  await page.getByRole("button", { name: /^Total medicines/ }).click()

  await page.getByRole("button", { name: "Add medicine" }).first().click()
  await page.getByRole("menuitem", { name: "Bulk import from CSV" }).click()
  const bulk = page.getByRole("dialog")
  await bulk.getByRole("tab", { name: "CSV Import" }).click()
  await guide.step("Bulk import from a CSV", "Many medicines at once — name, generic, strength, prices, opening stock, batch and expiry per row.")
  await bulk.locator('input[type="file"]').setInputFiles(path.join(FIXTURES, "medicines.csv"))
  const importBtn = bulk.getByRole("button", { name: /^Import \d+ medicine/ })
  const ready = await importBtn.waitFor({ timeout: 30_000 }).then(() => true, () => false)
  await guide.pause(2500)
  if (ready) await importBtn.click()
  await guide.pause(3000)
  await page.keyboard.press("Escape").catch(() => undefined)
  await page.goto("/dashboard/inventory")
  await guide.check(
    "The CSV adds its three medicines",
    async () => {
      for (const name of ["Omeprazole 20mg", "Metformin 500mg", "Vitamin C 500mg"]) {
        await expect(page.getByText(name).first()).toBeVisible()
      }
    },
    { severity: "major" },
  )

  await page.getByRole("searchbox", { name: /Search medicines/ }).fill("8901234500017")
  await guide.step("Find by barcode", "Typing or scanning a barcode finds the medicine.")
  await guide.check(
    "The barcode finds Cetamol",
    () => expect(page.getByRole("row").filter({ hasText: "Cetamol 500mg" })).toBeVisible(),
    { severity: "minor" },
  )

  await page.getByRole("row").filter({ hasText: "Cetamol 500mg" }).getByText("Cetamol 500mg").click()
  await guide.step("Medicine details", "Batches with expiry, prices, pack sizes and the movement history.", 3000)
  await guide.check(
    "The medicine shows its batch",
    () => expect(page.getByText("CTM-2410").first()).toBeVisible(),
    { severity: "major" },
  )

  updateExtra({ medicines: MEDICINES.map((m) => m.name).concat(["Omeprazole 20mg", "Metformin 500mg", "Vitamin C 500mg"]) })
  await guide.finish("06-medicines")
})
