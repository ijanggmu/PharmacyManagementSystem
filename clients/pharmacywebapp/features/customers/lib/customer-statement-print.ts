/**
 * Printable A4 statement of account for a credit customer (the monthly statement a pharmacy hands over).
 *
 * `buildCustomerStatementPrintHtml` is pure: every interpolated value is HTML-escaped (or CSS-escaped in the
 * @page margin boxes). Print it with `printHtmlDocument` (hidden iframe, no pop-up).
 * `customerStatementCsv` gives the same lines as CSV rows for `downloadCsv`.
 */

import type { CustomerStatement, CustomerStatementLine } from "@/lib/api/customers-api"
import type { CsvValue } from "@/features/accounting/lib/csv"
import { amountInWords } from "@/features/accounting/lib/amount-in-words"
import { formatBsLong, formatBsYmd } from "@/features/accounting/lib/date-presets"
import { escapeCssString, escapeHtml } from "@/features/accounting/lib/html-escape"
import { formatPrintAmount, type PrintProfile } from "@/features/accounting/lib/voucher-print"
import { creditTermsLabel } from "@/lib/utils/payment-terms"
import { nepalYmdOf } from "@/lib/utils/nepal-time"

export interface CustomerStatementPrintInput {
  statement: CustomerStatement
  profile: PrintProfile
  /** Customer address, when known (the statement DTO carries no address). */
  customerAddress?: string | null
  branchName?: string | null
  /** Defaults to now. Passed in for deterministic tests. */
  printedAt?: Date
}

const e = escapeHtml

/** Amounts under half a paisa are treated as settled. */
const EPSILON = 0.005

function formatAdLong(ymd: string): string {
  const [y, m, d] = ymd.slice(0, 10).split("-").map(Number)
  if (!y || !m || !d) return ymd
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

function formatTimestamp(d: Date): string {
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

/** "1,234.00 Dr" / "250.00 Cr" — a negative balance is an advance (the pharmacy owes the customer). */
export function formatStatementBalance(n: number): string {
  if (Math.abs(n) < EPSILON) return formatPrintAmount(0)
  return `${formatPrintAmount(Math.abs(n))} ${n > 0 ? "Dr" : "Cr"}`
}

const ENTRY_TYPE_LABEL: Record<CustomerStatementLine["entry_type"], string> = {
  invoice: "Credit sale",
  payment: "Payment received",
  credit_note: "Refund / credit note",
  adjustment: "Adjustment",
}

/** Particulars column: the entry's description, or a label for its type. */
export function statementParticulars(line: CustomerStatementLine): string {
  return line.description?.trim() || ENTRY_TYPE_LABEL[line.entry_type]
}

/** The closing balance still owed (0 when settled or in advance). */
export function statementAmountDue(statement: CustomerStatement): number {
  return statement.closing_balance > EPSILON ? statement.closing_balance : 0
}

/**
 * The "please settle" note: null when nothing is due; otherwise asks for the overdue part at once, or for the
 * amount due by the earliest open due date.
 */
export function statementSettleNote(statement: CustomerStatement, today: string): string | null {
  const due = statementAmountDue(statement)
  if (due <= 0) return null
  const { overdue, earliest_due_date: earliest } = statement.ageing
  if (overdue > EPSILON) {
    return `Rs ${formatPrintAmount(Math.min(overdue, due))} is past due. Please settle it at the earliest.`
  }
  if (earliest && earliest >= today) {
    return `Please settle Rs ${formatPrintAmount(due)} by ${formatBsLong(earliest)} (${formatAdLong(earliest)}).`
  }
  return `Please settle Rs ${formatPrintAmount(due)} at the earliest.`
}

function metaCell(label: string, value: string): string {
  return `<div class="meta-cell"><div class="meta-label">${e(label)}</div><div class="meta-value">${value || "&mdash;"}</div></div>`
}

export function buildCustomerStatementPrintHtml(input: CustomerStatementPrintInput): string {
  const { statement: s, profile } = input
  const printedAt = input.printedAt ?? new Date()
  const today = nepalYmdOf(printedAt)
  const amountDue = statementAmountDue(s)
  const settleNote = statementSettleNote(s, today)
  const periodBs = `${formatBsLong(s.period_from)} – ${formatBsLong(s.period_to)}`
  const periodAd = `${formatAdLong(s.period_from)} – ${formatAdLong(s.period_to)}`

  const headerLines = [
    profile.address ? e(profile.address) : "",
    [profile.phone ? `Phone: ${e(profile.phone)}` : "", profile.email ? `Email: ${e(profile.email)}` : ""]
      .filter(Boolean)
      .join(" &nbsp;|&nbsp; "),
    profile.panVat ? `PAN/VAT No.: <span class="mono">${e(profile.panVat)}</span>` : "",
  ].filter(Boolean)

  const customerLines = [
    `Customer no.: <span class="mono">${e(s.customer_code)}</span>`,
    input.customerAddress ? e(input.customerAddress) : "",
    s.phone ? `Phone: <span class="mono">${e(s.phone)}</span>` : "",
    s.pan_number ? `PAN No.: <span class="mono">${e(s.pan_number)}</span>` : "",
  ].filter(Boolean)

  const rows = s.lines
    .map((line) => {
      const voided = line.is_voided
      const sub = [
        voided ? `<span class="void-tag">VOIDED</span>` : "",
        line.due_date ? `<span class="sub">Due ${e(formatBsYmd(line.due_date))}</span>` : "",
      ].join("")
      return `<tr class="${voided ? "voided" : ""}">
        <td class="c-date mono">${e(formatBsYmd(line.entry_date))}</td>
        <td class="c-doc mono">${e(line.document_number ?? "")}</td>
        <td class="c-name">${e(statementParticulars(line))}${sub}</td>
        <td class="c-amt">${line.debit > 0 ? e(formatPrintAmount(line.debit)) : ""}</td>
        <td class="c-amt">${line.credit > 0 ? e(formatPrintAmount(line.credit)) : ""}</td>
        <td class="c-amt">${e(formatStatementBalance(line.balance))}</td>
      </tr>`
    })
    .join("")

  const a = s.ageing
  const footerLeft = escapeCssString(`${profile.name} · Statement ${s.customer_code} · Printed ${formatTimestamp(printedAt)}`)

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Statement ${e(s.customer_name)} ${e(formatBsYmd(s.period_from))} to ${e(formatBsYmd(s.period_to))}</title>
<style>
  @page {
    size: A4 portrait;
    margin: 12mm 12mm 16mm 12mm;
    @bottom-left { content: "${footerLeft}"; font: 8pt "Inter", "Segoe UI", Arial, sans-serif; color: #6b7280; }
    @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 8pt "Inter", "Segoe UI", Arial, sans-serif; color: #6b7280; }
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: "Inter", "Segoe UI", Roboto, Arial, sans-serif; font-size: 9.5pt; line-height: 1.45; color: #111827; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { max-width: 186mm; margin: 0 auto; padding: 4mm 0; }
  .mono { font-family: "JetBrains Mono", Consolas, monospace; font-size: 0.95em; }
  header.brand { display: flex; justify-content: space-between; align-items: flex-start; gap: 12mm; padding-bottom: 4mm; border-bottom: 2px solid #111827; }
  .brand-name { font-size: 15pt; font-weight: 700; margin: 0; }
  .brand-legal { font-size: 9pt; color: #374151; margin: 1mm 0 0; }
  .brand-lines { margin: 1.5mm 0 0; color: #4b5563; font-size: 8.5pt; }
  .doc-title { text-align: right; flex-shrink: 0; }
  .doc-title h1 { margin: 0; font-size: 14pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; }
  .doc-title .period { margin-top: 1mm; font-size: 9.5pt; font-weight: 600; }
  .doc-title .period-ad { color: #4b5563; font-size: 8.5pt; }
  .parties { display: grid; grid-template-columns: 1.4fr 1fr; gap: 4mm; margin: 5mm 0 3mm; }
  .party { border: 1px solid #d1d5db; border-radius: 1.5mm; padding: 2.5mm 3mm; }
  .party .name { font-weight: 600; font-size: 10.5pt; }
  .party .lines { color: #4b5563; font-size: 8.5pt; }
  .due-box { text-align: right; }
  .due-box .amount { font-size: 15pt; font-weight: 700; font-variant-numeric: tabular-nums; }
  .meta { display: grid; grid-template-columns: repeat(4, 1fr); border: 1px solid #d1d5db; border-radius: 1.5mm; margin: 0 0 4mm; }
  .meta-cell { padding: 2mm 3mm; border-right: 1px solid #e5e7eb; min-width: 0; }
  .meta-cell:last-child { border-right: 0; }
  .meta-label { font-size: 7pt; text-transform: uppercase; letter-spacing: 0.08em; color: #6b7280; font-weight: 600; }
  .meta-value { margin-top: 0.5mm; font-weight: 500; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
  table.lines { width: 100%; border-collapse: collapse; }
  table.lines thead { display: table-header-group; }
  table.lines th { background: #f3f4f6; border-top: 1.5px solid #111827; border-bottom: 1px solid #111827; padding: 2mm; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.06em; text-align: left; font-weight: 700; }
  table.lines td { padding: 1.6mm 2mm; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  table.lines tr { break-inside: avoid; }
  table.lines tr.opening td, table.lines tr.closing td { font-weight: 600; background: #f9fafb; }
  table.lines tr.closing td { border-top: 1.5px solid #111827; border-bottom: 3px double #111827; }
  tr.voided td { color: #9ca3af; }
  tr.voided td.c-amt { text-decoration: line-through; }
  .void-tag { display: inline-block; margin-left: 1.5mm; padding: 0 1.2mm; border: 1px solid #b91c1c; border-radius: 1mm; color: #b91c1c; font-size: 6.5pt; font-weight: 700; letter-spacing: 0.06em; text-decoration: none; }
  .c-date { width: 22mm; white-space: nowrap; }
  .c-doc { width: 30mm; overflow-wrap: anywhere; }
  .c-name { font-weight: 500; }
  .c-name .sub { display: block; color: #6b7280; font-weight: 400; font-size: 8pt; }
  .c-amt { width: 25mm; text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  th.c-amt { text-align: right; }
  .summary { display: grid; grid-template-columns: 1fr 80mm; gap: 6mm; margin-top: 4mm; break-inside: avoid; }
  table.ageing, table.totals { width: 100%; border-collapse: collapse; }
  table.ageing th, table.ageing td { border: 1px solid #d1d5db; padding: 1.5mm 2mm; text-align: right; font-variant-numeric: tabular-nums; }
  table.ageing th { background: #f3f4f6; font-size: 7pt; text-transform: uppercase; letter-spacing: 0.06em; }
  .totals td { padding: 1.2mm 2mm; }
  .totals td:last-child { text-align: right; font-variant-numeric: tabular-nums; }
  .totals tr.grand td { border-top: 1.5px solid #111827; border-bottom: 3px double #111827; font-weight: 700; font-size: 10.5pt; }
  .section-title { margin: 0 0 1.5mm; }
  .words, .settle { margin-top: 4mm; padding: 2.5mm 3mm; border: 1px solid #d1d5db; border-radius: 1.5mm; break-inside: avoid; }
  .settle { border-color: #111827; font-weight: 600; }
  .note { margin-top: 3mm; color: #374151; font-size: 8.5pt; }
  .signatures { display: grid; grid-template-columns: repeat(2, 1fr); gap: 30mm; margin-top: 16mm; break-inside: avoid; }
  .sig { text-align: center; border-top: 1px solid #111827; padding-top: 1.5mm; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; font-size: 7.5pt; }
  .end { margin-top: 8mm; text-align: center; color: #9ca3af; font-size: 7.5pt; }
  @media screen {
    body { background: #e5e7eb; }
    .page { background: #fff; padding: 12mm; margin: 8mm auto; box-shadow: 0 1px 3px rgba(0,0,0,0.15); max-width: 210mm; min-height: 297mm; }
  }
</style>
</head>
<body>
<div class="page">
  <header class="brand">
    <div>
      <p class="brand-name">${e(profile.name)}</p>
      ${profile.legalName && profile.legalName !== profile.name ? `<p class="brand-legal">${e(profile.legalName)}</p>` : ""}
      <div class="brand-lines">${headerLines.map((l) => `<div>${l}</div>`).join("")}</div>
    </div>
    <div class="doc-title">
      <h1>Statement of account</h1>
      <div class="period">${e(periodBs)} (BS)</div>
      <div class="period-ad">${e(periodAd)} (AD)</div>
    </div>
  </header>
  <section class="parties">
    <div class="party">
      <div class="meta-label">Statement to</div>
      <div class="name">${e(s.customer_name)}</div>
      <div class="lines">${customerLines.map((l) => `<div>${l}</div>`).join("")}</div>
    </div>
    <div class="party due-box">
      <div class="meta-label">Amount due</div>
      <div class="amount">Rs ${e(formatPrintAmount(amountDue))}</div>
      ${s.closing_balance < -EPSILON ? `<div class="lines">Advance on account: Rs ${e(formatPrintAmount(-s.closing_balance))}</div>` : ""}
      ${input.branchName ? `<div class="lines">Branch: ${e(input.branchName)}</div>` : ""}
    </div>
  </section>
  <section class="meta" aria-label="Account terms">
    ${metaCell("Credit terms", e(creditTermsLabel(s.credit_days)))}
    ${metaCell("Credit limit", s.credit_limit != null ? `Rs ${e(formatPrintAmount(s.credit_limit))}` : "No limit")}
    ${metaCell("Opening balance", e(formatStatementBalance(s.opening_balance)))}
    ${metaCell("Closing balance", e(formatStatementBalance(s.closing_balance)))}
  </section>
  <table class="lines">
    <thead>
      <tr>
        <th class="c-date">Date (BS)</th>
        <th class="c-doc">Doc no.</th>
        <th class="c-name">Particulars</th>
        <th class="c-amt">Debit (Rs)</th>
        <th class="c-amt">Credit (Rs)</th>
        <th class="c-amt">Balance (Rs)</th>
      </tr>
    </thead>
    <tbody>
      <tr class="opening">
        <td class="c-date mono">${e(formatBsYmd(s.period_from))}</td>
        <td class="c-doc"></td>
        <td class="c-name">Opening balance</td>
        <td class="c-amt"></td>
        <td class="c-amt"></td>
        <td class="c-amt">${e(formatStatementBalance(s.opening_balance))}</td>
      </tr>
      ${rows || `<tr><td colspan="6" class="c-name">No transactions in this period.</td></tr>`}
      <tr class="closing">
        <td class="c-date mono">${e(formatBsYmd(s.period_to))}</td>
        <td class="c-doc"></td>
        <td class="c-name">Period total / closing balance</td>
        <td class="c-amt">${e(formatPrintAmount(s.total_debits))}</td>
        <td class="c-amt">${e(formatPrintAmount(s.total_credits))}</td>
        <td class="c-amt">${e(formatStatementBalance(s.closing_balance))}</td>
      </tr>
    </tbody>
  </table>
  <section class="summary">
    <div>
      <p class="meta-label section-title">Ageing as of ${e(formatBsLong(s.period_to))}</p>
      <table class="ageing" aria-label="Ageing">
        <tr><th>0–30 days</th><th>31–60 days</th><th>61–90 days</th><th>Over 90 days</th><th>Advance</th></tr>
        <tr>
          <td>${e(formatPrintAmount(a.current))}</td>
          <td>${e(formatPrintAmount(a.days_31_60))}</td>
          <td>${e(formatPrintAmount(a.days_61_90))}</td>
          <td>${e(formatPrintAmount(a.over_90))}</td>
          <td>${e(formatPrintAmount(a.unapplied_advance))}</td>
        </tr>
      </table>
      ${a.overdue > EPSILON ? `<p class="note">Of which past due date: Rs ${e(formatPrintAmount(a.overdue))}</p>` : ""}
    </div>
    <table class="totals" aria-label="Totals">
      <tr><td>Opening balance</td><td>${e(formatStatementBalance(s.opening_balance))}</td></tr>
      <tr><td>Add: charges</td><td>${e(formatPrintAmount(s.total_debits))}</td></tr>
      <tr><td>Less: payments &amp; credits</td><td>${e(formatPrintAmount(s.total_credits))}</td></tr>
      <tr class="grand"><td>Amount due</td><td>${e(formatPrintAmount(amountDue))}</td></tr>
    </table>
  </section>
  ${amountDue > 0 ? `<div class="words"><div class="meta-label">Amount due in words</div><div class="meta-value">${e(amountInWords(amountDue))}</div></div>` : ""}
  ${settleNote ? `<div class="settle">${e(settleNote)}</div>` : ""}
  <p class="note">Please report any discrepancy within 7 days of receiving this statement. Voided entries are shown struck through and do not affect the balance.</p>
  <section class="signatures" aria-label="Signatures">
    <div class="sig">Prepared by</div>
    <div class="sig">Received by (customer)</div>
  </section>
  <div class="end">Printed ${e(formatTimestamp(printedAt))} &middot; This is a computer-generated statement.</div>
</div>
</body>
</html>`
}

/** CSV headers + rows for the statement: an opening row, the lines, and a closing row. */
export function customerStatementCsv(s: CustomerStatement): { headers: string[]; rows: CsvValue[][] } {
  const headers = ["Date (BS)", "Date (AD)", "Doc no.", "Particulars", "Debit", "Credit", "Balance", "Voided", "Due (BS)"]
  const rows: CsvValue[][] = [
    [formatBsYmd(s.period_from), s.period_from, "", "Opening balance", "", "", s.opening_balance.toFixed(2), "", ""],
    ...s.lines.map((l) => [
      formatBsYmd(l.entry_date),
      l.entry_date,
      l.document_number ?? "",
      statementParticulars(l),
      l.debit > 0 ? l.debit.toFixed(2) : "",
      l.credit > 0 ? l.credit.toFixed(2) : "",
      l.balance.toFixed(2),
      l.is_voided ? "Yes" : "",
      l.due_date ? formatBsYmd(l.due_date) : "",
    ]),
    [formatBsYmd(s.period_to), s.period_to, "", "Closing balance", s.total_debits.toFixed(2), s.total_credits.toFixed(2), s.closing_balance.toFixed(2), "", ""],
  ]
  return { headers, rows }
}
