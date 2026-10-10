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

  it("maps every field, deriving taxable_amount from total minus tax", () => {
    expect(toIrdSalesRegisterRow(dto)).toEqual({
      id: "s-1",
      sale_number: null,
      invoice_number: "INV-260915-0001",
      sale_date: "2026-09-15T04:00:00Z",
      total_amount: 130,
      tax_amount: 13,
      discount_amount: 5,
      taxable_amount: 117,
      payment_method: "Cash",
      ird_status: "Pending",
      customer_id: "c-1",
      customer_name: "Jane Doe",
      customer_phone: "9800000000",
      customer_email: "jane@example.com",
    })
  })

  it("leaves taxable_amount null when tax_amount is null rather than inventing a figure", () => {
    const row = toIrdSalesRegisterRow({ ...dto, taxAmount: null })
    expect(row.tax_amount).toBeNull()
    expect(row.taxable_amount).toBeNull()
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
