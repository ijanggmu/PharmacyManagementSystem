import { describe, it, expect } from "vitest"
import { createMockSupabase, lastCallArgs, type RecordedCall } from "@/test/supabase-mock"
import {
  getPrimaryBranchId,
  getUserBranchContext,
  switchUserBranch,
  createBranch,
  updateBranch,
  deleteBranch,
} from "@/lib/server/services/tenant-branch"

describe("getPrimaryBranchId", () => {
  it("returns the oldest branch for the tenant", async () => {
    const supabase = createMockSupabase({
      branches: () => ({ data: { id: "branch-1" }, error: null }),
    })
    expect(await getPrimaryBranchId(supabase, "tenant-1")).toBe("branch-1")
  })

  it("throws when the tenant has no branches at all", async () => {
    const supabase = createMockSupabase({
      branches: () => ({ data: null, error: null }),
    })
    await expect(getPrimaryBranchId(supabase, "tenant-1")).rejects.toThrow(/no branch found/i)
  })
})

describe("getUserBranchContext", () => {
  it("returns tenant + current branch for a user", async () => {
    const supabase = createMockSupabase({
      users: () => ({ data: { tenant_id: "tenant-1", current_branch_id: "branch-1" }, error: null }),
    })
    const { data, error } = await getUserBranchContext(supabase, "user-1")
    expect(error).toBeNull()
    expect(data).toEqual({ tenant_id: "tenant-1", current_branch_id: "branch-1" })
  })
})

describe("switchUserBranch", () => {
  it("updates current_branch_id for the given user", async () => {
    const calls: Record<string, RecordedCall[][]> = {}
    const supabase = createMockSupabase({ users: () => ({ data: {}, error: null }) }, calls)

    const { error } = await switchUserBranch(supabase, "user-1", "branch-2")
    expect(error).toBeNull()
    expect(lastCallArgs(calls.users, "update")?.[0]).toEqual({ current_branch_id: "branch-2" })
    expect(lastCallArgs(calls.users, "eq")).toEqual(["id", "user-1"])
  })
})

describe("createBranch", () => {
  it("slugifies the code and defaults is_active to true", async () => {
    const calls: Record<string, RecordedCall[][]> = {}
    const supabase = createMockSupabase({ branches: () => ({ data: { id: "branch-2" }, error: null }) }, calls)

    await createBranch(supabase, "tenant-1", { name: "Pokhara Branch", code: "Pokhara Branch 2" })

    const insertArgs = lastCallArgs(calls.branches, "insert")?.[0] as any
    expect(insertArgs.code).toBe("pokhara-branch-2")
    expect(insertArgs.is_active).toBe(true)
    expect(insertArgs.tenant_id).toBe("tenant-1")
  })

  it("surfaces a duplicate-code error with its Postgres code intact", async () => {
    const supabase = createMockSupabase({
      branches: () => ({ data: null, error: { message: "duplicate key value", code: "23505" } }),
    })
    const { data, error } = await createBranch(supabase, "tenant-1", { name: "X", code: "x" })
    expect(data).toBeNull()
    expect(error?.code).toBe("23505")
  })
})

describe("updateBranch", () => {
  it("short-circuits (no DB write) when given an empty patch", async () => {
    const calls: Record<string, RecordedCall[][]> = {}
    const supabase = createMockSupabase({}, calls)

    const { data, error } = await updateBranch(supabase, "tenant-1", "branch-1", {})
    expect(error).toBeNull()
    expect(data).toBeNull()
    expect(calls.branches).toBeUndefined()
  })

  it("normalizes blank optional fields to null and always bumps updated_at", async () => {
    const calls: Record<string, RecordedCall[][]> = {}
    const supabase = createMockSupabase(
      { branches: () => ({ data: { id: "branch-1" }, error: null }) },
      calls
    )

    const { updates } = await updateBranch(supabase, "tenant-1", "branch-1", { name: "New Name", phone: "" })
    expect(updates.name).toBe("New Name")
    expect(updates.phone).toBeNull()
    expect(updates.updated_at).toBeDefined()
  })
})

describe("deleteBranch", () => {
  it("scopes the delete to both branch id and tenant id", async () => {
    const calls: Record<string, RecordedCall[][]> = {}
    const supabase = createMockSupabase({ branches: () => ({ data: {}, error: null }) }, calls)

    const { error } = await deleteBranch(supabase, "tenant-1", "branch-1")
    expect(error).toBeNull()
    const eqCalls = calls.branches[0].filter((c) => c.method === "eq").map((c) => c.args)
    expect(eqCalls).toEqual([["id", "branch-1"], ["tenant_id", "tenant-1"]])
  })
})
