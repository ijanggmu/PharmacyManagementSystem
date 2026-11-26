import { describe, expect, it } from "vitest"

import {
  canViewBilling,
  canViewExpenses,
  canViewPurchases,
  canViewSmsLog,
  dotnetPermissionAllowed,
  DOTNET_ROOT_PERMISSIONS,
  EXPENSE_PERMISSIONS,
  expenseAccess,
} from "@/lib/api/dotnet-permissions"

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

describe("expenseAccess", () => {
  it("maps each action to its own Accounting.Expenses permission", () => {
    expect(expenseAccess([EXPENSE_PERMISSIONS.view])).toEqual({ canView: true, canRecord: false, canUpdate: false, canDelete: false })
    expect(expenseAccess([EXPENSE_PERMISSIONS.view, EXPENSE_PERMISSIONS.record])).toMatchObject({ canRecord: true, canUpdate: false })
    expect(expenseAccess([EXPENSE_PERMISSIONS.update, EXPENSE_PERMISSIONS.delete])).toMatchObject({ canView: false, canUpdate: true, canDelete: true })
  })

  it("does not treat accounting voucher/report access as expense access", () => {
    const accountant = ["Permissions.Accounting.Vouchers.View", "Permissions.Accounting.Reports.View"]
    expect(canViewExpenses(accountant)).toBe(false)
    expect(canViewExpenses([...accountant, EXPENSE_PERMISSIONS.view])).toBe(true)
  })

  it("allows a root user everything", () => {
    expect(expenseAccess([...DOTNET_ROOT_PERMISSIONS])).toEqual({ canView: true, canRecord: true, canUpdate: true, canDelete: true })
  })
})

describe("expiry permissions", () => {
  it("map expiry claims to Suppliers.Returns, the gate on every claim endpoint (not Suppliers.View)", () => {
    expect(dotnetPermissionAllowed("expiry_claims:read", ["Permissions.Suppliers.Returns.View"])).toBe(true)
    expect(dotnetPermissionAllowed("expiry_claims:read", ["Permissions.Suppliers.Suppliers.View"])).toBe(false)
    expect(dotnetPermissionAllowed("expiry_claims:write", ["Permissions.Suppliers.Returns.Create"])).toBe(true)
    expect(dotnetPermissionAllowed("expiry_claims:write", ["Permissions.Suppliers.Returns.View"])).toBe(false)
  })

  it("map write-off to Batches.Dispose and recall to Medicines.Update, not the report view", () => {
    expect(dotnetPermissionAllowed("batches:dispose", ["Permissions.Inventory.Batches.Dispose"])).toBe(true)
    expect(dotnetPermissionAllowed("batches:dispose", ["Permissions.Inventory.Reports.View"])).toBe(false)
    expect(dotnetPermissionAllowed("batches:recall", ["Permissions.Inventory.Medicines.Update"])).toBe(true)
    expect(dotnetPermissionAllowed("batches:recall", ["Permissions.Inventory.Reports.View"])).toBe(false)
    expect(dotnetPermissionAllowed("batches:recall", [...DOTNET_ROOT_PERMISSIONS])).toBe(true)
  })
})
