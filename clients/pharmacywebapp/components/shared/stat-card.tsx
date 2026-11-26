/**
 * StatCard — the one KPI tile used across every module.
 *
 * Inside a StatGrid the cards become cells of one calm "stat strip": a single panel split by hairlines, with
 * no per-stat boxes or icon tiles, so a page opens with one quiet band of numbers instead of a wall of cards.
 * The restyle is pure CSS keyed on data attributes, so it works from Server Components too. On its own (detail
 * modals, sheets) a StatCard keeps the standalone card look.
 *
 * - Static by default; pass `onClick` to make it a filter toggle (renders a real
 *   <button> with aria-pressed so it is keyboard and screen-reader operable), or
 *   `href` to make it a link to a drill-down.
 * - `tone` colors the icon tile and, when the value needs attention, the value.
 *   Meaning is always carried by the label/hint text too — never color alone.
 * - `loading` renders a same-size skeleton so the grid never jumps.
 */

import Link from "next/link"
import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import { ArrowDownRight, ArrowUpRight } from "lucide-react"
import { cn } from "@/lib/utils"

export type StatTone = "default" | "primary" | "success" | "warning" | "danger" | "info"

const toneTile: Record<StatTone, string> = {
  default: "bg-muted text-muted-foreground ring-border",
  primary: "bg-primary/10 text-primary ring-primary/15",
  success: "bg-success/10 text-success ring-success/15",
  warning: "bg-warning/10 text-warning ring-warning/20",
  danger: "bg-destructive/10 text-destructive ring-destructive/15",
  info: "bg-info/10 text-info ring-info/15",
}

const toneActive: Record<StatTone, string> = {
  default: "ring-2 ring-foreground/20 border-foreground/30",
  primary: "ring-2 ring-primary/30 border-primary/50 bg-primary/[0.03]",
  success: "ring-2 ring-success/30 border-success/50 bg-success/[0.03]",
  warning: "ring-2 ring-warning/30 border-warning/50 bg-warning/[0.03]",
  danger: "ring-2 ring-destructive/30 border-destructive/50 bg-destructive/[0.03]",
  info: "ring-2 ring-info/30 border-info/50 bg-info/[0.03]",
}

export interface StatCardProps {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon?: LucideIcon
  tone?: StatTone
  /** Percent change vs. previous period. Positive = up. */
  trend?: number
  /** For metrics where "down" is good (e.g. expired stock), flip the trend color. */
  trendInverted?: boolean
  loading?: boolean
  onClick?: () => void
  /** Pressed state when the card acts as a filter toggle. */
  active?: boolean
  href?: string
  className?: string
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  trend,
  trendInverted = false,
  loading = false,
  onClick,
  active,
  href,
  className,
}: StatCardProps) {
  const interactive = Boolean(onClick || href)

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {Icon && (
          <span
            data-stat-icon=""
            className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg ring-1", toneTile[tone])}
            aria-hidden
          >
            <Icon className="size-4" />
          </span>
        )}
      </div>
      {loading ? (
        <div className="mt-1 space-y-2" aria-hidden>
          <div className="shimmer h-7 w-24 rounded-md bg-muted" />
          <div className="shimmer h-3.5 w-32 rounded bg-muted" />
        </div>
      ) : (
        <>
          <div data-stat-value="" className="num -mt-1 font-display text-2xl font-semibold tracking-tight text-foreground">
            {value}
          </div>
          {(hint || typeof trend === "number") && (
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              {typeof trend === "number" && Number.isFinite(trend) && (
                <TrendPill value={trend} inverted={trendInverted} />
              )}
              {hint && <span>{hint}</span>}
            </div>
          )}
        </>
      )}
      {loading && <span className="sr-only">Loading {label}</span>}
    </>
  )

  const base = cn(
    "group relative flex flex-col gap-2 rounded-xl border bg-card p-4 text-left shadow-xs sm:p-5",
    interactive &&
      "cursor-pointer transition-[border-color,box-shadow,background-color,transform] duration-200 ease-out hover:-translate-y-px hover:border-foreground/15 hover:shadow-sm active:translate-y-0 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
    active && toneActive[tone],
    className
  )

  const data = { "data-stat-card": "", "data-tone": tone, "data-active": active ? "" : undefined }
  if (href) {
    return (
      <Link href={href} className={base} {...data}>
        {body}
      </Link>
    )
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-pressed={active ?? undefined} className={base} {...data}>
        {body}
      </button>
    )
  }
  return (
    <div className={base} {...data}>
      {body}
    </div>
  )
}

function TrendPill({ value, inverted }: { value: number; inverted: boolean }) {
  const up = value >= 0
  const good = inverted ? !up : up
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold",
        good ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      <span className="num">{Math.abs(value).toFixed(1)}%</span>
      <span className="sr-only">{up ? "increase" : "decrease"}</span>
    </span>
  )
}

/**
 * Restyles child StatCards as cells of one panel. Cells draw a right and bottom hairline; the panel clips the
 * outer ones (negative margin + overflow hidden), so a partly filled last row leaves plain panel, not grey gaps.
 */
const STRIP_CELLS = [
  "[&>[data-stat-card]]:rounded-none [&>[data-stat-card]]:border-0",
  "[&>[data-stat-card]]:gap-0.5 [&>[data-stat-card]]:px-4 [&>[data-stat-card]]:py-3 sm:[&>[data-stat-card]]:p-4",
  "[&>[data-stat-card]]:shadow-[inset_-1px_-1px_0_var(--color-border)]",
  // Clickable cells: a quiet fill on hover instead of the card's lift and shadow (more specific than the card's own hover).
  "[&>[data-stat-card]:hover]:translate-y-0 [&>[data-stat-card]:hover]:shadow-[inset_-1px_-1px_0_var(--color-border)]",
  "[&>a[data-stat-card]:hover]:bg-muted/50 [&>button[data-stat-card]:hover]:bg-muted/50",
  // No icon tiles: the label says what the number is.
  "[&_[data-stat-icon]]:hidden",
  "[&_[data-stat-value]]:mt-0 [&_[data-stat-value]]:text-xl",
  // Colour only where a number needs attention.
  "[&>[data-tone=warning]_[data-stat-value]]:text-warning [&>[data-tone=danger]_[data-stat-value]]:text-destructive",
  // The active filter: a tinted cell with an accent rule along its top edge.
  "[&>[data-stat-card][data-active]]:bg-primary/[0.05] [&>[data-stat-card][data-active]]:ring-0",
  "[&>[data-stat-card][data-active]]:shadow-[inset_0_2px_0_var(--color-primary),inset_-1px_-1px_0_var(--color-border)]",
].join(" ")

/** One stat strip. 2 columns on phones, `cols` on desktop. */
export function StatGrid({
  children,
  cols = 4,
  className,
}: {
  children: ReactNode
  cols?: 2 | 3 | 4 | 5 | 6
  className?: string
}) {
  const lg = {
    2: "sm:grid-cols-2",
    3: "sm:grid-cols-3",
    4: "sm:grid-cols-2 lg:grid-cols-4",
    5: "sm:grid-cols-3 lg:grid-cols-5",
    6: "sm:grid-cols-3 xl:grid-cols-6",
  }[cols]
  return (
    <div className={cn("overflow-hidden rounded-xl border bg-card", className)}>
      <div className={cn("-mb-px -mr-px grid grid-cols-2", lg, STRIP_CELLS)}>{children}</div>
    </div>
  )
}
