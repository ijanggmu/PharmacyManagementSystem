import { test, type Page } from "@playwright/test"
import { expect, Guide } from "../helpers/guide"
import { readState, signIn, updateExtra } from "../helpers/run-state"
import { visibleSoon } from "../helpers/ui"

/**
 * Flow 24 — Payroll.
 * The owner adds two employees (one in SSF), gives each a salary structure, previews Ashwin's pay run with SSF and
 * salary TDS worked out, creates it, posts it and pays it from the bank.
 */
const EMPLOYEES = [
  { name: "Bimala Shrestha", designation: "Pharmacy assistant", pan: "112233445", married: true, ssf: "SSF-55102", basic: "25000", da: "5000" },
  { name: "Suman Tamang", designation: "Delivery helper", pan: "", married: false, ssf: "", basic: "18000", da: "" },
]

async function choose(page: Page, combobox: ReturnType<Page["getByRole"]>, option: string | RegExp): Promise<void> {
  await combobox.click()
  await page.getByRole("option", { name: option }).first().click()
}

test("24 · Payroll", async ({ page }, testInfo) => {
  const state = readState()
  const guide = new Guide(page, testInfo, "24 · Payroll", 12)
  await guide.install()

  await signIn(page, state.tenant, state.ownerEmail, state.ownerPassword)
  await page.goto("/dashboard/payroll")
  await guide.step("Payroll", "Employees, salary structures and monthly pay runs with SSF, CIT and salary TDS.")
  await page.getByRole("tab", { name: "Employees" }).click()

  for (const e of EMPLOYEES) {
    await page.getByRole("button", { name: "Add employee" }).first().click()
    const dialog = page.getByRole("dialog", { name: "Add employee" })
    await dialog.locator("#emp-name").fill(e.name)
    await dialog.locator("#emp-designation").fill(e.designation)
    // Joined three months ago, so Ashwin is a full month (joining mid-month prorates the pay).
    await dialog.getByRole("button", { name: "Joining date" }).click()
    const cal = page.getByRole("dialog").last()
    for (let i = 0; i < 3; i++) await cal.getByRole("button", { name: "Go to the Previous Month" }).click()
    await cal.getByRole("button", { name: /\b1st\b/ }).first().click()
    if (e.pan) await dialog.locator("#emp-pan").fill(e.pan)
    if (e.married) await choose(page, dialog.getByRole("combobox", { name: "Marital status (tax slabs)" }), /Married/)
    if (e.ssf) {
      await dialog.locator("#emp-ssf").fill(e.ssf)
      await dialog.getByRole("switch", { name: "Enrolled in SSF" }).click()
    }
    await guide.step(
      `Add ${e.name}`,
      `${e.designation}${e.ssf ? ", enrolled in SSF (11% from salary + 20% from the employer)" : ", not in SSF"}; ${e.married ? "married" : "single"} tax slabs.`,
    )
    await dialog.getByRole("button", { name: "Save" }).click()
    await guide.check(`${e.name} is added`, () => expect(page.getByRole("row").filter({ hasText: e.name })).toBeVisible({ timeout: 15_000 }), {
      severity: "blocker",
    })

    await page.getByRole("button", { name: `Salary of ${e.name}` }).click()
    const sal = page.getByRole("dialog", { name: `Salary — ${e.name}` })
    await sal.getByRole("button", { name: "Effective from" }).click()
    const cal2 = page.getByRole("dialog").last()
    for (let i = 0; i < 3; i++) await cal2.getByRole("button", { name: "Go to the Previous Month" }).click()
    await cal2.getByRole("button", { name: /\b1st\b/ }).first().click()
    await sal.locator("#sal-basic").fill(e.basic)
    if (e.da) await sal.locator("#sal-dearnessAllowance").fill(e.da)
    await guide.step("Salary structure", `Basic ₨${Number(e.basic).toLocaleString("en-IN")}${e.da ? ` + dearness allowance ₨${Number(e.da).toLocaleString("en-IN")}` : ""} a month.`)
    await sal.getByRole("button", { name: "Add salary structure" }).click()
    await guide.check(
      `${e.name}'s salary is saved`,
      async () => {
        await sal.getByRole("button", { name: "Close" }).first().click().catch(() => undefined)
        await expect(page.getByRole("row").filter({ hasText: e.name })).not.toContainText("No salary")
      },
      { severity: "blocker" },
    )
  }

  // Pay run for the current month.
  await page.getByRole("tab", { name: "Pay runs" }).click()
  const month = page.getByRole("combobox", { name: "Month" })
  await month.click()
  const options = page.getByRole("option")
  const current = options.filter({ hasText: /Ashwin 2083/ })
  if (await visibleSoon(current, 2_000)) await current.first().click()
  else await options.last().click()
  await page.getByRole("button", { name: "Preview" }).click()
  await guide.step("Preview the pay run", "Gross, SSF, salary TDS and net pay per employee — nothing is saved yet.", 3500)
  await guide.check(
    "The preview lists both employees",
    async () => {
      await expect(page.getByRole("row").filter({ hasText: "Bimala Shrestha" }).first()).toBeVisible({ timeout: 15_000 })
      await expect(page.getByRole("row").filter({ hasText: "Suman Tamang" }).first()).toBeVisible()
    },
    { severity: "blocker" },
  )
  await guide.check(
    "Bimala's SSF is 11% of basic (₨2,750)",
    () => expect(page.getByRole("row").filter({ hasText: "Bimala Shrestha" }).first()).toContainText("2,750"),
    { severity: "major" },
  )

  await page.getByRole("button", { name: "Create draft run" }).click()
  await guide.check("A draft run is created", () => expect(page.getByText(/Draft/).first()).toBeVisible({ timeout: 15_000 }), {
    severity: "blocker",
  })
  await guide.step("Draft run", "Check it, then post it to the books and pay.")

  for (const action of [/^Approve|^Post/, /^Record payment/]) {
    const btn = page.getByRole("button", { name: action }).first()
    if (!(await visibleSoon(btn, 5_000))) {
      const open = page.getByRole("row").filter({ hasText: /Draft|Approved|Posted/ }).first()
      if (await visibleSoon(open, 2_000)) await open.click()
    }
    if (await visibleSoon(btn, 5_000)) {
      await btn.click()
      const confirm = page.getByRole("dialog").or(page.getByRole("alertdialog")).last()
      if (await visibleSoon(confirm, 2_000)) {
        const method = confirm.getByRole("combobox").first()
        if (await visibleSoon(method, 1_000)) await choose(page, method, /Bank/)
        await guide.pause(1000)
        await confirm.getByRole("button", { name: action }).last().click({ timeout: 3_000 }).catch(() => undefined)
      }
      await guide.pause(1500)
    }
  }
  await guide.step("Posted and paid", "Salaries expense, SSF and TDS owed, and the bank payment are all in the books.", 3000)
  for (let i = 0; i < 2; i++) await page.keyboard.press("Escape")
  await guide.check(
    "The Ashwin run shows as paid",
    () => expect(page.getByRole("table").getByText("Paid", { exact: true }).first()).toBeVisible({ timeout: 15_000 }),
    { severity: "major" },
  )
  await page.getByRole("tab", { name: "SSF & TDS" }).click()
  // The tab opens on the previous month; show the month just paid.
  await page.getByRole("tabpanel").getByRole("combobox").first().click()
  await page.getByRole("option", { name: /Ashwin 2083/ }).first().click()
  await guide.step("SSF & TDS", "What is owed to the SSF and to IRD from this run, ready to deposit.", 3000)
  await guide.check(
    "SSF owed includes Bimala's contributions",
    () => expect(page.getByRole("tabpanel")).toContainText(/2,750|7,750|5,000/),
    { severity: "major", expected: "SSF: ₨2,750 from salary + ₨5,000 employer (20%) = ₨7,750" },
  )

  updateExtra({ payroll: EMPLOYEES.map((e) => e.name) })
  await guide.finish("24-payroll")
})
