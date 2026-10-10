import { describe, expect, it } from "vitest"
import { PASSWORD_RULES, passwordMeetsPolicy } from "./password-policy"

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
