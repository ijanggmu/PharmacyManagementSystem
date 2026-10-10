import { describe, expect, it, vi } from "vitest"
import { signInWithGoogle, signUpTenantWithDotnet, verifyGoogleSignUp } from "@/lib/api/auth-api"

vi.mock("@/lib/api/client-helpers", () => ({ getCSRFToken: async () => "csrf-token" }))

function fetchReturning(status: number, body: unknown) {
  const calls: Array<[string, RequestInit | undefined]> = []
  const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push([String(url), init])
    return new Response(body === null ? null : JSON.stringify(body), { status })
  })
  return { calls, fetchImpl: fetchImpl as unknown as typeof fetch }
}

describe("signInWithGoogle", () => {
  it("posts the ID token (and pharmacy code) to the Google BFF route with CSRF", async () => {
    const { calls, fetchImpl } = fetchReturning(200, { ok: true, tenant: "acme" })

    const result = await signInWithGoogle({ idToken: "token-123", tenant: "acme" }, fetchImpl)

    expect(result).toEqual({ ok: true })
    expect(calls[0][0]).toBe("/api/dotnet/auth/google")
    expect(calls[0][1]?.headers).toEqual({ "Content-Type": "application/json", "X-CSRF-Token": "csrf-token" })
    expect(JSON.parse(String(calls[0][1]?.body))).toEqual({
      idToken: "token-123",
      tenant: "acme",
      twoFactorCode: null,
      recoveryCode: null,
    })
  })

  it("returns the pharmacy list when the Google account is connected to several pharmacies", async () => {
    const pharmacies = [
      { tenantId: "acme", tenantName: "Acme Pharmacy" },
      { tenantId: "globex", tenantName: "Globex Pharmacy" },
    ]
    const { fetchImpl } = fetchReturning(200, { ok: false, needsPharmacy: true, email: "a@b.co", pharmacies })

    const result = await signInWithGoogle({ idToken: "token-123" }, fetchImpl)

    expect(result).toEqual({ ok: false, needsPharmacy: true, email: "a@b.co", pharmacies })
  })

  it("surfaces the not-connected error code", async () => {
    const { fetchImpl } = fetchReturning(404, { code: "GOOGLE_NOT_LINKED", message: "This Google account isn't connected" })

    const result = await signInWithGoogle({ idToken: "token-123" }, fetchImpl)

    expect(result).toEqual({ ok: false, code: "GOOGLE_NOT_LINKED", message: "This Google account isn't connected" })
  })
})

describe("verifyGoogleSignUp", () => {
  it("returns the Google profile", async () => {
    const profile = { email: "owner@x.com", firstName: "Asha", lastName: "Rai", picture: null }
    const { fetchImpl } = fetchReturning(200, profile)

    expect(await verifyGoogleSignUp("token-123", fetchImpl)).toEqual({ ok: true, profile })
  })
})

describe("signUpTenantWithDotnet", () => {
  const base = {
    pharmacyName: "Sunrise",
    slug: "sunrise",
    adminFirstName: "Asha",
    adminLastName: "Rai",
    adminEmail: "owner@x.com",
  }

  it("sends the Google token and no password for a Google sign-up", async () => {
    const { calls, fetchImpl } = fetchReturning(201, { ok: true, tenantId: "sunrise", provisioningCorrelationId: "c1", status: "Pending" })

    const result = await signUpTenantWithDotnet({ ...base, googleIdToken: "g-token", adminPassword: "ignored" }, fetchImpl)

    expect(result).toEqual({ ok: true, tenantId: "sunrise", provisioningCorrelationId: "c1", status: "Pending" })
    const body = JSON.parse(String(calls[0][1]?.body))
    expect(body.googleIdToken).toBe("g-token")
    expect(body.adminPassword).toBeNull()
    expect(body.adminConfirmPassword).toBeNull()
  })

  it("sends the password for an email sign-up", async () => {
    const { calls, fetchImpl } = fetchReturning(201, { ok: true, tenantId: "sunrise", provisioningCorrelationId: null, status: null })

    await signUpTenantWithDotnet({ ...base, adminPassword: "Secret1234", adminConfirmPassword: "Secret1234" }, fetchImpl)

    const body = JSON.parse(String(calls[0][1]?.body))
    expect(body.adminPassword).toBe("Secret1234")
    expect(body.googleIdToken).toBeNull()
  })
})
