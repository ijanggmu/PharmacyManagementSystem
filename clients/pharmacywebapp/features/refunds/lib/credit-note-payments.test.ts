import { describe, expect, it } from "vitest"
import { creditNotePaymentLegs } from "./credit-note-payments"

describe("creditNotePaymentLegs", () => {
  it("prints the recorded split", () => {
    expect(creditNotePaymentLegs({ cash: 60, bank: 0, on_account: 40 }, "original_payment", 100)).toEqual([
      { method: "Cash refunded", amount: 60 },
      { method: "Credited to customer account", amount: 40 },
    ])
  })

  it("falls back to the chosen method before the refund is completed", () => {
    expect(creditNotePaymentLegs(null, "store_credit", 100)).toEqual([{ method: "Store credit", amount: 100 }])
    expect(creditNotePaymentLegs(undefined, null, 5)).toEqual([{ method: "Original payment method", amount: 5 }])
  })
})
