"use client"

/**
 * The one date field for every form. Values are local "yyyy-MM-dd" strings (DateTimePicker: local
 * "yyyy-MM-ddTHH:mm", the same shape <input type="datetime-local"> produced), so swapping a native
 * input for this keeps stored formats and zod schemas unchanged.
 *
 * Trigger: an Input-height field showing the AD date with a quiet BS hint. Popover: a slim AD
 * calendar (or the Nepali BS grid via a small toggle), optional preset chips, Today / Clear.
 *
 * Date limit rule (lib/utils/date-limits.ts): no day after today (Nepal time) can be picked unless
 * the field passes `allowFuture` — expiry dates, "valid until", scheduled effective dates, etc.
 */

import { useEffect, useId, useMemo, useState } from "react"
import { format as formatAd } from "date-fns"
import NepaliDate from "nepali-date-converter"
import { CalendarIcon, ChevronLeft, ChevronRight, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { BS_MONTH_NAMES_EN, getBsDaysInMonth } from "@/features/calendar/nepali-utils"
import { formatLocalDateYmd, parseYmdAsLocalDate } from "@/lib/utils/date"
import { isDateAllowed, isValidYmd, nepalTodayYmd, resolveDateBounds } from "@/lib/utils/date-limits"

type CalendarSystem = "ad" | "bs"

const MODE_STORAGE_KEY = "date-picker:calendar"
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const

export interface DatePreset {
  label: string
  /** Returns the "yyyy-MM-dd" the preset selects (evaluated on click, so "today" stays fresh). */
  value: () => string
}

function addMonthsYmd(months: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() + months)
  return formatLocalDateYmd(d)
}

/** Shelf-life shortcuts for expiry fields (pair with `allowFuture`). */
export const EXPIRY_PRESETS: DatePreset[] = [
  { label: "+6 mo", value: () => addMonthsYmd(6) },
  { label: "+1 yr", value: () => addMonthsYmd(12) },
  { label: "+2 yr", value: () => addMonthsYmd(24) },
  { label: "+3 yr", value: () => addMonthsYmd(36) },
  { label: "+5 yr", value: () => addMonthsYmd(60) },
]

function toDate(ymd: string | undefined): Date | undefined {
  return isValidYmd(ymd) ? parseYmdAsLocalDate(ymd) : undefined
}

/** "22 Asoj 2083" for a "yyyy-MM-dd", or null when the value isn't a date. */
export function formatBsLabel(ymd: string): string | null {
  const d = toDate(ymd)
  if (!d) return null
  try {
    return NepaliDate.fromAD(d).format("DD MMMM YYYY", "en")
  } catch {
    return null
  }
}

function readStoredMode(): CalendarSystem {
  try {
    return window.localStorage.getItem(MODE_STORAGE_KEY) === "bs" ? "bs" : "ad"
  } catch {
    return "ad"
  }
}

function storeMode(mode: CalendarSystem) {
  try {
    window.localStorage.setItem(MODE_STORAGE_KEY, mode)
  } catch {
    // Storage blocked (private mode, previews) — the toggle still works for this session.
  }
}

const navButtonClass =
  "inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 ease-out hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 motion-reduce:transition-none"

/** Month grid for the Bikram Sambat calendar; selecting a day reports the AD "yyyy-MM-dd". */
export function BsCalendar({
  value,
  onSelect,
  min,
  max,
}: {
  value: string
  onSelect: (ymd: string) => void
  /** Inclusive AD bounds, "yyyy-MM-dd". */
  min?: string
  max?: string
}) {
  const selected = useMemo(() => {
    const d = toDate(value)
    return d ? NepaliDate.fromAD(d) : null
  }, [value])
  const start = selected ?? NepaliDate.now()
  const [viewYear, setViewYear] = useState(() => start.getYear())
  const [viewMonth0, setViewMonth0] = useState(() => start.getMonth())

  const daysInMonth = getBsDaysInMonth(viewYear, viewMonth0)
  const firstWeekday = new NepaliDate(viewYear, viewMonth0, 1).getDay()
  const today = NepaliDate.now()

  const adOf = (day: number) => {
    const ad = new NepaliDate(viewYear, viewMonth0, day).getAD()
    return `${ad.year}-${String(ad.month + 1).padStart(2, "0")}-${String(ad.date).padStart(2, "0")}`
  }

  const shiftMonth = (delta: number) => {
    const nd = new NepaliDate(viewYear, viewMonth0, 1)
    nd.setMonth(viewMonth0 + delta)
    setViewYear(nd.getYear())
    setViewMonth0(nd.getMonth())
  }

  const cells: (number | null)[] = []
  for (let i = 0; i < firstWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  return (
    <div className="p-2.5">
      <div className="mb-1 flex h-9 items-center justify-between gap-2 sm:h-8">
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
      <div role="grid" className="grid grid-cols-7 gap-y-0.5 text-center">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            role="columnheader"
            className="py-1 text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground"
          >
            {d}
          </div>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={`e-${i}`} />
          const ymd = adOf(day)
          const isSelected =
            !!selected && selected.getYear() === viewYear && selected.getMonth() === viewMonth0 && selected.getDate() === day
          const isToday = today.getYear() === viewYear && today.getMonth() === viewMonth0 && today.getDate() === day
          const disabled = !isDateAllowed(ymd, { min, max })
          return (
            <button
              key={day}
              type="button"
              role="gridcell"
              aria-selected={isSelected}
              aria-current={isToday ? "date" : undefined}
              aria-label={`${day} ${BS_MONTH_NAMES_EN[viewMonth0]} ${viewYear}`}
              disabled={disabled}
              onClick={() => onSelect(ymd)}
              className={cn(
                "num mx-auto inline-flex size-9 items-center justify-center rounded-md text-[0.8125rem] transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:text-muted-foreground disabled:opacity-40 motion-reduce:transition-none sm:size-8",
                isSelected ? "bg-primary font-medium text-primary-foreground" : "hover:bg-muted",
                isToday && !isSelected && "font-medium ring-1 ring-inset ring-primary/50",
              )}
            >
              {day}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export interface DatePickerProps {
  /** Local "yyyy-MM-dd", or "" for no date. */
  value: string
  onChange: (value: string) => void
  id?: string
  placeholder?: string
  disabled?: boolean
  /** Shows a clear button and a "Clear" action. Use for optional fields. */
  clearable?: boolean
  /** Inclusive bounds, "yyyy-MM-dd". Without `allowFuture`, `max` is additionally capped at today. */
  min?: string
  max?: string
  /**
   * Allows days after today. Off by default: every picker blocks future dates unless the field
   * genuinely needs them (expiry, valid-until, scheduled effective dates, expected delivery…).
   */
  allowFuture?: boolean
  presets?: DatePreset[]
  /** Month shown when the field is empty (defaults to the current month). */
  defaultMonth?: string
  /** Hides the BS equivalent in the trigger, for tight table cells. */
  compact?: boolean
  className?: string
  "aria-label"?: string
  "aria-invalid"?: boolean | "true" | "false"
  "aria-describedby"?: string
  "aria-required"?: boolean | "true" | "false"
  title?: string
}

const chipClass =
  "inline-flex h-7 items-center rounded-full border border-border px-2.5 text-xs font-medium text-muted-foreground transition-colors duration-150 ease-out hover:border-foreground/25 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-40 motion-reduce:transition-none sm:h-6"

const textActionClass =
  "inline-flex h-7 items-center rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors duration-150 ease-out hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-40 motion-reduce:transition-none sm:h-6"

export function DatePicker({
  value,
  onChange,
  id,
  placeholder = "Pick a date",
  disabled,
  clearable,
  min,
  max,
  allowFuture,
  presets,
  defaultMonth,
  compact,
  className,
  title,
  ...aria
}: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<CalendarSystem>("ad")
  useEffect(() => setMode(readStoredMode()), [])

  const today = nepalTodayYmd()
  const bounds = resolveDateBounds({ min, max, allowFuture, today })
  const selected = toDate(value)
  const bsLabel = value ? formatBsLabel(value) : null
  const minDate = toDate(bounds.min)
  const maxDate = toDate(bounds.max)
  const thisYear = new Date().getFullYear()
  const showClear = !!clearable && !!selected

  // A month to open on that can actually be picked from: the value, the caller's default, or the
  // nearest bound when today is outside the allowed range.
  const fallbackMonth = toDate(defaultMonth) ?? (isDateAllowed(today, bounds) ? undefined : (maxDate ?? minDate))

  /** Commits a day only when it's inside the bounds ("" always clears). */
  const commit = (ymd: string) => {
    if (ymd !== "" && !isDateAllowed(ymd, bounds)) return
    onChange(ymd)
    setOpen(false)
  }
  const switchMode = (next: CalendarSystem) => {
    setMode(next)
    storeMode(next)
  }

  return (
    <div className={cn("relative w-full", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            id={id}
            type="button"
            disabled={disabled}
            title={title}
            aria-haspopup="dialog"
            {...aria}
            className={cn(
              "flex h-10 w-full min-w-0 cursor-pointer items-center gap-2 rounded-md border border-input bg-card px-3 text-left text-base shadow-xs outline-none transition-[color,box-shadow,border-color] duration-150 ease-out hover:border-foreground/25 motion-reduce:transition-none sm:h-9 md:text-sm dark:bg-input/20",
              "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=open]:border-ring",
              "disabled:cursor-not-allowed disabled:opacity-50",
              "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
              showClear && "pr-9",
            )}
          >
            <CalendarIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            {selected ? (
              <span className="flex min-w-0 flex-1 items-baseline gap-2">
                <span className="num truncate text-foreground">{formatAd(selected, "d MMM yyyy")}</span>
                {!compact && bsLabel && (
                  <span className="num hidden truncate text-xs text-muted-foreground/80 sm:inline">{bsLabel} BS</span>
                )}
              </span>
            ) : (
              <span className="flex-1 truncate text-muted-foreground">{placeholder}</span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto rounded-lg p-0 shadow-sm" align="start">
          <div className="flex items-center justify-between gap-2 px-2.5 pt-2.5">
            <div role="radiogroup" aria-label="Calendar" className="inline-flex rounded-md bg-muted p-0.5">
              {(["ad", "bs"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  onClick={() => switchMode(m)}
                  className={cn(
                    "rounded px-2 py-0.5 text-[0.6875rem] font-medium transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 motion-reduce:transition-none",
                    mode === m ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {m === "ad" ? "AD" : "BS"}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-0.5">
              {showClear && (
                <button type="button" className={textActionClass} onClick={() => commit("")}>
                  Clear
                </button>
              )}
              <button
                type="button"
                className={cn(textActionClass, "text-primary hover:text-primary")}
                disabled={!isDateAllowed(today, bounds)}
                onClick={() => commit(today)}
              >
                Today
              </button>
            </div>
          </div>
          {presets && presets.length > 0 && (
            <div role="group" aria-label="Quick picks" className="flex flex-wrap gap-1 px-2.5 pt-2">
              {presets.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  className={chipClass}
                  disabled={!isDateAllowed(preset.value(), bounds)}
                  onClick={() => commit(preset.value())}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          )}
          {mode === "ad" ? (
            <Calendar
              mode="single"
              selected={selected}
              defaultMonth={selected ?? fallbackMonth}
              captionLayout="dropdown"
              startMonth={minDate ?? new Date(thisYear - 100, 0, 1)}
              endMonth={maxDate ?? new Date(thisYear + 20, 11, 31)}
              disabled={[...(minDate ? [{ before: minDate }] : []), ...(maxDate ? [{ after: maxDate }] : [])]}
              onSelect={(d) => d && commit(formatLocalDateYmd(d))}
              autoFocus
            />
          ) : (
            <BsCalendar
              value={value || defaultMonth || (fallbackMonth ? formatLocalDateYmd(fallbackMonth) : "")}
              onSelect={commit}
              min={bounds.min}
              max={bounds.max}
            />
          )}
        </PopoverContent>
      </Popover>
      {showClear && !disabled && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear date"
          className="absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-md text-muted-foreground transition-colors duration-150 ease-out hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 motion-reduce:transition-none"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      )}
    </div>
  )
}

export interface DateTimePickerProps extends Omit<DatePickerProps, "value" | "onChange" | "presets"> {
  /** Local "yyyy-MM-ddTHH:mm", or "" for none. */
  value: string
  onChange: (value: string) => void
  /** Minute granularity of the time field (default 5). */
  minuteStep?: number
}

/** DatePicker plus a time field; the time keeps its value when the date changes and vice versa. */
export function DateTimePicker({ value, onChange, id, disabled, minuteStep = 5, className, ...rest }: DateTimePickerProps) {
  const fallbackId = useId()
  const baseId = id ?? fallbackId
  const [datePart, timePart] = value ? value.split("T") : ["", ""]
  const time = (timePart ?? "").slice(0, 5)

  return (
    <div className={cn("flex w-full gap-2", className)}>
      <DatePicker
        {...rest}
        id={baseId}
        value={datePart ?? ""}
        disabled={disabled}
        onChange={(d) => onChange(d ? `${d}T${time || "09:00"}` : "")}
        className="min-w-0 flex-1"
      />
      <Input
        id={`${baseId}-time`}
        type="time"
        aria-label="Time"
        step={minuteStep * 60}
        value={time}
        disabled={disabled || !datePart}
        onChange={(e) => datePart && onChange(`${datePart}T${e.target.value}`)}
        className="num w-[7.5rem] shrink-0"
      />
    </div>
  )
}
