"use client"

/**
 * From–to filter picker (AD calendar or the Nepali BS grid). Like DatePicker, ranges can't run
 * past today (Nepal time) unless `allowFuture` is set: days after today are disabled, and a preset
 * or applied range that would end later is clamped to end today.
 */

import * as React from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon } from "lucide-react"
import type { DateRange as RdpDateRange } from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { NepaliDateRangePicker } from "@/components/ui/nepali-date-range-picker"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { formatLocalDateYmd, parseYmdAsLocalDate } from "@/lib/utils/date"
import { clampYmdRange, nepalTodayYmd, resolveDateBounds, type DateBounds } from "@/lib/utils/date-limits"
import { bsMonthRangeYmd, formatBsRange } from "@/lib/utils/bs-date"

interface DateRange {
  from: Date
  to: Date
}

interface DateRangePickerProps {
  dateRange?: DateRange
  onDateRangeChange?: (range: DateRange | undefined) => void
  className?: string
  /** Allows ranges that end after today. Off by default. */
  allowFuture?: boolean
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0)
}

function endOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999)
}

/** Swaps reversed ends and clamps both into `bounds`; whole-day from/to. */
function clampRange(range: DateRange, bounds: DateBounds): DateRange | undefined {
  const clamped = clampYmdRange({ from: formatLocalDateYmd(range.from), to: formatLocalDateYmd(range.to) }, bounds)
  if (!clamped) return undefined
  return { from: startOfDay(parseYmdAsLocalDate(clamped.from)), to: endOfDay(parseYmdAsLocalDate(clamped.to)) }
}

const chipClass =
  "inline-flex h-7 items-center rounded-full border border-border px-2.5 text-xs font-medium text-muted-foreground transition-colors duration-150 ease-out hover:border-foreground/25 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 motion-reduce:transition-none sm:h-6"

export function DateRangePicker({ dateRange, onDateRangeChange, className, allowFuture }: DateRangePickerProps) {
  const [isOpen, setIsOpen] = React.useState(false)
  const [mode, setMode] = React.useState<"ad" | "bs">("ad")
  const [draftRange, setDraftRange] = React.useState<RdpDateRange | undefined>(dateRange)

  const today = nepalTodayYmd()
  const bounds = resolveDateBounds({ allowFuture, today })
  const maxDate = bounds.max ? parseYmdAsLocalDate(bounds.max) : undefined

  React.useEffect(() => {
    if (isOpen) return
    setDraftRange(dateRange)
  }, [dateRange, isOpen])

  const applyPreset = (preset: "last7" | "thisMonth" | "lastMonth") => {
    const now = parseYmdAsLocalDate(today)
    let range: DateRange
    if (preset === "last7") {
      range = { from: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6), to: now }
    } else if (mode === "bs") {
      // In the Nepali calendar "this month" is the BS month (e.g. 1 Ashwin – today), not the AD month.
      const bsRange = bsMonthRangeYmd(today, preset === "thisMonth" ? 0 : -1)
      range = { from: parseYmdAsLocalDate(bsRange.from), to: parseYmdAsLocalDate(bsRange.to) }
    } else if (preset === "thisMonth") {
      range = { from: new Date(now.getFullYear(), now.getMonth(), 1), to: new Date(now.getFullYear(), now.getMonth() + 1, 0) }
    } else {
      range = { from: new Date(now.getFullYear(), now.getMonth() - 1, 1), to: new Date(now.getFullYear(), now.getMonth(), 0) }
    }
    setDraftRange(clampRange(range, bounds))
  }

  const applyDraft = () => {
    if (draftRange?.from && draftRange?.to) {
      onDateRangeChange?.(clampRange({ from: draftRange.from, to: draftRange.to }, bounds))
      setIsOpen(false)
    }
  }

  const clearFilter = () => {
    setDraftRange(undefined)
    onDateRangeChange?.(undefined)
    setIsOpen(false)
  }

  return (
    <div className={cn("grid gap-2", className)}>
      <Popover
        open={isOpen}
        onOpenChange={(next) => {
          if (!next) {
            setDraftRange(dateRange)
          }
          setIsOpen(next)
        }}
      >
        <PopoverTrigger asChild>
          <button
            id="date"
            type="button"
            className={cn(
              "flex h-10 w-[200px] min-w-0 cursor-pointer items-center gap-2 rounded-md border border-input bg-card px-3 text-left text-xs shadow-xs outline-none transition-[color,box-shadow,border-color] duration-150 ease-out hover:border-foreground/25 motion-reduce:transition-none sm:h-9 sm:w-[240px] dark:bg-input/20",
              "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=open]:border-ring",
              !dateRange && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="num truncate">
              {dateRange?.from
                ? mode === "bs"
                  ? formatBsRange(dateRange.from, dateRange.to ?? dateRange.from)
                  : dateRange.to
                    ? `${format(dateRange.from, "MMM dd")} – ${format(dateRange.to, "MMM dd")}`
                    : format(dateRange.from, "MMM dd")
                : "Select date range"}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto rounded-lg p-0 shadow-sm" align="start">
          <div className="flex flex-col gap-2 px-2.5 pt-2.5">
            <div role="radiogroup" aria-label="Calendar" className="inline-flex w-fit rounded-md bg-muted p-0.5">
              {(["ad", "bs"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  onClick={() => setMode(m)}
                  className={cn(
                    "rounded px-2 py-0.5 text-[0.6875rem] font-medium transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 motion-reduce:transition-none",
                    mode === m ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {m === "ad" ? "English (AD)" : "Nepali (BS)"}
                </button>
              ))}
            </div>
            <div role="group" aria-label="Quick ranges" className="flex flex-wrap gap-1">
              <button type="button" className={chipClass} onClick={() => applyPreset("last7")}>
                Last 7 days
              </button>
              <button type="button" className={chipClass} onClick={() => applyPreset("thisMonth")}>
                {mode === "bs" ? "This BS month" : "This month"}
              </button>
              <button type="button" className={chipClass} onClick={() => applyPreset("lastMonth")}>
                {mode === "bs" ? "Last BS month" : "Last month"}
              </button>
            </div>
          </div>

          {mode === "ad" ? (
            <Calendar
              autoFocus
              mode="range"
              min={1}
              defaultMonth={draftRange?.from || dateRange?.from || maxDate || new Date()}
              endMonth={maxDate}
              disabled={maxDate ? { after: maxDate } : undefined}
              selected={draftRange}
              onSelect={(range) => {
                setDraftRange(range)
              }}
              numberOfMonths={1}
            />
          ) : (
            <NepaliDateRangePicker
              value={draftRange?.from && draftRange?.to ? { from: draftRange.from, to: draftRange.to } : undefined}
              onChange={(range) => setDraftRange(range)}
              max={bounds.max}
            />
          )}
          <div className="flex items-center justify-end gap-1.5 border-t border-border/60 px-2.5 py-2">
            <Button type="button" size="sm" variant="ghost" onClick={clearFilter}>
              Clear filter
            </Button>
            <Button type="button" size="sm" onClick={applyDraft} disabled={!draftRange?.from || !draftRange?.to}>
              Apply
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
