/**
 * URL <-> state mapping for the ticket lists (tenant + all-tenants). Pure and framework-free so
 * it can be unit tested; the React hook in ../hooks/use-ticket-list-url.ts wires it to the router.
 *
 * Params: page, size, q (keyword), status, priority, tenant (all-tenants only), ticket (selection).
 * Defaults are omitted from the URL so a clean list has a clean address.
 */
import type { IssueSeverity, TicketStatus } from "@/lib/api/tickets-api"

export const TICKET_STATUSES: readonly TicketStatus[] = ["Open", "InProgress", "Resolved", "Closed"]
export const TICKET_PRIORITIES: readonly IssueSeverity[] = ["Low", "Medium", "High", "Critical"]

export const TICKET_PAGE_SIZES = [10, 20, 50] as const
export type TicketPageSize = (typeof TICKET_PAGE_SIZES)[number]
export const DEFAULT_TICKET_PAGE_SIZE: TicketPageSize = 10

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  Open: "Open",
  InProgress: "In progress",
  Resolved: "Resolved",
  Closed: "Closed",
}

export interface TicketListUrlState {
  page: number
  pageSize: TicketPageSize
  q: string
  status: TicketStatus | null
  priority: IssueSeverity | null
  tenant: string
  ticket: string | null
}

export const DEFAULT_TICKET_LIST_STATE: TicketListUrlState = {
  page: 1,
  pageSize: DEFAULT_TICKET_PAGE_SIZE,
  q: "",
  status: null,
  priority: null,
  tenant: "",
  ticket: null,
}

/** Anything with URLSearchParams' `get` — covers next/navigation's ReadonlyURLSearchParams. */
export interface ReadableParams {
  get(name: string): string | null
}

export function isTicketStatus(value: unknown): value is TicketStatus {
  return typeof value === "string" && (TICKET_STATUSES as readonly string[]).includes(value)
}

export function isTicketPriority(value: unknown): value is IssueSeverity {
  return typeof value === "string" && (TICKET_PRIORITIES as readonly string[]).includes(value)
}

export function isTicketPageSize(value: unknown): value is TicketPageSize {
  return typeof value === "number" && (TICKET_PAGE_SIZES as readonly number[]).includes(value)
}

/** Strict positive integer parse ("2" -> 2; "0", "-1", "1.5", "abc", null -> fallback). */
export function parsePositiveInt(raw: string | null | undefined, fallback: number): number {
  if (raw == null || !/^\d+$/.test(raw.trim())) return fallback
  const n = Number.parseInt(raw.trim(), 10)
  return Number.isSafeInteger(n) && n >= 1 ? n : fallback
}

export function parseTicketListParams(params: ReadableParams): TicketListUrlState {
  const size = parsePositiveInt(params.get("size"), DEFAULT_TICKET_PAGE_SIZE)
  const status = params.get("status")
  const priority = params.get("priority")
  const ticket = params.get("ticket")?.trim()
  return {
    page: parsePositiveInt(params.get("page"), 1),
    pageSize: isTicketPageSize(size) ? size : DEFAULT_TICKET_PAGE_SIZE,
    q: params.get("q")?.trim() ?? "",
    status: isTicketStatus(status) ? status : null,
    priority: isTicketPriority(priority) ? priority : null,
    tenant: params.get("tenant")?.trim() ?? "",
    ticket: ticket ? ticket : null,
  }
}

export type TicketListPatch = Partial<TicketListUrlState>

/** Keys that narrow or reshape the result set — changing any of them sends the user back to page 1. */
const RESET_PAGE_KEYS = ["pageSize", "q", "status", "priority", "tenant"] as const

/**
 * Applies a patch. If any filter (or the page size) actually changes and the patch doesn't set a
 * page explicitly, the page resets to 1. Selection (`ticket`) never affects the page.
 */
export function applyTicketListPatch(current: TicketListUrlState, patch: TicketListPatch): TicketListUrlState {
  const next: TicketListUrlState = { ...current, ...patch }
  const filtersChanged = RESET_PAGE_KEYS.some((key) => key in patch && patch[key] !== current[key])
  if (filtersChanged && patch.page === undefined) next.page = 1
  return next
}

const OWNED_KEYS = ["page", "size", "q", "status", "priority", "tenant", "ticket"] as const

/**
 * Serializes state to a query string (no leading "?"), omitting defaults. Params the list doesn't
 * own (e.g. `scope`) are carried over from `base` untouched.
 */
export function buildTicketListSearch(state: TicketListUrlState, base?: Iterable<[string, string]>): string {
  const out = new URLSearchParams()
  if (base) {
    for (const [key, value] of base) {
      if (!(OWNED_KEYS as readonly string[]).includes(key)) out.append(key, value)
    }
  }
  if (state.page > 1) out.set("page", String(state.page))
  if (state.pageSize !== DEFAULT_TICKET_PAGE_SIZE) out.set("size", String(state.pageSize))
  if (state.q.trim()) out.set("q", state.q.trim())
  if (state.status) out.set("status", state.status)
  if (state.priority) out.set("priority", state.priority)
  if (state.tenant.trim()) out.set("tenant", state.tenant.trim())
  if (state.ticket) out.set("ticket", state.ticket)
  return out.toString()
}

export function hasActiveTicketFilters(state: Pick<TicketListUrlState, "q" | "status" | "priority" | "tenant">): boolean {
  return state.q.trim() !== "" || state.status !== null || state.priority !== null || state.tenant.trim() !== ""
}
