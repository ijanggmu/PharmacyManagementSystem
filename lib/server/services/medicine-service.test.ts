import { describe, it, expect } from "vitest"
import { createMockSupabase, lastCallArgs, type RecordedCall } from "@/test/supabase-mock"
import {
  parseListMedicinesInput,
  createMedicineWithInventory,
  updateMedicineWithInventory,
} from "@/lib/server/services/medicine-service"

const TENANT_ID = "tenant-1"
const USER_ID = "user-1"
const BRANCH_ID = "branch-1"

function hasCall(calls: RecordedCall[], method: string) {
  return calls.some((c) => c.method === method)
}

describe("parseListMedicinesInput", () => {
  it("applies defaults when the query string is empty", () => {
    const input = parseListMedicinesInput(new URLSearchParams())
    expect(input.page).toBe(1)
    expect(input.limit).toBe(50)
    expect(input.sortBy).toBe("name")
    expect(input.sortOrder).toBe("asc")
    expect(input.categoryIds).toEqual([])
  })

  it("parses comma-separated filter lists", () => {
    const input = parseListMedicinesInput(
      new URLSearchParams("categoryIds=a,b&stockStatuses=low,out&expiryStatuses=expired&page=2&limit=25")
    )
    expect(input.categoryIds).toEqual(["a", "b"])
    expect(input.stockStatuses).toEqual(["low", "out"])
    expect(input.expiryStatuses).toEqual(["expired"])
    expect(input.page).toBe(2)
    expect(input.limit).toBe(25)
  })
})

describe("createMedicineWithInventory", () => {
  it("stamps branch_id from the logged-in user's current branch on both the branch stock row and the inventory transaction", async () => {
    const calls: Record<string, RecordedCall[][]> = {}
    const supabase = createMockSupabase(
      {
        medicines: (c) => {
          if (hasCall(c, "insert")) {
            return { data: { id: "med-1", cost_price: "0.90", supplier_id: null }, error: null }
          }
          return { data: null, error: null }
        },
        users: () => ({ data: { current_branch_id: BRANCH_ID }, error: null }),
        medicine_branch_stock: () => ({ data: {}, error: null }),
        inventory_transactions: () => ({ data: {}, error: null }),
      },
      calls
    )

    const { data, error } = await createMedicineWithInventory(supabase, TENANT_ID, USER_ID, {
      name: "Napa",
      strength: "500mg",
      form: "tablet",
      unit_price: 1.5,
      cost_price: 0.9,
      stock_quantity: 10,
      minimum_stock: 5,
    })

    expect(error).toBeNull()
    expect(data).toMatchObject({ id: "med-1" })

    // Regression: both inserts must carry the resolved branch_id, or Postgres'
    // NOT NULL branch_id constraint rejects the write (the bug that shipped twice).
    const branchStockArgs = lastCallArgs(calls.medicine_branch_stock, "insert")
    expect((branchStockArgs?.[0] as any).branch_id).toBe(BRANCH_ID)

    const invArgs = lastCallArgs(calls.inventory_transactions, "insert")
    expect((invArgs?.[0] as any).branch_id).toBe(BRANCH_ID)
  })

  it("falls back to the tenant's primary branch when the user has no current_branch_id", async () => {
    const calls: Record<string, RecordedCall[][]> = {}
    const supabase = createMockSupabase(
      {
        medicines: (c) =>
          hasCall(c, "insert")
            ? { data: { id: "med-1", cost_price: "0.90", supplier_id: null }, error: null }
            : { data: null, error: null },
        users: () => ({ data: { current_branch_id: null }, error: null }),
        branches: () => ({ data: { id: "primary-branch" }, error: null }),
        medicine_branch_stock: () => ({ data: {}, error: null }),
        inventory_transactions: () => ({ data: {}, error: null }),
      },
      calls
    )

    await createMedicineWithInventory(supabase, TENANT_ID, USER_ID, {
      name: "Napa",
      strength: "500mg",
      form: "tablet",
      unit_price: 1.5,
      cost_price: 0.9,
      stock_quantity: 10,
      minimum_stock: 5,
    })

    const branchStockArgs = lastCallArgs(calls.medicine_branch_stock, "insert")
    expect((branchStockArgs?.[0] as any).branch_id).toBe("primary-branch")
  })

  it("skips branch/stock inserts entirely when initial stock is zero", async () => {
    const calls: Record<string, RecordedCall[][]> = {}
    const supabase = createMockSupabase(
      {
        medicines: (c) =>
          hasCall(c, "insert")
            ? { data: { id: "med-1", cost_price: "0.90", supplier_id: null }, error: null }
            : { data: null, error: null },
      },
      calls
    )

    const { error } = await createMedicineWithInventory(supabase, TENANT_ID, USER_ID, {
      name: "Napa",
      strength: "500mg",
      form: "tablet",
      unit_price: 1.5,
      cost_price: 0.9,
      stock_quantity: 0,
      minimum_stock: 5,
    })

    expect(error).toBeNull()
    expect(calls.medicine_branch_stock).toBeUndefined()
    expect(calls.inventory_transactions).toBeUndefined()
  })

  it("rolls back the medicine row when the branch stock insert fails", async () => {
    const calls: Record<string, RecordedCall[][]> = {}
    const supabase = createMockSupabase(
      {
        medicines: (c) =>
          hasCall(c, "insert")
            ? { data: { id: "med-1", cost_price: "0.90", supplier_id: null }, error: null }
            : { data: null, error: null },
        users: () => ({ data: { current_branch_id: BRANCH_ID }, error: null }),
        medicine_branch_stock: () => ({ data: null, error: { message: "constraint violation" } }),
      },
      calls
    )

    const { data, error } = await createMedicineWithInventory(supabase, TENANT_ID, USER_ID, {
      name: "Napa",
      strength: "500mg",
      form: "tablet",
      unit_price: 1.5,
      cost_price: 0.9,
      stock_quantity: 10,
      minimum_stock: 5,
    })

    expect(data).toBeNull()
    expect(error?.message).toContain("Initial stock could not be recorded")
    // Compensating delete of the medicine row created above.
    expect(hasCall(calls.medicines[calls.medicines.length - 1], "delete")).toBe(true)
  })
})

describe("updateMedicineWithInventory", () => {
  it("stamps branch_id on the inventory transaction when stock increases", async () => {
    const calls: Record<string, RecordedCall[][]> = {}
    const supabase = createMockSupabase(
      {
        medicines: (c) => {
          if (hasCall(c, "update")) {
            return { data: { id: "med-1", supplier_id: null, cost_price: "0.90" }, error: null }
          }
          // Initial "previous" select
          return { data: { stock_quantity: 5 }, error: null }
        },
        users: () => ({ data: { current_branch_id: BRANCH_ID }, error: null }),
        medicine_branch_stock: (c) => {
          if (hasCall(c, "upsert")) return { data: {}, error: null }
          return { data: { stock_quantity: 5 }, error: null } // existing branch stock
        },
        inventory_transactions: () => ({ data: {}, error: null }),
      },
      calls
    )

    const { data, error } = await updateMedicineWithInventory(supabase, TENANT_ID, USER_ID, "med-1", {
      stock_quantity: 15, // +10 delta
    })

    expect(error).toBeNull()
    expect(data).toMatchObject({ id: "med-1" })

    // Regression: this insert previously omitted branch_id entirely because
    // `branchId` was scoped inside the `if (stockDelta !== 0)` block above it.
    const invArgs = lastCallArgs(calls.inventory_transactions, "insert")
    expect((invArgs?.[0] as any).branch_id).toBe(BRANCH_ID)
  })

  it("rejects an update that would leave branch stock negative", async () => {
    const calls: Record<string, RecordedCall[][]> = {}
    const supabase = createMockSupabase(
      {
        medicines: (c) =>
          hasCall(c, "update")
            ? { data: { id: "med-1", supplier_id: null, cost_price: "0.90" }, error: null }
            : { data: { stock_quantity: 5 }, error: null },
        users: () => ({ data: { current_branch_id: BRANCH_ID }, error: null }),
        medicine_branch_stock: (c) =>
          hasCall(c, "upsert") ? { data: {}, error: null } : { data: { stock_quantity: 2 }, error: null },
      },
      calls
    )

    const { data, error } = await updateMedicineWithInventory(supabase, TENANT_ID, USER_ID, "med-1", {
      stock_quantity: 0, // previous.stock_quantity(5) -> delta -5, but branch only has 2
    })

    expect(data).toBeNull()
    expect(error?.message).toContain("negative stock")
  })

  it("does not touch stock tables when stock_quantity is unchanged", async () => {
    const calls: Record<string, RecordedCall[][]> = {}
    const supabase = createMockSupabase(
      {
        medicines: (c) =>
          hasCall(c, "update")
            ? { data: { id: "med-1", supplier_id: null, cost_price: "0.90" }, error: null }
            : { data: { stock_quantity: 5 }, error: null },
      },
      calls
    )

    const { error } = await updateMedicineWithInventory(supabase, TENANT_ID, USER_ID, "med-1", {
      name: "Renamed",
    })

    expect(error).toBeNull()
    expect(calls.medicine_branch_stock).toBeUndefined()
    expect(calls.inventory_transactions).toBeUndefined()
  })
})
