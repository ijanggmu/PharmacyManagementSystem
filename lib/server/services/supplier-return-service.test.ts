import { describe, it, expect } from "vitest"
import { createMockSupabase, type RecordedCall } from "@/test/supabase-mock"
import { createSupplierReturnForTenant } from "@/lib/server/services/supplier-return-service"

const TENANT_ID = "tenant-1"
const USER_ID = "user-1"
const BRANCH_ID = "branch-1"

function hasCall(calls: RecordedCall[], method: string) {
  return calls.some((c) => c.method === method)
}

function baseHandlers(overrides: Record<string, (c: RecordedCall[]) => any> = {}) {
  return {
    users: () => ({ data: { current_branch_id: BRANCH_ID }, error: null }),
    medicines: () => ({ data: { id: "med-1" }, error: null }),
    medicine_branch_stock: (c: RecordedCall[]) =>
      hasCall(c, "upsert") ? { data: {}, error: null } : { data: { stock_quantity: 10 }, error: null },
    supplier_returns: (c: RecordedCall[]) =>
      hasCall(c, "insert")
        ? { data: { id: "return-1", return_number: "SR-1" }, error: null }
        : { data: {}, error: null },
    supplier_return_items: () => ({ data: {}, error: null }),
    inventory_transactions: () => ({ data: {}, error: null }),
    supplier_ledger_entries: (c: RecordedCall[]) =>
      hasCall(c, "insert") ? { data: {}, error: null } : { data: [], error: null },
    ...overrides,
  }
}

describe("createSupplierReturnForTenant", () => {
  it("stamps branch_id on the compensating inventory transaction (regression)", async () => {
    const calls: Record<string, RecordedCall[][]> = {}
    const supabase = createMockSupabase(baseHandlers(), calls)

    const { data, error } = await createSupplierReturnForTenant(supabase, TENANT_ID, USER_ID, {
      supplier_id: "sup-1",
      items: [{ medicine_id: "med-1", quantity: 3, unit_cost: 2, return_reason: "damaged" }],
    })

    expect(error).toBeNull()
    expect(data).toMatchObject({ id: "return-1" })

    const invLog = calls.inventory_transactions[calls.inventory_transactions.length - 1]
    const insertArgs = invLog.find((c) => c.method === "insert")?.args[0] as any
    expect(insertArgs.branch_id).toBe(BRANCH_ID)
    expect(insertArgs.quantity).toBe(-3)
  })

  it("reduces the per-supplier AP subledger balance by the return cost (regression: previously untouched)", async () => {
    const calls: Record<string, RecordedCall[][]> = {}
    const supabase = createMockSupabase(
      baseHandlers({
        supplier_ledger_entries: (c) =>
          hasCall(c, "insert")
            ? { data: {}, error: null }
            : { data: [{ balance_after: 500 }], error: null }, // existing balance owed
      }),
      calls
    )

    const { error } = await createSupplierReturnForTenant(supabase, TENANT_ID, USER_ID, {
      supplier_id: "sup-1",
      items: [{ medicine_id: "med-1", quantity: 3, unit_cost: 2, return_reason: "damaged" }], // cost = 6
    })

    expect(error).toBeNull()
    const ledgerLog = calls.supplier_ledger_entries.find((log) => hasCall(log, "insert"))
    const insertArgs = ledgerLog?.find((c) => c.method === "insert")?.args[0] as any
    expect(insertArgs.entry_type).toBe("credit_note")
    expect(insertArgs.amount).toBe(6)
    expect(insertArgs.balance_after).toBe(494) // 500 - 6
  })

  it("rejects when requested quantity exceeds available branch stock", async () => {
    const calls: Record<string, RecordedCall[][]> = {}
    const supabase = createMockSupabase(
      baseHandlers({
        medicine_branch_stock: () => ({ data: { stock_quantity: 1 }, error: null }),
      }),
      calls
    )

    const { data, error } = await createSupplierReturnForTenant(supabase, TENANT_ID, USER_ID, {
      supplier_id: "sup-1",
      items: [{ medicine_id: "med-1", quantity: 5, unit_cost: 2, return_reason: "damaged" }],
    })

    expect(data).toBeNull()
    expect(error?.message).toContain("Insufficient stock")
    // Should fail before ever creating the return header.
    expect(calls.supplier_returns).toBeUndefined()
  })

  it("rejects when a referenced medicine doesn't belong to the tenant", async () => {
    const supabase = createMockSupabase(
      baseHandlers({
        medicines: () => ({ data: null, error: { message: "not found" } }),
      })
    )

    const { data, error } = await createSupplierReturnForTenant(supabase, TENANT_ID, USER_ID, {
      supplier_id: "sup-1",
      items: [{ medicine_id: "ghost-med", quantity: 1, unit_cost: 2, return_reason: "damaged" }],
    })

    expect(data).toBeNull()
    expect(error?.message).toContain("Medicine not found")
  })

  it("rolls back the return header when the items insert fails", async () => {
    const calls: Record<string, RecordedCall[][]> = {}
    const supabase = createMockSupabase(
      baseHandlers({
        supplier_return_items: () => ({ data: null, error: { message: "insert failed" } }),
      }),
      calls
    )

    const { data, error } = await createSupplierReturnForTenant(supabase, TENANT_ID, USER_ID, {
      supplier_id: "sup-1",
      items: [{ medicine_id: "med-1", quantity: 1, unit_cost: 2, return_reason: "damaged" }],
    })

    expect(data).toBeNull()
    expect(error?.message).toBe("insert failed")
    expect(hasCall(calls.supplier_returns[calls.supplier_returns.length - 1], "delete")).toBe(true)
  })
})
