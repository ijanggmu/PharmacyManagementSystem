import type { Request } from "@playwright/test"
import { expect, test } from "./helpers/session"
import { mockDotnet } from "./helpers/dotnet-mocks"

const SUPPLIER_ID = "00000000-0000-4000-8000-000000000051"
const AMOXICILLIN_ID = "00000000-0000-4000-8000-000000000102"

test("creates a purchase order with free quantity and line + bill discounts", async ({ authedPage: page }) => {
  const posted: Request[] = []
  await mockDotnet(page, "POST", "/purchasing/purchase-orders", (request) => {
    posted.push(request)
    return { body: "00000000-0000-4000-8000-00000000f001" }
  })

  await page.goto("/dashboard/purchases")
  await page.getByRole("button", { name: "New purchase order" }).first().click()
  const dialog = page.getByRole("dialog", { name: "New purchase order" })

  await dialog.getByRole("combobox", { name: /Supplier/ }).click()
  await page.getByRole("option", { name: /Himalayan Pharma Distributors/ }).click()

  await dialog.getByRole("button", { name: "Add medicine" }).first().click()
  // The line's medicine picker has no accessible name of its own (follow-up), so scope it to line 1's row; the
  // row's other comboboxes are the rate and selling-price currency pickers.
  const line1 = dialog.getByRole("row").filter({ has: page.getByRole("spinbutton", { name: "Quantity, line 1" }) })
  await line1.getByRole("combobox").filter({ hasText: "Search medicine..." }).click()
  await page.getByRole("option", { name: /Amoxicillin 250mg/ }).click()

  // 100 capsules at Rs 10 with 10 free (a 10+1 scheme), 10% trade discount on the line, 5% bill discount.
  await dialog.getByRole("spinbutton", { name: "Quantity, line 1" }).fill("100")
  await dialog.getByRole("textbox", { name: "Free quantity, line 1" }).fill("10")
  await dialog.getByRole("textbox", { name: "Unit cost, line 1" }).fill("10")
  await dialog.getByRole("textbox", { name: /^Discount, line 1/ }).fill("10")
  await dialog.getByRole("textbox", { name: /^Bill discount \(/ }).fill("5")

  // gross 1000 − line 100 − bill 45 = 855 (exempt medicine, so no VAT); 855 / 110 units = 7.77 each.
  const totals = dialog.locator("dl").filter({ hasText: "Net bill" })
  await expect(totals).toContainText(/Gross\s*रू1,000\.00/)
  await expect(totals).toContainText(/Line discounts\s*[−-]?\s*रू100\.00/)
  await expect(totals).toContainText(/Bill discount\s*[−-]?\s*रू45\.00/)
  await expect(totals).toContainText(/Net bill\s*रू855\.00/)
  await expect(line1).toContainText("7.77")

  await dialog.getByRole("button", { name: "Create draft PO" }).click()
  await expect(dialog).toBeHidden()

  expect(posted).toHaveLength(1)
  expect(posted[0].postDataJSON()).toMatchObject({
    supplierId: SUPPLIER_ID,
    billDiscountPercent: 5,
    lines: [
      expect.objectContaining({
        medicineId: AMOXICILLIN_ID,
        quantity: 100,
        freeQuantity: 10,
        unitCostPrice: 10,
        discountPercent: 10,
        inPacks: false,
      }),
    ],
  })
})
