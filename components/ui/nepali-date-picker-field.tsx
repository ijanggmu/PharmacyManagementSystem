"use client"

import { useEffect, useMemo, useState } from "react"
import { parse, format as formatAd } from "date-fns"
import NepaliDate from "nepali-date-converter"
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { BS_MONTH_NAMES_EN, getBsDaysInMonth } from "@/features/calendar/nepali-utils"

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const

function parseAd(iso: string): Date {
  return parse(iso.slice(0, 10), "yyyy-MM-dd", new Date())
}

type NepaliDatePickerFieldProps = {
  value: string
  onChange: (isoDate: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  id?: string
  allowClear?: boolean
}

export function NepaliDatePickerField({
  value,
  onChange,
  placeholder = "Pick a date (BS)",
  disabled,
  className,
  id,
  allowClear,
}: NepaliDatePickerFieldProps) {
  const [open, setOpen] = useState(false)
  const initial = useMemo(() => {
    if (value && /^\d{4}-\d{2}-\d{2}/.test(value)) {
      return NepaliDate.fromAD(parseAd(value))
    }
    return NepaliDate.now()
  }, [value])

  const [viewYear, setViewYear] = useState(() => initial.getYear())
  const [viewMonth0, setViewMonth0] = useState(() => initial.getMonth())

  useEffect(() => {
    if (!open) return
    const base =
      value && /^\d{4}-\d{2}-\d{2}/.test(value)
        ? NepaliDate.fromAD(parseAd(value))
        : NepaliDate.now()
    setViewYear(base.getYear())
    setViewMonth0(base.getMonth())
  }, [open, value])

  const label = useMemo(() => {
    if (!value || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null
    const nd = NepaliDate.fromAD(parseAd(value))
    return nd.format("ddd DD, MMMM YYYY", "en")
  }, [value])

  const daysInMonth = getBsDaysInMonth(viewYear, viewMonth0)
  const firstWeekday = new NepaliDate(viewYear, viewMonth0, 1).getDay()
  const cells: (number | null)[] = []
  for (let i = 0; i < firstWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const selectDay = (day: number) => {
    const nd = new NepaliDate(viewYear, viewMonth0, day)
    const ad = nd.getAD()
    const iso = `${ad.year}-${String(ad.month + 1).padStart(2, "0")}-${String(ad.date).padStart(2, "0")}`
    onChange(iso)
    setOpen(false)
  }

  const shiftMonth = (delta: number) => {
    const nd = new NepaliDate(viewYear, viewMonth0, 1)
    nd.setMonth(viewMonth0 + delta)
    setViewYear(nd.getYear())
    setViewMonth0(nd.getMonth())
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn("w-full justify-start text-left font-normal", !label && "text-muted-foreground", className)}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0 opacity-70" />
          {label ?? placeholder}
          {label && (
            <span className="ml-auto truncate text-xs text-muted-foreground">
              ({formatAd(parseAd(value), "yyyy-MM-dd")})
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start">
        <div className="mb-2 flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => shiftMonth(-1)}
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-0 truncate text-sm font-semibold">
            {BS_MONTH_NAMES_EN[viewMonth0]} {viewYear}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => shiftMonth(1)}
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid grid-cols-7 gap-0.5 text-center text-[11px] text-muted-foreground">
          {WEEKDAYS.map((d) => (
            <div key={d} className="p-1 font-medium">
              {d}
            </div>
          ))}
          {cells.map((cell, i) =>
            cell === null ? (
              <div key={`e-${i}`} className="p-1" />
            ) : (
              <button
                key={cell}
                type="button"
                onClick={() => selectDay(cell)}
                className={cn(
                  "rounded-md p-1.5 text-sm font-medium transition-colors hover:bg-accent",
                  value &&
                    /^\d{4}-\d{2}-\d{2}/.test(value) &&
                    NepaliDate.fromAD(parseAd(value)).getDate() === cell &&
                    NepaliDate.fromAD(parseAd(value)).getMonth() === viewMonth0 &&
                    NepaliDate.fromAD(parseAd(value)).getYear() === viewYear &&
                    "bg-primary text-primary-foreground hover:bg-primary"
                )}
              >
                {cell}
              </button>
            )
          )}
        </div>
        {allowClear ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-2 w-full text-muted-foreground"
            onClick={() => {
              onChange("")
              setOpen(false)
            }}
          >
            Clear date
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
