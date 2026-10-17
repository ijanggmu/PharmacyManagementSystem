import { test } from "@playwright/test"
import { expect, Guide } from "../helpers/guide"
import { visibleSoon } from "../helpers/ui"
import { readState, signIn, updateExtra } from "../helpers/run-state"

/**
 * Flow 02 — Branches.
 * A new pharmacy starts with one Main branch. The owner opens a second branch, switches the working branch from
 * the header, sees the counter follow the switch, and switches back.
 */
test("02 · Branches", async ({ page }, testInfo) => {
  const state = readState()
  const guide = new Guide(page, testInfo, "02 · Branches", 8)
  await guide.install()

  const branch = { name: "Lalitpur Branch", code: "LTP", address: "Pulchowk, Lalitpur", phone: "01-5551234" }

  await signIn(page, state.tenant, state.ownerEmail, state.ownerPassword)
  await page.goto("/dashboard/branches")
  await guide.step("Branches", "Every pharmacy starts with one Main branch. Stock, sales and the cash drawer are kept per branch.")
  await guide.check(
    "A new pharmacy has a Main branch",
    () => expect(page.getByText(/Main/).first()).toBeVisible(),
    { severity: "blocker" },
  )

  await page.getByRole("button", { name: "New branch" }).first().click()
  await guide.step("Open a second branch", "Name, a short code used in invoice numbers (e.g. INV-LTP-…), address and phone.")
  const dialog = page.getByRole("dialog")
  await dialog.locator("#branch-name").fill(branch.name)
  await dialog.locator("#branch-code").fill(branch.code)
  await dialog.locator("#branch-address").fill(branch.address)
  await dialog.locator("#branch-phone").fill(branch.phone)
  await guide.pause(800)
  await dialog.getByRole("button", { name: "Create branch" }).click()
  await guide.check(
    "The new branch appears in the list",
    () => expect(page.getByText(branch.name).first()).toBeVisible(),
    { severity: "blocker" },
  )
  await guide.step("Branch created", `${branch.name} (${branch.code}) is now listed next to Main.`)

  // The header's branch menu should offer the new branch straight away, without a reload.
  const switcher = page.getByRole("combobox", { name: /Switch branch/ }).first()
  const shownAtOnce = await visibleSoon(switcher, 5_000)
  if (!shownAtOnce) {
    await guide.finding({
      severity: "minor",
      title: "Branch switcher doesn't appear until the page is reloaded after adding a second branch",
      expected: "The header's branch menu shows right after the second branch is created",
      actual: "No branch menu in the header until a reload",
    })
    await page.reload()
  }
  await switcher.click()
  await guide.step("Switch the working branch", "The branch menu in the header sets where sales, stock and the drawer are recorded.")
  await page.getByRole("option", { name: new RegExp(branch.name) }).click()
  await guide.check(
    "The header shows the new branch after switching",
    () => expect(page.getByRole("combobox", { name: new RegExp(`Current branch: ${branch.name}`) })).toBeVisible(),
    { severity: "major" },
  )

  await page.goto("/dashboard/sales/new")
  await guide.step("The counter follows the switch", "New sales are recorded at the branch you're working in.")
  await guide.check(
    "The POS shows the selected branch",
    () => expect(page.getByText(branch.name).first()).toBeVisible(),
    { severity: "major" },
  )

  await page.getByRole("combobox", { name: /Switch branch/ }).first().click()
  await page.getByRole("option", { name: /Main/ }).first().click()
  await guide.step("Switch back to Main", "The rest of the run works in the Main branch.")
  await guide.check(
    "Switching back to Main works",
    () => expect(page.getByRole("combobox", { name: /Current branch: Main/ })).toBeVisible(),
    { severity: "major" },
  )

  updateExtra({ secondBranch: branch })
  await guide.finish("02-branches")
})
