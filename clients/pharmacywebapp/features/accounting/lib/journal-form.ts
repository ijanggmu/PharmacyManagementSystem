/**
 * Pure state helpers and validation for the manual journal editor (new journal + edit draft).
 * Amounts are kept as strings while editing so partial input like "12." is preserved.
 */

import { z } from "zod"

export interface JournalLineDraft {
  key: string
  account_id: string
  description: string
  debit: string
  credit: string
}

export interface JournalLineError {
  account?: string
  amount?: string
}

export interface JournalValidation {
  ok: boolean
  lineErrors: Record<string, JournalLineError>
  formError?: string
  totals: { debit: number; credit: number; difference: number }
  payload: { account_id: string; description: string | null; debit_amount: number; credit_amount: number }[]
}

let seq = 0
export function newLineKey(): string {
  seq += 1
  return `l${Date.now().toString(36)}${seq}`
}

export function emptyLine(): JournalLineDraft {
  return { key: newLineKey(), account_id: "", description: "", debit: "", credit: "" }
}

/** Parses a typed amount. Empty -> 0; invalid -> NaN. Commas are allowed as thousands separators. */
export function parseAmount(raw: string): number {
  const t = raw.replace(/,/g, "").trim()
  if (!t) return 0
  if (!/^-?\d*\.?\d*$/.test(t)) return Number.NaN
  const n = Number(t)
  return Number.isFinite(n) ? n : Number.NaN
}

const round2 = (n: number) => Math.round(n * 100) / 100

function isBlank(l: JournalLineDraft): boolean {
  return !l.account_id && !l.description.trim() && !l.debit.trim() && !l.credit.trim()
}

const payloadSchema = z
  .array(
    z.object({
      account_id: z.string().min(1),
      description: z.string().nullable(),
      debit_amount: z.number().nonnegative(),
      credit_amount: z.number().nonnegative(),
    })
  )
  .min(2)

export function validateJournal(lines: JournalLineDraft[]): JournalValidation {
  const lineErrors: Record<string, JournalLineError> = {}
  const payload: JournalValidation["payload"] = []
  let debit = 0
  let credit = 0

  for (const l of lines) {
    if (isBlank(l)) continue
    const dr = parseAmount(l.debit)
    const cr = parseAmount(l.credit)
    const err: JournalLineError = {}
    if (Number.isNaN(dr) || Number.isNaN(cr)) err.amount = "Enter a valid number"
    else if (dr < 0 || cr < 0) err.amount = "Amounts must be positive"
    else if (dr > 0 && cr > 0) err.amount = "Use either debit or credit, not both"
    else if (dr === 0 && cr === 0) err.amount = "Enter a debit or credit amount"
    if (!l.account_id) err.account = "Choose an account"
    if (err.account || err.amount) {
      lineErrors[l.key] = err
      continue
    }
    debit += dr
    credit += cr
    payload.push({
      account_id: l.account_id,
      description: l.description.trim() || null,
      debit_amount: round2(dr),
      credit_amount: round2(cr),
    })
  }

  debit = round2(debit)
  credit = round2(credit)
  const difference = round2(debit - credit)

  let formError: string | undefined
  if (Object.keys(lineErrors).length > 0) formError = "Fix the highlighted lines"
  else if (payload.length < 2) formError = "Add at least two lines — one debit and one credit"
  else if (debit === 0) formError = "Enter the amounts"
  else if (difference !== 0) formError = "Debits must equal credits"
  else if (!payloadSchema.safeParse(payload).success) formError = "Check the journal lines"

  return { ok: !formError, lineErrors, formError, totals: { debit, credit, difference }, payload }
}

/** Fills the line's empty side so the journal balances (used by the "balance" helper button). */
export function balanceLine(lines: JournalLineDraft[], key: string): JournalLineDraft[] {
  const others = lines.filter((l) => l.key !== key)
  const sum = (side: "debit" | "credit") =>
    others.reduce((s, l) => s + (Number.isNaN(parseAmount(l[side])) ? 0 : parseAmount(l[side])), 0)
  const diff = round2(sum("debit") - sum("credit"))
  if (diff === 0) return lines
  return lines.map((l) =>
    l.key === key
      ? diff > 0
        ? { ...l, debit: "", credit: diff.toFixed(2) }
        : { ...l, debit: Math.abs(diff).toFixed(2), credit: "" }
      : l
  )
}
