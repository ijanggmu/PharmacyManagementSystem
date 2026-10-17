import { test, type Page } from "@playwright/test"
import { expect, Guide } from "../helpers/guide"
import { visibleSoon } from "../helpers/ui"
import { readState, signIn, updateExtra } from "../helpers/run-state"

/**
 * Flow 10 — Prescriptions & narcotics.
 * Prescription-only medicines need a prescription; a controlled (narcotic) medicine also needs the doctor's NMC
 * number. The pharmacist records Sunita Gurung's prescription, part-fills it at the counter, and the narcotic
 * register picks up the controlled dispense with the patient, doctor and Rx number.
 */
async function pickMedicine(page: Page, index: number, name: string): Promise<void> {
  await page.locator(`#rx-item-medicine-${index}`).click()
  await page.keyboard.type(name.split(" ")[0])
  await page.getByRole("option", { name: new RegExp(name) }).first().click()
}

test("10 · Prescriptions & narcotics", async ({ page }, testInfo) => {
  const state = readState()
  const staff = state.extra.staff as Record<string, { email: string; password: string }> | undefined
  const pharmacist = staff?.pharmacist
  const guide = new Guide(page, testInfo, "10 · Prescriptions & narcotics", 12)
  await guide.install()

  await signIn(page, state.tenant, pharmacist?.email ?? state.ownerEmail, pharmacist?.password ?? state.ownerPassword)
  await guide.step("The pharmacist signs in", "Prescriptions and controlled medicines are handled by the pharmacist.")

  // A prescription-only medicine can't go to a walk-in without a prescription.
  await page.goto("/dashboard/sales/new")
  await page.getByRole("button", { name: "Add Amoxil 500mg to cart" }).click()
  await guide.step("Rx medicine without a prescription", "Amoxil is prescription-only. Selling it to a walk-in with no prescription should be stopped.")
  await page.getByRole("button", { name: "Review & pay" }).click()
  const pay0 = page.getByRole("dialog", { name: "Review & pay" })
  if (await visibleSoon(pay0, 3_000)) {
    await pay0.getByRole("button", { name: /^Complete sale/ }).click().catch(() => undefined)
  }
  await guide.check(
    "A prescription-only medicine is not sold without a prescription",
    () => expect(page.getByRole("dialog", { name: /^Print invoice/ })).toBeHidden({ timeout: 5_000 }),
    { severity: "blocker", expected: "The sale is blocked until a prescription is attached" },
  )
  await guide.pause(2500)
  for (let i = 0; i < 2; i++) await page.keyboard.press("Escape")
  await page.getByRole("button", { name: "Clear all items from cart" }).click().catch(() => undefined)

  // Record the prescription.
  await page.goto("/dashboard/prescriptions")
  await page.getByRole("button", { name: "Add prescription" }).first().click()
  const dialog = page.getByRole("dialog", { name: "New prescription" })
  await dialog.waitFor()
  await guide.step("New prescription", "Patient, doctor and every medicine prescribed with its quantity and dosage. It is valid 180 days by default.")
  await dialog.getByRole("combobox", { name: "Patient" }).click()
  await page.getByRole("option", { name: "Sunita Gurung" }).click()
  await dialog.locator("#doctor_name").fill("Dr. Anil Sharma")
  await dialog.locator("#notes").fill("Post-operative pain; review after 10 days.")
  await dialog.getByRole("button", { name: "Add first medicine" }).click()
  await pickMedicine(page, 0, "Tramadol 50mg")
  await dialog.locator("#cp-qty-0").fill("20")
  await dialog.locator("#cp-dosage-0").fill("1 capsule twice daily after meals")
  await dialog.getByRole("button", { name: "Add medicine" }).click()
  await pickMedicine(page, 1, "Amoxil 500mg")
  await dialog.locator("#cp-qty-1").fill("30")
  await dialog.locator("#cp-dosage-1").fill("1 capsule three times daily for 10 days")
  await guide.pause(1000)

  await dialog.getByRole("button", { name: "Save prescription" }).click()
  await guide.step("Controlled medicine needs the NMC number", "Tramadol is a narcotic, so the doctor's NMC licence number is required.")
  await guide.check(
    "Saving without the doctor's NMC number is refused for a controlled medicine",
    async () => {
      await expect(dialog).toBeVisible()
      await expect(dialog.getByText(/Required: a controlled medicine/)).toBeVisible()
      expect(await dialog.locator("#doctor_license").evaluate((el) => (el as HTMLInputElement).validity.valid)).toBe(false)
    },
    { severity: "blocker" },
  )
  await dialog.locator("#doctor_license").fill("NMC-12345")
  await guide.pause(800)
  await dialog.getByRole("button", { name: "Save prescription" }).click()
  await guide.check("The prescription saves", () => expect(dialog).toBeHidden({ timeout: 15_000 }), { severity: "blocker" })
  const rxRow = page.getByRole("row").filter({ hasText: "Sunita Gurung" }).first()
  await guide.check("It is listed as Pending", () => expect(rxRow).toContainText(/Pending/i), { severity: "major" })
  const rxNo = ((await rxRow.innerText().catch(() => "")).match(/RX[-\w/]+/i) ?? [null])[0]
  await guide.step("Saved", `${rxNo ?? "The prescription"} is pending — nothing dispensed yet.`)

  // Part-fill it at the counter.
  await page.goto("/dashboard/sales/new")
  await page.getByRole("combobox", { name: /Select customer/ }).click()
  await page.getByRole("option", { name: /Sunita Gurung/ }).click()
  await page.getByRole("combobox", { name: "Prescription (optional)" }).click()
  await page.getByRole("option").filter({ hasText: rxNo ?? "Anil Sharma" }).first().click()
  await guide.step("Dispense against the prescription", "Choose the patient, then their prescription. Today: 10 Tramadol and 15 Amoxil — half of each.")
  const tramadolLoaded = page.getByRole("list", { name: "Cart items" }).getByText("Tramadol 50mg").first()
  if (!(await visibleSoon(tramadolLoaded, 3_000))) {
    await page.getByRole("button", { name: "Add Tramadol 50mg to cart" }).click()
    await page.getByRole("button", { name: "Add Amoxil 500mg to cart" }).click()
  }
  await page.getByRole("spinbutton", { name: /Quantity for Tramadol 50mg/ }).fill("10")
  await page.getByRole("spinbutton", { name: /Quantity for Amoxil 500mg/ }).fill("15")
  await page.getByRole("spinbutton", { name: /Quantity for Amoxil 500mg/ }).press("Tab")
  await guide.pause(1200)
  await page.getByRole("button", { name: "Review & pay" }).click()
  const pay = page.getByRole("dialog", { name: "Review & pay" })
  await pay.getByRole("button", { name: "Exact" }).click().catch(() => undefined)
  await pay.getByRole("button", { name: /^Complete sale/ }).click()
  const preview = page.getByRole("dialog", { name: /^Print invoice/ })
  const sold = await guide.check(
    "The prescription sale completes",
    () => expect(preview).toBeVisible({ timeout: 20_000 }),
    { severity: "blocker" },
  )
  if (sold) {
    await guide.step("The invoice names the prescription", "The Rx number and the doctor print on the invoice for a controlled medicine.", 2500)
    await guide.check(
      "The invoice shows the Rx number and doctor",
      async () => {
        const frame = preview.frameLocator("iframe")
        await expect(frame.getByText(/Dr\. Anil Sharma|Anil Sharma/).first()).toBeVisible()
        if (rxNo) await expect(frame.getByText(rxNo).first()).toBeVisible()
      },
      { severity: "major" },
    )
    await preview.getByRole("button", { name: "Close" }).first().click()
  } else {
    for (let i = 0; i < 3; i++) await page.keyboard.press("Escape")
  }

  await page.goto("/dashboard/prescriptions")
  await guide.step("Partly filled", "The prescription now shows what was given and what is still owed.")
  await guide.check(
    "The prescription is Partially filled",
    () => expect(page.getByRole("row").filter({ hasText: "Sunita Gurung" }).first()).toContainText(/Partial/i),
    { severity: "major" },
  )

  await page.goto("/dashboard/reports/dda-narcotic")
  await guide.step("Narcotic register", "Every controlled dispense: date, patient, doctor and NMC no., Rx no., batch, quantity and invoice — as the DDA asks.", 3500)
  await guide.check(
    "The register records the Tramadol dispense",
    async () => {
      const row = page.getByRole("row").filter({ hasText: "Tramadol" }).first()
      await expect(row).toBeVisible()
      await expect(row).toContainText("10")
      await expect(row).toContainText(/Sunita Gurung/)
      await expect(row).toContainText(/NMC-12345/)
    },
    { severity: "blocker" },
  )

  updateExtra({ prescription: rxNo })
  await guide.finish("10-prescriptions-and-narcotics")
})
