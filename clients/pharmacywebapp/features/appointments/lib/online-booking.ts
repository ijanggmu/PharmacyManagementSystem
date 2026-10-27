/** Pure helpers for online booking: the patient's mobile number, the public link, and a doctor's days. */

import type { OnlineSitting } from "@/features/appointments/online-api"
import { escapeHtml } from "@/features/accounting/lib/html-escape"

/**
 * A Nepali mobile number as 10 digits (98…, 97…, 96…), or null. Spaces, dashes, dots and brackets are ignored, as is
 * a leading +977 / 977 / 00977. Mirrors the API's check so the patient hears about a typo before sending.
 */
export function normalizeNepaliMobile(phone: string): string | null {
  const trimmed = phone.trim()
  if (!/^\+?[\d\s\-.()]+$/.test(trimmed)) return null
  let digits = trimmed.replace(/\D/g, "")
  if (digits.startsWith("00977")) digits = digits.slice(5)
  else if (digits.startsWith("977") && digits.length === 13) digits = digits.slice(3)
  return /^9[678]\d{8}$/.test(digits) ? digits : null
}

/** The pharmacy's public booking link. The code makes it work on any address, with or without the pharmacy's own. */
export function onlineBookingLink(origin: string, pharmacyCode: string): string {
  return `${origin.replace(/\/+$/, "")}/book?code=${encodeURIComponent(pharmacyCode)}`
}

/** One doctor's sittings grouped by date, in date then time order. */
export function sittingsByDate(sittings: readonly OnlineSitting[], doctorId: string): { date: string; sittings: OnlineSitting[] }[] {
  const days = new Map<string, OnlineSitting[]>()
  for (const s of [...sittings].filter((x) => x.doctorId === doctorId).sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))) {
    const list = days.get(s.date) ?? []
    list.push(s)
    days.set(s.date, list)
  }
  return [...days.entries()].map(([date, list]) => ({ date, sittings: list }))
}

/** Whether the pharmacy has more than one branch on the page (then each sitting says where). */
export function showsBranches(sittings: readonly OnlineSitting[]): boolean {
  return new Set(sittings.map((s) => s.branchId)).size > 1
}

/** A4 counter poster: the pharmacy, a big QR and the link. Every value is HTML-escaped. */
export function buildBookingPosterHtml(p: { pharmacyName: string; title: string; hint: string; link: string; qrDataUrl: string }): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(p.title)}</title>
<style>
@page { size: A4; margin: 20mm; }
body { font-family: "Noto Sans Devanagari", Inter, Arial, sans-serif; text-align: center; color: #111; }
h1 { font-size: 30pt; margin: 0 0 6mm; }
h2 { font-size: 22pt; margin: 0 0 10mm; font-weight: 600; }
img { width: 110mm; height: 110mm; }
p { font-size: 15pt; margin: 8mm 0 0; }
.link { font-size: 12pt; word-break: break-all; color: #333; }
</style></head><body>
<h1>${escapeHtml(p.pharmacyName)}</h1>
<h2>${escapeHtml(p.title)}</h2>
<img src="${escapeHtml(p.qrDataUrl)}" alt="">
<p>${escapeHtml(p.hint)}</p>
<p class="link">${escapeHtml(p.link)}</p>
</body></html>`
}
