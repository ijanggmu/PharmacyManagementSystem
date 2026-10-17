import { test } from "@playwright/test"
import { expect, Guide } from "../helpers/guide"
import { readState, signIn, updateExtra } from "../helpers/run-state"
import { importFile, isoDaysFromNow, visibleSoon, writeRunFile } from "../helpers/ui"

/**
 * Flow 22 — Expiry, recall & write-off.
 * Near-expiry stock is flagged; an expired lot found in the back store is blocked from sale and written off as a
 * loss; and a manufacturer recall blocks an Omeprazole batch at every branch.
 */
test("22 · Expiry, recall & write-off", async ({ page }, testInfo) => {
  const state = readState()
  const manager = (state.extra.staff as Record<string, { email: string; password: string }> | undefined)?.manager
  const guide = new Guide(page, testInfo, "22 · Expiry, recall & write-off", 12)
  await guide.install()

  await signIn(page, state.tenant, manager?.email ?? state.ownerEmail, manager?.password ?? state.ownerPassword)

  // Expiring soon.
  await page.goto("/dashboard/inventory")
  await page.getByRole("button", { name: /^Expiring soon/ }).click()
  await guide.step("Expiring soon", "Lots expiring within 30 days: sell them first (the counter already does) or return them to the supplier.", 3000)
  await guide.check(
    "The near-expiry Vitamin C lot is listed",
    () => expect(page.getByRole("row").filter({ hasText: "Vitamin C 500mg" })).toBeVisible(),
    { severity: "major" },
  )

  // An expired lot turns up.
  const expired = writeRunFile(
    "expired-stock.csv",
    [
      "Barcode,Medicine name,Strength,Form,Batch no,Expiry date,Quantity,Cost price,Selling price,Rack",
      `,Vitamin C 500mg,500mg,Tablet,VTC-2209,${isoDaysFromNow(-3)},30,1.8,4,Back store`,
    ].join("\n"),
  )
  await guide.step("Expired stock found in the back store", "30 Vitamin C tablets that expired 3 days ago — can they be entered as stock?")
  // importFile() returns null when the file doesn't reach "Import"; an expired lot should be refused with a reason.
  const imported = await importFile(page, guide, "Import stock", expired)
  const accepted = imported !== null
  if (!accepted) {
    await guide.check(
      "An expired lot is refused with a clear reason",
      () => expect(page.getByRole("dialog").getByText(/Already expired/)).toBeVisible(),
      { severity: "minor" },
    )
    await guide.step("Refused", "Expired stock can't come in as sellable stock — the row says why.", 2500)
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click()
  }

  await page.goto("/dashboard/inventory/expired")
  await guide.step("Expired stock", "Expired lots are blocked from sale but still counted until written off.")
  if (accepted) {
    const row = page.getByRole("row").filter({ hasText: "VTC-2209" }).first()
    await guide.check("The expired lot is listed", () => expect(row).toBeVisible(), { severity: "major" })

    await page.goto("/dashboard/sales/new")
    await page.getByRole("searchbox", { name: /Search medicines/ }).fill("Vitamin C")
    await guide.step("Blocked at the counter", "The counter never offers the expired batch.")
    await guide.check(
      "The counter doesn't offer the expired batch",
      () => expect(page.getByText("VTC-2209")).toHaveCount(0),
      { severity: "blocker" },
    )

    await page.goto("/dashboard/inventory/expired")
    const wo = page.getByRole("row").filter({ hasText: "VTC-2209" }).first().getByRole("button", { name: /Write off|Dispose/ })
    if (await visibleSoon(wo, 3_000)) await wo.click()
    else await page.getByRole("button", { name: /Write off|Dispose/ }).first().click()
    const confirm = page.getByRole("dialog").or(page.getByRole("alertdialog")).last()
    if (await visibleSoon(confirm, 3_000)) {
      await guide.step("Write it off", "The lot leaves stock permanently and its cost (30 × ₨1.80 = ₨54) is posted as an expiry loss.")
      const method = confirm.getByRole("combobox").first()
      if (await visibleSoon(method, 1_000)) {
        await method.click()
        await page.getByRole("option").first().click()
      }
      await guide.pause(1200)
      await confirm.getByRole("button", { name: /Write off|Dispose|Confirm/ }).last().click()
    }
    await guide.check(
      "The expired lot is written off",
      () => expect(page.getByRole("row").filter({ hasText: "VTC-2209" })).toHaveCount(0, { timeout: 15_000 }),
      { severity: "blocker" },
    )
  }

  // Manufacturer recall.
  await page.getByRole("button", { name: "Recall batch" }).click()
  const recall = page.getByRole("dialog", { name: "Recall a batch" })
  await recall.getByRole("combobox", { name: "Medicine" }).click()
  await page.keyboard.type("Omeprazole")
  await page.getByRole("option", { name: /Omeprazole 20mg/ }).first().click()
  // Batches are shown as cards; pick the one being recalled.
  await recall.getByText("OMZ-2403", { exact: true }).click()
  await recall.getByRole("textbox", { name: "Reason" }).fill("DDA notice 2083/14 — dissolution failure, batch OMZ-2403")
  await guide.step("Recall a batch", "A DDA notice recalls Omeprazole batch OMZ-2403. It is blocked from sale at every branch at once.", 3000)
  await recall.getByRole("button", { name: "Recall batch" }).click()
  await guide.check("The recall is recorded", () => expect(recall).toBeHidden({ timeout: 15_000 }), { severity: "blocker" })
  await page.getByRole("button", { name: "Recalled only" }).click()
  await guide.check(
    "The recalled batch is listed",
    () => expect(page.getByRole("row").filter({ hasText: "OMZ-2403" }).first()).toBeVisible(),
    { severity: "major" },
  )

  await page.goto("/dashboard/sales/new")
  await page.getByRole("button", { name: "Add Omeprazole 20mg to cart" }).click()
  await guide.step("The counter skips it", "Selling Omeprazole now picks the next good batch, never OMZ-2403.")
  await guide.check(
    "The cart picks a batch other than the recalled OMZ-2403",
    async () => {
      const cart = page.getByRole("list", { name: "Cart items" })
      await expect(cart).toContainText(/OMZ-/)
      await expect(cart).not.toContainText("OMZ-2403")
    },
    { severity: "blocker" },
  )
  await page.getByRole("button", { name: "Clear all items from cart" }).click().catch(() => undefined)

  updateExtra({ recall: "OMZ-2403", expiredWriteOff: accepted ? "VTC-2209" : null })
  await guide.finish("22-expiry-recall-writeoff")
})
