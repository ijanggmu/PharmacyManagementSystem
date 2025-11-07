"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react"
import { format, addDays, startOfDay, endOfDay } from "date-fns"
import { cn } from "@/lib/utils"

interface DateRange {
  from: Date
  to: Date
}

interface DateRangePickerProps {
  dateRange: DateRange | undefined
  onDateRangeChange: (range: DateRange | undefined) => void
  className?: string
}

const quickRanges = [
  {
    label: "Today",
    range: () => ({
      from: startOfDay(new Date()),
      to: endOfDay(new Date()),
    }),
  },
  {
    label: "Yesterday",
    range: () => ({
      from: startOfDay(addDays(new Date(), -1)),
      to: endOfDay(addDays(new Date(), -1)),
    }),
  },
  {
    label: "Last 7 days",
    range: () => ({
      from: startOfDay(addDays(new Date(), -6)),
      to: endOfDay(new Date()),
    }),
  },
  {
    label: "Last 30 days",
    range: () => ({
      from: startOfDay(addDays(new Date(), -29)),
      to: endOfDay(new Date()),
    }),
  },
  {
    label: "Last 90 days",
    range: () => ({
      from: startOfDay(addDays(new Date(), -89)),
      to: endOfDay(new Date()),
    }),
  },
  {
    label: "This month",
    range: () => {
      const now = new Date()
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      return {
        from: startOfDay(startOfMonth),
        to: endOfDay(endOfMonth),
      }
    },
  },
  {
    label: "Last month",
    range: () => {
      const now = new Date()
      const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0)
      return {
        from: startOfDay(startOfLastMonth),
        to: endOfDay(endOfLastMonth),
      }
    },
  },
]

export default function DateRangePicker({ dateRange, onDateRangeChange, className }: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false)

  const handleQuickRangeSelect = (rangeFn: () => DateRange) => {
    onDateRangeChange(rangeFn())
    setIsOpen(false)
  }

  const handleClear = () => {
    onDateRangeChange(undefined)
    setIsOpen(false)
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "justify-start text-left font-normal",
            !dateRange && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {dateRange?.from ? (
            dateRange.to ? (
              <>
                {format(dateRange.from, "LLL dd, y")} -{" "}
                {format(dateRange.to, "LLL dd, y")}
              </>
            ) : (
              format(dateRange.from, "LLL dd, y")
            )
          ) : (
            <span>Pick a date range</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex">
          {/* Quick Range Selection */}
          <div className="border-r p-3">
            <div className="space-y-2">
              <h4 className="font-medium text-sm">Quick Ranges</h4>
              {quickRanges.map((quickRange) => (
                <Button
                  key={quickRange.label}
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-xs"
                  onClick={() => handleQuickRangeSelect(quickRange.range)}
                >
                  {quickRange.label}
                </Button>
              ))}
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-xs text-red-600 hover:text-red-700"
                onClick={handleClear}
              >
                Clear
              </Button>
            </div>
          </div>

          {/* Calendar Selection */}
          <div className="p-3">
            <Calendar
              initialFocus
              mode="range"
              defaultMonth={dateRange?.from}
              selected={dateRange}
              onSelect={onDateRangeChange}
              numberOfMonths={2}
              className="rounded-md border"
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
