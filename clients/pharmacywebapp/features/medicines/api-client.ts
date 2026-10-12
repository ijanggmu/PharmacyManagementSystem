import type { FefoPick } from "@/lib/inventory/fefo"
import {
  catalogDotnetApi,
  type DotnetBulkMedicineRow,
  type DotnetFefoPickRow,
  type DotnetMedicineBatchDto,
  type DotnetMedicineListQuery,
  type DotnetMedicineSortBy,
  type DotnetMedicineListRow,
  type DuplicateMedicine,
  type SupplierBillPaymentInput,
  toDotnetAddMedicineStockCommand,
  toDotnetSupplierBillPayment,
} from "@/lib/api/catalog-api"

export type { DuplicateMedicine, SupplierBillPaymentInput } from "@/lib/api/catalog-api"
import { money2, stockErrorMessage } from "@/lib/api/stock-dotnet"
import { categoriesDotnetApi } from "@/lib/api/reference-api"
import { normalizeCsvDate } from "@/features/medicines/lib/csv-date"

export interface Medicine {
  id: string
  name: string
  generic_name: string | null
  brand_name: string | null
  strength: string
  form: string
  unit_price: string
  cost_price: string
  /** Tenant-wide total across all branches (maintained aggregate). */
  stock_quantity: number
  /** This medicine's stock at the viewer's currently-selected branch, when known. */
  branch_stock_quantity?: number
  /** Stock the till can sell (not recalled, not expired), all branches in scope. Low/out-of-stock is judged on this. */
  sellable_stock_quantity?: number
  /** Sellable stock at the viewer's current branch, when known. */
  branch_sellable_stock_quantity?: number
  minimum_stock: number
  maximum_stock: number
  /** Legacy/fallback single expiry — set once at creation, not kept in sync
   *  with real per-lot batches. Prefer batch_nearest_expiry when this medicine
   *  has batch rows (batch_count > 0); this remains the only signal when it
   *  doesn't (pre-batch-tracking stock). */
  expiry_date: string | null
  /** Nearest expiry among this medicine's sellable (non-recalled, in-stock)
   *  batches, at the viewer's branch when a branch is selected. Null when the
   *  medicine has no batch rows yet. */
  batch_nearest_expiry?: string | null
  /** Count of sellable batches backing batch_nearest_expiry — a medicine with
   *  more than one means the single expiry_date field would be misleading. */
  batch_count?: number
  /** Distinct rack/shelf labels across this medicine's batches. */
  batch_rack_locations?: string[]
  /** Sellable lots in the order a sale will deduct them (soonest expiry first). */
  fefo_picks?: FefoPick[]
  category_id: string | null
  supplier_id: string | null
  description: string | null
  controlled_substance: boolean
  /** Controlled-substance schedule (e.g. II, III). Null when not a scheduled medicine. */
  controlled_schedule?: string | null
  prescription_required: boolean
  /** Whether this medicine's (tax-inclusive) selling price contributes to the tax
   *  breakdown at checkout. Defaults true in the DB. */
  is_taxable?: boolean
  dosage: string | null
  side_effects: string | null
  storage_instructions: string | null
  barcode: string | null
  requires_cold_chain?: boolean
  storage_temp_min_c?: number | string | null
  storage_temp_max_c?: number | string | null
  units_per_pack?: number | null
  unit_label?: string | null
  /** Supplier bill number and VAT captured with the medicine's opening/last receipt. */
  supplier_invoice_number?: string | null
  vat_amount?: number | null
  is_active?: boolean
  created_at: string
  updated_at: string
  categories: {
    id: string
    name: string
  } | null
  suppliers: {
    id: string
    name: string
  } | null
}

/** One lot of a medicine, as the detail modal renders it. */
export interface MedicineBatch {
  id: string
  batch_number: string
  expiry_date: string | null
  quantity_received: number
  quantity_remaining: number
  selling_price: number | string | null
  /** Purchase cost per unit for this lot. */
  cost_price?: number | null
  /** Written off (expired/damaged); no longer counted as stock. */
  is_disposed?: boolean
  updated_at?: string | null
  rack_location: string | null
  received_at: string
  recalled_at: string | null
  recall_reason: string | null
  branches: { id: string; name: string; code: string } | null
}

export interface MedicinesFilters {
  search?: string
  category?: string
  categoryIds?: string[]
  /** Single supplier; "all" or empty means every supplier. */
  supplierId?: string
  stockStatus?: "all" | "in" | "low" | "out"
  stockStatuses?: ("in" | "low" | "out")[]
  expiryStatus?: "all" | "expiring" | "expired"
  expiryStatuses?: ("expiring" | "expired")[]
  page?: number
  limit?: number
  sortBy?: string
  sortOrder?: "asc" | "desc"
  includeArchived?: boolean
  /** Only medicines at or below their reorder level. */
  belowReorderLevel?: boolean
  /** Branch scope for stock, stock/expiry filters and branch quantity; omitted = server default. */
  branchId?: string
}

export interface MedicinesResponse {
  data: Medicine[]
  total?: number
  error: string | null
}

export interface MedicineInventoryStats {
  total: number
  lowStock: number
  expiringSoon: number
  expired: number
  totalValue: number
}

/** The .NET API writes "9999-12-31" for a lot with no expiry; the UI expects null. */
const NO_EXPIRY_DATE = "9999-12-31"

function expiryOrNull(value: string | null | undefined): string | null {
  return value && value !== NO_EXPIRY_DATE ? value : null
}

/** Maps a .NET MedicineDto (camelCase) onto the legacy snake_case Medicine the pages render. */
/**
 * The .NET medicine row carries only categoryId, so the category name is joined from the tenant's
 * category list (small, cached briefly). A failed lookup leaves names empty rather than failing the list.
 */
const CATEGORY_CACHE_MS = 60_000
let categoryCache: { at: number; byId: Map<string, string> } | null = null

export function invalidateCategoryNameCache(): void {
  categoryCache = null
}

async function categoryNamesById(): Promise<Map<string, string>> {
  if (categoryCache && Date.now() - categoryCache.at < CATEGORY_CACHE_MS) return categoryCache.byId
  try {
    const list = await categoriesDotnetApi.list()
    categoryCache = { at: Date.now(), byId: new Map(list.map((c) => [c.id.toLowerCase(), c.name])) }
    return categoryCache.byId
  } catch {
    return categoryCache?.byId ?? new Map()
  }
}

/** Fills `categories` ({ id, name }) from `category_id`. */
export function withCategoryNames(medicines: Medicine[], namesById: Map<string, string>): Medicine[] {
  return medicines.map((m) => {
    if (!m.category_id) return m
    const name = namesById.get(m.category_id.toLowerCase())
    return name ? { ...m, categories: { id: m.category_id, name } } : m
  })
}

/**
 * The quantity low/out-of-stock is judged on: sellable units (expired and recalled lots excluded) when
 * the API reports them, else the physical total. Matches the server's stock filters and reorder list.
 */
export function sellableStock(medicine: Pick<Medicine, "stock_quantity" | "sellable_stock_quantity">): number {
  return medicine.sellable_stock_quantity ?? medicine.stock_quantity
}

function toMedicine(row: DotnetMedicineListRow): Medicine {
  const nearestExpiry = expiryOrNull(row.batchNearestExpiry)
  return {
    id: row.id,
    name: row.name,
    generic_name: row.genericName,
    brand_name: row.brandName,
    strength: row.strength ?? "",
    form: row.form ?? "",
    unit_price: money2(row.unitPrice),
    cost_price: money2(row.costPrice),
    stock_quantity: row.totalQuantityOnHand,
    branch_stock_quantity: row.branchQuantityOnHand ?? undefined,
    sellable_stock_quantity: row.sellableQuantityOnHand ?? undefined,
    branch_sellable_stock_quantity: row.branchSellableQuantityOnHand ?? undefined,
    minimum_stock: row.reorderLevel,
    maximum_stock: row.maximumStock ?? 0,
    expiry_date: nearestExpiry,
    batch_nearest_expiry: nearestExpiry,
    batch_count: row.batchCount,
    batch_rack_locations: row.batchRackLocations,
    fefo_picks: row.fefoPicks.map(
      (p: DotnetFefoPickRow): FefoPick => ({
        batch_number: p.batchNo,
        expiry_date: expiryOrNull(p.expiryDate),
        rack_location: p.rackLocation,
        quantity_remaining: p.quantityOnHand,
        selling_price: p.sellingPrice ?? 0,
      })
    ),
    category_id: row.categoryId,
    supplier_id: row.supplierId,
    description: row.description,
    controlled_substance: row.isControlled,
    controlled_schedule: row.controlledSchedule ?? null,
    prescription_required: row.prescriptionRequired,
    is_taxable: row.isTaxable,
    dosage: row.dosage,
    side_effects: row.sideEffects,
    storage_instructions: row.storageInstructions,
    barcode: row.barcode,
    requires_cold_chain: row.requiresColdChain,
    storage_temp_min_c: row.storageTempMinC,
    storage_temp_max_c: row.storageTempMaxC,
    units_per_pack: row.unitsPerPack,
    unit_label: row.unitLabel,
    supplier_invoice_number: row.supplierInvoiceNumber ?? null,
    vat_amount: row.vatAmount ?? null,
    is_active: !row.isArchived,
    created_at: row.createdAtUtc,
    updated_at: row.updatedAtUtc ?? row.createdAtUtc,
    categories: null,
    suppliers: null,
  }
}

/** Maps a .NET MedicineBatchDto to the legacy lot row (received quantity and branch name come from the DTO). */
export function toMedicineBatch(dto: DotnetMedicineBatchDto): MedicineBatch {
  return {
    id: dto.id,
    batch_number: dto.batchNo,
    expiry_date: expiryOrNull(dto.expiryDate),
    quantity_received: dto.receivedQuantity ?? dto.quantityOnHand,
    quantity_remaining: dto.quantityOnHand,
    selling_price: dto.sellingPrice,
    cost_price: dto.costPrice ?? null,
    is_disposed: dto.isDisposed ?? false,
    updated_at: dto.updatedAtUtc ?? null,
    rack_location: dto.rackLocation,
    received_at: dto.createdAtUtc,
    recalled_at: dto.recalledAtUtc,
    recall_reason: dto.recallReason,
    branches: { id: dto.branchId, name: dto.branchName ?? "", code: "" },
  }
}

/** Legacy list filters → .NET query. "all" (or unset) means no filter. */
const MEDICINE_SORT_FIELDS: readonly DotnetMedicineSortBy[] = ["name", "quantity", "expiry", "price", "updated"]

export function medicineListQueryFrom(filters: MedicinesFilters | undefined, pageNumber: number, pageSize: number): DotnetMedicineListQuery {
  const stockStatuses = filters?.stockStatuses
    ?? (filters?.stockStatus && filters.stockStatus !== "all" ? [filters.stockStatus] : [])
  const expiryStatuses = filters?.expiryStatuses
    ?? (filters?.expiryStatus && filters.expiryStatus !== "all" ? [filters.expiryStatus] : [])
  const categoryIds = filters?.categoryIds?.filter((id) => id && id !== "all")
  const category = filters?.category && filters.category !== "all" ? filters.category : undefined
  const supplierId = filters?.supplierId && filters.supplierId !== "all" ? filters.supplierId : undefined
  const sortBy = MEDICINE_SORT_FIELDS.find((field) => field === filters?.sortBy)
  return {
    sortBy,
    sortOrder: sortBy ? (filters?.sortOrder ?? "asc") : undefined,
    search: filters?.search?.trim() || undefined,
    categoryId: categoryIds?.length ? undefined : category,
    categoryIds: categoryIds?.length ? categoryIds : undefined,
    supplierId,
    stockStatuses,
    expiryStatuses,
    includeArchived: filters?.includeArchived,
    belowReorderLevel: filters?.belowReorderLevel || undefined,
    branchId: filters?.branchId || undefined,
    pageNumber,
    pageSize,
  }
}

export const medicinesApi = {
  /** Lightweight counts for the Inventory page's stat cards. */
  getInventoryStats: async (branchId?: string): Promise<{ data: MedicineInventoryStats | null; error: string | null }> => {
    try {
      const stats = await catalogDotnetApi.getMedicineStats(branchId)
      return { data: stats, error: null }
    } catch (error) {
      return { data: null, error: stockErrorMessage(error, "Failed to fetch inventory stats") }
    }
  },

  /** Paged list. The .NET page cap is 200, so a larger `limit` walks every page. */
  getMedicines: async (filters?: MedicinesFilters): Promise<MedicinesResponse> => {
    try {
      const limit = filters?.limit ?? 50
      if (limit <= 200) {
        const page = await catalogDotnetApi.listMedicines(medicineListQueryFrom(filters, filters?.page ?? 1, limit))
        return { data: withCategoryNames(page.items.map(toMedicine), await categoryNamesById()), total: page.totalCount, error: null }
      }

      const rows: DotnetMedicineListRow[] = []
      let total = 0
      for (let pageNumber = 1; ; pageNumber++) {
        const page = await catalogDotnetApi.listMedicines(medicineListQueryFrom(filters, pageNumber, 200))
        total = page.totalCount
        rows.push(...page.items)
        if (pageNumber >= page.totalPages || page.items.length === 0) break
      }
      return { data: withCategoryNames(rows.map(toMedicine), await categoryNamesById()), total, error: null }
    } catch (error) {
      return { data: [], error: stockErrorMessage(error, "Failed to fetch medicines") }
    }
  },

  getMedicine: async (id: string): Promise<{ data: Medicine | null; error: string | null }> => {
    try {
      const row = await catalogDotnetApi.getMedicineRow(id)
      return { data: withCategoryNames([toMedicine(row)], await categoryNamesById())[0], error: null }
    } catch (error) {
      return { data: null, error: stockErrorMessage(error, "Failed to fetch medicine") }
    }
  },

  createMedicine: async (
    medicine: Omit<
      Medicine,
      "id" | "created_at" | "updated_at" | "categories" | "suppliers" | "unit_price" | "cost_price"
    > & {
      unit_price: number
      cost_price: number
      /** Supplier tax invoice / bill number for the initial stock receipt (optional). */
      supplier_invoice_number?: string | null
      /** Recoverable VAT on the initial stock receipt (optional). */
      vat_amount?: number | null
      /** The opening-stock supplier bill was paid at entry; omit for a bill on credit. */
      payment?: SupplierBillPaymentInput | null
    },
    /** One per user action, reused when that action is retried (lib/api/idempotency.ts). */
    idempotencyKey?: string,
  ): Promise<{ data: Medicine | null; error: string | null }> => {
    try {
      const created = await catalogDotnetApi.createMedicine(medicine, idempotencyKey)
      return { data: created as unknown as Medicine, error: null }
    } catch (error) {
      return {
        data: null,
        error: stockErrorMessage(error, "Failed to create medicine"),
      }
    }
  },

  updateMedicine: async (
    id: string,
    updates: Partial<Medicine> & {
      /** Sent with a stock_quantity change; the .NET API requires a reason. Defaults to "Manual stock adjustment". */
      stock_adjustment_reason?: string | null
      stock_adjustment_notes?: string | null
    }
  ): Promise<{ data: Medicine | null; error: string | null }> => {
    try {
      const current = await catalogDotnetApi.findMedicine(id)
      // Not found: the id is not a medicine in the .NET store (GET /medicines/{id} returns 404).
      if (!current) throw new Error("Medicine not found")
      const updated = await catalogDotnetApi.updateMedicine(current, id, updates)
      return { data: updated as unknown as Medicine, error: null }
    } catch (error) {
      return {
        data: null,
        error: stockErrorMessage(error, "Failed to update medicine"),
      }
    }
  },

  /** Same row shape as createMedicine, minus supplier_id/supplier_invoice_number
   *  (those live once per bill group, not per row). */
  bulkCreate: async (
    groups: Array<{
      supplierId: string | null
      supplierInvoiceNumber?: string | null
      receiptDate: string
      /** The bill was paid at entry; omit (or null) for a bill on credit. Ignored without a supplier. */
      payment?: SupplierBillPaymentInput | null
      rows: Array<
        Omit<
          Medicine,
          | "id"
          | "created_at"
          | "updated_at"
          | "categories"
          | "suppliers"
          | "unit_price"
          | "cost_price"
          | "supplier_id"
        > & {
          unit_price: number
          cost_price: number
          vat_amount?: number | null
          batch_number?: string | null
          rack_location?: string | null
        }
      >
    }>,
    /** One per import submission, reused when the same import is retried (lib/api/idempotency.ts). */
    idempotencyKey?: string,
  ): Promise<{
    data: { groups: { supplierId: string | null; supplierInvoiceNumber: string | null; medicineIds: string[]; receiptId?: string }[]; createdMedicines: Medicine[]; addedToExistingCount: number } | null
    error: string | null
  }> => {
    try {
      // DateOnly fields bind only "yyyy-MM-dd": a CSV's "03/04/2027" is normalized here or refused with the
      // reason, never sent for the server to misread or reject as a bare 400.
      const dateProblems: string[] = []
      const dateOnly = (value: string | null | undefined, label: string): string | null => {
        const { ymd, error } = normalizeCsvDate(value, label)
        if (error) dateProblems.push(error)
        return ymd
      }
      const rows: DotnetBulkMedicineRow[] = groups.flatMap((group) =>
        group.rows.map((row) => ({
          name: row.name,
          genericName: row.generic_name,
          categoryId: row.category_id,
          reorderLevel: row.minimum_stock,
          isControlled: row.controlled_substance,
          batchNo: row.batch_number ?? null,
          expiryDate: dateOnly(row.expiry_date, `${row.name}: expiry date`),
          quantity: row.stock_quantity,
          costPrice: row.cost_price,
          sellingPrice: row.unit_price,
          rackLocation: row.rack_location ?? null,
          unitPrice: row.unit_price,
          form: row.form,
          strength: row.strength,
          maximumStock: row.maximum_stock ?? null,
          prescriptionRequired: row.prescription_required,
          isTaxable: row.is_taxable ?? true,
          supplierId: group.supplierId,
          supplierInvoiceNumber: group.supplierInvoiceNumber?.trim() || null,
          vatAmount: row.vat_amount ?? 0,
          // Only a supplier bill carries a date; opening stock has none.
          receiptDate: group.supplierId ? dateOnly(group.receiptDate, "Receipt date") : null,
          // Every row of the bill carries the same payment; the server applies it once per bill.
          payment: group.supplierId ? toDotnetSupplierBillPayment(group.payment) : null,
        }))
      )

      if (dateProblems.length > 0) return { data: null, error: dateProblems[0] }

      const result = await catalogDotnetApi.bulkCreateMedicines(rows, idempotencyKey)
      const createdIds = result.created.map((c) => c.medicineId)

      // Rows are created in submission order, so each group gets its own slice of the new ids.
      let offset = 0
      const outGroups = groups.map((group) => {
        const medicineIds = createdIds.slice(offset, offset + group.rows.length)
        offset += group.rows.length
        return {
          supplierId: group.supplierId,
          supplierInvoiceNumber: group.supplierInvoiceNumber?.trim() || null,
          medicineIds,
        }
      })

      return {
        data: {
          groups: outGroups,
          // Rows that matched an existing medicine (or an earlier row) added stock there instead of a duplicate.
          addedToExistingCount: result.created.filter((c) => c.addedToExisting).length,
          // The import modal reads only the count; the .NET bulk endpoint returns ids, not full rows.
          createdMedicines: createdIds.map((id) => ({ id }) as unknown as Medicine),
        },
        error: null,
      }
    } catch (error) {
      return { data: null, error: stockErrorMessage(error, "Bulk medicine import failed") }
    }
  },

  /** Exact duplicates (same name + strength + form). Empty on error so a failed check never blocks saving;
   *  the server still answers 409 for a duplicate. */
  findDuplicates: async (name: string, strength: string | null, form: string | null, excludeId?: string): Promise<DuplicateMedicine[]> => {
    try {
      return await catalogDotnetApi.findDuplicateMedicines(name, strength, form, excludeId)
    } catch {
      return []
    }
  },

  generateBarcode: async (): Promise<{ data: string | null; error: string | null }> => {
    try {
      return { data: await catalogDotnetApi.generateMedicineBarcode(), error: null }
    } catch (error) {
      return { data: null, error: stockErrorMessage(error, "Failed to generate a barcode") }
    }
  },

  /** Sets one lot to a counted/remaining quantity with a reason (write-off, breakage, count correction…). */
  adjustBatch: async (batchId: string, newQuantity: number, reason: string, idempotencyKey?: string): Promise<{ error: string | null }> => {
    try {
      await catalogDotnetApi.adjustBatchQuantity(batchId, newQuantity, reason, idempotencyKey)
      return { error: null }
    } catch (error) {
      return { error: stockErrorMessage(error, "Failed to adjust the batch") }
    }
  },

  /** Sets one lot's selling price: the price a sale charges for units taken from it. */
  setBatchSellingPrice: async (batchId: string, sellingPrice: number): Promise<{ error: string | null }> => {
    try {
      await catalogDotnetApi.setBatchSellingPrice(batchId, sellingPrice)
      return { error: null }
    } catch (error) {
      return { error: stockErrorMessage(error, "Failed to set the batch price") }
    }
  },

  /** Adds the create form's stock as a new batch of an existing medicine instead of creating a duplicate. */
  addStockToExisting: async (
    medicineId: string,
    stock: Parameters<typeof toDotnetAddMedicineStockCommand>[0],
    idempotencyKey?: string,
  ): Promise<{ data: string | null; error: string | null }> => {
    try {
      return { data: await catalogDotnetApi.addMedicineStock(medicineId, toDotnetAddMedicineStockCommand(stock), idempotencyKey), error: null }
    } catch (error) {
      return { data: null, error: stockErrorMessage(error, "Failed to add stock") }
    }
  },

  /** LASA (look-alike-sound-alike) check — non-blocking warning, not a validation error. */
  findSimilarNames: async (
    name: string,
    excludeId?: string
  ): Promise<{ id: string; name: string; strength: string | null; form: string | null; distance: number }[]> => {
    try {
      return await catalogDotnetApi.findSimilarNames(name, excludeId)
    } catch {
      return []
    }
  },

  /** Every lot of one medicine across branches. The modal orders them by FEFO. */
  getMedicineBatches: async (medicineId: string): Promise<{ data: MedicineBatch[]; error: string | null }> => {
    try {
      const rows = await catalogDotnetApi.listMedicineBatches(medicineId)
      return { data: rows.map(toMedicineBatch), error: null }
    } catch (error) {
      return { data: [], error: stockErrorMessage(error, "Failed to load batches") }
    }
  },

  /** Recalls every row of this lot (batch_number) across all branches — blocks it from
   *  FEFO sale everywhere. See scripts/85-inventory-safety-controls.sql. */
  recallBatch: async (
    medicineId: string,
    batchNumber: string,
    reason: string | null
  ): Promise<{ affected: number; error: string | null }> => {
    try {
      const result = await catalogDotnetApi.recallMedicineBatch(medicineId, batchNumber, reason)
      return { affected: result.affected, error: null }
    } catch (error) {
      return { affected: 0, error: stockErrorMessage(error, "Failed to recall batch") }
    }
  },

  /** The .NET API always archives (soft delete) rather than hard-deleting, so `archived` is always true. */
  deleteMedicine: async (id: string): Promise<{ error: string | null; archived?: boolean }> => {
    try {
      await catalogDotnetApi.deleteMedicine(id)
      return { error: null, archived: true }
    } catch (error) {
      return { error: stockErrorMessage(error, "Failed to delete medicine") }
    }
  },

  unarchiveMedicine: async (id: string, idempotencyKey?: string): Promise<{ error: string | null }> => {
    try {
      await catalogDotnetApi.restoreMedicine(id, idempotencyKey)
      return { error: null }
    } catch (error) {
      return { error: stockErrorMessage(error, "Failed to restore medicine") }
    }
  },
}
