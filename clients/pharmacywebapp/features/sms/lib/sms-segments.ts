/**
 * SMS length and segment counting — the same rules as the API's SmsText (Notifications module), so the counter under a
 * template matches what the gateway bills. A message entirely in the GSM 03.38 7-bit alphabet is sent as GSM: 160
 * characters in one SMS, 153 per part once split; characters of the GSM extension table (^ { } \ [ ~ ] | € and form
 * feed) take two. Anything else — Devanagari included — is sent as Unicode: 70 characters in one SMS, 67 per part.
 * Length is counted in UTF-16 code units, as the gateways count it.
 */

export type SmsEncoding = "GSM" | "Unicode"

export interface SmsSegmentInfo {
  encoding: SmsEncoding
  /** Length in the encoding's units (GSM extension characters count 2). */
  length: number
  segments: number
  /** Characters per SMS at this size (160/153 GSM, 70/67 Unicode). */
  perSegment: number
  /** Characters left before another SMS part is needed. */
  remaining: number
}

export const GSM_SINGLE = 160
export const GSM_PART = 153
export const UNICODE_SINGLE = 70
export const UNICODE_PART = 67

const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà"
const GSM_EXTENDED = "^{}\\[~]|€\f"

const BASIC = new Set(GSM_BASIC.split(""))
const EXTENDED = new Set(GSM_EXTENDED.split(""))

/** True when every UTF-16 unit of the text is in the GSM 7-bit alphabet (basic or extension table). */
export function isGsm(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (!BASIC.has(ch) && !EXTENDED.has(ch)) return false
  }
  return true
}

function build(encoding: SmsEncoding, length: number, single: number, part: number): SmsSegmentInfo {
  if (length === 0) return { encoding, length: 0, segments: 0, perSegment: single, remaining: single }
  if (length <= single) return { encoding, length, segments: 1, perSegment: single, remaining: single - length }
  const segments = Math.ceil(length / part)
  return { encoding, length, segments, perSegment: part, remaining: segments * part - length }
}

export function countSms(text: string | null | undefined): SmsSegmentInfo {
  const value = text ?? ""
  if (isGsm(value)) {
    let length = 0
    for (let i = 0; i < value.length; i++) length += EXTENDED.has(value[i]) ? 2 : 1
    return build("GSM", length, GSM_SINGLE, GSM_PART)
  }
  return build("Unicode", value.length, UNICODE_SINGLE, UNICODE_PART)
}

/** "64 / 160 · 1 SMS" or "75 chars · 2 SMS (Unicode)" — the counter shown under a template. */
export function describeSms(info: SmsSegmentInfo): string {
  const parts = info.segments === 1 ? "1 SMS" : `${info.segments} SMS`
  const size = info.segments <= 1 ? `${info.length} / ${info.perSegment}` : `${info.length} chars`
  return `${size} · ${parts}${info.encoding === "Unicode" ? " (Unicode)" : ""}`
}
