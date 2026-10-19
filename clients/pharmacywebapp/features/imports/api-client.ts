import { dotnetClient } from "@/lib/api/dotnet-client"
import type { CustomerImportRowDto } from "@/features/imports/lib/customer-import"
import type { SupplierImportRowDto } from "@/features/imports/lib/supplier-import"
import type { StockImportRowDto } from "@/features/imports/lib/stock-import"
import type { GoLiveStockRowDto } from "@/features/go-live/lib/go-live-workbook"
import type { DuplicateMode, ImportResult, ImportRowStatus, StockImportMode } from "@/features/imports/types"

/** Shape every .NET import result shares (CustomerImportResult / SupplierImportResult / OpeningStockImportResult). */
interface DotnetImportRow {
  rowNumber: number
  status: string
  customerId?: string | null
  supplierId?: string | null
  medicineId?: string | null
  medicineLabel?: string | null
  newMedicine?: boolean
  consigned?: boolean
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
  medicinesOnly?: number
  rows: DotnetImportRow[]
}

const STATUSES: ImportRowStatus[] = ["created", "updated", "skipped", "received", "card_only", "failed"]

export function toImportResult(dto: DotnetImportResult): ImportResult {
  return {
    committed: dto.committed,
    dryRun: dto.dryRun,
    created: dto.created ?? dto.received ?? 0,
    updated: dto.updated ?? 0,
    skipped: dto.skipped ?? 0,
    failed: dto.failed,
    totalValue: dto.totalValue,
    medicinesOnly: dto.medicinesOnly,
    rows: dto.rows.map((row) => ({
      rowNumber: row.rowNumber,
      status: (STATUSES as string[]).includes(row.status) ? (row.status as ImportRowStatus) : "failed",
      id: row.customerId ?? row.supplierId ?? row.medicineId ?? null,
      label: row.medicineLabel ?? null,
      errors: row.errors ?? [],
      warnings: row.warnings ?? [],
      newMedicine: row.newMedicine ?? false,
      consigned: row.consigned ?? false,
    })),
  }
}

export interface PartyImportOptions {
  duplicateMode: DuplicateMode
  /** yyyy-mm-dd; default as-of date for opening balances. */
  asOfDate?: string
}

export interface StockImportOptions {
  funding: StockImportMode
  /** The consignment supplier — required when `funding` is "consignment". */
  supplierId?: string
  asOfDate?: string
}

/** The stock import request: owned stock carries its funding and as-of date; consigned stock carries only the
 *  supplier (no voucher posts, so there is nothing to fund or date). */
export function stockImportBody(rows: StockImportRowDto[], options: StockImportOptions, dryRun: boolean) {
  if (options.funding === "consignment") {
    if (!options.supplierId) throw new Error("Choose the consignment supplier first.")
    return { rows, funding: null, asOfDate: null, consignmentSupplierId: options.supplierId, dryRun }
  }
  return { rows, funding: options.funding, asOfDate: options.asOfDate || null, dryRun }
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
  /** The go-live stock sheet: medicines not in the list are added, and each row is owned or a supplier's
   *  consignment (its consignmentSupplierId). Owned stock is opening stock dated on the go-live date. */
  goLiveStock: async (
    rows: GoLiveStockRowDto[],
    goLiveDate: string,
    dryRun: boolean,
    idempotencyKey?: string,
  ): Promise<ImportResult> =>
    toImportResult(
      await dotnetClient.post<DotnetImportResult>(
        "/api/v1/inventory/medicines/stock/import",
        {
          rows: rows.map(({ consignmentSupplierName: _name, ...row }) => row),
          funding: "opening_stock",
          asOfDate: goLiveDate,
          createMissingMedicines: true,
          dryRun,
        },
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
        stockImportBody(rows, options, dryRun),
        dryRun ? undefined : idempotencyKey,
      ),
    ),
}
