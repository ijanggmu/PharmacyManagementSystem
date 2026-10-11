/**
 * Pure helpers for Settings → System: the sub-tab sections (synced to ?section=), the form's
 * dirty check, and the VAT rate field's text <-> percent conversion.
 */

import type { InvoicePaperFormat } from "@/features/sales/lib/invoice-print"

export const SYSTEM_SECTIONS = [
  { id: "general", label: "General" },
  { id: "tax", label: "Tax & invoicing" },
  { id: "inventory", label: "Inventory" },
  { id: "data", label: "Data & backup" },
  { id: "logs", label: "Logs" },
] as const

export type SystemSectionId = (typeof SYSTEM_SECTIONS)[number]["id"]

export const DEFAULT_SYSTEM_SECTION: SystemSectionId = "general"

/** A ?section= value, or the default when it is missing or unknown. */
export function parseSystemSection(value: string | null | undefined): SystemSectionId {
  const match = SYSTEM_SECTIONS.find((s) => s.id === value)
  return match ? match.id : DEFAULT_SYSTEM_SECTION
}

/** The settings URL for a section, keeping any other query params and pinning ?tab=system. */
export function systemSectionHref(pathname: string, current: URLSearchParams | string, section: SystemSectionId): string {
  const params = new URLSearchParams(typeof current === "string" ? current : current.toString())
  params.set("tab", "system")
  params.set("section", section)
  return `${pathname}?${params.toString()}`
}

export interface SystemSettingsForm {
  pharmacyName: string
  pharmacyAddress: string
  pharmacyPhone: string
  pharmacyEmail: string
  /** VAT rate as the admin types it, in percent (e.g. "13"). */
  vatRate: string
  lowStockThreshold: string
  autoReorderEnabled: boolean
  backupFrequency: string
  receiptFooter: string
  invoicePaper: InvoicePaperFormat
}

/** True when any field differs from the loaded values. */
export function isFormDirty(current: SystemSettingsForm, loaded: SystemSettingsForm): boolean {
  return (Object.keys(current) as (keyof SystemSettingsForm)[]).some((key) => current[key] !== loaded[key])
}

/** Shows a saved percent without trailing zeros: 13 → "13", 13.5 → "13.5". */
export function vatRateToInput(vatRatePercent: number): string {
  return String(Number(vatRatePercent.toFixed(2)))
}

/** Parses the VAT field. Blank or non-numeric text gives NaN so validation can reject it. */
export function parseVatRateInput(text: string): number {
  const trimmed = text.trim()
  if (trimmed === "") return Number.NaN
  return Number(trimmed)
}
