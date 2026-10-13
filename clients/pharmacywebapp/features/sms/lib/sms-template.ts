/**
 * SMS template helpers shared by the settings form: the placeholders, a preview renderer with sample values, and the
 * checks the API also runs (UpdateSmsSettingsCommandValidator) — unknown placeholders and the STOP opt-out line a refill
 * reminder must keep.
 */

export const SMS_PLACEHOLDERS = ["{customer}", "{amount}", "{due_date}", "{pharmacy}", "{invoice}"] as const

export type SmsTemplateKind = "DuesReminder" | "RefillReminder" | "Receipt"
export type SmsLanguage = "en" | "ne"

export const SMS_TEMPLATE_KINDS: readonly SmsTemplateKind[] = ["DuesReminder", "RefillReminder", "Receipt"]
export const SMS_LANGUAGES: readonly SmsLanguage[] = ["en", "ne"]

export const SMS_TEMPLATE_LABELS: Record<SmsTemplateKind, string> = {
  DuesReminder: "Dues reminder",
  RefillReminder: "Refill reminder",
  Receipt: "Sale receipt",
}

export const SMS_LANGUAGE_LABELS: Record<SmsLanguage, string> = { en: "English", ne: "नेपाली" }

/** Same cap as the API (SmsTemplates.MaxTemplateLength). */
export const MAX_TEMPLATE_LENGTH = 640

export interface SmsTemplateValues {
  customer?: string | null
  amount?: string | null
  due_date?: string | null
  pharmacy?: string | null
  invoice?: string | null
}

const PLACEHOLDER = /\{([a-zA-Z_]+)\}/g

/** Fills the placeholders (case-insensitive); unknown ones stay as typed. Gaps left by empty values collapse. */
export function renderSmsTemplate(template: string, values: SmsTemplateValues): string {
  const text = template.replace(PLACEHOLDER, (match, name: string) => {
    const key = name.toLowerCase() as keyof SmsTemplateValues
    return key in KNOWN ? (values[key] ?? "") : match
  })
  return text.replace(/[ \t]{2,}/g, " ").trim()
}

const KNOWN: Record<keyof SmsTemplateValues, true> = { customer: true, amount: true, due_date: true, pharmacy: true, invoice: true }

/** Placeholders the API would reject, e.g. "{balance}". */
export function unknownPlaceholders(template: string): string[] {
  const found = new Set<string>()
  for (const match of template.matchAll(PLACEHOLDER)) {
    if (!(match[1].toLowerCase() in KNOWN)) found.add(match[0])
  }
  return [...found]
}

/** A refill reminder must tell the customer how to opt out. */
export function hasOptOut(template: string): boolean {
  return /stop/i.test(template)
}

/** Field error for one template, or null. */
export function templateError(kind: SmsTemplateKind, body: string): string | null {
  const text = body.trim()
  if (!text) return "Enter the message text."
  if (text.length > MAX_TEMPLATE_LENGTH) return `Keep it under ${MAX_TEMPLATE_LENGTH} characters.`
  const unknown = unknownPlaceholders(text)
  if (unknown.length > 0) return `Unknown placeholder ${unknown.join(", ")}. Use ${SMS_PLACEHOLDERS.join(", ")}.`
  if (kind === "RefillReminder" && !hasOptOut(text)) return "A refill reminder must say how to opt out (include the word STOP)."
  return null
}

/** Realistic values for the live preview (long-ish, so the segment counter errs on the safe side). */
export function sampleValues(language: SmsLanguage, pharmacy: string): SmsTemplateValues {
  return language === "ne"
    ? { customer: "राम बहादुर", amount: "रु. 12,450.00", due_date: "2083.06.27", pharmacy: pharmacy || "सिटी फार्मेसी", invoice: "INV-000123" }
    : { customer: "Ram Bahadur", amount: "Rs. 12,450.00", due_date: "13 Oct 2026", pharmacy: pharmacy || "City Pharmacy", invoice: "INV-000123" }
}

/** A 10-digit Nepali mobile (96/97/98…), from input with +977, spaces or dashes; null when it is not one. */
export function normalizeNepaliMobile(raw: string | null | undefined): string | null {
  if (!raw) return null
  if (/[^0-9+\-().\s]/.test(raw)) return null
  let digits = raw.replace(/\D/g, "")
  if (digits.length === 13 && digits.startsWith("977")) digits = digits.slice(3)
  return /^9[678]\d{8}$/.test(digits) ? digits : null
}
