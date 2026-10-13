import { describe, expect, it } from "vitest"
import {
  createDirectReceiptBody,
  createPurchaseOrderBody,
  directReceiptBillView,
  purchaseOrderBillView,
  receivePurchaseOrderBody,
  toPurchaseOrder,
  type DotnetDirectGoodsReceiptDto,
  type DotnetPurchaseOrderDto,
} from "./api-client"

const discountedOrder: DotnetPurchaseOrderDto = {
  id: "o1",
  supplierId: "s1",
  supplierName: "Himal Pharma",
  orderDateUtc: "2026-10-01T00:00:00Z",
  status: "Received",
  narration: null,
  totalAmount: 855,
  createdAtUtc: "2026-10-01T03:00:00Z",
  approvedAtUtc: null,
  approvedBy: null,
  receivedAtUtc: "2026-10-03T00:00:00Z",
  receivedBy: "clerk",
  cancelledAtUtc: null,
  cancelReason: null,
  supplierInvoiceNumber: "INV-1",
  totalVatAmount: 111.15,
  subtotalAmount: 1000,
  lineDiscountAmount: 100,
  billDiscountPercent: 5,
  billDiscountAmount: 45,
  lines: [
    {
      id: "l1",
      medicineId: "m1",
      medicineName: "Amoxicillin 500",
      batchNo: "AMX-1",
      expiryDate: "2028-01-31",
      quantity: 100,
      unitCostPrice: 10,
      sellingPrice: 14,
      rackLocation: null,
      vatAmount: 111.15,
      freeQuantity: 10,
      discountPercent: 10,
      discountAmount: 100,
      billDiscountAmount: 45,
      grossAmount: 1000,
      netAmount: 855,
      effectiveUnitCost: 7.77,
      packSize: 10,
      packUnitCost: 100,
    },
  ],
}

describe("purchase order with free goods and discounts", () => {
  it("maps the bill view with the discount breakdown and net bill", () => {
    const view = purchaseOrderBillView(discountedOrder)
    expect(view).toMatchObject({
      kind: "order",
      subtotal: 1000,
      line_discount: 100,
      bill_discount_percent: 5,
      bill_discount: 45,
      taxable: 855,
      vat: 111.15,
      total: 966.15,
      date: "2026-10-03T00:00:00Z",
    })
    expect(view.lines[0]).toMatchObject({ free_quantity: 10, pack_size: 10, pack_unit_cost: 100, taxable: 855, effective_unit_cost: 7.77 })
  })

  it("reads an older order without discount fields as undiscounted", () => {
    const { lines, ...rest } = discountedOrder
    const legacy: DotnetPurchaseOrderDto = {
      ...rest,
      subtotalAmount: undefined,
      lineDiscountAmount: undefined,
      billDiscountPercent: undefined,
      billDiscountAmount: undefined,
      totalAmount: 1000,
      lines: [{ ...lines[0], freeQuantity: undefined, discountAmount: undefined, billDiscountAmount: undefined, grossAmount: undefined, netAmount: undefined, effectiveUnitCost: undefined, packSize: undefined, packUnitCost: undefined }],
    }
    const view = purchaseOrderBillView(legacy)
    expect(view.subtotal).toBe(1000)
    expect(view.lines[0].taxable).toBe(1000)
    expect(view.lines[0].effective_unit_cost).toBe(10)
  })

  it("carries free quantity and net on the legacy row", () => {
    const [item] = toPurchaseOrder(discountedOrder).purchase_order_items
    expect(item).toMatchObject({ free_quantity: 10, pack_size: 10, net_amount: 855, effective_unit_cost: 7.77, total_cost: "1000.00" })
  })

  it("sends line terms and the bill discount on create", () => {
    const body = createPurchaseOrderBody({
      supplier_id: "s1",
      order_date: "2026-10-01",
      bill_discount_percent: 5,
      items: [
        { medicine_id: "m1", quantity_ordered: 10, unit_cost: "100", vat_amount: "111.15", free_quantity: 1, discount_percent: 10, in_packs: true },
      ],
    })
    expect(body.billDiscountPercent).toBe(5)
    expect(body.billDiscountAmount).toBe(0)
    expect(body.lines[0]).toMatchObject({ freeQuantity: 1, discountPercent: 10, discountAmount: 0, inPacks: true, vatAmount: 111.15 })
  })

  it("defaults the terms to none for callers that send none", () => {
    const body = createPurchaseOrderBody({
      supplier_id: "s1",
      order_date: "2026-10-01",
      items: [{ medicine_id: "m1", quantity_ordered: 2, unit_cost: "10" }],
    })
    expect(body.lines[0]).toMatchObject({ freeQuantity: 0, discountPercent: 0, discountAmount: 0, inPacks: false })
    expect(body.billDiscountAmount).toBe(0)
  })

  it("sends the free quantity that arrived only for lines that arrived", () => {
    const body = receivePurchaseOrderBody([
      { purchase_order_item_id: "l1", quantity_to_receive: 50, free_quantity_to_receive: 5 },
      { purchase_order_item_id: "l2", quantity_to_receive: 0, free_quantity_to_receive: 3 },
    ])
    expect(body.lines.map((l) => l.freeQuantityReceived)).toEqual([5, null])
  })
})

describe("direct receipt (supplier bill)", () => {
  it("builds the create body with terms, bill discount and payment", () => {
    const body = createDirectReceiptBody({
      supplier_id: "s1",
      receipt_date: "2026-10-05",
      supplier_invoice_number: " B-7 ",
      payment_method: "cash",
      bill_discount_amount: 50,
      items: [
        {
          medicine_id: "m1",
          batch_number: " amx-1 ",
          expiry_date: "2028-01-31",
          quantity: 10,
          unit_cost: 100,
          vat_amount: 111.15,
          free_quantity: 1,
          discount_percent: 10,
          selling_price: "",
        },
      ],
    })
    expect(body).toMatchObject({
      supplierId: "s1",
      receiptDateUtc: "2026-10-05T00:00:00Z",
      supplierInvoiceNumber: "B-7",
      billDiscountAmount: 50,
      payment: { method: "cash" },
    })
    expect(body.lines[0]).toMatchObject({ batchNo: "amx-1", quantity: 10, unitCostPrice: 100, freeQuantity: 1, discountPercent: 10, sellingPrice: null })
  })

  it("sends no payment for a bill on credit, and refuses a line without a batch", () => {
    const base = { supplier_id: "s1", receipt_date: "2026-10-05", items: [] }
    expect(createDirectReceiptBody(base).payment).toBeNull()
    expect(() =>
      createDirectReceiptBody({
        ...base,
        items: [{ medicine_id: "m1", batch_number: " ", expiry_date: "2028-01-31", quantity: 1, unit_cost: 1, vat_amount: 0 }],
      }),
    ).toThrow(/batch/)
  })

  it("maps the receipt bill view", () => {
    const dto: DotnetDirectGoodsReceiptDto = {
      id: "r1",
      supplierId: "s1",
      supplierName: "Himal Pharma",
      receiptDateUtc: "2026-10-05T00:00:00Z",
      supplierInvoiceNumber: "B-7",
      status: "Received",
      netAmount: 950,
      vatAmount: 111.15,
      grossAmount: 1061.15,
      createdAtUtc: "2026-10-05T01:00:00Z",
      createdBy: "clerk",
      voidedAtUtc: null,
      voidedBy: null,
      voidReason: null,
      branchId: "b1",
      receiptNumber: "GRN-MAIN-2083/84-00003",
      subtotalAmount: 1100,
      lineDiscountAmount: 100,
      billDiscountAmount: 50,
      lines: [
        { id: "a", medicineId: "m1", medicineName: "A", quantity: 10, unitCostPrice: 100, vatAmount: 111.15, netAmount: 855, freeQuantity: 1, discountAmount: 100, billDiscountAmount: 45, grossAmount: 1000, effectiveUnitCost: 77.73 },
        { id: "b", medicineId: "m2", medicineName: "B", quantity: 5, unitCostPrice: 20, vatAmount: 0, netAmount: 95 },
      ],
    }
    const view = directReceiptBillView(dto)
    expect(view).toMatchObject({ kind: "receipt", number: "GRN-MAIN-2083/84-00003", status: "received", subtotal: 1100, taxable: 950, total: 1061.15 })
    expect(view.lines[1]).toMatchObject({ gross: 95, free_quantity: 0, effective_unit_cost: 19 })
  })
})
