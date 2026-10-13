import { expect, test } from "@playwright/test"
import { EMAIL, TENANT } from "./helpers/session"

test.describe("Sign in", () => {
  test("signs in with pharmacy code, email and password and lands on the dashboard", async ({ page }) => {
    await page.goto("/dashboard")
    // Signed out: the session guard (proxy.ts) sends the user to the sign-in dialog.
    await expect(page).toHaveURL(/[?&]auth=signin/)

    const dialog = page.getByRole("dialog")
    await dialog.getByLabel(/Pharmacy code/).fill(TENANT)
    await dialog.getByRole("textbox", { name: "Email" }).fill(EMAIL)
    await dialog.getByLabel("Password", { exact: true }).fill("e2e-password")
    await dialog.getByRole("button", { name: "Sign in", exact: true }).click()

    await expect(page).toHaveURL(/\/dashboard$/)
    await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible()
    // Server-rendered KPIs come from the stub .NET API (fixtures.mjs).
    await expect(page.getByRole("link", { name: /^Customers 42/ })).toBeVisible()
    await expect(page.getByRole("link", { name: /^Medicines 2/ })).toBeVisible()
  })

  test("shows the API's error for wrong credentials", async ({ page }) => {
    await page.goto("/?auth=signin")
    const dialog = page.getByRole("dialog")
    await dialog.getByLabel(/Pharmacy code/).fill(TENANT)
    await dialog.getByRole("textbox", { name: "Email" }).fill(EMAIL)
    await dialog.getByLabel("Password", { exact: true }).fill("wrong-password")
    await dialog.getByRole("button", { name: "Sign in", exact: true }).click()

    await expect(dialog.getByRole("alert")).toBeVisible()
    await expect(page).not.toHaveURL(/\/dashboard/)
  })
})
