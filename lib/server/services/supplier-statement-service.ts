import type { SupabaseClient } from "@supabase/supabase-js"
import type { AccountingBranchScope } from "@/lib/server/services/accounting-service"

export interface SupplierStatementLine {
  id: string
  entry_date: string
  entry_type: string
  reference_number: string | null
  supplier_bill_number: string | null
  description: string | null
  amount: number
  balance_after: number | null
}

export async function supplierStatementReport(
  supabase: SupabaseClient,
  tenantId: string,
  supplierId: string,
  dateFrom: string,
  dateTo: string,
  scope?: AccountingBranchScope
): Promise<{
  data: {
    supplier_id: string
    period_from: string
    period_to: string
    opening_balance: number
    closing_balance: number
    lines: SupplierStatementLine[]
  } | null
  error: Error | null
}> {
  const from = dateFrom.slice(0, 10)
  const to = dateTo.slice(0, 10)
  const branchId = scope?.branchId ?? null

  let preQuery = supabase
    .from("supplier_ledger_entries")
    .select("balance_after, amount")
    .eq("tenant_id", tenantId)
    .eq("supplier_id", supplierId)
    .lt("entry_date", from)
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)

  if (branchId) preQuery = preQuery.eq("branch_id", branchId)

  const { data: preRow } = await preQuery.maybeSingle()
  let opening = Number((preRow as { balance_after?: string | number } | null)?.balance_after ?? 0)
  if (!preRow) {
    let sumQuery = supabase
      .from("supplier_ledger_entries")
      .select("amount")
      .eq("tenant_id", tenantId)
      .eq("supplier_id", supplierId)
      .lt("entry_date", from)
    if (branchId) sumQuery = sumQuery.eq("branch_id", branchId)
    const { data: preRows } = await sumQuery
    opening = (preRows || []).reduce(
      (acc, r) => acc + Number((r as { amount: string | number }).amount ?? 0),
      0
    )
  }

  let linesQuery = supabase
    .from("supplier_ledger_entries")
    .select(
      "id, entry_date, entry_type, reference_number, supplier_bill_number, description, amount, balance_after"
    )
    .eq("tenant_id", tenantId)
    .eq("supplier_id", supplierId)
    .gte("entry_date", from)
    .lte("entry_date", to)
    .order("entry_date", { ascending: true })
    .order("created_at", { ascending: true })

  if (branchId) linesQuery = linesQuery.eq("branch_id", branchId)

  const { data: rows, error } = await linesQuery
  if (error) return { data: null, error: new Error(error.message) }

  const lines: SupplierStatementLine[] = (rows || []).map((raw) => {
    const r = raw as SupplierStatementLine & { amount: string | number; balance_after: string | number | null }
    return {
      id: r.id,
      entry_date: r.entry_date,
      entry_type: r.entry_type,
      reference_number: r.reference_number,
      supplier_bill_number: r.supplier_bill_number,
      description: r.description,
      amount: Number(r.amount),
      balance_after: r.balance_after == null ? null : Number(r.balance_after),
    }
  })

  const closing =
    lines.length > 0 && lines[lines.length - 1].balance_after != null
      ? lines[lines.length - 1].balance_after!
      : opening + lines.reduce((s, l) => s + l.amount, 0)

  return {
    data: {
      supplier_id: supplierId,
      period_from: from,
      period_to: to,
      opening_balance: Number(opening.toFixed(2)),
      closing_balance: Number(closing.toFixed(2)),
      lines,
    },
    error: null,
  }
}
