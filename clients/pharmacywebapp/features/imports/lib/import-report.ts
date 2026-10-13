import type { ImportColumn, ImportFieldError, MappedRow, RawImportRow } from "@/features/imports/lib/spreadsheet"
import type { ImportResult, ImportRowResult, ImportRowStatus } from "@/features/imports/types"

/** What the preview shows for one row: the client's parse errors plus, once checked, the server's verdict. */
export interface PreviewRow {
  rowNumber: number
  status: ImportRowStatus | "pending"
  errors: ImportFieldError[]
  warnings: string[]
  label: string | null
}

/** Joins client-side mapping errors with the server's per-row result (matched by row number). */
export function buildPreviewRows<T>(mapped: MappedRow<T>[], result: ImportResult | null): PreviewRow[] {
  const byRow = new Map<number, ImportRowResult>(result?.rows.map((r) => [r.rowNumber, r]) ?? [])
  return mapped.map((row) => {
    const server = byRow.get(row.rowNumber)
    const errors = [...row.errors]
    for (const e of server?.errors ?? []) {
      if (!errors.some((x) => x.field === e.field && x.message === e.message)) errors.push(e)
    }
    const status: PreviewRow["status"] = errors.length > 0 ? "failed" : (server?.status ?? "pending")
    return { rowNumber: row.rowNumber, status, errors, warnings: server?.warnings ?? [], label: server?.label ?? null }
  })
}

/** Rows with problems as a sheet: the original cells, then status, problems and notes — fix and re-upload. */
export function errorReportRows(
  columns: ImportColumn[],
  raw: RawImportRow[],
  preview: PreviewRow[],
): (string | number)[][] {
  const byRow = new Map(preview.map((p) => [p.rowNumber, p]))
  const labelOf = new Map(columns.map((c) => [c.key, c.label]))
  const header = ["Row", ...columns.map((c) => c.label), "Status", "Problems", "Notes"]
  const lines = raw
    .filter((r) => {
      const p = byRow.get(r.rowNumber)
      return p && (p.errors.length > 0 || p.warnings.length > 0)
    })
    .map((r) => {
      const p = byRow.get(r.rowNumber)!
      return [
        r.rowNumber,
        ...columns.map((c) => r.cells[c.key] ?? ""),
        p.status,
        p.errors.map((e) => `${labelOf.get(e.field) ?? e.field}: ${e.message}`).join("; "),
        p.warnings.join("; "),
      ]
    })
  return [header, ...lines]
}

export interface ImportCounts {
  ready: number
  failed: number
  pending: number
}

export function countPreview(preview: PreviewRow[]): ImportCounts {
  return {
    ready: preview.filter((p) => p.status !== "failed" && p.status !== "pending").length,
    failed: preview.filter((p) => p.status === "failed").length,
    pending: preview.filter((p) => p.status === "pending").length,
  }
}

/** A stable fingerprint of what is being imported (rows + options), for the Idempotency-Key tracker. */
export function importFingerprint(kind: string, rows: unknown[], options: unknown): string {
  return `${kind}:${JSON.stringify(options)}:${JSON.stringify(rows)}`
}
