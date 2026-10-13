/**
 * Supplier calls, switchable per backend target (SUPPLIERS). The legacy path keeps /api/suppliers.
 * The dotnet path uses the Suppliers module's /api/v1/suppliers.
 *
 * Not carried over: reconciliation_account_ref and the latest_* bill/payment summary fields (the
 * SupplierDto has no such columns, so the UI doesn't show them). TaxId is the PAN / VAT number. The "complete"/"incomplete" profile filter maps to isComplete on
 * GET /suppliers (contact person, phone and email all on file). Statement, ledger, payments and returns stay legacy.
 */

import type { Supplier, SuppliersFilters, CreateSupplierInput, SuppliersResponse } from "@/features/suppliers/api-client"
import { dotnetClient } from "@/lib/api/dotnet-client"
import { dotnetGetAllPages } from "@/lib/api/stock-dotnet"
import { nepalRangeUtc, nepalYmdOf } from "@/lib/utils/nepal-time"

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
  /** Default payment terms in days; null = none. */
  creditDays?: number | null
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
  tax_id?: string | null
  is_active?: boolean
  /** Default payment terms in days; null = none. */
  credit_days?: number | null
}

/** Server cap on GET /suppliers pageSize (SearchSuppliersQueryValidator). Larger requests are rejected with 400. */
export const SUPPLIERS_MAX_PAGE_SIZE = 200

/** SupplierLookupDto (GET /suppliers/lookup, camelCase). */
export interface DotnetSupplierLookupDto {
  id: string
  name: string
  phone: string | null
  isActive: boolean
  creditDays?: number | null
}

/** One row of a supplier picker. */
export interface SupplierOption {
  id: string
  name: string
  phone: string | null
  is_active: boolean
  /** Default payment terms in days; null = none. */
  credit_days?: number | null
}

export interface SupplierOptionsQuery {
  /** Server-side match on name or phone. */
  search?: string
  /** Inactive suppliers are left out unless set (e.g. to show a saved choice that has since been deactivated). */
  includeInactive?: boolean
  /** Rows to return, 1-1000 (server default 500). */
  limit?: number
}

/** Server cap on GET /suppliers/lookup limit (GetSupplierLookupQuery.MaxLimit). */
export const SUPPLIER_LOOKUP_MAX_LIMIT = 1000

export function supplierLookupQuery(query?: SupplierOptionsQuery): string {
  const p = new URLSearchParams()
  const search = query?.search?.trim()
  if (search) p.set("search", search)
  if (query?.includeInactive) p.set("includeInactive", "true")
  if (query?.limit != null) {
    const limit = Math.trunc(query.limit)
    p.set("limit", String(Math.min(Math.max(limit, 1), SUPPLIER_LOOKUP_MAX_LIMIT)))
  }
  const q = p.toString()
  return `/api/v1/suppliers/lookup${q ? `?${q}` : ""}`
}

export function toSupplierOption(dto: DotnetSupplierLookupDto): SupplierOption {
  return { id: dto.id, name: dto.name, phone: dto.phone, is_active: dto.isActive, credit_days: dto.creditDays ?? null }
}

/**
 * Union of option lists by id, first occurrence wins, sorted by name. Used to keep the chosen supplier
 * (and the initial list) visible while a server search narrows the results.
 */
export function mergeSupplierOptions(...lists: ReadonlyArray<readonly SupplierOption[] | undefined>): SupplierOption[] {
  const byId = new Map<string, SupplierOption>()
  for (const list of lists) {
    for (const option of list ?? []) {
      if (!byId.has(option.id)) byId.set(option.id, option)
    }
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
}

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
    tax_id: dto.taxId,
    is_active: dto.isActive,
    credit_days: dto.creditDays ?? null,
    updated_at: dto.updatedAtUtc,
    reconciliation_account_ref: null,
    payable_amount: Math.max(dto.currentBalance, 0),
    receivable_amount: Math.max(-dto.currentBalance, 0),
    created_at: dto.createdAtUtc,
  }
}

export function suppliersListQuery(filters?: SuppliersFilters): string {
  const p = new URLSearchParams()
  if (filters?.search?.trim()) p.set("search", filters.search.trim())
  if (filters?.page != null) p.set("pageNumber", String(filters.page))
  // Never ask for more than the server accepts; callers that want more rows go through listAll.
  if (filters?.limit != null) p.set("pageSize", String(Math.min(Math.max(Math.trunc(filters.limit), 1), SUPPLIERS_MAX_PAGE_SIZE)))
  if (filters?.sortBy) p.set("sortBy", filters.sortBy)
  if (filters?.sortOrder) p.set("sortDir", filters.sortOrder)
  const active = filters?.active && filters.active !== "all" ? filters.active : filters?.status
  const profile = filters?.profile && filters.profile !== "all" ? filters.profile : filters?.status
  if (active === "active") p.set("isActive", "true")
  if (active === "inactive") p.set("isActive", "false")
  if (profile === "complete") p.set("isComplete", "true")
  if (profile === "incomplete") p.set("isComplete", "false")
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
    taxId: nullIfEmpty(input.tax_id),
    openingBalance: 0,
    creditDays: input.credit_days ?? null,
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
    taxId: updates.tax_id !== undefined ? nullIfEmpty(updates.tax_id) : current.taxId,
    isActive: updates.is_active ?? current.isActive,
    // The PUT replaces the terms, so an update that doesn't mention them keeps the stored ones.
    creditDays: updates.credit_days !== undefined ? updates.credit_days : (current.creditDays ?? null),
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
  /** Our document number: GRN-… for a receipt, or the paid bill's GRN on a bill payment. */
  documentNumber?: string | null
  supplierBillNumber?: string | null
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
  documentNumber?: string | null
  supplierBillNumber?: string | null
  /** True on a payment that has been voided (a reversing SupplierPaymentVoid entry references it). */
  isVoided?: boolean
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
/** Ledger/statement fields beyond the legacy row: the debit/credit split, the source document and the branch. */
export interface SupplierLedgerLineExtras {
  debit: number
  credit: number
  /** "DirectGoodsReceipt" | "PurchaseOrder" | "SupplierReturn" | … ; on a payment, the bill it was applied to. */
  reference_type: string | null
  reference_id: string | null
  branch_id: string | null
}

export interface LegacySupplierStatementLine extends SupplierLedgerLineExtras {
  id: string
  entry_date: string
  entry_type: string
  /** Our document number (GRN-…); null for opening balances and unallocated payments. */
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

export interface LegacySupplierLedgerEntry extends SupplierLedgerLineExtras {
  id: string
  entry_date: string
  entry_type: string
  /** Our document number (GRN-…); null for opening balances and unallocated payments. */
  reference_number: string | null
  supplier_bill_number: string | null
  description: string | null
  amount: number
  balance_after: number | null
  created_at: string
  /** A payment that has been voided. */
  is_voided: boolean
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

/** Statement bounds are whole Nepal business days: 00:00 NPT on `from` to the last ms of `to` (inclusive). */
export function statementBounds(from: string, to: string): { fromUtc: string; toUtc: string } {
  if (!DATE_ONLY.test(from) || !DATE_ONLY.test(to)) throw new Error("Statement dates must be YYYY-MM-DD.")
  return nepalRangeUtc(from, to)
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
    reference_number: line.documentNumber ?? null,
    supplier_bill_number: line.supplierBillNumber ?? null,
    description: line.description,
    amount: round2(line.debitAmount - line.creditAmount),
    balance_after: line.runningBalance,
    debit: round2(line.debitAmount),
    credit: round2(line.creditAmount),
    reference_type: line.referenceType,
    reference_id: line.referenceId,
    branch_id: line.branchId ?? null,
  }
}

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
    reference_number: dto.documentNumber ?? null,
    supplier_bill_number: dto.supplierBillNumber ?? null,
    description: dto.description,
    amount: round2(dto.debitAmount - dto.creditAmount),
    balance_after: dto.runningBalance,
    created_at: dto.createdAtUtc,
    is_voided: dto.isVoided === true,
    debit: round2(dto.debitAmount),
    credit: round2(dto.creditAmount),
    reference_type: dto.referenceType,
    reference_id: dto.referenceId,
    branch_id: dto.branchId ?? null,
  }
}

/** One page of the supplier ledger, newest first (the server's order). */
export interface SupplierLedgerPage {
  entries: LegacySupplierLedgerEntry[]
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
}

export function supplierLedgerPageQuery(supplierId: string, page: number, pageSize: number, branchId?: string | null): string {
  const p = new URLSearchParams({ pageNumber: String(page), pageSize: String(pageSize) })
  if (branchId) p.set("branchId", branchId)
  return `/api/v1/suppliers/${encodeURIComponent(supplierId)}/ledger?${p.toString()}`
}

/** One bill from GET /suppliers/{id}/open-bills (camelCase). */
export interface DotnetSupplierOpenBillDto {
  ledgerEntryId: string
  billDateUtc: string
  entryType: string
  referenceType: string
  referenceId: string
  documentNumber: string | null
  supplierBillNumber: string | null
  description: string | null
  amount: number
  paid: number
  credited: number
  outstanding: number
  status: string
  ageDays: number
  branchId: string | null
  /** The bill's due date (its own, else bill date + the supplier's credit days); null = no terms. */
  dueDateUtc?: string | null
  /** > 0 overdue, 0 due today, < 0 days to go; null without a due date or once paid. */
  daysOverdue?: number | null
}

export interface DotnetSupplierOpenBillsDto {
  supplierId: string
  totalOutstanding: number
  unappliedCredit: number
  bills: DotnetSupplierOpenBillDto[]
}

export type SupplierBillStatus = "open" | "partially_paid" | "paid"

/**
 * A supplier bill with what is still owed on it. Payments applied to a bill settle that bill first;
 * other payments, returns and credits settle the oldest open bills.
 */
export interface SupplierOpenBill {
  ledger_entry_id: string
  bill_date: string
  reference_type: string
  reference_id: string
  /** GRN-… number; null for opening balances and older entries. */
  document_number: string | null
  supplier_bill_number: string | null
  description: string | null
  amount: number
  paid: number
  credited: number
  outstanding: number
  status: SupplierBillStatus
  age_days: number
  branch_id: string | null
  /** yyyy-MM-dd (Nepal day) the bill falls due; null = no payment terms. */
  due_date: string | null
  /** > 0 overdue, 0 due today, < 0 days to go; null without a due date or once paid. */
  days_overdue: number | null
  /** The opening balance or an adjustment rather than a purchase bill. */
  is_opening: boolean
}

export interface SupplierOpenBills {
  supplier_id: string
  total_outstanding: number
  /** Paid or credited beyond all bills (an advance). */
  unapplied_credit: number
  bills: SupplierOpenBill[]
}

const BILL_STATUS: Record<string, SupplierBillStatus> = { open: "open", partially_paid: "partially_paid", paid: "paid" }

export function toSupplierOpenBill(dto: DotnetSupplierOpenBillDto): SupplierOpenBill {
  return {
    ledger_entry_id: dto.ledgerEntryId,
    bill_date: dto.billDateUtc,
    reference_type: dto.referenceType,
    reference_id: dto.referenceId,
    document_number: dto.documentNumber,
    supplier_bill_number: dto.supplierBillNumber,
    description: dto.description,
    amount: round2(dto.amount),
    paid: round2(dto.paid),
    credited: round2(dto.credited),
    outstanding: round2(dto.outstanding),
    status: BILL_STATUS[dto.status.toLowerCase()] ?? "open",
    age_days: dto.ageDays,
    branch_id: dto.branchId,
    due_date: dto.dueDateUtc ? nepalYmdOf(new Date(dto.dueDateUtc)) : null,
    days_overdue: dto.daysOverdue ?? null,
    is_opening: dto.referenceType === "LedgerEntry",
  }
}

export function toSupplierOpenBills(dto: DotnetSupplierOpenBillsDto): SupplierOpenBills {
  return {
    supplier_id: dto.supplierId,
    total_outstanding: round2(dto.totalOutstanding),
    unapplied_credit: round2(dto.unappliedCredit),
    bills: dto.bills.map(toSupplierOpenBill),
  }
}

export function supplierOpenBillsQuery(supplierId: string, options?: { onlyOpen?: boolean; branchId?: string | null }): string {
  const p = new URLSearchParams({ onlyOpen: String(options?.onlyOpen ?? true) })
  if (options?.branchId) p.set("branchId", options.branchId)
  return `/api/v1/suppliers/${encodeURIComponent(supplierId)}/open-bills?${p.toString()}`
}

/** Short label for a bill: our GRN number, the supplier's bill number, or the opening balance. */
export function supplierBillLabel(bill: Pick<SupplierOpenBill, "document_number" | "supplier_bill_number" | "is_opening" | "reference_type">): string {
  if (bill.is_opening) return "Opening balance"
  const parts = [bill.document_number, bill.supplier_bill_number ? `Bill ${bill.supplier_bill_number}` : null].filter(Boolean)
  if (parts.length) return parts.join(" · ")
  return bill.reference_type === "PurchaseOrder" ? "Purchase order" : "Purchase"
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
  /** The supplier's bill the goods came on (printed on the debit note). */
  supplier_invoice_number?: string
  /** False when the goods were bought without a VAT bill: no input VAT is reversed. Default true. */
  reverse_input_vat?: boolean
  items: Array<{
    medicine_id: string
    quantity: number
    unit_cost: number
    return_reason: string
    notes?: string
    /** The lot going back; omitted = oldest-expiring stock first. */
    batch_id?: string | null
  }>
}

export function supplierReturnCreateBody(input: SupplierReturnInput, returnDateUtc: string) {
  return {
    returnDateUtc,
    notes: nullIfEmpty(input.notes),
    supplierInvoiceNumber: nullIfEmpty(input.supplier_invoice_number),
    reverseInputVat: input.reverse_input_vat ?? true,
    items: input.items.map((item) => ({
      medicineId: item.medicine_id,
      quantity: item.quantity,
      unitCost: item.unit_cost,
      returnReason: item.return_reason,
      notes: nullIfEmpty(item.notes),
      batchId: item.batch_id || null,
    })),
  }
}

/** SupplierReturnItemDto (camelCase). */
export interface DotnetSupplierReturnItemDto {
  id: string
  medicineId: string
  quantity: number
  unitCost: number
  totalCost: number
  returnReason: string
  notes: string | null
  /** Name + strength at the time of return (null on returns recorded before names were kept). */
  medicineName?: string | null
  batchId?: string | null
  batchNo?: string | null
  vatAmount?: number
}

/**
 * SupplierReturnDto (camelCase). Unlike the legacy supplier_returns row, there is no `status` —
 * CreateSupplierReturnCommandHandler deducts stock and credits the AP ledger synchronously as part
 * of creating the row, same as legacy createSupplierReturnForTenant always inserting with
 * status: "completed" (no pending/approved step ever existed). A return is final the moment it's
 * created; there is nothing left to approve or process afterward.
 */
export interface DotnetSupplierReturnDto {
  id: string
  supplierId: string
  returnDateUtc: string
  notes: string | null
  totalCost: number
  createdAtUtc: string
  items: DotnetSupplierReturnItemDto[]
  branchId?: string | null
  /** Debit-note number DN-{branch}-{FY}-{n}; null on returns recorded before numbering. */
  documentNumber?: string | null
  supplierInvoiceNumber?: string | null
  vatAmount?: number
  /** Cost + VAT: what the supplier's payable dropped by. */
  totalAmount?: number
  supplierName?: string | null
}

export interface DotnetPagedSupplierReturns {
  items: DotnetSupplierReturnDto[]
  pageNumber: number
  pageSize: number
  totalCount: number
  totalPages: number
}

export interface SupplierReturnsFilters {
  page?: number
  limit?: number
  branchId?: string | null
}

/** Empty supplierId = every supplier (GET /suppliers/returns). */
export function supplierReturnsListQuery(supplierId: string, filters?: SupplierReturnsFilters): string {
  const p = new URLSearchParams()
  p.set("pageNumber", String(filters?.page ?? 1))
  p.set("pageSize", String(filters?.limit ?? 50))
  if (filters?.branchId) p.set("branchId", filters.branchId)
  return supplierId
    ? `/api/v1/suppliers/${encodeURIComponent(supplierId)}/returns?${p.toString()}`
    : `/api/v1/suppliers/returns?${p.toString()}`
}

/** What the payable dropped by; older returns (before VAT reversal) have no totalAmount. */
export function supplierReturnTotal(r: Pick<DotnetSupplierReturnDto, "totalAmount" | "totalCost">): number {
  return r.totalAmount && r.totalAmount > 0 ? r.totalAmount : r.totalCost
}

export const suppliersDotnetApi = {
  statement: async (id: string, from: string, to: string, branchId?: string | null): Promise<LegacySupplierStatement> => {
    const dto = await dotnetClient.get<DotnetSupplierStatementDto>(supplierStatementQuery(id, from, to, branchId))
    return toSupplierStatement(dto, from, to)
  },
  ledger: async (id: string, branchId?: string | null): Promise<LegacySupplierLedgerSummary> => {
    const [supplier, rows] = await Promise.all([
      suppliersDotnetApi.get(id).catch(() => null),
      // With a branch the API recomputes running balances from that branch's entries only.
      dotnetGetAllPages<DotnetSupplierLedgerEntryDto>(
        `/api/v1/suppliers/${encodeURIComponent(id)}/ledger`,
        branchId ? { branchId } : {},
      ),
    ])
    return toSupplierLedgerSummary(id, supplier, rows)
  },
  /** One ledger page, newest first, optionally limited to a branch. */
  ledgerPage: async (id: string, page = 1, pageSize = 20, branchId?: string | null): Promise<SupplierLedgerPage> => {
    const res = await dotnetClient.get<{
      items: DotnetSupplierLedgerEntryDto[]
      pageNumber: number
      pageSize: number
      totalCount: number
      totalPages: number
    }>(supplierLedgerPageQuery(id, page, pageSize, branchId))
    return {
      entries: res.items.map(toSupplierLedgerEntry),
      page: res.pageNumber,
      pageSize: res.pageSize,
      totalCount: res.totalCount,
      totalPages: res.totalPages,
    }
  },
  /** Purchase bills with paid/outstanding amounts, oldest first. */
  openBills: async (id: string, options?: { onlyOpen?: boolean; branchId?: string | null }): Promise<SupplierOpenBills> => {
    const dto = await dotnetClient.get<DotnetSupplierOpenBillsDto>(supplierOpenBillsQuery(id, options))
    return toSupplierOpenBills(dto)
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
  /** Paged, newest first. A return is always final (see DotnetSupplierReturnDto) — there is no status filter. */
  listReturns: async (supplierId: string, filters?: SupplierReturnsFilters): Promise<DotnetPagedSupplierReturns> => {
    return dotnetClient.get<DotnetPagedSupplierReturns>(supplierReturnsListQuery(supplierId, filters))
  },
  getReturn: async (returnId: string): Promise<DotnetSupplierReturnDto> => {
    return dotnetClient.get<DotnetSupplierReturnDto>(`/api/v1/suppliers/returns/${encodeURIComponent(returnId)}`)
  },
  /**
   * One page. A `limit` above the server cap of 200 used to be sent as-is and rejected with 400 (the
   * cause of the empty supplier dropdowns); such requests now walk the pages and return up to `limit` rows.
   */
  list: async (filters?: SuppliersFilters): Promise<SuppliersResponse> => {
    if (filters?.limit != null && filters.limit > SUPPLIERS_MAX_PAGE_SIZE) {
      const all = await suppliersDotnetApi.listAll(filters)
      return { ...all, data: all.data.slice(0, filters.limit) }
    }
    const page = await dotnetClient.get<DotnetPagedSuppliers>(suppliersListQuery(filters))
    return toSuppliersResponse(page)
  },
  /** Every supplier matching the filters, 200 per request. `page`/`limit` are ignored. */
  listAll: async (filters?: SuppliersFilters): Promise<SuppliersResponse> => {
    const rows: DotnetSupplierDto[] = []
    let total = 0
    for (let pageNumber = 1; ; pageNumber++) {
      const page = await dotnetClient.get<DotnetPagedSuppliers>(
        suppliersListQuery({ ...filters, page: pageNumber, limit: SUPPLIERS_MAX_PAGE_SIZE }),
      )
      rows.push(...page.items)
      total = page.totalCount
      if (pageNumber >= page.totalPages || page.items.length === 0) break
    }
    return { data: rows.map(toSupplier), error: null, total }
  },
  /** Picker rows (id, name, phone) from the lightweight lookup endpoint, ordered by name. */
  lookup: async (query?: SupplierOptionsQuery): Promise<SupplierOption[]> => {
    const rows = await dotnetClient.get<DotnetSupplierLookupDto[]>(supplierLookupQuery(query))
    return rows.map(toSupplierOption)
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
