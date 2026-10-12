import { describe, expect, it } from "vitest"
import { isEmailLinkRoute } from "@/lib/api/dotnet-middleware"

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
