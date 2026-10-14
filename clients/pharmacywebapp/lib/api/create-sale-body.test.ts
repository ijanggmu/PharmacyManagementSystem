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

  it("sends the base quantity plus the pack count only for lines sold in packs", () => {
    const body = toDotnetCreateSaleBody({
      ...base,
      sale_items: [
        { medicine_id: "m1", quantity: 20, unit_price: "5.00", total_price: "100.00", sale_unit: "pack", pack_count: 2 },
        { medicine_id: "m2", quantity: 3, unit_price: "5.00", total_price: "15.00" },
      ],
    })
    expect(body.items[0]).toMatchObject({ medicineId: "m1", quantity: 20, saleUnit: "pack", packCount: 2 })
    expect(body.items[1]).not.toHaveProperty("saleUnit")
    expect(body.items[1]).not.toHaveProperty("packCount")
  })

  it("keeps a base-unit checkout's body (and fingerprint) unchanged", () => {
    expect(Object.keys(toDotnetCreateSaleBody(base).items[0]).sort()).toEqual(
      ["discountAmount", "discountPercent", "medicineId", "quantity"],
    )
  })

  it("sends manager approval tokens but keeps the fingerprint, so the approval's bound key is reused", () => {
    expect(toDotnetCreateSaleBody(base).approvalTokens).toBeUndefined()
    const approved = { ...base, approval_tokens: ["apv_1", "apv_2"] }
    expect(toDotnetCreateSaleBody(approved).approvalTokens).toEqual(["apv_1", "apv_2"])
    expect(checkoutFingerprint(approved)).toBe(checkoutFingerprint(base))
  })

  it("sends when an offline sale was rung up, only on an offline replay", () => {
    const soldAt = "2026-10-12T04:30:00.000Z"
    expect(toDotnetCreateSaleBody(base)).not.toHaveProperty("offlineSoldAtUtc")
    expect(toDotnetCreateSaleBody({ ...base, offline_sold_at: soldAt })).not.toHaveProperty("offlineSoldAtUtc")
    expect(toDotnetCreateSaleBody({ ...base, offline_replay: true, offline_sold_at: soldAt })).toMatchObject({
      offlineReplay: true,
      offlineSoldAtUtc: soldAt,
    })
  })

  it("keeps loyalty redemption and the credit-limit override", () => {
    const body = toDotnetCreateSaleBody({ ...base, redeem_loyalty_points: 20, override_credit_limit: true })
    expect(body).toMatchObject({ redeemLoyaltyPoints: 20, overrideCreditLimit: true })
  })
})

describe("SMS receipt", () => {
  it("is only in the body when ticked, with the number when one was typed", () => {
    expect(toDotnetCreateSaleBody(base)).not.toHaveProperty("smsReceipt")
    expect(toDotnetCreateSaleBody({ ...base, sms_receipt: false, sms_receipt_phone: "9841234567" })).not.toHaveProperty("smsReceipt")
    expect(toDotnetCreateSaleBody({ ...base, sms_receipt: true, sms_receipt_phone: " 9841234567 " })).toMatchObject({
      smsReceipt: true,
      smsReceiptPhone: "9841234567",
    })
    expect(toDotnetCreateSaleBody({ ...base, sms_receipt: true, sms_receipt_phone: null })).not.toHaveProperty("smsReceiptPhone")
  })

  it("leaves an ordinary checkout's fingerprint unchanged", () => {
    expect(checkoutFingerprint({ ...base, sms_receipt: false })).toBe(checkoutFingerprint(base))
  })
})
