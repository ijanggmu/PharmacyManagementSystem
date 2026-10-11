/**
 * Report reads on the .NET API: dead stock, audit-log listing, the "inventory" and "audit" compliance
 * reports, and the narcotic register. Other report types have no .NET endpoint yet and throw.
 *
 * Mapping functions are pure and exported for unit tests.
 */

import { dotnetClient } from "@/lib/api/dotnet-client"
import { dotnetGetAllPages, type DotnetPagedResponse } from "@/lib/api/stock-dotnet"
import { splitName, toUtcDateTime } from "@/lib/api/sales-api"
import { endOfDayUtc, startOfDayUtc, type DotnetReportsOverviewDto } from "@/lib/api/accounting-reports-api"

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
  /** The branch scope the row was computed for; null = all branches. */
  branch_id: string | null
}

/** DeadStockRowDto from the .NET Inventory module (GET /api/v1/inventory/reports/dead-stock). */
export interface DotnetDeadStockRowDto {
  medicineId: string
  medicineName: string
  stockQuantity: number
  inventoryValue: number
  lastSoldAtUtc: string | null
  nearestExpiryDate: string | null
  branchId?: string | null
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
    branch_id: dto.branchId ?? null,
  }
}

/** One page of the dead-stock report. The .NET endpoint pages for real (`PagedResponse<DeadStockRowDto>`). */
export async function getDeadStockReportPage(
  sinceDays: number,
  pageNumber = 1,
  pageSize = 20,
  branchId?: string,
): Promise<{ rows: DeadStockRow[]; totalCount: number; totalPages: number; pageNumber: number }> {
  const params = new URLSearchParams({
    sinceDays: String(sinceDays),
    pageNumber: String(pageNumber),
    pageSize: String(pageSize),
  })
  if (branchId) params.set("branchId", branchId)
  const page = await dotnetClient.get<DotnetPagedResponse<DotnetDeadStockRowDto>>(
    `/api/v1/inventory/reports/dead-stock?${params.toString()}`,
  )
  return {
    rows: page.items.map(toDeadStockRow),
    totalCount: page.totalCount,
    totalPages: page.totalPages,
    pageNumber: page.pageNumber,
  }
}

/** @deprecated Use {@link getDeadStockReportPage} for real server-side paging. Kept only for callers that still want the whole report in one array. */
export async function getDeadStockReport(sinceDays: number, branchId?: string): Promise<DeadStockRow[]> {
  const rows = await dotnetGetAllPages<DotnetDeadStockRowDto>("/api/v1/inventory/reports/dead-stock", {
    sinceDays: String(sinceDays),
    ...(branchId ? { branchId } : {}),
  })
  return rows.map(toDeadStockRow)
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
  /** Another tenant's id — root users with AuditTrails.ViewCrossTenant only. */
  tenantId?: string
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

// DotnetPagedResponse<T> (PagedResponse<T> as serialized by the .NET API) is imported from
// stock-dotnet.ts above — re-exported here so existing callers of reports-api.ts keep working.
export type { DotnetPagedResponse }

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

/** Query string for GET /api/v1/audits/entity-logs (names match GetEntityAuditLogsQuery). */
export function auditLogParams(query: AuditLogQuery): URLSearchParams {
  const params = new URLSearchParams({ pageNumber: String(query.page), pageSize: String(query.limit) })
  const table = query.table?.trim()
  if (table) params.set("tableName", table)
  if (query.action) params.set("action", query.action)
  if (query.from) params.set("fromUtc", query.from)
  if (query.to) params.set("toUtc", query.to)
  // Another tenant (root support desk); the API requires AuditTrails.ViewCrossTenant for it.
  if (query.tenantId) params.set("tenantId", query.tenantId)
  return params
}

export async function listAuditLogs(query: AuditLogQuery): Promise<{ rows: AuditLogRow[]; meta: AuditLogPageMeta }> {
  const params = auditLogParams(query)
  const paged = await dotnetClient.get<DotnetPagedResponse<DotnetEntityAuditLogDto>>(`/api/v1/audits/entity-logs?${params.toString()}`)
  return toAuditLogPage(paged)
}

// ---------------------------------------------------------------------------
// Audit log detail (single record, full before/after payload)
// ---------------------------------------------------------------------------

/** One property delta, from the audit payload's "changes" array. */
export interface AuditLogChange {
  name: string
  dataType: string | null
  oldValue: unknown
  newValue: unknown
  isSensitive: boolean
}

/** The EntityChangeEventPayload shape embedded in AuditDetailDto.payload for entity-change events. */
export interface AuditLogDetailPayload {
  dbContext?: string
  schema?: string | null
  table?: string
  entityName?: string
  key?: string
  operation?: string
  changes?: AuditLogChange[]
  transactionId?: string | null
}

/** AuditDetailDto from GET /api/v1/audits/{id}. */
export interface DotnetAuditDetailDto {
  id: string
  occurredAtUtc: string
  receivedAtUtc: string
  eventType: string | number
  severity: string | number
  tenantId: string | null
  userId: string | null
  userName: string | null
  traceId: string | null
  spanId: string | null
  correlationId: string | null
  requestId: string | null
  source: string | null
  tags: string | number
  payload: AuditLogDetailPayload | Record<string, unknown>
}

export interface AuditLogDetail {
  id: string
  occurred_at: string
  user_id: string | null
  user_name: string | null
  tenant_id: string | null
  table_name: string | null
  record_id: string | null
  action: string | null
  changes: AuditLogChange[]
}

export function toAuditLogDetail(dto: DotnetAuditDetailDto): AuditLogDetail {
  const payload = (dto.payload ?? {}) as AuditLogDetailPayload
  return {
    id: dto.id,
    occurred_at: dto.occurredAtUtc,
    user_id: dto.userId,
    user_name: dto.userName,
    tenant_id: dto.tenantId,
    table_name: payload.table ?? null,
    record_id: payload.key ?? null,
    action: payload.operation ?? null,
    changes: payload.changes ?? [],
  }
}

/** Fetches the full before/after payload for a single audit log row (for a click-to-expand detail view). */
export async function getAuditLogDetail(id: string): Promise<AuditLogDetail> {
  const dto = await dotnetClient.get<DotnetAuditDetailDto>(`/api/v1/audits/${encodeURIComponent(id)}`)
  return toAuditLogDetail(dto)
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
  if (type === "inventory") {
    const dto = await dotnetClient.get<DotnetInventoryDiscrepancyReportDto>("/api/v1/inventory/reports/inventory-discrepancy")
    return toInventoryDiscrepancyReport(dto, startDate, endDate)
  }
  if (type === "audit") {
    // Whole days: a bare "yyyy-mm-dd" toUtc binds to midnight at the START of the end date, which
    // silently dropped the last day (today) from the report.
    const params = new URLSearchParams({ fromUtc: startOfDayUtc(startDate), toUtc: endOfDayUtc(endDate) })
    const dto = await dotnetClient.get<DotnetAuditTrailComplianceReportDto>(
      `/api/v1/audits/reports/audit-trail-compliance?${params.toString()}`,
    )
    return toAuditTrailComplianceReport(dto, startDate, endDate)
  }
  throw new Error(`Compliance report "${type}" is not available on the .NET API yet`)
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
  /** Branch (premises) where the sale was made. */
  branch_id: string | null
}

export interface NarcoticRegisterFilters {
  periodStart: string
  periodEnd: string
  medicineName?: string | null
  doctorName?: string | null
  schedule?: string | null
  /** Premises to file the register for; omitted = the server's scope for this user. */
  branchId?: string | null
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
  branchId?: string | null
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
    branch_id: dto.branchId ?? null,
  }
}

/**
 * The .NET register filters by medicine name, doctor name and schedule (case-insensitive; schedule is an
 * exact match), so every JSON request is served by .NET.
 */
export function canUseDotnetNarcoticRegister(_filters: NarcoticRegisterFilters): boolean {
  return true
}

export function narcoticRegisterParams(filters: NarcoticRegisterFilters): URLSearchParams {
  const params = new URLSearchParams({
    periodStartUtc: toUtcDateTime(filters.periodStart),
    periodEndUtc: toUtcDateTime(filters.periodEnd, true),
  })
  // The API matches these with Contains/Equals on the raw value, so stray spaces would match nothing.
  const medicineName = filters.medicineName?.trim()
  const doctorName = filters.doctorName?.trim()
  const schedule = filters.schedule?.trim()
  if (medicineName) params.set("medicineName", medicineName)
  if (doctorName) params.set("doctorName", doctorName)
  if (schedule) params.set("schedule", schedule)
  if (filters.branchId) params.set("branchId", filters.branchId)
  return params
}

/** One page of the narcotic register. The .NET endpoint pages for real (`PagedResponse<NarcoticRegisterRowDto>`). */
export async function getNarcoticRegisterPage(
  filters: NarcoticRegisterFilters,
  pageNumber = 1,
  pageSize = 20,
): Promise<{ rows: NarcoticRegisterRow[]; totalCount: number; totalPages: number; pageNumber: number }> {
  const params = narcoticRegisterParams(filters)
  params.set("pageNumber", String(pageNumber))
  params.set("pageSize", String(pageSize))
  const page = await dotnetClient.get<DotnetPagedResponse<DotnetNarcoticRegisterRowDto>>(
    `/api/v1/sales/reports/narcotic-register?${params.toString()}`,
  )
  return {
    rows: page.items.map(toNarcoticRegisterRow),
    totalCount: page.totalCount,
    totalPages: page.totalPages,
    pageNumber: page.pageNumber,
  }
}

/**
 * Every row for the period/filters, fetched page by page. Used only for the CSV export, which needs
 * the full register regardless of which page the table is currently showing.
 */
export async function getAllNarcoticRegisterRows(filters: NarcoticRegisterFilters): Promise<NarcoticRegisterRow[]> {
  const params = narcoticRegisterParams(filters)
  const rows = await dotnetGetAllPages<DotnetNarcoticRegisterRowDto>(
    "/api/v1/sales/reports/narcotic-register",
    Object.fromEntries(params.entries()),
  )
  return rows.map(toNarcoticRegisterRow)
}

/** @deprecated Use {@link getNarcoticRegisterPage} for real server-side paging, or {@link getAllNarcoticRegisterRows} for export. */
export async function getNarcoticRegister(filters: NarcoticRegisterFilters): Promise<NarcoticRegisterRow[]> {
  return getAllNarcoticRegisterRows(filters)
}

// ---------------------------------------------------------------------------
// Reports overview (KPI aggregate)
// ---------------------------------------------------------------------------

/**
 * The .NET overview is a KPI aggregate (sales, inventory, prescriptions, trial balance) with no row tables.
 * The legacy reports page also reads per-row sales, stock, revenue, product, customer and prescription lists,
 * which come from the search endpoints, so the page needs those wired separately.
 */
export async function getReportsOverviewKpis(startDate: string, endDate: string, branchId?: string): Promise<DotnetReportsOverviewDto> {
  const params = new URLSearchParams({
    fromUtc: startOfDayUtc(startDate),
    toUtc: endOfDayUtc(endDate),
  })
  if (branchId) params.set("branchId", branchId)
  return dotnetClient.get<DotnetReportsOverviewDto>(`/api/v1/accounting/reports/overview?${params.toString()}`)
}

// ---------------------------------------------------------------------------
// Whole-period chart aggregates (top products, category performance, customer growth, top
// customers) — computed server-side over the full date range/branch scope, independent of any
// row-table page size. See lib/reports/overview-mappers.ts for the row-shape mappers.
// ---------------------------------------------------------------------------

/** TopSellingMedicineDto from GET /api/v1/inventory/reports/top-selling-medicines. */
export interface DotnetTopSellingMedicineDto {
  medicineId: string
  name: string
  quantity: number
  revenue: number
}

export async function getTopSellingMedicines(
  startDate: string,
  endDate: string,
  take = 10,
  branchId?: string,
): Promise<DotnetTopSellingMedicineDto[]> {
  const params = new URLSearchParams({
    fromUtc: startOfDayUtc(startDate),
    toUtc: endOfDayUtc(endDate),
    take: String(take),
  })
  if (branchId) params.set("branchId", branchId)
  return dotnetClient.get<DotnetTopSellingMedicineDto[]>(`/api/v1/inventory/reports/top-selling-medicines?${params.toString()}`)
}

/** CategoryPerformanceDto from GET /api/v1/inventory/reports/category-performance. categoryId is
 * null for medicines with no assigned category ("uncategorized"). */
export interface DotnetCategoryPerformanceDto {
  categoryId: string | null
  quantity: number
  revenue: number
  medicineCount: number
}

export async function getCategoryPerformance(startDate: string, endDate: string, branchId?: string): Promise<DotnetCategoryPerformanceDto[]> {
  const params = new URLSearchParams({ fromUtc: startOfDayUtc(startDate), toUtc: endOfDayUtc(endDate) })
  if (branchId) params.set("branchId", branchId)
  return dotnetClient.get<DotnetCategoryPerformanceDto[]>(`/api/v1/inventory/reports/category-performance?${params.toString()}`)
}

/** CustomerGrowthPointDto from GET /api/v1/customers/reports/growth. */
export interface DotnetCustomerGrowthPointDto {
  monthStartUtc: string
  newCustomers: number
}

export async function getCustomerGrowth(startDate: string, endDate: string): Promise<DotnetCustomerGrowthPointDto[]> {
  const params = new URLSearchParams({ fromUtc: startOfDayUtc(startDate), toUtc: endOfDayUtc(endDate) })
  return dotnetClient.get<DotnetCustomerGrowthPointDto[]>(`/api/v1/customers/reports/growth?${params.toString()}`)
}

/** TopCustomerDto from GET /api/v1/customers/reports/top-spenders. */
export interface DotnetTopCustomerDto {
  customerId: string
  name: string
  saleCount: number
  totalSpend: number
}

export async function getTopCustomers(startDate: string, endDate: string, take = 10): Promise<DotnetTopCustomerDto[]> {
  const params = new URLSearchParams({
    fromUtc: startOfDayUtc(startDate),
    toUtc: endOfDayUtc(endDate),
    take: String(take),
  })
  return dotnetClient.get<DotnetTopCustomerDto[]>(`/api/v1/customers/reports/top-spenders?${params.toString()}`)
}
