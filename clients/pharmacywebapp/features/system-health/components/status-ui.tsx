"use client"

import type { ReactNode } from "react"
import { Activity, AlertTriangle, CheckCircle2, CircleDashed, XCircle, type LucideIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Pagination } from "@/components/ui/pagination"
import { cn } from "@/lib/utils"
import type { Page } from "../lib/paginate"
import type { OverallStatus, RowStatus } from "../lib/status"
import { detailValueText } from "../lib/details"

type AnyStatus = OverallStatus | RowStatus

export interface StatusMeta {
  label: string
  icon: LucideIcon
  text: string
  dot: string
  badge: "success" | "warning" | "danger" | "muted"
  tile: string
}

export const STATUS_META: Record<AnyStatus, StatusMeta> = {
  Healthy: { label: "Healthy", icon: CheckCircle2, text: "text-success", dot: "bg-success", badge: "success", tile: "bg-success/10 text-success ring-success/20" },
  Degraded: { label: "Degraded", icon: AlertTriangle, text: "text-warning", dot: "bg-warning", badge: "warning", tile: "bg-warning/10 text-warning ring-warning/25" },
  Unhealthy: { label: "Unhealthy", icon: XCircle, text: "text-destructive", dot: "bg-destructive", badge: "danger", tile: "bg-destructive/10 text-destructive ring-destructive/20" },
  Unreachable: { label: "Unreachable", icon: XCircle, text: "text-destructive", dot: "bg-destructive", badge: "danger", tile: "bg-destructive/10 text-destructive ring-destructive/20" },
  Unknown: { label: "Not reported", icon: CircleDashed, text: "text-muted-foreground", dot: "bg-muted-foreground/40", badge: "muted", tile: "bg-muted text-muted-foreground ring-border" },
  Loading: { label: "Checking…", icon: Activity, text: "text-muted-foreground", dot: "bg-muted-foreground/40", badge: "muted", tile: "bg-muted text-muted-foreground ring-border" },
}

/** Dot + text label: status is never conveyed by colour alone. */
export function StatusLabel({ status, className }: { status: AnyStatus; className?: string }) {
  const meta = STATUS_META[status]
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap", meta.text, className)}>
      <span className={cn("size-2 shrink-0 rounded-full", meta.dot)} aria-hidden />
      {meta.label}
    </span>
  )
}

export function StatusBadge({ status }: { status: AnyStatus }) {
  const meta = STATUS_META[status]
  const Icon = meta.icon
  return (
    <Badge variant={meta.badge}>
      <Icon aria-hidden />
      {meta.label}
    </Badge>
  )
}

/** Card with a compact title row, used by every tab section. */
export function SectionCard({
  title,
  description,
  icon: Icon,
  aside,
  children,
  className,
  titleId,
}: {
  title: string
  description?: ReactNode
  icon?: LucideIcon
  aside?: ReactNode
  children: ReactNode
  className?: string
  titleId?: string
}) {
  return (
    <Card className={cn("gap-0 overflow-hidden py-0", className)} role={titleId ? "region" : undefined} aria-labelledby={titleId}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 border-b px-4 py-3.5 sm:px-5">
        <div className="min-w-0">
          <h3 id={titleId} className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            {Icon && <Icon className="size-4 text-muted-foreground" aria-hidden />}
            {title}
          </h3>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        {aside}
      </div>
      {children}
    </Card>
  )
}

/** Wraps the shared Pagination so it stacks and keeps ≥40px targets on phones without page-level scroll. */
export function PageFooter<T>({ page, onPageChange }: { page: Page<T>; onPageChange: (page: number) => void }) {
  if (page.totalPages <= 1) return null
  return (
    <nav aria-label="Pagination" className="overflow-x-auto border-t px-4 py-3 sm:px-5">
      <Pagination
        currentPage={page.page}
        totalPages={page.totalPages}
        totalItems={page.totalItems}
        itemsPerPage={page.perPage}
        startIndex={page.startIndex}
        onPageChange={onPageChange}
        className="min-w-max flex-col items-start gap-2 text-xs sm:min-w-0 sm:flex-row sm:items-center [&_button]:h-10 [&_button]:min-w-10 sm:[&_button]:h-8 sm:[&_button]:min-w-8 [&_p]:text-xs"
      />
    </nav>
  )
}

/** Raw health-check details as a key/value list. */
export function DetailList({ details, className }: { details: Record<string, unknown> | null | undefined; className?: string }) {
  const entries = details ? Object.entries(details) : []
  if (entries.length === 0) return null
  return (
    <dl className={cn("grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs", className)}>
      {entries.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="truncate font-mono text-muted-foreground" title={k}>
            {k}
          </dt>
          <dd className="font-mono break-all">{detailValueText(v)}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Small count badge for tab triggers; adds an icon when it signals a problem. */
export function TabCount({ value, tone = "muted", label }: { value: ReactNode; tone?: "muted" | "warning" | "danger" | "success"; label?: string }) {
  return (
    <Badge variant={tone} className="num ml-0.5 h-5 px-1.5 text-[11px]">
      {(tone === "warning" || tone === "danger") && <AlertTriangle aria-hidden />}
      <span aria-hidden={label ? true : undefined}>{value}</span>
      {label && <span className="sr-only">{label}</span>}
    </Badge>
  )
}
