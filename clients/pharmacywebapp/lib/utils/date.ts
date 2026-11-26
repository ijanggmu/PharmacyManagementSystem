export function formatLocalDateYmd(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function parseYmdAsLocalDate(ymd: string): Date {
  const [year, month, day] = ymd.split("-").map((value) => Number(value))
  return new Date(year, (month || 1) - 1, day || 1)
}

const YMD_ONLY = /^\d{4}-\d{2}-\d{2}$/

function toExportDate(value: string | Date | null | undefined): Date | null {
  if (value == null || value === "") return null
  const date = value instanceof Date ? value : YMD_ONLY.test(value) ? parseYmdAsLocalDate(value) : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Locale-independent date for exports: local `YYYY-MM-DD`, or "" when missing/invalid. */
export function formatExportDate(value: string | Date | null | undefined): string {
  const date = toExportDate(value)
  return date ? formatLocalDateYmd(date) : ""
}

/** Locale-independent date-time for exports: local `YYYY-MM-DD HH:mm`, or "" when missing/invalid. */
export function formatExportDateTime(value: string | Date | null | undefined): string {
  const date = toExportDate(value)
  if (!date) return ""
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  return `${formatLocalDateYmd(date)} ${hours}:${minutes}`
}
