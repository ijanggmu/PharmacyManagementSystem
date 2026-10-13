/**
 * Payment scheduling by due date: GET /reports/payables-due (Suppliers module) and GET /reports/receivables-due
 * (Customers module). Amounts are what is still open after settlement, the same figures as the AP / AR aging.
 * `days_overdue` > 0 = overdue, 0 = due today, < 0 = days to go, null = no due date (no payment terms).
 */

import { dotnetClient } from "@/lib/api/dotnet-client"
import { nepalDayEndInclusiveUtc, nepalYmdOf } from "@/lib/utils/nepal-time"
import { DUE_SOON_DAYS } from "@/lib/utils/payment-terms"

export type DueScheduleStatus = "overdue" | "due_soon" | "later" | "no_due_date"

const STATUSES: readonly DueScheduleStatus[] = ["overdue", "due_soon", "later", "no_due_date"]

function toStatus(value: string): DueScheduleStatus {
  return (STATUSES as readonly string[]).includes(value) ? (value as DueScheduleStatus) : "no_due_date"
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

function ymdOrNull(utc: string | null | undefined): string | null {
  return utc ? nepalYmdOf(new Date(utc)) : null
}

// --- Payables -------------------------------------------------------------------------------------------

/** PayableDueBillDto (camelCase). */
export interface DotnetPayableDueBillDto {
  supplierId: string
  supplierName: string
  ledgerEntryId: string
  billDateUtc: string
  referenceType: string
  referenceId: string
  documentNumber: string | null
  supplierBillNumber: string | null
  outstanding: number
  dueDateUtc: string | null
  daysOverdue: number | null
  ageDays: number
  status: string
  branchId: string | null
}

export interface DotnetPayablesDueSupplierDto {
  supplierId: string
  supplierName: string
  creditDays: number | null
  overdue: number
  dueSoon: number
  later: number
  noDueDate: number
  total: number
  overdueBillCount: number
  dueSoonBillCount: number
  earliestDueDateUtc: string | null
}

export interface DotnetPayablesDueDto {
  asOfUtc: string
  withinDays: number
  totalOverdue: number
  totalDueSoon: number
  totalLater: number
  totalNoDueDate: number
  suppliers: DotnetPayablesDueSupplierDto[]
  bills: DotnetPayableDueBillDto[]
}

export interface PayableDueBill {
  supplier_id: string
  supplier_name: string
  ledger_entry_id: string
  bill_date: string
  reference_type: string
  reference_id: string
  document_number: string | null
  supplier_bill_number: string | null
  outstanding: number
  due_date: string | null
  days_overdue: number | null
  age_days: number
  status: DueScheduleStatus
}

export interface PayablesDueSupplier {
  supplier_id: string
  supplier_name: string
  credit_days: number | null
  overdue: number
  due_soon: number
  later: number
  no_due_date: number
  total: number
  overdue_bill_count: number
  due_soon_bill_count: number
  earliest_due_date: string | null
}

export interface PayablesDue {
  as_of: string
  within_days: number
  total_overdue: number
  total_due_soon: number
  total_later: number
  total_no_due_date: number
  suppliers: PayablesDueSupplier[]
  bills: PayableDueBill[]
}

export function payablesDueQuery(asOf: string, options?: { withinDays?: number; branchId?: string | null; includeAll?: boolean }): string {
  const p = new URLSearchParams({
    asOfUtc: nepalDayEndInclusiveUtc(asOf),
    withinDays: String(options?.withinDays ?? DUE_SOON_DAYS),
  })
  if (options?.branchId) p.set("branchId", options.branchId)
  if (options?.includeAll) p.set("includeAll", "true")
  return `/api/v1/reports/payables-due?${p.toString()}`
}

export function toPayablesDue(dto: DotnetPayablesDueDto): PayablesDue {
  return {
    as_of: ymdOrNull(dto.asOfUtc) ?? "",
    within_days: dto.withinDays,
    total_overdue: round2(dto.totalOverdue),
    total_due_soon: round2(dto.totalDueSoon),
    total_later: round2(dto.totalLater),
    total_no_due_date: round2(dto.totalNoDueDate),
    suppliers: dto.suppliers.map((s) => ({
      supplier_id: s.supplierId,
      supplier_name: s.supplierName,
      credit_days: s.creditDays ?? null,
      overdue: round2(s.overdue),
      due_soon: round2(s.dueSoon),
      later: round2(s.later),
      no_due_date: round2(s.noDueDate),
      total: round2(s.total),
      overdue_bill_count: s.overdueBillCount,
      due_soon_bill_count: s.dueSoonBillCount,
      earliest_due_date: ymdOrNull(s.earliestDueDateUtc),
    })),
    bills: dto.bills.map((b) => ({
      supplier_id: b.supplierId,
      supplier_name: b.supplierName,
      ledger_entry_id: b.ledgerEntryId,
      bill_date: ymdOrNull(b.billDateUtc) ?? "",
      reference_type: b.referenceType,
      reference_id: b.referenceId,
      document_number: b.documentNumber,
      supplier_bill_number: b.supplierBillNumber,
      outstanding: round2(b.outstanding),
      due_date: ymdOrNull(b.dueDateUtc),
      days_overdue: b.daysOverdue ?? null,
      age_days: b.ageDays,
      status: toStatus(b.status),
    })),
  }
}

// --- Receivables ----------------------------------------------------------------------------------------

/** ReceivableDueInvoiceDto (camelCase). */
export interface DotnetReceivableDueInvoiceDto {
  customerId: string
  customerName: string
  ledgerEntryId: string
  entryDateUtc: string
  entryType: string
  documentNumber: string | null
  referenceType: string | null
  referenceId: string | null
  outstanding: number
  dueDateUtc: string | null
  daysOverdue: number | null
  ageDays: number
  status: string
  branchId: string | null
}

export interface DotnetReceivablesDueDto {
  asOfUtc: string
  withinDays: number
  totalOverdue: number
  totalDueSoon: number
  totalLater: number
  totalNoDueDate: number
  invoices: DotnetReceivableDueInvoiceDto[]
}

export interface ReceivableDueInvoice {
  ledger_entry_id: string
  customer_id: string
  customer_name: string
  entry_date: string
  entry_type: string
  /** The sale's invoice number; null on an opening balance or adjustment. */
  document_number: string | null
  outstanding: number
  due_date: string | null
  days_overdue: number | null
  age_days: number
  status: DueScheduleStatus
}

export interface ReceivablesDue {
  total_overdue: number
  total_due_soon: number
  total_later: number
  total_no_due_date: number
  invoices: ReceivableDueInvoice[]
}

export function receivablesDueQuery(
  asOf: string,
  options?: { withinDays?: number; branchId?: string | null; customerId?: string | null; includeAll?: boolean },
): string {
  const p = new URLSearchParams({
    asOfUtc: nepalDayEndInclusiveUtc(asOf),
    withinDays: String(options?.withinDays ?? DUE_SOON_DAYS),
  })
  if (options?.branchId) p.set("branchId", options.branchId)
  if (options?.customerId) p.set("customerId", options.customerId)
  if (options?.includeAll) p.set("includeAll", "true")
  return `/api/v1/reports/receivables-due?${p.toString()}`
}

export function toReceivablesDue(dto: DotnetReceivablesDueDto): ReceivablesDue {
  return {
    total_overdue: round2(dto.totalOverdue),
    total_due_soon: round2(dto.totalDueSoon),
    total_later: round2(dto.totalLater),
    total_no_due_date: round2(dto.totalNoDueDate),
    invoices: dto.invoices.map((i) => ({
      ledger_entry_id: i.ledgerEntryId,
      customer_id: i.customerId,
      customer_name: i.customerName,
      entry_date: ymdOrNull(i.entryDateUtc) ?? "",
      entry_type: i.entryType,
      document_number: i.documentNumber,
      outstanding: round2(i.outstanding),
      due_date: ymdOrNull(i.dueDateUtc),
      days_overdue: i.daysOverdue ?? null,
      age_days: i.ageDays,
      status: toStatus(i.status),
    })),
  }
}

export const duesApi = {
  payables: async (asOf: string, options?: { withinDays?: number; branchId?: string | null; includeAll?: boolean }): Promise<PayablesDue> =>
    toPayablesDue(await dotnetClient.get<DotnetPayablesDueDto>(payablesDueQuery(asOf, options))),
  receivables: async (
    asOf: string,
    options?: { withinDays?: number; branchId?: string | null; customerId?: string | null; includeAll?: boolean },
  ): Promise<ReceivablesDue> => toReceivablesDue(await dotnetClient.get<DotnetReceivablesDueDto>(receivablesDueQuery(asOf, options))),
}
