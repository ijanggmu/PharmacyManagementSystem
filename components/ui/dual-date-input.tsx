"use client"

import { useMemo, useState } from "react"
import { CalendarIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { formatLocalDateYmd, parseYmdAsLocalDate } from "@/lib/utils/date"
import { NepaliDatePickerField } from "@/components/ui/nepali-date-picker-field"

type CalendarMode = "ad" | "bs"

interface DualDateInputProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

const QUICK_OFFSETS: { label: string; months: number }[] = [
  { label: "+6mo", months: 6 },
  { label: "+1yr", months: 12 },
  { label: "+2yr", months: 24 },
  { label: "+3yr", months: 36 },
  { label: "+5yr", months: 60 },
]

function addMonths(date: Date, months: number): Date {
  const result = new Date(date)
  result.setMonth(result.getMonth() + months)
  return result
}

export function DualDateInput({ value, onChange, disabled }: DualDateInputProps) {
  const [mode, setMode] = useState<CalendarMode>("ad")
  const [open, setOpen] = useState(false)
  const adDate = useMemo(() => (value ? parseYmdAsLocalDate(value) : undefined), [value])
  const today = useMemo(() => new Date(), [])
  const calendarStart = useMemo(() => new Date(today.getFullYear() - 1, 0, 1), [today])
  const calendarEnd = useMemo(() => new Date(today.getFullYear() + 15, 11, 31), [today])

  return (
    <div className="space-y-2">
      <div className="inline-flex rounded-md border p-1">
        <Button
          type="button"
          variant={mode === "ad" ? "default" : "ghost"}
          size="sm"
          onClick={() => {
            setMode("ad")
            setOpen(false)
          }}
          disabled={disabled}
        >
          English (AD)
        </Button>
        <Button
          type="button"
          variant={mode === "bs" ? "default" : "ghost"}
          size="sm"
          onClick={() => {
            setMode("bs")
            setOpen(false)
          }}
          disabled={disabled}
        >
          Nepali (BS)
        </Button>
      </div>

      {mode === "ad" ? (
        <div className="flex gap-2">
          <Input
            type="date"
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            className="flex-1 [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:pointer-events-none"
          />
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" size="icon" disabled={disabled}>
                <CalendarIcon className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <div className="flex flex-wrap gap-1 border-b p-2">
                {QUICK_OFFSETS.map((offset) => (
                  <Button
                    key={offset.label}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => {
                      onChange(formatLocalDateYmd(addMonths(today, offset.months)))
                      setOpen(false)
                    }}
                  >
                    {offset.label}
                  </Button>
                ))}
              </div>
              <Calendar
                mode="single"
                selected={adDate}
                defaultMonth={adDate ?? addMonths(today, 12)}
                captionLayout="dropdown"
                startMonth={calendarStart}
                endMonth={calendarEnd}
                onSelect={(selected) => {
                  if (selected) {
                    onChange(formatLocalDateYmd(selected))
                    setOpen(false)
                  }
                }}
                autoFocus
              />
            </PopoverContent>
          </Popover>
        </div>
      ) : (
        <NepaliDatePickerField value={value} onChange={onChange} disabled={disabled} allowClear />
      )}
    </div>
  )
}
