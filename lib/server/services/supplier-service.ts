import type { SupabaseClient } from "@supabase/supabase-js"
import { ensureSupplierPayableAccount } from "@/lib/server/services/accounting-service"
import type { SupplierInput } from "@/lib/utils/validation"

interface SupplierLedgerSnapshot {
  supplier_id: string
  entry_type: string
  entry_date: string
  amount: string | number
  balance_after: string | number | null
  description?: string | null
  supplier_bill_number?: string | null
  created_at: string
}

function inferPaymentMethodFromDescription(description: string | null | undefined): "cash" | "bank" | null {
  if (!description) return null
  const lower = description.toLowerCase()
  if (lower.includes("cash")) return "cash"
  if (lower.includes("bank")) return "bank"
  return null
}

export interface ListSuppliersInput {
  search?: string | null
  page: number
  limit: number
  sortBy: string
  sortOrder: string
  profile?: string | null
}

export async function listSuppliersForTenant(
  supabase: SupabaseClient,
  input: ListSuppliersInput
): Promise<{ data: unknown[]; count: number; error: Error | null }> {
  const { search, page, limit, sortBy, sortOrder, profile } = input
  const selectCols = "*"
  const cap = 3000

  let query = supabase.from("suppliers").select(selectCols, { count: "exact" })

  if (search) {
    query = query.or(
      `name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%,contact_person.ilike.%${search}%`
    )
  }

  query = query.order(sortBy, { ascending: sortOrder === "asc" })

  const needsProfileFilter = profile === "active" || profile === "incomplete"

  let data: unknown[] | null = null
  let count: number | null = null

  if (needsProfileFilter) {
    const { data: rows, error, count: c } = await query.range(0, cap - 1)
    if (error) return { data: [], count: 0, error: new Error(error.message) }

    const rowList = (rows || []) as {
      email: string | null
      phone: string | null
      contact_person: string | null
    }[]
    const filtered = rowList.filter((s) => {
      const complete = !!(s.email && s.phone && s.contact_person)
      return profile === "active" ? complete : !complete
    })
    count = filtered.length
    const from = (page - 1) * limit
    data = filtered.slice(from, from + limit)
  } else {
    const from = (page - 1) * limit
    const to = from + limit - 1
    query = query.range(from, to)
    const res = await query
    if (res.error) return { data: [], count: 0, error: new Error(res.error.message) }
    data = res.data || []
    count = res.count ?? 0
  }

  return { data: data || [], count: count ?? 0, error: null }
}

export async function enrichSuppliersWithFinancials(
  supabase: SupabaseClient,
  tenantId: string,
  suppliers: unknown[]
): Promise<{ data: unknown[]; error: Error | null }> {
  if (suppliers.length === 0) return { data: suppliers, error: null }

  const supplierRows = suppliers as Array<{ id: string }>
  const supplierIds = supplierRows.map((s) => s.id)
  const { data: ledgerRows, error: ledgerError } = await supabase
    .from("supplier_ledger_entries")
    .select(
      "supplier_id, entry_type, entry_date, amount, balance_after, description, supplier_bill_number, created_at"
    )
    .eq("tenant_id", tenantId)
    .in("supplier_id", supplierIds)
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false })

  if (ledgerError) return { data: suppliers, error: new Error(ledgerError.message) }

  const latestBalanceBySupplier = new Map<string, number>()
  const latestPaymentBySupplier = new Map<string, { date: string; method: "cash" | "bank" | null }>()
  const latestBillBySupplier = new Map<string, { bill_number: string | null; bill_date: string }>()

  for (const rowRaw of (ledgerRows || []) as SupplierLedgerSnapshot[]) {
    const supplierId = rowRaw.supplier_id
    if (!latestBalanceBySupplier.has(supplierId)) {
      latestBalanceBySupplier.set(supplierId, Number(rowRaw.balance_after ?? 0))
    }

    if (rowRaw.entry_type === "payment" && !latestPaymentBySupplier.has(supplierId)) {
      latestPaymentBySupplier.set(supplierId, {
        date: rowRaw.entry_date,
        method: inferPaymentMethodFromDescription(rowRaw.description),
      })
    }

    if (rowRaw.entry_type === "invoice" && !latestBillBySupplier.has(supplierId)) {
      latestBillBySupplier.set(supplierId, {
        bill_number: rowRaw.supplier_bill_number?.trim() || null,
        bill_date: rowRaw.entry_date,
      })
    }
  }

  const enrichedData = (suppliers as Array<Record<string, unknown>>).map((supplier) => {
    const supplierId = String(supplier.id)
    const balance = Number(latestBalanceBySupplier.get(supplierId) ?? 0)
    const latestPayment = latestPaymentBySupplier.get(supplierId)
    const latestBill = latestBillBySupplier.get(supplierId)

    return {
      ...supplier,
      payable_amount: balance > 0 ? balance : 0,
      receivable_amount: balance < 0 ? Math.abs(balance) : 0,
      latest_payment_method: latestPayment?.method ?? null,
      latest_payment_date: latestPayment?.date ?? null,
      latest_supplier_bill_number: latestBill?.bill_number ?? null,
      latest_supplier_bill_date: latestBill?.bill_date ?? null,
    }
  })

  return { data: enrichedData, error: null }
}

export interface CreateSupplierResult {
  data: unknown | null
  error: Error | null
  code?: "CREATE_FAILED" | "AP_ACCOUNT_FAILED"
}

export async function createSupplierForTenant(
  supabase: SupabaseClient,
  tenantId: string,
  validatedData: SupplierInput
): Promise<CreateSupplierResult> {
  const { data, error } = await supabase
    .from("suppliers")
    .insert({
      ...validatedData,
      tenant_id: tenantId,
    })
    .select()
    .single()

  if (error) {
    return { data: null, error: new Error(error.message), code: "CREATE_FAILED" }
  }

  const supplierRow = data as { id: string }
  const ap = await ensureSupplierPayableAccount(supabase, tenantId, supplierRow.id)
  if (ap.error) {
    await supabase.from("suppliers").delete().eq("id", supplierRow.id).eq("tenant_id", tenantId)
    return { data: null, error: ap.error, code: "AP_ACCOUNT_FAILED" }
  }

  const { data: withAp, error: refetchErr } = await supabase
    .from("suppliers")
    .select("*")
    .eq("id", supplierRow.id)
    .single()

  return { data: refetchErr ? data : withAp, error: null }
}

export async function getSupplierById(
  supabase: SupabaseClient,
  id: string,
  tenantId: string
): Promise<{ data: unknown | null; error: Error | null }> {
  const { data, error } = await supabase
    .from("suppliers")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single()
  if (error || !data) return { data: null, error: new Error(error?.message || "Supplier not found") }
  return { data, error: null }
}

export async function updateSupplier(
  supabase: SupabaseClient,
  id: string,
  tenantId: string,
  patch: Partial<SupplierInput>
): Promise<{ data: unknown | null; error: Error | null }> {
  const { data, error } = await supabase
    .from("suppliers")
    .update(patch)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("*")
    .single()

  if (error) return { data: null, error: new Error(error.message) }
  return { data, error: null }
}

export interface SupplierDeleteGuardResult {
  blocked: boolean
  reason?: string
  error?: Error
}

export async function checkSupplierDeletable(
  supabase: SupabaseClient,
  id: string,
  tenantId: string
): Promise<SupplierDeleteGuardResult> {
  const { data: linkedLedger, error: linkedLedgerError } = await supabase
    .from("supplier_ledger_entries")
    .select("id")
    .eq("supplier_id", id)
    .eq("tenant_id", tenantId)
    .limit(1)

  if (linkedLedgerError) return { blocked: false, error: new Error(linkedLedgerError.message) }

  if ((linkedLedger || []).length > 0) {
    return {
      blocked: true,
      reason: "Supplier cannot be deleted because it has ledger/voucher history. Mark it inactive instead.",
    }
  }

  const { data: linkedOrders, error: linkedOrdersError } = await supabase
    .from("purchase_orders")
    .select("id")
    .eq("supplier_id", id)
    .eq("tenant_id", tenantId)
    .limit(1)

  if (linkedOrdersError) return { blocked: false, error: new Error(linkedOrdersError.message) }

  if ((linkedOrders || []).length > 0) {
    return {
      blocked: true,
      reason: "Supplier cannot be deleted because it is referenced in purchase documents.",
    }
  }

  return { blocked: false }
}

export async function deleteSupplier(
  supabase: SupabaseClient,
  id: string,
  tenantId: string
): Promise<{ error: Error | null }> {
  const { error } = await supabase.from("suppliers").delete().eq("id", id).eq("tenant_id", tenantId)
  if (error) return { error: new Error(error.message) }
  return { error: null }
}
