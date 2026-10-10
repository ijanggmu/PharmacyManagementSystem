/**
 * Escapes a value for safe interpolation into HTML text or a double/single-quoted attribute.
 * Every value printed into the voucher print document goes through this.
 */
export function escapeHtml(value: unknown): string {
  if (value == null) return ""
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/**
 * Escapes a value for a CSS string literal (e.g. `content: "..."` in an @page margin box).
 * Quotes, backslashes and newlines are escaped; `<` is escaped too so the value can never
 * close the surrounding <style> element.
 */
export function escapeCssString(value: unknown): string {
  if (value == null) return ""
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/'/g, "\\'")
    .replace(/</g, "\\3C ")
    .replace(/\r?\n/g, " ")
}
