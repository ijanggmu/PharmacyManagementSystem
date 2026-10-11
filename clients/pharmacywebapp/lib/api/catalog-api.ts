/**
 * Medicine catalog helpers, switchable per backend target (CATALOG): Nepal catalog search,
 * LASA similar-name check, price-list history, medicine create/edit, list/detail/stats, bulk import,
 * batch recall, delete and restore (archive/unarchive).
 *
 * Create/edit map the legacy snake_case form payload onto the .NET command, including the legacy detail
 * fields (brand, dosage, storage, pack size, tax flag, supplier invoice, VAT). On create, initial stock
 * without a batch number/expiry, or with a supplier, falls back to the legacy path because the .NET
 * receipt cannot express it. On update, a stock change also falls back.
 */

import { DotnetApiError, dotnetClient } from "@/lib/api/dotnet-client"
import { dotnetGetAllPages, type DotnetPagedResponse } from "@/lib/api/stock-dotnet"

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
/** A supplier bill paid when it is entered. Leaving it out means the bill is on credit. */
export interface SupplierBillPaymentInput {
  /** cash | bank | cheque | card | esewa | khalti | fonepay (cash posts to Cash, the rest to Bank). */
  method: string
  /** Defaults to the full bill total including VAT; may be less (part payment). */
  amount?: number | null
  reference?: string | null
  /** YYYY-MM-DD; defaults to the receipt date. */
  payment_date?: string | null
}

/** The .NET `payment` object on create medicine, bulk import rows and direct goods receipts. */
export interface DotnetSupplierBillPayment {
  method: string
  amount: number | null
  reference: string | null
  paymentDateUtc: string | null
}

export function toDotnetSupplierBillPayment(input: SupplierBillPaymentInput | null | undefined): DotnetSupplierBillPayment | null {
  if (!input || !input.method) return null
  const amount = numberOrNull(input.amount)
  const date = textOrNull(input.payment_date)
  return {
    method: input.method,
    amount: amount !== null && amount > 0 ? amount : null,
    reference: textOrNull(input.reference),
    paymentDateUtc: date ? (date.includes("T") ? date : `${date.slice(0, 10)}T00:00:00Z`) : null,
  }
}

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
  /** Controlled-substance schedule (e.g. II, III). Blank or null clears it on update. Max 20 characters. */
  controlled_schedule?: string | null
  is_taxable?: boolean
  supplier_invoice_number?: string | null
  vat_amount?: number | null
  requires_cold_chain?: boolean
  storage_temp_min_c?: number | string | null
  storage_temp_max_c?: number | string | null
  units_per_pack?: number | null
  unit_label?: string | null
  /** Update only: reason sent with a stock_quantity change (defaults to "Manual stock adjustment"). */
  stock_adjustment_reason?: string | null
  /** Create only: the opening-stock supplier bill was paid at entry. */
  payment?: SupplierBillPaymentInput | null
  /** Create only: save even though a medicine with the same name + strength + form exists. */
  allow_duplicate?: boolean
  /** Update only: why the selling/cost price changed; shown in the price history. */
  price_change_reason?: string | null
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
  /** Update only: sets this branch's on-hand to the target quantity (StockAdjustmentTargetQuantity). */
  stockAdjustmentTargetQuantity?: number | null
  /** Update only: required by the .NET API whenever stockAdjustmentTargetQuantity is set. */
  stockAdjustmentReason?: string | null
  /** Controlled-substance schedule (max 20). Null keeps the stored value on update. */
  controlledSchedule?: string | null
  /** Update only: true unsets the stored schedule (a null controlledSchedule alone keeps it). */
  clearControlledSchedule?: boolean
  /** Create only: the opening-stock bill was paid at entry (needs a supplier and stock). */
  payment?: DotnetSupplierBillPayment | null
  /** Create only: false (default) answers 409 when the same name + strength + form already exists. */
  allowDuplicate?: boolean
  /** Update only: recorded on the price-history row when this edit changes a price. */
  priceChangeReason?: string | null
}

/** An existing medicine with the same name + strength + form (GET /inventory/medicines/duplicates). */
export interface DuplicateMedicine {
  id: string
  name: string
  genericName: string | null
  brandName: string | null
  strength: string | null
  form: string | null
  barcode: string | null
  stockOnHand: number
}

/** AddMedicineStockCommand: a new batch of an existing medicine, posted like opening stock on create. */
export interface DotnetAddMedicineStockCommand {
  quantity: number
  batchNumber: string | null
  expiryDate: string | null
  rackLocation: string | null
  costPrice: number | null
  sellingPrice: number | null
  supplierId: string | null
  supplierInvoiceNumber: string | null
  vatAmount: number | null
  payment: DotnetSupplierBillPayment | null
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
  controlledSchedule?: string | null
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
    controlledSchedule: textOrNull(input.controlled_schedule),
    // A payment only means something for a supplier bill with stock on it.
    payment: hasStock && textOrNull(input.supplier_id) ? toDotnetSupplierBillPayment(input.payment) : null,
    allowDuplicate: input.allow_duplicate === true,
  }
}

/** The create form's stock fields as a new batch of an existing medicine (same mapping as opening stock). */
export function toDotnetAddMedicineStockCommand(input: LegacyMedicineWriteFields): DotnetAddMedicineStockCommand {
  const command = toDotnetCreateMedicineCommand(input)
  return {
    quantity: command.initialStockQuantity ?? 0,
    batchNumber: command.batchNumber ?? null,
    expiryDate: command.expiryDate ?? null,
    rackLocation: command.rackLocation ?? null,
    costPrice: command.costPrice ?? null,
    sellingPrice: command.sellingPrice ?? null,
    supplierId: command.supplierId ?? null,
    supplierInvoiceNumber: command.supplierInvoiceNumber ?? null,
    vatAmount: command.vatAmount ?? null,
    payment: command.payment ?? null,
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
    // Absent keeps the stored schedule; an explicit blank/null clears it (see clearControlledSchedule).
    controlledSchedule: keepOrSet(input.controlled_schedule, current.controlledSchedule ?? null, asText),
    clearControlledSchedule: isExplicitClear(input.controlled_schedule),
    clearOptionalDetails: clearsOptionalDetails(current, input),
    ...stockAdjustmentFields(current, input),
    priceChangeReason: textOrNull(input.price_change_reason),
  }
}

/** A stock_quantity that differs from the on-hand total maps to a target-quantity adjustment. */
function stockAdjustmentFields(
  current: DotnetMedicineDto,
  input: LegacyMedicineWriteFields,
): Pick<DotnetMedicineWriteCommand, "stockAdjustmentTargetQuantity" | "stockAdjustmentReason"> {
  const target = numberOrNull(input.stock_quantity)
  if (target === null || target === current.totalQuantityOnHand) {
    return { stockAdjustmentTargetQuantity: null, stockAdjustmentReason: null }
  }
  return {
    stockAdjustmentTargetQuantity: target,
    stockAdjustmentReason: textOrNull(input.stock_adjustment_reason) ?? "Manual stock adjustment",
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
    // The stock adjustment rides on the first request only, so the second request does not repeat it.
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
  return keepsAnyDetail
    ? [cleared, { ...command, clearOptionalDetails: false, stockAdjustmentTargetQuantity: null, stockAdjustmentReason: null }]
    : [cleared]
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
    controlled_schedule: command.controlledSchedule ?? null,
    created_at: createdAt,
    updated_at: nowIso,
    categories: null,
    suppliers: null,
  }
}

/** One FEFO lot on a medicine (MedicineDto.FefoPicks). */
export interface DotnetFefoPickRow {
  batchNo: string
  /** "9999-12-31" when the lot has no expiry. */
  expiryDate: string
  rackLocation: string | null
  quantityOnHand: number
}

/** MedicineDto (Inventory module) as returned by the list (GET /inventory/medicines) and detail (GET /{id}) endpoints. */
export interface DotnetMedicineListRow {
  id: string
  name: string
  genericName: string | null
  categoryId: string | null
  reorderLevel: number
  isControlled: boolean
  totalQuantityOnHand: number
  /** Stock at the caller's current branch; null when the tenant has no branches. */
  branchQuantityOnHand: number | null
  isArchived: boolean
  createdAtUtc: string
  updatedAtUtc: string | null
  batchNearestExpiry: string | null
  batchCount: number
  batchRackLocations: string[]
  fefoPicks: DotnetFefoPickRow[]
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
  controlledSchedule?: string | null
}

/** MedicineBatchDto (Inventory module) as returned by GET /inventory/batches. */
export interface DotnetMedicineBatchDto {
  id: string
  medicineId: string
  medicineName: string | null
  branchId: string
  batchNo: string
  /** "9999-12-31" when the lot has no expiry. */
  expiryDate: string
  quantityOnHand: number
  costPrice: number
  sellingPrice: number
  rackLocation: string | null
  isDisposed: boolean
  createdAtUtc: string
  updatedAtUtc: string | null
  isRecalled: boolean
  recalledAtUtc: string | null
  recallReason: string | null
  /** Branch display name from the Multitenancy contract; null when the branch cannot be resolved. */
  branchName: string | null
  /** Quantity received when the lot was created; falls back to on-hand on legacy rows. */
  receivedQuantity: number | null
}

/** GET /inventory/medicines/stats (MedicineStatsDto). */
export interface DotnetMedicineStatsRow {
  total: number
  lowStock: number
  expiringSoon: number
  expired: number
  totalValue: number
}

export interface DotnetMedicineListQuery {
  search?: string
  categoryId?: string
  categoryIds?: string[]
  supplierId?: string
  stockStatuses?: string[]
  expiryStatuses?: string[]
  includeArchived?: boolean
  /** Only medicines at or below their reorder level (branch stock when a branch is selected). */
  belowReorderLevel?: boolean
  /** Scope stock, filters and "at this branch" quantity to one branch (ViewAll users); omitted = server default. */
  branchId?: string
  /** name (default), quantity, expiry, price or updated. */
  sortBy?: DotnetMedicineSortBy
  /** asc (default) or desc. */
  sortOrder?: "asc" | "desc"
  pageNumber: number
  pageSize: number
}

export type DotnetMedicineSortBy = "name" | "quantity" | "expiry" | "price" | "updated"

/** One row of POST /inventory/medicines/bulk (BulkMedicineRow). */
export interface DotnetBulkMedicineRow {
  name: string
  genericName: string | null
  categoryId: string | null
  reorderLevel: number
  isControlled: boolean
  batchNo: string | null
  expiryDate: string | null
  quantity: number
  costPrice: number
  sellingPrice: number
  rackLocation: string | null
  unitPrice: number
  form: string | null
  strength: string | null
  maximumStock: number | null
  prescriptionRequired: boolean
  isTaxable: boolean
  supplierId: string | null
  supplierInvoiceNumber: string | null
  vatAmount: number
  /** Supplier bill date (YYYY-MM-DD); null means today. */
  receiptDate: string | null
  /** The bill was paid at entry; every row of one bill carries the same object (the server uses the first). */
  payment?: DotnetSupplierBillPayment | null
}

export interface DotnetBulkCreateResult {
  /** addedToExisting: the row matched an existing medicine (or an earlier row), so its stock went there. */
  created: { medicineId: string; batchId: string | null; addedToExisting?: boolean }[]
}

/** Query string for GET /inventory/medicines. Empty/undefined filters are omitted. */
export function medicineListPath(query: DotnetMedicineListQuery): string {
  const sp = new URLSearchParams({ pageNumber: String(query.pageNumber), pageSize: String(query.pageSize) })
  if (query.search) sp.set("search", query.search)
  if (query.categoryId) sp.set("categoryId", query.categoryId)
  for (const id of query.categoryIds ?? []) sp.append("categoryIds", id)
  if (query.supplierId) sp.set("supplierId", query.supplierId)
  for (const s of query.stockStatuses ?? []) sp.append("stockStatuses", s)
  for (const s of query.expiryStatuses ?? []) sp.append("expiryStatuses", s)
  if (query.includeArchived) sp.set("includeArchived", "true")
  if (query.belowReorderLevel) sp.set("belowReorderLevel", "true")
  if (query.branchId) sp.set("branchId", query.branchId)
  if (query.sortBy) sp.set("sortBy", query.sortBy)
  if (query.sortOrder) sp.set("sortOrder", query.sortOrder)
  return `/api/v1/inventory/medicines?${sp.toString()}`
}

const MEDICINES_PATH = "/api/v1/inventory/medicines"

export const catalogDotnetApi = {
  /** Paged medicine list (search, category, supplier, archived, stock/expiry filters). */
  listMedicines: async (query: DotnetMedicineListQuery): Promise<DotnetPagedResponse<DotnetMedicineListRow>> =>
    dotnetClient.get<DotnetPagedResponse<DotnetMedicineListRow>>(medicineListPath(query)),
  /** One medicine with its totals, batch summary and FEFO picks. Throws a 404 DotnetApiError when missing. */
  getMedicineRow: async (medicineId: string): Promise<DotnetMedicineListRow> =>
    dotnetClient.get<DotnetMedicineListRow>(`${MEDICINES_PATH}/${encodeURIComponent(medicineId)}`),
  /** Every lot of one medicine across branches (GET /inventory/batches, all pages). */
  listMedicineBatches: async (medicineId: string): Promise<DotnetMedicineBatchDto[]> =>
    dotnetGetAllPages<DotnetMedicineBatchDto>("/api/v1/inventory/batches", { medicineId }),
  getMedicineStats: async (branchId?: string): Promise<DotnetMedicineStatsRow> =>
    dotnetClient.get<DotnetMedicineStatsRow>(
      branchId ? `${MEDICINES_PATH}/stats?branchId=${encodeURIComponent(branchId)}` : `${MEDICINES_PATH}/stats`,
    ),
  bulkCreateMedicines: async (rows: DotnetBulkMedicineRow[]): Promise<DotnetBulkCreateResult> =>
    dotnetClient.post<DotnetBulkCreateResult>(`${MEDICINES_PATH}/bulk`, { rows }),
  recallMedicineBatch: async (
    medicineId: string,
    batchNumber: string,
    reason: string | null,
  ): Promise<{ affected: number }> =>
    dotnetClient.post<{ affected: number }>(`${MEDICINES_PATH}/${encodeURIComponent(medicineId)}/batches/recall`, {
      batchNumber,
      reason,
    }),
  /** Soft delete (archive); the .NET side keeps the row and its history. */
  deleteMedicine: async (medicineId: string): Promise<void> => {
    await dotnetClient.delete(`${MEDICINES_PATH}/${encodeURIComponent(medicineId)}`)
  },
  restoreMedicine: async (medicineId: string): Promise<void> => {
    await dotnetClient.post<string>(`${MEDICINES_PATH}/${encodeURIComponent(medicineId)}/restore`)
  },
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
    const stockQuantity = steps[0].stockAdjustmentTargetQuantity ?? current.totalQuantityOnHand
    return toLegacyMedicineWriteResult(medicineId, command, stockQuantity, input, current.createdAtUtc, new Date().toISOString())
  },
  searchNepal: async (query: string, limit = 10): Promise<NepalMedicineCatalogItem[]> => {
    const rows = await dotnetClient.get<DotnetNepalCatalogEntryDto[]>(nepalCatalogPath(query, limit))
    return rows.map(toNepalCatalogItem)
  },
  /** Medicines with the same name + strength + form (case/space-insensitive). */
  findDuplicateMedicines: async (
    name: string,
    strength: string | null,
    form: string | null,
    excludeId?: string,
  ): Promise<DuplicateMedicine[]> => {
    const sp = new URLSearchParams({ name })
    if (strength) sp.set("strength", strength)
    if (form) sp.set("form", form)
    if (excludeId) sp.set("excludeId", excludeId)
    return dotnetClient.get<DuplicateMedicine[]>(`${MEDICINES_PATH}/duplicates?${sp.toString()}`)
  },
  /** An unused in-store EAN-13 (prefix 2). Not reserved: the unique check runs again on save. */
  generateMedicineBarcode: async (): Promise<string> =>
    (await dotnetClient.get<{ barcode: string }>(`${MEDICINES_PATH}/barcodes/new`)).barcode,
  /** Sets one lot to an audited quantity; the difference posts as a stock loss or gain. */
  adjustBatchQuantity: async (batchId: string, newQuantity: number, reason: string): Promise<void> => {
    await dotnetClient.post(`/api/v1/inventory/batches/${encodeURIComponent(batchId)}/adjust`, { batchId, newQuantity, reason })
  },
  /** Receives a new batch of an existing medicine; returns the batch id. */
  addMedicineStock: async (medicineId: string, command: DotnetAddMedicineStockCommand): Promise<string> =>
    dotnetClient.post<string>(`${MEDICINES_PATH}/${encodeURIComponent(medicineId)}/stock`, command),
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
