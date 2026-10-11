"use client"

import { CheckCircle2, CircleDot, Loader2, XCircle, type LucideIcon } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import type { TicketStatus } from "@/lib/api/tickets-api"
import { TICKET_STATUSES, TICKET_STATUS_LABEL } from "@/features/tickets/lib/ticket-list-params"

const CHIP_STYLE: Record<TicketStatus, { icon: LucideIcon; tone: string }> = {
  Open: { icon: CircleDot, tone: "text-info" },
  InProgress: { icon: Loader2, tone: "text-warning" },
  Resolved: { icon: CheckCircle2, tone: "text-success" },
  Closed: { icon: XCircle, tone: "text-muted-foreground" },
}

interface TicketStatChipsProps {
  counts: Record<TicketStatus, number> | null
  pending: boolean
  active: TicketStatus | null
  onToggle: (status: TicketStatus | null) => void
}

/** Per-status totals; each chip toggles the status filter. Renders nothing if counts are unavailable. */
export function TicketStatChips({ counts, pending, active, onToggle }: TicketStatChipsProps) {
  if (!counts) {
    if (!pending) return null
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-hidden>
        {TICKET_STATUSES.map((s) => (
          <Skeleton key={s} className="h-14 rounded-xl" />
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Tickets by status">
      {TICKET_STATUSES.map((status) => {
        const { icon: Icon, tone } = CHIP_STYLE[status]
        const pressed = active === status
        return (
          <button
            key={status}
            type="button"
            aria-pressed={pressed}
            onClick={() => onToggle(pressed ? null : status)}
            className={cn(
              "flex min-h-14 items-center gap-3 rounded-xl border bg-card px-3 py-2 text-left shadow-xs transition-[background-color,border-color,box-shadow] duration-150 ease-out",
              "hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              pressed && "border-primary/40 bg-primary/10 hover:bg-primary/10",
            )}
          >
            <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted", tone)}>
              <Icon className="size-4" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="num block text-lg font-semibold leading-tight text-foreground">{counts[status]}</span>
              <span className="block truncate text-xs text-muted-foreground">{TICKET_STATUS_LABEL[status]}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
