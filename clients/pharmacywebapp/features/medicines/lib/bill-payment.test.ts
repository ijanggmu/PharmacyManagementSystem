import { describe, expect, it } from "vitest"
import { billTotal, emptyBillPayment, toBillPaymentInput, validateBillPayment } from "./bill-payment"

describe("bill payment", () => {
  const rows = [
    { stock_quantity: 10, cost_price: 20, vat_amount: 26 },
    { stock_quantity: 5, cost_price: 4, vat_amount: 0 },
  ]

  it("totals cost plus VAT", () => {
    expect(billTotal(rows)).toBe(246)
  })

  it("on credit sends nothing and never errors", () => {
    expect(validateBillPayment(emptyBillPayment(), 0)).toBeNull()
    expect(toBillPaymentInput(emptyBillPayment())).toBeNull()
  })

  it("paid with a blank amount pays the full bill", () => {
    const state = { ...emptyBillPayment(), paid: true, method: "bank" as const, reference: " TXN-9 " }
    expect(validateBillPayment(state, 246)).toBeNull()
    expect(toBillPaymentInput(state)).toEqual({ method: "bank", amount: null, reference: "TXN-9", payment_date: null })
  })

  it("allows a part payment and rejects more than the bill", () => {
    const base = { ...emptyBillPayment(), paid: true }
    expect(validateBillPayment({ ...base, amount: "100" }, 246)).toBeNull()
    expect(toBillPaymentInput({ ...base, amount: "1,000.50", date: "2026-10-01" })).toMatchObject({
      amount: 1000.5,
      payment_date: "2026-10-01",
    })
    expect(validateBillPayment({ ...base, amount: "300" }, 246)).toMatch(/bill total/)
    expect(validateBillPayment({ ...base, amount: "abc" }, 246)).toMatch(/Enter the amount/)
    expect(validateBillPayment({ ...base, amount: "0" }, 246)).toMatch(/more than zero/)
  })

  it("can't mark an empty bill paid", () => {
    expect(validateBillPayment({ ...emptyBillPayment(), paid: true }, 0)).toMatch(/Add medicines/)
  })
})
