/**
 * Expiry claims to suppliers: DTO shapes from the .NET Suppliers module, selection and acceptance helpers, and the
 * printable claim letter. Pure — no fetching.
 */

import { escapeHtml } from "@/features/accounting/lib/html-escape"
import { formatPrintAmount, type PrintProfile } from "@/features/accounting/lib/voucher-print"

export type ExpiryClaimStatus = "Draft" | "Sent" | "Accepted" | "Credited" | "Rejected"
export type LotAttribution = "Receipt" | "PreferredSupplier" | "Unknown"

export interface ExpiryClaimCandidateLot {
  batchId: string
  medicineId: string
  medicineName: string
  batchNo: string
  expiryDate: string
  daysUntilExpiry: number
  isExpired: boolean
  quantityOnHand: number
  alreadyClaimedQuantity: number
  claimableQuantity: number
  unitCost: number
  claimableValue: number
  attribution: LotAttribution
}

export interface ExpiryClaimCandidateGroup {
  supplierId: string | null
  supplierName: string | null
  lots: ExpiryClaimCandidateLot[]
  totalValue: number
}

export interface ExpiryClaimLine {
  id: string
  medicineId: string
  medicineName: string
  batchId: string
  batchNo: string
  expiryDate: string
  quantity: number
  unitCost: number
  value: number
  acceptedQuantity: number | null
}

export interface ExpiryClaim {
  id: string
  claimNumber: string
  supplierId: string
  supplierName: string | null
  branchId: string | null
  status: ExpiryClaimStatus
  notes: string | null
  createdAtUtc: string
  sentAtUtc: string | null
  respondedAtUtc: string | null
  creditedAtUtc: string | null
  supplierReturnId: string | null
  debitNoteNumber: string | null
  supplierCreditNoteNumber: string | null
  rejectionReason: string | null
  claimedValue: number
  acceptedValue: number
  lineCount: number
  lines: ExpiryClaimLine[]
}

export const EXPIRY_CLAIM_STATUSES: ExpiryClaimStatus[] = ["Draft", "Sent", "Accepted", "Credited", "Rejected"]

export function claimStatusVariant(status: ExpiryClaimStatus): "secondary" | "warning" | "default" | "success" | "muted" {
  switch (status) {
    case "Draft":
      return "secondary"
    case "Sent":
      return "warning"
    case "Accepted":
      return "default"
    case "Credited":
      return "success"
    case "Rejected":
      return "muted"
  }
}

export type ClaimAction = "send" | "accept" | "reject" | "credit"

/** What can be done to a claim next. */
export function claimActions(status: ExpiryClaimStatus): ClaimAction[] {
  switch (status) {
    case "Draft":
      return ["send", "reject"]
    case "Sent":
      return ["accept", "reject"]
    case "Accepted":
      return ["credit"]
    default:
      return []
  }
}

export function attributionLabel(attribution: LotAttribution): string {
  switch (attribution) {
    case "Receipt":
      return "From a receipt"
    case "PreferredSupplier":
      return "Preferred supplier (assumed)"
    case "Unknown":
      return "Supplier unknown"
  }
}

export function expiryLabel(lot: Pick<ExpiryClaimCandidateLot, "daysUntilExpiry">): string {
  const d = lot.daysUntilExpiry
  if (d < 0) return `Expired ${-d}d ago`
  if (d === 0) return "Expires today"
  return `Expires in ${d}d`
}

/** Selected quantities per batch → claim lines (zero / invalid quantities dropped, capped at what's claimable). */
export function selectionToLines(
  lots: ExpiryClaimCandidateLot[],
  selected: Record<string, number>,
): { batchId: string; quantity: number }[] {
  return lots
    .filter((l) => selected[l.batchId] !== undefined)
    .map((l) => ({ batchId: l.batchId, quantity: Math.min(Math.max(0, selected[l.batchId]), l.claimableQuantity) }))
    .filter((l) => l.quantity > 0)
}

export function selectionValue(lots: ExpiryClaimCandidateLot[], selected: Record<string, number>): number {
  const byId = new Map(lots.map((l) => [l.batchId, l]))
  const total = selectionToLines(lots, selected).reduce((sum, l) => sum + l.quantity * (byId.get(l.batchId)?.unitCost ?? 0), 0)
  return Math.round(total * 100) / 100
}

/** Default answer to a claim: every line accepted in full. */
export function fullAcceptance(lines: ExpiryClaimLine[]): Record<string, number> {
  return Object.fromEntries(lines.map((l) => [l.id, l.quantity]))
}

/** Accepted lines for the API (every line sent, so a 0 is explicit) and the value going on the debit note. */
export function acceptanceSummary(
  lines: ExpiryClaimLine[],
  accepted: Record<string, number>,
): { lines: { lineId: string; acceptedQuantity: number }[]; value: number; anyAccepted: boolean; valid: boolean } {
  let value = 0
  let valid = true
  const out = lines.map((l) => {
    const q = accepted[l.id] ?? l.quantity
    if (!Number.isFinite(q) || q < 0 || q > l.quantity) valid = false
    value += Math.max(0, Math.min(q, l.quantity)) * l.unitCost
    return { lineId: l.id, acceptedQuantity: q }
  })
  return { lines: out, value: Math.round(value * 100) / 100, anyAccepted: out.some((l) => l.acceptedQuantity > 0), valid }
}

export interface ClaimLetterInput {
  claim: ExpiryClaim
  profile: PrintProfile
  supplier?: { name: string; address?: string | null; phone?: string | null; panVat?: string | null } | null
  branchName?: string | null
  printedAt?: Date
}

const e = escapeHtml

/** Printable A4 claim letter asking the supplier to take back / credit the listed near-expiry lots. */
export function buildClaimLetterHtml(input: ClaimLetterInput): string {
  const { claim, profile } = input
  const date = (input.printedAt ?? new Date()).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
  const supplierName = input.supplier?.name ?? claim.supplierName ?? "Supplier"
  const rows = claim.lines
    .map(
      (l, i) => `<tr>
        <td class="r">${i + 1}</td>
        <td>${e(l.medicineName)}</td>
        <td class="mono">${e(l.batchNo)}</td>
        <td>${e(l.expiryDate)}</td>
        <td class="r">${e(l.quantity)}</td>
        <td class="r">${e(formatPrintAmount(l.unitCost))}</td>
        <td class="r">${e(formatPrintAmount(l.value))}</td>
      </tr>`,
    )
    .join("")

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${e(claim.claimNumber)} expiry claim</title>
<style>
  @page { size: A4; margin: 16mm; }
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; font-size: 12px; color: #111; }
  .head { text-align: center; border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 14px; }
  .head h1 { font-size: 18px; margin: 0; }
  .meta { display: flex; justify-content: space-between; margin-bottom: 14px; line-height: 1.6; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0; }
  th, td { border: 1px solid #999; padding: 5px 6px; text-align: left; }
  th { background: #f1f1f1; }
  .r { text-align: right; }
  .mono { font-family: ui-monospace, Menlo, Consolas, monospace; }
  .total td { font-weight: 700; }
  .sign { margin-top: 48px; display: flex; justify-content: space-between; }
  .sign div { width: 40%; border-top: 1px solid #111; padding-top: 4px; }
</style></head>
<body>
  <div class="head">
    <h1>${e(profile.legalName || profile.name)}</h1>
    ${profile.address ? `<div>${e(profile.address)}</div>` : ""}
    ${profile.panVat ? `<div>PAN/VAT No.: <span class="mono">${e(profile.panVat)}</span></div>` : ""}
    ${input.branchName ? `<div>${e(input.branchName)}</div>` : ""}
  </div>
  <div class="meta">
    <div>
      To,<br><strong>${e(supplierName)}</strong>
      ${input.supplier?.address ? `<br>${e(input.supplier.address)}` : ""}
      ${input.supplier?.phone ? `<br>Phone: ${e(input.supplier.phone)}` : ""}
      ${input.supplier?.panVat ? `<br>PAN/VAT: <span class="mono">${e(input.supplier.panVat)}</span>` : ""}
    </div>
    <div style="text-align:right">
      Ref: <strong class="mono">${e(claim.claimNumber)}</strong><br>Date: ${e(date)}
    </div>
  </div>
  <p><strong>Subject: Claim for return / credit of expired and near-expiry stock</strong></p>
  <p>Dear Sir/Madam,</p>
  <p>The following lots supplied by you have expired or are close to expiry and can no longer be sold. We request
  you to take them back and issue a credit note for their value as per our trade terms.</p>
  <table>
    <thead><tr><th class="r">#</th><th>Medicine</th><th>Batch</th><th>Expiry</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th></tr></thead>
    <tbody>
      ${rows}
      <tr class="total"><td colspan="6" class="r">Total claimed</td><td class="r">${e(formatPrintAmount(claim.claimedValue))}</td></tr>
    </tbody>
  </table>
  ${claim.notes ? `<p>${e(claim.notes)}</p>` : ""}
  <p>Kindly confirm the quantities you accept so we can send the goods back with our debit note.</p>
  <p>Thank you.</p>
  <div class="sign"><div>For ${e(profile.name)}</div><div>Received by (supplier)</div></div>
</body></html>`
}
