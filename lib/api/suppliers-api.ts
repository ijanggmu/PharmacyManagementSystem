/**
 * Supplier calls, switchable per backend target (SUPPLIERS). The legacy path keeps /api/suppliers.
 * The dotnet path uses the Suppliers module's /api/v1/suppliers.
 *
 * Not carried over: reconciliation_account_ref and the latest_* bill/payment summary fields (the
 * SupplierDto has no such columns), and the "incomplete" profile filter, which has no .NET equivalent
 * and is rejected with an error on this path. Statement, ledger, payments and returns stay legacy.
 */

import type { Supplier, SuppliersFilters, CreateSupplierInput, SuppliersResponse } from "@/features/suppliers/api-client"
import { dotnetClient } from "@/lib/api/dotnet-client"
import { dotnetGetAllPages } from "@/lib/api/stock-dotnet"

/** SupplierDto (Suppliers module, camelCase JSON). CurrentBalance > 0 means the pharmacy owes the supplier. */
export interface DotnetSupplierDto {
  id: string
  name: string
  contactPerson: string | null
  phone: string | null
  email: string | null
  address: string | null
  taxId: string | null
  currentBalance: number
  isActive: boolean
  createdAtUtc: string
  updatedAtUtc: string | null
}

export interface DotnetPagedSuppliers {
  items: DotnetSupplierDto[]
  pageNumber: number
  pageSize: number
  totalCount: number
  totalPages: number
}

export interface SupplierUpdateInput {
  name?: string
  contact_person?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
}

export const INCOMPLETE_PROFILE_UNSUPPORTED = "The incomplete-profile filter is not available on the .NET backend yet."

function nullIfEmpty(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null
  const trimmed = value.trim()
  return trimmed === "" ? null : trimmed
}

export function toSupplier(dto: DotnetSupplierDto): Supplier {
  return {
    id: dto.id,
    name: dto.name,
    contact_person: dto.contactPerson,
    email: dto.email,
    phone: dto.phone,
    address: dto.address,
    reconciliation_account_ref: null,
    payable_amount: Math.max(dto.currentBalance, 0),
    receivable_amount: Math.max(-dto.currentBalance, 0),
    created_at: dto.createdAtUtc,
  }
}

export function suppliersListQuery(filters?: SuppliersFilters): string {
  if (filters?.status === "incomplete") throw new Error(INCOMPLETE_PROFILE_UNSUPPORTED)
  const p = new URLSearchParams()
  if (filters?.search?.trim()) p.set("search", filters.search.trim())
  if (filters?.page != null) p.set("pageNumber", String(filters.page))
  if (filters?.limit != null) p.set("pageSize", String(filters.limit))
  if (filters?.sortBy) p.set("sortBy", filters.sortBy)
  if (filters?.sortOrder) p.set("sortDir", filters.sortOrder)
  if (filters?.status === "active") p.set("isActive", "true")
  const q = p.toString()
  return `/api/v1/suppliers${q ? `?${q}` : ""}`
}

export function toSuppliersResponse(page: DotnetPagedSuppliers): SuppliersResponse {
  return {
    data: page.items.map(toSupplier),
    error: null,
    total: page.totalCount,
  }
}

export function supplierCreateBody(input: CreateSupplierInput) {
  return {
    name: input.name.trim(),
    contactPerson: nullIfEmpty(input.contact_person),
    phone: nullIfEmpty(input.phone),
    email: nullIfEmpty(input.email),
    address: nullIfEmpty(input.address),
    taxId: null,
    openingBalance: 0,
  }
}

/** Full-replace PUT, so the stored row is merged with the partial update. */
export function supplierUpdateBody(current: DotnetSupplierDto, updates: SupplierUpdateInput) {
  return {
    name: updates.name?.trim() || current.name,
    contactPerson: updates.contact_person !== undefined ? nullIfEmpty(updates.contact_person) : current.contactPerson,
    phone: updates.phone !== undefined ? nullIfEmpty(updates.phone) : current.phone,
    email: updates.email !== undefined ? nullIfEmpty(updates.email) : current.email,
    address: updates.address !== undefined ? nullIfEmpty(updates.address) : current.address,
    taxId: current.taxId,
    isActive: current.isActive,
  }
}

/** SupplierStatementLineDto (camelCase). Amount direction: CurrentBalance += debit - credit. */
export interface DotnetSupplierStatementLineDto {
  id: string
  entryDateUtc: string
  entryType: string
  referenceType: string | null
  referenceId: string | null
  description: string | null
  debitAmount: number
  creditAmount: number
  runningBalance: number
  branchId?: string | null
}

export interface DotnetSupplierStatementDto {
  supplierId: string
  periodFromUtc: string
  periodToUtc: string
  openingBalance: number
  closingBalance: number
  lines: DotnetSupplierStatementLineDto[]
}

/** SupplierLedgerEntryDto (camelCase). Paged, newest first. */
export interface DotnetSupplierLedgerEntryDto {
  id: string
  supplierId: string
  entryDateUtc: string
  entryType: string
  description: string | null
  debitAmount: number
  creditAmount: number
  runningBalance: number
  referenceType: string | null
  referenceId: string | null
  createdAtUtc: string
  branchId?: string | null
}

/** SupplierCostHistoryDto (camelCase). */
export interface DotnetSupplierCostHistoryDto {
  medicineId: string
  medicineName: string
  receiptDateUtc: string
  unitCost: number
  quantityReceived: number
}

/** Legacy row shapes, as returned by /api/suppliers/[id]/statement, /api/supplier-ledger and cost-history. */
export interface LegacySupplierStatementLine {
  id: string
  entry_date: string
  entry_type: string
  reference_number: string | null
  supplier_bill_number: string | null
  description: string | null
  amount: number
  balance_after: number | null
}

export interface LegacySupplierStatement {
  supplier_id: string
  period_from: string
  period_to: string
  opening_balance: number
  closing_balance: number
  lines: LegacySupplierStatementLine[]
}

export interface LegacySupplierLedgerEntry {
  id: string
  entry_date: string
  entry_type: string
  reference_number: string | null
  supplier_bill_number: string | null
  description: string | null
  amount: number
  balance_after: number | null
  created_at: string
}

export interface LegacySupplierLedgerSummary {
  supplierId: string
  balance: number
  supplier: { id: string; name: string; reconciliation_account_ref: string | null; phone: string | null; email: string | null } | null
  entries: LegacySupplierLedgerEntry[]
}

export interface LegacySupplierCostHistoryRow {
  medicine_id: string
  medicine_name: string
  receipt_date: string
  unit_cost: number
  quantity_received: number
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

function round2(value: number): number {
  return Number(value.toFixed(2))
}

/** Legacy statement bounds are whole days (entry_date is a date column), so widen to UTC day edges. */
export function statementBounds(from: string, to: string): { fromUtc: string; toUtc: string } {
  if (!DATE_ONLY.test(from) || !DATE_ONLY.test(to)) throw new Error("Statement dates must be YYYY-MM-DD.")
  return { fromUtc: `${from}T00:00:00.000Z`, toUtc: `${to}T23:59:59.999Z` }
}

export function supplierStatementQuery(supplierId: string, from: string, to: string, branchId?: string | null): string {
  const bounds = statementBounds(from, to)
  const p = new URLSearchParams({ fromUtc: bounds.fromUtc, toUtc: bounds.toUtc })
  if (branchId) p.set("branchId", branchId)
  return `/api/v1/suppliers/${encodeURIComponent(supplierId)}/statement?${p.toString()}`
}

const LEDGER_ENTRY_TYPE: Record<string, string> = {
  OpeningBalance: "opening_balance",
  Purchase: "purchase",
  Payment: "payment",
  Return: "return",
  Adjustment: "adjustment",
}

/** Unknown .NET entry types fail loudly rather than being shown under a guessed label. */
export function legacyEntryType(dotnetType: string): string {
  const mapped = LEDGER_ENTRY_TYPE[dotnetType]
  if (!mapped) throw new Error(`Unknown supplier ledger entry type from .NET API: ${dotnetType}`)
  return mapped
}

export function toStatementLine(line: DotnetSupplierStatementLineDto): LegacySupplierStatementLine {
  return {
    id: line.id,
    entry_date: line.entryDateUtc.slice(0, 10),
    entry_type: legacyEntryType(line.entryType),
    reference_number: null,
    supplier_bill_number: null,
    description: line.description,
    amount: round2(line.debitAmount - line.creditAmount),
    balance_after: line.runningBalance,
  }
}

/** Known gaps: no supplier bill number or reference number on .NET lines (both null here). */
export function toSupplierStatement(dto: DotnetSupplierStatementDto, from: string, to: string): LegacySupplierStatement {
  return {
    supplier_id: dto.supplierId,
    period_from: from,
    period_to: to,
    opening_balance: round2(dto.openingBalance),
    closing_balance: round2(dto.closingBalance),
    lines: dto.lines.map(toStatementLine),
  }
}

export function toSupplierLedgerEntry(dto: DotnetSupplierLedgerEntryDto): LegacySupplierLedgerEntry {
  return {
    id: dto.id,
    entry_date: dto.entryDateUtc.slice(0, 10),
    entry_type: legacyEntryType(dto.entryType),
    reference_number: null,
    supplier_bill_number: null,
    description: dto.description,
    amount: round2(dto.debitAmount - dto.creditAmount),
    balance_after: dto.runningBalance,
    created_at: dto.createdAtUtc,
  }
}

/**
 * The legacy ledger lists oldest first and takes its balance from the last row. The .NET ledger arrives
 * newest first, so the entries are reversed here.
 */
export function toSupplierLedgerSummary(
  supplierId: string,
  supplier: Supplier | null,
  newestFirst: DotnetSupplierLedgerEntryDto[],
): LegacySupplierLedgerSummary {
  const entries = newestFirst.map(toSupplierLedgerEntry).reverse()
  const balance = entries.length ? Number(entries[entries.length - 1].balance_after ?? 0) : 0
  return {
    supplierId,
    balance,
    supplier: supplier
      ? { id: supplier.id, name: supplier.name, reconciliation_account_ref: null, phone: supplier.phone, email: supplier.email }
      : null,
    entries,
  }
}

export function toCostHistoryRow(dto: DotnetSupplierCostHistoryDto): LegacySupplierCostHistoryRow {
  return {
    medicine_id: dto.medicineId,
    medicine_name: dto.medicineName,
    receipt_date: dto.receiptDateUtc.slice(0, 10),
    unit_cost: dto.unitCost,
    quantity_received: dto.quantityReceived,
  }
}

/** Legacy order: newest receipt first. Ties keep the .NET order. */
export function toCostHistory(rows: DotnetSupplierCostHistoryDto[]): LegacySupplierCostHistoryRow[] {
  return rows
    .map(toCostHistoryRow)
    .sort((a, b) => (a.receipt_date < b.receipt_date ? 1 : a.receipt_date > b.receipt_date ? -1 : 0))
}

export function supplierCostHistoryQuery(supplierId: string, limit = 200): string {
  const bounded = Number.isFinite(limit) && limit > 0 ? Math.trunc(limit) : 200
  return `/api/v1/suppliers/${encodeURIComponent(supplierId)}/cost-history?limit=${bounded}`
}

/** Legacy return payload. The .NET command needs a return date (UTC) that the legacy form never sent, so the caller supplies it. */
export interface SupplierReturnInput {
  supplier_id: string
  notes?: string
  items: Array<{ medicine_id: string; quantity: number; unit_cost: number; return_reason: string; notes?: string }>
}

export function supplierReturnCreateBody(input: SupplierReturnInput, returnDateUtc: string) {
  return {
    returnDateUtc,
    notes: nullIfEmpty(input.notes),
    items: input.items.map((item) => ({
      medicineId: item.medicine_id,
      quantity: item.quantity,
      unitCost: item.unit_cost,
      returnReason: item.return_reason,
      notes: nullIfEmpty(item.notes),
    })),
  }
}

export const suppliersDotnetApi = {
  statement: async (id: string, from: string, to: string, branchId?: string | null): Promise<LegacySupplierStatement> => {
    const dto = await dotnetClient.get<DotnetSupplierStatementDto>(supplierStatementQuery(id, from, to, branchId))
    return toSupplierStatement(dto, from, to)
  },
  ledger: async (id: string): Promise<LegacySupplierLedgerSummary> => {
    const [supplier, rows] = await Promise.all([
      suppliersDotnetApi.get(id).catch(() => null),
      dotnetGetAllPages<DotnetSupplierLedgerEntryDto>(`/api/v1/suppliers/${encodeURIComponent(id)}/ledger`),
    ])
    return toSupplierLedgerSummary(id, supplier, rows)
  },
  costHistory: async (id: string, limit = 200): Promise<LegacySupplierCostHistoryRow[]> => {
    const rows = await dotnetClient.get<DotnetSupplierCostHistoryDto[]>(supplierCostHistoryQuery(id, limit))
    return toCostHistory(rows)
  },
  /** Money and stock write. The .NET endpoint is idempotent, so the caller passes a key per submit. */
  createReturn: async (input: SupplierReturnInput, idempotencyKey: string, returnDateUtc = new Date().toISOString()) => {
    const id = await dotnetClient.post<string>(
      `/api/v1/suppliers/${encodeURIComponent(input.supplier_id)}/returns`,
      supplierReturnCreateBody(input, returnDateUtc),
      idempotencyKey,
    )
    return { id }
  },
  list: async (filters?: SuppliersFilters): Promise<SuppliersResponse> => {
    const page = await dotnetClient.get<DotnetPagedSuppliers>(suppliersListQuery(filters))
    return toSuppliersResponse(page)
  },
  get: async (id: string): Promise<Supplier> => {
    const dto = await dotnetClient.get<DotnetSupplierDto>(`/api/v1/suppliers/${encodeURIComponent(id)}`)
    return toSupplier(dto)
  },
  create: async (input: CreateSupplierInput): Promise<Supplier> => {
    const id = await dotnetClient.post<string>("/api/v1/suppliers", supplierCreateBody(input))
    return suppliersDotnetApi.get(id)
  },
  update: async (id: string, updates: SupplierUpdateInput): Promise<Supplier> => {
    const path = `/api/v1/suppliers/${encodeURIComponent(id)}`
    const current = await dotnetClient.get<DotnetSupplierDto>(path)
    await dotnetClient.put(path, supplierUpdateBody(current, updates))
    return suppliersDotnetApi.get(id)
  },
}
