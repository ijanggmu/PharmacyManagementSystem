import { describe, expect, it } from "vitest"

import { canViewBilling, canViewPurchases, canViewSmsLog, DOTNET_ROOT_PERMISSIONS } from "@/lib/api/dotnet-permissions"

describe("canViewBilling", () => {
  it("is true for holders of Billing.View and for root users", () => {
    expect(canViewBilling(["Permissions.Billing.View"])).toBe(true)
    expect(canViewBilling([...DOTNET_ROOT_PERMISSIONS])).toBe(true)
  })

  it("is false for till users, so the header doesn't show the plan", () => {
    expect(canViewBilling(["Permissions.Sales.Sales.Create", "Permissions.Reference.Settings.View"])).toBe(false)
    expect(canViewBilling([])).toBe(false)
  })
})

describe("canViewSmsLog", () => {
  it("follows the API gate (Customers.Ledger.RecordPayment), not the basic settings view", () => {
    expect(canViewSmsLog(["Permissions.Customers.Ledger.RecordPayment"])).toBe(true)
    expect(canViewSmsLog(["Permissions.Reference.Settings.View", "Permissions.Customers.Ledger.View"])).toBe(false)
  })
})

describe("canViewPurchases", () => {
  it("follows the API gate (purchase orders or goods received view), so the accountant sees Purchases", () => {
    expect(canViewPurchases(["Permissions.Purchasing.PurchaseOrders.View"])).toBe(true)
    expect(canViewPurchases(["Permissions.Purchasing.DirectGoodsReceipts.View"])).toBe(true)
    expect(canViewPurchases([...DOTNET_ROOT_PERMISSIONS])).toBe(true)
  })

  it("is false for the counter, which cannot open purchases", () => {
    expect(canViewPurchases(["Permissions.Sales.Sales.Create", "Permissions.Inventory.Medicines.View"])).toBe(false)
    expect(canViewPurchases([])).toBe(false)
  })
})
