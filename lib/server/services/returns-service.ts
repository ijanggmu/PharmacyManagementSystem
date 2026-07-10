import type { SupabaseClient } from "@supabase/supabase-js"
import { buildSearchFilter, applyPagination } from "@/lib/supabase/query-builders"
import { getPrimaryBranchId } from "@/lib/server/services/tenant-branch"

const RETURNS_SELECT = `
  *,
  sales (id, sale_number, total_amount),
  customers (id, first_name, last_name, phone),
  return_items (
    id,
    quantity_returned,
    reason,
    refund_amount,
    sale_items (
      id,
      quantity,
      unit_price,
      total_price,
      medicines (id, name, strength, form)
    )
  )
`

export interface ListReturnsInput {
  tenantId: string
  search?: string | null
  status?: string | null
  customerId?: string | null
  saleId?: string | null
  dateFrom?: string | null
  dateTo?: string | null
  minAmount?: number | null
  maxAmount?: number | null
  page: number
  limit: number
  sortBy: string
  sortOrder: "asc" | "desc"
}

export function parseListReturnsInput(sp: URLSearchParams, tenantId: string): ListReturnsInput {
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1)
  const limit = Math.min(100, Math.max(1, parseInt(sp.get("limit") || "50", 10) || 50))
  const minAmountRaw = sp.get("minAmount")
  const maxAmountRaw = sp.get("maxAmount")
  return {
    tenantId,
    search: sp.get("search"),
    status: sp.get("status"),
    customerId: sp.get("customerId"),
    saleId: sp.get("saleId"),
    dateFrom: sp.get("dateFrom"),
    dateTo: sp.get("dateTo"),
    minAmount: minAmountRaw != null && minAmountRaw !== "" ? Number(minAmountRaw) : null,
    maxAmount: maxAmountRaw != null && maxAmountRaw !== "" ? Number(maxAmountRaw) : null,
    page,
    limit,
    sortBy: sp.get("sortBy") || "created_at",
    sortOrder: sp.get("sortOrder") === "asc" ? "asc" : "desc",
  }
}

function applyFilters(query: any, input: ListReturnsInput) {
  let q = query
  if (input.search) {
    q = buildSearchFilter(q, input.search, [
      "return_number",
      "sales.sale_number",
      "customers.first_name",
      "customers.last_name",
    ])
  }
  if (input.status) q = q.eq("status", input.status)
  if (input.customerId) q = q.eq("customer_id", input.customerId)
  if (input.saleId) q = q.eq("sale_id", input.saleId)
  if (input.dateFrom) q = q.gte("return_date", input.dateFrom)
  if (input.dateTo) q = q.lte("return_date", input.dateTo)
  if (input.minAmount != null) q = q.gte("total_refund_amount", String(input.minAmount))
  if (input.maxAmount != null) q = q.lte("total_refund_amount", String(input.maxAmount))
  q = q.order(input.sortBy, { ascending: input.sortOrder === "asc" })
  q = applyPagination(q, input.page, input.limit)
  return q
}

export async function listReturnsForTenant(
  supabase: SupabaseClient,
  input: ListReturnsInput
): Promise<{ data: unknown[]; count: number; error: Error | null }> {
  let query = supabase
    .from("medicine_returns")
    .select(RETURNS_SELECT, { count: "exact" })
    .eq("tenant_id", input.tenantId)

  query = applyFilters(query, input)

  const { data, error, count } = await query
  if (error) return { data: [], count: 0, error: new Error(error.message) }
  return { data: data || [], count: count ?? 0, error: null }
}

export async function getReturnByIdForTenant(
  supabase: SupabaseClient,
  tenantId: string,
  id: string
): Promise<{ data: unknown | null; error: Error | null }> {
  const { data, error } = await supabase
    .from("medicine_returns")
    .select(RETURNS_SELECT)
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .single()

  if (error) return { data: null, error: new Error(error.message) }
  return { data, error: null }
}

export interface CreateReturnInput {
  sale_id: string
  customer_id: string
  return_date: string
  status: string
  reason?: string | null
  notes?: string | null
  return_items: Array<{
    sale_item_id: string
    quantity_returned: number
    reason: string
  }>
}

/** Resolves the acting user's active branch, falling back to the tenant's primary branch. */
async function resolveActingBranchId(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string
): Promise<string> {
  const { data: actor } = await supabase
    .from("users")
    .select("current_branch_id")
    .eq("id", userId)
    .maybeSingle()
  const branchId = (actor as { current_branch_id: string | null } | null)?.current_branch_id ?? null
  return branchId || (await getPrimaryBranchId(supabase, tenantId))
}

export async function createReturnForTenant(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string,
  input: CreateReturnInput
): Promise<{ data: unknown | null; error: Error | null }> {
  const branchId = await resolveActingBranchId(supabase, tenantId, userId)

  const { data: returnId, error: rpcError } = await supabase
    .rpc("create_medicine_return", {
      p_tenant_id: tenantId,
      p_branch_id: branchId,
      p_sale_id: input.sale_id,
      p_customer_id: input.customer_id,
      p_return_date: input.return_date,
      p_return_reason: input.reason || "Not specified",
      p_notes: input.notes ?? null,
      p_status: input.status,
      p_items: input.return_items.map((it) => ({
        sale_item_id: it.sale_item_id,
        quantity_returned: it.quantity_returned,
        reason: it.reason,
      })),
    })
    .single()

  if (rpcError || !returnId) {
    return { data: null, error: new Error(rpcError?.message || "Failed to create return") }
  }

  return getReturnByIdForTenant(supabase, tenantId, returnId as string)
}

export interface UpdateReturnPatch {
  status?: string
  reason?: string | null
  notes?: string | null
}

export async function updateReturnForTenant(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string,
  id: string,
  patch: UpdateReturnPatch
) {
  const { data, error } = await supabase
    .from("medicine_returns")
    .update(patch)
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .select(RETURNS_SELECT)
    .single()

  if (error) return { data: null, error: new Error(error.message) }

  // Transitioning into "completed" restores stock exactly once (guarded server-side
  // by stock_restored_at) — covers the pending/approved -> completed workflow, not
  // just returns that were created already-completed.
  if (patch.status === "completed") {
    const branchId = await resolveActingBranchId(supabase, tenantId, userId)
    const { error: restoreError } = await supabase.rpc("restore_return_stock", {
      p_return_id: id,
      p_tenant_id: tenantId,
      p_branch_id: branchId,
    })
    if (restoreError) return { data: null, error: new Error(restoreError.message) }
  }

  return { data, error: null }
}

export async function deleteReturnForTenant(
  supabase: SupabaseClient,
  tenantId: string,
  id: string
) {
  const { error: itemsError } = await supabase
    .from("return_items")
    .delete()
    .eq("return_id", id)
    .eq("tenant_id", tenantId)
  if (itemsError) return { error: new Error(itemsError.message) }

  const { error } = await supabase
    .from("medicine_returns")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("id", id)
  if (error) return { error: new Error(error.message) }
  return { error: null }
}

export async function getReturnsStatsForTenant(supabase: SupabaseClient, tenantId: string) {
  const { data, error } = await supabase
    .from("medicine_returns")
    .select("status,total_refund_amount")
    .eq("tenant_id", tenantId)

  if (error) return { data: null, error: new Error(error.message) }

  const rows = (data || []) as { status: string; total_refund_amount: string }[]
  const total = rows.length
  const totalRefundAmount = rows.reduce((sum, r) => sum + Number(r.total_refund_amount || 0), 0)
  const by = (s: string) => rows.filter((r) => r.status === s).length

  return {
    data: {
      total,
      totalRefundAmount,
      pending: by("pending"),
      approved: by("approved"),
      rejected: by("rejected"),
      completed: by("completed"),
    },
    error: null,
  }
}

