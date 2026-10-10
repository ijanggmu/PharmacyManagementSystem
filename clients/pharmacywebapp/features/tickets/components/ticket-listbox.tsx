"use client"

import { useRef, useState, type KeyboardEvent } from "react"
import { Building2, MessageSquare, UserRound, UserRoundX } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { TicketPriorityBadge, TicketStatusBadge } from "@/components/tickets/ticket-badges"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { DotnetTicketDto } from "@/lib/api/tickets-api"
import { isTicketStatus } from "@/features/tickets/lib/ticket-list-params"
import { formatRelativeShort, nextListIndex } from "@/features/tickets/lib/ticket-list-utils"

export function ticketRowDomId(ticketId: string): string {
  return `ticket-row-${ticketId}`
}

interface TicketListboxProps {
  tickets: readonly DotnetTicketDto[]
  selectedId: string | null
  onSelect: (ticketId: string) => void
  showTenant: boolean
  currentUserId: string | null
  label: string
  /** Dims the rows while the next page loads (previous data stays visible). */
  stale?: boolean
}

/**
 * Single-select listbox of ticket rows. Each option is a real <button> (Enter/Space open it);
 * Arrow/Home/End move focus with a roving tabindex so the list is one Tab stop.
 */
export function TicketListbox({ tickets, selectedId, onSelect, showTenant, currentUserId, label, stale }: TicketListboxProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const selectedIndex = tickets.findIndex((t) => t.id === selectedId)
  const [focusIndex, setFocusIndex] = useState(0)
  const tabStop = selectedIndex >= 0 ? selectedIndex : Math.min(focusIndex, Math.max(0, tickets.length - 1))

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const options = listRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]')
    if (!options || options.length === 0) return
    const current = Array.from(options).findIndex((el) => el === document.activeElement)
    const next = nextListIndex(current < 0 ? tabStop : current, e.key, options.length)
    if (next === null) return
    e.preventDefault()
    setFocusIndex(next)
    options[next]?.focus()
  }

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label={label}
      aria-busy={stale || undefined}
      onKeyDown={handleKeyDown}
      className={cn("divide-y transition-opacity duration-200 ease-out", stale && "opacity-60")}
    >
      {tickets.map((ticket, index) => {
        const selected = ticket.id === selectedId
        const status = isTicketStatus(ticket.status) ? ticket.status : null
        const assignee = ticket.assignedToUserId
          ? ticket.assignedToUserId === currentUserId
            ? "Assigned to you"
            : "Assigned"
          : "Unassigned"
        return (
          <button
            key={ticket.id}
            id={ticketRowDomId(ticket.id)}
            type="button"
            role="option"
            aria-selected={selected}
            aria-current={selected ? "true" : undefined}
            tabIndex={index === tabStop ? 0 : -1}
            onFocus={() => setFocusIndex(index)}
            onClick={() => onSelect(ticket.id)}
            className={cn(
              "group relative block min-h-10 w-full px-4 py-3 text-left transition-colors duration-150 ease-out outline-none",
              "hover:bg-muted/60 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              "before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-primary before:opacity-0 before:transition-opacity before:duration-150",
              selected && "bg-primary/10 before:opacity-100 hover:bg-primary/10",
            )}
          >
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="num shrink-0 font-mono">#{ticket.number}</span>
              {showTenant && (
                <span className="flex min-w-0 items-center gap-1" title={ticket.tenantId ?? undefined}>
                  <Building2 className="size-3 shrink-0" aria-hidden />
                  <span className="sr-only">Tenant </span>
                  <span className="truncate font-mono">{ticket.tenantId || "—"}</span>
                </span>
              )}
              <time className="ml-auto shrink-0 whitespace-nowrap" dateTime={ticket.createdAtUtc} title={new Date(ticket.createdAtUtc).toLocaleString()}>
                {formatRelativeShort(ticket.createdAtUtc)}
              </time>
            </span>
            <span className={cn("mt-1 block truncate text-sm font-medium text-foreground", selected && "text-primary")} title={ticket.title}>
              {ticket.title}
            </span>
            <span className="mt-2 flex flex-wrap items-center gap-1.5">
              {status ? <TicketStatusBadge status={status} /> : <Badge variant="muted">{ticket.status}</Badge>}
              <TicketPriorityBadge priority={ticket.priority} />
              <span className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
                <span className="hidden items-center gap-1 min-[420px]:flex">
                  {ticket.assignedToUserId ? (
                    <UserRound className="size-3.5" aria-hidden />
                  ) : (
                    <UserRoundX className="size-3.5" aria-hidden />
                  )}
                  {assignee}
                </span>
                <span className="flex items-center gap-1" title={`${ticket.commentCount} comment${ticket.commentCount === 1 ? "" : "s"}`}>
                  <MessageSquare className="size-3.5" aria-hidden />
                  <span className="num">{ticket.commentCount}</span>
                  <span className="sr-only">comment{ticket.commentCount === 1 ? "" : "s"}</span>
                </span>
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

export function TicketListSkeleton({ rows = 6, showTenant }: { rows?: number; showTenant: boolean }) {
  return (
    <div className="divide-y" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="space-y-2 px-4 py-3">
          <div className="flex items-center gap-2">
            <Skeleton variant="text" className="h-3 w-16" />
            {showTenant && <Skeleton variant="text" className="h-3 w-20" />}
            <Skeleton variant="text" className="ml-auto h-3 w-12" />
          </div>
          <Skeleton variant="text" className="h-4 w-3/4" />
          <div className="flex items-center gap-1.5">
            <Skeleton className="h-5 w-16 rounded-md" />
            <Skeleton className="h-5 w-14 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  )
}
