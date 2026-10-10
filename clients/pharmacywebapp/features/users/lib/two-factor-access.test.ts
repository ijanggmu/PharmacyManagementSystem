import { describe, expect, it } from "vitest"
import { DOTNET_ROOT_PERMISSIONS } from "@/lib/api/dotnet-permissions"
import { USERS_RESET_TWO_FACTOR_PERMISSION, canResetTwoFactor, showResetTwoFactorAction } from "./two-factor-access"

describe("canResetTwoFactor", () => {
  it("allows holders of the reset permission", () => {
    expect(canResetTwoFactor([USERS_RESET_TWO_FACTOR_PERMISSION])).toBe(true)
  })

  it("allows root users", () => {
    expect(canResetTwoFactor(DOTNET_ROOT_PERMISSIONS)).toBe(true)
  })

  it("denies everyone else", () => {
    expect(canResetTwoFactor(["Permissions.Users.Update"])).toBe(false)
    expect(canResetTwoFactor([])).toBe(false)
  })
})

describe("showResetTwoFactorAction", () => {
  const granted = [USERS_RESET_TWO_FACTOR_PERMISSION]

  it("shows only for users with 2FA on", () => {
    expect(showResetTwoFactorAction({ two_factor_enabled: true }, granted)).toBe(true)
    expect(showResetTwoFactorAction({ two_factor_enabled: false }, granted)).toBe(false)
    expect(showResetTwoFactorAction({}, granted)).toBe(false)
  })

  it("hides without the permission", () => {
    expect(showResetTwoFactorAction({ two_factor_enabled: true }, [])).toBe(false)
  })
})
