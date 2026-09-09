/**
 * Bank statement import & reconciliation (2026-09 ERP audit, priority item #2).
 *
 * Checks a GL bank account against what the bank itself reports. The existing
 * ar/ap/inventory-gl-reconciliation reports only compare internal control
 * accounts to their own sub-ledgers — consistent-but-wrong cash (an unrecorded
 * bank charge, a deposit that never landed, a bounced cheque) is invisible to
 * them. Statement lines are matched one-to-one against posted GL voucher lines
 * on the account; anything left over on either side is the discrepancy.
 *
 * Multiple bank accounts are supported by reconciling per GL account (a
 * pharmacy creates 1010/1011/… in its chart of accounts), so there is no second
 * source of truth for which banks exist.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

/** Days either side of the statement date that an auto-match will consider.
 *  Cheques and transfers routinely clear a day or two after they're booked. */
const AUTO_MATCH_DATE_TOLERANCE_DAYS = 3

export interface BankStatementImport {
  id: string
  tenant_id: string
  branch_id: string | null
  account_id: string
  statement_label: string | null
  period_start: string
  period_end: string
  opening_balance: number | null
  closing_balance: number | null
  status: "open" | "reconciled"
  created_at: string
  reconciled_at: string | null
}

const IMPORT_SELECT =
  "id, tenant_id, branch_id, account_id, statement_label, period_start, period_end, opening_balance, closing_balance, status, created_at, reconciled_at"

export interface BankStatementLine {
  id: string
  line_no: number
  txn_date: string
  description: string | null
  reference: string | null
  debit_amount: number
  credit_amount: number
  status: "unmatched" | "matched" | "ignored"
  matched_voucher_line_id: string | null
  note: string | null
}

const LINE_SELECT =
  "id, line_no, txn_date, description, reference, debit_amount, credit_amount, status, matched_voucher_line_id, note"

export async function listBankStatementImports(
  supabase: SupabaseClient,
  tenantId: string,
  filters: { accountId?: string | null; limit?: number }
): Promise<{ data: BankStatementImport[]; error: Error | null }> {
  let query = supabase
    .from("bank_statement_imports")
    .select(IMPORT_SELECT)
    .eq("tenant_id", tenantId)
    .order("period_end", { ascending: false })
    .limit(Math.min(200, Math.max(1, filters.limit ?? 50)))

  if (filters.accountId) query = query.eq("account_id", filters.accountId)

  const { data, error } = await query
  if (error) return { data: [], error: new Error(error.message) }
  return { data: (data || []) as BankStatementImport[], error: null }
}

export interface CreateBankStatementImportInput {
  accountId: string
  branchId?: string | null
  statementLabel?: string | null
  periodStart: string
  periodEnd: string
  openingBalance?: number | null
  closingBalance?: number | null
  lines: {
    txnDate: string
    description?: string | null
    reference?: string | null
    /** Money into the bank. Exactly one of debit/credit must be positive. */
    debit?: number
    credit?: number
  }[]
}

export async function createBankStatementImport(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string,
  input: CreateBankStatementImportInput
): Promise<{ data: BankStatementImport | null; error: Error | null }> {
  const { data: account, error: acctErr } = await supabase
    .from("accounting_accounts")
    .select("id, account_type")
    .eq("id", input.accountId)
    .eq("tenant_id", tenantId)
    .maybeSingle()

  if (acctErr || !account) return { data: null, error: new Error("Bank account not found in this pharmacy's chart of accounts") }
  if ((account as { account_type: string }).account_type !== "asset") {
    return { data: null, error: new Error("A bank statement can only be reconciled against an asset account") }
  }

  for (const [i, line] of input.lines.entries()) {
    const debit = line.debit ?? 0
    const credit = line.credit ?? 0
    if ((debit > 0) === (credit > 0)) {
      return { data: null, error: new Error(`Line ${i + 1}: exactly one of money-in or money-out must be positive`) }
    }
    if (line.txnDate < input.periodStart || line.txnDate > input.periodEnd) {
      return { data: null, error: new Error(`Line ${i + 1}: transaction date ${line.txnDate} is outside the statement period`) }
    }
  }

  const { data: created, error: insErr } = await supabase
    .from("bank_statement_imports")
    .insert({
      tenant_id: tenantId,
      branch_id: input.branchId ?? null,
      account_id: input.accountId,
      statement_label: input.statementLabel ?? null,
      period_start: input.periodStart,
      period_end: input.periodEnd,
      opening_balance: input.openingBalance ?? null,
      closing_balance: input.closingBalance ?? null,
      created_by: userId,
    })
    .select(IMPORT_SELECT)
    .single()

  if (insErr || !created) return { data: null, error: new Error(insErr?.message || "Could not create statement import") }

  const { error: lineErr } = await supabase.from("bank_statement_lines").insert(
    input.lines.map((line, i) => ({
      tenant_id: tenantId,
      import_id: (created as BankStatementImport).id,
      line_no: i + 1,
      txn_date: line.txnDate,
      description: line.description ?? null,
      reference: line.reference ?? null,
      debit_amount: line.debit ?? 0,
      credit_amount: line.credit ?? 0,
    }))
  )

  if (lineErr) {
    await supabase.from("bank_statement_imports").delete().eq("id", (created as BankStatementImport).id)
    return { data: null, error: new Error(lineErr.message) }
  }

  return { data: created as BankStatementImport, error: null }
}

export interface LedgerCandidate {
  voucher_line_id: string
  voucher_id: string
  voucher_no: string
  voucher_date: string
  description: string | null
  debit_amount: number
  credit_amount: number
  matched: boolean
}

/** Posted GL lines on the account within the statement period, flagged with
 *  whether some statement line already claims them. */
async function getLedgerLinesForPeriod(
  supabase: SupabaseClient,
  tenantId: string,
  accountId: string,
  periodStart: string,
  periodEnd: string
): Promise<{ data: LedgerCandidate[]; error: Error | null }> {
  const { data: rows, error } = await supabase
    .from("accounting_voucher_lines")
    .select(
      `
      id,
      voucher_id,
      description,
      debit_amount,
      credit_amount,
      accounting_vouchers!inner ( voucher_no, voucher_date, status )
    `
    )
    .eq("tenant_id", tenantId)
    .eq("account_id", accountId)
    .eq("accounting_vouchers.status", "posted")
    .gte("accounting_vouchers.voucher_date", periodStart)
    .lte("accounting_vouchers.voucher_date", periodEnd)

  if (error) return { data: [], error: new Error(error.message) }

  const lineIds = (rows || []).map((r) => (r as { id: string }).id)
  const matchedIds = new Set<string>()
  if (lineIds.length > 0) {
    const { data: claimed } = await supabase
      .from("bank_statement_lines")
      .select("matched_voucher_line_id")
      .eq("tenant_id", tenantId)
      .in("matched_voucher_line_id", lineIds)
    for (const c of claimed || []) {
      const id = (c as { matched_voucher_line_id: string | null }).matched_voucher_line_id
      if (id) matchedIds.add(id)
    }
  }

  const out: LedgerCandidate[] = (rows || []).map((raw) => {
    const r = raw as {
      id: string
      voucher_id: string
      description: string | null
      debit_amount: number
      credit_amount: number
      accounting_vouchers: { voucher_no: string; voucher_date: string } | { voucher_no: string; voucher_date: string }[]
    }
    const v = Array.isArray(r.accounting_vouchers) ? r.accounting_vouchers[0] : r.accounting_vouchers
    return {
      voucher_line_id: r.id,
      voucher_id: r.voucher_id,
      voucher_no: v.voucher_no,
      voucher_date: v.voucher_date,
      description: r.description,
      debit_amount: Number(r.debit_amount || 0),
      credit_amount: Number(r.credit_amount || 0),
      matched: matchedIds.has(r.id),
    }
  })

  out.sort((a, b) => a.voucher_date.localeCompare(b.voucher_date) || a.voucher_no.localeCompare(b.voucher_no))
  return { data: out, error: null }
}

export interface ReconciliationView {
  import: BankStatementImport
  lines: BankStatementLine[]
  ledger: LedgerCandidate[]
  summary: {
    statement_debits: number
    statement_credits: number
    statement_net: number
    ledger_debits: number
    ledger_credits: number
    ledger_net: number
    /** Statement movement minus GL movement over the period. Non-zero means at
     *  least one side is missing a transaction the other has. */
    difference: number
    unmatched_statement_lines: number
    unmatched_ledger_lines: number
  }
}

export async function getBankReconciliation(
  supabase: SupabaseClient,
  tenantId: string,
  importId: string
): Promise<{ data: ReconciliationView | null; error: Error | null }> {
  const { data: imp, error: impErr } = await supabase
    .from("bank_statement_imports")
    .select(IMPORT_SELECT)
    .eq("id", importId)
    .eq("tenant_id", tenantId)
    .maybeSingle()

  if (impErr || !imp) return { data: null, error: new Error(impErr?.message || "Statement import not found") }
  const statement = imp as BankStatementImport

  const [{ data: lines, error: lineErr }, { data: ledger, error: ledgerErr }] = await Promise.all([
    supabase
      .from("bank_statement_lines")
      .select(LINE_SELECT)
      .eq("tenant_id", tenantId)
      .eq("import_id", importId)
      .order("line_no"),
    getLedgerLinesForPeriod(supabase, tenantId, statement.account_id, statement.period_start, statement.period_end),
  ])

  if (lineErr) return { data: null, error: new Error(lineErr.message) }
  if (ledgerErr) return { data: null, error: ledgerErr }

  // A match whose GL line was deleted (FK is ON DELETE SET NULL) is stale — show
  // it as unmatched so it comes back into the operator's queue rather than
  // silently counting as reconciled.
  const statementLines = ((lines || []) as BankStatementLine[]).map((l) =>
    l.status === "matched" && !l.matched_voucher_line_id ? { ...l, status: "unmatched" as const } : l
  )
  const active = statementLines.filter((l) => l.status !== "ignored")

  const statementDebits = active.reduce((s, l) => s + Number(l.debit_amount || 0), 0)
  const statementCredits = active.reduce((s, l) => s + Number(l.credit_amount || 0), 0)
  const ledgerDebits = ledger.reduce((s, l) => s + l.debit_amount, 0)
  const ledgerCredits = ledger.reduce((s, l) => s + l.credit_amount, 0)

  const statementNet = Number((statementDebits - statementCredits).toFixed(2))
  const ledgerNet = Number((ledgerDebits - ledgerCredits).toFixed(2))

  return {
    data: {
      import: statement,
      lines: statementLines,
      ledger,
      summary: {
        statement_debits: Number(statementDebits.toFixed(2)),
        statement_credits: Number(statementCredits.toFixed(2)),
        statement_net: statementNet,
        ledger_debits: Number(ledgerDebits.toFixed(2)),
        ledger_credits: Number(ledgerCredits.toFixed(2)),
        ledger_net: ledgerNet,
        difference: Number((statementNet - ledgerNet).toFixed(2)),
        unmatched_statement_lines: statementLines.filter((l) => l.status === "unmatched").length,
        unmatched_ledger_lines: ledger.filter((l) => !l.matched).length,
      },
    },
    error: null,
  }
}

function daysApart(a: string, b: string): number {
  const ms = Math.abs(new Date(`${a}T00:00:00Z`).getTime() - new Date(`${b}T00:00:00Z`).getTime())
  return Math.round(ms / 86_400_000)
}

/** Pairs unmatched statement lines with unclaimed GL lines on exact amount and
 *  direction, nearest date first, within the tolerance window. Deliberately
 *  conservative: an ambiguous amount (two candidates equally close) is left for
 *  a human rather than guessed at, since a wrong auto-match silently hides a
 *  real discrepancy. */
export async function autoMatchBankStatement(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string,
  importId: string
): Promise<{ data: { matched: number } | null; error: Error | null }> {
  const { data: view, error } = await getBankReconciliation(supabase, tenantId, importId)
  if (error || !view) return { data: null, error }
  if (view.import.status === "reconciled") {
    return { data: null, error: new Error("This statement is already reconciled") }
  }

  const available = view.ledger.filter((l) => !l.matched)
  const claimed = new Set<string>()
  let matched = 0

  for (const line of view.lines) {
    if (line.status !== "unmatched") continue
    const debit = Number(line.debit_amount || 0)
    const credit = Number(line.credit_amount || 0)

    const candidates = available
      .filter(
        (c) =>
          !claimed.has(c.voucher_line_id) &&
          Number(c.debit_amount.toFixed(2)) === Number(debit.toFixed(2)) &&
          Number(c.credit_amount.toFixed(2)) === Number(credit.toFixed(2)) &&
          daysApart(c.voucher_date, line.txn_date) <= AUTO_MATCH_DATE_TOLERANCE_DAYS
      )
      .sort((a, b) => daysApart(a.voucher_date, line.txn_date) - daysApart(b.voucher_date, line.txn_date))

    if (candidates.length === 0) continue
    // Ambiguous: two candidates sit the same distance from the statement date and
    // are indistinguishable on amount. Picking one would be a coin flip.
    if (candidates.length > 1 && daysApart(candidates[0].voucher_date, line.txn_date) === daysApart(candidates[1].voucher_date, line.txn_date)) {
      continue
    }

    const chosen = candidates[0]
    const { error: updErr } = await supabase
      .from("bank_statement_lines")
      .update({
        status: "matched",
        matched_voucher_line_id: chosen.voucher_line_id,
        matched_at: new Date().toISOString(),
        matched_by: userId,
      })
      .eq("id", line.id)
      .eq("tenant_id", tenantId)
      .eq("status", "unmatched")

    if (updErr) continue
    claimed.add(chosen.voucher_line_id)
    matched += 1
  }

  return { data: { matched }, error: null }
}

export async function matchBankStatementLine(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string,
  lineId: string,
  voucherLineId: string
): Promise<{ error: Error | null }> {
  const { data: line, error: lineErr } = await supabase
    .from("bank_statement_lines")
    .select("id, import_id, debit_amount, credit_amount, status, matched_voucher_line_id")
    .eq("id", lineId)
    .eq("tenant_id", tenantId)
    .maybeSingle()

  if (lineErr || !line) return { error: new Error(lineErr?.message || "Statement line not found") }
  const current = line as { status: string; matched_voucher_line_id: string | null }
  // A 'matched' row whose GL line was deleted is stale, not really matched — let
  // it be re-matched instead of dead-ending the operator on "unmatch it first".
  if (current.status === "matched" && current.matched_voucher_line_id) {
    return { error: new Error("This line is already matched — unmatch it first") }
  }

  const { data: glLine, error: glErr } = await supabase
    .from("accounting_voucher_lines")
    .select("id, account_id, debit_amount, credit_amount")
    .eq("id", voucherLineId)
    .eq("tenant_id", tenantId)
    .maybeSingle()

  if (glErr || !glLine) return { error: new Error("Ledger entry not found") }

  const { data: imp } = await supabase
    .from("bank_statement_imports")
    .select("account_id, status")
    .eq("id", (line as { import_id: string }).import_id)
    .eq("tenant_id", tenantId)
    .maybeSingle()

  if ((imp as { status?: string } | null)?.status === "reconciled") {
    return { error: new Error("This statement is already reconciled") }
  }
  if ((glLine as { account_id: string }).account_id !== (imp as { account_id: string } | null)?.account_id) {
    return { error: new Error("That ledger entry belongs to a different account") }
  }

  const statementAmount = Number((line as { debit_amount: number }).debit_amount || 0) - Number((line as { credit_amount: number }).credit_amount || 0)
  const glAmount = Number((glLine as { debit_amount: number }).debit_amount || 0) - Number((glLine as { credit_amount: number }).credit_amount || 0)
  if (Number(statementAmount.toFixed(2)) !== Number(glAmount.toFixed(2))) {
    return { error: new Error(`Amounts differ: statement ${statementAmount.toFixed(2)} vs ledger ${glAmount.toFixed(2)}`) }
  }

  const { error: updErr } = await supabase
    .from("bank_statement_lines")
    .update({
      status: "matched",
      matched_voucher_line_id: voucherLineId,
      matched_at: new Date().toISOString(),
      matched_by: userId,
    })
    .eq("id", lineId)
    .eq("tenant_id", tenantId)

  if (updErr) {
    // The partial unique index is what actually enforces one-GL-line-one-match
    // under concurrency; surface it as the business rule rather than a raw error.
    if (/ux_bank_statement_lines_voucher_line|duplicate key/i.test(updErr.message)) {
      return { error: new Error("That ledger entry is already matched to another statement line") }
    }
    return { error: new Error(updErr.message) }
  }
  return { error: null }
}

export async function unmatchBankStatementLine(
  supabase: SupabaseClient,
  tenantId: string,
  lineId: string
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from("bank_statement_lines")
    .update({ status: "unmatched", matched_voucher_line_id: null, matched_at: null, matched_by: null })
    .eq("id", lineId)
    .eq("tenant_id", tenantId)

  if (error) return { error: new Error(error.message) }
  return { error: null }
}

/** Marks a statement line as deliberately not expected in the GL (e.g. a
 *  transfer between the pharmacy's own accounts already booked elsewhere).
 *  Ignored lines drop out of the difference calculation but stay visible. */
export async function ignoreBankStatementLine(
  supabase: SupabaseClient,
  tenantId: string,
  lineId: string,
  note: string | null
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from("bank_statement_lines")
    .update({ status: "ignored", matched_voucher_line_id: null, matched_at: null, matched_by: null, note })
    .eq("id", lineId)
    .eq("tenant_id", tenantId)

  if (error) return { error: new Error(error.message) }
  return { error: null }
}

export async function completeBankReconciliation(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string,
  importId: string
): Promise<{ error: Error | null }> {
  const { data: view, error } = await getBankReconciliation(supabase, tenantId, importId)
  if (error || !view) return { error }
  if (view.import.status === "reconciled") return { error: new Error("Already reconciled") }

  if (view.summary.unmatched_statement_lines > 0) {
    return {
      error: new Error(
        `${view.summary.unmatched_statement_lines} statement line(s) are still unmatched. Match or ignore every line before completing.`
      ),
    }
  }
  if (view.summary.unmatched_ledger_lines > 0) {
    return {
      error: new Error(
        `${view.summary.unmatched_ledger_lines} ledger entr(ies) in this period aren't on the statement. Investigate them before completing.`
      ),
    }
  }

  const { data: updated, error: updErr } = await supabase
    .from("bank_statement_imports")
    .update({ status: "reconciled", reconciled_by: userId, reconciled_at: new Date().toISOString() })
    .eq("id", importId)
    .eq("tenant_id", tenantId)
    .eq("status", "open")
    .select("id")

  if (updErr) return { error: new Error(updErr.message) }
  if (!updated || updated.length === 0) return { error: new Error("Statement was already reconciled by another request") }
  return { error: null }
}
