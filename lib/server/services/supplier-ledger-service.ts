import type { SupabaseClient } from "@supabase/supabase-js"

export interface SupplierLedgerEntry {
  [key: string]: unknown
  balance_after?: number | string | null
}

export interface SupplierLedgerSummary {
  supplierId: string
  balance: number
  supplier: { id: string; name: string; reconciliation_account_ref: string | null; phone: string | null; email: string | null } | null
  entries: SupplierLedgerEntry[]
}

export async function getSupplierLedgerForTenant(
  supabase: SupabaseClient,
  tenantId: string,
  supplierId: string
): Promise<{ data: SupplierLedgerSummary | null; error: Error | null }> {
  const { data: entries, error } = await supabase
    .from("supplier_ledger_entries")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("supplier_id", supplierId)
    .order("entry_date", { ascending: true })
    .order("created_at", { ascending: true })

  if (error) return { data: null, error: new Error(error.message) }

  const { data: supplierRow } = await supabase
    .from("suppliers")
    .select("id, name, reconciliation_account_ref, phone, email")
    .eq("tenant_id", tenantId)
    .eq("id", supplierId)
    .maybeSingle()

  const entryRows = (entries || []) as SupplierLedgerEntry[]
  const balance = entryRows.length ? Number(entryRows[entryRows.length - 1].balance_after ?? 0) : 0

  return {
    data: {
      supplierId,
      balance,
      supplier: (supplierRow as SupplierLedgerSummary["supplier"]) ?? null,
      entries: entryRows,
    },
    error: null,
  }
}
