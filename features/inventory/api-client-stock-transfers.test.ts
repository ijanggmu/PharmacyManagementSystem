import { describe, expect, it } from "vitest"
import { toStockTransfer, toStockTransferStatus, type DotnetStockTransferDto } from "./api-client-stock-transfers"

const base: DotnetStockTransferDto = {
  id: "11111111-1111-1111-1111-111111111111",
  transferNumber: "ST-0001",
  fromLocationId: "22222222-2222-2222-2222-222222222222",
  toLocationId: "33333333-3333-3333-3333-333333333333",
  fromBranchId: "44444444-4444-4444-4444-444444444444",
  toBranchId: "55555555-5555-5555-5555-555555555555",
  status: "InTransit",
  notes: "Weekly top-up",
  createdAtUtc: "2026-10-06T04:00:00Z",
  receivedAtUtc: null,
  cancelledAtUtc: null,
  cancellationReason: null,
  items: [{ medicineId: "66666666-6666-6666-6666-666666666666", medicineName: "Paracetamol 500mg", quantity: 12 }],
}

describe("toStockTransferStatus", () => {
  it("maps each .NET status to the legacy snake_case value", () => {
    expect(toStockTransferStatus("InTransit")).toBe("in_transit")
    expect(toStockTransferStatus("Completed")).toBe("completed")
    expect(toStockTransferStatus("Cancelled")).toBe("cancelled")
  })

  it("throws on an unknown status instead of guessing", () => {
    expect(() => toStockTransferStatus("Lost")).toThrow(/Unknown stock transfer status/)
  })
})

describe("toStockTransfer", () => {
  it("maps header fields to the legacy shape", () => {
    const row = toStockTransfer(base)
    expect(row).toMatchObject({
      id: base.id,
      transfer_number: "ST-0001",
      status: "in_transit",
      notes: "Weekly top-up",
      created_at: "2026-10-06T04:00:00Z",
      received_at: null,
      cancelled_at: null,
      cancellation_reason: null,
    })
  })

  it("keeps branch ids but has no names or codes to fill the legacy branch objects", () => {
    const row = toStockTransfer(base)
    expect(row.from_branch).toEqual({ id: base.fromBranchId, name: "", code: "" })
    expect(row.to_branch).toEqual({ id: base.toBranchId, name: "", code: "" })
  })

  it("maps items and attaches a medicine object only when a name is present", () => {
    const row = toStockTransfer(base)
    expect(row.stock_transfer_items).toHaveLength(1)
    expect(row.stock_transfer_items[0]).toMatchObject({
      medicine_id: "66666666-6666-6666-6666-666666666666",
      quantity: 12,
      medicines: { id: "66666666-6666-6666-6666-666666666666", name: "Paracetamol 500mg", strength: "", form: "" },
    })

    const unnamed = toStockTransfer({ ...base, items: [{ ...base.items[0], medicineName: null }] })
    expect(unnamed.stock_transfer_items[0].medicines).toBeNull()
  })

  it("carries received and cancelled timestamps through", () => {
    const row = toStockTransfer({
      ...base,
      status: "Cancelled",
      cancelledAtUtc: "2026-10-06T06:00:00Z",
      cancellationReason: "Wrong branch",
    })
    expect(row.status).toBe("cancelled")
    expect(row.cancelled_at).toBe("2026-10-06T06:00:00Z")
    expect(row.cancellation_reason).toBe("Wrong branch")
  })
})
