/**
 * Printable A4 voucher.
 *
 * `buildVoucherPrintHtml` is pure: it returns a complete HTML document in which every interpolated
 * value is HTML-escaped (or CSS-escaped inside the @page margin boxes). `printHtmlDocument` prints
 * that document from a hidden iframe, so there is no pop-up to block and no window left behind.
 */

import type { AccountingVoucherRow, VoucherLineView } from "@/features/accounting/api-client"
import { amountInWords } from "./amount-in-words"
import { formatBsLong } from "./date-presets"
import { escapeCssString, escapeHtml } from "./html-escape"
import { referenceTypeLabel } from "./reference-routes"
import {
  displayUserName,
  isBalanced,
  voucherDocumentTitle,
  voucherIdentifier,
  voucherStatusLabel,
  voucherTypeLabel,
} from "./voucher-meta"

export interface PrintProfile {
  name: string
  legalName?: string | null
  address?: string | null
  phone?: string | null
  email?: string | null
  panVat?: string | null
}

export interface VoucherPrintInput {
  voucher: AccountingVoucherRow
  lines: VoucherLineView[]
  profile: PrintProfile
  branchName?: string | null
  voidReason?: string | null
  /** Defaults to now. Passed in for deterministic tests. */
  printedAt?: Date
}

/** Fixed two-decimal money for print, Indian/Nepali digit grouping (1,23,456.70). */
export function formatPrintAmount(n: number): string {
  const value = Number.isFinite(n) ? n : 0
  return value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatAdLong(ymd: string): string {
  const [y, m, d] = ymd.slice(0, 10).split("-").map(Number)
  if (!y || !m || !d) return ymd
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

function formatTimestamp(d: Date): string {
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatIsoTimestamp(iso: string | null | undefined): string {
  if (!iso) return ""
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? "" : formatTimestamp(d)
}

const e = escapeHtml

function metaCell(label: string, value: string): string {
  return `<div class="meta-cell"><div class="meta-label">${e(label)}</div><div class="meta-value">${value || "&mdash;"}</div></div>`
}

export function buildVoucherPrintHtml(input: VoucherPrintInput): string {
  const { voucher, lines, profile } = input
  const printedAt = input.printedAt ?? new Date()
  const title = voucherDocumentTitle(voucher.voucher_type)
  const identifier = voucherIdentifier(voucher)
  const status = (voucher.status ?? "").toLowerCase()
  const watermark = status === "void" ? "VOID" : status === "draft" ? "DRAFT" : ""

  const totalDebit = lines.reduce((s, l) => s + (Number(l.debit_amount) || 0), 0)
  const totalCredit = lines.reduce((s, l) => s + (Number(l.credit_amount) || 0), 0)
  const balanced = isBalanced(totalDebit, totalCredit)

  const bsDate = formatBsLong(voucher.voucher_date)
  const reference = voucher.reference_type
    ? `${e(referenceTypeLabel(voucher.reference_type))}${voucher.reference_id ? ` <span class="mono">${e(voucher.reference_id)}</span>` : ""}`
    : "Manual entry"
  const postedBy = displayUserName(voucher.posted_by)
  const postedAt = formatIsoTimestamp(voucher.posted_at)

  const headerLines = [
    profile.address ? e(profile.address) : "",
    [profile.phone ? `Phone: ${e(profile.phone)}` : "", profile.email ? `Email: ${e(profile.email)}` : ""]
      .filter(Boolean)
      .join(" &nbsp;|&nbsp; "),
    profile.panVat ? `PAN/VAT No.: <span class="mono">${e(profile.panVat)}</span>` : "",
  ].filter(Boolean)

  const rows = lines
    .slice()
    .sort((a, b) => a.line_no - b.line_no)
    .map((line, i) => {
      const dr = Number(line.debit_amount) || 0
      const cr = Number(line.credit_amount) || 0
      return `<tr>
        <td class="c-sn">${i + 1}</td>
        <td class="c-code mono">${e(line.accounting_accounts?.code ?? "")}</td>
        <td class="c-name">${e(line.accounting_accounts?.name ?? "Unknown account")}</td>
        <td class="c-memo">${e(line.description ?? "")}</td>
        <td class="c-amt">${dr ? e(formatPrintAmount(dr)) : ""}</td>
        <td class="c-amt">${cr ? e(formatPrintAmount(cr)) : ""}</td>
      </tr>`
    })
    .join("")

  const emptyRow = lines.length === 0 ? `<tr><td colspan="6" class="empty">This voucher has no lines.</td></tr>` : ""

  const footerLeft = escapeCssString(
    `${profile.name} · ${voucher.voucher_no} · Printed ${formatTimestamp(printedAt)}`,
  )

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${e(title)} ${e(voucher.voucher_no)}</title>
<style>
  @page {
    size: A4 portrait;
    margin: 12mm 12mm 16mm 12mm;
    @bottom-left { content: "${footerLeft}"; font: 8pt "Inter", "Segoe UI", Arial, sans-serif; color: #6b7280; }
    @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 8pt "Inter", "Segoe UI", Arial, sans-serif; color: #6b7280; }
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: "Inter", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 9.5pt;
    line-height: 1.45;
    color: #111827;
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page { max-width: 186mm; margin: 0 auto; padding: 4mm 0; position: relative; }
  .mono { font-family: "JetBrains Mono", "Consolas", "SFMono-Regular", monospace; font-size: 0.95em; }
  .num, .c-amt { font-variant-numeric: tabular-nums; }
  header.brand { display: flex; justify-content: space-between; align-items: flex-start; gap: 12mm; padding-bottom: 4mm; border-bottom: 2px solid #111827; }
  .brand-name { font-size: 15pt; font-weight: 700; letter-spacing: -0.01em; margin: 0; }
  .brand-legal { font-size: 9pt; color: #374151; margin: 1mm 0 0; }
  .brand-lines { margin: 1.5mm 0 0; color: #4b5563; font-size: 8.5pt; }
  .brand-lines div { margin: 0.3mm 0; }
  .doc-title { text-align: right; flex-shrink: 0; }
  .doc-title h1 { margin: 0; font-size: 14pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; }
  .doc-title .doc-no { margin-top: 1mm; font-size: 10.5pt; font-weight: 600; }
  .tag { display: inline-block; margin-top: 1.5mm; padding: 0.4mm 2mm; border: 1px solid #111827; border-radius: 1mm; font-size: 7.5pt; font-weight: 700; letter-spacing: 0.08em; }
  .tag.status-void { border-color: #b91c1c; color: #b91c1c; }
  .tag.status-draft { border-color: #6b7280; color: #374151; }
  .meta { display: grid; grid-template-columns: repeat(4, 1fr); border: 1px solid #d1d5db; border-radius: 1.5mm; margin: 5mm 0 4mm; }
  .meta-cell { padding: 2mm 3mm; border-right: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; min-width: 0; }
  .meta-cell:nth-child(4n) { border-right: 0; }
  .meta-cell.wide { grid-column: span 2; }
  .meta-label { font-size: 7pt; text-transform: uppercase; letter-spacing: 0.08em; color: #6b7280; font-weight: 600; }
  .meta-value { margin-top: 0.5mm; font-weight: 500; overflow-wrap: anywhere; }
  .meta-value .sub { display: block; color: #6b7280; font-weight: 400; font-size: 8.5pt; }
  table.lines { width: 100%; border-collapse: collapse; margin-top: 2mm; }
  table.lines thead { display: table-header-group; }
  table.lines tfoot { display: table-row-group; }
  table.lines th { background: #f3f4f6; border-top: 1.5px solid #111827; border-bottom: 1px solid #111827; padding: 2mm 2mm; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.06em; text-align: left; font-weight: 700; }
  table.lines td { padding: 1.8mm 2mm; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  table.lines tbody tr:nth-child(even) td { background: #fafafa; }
  table.lines tr { break-inside: avoid; page-break-inside: avoid; }
  .c-sn { width: 9mm; text-align: center; color: #6b7280; }
  .c-code { width: 18mm; white-space: nowrap; }
  .c-name { width: 52mm; font-weight: 500; }
  .c-memo { color: #374151; }
  .c-amt { width: 28mm; text-align: right; white-space: nowrap; }
  th.c-amt { text-align: right; }
  th.c-sn { text-align: center; }
  table.lines tfoot td { border-top: 1.5px solid #111827; border-bottom: 3px double #111827; font-weight: 700; background: #f9fafb; }
  .empty { text-align: center; color: #6b7280; padding: 6mm; }
  .check { font-size: 8pt; margin-top: 1.5mm; text-align: right; color: #374151; }
  .check.bad { color: #b91c1c; font-weight: 600; }
  .words { margin-top: 4mm; padding: 2.5mm 3mm; border: 1px solid #d1d5db; border-radius: 1.5mm; break-inside: avoid; }
  .words .meta-label { margin-bottom: 0.5mm; }
  .words .meta-value { font-weight: 600; }
  .narration { margin-top: 3mm; padding: 2.5mm 3mm; border: 1px solid #d1d5db; border-radius: 1.5mm; min-height: 14mm; break-inside: avoid; white-space: pre-wrap; }
  .void-note { margin-top: 3mm; padding: 2.5mm 3mm; border: 1px solid #b91c1c; border-radius: 1.5mm; color: #b91c1c; break-inside: avoid; }
  .signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10mm; margin-top: 18mm; break-inside: avoid; }
  .sig { text-align: center; font-size: 8.5pt; }
  .sig .who { min-height: 5mm; font-weight: 600; }
  .sig .line { border-top: 1px solid #111827; padding-top: 1.5mm; margin-top: 1mm; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; font-size: 7.5pt; }
  .sig .when { color: #6b7280; font-size: 7.5pt; margin-top: 0.5mm; min-height: 3mm; }
  .end { margin-top: 8mm; text-align: center; color: #9ca3af; font-size: 7.5pt; }
  .watermark { position: fixed; top: 45%; left: 0; right: 0; text-align: center; transform: rotate(-30deg); font-size: 110pt; font-weight: 800; letter-spacing: 0.1em; color: rgba(185, 28, 28, 0.09); pointer-events: none; z-index: 0; }
  .watermark.draft { color: rgba(17, 24, 39, 0.07); }
  .content { position: relative; z-index: 1; }
  @media screen {
    body { background: #e5e7eb; }
    .page { background: #fff; padding: 12mm; margin: 8mm auto; box-shadow: 0 1px 3px rgba(0,0,0,0.15); max-width: 210mm; min-height: 297mm; }
  }
</style>
</head>
<body>
${watermark ? `<div class="watermark${watermark === "DRAFT" ? " draft" : ""}" aria-hidden="true">${watermark}</div>` : ""}
<div class="page"><div class="content">
  <header class="brand">
    <div>
      <p class="brand-name">${e(profile.name)}</p>
      ${profile.legalName && profile.legalName !== profile.name ? `<p class="brand-legal">${e(profile.legalName)}</p>` : ""}
      <div class="brand-lines">${headerLines.map((l) => `<div>${l}</div>`).join("")}</div>
    </div>
    <div class="doc-title">
      <h1>${e(title)}</h1>
      <div class="doc-no mono">${e(voucher.voucher_no)}</div>
      <span class="tag">${e(identifier)}</span>
      ${status !== "posted" ? ` <span class="tag status-${e(status)}">${e(voucherStatusLabel(voucher.status).toUpperCase())}</span>` : ""}
    </div>
  </header>

  <section class="meta" aria-label="Voucher details">
    ${metaCell("Voucher no.", `<span class="mono">${e(voucher.voucher_no)}</span>`)}
    ${metaCell("Date (AD)", e(formatAdLong(voucher.voucher_date)))}
    ${metaCell("Date (BS)", e(bsDate))}
    ${metaCell("Status", e(voucherStatusLabel(voucher.status)))}
    ${metaCell("Voucher type", e(voucherTypeLabel(voucher.voucher_type)))}
    ${metaCell("Source", `${e(identifier)} <span class="sub">${e(identifier === "MJE" ? "Manual journal entry" : "System posting")}</span>`)}
    <div class="meta-cell wide"><div class="meta-label">Reference</div><div class="meta-value">${reference}</div></div>
    ${metaCell("Branch", e(input.branchName ?? ""))}
    ${metaCell("Lines", e(String(lines.length)))}
    <div class="meta-cell wide"><div class="meta-label">Posted</div><div class="meta-value">${
      postedAt || postedBy ? `${e(postedAt)}${postedBy ? ` &middot; ${e(postedBy)}` : ""}` : "&mdash;"
    }</div></div>
  </section>

  <table class="lines">
    <thead>
      <tr>
        <th class="c-sn">S.N.</th>
        <th class="c-code">Code</th>
        <th class="c-name">Account name</th>
        <th class="c-memo">Particulars</th>
        <th class="c-amt">Debit (Rs)</th>
        <th class="c-amt">Credit (Rs)</th>
      </tr>
    </thead>
    <tbody>${rows}${emptyRow}</tbody>
    <tfoot>
      <tr>
        <td colspan="4">Total</td>
        <td class="c-amt">${e(formatPrintAmount(totalDebit))}</td>
        <td class="c-amt">${e(formatPrintAmount(totalCredit))}</td>
      </tr>
    </tfoot>
  </table>
  <div class="check${balanced ? "" : " bad"}">${
    balanced
      ? "Debits equal credits"
      : `Out of balance by Rs ${e(formatPrintAmount(Math.abs(totalDebit - totalCredit)))}`
  }</div>

  <div class="words">
    <div class="meta-label">Amount in words</div>
    <div class="meta-value">${e(amountInWords(Math.max(totalDebit, totalCredit)))}</div>
  </div>

  <div class="narration">
    <div class="meta-label">Narration</div>
    <div>${e(voucher.narration ?? "") || "&mdash;"}</div>
  </div>

  ${
    status === "void"
      ? `<div class="void-note"><strong>This voucher is void.</strong>${input.voidReason ? ` Reason: ${e(input.voidReason)}` : " It no longer affects the ledger."}</div>`
      : ""
  }

  <section class="signatures" aria-label="Signatures">
    <div class="sig"><div class="who">${e(postedBy ?? "")}</div><div class="line">Prepared by</div><div class="when">${e(postedAt)}</div></div>
    <div class="sig"><div class="who"></div><div class="line">Checked by</div><div class="when"></div></div>
    <div class="sig"><div class="who"></div><div class="line">Approved by</div><div class="when"></div></div>
  </section>

  <div class="end">Printed ${e(formatTimestamp(printedAt))} &middot; This is a computer-generated voucher.</div>
</div></div>
</body>
</html>`
}

/**
 * Prints an HTML document from a hidden iframe. Resolves once the print dialog has been opened.
 * Browser-only.
 */
export function printHtmlDocument(html: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("Printing is only available in the browser"))
      return
    }
    const iframe = document.createElement("iframe")
    iframe.setAttribute("aria-hidden", "true")
    iframe.setAttribute("tabindex", "-1")
    iframe.style.position = "fixed"
    iframe.style.right = "0"
    iframe.style.bottom = "0"
    iframe.style.width = "0"
    iframe.style.height = "0"
    iframe.style.border = "0"
    iframe.style.visibility = "hidden"
    document.body.appendChild(iframe)

    const cleanup = () => {
      window.setTimeout(() => iframe.remove(), 500)
    }

    const win = iframe.contentWindow
    const doc = iframe.contentDocument ?? win?.document
    if (!win || !doc) {
      iframe.remove()
      reject(new Error("Unable to prepare the print preview"))
      return
    }
    doc.open()
    doc.write(html)
    doc.close()

    const run = () => {
      try {
        win.focus()
        win.addEventListener("afterprint", cleanup, { once: true })
        win.print()
        // Some browsers never fire afterprint for iframes; fall back to removing it later.
        window.setTimeout(cleanup, 60_000)
        resolve()
      } catch (err) {
        iframe.remove()
        reject(err instanceof Error ? err : new Error("Print failed"))
      }
    }

    // Give the iframe a tick to lay out fonts and styles before printing.
    if (doc.readyState === "complete") window.setTimeout(run, 50)
    else iframe.addEventListener("load", () => window.setTimeout(run, 50), { once: true })
  })
}
