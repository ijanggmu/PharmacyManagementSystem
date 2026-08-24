import { describe, it, expect } from "vitest"
import { createMockSupabase, lastCallArgs, type RecordedCall } from "@/test/supabase-mock"
import {
  insertTenant,
  insertTenantAdminAppUser,
  seedDefaultBranch,
  seedDefaultTenantSettings,
  getActiveTenantByCode,
} from "@/lib/server/services/tenant-service"

describe("insertTenant", () => {
  it("defaults country/timezone/currency/fiscal year when omitted", async () => {
    const calls: Record<string, RecordedCall[][]> = {}
    const supabase = createMockSupabase(
      { tenants: () => ({ data: { id: "tenant-1", code: "acme" }, error: null }) },
      calls
    )

    const { data, error } = await insertTenant(supabase, { name: "Acme Pharmacy", code: "acme" })

    expect(error).toBeNull()
    expect(data).toEqual({ id: "tenant-1", code: "acme" })

    const insertArgs = lastCallArgs(calls.tenants, "insert")?.[0] as any
    expect(insertArgs.country).toBe("Nepal")
    expect(insertArgs.timezone).toBe("Asia/Kathmandu")
    expect(insertArgs.currency).toBe("NPR")
    expect(insertArgs.fiscal_year_start_month).toBe(7)
  })

  it("surfaces the DB error instead of a silent null", async () => {
    const supabase = createMockSupabase({
      tenants: () => ({ data: null, error: { message: "duplicate key value" } }),
    })

    const { data, error } = await insertTenant(supabase, { name: "Acme", code: "acme" })
    expect(data).toBeNull()
    expect(error?.message).toContain("duplicate key")
  })
})

describe("seedDefaultBranch", () => {
  it("creates a 'Head Office' branch named after the tenant's code", async () => {
    const calls: Record<string, RecordedCall[][]> = {}
    const supabase = createMockSupabase(
      { branches: () => ({ data: { id: "branch-1" }, error: null }) },
      calls
    )

    const { data, error } = await seedDefaultBranch(supabase, "tenant-1", "acme")

    expect(error).toBeNull()
    expect(data).toEqual({ id: "branch-1" })

    const insertArgs = lastCallArgs(calls.branches, "insert")?.[0] as any
    expect(insertArgs.tenant_id).toBe("tenant-1")
    expect(insertArgs.name).toBe("Head Office")
    expect(insertArgs.code).toBe("acme-main")
    expect(insertArgs.is_active).toBe(true)
  })
})

describe("insertTenantAdminAppUser", () => {
  it("stamps the admin role and threads through the seeded branch id", async () => {
    const calls: Record<string, RecordedCall[][]> = {}
    const supabase = createMockSupabase({ users: () => ({ data: {}, error: null }) }, calls)

    const { error } = await insertTenantAdminAppUser(supabase, {
      id: "user-1",
      email: "admin@acme.com",
      fallbackName: "Acme Pharmacy",
      tenantId: "tenant-1",
      branchId: "branch-1",
    })

    expect(error).toBeNull()
    const insertArgs = lastCallArgs(calls.users, "insert")?.[0] as any
    expect(insertArgs.role).toBe("admin")
    expect(insertArgs.current_branch_id).toBe("branch-1")
  })

  it("defaults current_branch_id to null when no branch was seeded", async () => {
    const calls: Record<string, RecordedCall[][]> = {}
    const supabase = createMockSupabase({ users: () => ({ data: {}, error: null }) }, calls)

    await insertTenantAdminAppUser(supabase, {
      id: "user-1",
      email: "admin@acme.com",
      fallbackName: "Acme Pharmacy",
      tenantId: "tenant-1",
    })

    const insertArgs = lastCallArgs(calls.users, "insert")?.[0] as any
    expect(insertArgs.current_branch_id).toBeNull()
  })
})

describe("seedDefaultTenantSettings", () => {
  it("seeds all default settings tagged with the tenant id", async () => {
    const calls: Record<string, RecordedCall[][]> = {}
    const supabase = createMockSupabase(
      { system_settings: () => ({ data: {}, error: null }) },
      calls
    )

    const { error } = await seedDefaultTenantSettings(supabase, {
      tenantId: "tenant-1",
      pharmacyName: "Acme Pharmacy",
    })

    expect(error).toBeNull()
    const insertArgs = lastCallArgs(calls.system_settings, "insert")?.[0] as any[]
    expect(insertArgs.length).toBeGreaterThan(0)
    expect(insertArgs.every((s) => s.tenant_id === "tenant-1")).toBe(true)
    expect(insertArgs.map((s) => s.key)).toContain("low_stock_threshold")
  })
})

describe("getActiveTenantByCode", () => {
  it("lowercases and trims the lookup code", async () => {
    const calls: Record<string, RecordedCall[][]> = {}
    const supabase = createMockSupabase(
      { tenants: () => ({ data: { id: "tenant-1", name: "Acme", code: "acme" }, error: null }) },
      calls
    )

    const { data } = await getActiveTenantByCode(supabase, "  ACME  ")
    expect(data?.code).toBe("acme")
    const eqArgs = calls.tenants[0].find((c) => c.method === "eq")?.args
    expect(eqArgs).toEqual(["code", "acme"])
  })

  it("returns null (no error) when the tenant doesn't exist, without throwing", async () => {
    const supabase = createMockSupabase({
      tenants: () => ({ data: null, error: { message: "No rows found" } }),
    })

    const { data, error } = await getActiveTenantByCode(supabase, "ghost")
    expect(data).toBeNull()
    expect(error).not.toBeNull()
  })
})
