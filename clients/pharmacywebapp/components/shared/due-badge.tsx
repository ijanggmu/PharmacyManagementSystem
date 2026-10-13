import { AlertTriangle, CalendarClock } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { dueBadgeVariant, dueLabel, dueState } from "@/lib/utils/payment-terms"

/** "12 days overdue" / "Due in 3 days" badge for an open bill or invoice; nothing for a settled one. */
export function DueBadge({ daysOverdue, className }: { daysOverdue: number | null | undefined; className?: string }) {
  const state = dueState(daysOverdue)
  if (state === "none") return null
  const Icon = state === "overdue" ? AlertTriangle : CalendarClock
  return (
    <Badge variant={dueBadgeVariant(state)} className={className}>
      <Icon aria-hidden className="h-3 w-3" />
      {dueLabel(daysOverdue)}
    </Badge>
  )
}

/** The due date with its badge underneath, for ledger / bill tables. */
export function DueDateCell({ dueDate, daysOverdue }: { dueDate: string | null; daysOverdue: number | null | undefined }) {
  if (!dueDate) return <span className="text-xs text-muted-foreground">No terms</span>
  return (
    <span className="flex flex-col items-start gap-1">
      <span className="num text-sm">{dueDate}</span>
      <DueBadge daysOverdue={daysOverdue} />
    </span>
  )
}
