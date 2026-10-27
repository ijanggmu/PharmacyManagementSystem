import { describe, expect, it } from "vitest"
import { isEmailLinkRoute, isPublicBookingRoute, sendsSignedInUserHome } from "@/lib/api/dotnet-middleware"

describe("isEmailLinkRoute", () => {
  it.each(["/auth/confirm-email", "/auth/reset-password", "/reset-password", "/auth/confirm-email/"])(
    "treats %s as public (emailed links are opened signed-out)",
    (path) => {
      expect(isEmailLinkRoute(path)).toBe(true)
    },
  )

  it.each(["/dashboard", "/auth/confirm-email-x", "/reset-password/../dashboard"])("does not open %s", (path) => {
    expect(isEmailLinkRoute(path)).toBe(false)
  })
})

describe("sendsSignedInUserHome", () => {
  it.each(["/", "/auth/login", "/auth/sign-up", "/auth/callback", "/t/demo-pharmacy/login"])(
    "sends a signed-in user from %s to the dashboard",
    (path) => {
      expect(sendsSignedInUserHome(path)).toBe(true)
    },
  )

  it.each(["/dashboard", "/onboarding", "/privacy", "/auth/reset-password"])("leaves %s alone", (path) => {
    expect(sendsSignedInUserHome(path)).toBe(false)
  })
})

describe("isPublicBookingRoute", () => {
  it("opens the patients' booking page signed-out", () => {
    expect(isPublicBookingRoute("/book")).toBe(true)
    expect(isPublicBookingRoute("/book/")).toBe(true)
  })

  it("opens the public Find a doctor page signed-out", () => {
    expect(isPublicBookingRoute("/explore")).toBe(true)
    expect(isPublicBookingRoute("/explore/")).toBe(true)
  })

  it.each(["/booking", "/book/../dashboard", "/dashboard/book", "/explorer", "/dashboard/explore"])("does not open %s", (path) => {
    expect(isPublicBookingRoute(path)).toBe(false)
  })
})
