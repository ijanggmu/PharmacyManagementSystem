import type { ImportFieldError } from "@/features/imports/lib/spreadsheet"

/** Max rows per file — the API refuses bigger files (CustomerImportLimits / SupplierImportLimits / OpeningStockImportLimits). */
export const IMPORT_MAX_ROWS = 2000

export type DuplicateMode = "skip" | "update"
export type StockFunding = "opening_stock" | "cash" | "bank"

/** A row's outcome, the same for every import ("received" is the stock import's "created"). */
export type ImportRowStatus = "created" | "updated" | "skipped" | "received" | "failed"

export interface ImportRowResult {
  rowNumber: number
  status: ImportRowStatus
  /** The customer / supplier / medicine the row matched or created. */
  id: string | null
  /** What the row matched, when the server says (the stock import names the medicine). */
  label: string | null
  errors: ImportFieldError[]
  warnings: string[]
}

/** One import call's answer. `committed` is false for a dry run, and when any row failed (nothing was saved). */
export interface ImportResult {
  committed: boolean
  dryRun: boolean
  created: number
  updated: number
  skipped: number
  failed: number
  rows: ImportRowResult[]
  /** Stock import only. */
  totalValue?: number
}
