import type { Request } from "@playwright/test"
import { expect, test } from "./helpers/session"
import { mockDotnet, paged } from "./helpers/dotnet-mocks"

const CUSTOMER_ID = "00000000-0000-4000-8000-00000000e001"

test("records a customer receipt paid by cheque", async ({ authedPage: page }) => {
  await mockDotnet(page, "GET", "/customers", {
    body: paged([{ id: CUSTOMER_ID, name: "Ram Bahadur", phone: "9800000001", currentBalance: 1500, isActive: true }]),
  })
  const posted: Request[] = []
  await mockDotnet(page, "POST", `/customers/${CUSTOMER_ID}/payments`, (request) => {
    posted.push(request)
    return { body: "00000000-0000-4000-8000-00000000e101" }
  })

  await page.goto("/dashboard/reports/accounting/receivables")
  await page.getByRole("button", { name: "Record customer payment" }).first().click()

  const dialog = page.getByRole("dialog", { name: "Record customer payment" })
  await dialog.getByRole("combobox", { name: /Customer/ }).click()
  await page.getByRole("option", { name: /Ram Bahadur/ }).click()
  await expect(dialog).toContainText("Owes you")

  await dialog.getByLabel(/Amount/).fill("1500")
  await dialog.getByRole("combobox", { name: "Received as" }).click()
  await page.getByRole("option", { name: "Cheque" }).click()

  const cheque = dialog.getByRole("group", { name: "Cheque" })
  await cheque.getByLabel(/Cheque no\./).fill("004512")
  await cheque.getByRole("button", { name: /Cheque date|Pick a date/ }).click()
  await page.getByRole("button", { name: "Today", exact: true }).click()
  await cheque.getByLabel("Drawn on (customer's bank)").fill("Nabil Bank")
  await expect(dialog).toContainText("Cheques in Hand (1160)")

  await dialog.getByRole("button", { name: "Record receipt" }).click()
  await expect(dialog).toBeHidden()

  expect(posted).toHaveLength(1)
  expect(posted[0].postDataJSON()).toMatchObject({
    customerId: CUSTOMER_ID,
    amount: 1500,
    paymentMethod: "cheque",
    chequeNumber: "004512",
    chequeBank: "Nabil Bank",
    chequeClearedOnDeposit: false,
    chequeDateUtc: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T00:00:00Z$/),
  })
  expect(posted[0].headers()["idempotency-key"]).toBeTruthy()
})
