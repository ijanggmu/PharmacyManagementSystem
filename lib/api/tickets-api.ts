/**
 * Issue reporting over the .NET Tickets module (api/v1/tickets) through the /api/dotnet BFF.
 * Backs the global "Report an issue" dialog and the error boundaries — both file a real support
 * ticket against the existing Tickets module rather than a separate issue-tracking mechanism.
 *
 * Backend facts this file relies on (see backend/dotnet-starter-kit/src/Modules/Tickets):
 * - POST /tickets (CreateTicketCommand) takes { title, description?, priority, assignedToUserId? }.
 *   Title is required, max 160 chars; Description is optional, max 4096 chars
 *   (CreateTicketCommandValidator). Priority defaults to Medium; TicketPriority is Low/Medium/High/Critical.
 * - The endpoint requires authentication (`RequireAuthorization()` on the route group) and the
 *   Permissions.Tickets.Create permission, which is basic (every tenant user holds it). Passing an
 *   assignedToUserId additionally needs Tickets.Assign (403 otherwise). CreateTicketCommandHandler also throws 401 itself if
 *   there is no authenticated reporter, so anonymous/pre-login reporting is out of scope for now
 *   (see report on why: no AllowAnonymous fallback exists and adding one is non-trivial — tenant
 *   resolution has no anonymous path either).
 * - Tickets are tenant-scoped automatically (BaseDbContext default tenant isolation), so a
 *   pharmacy user's report lands in their own tenant.
 * - A ticket created with no assignee stays "Open" (Ticket.Create) — that's a valid, supported
 *   state, so reports are filed unassigned; there's no existing support/admin routing convention
 *   to assign to instead.
 */

import { DotnetApiError, dotnetClient, type createDotnetClient } from "@/lib/api/dotnet-client"
import { isDotnetRootUser } from "@/lib/api/dotnet-permissions"

type DotnetClient = Pick<ReturnType<typeof createDotnetClient>, "post">

/** Permission name from TicketsPermissions.Tickets.Create (backend Tickets Contracts/Authorization). */
export const TICKETS_CREATE_PERMISSION = "Permissions.Tickets.Create"

/**
 * Permission name from TicketsPermissions.Tickets.ViewCrossTenant (backend Tickets
 * Contracts/Authorization) — root-only, mirrors Permissions.AuditTrails.ViewCrossTenant exactly.
 * Gates GET /tickets/all-tenants and the SuperAdmin "All tenants' tickets" page/nav entry.
 */
export const TICKETS_VIEW_CROSS_TENANT_PERMISSION = "Permissions.Tickets.ViewCrossTenant"

/** Mirrors backend TicketPriority (Modules.Tickets.Contracts.Dtos.TicketPriority). */
export type IssueSeverity = "Low" | "Medium" | "High" | "Critical"

/**
 * Shape of TicketDto as returned by POST /tickets, GET /tickets and GET /tickets/{id}
 * (camelCase JSON). The resolution/lifecycle timestamps are populated once the ticket has gone
 * through that transition at least once (backend Dtos/TicketDto.cs).
 */
export interface DotnetTicketDto {
  id: string
  number: string
  title: string
  description?: string | null
  status: string
  priority: IssueSeverity
  reporterUserId: string
  assignedToUserId?: string | null
  resolutionNote?: string | null
  createdAtUtc: string
  updatedAtUtc?: string | null
  resolvedAtUtc?: string | null
  closedAtUtc?: string | null
  commentCount: number
  tenantId?: string | null
}

/** Context captured automatically so the reporter never has to retype it. */
export interface IssueReportContext {
  pageUrl: string
  userAgent: string
  userId?: string | null
  userEmail?: string | null
  /** Present when the report was triggered from a caught error (error boundary prefill). */
  errorMessage?: string | null
  errorStack?: string | null
}

export interface IssueReportInput {
  /** Short free-text summary, becomes the ticket title. */
  summary: string
  /** Longer free-text description of what happened. */
  description: string
  severity: IssueSeverity
  context: IssueReportContext
}

export interface CreateTicketBody {
  title: string
  description: string
  priority: IssueSeverity
}

// CreateTicketCommandValidator: Title max 160, Description max 4096.
const MAX_TITLE_LENGTH = 160
const MAX_DESCRIPTION_LENGTH = 4096
/** First few stack lines only — enough to locate the failure without dumping the whole trace. */
const STACK_LINES_TO_KEEP = 5

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value
}

function trimStack(stack: string | null | undefined, lines = STACK_LINES_TO_KEEP): string | null {
  if (!stack) return null
  const trimmed = stack.split("\n").slice(0, lines).join("\n").trim()
  return trimmed || null
}

/**
 * Builds the ticket title/description from the user's report plus the context captured
 * automatically (page, browser, signed-in user, and — when triggered from an error boundary — the
 * error message/stack). Pure and network-free so it can be unit tested directly.
 */
export function buildCreateTicketBody(input: IssueReportInput): CreateTicketBody {
  const { summary, description, severity, context } = input
  const title = truncate(summary.trim() || "User-reported issue", MAX_TITLE_LENGTH)

  const lines: string[] = [
    description.trim() || "(no additional details provided)",
    "",
    "---",
    `Page: ${context.pageUrl}`,
    `User agent: ${context.userAgent}`,
  ]

  if (context.userId || context.userEmail) {
    lines.push(`Reported by: ${[context.userEmail, context.userId].filter(Boolean).join(" / ")}`)
  }

  if (context.errorMessage) {
    lines.push("", `Error: ${context.errorMessage}`)
  }

  const trimmedStack = trimStack(context.errorStack)
  if (trimmedStack) {
    lines.push("Stack (truncated):", trimmedStack)
  }

  return {
    title,
    description: truncate(lines.join("\n"), MAX_DESCRIPTION_LENGTH),
    priority: severity,
  }
}

/**
 * Files the report as a new ticket via POST /tickets. Requires an authenticated session — the
 * server rejects an unauthenticated caller with 401 (see module doc comment above).
 */
export async function createIssueTicket(
  input: IssueReportInput,
  client: DotnetClient = dotnetClient,
): Promise<DotnetTicketDto> {
  const body = buildCreateTicketBody(input)
  return client.post<DotnetTicketDto>("/tickets", body)
}

/** Message to show the user. DotnetApiError carries the server detail verbatim. */
export function issueReportErrorMessage(error: unknown, fallback = "Could not submit the report"): string {
  if (error instanceof DotnetApiError) return error.normalized.message || fallback
  return error instanceof Error && error.message ? error.message : fallback
}

/* ---------------------------------------------------------------------------------------------
 * Ticket management (list, detail, comments, status transitions).
 *
 * Confirmed against backend/dotnet-starter-kit/src/Modules/Tickets this session — every endpoint
 * below already exists (TicketsModule.MapEndpoints); nothing was added to the backend.
 *
 *   GET  /tickets                       SearchTicketsQuery   -> PagedResponse<TicketDto>  (Tickets.View)
 *   GET  /tickets/{id}                  GetTicketByIdQuery    -> TicketDto                 (Tickets.View)
 *   GET  /tickets/{id}/comments         ListTicketCommentsQuery -> TicketCommentDto[]      (Tickets.View)
 *   POST /tickets/{id}/comments         AddTicketCommentCommand -> Guid (comment id)       (Tickets.Comment)
 *   PUT  /tickets/{id}                  UpdateTicketCommand  -> Guid (ticket id)            (Tickets.Update)
 *   POST /tickets/{id}/assign           AssignTicketCommand  -> Guid                        (Tickets.Assign)
 *   POST /tickets/{id}/resolve          ResolveTicketCommand -> Guid                        (Tickets.Resolve)
 *   POST /tickets/{id}/reopen           ReopenTicketCommand  -> Guid                        (Tickets.Reopen)
 *   POST /tickets/{id}/close            CloseTicketCommand   -> Guid                        (Tickets.Close)
 *
 * All tenant-scoped reads/writes above are filtered to the caller's own tenant automatically
 * (BaseDbContext default tenant isolation) — there is no tenant parameter to pass. The
 * cross-tenant listing (GET /tickets/all-tenants, ListTicketsAcrossTenantsQuery,
 * Tickets.ViewCrossTenant) is the separate SuperAdmin support-desk surface — see
 * listTicketsAcrossTenants / canViewTicketsAcrossTenants near the bottom of this file.
 *
 * The four transition commands (assign/resolve/reopen/close) and UpdateTicket all return just the
 * ticket's id, not the updated TicketDto, so callers re-fetch with getTicket() after a successful
 * transition to pick up the new status/timestamps.
 * ------------------------------------------------------------------------------------------- */

/** Mirrors backend TicketStatus (Modules.Tickets.Contracts.Dtos.TicketStatus), serialized as a string. */
export type TicketStatus = "Open" | "InProgress" | "Resolved" | "Closed"

/**
 * Permission names from TicketsPermissions (backend Tickets Contracts/Authorization).
 *
 * Access model (enforced by the backend handlers, the UI only mirrors it):
 * - Tickets.View and Tickets.Create are basic — every tenant user holds them and can list, view,
 *   comment on, close (once resolved) and reopen the tickets THEY reported. GET /tickets is
 *   filtered server-side to the caller's own tickets, and another user's ticket is a 404.
 * - Tickets.ViewAll is the tenant support-desk view: every ticket of the caller's tenant. With it,
 *   Assign/Resolve/Reopen/Close/Comment apply to any ticket of the tenant.
 * - Assign and Resolve are admin-only regardless of who reported the ticket.
 */
export const TICKETS_VIEW_PERMISSION = "Permissions.Tickets.View"
export const TICKETS_VIEW_ALL_PERMISSION = "Permissions.Tickets.ViewAll"
export const TICKETS_UPDATE_PERMISSION = "Permissions.Tickets.Update"
export const TICKETS_ASSIGN_PERMISSION = "Permissions.Tickets.Assign"
export const TICKETS_RESOLVE_PERMISSION = "Permissions.Tickets.Resolve"
export const TICKETS_REOPEN_PERMISSION = "Permissions.Tickets.Reopen"
export const TICKETS_CLOSE_PERMISSION = "Permissions.Tickets.Close"
export const TICKETS_COMMENT_PERMISSION = "Permissions.Tickets.Comment"

/**
 * Checks a raw .NET permission claim directly (Tickets has no entry in the legacy
 * lib/api/dotnet-permissions.ts map — that map only covers resources the Supabase-era UI already
 * had a legacy permission name for). Mirrors branches-api.ts's canManageBranches in spirit: a
 * direct `granted.includes(...)` check, fail-closed for an unknown/missing permission.
 */
export function ticketsPermissionAllowed(permission: string, granted: readonly string[]): boolean {
  return granted.includes(permission)
}

/**
 * True for any user who can see at least their own tickets (the "Help & support" nav gate). The
 * basic Tickets.View is enough; ViewAll implies it.
 */
export const canViewTickets = (granted: readonly string[]): boolean =>
  ticketsPermissionAllowed(TICKETS_VIEW_PERMISSION, granted) || ticketsPermissionAllowed(TICKETS_VIEW_ALL_PERMISSION, granted)
/** Tenant ticket admin: sees every ticket of their tenant, not just their own. */
export const canViewAllTickets = (granted: readonly string[]): boolean => ticketsPermissionAllowed(TICKETS_VIEW_ALL_PERMISSION, granted)
export const canUpdateTickets = (granted: readonly string[]): boolean => ticketsPermissionAllowed(TICKETS_UPDATE_PERMISSION, granted)
export const canAssignTickets = (granted: readonly string[]): boolean => ticketsPermissionAllowed(TICKETS_ASSIGN_PERMISSION, granted)
export const canResolveTickets = (granted: readonly string[]): boolean => ticketsPermissionAllowed(TICKETS_RESOLVE_PERMISSION, granted)
export const canReopenTickets = (granted: readonly string[]): boolean => ticketsPermissionAllowed(TICKETS_REOPEN_PERMISSION, granted)
export const canCloseTickets = (granted: readonly string[]): boolean => ticketsPermissionAllowed(TICKETS_CLOSE_PERMISSION, granted)
export const canCommentOnTickets = (granted: readonly string[]): boolean => ticketsPermissionAllowed(TICKETS_COMMENT_PERMISSION, granted)

/** Shape of TicketCommentDto as returned by GET /tickets/{id}/comments (camelCase JSON). */
export interface DotnetTicketCommentDto {
  id: string
  ticketId: string
  authorUserId: string
  body: string
  createdAtUtc: string
}

/** FSH.Framework.Shared.Persistence.PagedResponse<T>, camelCase JSON. */
export interface DotnetPagedResponse<T> {
  items: T[]
  pageNumber: number
  pageSize: number
  totalCount: number
  totalPages: number
}

export interface ListTicketsParams {
  search?: string
  status?: TicketStatus
  priority?: IssueSeverity
  assignedToUserId?: string
  reporterUserId?: string
  pageNumber?: number
  pageSize?: number
  sortBy?: string
  sortDir?: "asc" | "desc"
}

type TicketsClient = Pick<ReturnType<typeof createDotnetClient>, "get" | "post" | "put">

function buildListTicketsQuery(params: ListTicketsParams): string {
  const search = new URLSearchParams()
  if (params.search?.trim()) search.set("search", params.search.trim())
  if (params.status) search.set("status", params.status)
  if (params.priority) search.set("priority", params.priority)
  if (params.assignedToUserId) search.set("assignedToUserId", params.assignedToUserId)
  if (params.reporterUserId) search.set("reporterUserId", params.reporterUserId)
  search.set("pageNumber", String(params.pageNumber ?? 1))
  search.set("pageSize", String(params.pageSize ?? 20))
  if (params.sortBy) search.set("sortBy", params.sortBy)
  if (params.sortDir) search.set("sortDir", params.sortDir)
  return search.toString()
}

/** Lists the signed-in user's own-tenant tickets via GET /tickets (SearchTicketsQuery). */
export async function listTickets(
  params: ListTicketsParams = {},
  client: TicketsClient = dotnetClient,
): Promise<DotnetPagedResponse<DotnetTicketDto>> {
  return client.get<DotnetPagedResponse<DotnetTicketDto>>(`/tickets?${buildListTicketsQuery(params)}`)
}

/** Fetches one ticket by id via GET /tickets/{id} (GetTicketByIdQuery). */
export async function getTicket(id: string, client: TicketsClient = dotnetClient): Promise<DotnetTicketDto> {
  return client.get<DotnetTicketDto>(`/tickets/${encodeURIComponent(id)}`)
}

/**
 * Any tenant's ticket via GET /tickets/all-tenants/{id} (GetTicketByIdAcrossTenantsQuery). The tenant-scoped
 * getTicket 404s for another tenant's ticket, so the SuperAdmin support desk must use this. Requires
 * Permissions.Tickets.ViewCrossTenant; tenantId is populated on the result.
 */
export async function getTicketAcrossTenants(id: string, client: TicketsClient = dotnetClient): Promise<DotnetTicketDto> {
  return client.get<DotnetTicketDto>(`/tickets/all-tenants/${encodeURIComponent(id)}`)
}

/** Any tenant's ticket comments via GET /tickets/all-tenants/{id}/comments (ViewCrossTenant). */
export async function listTicketCommentsAcrossTenants(
  ticketId: string,
  client: TicketsClient = dotnetClient,
): Promise<DotnetTicketCommentDto[]> {
  return client.get<DotnetTicketCommentDto[]>(`/tickets/all-tenants/${encodeURIComponent(ticketId)}/comments`)
}

/** Lists a ticket's comments oldest-first via GET /tickets/{id}/comments (ListTicketCommentsQuery). */
export async function listTicketComments(
  ticketId: string,
  client: TicketsClient = dotnetClient,
): Promise<DotnetTicketCommentDto[]> {
  return client.get<DotnetTicketCommentDto[]>(`/tickets/${encodeURIComponent(ticketId)}/comments`)
}

/** Adds a comment via POST /tickets/{id}/comments. Returns the new comment's id (not the full DTO). */
export async function addTicketComment(
  ticketId: string,
  body: string,
  client: TicketsClient = dotnetClient,
): Promise<string> {
  return client.post<string>(`/tickets/${encodeURIComponent(ticketId)}/comments`, { body: body.trim() })
}

export interface UpdateTicketInput {
  title: string
  description?: string | null
  priority: IssueSeverity
}

/** Edits title/description/priority via PUT /tickets/{id} (UpdateTicketCommand). Returns the ticket id. */
export async function updateTicket(
  ticketId: string,
  input: UpdateTicketInput,
  client: TicketsClient = dotnetClient,
): Promise<string> {
  return client.put<string>(`/tickets/${encodeURIComponent(ticketId)}`, {
    title: input.title.trim(),
    description: input.description?.trim() || null,
    priority: input.priority,
  })
}

/** Assigns/reassigns via POST /tickets/{id}/assign. Pass `null` to clear the assignment. */
export async function assignTicket(
  ticketId: string,
  assigneeUserId: string | null,
  client: TicketsClient = dotnetClient,
): Promise<string> {
  return client.post<string>(`/tickets/${encodeURIComponent(ticketId)}/assign`, { assigneeUserId })
}

/** Marks resolved via POST /tickets/{id}/resolve, with an optional resolution note. */
export async function resolveTicket(
  ticketId: string,
  resolutionNote?: string | null,
  client: TicketsClient = dotnetClient,
): Promise<string> {
  return client.post<string>(`/tickets/${encodeURIComponent(ticketId)}/resolve`, {
    resolutionNote: resolutionNote?.trim() || null,
  })
}

/** Reopens a resolved/closed ticket via POST /tickets/{id}/reopen. */
export async function reopenTicket(ticketId: string, client: TicketsClient = dotnetClient): Promise<string> {
  return client.post<string>(`/tickets/${encodeURIComponent(ticketId)}/reopen`, {})
}

/** Closes a resolved ticket via POST /tickets/{id}/close. */
export async function closeTicket(ticketId: string, client: TicketsClient = dotnetClient): Promise<string> {
  return client.post<string>(`/tickets/${encodeURIComponent(ticketId)}/close`, {})
}

/** Message to show the user for any ticket-management call above. Same mapping as issueReportErrorMessage. */
export function ticketErrorMessage(error: unknown, fallback = "Request failed"): string {
  return issueReportErrorMessage(error, fallback)
}

/* ---------------------------------------------------------------------------------------------
 * SuperAdmin support-desk: tickets across every tenant.
 *
 * GET /tickets/all-tenants (ListTicketsAcrossTenantsQuery, new this session) bypasses the
 * backend's ambient tenant filter the same way GET /api/v1/audits does for
 * Permissions.AuditTrails.ViewCrossTenant: root-only permission, IgnoreQueryFilters() server-side.
 * Every row's tenantId is populated here (unlike the tenant-scoped reads above, where it is always
 * null since the caller already knows their own tenant).
 * ------------------------------------------------------------------------------------------- */

export interface ListTicketsAcrossTenantsParams {
  tenantId?: string
  /** Server-side keyword over title, number, description and tenant id (whole result set, not one page). */
  search?: string
  status?: TicketStatus
  priority?: IssueSeverity
  fromUtc?: string
  toUtc?: string
  pageNumber?: number
  pageSize?: number
}

function buildListTicketsAcrossTenantsQuery(params: ListTicketsAcrossTenantsParams): string {
  const search = new URLSearchParams()
  if (params.tenantId?.trim()) search.set("tenantId", params.tenantId.trim())
  if (params.search?.trim()) search.set("search", params.search.trim())
  if (params.status) search.set("status", params.status)
  if (params.priority) search.set("priority", params.priority)
  if (params.fromUtc) search.set("fromUtc", params.fromUtc)
  if (params.toUtc) search.set("toUtc", params.toUtc)
  search.set("pageNumber", String(params.pageNumber ?? 1))
  search.set("pageSize", String(params.pageSize ?? 20))
  return search.toString()
}

/**
 * SuperAdmin support-desk listing across every tenant via GET /tickets/all-tenants
 * (ListTicketsAcrossTenantsQuery). Requires Permissions.Tickets.ViewCrossTenant — the backend 403s
 * otherwise, same as a non-root caller hitting GET /api/v1/audits with a foreign TenantId filter.
 */
export async function listTicketsAcrossTenants(
  params: ListTicketsAcrossTenantsParams = {},
  client: TicketsClient = dotnetClient,
): Promise<DotnetPagedResponse<DotnetTicketDto>> {
  return client.get<DotnetPagedResponse<DotnetTicketDto>>(
    `/tickets/all-tenants?${buildListTicketsAcrossTenantsQuery(params)}`,
  )
}

/**
 * Permissions.Tickets.ViewCrossTenant check on the signed-in user's permission claims. Root users
 * hold every root permission and are allowed, mirroring branches-api.ts's canManageBranches.
 */
export function canViewTicketsAcrossTenants(granted: readonly string[]): boolean {
  return isDotnetRootUser(granted) || granted.includes(TICKETS_VIEW_CROSS_TENANT_PERMISSION)
}
