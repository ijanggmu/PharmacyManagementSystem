/**
 * Read-only audit trail over inventory_transactions — the per-movement log written
 * by every stock-affecting flow (purchase receive, sale, adjustment, return, expiry
 * write-off, branch transfer). Nothing here writes; each flow already inserts its
 * own row (see purchase-service.ts, medicine-service.ts, accounting-service.ts).
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export interface InventoryTransactionFilters {
  medicineId?: string
  branchId?: string
  transactionType?: string
  dateFrom?: string
  dateTo?: string
  page?: number
  limit?: number
}

export interface InventoryTransactionRow {
  id: string
  transaction_type: string
  quantity: number
  reference_id: string | null
  reference_type: string | null
  reason_code: string | null
  notes: string | null
  transaction_date: string
  medicines: { id: string; name: string } | null
  branches: { id: string; name: string } | null
  users: { id: string; full_name: string } | null
}

export async function listInventoryTransactions(
  supabase: SupabaseClient,
  tenantId: string,
  filters: InventoryTransactionFilters = {}
): Promise<{ data: InventoryTransactionRow[]; count: number; page: number; limit: number; totalPages: number; error: Error | null }> {
  const page = Math.max(1, filters.page ?? 1)
  const limit = Math.min(200, Math.max(1, filters.limit ?? 50))
  const from = (page - 1) * limit
  const to = from + limit - 1

  let query = supabase
    .from("inventory_transactions")
    .select(
      `id, transaction_type, quantity, reference_id, reference_type, reason_code, notes, transaction_date,
       medicines (id, name), branches (id, name), users (id, full_name)`,
      { count: "exact" }
    )
    .eq("tenant_id", tenantId)

  if (filters.medicineId) query = query.eq("medicine_id", filters.medicineId)
  if (filters.branchId) query = query.eq("branch_id", filters.branchId)
  if (filters.transactionType) query = query.eq("transaction_type", filters.transactionType)
  if (filters.dateFrom) query = query.gte("transaction_date", filters.dateFrom)
  if (filters.dateTo) query = query.lte("transaction_date", filters.dateTo)

  const { data, error, count } = await query.order("transaction_date", { ascending: false }).range(from, to)

  if (error) {
    return { data: [], count: 0, page, limit, totalPages: 0, error: new Error(error.message) }
  }

  const total = count ?? 0
  return {
    data: (data || []) as unknown as InventoryTransactionRow[],
    count: total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    error: null,
  }
}
