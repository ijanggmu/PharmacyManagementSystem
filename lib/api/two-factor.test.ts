import { describe, expect, it } from "vitest"
import {
  formatSharedKey,
  isCompleteRecoveryCode,
  isCompleteTotp,
  isLowOnRecoveryCodes,
  normalizeRecoveryCode,
  recoveryCodesFileText,
  sanitizeTotp,
  stripTwoFactorPrefix,
  twoFactorSignInState,
} from "./two-factor"

describe("normalizeRecoveryCode", () => {
  it("produces the stored XXXXX-XXXXX form", () => {
    expect(normalizeRecoveryCode("ABCDE-FGHJK")).toBe("ABCDE-FGHJK")
    expect(normalizeRecoveryCode("  abcde-fghjk ")).toBe("ABCDE-FGHJK")
    expect(normalizeRecoveryCode("abcdefghjk")).toBe("ABCDE-FGHJK")
    expect(normalizeRecoveryCode("ab cde fg-hjk")).toBe("ABCDE-FGHJK")
  })

  it("leaves partial input without a hyphen", () => {
    expect(normalizeRecoveryCode("abc")).toBe("ABC")
    expect(normalizeRecoveryCode("")).toBe("")
  })
})

describe("isCompleteRecoveryCode", () => {
  it("accepts ten alphanumerics with or without a hyphen", () => {
    expect(isCompleteRecoveryCode("ABCDE-FGHJK")).toBe(true)
    expect(isCompleteRecoveryCode("abcdefghjk")).toBe(true)
    expect(isCompleteRecoveryCode("ABCDE-FGHJ")).toBe(false)
    expect(isCompleteRecoveryCode("ABCDE-FGHJKL")).toBe(false)
  })
})

describe("recoveryCodesFileText", () => {
  it("lists every code with the account and timestamp", () => {
    const text = recoveryCodesFileText(["AAAAA-BBBBB", "CCCCC-DDDDD"], "me@x.co", new Date("2026-01-02T03:04:05Z"))
    expect(text).toContain("Account: me@x.co")
    expect(text).toContain("Generated: 2026-01-02T03:04:05.000Z")
    expect(text).toContain("AAAAA-BBBBB\nCCCCC-DDDDD")
  })
})

describe("isLowOnRecoveryCodes", () => {
  it("warns at three or fewer", () => {
    expect(isLowOnRecoveryCodes(3)).toBe(true)
    expect(isLowOnRecoveryCodes(0)).toBe(true)
    expect(isLowOnRecoveryCodes(4)).toBe(false)
  })
})

describe("twoFactorSignInState", () => {
  it("detects the required step from the server detail", () => {
    expect(twoFactorSignInState("two_factor_required: An authenticator code is required to complete sign-in.")).toBe("required")
  })

  it("detects a wrong or expired code", () => {
    expect(twoFactorSignInState("two_factor_invalid: The authenticator code is invalid or expired.")).toBe("invalid")
  })

  it("ignores ordinary sign-in errors", () => {
    expect(twoFactorSignInState("Invalid credentials")).toBeNull()
    expect(twoFactorSignInState(undefined)).toBeNull()
  })
})

describe("stripTwoFactorPrefix", () => {
  it("returns the human message", () => {
    expect(stripTwoFactorPrefix("two_factor_invalid: The code is wrong.")).toBe("The code is wrong.")
    expect(stripTwoFactorPrefix("Plain message")).toBe("Plain message")
  })
})

describe("sanitizeTotp", () => {
  it("keeps digits and caps at six", () => {
    expect(sanitizeTotp("123 456")).toBe("123456")
    expect(sanitizeTotp("12-34-56-78")).toBe("123456")
    expect(sanitizeTotp("ab1c")).toBe("1")
  })
})

describe("isCompleteTotp", () => {
  it("requires exactly six digits", () => {
    expect(isCompleteTotp("123456")).toBe(true)
    expect(isCompleteTotp("12345")).toBe(false)
    expect(isCompleteTotp("12345a")).toBe(false)
  })
})

describe("formatSharedKey", () => {
  it("groups the secret in fours", () => {
    expect(formatSharedKey("abcdefghijklmn")).toBe("ABCD EFGH IJKL MN")
  })
})
