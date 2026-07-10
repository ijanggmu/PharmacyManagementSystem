import type { SupabaseClient } from "@supabase/supabase-js"
import { buildSearchFilter, applyPagination } from "@/lib/supabase/query-builders"
import { formatCreditNoteNumber } from "@/lib/utils/document-numbers"

const REFUNDS_SELECT = `
  *,
  credit_note_number,
  sales:original_sale_id (id, sale_number, total_amount, invoice_number),
  customers (id, first_name, last_name, phone),
  sales_refund_items (
    id,
    sale_item_id,
    quantity_refunded,
    total_refund_amount,
    medicines (id, name, strength, form)
  )
`

export interface ListRefundsInput {
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

export function parseListRefundsInput(sp: URLSearchParams, tenantId: string): ListRefundsInput {
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

function applyFilters(query: any, input: ListRefundsInput) {
  let q = query
  if (input.search) {
    q = buildSearchFilter(q, input.search, [
      "refund_number",
      "credit_note_number",
      "sales.sale_number",
      "customers.first_name",
      "customers.last_name",
    ])
  }
  if (input.status) q = q.eq("refund_status", input.status)
  if (input.customerId) q = q.eq("customer_id", input.customerId)
  if (input.saleId) q = q.eq("original_sale_id", input.saleId)
  if (input.dateFrom) q = q.gte("refund_date", input.dateFrom)
  if (input.dateTo) q = q.lte("refund_date", input.dateTo)
  if (input.minAmount != null) q = q.gte("net_refund_amount", String(input.minAmount))
  if (input.maxAmount != null) q = q.lte("net_refund_amount", String(input.maxAmount))
  q = q.order(input.sortBy, { ascending: input.sortOrder === "asc" })
  q = applyPagination(q, input.page, input.limit)
  return q
}

export async function listRefundsForTenant(supabase: SupabaseClient, input: ListRefundsInput) {
  let query = supabase
    .from("sales_refunds")
    .select(REFUNDS_SELECT, { count: "exact" })
    .eq("tenant_id", input.tenantId)

  query = applyFilters(query, input)

  const { data, error, count } = await query
  if (error) return { data: [], count: 0, error: new Error(error.message) }
  return { data: data || [], count: count ?? 0, error: null }
}

export async function getRefundByIdForTenant(supabase: SupabaseClient, tenantId: string, id: string) {
  const { data, error } = await supabase
    .from("sales_refunds")
    .select(REFUNDS_SELECT)
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .single()
  if (error) return { data: null, error: new Error(error.message) }
  return { data, error: null }
}

export interface CreateRefundInput {
  original_sale_id: string
  customer_id: string
  refund_date: string
  refund_reason: string
  refund_status: string
  refund_type?: string
  refund_method?: string
  tax_refund_amount?: number
  processing_fee?: number
  notes?: string | null
  refund_items: Array<{
    sale_item_id: string
    quantity_refunded: number
  }>
}

export async function createRefundForTenant(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string,
  input: CreateRefundInput
) {
  const { data: refundId, error: rpcError } = await supabase
    .rpc("create_sales_refund", {
      p_tenant_id: tenantId,
      p_user_id: userId,
      p_original_sale_id: input.original_sale_id,
      p_customer_id: input.customer_id,
      p_refund_date: input.refund_date,
      p_refund_reason: input.refund_reason,
      p_refund_type: input.refund_type ?? "partial_refund",
      p_refund_method: input.refund_method ?? "original_payment",
      p_refund_status: input.refund_status,
      p_tax_refund_amount: input.tax_refund_amount ?? 0,
      p_processing_fee: input.processing_fee ?? 0,
      p_notes: input.notes ?? null,
      p_items: input.refund_items.map((it) => ({
        sale_item_id: it.sale_item_id,
        quantity_refunded: it.quantity_refunded,
      })),
    })
    .single()

  if (rpcError || !refundId) {
    return { data: null, error: new Error(rpcError?.message || "Failed to create refund") }
  }

  const creditNote = formatCreditNoteNumber(refundId as string, new Date(input.refund_date))
  const { error: cnErr } = await supabase
    .from("sales_refunds")
    .update({ credit_note_number: creditNote })
    .eq("tenant_id", tenantId)
    .eq("id", refundId)
  if (cnErr) return { data: null, error: new Error(cnErr.message) }

  return getRefundByIdForTenant(supabase, tenantId, refundId as string)
}

export interface UpdateRefundPatch {
  refund_status?: string
  refund_reason?: string
  notes?: string | null
}

export async function updateRefundForTenant(
  supabase: SupabaseClient,
  tenantId: string,
  id: string,
  patch: UpdateRefundPatch
) {
  const { data, error } = await supabase
    .from("sales_refunds")
    .update(patch)
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .select(REFUNDS_SELECT)
    .single()
  if (error) return { data: null, error: new Error(error.message) }
  return { data, error: null }
}

export async function deleteRefundForTenant(supabase: SupabaseClient, tenantId: string, id: string) {
  const { error: itemsError } = await supabase
    .from("sales_refund_items")
    .delete()
    .eq("refund_id", id)
    .eq("tenant_id", tenantId)
  if (itemsError) return { error: new Error(itemsError.message) }

  const { error } = await supabase.from("sales_refunds").delete().eq("tenant_id", tenantId).eq("id", id)
  if (error) return { error: new Error(error.message) }
  return { error: null }
}

export async function getRefundsStatsForTenant(supabase: SupabaseClient, tenantId: string) {
  const { data, error } = await supabase
    .from("sales_refunds")
    .select("refund_status,net_refund_amount")
    .eq("tenant_id", tenantId)

  if (error) return { data: null, error: new Error(error.message) }

  const rows = (data || []) as { refund_status: string; net_refund_amount: string }[]
  const total = rows.length
  const totalRefundAmount = rows.reduce((sum, r) => sum + Number(r.net_refund_amount || 0), 0)
  const by = (s: string) => rows.filter((r) => r.refund_status === s).length

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

