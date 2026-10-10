"use client"

/**
 * Presentational building blocks shared by every accounting view: status badges, money cells,
 * balance indicators, sticky-header tables, query-state switching and inline alerts.
 * UI only — no data access.
 */

import { useState, type ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import {
  AlertTriangle,
  Ban,
  Check,
  CheckCircle2,
  Copy,
  FilePen,
  Info,
  Loader2,
  PenLine,
  RotateCcw,
  Settings2,
  XCircle,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { SkeletonTable } from "@/components/ui/skeleton"
import { TableCell } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { useAccountingMoney } from "@/features/accounting/hooks/use-accounting-money"
import { voucherIdentifier, type VoucherIdentity } from "@/features/accounting/lib/voucher-meta"

/** Filter row above a report: filters wrap on the left, report actions (export/print/refresh) on the right. */
export function ReportToolbar({
  children,
  actions,
  className,
}: {
  children?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between", className)}>
      <div className="flex min-w-0 flex-wrap items-end gap-3">{children}</div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:ml-auto">{actions}</div>}
    </div>
  )
}

/**
 * "Balanced" / "Out of balance by Rs X" with an icon, so state is never carried by color alone.
 * `difference` is debit − credit (or any signed gap).
 */
export function BalanceStatus({
  balanced,
  difference,
  fmt,
  className,
  balancedLabel = "Balanced",
  unbalancedPrefix = "Out of balance by",
}: {
  balanced: boolean
  difference: number
  /** Optional custom formatter; defaults to the tenant currency. */
  fmt?: (n: number) => string
  className?: string
  balancedLabel?: string
  unbalancedPrefix?: string
}) {
  const { money } = useAccountingMoney()
  const text = fmt ? `Rs ${fmt(Math.abs(difference))}` : money(Math.abs(difference))
  return balanced ? (
    <span className={cn("inline-flex items-center gap-1.5 text-sm font-medium text-success", className)}>
      <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
      {balancedLabel}
    </span>
  ) : (
    <span className={cn("inline-flex items-center gap-1.5 text-sm font-medium text-destructive", className)}>
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
      {unbalancedPrefix} <span className="num">{text}</span>
    </span>
  )
}

/** Signed amount: tabular figures, negatives in destructive tone (the minus sign still carries the meaning). */
export function Amount({
  value,
  fmt,
  className,
  withSymbol = false,
}: {
  value: number
  fmt?: (n: number) => string
  className?: string
  withSymbol?: boolean
}) {
  const { amount, money } = useAccountingMoney()
  const f = fmt ?? (withSymbol ? money : amount)
  return <span className={cn("num whitespace-nowrap", value < 0 && "text-destructive", className)}>{f(value)}</span>
}

/** Right-aligned money table cell. Zero renders as a muted dash when `blankZero` is set (Dr/Cr columns). */
export function MoneyCell({
  value,
  blankZero = false,
  signed = false,
  className,
  strong = false,
}: {
  value: number | string | null | undefined
  blankZero?: boolean
  /** Colour negatives as destructive. */
  signed?: boolean
  strong?: boolean
  className?: string
}) {
  const { amount } = useAccountingMoney()
  const n = Number(value ?? 0) || 0
  const isZero = Math.abs(n) < 0.005
  return (
    <TableCell
      className={cn(
        "num whitespace-nowrap text-right",
        strong && "font-semibold",
        signed && n < 0 && "text-destructive",
        className
      )}
    >
      {blankZero && isZero ? (
        <span className="text-muted-foreground/60" aria-label="none">
          —
        </span>
      ) : (
        amount(n)
      )}
    </TableCell>
  )
}

/** Voucher lifecycle status with icon + word. */
export function VoucherStatusBadge({ status }: { status: string | null | undefined }) {
  const s = (status ?? "").toLowerCase()
  const label = s ? s.charAt(0).toUpperCase() + s.slice(1) : "Unknown"
  if (s === "posted")
    return (
      <Badge variant="success">
        <CheckCircle2 aria-hidden />
        {label}
      </Badge>
    )
  if (s === "draft")
    return (
      <Badge variant="muted">
        <FilePen aria-hidden />
        {label}
      </Badge>
    )
  if (s === "void" || s === "voided" || s === "cancelled")
    return (
      <Badge variant="danger">
        <Ban aria-hidden />
        {label}
      </Badge>
    )
  if (s === "reversed")
    return (
      <Badge variant="warning">
        <RotateCcw aria-hidden />
        {label}
      </Badge>
    )
  return <Badge variant="outline">{label}</Badge>
}

/** MJE (manual journal entry) vs SYS (system posting) identifier. */
export function VoucherSourceBadge({ voucher, className }: { voucher: VoucherIdentity; className?: string }) {
  const id = voucherIdentifier(voucher)
  return id === "MJE" ? (
    <Badge variant="info" className={className} title="Manual journal entry">
      <PenLine aria-hidden />
      MJE
    </Badge>
  ) : (
    <Badge variant="muted" className={className} title="Posted automatically by the system">
      <Settings2 aria-hidden />
      SYS
    </Badge>
  )
}

/** Row class for a totals line: top rule, semibold, subtle fill. */
export const totalsRowClass = "border-t-2 border-foreground/15 bg-muted/60 font-semibold hover:bg-muted/60"

/** Class for a <TableHeader> that sticks inside a ScrollTable. */
export const stickyHeaderClass =
  "sticky top-0 z-10 bg-muted shadow-[inset_0_-1px_0_var(--border)] [&_th]:h-9 [&_th]:text-xs [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground"

/** Class for a <TableFooter> that sticks to the bottom of a ScrollTable. */
export const stickyFooterClass = "sticky bottom-0 z-10 bg-muted shadow-[inset_0_1px_0_var(--border)]"

/**
 * Bordered, scrollable table frame. The vertical scroll lives here (not on the page) so the header
 * can stick; wide tables scroll horizontally inside the frame instead of the page.
 */
export function ScrollTable({
  children,
  maxHeight = "max-h-[min(68vh,720px)]",
  className,
  label,
}: {
  children: ReactNode
  maxHeight?: string
  className?: string
  /** Accessible name for the scroll region. */
  label?: string
}) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={label ? 0 : undefined}
      className={cn(
        "relative w-full overflow-auto rounded-lg border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        maxHeight,
        className
      )}
    >
      <table className="w-full caption-bottom text-sm [font-variant-numeric:tabular-nums]">{children}</table>
    </div>
  )
}

/**
 * Switches between skeleton, error (with retry), empty and content for a query-backed view.
 * Keeps showing content while a refetch runs.
 */
export function QueryState({
  isLoading,
  error,
  onRetry,
  retrying,
  isEmpty,
  empty,
  skeleton,
  errorTitle,
  children,
}: {
  isLoading: boolean
  error: unknown
  onRetry?: () => void
  retrying?: boolean
  isEmpty?: boolean
  empty?: { icon?: LucideIcon; title: string; description?: ReactNode; action?: { label: string; onClick?: () => void; href?: string; icon?: LucideIcon } }
  skeleton?: ReactNode
  errorTitle?: string
  children: ReactNode
}) {
  if (isLoading) {
    return (
      <div aria-busy="true">
        {skeleton ?? <SkeletonTable rows={6} cols={5} />}
        <span className="sr-only">Loading…</span>
      </div>
    )
  }
  if (error) {
    return (
      <ErrorState
        size="compact"
        title={errorTitle}
        message={apiRequestErrorMessage(error)}
        onRetry={onRetry}
        retrying={retrying}
      />
    )
  }
  if (isEmpty && empty) {
    return <EmptyState size="compact" icon={empty.icon} title={empty.title} description={empty.description} action={empty.action} />
  }
  return <>{children}</>
}

/** Small "Updating…" marker for background refetches. */
export function FetchingIndicator({ active, className }: { active: boolean; className?: string }) {
  if (!active) return null
  return (
    <span role="status" className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
      Updating…
    </span>
  )
}

const alertTone = {
  destructive: { box: "border-destructive/25 bg-destructive/5 text-destructive", icon: XCircle },
  warning: { box: "border-warning/30 bg-warning/10 text-foreground [&>svg]:text-warning", icon: AlertTriangle },
  info: { box: "border-info/25 bg-info/10 text-foreground [&>svg]:text-info", icon: Info },
  success: { box: "border-success/25 bg-success/10 text-foreground [&>svg]:text-success", icon: CheckCircle2 },
} as const

export function InlineAlert({
  tone = "warning",
  title,
  children,
  className,
}: {
  tone?: keyof typeof alertTone
  title?: ReactNode
  children?: ReactNode
  className?: string
}) {
  const t = alertTone[tone]
  const Icon = t.icon
  return (
    <div
      role={tone === "destructive" || tone === "warning" ? "alert" : "status"}
      className={cn("flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm", t.box, className)}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && "mt-0.5")}>{children}</div>}
      </div>
    </div>
  )
}

/** Icon button that copies a value to the clipboard and confirms with a check mark. */
export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-8 w-8 shrink-0"
      aria-label={copied ? "Copied" : label}
      title={copied ? "Copied" : label}
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1500)
        })
      }}
    >
      {copied ? <Check className="text-success" aria-hidden /> : <Copy aria-hidden />}
    </Button>
  )
}

/** Card header row used by every report card: title + description left, actions right. */
export function SectionHeading({
  title,
  description,
  actions,
  icon: Icon,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  icon?: LucideIcon
  className?: string
}) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold leading-tight text-foreground">
          {Icon && <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden />}
          {title}
        </h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
