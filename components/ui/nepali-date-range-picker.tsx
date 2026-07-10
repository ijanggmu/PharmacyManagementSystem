"use client"

import { useMemo, useState } from "react"
import NepaliDate from "nepali-date-converter"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { BS_MONTH_NAMES_EN, getBsDaysInMonth } from "@/features/calendar/nepali-utils"

type DateRange = { from: Date; to: Date }

interface NepaliDateRangePickerProps {
  value?: DateRange
  onChange: (range: DateRange) => void
}

function sameBsDate(a: NepaliDate, b: NepaliDate) {
  return a.getYear() === b.getYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function toAdDate(bsYear: number, bsMonth0: number, bsDay: number): Date {
  const ad = new NepaliDate(bsYear, bsMonth0, bsDay).getAD()
  return new Date(ad.year, ad.month, ad.date)
}

export function NepaliDateRangePicker({ value, onChange }: NepaliDateRangePickerProps) {
  const initialBs = useMemo(() => (value?.from ? NepaliDate.fromAD(value.from) : NepaliDate.now()), [value?.from])
  const [viewYear, setViewYear] = useState(initialBs.getYear())
  const [viewMonth0, setViewMonth0] = useState(initialBs.getMonth())
  const [draftFrom, setDraftFrom] = useState<Date | null>(value?.from ?? null)

  const selectedFromBs = value?.from ? NepaliDate.fromAD(value.from) : null
  const selectedToBs = value?.to ? NepaliDate.fromAD(value.to) : null
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
    <div className="space-y-2 rounded-md border p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => shiftMonth(-1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-semibold">
          {BS_MONTH_NAMES_EN[viewMonth0]} {viewYear}
        </span>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => shiftMonth(1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-[11px] text-muted-foreground">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((weekday) => (
          <div key={weekday} className="p-1 font-medium">
            {weekday}
          </div>
        ))}
        {cells.map((cell, idx) =>
          cell === null ? (
            <div key={`e-${idx}`} className="p-1" />
          ) : (
            <button
              key={cell}
              type="button"
              onClick={() => clickDay(cell)}
              className={cn(
                "rounded-md p-1.5 text-sm font-medium transition-colors hover:bg-accent",
                inRange(cell) && "bg-accent",
                draftFrom &&
                  sameBsDate(NepaliDate.fromAD(draftFrom), new NepaliDate(viewYear, viewMonth0, cell)) &&
                  "ring-2 ring-primary",
                selectedFromBs &&
                  sameBsDate(selectedFromBs, new NepaliDate(viewYear, viewMonth0, cell)) &&
                  "bg-primary text-primary-foreground",
                selectedToBs &&
                  sameBsDate(selectedToBs, new NepaliDate(viewYear, viewMonth0, cell)) &&
                  "bg-primary text-primary-foreground"
              )}
            >
              {cell}
            </button>
          )
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {draftFrom ? "Now pick end date" : "Select start date, then end date"}
        </p>
        {draftFrom ? (
          <Button type="button" size="sm" variant="ghost" onClick={() => setDraftFrom(null)}>
            Reset start
          </Button>
        ) : null}
      </div>
    </div>
  )
}
