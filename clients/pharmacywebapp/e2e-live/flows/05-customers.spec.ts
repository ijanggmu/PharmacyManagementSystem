import { test } from "@playwright/test"
import { expect, Guide } from "../helpers/guide"
import { readState, signIn, updateExtra } from "../helpers/run-state"
import { importFile } from "../helpers/ui"

/**
 * Flow 05 — Customers.
 * The owner registers two regular customers (one with an allergy and a credit limit), imports a third with an
 * opening balance owed, searches, and opens a customer's profile.
 */
const CUSTOMERS = [
  {
    first: "Ram Bahadur",
    last: "Thapa",
    phone: "9841234567",
    address: "Kalimati, Kathmandu",
    allergies: "Penicillin",
    creditLimit: "5000",
    days: "30",
  },
  {
    first: "Sunita",
    last: "Gurung",
    phone: "9812345678",
    address: "Lakeside, Pokhara",
    allergies: "",
    creditLimit: "",
    days: "",
    chronic: "Diabetes",
  },
]

test("05 · Customers", async ({ page }, testInfo) => {
  const state = readState()
  const guide = new Guide(page, testInfo, "05 · Customers", 8)
  await guide.install()

  await signIn(page, state.tenant, state.ownerEmail, state.ownerPassword)
  await page.goto("/dashboard/customers")
  await guide.step(
    "Customers",
    "Walk-in sales need no customer. Register regulars to sell on credit, keep allergies on file and see their history.",
  )

  for (const c of CUSTOMERS) {
    await page.getByRole("button", { name: "Add customer" }).first().click()
    const dialog = page.getByRole("dialog", { name: "Add customer" })
    await dialog.waitFor()
    const detail = [
      c.allergies && `Allergic to ${c.allergies} — the counter warns before selling it.`,
      c.creditLimit && `May owe up to ₨${c.creditLimit} on credit, due in ${c.days} days.`,
      c.chronic && `Chronic condition: ${c.chronic}.`,
    ]
      .filter(Boolean)
      .join(" ")
    await guide.step(`Add ${c.first} ${c.last}`, detail)
    await dialog.locator("#first_name").fill(c.first)
    await dialog.locator("#last_name").fill(c.last)
    await dialog.locator("#phone").fill(c.phone)
    await dialog.locator("#address").fill(c.address)
    if (c.creditLimit) await dialog.locator("#credit_limit").fill(c.creditLimit)
    if (c.days) await dialog.getByRole("button", { name: c.days, exact: true }).click()
    if (c.allergies) await dialog.locator("#allergies").fill(c.allergies)
    if (c.chronic) await dialog.locator("#chronic_conditions").fill(c.chronic)
    await guide.pause(800)
    await dialog.getByRole("button", { name: "Add customer" }).click()
    await guide.check(
      `${c.first} ${c.last} is saved and listed`,
      async () => {
        await expect(dialog).toBeHidden()
        await expect(page.getByRole("table").getByText(`${c.first} ${c.last}`)).toBeVisible()
      },
      { severity: "blocker" },
    )
  }

  // Only the name is required — an empty name must be refused.
  await page.getByRole("button", { name: "Add customer" }).first().click()
  const empty = page.getByRole("dialog", { name: "Add customer" })
  await empty.getByRole("button", { name: "Add customer" }).click()
  await guide.step("The name is required", "Saving without a name is refused and the field is pointed out.")
  await guide.check(
    "A customer without a name is not saved",
    async () => {
      await expect(empty).toBeVisible()
      await expect(empty.getByText(/required/i).first()).toBeVisible()
    },
    { severity: "minor" },
  )
  await guide.pause(1000)
  await empty.getByRole("button", { name: "Cancel" }).click()

  await guide.step(
    "Import customers with what they owe",
    "Old credit balances come in with the customer file (opening balance), so each customer's account starts right.",
  )
  const imported = await importFile(page, guide, "Import", "customers.csv")
  await guide.check("The customer file imports", async () => expect(imported).toMatch(/Imported/), { severity: "major" })
  await guide.check(
    "The imported customer shows the balance owed",
    async () => {
      const row = page.getByRole("row").filter({ hasText: "Krishna Karki" })
      await expect(row).toBeVisible()
      await expect(row).toContainText(/1,500/)
    },
    { severity: "major", expected: "Krishna Karki listed with ₨1,500 owed" },
  )

  await page.getByRole("searchbox", { name: "Search by name, phone or email" }).fill("98412")
  await guide.step("Search by phone", "At the counter a phone number is often quicker than a name.")
  await guide.check(
    "Searching by phone finds the customer",
    () => expect(page.getByRole("table").getByText("Ram Bahadur Thapa")).toBeVisible(),
    { severity: "minor" },
  )

  await page.getByRole("table").getByText("Ram Bahadur Thapa").click()
  await guide.step("Customer profile", "Contact, allergies, credit limit, what they owe and everything they've bought.", 3000)
  await guide.check(
    "The profile shows the allergy",
    () => expect(page.getByText("Penicillin").first()).toBeVisible(),
    { severity: "major" },
  )

  updateExtra({ customers: ["Ram Bahadur Thapa", "Sunita Gurung", "Krishna Karki"] })
  await guide.finish("05-customers")
})
