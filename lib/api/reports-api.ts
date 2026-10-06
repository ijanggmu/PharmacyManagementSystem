/**
 * Report reads, switchable per backend target (REPORTS).
 *
 * Migrated to .NET: dead stock, audit-log listing, and the two compliance report types
 * ("inventory" and "audit"). Everything else (overview, DDA narcotic, IRD, DEA/state-board/PMP)
 * has no matching .NET endpoint or a different shape, so it stays on the legacy path.
 *
 * Each dotnet branch maps to the exact UI shape the legacy route produces, so the report pages
 * never see the difference. Mapping functions are pure and exported for unit tests.
 */

import { backendTarget } from "@/lib/api/backend-target"
import { dotnetClient } from "@/lib/api/dotnet-client"
import { apiGet } from "@/lib/api/client-helpers"
import { splitName, toUtcDateTime } from "@/lib/api/sales-api"

// ---------------------------------------------------------------------------
// Dead stock
// ---------------------------------------------------------------------------

export interface DeadStockRow {
  medicine_id: string
  medicine_name: string
  supplier_name: string | null
  stock_quantity: number
  inventory_value: number
  last_sold_date: string | null
  expiry_date: string | null
}

/** DeadStockRowDto from the .NET Inventory module (GET /api/v1/inventory/reports/dead-stock). */
export interface DotnetDeadStockRowDto {
  medicineId: string
  medicineName: string
  stockQuantity: number
  inventoryValue: number
  lastSoldAtUtc: string | null
  nearestExpiryDate: string | null
}

/** The .NET row has no supplier, so supplier_name is null in dotnet mode. */
export function toDeadStockRow(dto: DotnetDeadStockRowDto): DeadStockRow {
  return {
    medicine_id: dto.medicineId,
    medicine_name: dto.medicineName,
    supplier_name: null,
    stock_quantity: dto.stockQuantity,
    inventory_value: dto.inventoryValue,
    last_sold_date: dto.lastSoldAtUtc,
    expiry_date: dto.nearestExpiryDate,
  }
}

export async function getDeadStockReport(sinceDays: number): Promise<DeadStockRow[]> {
  if (backendTarget("REPORTS") === "dotnet") {
    const rows = await dotnetClient.get<DotnetDeadStockRowDto[]>(`/api/v1/inventory/reports/dead-stock?sinceDays=${sinceDays}`)
    return rows.map(toDeadStockRow)
  }
  return apiGet<DeadStockRow[]>(`/api/reports/dead-stock?sinceDays=${sinceDays}`)
}

// ---------------------------------------------------------------------------
// Audit logs (paginated)
// ---------------------------------------------------------------------------

export interface AuditLogRow {
  id: string
  user_id: string | null
  table_name: string | null
  record_id: string | null
  action: string | null
  created_at: string | null
  ip_address: string | null
  user_agent: string | null
  tenant_id: string | null
}

export interface AuditLogPageMeta {
  page?: number
  limit?: number
  total?: number
  totalPages?: number
}

export interface AuditLogQuery {
  page: number
  limit: number
  table?: string
  action?: string
  from?: string
  to?: string
}

/** EntityAuditLogDto from GET /api/v1/audits/entity-logs (wrapped in PagedResponse). */
export interface DotnetEntityAuditLogDto {
  id: string
  userId: string | null
  tableName: string | null
  recordId: string | null
  action: string | null
  occurredAtUtc: string
  tenantId: string | null
}

/** PagedResponse<T> as serialized by the .NET API. */
export interface DotnetPagedResponse<T> {
  items: T[]
  pageNumber: number
  pageSize: number
  totalCount: number
  totalPages: number
}

export function toAuditLogRow(dto: DotnetEntityAuditLogDto): AuditLogRow {
  return {
    id: dto.id,
    user_id: dto.userId,
    table_name: dto.tableName,
    record_id: dto.recordId,
    action: dto.action,
    created_at: dto.occurredAtUtc,
    // The .NET audit record does not capture client IP or user agent.
    ip_address: null,
    user_agent: null,
    tenant_id: dto.tenantId,
  }
}

/** Returns the rows and meta in the shape the audit-logs page reads from the legacy body. */
export function toAuditLogPage(
  paged: DotnetPagedResponse<DotnetEntityAuditLogDto>,
): { rows: AuditLogRow[]; meta: AuditLogPageMeta } {
  return {
    rows: paged.items.map(toAuditLogRow),
    meta: {
      page: paged.pageNumber,
      limit: paged.pageSize,
      total: paged.totalCount,
      totalPages: paged.totalPages,
    },
  }
}

export async function listAuditLogs(query: AuditLogQuery): Promise<{ rows: AuditLogRow[]; meta: AuditLogPageMeta }> {
  if (backendTarget("REPORTS") === "dotnet") {
    const params = new URLSearchParams({ pageNumber: String(query.page), pageSize: String(query.limit) })
    if (query.table) params.set("tableName", query.table)
    if (query.action) params.set("action", query.action)
    if (query.from) params.set("fromUtc", query.from)
    if (query.to) params.set("toUtc", query.to)
    const paged = await dotnetClient.get<DotnetPagedResponse<DotnetEntityAuditLogDto>>(`/api/v1/audits/entity-logs?${params.toString()}`)
    return toAuditLogPage(paged)
  }

  const params = new URLSearchParams({ page: String(query.page), limit: String(query.limit) })
  if (query.table) params.set("table", query.table)
  if (query.action) params.set("action", query.action)
  if (query.from) params.set("from", query.from)
  if (query.to) params.set("to", query.to)
  const res = await fetch(`/api/reports/audit-logs?${params.toString()}`)
  if (!res.ok) {
    throw new Error("Failed to load audit logs")
  }
  const body = (await res.json()) as { data?: AuditLogRow[]; meta?: AuditLogPageMeta }
  return {
    rows: body.data || [],
    meta: body.meta || {},
  }
}

// ---------------------------------------------------------------------------
// Compliance reports ("inventory" and "audit" only; other types stay legacy)
// ---------------------------------------------------------------------------

export interface InventoryDiscrepancyEntry {
  medicine?: string | null
  currentStock?: number | null
  minimumStock?: number | null
  maximumStock?: number | null
  status: "low" | "overstock"
}

export interface InventoryDiscrepancyReport {
  reportType: string
  period: { startDate: string | null; endDate: string | null }
  summary: {
    totalMedicines: number
    discrepancies: number
    lowStock: number
    overstock: number
  }
  discrepancies: InventoryDiscrepancyEntry[]
}

export interface AuditTrailLogRow {
  id: string
  user_id: string | null
  table_name: string | null
  record_id: string | null
  action: string | null
  created_at: string | null
  tenant_id: string | null
}

export interface AuditTrailComplianceReport {
  reportType: string
  period: { startDate: string | null; endDate: string | null }
  summary: {
    totalLogs: number
    byAction: Record<string, number>
    phiAccessCount: number
  }
  logs: AuditTrailLogRow[]
}

export type ComplianceReport = InventoryDiscrepancyReport | AuditTrailComplianceReport

/** InventoryDiscrepancyReportDto from GET /api/v1/inventory/reports/inventory-discrepancy. */
export interface DotnetInventoryDiscrepancyReportDto {
  generatedAtUtc: string
  totalMedicines: number
  lowStockCount: number
  lowStock: Array<{ medicineId: string; medicineName: string; currentStock: number; reorderLevel: number }>
}

/** AuditTrailComplianceReportDto from GET /api/v1/audits/reports/audit-trail-compliance. */
export interface DotnetAuditTrailComplianceReportDto {
  fromUtc: string | null
  toUtc: string | null
  totalLogs: number
  byAction: Record<string, number>
  phiAccessCount: number
  logs: Array<{
    id: string
    occurredAtUtc: string
    userId: string | null
    userName: string | null
    table: string | null
    recordKey: string | null
    action: string | null
    tenantId: string | null
  }>
}

/**
 * The .NET inventory report only flags low stock (overstock needs a maximum-stock field the .NET
 * medicine model does not have), so overstock is reported as 0 and no overstock rows are produced.
 * The .NET query takes no date range; the dates are echoed back, as the legacy report does.
 */
export function toInventoryDiscrepancyReport(
  dto: DotnetInventoryDiscrepancyReportDto,
  startDate: string | null,
  endDate: string | null,
): InventoryDiscrepancyReport {
  return {
    reportType: "Inventory Discrepancy Report",
    period: { startDate, endDate },
    summary: {
      totalMedicines: dto.totalMedicines,
      discrepancies: dto.lowStock.length,
      lowStock: dto.lowStockCount,
      overstock: 0,
    },
    discrepancies: dto.lowStock.map((m) => ({
      medicine: m.medicineName,
      currentStock: m.currentStock,
      minimumStock: m.reorderLevel,
      maximumStock: null,
      status: "low",
    })),
  }
}

export function toAuditTrailComplianceReport(
  dto: DotnetAuditTrailComplianceReportDto,
  startDate: string | null,
  endDate: string | null,
): AuditTrailComplianceReport {
  return {
    reportType: "Audit Trail Report",
    period: { startDate, endDate },
    summary: {
      totalLogs: dto.totalLogs,
      byAction: dto.byAction,
      phiAccessCount: dto.phiAccessCount,
    },
    logs: dto.logs.map((e) => ({
      id: e.id,
      user_id: e.userId,
      table_name: e.table,
      record_id: e.recordKey,
      action: e.action,
      created_at: e.occurredAtUtc,
      tenant_id: e.tenantId,
    })),
  }
}

export async function getComplianceReport(type: string, startDate: string, endDate: string): Promise<ComplianceReport> {
  if (backendTarget("REPORTS") === "dotnet") {
    if (type === "inventory") {
      const dto = await dotnetClient.get<DotnetInventoryDiscrepancyReportDto>("/api/v1/inventory/reports/inventory-discrepancy")
      return toInventoryDiscrepancyReport(dto, startDate, endDate)
    }
    if (type === "audit") {
      const params = new URLSearchParams({ fromUtc: startDate, toUtc: endDate })
      const dto = await dotnetClient.get<DotnetAuditTrailComplianceReportDto>(
        `/api/v1/audits/reports/audit-trail-compliance?${params.toString()}`,
      )
      return toAuditTrailComplianceReport(dto, startDate, endDate)
    }
  }

  const params = new URLSearchParams({ type, startDate, endDate })
  const response = await fetch(`/api/reports/compliance?${params}`)
  if (!response.ok) throw new Error("Failed to fetch compliance report")
  const data = (await response.json()) as { data: ComplianceReport }
  return data.data
}

// ---------------------------------------------------------------------------
// DDA narcotic register (JSON rows only; the CSV export stays on the legacy route in both modes)
// ---------------------------------------------------------------------------

export interface NarcoticRegisterRow {
  sale_date: string
  sale_number: string | null
  invoice_number: string | null
  first_name: string | null
  last_name: string | null
  date_of_birth: string | null
  prescription_number: string | null
  doctor_name: string | null
  doctor_license: string | null
  medicine_name: string | null
  strength: string | null
  form: string | null
  quantity: number
  unit_price: number
  line_total: number
}

export interface NarcoticRegisterFilters {
  periodStart: string
  periodEnd: string
  medicineName?: string | null
  doctorName?: string | null
  schedule?: string | null
}

/** NarcoticRegisterRowDto (Sales module, camelCase JSON). */
export interface DotnetNarcoticRegisterRowDto {
  saleId: string
  saleDateUtc: string
  customerId: string | null
  customerName: string | null
  prescriptionId: string | null
  doctorName: string | null
  saleItemId: string
  medicineId: string
  medicineName: string
  genericName: string | null
  quantity: number
  unitPrice: number
  lineTotal: number
}

/**
 * The .NET row lacks sale and invoice numbers, prescription number, doctor license, date of birth,
 * strength and form. Those are null here rather than invented, so this path is not yet a complete
 * regulatory register. Keep the legacy route for filing until the backend carries them.
 */
export function toNarcoticRegisterRow(dto: DotnetNarcoticRegisterRowDto): NarcoticRegisterRow {
  const name = splitName(dto.customerName)
  return {
    sale_date: dto.saleDateUtc,
    sale_number: null,
    invoice_number: null,
    first_name: dto.customerName ? name.first : null,
    last_name: dto.customerName ? name.last : null,
    date_of_birth: null,
    prescription_number: null,
    doctor_name: dto.doctorName,
    doctor_license: null,
    medicine_name: dto.medicineName,
    strength: null,
    form: null,
    quantity: dto.quantity,
    unit_price: dto.unitPrice,
    line_total: dto.lineTotal,
  }
}

/** The .NET register has no medicine, doctor or schedule filters, so those requests stay legacy. */
export function canUseDotnetNarcoticRegister(f: NarcoticRegisterFilters): boolean {
  return !f.medicineName && !f.doctorName && !f.schedule
}

export async function getNarcoticRegister(filters: NarcoticRegisterFilters): Promise<NarcoticRegisterRow[]> {
  if (backendTarget("REPORTS") === "dotnet" && canUseDotnetNarcoticRegister(filters)) {
    const params = new URLSearchParams({
      periodStartUtc: toUtcDateTime(filters.periodStart),
      periodEndUtc: toUtcDateTime(filters.periodEnd, true),
    })
    const rows = await dotnetClient.get<DotnetNarcoticRegisterRowDto[]>(`/api/v1/sales/reports/narcotic-register?${params.toString()}`)
    return rows.map(toNarcoticRegisterRow)
  }
  const params = new URLSearchParams({
    periodStart: filters.periodStart,
    periodEnd: filters.periodEnd,
    format: "json",
  })
  if (filters.medicineName) params.set("medicineName", filters.medicineName)
  if (filters.doctorName) params.set("doctorName", filters.doctorName)
  if (filters.schedule) params.set("schedule", filters.schedule)
  const res = await fetch(`/api/reports/dda-narcotic?${params.toString()}`)
  if (!res.ok) throw new Error("Failed to load narcotic register")
  const body = (await res.json()) as { data?: { rows?: NarcoticRegisterRow[] } }
  return body.data?.rows ?? []
}
