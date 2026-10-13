import { dotnetClient } from "@/lib/api/dotnet-client"
import type { CustomerImportRowDto } from "@/features/imports/lib/customer-import"
import type { SupplierImportRowDto } from "@/features/imports/lib/supplier-import"
import type { StockImportRowDto } from "@/features/imports/lib/stock-import"
import type { DuplicateMode, ImportResult, ImportRowStatus, StockFunding } from "@/features/imports/types"

/** Shape every .NET import result shares (CustomerImportResult / SupplierImportResult / OpeningStockImportResult). */
interface DotnetImportRow {
  rowNumber: number
  status: string
  customerId?: string | null
  supplierId?: string | null
  medicineId?: string | null
  medicineLabel?: string | null
  errors: { field: string; message: string }[]
  warnings: string[]
}

interface DotnetImportResult {
  committed: boolean
  dryRun: boolean
  created?: number
  updated?: number
  skipped?: number
  received?: number
  failed: number
  totalValue?: number
  rows: DotnetImportRow[]
}

const STATUSES: ImportRowStatus[] = ["created", "updated", "skipped", "received", "failed"]

export function toImportResult(dto: DotnetImportResult): ImportResult {
  return {
    committed: dto.committed,
    dryRun: dto.dryRun,
    created: dto.created ?? dto.received ?? 0,
    updated: dto.updated ?? 0,
    skipped: dto.skipped ?? 0,
    failed: dto.failed,
    totalValue: dto.totalValue,
    rows: dto.rows.map((row) => ({
      rowNumber: row.rowNumber,
      status: (STATUSES as string[]).includes(row.status) ? (row.status as ImportRowStatus) : "failed",
      id: row.customerId ?? row.supplierId ?? row.medicineId ?? null,
      label: row.medicineLabel ?? null,
      errors: row.errors ?? [],
      warnings: row.warnings ?? [],
    })),
  }
}

export interface PartyImportOptions {
  duplicateMode: DuplicateMode
  /** yyyy-mm-dd; default as-of date for opening balances. */
  asOfDate?: string
}

export interface StockImportOptions {
  funding: StockFunding
  asOfDate?: string
}

/**
 * Imports are all-or-nothing on the server. `dryRun` checks the file and returns the plan without saving; the real
 * run takes an Idempotency-Key (one per submission, reused on retry — lib/api/idempotency.ts) so a retried import is
 * applied once.
 */
export const importsApi = {
  customers: async (
    rows: CustomerImportRowDto[],
    options: PartyImportOptions,
    dryRun: boolean,
    idempotencyKey?: string,
  ): Promise<ImportResult> =>
    toImportResult(
      await dotnetClient.post<DotnetImportResult>(
        "/api/v1/customers/import",
        { rows, duplicateMode: options.duplicateMode, asOfDate: options.asOfDate || null, dryRun },
        dryRun ? undefined : idempotencyKey,
      ),
    ),
  suppliers: async (
    rows: SupplierImportRowDto[],
    options: PartyImportOptions,
    dryRun: boolean,
    idempotencyKey?: string,
  ): Promise<ImportResult> =>
    toImportResult(
      await dotnetClient.post<DotnetImportResult>(
        "/api/v1/suppliers/import",
        { rows, duplicateMode: options.duplicateMode, asOfDate: options.asOfDate || null, dryRun },
        dryRun ? undefined : idempotencyKey,
      ),
    ),
  openingStock: async (
    rows: StockImportRowDto[],
    options: StockImportOptions,
    dryRun: boolean,
    idempotencyKey?: string,
  ): Promise<ImportResult> =>
    toImportResult(
      await dotnetClient.post<DotnetImportResult>(
        "/api/v1/inventory/medicines/stock/import",
        { rows, funding: options.funding, asOfDate: options.asOfDate || null, dryRun },
        dryRun ? undefined : idempotencyKey,
      ),
    ),
}
