import { describe, expect, it } from "vitest"
import type { CreateSaleData } from "@/features/sales/api-client"
import { checkoutFingerprint, toDotnetCreateSaleBody } from "@/lib/api/sales-api"

const base: CreateSaleData = {
  sale_number: "S1",
  customer_id: "",
  total_amount: "100.00",
  discount_amount: "0.00",
  tax_amount: "0.00",
  payments: [{ method: "cash", amount: 33.333 }, { method: "card", amount: 66.667 }],
  payment_status: "paid",
  sale_date: "2026-01-01T00:00:00Z",
  sale_items: [{ medicine_id: "m1", quantity: 1, unit_price: "100.00", total_price: "100.00" }],
}

describe("toDotnetCreateSaleBody", () => {
  it("rounds every tender leg to paisa (the server matches legs to the total exactly)", () => {
    expect(toDotnetCreateSaleBody(base).payments.map((p) => p.amount)).toEqual([33.33, 66.67])
  })

  it("sends acknowledgeWarnings only after the cashier reviewed a safety warning", () => {
    expect(toDotnetCreateSaleBody(base).acknowledgeWarnings).toBeUndefined()
    expect(toDotnetCreateSaleBody({ ...base, acknowledge_warnings: true }).acknowledgeWarnings).toBe(true)
  })

  it("gives an acknowledged resubmission its own idempotency fingerprint", () => {
    expect(checkoutFingerprint({ ...base, acknowledge_warnings: true })).not.toBe(checkoutFingerprint(base))
  })

  it("keeps loyalty redemption and the credit-limit override", () => {
    const body = toDotnetCreateSaleBody({ ...base, redeem_loyalty_points: 20, override_credit_limit: true })
    expect(body).toMatchObject({ redeemLoyaltyPoints: 20, overrideCreditLimit: true })
  })
})
