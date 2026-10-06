import type { SupabaseClient } from "@supabase/supabase-js"
import { dotnetServerGet, dotnetServerPost } from "@/lib/api/dotnet-server-session"

/** First branch for tenant (used when API flows need branch_id on stock / GRN rows). */
export async function getPrimaryBranchId(supabase: SupabaseClient, tenantId: string): Promise<string> {
  const { data, error } = await supabase
    .from("branches")
    .select("id")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error || !data?.id) {
    throw new Error("No branch found for tenant; configure branches before posting receipts")
  }
  return data.id
}

export interface UserBranchContext {
  tenant_id: string | null
  current_branch_id: string | null
}

/** Tenant + currently-selected branch for a user (used by GET /api/branch-context). */
export async function getUserBranchContext(
  supabase: SupabaseClient,
  userId: string
): Promise<{ data: UserBranchContext | null; error: Error | null }> {
  const { data, error } = await supabase
    .from("users")
    .select("tenant_id, current_branch_id")
    .eq("id", userId)
    .single()

  if (error) {
    return { data: null, error: new Error(error.message) }
  }
  return { data: data as UserBranchContext, error: null }
}

export interface BranchContextRow {
  id: string
  name: string
  code: string
  is_active: boolean
}

/** Lean branch list (id/name/code/is_active) for branch-context switcher UI. */
export async function listBranchesForContext(
  supabase: SupabaseClient,
  tenantId: string
): Promise<{ data: BranchContextRow[]; error: Error | null }> {
  const { data, error } = await supabase
    .from("branches")
    .select("id, name, code, is_active")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true })

  if (error) {
    return { data: [], error: new Error(error.message) }
  }
  return { data: (data as BranchContextRow[]) || [], error: null }
}

/** Multitenancy.Contracts BranchDto (camelCase JSON). */
interface DotnetBranch {
  id: string
  tenantId: string
  name: string
  code: string
  isActive: boolean
  createdOnUtc: string
  lastModifiedOnUtc: string | null
}

/** Multitenancy.Contracts BranchContextDto. */
interface DotnetBranchContext {
  branches: DotnetBranch[]
  currentBranchId: string | null
}

/** Multitenancy.Contracts PagedResponse<BranchDto>. */
interface DotnetPagedBranches {
  items: DotnetBranch[]
  totalCount: number
}

function branchContextRowFromDotnet(b: DotnetBranch): BranchContextRow {
  return { id: b.id, name: b.name, code: b.code, is_active: b.isActive }
}

/** .NET path for GET /api/branch-context: the tenant's branches plus the caller's current branch. */
export async function getBranchContextDotnet(): Promise<{ branches: BranchContextRow[]; currentBranchId: string | null }> {
  const ctx = await dotnetServerGet<DotnetBranchContext>("/branches/context")
  return { branches: ctx.branches.map(branchContextRowFromDotnet), currentBranchId: ctx.currentBranchId }
}

/** .NET path for PUT /api/branch-context: switches the caller's current branch. */
export async function switchUserBranchDotnet(branchId: string): Promise<void> {
  await dotnetServerPost<DotnetBranchContext>("/branches/switch", { branchId })
}

/** Switches the current user's active branch. */
export async function switchUserBranch(
  supabase: SupabaseClient,
  userId: string,
  branchId: string
): Promise<{ error: Error | null }> {
  const { error } = await supabase.from("users").update({ current_branch_id: branchId }).eq("id", userId)
  if (error) {
    return { error: new Error(error.message) }
  }
  return { error: null }
}

export interface BranchRow {
  id: string
  name: string
  code: string
  address: string | null
  phone: string | null
  email: string | null
  is_active: boolean
  created_at: string
}

/**
 * .NET path for the branch management list. The .NET BranchDto has no address, phone or email, so those
 * are null on this path. The .NET list is capped at 100 per page, so every page is read.
 */
export async function listBranchesForTenantDotnet(): Promise<BranchRow[]> {
  const items: DotnetBranch[] = []
  for (let pageNumber = 1; ; pageNumber++) {
    const page = await dotnetServerGet<DotnetPagedBranches>(`/branches?pageNumber=${pageNumber}&pageSize=100`)
    items.push(...page.items)
    if (page.items.length === 0 || items.length >= page.totalCount) break
  }
  return items.map((b) => ({
    id: b.id,
    name: b.name,
    code: b.code,
    address: null,
    phone: null,
    email: null,
    is_active: b.isActive,
    created_at: b.createdOnUtc,
  }))
}

/** Full branch list (management UI) for a tenant. */
export async function listBranchesForTenant(
  supabase: SupabaseClient,
  tenantId: string
): Promise<{ data: BranchRow[]; error: Error | null }> {
  const { data, error } = await supabase
    .from("branches")
    .select("id, name, code, address, phone, email, is_active, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true })

  if (error) {
    return { data: [], error: new Error(error.message) }
  }
  return { data: (data as BranchRow[]) || [], error: null }
}

export interface CreateBranchInput {
  name: string
  code: string
  address?: string | null
  phone?: string | null
  email?: string | null
  is_active?: boolean
}

function slugifyBranchCode(code: string): string {
  return (
    String(code).trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 60) || "branch"
  )
}

export async function createBranch(
  supabase: SupabaseClient,
  tenantId: string,
  input: CreateBranchInput
): Promise<{ data: unknown | null; error: (Error & { code?: string }) | null }> {
  const { data, error } = await supabase
    .from("branches")
    .insert({
      tenant_id: tenantId,
      name: String(input.name).trim(),
      code: slugifyBranchCode(input.code),
      address: input.address ? String(input.address).trim() : null,
      phone: input.phone ? String(input.phone).trim() : null,
      email: input.email ? String(input.email).trim() : null,
      is_active: input.is_active !== false,
    })
    .select()
    .single()

  if (error) {
    const wrapped: Error & { code?: string } = new Error(error.message)
    wrapped.code = error.code
    return { data: null, error: wrapped }
  }
  return { data, error: null }
}

export interface UpdateBranchInput {
  name?: string
  code?: string
  address?: string | null
  phone?: string | null
  email?: string | null
  is_active?: boolean
}

/** Applies a partial branch update. Returns `updates` so caller can short-circuit when only timestamp changed. */
export async function updateBranch(
  supabase: SupabaseClient,
  tenantId: string,
  id: string,
  input: UpdateBranchInput
): Promise<{ data: unknown | null; error: Error | null; updates: Record<string, unknown> }> {
  const updates: Record<string, unknown> = {}
  if (input.name !== undefined) updates.name = input.name
  if (input.code !== undefined) updates.code = slugifyBranchCode(input.code)
  if (input.address !== undefined) updates.address = input.address || null
  if (input.phone !== undefined) updates.phone = input.phone || null
  if (input.email !== undefined) updates.email = input.email || null
  if (typeof input.is_active === "boolean") updates.is_active = input.is_active
  updates.updated_at = new Date().toISOString()

  if (Object.keys(updates).length <= 1) {
    return { data: null, error: null, updates }
  }

  const { data, error } = await supabase
    .from("branches")
    .update(updates)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select()
    .single()

  if (error) {
    return { data: null, error: new Error(error.message), updates }
  }
  return { data, error: null, updates }
}

export async function deleteBranch(
  supabase: SupabaseClient,
  tenantId: string,
  id: string
): Promise<{ error: Error | null }> {
  const { error } = await supabase.from("branches").delete().eq("id", id).eq("tenant_id", tenantId)
  if (error) {
    return { error: new Error(error.message) }
  }
  return { error: null }
}
