"use client"

import { useMemo, useState } from "react"
import NepaliDate from "nepali-date-converter"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { BS_MONTH_NAMES_EN, getBsDaysInMonth } from "@/features/calendar/nepali-utils"
import { formatLocalDateYmd } from "@/lib/utils/date"
import { isDateAllowed } from "@/lib/utils/date-limits"

type DateRange = { from: Date; to: Date }

interface NepaliDateRangePickerProps {
  value?: DateRange
  onChange: (range: DateRange) => void
  /** Inclusive AD bounds, "yyyy-MM-dd". Days outside are disabled. */
  min?: string
  max?: string
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const

const navButtonClass =
  "inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 ease-out hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 motion-reduce:transition-none"

function sameBsDate(a: NepaliDate, b: NepaliDate) {
  return a.getYear() === b.getYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function toAdDate(bsYear: number, bsMonth0: number, bsDay: number): Date {
  const ad = new NepaliDate(bsYear, bsMonth0, bsDay).getAD()
  return new Date(ad.year, ad.month, ad.date)
}

export function NepaliDateRangePicker({ value, onChange, min, max }: NepaliDateRangePickerProps) {
  const initialBs = useMemo(() => (value?.from ? NepaliDate.fromAD(value.from) : NepaliDate.now()), [value?.from])
  const [viewYear, setViewYear] = useState(initialBs.getYear())
  const [viewMonth0, setViewMonth0] = useState(initialBs.getMonth())
  const [draftFrom, setDraftFrom] = useState<Date | null>(value?.from ?? null)

  const selectedFromBs = value?.from ? NepaliDate.fromAD(value.from) : null
  const selectedToBs = value?.to ? NepaliDate.fromAD(value.to) : null
  const todayBs = NepaliDate.now()
  const daysInMonth = getBsDaysInMonth(viewYear, viewMonth0)
  const firstWeekday = new NepaliDate(viewYear, viewMonth0, 1).getDay()

  const cells: (number | null)[] = []
  for (let i = 0; i < firstWeekday; i++) cells.push(null)
  for (let day = 1; day <= daysInMonth; day++) cells.push(day)

  const shiftMonth = (delta: number) => {
    const nd = new NepaliDate(viewYear, viewMonth0, 1)
    nd.setMonth(viewMonth0 + delta)
    setViewYear(nd.getYear())
    setViewMonth0(nd.getMonth())
  }

  const clickDay = (day: number) => {
    const clicked = toAdDate(viewYear, viewMonth0, day)
    if (!draftFrom) {
      setDraftFrom(clicked)
      return
    }

    const from = clicked < draftFrom ? clicked : draftFrom
    const to = clicked < draftFrom ? draftFrom : clicked
    onChange({ from, to })
    setDraftFrom(null)
  }

  const inRange = (day: number) => {
    if (!value?.from || !value?.to) return false
    const current = toAdDate(viewYear, viewMonth0, day)
    return current >= value.from && current <= value.to
  }

  return (
    <div className="space-y-1 p-2.5">
      <div className="flex h-9 items-center justify-between gap-2 sm:h-8">
        <span className="px-1 text-sm font-medium" aria-live="polite">
          {BS_MONTH_NAMES_EN[viewMonth0]} <span className="num">{viewYear}</span>
        </span>
        <div className="flex items-center gap-0.5">
          <button type="button" className={navButtonClass} onClick={() => shiftMonth(-1)} aria-label="Previous month">
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <button type="button" className={navButtonClass} onClick={() => shiftMonth(1)} aria-label="Next month">
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-y-0.5 text-center">
        {WEEKDAYS.map((weekday) => (
          <div key={weekday} className="py-1 text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground">
            {weekday}
          </div>
        ))}
        {cells.map((cell, idx) => {
          if (cell === null) return <div key={`e-${idx}`} />
          const bs = new NepaliDate(viewYear, viewMonth0, cell)
          const isEnd =
            (!!selectedFromBs && sameBsDate(selectedFromBs, bs)) || (!!selectedToBs && sameBsDate(selectedToBs, bs))
          const isDraftStart = !!draftFrom && sameBsDate(NepaliDate.fromAD(draftFrom), bs)
          const isToday = sameBsDate(todayBs, bs)
          const disabled = !isDateAllowed(formatLocalDateYmd(toAdDate(viewYear, viewMonth0, cell)), { min, max })
          return (
            <button
              key={cell}
              type="button"
              disabled={disabled}
              aria-pressed={isEnd}
              aria-current={isToday ? "date" : undefined}
              aria-label={`${cell} ${BS_MONTH_NAMES_EN[viewMonth0]} ${viewYear}`}
              onClick={() => clickDay(cell)}
              className={cn(
                "num mx-auto inline-flex size-9 items-center justify-center rounded-md text-[0.8125rem] transition-colors duration-150 ease-out hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:text-muted-foreground disabled:opacity-40 motion-reduce:transition-none sm:size-8",
                inRange(cell) && "bg-muted",
                isToday && !isEnd && "font-medium ring-1 ring-inset ring-primary/50",
                isDraftStart && "ring-2 ring-inset ring-primary",
                isEnd && "bg-primary font-medium text-primary-foreground hover:bg-primary/90"
              )}
            >
              {cell}
            </button>
          )
        })}
      </div>
      <div className="flex min-h-7 items-center justify-between gap-2 pt-1">
        <p className="text-xs text-muted-foreground">
          {draftFrom ? "Now pick end date" : "Select start date, then end date"}
        </p>
        {draftFrom ? (
          <button
            type="button"
            className="inline-flex h-7 items-center rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors duration-150 ease-out hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 motion-reduce:transition-none sm:h-6"
            onClick={() => setDraftFrom(null)}
          >
            Reset start
          </button>
        ) : null}
      </div>
    </div>
  )
}
