import { test } from "@playwright/test"
import { expect, Guide } from "../helpers/guide"
import { readState, signIn, updateExtra } from "../helpers/run-state"
import { importFile } from "../helpers/ui"

/**
 * Flow 04 — Suppliers.
 * The owner adds two suppliers by hand (PAN, credit terms, contact), sees a wrong PAN rejected, imports a third
 * supplier with an opening payable from a file, searches, and opens a supplier's profile.
 */
const SUPPLIERS = [
  {
    name: "Himalayan Pharma Distributors",
    pan: "301234567",
    days: "30",
    contact: "Bikash Shrestha",
    phone: "9851012345",
    email: "orders@himalayanpharma.test",
    address: "Teku, Kathmandu",
  },
  {
    name: "Everest Medical Suppliers",
    pan: "302345678",
    days: "15",
    contact: "Nabin Rai",
    phone: "9851098765",
    email: "sales@everestmedical.test",
    address: "Bagbazar, Kathmandu",
  },
]

test("04 · Suppliers", async ({ page }, testInfo) => {
  const state = readState()
  const guide = new Guide(page, testInfo, "04 · Suppliers", 9)
  await guide.install()

  await signIn(page, state.tenant, state.ownerEmail, state.ownerPassword)
  await page.goto("/dashboard/suppliers")
  await guide.step("Suppliers", "The companies you buy medicines from. Purchase orders, bills and payments are tracked per supplier.")

  for (const s of SUPPLIERS) {
    await page.getByRole("button", { name: "Add supplier" }).first().click()
    const dialog = page.getByRole("dialog", { name: "Add supplier" })
    await dialog.waitFor()
    await guide.step(`Add ${s.name}`, `PAN ${s.pan} prints in the purchase register; ${s.days}-day credit sets each bill's due date.`)
    await dialog.locator("#create-supplier-name").fill(s.name)
    await dialog.locator("#create-supplier-tax_id").fill(s.pan)
    await dialog.getByRole("button", { name: s.days, exact: true }).click()
    await dialog.locator("#create-supplier-contact_person").fill(s.contact)
    await dialog.locator("#create-supplier-phone").fill(s.phone)
    await dialog.locator("#create-supplier-email").fill(s.email)
    await dialog.locator("#create-supplier-address").fill(s.address)
    await guide.pause(800)
    await dialog.getByRole("button", { name: "Add supplier" }).click()
    await guide.check(
      `${s.name} is saved and listed`,
      async () => {
        await expect(dialog).toBeHidden()
        await expect(page.getByRole("table").getByText(s.name)).toBeVisible()
      },
      { severity: "blocker" },
    )
  }

  // A PAN must be exactly 9 digits.
  await page.getByRole("button", { name: "Add supplier" }).first().click()
  const bad = page.getByRole("dialog", { name: "Add supplier" })
  await bad.locator("#create-supplier-name").fill("Wrong PAN Traders")
  await bad.locator("#create-supplier-tax_id").fill("12345678")
  await bad.getByRole("button", { name: "Add supplier" }).click()
  await guide.step("A wrong PAN is caught", "An 8-digit PAN is refused before anything is saved — IRD PANs have 9 digits.")
  await guide.check(
    "An 8-digit PAN is rejected with a message",
    async () => {
      await expect(bad).toBeVisible()
      await expect(bad.getByText(/9 digits/i).first()).toBeVisible()
    },
    { severity: "major" },
  )
  await guide.pause(1200)
  await bad.getByRole("button", { name: "Cancel" }).click()

  await guide.step(
    "Import suppliers from a file",
    "Moving from another system? A CSV or Excel file brings suppliers in, with what you already owe them (opening payable).",
  )
  const imported = await importFile(page, guide, "Import", "suppliers.csv")
  await guide.check("The supplier file imports", async () => expect(imported).toMatch(/Imported/), { severity: "major" })
  await guide.check(
    "The imported supplier shows the opening payable",
    async () => {
      const row = page.getByRole("row").filter({ hasText: "Annapurna Drug House" })
      await expect(row).toBeVisible()
      await expect(row).toContainText(/25,000/)
    },
    { severity: "major", expected: "Annapurna Drug House listed with ₨25,000 payable" },
  )

  await page.getByRole("searchbox", { name: "Search by name, phone or email" }).fill("Everest")
  await guide.step("Search", "Find a supplier by name, phone or email.")
  await guide.check(
    "Search narrows the list to the match",
    async () => {
      await expect(page.getByRole("table").getByText("Everest Medical Suppliers")).toBeVisible()
      await expect(page.getByRole("table").getByText("Himalayan Pharma Distributors")).toBeHidden()
    },
    { severity: "minor" },
  )

  await page.getByRole("table").getByText("Everest Medical Suppliers").click()
  await guide.step("Supplier profile", "Contact details, what you owe, their medicines, cost history and returns — in one place.", 3000)
  await guide.check(
    "The supplier profile opens with their details",
    async () => {
      await expect(page.getByText("Everest Medical Suppliers").first()).toBeVisible()
      await expect(page.getByText("9851098765").first()).toBeVisible()
    },
    { severity: "major" },
  )

  updateExtra({ suppliers: [...SUPPLIERS.map((s) => s.name), "Annapurna Drug House"] })
  await guide.finish("04-suppliers")
})
