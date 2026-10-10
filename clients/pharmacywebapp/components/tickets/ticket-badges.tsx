/**
 * Shared status/priority Badge renderers for the Tickets pages (list + detail). Every value is
 * conveyed by icon + color + label, never color alone, matching components/status-badge.tsx's
 * convention for the rest of the app.
 */
import { CircleDot, Loader2, CheckCircle2, XCircle, Flame, ArrowUp, Minus, ArrowDown, type LucideIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { IssueSeverity, TicketStatus } from "@/lib/api/tickets-api"

type BadgeVariant = "info" | "warning" | "success" | "muted" | "danger"

const STATUS_BADGE: Record<TicketStatus, { label: string; variant: BadgeVariant; icon: LucideIcon; spin?: boolean }> = {
  Open: { label: "Open", variant: "info", icon: CircleDot },
  InProgress: { label: "In progress", variant: "warning", icon: Loader2, spin: true },
  Resolved: { label: "Resolved", variant: "success", icon: CheckCircle2 },
  Closed: { label: "Closed", variant: "muted", icon: XCircle },
}

const PRIORITY_BADGE: Record<IssueSeverity, { label: string; variant: BadgeVariant; icon: LucideIcon }> = {
  Low: { label: "Low", variant: "muted", icon: ArrowDown },
  Medium: { label: "Medium", variant: "info", icon: Minus },
  High: { label: "High", variant: "warning", icon: ArrowUp },
  Critical: { label: "Critical", variant: "danger", icon: Flame },
}

export function TicketStatusBadge({ status, className }: { status: TicketStatus; className?: string }) {
  const config = STATUS_BADGE[status]
  const Icon = config.icon
  return (
    <Badge variant={config.variant} className={className ? `gap-1 ${className}` : "gap-1"}>
      <Icon className={config.spin ? "h-3 w-3 animate-spin" : "h-3 w-3"} aria-hidden />
      {config.label}
    </Badge>
  )
}

export function TicketPriorityBadge({ priority, className }: { priority: IssueSeverity; className?: string }) {
  const config = PRIORITY_BADGE[priority]
  const Icon = config.icon
  return (
    <Badge variant={config.variant} className={className ? `gap-1 ${className}` : "gap-1"}>
      <Icon className="h-3 w-3" aria-hidden />
      {config.label}
    </Badge>
  )
}
