import { describe, expect, it } from "vitest"
import { homeDataFromDotnet, jobRoleSet, primaryRoleName } from "./dashboard-dotnet"

const base = {
  medicineTotal: { totalCount: 29 },
  customerTotal: { totalCount: 12 },
  monthSales: { saleCount: 0, totalRevenue: 0, totalDiscount: 0, averageSaleAmount: 0 },
  todaySales: { saleCount: 0, totalRevenue: 0, totalDiscount: 0, averageSaleAmount: 0 },
  recentSales: [],
}

describe("homeDataFromDotnet", () => {
  it("counts the report rows when the role can read the reports", () => {
    const data = homeDataFromDotnet({
      ...base,
      prescriptionStats: { total: 3, pending: 2, partiallyFilled: 0, filled: 1, cancelled: 0 },
      reorder: [{ medicineId: "m1", medicineName: "Paracetamol", reorderLevel: 10, totalQuantityOnHand: 2, suggestedOrderQuantity: 8 }],
      expiringBatches: [],
      context: { lowStockCount: 9, expiringCount: 9, pendingPrescriptionsCount: 9 },
    })

    expect(data.counts).toMatchObject({ pendingPrescriptions: 2, lowStock: 1, expiring: 0 })
    expect(data.lowStock).toHaveLength(1)
  })

  it("falls back to the shell-context counts when a report is forbidden (a cashier)", () => {
    const data = homeDataFromDotnet({
      ...base,
      prescriptionStats: null,
      reorder: null,
      expiringBatches: null,
      context: { lowStockCount: 3, expiringCount: 4, pendingPrescriptionsCount: 5 },
    })

    expect(data.counts).toMatchObject({ pendingPrescriptions: 5, lowStock: 3, expiring: 4 })
    expect(data.lowStock).toEqual([])
    expect(data.expiring).toEqual([])
  })

  it("shows zero when neither the report nor the context could be read", () => {
    const data = homeDataFromDotnet({ ...base, prescriptionStats: null, reorder: null, expiringBatches: null, context: null })

    expect(data.counts).toMatchObject({ pendingPrescriptions: 0, lowStock: 0, expiring: 0 })
  })
})

describe("user roles", () => {
  const role = (roleName: string, enabled: boolean) => ({ roleId: roleName, roleName, enabled })

  it("shows the job role, not the Basic role every user also holds", () => {
    expect(primaryRoleName([role("Basic", true), role("Cashier", true), role("Manager", false)])).toBe("Cashier")
    expect(primaryRoleName([role("Basic", true), role("Cashier", false)])).toBe("Basic")
    expect(primaryRoleName([role("Basic", false)])).toBe("")
  })

  it("saves a job role together with Basic", () => {
    expect(jobRoleSet("Pharmacist")).toEqual(["Pharmacist", "Basic"])
    expect(jobRoleSet("basic")).toEqual(["Basic"])
  })
})
