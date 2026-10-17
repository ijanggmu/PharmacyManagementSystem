import fs from "node:fs"
import path from "node:path"
import { test } from "@playwright/test"
import * as XLSX from "xlsx"
import { expect, Guide } from "../helpers/guide"
import { readState, signIn, updateExtra } from "../helpers/run-state"
import { isoDaysFromNow, visibleSoon } from "../helpers/ui"

/**
 * Flow 07 — Go-live setup.
 * Going live from one Excel file: older batches already on the shelf (two close to expiry, which flow 22 uses), a
 * medicine that isn't in the list yet, Annapurna's insulin left on consignment, and the cash and bank on the go-live
 * day. Suppliers and customers came in with their own files in flows 04–05, so those sheets stay empty here.
 */
function goLiveFile(): string {
  const workbook = XLSX.utils.book_new()
  const sheet = (name: string, rows: (string | number)[][]) => XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name)
  sheet("Suppliers", [["Name", "PAN / VAT no", "Phone", "Amount you owe them"]])
  sheet("Customers", [["Name", "Phone", "Amount they owe you"]])
  sheet("Medicines & stock", [
    ["Medicine name", "Generic name", "Strength", "Form", "Batch no", "Expiry date", "Quantity", "Cost price", "MRP", "VAT", "Pack size", "Rack", "Consignment supplier"],
    ["Cetamol 500mg", "Paracetamol", "500mg", "Tablet", "CTM-2401", isoDaysFromNow(20), 150, 1.1, 2, "No", 10, "Rack 1", ""],
    ["Vitamin C 500mg", "Ascorbic acid", "500mg", "Tablet", "VTC-2401", isoDaysFromNow(25), 50, 1.9, 4, "Yes", 10, "Rack 4", ""],
    ["Zinc 20mg", "Zinc sulfate", "20mg", "Tablet", "ZNC-01", isoDaysFromNow(400), 200, 0.8, 1.5, "Yes", 10, "Rack 2", ""],
    ["Insulin Glargine", "Insulin glargine", "100IU", "Injection", "INS-C1", isoDaysFromNow(300), 10, 1100, 1500, "Yes", 1, "Fridge", "Annapurna Drug House"],
  ])
  sheet("Cash & bank", [["Account", "Amount"], ["Cash in hand", 20000], ["Bank balance", 150000]])
  const dir = path.join(__dirname, "..", ".run", "files")
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, "go-live-setup.xlsx")
  XLSX.writeFile(workbook, file)
  return file
}

test("07 · Go-live setup", async ({ page }, testInfo) => {
  const state = readState()
  const guide = new Guide(page, testInfo, "07 · Go-live setup", 9)
  await guide.install()

  await signIn(page, state.tenant, state.ownerEmail, state.ownerPassword)
  await guide.step("Go-live reminder", "Until the go-live setup is done, the dashboard reminds the owner to finish it.")
  await guide.check(
    "The dashboard reminds the owner to finish the go-live setup",
    () => expect(page.getByRole("region", { name: "Finish your go-live setup" })).toBeVisible({ timeout: 15_000 }),
    { severity: "minor" },
  )

  await page.goto("/dashboard/settings/go-live")
  await guide.step(
    "Go-live setup",
    "Everything the pharmacy has on its first day comes in from one Excel file, dated on the go-live date (today here).",
    3500,
  )
  await guide.step(
    "The go-live file",
    "Four sheets: suppliers and customers with what is owed, medicines with the stock on the shelf, and cash & bank.",
  )

  await page.locator("#go-live-file").setInputFiles(goLiveFile())
  const summary = page.getByRole("list", { name: "Go-live summary" })
  await guide.check("The file is checked and summarised", () => expect(summary).toBeVisible({ timeout: 60_000 }), { severity: "blocker" })
  await guide.step(
    "What will be saved",
    "Three batches of our own stock (Zinc is new — it is added to the list), Annapurna's insulin on consignment, and ₨20,000 cash with ₨1,50,000 in the bank.",
    4000,
  )
  await guide.check(
    "Two new medicines are recognised (Zinc and the insulin)",
    () => expect(summary).toContainText("2 new medicines"),
    { severity: "major" },
  )
  await guide.check(
    "The insulin is listed as consignment from one supplier",
    () => expect(summary).toContainText("1 consignment line from 1 supplier"),
    { severity: "major" },
  )

  await page.getByRole("button", { name: "Go live" }).click()
  const live = page.getByText("You're live.")
  await guide.check("Going live saves everything", () => expect(live).toBeVisible({ timeout: 60_000 }), { severity: "blocker" })
  await guide.step("You're live", "Stock, the new medicines, the consignment and the opening cash and bank are all saved on the go-live date.", 3500)

  await page.goto("/dashboard/inventory")
  await guide.step("Stock on the shelf", "Cetamol now has the older batch too, and the two near-expiry batches are flagged.")
  await guide.check(
    "Near-expiry batches are flagged",
    () => expect(page.getByRole("button", { name: /^Expiring soon [2-9]/ })).toBeVisible(),
    { severity: "major", expected: "Expiring soon shows 2" },
  )
  await guide.check(
    "Cetamol's stock adds the go-live batch (500 + 150)",
    () => expect(page.getByRole("row").filter({ hasText: "Cetamol 500mg" })).toContainText("650"),
    { severity: "major" },
  )
  await guide.check(
    "Zinc, new in the file, is now in the medicine list",
    () => expect(page.getByRole("row").filter({ hasText: "Zinc 20mg" }).first()).toBeVisible({ timeout: 15_000 }),
    { severity: "major" },
  )

  await page.goto("/dashboard/inventory/consignment")
  await guide.step("Consignment", "The insulin is Annapurna's until it sells — nothing is owed for it yet.")
  await guide.check(
    "The insulin shows as Annapurna's consignment",
    () => expect(page.getByRole("row").filter({ hasText: "INS-C1" }).first()).toContainText("Annapurna"),
    { severity: "major" },
  )

  await page.goto("/dashboard/settings/go-live")
  const done = page.getByText(/^Go-live done/)
  await guide.check("The go-live page shows it is done", () => expect(done).toBeVisible({ timeout: 15_000 }), { severity: "major" })
  if (await visibleSoon(done, 1_000)) {
    await guide.step("Go-live done", "Cash and bank are the opening balances; forgotten rows can still be uploaded later.", 3000)
  }

  updateExtra({ openingCash: 20000, openingBank: 150000 })
  await guide.finish("07-go-live-setup")
})
