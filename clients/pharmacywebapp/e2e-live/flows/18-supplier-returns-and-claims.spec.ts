import { test, type Page } from "@playwright/test"
import { expect, Guide } from "../helpers/guide"
import { readState, signIn, updateExtra } from "../helpers/run-state"
import { visibleSoon } from "../helpers/ui"

/**
 * Flow 18 — Supplier returns & expiry claims.
 * Five crushed Omeprazole capsules go back to Himalayan on a debit note. Then Everest delivers a short-dated
 * Cetrizine batch, which is claimed back: claim → letter sent → supplier accepts (debit note) → credit note received.
 */
function amountIn(text: string): number {
  const m = text.match(/रू([\d,]+\.\d\d)/)
  return m ? Number(m[1].replace(/,/g, "")) : NaN
}

async function payableOf(page: Page, supplier: string): Promise<number> {
  await page.goto("/dashboard/suppliers")
  return amountIn(await page.getByRole("row").filter({ hasText: supplier }).first().innerText({ timeout: 10_000 }))
}

async function stockOf(page: Page, medicine: string): Promise<number | null> {
  await page.goto("/dashboard/inventory")
  await page.getByRole("searchbox", { name: /Search medicines/ }).fill(medicine)
  const text = await page.getByRole("row").filter({ hasText: medicine }).first().innerText({ timeout: 10_000 }).catch(() => "")
  const m = text.match(/([\d,]+)\s+(capsules|tablets)\s+at this branch/)
  return m ? Number(m[1].replace(/,/g, "")) : null
}

test("18 · Supplier returns & expiry claims", async ({ page }, testInfo) => {
  const state = readState()
  const manager = (state.extra.staff as Record<string, { email: string; password: string }> | undefined)?.manager
  const guide = new Guide(page, testInfo, "18 · Supplier returns & expiry claims", 14)
  await guide.install()

  await signIn(page, state.tenant, manager?.email ?? state.ownerEmail, manager?.password ?? state.ownerPassword)
  const himalayan0 = await payableOf(page, "Himalayan Pharma Distributors")
  const ome0 = await stockOf(page, "Omeprazole 20mg")

  // A. Damaged goods back to the supplier.
  await page.goto("/dashboard/returns")
  await page.getByRole("tab", { name: "Supplier returns" }).click()
  await guide.step("Supplier returns", "Goods sent back to a supplier go out on a numbered debit note: stock down, payable down, VAT reversed.")
  await page.getByRole("button", { name: "New supplier return" }).first().click()
  const dn = page.getByRole("dialog", { name: "New supplier return" })
  await dn.getByRole("combobox", { name: "Supplier" }).click()
  await page.getByRole("option", { name: /Himalayan Pharma Distributors/ }).click()
  await dn.getByRole("textbox", { name: "Supplier bill no." }).fill("HPD-4410")
  await dn.getByRole("button", { name: "Add medicine" }).click()
  const line = dn.getByRole("group", { name: "Line 1" })
  await line.getByRole("combobox", { name: "Medicine" }).click()
  const listedForSupplier = await visibleSoon(page.getByRole("option", { name: /Omeprazole 20mg/ }), 3_000)
  if (!listedForSupplier) {
    await guide.finding({
      severity: "minor",
      title: "Supplier return only lists medicines linked to the supplier, not ones bought from them on a bill",
      expected: "Omeprazole (received on Himalayan bill HPD-4410) is offered when returning goods to Himalayan",
      actual: "Only Amoxil (the medicine whose preferred supplier is Himalayan) is listed; 'All medicines' must be switched on",
    })
    await page.keyboard.press("Escape")
    await dn.getByRole("switch", { name: "All medicines" }).click()
    await line.getByRole("combobox", { name: "Medicine" }).click()
    await page.keyboard.type("Omepra")
  }
  await page.getByRole("option", { name: /Omeprazole 20mg/ }).first().click()
  await line.getByRole("combobox", { name: "Batch" }).click()
  const batch = page.getByRole("option", { name: /OMZ-2502/ })
  if (await visibleSoon(batch, 3_000)) await batch.click()
  else await page.keyboard.press("Escape")
  await line.getByRole("spinbutton", { name: "Quantity" }).fill("5")
  await line.getByRole("combobox", { name: "Reason" }).click()
  await page.getByRole("option", { name: /Damaged/i }).first().click()
  await line.getByRole("textbox", { name: "Note for line 1" }).fill("Crushed in transit")
  await dn.getByRole("textbox", { name: "Remarks" }).fill("Collected by Himalayan's rep; adjust against next bill")
  await guide.step("5 crushed Omeprazole → Himalayan", "From bill HPD-4410, batch OMZ-2502. The debit is their cost plus the VAT we claimed.", 3000)
  await dn.getByRole("button", { name: "Post debit note" }).click()
  await guide.check(
    "The debit note posts with a DN number",
    async () => {
      await expect(dn.getByText("Debit note posted")).toBeVisible({ timeout: 15_000 })
      await expect(dn.getByText(/DN-/).first()).toBeVisible()
    },
    { severity: "blocker" },
  )
  await guide.pause(2500)
  await dn.getByRole("button", { name: "Done" }).click().catch(() => page.keyboard.press("Escape"))

  const himalayan1 = await payableOf(page, "Himalayan Pharma Distributors")
  const ome1 = await stockOf(page, "Omeprazole 20mg")
  await guide.step("Stock and payable go down", `Omeprazole ${ome0 ?? "?"} → ${ome1 ?? "?"}; Himalayan ₨${himalayan0} → ₨${himalayan1}.`)
  if (ome0 !== null) await guide.check("Omeprazole −5", async () => expect(ome1).toBe(ome0 - 5), { severity: "blocker" })
  await guide.check(
    "Himalayan's payable drops by 5 × ₨3.02 + 13% VAT (₨17.06)",
    async () => expect(Math.abs(himalayan0 - himalayan1 - 17.06)).toBeLessThan(0.03),
    { severity: "major" },
  )

  // B. A short-dated batch arrives from Everest…
  await page.goto("/dashboard/purchases")
  await page.getByRole("tab", { name: "Direct & bulk receipts" }).click()
  await page.getByRole("button", { name: "Record supplier bill" }).click()
  const bill = page.getByRole("dialog", { name: "Record supplier bill" })
  await bill.getByRole("combobox", { name: "Supplier" }).click()
  await page.getByRole("option", { name: /Everest Medical Suppliers/ }).click()
  await bill.getByRole("textbox", { name: "Supplier invoice no." }).fill("EMS-7802")
  await bill.getByRole("row").nth(1).getByRole("combobox").first().click()
  await page.keyboard.type("Cetrizine")
  await page.getByRole("option", { name: /Cetrizine 10mg/ }).first().click()
  await bill.getByRole("textbox", { name: "Batch number, line 1" }).fill("CTZ-2412")
  await bill.getByRole("button", { name: "Expiry date, line 1" }).click()
  const picker = page.getByRole("dialog").last()
  await picker.getByRole("button", { name: "Go to the Next Month" }).click()
  await picker.getByRole("button", { name: "Go to the Next Month" }).click()
  await picker.getByRole("button", { name: /\b15th\b/ }).first().click()
  await bill.getByRole("textbox", { name: "Quantity, line 1", exact: true }).fill("20")
  await bill.getByRole("textbox", { name: "Rate, line 1" }).fill("1.5")
  await bill.getByRole("textbox", { name: "Selling price per unit, line 1" }).fill("3")
  await guide.step("A short-dated delivery", "Everest bill EMS-7802: 20 Cetrizine that expire in about two months — too soon to sell them all.")
  await bill.getByRole("button", { name: "Record bill" }).click()
  await guide.check("The short-dated bill is recorded", () => expect(bill).toBeHidden({ timeout: 15_000 }), { severity: "blocker" })

  // …and is claimed back.
  await page.goto("/dashboard/suppliers/expiry-claims")
  await guide.step("Expiry claims", "Expired or soon-expiring lots, grouped by the supplier who delivered them.")
  const lot = page.getByRole("checkbox", { name: /Claim Cetrizine 10mg .*CTZ-2412/ })
  const listed = await guide.check("The short-dated Everest lot is listed for claiming", () => expect(lot).toBeVisible(), {
    severity: "blocker",
  })
  if (listed) {
    await lot.check()
    await page.getByRole("textbox", { name: "Note for the claim letter (optional)" }).fill("Short-dated on delivery; please replace or credit.")
    await page.getByRole("button", { name: /^Claim 1 lot/ }).click()
    await guide.step("Raise the claim", "One claim per supplier, with a claim letter to send them.")
    let claim = page.getByRole("dialog").filter({ has: page.getByRole("button", { name: "Claim letter" }) })
    if (!(await visibleSoon(claim, 5_000))) {
      await page.getByRole("tab", { name: "Claims" }).click()
      const claimRow = page.getByRole("row").filter({ hasText: "Everest Medical Suppliers" }).first()
      await guide.check("The claim is listed", () => expect(claimRow).toBeVisible(), { severity: "blocker" })
      await claimRow.click()
      claim = page.getByRole("dialog").last()
    }
    await guide.check("The claim opens as a draft for ₨30 (20 × ₨1.50)", () => expect(claim).toContainText("30.00"), {
      severity: "major",
    })
    await claim.getByRole("button", { name: "Mark sent" }).click()
    await guide.step("Letter sent", "Print the claim letter, give it to the supplier, and mark it sent.")
    await claim.getByRole("button", { name: "Record acceptance" }).click()
    await guide.step("The supplier accepts", "They take all 20 back — accepting raises a debit note and takes the lot out of stock.")
    await claim.getByRole("button", { name: "Accept & raise debit note" }).click()
    await guide.check(
      "Accepting raises a debit note",
      () => expect(claim.getByRole("button", { name: "Debit note" })).toBeVisible({ timeout: 15_000 }),
      { severity: "major" },
    )
    const credited = claim.getByRole("button", { name: "Credit note received" })
    if (await visibleSoon(credited, 5_000)) {
      await credited.click()
      await claim.getByRole("textbox").last().fill("EMS-CN-118")
      await claim.getByRole("button", { name: "Mark credited" }).click()
      await guide.step("Credit note received", "Everest's credit note EMS-CN-118 closes the claim.", 2500)
      await guide.check("The claim is credited", () => expect(claim.getByText(/Credited/i).first()).toBeVisible({ timeout: 10_000 }), {
        severity: "major",
      })
    }
    await page.keyboard.press("Escape")
  }

  updateExtra({ supplierReturn: "HPD-4410", expiryClaim: "EMS-7802" })
  await guide.finish("18-supplier-returns-and-claims")
})
