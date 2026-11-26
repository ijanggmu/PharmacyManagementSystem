"use client"

import { useMemo, useState } from "react"
import { CalendarRange } from "lucide-react"
import { DateRangePicker } from "@/components/date-range-picker"
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select"
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
  /** Adds a first option meaning "no date filter" (e.g. "All dates"); choosing it calls onChange(undefined). */
  allLabel?: string
}

const CUSTOM = "custom"
const ALL = "all"

/**
 * Period chooser, kept to one line: a single dropdown of presets (Today … This fiscal year, Custom range). The
 * AD/BS range picker only appears for a custom range, and the active range in BS sits beside it as a caption,
 * so the filter never takes more room than the page content needs.
 */
export function DatePresetFilter({ value, onChange, className, allLabel }: DatePresetFilterProps) {
  const now = useMemo(() => new Date(), [])
  const preset = detectPreset(value, now)
  const fyLabel = fiscalYearLabel(now)
  // "Custom" is a mode the user picks; it also shows when the range matches no preset.
  const [customMode, setCustomMode] = useState(false)
  const selected = !value && allLabel && !customMode ? ALL : customMode || !preset ? CUSTOM : preset

  const select = (id: string) => {
    if (id === CUSTOM) {
      setCustomMode(true)
      return
    }
    if (id === ALL) {
      setCustomMode(false)
      onChange(undefined)
      return
    }
    setCustomMode(false)
    onChange(getPresetRange(id as DatePresetId, now))
  }

  const bsFrom = value ? formatBsLong(formatLocalDateYmd(value.from)) : ""
  const bsTo = value ? formatBsLong(formatLocalDateYmd(value.to)) : ""

  return (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2", className)}>
      <Select value={selected} onValueChange={select}>
        <SelectTrigger
          aria-label="Period"
          title={value && bsFrom ? `BS ${bsFrom} to ${bsTo}` : undefined}
          className="w-[180px]"
        >
          <CalendarRange className="size-4 text-muted-foreground" aria-hidden />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {allLabel && <SelectItem value={ALL}>{allLabel}</SelectItem>}
          {DATE_PRESETS.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.id === "fiscal_year" ? `Fiscal year ${fyLabel}` : p.label}
            </SelectItem>
          ))}
          <SelectSeparator />
          <SelectItem value={CUSTOM}>Custom range…</SelectItem>
        </SelectContent>
      </Select>
      {selected === CUSTOM && <DateRangePicker dateRange={value} onDateRangeChange={onChange} />}
      {value && bsFrom && (
        // The BS dates sit inline on very wide screens; elsewhere they're on the period's tooltip, keeping the bar one line.
        <span className="hidden text-xs text-muted-foreground 2xl:inline">
          BS <span className="num text-foreground/80">{bsFrom}</span> to <span className="num text-foreground/80">{bsTo}</span>
        </span>
      )}
    </div>
  )
}
