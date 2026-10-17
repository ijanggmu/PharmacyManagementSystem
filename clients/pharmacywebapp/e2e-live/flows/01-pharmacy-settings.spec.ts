import { test } from "@playwright/test"
import { expect, Guide } from "../helpers/guide"
import { readState, signIn, updateExtra } from "../helpers/run-state"

/**
 * Flow 01 — Pharmacy profile & settings.
 * The owner fills in what prints on every invoice (legal name, license, PAN/VAT), the contact details, VAT rate
 * and receipt footer, saves, and checks everything is still there after a reload.
 */
test("01 · Pharmacy profile & settings", async ({ page }, testInfo) => {
  const state = readState()
  const guide = new Guide(page, testInfo, "01 · Pharmacy profile & settings", 9)
  await guide.install()

  const profile = {
    legalName: `${state.pharmacyName} Pvt. Ltd.`,
    license: "DDA-PH-2083-0451",
    pan: "609876543",
    phone: "01-4123456",
    address: "New Road, Kathmandu",
    email: "info@qaflow.test",
    footer: "Thank you! Medicines once sold are returnable within 7 days with the bill.",
  }

  await signIn(page, state.tenant, state.ownerEmail, state.ownerPassword)
  await guide.step("Sign in as the owner", "Settings are for the owner or a manager — staff can't change them.")

  await page.goto("/dashboard/settings")
  await page.getByRole("tab", { name: "Pharmacy profile" }).click()
  await guide.step(
    "Pharmacy profile",
    "The legal name, DDA license number and PAN/VAT number — they print on every tax invoice.",
  )
  await page.locator("#legal-name").fill(profile.legalName)
  await page.locator("#license-number").fill(profile.license)
  await page.locator("#pan-vat-number").fill(profile.pan)
  await guide.pause(800)
  await page.getByRole("tabpanel").getByRole("button", { name: "Save changes" }).first().click()
  await guide.check(
    "Saving the profile confirms it",
    () => expect(page.getByText(/saved|updated/i).first()).toBeVisible(),
    { severity: "minor", expected: "A 'saved' message after Save changes" },
  )
  await guide.step("Profile saved", "A confirmation appears.")

  await page.getByRole("tab", { name: "System" }).click()
  await guide.step(
    "Contact details, VAT and receipt",
    "Phone, address and email for invoices; the VAT rate used at the counter; a footer line on every receipt.",
  )
  await page.locator("#pharmacyPhone").fill(profile.phone)
  await page.locator("#pharmacyAddress").fill(profile.address)
  await page.locator("#pharmacyEmail").fill(profile.email)
  await page.getByRole("tab", { name: "Tax & invoicing" }).click()
  await guide.check(
    "The VAT rate defaults to Nepal's 13%",
    () => expect(page.locator("#vatRate")).toHaveValue(/^13(\.0+)?$/),
    { severity: "major", expected: "VAT rate 13" },
  )
  await page.locator("#receiptFooter").fill(profile.footer)
  await guide.pause(800)
  await page.getByRole("button", { name: "Save changes" }).last().click()
  await guide.check(
    "Saving system settings confirms it",
    () => expect(page.getByText(/saved|updated/i).first()).toBeVisible(),
    { severity: "minor", expected: "A 'saved' message after Save changes" },
  )
  await guide.step("Settings saved", "")

  await page.reload()
  await page.getByRole("tab", { name: "Pharmacy profile" }).click()
  await guide.step("Reload the page", "Everything entered must still be there — it is stored on the server, not in the browser.")
  await guide.check(
    "Profile values survive a reload",
    async () => {
      await expect(page.locator("#legal-name")).toHaveValue(profile.legalName)
      await expect(page.locator("#license-number")).toHaveValue(profile.license)
      await expect(page.locator("#pan-vat-number")).toHaveValue(profile.pan)
    },
    { severity: "major" },
  )
  await page.getByRole("tab", { name: "System" }).click()
  await page.getByRole("tab", { name: "General" }).click()
  await guide.check(
    "Contact details survive a reload",
    async () => {
      await expect(page.locator("#pharmacyPhone")).toHaveValue(profile.phone)
      await expect(page.locator("#pharmacyAddress")).toHaveValue(profile.address)
      await expect(page.locator("#pharmacyEmail")).toHaveValue(profile.email)
    },
    { severity: "major" },
  )
  await page.getByRole("tab", { name: "Tax & invoicing" }).click()
  await guide.check(
    "The receipt footer survives a reload",
    () => expect(page.locator("#receiptFooter")).toHaveValue(profile.footer),
    { severity: "major" },
  )
  await guide.step("All saved", "Profile and system settings are stored.")

  await page.getByRole("tab", { name: "Payments" }).click()
  await guide.step(
    "Payment methods and IRD e-billing",
    "Which payment methods the counter offers, and the IRD connection used to send invoices (set up by the owner).",
    3000,
  )

  updateExtra({ profile })
  await guide.finish("01-pharmacy-settings")
})
