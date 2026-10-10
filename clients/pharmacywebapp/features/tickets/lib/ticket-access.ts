/**
 * Which ticket actions to offer the signed-in user. Mirrors the backend's TicketAccess rules
 * (Modules.Tickets/Authorization/TicketAccess.cs) — the API enforces them regardless; this only
 * keeps the UI from offering buttons that would 403/404.
 *
 * - Reporter (their own ticket): comment, close a Resolved ticket, reopen a Resolved/Closed one.
 * - Tenant ticket admin (Tickets.ViewAll): the same on anyone's ticket, each gated by its own
 *   permission (Comment/Close/Reopen), plus Assign/Resolve.
 * - Assign/Resolve are never reporter rights.
 * - The SuperAdmin all-tenants desk is read-only (tenant-scoped write endpoints can't reach another
 *   tenant's ticket).
 */
import {
  canAssignTickets,
  canCloseTickets,
  canCommentOnTickets,
  canReopenTickets,
  canResolveTickets,
  canViewAllTickets,
  type TicketStatus,
} from "@/lib/api/tickets-api"

export interface TicketAccessInput {
  permissions: readonly string[]
  currentUserId: string | null
  reporterUserId: string | null | undefined
  status: TicketStatus | null
  crossTenant: boolean
}

export interface TicketActionAccess {
  isReporter: boolean
  canAssign: boolean
  canResolve: boolean
  canReopen: boolean
  canClose: boolean
  canComment: boolean
}

const NONE: TicketActionAccess = {
  isReporter: false,
  canAssign: false,
  canResolve: false,
  canReopen: false,
  canClose: false,
  canComment: false,
}

export function ticketActionAccess({
  permissions,
  currentUserId,
  reporterUserId,
  status,
  crossTenant,
}: TicketAccessInput): TicketActionAccess {
  if (crossTenant) return NONE
  const isReporter = currentUserId !== null && !!reporterUserId && reporterUserId === currentUserId
  const isAdmin = canViewAllTickets(permissions)
  const open = status === "Open" || status === "InProgress"
  return {
    isReporter,
    canAssign: canAssignTickets(permissions) && status !== "Resolved" && status !== "Closed",
    canResolve: canResolveTickets(permissions) && open,
    canReopen: (isReporter || (isAdmin && canReopenTickets(permissions))) && (status === "Resolved" || status === "Closed"),
    canClose: (isReporter || (isAdmin && canCloseTickets(permissions))) && status === "Resolved",
    canComment: (isReporter || (isAdmin && canCommentOnTickets(permissions))) && status !== null && status !== "Closed",
  }
}
