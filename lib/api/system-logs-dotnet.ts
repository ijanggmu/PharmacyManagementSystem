/**
 * Client for the admin "System logs" page. All views are .NET-only (Modules.Auditing + Sales IRD):
 *
 * - API requests: GET /audits/activity (+ /audits/activity/stats) — every HTTP request the audit
 *   middleware recorded, including failed (4xx/5xx/499) ones.
 * - Errors: GET /audits/exceptions/search — unhandled exceptions, paged.
 * - Access / security: GET /audits/security/search — all SecurityAction values, paged.
 * - Integrations: GET /audits/integration-events (+ /{id}) — the internal event bus (transactional
 *   outbox → inbox consumers), scoped to the caller's tenant; GET /sales/ird/queue — IRD e-invoice dispatch.
 * - Details: GET /audits/{id} (masked payload) and GET /audits/by-correlation/{id} (related events).
 * - Email/SMS: no backend support (mail is fire-and-forget, no SMS module) — nothing to call.
 *
 * Cross-tenant: pass tenantId (another tenant, or "*" for all) — only honoured for root users
 * holding Permissions.AuditTrails.ViewCrossTenant; others get 403.
 */

import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { DotnetApiError, dotnetClient } from "@/lib/api/dotnet-client"
import type { DotnetPagedResponse } from "@/lib/api/stock-dotnet"

export type { DotnetPagedResponse }

type Client = Pick<typeof dotnetClient, "get">

/** The 11 SecurityAction values the backend records (AuditEnums.cs). */
export const SECURITY_ACTIONS = [
  "LoginSucceeded",
  "LoginFailed",
  "TokenIssued",
  "TokenRevoked",
  "PasswordChanged",
  "RoleAssigned",
  "RoleRevoked",
  "PermissionDenied",
  "PolicyFailed",
  "ImpersonationStarted",
  "ImpersonationEnded",
] as const
export type SecurityAction = (typeof SECURITY_ACTIONS)[number]

export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const
export const STATUS_CLASSES = ["2xx", "3xx", "4xx", "5xx", "error"] as const
export type StatusClass = (typeof STATUS_CLASSES)[number]

/** Enum values arrive as names (JsonStringEnumConverter) but tolerate numbers. */
export type DotnetEnum = string | number

export type AuditEventTypeName = "EntityChange" | "Security" | "Activity" | "Exception" | "None"
export type AuditSeverityName = "None" | "Trace" | "Debug" | "Information" | "Warning" | "Error" | "Critical"

const EVENT_TYPE_BY_NUMBER: Record<number, AuditEventTypeName> = {
  0: "None",
  1: "EntityChange",
  2: "Security",
  3: "Activity",
  4: "Exception",
}
const SEVERITY_BY_NUMBER: Record<number, AuditSeverityName> = {
  0: "None",
  1: "Trace",
  2: "Debug",
  3: "Information",
  4: "Warning",
  5: "Error",
  6: "Critical",
}

export function eventTypeName(value: DotnetEnum | null | undefined): AuditEventTypeName {
  if (typeof value === "number") return EVENT_TYPE_BY_NUMBER[value] ?? "None"
  return (value as AuditEventTypeName) || "None"
}

export function severityName(value: DotnetEnum | null | undefined): AuditSeverityName {
  if (typeof value === "number") return SEVERITY_BY_NUMBER[value] ?? "None"
  return (value as AuditSeverityName) || "None"
}

/** AuditTag flags (AuditEnums.cs) → names. */
export const AUDIT_TAGS: ReadonlyArray<[number, string]> = [
  [1, "PII masked"],
  [2, "Out of quota"],
  [4, "Sampled"],
  [8, "Retained long"],
  [16, "Health check"],
  [32, "Authentication"],
  [64, "Authorization"],
]

export function auditTagNames(tags: DotnetEnum | null | undefined): string[] {
  if (typeof tags === "string") {
    const n = Number(tags)
    if (Number.isNaN(n)) return tags === "None" || tags === "" ? [] : tags.split(",").map((t) => t.trim())
    tags = n
  }
  if (!tags) return []
  return AUDIT_TAGS.filter(([bit]) => (tags as number) & bit).map(([, name]) => name)
}

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

export interface ActivityEntry {
  id: string
  occurredAtUtc: string
  severity: DotnetEnum
  tenantId: string | null
  userId: string | null
  userName: string | null
  method: string | null
  path: string | null
  queryString: string | null
  routeTemplate: string | null
  statusCode: number | null
  durationMs: number | null
  source: string | null
  clientIp: string | null
  errorType: string | null
  correlationId: string | null
  traceId: string | null
}

export interface ActivityStats {
  fromUtc: string
  toUtc: string
  totalRequests: number
  clientErrors: number
  serverErrors: number
  slowRequests: number
  slowThresholdMs: number
  avgDurationMs: number | null
  p95DurationMs: number | null
  errorRate: number
}

export interface SecurityAuditEntry {
  id: string
  occurredAtUtc: string
  eventType: DotnetEnum
  severity: DotnetEnum
  tenantId: string | null
  userId: string | null
  userName: string | null
  traceId: string | null
  correlationId: string | null
  requestId: string | null
  source: string | null
  tags: DotnetEnum
  action: string | null
  reasonCode: string | null
  authMethod: string | null
  ip: string | null
  userAgent: string | null
}

export interface ExceptionEntry {
  id: string
  occurredAtUtc: string
  severity: DotnetEnum
  tenantId: string | null
  userId: string | null
  userName: string | null
  traceId: string | null
  correlationId: string | null
  requestId: string | null
  source: string | null
  area: string | null
  exceptionType: string | null
  message: string | null
  routeOrLocation: string | null
}

export type IntegrationStatus = "Pending" | "Processed" | "Failed" | "Dead"

export interface IntegrationEventEntry {
  id: string
  createdOnUtc: string
  /** Assembly-qualified CLR type. */
  type: string
  /** e.g. "SaleCompleted". Older APIs may omit it — use integrationShortType(). */
  shortType?: string
  module?: string | null
  tenantId: string | null
  correlationId: string | null
  processedOnUtc: string | null
  retryCount: number
  lastError: string | null
  isDead: boolean
  nextRetryAt: string | null
  claimedUntilUtc: string | null
  claimedBy: string | null
  status: IntegrationStatus
}

export interface IntegrationConsumer {
  handlerName: string
  handlerShortName: string
  module: string | null
  processedOnUtc: string
}

export interface IntegrationEventDetail extends IntegrationEventEntry {
  shortType: string
  payload: unknown
  consumers: IntegrationConsumer[]
}

export interface IrdQueueItem {
  id: string
  saleId: string
  status: "Pending" | "Processing" | "Sent" | "Failed"
  attempts: number
  lastError: string | null
  nextAttemptAtUtc: string | null
  createdAtUtc: string
  updatedAtUtc: string
}

export interface AuditSummaryEntry {
  id: string
  occurredAtUtc: string
  eventType: DotnetEnum
  severity: DotnetEnum
  tenantId: string | null
  userId: string | null
  userName: string | null
  traceId: string | null
  correlationId: string | null
  requestId: string | null
  source: string | null
  tags: DotnetEnum
}

export interface AuditDetail extends AuditSummaryEntry {
  receivedAtUtc: string
  spanId: string | null
  payload: Record<string, unknown>
}

export interface AuditSummaryAggregate {
  eventsByType: Record<string, number>
  eventsBySeverity: Record<string, number>
  eventsBySource: Record<string, number>
  eventsByTenant: Record<string, number>
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

interface WindowFilters {
  fromUtc?: string
  toUtc?: string
  tenantId?: string
}

interface PageFilters {
  pageNumber?: number
  pageSize?: number
}

export interface ActivityFilters extends WindowFilters, PageFilters {
  method?: string
  statusClass?: StatusClass
  statusCode?: number
  pathContains?: string
  userId?: string
  search?: string
  minDurationMs?: number
  correlationId?: string
}

export interface SecuritySearchFilters extends WindowFilters, PageFilters {
  action?: string
  severity?: AuditSeverityName
  userId?: string
  search?: string
}

export interface ExceptionSearchFilters extends WindowFilters, PageFilters {
  severity?: AuditSeverityName
  area?: string
  exceptionType?: string
  search?: string
}

export interface IntegrationEventFilters extends WindowFilters, PageFilters {
  type?: string
  status?: string
  search?: string
}

export interface IrdQueueFilters extends PageFilters {
  status?: string
  fromUtc?: string
  toUtc?: string
}

/** Legacy unpaged security filter (GET /audits/security). */
export interface SecurityAuditFilters {
  fromUtc?: string
  toUtc?: string
  userId?: string
  action?: string
  skip?: number
  take?: number
}

/** Max page size the backend accepts (PagedQueryValidator). */
export const MAX_PAGE_SIZE = 100

export function buildQuery(params: Record<string, string | number | boolean | null | undefined>): string {
  const sp = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue
    const text = typeof value === "string" ? value.trim() : String(value)
    if (text !== "") sp.set(key, text)
  }
  const qs = sp.toString()
  return qs ? `?${qs}` : ""
}

function pageParams(f: PageFilters, defaultSize = 50) {
  return {
    pageNumber: Math.max(1, f.pageNumber ?? 1),
    pageSize: Math.min(MAX_PAGE_SIZE, Math.max(1, f.pageSize ?? defaultSize)),
  }
}

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------

/** The real system log: every API request (method, path, status, latency, user, IP). */
export async function listActivity(
  filters: ActivityFilters = {},
  client: Client = dotnetClient,
): Promise<DotnetPagedResponse<ActivityEntry>> {
  const qs = buildQuery({
    ...pageParams(filters),
    fromUtc: filters.fromUtc,
    toUtc: filters.toUtc,
    tenantId: filters.tenantId,
    method: filters.method,
    statusClass: filters.statusClass,
    statusCode: filters.statusCode,
    pathContains: filters.pathContains,
    userId: filters.userId,
    search: filters.search,
    minDurationMs: filters.minDurationMs && filters.minDurationMs > 0 ? filters.minDurationMs : undefined,
    correlationId: filters.correlationId,
  })
  return client.get<DotnetPagedResponse<ActivityEntry>>(`/audits/activity${qs}`)
}

export async function getActivityStats(
  filters: WindowFilters & { slowThresholdMs?: number } = {},
  client: Client = dotnetClient,
): Promise<ActivityStats> {
  const qs = buildQuery({
    fromUtc: filters.fromUtc,
    toUtc: filters.toUtc,
    tenantId: filters.tenantId,
    slowThresholdMs: filters.slowThresholdMs,
  })
  return client.get<ActivityStats>(`/audits/activity/stats${qs}`)
}

export async function searchSecurityAudits(
  filters: SecuritySearchFilters = {},
  client: Client = dotnetClient,
): Promise<DotnetPagedResponse<SecurityAuditEntry>> {
  const qs = buildQuery({
    ...pageParams(filters),
    fromUtc: filters.fromUtc,
    toUtc: filters.toUtc,
    tenantId: filters.tenantId,
    action: filters.action,
    severity: filters.severity,
    userId: filters.userId,
    search: filters.search,
  })
  return client.get<DotnetPagedResponse<SecurityAuditEntry>>(`/audits/security/search${qs}`)
}

export async function searchExceptions(
  filters: ExceptionSearchFilters = {},
  client: Client = dotnetClient,
): Promise<DotnetPagedResponse<ExceptionEntry>> {
  const qs = buildQuery({
    ...pageParams(filters),
    fromUtc: filters.fromUtc,
    toUtc: filters.toUtc,
    tenantId: filters.tenantId,
    severity: filters.severity,
    area: filters.area,
    exceptionType: filters.exceptionType,
    search: filters.search,
  })
  return client.get<DotnetPagedResponse<ExceptionEntry>>(`/audits/exceptions/search${qs}`)
}

/** Legacy unpaged access log; prefer searchSecurityAudits. */
export async function listSecurityAudits(
  filters: SecurityAuditFilters = {},
  client: Client = dotnetClient,
): Promise<SecurityAuditEntry[]> {
  const qs = buildQuery({
    fromUtc: filters.fromUtc,
    toUtc: filters.toUtc,
    userId: filters.userId,
    action: filters.action,
    skip: filters.skip,
    take: filters.take ?? 50,
  })
  return client.get<SecurityAuditEntry[]>(`/audits/security${qs}`)
}

/** Internal event bus (outbox) dispatch status: pending/processed/failed/dead. */
export async function listIntegrationEvents(
  filters: IntegrationEventFilters = {},
  client: Client = dotnetClient,
): Promise<DotnetPagedResponse<IntegrationEventEntry>> {
  const qs = buildQuery({
    ...pageParams(filters, 25),
    fromUtc: filters.fromUtc,
    toUtc: filters.toUtc,
    tenantId: filters.tenantId,
    type: filters.type,
    status: filters.status,
    search: filters.search,
  })
  return client.get<DotnetPagedResponse<IntegrationEventEntry>>(`/audits/integration-events${qs}`)
}

export async function getIntegrationEvent(id: string, client: Client = dotnetClient): Promise<IntegrationEventDetail> {
  return client.get<IntegrationEventDetail>(`/audits/integration-events/${encodeURIComponent(id)}`)
}

/** IRD (CBMS) e-invoice dispatch queue. Requires Permissions.Sales.Ird.View. */
export async function listIrdQueue(
  filters: IrdQueueFilters = {},
  client: Client = dotnetClient,
): Promise<DotnetPagedResponse<IrdQueueItem>> {
  const qs = buildQuery({
    ...pageParams(filters, 25),
    status: filters.status,
    fromUtc: filters.fromUtc,
    toUtc: filters.toUtc,
  })
  return client.get<DotnetPagedResponse<IrdQueueItem>>(`/sales/ird/queue${qs}`)
}

export async function getAuditDetail(id: string, tenantId?: string, client: Client = dotnetClient): Promise<AuditDetail> {
  return client.get<AuditDetail>(`/audits/${encodeURIComponent(id)}${buildQuery({ tenantId })}`)
}

/** Every audit event sharing a correlation id (request ↔ entity changes ↔ exceptions), oldest first. */
export async function listByCorrelation(
  correlationId: string,
  tenantId?: string,
  client: Client = dotnetClient,
): Promise<AuditSummaryEntry[]> {
  return client.get<AuditSummaryEntry[]>(
    `/audits/by-correlation/${encodeURIComponent(correlationId)}${buildQuery({ tenantId })}`,
  )
}

export async function getAuditSummary(
  filters: WindowFilters = {},
  client: Client = dotnetClient,
): Promise<AuditSummaryAggregate> {
  return client.get<AuditSummaryAggregate>(
    `/audits/summary${buildQuery({ fromUtc: filters.fromUtc, toUtc: filters.toUtc, tenantId: filters.tenantId })}`,
  )
}

// ---------------------------------------------------------------------------
// Pure helpers (unit tested)
// ---------------------------------------------------------------------------

export type StatusTone = "success" | "info" | "warning" | "danger" | "muted"

/** Colour tone for an HTTP status (always rendered with the number, never colour alone). */
export function statusTone(code: number | null | undefined): StatusTone {
  if (code === null || code === undefined) return "muted"
  if (code >= 500) return "danger"
  if (code === 499) return "muted"
  if (code >= 400) return "warning"
  if (code >= 300) return "info"
  if (code >= 200) return "success"
  return "muted"
}

export function statusText(code: number | null | undefined): string {
  if (code === null || code === undefined) return "—"
  if (code === 499) return "499 Cancelled"
  return String(code)
}

/** Falls back to stripping namespace/assembly client-side for APIs that predate shortType. */
export function integrationShortType(entry: Pick<IntegrationEventEntry, "type" | "shortType">): string {
  if (entry.shortType) return entry.shortType
  const head = (entry.type ?? "").split(",")[0].trim()
  const name = head.slice(head.lastIndexOf(".") + 1)
  return name.endsWith("IntegrationEvent") && name.length > "IntegrationEvent".length
    ? name.slice(0, -"IntegrationEvent".length)
    : name
}

/** "FSH.Framework.Core.Exceptions.NotFoundException" → "NotFoundException". */
export function shortExceptionType(type: string | null | undefined): string {
  if (!type) return "Exception"
  return type.slice(type.lastIndexOf(".") + 1)
}

export function systemLogsErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof DotnetApiError) {
    if (error.normalized.status === 403) return "You don't have permission to view these logs (Permissions.AuditTrails.View)."
    return error.normalized.message || fallback
  }
  return apiRequestErrorMessage(error) || fallback
}
