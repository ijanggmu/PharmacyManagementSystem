import { describe, expect, it } from "vitest"
import {
  buildSendIrdBody,
  toIrdQueueHealth,
  toIrdSendResult,
  toIrdSalesRegisterRow,
  toIrdPurchaseRegisterRow,
  type DotnetIrdQueueHealthDto,
  type DotnetIrdSalesRegisterRowDto,
  type DotnetIrdPurchaseRegisterRowDto,
} from "@/lib/api/ird-api"

describe("toIrdQueueHealth", () => {
  it("maps the .NET queue health to the legacy system-health shape", () => {
    const dto: DotnetIrdQueueHealthDto = {
      pendingCount: 3,
      failedCount: 1,
      salesFailedCount: 2,
      recentFailed: [{ id: "q-1", lastError: "401 Unauthorized", createdAtUtc: "2026-10-06T04:00:00Z" }],
    }
    expect(toIrdQueueHealth(dto)).toEqual({
      pendingCount: 3,
      failedCount: 1,
      salesFailedCount: 2,
      recentFailed: [{ id: "q-1", last_error: "401 Unauthorized", created_at: "2026-10-06T04:00:00Z" }],
    })
  })

  it("keeps a null last error as null", () => {
    const health = toIrdQueueHealth({
      pendingCount: 0,
      failedCount: 1,
      salesFailedCount: 0,
      recentFailed: [{ id: "q-2", lastError: null, createdAtUtc: "2026-10-06T04:00:00Z" }],
    })
    expect(health.recentFailed[0].last_error).toBeNull()
  })

  it("returns an empty recent list when nothing has failed", () => {
    expect(
      toIrdQueueHealth({ pendingCount: 0, failedCount: 0, salesFailedCount: 0, recentFailed: [] }).recentFailed,
    ).toEqual([])
  })
})

describe("toIrdSendResult", () => {
  it("returns the sale id and invoice number the legacy route returns", () => {
    expect(
      toIrdSendResult({
        saleId: "s-1",
        queueItemId: "q-9",
        invoiceNumber: "INV-261006-4821",
      }),
    ).toEqual({ saleId: "s-1", invoiceNumber: "INV-261006-4821" })
  })
})

describe("buildSendIrdBody", () => {
  it("sends an empty body because the sale id travels in the route", () => {
    expect(buildSendIrdBody()).toEqual({})
  })
})

describe("toIrdSalesRegisterRow", () => {
  const dto: DotnetIrdSalesRegisterRowDto = {
    saleId: "s-1",
    invoiceNumber: "INV-260915-0001",
    saleDateUtc: "2026-09-15T04:00:00Z",
    totalAmount: 130,
    taxAmount: 13,
    discountAmount: 5,
    paymentMethod: "Cash",
    irdStatus: "Pending",
    customerId: "c-1",
    customerName: "Jane Doe",
    customerPhone: "9800000000",
    customerEmail: "jane@example.com",
  }

  it("maps every field, deriving taxable from VAT (not total minus VAT) when an older API sends no breakdown", () => {
    expect(toIrdSalesRegisterRow(dto)).toEqual({
      id: "s-1",
      sale_number: null,
      invoice_number: "INV-260915-0001",
      sale_date: "2026-09-15T04:00:00Z",
      total_amount: 130,
      tax_amount: 13,
      discount_amount: 5,
      // 13 VAT at 13% → 100 taxable; the other 17 is exempt, not taxable.
      taxable_amount: 100,
      exempt_amount: 17,
      payment_method: "Cash",
      ird_status: "Pending",
      customer_id: "c-1",
      customer_name: "Jane Doe",
      customer_phone: "9800000000",
      customer_email: "jane@example.com",
      row_type: "sale",
      document_number: null,
      original_invoice_number: null,
    })
  })

  it("leaves taxable_amount null when tax_amount is null rather than inventing a figure", () => {
    const row = toIrdSalesRegisterRow({ ...dto, taxAmount: null })
    expect(row.tax_amount).toBeNull()
    expect(row.taxable_amount).toBeNull()
    expect(row.exempt_amount).toBeNull()
  })

  it("uses the API's taxable and exempt amounts when present", () => {
    const row = toIrdSalesRegisterRow({ ...dto, taxableAmount: 99.5, exemptAmount: 17.5 })
    expect(row.taxable_amount).toBe(99.5)
    expect(row.exempt_amount).toBe(17.5)
    expect(row.taxable_amount! + row.exempt_amount! + (row.tax_amount ?? 0)).toBe(row.total_amount)
  })

  it("defaults a missing invoice number and walk-in contact fields to empty strings", () => {
    const row = toIrdSalesRegisterRow({
      ...dto,
      invoiceNumber: null,
      customerId: null,
      customerName: "Walk-in",
      customerPhone: null,
      customerEmail: null,
    })
    expect(row.invoice_number).toBe("")
    expect(row.customer_phone).toBe("")
    expect(row.customer_email).toBe("")
  })
})

describe("toIrdPurchaseRegisterRow", () => {
  const dto: DotnetIrdPurchaseRegisterRowDto = {
    orderId: "po-1",
    orderDateUtc: "2026-09-10T00:00:00Z",
    supplierId: "sup-1",
    supplierName: "Acme Pharma",
    supplierInvoiceNumber: "SUP-INV-9",
    totalAmount: 565,
    status: "Received",
    taxableAmount: 500,
    vatAmount: 65,
  }

  it("maps every field, using the order id as the stand-in order/purchase number", () => {
    expect(toIrdPurchaseRegisterRow(dto)).toEqual({
      id: "po-1",
      order_number: "po-1",
      purchase_number: "po-1",
      order_date: "2026-09-10T00:00:00Z",
      status: "Received",
      total_amount: 565,
      taxable_amount: 500,
      tax_amount: 65,
      supplier_name: "Acme Pharma",
      supplier_tax_invoice_numbers: "SUP-INV-9",
    })
  })

  it("derives taxable value from the gross when an older API omits net/VAT", () => {
    const row = toIrdPurchaseRegisterRow({ ...dto, taxableAmount: undefined, vatAmount: undefined })
    expect(row.taxable_amount).toBe(565)
    expect(row.tax_amount).toBe(0)
  })

  it("defaults a missing supplier invoice number to an empty string", () => {
    expect(toIrdPurchaseRegisterRow({ ...dto, supplierInvoiceNumber: null }).supplier_tax_invoice_numbers).toBe("")
  })
})

describe("toIrdSalesRegisterRow reversal rows", () => {
  const base: DotnetIrdSalesRegisterRowDto = {
    saleId: "sale-1",
    invoiceNumber: "INV-1",
    saleDateUtc: "2026-10-05T06:00:00Z",
    totalAmount: -113,
    taxAmount: -13,
    discountAmount: 0,
    paymentMethod: "cash",
    irdStatus: "Synced",
    customerId: null,
    customerName: "Walk-in",
    customerPhone: null,
    customerEmail: null,
    taxableAmount: -100,
    exemptAmount: 0,
    rowType: "return",
    documentNumber: "CN-1",
    originalInvoiceNumber: "INV-1",
  }

  it("maps type, credit-note number and negative amounts, with an id unique per row", () => {
    const row = toIrdSalesRegisterRow(base)
    expect(row).toMatchObject({
      row_type: "return",
      document_number: "CN-1",
      original_invoice_number: "INV-1",
      total_amount: -113,
      tax_amount: -13,
      taxable_amount: -100,
    })
    expect(row.id).not.toBe("sale-1")
  })

  it("treats a row from an older API build as a sale", () => {
    const { rowType: _rowType, documentNumber: _doc, originalInvoiceNumber: _orig, ...old } = base
    const row = toIrdSalesRegisterRow({ ...old, totalAmount: 113, taxAmount: 13, taxableAmount: 100 })
    expect(row.row_type).toBe("sale")
    expect(row.id).toBe("sale-1")
    expect(row.original_invoice_number).toBeNull()
  })

  it("derives a negative exempt value for an old-shape reversal row", () => {
    const row = toIrdSalesRegisterRow({ ...base, taxableAmount: null, exemptAmount: null, totalAmount: -163 })
    expect(row.taxable_amount).toBe(-100)
    expect(row.exempt_amount).toBe(-50)
  })
})
