import { describe, expect, it } from "vitest"
import { normaliseReferenceType, referenceTypeLabel, resolveReference } from "./reference-routes"

describe("normaliseReferenceType", () => {
  it("folds case and separators", () => {
    expect(normaliseReferenceType("PurchaseOrder")).toBe("purchaseorder")
    expect(normaliseReferenceType("purchase_order")).toBe("purchaseorder")
    expect(normaliseReferenceType("purchase-order")).toBe("purchaseorder")
    expect(normaliseReferenceType(null)).toBe("")
  })
})

describe("resolveReference", () => {
  it.each([
    ["Sale", "/dashboard/sales"],
    ["Return", "/dashboard/returns"],
    ["Refund", "/dashboard/refunds"],
    ["PurchaseOrder", "/dashboard/purchases"],
    ["DirectGoodsReceipt", "/dashboard/purchases"],
    ["MedicineStockReceipt", "/dashboard/purchases"],
    ["CustomerPayment", "/dashboard/customers"],
    ["SupplierPayment", "/dashboard/suppliers"],
    ["ConsignmentSettlement", "/dashboard/inventory/consignment"],
    ["Expense", "/dashboard/expenses"],
    ["BankDeposit", "/dashboard/reports/accounting/cash"],
    ["Onboarding", "/dashboard/settings/opening-balances"],
    ["MigrationOpeningStock", "/dashboard/settings/opening-balances"],
    ["MigrationOpeningCash", "/dashboard/settings/opening-balances"],
    ["OpeningBalance", "/dashboard/settings/opening-balances"],
  ])("%s -> %s", (type, href) => {
    const target = resolveReference(type, "abc")
    expect(target.kind).toBe("page")
    if (target.kind === "page") expect(target.href).toBe(href)
  })

  it("links a reversal to the original voucher", () => {
    expect(resolveReference("reversal", "v-1")).toEqual({
      kind: "voucher",
      label: "Reversal of voucher",
      voucherId: "v-1",
    })
  })

  it("treats a missing reference as a manual entry", () => {
    expect(resolveReference(null, null)).toEqual({ kind: "none", label: "Manual entry" })
  })

  it("falls back to a readable label for unknown types", () => {
    expect(resolveReference("StockTransfer", "x")).toEqual({ kind: "none", label: "Stock transfer" })
  })
})

describe("referenceTypeLabel", () => {
  it("labels known and unknown types", () => {
    expect(referenceTypeLabel("PurchaseOrder")).toBe("Purchase order")
    expect(referenceTypeLabel("CustomerPayment")).toBe("Customer receipt")
    expect(referenceTypeLabel("some_new_thing")).toBe("Some new thing")
    expect(referenceTypeLabel("")).toBe("—")
  })
})
