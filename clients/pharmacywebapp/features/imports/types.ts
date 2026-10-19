import type { ImportFieldError } from "@/features/imports/lib/spreadsheet"

/** Max rows per file — the API refuses bigger files (CustomerImportLimits / SupplierImportLimits / OpeningStockImportLimits). */
export const IMPORT_MAX_ROWS = 2000

export type DuplicateMode = "skip" | "update"
export type StockFunding = "opening_stock" | "cash" | "bank"
/** How imported stock comes in: owned (with how it was paid for) or a supplier's consigned stock. */
export type StockImportMode = StockFunding | "consignment"

/**
 * A row's outcome, the same for every import ("received" is the stock import's "created"). "card_only": a go-live
 * stock row with no quantity, which only adds the medicine card.
 */
export type ImportRowStatus = "created" | "updated" | "skipped" | "received" | "card_only" | "failed"

export interface ImportRowResult {
  rowNumber: number
  status: ImportRowStatus
  /** The customer / supplier / medicine the row matched or created. */
  id: string | null
  /** What the row matched, when the server says (the stock import names the medicine). */
  label: string | null
  errors: ImportFieldError[]
  warnings: string[]
  /** Stock import with new medicines allowed: the row adds a medicine that wasn't in the list. */
  newMedicine?: boolean
  /** Stock import: the row is a supplier's consignment. */
  consigned?: boolean
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
  /** Go-live stock import: rows that only add a medicine card (no quantity). */
  medicinesOnly?: number
}
