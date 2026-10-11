/**
 * Printable A4 debit note for a return to a supplier.
 *
 * `buildDebitNotePrintHtml` is pure: every interpolated value is HTML-escaped (or CSS-escaped in the
 * @page margin boxes). Print it with `printHtmlDocument` (hidden iframe, no pop-up).
 */

import type { DotnetSupplierReturnDto } from "@/lib/api/suppliers-api"
import { supplierReturnTotal } from "@/lib/api/suppliers-api"
import { amountInWords } from "@/features/accounting/lib/amount-in-words"
import { formatBsLong } from "@/features/accounting/lib/date-presets"
import { escapeCssString, escapeHtml } from "@/features/accounting/lib/html-escape"
import { formatPrintAmount, type PrintProfile } from "@/features/accounting/lib/voucher-print"

export interface DebitNotePrintInput {
  debitNote: DotnetSupplierReturnDto
  profile: PrintProfile
  supplier?: { name: string; address?: string | null; phone?: string | null; panVat?: string | null } | null
  branchName?: string | null
  /** Defaults to now. Passed in for deterministic tests. */
  printedAt?: Date
}

const e = escapeHtml

export function returnReasonLabel(reason: string): string {
  const text = reason.replace(/_/g, " ").trim()
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : ""
}

function formatAdLong(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

function formatTimestamp(d: Date): string {
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

function metaCell(label: string, value: string, wide = false): string {
  return `<div class="meta-cell${wide ? " wide" : ""}"><div class="meta-label">${e(label)}</div><div class="meta-value">${value || "&mdash;"}</div></div>`
}

export function buildDebitNotePrintHtml(input: DebitNotePrintInput): string {
  const { debitNote: dn, profile } = input
  const printedAt = input.printedAt ?? new Date()
  const number = dn.documentNumber || `Return ${dn.id.slice(0, 8)}`
  const vat = dn.vatAmount ?? 0
  const total = supplierReturnTotal(dn)
  const supplierName = input.supplier?.name ?? dn.supplierName ?? "Supplier"

  const headerLines = [
    profile.address ? e(profile.address) : "",
    [profile.phone ? `Phone: ${e(profile.phone)}` : "", profile.email ? `Email: ${e(profile.email)}` : ""]
      .filter(Boolean)
      .join(" &nbsp;|&nbsp; "),
    profile.panVat ? `PAN/VAT No.: <span class="mono">${e(profile.panVat)}</span>` : "",
  ].filter(Boolean)

  const supplierLines = [
    input.supplier?.address ? e(input.supplier.address) : "",
    input.supplier?.phone ? `Phone: ${e(input.supplier.phone)}` : "",
    input.supplier?.panVat ? `PAN/VAT No.: <span class="mono">${e(input.supplier.panVat)}</span>` : "",
  ].filter(Boolean)

  const rows = dn.items
    .map((item, i) => {
      const name = item.medicineName || "Medicine"
      const reason = [returnReasonLabel(item.returnReason), item.notes ?? ""].filter(Boolean).join(" — ")
      return `<tr>
        <td class="c-sn">${i + 1}</td>
        <td class="c-name">${e(name)}${reason ? `<span class="sub">${e(reason)}</span>` : ""}</td>
        <td class="c-batch mono">${e(item.batchNo ?? "")}</td>
        <td class="c-amt">${e(String(item.quantity))}</td>
        <td class="c-amt">${e(formatPrintAmount(item.unitCost))}</td>
        <td class="c-amt">${e(formatPrintAmount(item.totalCost))}</td>
      </tr>`
    })
    .join("")

  const footerLeft = escapeCssString(`${profile.name} · ${number} · Printed ${formatTimestamp(printedAt)}`)

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Debit note ${e(number)}</title>
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
  .c-amt { font-variant-numeric: tabular-nums; }
  header.brand { display: flex; justify-content: space-between; align-items: flex-start; gap: 12mm; padding-bottom: 4mm; border-bottom: 2px solid #111827; }
  .brand-name { font-size: 15pt; font-weight: 700; margin: 0; }
  .brand-legal { font-size: 9pt; color: #374151; margin: 1mm 0 0; }
  .brand-lines { margin: 1.5mm 0 0; color: #4b5563; font-size: 8.5pt; }
  .doc-title { text-align: right; flex-shrink: 0; }
  .doc-title h1 { margin: 0; font-size: 14pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; }
  .doc-title .doc-no { margin-top: 1mm; font-size: 10.5pt; font-weight: 600; }
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; margin: 5mm 0 3mm; }
  .party { border: 1px solid #d1d5db; border-radius: 1.5mm; padding: 2.5mm 3mm; }
  .party .name { font-weight: 600; font-size: 10.5pt; }
  .party .lines { color: #4b5563; font-size: 8.5pt; }
  .meta { display: grid; grid-template-columns: repeat(4, 1fr); border: 1px solid #d1d5db; border-radius: 1.5mm; margin: 0 0 4mm; }
  .meta-cell { padding: 2mm 3mm; border-right: 1px solid #e5e7eb; min-width: 0; }
  .meta-cell:last-child { border-right: 0; }
  .meta-label { font-size: 7pt; text-transform: uppercase; letter-spacing: 0.08em; color: #6b7280; font-weight: 600; }
  .meta-value { margin-top: 0.5mm; font-weight: 500; overflow-wrap: anywhere; }
  table.lines { width: 100%; border-collapse: collapse; }
  table.lines thead { display: table-header-group; }
  table.lines th { background: #f3f4f6; border-top: 1.5px solid #111827; border-bottom: 1px solid #111827; padding: 2mm; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.06em; text-align: left; font-weight: 700; }
  table.lines td { padding: 1.8mm 2mm; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  table.lines tr { break-inside: avoid; }
  .c-sn { width: 9mm; text-align: center; color: #6b7280; }
  .c-name { font-weight: 500; }
  .c-name .sub { display: block; color: #6b7280; font-weight: 400; font-size: 8pt; }
  .c-batch { width: 26mm; }
  .c-amt { width: 24mm; text-align: right; white-space: nowrap; }
  th.c-amt { text-align: right; }
  .totals { margin-left: auto; width: 80mm; margin-top: 3mm; border-collapse: collapse; }
  .totals td { padding: 1.2mm 2mm; }
  .totals td:last-child { text-align: right; font-variant-numeric: tabular-nums; }
  .totals tr.grand td { border-top: 1.5px solid #111827; border-bottom: 3px double #111827; font-weight: 700; font-size: 10.5pt; }
  .words, .narration { margin-top: 4mm; padding: 2.5mm 3mm; border: 1px solid #d1d5db; border-radius: 1.5mm; break-inside: avoid; }
  .words .meta-value { font-weight: 600; }
  .note { margin-top: 3mm; color: #374151; font-size: 8.5pt; }
  .signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10mm; margin-top: 18mm; break-inside: avoid; }
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
      <h1>Debit note</h1>
      <div class="doc-no mono">${e(number)}</div>
    </div>
  </header>
  <section class="parties">
    <div class="party">
      <div class="meta-label">Debit to (supplier)</div>
      <div class="name">${e(supplierName)}</div>
      <div class="lines">${supplierLines.map((l) => `<div>${l}</div>`).join("")}</div>
    </div>
    <div class="party">
      <div class="meta-label">Returned from</div>
      <div class="name">${e(profile.name)}</div>
      <div class="lines">${input.branchName ? `<div>Branch: ${e(input.branchName)}</div>` : ""}</div>
    </div>
  </section>
  <section class="meta" aria-label="Debit note details">
    ${metaCell("Date (AD)", e(formatAdLong(dn.returnDateUtc)))}
    ${metaCell("Date (BS)", e(formatBsLong(dn.returnDateUtc.slice(0, 10))))}
    ${metaCell("Against bill no.", dn.supplierInvoiceNumber ? `<span class="mono">${e(dn.supplierInvoiceNumber)}</span>` : "")}
    ${metaCell("Lines", e(String(dn.items.length)))}
  </section>
  <table class="lines">
    <thead>
      <tr>
        <th class="c-sn">S.N.</th>
        <th class="c-name">Particulars</th>
        <th class="c-batch">Batch</th>
        <th class="c-amt">Qty</th>
        <th class="c-amt">Rate (Rs)</th>
        <th class="c-amt">Amount (Rs)</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <table class="totals" aria-label="Totals">
    <tr><td>Taxable / goods value</td><td>${e(formatPrintAmount(dn.totalCost))}</td></tr>
    <tr><td>VAT reversed</td><td>${e(formatPrintAmount(vat))}</td></tr>
    <tr class="grand"><td>Total debit</td><td>${e(formatPrintAmount(total))}</td></tr>
  </table>
  <div class="words">
    <div class="meta-label">Amount in words</div>
    <div class="meta-value">${e(amountInWords(total))}</div>
  </div>
  ${dn.notes ? `<div class="narration"><div class="meta-label">Remarks</div><div>${e(dn.notes)}</div></div>` : ""}
  <p class="note">Your account has been debited with the amount above for the goods returned. Please adjust it against our payable${
    dn.supplierInvoiceNumber ? ` on bill ${e(dn.supplierInvoiceNumber)}` : ""
  }.</p>
  <section class="signatures" aria-label="Signatures">
    <div class="sig">Prepared by</div>
    <div class="sig">Approved by</div>
    <div class="sig">Received by (supplier)</div>
  </section>
  <div class="end">Printed ${e(formatTimestamp(printedAt))} &middot; This is a computer-generated debit note.</div>
</div>
</body>
</html>`
}
