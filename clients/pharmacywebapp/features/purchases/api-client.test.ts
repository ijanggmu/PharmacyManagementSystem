import { describe, expect, it } from "vitest"
import {
  createPurchaseOrderBody,
  directReceiptsListQuery,
  receivePurchaseOrderBody,
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
  supplierInvoiceNumber: "INV-2026-0042",
  totalVatAmount: 31.56,
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
      vatAmount: 31.56,
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

  it("maps legacy filter values onto the .NET lifecycle and returns null for unmapped ones", () => {
    expect(toDotnetPurchaseOrderStatus("draft")).toBe("Draft")
    expect(toDotnetPurchaseOrderStatus("cancelled")).toBe("Cancelled")
    expect(toDotnetPurchaseOrderStatus("pending")).toBe("Draft")
    expect(toDotnetPurchaseOrderStatus("ordered")).toBe("Approved")
    expect(toDotnetPurchaseOrderStatus("open")).toBe("Draft,Approved")
    expect(toDotnetPurchaseOrderStatus("partially_received")).toBeNull()
  })
})

describe("purchase order VAT, invoice number and receipt date", () => {
  it("maps the order invoice number, receipt date, and line VAT to the legacy shape", () => {
    const row = toPurchaseOrder({ ...order, status: "Received", receivedAtUtc: "2026-10-02T09:00:00Z" })
    expect(row.supplier_invoice_number).toBe("INV-2026-0042")
    expect(row.received_at).toBe("2026-10-02T09:00:00Z")
    expect(row.branch_id).toBeNull()
    expect(toPurchaseOrder({ ...order, branchId: "b-1" }).branch_id).toBe("b-1")
    expect(row.purchase_order_items[0].vat_amount).toBe(31.56)
  })

  it("sends VAT and the invoice number on create, with blank invoice numbers as null", () => {
    const body = createPurchaseOrderBody({
      supplier_id: "s1",
      order_date: "2026-10-01",
      supplier_invoice_number: "  INV-9  ",
      items: [{ medicine_id: "m1", quantity_ordered: 2, unit_cost: "10", vat_amount: "2.6" }],
    })
    expect(body.supplierInvoiceNumber).toBe("INV-9")
    expect(body.lines[0].vatAmount).toBe(2.6)
    expect(createPurchaseOrderBody({ supplier_id: "s1", order_date: "2026-10-01", supplier_invoice_number: " ", items: [] }).supplierInvoiceNumber).toBeNull()
  })

  it("sends the receipt date as the UTC receipt instant on receive", () => {
    expect(receivePurchaseOrderBody([], "2026-10-02").receiptDateUtc).toBe("2026-10-02T00:00:00Z")
    expect(receivePurchaseOrderBody([]).receiptDateUtc).toBeNull()
  })

  it("sends the supplier's bill number typed at receipt, blank as null", () => {
    expect(receivePurchaseOrderBody([], "2026-10-02", true, null, " BILL-77 ").supplierInvoiceNumber).toBe("BILL-77")
    expect(receivePurchaseOrderBody([], "2026-10-02", true, null, "  ").supplierInvoiceNumber).toBeNull()
    expect(receivePurchaseOrderBody([]).supplierInvoiceNumber).toBeNull()
  })
})

describe("toPurchaseOrder", () => {
  it("shows the order number, falling back to the id for orders from before numbering", () => {
    expect(toPurchaseOrder({ ...order, orderNumber: "PO-MAIN-2083/84-00012" }).order_number).toBe("PO-MAIN-2083/84-00012")
    expect(toPurchaseOrder({ ...order, orderNumber: null }).order_number).toBe(order.id)
  })

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
      fiscal_year: null,
      receipt_date: "2026-10-02T00:00:00Z",
      supplier_id: receipt.supplierId,
      supplier_name: "Himal Pharma",
      supplier_invoice_number: "INV-88",
      status: "received",
      item_count: 2,
      total_cost: 226,
      branch_id: receipt.branchId,
      purchase_order_id: null,
      purchase_order_number: null,
      source: "supplier_bill",
    })
  })

  it("shows the serial receipt number and fiscal year when the receipt is numbered", () => {
    const row = toDirectGoodsReceipt({ ...receipt, receiptNumber: "GRN-MAIN-2083/84-00012", fiscalYear: "2083/84" })
    expect(row.receipt_number).toBe("GRN-MAIN-2083/84-00012")
    expect(row.fiscal_year).toBe("2083/84")
  })

  it("maps a voided receipt to voided", () => {
    expect(toDirectGoodsReceipt({ ...receipt, status: "Voided" }).status).toBe("voided")
  })

  it("says where the receipt came from, falling back to the order link on older servers", () => {
    expect(toDirectGoodsReceipt({ ...receipt, source: "StockEntry" }).source).toBe("stock_entry")
    expect(toDirectGoodsReceipt({ ...receipt, source: "PurchaseOrder", purchaseOrderId: "po1" }).source).toBe("purchase_order")
    expect(toDirectGoodsReceipt({ ...receipt, purchaseOrderId: "po1" }).source).toBe("purchase_order")
    expect(toDirectGoodsReceipt(receipt).source).toBe("supplier_bill")
  })

  it("throws on an unknown receipt status", () => {
    expect(() => toDirectGoodsReceipt({ ...receipt, status: "Pending" })).toThrow(/Unknown direct receipt status/)
  })
})

describe("directReceiptsListQuery", () => {
  it("asks the server for one page with the filters", () => {
    const path = directReceiptsListQuery({ branchId: "b1", page: 3, limit: 10, status: "voided", search: "  grn-7 " })
    const [base, query] = path.split("?")
    expect(base).toBe("/purchasing/direct-goods-receipts")
    const sp = new URLSearchParams(query)
    expect(sp.get("pageNumber")).toBe("3")
    expect(sp.get("pageSize")).toBe("10")
    expect(sp.get("branchId")).toBe("b1")
    expect(sp.get("status")).toBe("voided")
    expect(sp.get("search")).toBe("grn-7")
  })

  it("sends the supplier, source and receipt-date filters in the server's terms", () => {
    const sp = new URLSearchParams(
      directReceiptsListQuery({
        supplierId: "s1",
        source: "stock_entry",
        dateFrom: "2026-10-19T18:15:00.000Z",
        dateTo: "2026-10-26T18:14:59.999Z",
      }).split("?")[1],
    )
    expect(sp.get("supplierId")).toBe("s1")
    expect(sp.get("source")).toBe("StockEntry")
    expect(sp.get("dateFromUtc")).toBe("2026-10-19T18:15:00.000Z")
    expect(sp.get("dateToUtc")).toBe("2026-10-26T18:14:59.999Z")
    expect(new URLSearchParams(directReceiptsListQuery({ source: "all" }).split("?")[1]).has("source")).toBe(false)
  })

  it("leaves out the 'all' status and blank search, and clamps the page", () => {
    const sp = new URLSearchParams(directReceiptsListQuery({ status: "all", search: "  ", page: 0, limit: 500 }).split("?")[1])
    expect(sp.has("status")).toBe(false)
    expect(sp.has("search")).toBe(false)
    expect(sp.get("pageNumber")).toBe("1")
    expect(sp.get("pageSize")).toBe("200")
  })
})
