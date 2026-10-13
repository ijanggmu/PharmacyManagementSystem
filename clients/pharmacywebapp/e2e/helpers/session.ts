import { expect, test as base, type Page } from "@playwright/test"

export const TENANT = "demo-pharmacy"
export const EMAIL = "owner@demo-pharmacy.test"

/**
 * Signs in through the real BFF login route (CSRF token + same-origin POST), which issues a token from
 * the stub .NET API and stores the session server-side. page.request shares the browser context's
 * cookies, so the page is signed in afterwards.
 */
export async function signIn(page: Page): Promise<void> {
  const baseURL = test.info().project.use.baseURL ?? "http://localhost:3100"
  const csrf = await page.request.get("/api/csrf/token")
  expect(csrf.ok()).toBeTruthy()
  const { token } = (await csrf.json()) as { token: string }
  const login = await page.request.post("/api/dotnet/auth/login", {
    headers: { "X-CSRF-Token": token, Origin: baseURL },
    data: { email: EMAIL, password: "e2e-password", tenant: TENANT },
  })
  expect(login.ok(), await login.text()).toBeTruthy()
}

/** `page` already signed in as the tenant owner. */
export const test = base.extend<{ authedPage: Page }>({
  authedPage: async ({ page }, use) => {
    // Report every product tour (global / role / module, see components/app-tour.tsx) as already seen,
    // so no tour dialog ever covers the page under test.
    await page.addInitScript(() => {
      const getItem = Storage.prototype.getItem
      Storage.prototype.getItem = function (key: string) {
        return /^pharmacare_(role_|module_)?tour/.test(key) ? "true" : getItem.call(this, key)
      }
    })
    await signIn(page)
    await use(page)
  },
})

export { expect }
