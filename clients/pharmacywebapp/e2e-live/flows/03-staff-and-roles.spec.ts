import { test } from "@playwright/test"
import { expect, Guide } from "../helpers/guide"
import { readState, signIn, updateExtra } from "../helpers/run-state"

/**
 * Flow 03 — Staff & roles.
 * The owner adds one staff account per pharmacy role (Manager, Pharmacist, Cashier, Accountant), looks at what
 * each role may do, and the new cashier signs in with the pharmacy code. Flow 28 checks the restrictions.
 */
const STAFF = [
  { role: "Manager", name: "Ram Manager", email: "manager" },
  { role: "Pharmacist", name: "Gita Pharmacist", email: "pharmacist" },
  { role: "Cashier", name: "Hari Cashier", email: "cashier" },
  { role: "Accountant", name: "Maya Accountant", email: "accountant" },
] as const

test("03 · Staff & roles", async ({ page }, testInfo) => {
  const state = readState()
  const guide = new Guide(page, testInfo, "03 · Staff & roles", 4 + STAFF.length)
  await guide.install()
  // Set QA_STAFF_PASSWORD for the live run — the repo is public and the live pharmacy is kept.
  const password = process.env.QA_STAFF_PASSWORD ?? "QaStaff!2026"
  const domain = state.ownerEmail.split("@")[1]
  const suffix = state.tenant.split("-").slice(-2).join("")
  const accounts: Record<string, { email: string; password: string; name: string }> = {}

  await signIn(page, state.tenant, state.ownerEmail, state.ownerPassword)
  await page.goto("/dashboard/settings")
  await page.getByRole("tab", { name: "Users" }).click()
  await guide.step("Users", "Each person gets their own sign-in and a role that decides what they can see and do.")

  for (const staff of STAFF) {
    const email = `qa.${staff.email}.${suffix}@${domain}`
    await page.getByRole("button", { name: "Add user" }).first().click()
    const dialog = page.getByRole("dialog", { name: "Add user" })
    await dialog.waitFor()
    await guide.step(`Add a ${staff.role}`, `${staff.name} · ${email}`)
    await dialog.locator("#add-fullName").fill(staff.name)
    await dialog.locator("#add-email").fill(email)
    await dialog.locator("#add-role").click()
    await page.getByRole("option", { name: staff.role, exact: true }).click()
    await dialog.locator("#add-password").fill(password)
    await guide.pause(600)
    await dialog.getByRole("button", { name: "Add user" }).click()
    const added = await guide.check(
      `${staff.role} account is created and listed`,
      () => expect(page.getByText(email).first()).toBeVisible(),
      { severity: "blocker" },
    )
    if (added) accounts[staff.role.toLowerCase()] = { email, password, name: staff.name }
    else await page.keyboard.press("Escape")
    // The next "Add user" must not be clicked while this dialog is still closing.
    await dialog.waitFor({ state: "hidden" }).catch(() => undefined)
  }

  await page.getByRole("tab", { name: "Roles & permissions" }).click()
  await guide.step(
    "Roles & permissions",
    "What each role may do — e.g. a Cashier sells and takes payments; an Accountant sees the books but can't sell.",
    3500,
  )

  updateExtra({ staff: accounts })

  const cashier = accounts.cashier
  if (cashier) {
    await page.context().clearCookies()
    await guide.step("The cashier signs in", "Same sign-in screen: pharmacy code, their own email and password.")
    await guide.check(
      "A new staff account can sign in",
      () => signIn(page, state.tenant, cashier.email, cashier.password),
      { severity: "blocker" },
    )
    await guide.pause(2500)
  }

  await guide.finish("03-staff-and-roles")
})
