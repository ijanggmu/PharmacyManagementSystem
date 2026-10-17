import { test, type Page } from "@playwright/test"
import { expect, Guide } from "../helpers/guide"
import { readState, signIn, updateExtra } from "../helpers/run-state"
import { visibleSoon } from "../helpers/ui"

/**
 * Flow 29 — Profile, language & support tickets.
 * The cashier updates their phone number, changes their password (and signs in with the new one), switches the
 * app to Nepali and back, and reports an issue to support as a ticket.
 */
async function changePassword(page: Page, from: string, to: string): Promise<void> {
  await page.goto("/dashboard/profile")
  await page.getByRole("button", { name: "Change password" }).click()
  const dialog = page.getByRole("dialog", { name: "Change password" })
  await dialog.locator("#cp-current").fill(from)
  await dialog.locator("#cp-new").fill(to)
  await dialog.locator("#cp-confirm").fill(to)
  await dialog.getByRole("button", { name: "Change password" }).click()
  await expect(dialog).toBeHidden({ timeout: 15_000 })
}

test("29 · Profile, language & tickets", async ({ page }, testInfo) => {
  const state = readState()
  const cashier = (state.extra.staff as Record<string, { email: string; password: string }> | undefined)?.cashier
  const email = cashier?.email ?? state.ownerEmail
  const password = cashier?.password ?? state.ownerPassword
  const newPassword = `${password}${String(Date.now()).slice(-4)}`
  const guide = new Guide(page, testInfo, "29 · Profile, language & tickets", 11)
  await guide.install()

  await signIn(page, state.tenant, email, password)
  await page.goto("/dashboard/profile")
  await guide.step("My profile", "Each person's own details, sign-in security and language.")
  await page.getByRole("button", { name: "Edit details" }).click()
  const phone = `98${String(Date.now()).slice(-8)}`
  await page.locator("#phone").fill(phone)
  await guide.step("Update the phone number", "Colleagues use it to reach you about orders and shifts.")
  await page.getByRole("button", { name: "Save changes" }).click()
  await page.getByText("Profile updated").first().waitFor({ timeout: 15_000 }).catch(() => undefined)
  await page.reload()
  await guide.check("The new phone number is kept", () => expect(page.locator("#phone")).toHaveValue(new RegExp(phone)), { severity: "major" })

  // Password change, proven by signing in with the new password, then put back.
  await guide.step("Change password", "Current password, then a new one that meets the rules (10+ characters, upper, lower, number).")
  const changed = await guide.check("The password changes", () => changePassword(page, password, newPassword), { severity: "blocker" })
  if (changed) {
    await page.context().clearCookies()
    await guide.check("The new password signs in", () => signIn(page, state.tenant, email, newPassword), { severity: "blocker" })
    await guide.step("Signed in with the new password", "The old one no longer works.")
    // Recently used passwords can't be set again, so keep the new one for later flows.
    if (cashier) {
      const staff = state.extra.staff as Record<string, { email: string; password: string }>
      updateExtra({ staff: { ...staff, cashier: { ...cashier, password: newPassword } } })
    }
  }

  // Language.
  await page.goto("/dashboard/profile")
  await page.getByRole("radio", { name: "नेपाली" }).click()
  await guide.step("नेपाली", "The whole interface switches to Nepali, with Devanagari digits.", 3500)
  await guide.check(
    "The menu is in Nepali",
    async () => {
      const nav = page.getByRole("navigation", { name: /Main|मुख्य/ })
      await expect(nav).not.toContainText("Sales history")
      await expect(nav).toContainText(/[ऀ-ॿ]/)
    },
    { severity: "major" },
  )
  await page.goto("/dashboard/sales/new")
  await guide.step("The counter in Nepali", "Prices and quantities in Devanagari digits.", 3000)
  await guide.check(
    "The counter shows no English labels left untranslated",
    () => expect(page.getByRole("button", { name: "Review & pay" })).toHaveCount(0),
    { severity: "minor", expected: "Counter buttons in Nepali" },
  )
  await page.goto("/dashboard/profile")
  await page.getByRole("radio", { name: "English" }).click()
  await guide.check("Back to English", () => expect(page.getByRole("heading", { name: "My profile" })).toBeVisible(), { severity: "major" })

  // Support ticket.
  await page.goto("/dashboard/tickets")
  await page.getByRole("button", { name: "Report an issue" }).first().click()
  const report = page.getByRole("dialog", { name: "Report an issue" })
  const summary = `Receipt printer cuts the footer — QA ${state.tenant.slice(-9)}`
  await report.locator("#report-issue-summary").fill(summary)
  await guide.check(
    "Each field in the report form has its own id (the 'More details' label points to its box)",
    async () => expect(await page.locator("[id='report-issue-description']").count()).toBe(1),
    { severity: "cosmetic", expected: "One element with id report-issue-description (the description paragraph reuses it)" },
  )
  await report.locator("textarea#report-issue-description").fill("On 80 mm paper the last line of the receipt footer is cut off. Expected the full footer.")
  await guide.step("Report an issue", "It becomes a support ticket with the page and browser details attached.")
  await report.getByRole("button", { name: "Submit report" }).click()
  await guide.check("The ticket is created", async () => {
    await expect(page.getByText(/Thanks — ticket/).first()).toBeVisible({ timeout: 15_000 })
  }, { severity: "major" })
  await guide.check(
    "The confirmation gives the ticket number",
    async () => expect(await page.getByText(/Thanks — ticket/).first().innerText()).toMatch(/ticket\s+\S+\s+was created/),
    { severity: "cosmetic", expected: "Thanks — ticket #… was created (the number is blank)" },
  )
  await guide.check("The ticket is listed as open", async () => {
    await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).first().click()
    await page.reload()
    await expect(page.getByText(summary).first()).toBeVisible({ timeout: 15_000 })
  }, { severity: "major" })
  const ticket = page.getByText(summary).first()
  if (await visibleSoon(ticket, 2_000)) {
    await ticket.click()
    await guide.step("The ticket", "Status, severity and the conversation with support (answered in flow 30).", 3000)
  }

  updateExtra({ ticket: summary })
  await guide.finish("29-profile-language-tickets")
})
