import { test } from "@playwright/test"
import { expect, Guide } from "../helpers/guide"
import { readState, signIn, updateExtra } from "../helpers/run-state"
import { visibleSoon } from "../helpers/ui"

/**
 * Flow 20 — Stock movements & stock count.
 * The movement log shows every stock change; the manager writes off two broken Omeprazole capsules, then counts
 * Rack 4 (Vitamin C), finds two tablets missing, and posts the difference to stock and the books.
 */
test("20 · Stock movements & stock count", async ({ page }, testInfo) => {
  const state = readState()
  const manager = (state.extra.staff as Record<string, { email: string; password: string }> | undefined)?.manager
  const guide = new Guide(page, testInfo, "20 · Stock movements & stock count", 12)
  await guide.install()

  await signIn(page, state.tenant, manager?.email ?? state.ownerEmail, manager?.password ?? state.ownerPassword)
  await page.goto("/dashboard/inventory/movements")
  await guide.step("Movement history", "Every stock change — purchases, sales, returns, write-offs and counts — with its reference.", 3000)
  const rows = page.getByRole("table").getByRole("row")
  await guide.check(
    "Movements say who made them",
    async () => {
      // Column 7 is "By".
      const by = await page.getByRole("table").locator("tbody tr td:nth-child(7)").allInnerTexts()
      expect(by.length).toBeGreaterThan(0)
      expect(by.some((t) => t.trim() !== "" && t.trim() !== "—")).toBe(true)
    },
    { severity: "major", expected: "The By column names the user (e.g. Hari Cashier for a sale)" },
  )
  await guide.check(
    "References show the document number, not just its type",
    () => expect(rows.filter({ hasText: /INV-|GRN-|DN-|CN-|PO-/ }).first()).toBeVisible({ timeout: 3_000 }),
    { severity: "minor", expected: "Reference shows e.g. INV-MAIN-2083/84-00005 or DN-MAIN-…" },
  )

  // Write off two broken capsules.
  await page.getByRole("button", { name: "Record adjustment" }).click()
  const adj = page.getByRole("dialog", { name: "Record stock adjustment" })
  await adj.getByRole("combobox", { name: "Medicine" }).click()
  await page.keyboard.type("Omeprazole")
  await page.getByRole("option", { name: /Omeprazole 20mg/ }).first().click()
  await adj.getByRole("button", { name: "Choose batch" }).click()
  const wo = page.getByRole("dialog", { name: "Adjust or write off stock" })
  await wo.getByRole("radio", { name: /OMZ-2403/ }).click()
  await wo.getByRole("spinbutton", { name: "Units to remove" }).fill("2")
  await wo.getByRole("textbox", { name: "Note" }).fill("Dropped while shelving")
  await guide.step("Write off 2 broken capsules", "Pick the batch, the number of units and the reason. It is costed and posted as a stock loss.")
  await guide.pause(1000)
  await wo.getByRole("button", { name: "Write off" }).click()
  await guide.check("The write-off is recorded", () => expect(wo).toBeHidden({ timeout: 15_000 }), { severity: "blocker" })
  await page.reload()
  await guide.check(
    "The log shows the adjustment (−2 Omeprazole)",
    () => expect(rows.filter({ hasText: "Omeprazole 20mg" }).filter({ hasText: "-2" }).first()).toBeVisible(),
    { severity: "major" },
  )

  // Count Rack 4.
  await page.goto("/dashboard/inventory/stock-counts")
  await page.getByRole("button", { name: "New count" }).click()
  const nc = page.getByRole("dialog", { name: "New stock count" })
  await nc.getByRole("textbox", { name: "Name" }).fill("Rack 4 month-end count")
  await nc.getByRole("combobox", { name: "What to count" }).click()
  await page.getByRole("option", { name: "One rack" }).click()
  await nc.getByRole("textbox", { name: "Rack" }).fill("Rack 4")
  await guide.step("Start a stock count", "Count the whole branch, one rack, a category or a supplier's medicines. Here: Rack 4.")
  await nc.getByRole("button", { name: "Start counting" }).click()
  await guide.check("The count starts", () => expect(page.getByRole("button", { name: "Finish counting" })).toBeVisible({ timeout: 15_000 }), {
    severity: "blocker",
  })
  await guide.step("Blind count", "By default the system's quantities are hidden, so the counter writes what is really on the shelf.", 3000)

  // Show system quantities so the video can explain the difference.
  await page.getByRole("switch", { name: /Blind count/ }).click()
  const lotRows = page.getByRole("table").getByRole("row").filter({ has: page.getByRole("textbox", { name: /^Counted quantity/ }) })
  const n = await lotRows.count()
  for (let i = 0; i < n; i++) {
    const r = lotRows.nth(i)
    const text = await r.innerText()
    const sys = Number((text.match(/\t(\d[\d,]*)\t/) ?? text.match(/(\d[\d,]*)\s*$/) ?? ["", "0"])[1].replace(/,/g, ""))
    await r.getByRole("textbox", { name: /^Counted quantity/ }).fill(String(i === 0 ? Math.max(sys - 2, 0) : sys))
  }
  await guide.step("Enter what is on the shelf", "Vitamin C, older batch: 2 tablets fewer than the system expects; the newer batch matches.", 3000)
  await guide.check(
    "Rack 4 holds the two Vitamin C lots",
    async () => expect(n).toBe(2),
    { severity: "minor", expected: "2 lots on Rack 4 (VTC-2401, VTC-2312)" },
  )
  await guide.check(
    "The difference shows 2 missing, worth ₨3.80 at cost",
    async () => {
      await expect(page.getByRole("row").filter({ hasText: "VTC-2401" })).toContainText("-2")
      await expect(page.getByText("Stock missing").locator("..")).toContainText("3.80")
    },
    { severity: "major" },
  )

  await page.getByRole("button", { name: "Finish counting" }).click()
  const fin = page.getByRole("dialog").or(page.getByRole("alertdialog")).last()
  if (await visibleSoon(fin, 2_000)) await fin.getByRole("button", { name: /Finish|Confirm/ }).last().click()
  await guide.step("Review the differences", "A manager checks what is missing or extra before anything is posted.", 3000)
  const post = page.getByRole("button", { name: /^Post/ }).first()
  const canPost = await visibleSoon(post, 10_000)
  await guide.check("The count can be posted", async () => expect(canPost).toBe(true), { severity: "blocker" })
  if (canPost) {
    await post.click()
    const confirm = page.getByRole("dialog").or(page.getByRole("alertdialog")).last()
    if (await visibleSoon(confirm, 2_000)) await confirm.getByRole("button", { name: /^Post|Confirm/ }).last().click()
    await guide.check(
      "The count is posted",
      () => expect(page.getByText(/Posted/i).first()).toBeVisible({ timeout: 15_000 }),
      { severity: "blocker" },
    )
    await guide.step("Posted", "Stock is corrected and the missing tablets are booked as a stock loss at cost.")
  }

  await page.goto("/dashboard/inventory/movements")
  await guide.check(
    "The log shows the count adjustment for Vitamin C",
    () => expect(rows.filter({ hasText: "Vitamin C 500mg" }).filter({ hasText: "-2" }).first()).toBeVisible(),
    { severity: "major" },
  )

  updateExtra({ writeOff: 2, countLoss: 2 })
  await guide.finish("20-movements-and-stock-count")
})
