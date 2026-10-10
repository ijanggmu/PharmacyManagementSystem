/** Pure helpers for the ticket lists: paging maths, client-side keyword filtering, keyboard nav. */
import type { DotnetTicketDto } from "@/lib/api/tickets-api"

export function totalPagesFor(totalCount: number, pageSize: number): number {
  if (!Number.isFinite(totalCount) || totalCount <= 0 || pageSize <= 0) return 1
  return Math.max(1, Math.ceil(totalCount / pageSize))
}

export function clampPage(page: number, totalPages: number): number {
  const max = Math.max(1, Math.floor(totalPages))
  if (!Number.isFinite(page)) return 1
  return Math.min(Math.max(1, Math.floor(page)), max)
}

export interface PageWindow {
  /** 0-based index of the first item on this page (what components/ui/pagination expects). */
  startIndex: number
  /** 1-based "from" for "11–20 of 42"; 0 when there is nothing to show. */
  from: number
  /** 1-based inclusive "to". */
  to: number
}

export function pageWindow(page: number, pageSize: number, totalCount: number): PageWindow {
  const safeTotal = Math.max(0, totalCount)
  const current = clampPage(page, totalPagesFor(safeTotal, pageSize))
  const startIndex = (current - 1) * pageSize
  if (safeTotal === 0) return { startIndex: 0, from: 0, to: 0 }
  return { startIndex, from: startIndex + 1, to: Math.min(startIndex + pageSize, safeTotal) }
}

/**
 * Case-insensitive keyword match over number (leading "#" ignored), title and tenant id. Every
 * whitespace-separated term must match some field (AND). Empty keyword returns the input as-is.
 */
export function filterTicketsByKeyword<T extends Pick<DotnetTicketDto, "number" | "title" | "tenantId">>(
  tickets: readonly T[],
  keyword: string,
): T[] {
  const terms = keyword
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/^#/, ""))
    .filter(Boolean)
  if (terms.length === 0) return [...tickets]
  return tickets.filter((ticket) => {
    const haystack = [ticket.number, ticket.title, ticket.tenantId ?? ""].join(" ").toLowerCase()
    return terms.every((term) => haystack.includes(term))
  })
}

/** Roving-focus target for listbox keys; null when the key isn't a navigation key or list is empty. */
export function nextListIndex(current: number, key: string, length: number): number | null {
  if (length <= 0) return null
  switch (key) {
    case "ArrowDown":
      return Math.min(length - 1, current + 1)
    case "ArrowUp":
      return Math.max(0, current - 1)
    case "Home":
      return 0
    case "End":
      return length - 1
    default:
      return null
  }
}

/** Compact relative time: "just now", "5m ago", "3h ago", "6d ago", then a short date. */
export function formatRelativeShort(iso: string, now: Date = new Date()): string {
  const date = new Date(iso)
  const ms = date.getTime()
  if (Number.isNaN(ms)) return "—"
  const seconds = Math.floor((now.getTime() - ms) / 1000)
  if (seconds < 60) return "just now"
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 7 * 86400) return `${Math.floor(seconds / 86400)}d ago`
  const sameYear = date.getFullYear() === now.getFullYear()
  return date.toLocaleDateString("en-US", sameYear ? { month: "short", day: "numeric" } : { year: "numeric", month: "short", day: "numeric" })
}

export function ticketDetailHref(ticketId: string, crossTenant: boolean): string {
  const base = `/dashboard/tickets/${encodeURIComponent(ticketId)}`
  return crossTenant ? `${base}?scope=all-tenants` : base
}

/** Same heuristic the pages always used to tell a 403 apart from other failures. */
export function isPermissionErrorMessage(message: string): boolean {
  const lower = message.toLowerCase()
  return lower.includes("forbidden") || lower.includes("permission")
}

export function shortId(id: string | null | undefined, length = 8): string {
  if (!id) return "—"
  return id.length > length ? id.slice(0, length) : id
}
