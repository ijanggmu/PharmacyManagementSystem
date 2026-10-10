import { describe, expect, it } from "vitest"
import { buildReferenceNote, parseAmountInput, PAYMENT_DESCRIPTION_MAX, validatePaymentForm } from "./payment-form"

const base = { partyId: "c1", amount: "500", date: "2026-10-09", today: "2026-10-09" }

describe("parseAmountInput", () => {
  it("accepts plain and comma-grouped amounts with up to two decimals", () => {
    expect(parseAmountInput("1250")).toBe(1250)
    expect(parseAmountInput(" 1,250.50 ")).toBe(1250.5)
  })
  it("rejects anything else", () => {
    for (const bad of ["", "abc", "1.234", "-5", "1e3", "12.3.4"]) expect(parseAmountInput(bad)).toBeNaN()
  })
})

describe("validatePaymentForm", () => {
  it("passes a complete form", () => {
    const r = validatePaymentForm({ ...base, outstanding: 1000 }, "receipt")
    expect(r.valid).toBe(true)
    expect(r.amount).toBe(500)
    expect(r.overpaymentBy).toBeNull()
  })

  it("requires a party, with a kind-specific message", () => {
    expect(validatePaymentForm({ ...base, partyId: "" }, "receipt").errors.party).toBe("Choose a customer")
    expect(validatePaymentForm({ ...base, partyId: "" }, "payment").errors.party).toBe("Choose a supplier")
  })

  it("rejects empty, malformed and zero amounts", () => {
    expect(validatePaymentForm({ ...base, amount: "" }, "payment").errors.amount).toBe("Enter the amount paid")
    expect(validatePaymentForm({ ...base, amount: "12x" }, "payment").errors.amount).toMatch(/amount like/)
    expect(validatePaymentForm({ ...base, amount: "0" }, "payment").errors.amount).toMatch(/more than zero/)
  })

  it("rejects a future or missing date and allows today and the past", () => {
    expect(validatePaymentForm({ ...base, date: "2026-10-10" }, "receipt").errors.date).toMatch(/future/)
    expect(validatePaymentForm({ ...base, date: "" }, "receipt").errors.date).toBe("Pick a date")
    expect(validatePaymentForm({ ...base, date: "2026-01-01" }, "receipt").errors.date).toBeUndefined()
  })

  it("flags (but does not block) paying more than is outstanding", () => {
    const r = validatePaymentForm({ ...base, amount: "1200.25", outstanding: 1000 }, "payment")
    expect(r.valid).toBe(true)
    expect(r.overpaymentBy).toBe(200.25)
  })

  it("treats a credit (negative) balance as nothing outstanding", () => {
    expect(validatePaymentForm({ ...base, amount: "100", outstanding: -50 }, "receipt").overpaymentBy).toBe(100)
  })

  it("skips the overpayment check when the balance is unknown or exactly met", () => {
    expect(validatePaymentForm({ ...base, outstanding: null }, "receipt").overpaymentBy).toBeNull()
    expect(validatePaymentForm({ ...base, amount: "500.00", outstanding: 500 }, "receipt").overpaymentBy).toBeNull()
  })

  it("rejects a reference/note too long for the stored description", () => {
    const r = validatePaymentForm({ ...base, note: "x".repeat(PAYMENT_DESCRIPTION_MAX) }, "receipt")
    expect(r.errors.description).toBeDefined()
    expect(r.valid).toBe(false)
  })
})

describe("buildReferenceNote", () => {
  it("joins reference, bill and note, skipping blanks", () => {
    expect(buildReferenceNote({ reference: " CHQ-12 ", billNumber: "INV-9", billDate: "2026-10-01", note: "part" })).toBe(
      "Ref CHQ-12 | Bill INV-9 / 2026-10-01 | part"
    )
    expect(buildReferenceNote({ note: "only note" })).toBe("only note")
    expect(buildReferenceNote({ reference: "  ", note: "" })).toBeNull()
  })
})

describe("validatePaymentForm with a bill", () => {
  it("caps the amount at the bill's outstanding instead of warning about an advance", () => {
    const over = validatePaymentForm({ ...base, amount: "600", billOutstanding: 452 }, "payment")
    expect(over.valid).toBe(false)
    expect(over.errors.amount).toMatch(/only Rs 452.00 outstanding/)
    expect(over.overpaymentBy).toBeNull()
    expect(validatePaymentForm({ ...base, amount: "452", billOutstanding: 452 }, "payment").valid).toBe(true)
  })
})
