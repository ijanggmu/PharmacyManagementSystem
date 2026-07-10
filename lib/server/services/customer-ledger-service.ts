/**
 * Customer AR sub-ledger queries.
 * Backed by `customer_ledger_entries` and `customer_payment_allocations`.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

const LEDGER_SELECT = `
  id,
  entry_date,
  entry_type,
  description,
  amount,
  balance_after,
  reference_number,
  sale_id,
  payment_id,
  refund_id,
  created_at
`

export interface CustomerLedgerRow {
  id: string
  entry_date: string
  entry_type: "invoice" | "payment" | "credit_note" | "adjustment"
  description: string | null
  amount: string | number
  balance_after: string | number | null
  reference_number: string | null
  sale_id: string | null
  payment_id: string | null
  refund_id: string | null
  created_at: string
}

export async function listCustomerLedger(
  supabase: SupabaseClient,
  tenantId: string,
  customerId: string,
  options?: { limit?: number }
): Promise<{ data: CustomerLedgerRow[]; error: Error | null }> {
  const limit = Math.min(500, Math.max(1, options?.limit ?? 200))
  const { data, error } = await supabase
    .from("customer_ledger_entries")
    .select(LEDGER_SELECT)
    .eq("tenant_id", tenantId)
    .eq("customer_id", customerId)
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) return { data: [], error: new Error(error.message) }
  return { data: (data || []) as CustomerLedgerRow[], error: null }
}

export interface OpenInvoiceRow {
  sale_id: string
  sale_date: string
  invoice_number: string | null
  total_amount: number
  credited_amount: number
  paid_amount: number
  open_amount: number
}

export async function listCustomerOpenInvoices(
  supabase: SupabaseClient,
  tenantId: string,
  customerId: string,
  asOfDate: string
): Promise<{ data: OpenInvoiceRow[]; error: Error | null }> {
  const asOf = asOfDate.slice(0, 10)

  const { data: sales, error: sErr } = await supabase
    .from("sales")
    .select("id, sale_date, invoice_number, total_amount")
    .eq("tenant_id", tenantId)
    .eq("customer_id", customerId)
    .eq("payment_method", "credit")
    .lte("sale_date", asOf)
    .order("sale_date", { ascending: true })

  if (sErr) return { data: [], error: new Error(sErr.message) }

  const saleIds = (sales || []).map((s) => (s as any).id as string)
  if (!saleIds.length) return { data: [], error: null }

  const { data: allocs, error: aErr } = await supabase
    .from("customer_payment_allocations")
    .select("sale_id, amount_applied")
    .eq("tenant_id", tenantId)
    .in("sale_id", saleIds)

  if (aErr) return { data: [], error: new Error(aErr.message) }

  const paidBySale = new Map<string, number>()
  for (const r of allocs || []) {
    const row = r as any
    paidBySale.set(row.sale_id, (paidBySale.get(row.sale_id) || 0) + Number(row.amount_applied || 0))
  }

  const { data: refunds, error: rErr } = await supabase
    .from("sales_refunds")
    .select("original_sale_id, net_refund_amount, refund_date, refund_status")
    .eq("tenant_id", tenantId)
    .in("original_sale_id", saleIds)
    .lte("refund_date", asOf)
    .in("refund_status", ["approved", "completed"])

  if (rErr) return { data: [], error: new Error(rErr.message) }

  const creditedBySale = new Map<string, number>()
  for (const r of refunds || []) {
    const row = r as any
    creditedBySale.set(row.original_sale_id, (creditedBySale.get(row.original_sale_id) || 0) + Number(row.net_refund_amount || 0))
  }

  const out: OpenInvoiceRow[] = []
  for (const raw of sales || []) {
    const s = raw as any
    const total = Number(s.total_amount || 0)
    const paid = Number(paidBySale.get(s.id) || 0)
    const credited = Number(creditedBySale.get(s.id) || 0)
    const open = Number((total - paid - credited).toFixed(2))
    if (open <= 0.01) continue
    out.push({
      sale_id: s.id,
      sale_date: String(s.sale_date).slice(0, 10),
      invoice_number: s.invoice_number ?? null,
      total_amount: total,
      credited_amount: credited,
      paid_amount: paid,
      open_amount: open,
    })
  }
  return { data: out, error: null }
}

