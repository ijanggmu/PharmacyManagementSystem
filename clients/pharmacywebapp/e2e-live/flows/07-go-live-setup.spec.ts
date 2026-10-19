import fs from "node:fs"
import path from "node:path"
import { test } from "@playwright/test"
import * as XLSX from "xlsx"
import { expect, Guide } from "../helpers/guide"
import { readState, signIn, updateExtra } from "../helpers/run-state"
import { isoDaysFromNow, visibleSoon } from "../helpers/ui"

/**
 * Flow 07 — Go-live setup.
 * The owner answers three yes/no questions (suppliers and customers came in with their own files in flows 04–05, so
 * "No" to both; "Yes" to keeping a supplier's stock), types the cash and bank, and uploads one Excel file: older
 * batches already on the shelf (two close to expiry, which flow 22 uses), a medicine that isn't in the list yet,
 * Annapurna's insulin left on consignment, and a syrup they sell but have none of today (no quantity: card only).
 */
function goLiveFile(): string {
  const workbook = XLSX.utils.book_new()
  const sheet = (name: string, rows: (string | number)[][]) => XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name)
  sheet("Medicines & stock", [
    ["Medicine name *", "Generic name", "Strength", "Form", "Batch no", "Expiry date", "Quantity", "Cost price", "MRP *", "VAT", "Pack size", "Rack", "Supplier who owns this stock"],
    ["Example: Cetamol 500mg", "Paracetamol", "500mg", "Tablet", "CTM-2401", isoDaysFromNow(300), 500, 1.2, 2, "No", 10, "A1", ""],
    ["Cetamol 500mg", "Paracetamol", "500mg", "Tablet", "CTM-2401", isoDaysFromNow(20), 150, 1.1, 2, "No", 10, "Rack 1", ""],
    ["Vitamin C 500mg", "Ascorbic acid", "500mg", "Tablet", "VTC-2401", isoDaysFromNow(25), 50, 1.9, 4, "Yes", 10, "Rack 4", ""],
    ["Zinc 20mg", "Zinc sulfate", "20mg", "Tablet", "ZNC-01", isoDaysFromNow(400), 200, 0.8, 1.5, "Yes", 10, "Rack 2", ""],
    ["Insulin Glargine", "Insulin glargine", "100IU", "Injection", "INS-C1", isoDaysFromNow(300), 10, 1100, 1500, "Yes", 1, "Fridge", "Annapurna Drug House"],
    ["Benadryl Syrup", "Diphenhydramine", "100ml", "Syrup", "", "", "", "", 120, "Yes", "", "Rack 5", ""],
  ])
  const dir = path.join(__dirname, "..", ".run", "files")
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, "go-live-setup.xlsx")
  XLSX.writeFile(workbook, file)
  return file
}

test("07 · Go-live setup", async ({ page }, testInfo) => {
  const state = readState()
  const guide = new Guide(page, testInfo, "07 · Go-live setup", 10)
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
    "Everything the pharmacy has on its first day is saved on the start date (today here). First, three yes/no questions.",
    3500,
  )
  const answer = async (question: string, choice: "Yes" | "No") =>
    page.getByRole("group", { name: question }).getByRole("button", { name: choice, exact: true }).click()
  await answer("Do you owe any supplier money today?", "No")
  await answer("Do any customers owe you money (udharo)?", "No")
  await answer("Do you keep a supplier's stock that you pay for only after it sells?", "Yes")
  await guide.step("About your pharmacy", "Suppliers and customers came in earlier, so No to both; Yes to keeping a supplier's stock.")
  await page.getByRole("button", { name: "Continue" }).click()

  await page.getByLabel("Cash in hand").fill("20000")
  await page.getByLabel("Bank balance").fill("150000")
  await guide.step(
    "Start day and file",
    "Cash and bank are typed here. The Excel file has only the medicines sheet, with Add / Don't add guidance beside it.",
  )

  await page.locator("#go-live-file").setInputFiles(goLiveFile())
  const summary = page.getByRole("list", { name: "You'll start with" })
  await guide.check("The file is checked and summarised", () => expect(summary).toBeVisible({ timeout: 60_000 }), { severity: "blocker" })
  await guide.step(
    "What will be saved",
    "Three batches of our own stock, the syrup with no stock yet, Annapurna's insulin on consignment, and ₨20,000 cash with ₨1,50,000 in the bank. The example row is skipped.",
    4000,
  )
  await guide.check(
    "Our own stock is three lines; the example row is not imported",
    () => expect(summary).toContainText("Medicine lines in stock: 3"),
    { severity: "major" },
  )
  await guide.check(
    "The syrup with no quantity comes in as a medicine card only",
    () => expect(summary).toContainText("Medicines with no stock yet: 1"),
    { severity: "major" },
  )
  await guide.check(
    "Three new medicines are recognised (Zinc, the insulin and the syrup)",
    () => expect(summary).toContainText("New to your list: 3"),
    { severity: "major" },
  )
  await guide.check(
    "The insulin is listed as the supplier's stock",
    () => expect(summary).toContainText("Supplier-owned lines (paid when sold): 1"),
    { severity: "major" },
  )

  await page.getByRole("button", { name: "Go live" }).click()
  await page.getByRole("button", { name: "Yes, go live" }).click()
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
  await guide.check(
    "The syrup is in the medicine list with no stock",
    () => expect(page.getByRole("row").filter({ hasText: "Benadryl Syrup" }).first()).toBeVisible({ timeout: 15_000 }),
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
