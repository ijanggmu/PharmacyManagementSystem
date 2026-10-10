"use client"

/**
 * Shared month calendar (react-day-picker) for every picker in the app — slim cells, a quiet
 * caption (month/year dropdowns on the left, prev/next on the right), today as a hairline ring,
 * the selected day in primary. Styling only; all DayPicker props pass straight through.
 */

import * as React from "react"
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import {
  DayPicker,
  getDefaultClassNames,
  type ChevronProps,
  type DayButtonProps,
  type RootProps,
  type WeekNumberProps,
} from "react-day-picker"

import { cn } from "@/lib/utils"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

const navButton =
  "inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 ease-out hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 aria-disabled:pointer-events-none aria-disabled:opacity-40 motion-reduce:transition-none select-none"

function CalendarRoot({ className, rootRef, ...props }: RootProps) {
  return <div data-slot="calendar" ref={rootRef} className={cn(className)} {...props} />
}

function CalendarChevron({ className, orientation, size: _size, disabled: _disabled, ...props }: ChevronProps) {
  if (orientation === "left") return <ChevronLeftIcon className={cn("size-4", className)} aria-hidden {...props} />
  if (orientation === "right") return <ChevronRightIcon className={cn("size-4", className)} aria-hidden {...props} />
  return <ChevronDownIcon className={cn("size-3.5", className)} aria-hidden {...props} />
}

function CalendarWeekNumber({ children, week: _week, ...props }: WeekNumberProps) {
  return (
    <td {...props}>
      <div className="flex size-(--cell-size) items-center justify-center text-center">{children}</div>
    </td>
  )
}

function Calendar({ className, classNames, showOutsideDays = true, captionLayout = "label", formatters, components, ...props }: CalendarProps) {
  const defaultClassNames = getDefaultClassNames()

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn(
        "group/calendar bg-transparent p-2.5 [--cell-size:2.25rem] sm:[--cell-size:2rem]",
        className
      )}
      captionLayout={captionLayout}
      formatters={{
        formatMonthDropdown: (date) => date.toLocaleString("default", { month: "short" }),
        ...formatters,
      }}
      classNames={{
        root: cn("w-fit", defaultClassNames.root),
        months: cn("relative flex flex-col gap-4 md:flex-row", defaultClassNames.months),
        month: cn("flex w-full flex-col gap-2", defaultClassNames.month),
        nav: cn("absolute right-0 top-0 flex h-(--cell-size) items-center gap-0.5", defaultClassNames.nav),
        button_previous: cn(navButton, defaultClassNames.button_previous),
        button_next: cn(navButton, defaultClassNames.button_next),
        month_caption: cn("flex h-(--cell-size) w-full items-center pr-16", defaultClassNames.month_caption),
        dropdowns: cn("flex h-(--cell-size) items-center gap-0.5 text-sm font-medium", defaultClassNames.dropdowns),
        dropdown_root: cn(
          "relative rounded-md transition-colors duration-150 hover:bg-muted has-focus:ring-2 has-focus:ring-ring/60 motion-reduce:transition-none",
          defaultClassNames.dropdown_root
        ),
        dropdown: cn("absolute inset-0 cursor-pointer bg-popover opacity-0", defaultClassNames.dropdown),
        caption_label: cn(
          "select-none text-sm font-medium",
          captionLayout === "label"
            ? "px-1"
            : "flex h-7 items-center gap-0.5 rounded-md pl-1.5 pr-1 [&>svg]:text-muted-foreground",
          defaultClassNames.caption_label
        ),
        month_grid: "w-full border-collapse",
        weekdays: cn("flex", defaultClassNames.weekdays),
        weekday: cn(
          "w-(--cell-size) select-none text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground",
          defaultClassNames.weekday
        ),
        week: cn("mt-0.5 flex w-full", defaultClassNames.week),
        week_number_header: cn("w-(--cell-size) select-none", defaultClassNames.week_number_header),
        week_number: cn("select-none text-[0.75rem] text-muted-foreground", defaultClassNames.week_number),
        day: cn("group/day relative size-(--cell-size) select-none p-0 text-center", defaultClassNames.day),
        range_start: cn("rounded-l-md bg-muted", defaultClassNames.range_start),
        range_middle: cn("rounded-none bg-muted", defaultClassNames.range_middle),
        range_end: cn("rounded-r-md bg-muted", defaultClassNames.range_end),
        today: cn(defaultClassNames.today),
        outside: cn("text-muted-foreground/60", defaultClassNames.outside),
        disabled: cn("text-muted-foreground opacity-40", defaultClassNames.disabled),
        hidden: cn("invisible", defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Root: CalendarRoot,
        Chevron: CalendarChevron,
        DayButton: CalendarDayButton,
        WeekNumber: CalendarWeekNumber,
        ...components,
      }}
      {...props}
    />
  )
}
Calendar.displayName = "Calendar"

function CalendarDayButton({ className, day, modifiers, ...props }: DayButtonProps) {
  const defaultClassNames = getDefaultClassNames()
  const ref = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus()
  }, [modifiers.focused])

  const isRangeEnd = modifiers.range_start || modifiers.range_end
  const isSingle = modifiers.selected && !isRangeEnd && !modifiers.range_middle

  return (
    <button
      type="button"
      ref={ref}
      data-day={day.date.toLocaleDateString()}
      data-selected-single={isSingle}
      data-range-start={modifiers.range_start}
      data-range-end={modifiers.range_end}
      data-range-middle={modifiers.range_middle}
      data-today={modifiers.today}
      className={cn(
        "num inline-flex size-(--cell-size) items-center justify-center rounded-md text-[0.8125rem] font-normal leading-none text-foreground transition-colors duration-150 ease-out motion-reduce:transition-none",
        "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:text-muted-foreground",
        modifiers.outside && "text-muted-foreground/70",
        modifiers.today && !modifiers.selected && "font-medium ring-1 ring-inset ring-primary/50",
        (isSingle || isRangeEnd) && "bg-primary font-medium text-primary-foreground hover:bg-primary/90",
        modifiers.range_middle && "rounded-none bg-transparent hover:bg-background/60",
        defaultClassNames.day_button,
        className
      )}
      {...props}
    />
  )
}

export { Calendar, CalendarDayButton }
