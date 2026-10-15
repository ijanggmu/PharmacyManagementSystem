import { describe, expect, it } from "vitest"
import { toDotnetUpdateMedicineCommand, type DotnetMedicineDto } from "@/lib/api/catalog-api"
import { hasLockedBox, hasStockHistory, withoutLockedFields } from "./medicine-edit-locks"

describe("hasStockHistory", () => {
  it("trusts the detail read when it answered", () => {
    expect(hasStockHistory({ has_stock_history: false, batch_count: 3, stock_quantity: 10 })).toBe(false)
    expect(hasStockHistory({ has_stock_history: true, batch_count: 0, stock_quantity: 0 })).toBe(true)
  })

  it("falls back to lots or on-hand stock for a list row", () => {
    expect(hasStockHistory({ batch_count: 1, stock_quantity: 0 })).toBe(true)
    expect(hasStockHistory({ batch_count: 0, stock_quantity: 4 })).toBe(true)
    expect(hasStockHistory({ batch_count: 0, stock_quantity: 0 })).toBe(false)
  })
})

describe("withoutLockedFields", () => {
  const payload = {
    name: "Cetirizine",
    is_taxable: false,
    strength: "20mg",
    form: "syrup",
    units_per_pack: 15,
    unit_label: "tablet",
    supplier_invoice_number: "INV-2",
    vat_amount: 5,
  }

  it("drops the locked details when locked", () => {
    // The VAT flag is not locked: a correction applies from now on.
    expect(withoutLockedFields(payload, true)).toEqual({ name: "Cetirizine", is_taxable: false })
  })

  it("keeps everything when not locked", () => {
    expect(withoutLockedFields(payload, false)).toBe(payload)
  })

  it("drops an existing box only when the box is locked", () => {
    const withBox = { ...payload, packs_per_box: 12, box_label: "Carton" }
    // Stock on record but no box yet: a box may still be added.
    expect(withoutLockedFields(withBox, true, false)).toEqual({ name: "Cetirizine", is_taxable: false, packs_per_box: 12, box_label: "Carton" })
    expect(withoutLockedFields(withBox, true, true)).toEqual({ name: "Cetirizine", is_taxable: false })
    expect(hasLockedBox({ packs_per_box: 10 }, true)).toBe(true)
    expect(hasLockedBox({ packs_per_box: null }, true)).toBe(false)
    expect(hasLockedBox({ packs_per_box: 10 }, false)).toBe(false)
  })

  it("sends the stored values for dropped details, so the server sees no change", () => {
    const current = {
      id: "m1",
      name: "Cetirizine",
      genericName: null,
      categoryId: null,
      reorderLevel: 5,
      isControlled: false,
      totalQuantityOnHand: 20,
      createdAtUtc: "2026-01-01T00:00:00Z",
      updatedAtUtc: null,
      unitPrice: 2,
      costPrice: 1,
      form: "tablet",
      strength: "10mg",
      supplierId: null,
      barcode: null,
      description: null,
      maximumStock: null,
      prescriptionRequired: false,
      brandName: null,
      dosage: null,
      sideEffects: null,
      storageInstructions: null,
      storageTempMinC: null,
      storageTempMaxC: null,
      requiresColdChain: false,
      unitsPerPack: 10,
      unitLabel: "strip",
      isTaxable: true,
      supplierInvoiceNumber: "INV-1",
      vatAmount: 13,
    } satisfies DotnetMedicineDto

    const command = toDotnetUpdateMedicineCommand(current, withoutLockedFields(payload, true))

    expect(command).toMatchObject({
      isTaxable: false,
      form: "tablet",
      strength: "10mg",
      unitsPerPack: 10,
      unitLabel: "strip",
      supplierInvoiceNumber: "INV-1",
      vatAmount: 13,
      clearOptionalDetails: false,
    })
  })
})
