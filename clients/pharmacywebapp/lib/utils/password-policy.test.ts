import { describe, expect, it } from "vitest"
import { PASSWORD_RULES, generateStrongPassword, passwordMeetsPolicy, passwordPolicyError } from "./password-policy"

describe("passwordMeetsPolicy", () => {
  it("accepts a password matching every rule", () => {
    expect(passwordMeetsPolicy("Pharmacy2026")).toBe(true)
  })

  it.each([
    ["Short1A", "length"],
    ["lowercase123", "upper"],
    ["UPPERCASE123", "lower"],
    ["NoDigitsHere", "digit"],
  ])("rejects %s (fails %s)", (password, failing) => {
    expect(passwordMeetsPolicy(password)).toBe(false)
    expect(PASSWORD_RULES.find((rule) => rule.id === failing)?.test(password)).toBe(false)
  })
})

describe("passwordPolicyError", () => {
  it("is null for a valid password", () => {
    expect(passwordPolicyError("Pharmacy2026")).toBeNull()
  })

  it("names every missing rule", () => {
    expect(passwordPolicyError("abc")).toBe("Password needs at least 10 characters, an uppercase letter, a number")
  })

  it("asks for a password when empty", () => {
    expect(passwordPolicyError("")).toBe("Enter a password")
  })
})

describe("generateStrongPassword", () => {
  it("always meets the policy", () => {
    for (let i = 0; i < 200; i++) {
      const password = generateStrongPassword()
      expect(password).toHaveLength(14)
      expect(passwordMeetsPolicy(password)).toBe(true)
      expect(password).not.toMatch(/[0O1lI]/)
    }
  })
})
