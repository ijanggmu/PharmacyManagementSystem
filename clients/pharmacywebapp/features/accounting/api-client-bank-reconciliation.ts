
import {
  autoMatchStatementImport,
  completeStatementImport,
  createStatementImport,
  getStatementImport,
  ignoreStatementLine,
  listStatementImports,
  matchStatementLine,
  searchStatementImports,
  unmatchStatementLine,
  type StatementImportsPage,
} from "@/lib/api/bank-reconciliation-api"

export interface BankStatementImport {
  id: string
  account_id: string
  branch_id: string | null
  statement_label: string | null
  period_start: string
  period_end: string
  opening_balance: number | null
  closing_balance: number | null
  status: "open" | "reconciled"
  created_at: string
  reconciled_at: string | null
}

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
    difference: number
    unmatched_statement_lines: number
    unmatched_ledger_lines: number
  }
}

export interface CreateStatementInput {
  account_id: string
  branch_id?: string | null
  statement_label?: string | null
  period_start: string
  period_end: string
  opening_balance?: number | null
  closing_balance?: number | null
  lines: {
    txn_date: string
    description?: string | null
    reference?: string | null
    debit?: number
    credit?: number
  }[]
}

export const bankReconciliationApi = {
  list: (accountId?: string) => listStatementImports(accountId),

  /** Paged variant of `list`, used wherever a page control is shown over the statements list. */
  search: (accountId: string | undefined, page: number, limit?: number): Promise<StatementImportsPage> =>
    searchStatementImports(accountId, page, limit),

  /** Pass one idempotency key per submit, so a retried create is replayed instead of importing twice. */
  create: (input: CreateStatementInput, idempotencyKey?: string) => createStatementImport(input, idempotencyKey),

  get: (id: string) => getStatementImport(id),

  autoMatch: (id: string) => autoMatchStatementImport(id),

  matchLine: (lineId: string, voucherLineId: string) => matchStatementLine(lineId, voucherLineId),

  unmatchLine: (lineId: string) => unmatchStatementLine(lineId),

  ignoreLine: (lineId: string, note?: string | null) => ignoreStatementLine(lineId, note),

  complete: (id: string) => completeStatementImport(id),
}

/** Parses a pasted bank statement (CSV/TSV) into import lines.
 *  Expected columns: date, description, [reference], money-in, money-out.
 *  Kept deliberately forgiving — Nepali bank exports vary a lot — and every
 *  parsed row is shown for review before it is sent to the server. */
export function parseStatementText(text: string): { lines: CreateStatementInput["lines"]; errors: string[] } {
  const errors: string[] = []
  const lines: CreateStatementInput["lines"] = []

  const rows = text
    .split(/\r?\n/)
    .map((r) => r.trim())
    .filter(Boolean)

  for (const [i, row] of rows.entries()) {
    const cells = row.split(/\t|,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((c) => c.trim().replace(/^"|"$/g, ""))
    if (cells.length < 3) {
      errors.push(`Row ${i + 1}: expected at least date, description and an amount`)
      continue
    }

    const rawDate = cells[0]
    // Skip a header row rather than reporting it as an error.
    if (i === 0 && !/^\d/.test(rawDate)) continue

    const date = normalizeDate(rawDate)
    if (!date) {
      errors.push(`Row ${i + 1}: could not read the date "${rawDate}"`)
      continue
    }

    const debit = parseAmount(cells[cells.length - 2])
    const credit = parseAmount(cells[cells.length - 1])
    if (debit === 0 && credit === 0) {
      errors.push(`Row ${i + 1}: no money-in or money-out amount found`)
      continue
    }
    if (debit > 0 && credit > 0) {
      errors.push(`Row ${i + 1}: has both a money-in and a money-out amount`)
      continue
    }

    const middle = cells.slice(1, cells.length - 2)
    lines.push({
      txn_date: date,
      description: middle[0] || null,
      reference: middle[1] || null,
      debit: debit > 0 ? debit : undefined,
      credit: credit > 0 ? credit : undefined,
    })
  }

  return { lines, errors }
}

function parseAmount(raw: string | undefined): number {
  if (!raw) return 0
  const cleaned = raw.replace(/[^0-9.-]/g, "")
  const n = Number(cleaned)
  return Number.isFinite(n) && n > 0 ? Number(n.toFixed(2)) : 0
}

function normalizeDate(raw: string): string | null {
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`

  const dmy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (dmy) {
    const [, d, m, y] = dmy
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`
  }
  return null
}
