import { test } from "@playwright/test"
import { expect, Guide } from "../helpers/guide"
import { readState, signIn } from "../helpers/run-state"

/**
 * Flow 08 — Open the cash drawer.
 * The cashier starts the day: the counter refuses cash until a shift is open, the drawer is opened with a float,
 * and the counter is ready to take cash.
 */
test("08 · Open the cash drawer", async ({ page }, testInfo) => {
  const state = readState()
  const cashier = (state.extra.staff as Record<string, { email: string; password: string }> | undefined)?.cashier
  const guide = new Guide(page, testInfo, "08 · Open the cash drawer", 7)
  await guide.install()

  // The cashier opens their own drawer; fall back to the owner if flow 03 didn't create one.
  await signIn(page, state.tenant, cashier?.email ?? state.ownerEmail, cashier?.password ?? state.ownerPassword)
  await guide.step("The cashier signs in", "Each cashier opens and closes their own shift, so the drawer can be balanced per person.")

  await page.goto("/dashboard/sales/new")
  await guide.step("No shift open yet", "The counter warns that cash can't be taken until the drawer is opened. Card and wallet still work.")
  await guide.check(
    "The counter warns when no cash shift is open",
    () => expect(page.getByText("No cash shift is open at this branch")).toBeVisible(),
    { severity: "major" },
  )

  await page.getByRole("button", { name: "Add Omeprazole 20mg to cart" }).click()
  await page.getByRole("button", { name: "Review & pay" }).click()
  const pay = page.getByRole("dialog", { name: "Review & pay" })
  await pay.getByRole("button", { name: /^Complete sale/ }).click()
  await guide.step("Try a cash sale anyway", "It is refused — cash taken without an open drawer couldn't be balanced at close.")
  await guide.check(
    "A cash sale is refused while no shift is open",
    async () => {
      await expect(page.getByText("Sale not recorded").first()).toBeVisible()
    },
    { severity: "blocker", expected: "An error that a shift must be opened; no sale recorded" },
  )
  await guide.pause(1500)
  await page.keyboard.press("Escape")
  await page.getByRole("button", { name: "Clear all items from cart" }).click().catch(() => undefined)

  await page.goto("/dashboard/cashier")
  await guide.step("Open the drawer", "Count the change float you put in the drawer — here ₨5,000 — and open the shift.")
  await page.getByRole("spinbutton", { name: /Opening float/ }).fill("5000")
  await page.getByRole("textbox", { name: "Opening notes (optional)" }).fill("Float: 4 × ₨1000, 10 × ₨100")
  await guide.pause(1000)
  await page.getByRole("button", { name: "Open shift" }).click()
  await guide.check(
    "The shift opens with the ₨5,000 float",
    async () => {
      await expect(page.getByText("No open shift")).toBeHidden()
      await expect(page.getByText(/5,000/).first()).toBeVisible()
    },
    { severity: "blocker" },
  )
  await guide.step("Shift open", "The drawer now expects ₨5,000 plus every cash sale until it is closed.", 3000)

  await page.goto("/dashboard/sales/new")
  await guide.step("Ready to sell", "The warning is gone; cash sales go into this shift.")
  await guide.check(
    "The counter no longer warns about the drawer",
    () => expect(page.getByText("No cash shift is open at this branch")).toBeHidden(),
    { severity: "major" },
  )

  await guide.finish("08-open-drawer")
})
