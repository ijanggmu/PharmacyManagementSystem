/**
 * IRD-style sales invoice for thermal (58/80mm) and A5 printers.
 *
 * `buildInvoicePrintHtml` is pure: it returns a complete HTML document with every interpolated value
 * HTML-escaped, so the same string drives the on-screen preview (iframe srcDoc) and the printout
 * (printHtmlDocument from the voucher printer). Layout follows Nepal IRD invoice requirements: seller
 * PAN, invoice number, BS + AD date, buyer details, taxable / exempt / VAT breakdown, amount in words,
 * and "COPY OF ORIGINAL" marking on every print after the first.
 *
 * `language: "ne"` prints the same layout in Nepali — "कर बीजक" / "संक्षिप्त कर बीजक", BS date first,
 * amount in Nepali words — with Devanagari digits unless `nepaliDigits` is false.
 */

import { amountInWords } from "@/features/accounting/lib/amount-in-words"
import { formatBsLong } from "@/features/accounting/lib/date-presets"
import { escapeHtml } from "@/features/accounting/lib/html-escape"
import { formatPrintAmount, type PrintProfile } from "@/features/accounting/lib/voucher-print"

import type { InvoicePaperFormat } from "@/lib/api/sales-api"
import { irdInvoiceType } from "@/lib/api/ird-api"
import type { Locale } from "@/lib/i18n/config"
import { amountInWordsNe, formatBsDate, groupSouthAsian, localizeDigits } from "@/lib/i18n/format"
import { createNamespaceTranslator, type NamespaceKey } from "@/lib/i18n/translate"

export type { InvoicePaperFormat }

export const INVOICE_PAPER_FORMATS: { value: InvoicePaperFormat; label: string; hint: string }[] = [
  { value: "thermal-80", label: "80 mm", hint: "Standard thermal roll" },
  { value: "thermal-58", label: "58 mm", hint: "Narrow thermal roll" },
  { value: "a5", label: "A5", hint: "Half-sheet laser / inkjet" },
]

export const DEFAULT_INVOICE_PAPER: InvoicePaperFormat = "thermal-80"
/** Tenant setting key holding the default paper format. */
export const INVOICE_PAPER_SETTING_KEY = "pharmacy.invoice_paper"

export function isInvoicePaperFormat(value: unknown): value is InvoicePaperFormat {
  return value === "thermal-58" || value === "thermal-80" || value === "a5"
}

export interface InvoiceLine {
  name: string
  /** Strength / form, shown under the name. */
  detail?: string | null
  /** Base units (e.g. tablets) — the quantity the rate and amount are in. */
  quantity: number
  /** How a pack sale reads, e.g. "2 strips (20 tablets)"; omitted for a line sold in base units. */
  unitNote?: string | null
  unitPrice: number
  /** Line discount in currency. */
  discount: number
  /** Line total after discount (VAT-inclusive). */
  total: number
  /** False for a VAT-exempt line — marked with * and summed under exempt. */
  taxable: boolean
}

export interface InvoicePayment {
  method: string
  amount: number
  reference?: string | null
}

export interface InvoicePrintInput {
  /** "invoice" (default) or "credit-note" — a credit note reverses (part of) an invoice. */
  kind?: "invoice" | "credit-note"
  /** Credit notes: the invoice being reversed, e.g. INV-MAIN-2083/84-00012. */
  againstInvoice?: string | null
  /** Credit notes: why the amount is being credited. */
  reason?: string | null
  profile: PrintProfile
  branchName?: string | null
  /** Null for a provisional receipt (e.g. an offline sale not yet synced). */
  invoiceNumber: string | null
  fiscalYear?: string | null
  /** ISO timestamp of the sale. */
  saleDate: string
  buyerName?: string | null
  buyerPhone?: string | null
  buyerPan?: string | null
  /** The prescription dispensed against (printed for Rx / controlled sales); omit for an OTC sale. */
  prescription?: { number: string | null; doctorName: string; doctorLicense?: string | null } | null
  /** Wholesale / custom price level the invoice was priced at; omitted / null = retail (not printed). */
  priceLevelName?: string | null
  /** The tenant's abbreviated-tax-invoice limit (IRD settings); omit to always print a full Tax Invoice. */
  abbreviatedThreshold?: number | null
  lines: InvoiceLine[]
  /** VAT breakdown as stored on the sale; omit (null) on legacy sales recorded without it. */
  vat: { ratePercent: number; taxableAmount: number; vatAmount: number; exemptAmount: number } | null
  total: number
  payments: InvoicePayment[]
  amountTendered?: number | null
  changeDue?: number | null
  cashier?: string | null
  footerNote?: string | null
  /** 1 = original; 2+ prints "COPY OF ORIGINAL — (n-1)". 0 = preview (no marking). */
  printNumber: number
  format: InvoicePaperFormat
  /** Defaults to now. Passed in for deterministic tests. */
  printedAt?: Date
  /** Print language; default "en". */
  language?: Locale
  /** Nepali prints only: Devanagari digits (default true). */
  nepaliDigits?: boolean
}

const e = escapeHtml

const METHOD_KEYS = ["cash", "card", "fonepay", "esewa", "khalti", "bank", "credit", "insurance", "mixed"] as const
type MethodKey = (typeof METHOD_KEYS)[number]

function isMethodKey(value: string): value is MethodKey {
  return (METHOD_KEYS as readonly string[]).includes(value)
}

export function paymentMethodLabel(method: string, language: Locale = "en"): string {
  const key = method.trim().toLowerCase()
  if (isMethodKey(key)) return createNamespaceTranslator(language, "print")(`methods.${key}`)
  return method.charAt(0).toUpperCase() + method.slice(1)
}

type PrintKey = NamespaceKey<"print">

/** "NMC 12345" — the number as typed when it already names the council ("NMC-12345"), else prefixed. */
function nmcLabel(license: string): string {
  const value = license.trim()
  return /^nmc\b/i.test(value) ? value : `NMC ${value}`
}

function adDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

function time(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
}

/** Local calendar date (the BS converter expects the date the customer saw on the counter). */
function localYmd(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function invoiceTitleKey(
  input: Pick<InvoicePrintInput, "invoiceNumber" | "vat" | "profile" | "kind"> &
    Partial<Pick<InvoicePrintInput, "buyerPan" | "total" | "abbreviatedThreshold">>,
): PrintKey {
  if (input.kind === "credit-note") return "titles.creditNote"
  if (!input.invoiceNumber) return "titles.provisionalReceipt"
  // A VAT-registered seller issues a Tax Invoice; otherwise a plain Invoice.
  if (!(input.profile.panVat && input.vat && input.vat.vatAmount > 0)) return "titles.invoice"
  // IRD: without a buyer PAN, a bill up to the threshold is an Abbreviated Tax Invoice.
  if (input.abbreviatedThreshold != null && input.total != null) {
    return irdInvoiceType(input.total, input.buyerPan, input.abbreviatedThreshold) === "abbreviated_tax_invoice"
      ? "titles.abbreviatedTaxInvoice"
      : "titles.taxInvoice"
  }
  return "titles.taxInvoice"
}

export function invoiceTitle(
  input: Pick<InvoicePrintInput, "invoiceNumber" | "vat" | "profile" | "kind"> &
    Partial<Pick<InvoicePrintInput, "buyerPan" | "total" | "abbreviatedThreshold" | "language">>,
): string {
  return createNamespaceTranslator(input.language ?? "en", "print")(invoiceTitleKey(input))
}

export function copyMarking(printNumber: number, language: Locale = "en", nepaliDigits = true): string | null {
  const t = createNamespaceTranslator(language, "print")
  if (printNumber > 1) return localizeDigits(t("marks.copyOfOriginal", { n: printNumber - 1 }), { locale: language, nepaliDigits })
  // The first recorded print is the buyer's original; 0 = preview/provisional (unrecorded).
  return printNumber === 1 ? t("marks.original") : null
}

const PAPER: Record<InvoicePaperFormat, { page: string; width: string; font: string; small: string; pad: string; family: string }> = {
  "thermal-58": { page: "58mm auto", width: "48mm", font: "10.5px", small: "9px", pad: "2mm 1mm", family: "'Courier New', ui-monospace, monospace" },
  "thermal-80": { page: "80mm auto", width: "72mm", font: "11.5px", small: "10px", pad: "3mm 2mm", family: "'Courier New', ui-monospace, monospace" },
  a5: { page: "A5", width: "auto", font: "10.5pt", small: "8.5pt", pad: "0", family: "'Segoe UI', Inter, Arial, sans-serif" },
}

/** Devanagari fallbacks for Nepali prints (thermal printers' monospace fonts have no Devanagari). */
const DEVANAGARI_FONTS = "'Noto Sans Devanagari', 'Nirmala UI', Mangal"

function row(label: string, value: string, cls = ""): string {
  return `<div class="row ${cls}"><span>${label}</span><span class="num">${value}</span></div>`
}

export function buildInvoicePrintHtml(input: InvoicePrintInput): string {
  const p = PAPER[input.format]
  const thermal = input.format !== "a5"
  const printedAt = input.printedAt ?? new Date()
  const language: Locale = input.language ?? "en"
  const ne = language === "ne"
  const display = { locale: language, nepaliDigits: input.nepaliDigits ?? true }
  const t = createNamespaceTranslator(language, "print")
  /** Labels and numbers in the print language (digits localized for Nepali). */
  const L = (key: PrintKey, params?: Record<string, string | number>) => localizeDigits(t(key, params), display)
  const amt = (n: number) => (ne ? localizeDigits(groupSouthAsian(n, 2), display) : formatPrintAmount(n))
  const num = (n: number | string) => localizeDigits(String(n), display)
  const title = invoiceTitle(input)
  const copy = copyMarking(input.printNumber, language, display.nepaliDigits)
  const { profile } = input

  const gross = input.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0)
  const discount = input.lines.reduce((s, l) => s + l.discount, 0)
  const hasExempt = input.lines.some((l) => !l.taxable)
  const ymd = localYmd(input.saleDate)

  const header = `
    <header class="head">
      <div class="seller">${e(profile.name)}</div>
      ${profile.legalName && profile.legalName !== profile.name ? `<div class="sub">${e(profile.legalName)}</div>` : ""}
      ${profile.address ? `<div class="sub">${e(profile.address)}</div>` : ""}
      ${profile.phone ? `<div class="sub">${L("labels.tel")}: ${e(profile.phone)}</div>` : ""}
      ${profile.panVat ? `<div class="pan">${L("labels.panVat")}: ${e(profile.panVat)}</div>` : ""}
      <div class="title">${e(title)}</div>
      ${copy ? `<div class="copy">${e(copy)}</div>` : ""}
    </header>`

  const meta = `
    <section class="meta">
      ${input.invoiceNumber ? row(L(input.kind === "credit-note" ? "labels.creditNoteNo" : "labels.invoiceNo"), e(input.invoiceNumber)) : ""}
      ${input.kind === "credit-note" && input.againstInvoice ? row(L("labels.againstInvoice"), e(input.againstInvoice)) : ""}
      ${input.fiscalYear ? row(L("labels.fiscalYear"), e(num(input.fiscalYear))) : ""}
      ${row(L("labels.dateBs"), e(ne ? formatBsDate(ymd, display) : formatBsLong(ymd)))}
      ${row(L("labels.dateAd"), `${e(num(adDate(input.saleDate)))} ${e(num(time(input.saleDate)))}`)}
      ${input.branchName ? row(L("labels.branch"), e(input.branchName)) : ""}
      <div class="rule"></div>
      ${row(L("labels.buyer"), e(input.buyerName?.trim() || L("labels.walkIn")))}
      ${input.buyerPhone ? row(L("labels.phone"), e(input.buyerPhone)) : ""}
      ${row(L("labels.buyerPan"), e(input.buyerPan?.trim() || "—"))}
      ${input.prescription?.number ? row(L("labels.prescriptionNo"), e(input.prescription.number)) : ""}
      ${input.prescription
        ? row(
            L("labels.doctor"),
            e(input.prescription.doctorLicense?.trim()
              ? `${input.prescription.doctorName} (${nmcLabel(input.prescription.doctorLicense)})`
              : input.prescription.doctorName),
          )
        : ""}
      ${input.priceLevelName?.trim() ? row(L("labels.priceLevel"), e(input.priceLevelName.trim())) : ""}
      ${row(L(input.kind === "credit-note" ? "labels.refundVia" : "labels.payment"), e(input.payments.length > 1 ? L("methods.mixed") : paymentMethodLabel(input.payments[0]?.method ?? "cash", language)))}
      ${input.kind === "credit-note" && input.reason ? `<div class="rule"></div>${row(L("labels.reason"), e(input.reason))}` : ""}
    </section>`

  const items = thermal
    ? `<section class="items">
        <div class="ihead"><span>${L("labels.particulars")}</span><span>${L("labels.amount")}</span></div>
        ${input.lines
          .map(
            (l, i) => `
          <div class="item">
            <div class="iname">${num(i + 1)}. ${e(l.name)}${l.taxable ? "" : " *"}</div>
            ${l.detail ? `<div class="idetail">${e(l.detail)}</div>` : ""}
            ${l.unitNote ? `<div class="idetail">${e(l.unitNote)}</div>` : ""}
            <div class="row"><span class="num">${e(num(l.quantity))} × ${amt(l.unitPrice)}${l.discount > 0 ? ` − ${amt(l.discount)}` : ""}</span><span class="num">${amt(l.total)}</span></div>
          </div>`,
          )
          .join("")}
      </section>`
    : `<table class="grid">
        <thead><tr><th class="c">${L("labels.sn")}</th><th>${L("labels.particulars")}</th><th class="r">${L("labels.qty")}</th><th class="r">${L("labels.rate")}</th><th class="r">${L("labels.disc")}</th><th class="r">${L("labels.amount")}</th></tr></thead>
        <tbody>
          ${input.lines
            .map(
              (l, i) => `<tr>
              <td class="c">${num(i + 1)}</td>
              <td>${e(l.name)}${l.taxable ? "" : " *"}${l.detail ? `<div class="idetail">${e(l.detail)}</div>` : ""}</td>
              <td class="r num">${e(num(l.quantity))}${l.unitNote ? `<div class="idetail">${e(l.unitNote)}</div>` : ""}</td>
              <td class="r num">${amt(l.unitPrice)}</td>
              <td class="r num">${l.discount > 0 ? amt(l.discount) : "—"}</td>
              <td class="r num">${amt(l.total)}</td>
            </tr>`,
            )
            .join("")}
        </tbody>
      </table>`

  const vat = input.vat
  const totals = `
    <section class="totals">
      ${row(L("labels.subTotal"), amt(gross))}
      ${discount > 0 ? row(L("labels.discount"), `− ${amt(discount)}`) : ""}
      ${
        vat
          ? `${row(L("labels.taxableAmount"), amt(vat.taxableAmount))}
             ${row(L("labels.vat", { rate: e(vat.ratePercent) }), amt(vat.vatAmount))}
             ${vat.exemptAmount > 0 || hasExempt ? row(L("labels.exemptAmount"), amt(vat.exemptAmount)) : ""}`
          : ""
      }
      ${row(L(input.kind === "credit-note" ? "labels.totalCredit" : "labels.grandTotal"), amt(input.total), "grand")}
      <div class="words">${ne ? `${L("labels.inWords")}: ${e(amountInWordsNe(input.total))}` : e(amountInWords(input.total))}</div>
    </section>`

  const tender =
    input.payments.length > 1 || (input.amountTendered ?? 0) > 0
      ? `<section class="tender">
          ${input.payments.length > 1 ? input.payments.map((pm) => row(e(paymentMethodLabel(pm.method, language)) + (pm.reference ? ` <span class="ref">${e(pm.reference)}</span>` : ""), amt(pm.amount))).join("") : ""}
          ${(input.amountTendered ?? 0) > 0 ? row(L("labels.tendered"), amt(input.amountTendered ?? 0)) : ""}
          ${(input.changeDue ?? 0) > 0 ? row(L("labels.change"), amt(input.changeDue ?? 0)) : ""}
        </section>`
      : ""

  const footer = `
    <footer class="foot">
      ${hasExempt ? `<div>${L("labels.exemptNote")}</div>` : ""}
      ${input.footerNote ? `<div class="note">${e(input.footerNote)}</div>` : `<div class="note">${L("labels.thankYou")}</div>`}
      <div class="small">${input.cashier ? `${L("labels.cashier")}: ${e(input.cashier)} · ` : ""}${L("labels.printed")} ${e(ne ? formatBsDate(printedAt, display) : adDate(printedAt.toISOString()))} ${e(num(time(printedAt)))}${input.printNumber > 0 ? ` · ${L("labels.printNo", { n: input.printNumber })}` : ""}</div>
    </footer>`

  return `<!DOCTYPE html>
<html lang="${language}">
<head>
<meta charset="utf-8" />
<title>${e(title)}${input.invoiceNumber ? ` ${e(input.invoiceNumber)}` : ""}</title>
<style>
  @page { size: ${p.page}; margin: ${thermal ? "0" : "10mm"}; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: #fff; color: #000; }
  body { font-family: ${ne ? p.family.replace(/(, [a-z-]+(?:, [a-z-]+)?)$/, `, ${DEVANAGARI_FONTS}$1`) : p.family}; font-size: ${p.font}; line-height: 1.35; width: ${p.width}; padding: ${p.pad}; ${thermal ? "" : "max-width: 128mm; margin: 0 auto;"} -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .num { font-variant-numeric: tabular-nums; white-space: nowrap; }
  .head { text-align: center; padding-bottom: 6px; border-bottom: 1px dashed #000; margin-bottom: 6px; }
  .seller { font-size: 1.3em; font-weight: 700; letter-spacing: 0.01em; }
  .sub { font-size: ${p.small}; }
  .pan { font-weight: 700; margin-top: 2px; }
  .title { margin-top: 6px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; }
  .copy { margin-top: 3px; display: inline-block; border: 1px solid #000; padding: 1px 6px; font-weight: 700; font-size: ${p.small}; }
  .row { display: flex; justify-content: space-between; gap: 8px; }
  .row > span:first-child { min-width: 0; overflow-wrap: anywhere; }
  .meta .row > span:first-child { color: #333; }
  .rule { border-top: 1px dotted #000; margin: 4px 0; }
  .items { border-top: 1px dashed #000; border-bottom: 1px dashed #000; margin: 6px 0; padding: 4px 0; }
  .ihead { display: flex; justify-content: space-between; font-weight: 700; margin-bottom: 3px; }
  .item { padding: 2px 0; }
  .iname { font-weight: 600; overflow-wrap: anywhere; }
  .idetail { font-size: ${p.small}; color: #444; }
  .grid { width: 100%; border-collapse: collapse; margin: 8px 0; }
  .grid th, .grid td { border: 1px solid #000; padding: 3px 5px; vertical-align: top; }
  .grid th { background: #f2f2f2; font-size: ${p.small}; text-transform: uppercase; letter-spacing: 0.04em; }
  .c { text-align: center; } .r { text-align: right; }
  .totals { margin-top: 4px; }
  .totals .row { padding: 1px 0; }
  .grand { font-weight: 700; font-size: 1.15em; border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 3px 0 !important; margin-top: 3px; }
  .words { font-size: ${p.small}; font-style: italic; margin-top: 4px; }
  .tender { border-top: 1px dashed #000; margin-top: 6px; padding-top: 4px; }
  .ref { font-size: ${p.small}; color: #444; }
  .foot { text-align: center; border-top: 1px dashed #000; margin-top: 8px; padding-top: 6px; }
  .note { margin: 3px 0; }
  .small { font-size: ${p.small}; color: #444; }
  ${thermal ? ".meta { font-size: " + p.small + "; }" : ".meta { display: grid; grid-template-columns: 1fr 1fr; column-gap: 24px; } .meta .rule { grid-column: 1 / -1; }"}
</style>
</head>
<body>
${header}
${meta}
${items}
${totals}
${tender}
${footer}
</body>
</html>`
}
