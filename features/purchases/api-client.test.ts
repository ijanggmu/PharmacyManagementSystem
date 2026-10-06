import { describe, expect, it } from "vitest"
import {
  toDirectGoodsReceipt,
  toDotnetPurchaseOrderStatus,
  toPurchaseOrder,
  toPurchaseOrderStatus,
  type DotnetDirectGoodsReceiptDto,
  type DotnetPurchaseOrderDto,
} from "./api-client"

const order: DotnetPurchaseOrderDto = {
  id: "11111111-1111-1111-1111-111111111111",
  supplierId: "22222222-2222-2222-2222-222222222222",
  supplierName: "Himal Pharma",
  orderDateUtc: "2026-10-01T00:00:00Z",
  status: "Approved",
  narration: "Monthly restock",
  totalAmount: 1250.5,
  createdAtUtc: "2026-10-01T03:00:00Z",
  approvedAtUtc: "2026-10-01T04:00:00Z",
  approvedBy: "manager@example.com",
  receivedAtUtc: null,
  receivedBy: null,
  cancelledAtUtc: null,
  cancelReason: null,
  lines: [
    {
      id: "33333333-3333-3333-3333-333333333333",
      medicineId: "44444444-4444-4444-4444-444444444444",
      medicineName: "Cetirizine 10mg",
      batchNo: "CET-1",
      expiryDate: "2028-01-31",
      quantity: 10,
      unitCostPrice: 25.25,
      sellingPrice: 40,
      rackLocation: null,
    },
  ],
}

describe("toPurchaseOrderStatus / toDotnetPurchaseOrderStatus", () => {
  it("maps .NET statuses to legacy values", () => {
    expect(toPurchaseOrderStatus("Draft")).toBe("draft")
    expect(toPurchaseOrderStatus("Approved")).toBe("approved")
    expect(toPurchaseOrderStatus("Received")).toBe("received")
    expect(toPurchaseOrderStatus("Cancelled")).toBe("cancelled")
  })

  it("throws on an unknown .NET status", () => {
    expect(() => toPurchaseOrderStatus("Closed")).toThrow(/Unknown purchase order status/)
  })

  it("maps legacy filter values back to .NET enum names and returns null for unmapped ones", () => {
    expect(toDotnetPurchaseOrderStatus("draft")).toBe("Draft")
    expect(toDotnetPurchaseOrderStatus("cancelled")).toBe("Cancelled")
    expect(toDotnetPurchaseOrderStatus("partially_received")).toBeNull()
    expect(toDotnetPurchaseOrderStatus("pending")).toBeNull()
  })
})

describe("toPurchaseOrder", () => {
  it("maps header fields and formats money as two-decimal strings", () => {
    const row = toPurchaseOrder(order)
    expect(row).toMatchObject({
      id: order.id,
      order_number: order.id,
      supplier_id: order.supplierId,
      order_date: "2026-10-01T00:00:00Z",
      status: "approved",
      total_amount: "1250.50",
      notes: "Monthly restock",
      approved_by: "manager@example.com",
      created_at: "2026-10-01T03:00:00Z",
      suppliers: { id: order.supplierId, name: "Himal Pharma" },
    })
  })

  it("has no supplier object when the supplier name is missing", () => {
    expect(toPurchaseOrder({ ...order, supplierName: null }).suppliers).toBeNull()
  })

  it("maps lines with ordered quantity, unit cost and line total", () => {
    const [item] = toPurchaseOrder(order).purchase_order_items
    expect(item).toMatchObject({
      id: "33333333-3333-3333-3333-333333333333",
      purchase_order_id: order.id,
      medicine_id: "44444444-4444-4444-4444-444444444444",
      quantity_ordered: 10,
      unit_cost: "25.25",
      total_cost: "252.50",
      medicines: { id: "44444444-4444-4444-4444-444444444444", name: "Cetirizine 10mg" },
    })
  })

  it("reports nothing received until the order is Received, then the full quantity", () => {
    expect(toPurchaseOrder(order).purchase_order_items[0].quantity_received).toBe(0)
    const received = toPurchaseOrder({ ...order, status: "Received" })
    expect(received.status).toBe("received")
    expect(received.purchase_order_items[0].quantity_received).toBe(10)
  })
})

const receipt: DotnetDirectGoodsReceiptDto = {
  id: "55555555-5555-5555-5555-555555555555",
  supplierId: "22222222-2222-2222-2222-222222222222",
  supplierName: "Himal Pharma",
  receiptDateUtc: "2026-10-02T00:00:00Z",
  supplierInvoiceNumber: "INV-88",
  status: "Received",
  netAmount: 200,
  vatAmount: 26,
  grossAmount: 226,
  createdAtUtc: "2026-10-02T01:00:00Z",
  createdBy: "clerk@example.com",
  voidedAtUtc: null,
  voidedBy: null,
  voidReason: null,
  lines: [
    { id: "a", medicineId: "m1", medicineName: "A", quantity: 5, unitCostPrice: 20, vatAmount: 13, netAmount: 100 },
    { id: "b", medicineId: "m2", medicineName: "B", quantity: 5, unitCostPrice: 20, vatAmount: 13, netAmount: 100 },
  ],
  branchId: "66666666-6666-6666-6666-666666666666",
}

describe("toDirectGoodsReceipt", () => {
  it("maps a received receipt to the legacy row", () => {
    expect(toDirectGoodsReceipt(receipt)).toEqual({
      id: receipt.id,
      receipt_number: receipt.id,
      receipt_date: "2026-10-02T00:00:00Z",
      supplier_id: receipt.supplierId,
      supplier_name: "Himal Pharma",
      supplier_invoice_number: "INV-88",
      status: "received",
      item_count: 2,
      total_cost: 226,
    })
  })

  it("maps a voided receipt to voided", () => {
    expect(toDirectGoodsReceipt({ ...receipt, status: "Voided" }).status).toBe("voided")
  })

  it("throws on an unknown receipt status", () => {
    expect(() => toDirectGoodsReceipt({ ...receipt, status: "Pending" })).toThrow(/Unknown direct receipt status/)
  })
})
