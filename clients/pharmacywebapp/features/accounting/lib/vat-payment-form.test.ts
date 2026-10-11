import { describe, expect, it } from "vitest"
import { hasVatPaymentErrors, validateVatPaymentForm } from "./vat-payment-form"

describe("validateVatPaymentForm", () => {
  const ok = { amount: "1250.50", date: "2026-10-11", reference: "IRD-123" }

  it("accepts a positive 2-dp amount, a date and a short reference", () => {
    expect(hasVatPaymentErrors(validateVatPaymentForm(ok))).toBe(false)
  })

  it("rejects a missing, zero, negative or over-precise amount", () => {
    expect(validateVatPaymentForm({ ...ok, amount: "" }).amount).toBeDefined()
    expect(validateVatPaymentForm({ ...ok, amount: "0" }).amount).toBeDefined()
    expect(validateVatPaymentForm({ ...ok, amount: "-5" }).amount).toBeDefined()
    expect(validateVatPaymentForm({ ...ok, amount: "10.125" }).amount).toBe("Use at most 2 decimal places.")
  })

  it("requires a yyyy-mm-dd date and caps the reference", () => {
    expect(validateVatPaymentForm({ ...ok, date: "" }).date).toBeDefined()
    expect(validateVatPaymentForm({ ...ok, reference: "x".repeat(129) }).reference).toBeDefined()
  })
})
