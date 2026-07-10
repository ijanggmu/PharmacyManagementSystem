import type { SupabaseClient } from "@supabase/supabase-js"
import { buildSearchFilter, applyPagination } from "@/lib/supabase/query-builders"

const PRESCRIPTIONS_SELECT = `
  *,
  customers (id, first_name, last_name, phone),
  prescription_items (
    id,
    quantity_prescribed,
    quantity_dispensed,
    dosage_instructions,
    medicines (id, name, strength, form)
  )
`

export interface ListPrescriptionsInput {
  tenantId: string
  search?: string | null
  status?: string | null
  statuses: string[]
  customerId?: string | null
  doctorName?: string | null
  dateFrom?: string | null
  dateTo?: string | null
  page: number
  limit: number
  sortBy: string
  sortOrder: "asc" | "desc"
}

export function parseListPrescriptionsInput(sp: URLSearchParams, tenantId: string): ListPrescriptionsInput {
  const statuses = sp.getAll("status").filter(Boolean)
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1)
  const limit = Math.min(100, Math.max(1, parseInt(sp.get("limit") || "50", 10) || 50))
  return {
    tenantId,
    search: sp.get("search"),
    status: sp.get("status"),
    statuses,
    customerId: sp.get("customerId"),
    doctorName: sp.get("doctorName"),
    dateFrom: sp.get("dateFrom"),
    dateTo: sp.get("dateTo"),
    page,
    limit,
    sortBy: sp.get("sortBy") || "created_at",
    sortOrder: sp.get("sortOrder") === "asc" ? "asc" : "desc",
  }
}

function applyFilters(query: any, input: ListPrescriptionsInput) {
  let q = query
  if (input.search) {
    q = buildSearchFilter(q, input.search, [
      "prescription_number",
      "doctor_name",
      "customers.first_name",
      "customers.last_name",
    ])
  }
  if (input.statuses.length > 1) q = q.in("status", input.statuses)
  else if (input.status) q = q.eq("status", input.status)
  if (input.customerId) q = q.eq("customer_id", input.customerId)
  if (input.doctorName) q = q.ilike("doctor_name", `%${input.doctorName}%`)
  if (input.dateFrom) q = q.gte("issue_date", input.dateFrom)
  if (input.dateTo) q = q.lte("issue_date", input.dateTo)
  q = q.order(input.sortBy, { ascending: input.sortOrder === "asc" })
  q = applyPagination(q, input.page, input.limit)
  return q
}

export async function listPrescriptionsForTenant(supabase: SupabaseClient, input: ListPrescriptionsInput) {
  let query = supabase
    .from("prescriptions")
    .select(PRESCRIPTIONS_SELECT, { count: "exact" })
    .eq("tenant_id", input.tenantId)
  query = applyFilters(query, input)
  const { data, error, count } = await query
  if (error) return { data: [], count: 0, error: new Error(error.message) }
  return { data: data || [], count: count ?? 0, error: null }
}

export async function getPrescriptionByIdForTenant(supabase: SupabaseClient, tenantId: string, id: string) {
  const { data, error } = await supabase
    .from("prescriptions")
    .select(PRESCRIPTIONS_SELECT)
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .single()
  if (error) return { data: null, error: new Error(error.message) }
  return { data, error: null }
}

export async function updatePrescriptionForTenant(
  supabase: SupabaseClient,
  tenantId: string,
  id: string,
  patch: { doctor_name?: string; status?: string; notes?: string | null }
) {
  const { data, error } = await supabase
    .from("prescriptions")
    .update(patch)
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .select(PRESCRIPTIONS_SELECT)
    .single()
  if (error) return { data: null, error: new Error(error.message) }
  return { data, error: null }
}

export async function deletePrescriptionForTenant(supabase: SupabaseClient, tenantId: string, id: string) {
  const { error: itemsError } = await supabase.from("prescription_items").delete().eq("prescription_id", id)
  if (itemsError) return { error: new Error(itemsError.message) }
  const { error } = await supabase.from("prescriptions").delete().eq("tenant_id", tenantId).eq("id", id)
  if (error) return { error: new Error(error.message) }
  return { error: null }
}

export async function getPrescriptionStatsForTenant(supabase: SupabaseClient, tenantId: string) {
  const { data, error } = await supabase.from("prescriptions").select("status").eq("tenant_id", tenantId)
  if (error) return { data: null, error: new Error(error.message) }
  const rows = (data || []) as { status: string }[]
  const by = (s: string) => rows.filter((r) => r.status === s).length
  return {
    data: {
      total: rows.length,
      pending: by("pending"),
      filled: by("filled"),
      partially_filled: by("partially_filled"),
      cancelled: by("cancelled"),
    },
    error: null,
  }
}

