/**
 * Server-only sales persistence. Used by `app/api/sales/*` Route Handlers.
 * Keeps Supabase and business rules out of the React tree and portable to .NET later.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { buildSearchFilter, applyPagination } from "@/lib/supabase/query-builders"
import type { z } from "zod"
import { saleSchema } from "@/lib/utils/validation"
import type { Role } from "@/lib/security/rbac-types"

/** Roles that keep tenant-wide sales visibility across every branch; everyone else
 *  is restricted to their own current_branch_id. See audit Module 04 — previously
 *  every role could see every branch's sales regardless of assignment. */
const BRANCH_UNRESTRICTED_ROLES: Role[] = ["admin", "manager", "superadmin"]

/** Resolves the branch_id filter to apply for a sales query, or null for roles that
 *  should see every branch. */
export async function resolveSalesBranchScope(
  supabase: SupabaseClient,
  userId: string,
  role: Role | undefined
): Promise<string | null> {
  if (role && BRANCH_UNRESTRICTED_ROLES.includes(role)) return null

  const { data } = await supabase
    .from("users")
    .select("current_branch_id")
    .eq("id", userId)
    .maybeSingle()

  return (data as { current_branch_id: string | null } | null)?.current_branch_id ?? null
}

const SALES_LIST_SELECT = `
  *,
  customers (id, first_name, last_name, phone, email),
  sale_items (
    id,
    quantity,
    unit_price,
    total_price,
    medicines (id, name, strength, form)
  )
`

export type SaleSchemaInput = z.infer<typeof saleSchema>

/** Build list input from GET /api/sales query string (supports repeated `paymentStatus` / `paymentMethod`). */
export function parseListSalesInput(searchParams: URLSearchParams, tenantId: string): ListSalesInput {
  const paymentStatuses = searchParams.getAll("paymentStatus").filter(Boolean)
  const paymentMethods = searchParams.getAll("paymentMethod").filter(Boolean)
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1)
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10) || 50))
  const minAmountRaw = searchParams.get("minAmount")
  const maxAmountRaw = searchParams.get("maxAmount")
  return {
    tenantId,
    search: searchParams.get("search"),
    paymentStatuses,
    paymentMethods,
    customerId: searchParams.get("customerId"),
    dateFrom: searchParams.get("dateFrom"),
    dateTo: searchParams.get("dateTo"),
    minAmount: minAmountRaw != null && minAmountRaw !== "" ? Number(minAmountRaw) : null,
    maxAmount: maxAmountRaw != null && maxAmountRaw !== "" ? Number(maxAmountRaw) : null,
    page,
    limit,
    sortBy: searchParams.get("sortBy") || "sale_date",
    sortOrder: searchParams.get("sortOrder") === "asc" ? "asc" : "desc",
  }
}

export interface ListSalesInput {
  tenantId: string
  search?: string | null
  paymentStatuses: string[]
  paymentMethods: string[]
  customerId?: string | null
  dateFrom?: string | null
  dateTo?: string | null
  minAmount?: number | null
  maxAmount?: number | null
  page: number
  limit: number
  sortBy: string
  sortOrder: "asc" | "desc"
  /** Set for branch-restricted roles (cashier/pharmacist/staff) so they only see
   *  their own branch's sales — previously any authenticated tenant user could see
   *  every branch's sales regardless of role. Left unset for admin/manager/superadmin,
   *  who retain tenant-wide visibility. See audit Module 04. */
  branchId?: string | null
}

function applyListFilters(query: any, input: ListSalesInput) {
  let q = query
  if (input.search) {
    q = buildSearchFilter(q, input.search, [
      "sale_number",
      "customers.first_name",
      "customers.last_name",
      "customers.phone",
    ])
  }
  if (input.paymentStatuses.length === 1) {
    q = q.eq("payment_status", input.paymentStatuses[0])
  } else if (input.paymentStatuses.length > 1) {
    q = q.in("payment_status", input.paymentStatuses)
  }
  if (input.paymentMethods.length === 1) {
    q = q.eq("payment_method", input.paymentMethods[0])
  } else if (input.paymentMethods.length > 1) {
    q = q.in("payment_method", input.paymentMethods)
  }
  if (input.customerId) {
    q = q.eq("customer_id", input.customerId)
  }
  if (input.dateFrom) {
    q = q.gte("sale_date", input.dateFrom)
  }
  if (input.dateTo) {
    q = q.lte("sale_date", input.dateTo)
  }
  if (input.minAmount != null) {
    q = q.gte("total_amount", input.minAmount.toString())
  }
  if (input.maxAmount != null) {
    q = q.lte("total_amount", input.maxAmount.toString())
  }
  if (input.branchId) {
    q = q.eq("branch_id", input.branchId)
  }
  return q
}

export async function listSalesForTenant(
  supabase: SupabaseClient,
  input: ListSalesInput
): Promise<{ data: unknown[]; count: number; error: Error | null }> {
  let query: any = supabase
    .from("sales")
    .select(SALES_LIST_SELECT, { count: "exact" })
    .eq("tenant_id", input.tenantId)

  query = applyListFilters(query, input)
  query = query.order(input.sortBy, { ascending: input.sortOrder === "asc" })
  query = applyPagination(query, input.page, input.limit)

  const { data, error, count } = await query
  if (error) {
    return { data: [], count: 0, error: new Error(error.message) }
  }
  return { data: data || [], count: count ?? 0, error: null }
}

export async function getSaleByIdForTenant(
  supabase: SupabaseClient,
  tenantId: string,
  id: string,
  branchId?: string | null
): Promise<{ data: unknown | null; error: Error | null }> {
  let query = supabase
    .from("sales")
    .select(SALES_LIST_SELECT)
    .eq("tenant_id", tenantId)
    .eq("id", id)
  if (branchId) {
    query = query.eq("branch_id", branchId)
  }
  const { data, error } = await query.single()

  if (error) {
    return { data: null, error: new Error(error.message) }
  }
  return { data, error: null }
}

export async function createSaleWithRpc(
  supabase: SupabaseClient,
  userId: string,
  tenantId: string,
  validatedData: SaleSchemaInput
): Promise<{ data: unknown | null; error: Error | null }> {
  // Authoritative pricing: never trust client-supplied unit_price. Look up the real,
  // tenant-scoped catalog price for every line item and price the sale from that —
  // a manipulated request can no longer sell a medicine below its listed price.
  const medicineIds = [...new Set(validatedData.items.map((item) => item.medicine_id))]
  const { data: catalogMedicines, error: catalogError } = await supabase
    .from("medicines")
    .select("id, unit_price")
    .eq("tenant_id", tenantId)
    .in("id", medicineIds)

  if (catalogError) {
    return { data: null, error: new Error(catalogError.message) }
  }

  const priceByMedicineId = new Map<string, number>(
    (catalogMedicines || []).map((m: { id: string; unit_price: number | string }) => [
      m.id,
      Number(m.unit_price),
    ])
  )

  for (const item of validatedData.items) {
    if (!priceByMedicineId.has(item.medicine_id)) {
      return { data: null, error: new Error(`Medicine ${item.medicine_id} was not found in this pharmacy's catalog`) }
    }
  }

  const totalAmount = validatedData.items.reduce((sum, item) => {
    const catalogPrice = priceByMedicineId.get(item.medicine_id)!
    const itemTotal = catalogPrice * item.quantity
    const discount = item.discount ? (itemTotal * item.discount) / 100 : 0
    return sum + itemTotal - discount
  }, 0)

  const saleNumber = `SALE-${Date.now()}`

  const itemsJson = validatedData.items.map((item) => ({
    medicine_id: item.medicine_id,
    quantity: item.quantity,
    unit_price: priceByMedicineId.get(item.medicine_id)!.toString(),
  }))

  const { data: saleId, error: transactionError } = await supabase.rpc("create_sale_with_items", {
    p_sale_number: saleNumber,
    p_customer_id: validatedData.customer_id || null,
    p_total_amount: (
      totalAmount +
      (validatedData.tax_amount || 0) -
      (validatedData.discount_amount || 0)
    ).toString(),
    p_discount_amount: (validatedData.discount_amount || 0).toString(),
    p_tax_amount: (validatedData.tax_amount || 0).toString(),
    p_payment_method: validatedData.payment_method,
    p_sale_date: new Date().toISOString(),
    p_notes: validatedData.notes || null,
    p_user_id: userId,
    p_items: itemsJson,
    p_client_request_id: validatedData.client_request_id || null,
    p_prescription_id: validatedData.prescription_id || null,
  })

  if (transactionError) {
    return { data: null, error: new Error(transactionError.message) }
  }

  const { data: completeSale, error: fetchError } = await supabase
    .from("sales")
    .select(SALES_LIST_SELECT)
    .eq("id", saleId)
    .single()

  if (fetchError) {
    return { data: null, error: new Error(fetchError.message) }
  }
  return { data: completeSale, error: null }
}

export interface UpdateSalePatch {
  payment_status?: string
  notes?: string | null
}

export async function updateSaleForTenant(
  supabase: SupabaseClient,
  tenantId: string,
  id: string,
  patch: UpdateSalePatch
): Promise<{ data: unknown | null; error: Error | null }> {
  const { data, error } = await supabase
    .from("sales")
    .update(patch)
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .select(SALES_LIST_SELECT)
    .single()

  if (error) {
    return { data: null, error: new Error(error.message) }
  }
  return { data, error: null }
}

export async function deleteSaleForTenant(
  _supabase: SupabaseClient,
  _tenantId: string,
  _id: string
): Promise<{ error: Error | null }> {
  return {
    error: new Error(
      "Sales cannot be deleted. Record a return from the sale or use Refunds to issue a credit."
    ),
  }
}

export interface SalesStatsAggregate {
  total: number
  totalRevenue: number
  todaySales: number
  todayRevenue: number
  pendingPayments: number
  completedPayments: number
}

export async function getSalesStatsForTenant(
  supabase: SupabaseClient,
  tenantId: string
): Promise<{ data: SalesStatsAggregate | null; error: Error | null }> {
  const { data, error } = await supabase
    .from("sales")
    .select("total_amount, payment_status, sale_date")
    .eq("tenant_id", tenantId)

  if (error) {
    return { data: null, error: new Error(error.message) }
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const rows = data || []
  const stats: SalesStatsAggregate = {
    total: rows.length,
    totalRevenue: rows.reduce((sum, row) => sum + parseFloat(String((row as { total_amount: string }).total_amount)), 0),
    todaySales: rows.filter((row) => {
      const saleDate = new Date((row as { sale_date: string }).sale_date)
      return saleDate >= today
    }).length,
    todayRevenue: rows
      .filter((row) => {
        const saleDate = new Date((row as { sale_date: string }).sale_date)
        return saleDate >= today
      })
      .reduce((sum, row) => sum + parseFloat(String((row as { total_amount: string }).total_amount)), 0),
    pendingPayments: rows.filter((row) => (row as { payment_status: string }).payment_status === "pending").length,
    completedPayments: rows.filter((row) => (row as { payment_status: string }).payment_status === "completed")
      .length,
  }

  return { data: stats, error: null }
}
