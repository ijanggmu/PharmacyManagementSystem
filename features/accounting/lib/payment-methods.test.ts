import { describe, expect, it } from "vitest"
import { PARTY_PAYMENT_METHODS, paymentDescription, paymentMethodAccount, paymentMethodLabel } from "./payment-methods"

describe("party payment methods", () => {
  it("maps cash to Cash 1000 and every other method to Bank 1010, like the API", () => {
    for (const m of PARTY_PAYMENT_METHODS) {
      expect(paymentMethodAccount(m.value).code).toBe(m.value === "cash" ? "1000" : "1010")
    }
  })

  it("builds a readable description with the method label and the reference", () => {
    expect(paymentDescription("esewa", " Ref 77 ")).toBe("eSewa - Ref 77")
    expect(paymentDescription("cash", null)).toBe("Cash")
    expect(paymentMethodLabel("bank")).toBe("Bank transfer")
  })

  it("never uses a label longer than the description budget prefix ('Bank transfer - ')", () => {
    for (const m of PARTY_PAYMENT_METHODS) expect(`${m.label} - `.length).toBeLessThanOrEqual("Bank transfer - ".length)
  })
})
