import { describe, expect, it } from "vitest"
import { toDotnetAddMedicineStockCommand, toDotnetCreateMedicineCommand } from "@/lib/api/catalog-api"

describe("duplicate medicine handling", () => {
  const form = {
    name: "Cetamol",
    strength: "500mg",
    stock_quantity: 50,
    batch_number: " pcm2411 ",
    expiry_date: "2028-01-31T00:00:00.000Z",
    cost_price: 1.2,
    unit_price: 2,
    supplier_id: "s1",
    supplier_invoice_number: "INV-9",
    vat_amount: 7.8,
    payment: { method: "cash" },
  }

  it("creates with allowDuplicate false unless the user confirmed a different product", () => {
    expect(toDotnetCreateMedicineCommand(form).allowDuplicate).toBe(false)
    expect(toDotnetCreateMedicineCommand({ ...form, allow_duplicate: true }).allowDuplicate).toBe(true)
  })

  it("maps the form's opening stock onto a new batch of the existing medicine", () => {
    expect(toDotnetAddMedicineStockCommand(form)).toEqual({
      quantity: 50,
      batchNumber: "pcm2411",
      expiryDate: "2028-01-31",
      rackLocation: null,
      costPrice: 1.2,
      sellingPrice: 2,
      supplierId: "s1",
      supplierInvoiceNumber: "INV-9",
      vatAmount: 7.8,
      payment: { method: "cash", amount: null, reference: null, paymentDateUtc: null },
      stockFunding: null,
    })
  })
})
