/**
 * Server-only customer persistence. Used by `app/api/customers/*` Route Handlers.
 * Keeps Supabase and business rules out of the React tree and portable to .NET later.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

const CUSTOMER_DETAIL_SELECT = `
  *,
  prescriptions (id),
  sales (id, total_amount)
`

export interface ListCustomersInput {
  search: string | null
  status: string | null
  page: number
  limit: number
  sortBy: string
  sortOrder: string
  activity: string | null
  includeRelations: boolean
}

/** Build list input from GET /api/customers query string. */
export function parseListCustomersInput(searchParams: URLSearchParams): ListCustomersInput {
  return {
    search: searchParams.get("search"),
    status: searchParams.get("status"),
    page: parseInt(searchParams.get("page") || "1"),
    limit: parseInt(searchParams.get("limit") || "50"),
    sortBy: searchParams.get("sortBy") || "created_at",
    sortOrder: searchParams.get("sortOrder") || "desc",
    activity: searchParams.get("activity"),
    includeRelations: searchParams.get("includeRelations") === "1",
  }
}

function addSearchStatusOrder(
  query: any,
  input: Pick<ListCustomersInput, "search" | "status" | "sortBy" | "sortOrder">
) {
  let qq = query
  if (input.search) {
    const sanitizedSearch = input.search.trim().replace(/[%_]/g, "")
    const searchPattern = `%${sanitizedSearch}%`
    qq = qq.or(
      `first_name.ilike.${searchPattern},last_name.ilike.${searchPattern},email.ilike.${searchPattern},phone.ilike.${searchPattern}`
    )
  }
  if (input.status) {
    qq = qq.eq("status", input.status)
  }
  return qq.order(input.sortBy, { ascending: input.sortOrder === "asc" })
}

type CustomerActivityRow = {
  prescriptions?: { id: string }[]
  sales?: { id: string; total_amount: string }[]
}

export async function listCustomersForTenant(
  supabase: SupabaseClient,
  tenantId: string,
  input: ListCustomersInput
): Promise<{ data: unknown[]; count: number; error: Error | null }> {
  const needsActivityFilter = input.activity === "active" || input.activity === "inactive"
  const cap = 3000

  const selectShape =
    input.includeRelations || needsActivityFilter
      ? `*, prescriptions (id), sales (id, total_amount)`
      : "*"

  if (needsActivityFilter) {
    const query = addSearchStatusOrder(
      supabase.from("customers").select(selectShape).eq("tenant_id", tenantId),
      input
    )
    const { data: rows, error } = await query.range(0, cap - 1)
    if (error) {
      return { data: [], count: 0, error: new Error(error.message) }
    }
    const filtered = ((rows || []) as CustomerActivityRow[]).filter((r) => {
      const hasRecentActivity = (r.prescriptions?.length ?? 0) > 0 || (r.sales?.length ?? 0) > 0
      return input.activity === "active" ? hasRecentActivity : !hasRecentActivity
    })
    const count = filtered.length
    const from = (input.page - 1) * input.limit
    const data = filtered.slice(from, from + input.limit)
    return { data, count, error: null }
  }

  const query = addSearchStatusOrder(
    supabase.from("customers").select(selectShape, { count: "exact" }).eq("tenant_id", tenantId),
    input
  )
  const from = (input.page - 1) * input.limit
  const to = from + input.limit - 1
  const { data: rows, error, count } = await query.range(from, to)

  if (error) {
    return { data: [], count: 0, error: new Error(error.message) }
  }
  return { data: rows || [], count: count ?? 0, error: null }
}

export async function createCustomer(
  supabase: SupabaseClient,
  tenantId: string,
  validatedData: Record<string, unknown>
): Promise<{ data: unknown | null; error: Error | null }> {
  const { data, error } = await supabase
    .from("customers")
    .insert({ ...validatedData, tenant_id: tenantId })
    .select(CUSTOMER_DETAIL_SELECT)
    .single()

  if (error) {
    return { data: null, error: new Error(error.message) }
  }
  return { data, error: null }
}

export async function getCustomerById(
  supabase: SupabaseClient,
  tenantId: string,
  id: string
): Promise<{ data: unknown | null; error: Error | null }> {
  const { data, error } = await supabase
    .from("customers")
    .select(CUSTOMER_DETAIL_SELECT)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single()

  if (error || !data) {
    return { data: null, error: error ? new Error(error.message) : new Error("Customer not found") }
  }
  return { data, error: null }
}

export async function updateCustomer(
  supabase: SupabaseClient,
  tenantId: string,
  id: string,
  patch: Record<string, unknown>
): Promise<{ data: unknown | null; error: Error | null }> {
  const { data, error } = await supabase
    .from("customers")
    .update(patch)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select(CUSTOMER_DETAIL_SELECT)
    .single()

  if (error) {
    return { data: null, error: new Error(error.message) }
  }
  return { data, error: null }
}

export async function customerHasRelations(
  supabase: SupabaseClient,
  tenantId: string,
  id: string
): Promise<boolean> {
  const [salesResult, prescriptionsResult] = await Promise.all([
    supabase.from("sales").select("id").eq("customer_id", id).eq("tenant_id", tenantId).limit(1),
    supabase.from("prescriptions").select("id").eq("customer_id", id).eq("tenant_id", tenantId).limit(1),
  ])

  return Boolean(salesResult.data?.length || prescriptionsResult.data?.length)
}

export async function deleteCustomer(
  supabase: SupabaseClient,
  tenantId: string,
  id: string
): Promise<{ error: Error | null }> {
  const { error } = await supabase.from("customers").delete().eq("id", id).eq("tenant_id", tenantId)
  if (error) {
    return { error: new Error(error.message) }
  }
  return { error: null }
}
