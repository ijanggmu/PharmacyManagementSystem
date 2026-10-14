import { describe, expect, it } from "vitest"
import { DOTNET_ROOT_PERMISSIONS } from "@/lib/api/dotnet-permissions"
import {
  CUSTOMER_CREDIT_MANAGE_PERMISSION,
  CUSTOMER_LOYALTY_ADJUST_PERMISSION,
  canAdjustCustomerLoyalty,
  canManageCustomerCredit,
  canViewCustomerMoney,
  CUSTOMER_LEDGER_VIEW_PERMISSION,
} from "./customer-permissions"

describe("canViewCustomerMoney", () => {
  it("needs the ledger view permission, not just Customers.View", () => {
    expect(canViewCustomerMoney(["Permissions.Customers.Customers.View"])).toBe(false)
    expect(canViewCustomerMoney([CUSTOMER_LEDGER_VIEW_PERMISSION])).toBe(true)
    expect(canViewCustomerMoney(DOTNET_ROOT_PERMISSIONS)).toBe(true)
  })
})

describe("customer permissions", () => {
  it("needs the dedicated permission, not just Customers.Update", () => {
    const cashier = ["Permissions.Customers.Customers.Update", "Permissions.Customers.Ledger.View"]
    expect(canManageCustomerCredit(cashier)).toBe(false)
    expect(canAdjustCustomerLoyalty(cashier)).toBe(false)
  })

  it("allows holders of each permission independently", () => {
    expect(canManageCustomerCredit([CUSTOMER_CREDIT_MANAGE_PERMISSION])).toBe(true)
    expect(canAdjustCustomerLoyalty([CUSTOMER_CREDIT_MANAGE_PERMISSION])).toBe(false)
    expect(canAdjustCustomerLoyalty([CUSTOMER_LOYALTY_ADJUST_PERMISSION])).toBe(true)
  })

  it("always allows root users", () => {
    expect(canManageCustomerCredit(DOTNET_ROOT_PERMISSIONS)).toBe(true)
    expect(canAdjustCustomerLoyalty(DOTNET_ROOT_PERMISSIONS)).toBe(true)
  })
})
