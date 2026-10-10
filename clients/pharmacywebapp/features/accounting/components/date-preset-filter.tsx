"use client"

import { useMemo } from "react"
import { CalendarRange } from "lucide-react"
import { DateRangePicker } from "@/components/date-range-picker"
import { cn } from "@/lib/utils"
import { formatLocalDateYmd } from "@/lib/utils/date"
import {
  DATE_PRESETS,
  detectPreset,
  fiscalYearLabel,
  formatBsLong,
  getPresetRange,
  type DatePresetId,
  type PeriodRange,
} from "@/features/accounting/lib/date-presets"

interface DatePresetFilterProps {
  value: PeriodRange | undefined
  onChange: (range: PeriodRange | undefined) => void
  className?: string
}

/**
 * Period chooser: one-tap presets (Today, This week, This month, This BS month, Last 30 days,
 * This fiscal year) plus the AD/BS custom range picker. Shows the active range in BS underneath.
 */
export function DatePresetFilter({ value, onChange, className }: DatePresetFilterProps) {
  const now = useMemo(() => new Date(), [])
  const active = detectPreset(value, now)
  const fyLabel = fiscalYearLabel(now)

  const select = (id: DatePresetId) => onChange(getPresetRange(id, now))

  const bsFrom = value ? formatBsLong(formatLocalDateYmd(value.from)) : ""
  const bsTo = value ? formatBsLong(formatLocalDateYmd(value.to)) : ""

  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div
          role="group"
          aria-label="Period presets"
          className="flex max-w-full flex-wrap gap-0.5 rounded-lg border border-border/60 bg-muted/40 p-0.5"
        >
          {DATE_PRESETS.map((p) => {
            const isActive = active === p.id
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={isActive}
                onClick={() => select(p.id)}
                title={p.id === "fiscal_year" ? `Fiscal year ${fyLabel} (from 1 Shrawan)` : undefined}
                className={cn(
                  "inline-flex min-h-9 cursor-pointer items-center rounded-md px-2.5 text-xs font-medium transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 motion-reduce:transition-none sm:min-h-8",
                  isActive
                    ? "bg-card text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {p.id === "fiscal_year" ? `FY ${fyLabel}` : p.label}
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-2">
          <span className="sr-only">Custom range</span>
          <DateRangePicker dateRange={value} onDateRangeChange={onChange} />
          {!active && value && (
            <span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary">Custom</span>
          )}
        </div>
      </div>
      {value && bsFrom && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarRange className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            BS <span className="num font-medium text-foreground">{bsFrom}</span> –{" "}
            <span className="num font-medium text-foreground">{bsTo}</span>
          </span>
        </p>
      )}
    </div>
  )
}
