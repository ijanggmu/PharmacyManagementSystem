"use client"

import * as React from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon } from "lucide-react"
import type { DateRange as RdpDateRange } from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { NepaliDateRangePicker } from "@/components/ui/nepali-date-range-picker"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface DateRange {
  from: Date
  to: Date
}

interface DateRangePickerProps {
  dateRange?: DateRange
  onDateRangeChange?: (range: DateRange | undefined) => void
  className?: string
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0)
}

function endOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999)
}

export function DateRangePicker({
  dateRange,
  onDateRangeChange,
  className,
}: DateRangePickerProps) {
  const [isOpen, setIsOpen] = React.useState(false)
  const [mode, setMode] = React.useState<"ad" | "bs">("ad")
  const [draftRange, setDraftRange] = React.useState<RdpDateRange | undefined>(dateRange)

  React.useEffect(() => {
    if (isOpen) return
    setDraftRange(dateRange)
  }, [dateRange, isOpen])

  const applyPreset = (preset: "last7" | "thisMonth" | "lastMonth") => {
    const now = new Date()
    if (preset === "last7") {
      const from = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6))
      const to = endOfDay(now)
      setDraftRange({ from, to })
      return
    }
    if (preset === "thisMonth") {
      const from = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1))
      const to = endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0))
      setDraftRange({ from, to })
      return
    }

    const from = startOfDay(new Date(now.getFullYear(), now.getMonth() - 1, 1))
    const to = endOfDay(new Date(now.getFullYear(), now.getMonth(), 0))
    setDraftRange({ from, to })
  }

  const applyDraft = () => {
    if (draftRange?.from && draftRange?.to) {
      onDateRangeChange?.({ from: startOfDay(draftRange.from), to: endOfDay(draftRange.to) })
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
          <Button
            id="date"
            variant={"outline"}
            size="sm"
            className={cn(
              "w-[200px] sm:w-[240px] justify-start text-left font-normal h-9 text-xs",
              !dateRange && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
            <span className="truncate">
              {dateRange?.from ? (
                dateRange.to ? (
                  <>
                    {format(dateRange.from, "MMM dd")} - {format(dateRange.to, "MMM dd")}
                  </>
                ) : (
                  format(dateRange.from, "MMM dd")
                )
              ) : (
                "Select date range"
              )}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <div className="space-y-3 p-3">
            <div className="inline-flex rounded-md border p-1">
              <Button
                type="button"
                size="sm"
                variant={mode === "ad" ? "default" : "ghost"}
                onClick={() => setMode("ad")}
              >
                English (AD)
              </Button>
              <Button
                type="button"
                size="sm"
                variant={mode === "bs" ? "default" : "ghost"}
                onClick={() => setMode("bs")}
              >
                Nepali (BS)
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => applyPreset("last7")}>
                Last 7 days
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => applyPreset("thisMonth")}>
                This month
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => applyPreset("lastMonth")}>
                Last month
              </Button>
            </div>

            {mode === "ad" ? (
              <Calendar
                initialFocus
                mode="range"
                min={1}
                defaultMonth={dateRange?.from || new Date()}
                selected={draftRange}
                onSelect={(range) => {
                  setDraftRange(range)
                }}
                numberOfMonths={1}
                className="rounded-md border"
              />
            ) : (
              <NepaliDateRangePicker
                value={
                  draftRange?.from && draftRange?.to
                    ? { from: draftRange.from, to: draftRange.to }
                    : undefined
                }
                onChange={(range) => setDraftRange(range)}
              />
            )}
            <div className="flex items-center justify-end gap-2 border-t pt-2">
              <Button type="button" size="sm" variant="ghost" onClick={clearFilter}>
                Clear filter
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={applyDraft}
                disabled={!draftRange?.from || !draftRange?.to}
              >
                Apply
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

