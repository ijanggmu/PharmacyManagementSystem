/**
 * Medicine catalog helpers, switchable per backend target (CATALOG): Nepal catalog search,
 * LASA similar-name check, price-list history, and medicine create/edit. Bulk import, batch recall,
 * delete and archive/unarchive stay on the legacy path.
 *
 * Create/edit map the legacy snake_case form payload onto the .NET command, including the legacy detail
 * fields (brand, dosage, storage, pack size, tax flag, supplier invoice, VAT). On create, initial stock
 * without a batch number/expiry, or with a supplier, falls back to the legacy path because the .NET
 * receipt cannot express it. On update, a stock change also falls back.
 */

import { DotnetApiError, dotnetClient } from "@/lib/api/dotnet-client"

export interface NepalMedicineCatalogItem {
  id: string
  brand_name: string
  generic_name: string
  form: string | null
  strength: string | null
  manufacturer: string | null
  category_name: string | null
  dosage: string | null
  unit_price: number | null
  cost_price: number | null
  description: string | null
  side_effects: string | null
  storage_instructions: string | null
  prescription_required: boolean
}

export interface SimilarMedicineName {
  id: string
  name: string
  strength: string | null
  form: string | null
  distance: number
}

export interface MedicinePriceHistoryRow {
  id: string
  medicine_id: string
  unit_price: number
  cost_price: number | null
  effective_from: string
  effective_to: string | null
  status: "scheduled" | "active" | "superseded" | "cancelled"
  source: "trigger" | "manual"
  reason: string | null
  created_at: string
}

export interface PriceScheduleInput {
  unit_price: number
  effective_from: string
  cost_price?: number | null
  reason?: string | null
}

/** NepalMedicineCatalogEntryDto (Inventory module). */
export interface DotnetNepalCatalogEntryDto {
  id: string
  brandName: string
  genericName: string | null
  form: string | null
  strength: string | null
  manufacturer: string | null
  categoryName: string | null
  dosage: string | null
  unitPrice: number | null
  costPrice: number | null
  description: string | null
  sideEffects: string | null
  storageInstructions: string | null
  prescriptionRequired: boolean
}

/** SimilarMedicineNameDto (Inventory module). The .NET DTO carries no strength or form. */
export interface DotnetSimilarMedicineNameDto {
  id: string
  name: string
  genericName: string | null
  distance: number
}

/** MedicinePriceHistoryDto (Inventory module). Status is the C# enum name, e.g. "Scheduled". */
export interface DotnetMedicinePriceHistoryDto {
  id: string
  medicineId: string
  unitPrice: number
  costPrice: number | null
  effectiveFrom: string
  effectiveTo: string | null
  status: string
  reason: string | null
  createdAtUtc: string
}

export function toNepalCatalogItem(dto: DotnetNepalCatalogEntryDto): NepalMedicineCatalogItem {
  return {
    id: dto.id,
    brand_name: dto.brandName,
    generic_name: dto.genericName ?? "",
    form: dto.form,
    strength: dto.strength,
    manufacturer: dto.manufacturer,
    category_name: dto.categoryName,
    dosage: dto.dosage,
    unit_price: dto.unitPrice,
    cost_price: dto.costPrice,
    description: dto.description,
    side_effects: dto.sideEffects,
    storage_instructions: dto.storageInstructions,
    prescription_required: dto.prescriptionRequired,
  }
}

export function toSimilarMedicineName(dto: DotnetSimilarMedicineNameDto): SimilarMedicineName {
  return { id: dto.id, name: dto.name, strength: null, form: null, distance: dto.distance }
}

export function toPriceHistoryStatus(status: string): MedicinePriceHistoryRow["status"] {
  return status.toLowerCase() as MedicinePriceHistoryRow["status"]
}

/**
 * The .NET module has no trigger-driven price rows, so every row it returns was written by a
 * staff action and is reported as "manual".
 */
export function toPriceHistoryRow(dto: DotnetMedicinePriceHistoryDto): MedicinePriceHistoryRow {
  return {
    id: dto.id,
    medicine_id: dto.medicineId,
    unit_price: dto.unitPrice,
    cost_price: dto.costPrice,
    effective_from: dto.effectiveFrom,
    effective_to: dto.effectiveTo,
    status: toPriceHistoryStatus(dto.status),
    source: "manual",
    reason: dto.reason,
    created_at: dto.createdAtUtc,
  }
}

export function nepalCatalogPath(query: string, limit = 10): string {
  const params = new URLSearchParams()
  if (query.trim()) params.set("q", query.trim())
  params.set("limit", String(limit))
  return `/api/v1/inventory/medicine-catalog/nepal?${params.toString()}`
}

export function similarNamesPath(name: string, excludeId?: string): string {
  const p = new URLSearchParams({ name })
  if (excludeId) p.set("excludeId", excludeId)
  return `/api/v1/inventory/medicines/similar-names?${p.toString()}`
}

export function priceScheduleBody(input: PriceScheduleInput) {
  return {
    unitPrice: input.unit_price,
    effectiveFrom: input.effective_from,
    costPrice: input.cost_price ?? null,
    reason: input.reason ?? null,
  }
}

/** Legacy medicine form payload (snake_case). Every field is optional; only the ones the mapping reads matter. */
export interface LegacyMedicineWriteFields {
  name?: string
  generic_name?: string | null
  brand_name?: string | null
  strength?: string | null
  form?: string | null
  unit_price?: number | string | null
  cost_price?: number | string | null
  stock_quantity?: number | null
  minimum_stock?: number | null
  maximum_stock?: number | null
  expiry_date?: string | null
  batch_number?: string | null
  rack_location?: string | null
  barcode?: string | null
  description?: string | null
  dosage?: string | null
  side_effects?: string | null
  storage_instructions?: string | null
  category_id?: string | null
  supplier_id?: string | null
  prescription_required?: boolean
  controlled_substance?: boolean
  is_taxable?: boolean
  supplier_invoice_number?: string | null
  vat_amount?: number | null
  requires_cold_chain?: boolean
  storage_temp_min_c?: number | string | null
  storage_temp_max_c?: number | string | null
  units_per_pack?: number | null
  unit_label?: string | null
}

/** Command body shared by CreateMedicineCommand and UpdateMedicineCommand (camelCase). */
export interface DotnetMedicineWriteCommand {
  name: string
  genericName: string | null
  categoryId: string | null
  reorderLevel: number
  isControlled: boolean
  initialStockQuantity: number | null
  batchNumber: string | null
  expiryDate: string | null
  rackLocation: string | null
  costPrice: number | null
  sellingPrice: number | null
  unitPrice: number | null
  form: string | null
  strength: string | null
  supplierId: string | null
  barcode: string | null
  description: string | null
  maximumStock: number | null
  /** Update only: true unsets the stored MaximumStock (a null maximumStock alone keeps it). */
  clearMaximumStock?: boolean
  prescriptionRequired: boolean
  brandName: string | null
  dosage: string | null
  sideEffects: string | null
  storageInstructions: string | null
  storageTempMinC: number | null
  storageTempMaxC: number | null
  requiresColdChain: boolean | null
  unitsPerPack: number | null
  unitLabel: string | null
  isTaxable: boolean | null
  supplierInvoiceNumber: string | null
  vatAmount: number | null
  /**
   * Update only: true unsets every optional detail (brand, dosage, side effects, storage instructions and
   * temps, units per pack, unit label, supplier invoice, VAT) in one go. It cannot clear a subset, so a
   * partial clear is sent as two updates (see toDotnetUpdateMedicineSteps).
   */
  clearOptionalDetails?: boolean
}

/** MedicineDto (Inventory module) as returned by GET /inventory/medicines/{id}. Only the fields the mapping uses. */
export interface DotnetMedicineDto {
  id: string
  name: string
  genericName: string | null
  categoryId: string | null
  reorderLevel: number
  isControlled: boolean
  totalQuantityOnHand: number
  createdAtUtc: string
  updatedAtUtc: string | null
  unitPrice: number
  costPrice: number
  form: string | null
  strength: string | null
  supplierId: string | null
  barcode: string | null
  description: string | null
  maximumStock: number | null
  prescriptionRequired: boolean
  brandName: string | null
  dosage: string | null
  sideEffects: string | null
  storageInstructions: string | null
  storageTempMinC: number | null
  storageTempMaxC: number | null
  requiresColdChain: boolean
  unitsPerPack: number | null
  unitLabel: string | null
  isTaxable: boolean
  supplierInvoiceNumber: string | null
  vatAmount: number | null
}

/** Legacy-shaped medicine returned by create/update. Legacy-only fields come from the request input. */
export type LegacyMedicineWriteResult = LegacyMedicineWriteFields & {
  id: string
  name: string
  created_at: string
  updated_at: string
  categories: null
  suppliers: null
}

function hasText(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim() !== ""
}

function textOrNull(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed === "" ? null : trimmed
}

function numberOrNull(value: number | string | null | undefined): number | null {
  if (value === undefined || value === null || value === "") return null
  const n = typeof value === "number" ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

function money2(value: number): string {
  return value.toFixed(2)
}

/** An explicit clear: the legacy input sent null or an empty/blank string for the field. Absent (undefined) is not a clear. */
export function isExplicitClear(value: unknown): boolean {
  return value === null || (typeof value === "string" && value.trim() === "")
}

/** Reasons the create must stay on the legacy path. Empty means the .NET branch can take it. */
export function medicineCreateBlockers(input: LegacyMedicineWriteFields): string[] {
  const blockers: string[] = []
  const stock = numberOrNull(input.stock_quantity) ?? 0
  if (stock > 0) {
    // The .NET receipt needs a batch number and expiry (legacy auto-numbers the batch), and it posts no supplier payable.
    if (!hasText(input.batch_number) || !hasText(input.expiry_date)) blockers.push("initial stock needs batch_number and expiry_date")
    if (hasText(input.supplier_id)) blockers.push("initial stock with a supplier (.NET posts no supplier payable)")
  }
  return blockers
}

/** Reasons the update must stay on the legacy path. The .NET update can only add stock through a new batch. */
export function medicineUpdateBlockers(current: DotnetMedicineDto, input: LegacyMedicineWriteFields): string[] {
  const blockers: string[] = []
  if (input.stock_quantity !== undefined && input.stock_quantity !== null && input.stock_quantity !== current.totalQuantityOnHand) {
    blockers.push("stock_quantity change (stock moves stay legacy)")
  }
  return blockers
}

/** Maps the legacy create payload to CreateMedicineCommand. Batch fields apply only when opening stock is > 0. */
export function toDotnetCreateMedicineCommand(input: LegacyMedicineWriteFields): DotnetMedicineWriteCommand {
  const stock = numberOrNull(input.stock_quantity)
  const hasStock = stock !== null && stock > 0
  const unitPrice = numberOrNull(input.unit_price)
  return {
    name: (input.name ?? "").trim(),
    genericName: textOrNull(input.generic_name),
    categoryId: textOrNull(input.category_id),
    reorderLevel: numberOrNull(input.minimum_stock) ?? 0,
    isControlled: input.controlled_substance === true,
    initialStockQuantity: hasStock ? stock : null,
    batchNumber: hasStock ? textOrNull(input.batch_number) : null,
    expiryDate: hasStock ? (textOrNull(input.expiry_date)?.slice(0, 10) ?? null) : null,
    rackLocation: hasStock ? textOrNull(input.rack_location) : null,
    costPrice: numberOrNull(input.cost_price),
    // The batch's selling price is the medicine's unit price (legacy batches snapshot unit_price).
    sellingPrice: unitPrice,
    unitPrice,
    form: textOrNull(input.form),
    strength: textOrNull(input.strength),
    supplierId: textOrNull(input.supplier_id),
    barcode: textOrNull(input.barcode),
    description: textOrNull(input.description),
    maximumStock: numberOrNull(input.maximum_stock),
    prescriptionRequired: input.prescription_required === true,
    brandName: textOrNull(input.brand_name),
    dosage: textOrNull(input.dosage),
    sideEffects: textOrNull(input.side_effects),
    storageInstructions: textOrNull(input.storage_instructions),
    storageTempMinC: numberOrNull(input.storage_temp_min_c),
    storageTempMaxC: numberOrNull(input.storage_temp_max_c),
    requiresColdChain: typeof input.requires_cold_chain === "boolean" ? input.requires_cold_chain : null,
    unitsPerPack: numberOrNull(input.units_per_pack),
    unitLabel: textOrNull(input.unit_label),
    isTaxable: typeof input.is_taxable === "boolean" ? input.is_taxable : null,
    supplierInvoiceNumber: textOrNull(input.supplier_invoice_number),
    vatAmount: numberOrNull(input.vat_amount),
  }
}

/**
 * Maps a legacy partial update onto the full UpdateMedicineCommand. The .NET update replaces every field,
 * so fields absent from the input keep their current .NET value. Stock and batch fields are always null.
 */
export function toDotnetUpdateMedicineCommand(current: DotnetMedicineDto, input: LegacyMedicineWriteFields): DotnetMedicineWriteCommand {
  const unitPrice = input.unit_price !== undefined ? numberOrNull(input.unit_price) : current.unitPrice
  // Clear only when maximum_stock is explicitly present and empty (null or blank). Absent keeps the stored value.
  const rawMaximumStock: unknown = input.maximum_stock
  const clearMaximumStock = rawMaximumStock === null || (typeof rawMaximumStock === "string" && rawMaximumStock.trim() === "")
  return {
    name: input.name !== undefined ? input.name.trim() : current.name,
    genericName: input.generic_name !== undefined ? textOrNull(input.generic_name) : current.genericName,
    categoryId: input.category_id !== undefined ? textOrNull(input.category_id) : current.categoryId,
    reorderLevel: input.minimum_stock !== undefined ? (numberOrNull(input.minimum_stock) ?? 0) : current.reorderLevel,
    isControlled: input.controlled_substance !== undefined ? input.controlled_substance === true : current.isControlled,
    initialStockQuantity: null,
    batchNumber: null,
    expiryDate: null,
    rackLocation: null,
    costPrice: input.cost_price !== undefined ? numberOrNull(input.cost_price) : current.costPrice,
    sellingPrice: unitPrice,
    unitPrice,
    form: input.form !== undefined ? textOrNull(input.form) : current.form,
    strength: input.strength !== undefined ? textOrNull(input.strength) : current.strength,
    supplierId: input.supplier_id !== undefined ? textOrNull(input.supplier_id) : current.supplierId,
    barcode: input.barcode !== undefined ? textOrNull(input.barcode) : current.barcode,
    description: input.description !== undefined ? textOrNull(input.description) : current.description,
    // A null maximumStock keeps the stored value on the .NET side, so an explicit clear is sent as clearMaximumStock.
    maximumStock: clearMaximumStock ? null : (numberOrNull(input.maximum_stock) ?? current.maximumStock),
    clearMaximumStock,
    prescriptionRequired: input.prescription_required !== undefined ? input.prescription_required === true : current.prescriptionRequired,
    brandName: keepOrSet(input.brand_name, current.brandName, asText),
    dosage: keepOrSet(input.dosage, current.dosage, asText),
    sideEffects: keepOrSet(input.side_effects, current.sideEffects, asText),
    storageInstructions: keepOrSet(input.storage_instructions, current.storageInstructions, asText),
    storageTempMinC: keepOrSet(input.storage_temp_min_c, current.storageTempMinC, asNumber),
    storageTempMaxC: keepOrSet(input.storage_temp_max_c, current.storageTempMaxC, asNumber),
    requiresColdChain: typeof input.requires_cold_chain === "boolean" ? input.requires_cold_chain : current.requiresColdChain,
    unitsPerPack: keepOrSet(input.units_per_pack, current.unitsPerPack, asNumber),
    unitLabel: keepOrSet(input.unit_label, current.unitLabel, asText),
    isTaxable: typeof input.is_taxable === "boolean" ? input.is_taxable : current.isTaxable,
    supplierInvoiceNumber: keepOrSet(input.supplier_invoice_number, current.supplierInvoiceNumber, asText),
    vatAmount: keepOrSet(input.vat_amount, current.vatAmount, asNumber),
    clearOptionalDetails: clearsOptionalDetails(current, input),
  }
}

/** Optional-detail fields that clearOptionalDetails unsets on the .NET side. */
const OPTIONAL_DETAIL_KEYS = [
  "brandName",
  "dosage",
  "sideEffects",
  "storageInstructions",
  "storageTempMinC",
  "storageTempMaxC",
  "unitsPerPack",
  "unitLabel",
  "supplierInvoiceNumber",
  "vatAmount",
] as const satisfies readonly (keyof DotnetMedicineWriteCommand & keyof DotnetMedicineDto)[]

/** True when the input explicitly clears a detail that the stored medicine currently holds. */
function clearsOptionalDetails(current: DotnetMedicineDto, input: LegacyMedicineWriteFields): boolean {
  const pairs: [unknown, unknown][] = [
    [input.brand_name, current.brandName],
    [input.dosage, current.dosage],
    [input.side_effects, current.sideEffects],
    [input.storage_instructions, current.storageInstructions],
    [input.storage_temp_min_c, current.storageTempMinC],
    [input.storage_temp_max_c, current.storageTempMaxC],
    [input.units_per_pack, current.unitsPerPack],
    [input.unit_label, current.unitLabel],
    [input.supplier_invoice_number, current.supplierInvoiceNumber],
    [input.vat_amount, current.vatAmount],
  ]
  return pairs.some(([raw, stored]) => isExplicitClear(raw) && stored !== null && stored !== undefined)
}

function asText(raw: unknown): string | null {
  return textOrNull(typeof raw === "string" ? raw : undefined)
}

function asNumber(raw: unknown): number | null {
  return numberOrNull(typeof raw === "number" || typeof raw === "string" ? raw : undefined)
}

/** Absent input keeps the stored value, an explicit clear yields null, anything else is parsed. */
function keepOrSet<T>(raw: unknown, stored: T | null, parse: (value: unknown) => T | null): T | null {
  if (raw === undefined) return stored
  if (isExplicitClear(raw)) return null
  return parse(raw)
}

/**
 * The update requests to send, in order. clearOptionalDetails unsets every optional detail at once, so a
 * clear that must keep other details is sent as two updates: first the clear (all details null), then the
 * remaining values. Non-atomic: if the second request fails, the kept details are left unset.
 */
export function toDotnetUpdateMedicineSteps(current: DotnetMedicineDto, input: LegacyMedicineWriteFields): DotnetMedicineWriteCommand[] {
  const command = toDotnetUpdateMedicineCommand(current, input)
  if (!command.clearOptionalDetails) return [command]
  const cleared: DotnetMedicineWriteCommand = {
    ...command,
    brandName: null,
    dosage: null,
    sideEffects: null,
    storageInstructions: null,
    storageTempMinC: null,
    storageTempMaxC: null,
    unitsPerPack: null,
    unitLabel: null,
    supplierInvoiceNumber: null,
    vatAmount: null,
    clearOptionalDetails: true,
  }
  const keepsAnyDetail = OPTIONAL_DETAIL_KEYS.some((key) => command[key] !== null)
  return keepsAnyDetail ? [cleared, { ...command, clearOptionalDetails: false }] : [cleared]
}

/**
 * Builds the legacy-shaped row the UI caches after a write. The .NET side returns only an id, so the
 * other fields come from the command and the request input. Category and supplier names are not known.
 */
export function toLegacyMedicineWriteResult(
  id: string,
  command: DotnetMedicineWriteCommand,
  stockQuantity: number,
  input: LegacyMedicineWriteFields,
  createdAt: string,
  nowIso: string,
): LegacyMedicineWriteResult {
  return {
    ...input,
    id,
    name: command.name,
    generic_name: command.genericName,
    form: command.form ?? "",
    strength: command.strength ?? "",
    unit_price: money2(command.unitPrice ?? 0),
    cost_price: money2(command.costPrice ?? 0),
    stock_quantity: stockQuantity,
    minimum_stock: command.reorderLevel,
    category_id: command.categoryId,
    supplier_id: command.supplierId,
    barcode: command.barcode,
    description: command.description,
    maximum_stock: command.maximumStock,
    prescription_required: command.prescriptionRequired,
    controlled_substance: command.isControlled,
    created_at: createdAt,
    updated_at: nowIso,
    categories: null,
    suppliers: null,
  }
}

export const catalogDotnetApi = {
  /** Current .NET medicine, or null when the id is not in the .NET store (404). */
  findMedicine: async (medicineId: string): Promise<DotnetMedicineDto | null> => {
    try {
      return await dotnetClient.get<DotnetMedicineDto>(`/api/v1/inventory/medicines/${encodeURIComponent(medicineId)}`)
    } catch (error) {
      if (error instanceof DotnetApiError && error.normalized.status === 404) return null
      throw error
    }
  },
  createMedicine: async (input: LegacyMedicineWriteFields): Promise<LegacyMedicineWriteResult> => {
    const command = toDotnetCreateMedicineCommand(input)
    const id = await dotnetClient.post<string>("/api/v1/inventory/medicines", command)
    const now = new Date().toISOString()
    return toLegacyMedicineWriteResult(id, command, command.initialStockQuantity ?? 0, input, now, now)
  },
  updateMedicine: async (
    current: DotnetMedicineDto,
    medicineId: string,
    input: LegacyMedicineWriteFields,
  ): Promise<LegacyMedicineWriteResult> => {
    const steps = toDotnetUpdateMedicineSteps(current, input)
    for (const step of steps) {
      await dotnetClient.put<string>(`/api/v1/inventory/medicines/${encodeURIComponent(medicineId)}`, step)
    }
    const command = steps[steps.length - 1]
    return toLegacyMedicineWriteResult(medicineId, command, current.totalQuantityOnHand, input, current.createdAtUtc, new Date().toISOString())
  },
  searchNepal: async (query: string, limit = 10): Promise<NepalMedicineCatalogItem[]> => {
    const rows = await dotnetClient.get<DotnetNepalCatalogEntryDto[]>(nepalCatalogPath(query, limit))
    return rows.map(toNepalCatalogItem)
  },
  findSimilarNames: async (name: string, excludeId?: string): Promise<SimilarMedicineName[]> => {
    const rows = await dotnetClient.get<DotnetSimilarMedicineNameDto[]>(similarNamesPath(name, excludeId))
    return rows.map(toSimilarMedicineName)
  },
  listPriceHistory: async (medicineId: string): Promise<MedicinePriceHistoryRow[]> => {
    const rows = await dotnetClient.get<DotnetMedicinePriceHistoryDto[]>(
      `/api/v1/inventory/medicines/${encodeURIComponent(medicineId)}/price-history`,
    )
    return rows.map(toPriceHistoryRow)
  },
  schedulePriceChange: async (medicineId: string, input: PriceScheduleInput): Promise<{ id: string }> => {
    const id = await dotnetClient.post<string>(
      `/api/v1/inventory/medicines/${encodeURIComponent(medicineId)}/price-history`,
      priceScheduleBody(input),
    )
    return { id }
  },
  cancelScheduledPrice: async (medicineId: string, historyId: string): Promise<void> => {
    await dotnetClient.delete(
      `/api/v1/inventory/medicines/${encodeURIComponent(medicineId)}/price-history/${encodeURIComponent(historyId)}`,
    )
  },
}
