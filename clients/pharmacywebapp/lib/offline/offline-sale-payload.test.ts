import { describe, expect, it } from "vitest"
import type { CreateSaleData } from "@/features/sales/api-client"
import { offlineRecordKey, offlineRecordToCreateData } from "./offline-sale-payload"

const checkout: CreateSaleData = {
  sale_number: "S1",
  customer_id: "c1",
  total_amount: "100.00",
  discount_amount: "0.00",
  tax_amount: "11.50",
  payments: [{ method: "cash", amount: 100 }],
  payment_status: "paid",
  sale_date: "2026-01-01T00:00:00Z",
  redeem_loyalty_points: 50,
  override_credit_limit: true,
  acknowledge_warnings: true,
  sale_items: [{ medicine_id: "m1", quantity: 1, unit_price: "100.00", total_price: "100.00" }],
}

describe("offlineRecordToCreateData", () => {
  it("sends a v2 record's checkout body verbatim (loyalty, credit override and acknowledgement kept)", () => {
    expect(offlineRecordToCreateData({ version: 2, payload: checkout })).toEqual(checkout)
  })

  it("keeps a queued pack line's unit and pack count, so the replay records the same invoice units", async () => {
    const packed: CreateSaleData = {
      ...checkout,
      sale_items: [
        { medicine_id: "m1", quantity: 20, unit_price: "5.00", total_price: "100.00", sale_unit: "pack", pack_count: 2 },
      ],
    }
    const { buildOfflineSaleRecord } = await import("./offline-sales-queue")
    const record = buildOfflineSaleRecord(packed, "key-pack", new Date("2026-01-01T00:00:00Z"))
    const { toDotnetCreateSaleBody } = await import("@/lib/api/sales-api")
    expect(toDotnetCreateSaleBody(offlineRecordToCreateData(record)).items[0]).toMatchObject({
      quantity: 20,
      saleUnit: "pack",
      packCount: 2,
    })
  })

  it("converts a legacy payload and keeps loyalty / override flags", () => {
    const data = offlineRecordToCreateData({
      payload: {
        customer_id: "c1",
        payments: [{ method: "cash", amount: 20 }],
        redeem_loyalty_points: 10,
        override_credit_limit: true,
        items: [{ medicine_id: "m1", quantity: 2, unit_price: 10, discount: 0 }],
      },
    })
    expect(data.redeem_loyalty_points).toBe(10)
    expect(data.override_credit_limit).toBe(true)
    expect(data.sale_items[0]).toMatchObject({ medicine_id: "m1", quantity: 2 })
  })
})

describe("offlineRecordKey", () => {
  it("prefers the original attempt's key", () => {
    expect(offlineRecordKey({ id: 3, idempotencyKey: "k-1", payload: checkout })).toBe("k-1")
    expect(offlineRecordKey({ id: 3, payload: { client_request_id: "legacy" } })).toBe("legacy")
    expect(offlineRecordKey({ id: 3, payload: {} })).toBe("offline-sale-3")
  })
})

describe("buildOfflineSaleRecord", () => {
  it("stores the online attempt's key and schedules the first replay >= 60s later", async () => {
    const { buildOfflineSaleRecord } = await import("./offline-sales-queue")
    const now = new Date("2026-01-01T00:00:00Z")
    const record = buildOfflineSaleRecord(checkout, "key-1", now)
    expect(record.idempotencyKey).toBe("key-1")
    expect(offlineRecordKey(record)).toBe("key-1")
    expect(record.status).toBe("pending")
    expect(new Date(record.nextAttemptAt ?? 0).getTime() - now.getTime()).toBeGreaterThanOrEqual(60_000)
  })
})
