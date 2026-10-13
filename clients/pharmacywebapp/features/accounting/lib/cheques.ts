/**
 * Cheque register: pure types and rules shared by the register view, the payment dialog and the API client.
 *
 * Mirrors Accounting's `Cheque` aggregate. A post-dated cheque is not money in the bank: a customer receipt by
 * cheque sits in Cheques in Hand (1160) and a supplier payment by cheque in Cheques Issued (2160) until the cheque
 * clears, which posts a contra voucher to the bank. "Cleared on deposit" posts the payment straight to the bank
 * (a same-day cheque), so clearing it only changes the status. A bounce or a cancellation voids the payment.
 */

import { isDotnetRootUser } from "@/lib/api/dotnet-permissions"
import { canVoidPayments } from "@/features/accounting/lib/payment-void"

export type ChequeDirection = "received" | "issued"

export type ChequeStatus = "on_hand" | "deposited" | "issued" | "presented" | "cleared" | "bounced" | "cancelled"

export const CHEQUE_STATUSES: readonly { value: ChequeStatus; label: string; direction: ChequeDirection | null }[] = [
  { value: "on_hand", label: "On hand", direction: "received" },
  { value: "deposited", label: "Deposited", direction: "received" },
  { value: "issued", label: "Issued", direction: "issued" },
  { value: "presented", label: "Presented", direction: "issued" },
  { value: "cleared", label: "Cleared", direction: null },
  { value: "bounced", label: "Bounced", direction: null },
  { value: "cancelled", label: "Cancelled", direction: null },
]

export interface ChequeHistoryRow {
  id: string
  from_status: ChequeStatus | null
  to_status: ChequeStatus
  /** Nepal day ("yyyy-MM-dd") of the move (deposit / clearance date). */
  date: string
  changed_at: string
  changed_by: string
  note: string | null
  voucher_id: string | null
}

export interface ChequeRow {
  id: string
  direction: ChequeDirection
  status: ChequeStatus
  party_id: string
  party_name: string
  bank_name: string | null
  cheque_number: string
  /** Nepal day written on the cheque. */
  cheque_date: string
  amount: number
  payment_reference_type: string
  payment_reference_id: string
  /** Nepal day of the receipt / payment. */
  payment_date: string
  /** The payment was posted straight to the bank ("cleared on deposit"). */
  posted_to_bank: boolean
  bank_account_id: string | null
  deposited_date: string | null
  cleared_date: string | null
  branch_id: string | null
  notes: string | null
  history: ChequeHistoryRow[] | null
}

export function chequeStatusLabel(status: string | null | undefined): string {
  return CHEQUE_STATUSES.find((s) => s.value === status)?.label ?? (status ? status.replace(/_/g, " ") : "—")
}

export type ChequeBadgeTone = "success" | "info" | "warning" | "danger" | "muted"

/** Badge tone per status: final good (cleared), final bad (bounced), withdrawn, at the bank, waiting. */
export function chequeStatusTone(status: ChequeStatus): ChequeBadgeTone {
  switch (status) {
    case "cleared":
      return "success"
    case "bounced":
      return "danger"
    case "cancelled":
      return "muted"
    case "deposited":
    case "presented":
      return "info"
    default:
      return "warning"
  }
}

export function isFinalChequeStatus(status: ChequeStatus): boolean {
  return status === "cleared" || status === "bounced" || status === "cancelled"
}

/** Still waiting and dated on or before `today` (Nepal "yyyy-MM-dd"). Same rule as the API's due list. */
export function isChequeDue(row: Pick<ChequeRow, "status" | "cheque_date">, today: string): boolean {
  return !isFinalChequeStatus(row.status) && row.cheque_date <= today
}

/** A cheque dated after the payment it settled. */
export function isPostDated(row: Pick<ChequeRow, "cheque_date" | "payment_date">): boolean {
  return row.cheque_date > row.payment_date
}

export type ChequeAction = "deposit" | "clear" | "bounce" | "cancel"

export interface ChequeActionDef {
  action: ChequeAction
  label: string
  /** Voids the customer receipt / supplier payment. */
  voidsPayment: boolean
}

/**
 * What the user can do with a cheque now — the same transitions the API allows. Received: deposit (on hand),
 * clear / bounce (on hand or deposited), cancel (on hand). Issued: mark presented (issued), clear / bounce
 * (issued or presented), cancel (issued). Final statuses allow nothing.
 */
export function chequeActions(row: Pick<ChequeRow, "status" | "direction">): ChequeActionDef[] {
  if (isFinalChequeStatus(row.status)) return []
  const waiting = row.status === "on_hand" || row.status === "issued"
  const received = row.direction === "received"
  const out: ChequeActionDef[] = []
  if (waiting) out.push({ action: "deposit", label: received ? "Deposit" : "Mark presented", voidsPayment: false })
  out.push({ action: "clear", label: "Mark cleared", voidsPayment: false })
  out.push({ action: "bounce", label: "Mark bounced", voidsPayment: true })
  if (waiting) out.push({ action: "cancel", label: received ? "Cancel (returned)" : "Cancel cheque", voidsPayment: true })
  return out
}

/** AccountingPermissions.Banking.RecordDeposit — every register action needs it. */
export const BANKING_RECORD_DEPOSIT_PERMISSION = "Permissions.Accounting.Banking.RecordDeposit"

/**
 * Whether the user may run an action (the server enforces the same): the bank-deposit permission, plus — for a bounce
 * or a cancellation, which void the payment — the void-payment permission of the cheque's party.
 */
export function canRunChequeAction(def: ChequeActionDef, direction: ChequeDirection, granted: readonly string[]): boolean {
  if (isDotnetRootUser(granted)) return true
  if (!granted.includes(BANKING_RECORD_DEPOSIT_PERMISSION)) return false
  return !def.voidsPayment || canVoidPayments(direction === "received" ? "receipt" : "payment", granted)
}

/** What clearing will post, for the confirmation text. */
export function clearancePostingText(row: Pick<ChequeRow, "direction" | "posted_to_bank">): string {
  if (row.posted_to_bank) return "The payment was already posted to the bank, so nothing new is posted — only the status changes."
  return row.direction === "received"
    ? "Posts a contra voucher: Dr Bank / Cr Cheques in Hand (1160)."
    : "Posts a contra voucher: Dr Cheques Issued (2160) / Cr Bank."
}

/** Sum of the amounts per direction, for the register's summary strip. */
export function chequeTotals(rows: readonly Pick<ChequeRow, "direction" | "amount">[]): { received: number; issued: number } {
  let received = 0
  let issued = 0
  for (const r of rows) {
    if (r.direction === "received") received += r.amount
    else issued += r.amount
  }
  return { received: Math.round(received * 100) / 100, issued: Math.round(issued * 100) / 100 }
}

// ---------------------------------------------------------------------------------------------------------------
// Cheque details on the payment dialog
// ---------------------------------------------------------------------------------------------------------------

export interface ChequeFieldsValue {
  number: string
  /** "yyyy-MM-dd" written on the cheque. */
  date: string
  bank: string
  /** Post straight to the bank instead of Cheques in Hand / Cheques Issued. */
  clearedOnDeposit: boolean
}

export const EMPTY_CHEQUE_FIELDS: ChequeFieldsValue = { number: "", date: "", bank: "", clearedOnDeposit: false }

export const CHEQUE_NUMBER_MAX = 32
export const CHEQUE_BANK_MAX = 128

/** Cheques go stale six months after their date. */
export const STALE_CHEQUE_DAYS = 183
export const MAX_POST_DATED_DAYS = 366

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

function daysBetween(fromYmd: string, toYmd: string): number {
  return Math.round((Date.parse(`${toYmd}T00:00:00Z`) - Date.parse(`${fromYmd}T00:00:00Z`)) / 86_400_000)
}

export interface ChequeFieldErrors {
  number?: string
  date?: string
  bank?: string
}

/**
 * Validates the cheque details against the payment date, with the API's rules: a number and a date are required,
 * the cheque can't be stale (more than six months before the payment) or more than a year ahead. The details are
 * optional as a whole only when `required` is false.
 */
export function validateChequeFields(value: ChequeFieldsValue, paymentDate: string, required = true): ChequeFieldErrors {
  const errors: ChequeFieldErrors = {}
  const number = value.number.trim()
  const any = number || value.date || value.bank.trim()
  if (!required && !any) return errors

  if (!number) errors.number = "Enter the cheque number"
  else if (number.length > CHEQUE_NUMBER_MAX) errors.number = `Cheque number is at most ${CHEQUE_NUMBER_MAX} characters`

  if (!value.date) errors.date = "Enter the date written on the cheque"
  else if (!DATE_ONLY.test(value.date)) errors.date = "Pick a valid date"
  else if (DATE_ONLY.test(paymentDate)) {
    const ahead = daysBetween(paymentDate, value.date)
    if (ahead < -STALE_CHEQUE_DAYS) errors.date = "This cheque is more than six months old (stale)"
    else if (ahead > MAX_POST_DATED_DAYS) errors.date = "The cheque date can't be more than a year after the payment"
  }

  if (value.bank.trim().length > CHEQUE_BANK_MAX) errors.bank = `Bank name is at most ${CHEQUE_BANK_MAX} characters`
  return errors
}

export function hasChequeErrors(errors: ChequeFieldErrors): boolean {
  return Object.values(errors).some(Boolean)
}

/** The cheque part of a payment request (null when no cheque number was given). Dates stay "yyyy-MM-dd". */
export function chequePaymentRequest(value: ChequeFieldsValue): {
  chequeNumber: string
  chequeDate: string
  chequeBank: string | null
  chequeClearedOnDeposit: boolean
} | null {
  const number = value.number.trim()
  if (!number || !value.date) return null
  return {
    chequeNumber: number,
    chequeDate: value.date,
    chequeBank: value.bank.trim() || null,
    chequeClearedOnDeposit: value.clearedOnDeposit,
  }
}

/** Where the payment posts, for the dialog's help text. */
export function chequePostingHint(kind: "receipt" | "payment", value: Pick<ChequeFieldsValue, "clearedOnDeposit" | "date">, paymentDate: string): string {
  if (value.clearedOnDeposit) {
    return kind === "receipt" ? "Posted straight to the bank, as cleared on deposit." : "Credited to the bank at once, as cleared on presentation."
  }
  const postDated = !!value.date && DATE_ONLY.test(value.date) && value.date > paymentDate
  const where = kind === "receipt" ? "Cheques in Hand (1160)" : "Cheques Issued (2160)"
  return `${postDated ? "Post-dated: " : ""}held in ${where} until you mark it cleared in the cheque register.`
}

// ---------------------------------------------------------------------------------------------------------------
// Register filters
// ---------------------------------------------------------------------------------------------------------------

export interface ChequeFilters {
  status: ChequeStatus | ""
  direction: ChequeDirection | ""
  /** Cheque-date range, Nepal "yyyy-MM-dd" (either may be empty). */
  from: string
  to: string
  dueOnly: boolean
  search: string
  page: number
  pageSize: number
}

export const DEFAULT_CHEQUE_FILTERS: ChequeFilters = {
  status: "",
  direction: "",
  from: "",
  to: "",
  dueOnly: false,
  search: "",
  page: 1,
  pageSize: 50,
}

/** Reads the register's filters from the page URL (`?due=1&direction=received&status=on_hand`). */
export function chequeFiltersFromSearch(search: URLSearchParams | string): ChequeFilters {
  const p = new URLSearchParams(search)
  const status = p.get("status") ?? ""
  const direction = p.get("direction") ?? ""
  return {
    ...DEFAULT_CHEQUE_FILTERS,
    status: CHEQUE_STATUSES.some((s) => s.value === status) ? (status as ChequeStatus) : "",
    direction: direction === "received" || direction === "issued" ? direction : "",
    dueOnly: p.get("due") === "1" || p.get("due") === "true",
  }
}
