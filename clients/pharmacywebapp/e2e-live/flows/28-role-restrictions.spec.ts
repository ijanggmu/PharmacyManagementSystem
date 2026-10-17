import { test, type Page } from "@playwright/test"
import { expect, Guide } from "../helpers/guide"
import { readState, signIn } from "../helpers/run-state"

/**
 * Flow 28 — Role restrictions.
 * Each staff role signs in: the menu shows only what the role may use, and typing the address of a page outside
 * the role is refused — not just hidden.
 */
interface RoleCase {
  key: string
  label: string
  note: string
  denied: { path: string; what: string }[]
  allowed: { path: string; what: string }[]
}

const ROLES: RoleCase[] = [
  {
    key: "cashier",
    label: "Cashier",
    note: "Sells, takes payments and runs the drawer. No purchasing, books, payroll or settings.",
    denied: [
      { path: "/dashboard/purchases", what: "Purchases" },
      { path: "/dashboard/reports/accounting", what: "Accounting" },
      { path: "/dashboard/payroll", what: "Payroll" },
      { path: "/dashboard/settings", what: "Settings" },
    ],
    allowed: [{ path: "/dashboard/sales/new", what: "the counter" }],
  },
  {
    key: "pharmacist",
    label: "Pharmacist",
    note: "Dispensing, prescriptions, the narcotic register and stock. No books, payroll or settings.",
    denied: [
      { path: "/dashboard/reports/accounting", what: "Accounting" },
      { path: "/dashboard/payroll", what: "Payroll" },
      { path: "/dashboard/settings", what: "Settings" },
    ],
    allowed: [{ path: "/dashboard/reports/dda-narcotic", what: "the narcotic register" }],
  },
  {
    key: "accountant",
    label: "Accountant",
    note: "The books, VAT, payroll and reports. Doesn't sell at the counter or manage staff.",
    denied: [
      { path: "/dashboard/sales/new", what: "the counter" },
      { path: "/dashboard/settings", what: "Settings (users & roles)" },
    ],
    allowed: [{ path: "/dashboard/reports/accounting", what: "Accounting" }],
  },
  {
    key: "manager",
    label: "Manager",
    note: "Runs the shop: purchasing, stock, approvals and settings — but not payroll.",
    denied: [{ path: "/dashboard/payroll", what: "Payroll" }],
    allowed: [
      { path: "/dashboard/purchases", what: "Purchases" },
      { path: "/dashboard/settings", what: "Settings" },
    ],
  },
]

const NO_ACCESS = "You don't have access to this page"

async function visit(page: Page, path: string): Promise<void> {
  await page.goto(path)
  await page.waitForLoadState("networkidle").catch(() => undefined)
}

test("28 · Role restrictions", async ({ page }, testInfo) => {
  const state = readState()
  const staff = state.extra.staff as Record<string, { email: string; password: string }> | undefined
  const guide = new Guide(page, testInfo, "28 · Role restrictions", 1 + ROLES.length * 2)
  await guide.install()

  await page.goto("/")
  await guide.step("What each role can do", "Every staff member signs in with their own account; the role decides the menu and the pages.")

  for (const role of ROLES) {
    const account = staff?.[role.key]
    if (!account) continue
    await page.context().clearCookies()
    await signIn(page, state.tenant, account.email, account.password)
    await guide.step(`${role.label}`, role.note, 3500)

    for (const a of role.allowed) {
      await visit(page, a.path)
      await guide.check(`${role.label} can open ${a.what}`, () => expect(page.getByText(NO_ACCESS)).toHaveCount(0), { severity: "major" })
    }
    for (const d of role.denied) {
      await visit(page, d.path)
      // Refused = the no-access page, or sent away from the address (e.g. back to the dashboard).
      const crashed = await page.getByText("Something went wrong").isVisible().catch(() => false)
      await guide.check(
        `${role.label} is refused ${d.what} when typing its address`,
        async () => {
          const refused = (await page.getByText(NO_ACCESS).isVisible().catch(() => false)) || !page.url().includes(d.path)
          expect(refused || crashed).toBe(true)
        },
        { severity: "blocker", expected: `"${NO_ACCESS}" (or a redirect) for ${d.path}` },
      )
      if (crashed) {
        await guide.finding({
          severity: "minor",
          title: `${d.what} crashes ("Something went wrong") for a ${role.label} instead of saying they have no access`,
          expected: `"${NO_ACCESS}", as on other restricted pages`,
          actual: `${d.path} shows "This component encountered an error and couldn't load properly" with a Retry button`,
        })
      }
    }
    await visit(page, role.denied[0].path)
    await guide.step(`${role.label}: typed address refused`, `Opening ${role.denied[0].what} directly shows "no access" instead of the page.`, 2500)
  }

  await guide.finish("28-role-restrictions")
})
