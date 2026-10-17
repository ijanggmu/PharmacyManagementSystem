import { test, type Page } from "@playwright/test"
import { expect, Guide } from "../helpers/guide"
import { readState, signIn, updateExtra } from "../helpers/run-state"
import { capturePrint, showDocument, visibleSoon } from "../helpers/ui"

/**
 * Flow 14 — Close the drawer (Z-out).
 * At the end of the day the cashier checks what the drawer should hold, prints an X-report mid-shift, counts the
 * cash, finds ₨50 short, explains it, closes the shift and prints the Z-report for the cash bag.
 */
function money(text: string | null): number {
  return Number((text ?? "").replace(/[^\d.-]/g, "")) || 0
}

async function term(page: Page, label: string): Promise<number> {
  const value = page.locator(`xpath=//dt[normalize-space()="${label}"]/following-sibling::dd[1]`)
  return money(await value.first().textContent({ timeout: 10_000 }).catch(() => null))
}

test("14 · Close the drawer", async ({ page }, testInfo) => {
  const state = readState()
  const cashier = (state.extra.staff as Record<string, { email: string; password: string }> | undefined)?.cashier
  const guide = new Guide(page, testInfo, "14 · Close the drawer (Z-out)", 10)
  await guide.install()

  await signIn(page, state.tenant, cashier?.email ?? state.ownerEmail, cashier?.password ?? state.ownerPassword)
  await page.goto("/dashboard/cashier")
  await guide.step(
    "What the drawer should hold",
    "Opening float + cash sales + cash customers paid on account − cash paid back. Card and wallet money isn't in the drawer.",
    3500,
  )
  const float = await term(page, "Opening float")
  const sales = await term(page, "Cash sales since open")
  const received = await term(page, "Cash received on account")
  const refunds = Math.abs(await term(page, "Cash refunds paid out"))
  const expected = await term(page, "Expected in drawer")
  await guide.check(
    `Expected adds up (${float} + ${sales} + ${received} − ${refunds} = ${expected})`,
    async () => expect(Math.round((float + sales + received - refunds) * 100) / 100).toBe(expected),
    { severity: "blocker" },
  )
  await guide.check("The float is the ₨5,000 opened with", async () => expect(float).toBe(5000), { severity: "major" })
  await guide.check("Krishna's ₨1,000 cash payment is in the drawer", async () => expect(received).toBe(1000), {
    severity: "major",
  })

  const xReport = await capturePrint(page, () =>
    page.getByRole("button", { name: "Print X-report for the open shift" }).click(),
  )
  await guide.step("X-report", "A mid-shift snapshot — prints the totals so far without closing the drawer.")
  await guide.check("The X-report prints", async () => expect(xReport).toBeTruthy(), { severity: "major" })
  if (xReport) await showDocument(page, xReport, 4000)

  const counted = Math.round((expected - 50) * 100) / 100
  await page.getByRole("spinbutton", { name: /Counted cash in drawer/ }).fill(String(counted))
  await guide.step("Count the drawer", `Every note and coin, float included: ₨${counted.toLocaleString("en-IN")} — ₨50 less than expected.`)
  await guide.check(
    "The ₨50 shortfall shows before closing",
    () => expect(page.getByText(/−\s*रू50\.00|-\s*रू50\.00|short.*50/i).first()).toBeVisible(),
    { severity: "major" },
  )
  await page.getByRole("button", { name: "Close shift (Z-out)" }).click()
  await guide.step("A shortfall needs a note", "The shift won't close with an unexplained difference.")
  await guide.check(
    "Closing with a variance and no note is refused",
    async () => {
      await expect(page.getByRole("button", { name: "Close shift (Z-out)" })).toBeVisible()
      await expect(page.getByText(/note/i).filter({ hasNotText: "Closing notes (optional)" }).first()).toBeVisible()
    },
    { severity: "major" },
  )
  await page.getByRole("textbox", { name: /Closing notes/ }).fill("Short by 50, change given in error to a customer")
  await guide.pause(1000)
  const zReport = await capturePrint(page, async () => {
    await page.getByRole("button", { name: "Close shift (Z-out)" }).click()
    const confirm = page.getByRole("alertdialog")
    if (await visibleSoon(confirm, 2_000)) await confirm.getByRole("button", { name: /Close shift|Confirm|Yes/ }).first().click()
  })
  const closed = await guide.check(
    "The shift closes",
    () => expect(page.getByRole("button", { name: "Close shift (Z-out)" })).toBeHidden({ timeout: 15_000 }),
    { severity: "blocker" },
  )
  if (closed) {
    await guide.step("Z-report", "Opening float, sales by payment method (credit sales too), returns, expected vs counted and the note.", 1500)
    let report = zReport
    if (!report) {
      // Not printed automatically on close: print it from the shift list.
      report = await capturePrint(page, () => page.getByRole("button", { name: "Print Z-report" }).first().click())
    }
    await guide.check(
      "The Z-report lists credit sales, the ₨50 variance and the note",
      async () => {
        expect(report).toBeTruthy()
        expect(report).toMatch(/Credit/i)
        expect(report).toMatch(/50\.00/)
        expect(report).toMatch(/change given in error/)
      },
      { severity: "major" },
    )
    if (report) await showDocument(page, report, 5000)
  }

  await guide.step("Shift closed", "It is listed with its variance. Tomorrow starts with a new float.")
  await guide.check(
    "Recent shifts shows the closed shift with −₨50",
    async () => {
      const row = page.getByRole("row").filter({ hasText: /Closed/ }).first()
      await expect(row).toBeVisible()
      await expect(row).toContainText("50.00")
    },
    { severity: "major" },
  )

  updateExtra({ drawer: { float, sales, received, refunds, expected, counted } })
  await guide.finish("14-close-drawer")
})
