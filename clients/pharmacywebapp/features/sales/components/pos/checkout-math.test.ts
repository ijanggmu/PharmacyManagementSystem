import { describe, expect, it } from "vitest"
import {
  checkoutBlockReason,
  paymentStatus,
  taxableSplit,
  unitCountLabel,
  type BlockReasonInput,
} from "@/features/sales/components/pos/checkout-math"
import { computeInclusiveVat, roundMoneyAwayFromZero, type VatCartLine } from "@/features/sales/lib/vat"
import { summarizePayments } from "@/features/sales/components/payment/payment-math"

const line = (quantity: number, unitPrice: number, discountPercent = 0, isTaxable = true): VatCartLine => ({
  quantity,
  unitPrice,
  discountPercent,
  isTaxable,
  totalPrice: quantity * unitPrice * (1 - discountPercent / 100),
})

describe("taxableSplit", () => {
  it("puts everything in taxable when no line is exempt", () => {
    expect(taxableSplit([line(2, 50), line(1, 13)])).toEqual({ taxable: 113, exempt: 0, hasExempt: false })
  })

  it("separates exempt lines and shares the order discount across both", () => {
    const lines = [line(1, 100), line(1, 100, 0, false)]
    const split = taxableSplit(lines, 20)
    expect(split).toEqual({ taxable: 90, exempt: 90, hasExempt: true })
  })

  it("matches the VAT computeInclusiveVat carves out of the taxable part", () => {
    const carts: { lines: VatCartLine[]; discount: number; rate: number }[] = [
      { lines: [line(3, 33.33, 5), line(2, 12.5, 0, false), line(1, 99.99, 12.5)], discount: 17.37, rate: 13 },
      { lines: [line(7, 1.005), line(1, 250, 0, false)], discount: 0, rate: 13 },
      { lines: [line(1, 1000, 10), line(4, 45.6)], discount: 100, rate: 13.5 },
    ]
    for (const { lines, discount, rate } of carts) {
      const { taxable } = taxableSplit(lines, discount)
      expect(roundMoneyAwayFromZero((taxable * rate) / (100 + rate))).toBe(computeInclusiveVat(lines, rate, discount))
    }
  })
})

describe("paymentStatus", () => {
  it("reports what is still due", () => {
    expect(paymentStatus(summarizePayments(100, [{ method: "cash", amount: 60 }]))).toEqual({
      kind: "due",
      amountPaisa: 4000,
      changePaisa: 0,
    })
  })

  it("reports covered with change due from cash tendered", () => {
    expect(paymentStatus(summarizePayments(44.1, [{ method: "cash", amount: 44.1, tendered: 50 }]))).toEqual({
      kind: "covered",
      amountPaisa: 0,
      changePaisa: 590,
    })
  })

  it("reports an overpayment across legs", () => {
    const s = summarizePayments(100, [
      { method: "cash", amount: 80 },
      { method: "card", amount: 30 },
    ])
    expect(paymentStatus(s)).toMatchObject({ kind: "over", amountPaisa: 1000 })
  })

  it("is not covered while a leg is empty", () => {
    const s = summarizePayments(100, [
      { method: "cash", amount: 100 },
      { method: "card", amount: 0 },
    ])
    expect(paymentStatus(s).kind).toBe("due")
  })
})

describe("checkoutBlockReason", () => {
  const fmt = (n: number) => `Rs ${n.toFixed(2)}`
  const base = (over: Partial<BlockReasonInput> = {}): BlockReasonInput => ({
    legCount: 1,
    summary: summarizePayments(100, [{ method: "cash", amount: 100 }]),
    hasCredit: false,
    hasCustomer: false,
    qrPending: false,
    qrUnconfirmed: false,
    shortTender: false,
    ...over,
  })

  it("allows a balanced bill", () => {
    expect(checkoutBlockReason(base(), fmt)).toBeNull()
  })

  it("explains each blocker in priority order", () => {
    expect(checkoutBlockReason(base({ legCount: 0, summary: summarizePayments(100, []) }), fmt)).toBe("Add a payment method.")
    expect(
      checkoutBlockReason(base({ summary: summarizePayments(100, [{ method: "cash", amount: 0 }]) }), fmt),
    ).toBe("Enter an amount for every payment.")
    expect(
      checkoutBlockReason(base({ summary: summarizePayments(100, [{ method: "cash", amount: 60 }]) }), fmt),
    ).toBe("Rs 40.00 still to collect.")
    expect(
      checkoutBlockReason(base({ summary: summarizePayments(100, [{ method: "cash", amount: 120 }]) }), fmt),
    ).toBe("Payments are Rs 20.00 more than the bill. Reduce one.")
    expect(checkoutBlockReason(base({ hasCredit: true }), fmt)).toBe("Select a customer before recording a credit sale.")
    expect(checkoutBlockReason(base({ hasCredit: true, hasCustomer: true, qrPending: true }), fmt)).toBe(
      "Waiting for the Fonepay payment to be confirmed.",
    )
    expect(checkoutBlockReason(base({ qrUnconfirmed: true, shortTender: true }), fmt)).toMatch(/^Fonepay payment wasn't confirmed/)
    expect(checkoutBlockReason(base({ shortTender: true }), fmt)).toBe("Cash received is less than the cash amount.")
  })
})

describe("unitCountLabel", () => {
  it("counts lines and total units", () => {
    expect(unitCountLabel([1])).toBe("1 line · 1 unit")
    expect(unitCountLabel([2, 3])).toBe("2 lines · 5 units")
    expect(unitCountLabel([110])).toBe("1 line · 110 units")
    expect(unitCountLabel([])).toBe("0 lines · 0 units")
  })
})
