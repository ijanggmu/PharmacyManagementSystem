import { test } from "@playwright/test"
import { expect, Guide } from "../helpers/guide"
import { runStamp, signIn, writeState } from "../helpers/run-state"

/**
 * Flow 00 — Create your pharmacy.
 * A new pharmacy signs up from the public site: owner account → pharmacy details → review → create. The app
 * provisions the pharmacy, signs the owner in, and the owner can sign out and back in with the pharmacy code.
 * The pharmacy created here is the one every later flow of this run works in.
 */
test("00 · Create your pharmacy", async ({ page }, testInfo) => {
  const guide = new Guide(page, testInfo, "00 · Create your pharmacy", 10)
  await guide.install({ tours: true })

  const stamp = runStamp()
  const owner = {
    firstName: "Sita",
    lastName: "Adhikari",
    email: `qa.owner.${stamp.replace("-", "")}@pharmacare.test`,
    // Set QA_OWNER_PASSWORD for the live run — the repo is public and the live pharmacy is kept.
    password: process.env.QA_OWNER_PASSWORD ?? "QaPharma!2026",
  }
  const pharmacyName = `QA Flow Pharmacy ${stamp}`

  await page.goto("/")
  await guide.step(
    "Open the PharmaCare website",
    "Anyone can create a pharmacy workspace from the home page — it starts on the free plan, no payment needed.",
  )

  await page.getByRole("button", { name: /Get started/i }).first().click()
  const dialog = page.getByRole("dialog")
  await guide.check(
    "The sign-up form opens from Get started",
    () => expect(dialog.getByText("Your account", { exact: true }).last()).toBeVisible(),
    { severity: "blocker" },
  )
  await guide.step("Your account", "The owner's name, email and password. This person becomes the pharmacy's Admin.")
  await dialog.locator("#ob-adminFirstName").fill(owner.firstName)
  await dialog.locator("#ob-adminLastName").fill(owner.lastName)
  await dialog.locator("#ob-adminEmail").fill(owner.email)
  await dialog.locator("#ob-adminPassword").fill(owner.password)
  await dialog.locator("#ob-adminConfirmPassword").fill(owner.password)
  await guide.pause(800)
  await dialog.getByRole("button", { name: "Continue" }).click()

  await guide.step("Your pharmacy", "The pharmacy's name and the short code staff type when they sign in.")
  await guide.check(
    "The form moves on to the pharmacy step",
    () => expect(dialog.getByText("Your pharmacy", { exact: true }).last()).toBeVisible(),
    { severity: "blocker" },
  )
  await dialog.locator("#ob-pharmacyName").fill(pharmacyName)
  await dialog.locator("#ob-phoneNumber").fill("+977 9841000000")
  // The code is suggested from the name; wait for the availability check before reading it.
  await guide.pause(2500)
  const codeInput = dialog.locator("#ob-slug")
  const pharmacyCode = (await codeInput.inputValue()).trim()
  await guide.check(
    "A pharmacy code is suggested from the name",
    async () => expect(pharmacyCode).toMatch(/^qa-flow-pharmacy/),
    { severity: "minor", expected: "Code like qa-flow-pharmacy-…" },
  )
  await dialog.getByRole("button", { name: "Continue" }).click()

  await guide.step("Review and create", "Everything entered so far, ready to check before the pharmacy is created.")
  await guide.check(
    "The review shows the details entered",
    async () => {
      await expect(dialog.getByText(owner.email)).toBeVisible()
      await expect(dialog.getByText(pharmacyName)).toBeVisible()
    },
    { severity: "major" },
  )
  await dialog.getByRole("button", { name: "Create pharmacy" }).click()

  await guide.step(
    "The pharmacy is being set up",
    "The app creates the database, the default branch, roles and the chart of accounts, then signs the owner in.",
    1500,
  )
  const tour = page.getByRole("dialog").filter({ has: page.getByRole("button", { name: "Skip tour" }) })
  const landed = await guide.check(
    "Provisioning finishes and the owner lands on the dashboard",
    () => expect(tour.or(page.getByRole("heading", { name: "Dashboard", level: 1 })).first()).toBeVisible({ timeout: 180_000 }),
    { severity: "blocker" },
  )
  if (!landed) {
    await guide.finish("00-create-pharmacy")
    throw new Error("Sign-up did not reach the dashboard; later flows need this pharmacy.")
  }

  // The tour opens a moment after the dashboard renders.
  const tourShown = await tour.waitFor({ timeout: 10_000 }).then(() => true, () => false)
  if (tourShown) {
    await guide.step("Welcome tour", "The first sign-in opens a short tour of the main areas. It can be restarted later from the user menu.")
    for (let i = 0; i < 12; i++) {
      const finish = tour.getByRole("button", { name: "Finish" })
      if (await finish.isVisible().catch(() => false)) {
        await guide.pause(1800)
        await finish.click()
        break
      }
      await guide.pause(1800)
      await tour.getByRole("button", { name: "Next" }).click()
    }
    await guide.check("The tour closes after Finish", () => expect(tour).toBeHidden(), { severity: "minor" })
  } else {
    await guide.finding({
      severity: "minor",
      title: "No welcome tour on the owner's first sign-in",
      expected: "The welcome tour opens after a new pharmacy is created",
      actual: "The dashboard opened without the tour",
    })
  }
  await guide.autoDismissTours()
  await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible()

  writeState({
    tenant: pharmacyCode,
    pharmacyName,
    ownerEmail: owner.email,
    ownerPassword: owner.password,
    ownerFirstName: owner.firstName,
    ownerLastName: owner.lastName,
    createdAt: new Date().toISOString(),
    extra: {},
  })

  await guide.step("Signed in to the new pharmacy", "A brand-new workspace: empty stock, no sales yet, one Main branch.")
  await guide.check(
    "The header shows the new pharmacy's name",
    () => expect(page.getByText(pharmacyName).first()).toBeVisible(),
    { severity: "minor" },
  )

  await guide.step("Sign out", "Staff sign in with the pharmacy code, their email and password.")
  await page.goto("/dashboard/profile")
  const signOut = page.getByRole("button", { name: /Sign out|Log out/i }).first()
  if (await signOut.isVisible().catch(() => false)) {
    await signOut.click()
  } else {
    await page.getByRole("button", { name: /account|profile|user menu/i }).last().click().catch(() => undefined)
    await page.getByRole("menuitem", { name: /Sign out|Log out/i }).click()
  }
  await guide.pause(1500)

  await guide.step("Sign back in with the pharmacy code", `Pharmacy code: ${pharmacyCode}`)
  await guide.check(
    "The owner can sign back in with the pharmacy code",
    () => signIn(page, pharmacyCode, owner.email, owner.password),
    { severity: "blocker" },
  )
  await guide.pause()
  await guide.finish("00-create-pharmacy")
})
