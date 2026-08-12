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

export function DualDateInput({ value, onChange, disabled }: DualDateInputProps) {
  const [mode, setMode] = useState<CalendarMode>("ad")
  const [open, setOpen] = useState(false)
  const adDate = useMemo(() => (value ? parseYmdAsLocalDate(value) : undefined), [value])

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
              <Calendar
                mode="single"
                selected={adDate}
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
