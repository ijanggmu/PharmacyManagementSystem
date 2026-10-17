import { test, type Page } from "@playwright/test"
import { expect, Guide } from "../helpers/guide"
import { readState, signIn, updateExtra } from "../helpers/run-state"
import { visibleSoon } from "../helpers/ui"

/**
 * Flow 21 — Branch transfer.
 * The owner sends a box of Cetamol and 50 Omeprazole from Main to the new Lalitpur branch. Stock leaves Main at
 * once and is in transit; switched to Lalitpur, the owner receives it and it becomes sellable there.
 */
async function switchBranch(page: Page, name: RegExp): Promise<void> {
  await page.getByRole("combobox", { name: /Switch branch/ }).first().click()
  await page.getByRole("option", { name }).first().click()
  await expect(page.getByRole("combobox", { name: new RegExp(`Current branch: ${name.source}`) })).toBeVisible({ timeout: 15_000 })
}

async function stockAtBranch(page: Page, medicine: string): Promise<number | null> {
  await page.goto("/dashboard/inventory")
  await page.getByRole("searchbox", { name: /Search medicines/ }).fill(medicine)
  const text = await page.getByRole("row").filter({ hasText: medicine }).first().innerText({ timeout: 10_000 }).catch(() => "")
  const m = text.match(/([\d,]+)\s+(capsules|tablets)\s+at this branch/)
  return m ? Number(m[1].replace(/,/g, "")) : text ? 0 : null
}

test("21 · Branch transfer", async ({ page }, testInfo) => {
  const state = readState()
  const guide = new Guide(page, testInfo, "21 · Branch transfer", 11)
  await guide.install()

  await signIn(page, state.tenant, state.ownerEmail, state.ownerPassword)
  const cetMain0 = await stockAtBranch(page, "Cetamol 500mg")

  await page.goto("/dashboard/stock-transfers")
  await page.getByRole("tab", { name: "New transfer" }).click()
  await guide.step("Send stock to another branch", "Stock leaves this branch at once and is in transit until the other branch receives it.")
  await guide.check(
    "The owner isn't told their role is limited to one branch",
    async () => {
      await page.getByRole("combobox", { name: "To branch" }).waitFor()
      await expect(page.locator('[title="Your role can only view this branch"]')).toHaveCount(0)
    },
    {
      severity: "cosmetic",
      expected: "No 'Your role can only view this branch' tooltip / screen-reader label on From branch for an owner who can switch branches",
    },
  )
  await page.getByRole("combobox", { name: "To branch" }).click()
  await page.getByRole("option", { name: /Lalitpur Branch/ }).click()
  await page.getByRole("combobox", { name: "Medicine, line 1" }).click()
  await page.keyboard.type("Cetamol")
  await page.getByRole("option", { name: /Cetamol 500mg/ }).first().click()
  await page.getByRole("spinbutton", { name: "Quantity, line 1" }).fill("100")
  await page.getByRole("button", { name: "Add medicine" }).click()
  await page.getByRole("combobox", { name: "Medicine, line 2" }).click()
  await page.keyboard.type("Omeprazole")
  await page.getByRole("option", { name: /Omeprazole 20mg/ }).first().click()
  await page.getByRole("spinbutton", { name: "Quantity, line 2" }).fill("50")
  await page.getByRole("textbox", { name: "Notes" }).fill("Opening stock for Lalitpur — sent with Bikash")
  await guide.step("Main → Lalitpur", "100 Cetamol tablets (one box) and 50 Omeprazole capsules.", 2500)
  await page.getByRole("button", { name: "Dispatch transfer" }).click()
  const confirm = page.getByRole("dialog").or(page.getByRole("alertdialog")).last()
  if (await visibleSoon(confirm, 2_000)) await confirm.getByRole("button", { name: /Dispatch|Confirm|Send/ }).last().click()

  await page.getByRole("tab", { name: "Transfers" }).click()
  const row = page.getByRole("row").filter({ hasText: /Lalitpur/ }).first()
  await guide.check("The transfer is in transit", () => expect(row).toContainText(/In transit/i, { timeout: 15_000 }), {
    severity: "blocker",
  })
  const trNo = ((await row.innerText().catch(() => "")).match(/[A-Z]{2,4}-[\w/-]+/) ?? [null])[0]
  await guide.step("In transit", `${trNo ?? "The transfer"} is on its way. Main's stock has already gone down.`)
  const cetMain1 = await stockAtBranch(page, "Cetamol 500mg")
  if (cetMain0 !== null) {
    await guide.check("Main's Cetamol drops by 100 on dispatch", async () => expect(cetMain1).toBe(cetMain0 - 100), { severity: "blocker" })
  }

  await switchBranch(page, /Lalitpur Branch/)
  await page.goto("/dashboard/stock-transfers")
  await guide.step("At Lalitpur", "Switched to the Lalitpur branch, the incoming transfer waits to be received.")
  const incoming = page.getByRole("row").filter({ hasText: /Lalitpur/ }).first()
  const receive = incoming.getByRole("button", { name: /Receive/ })
  if (!(await visibleSoon(receive, 3_000))) {
    await incoming.getByRole("button").last().click()
    await page.getByRole("menuitem", { name: /Receive/ }).click()
  } else {
    await receive.click()
  }
  const rc = page.getByRole("dialog").or(page.getByRole("alertdialog")).last()
  if (await visibleSoon(rc, 3_000)) {
    await guide.step("Receive it", "Check what arrived and confirm.")
    await guide.pause(1200)
    await rc.getByRole("button", { name: /Receive|Confirm/ }).last().click()
  }
  await guide.check("The transfer is received", () => expect(incoming).toContainText(/Received/i, { timeout: 15_000 }), {
    severity: "blocker",
  })

  const cetLtp = await stockAtBranch(page, "Cetamol 500mg")
  const omeLtp = await stockAtBranch(page, "Omeprazole 20mg")
  await guide.step("Sellable at Lalitpur", `Lalitpur now holds Cetamol ${cetLtp ?? "?"} and Omeprazole ${omeLtp ?? "?"}, with their batches and expiry.`)
  await guide.check("Lalitpur has 100 Cetamol and 50 Omeprazole", async () => {
    expect(cetLtp).toBe(100)
    expect(omeLtp).toBe(50)
  }, { severity: "blocker" })

  await switchBranch(page, /Main Branch/)
  await guide.step("Back to Main", "The rest of the run works in the Main branch.")

  updateExtra({ transfer: trNo })
  await guide.finish("21-branch-transfer")
})
