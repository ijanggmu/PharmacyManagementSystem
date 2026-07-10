import { describe, it, expect } from "vitest"
import { createMockSupabase, type RecordedCall } from "@/test/supabase-mock"
import { postDirectInventorySupplierReceipts } from "@/lib/server/services/inventory-supplier-receipt-service"

const TENANT_ID = "tenant-1"
const USER_ID = "user-1"
const BRANCH_ID = "branch-1"

function hasCall(calls: RecordedCall[], method: string) {
  return calls.some((c) => c.method === method)
}

function baseHandlers(overrides: Record<string, (c: RecordedCall[]) => any> = {}) {
  return {
    users: () => ({ data: { current_branch_id: BRANCH_ID }, error: null }),
    // Pre-existing payable account short-circuits ensureSupplierPayableAccount
    // before it needs to touch accounting_accounts.
    suppliers: () => ({ data: { id: "sup-1", accounting_payable_account_id: "acct-1" }, error: null }),
    medicines: () => ({ data: { id: "med-1", tenant_id: TENANT_ID }, error: null }),
    goods_receipts: (c: RecordedCall[]) =>
      hasCall(c, "insert")
        ? { data: { id: "grn-1" }, error: null }
        : { data: {}, error: null }, // .update({status: "received"})
    goods_receipt_items: () => ({ data: {}, error: null }),
    supplier_ledger_entries: (c: RecordedCall[]) =>
      hasCall(c, "insert") ? { data: {}, error: null } : { data: [], error: null },
    ...overrides,
  }
}

describe("postDirectInventorySupplierReceipts", () => {
  it("posts the goods receipt against the logged-in user's branch, not just the tenant's primary branch", async () => {
    const calls: Record<string, RecordedCall[][]> = {}
    const supabase = createMockSupabase(baseHandlers(), calls)

    const { receipts } = await postDirectInventorySupplierReceipts(supabase, TENANT_ID, USER_ID, {
      receiptDate: "2026-01-01",
      batches: [
        {
          supplierId: "sup-1",
          lines: [{ medicineId: "med-1", quantity: 10, unitCost: 5 }],
        },
      ],
    })

    expect(receipts).toHaveLength(1)

    const grnInsertArgs = calls.goods_receipts[0].find((c) => c.method === "insert")?.args[0] as any
    expect(grnInsertArgs.branch_id).toBe(BRANCH_ID)

    const itemInsertArgs = calls.goods_receipt_items[0].find((c) => c.method === "insert")?.args[0] as any
    expect(itemInsertArgs.branch_id).toBe(BRANCH_ID)
  })

  it("falls back to the tenant's primary branch when the user has no current branch", async () => {
    const calls: Record<string, RecordedCall[][]> = {}
    const supabase = createMockSupabase(
      baseHandlers({
        users: () => ({ data: { current_branch_id: null }, error: null }),
        branches: () => ({ data: { id: "primary-branch" }, error: null }),
      }),
      calls
    )

    await postDirectInventorySupplierReceipts(supabase, TENANT_ID, USER_ID, {
      receiptDate: "2026-01-01",
      batches: [{ supplierId: "sup-1", lines: [{ medicineId: "med-1", quantity: 10, unitCost: 5 }] }],
    })

    const grnInsertArgs = calls.goods_receipts[0].find((c) => c.method === "insert")?.args[0] as any
    expect(grnInsertArgs.branch_id).toBe("primary-branch")
  })

  it("skips batches with no positive-quantity lines", async () => {
    const calls: Record<string, RecordedCall[][]> = {}
    const supabase = createMockSupabase(baseHandlers(), calls)

    const { receipts } = await postDirectInventorySupplierReceipts(supabase, TENANT_ID, USER_ID, {
      receiptDate: "2026-01-01",
      batches: [{ supplierId: "sup-1", lines: [{ medicineId: "med-1", quantity: 0, unitCost: 5 }] }],
    })

    expect(receipts).toHaveLength(0)
    expect(calls.goods_receipts).toBeUndefined()
  })

  it("throws when the supplier doesn't belong to the tenant", async () => {
    const supabase = createMockSupabase(
      baseHandlers({ suppliers: () => ({ data: null, error: { message: "not found" } }) })
    )

    await expect(
      postDirectInventorySupplierReceipts(supabase, TENANT_ID, USER_ID, {
        receiptDate: "2026-01-01",
        batches: [{ supplierId: "ghost-sup", lines: [{ medicineId: "med-1", quantity: 1, unitCost: 5 }] }],
      })
    ).rejects.toThrow(/supplier not found/i)
  })

  it("throws on an invalid unit cost", async () => {
    const supabase = createMockSupabase(baseHandlers())

    await expect(
      postDirectInventorySupplierReceipts(supabase, TENANT_ID, USER_ID, {
        receiptDate: "2026-01-01",
        batches: [{ supplierId: "sup-1", lines: [{ medicineId: "med-1", quantity: 1, unitCost: -5 }] }],
      })
    ).rejects.toThrow(/invalid unit cost/i)
  })
})
