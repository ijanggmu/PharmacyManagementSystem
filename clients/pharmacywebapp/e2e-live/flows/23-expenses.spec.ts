import { test, type Page } from "@playwright/test"
import { expect, Guide } from "../helpers/guide"
import { readState, signIn, updateExtra } from "../helpers/run-state"

/**
 * Flow 23 — Expenses.
 * The owner records the month's running costs: shop rent by bank with 10% TDS withheld, and the NEA electricity
 * bill in cash with its VAT claimed. Both land in the expense list and the books.
 */
async function choose(page: Page, combobox: ReturnType<Page["getByRole"]>, option: string | RegExp): Promise<void> {
  await combobox.click()
  await page.getByRole("option", { name: option }).first().click()
}

test("23 · Expenses", async ({ page }, testInfo) => {
  const state = readState()
  const guide = new Guide(page, testInfo, "23 · Expenses", 8)
  await guide.install()

  await signIn(page, state.tenant, state.ownerEmail, state.ownerPassword)
  await page.goto("/dashboard/expenses")
  await guide.step("Expenses", "Rent, salaries, utilities and other running costs — they feed net profit in the P&L.")

  // Rent with TDS.
  await page.getByRole("button", { name: "Record expense" }).first().click()
  let dialog = page.getByRole("dialog", { name: "Record expense" })
  await choose(page, dialog.getByRole("combobox", { name: "Category" }), "Rent")
  await dialog.getByRole("spinbutton", { name: "Amount" }).fill("25000")
  await dialog.getByRole("textbox", { name: "Bill / receipt no. (optional)" }).fill("RENT-2083-07")
  await choose(page, dialog.getByRole("combobox", { name: "Payment method" }), "Bank")
  await choose(page, dialog.getByRole("combobox", { name: "TDS (tax deducted at source)" }), /^Rent · 10%/)
  await dialog.getByRole("textbox", { name: "Description (optional)" }).fill("Shop rent for Kartik")
  // TDS is reported against whom it was withheld from: the landlord's name and PAN.
  await dialog.getByRole("textbox", { name: "Vendor name" }).fill("Hari Prasad Shrestha (landlord)")
  await dialog.getByRole("textbox", { name: "Vendor PAN" }).fill("302468135")
  await guide.step(
    "Shop rent ₨25,000, by bank",
    "Rent carries 10% TDS: the landlord (named, with PAN) is paid ₨22,500 and ₨2,500 is owed to IRD until deposited.",
    3500,
  )
  await guide.check(
    "The form shows ₨2,500 TDS and ₨22,500 paid",
    async () => {
      await expect(dialog.getByText(/2,500\.00/).first()).toBeVisible()
      await expect(dialog.getByText(/22,500\.00/).first()).toBeVisible()
    },
    { severity: "major" },
  )
  await dialog.getByRole("button", { name: "Save expense" }).click()
  const rentSaved = await guide.check(
    "Rent with 10% TDS can be saved",
    () => expect(dialog).toBeHidden({ timeout: 10_000 }),
    { severity: "major", expected: "Saved — or the form asks for the landlord's name and PAN, which TDS needs" },
  )
  let rentTds = 2500
  if (!rentSaved) {
    await guide.step(
      "TDS can't be recorded on a paid expense",
      "The server wants the vendor's name and PAN for TDS, but the form has no field for them. Saved without TDS instead.",
      3500,
    )
    await choose(page, dialog.getByRole("combobox", { name: "TDS (tax deducted at source)" }), "No TDS")
    await dialog.getByRole("button", { name: "Save expense" }).click()
    await guide.check("The rent expense saves without TDS", () => expect(dialog).toBeHidden({ timeout: 15_000 }), { severity: "blocker" })
    rentTds = 0
  }

  // Electricity with VAT.
  await page.getByRole("button", { name: "Record expense" }).first().click()
  dialog = page.getByRole("dialog", { name: "Record expense" })
  await choose(page, dialog.getByRole("combobox", { name: "Category" }), "Utilities")
  await dialog.getByRole("spinbutton", { name: "Amount" }).fill("3390")
  await dialog.getByRole("textbox", { name: "Bill / receipt no. (optional)" }).fill("NEA-2083-0412")
  await choose(page, dialog.getByRole("combobox", { name: "VAT bill" }), "VAT bill — amount includes 13% VAT")
  await dialog.getByRole("textbox", { name: /Seller VAT \/ PAN no\./ }).fill("300044614")
  await dialog.getByRole("textbox", { name: "Description (optional)" }).fill("Electricity, Ashwin")
  await guide.step("NEA electricity ₨3,390, in cash", "A VAT bill with NEA's PAN: ₨390 of it is VAT we can claim back; ₨3,000 is the cost.", 3000)
  await guide.check(
    "The form splits out ₨390 VAT",
    () => expect(dialog.getByText(/390\.00/).first()).toBeVisible(),
    { severity: "major" },
  )
  await dialog.getByRole("button", { name: "Save expense" }).click()
  await guide.check("The electricity expense is saved", () => expect(dialog).toBeHidden({ timeout: 15_000 }), { severity: "blocker" })

  await guide.step("This month", "Both expenses are listed; the month's total and the largest category update.", 3000)
  await guide.check(
    "Both expenses are listed",
    async () => {
      await expect(page.getByRole("row").filter({ hasText: "RENT-2083-07" }).first()).toBeVisible()
      await expect(page.getByRole("row").filter({ hasText: "NEA-2083-0412" }).first()).toBeVisible()
    },
    { severity: "major" },
  )
  await guide.check(
    "Largest category this month is Rent",
    async () => expect(await page.getByRole("main").innerText()).toMatch(/Largest category this month\s+Rent/),
    { severity: "minor" },
  )

  updateExtra({ expenses: { rent: 25000, rentTds, electricity: 3390, electricityVat: 390 } })
  await guide.finish("23-expenses")
})
