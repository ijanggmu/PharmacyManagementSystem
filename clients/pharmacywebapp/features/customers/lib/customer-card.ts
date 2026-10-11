import { escapeHtml } from "@/features/accounting/lib/html-escape"
import type { PrintProfile } from "@/features/accounting/lib/voucher-print"

export interface CustomerCardInput {
  profile: PrintProfile
  customerName: string
  code: string
  phone?: string | null
  /** ISO date the customer joined; shown as "Member since". */
  memberSince?: string | null
  /** PNG data URL of the QR encoding `code`. */
  qrDataUrl: string
  /** How many copies to put on the sheet (1–10). */
  copies?: number
}

/** What the card's QR encodes: just the customer number, so any scanner "types" it into the search box. */
export function customerCardQrValue(code: string): string {
  return code.trim().toUpperCase()
}

/** QR image for the card. Browser-only; the qrcode lib loads on demand. */
export async function customerCardQrDataUrl(code: string): Promise<string> {
  const { default: QRCode } = await import("qrcode")
  return QRCode.toDataURL(customerCardQrValue(code), {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 360,
    color: { dark: "#0b1f1d", light: "#ffffff" },
  })
}

function memberSince(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString("en-GB", { month: "short", year: "numeric" })
}

/**
 * A printable customer card at ID-1 / CR80 size (85.6 × 54 mm, the bank-card size that fits a
 * wallet and standard PVC card printers or a laminated A4 cut-out). One card per copy, laid out
 * for cutting. All text is escaped; the QR is an inline data URL.
 */
export function buildCustomerCardHtml(input: CustomerCardInput): string {
  const copies = Math.max(1, Math.min(10, Math.floor(input.copies ?? 1)))
  const since = memberSince(input.memberSince)
  const contact = [input.profile.phone, input.profile.address].filter(Boolean).join(" · ")

  const card = `<section class="card" aria-label="Customer card">
  <div class="band">
    <div class="brand">
      <span class="logo" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
      </span>
      <span class="pharmacy">${escapeHtml(input.profile.name || "Pharmacy")}</span>
    </div>
    <span class="tag">MEMBER CARD</span>
  </div>
  <div class="body">
    <div class="who">
      <div class="label">Customer</div>
      <div class="name">${escapeHtml(input.customerName)}</div>
      <div class="label">Customer no.</div>
      <div class="code">${escapeHtml(input.code)}</div>
      ${input.phone ? `<div class="meta">${escapeHtml(input.phone)}</div>` : ""}
      ${since ? `<div class="meta">Member since ${escapeHtml(since)}</div>` : ""}
    </div>
    <div class="qr"><img src="${escapeHtml(input.qrDataUrl)}" alt="QR code for ${escapeHtml(input.code)}" /></div>
  </div>
  <div class="foot">${escapeHtml(contact || "Show this card at the counter")}</div>
</section>`

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Customer card — ${escapeHtml(input.code)}</title>
<style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Plus Jakarta Sans", "Inter", Arial, Helvetica, sans-serif; color: #0b1f1d;
         -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .sheet { display: flex; flex-wrap: wrap; gap: 6mm; }
  .card { width: 85.6mm; height: 54mm; border-radius: 3.5mm; overflow: hidden; position: relative;
          background: linear-gradient(160deg, #ffffff 0%, #f0fdfa 100%); border: 0.25mm solid #99d5cf;
          display: flex; flex-direction: column; break-inside: avoid; page-break-inside: avoid; }
  .band { height: 11mm; padding: 0 4mm; display: flex; align-items: center; justify-content: space-between;
          background: linear-gradient(120deg, #0f766e 0%, #0d9488 60%, #14b8a6 100%); color: #fff; }
  .brand { display: flex; align-items: center; gap: 2mm; min-width: 0; }
  .logo { width: 6mm; height: 6mm; border-radius: 1.6mm; background: rgba(255,255,255,0.18); display: grid; place-items: center; flex: none; }
  .pharmacy { font-weight: 700; font-size: 9pt; letter-spacing: 0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tag { font-size: 5.5pt; font-weight: 700; letter-spacing: 0.14em; opacity: 0.9; flex: none; }
  .body { flex: 1; display: flex; gap: 3mm; padding: 3mm 4mm 0 4mm; }
  .who { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; }
  .label { font-size: 5.5pt; text-transform: uppercase; letter-spacing: 0.12em; color: #5b7471; margin-top: 1mm; }
  .name { font-size: 11pt; font-weight: 700; line-height: 1.15; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .code { font-family: "JetBrains Mono", "Consolas", monospace; font-size: 12pt; font-weight: 700; letter-spacing: 0.06em; color: #0f766e; }
  .meta { font-size: 7pt; color: #3b5552; margin-top: 0.6mm; }
  .qr { width: 27mm; display: grid; place-items: center; }
  .qr img { width: 26mm; height: 26mm; border-radius: 1.5mm; background: #fff; padding: 1mm; border: 0.2mm solid #d5ebe8; }
  .foot { height: 7mm; padding: 0 4mm; display: flex; align-items: center; font-size: 6pt; color: #3b5552;
          border-top: 0.2mm solid #d5ebe8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  @media screen { body { padding: 8px; background: #f4f7f7; } }
</style>
</head>
<body><div class="sheet">${Array.from({ length: copies }, () => card).join("")}</div></body>
</html>`
}
