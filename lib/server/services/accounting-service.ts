/**
 * Server-only accounting (GL / vouchers). Used by `app/api/accounting/*`.
 */

import { createHash } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  assertBalancedLines,
  createManualVoucherSchema,
  type CreateManualVoucherInput,
} from "@/lib/server/schemas/accounting"

export type AccountingBranchScope = { branchId?: string | null }

export function parseAccountingBranchScope(
  searchParams: URLSearchParams
): AccountingBranchScope {
  const raw = searchParams.get("branchId")
  if (!raw || raw === "all") return {}
  return { branchId: raw }
}

export interface AccountingAccountRow {
  id: string
  tenant_id: string
  code: string
  name: string
  account_type: string
  is_system: boolean
  is_active: boolean
}

export interface CreateAccountingAccountInput {
  code: string
  name: string
  account_type: "asset" | "liability" | "equity" | "revenue" | "expense"
}

export async function listAccounts(
  supabase: SupabaseClient,
  tenantId: string
): Promise<{ data: AccountingAccountRow[]; error: Error | null }> {
  const { data, error } = await supabase
    .from("accounting_accounts")
    .select("id, tenant_id, code, name, account_type, is_system, is_active")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("code")

  if (error) return { data: [], error: new Error(error.message) }
  return { data: (data || []) as AccountingAccountRow[], error: null }
}

function supplierApCode(supplierId: string, bump: number): string {
  const basis = bump === 0 ? supplierId : `${supplierId}:${bump}`
  const frag = createHash("md5").update(basis).digest("hex").slice(0, 8)
  return `S${frag}`
}

/** Ensures `suppliers.accounting_payable_account_id` points to a per-supplier liability head (matches migration 56). */
export async function ensureSupplierPayableAccount(
  supabase: SupabaseClient,
  tenantId: string,
  supplierId: string
): Promise<{ payableAccountId: string | null; error: Error | null }> {
  const { data: row, error: fetchErr } = await supabase
    .from("suppliers")
    .select("id, name, accounting_payable_account_id")
    .eq("id", supplierId)
    .eq("tenant_id", tenantId)
    .maybeSingle()

  if (fetchErr) return { payableAccountId: null, error: new Error(fetchErr.message) }
  if (!row) return { payableAccountId: null, error: new Error("Supplier not found") }

  const existing = row.accounting_payable_account_id as string | null
  if (existing) return { payableAccountId: existing, error: null }

  const name = String(row.name || "Supplier").slice(0, 120)
  let bump = 0
  let code = supplierApCode(supplierId, bump)
  for (;;) {
    const { data: clash } = await supabase
      .from("accounting_accounts")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("code", code)
      .maybeSingle()
    if (!clash) break
    bump += 1
    code = supplierApCode(supplierId, bump)
  }

  const { data: acct, error: insErr } = await supabase
    .from("accounting_accounts")
    .insert({
      tenant_id: tenantId,
      code,
      name: `AP: ${name}`,
      account_type: "liability",
      is_system: false,
      is_active: true,
    })
    .select("id")
    .single()

  if (insErr || !acct) {
    return { payableAccountId: null, error: new Error(insErr?.message || "Failed to create AP account") }
  }

  const payableId = acct.id as string
  const { error: updErr } = await supabase
    .from("suppliers")
    .update({ accounting_payable_account_id: payableId })
    .eq("id", supplierId)
    .eq("tenant_id", tenantId)

  if (updErr) {
    await supabase.from("accounting_accounts").delete().eq("id", payableId).eq("tenant_id", tenantId)
    return { payableAccountId: null, error: new Error(updErr.message) }
  }
  return { payableAccountId: payableId, error: null }
}

export async function getPostingLockDate(
  supabase: SupabaseClient,
  tenantId: string
): Promise<{ lockDate: string | null; error: Error | null }> {
  const { data, error } = await supabase
    .from("system_settings")
    .select("value")
    .eq("tenant_id", tenantId)
    .eq("key", "accounting_posting_lock_date")
    .maybeSingle()

  if (error) return { lockDate: null, error: new Error(error.message) }
  const raw = (data?.value as string | undefined)?.trim()
  if (!raw) return { lockDate: null, error: null }
  const d = new Date(`${raw}T00:00:00`)
  if (Number.isNaN(d.getTime())) return { lockDate: null, error: null }
  return { lockDate: raw.slice(0, 10), error: null }
}

export function assertVoucherDateOpen(lockDate: string | null, voucherDate: string): void {
  if (!lockDate) return
  const v = voucherDate.slice(0, 10)
  if (v <= lockDate) {
    throw new Error(`Accounting period closed: cannot post on or before ${lockDate}`)
  }
}

export interface ProfitLossRow {
  account_id: string
  code: string
  name: string
  account_type: string
  amount: number
}

export async function profitAndLossReport(
  supabase: SupabaseClient,
  tenantId: string,
  dateFrom: string,
  dateTo: string,
  scope?: AccountingBranchScope
): Promise<{
  data: ProfitLossRow[]
  net_income: number
  debits_equal_credits: boolean
  error: Error | null
}> {
  const { data: tb, debits_equal_credits, error } = await trialBalanceReport(
    supabase,
    tenantId,
    dateFrom,
    dateTo,
    scope
  )
  if (error) return { data: [], net_income: 0, debits_equal_credits: false, error }

  const plRows: ProfitLossRow[] = []
  let net = 0
  for (const r of tb) {
    if (r.account_type === "revenue") {
      const amt = r.credit_total - r.debit_total
      plRows.push({
        account_id: r.account_id,
        code: r.code,
        name: r.name,
        account_type: r.account_type,
        amount: amt,
      })
      net += amt
    } else if (r.account_type === "expense") {
      const amt = r.debit_total - r.credit_total
      plRows.push({
        account_id: r.account_id,
        code: r.code,
        name: r.name,
        account_type: r.account_type,
        amount: amt,
      })
      net -= amt
    }
  }

  return { data: plRows, net_income: net, debits_equal_credits, error: null }
}

export interface BalanceSheetRow {
  account_id: string
  code: string
  name: string
  account_type: string
  balance: number
}

export async function balanceSheetReport(
  supabase: SupabaseClient,
  tenantId: string,
  asOfDate: string,
  scope?: AccountingBranchScope
): Promise<{
  assets: BalanceSheetRow[]
  liabilities: BalanceSheetRow[]
  equity: BalanceSheetRow[]
  total_assets: number
  total_liabilities: number
  total_equity: number
  accounting_equation_residual: number
  error: Error | null
}> {
  const historicFrom = "2000-01-01"
  const { data: tb, debits_equal_credits, error } = await trialBalanceReport(
    supabase,
    tenantId,
    historicFrom,
    asOfDate,
    scope
  )
  if (error) {
    return {
      assets: [],
      liabilities: [],
      equity: [],
      total_assets: 0,
      total_liabilities: 0,
      total_equity: 0,
      accounting_equation_residual: 0,
      error,
    }
  }

  const assets: BalanceSheetRow[] = []
  const liabilities: BalanceSheetRow[] = []
  const equity: BalanceSheetRow[] = []
  let total_assets = 0
  let total_liabilities = 0
  let total_equity = 0

  for (const r of tb) {
    if (r.account_type === "asset") {
      const bal = r.balance
      assets.push({
        account_id: r.account_id,
        code: r.code,
        name: r.name,
        account_type: r.account_type,
        balance: bal,
      })
      total_assets += bal
    } else if (r.account_type === "liability") {
      const bal = r.credit_total - r.debit_total
      liabilities.push({
        account_id: r.account_id,
        code: r.code,
        name: r.name,
        account_type: r.account_type,
        balance: bal,
      })
      total_liabilities += bal
    } else if (r.account_type === "equity") {
      const bal = r.credit_total - r.debit_total
      equity.push({
        account_id: r.account_id,
        code: r.code,
        name: r.name,
        account_type: r.account_type,
        balance: bal,
      })
      total_equity += bal
    }
  }

  const residual = total_assets - total_liabilities - total_equity
  return {
    assets,
    liabilities,
    equity,
    total_assets,
    total_liabilities,
    total_equity,
    accounting_equation_residual: residual,
    error: debits_equal_credits ? null : new Error("Trial balance out of balance; balance sheet may be unreliable"),
  }
}

export interface ApAgingRow {
  supplier_id: string
  supplier_name: string
  balance: number
  current: number
  days_31_60: number
  days_61_90: number
  days_90_plus: number
}

function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const AP_AGING_EPS = 1e-2

type OpenInvoice = { amount: number; invoiceDate: string }

function applyPayableReduction(open: OpenInvoice[], pay: number): void {
  let remaining = pay
  while (remaining > AP_AGING_EPS && open.length > 0) {
    const head = open[0]
    const take = Math.min(head.amount, remaining)
    head.amount -= take
    remaining -= take
    if (head.amount <= AP_AGING_EPS) open.shift()
  }
}

export async function accountsPayableAging(
  supabase: SupabaseClient,
  tenantId: string,
  asOfDate: string,
  scope?: AccountingBranchScope
): Promise<{ data: ApAgingRow[]; error: Error | null }> {
  const branchId = scope?.branchId ?? null
  const { data: suppliers, error: sErr } = await supabase
    .from("suppliers")
    .select("id, name")
    .eq("tenant_id", tenantId)

  if (sErr) return { data: [], error: new Error(sErr.message) }
  const supplierList = suppliers || []
  const out: ApAgingRow[] = []

  for (const s of supplierList) {
    const supplierId = s.id as string
    let ledgerQuery = supabase
      .from("supplier_ledger_entries")
      .select("entry_date, entry_type, amount, balance_after")
      .eq("tenant_id", tenantId)
      .eq("supplier_id", supplierId)
      .lte("entry_date", asOfDate)

    if (branchId) {
      ledgerQuery = ledgerQuery.eq("branch_id", branchId)
    }

    const { data: entries, error: eErr } = await ledgerQuery
      .order("entry_date", { ascending: true })
      .order("created_at", { ascending: true })

    if (eErr) return { data: [], error: new Error(eErr.message) }
    const rows = entries || []
    if (rows.length === 0) continue

    const balance = Number((rows[rows.length - 1] as { balance_after: string | number }).balance_after ?? 0)
    if (balance <= AP_AGING_EPS) continue

    const open: OpenInvoice[] = []
    for (const raw of rows) {
      const e = raw as { entry_date: string; entry_type: string; amount: string | number }
      const entryDate = e.entry_date.slice(0, 10)
      const signed = Number(e.amount)

      if (e.entry_type === "invoice") {
        if (signed > AP_AGING_EPS) open.push({ amount: signed, invoiceDate: entryDate })
        else if (signed < -AP_AGING_EPS) applyPayableReduction(open, Math.abs(signed))
      } else if (e.entry_type === "payment" || e.entry_type === "credit_note") {
        const pay = Math.abs(signed)
        if (pay > AP_AGING_EPS) applyPayableReduction(open, pay)
      } else if (e.entry_type === "adjustment") {
        if (signed > AP_AGING_EPS) open.push({ amount: signed, invoiceDate: entryDate })
        else if (signed < -AP_AGING_EPS) applyPayableReduction(open, Math.abs(signed))
      }
    }

    let current = 0
    let d31 = 0
    let d61 = 0
    let d90 = 0
    const asOf = asOfDate.slice(0, 10)

    for (const inv of open) {
      if (inv.amount <= AP_AGING_EPS) continue
      const d0 = addDaysYmd(inv.invoiceDate, 30)
      const d1 = addDaysYmd(inv.invoiceDate, 60)
      const d2 = addDaysYmd(inv.invoiceDate, 90)
      if (asOf <= d0) current += inv.amount
      else if (asOf <= d1) d31 += inv.amount
      else if (asOf <= d2) d61 += inv.amount
      else d90 += inv.amount
    }

    let bucketSum = current + d31 + d61 + d90
    if (bucketSum <= AP_AGING_EPS && balance > AP_AGING_EPS) {
      current = balance
    } else if (bucketSum > AP_AGING_EPS) {
      const remainder = balance - bucketSum
      if (remainder > AP_AGING_EPS) {
        current += remainder
      } else if (remainder < -AP_AGING_EPS) {
        const factor = balance / bucketSum
        current *= factor
        d31 *= factor
        d61 *= factor
        d90 *= factor
      }
    }

    out.push({
      supplier_id: supplierId,
      supplier_name: String(s.name),
      balance,
      current,
      days_31_60: d31,
      days_61_90: d61,
      days_90_plus: d90,
    })
  }

  out.sort((a, b) => b.balance - a.balance)
  return { data: out, error: null }
}

export interface ArAgingRow {
  customer_id: string | null
  customer_name: string
  balance: number
  current: number
  days_31_60: number
  days_61_90: number
  days_90_plus: number
}

/** Open credit receivables from customer sub-ledger when present, else sales minus refunds. */
export async function accountsReceivableAging(
  supabase: SupabaseClient,
  tenantId: string,
  asOfDate: string,
  scope?: AccountingBranchScope
): Promise<{ data: ArAgingRow[]; error: Error | null }> {
  const asOf = asOfDate.slice(0, 10)
  const branchId = scope?.branchId ?? null

  let ledgerProbe = supabase
    .from("customer_ledger_entries")
    .select("id")
    .eq("tenant_id", tenantId)
    .limit(1)
  if (branchId) ledgerProbe = ledgerProbe.eq("branch_id", branchId)
  const { data: ledgerSample } = await ledgerProbe

  if (ledgerSample && ledgerSample.length > 0) {
    const ledgerResult = await accountsReceivableAgingFromLedger(supabase, tenantId, asOf, scope)
    if (ledgerResult.data.length > 0 || !ledgerResult.error) return ledgerResult
  }

  let salesQuery = supabase
    .from("sales")
    .select(
      `
      id,
      sale_date,
      total_amount,
      customer_id,
      customers ( id, first_name, last_name )
    `
    )
    .eq("tenant_id", tenantId)
    .eq("payment_method", "credit")
    // Open receivables are credit sales that are not yet paid/settled.
    .eq("payment_status", "pending")
    .lte("sale_date", asOf)

  if (branchId) {
    salesQuery = salesQuery.eq("branch_id", branchId)
  }

  const { data: salesRaw, error: sErr } = await salesQuery.order("sale_date", { ascending: true })

  if (sErr) return { data: [], error: new Error(sErr.message) }

  const creditSaleIds = (salesRaw || []).map((r) => (r as { id: string }).id)
  let refundsRaw: unknown[] = []
  if (creditSaleIds.length > 0) {
    const { data, error: rErr } = await supabase
      .from("sales_refunds")
      .select("original_sale_id, net_refund_amount, refund_date, refund_status")
      .eq("refund_status", "approved")
      .lte("refund_date", asOf)
      .in("original_sale_id", creditSaleIds)

    if (rErr) return { data: [], error: new Error(rErr.message) }
    refundsRaw = data || []
  }

  type OpenInvoice = {
    saleId: string
    amount: number
    invoiceDate: string
    customerId: string | null
    customerName: string
  }
  const openByCustomer = new Map<string, OpenInvoice[]>()

  const customerKey = (id: string | null) => id ?? "__walk_in__"

  for (const raw of salesRaw || []) {
    const row = raw as {
      id: string
      sale_date: string
      total_amount: string | number
      customer_id: string | null
      customers: { first_name?: string; last_name?: string } | null
    }
    const amt = Number(row.total_amount ?? 0)
    if (amt <= AP_AGING_EPS) continue
    const c = row.customers
    const customerName = c
      ? `${c.first_name || ""} ${c.last_name || ""}`.trim() || "Customer"
      : "Walk-in / no customer"
    const key = customerKey(row.customer_id)
    const list = openByCustomer.get(key) || []
    list.push({
      saleId: row.id,
      amount: amt,
      invoiceDate: String(row.sale_date).slice(0, 10),
      customerId: row.customer_id,
      customerName,
    })
    openByCustomer.set(key, list)
  }

  const saleToCustomer = new Map<string, string>()
  for (const raw of salesRaw || []) {
    const row = raw as { id: string; customer_id: string | null }
    saleToCustomer.set(row.id, customerKey(row.customer_id))
  }

  for (const raw of refundsRaw || []) {
    const rf = raw as {
      original_sale_id: string | null
      net_refund_amount: string | number
    }
    if (!rf.original_sale_id) continue
    const key = saleToCustomer.get(rf.original_sale_id)
    if (!key) continue
    let pay = Number(rf.net_refund_amount ?? 0)
    const invoices = openByCustomer.get(key)
    if (!invoices || pay <= AP_AGING_EPS) continue
    const match = invoices.find((inv) => inv.saleId === rf.original_sale_id)
    if (match) {
      const take = Math.min(match.amount, pay)
      match.amount -= take
      pay -= take
    }
    if (pay > AP_AGING_EPS) applyPayableReduction(invoices, pay)
    while (invoices.length > 0 && invoices[0].amount <= AP_AGING_EPS) invoices.shift()
  }

  const out: ArAgingRow[] = []

  for (const [, invoices] of openByCustomer) {
    if (invoices.length === 0) continue
    const customerId = invoices[0].customerId
    const customerName = invoices[0].customerName

    let current = 0
    let d31 = 0
    let d61 = 0
    let d90 = 0
    let balance = 0

    for (const inv of invoices) {
      if (inv.amount <= AP_AGING_EPS) continue
      balance += inv.amount
      const d0 = addDaysYmd(inv.invoiceDate, 30)
      const d1 = addDaysYmd(inv.invoiceDate, 60)
      const d2 = addDaysYmd(inv.invoiceDate, 90)
      if (asOf <= d0) current += inv.amount
      else if (asOf <= d1) d31 += inv.amount
      else if (asOf <= d2) d61 += inv.amount
      else d90 += inv.amount
    }

    if (balance <= AP_AGING_EPS) continue

    out.push({
      customer_id: customerId,
      customer_name: customerName,
      balance,
      current,
      days_31_60: d31,
      days_61_90: d61,
      days_90_plus: d90,
    })
  }

  out.sort((a, b) => b.balance - a.balance)
  return { data: out, error: null }
}

/** AR aging from customer_ledger_entries (preferred when sub-ledger is in use). */
async function accountsReceivableAgingFromLedger(
  supabase: SupabaseClient,
  tenantId: string,
  asOf: string,
  scope?: AccountingBranchScope
): Promise<{ data: ArAgingRow[]; error: Error | null }> {
  const branchId = scope?.branchId ?? null

  let custQuery = supabase
    .from("customers")
    .select("id, first_name, last_name")
    .eq("tenant_id", tenantId)

  const { data: customers, error: cErr } = await custQuery
  if (cErr) return { data: [], error: new Error(cErr.message) }

  const out: ArAgingRow[] = []

  for (const c of customers || []) {
    const customerId = (c as { id: string }).id
    const customerName =
      `${(c as { first_name?: string }).first_name || ""} ${(c as { last_name?: string }).last_name || ""}`.trim() ||
      "Customer"

    let entriesQuery = supabase
      .from("customer_ledger_entries")
      .select("entry_date, entry_type, amount")
      .eq("tenant_id", tenantId)
      .eq("customer_id", customerId)
      .lte("entry_date", asOf)
      .order("entry_date", { ascending: true })
      .order("created_at", { ascending: true })

    if (branchId) entriesQuery = entriesQuery.eq("branch_id", branchId)

    const { data: entries, error: eErr } = await entriesQuery
    if (eErr) return { data: [], error: new Error(eErr.message) }
    if (!entries?.length) continue

    type OpenInv = { amount: number; invoiceDate: string }
    const open: OpenInv[] = []
    let balance = 0

    for (const raw of entries) {
      const e = raw as { entry_date: string; entry_type: string; amount: string | number }
      const entryDate = e.entry_date.slice(0, 10)
      const signed = Number(e.amount)
      balance += signed

      if (e.entry_type === "invoice" && signed > AP_AGING_EPS) {
        open.push({ amount: signed, invoiceDate: entryDate })
      } else if (
        (e.entry_type === "payment" || e.entry_type === "credit_note") &&
        signed < -AP_AGING_EPS
      ) {
        applyPayableReduction(open, Math.abs(signed))
      } else if (e.entry_type === "adjustment") {
        if (signed > AP_AGING_EPS) open.push({ amount: signed, invoiceDate: entryDate })
        else if (signed < -AP_AGING_EPS) applyPayableReduction(open, Math.abs(signed))
      }
    }

    if (balance <= AP_AGING_EPS) continue

    let current = 0
    let d31 = 0
    let d61 = 0
    let d90 = 0

    for (const inv of open) {
      if (inv.amount <= AP_AGING_EPS) continue
      const d0 = addDaysYmd(inv.invoiceDate, 30)
      const d1 = addDaysYmd(inv.invoiceDate, 60)
      const d2 = addDaysYmd(inv.invoiceDate, 90)
      if (asOf <= d0) current += inv.amount
      else if (asOf <= d1) d31 += inv.amount
      else if (asOf <= d2) d61 += inv.amount
      else d90 += inv.amount
    }

    let bucketSum = current + d31 + d61 + d90
    if (bucketSum <= AP_AGING_EPS && balance > AP_AGING_EPS) {
      current = balance
    } else if (bucketSum > AP_AGING_EPS && Math.abs(balance - bucketSum) > AP_AGING_EPS) {
      const factor = balance / bucketSum
      current *= factor
      d31 *= factor
      d61 *= factor
      d90 *= factor
    }

    out.push({
      customer_id: customerId,
      customer_name: customerName,
      balance: Number(balance.toFixed(2)),
      current,
      days_31_60: d31,
      days_61_90: d61,
      days_90_plus: d90,
    })
  }

  out.sort((a, b) => b.balance - a.balance)
  return { data: out, error: null }
}

export interface VatReturnResult {
  period_from: string
  period_to: string
  output_vat_gl: number
  input_vat_gl: number
  net_vat_payable: number
  output_vat_operational: number
  input_vat_operational: number
  gl_vs_operational_output_diff: number
  gl_vs_operational_input_diff: number
  trial_balance_ok: boolean
}

async function resolveAccountIdsForVat(
  supabase: SupabaseClient,
  tenantId: string
): Promise<{ outputId: string | null; inputId: string | null; error: Error | null }> {
  const keys = ["output_vat", "input_vat"] as const
  const { data: maps, error: mErr } = await supabase
    .from("accounting_account_map")
    .select("map_key, account_id")
    .eq("tenant_id", tenantId)
    .in("map_key", keys)

  if (mErr) return { outputId: null, inputId: null, error: new Error(mErr.message) }

  let outputId: string | null = null
  let inputId: string | null = null
  for (const row of maps || []) {
    const r = row as { map_key: string; account_id: string }
    if (r.map_key === "output_vat") outputId = r.account_id
    if (r.map_key === "input_vat") inputId = r.account_id
  }

  const fallbacks: Array<{ code: string; key: "output" | "input" }> = [
    { code: "2000", key: "output" },
    { code: "1150", key: "input" },
  ]
  for (const fb of fallbacks) {
    const { data: acct } = await supabase
      .from("accounting_accounts")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("code", fb.code)
      .maybeSingle()
    if (!acct?.id) continue
    if (fb.key === "output" && !outputId) outputId = acct.id as string
    if (fb.key === "input" && !inputId) inputId = acct.id as string
  }

  return { outputId, inputId, error: null }
}

/** VAT summary for a period: GL output/input VAT accounts vs operational tax columns. */
export async function vatReturnReport(
  supabase: SupabaseClient,
  tenantId: string,
  dateFrom: string,
  dateTo: string,
  scope?: AccountingBranchScope
): Promise<{ data: VatReturnResult | null; error: Error | null }> {
  const from = dateFrom.slice(0, 10)
  const to = dateTo.slice(0, 10)
  const branchId = scope?.branchId ?? null

  const { outputId, inputId, error: resolveErr } = await resolveAccountIdsForVat(supabase, tenantId)
  if (resolveErr) return { data: null, error: resolveErr }

  const { data: tb, debits_equal_credits, error: tbErr } = await trialBalanceReport(
    supabase,
    tenantId,
    from,
    to,
    scope
  )
  if (tbErr) return { data: null, error: tbErr }

  const outputRow = outputId ? tb.find((r) => r.account_id === outputId) : tb.find((r) => r.code === "2000")
  const inputRow = inputId ? tb.find((r) => r.account_id === inputId) : tb.find((r) => r.code === "1150")

  const output_vat_gl = outputRow ? outputRow.credit_total - outputRow.debit_total : 0
  const input_vat_gl = inputRow ? inputRow.debit_total - inputRow.credit_total : 0
  const net_vat_payable = Number((output_vat_gl - input_vat_gl).toFixed(2))

  let salesQuery = supabase
    .from("sales")
    .select("tax_amount")
    .eq("tenant_id", tenantId)
    .gte("sale_date", from)
    .lte("sale_date", to)
    .in("payment_status", ["paid", "completed", "pending"])

  if (branchId) salesQuery = salesQuery.eq("branch_id", branchId)

  const { data: salesTax, error: stErr } = await salesQuery

  if (stErr) return { data: null, error: new Error(stErr.message) }

  let output_vat_operational = 0
  for (const s of salesTax || []) {
    output_vat_operational += Number((s as { tax_amount: string | number }).tax_amount ?? 0)
  }
  output_vat_operational = Number(output_vat_operational.toFixed(2))

  let grQuery = supabase
    .from("goods_receipts")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("status", "received")
    .gte("receipt_date", from)
    .lte("receipt_date", to)

  if (branchId) grQuery = grQuery.eq("branch_id", branchId)

  const { data: grRows, error: grErr } = await grQuery

  if (grErr) return { data: null, error: new Error(grErr.message) }

  const grIds = (grRows || []).map((r) => (r as { id: string }).id)
  let input_vat_operational = 0
  if (grIds.length > 0) {
    const { data: items, error: iErr } = await supabase
      .from("goods_receipt_items")
      .select("vat_amount")
      .in("goods_receipt_id", grIds)

    if (iErr) return { data: null, error: new Error(iErr.message) }
    for (const it of items || []) {
      input_vat_operational += Number((it as { vat_amount?: string | number }).vat_amount ?? 0)
    }
  }
  input_vat_operational = Number(input_vat_operational.toFixed(2))

  return {
    data: {
      period_from: from,
      period_to: to,
      output_vat_gl: Number(output_vat_gl.toFixed(2)),
      input_vat_gl: Number(input_vat_gl.toFixed(2)),
      net_vat_payable,
      output_vat_operational,
      input_vat_operational,
      gl_vs_operational_output_diff: Number((output_vat_gl - output_vat_operational).toFixed(2)),
      gl_vs_operational_input_diff: Number((input_vat_gl - input_vat_operational).toFixed(2)),
      trial_balance_ok: debits_equal_credits,
    },
    error: null,
  }
}

export interface ArGlReconciliationResult {
  as_of: string
  subledger_ar_total: number
  gl_ar_total: number
  difference: number
  trial_balance_ok: boolean
}

/** Credit-sale sub-ledger total vs GL accounts receivable (1100 / map). */
export async function arSubledgerVsGlReconciliation(
  supabase: SupabaseClient,
  tenantId: string,
  asOfDate: string,
  scope?: AccountingBranchScope
): Promise<{ data: ArGlReconciliationResult | null; error: Error | null }> {
  const asOf = asOfDate.slice(0, 10)
  const historicFrom = "2000-01-01"

  const { data: aging, error: aErr } = await accountsReceivableAging(supabase, tenantId, asOf, scope)
  if (aErr) return { data: null, error: aErr }
  const subledger_ar_total = Number(
    aging.reduce((sum, r) => sum + r.balance, 0).toFixed(2)
  )

  const { data: maps } = await supabase
    .from("accounting_account_map")
    .select("account_id")
    .eq("tenant_id", tenantId)
    .eq("map_key", "accounts_receivable")

  let arAccountId: string | null = (maps?.[0] as { account_id?: string } | undefined)?.account_id ?? null
  if (!arAccountId) {
    const { data: acct } = await supabase
      .from("accounting_accounts")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("code", "1100")
      .maybeSingle()
    arAccountId = (acct?.id as string) ?? null
  }

  const { data: tb, debits_equal_credits, error: tbErr } = await trialBalanceReport(
    supabase,
    tenantId,
    historicFrom,
    asOf,
    scope
  )
  if (tbErr) return { data: null, error: tbErr }

  const arRow = arAccountId
    ? tb.find((r) => r.account_id === arAccountId)
    : tb.find((r) => r.code === "1100")
  const gl_ar_total = arRow ? arRow.debit_total - arRow.credit_total : 0

  return {
    data: {
      as_of: asOf,
      subledger_ar_total,
      gl_ar_total: Number(gl_ar_total.toFixed(2)),
      difference: Number((subledger_ar_total - gl_ar_total).toFixed(2)),
      trial_balance_ok: debits_equal_credits,
    },
    error: null,
  }
}

export interface ApGlReconciliationResult {
  as_of: string
  subledger_ap_total: number
  gl_ap_total: number
  difference: number
  gl_ap_breakdown: Array<{ account_id: string; code: string; name: string; balance: number }>
  trial_balance_ok: boolean
}

/** Sum of supplier sub-ledger ending balances vs GL trade payables (2100 + per-supplier AP heads). */
export async function apSubledgerVsGlReconciliation(
  supabase: SupabaseClient,
  tenantId: string,
  asOfDate: string,
  scope?: AccountingBranchScope
): Promise<{ data: ApGlReconciliationResult | null; error: Error | null }> {
  const historicFrom = "2000-01-01"
  const asOf = asOfDate.slice(0, 10)
  const branchId = scope?.branchId ?? null

  let subledger_ap_total = 0
  if (branchId) {
    const { data: suppliers, error: sErr } = await supabase
      .from("suppliers")
      .select("id")
      .eq("tenant_id", tenantId)
    if (sErr) return { data: null, error: new Error(sErr.message) }
    for (const s of suppliers || []) {
      let q = supabase
        .from("supplier_ledger_entries")
        .select("balance_after")
        .eq("tenant_id", tenantId)
        .eq("supplier_id", (s as { id: string }).id)
        .lte("entry_date", asOf)
        .eq("branch_id", branchId)
        .order("entry_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
      const { data: row } = await q.maybeSingle()
      if (row?.balance_after != null) subledger_ap_total += Number(row.balance_after)
    }
    subledger_ap_total = Number(subledger_ap_total.toFixed(2))
  } else {
    const { data: subRaw, error: subErr } = await supabase.rpc("supplier_ap_subledger_balance_total", {
      p_tenant_id: tenantId,
      p_as_of: asOf,
    })
    if (subErr) return { data: null, error: new Error(subErr.message) }
    subledger_ap_total = Number(subRaw ?? 0)
  }

  const { data: supplierRows, error: sErr } = await supabase
    .from("suppliers")
    .select("accounting_payable_account_id")
    .eq("tenant_id", tenantId)

  if (sErr) return { data: null, error: new Error(sErr.message) }

  const apAccountIds = new Set<string>()
  for (const row of supplierRows || []) {
    const id = row.accounting_payable_account_id as string | null
    if (id) apAccountIds.add(id)
  }

  const { data: acct2100, error: aErr } = await supabase
    .from("accounting_accounts")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("code", "2100")
    .maybeSingle()

  if (aErr) return { data: null, error: new Error(aErr.message) }
  if (acct2100?.id) apAccountIds.add(acct2100.id as string)

  const { data: tb, debits_equal_credits, error: tbErr } = await trialBalanceReport(
    supabase,
    tenantId,
    historicFrom,
    asOf,
    scope
  )
  if (tbErr) return { data: null, error: tbErr }

  const gl_ap_breakdown: ApGlReconciliationResult["gl_ap_breakdown"] = []
  let gl_ap_total = 0
  for (const r of tb) {
    if (!apAccountIds.has(r.account_id)) continue
    const obligation = r.credit_total - r.debit_total
    gl_ap_total += obligation
    gl_ap_breakdown.push({
      account_id: r.account_id,
      code: r.code,
      name: r.name,
      balance: obligation,
    })
  }

  gl_ap_breakdown.sort((a, b) => a.code.localeCompare(b.code))

  const difference = Number((subledger_ap_total - gl_ap_total).toFixed(2))
  return {
    data: {
      as_of: asOf,
      subledger_ap_total,
      gl_ap_total,
      difference,
      gl_ap_breakdown,
      trial_balance_ok: debits_equal_credits,
    },
    error: null,
  }
}

export interface InventoryGlReconciliationResult {
  as_of: string
  stock_valuation: number
  gl_inventory_balance: number
  difference: number
  trial_balance_ok: boolean
}

/** Operational stock at cost vs GL merchandise inventory (5000), cumulative to as-of. */
export async function inventoryStockVsGlReconciliation(
  supabase: SupabaseClient,
  tenantId: string,
  asOfDate: string,
  scope?: AccountingBranchScope
): Promise<{ data: InventoryGlReconciliationResult | null; error: Error | null }> {
  const historicFrom = "2000-01-01"
  const asOf = asOfDate.slice(0, 10)

  const { data: meds, error: mErr } = await supabase
    .from("medicines")
    .select("stock_quantity, cost_price")
    .eq("tenant_id", tenantId)

  if (mErr) return { data: null, error: new Error(mErr.message) }

  let stock_valuation = 0
  for (const m of meds || []) {
    const row = m as { stock_quantity: number | null; cost_price: string | number | null }
    const q = Number(row.stock_quantity ?? 0)
    const c = Number(row.cost_price ?? 0)
    if (q > 0 && c > 0) stock_valuation += q * c
  }
  stock_valuation = Number(stock_valuation.toFixed(2))

  const { data: tb, debits_equal_credits, error: tbErr } = await trialBalanceReport(
    supabase,
    tenantId,
    historicFrom,
    asOf,
    scope
  )
  if (tbErr) return { data: null, error: tbErr }

  const inv = tb.find((r) => r.code === "5000")
  const gl_inventory_balance = inv ? inv.debit_total - inv.credit_total : 0
  const difference = Number((stock_valuation - gl_inventory_balance).toFixed(2))

  return {
    data: {
      as_of: asOf,
      stock_valuation,
      gl_inventory_balance,
      difference,
      trial_balance_ok: debits_equal_credits,
    },
    error: null,
  }
}

export async function createAccountHead(
  supabase: SupabaseClient,
  tenantId: string,
  input: CreateAccountingAccountInput
): Promise<{ data: AccountingAccountRow | null; error: Error | null }> {
  const code = input.code.trim()
  const name = input.name.trim()
  if (!code || !name) {
    return { data: null, error: new Error("Code and name are required") }
  }

  const { data, error } = await supabase
    .from("accounting_accounts")
    .insert({
      tenant_id: tenantId,
      code,
      name,
      account_type: input.account_type,
      is_system: false,
      is_active: true,
    })
    .select("id, tenant_id, code, name, account_type, is_system, is_active")
    .single()

  if (error) return { data: null, error: new Error(error.message) }
  return { data: data as AccountingAccountRow, error: null }
}

export interface VoucherListFilters {
  dateFrom?: string | null
  dateTo?: string | null
  status?: string | null
  voucherType?: string | null
  branchId?: string | null
  limit?: number
  offset?: number
}

export async function listVouchers(
  supabase: SupabaseClient,
  tenantId: string,
  filters: VoucherListFilters
): Promise<{ data: unknown[]; count: number; error: Error | null }> {
  const limit = Math.min(100, Math.max(1, filters.limit ?? 50))
  const offset = Math.max(0, filters.offset ?? 0)

  let q = supabase
    .from("accounting_vouchers")
    .select("*", { count: "exact" })
    .eq("tenant_id", tenantId)
    .order("voucher_date", { ascending: false })
    .order("voucher_no", { ascending: false })

  if (filters.dateFrom) q = q.gte("voucher_date", filters.dateFrom)
  if (filters.dateTo) q = q.lte("voucher_date", filters.dateTo)
  if (filters.status) q = q.eq("status", filters.status)
  if (filters.voucherType) q = q.eq("voucher_type", filters.voucherType)
  if (filters.branchId) q = q.eq("branch_id", filters.branchId)

  q = q.range(offset, offset + limit - 1)

  const { data, error, count } = await q
  if (error) return { data: [], count: 0, error: new Error(error.message) }
  const vouchers = data || []
  const voucherIds = vouchers.map((v) => (v as { id: string }).id)
  if (voucherIds.length === 0) {
    return { data: [], count: count ?? 0, error: null }
  }

  const { data: lineAggRows, error: lineAggError } = await supabase
    .from("accounting_voucher_lines")
    .select("voucher_id, debit_amount, credit_amount")
    .in("voucher_id", voucherIds)
    .eq("tenant_id", tenantId)

  if (lineAggError) return { data: [], count: 0, error: new Error(lineAggError.message) }

  const totalsByVoucher = new Map<string, { total_debit: number; total_credit: number; line_count: number }>()
  for (const raw of lineAggRows || []) {
    const row = raw as { voucher_id: string; debit_amount: string | number; credit_amount: string | number }
    const prev = totalsByVoucher.get(row.voucher_id) || { total_debit: 0, total_credit: 0, line_count: 0 }
    prev.total_debit += Number(row.debit_amount || 0)
    prev.total_credit += Number(row.credit_amount || 0)
    prev.line_count += 1
    totalsByVoucher.set(row.voucher_id, prev)
  }

  const enriched = vouchers.map((v) => {
    const voucher = v as { id: string }
    const totals = totalsByVoucher.get(voucher.id) || { total_debit: 0, total_credit: 0, line_count: 0 }
    return { ...v, ...totals }
  })
  return { data: enriched, count: count ?? 0, error: null }
}

export async function getVoucherWithLines(
  supabase: SupabaseClient,
  tenantId: string,
  voucherId: string
): Promise<{ data: { voucher: unknown; lines: unknown[] } | null; error: Error | null }> {
  const { data: voucher, error: vErr } = await supabase
    .from("accounting_vouchers")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("id", voucherId)
    .single()

  if (vErr || !voucher) {
    return { data: null, error: vErr ? new Error(vErr.message) : new Error("Not found") }
  }

  const { data: lines, error: lErr } = await supabase
    .from("accounting_voucher_lines")
    .select(
      `
      id,
      line_no,
      account_id,
      description,
      debit_amount,
      credit_amount,
      accounting_accounts ( code, name )
    `
    )
    .eq("voucher_id", voucherId)
    .order("line_no")

  if (lErr) return { data: null, error: new Error(lErr.message) }
  return { data: { voucher, lines: lines || [] }, error: null }
}

export async function createManualDraftVoucher(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string,
  raw: unknown
): Promise<{ data: { id: string; voucher_no: string } | null; error: Error | null }> {
  const input: CreateManualVoucherInput = createManualVoucherSchema.parse(raw)
  assertBalancedLines(input.lines)

  const { lockDate, error: lockErr } = await getPostingLockDate(supabase, tenantId)
  if (lockErr) return { data: null, error: lockErr }
  try {
    assertVoucherDateOpen(lockDate, input.voucher_date)
  } catch (e) {
    return { data: null, error: e instanceof Error ? e : new Error("Posting not allowed") }
  }

  const { data: vno, error: rpcErr } = await supabase.rpc("accounting_next_voucher_no", {
    p_tenant_id: tenantId,
  })

  if (rpcErr || vno == null || typeof vno !== "string") {
    return { data: null, error: new Error(rpcErr?.message || "Failed to allocate voucher number") }
  }

  let branchId: string | null = null
  const { data: userRow } = await supabase
    .from("users")
    .select("current_branch_id")
    .eq("id", userId)
    .maybeSingle()
  branchId = (userRow?.current_branch_id as string | null) ?? null

  const { data: voucher, error: insErr } = await supabase
    .from("accounting_vouchers")
    .insert({
      tenant_id: tenantId,
      branch_id: branchId,
      voucher_no: vno,
      voucher_date: input.voucher_date,
      voucher_type: "journal",
      source: "manual",
      reference_type: "manual_journal",
      status: "draft",
      narration: input.narration ?? null,
      created_by: userId,
    })
    .select("id, voucher_no")
    .single()

  if (insErr || !voucher) {
    return { data: null, error: new Error(insErr?.message || "Insert failed") }
  }

  const vid = voucher.id as string
  const rows = input.lines.map((l, i) => ({
    tenant_id: tenantId,
    branch_id: branchId,
    voucher_id: vid,
    line_no: i + 1,
    account_id: l.account_id,
    description: l.description ?? null,
    debit_amount: l.debit_amount,
    credit_amount: l.credit_amount,
  }))

  const { error: lineErr } = await supabase.from("accounting_voucher_lines").insert(rows)
  if (lineErr) {
    await supabase.from("accounting_vouchers").delete().eq("id", vid)
    return { data: null, error: new Error(lineErr.message) }
  }

  return { data: { id: vid, voucher_no: voucher.voucher_no as string }, error: null }
}

export async function postVoucher(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string,
  voucherId: string
): Promise<{ error: Error | null }> {
  const { data: voucher, error: vErr } = await supabase
    .from("accounting_vouchers")
    .select("id, status, voucher_date")
    .eq("tenant_id", tenantId)
    .eq("id", voucherId)
    .single()

  if (vErr || !voucher) return { error: new Error(vErr?.message || "Voucher not found") }
  if (voucher.status !== "draft") {
    return { error: new Error("Only draft vouchers can be posted") }
  }

  const { lockDate, error: lockErr } = await getPostingLockDate(supabase, tenantId)
  if (lockErr) return { error: lockErr }
  try {
    assertVoucherDateOpen(lockDate, String(voucher.voucher_date))
  } catch (e) {
    return { error: e instanceof Error ? e : new Error("Posting not allowed") }
  }

  const { data: lines, error: lErr } = await supabase
    .from("accounting_voucher_lines")
    .select("debit_amount, credit_amount")
    .eq("voucher_id", voucherId)

  if (lErr || !lines?.length) return { error: new Error(lErr?.message || "No lines") }
  assertBalancedLines(lines as { debit_amount: number; credit_amount: number }[])

  // Compare-and-swap on status=draft — closes the race where two concurrent
  // "post" requests both pass the check above before either writes.
  const { data: updated, error: uErr } = await supabase
    .from("accounting_vouchers")
    .update({
      status: "posted",
      posted_at: new Date().toISOString(),
      posted_by: userId,
    })
    .eq("id", voucherId)
    .eq("tenant_id", tenantId)
    .eq("status", "draft")
    .select("id")

  if (uErr) return { error: new Error(uErr.message) }
  if (!updated || updated.length === 0) {
    return { error: new Error("Voucher was already posted or voided by another request") }
  }
  return { error: null }
}

/**
 * Posts a system voucher (Dr inventory shrinkage, Cr inventory) for a manual
 * stock decrease on a medicine — breakage/theft/expiry write-off/count
 * correction/other. Without this, updateMedicineWithInventory's decrease path
 * only wrote an inventory_transactions row: physical stock dropped but the GL
 * inventory asset never did, so the balance sheet silently overstated inventory
 * after every such adjustment. Mirrors the accounting_post_purchase_voucher
 * pattern (resolve-or-skip accounts, idempotent-by-reference) but posted
 * directly since this is a system entry, not a user draft.
 */
export async function postInventoryAdjustmentVoucher(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string,
  input: {
    medicineId: string
    voucherDate: string
    quantity: number
    unitCost: number
    reasonCode: string
  }
): Promise<{ error: Error | null }> {
  const value = Number((Math.abs(input.quantity) * input.unitCost).toFixed(2))
  if (!(value > 0)) return { error: null }

  const [{ data: invAcct }, { data: shrinkAcct }] = await Promise.all([
    supabase.rpc("accounting_resolve_account", { p_tenant_id: tenantId, p_map_key: "inventory", p_fallback_code: "5000" }),
    supabase.rpc("accounting_resolve_account", {
      p_tenant_id: tenantId,
      p_map_key: "inventory_shrinkage",
      p_fallback_code: "6200",
    }),
  ])
  if (!invAcct || !shrinkAcct) return { error: null }

  const { lockDate, error: lockErr } = await getPostingLockDate(supabase, tenantId)
  if (lockErr) return { error: null }
  try {
    assertVoucherDateOpen(lockDate, input.voucherDate)
  } catch {
    return { error: null }
  }

  const { data: vno, error: rpcErr } = await supabase.rpc("accounting_next_voucher_no", { p_tenant_id: tenantId })
  if (rpcErr || vno == null || typeof vno !== "string") return { error: null }

  let branchId: string | null = null
  const { data: userRow } = await supabase.from("users").select("current_branch_id").eq("id", userId).maybeSingle()
  branchId = (userRow?.current_branch_id as string | null) ?? null

  const { data: voucher, error: insErr } = await supabase
    .from("accounting_vouchers")
    .insert({
      tenant_id: tenantId,
      branch_id: branchId,
      voucher_no: vno,
      voucher_date: input.voucherDate,
      voucher_type: "system_adjustment",
      source: "system",
      reference_type: "inventory_adjustment",
      status: "posted",
      narration: `Auto: stock adjustment (${input.reasonCode}) — medicine ${input.medicineId}`,
      created_by: userId,
      posted_at: new Date().toISOString(),
      posted_by: userId,
    })
    .select("id")
    .single()

  if (insErr || !voucher) return { error: null }

  const { error: lineErr } = await supabase.from("accounting_voucher_lines").insert([
    {
      tenant_id: tenantId,
      branch_id: branchId,
      voucher_id: voucher.id,
      line_no: 1,
      account_id: shrinkAcct,
      description: `Inventory shrinkage (${input.reasonCode})`,
      debit_amount: value,
      credit_amount: 0,
    },
    {
      tenant_id: tenantId,
      branch_id: branchId,
      voucher_id: voucher.id,
      line_no: 2,
      account_id: invAcct,
      description: "Inventory relief",
      debit_amount: 0,
      credit_amount: value,
    },
  ])

  if (lineErr) {
    await supabase.from("accounting_vouchers").delete().eq("id", voucher.id)
    return { error: new Error(lineErr.message) }
  }

  return { error: null }
}

export async function voidVoucher(
  supabase: SupabaseClient,
  tenantId: string,
  voucherId: string
): Promise<{ error: Error | null }> {
  const { data: voucher, error: vErr } = await supabase
    .from("accounting_vouchers")
    .select("id, status, source")
    .eq("tenant_id", tenantId)
    .eq("id", voucherId)
    .single()

  if (vErr || !voucher) return { error: new Error(vErr?.message || "Not found") }
  if (voucher.source === "system") {
    return { error: new Error("System vouchers cannot be voided from the UI") }
  }
  if (voucher.status !== "draft") {
    return { error: new Error("Only draft vouchers can be voided") }
  }

  const { data: updated, error } = await supabase
    .from("accounting_vouchers")
    .update({ status: "void" })
    .eq("id", voucherId)
    .eq("tenant_id", tenantId)
    .eq("status", "draft")
    .select("id")

  if (error) return { error: new Error(error.message) }
  if (!updated || updated.length === 0) {
    return { error: new Error("Voucher was already posted or voided by another request") }
  }
  return { error: null }
}

export async function reversePostedVoucher(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string,
  voucherId: string,
  reversalDate?: string | null
): Promise<{ data: { reversal_voucher_id: string } | null; error: Error | null }> {
  const { data: voucher, error: vErr } = await supabase
    .from("accounting_vouchers")
    .select("id, status, tenant_id")
    .eq("id", voucherId)
    .eq("tenant_id", tenantId)
    .single()

  if (vErr || !voucher) return { data: null, error: new Error(vErr?.message || "Voucher not found") }
  if (voucher.status !== "posted") {
    return { data: null, error: new Error("Only posted vouchers can be reversed") }
  }

  const revDate = reversalDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10)
  const { lockDate, error: lockErr } = await getPostingLockDate(supabase, tenantId)
  if (lockErr) return { data: null, error: lockErr }
  try {
    assertVoucherDateOpen(lockDate, revDate)
  } catch (e) {
    return { data: null, error: e instanceof Error ? e : new Error("Posting not allowed") }
  }

  const { data, error } = await supabase.rpc("accounting_reverse_posted_voucher", {
    p_voucher_id: voucherId,
    p_user_id: userId,
    p_reversal_date: revDate,
  })

  if (error) return { data: null, error: new Error(error.message) }
  const reversal_voucher_id = data as string
  if (!reversal_voucher_id) {
    return { data: null, error: new Error("Reversal failed") }
  }
  return { data: { reversal_voucher_id }, error: null }
}

export interface GeneralLedgerRow {
  voucher_date: string
  voucher_no: string
  voucher_id: string
  line_no: number
  description: string | null
  debit_amount: number
  credit_amount: number
  account_code: string
  account_name: string
  running_balance: number
}

export async function generalLedgerReport(
  supabase: SupabaseClient,
  tenantId: string,
  accountId: string,
  dateFrom: string,
  dateTo: string,
  scope?: AccountingBranchScope
): Promise<{ data: GeneralLedgerRow[]; opening_balance: number; error: Error | null }> {
  const branchId = scope?.branchId ?? null
  const { data: openingRaw, error: preErr } = await supabase.rpc("accounting_opening_balance", {
    p_tenant_id: tenantId,
    p_account_id: accountId,
    p_from_date: dateFrom,
    p_branch_id: branchId,
  })

  if (preErr) return { data: [], opening_balance: 0, error: new Error(preErr.message) }
  const opening = Number(openingRaw ?? 0)

  let linesQuery = supabase
    .from("accounting_voucher_lines")
    .select(
      `
      line_no,
      description,
      debit_amount,
      credit_amount,
      account_id,
      voucher_id,
      accounting_accounts ( code, name ),
      accounting_vouchers!inner ( voucher_no, voucher_date, status, branch_id )
    `
    )
    .eq("tenant_id", tenantId)
    .eq("account_id", accountId)
    .eq("accounting_vouchers.status", "posted")
    .gte("accounting_vouchers.voucher_date", dateFrom)
    .lte("accounting_vouchers.voucher_date", dateTo)

  if (branchId) {
    linesQuery = linesQuery.eq("accounting_vouchers.branch_id", branchId)
  }

  const { data: rows, error } = await linesQuery

  if (error) return { data: [], opening_balance: opening, error: new Error(error.message) }

  const pickVoucher = (row: unknown): { voucher_date: string; voucher_no: string } => {
    const r = row as {
      accounting_vouchers:
        | { voucher_date: string; voucher_no: string }
        | { voucher_date: string; voucher_no: string }[]
    }
    const v = r.accounting_vouchers
    return Array.isArray(v) ? v[0] : v
  }

  const sorted = [...(rows || [])].sort((a, b) => {
    const ra = pickVoucher(a)
    const rb = pickVoucher(b)
    const d = ra.voucher_date.localeCompare(rb.voucher_date)
    if (d !== 0) return d
    const n = ra.voucher_no.localeCompare(rb.voucher_no)
    if (n !== 0) return n
    return (a as { line_no: number }).line_no - (b as { line_no: number }).line_no
  })

  let run = opening
  const out: GeneralLedgerRow[] = []
  for (const raw of sorted) {
    const r = raw as {
      line_no: number
      description: string | null
      debit_amount: string
      credit_amount: string
      voucher_id: string
      accounting_accounts: { code: string; name: string } | { code: string; name: string }[] | null
    }
    const v = pickVoucher(raw)
    const acct = r.accounting_accounts
    const acctObj = Array.isArray(acct) ? acct[0] : acct
    const dr = Number(r.debit_amount)
    const cr = Number(r.credit_amount)
    run += dr - cr
    out.push({
      voucher_date: v.voucher_date,
      voucher_no: v.voucher_no,
      voucher_id: r.voucher_id,
      line_no: r.line_no,
      description: r.description,
      debit_amount: Number(dr.toFixed(2)),
      credit_amount: Number(cr.toFixed(2)),
      account_code: acctObj?.code ?? "",
      account_name: acctObj?.name ?? "",
      running_balance: Number(run.toFixed(2)),
    })
  }

  return { data: out, opening_balance: Number(opening.toFixed(2)), error: null }
}

export interface TrialBalanceRow {
  account_id: string
  code: string
  name: string
  account_type: string
  debit_total: number
  credit_total: number
  balance: number
}

export async function trialBalanceReport(
  supabase: SupabaseClient,
  tenantId: string,
  dateFrom: string,
  dateTo: string,
  scope?: AccountingBranchScope
): Promise<{ data: TrialBalanceRow[]; debits_equal_credits: boolean; error: Error | null }> {
  const branchId = scope?.branchId ?? null
  const { data: accounts, error: aErr } = await supabase
    .from("accounting_accounts")
    .select("id, code, name, account_type")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("code")

  if (aErr || !accounts?.length) {
    return { data: [], debits_equal_credits: true, error: aErr ? new Error(aErr.message) : null }
  }

  let tbLinesQuery = supabase
    .from("accounting_voucher_lines")
    .select(
      `
      account_id,
      debit_amount,
      credit_amount,
      accounting_vouchers!inner ( voucher_date, status, branch_id )
    `
    )
    .eq("tenant_id", tenantId)
    .eq("accounting_vouchers.status", "posted")
    .gte("accounting_vouchers.voucher_date", dateFrom)
    .lte("accounting_vouchers.voucher_date", dateTo)

  if (branchId) {
    tbLinesQuery = tbLinesQuery.eq("accounting_vouchers.branch_id", branchId)
  }

  const { data: lines, error: lErr } = await tbLinesQuery

  if (lErr) return { data: [], debits_equal_credits: false, error: new Error(lErr.message) }

  const agg = new Map<string, { dr: number; cr: number }>()
  for (const raw of lines || []) {
    const r = raw as { account_id: string; debit_amount: string; credit_amount: string }
    const cur = agg.get(r.account_id) || { dr: 0, cr: 0 }
    cur.dr += Number(r.debit_amount)
    cur.cr += Number(r.credit_amount)
    agg.set(r.account_id, cur)
  }

  let sumDr = 0
  let sumCr = 0
  const data: TrialBalanceRow[] = accounts.map((a) => {
    const g = agg.get(a.id) || { dr: 0, cr: 0 }
    sumDr += g.dr
    sumCr += g.cr
    return {
      account_id: a.id,
      code: a.code,
      name: a.name,
      account_type: a.account_type,
      debit_total: Number(g.dr.toFixed(2)),
      credit_total: Number(g.cr.toFixed(2)),
      balance: Number((g.dr - g.cr).toFixed(2)),
    }
  })

  const debits_equal_credits = Number(sumDr.toFixed(2)) === Number(sumCr.toFixed(2))
  return { data, debits_equal_credits, error: null }
}

export interface GroupedTrialBalanceRow {
  account_id: string
  code: string
  name: string
  account_type: string
  debit_total: number
  credit_total: number
  balance: number
  is_group: boolean
  children: TrialBalanceRow[]
}

/** Trial balance with AP supplier heads rolled under control 2100 (and parent_account_id when set). */
export async function trialBalanceGroupedReport(
  supabase: SupabaseClient,
  tenantId: string,
  dateFrom: string,
  dateTo: string,
  scope?: AccountingBranchScope
): Promise<{ data: GroupedTrialBalanceRow[]; flat: TrialBalanceRow[]; debits_equal_credits: boolean; error: Error | null }> {
  const { data: flat, debits_equal_credits, error } = await trialBalanceReport(
    supabase,
    tenantId,
    dateFrom,
    dateTo,
    scope
  )
  if (error) return { data: [], flat: [], debits_equal_credits: false, error }

  const { data: acctMeta } = await supabase
    .from("accounting_accounts")
    .select("id, code, parent_account_id")
    .eq("tenant_id", tenantId)

  const parentById = new Map<string, string | null>()
  const codeById = new Map<string, string>()
  for (const a of acctMeta || []) {
    const row = a as { id: string; code: string; parent_account_id: string | null }
    parentById.set(row.id, row.parent_account_id)
    codeById.set(row.id, row.code)
  }

  const control2100 = flat.find((r) => r.code === "2100")
  const rolledChildIds = new Set<string>()
  const apChildren: TrialBalanceRow[] = []

  for (const r of flat) {
    if (r.code === "2100") continue
    const parentId = parentById.get(r.account_id)
    const isApChild =
      parentId === control2100?.account_id ||
      (r.code.startsWith("21") && r.code !== "2100" && r.account_type === "liability")
    if (isApChild) {
      rolledChildIds.add(r.account_id)
      apChildren.push(r)
    }
  }

  const out: GroupedTrialBalanceRow[] = []

  for (const r of flat) {
    if (rolledChildIds.has(r.account_id)) continue

    if (r.code === "2100" && apChildren.length > 0) {
      const childDr = apChildren.reduce((s, c) => s + c.debit_total, 0)
      const childCr = apChildren.reduce((s, c) => s + c.credit_total, 0)
      out.push({
        ...r,
        debit_total: r.debit_total + childDr,
        credit_total: r.credit_total + childCr,
        balance: r.debit_total + childDr - (r.credit_total + childCr),
        is_group: true,
        children: apChildren,
      })
    } else {
      out.push({ ...r, is_group: false, children: [] })
    }
  }

  if (apChildren.length > 0 && !out.some((g) => g.code === "2100")) {
    const childDr = apChildren.reduce((s, c) => s + c.debit_total, 0)
    const childCr = apChildren.reduce((s, c) => s + c.credit_total, 0)
    out.push({
      account_id: control2100?.account_id ?? "2100-group",
      code: "2100",
      name: "Trade payables (rolled up)",
      account_type: "liability",
      debit_total: childDr,
      credit_total: childCr,
      balance: childDr - childCr,
      is_group: true,
      children: apChildren,
    })
  }

  out.sort((a, b) => a.code.localeCompare(b.code))
  return { data: out, flat, debits_equal_credits, error: null }
}

export interface CashMovementLine {
  voucher_date: string
  voucher_no: string
  voucher_id: string
  account_code: string
  account_name: string
  description: string | null
  debit_amount: number
  credit_amount: number
  reference_type: string | null
}

export interface CashMovementReport {
  period_from: string
  period_to: string
  branch_id: string | null
  cash_opening: number
  cash_receipts: number
  cash_payments: number
  cash_closing: number
  bank_opening: number
  bank_receipts: number
  bank_payments: number
  bank_closing: number
  lines: CashMovementLine[]
}

/** Cash (1000) and bank (1010) movement from posted GL for a branch or tenant-wide. */
export async function cashMovementReport(
  supabase: SupabaseClient,
  tenantId: string,
  dateFrom: string,
  dateTo: string,
  scope?: AccountingBranchScope
): Promise<{ data: CashMovementReport | null; error: Error | null }> {
  const branchId = scope?.branchId ?? null
  const from = dateFrom.slice(0, 10)
  const to = dateTo.slice(0, 10)

  const { data: accounts, error: aErr } = await supabase
    .from("accounting_accounts")
    .select("id, code, name")
    .eq("tenant_id", tenantId)
    .in("code", ["1000", "1010"])

  if (aErr) return { data: null, error: new Error(aErr.message) }

  const cashAcct = (accounts || []).find((a) => (a as { code: string }).code === "1000") as
    | { id: string; code: string; name: string }
    | undefined
  const bankAcct = (accounts || []).find((a) => (a as { code: string }).code === "1010") as
    | { id: string; code: string; name: string }
    | undefined

  if (!cashAcct && !bankAcct) {
    return { data: null, error: new Error("Cash (1000) and Bank (1010) accounts not found") }
  }

  const accountIds = [cashAcct?.id, bankAcct?.id].filter(Boolean) as string[]

  async function openingFor(accountId: string): Promise<number> {
    const { data, error } = await supabase.rpc("accounting_opening_balance", {
      p_tenant_id: tenantId,
      p_account_id: accountId,
      p_from_date: from,
      p_branch_id: branchId,
    })
    if (error) throw new Error(error.message)
    return Number(data ?? 0)
  }

  let cashOpening = 0
  let bankOpening = 0
  try {
    if (cashAcct) cashOpening = await openingFor(cashAcct.id)
    if (bankAcct) bankOpening = await openingFor(bankAcct.id)
  } catch (e) {
    return { data: null, error: e instanceof Error ? e : new Error("Opening balance failed") }
  }

  let linesQuery = supabase
    .from("accounting_voucher_lines")
    .select(
      `
      description,
      debit_amount,
      credit_amount,
      voucher_id,
      accounting_accounts ( code, name ),
      accounting_vouchers!inner (
        voucher_no,
        voucher_date,
        status,
        reference_type,
        branch_id
      )
    `
    )
    .eq("tenant_id", tenantId)
    .in("account_id", accountIds)
    .eq("accounting_vouchers.status", "posted")
    .gte("accounting_vouchers.voucher_date", from)
    .lte("accounting_vouchers.voucher_date", to)

  if (branchId) {
    linesQuery = linesQuery.eq("accounting_vouchers.branch_id", branchId)
  }

  const { data: rawLines, error: lErr } = await linesQuery
  if (lErr) return { data: null, error: new Error(lErr.message) }

  const pickVoucher = (row: unknown): {
    voucher_date: string
    voucher_no: string
    reference_type: string | null
  } => {
    const r = row as {
      accounting_vouchers:
        | { voucher_date: string; voucher_no: string; reference_type: string | null }
        | { voucher_date: string; voucher_no: string; reference_type: string | null }[]
    }
    const v = r.accounting_vouchers
    return Array.isArray(v) ? v[0] : v
  }

  const lines: CashMovementLine[] = []
  let cashReceipts = 0
  let cashPayments = 0
  let bankReceipts = 0
  let bankPayments = 0

  for (const raw of rawLines || []) {
    const r = raw as {
      description: string | null
      debit_amount: string
      credit_amount: string
      voucher_id: string
      accounting_accounts: { code: string; name: string } | { code: string; name: string }[] | null
    }
    const v = pickVoucher(raw)
    const acct = r.accounting_accounts
    const acctObj = Array.isArray(acct) ? acct[0] : acct
    const code = acctObj?.code ?? ""
    const dr = Number(r.debit_amount)
    const cr = Number(r.credit_amount)

    if (code === "1000") {
      cashReceipts += dr
      cashPayments += cr
    } else if (code === "1010") {
      bankReceipts += dr
      bankPayments += cr
    }

    lines.push({
      voucher_date: v.voucher_date,
      voucher_no: v.voucher_no,
      voucher_id: r.voucher_id,
      account_code: code,
      account_name: acctObj?.name ?? "",
      description: r.description,
      debit_amount: dr,
      credit_amount: cr,
      reference_type: v.reference_type,
    })
  }

  lines.sort((a, b) => {
    const d = a.voucher_date.localeCompare(b.voucher_date)
    if (d !== 0) return d
    return a.voucher_no.localeCompare(b.voucher_no)
  })

  const cashClosing = cashOpening + cashReceipts - cashPayments
  const bankClosing = bankOpening + bankReceipts - bankPayments

  return {
    data: {
      period_from: from,
      period_to: to,
      branch_id: branchId,
      cash_opening: Number(cashOpening.toFixed(2)),
      cash_receipts: Number(cashReceipts.toFixed(2)),
      cash_payments: Number(cashPayments.toFixed(2)),
      cash_closing: Number(cashClosing.toFixed(2)),
      bank_opening: Number(bankOpening.toFixed(2)),
      bank_receipts: Number(bankReceipts.toFixed(2)),
      bank_payments: Number(bankPayments.toFixed(2)),
      bank_closing: Number(bankClosing.toFixed(2)),
      lines,
    },
    error: null,
  }
}
