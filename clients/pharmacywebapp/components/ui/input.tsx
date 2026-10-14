import * as React from "react"

import { cn } from "@/lib/utils"

/** Number-like fields: entering one selects what's in it, so typing replaces a "0" instead of appending to it. */
function selectsOnFocus(type: string | undefined, inputMode: string | undefined): boolean {
  return type === "number" || inputMode === "decimal" || inputMode === "numeric"
}

function Input({ className, type, value, onFocus, onMouseUp, ...props }: React.ComponentProps<"input">) {
  // Ensure value is never undefined to prevent controlled/uncontrolled warnings
  // Only set value prop if it's defined (for controlled inputs)
  // If value is undefined, don't pass it (for uncontrolled inputs)
  const inputProps = value !== undefined
    ? { ...props, value: value ?? "" }
    : props

  // A click focuses on mousedown and would collapse the selection on mouseup; skip that one mouseup.
  const justFocused = React.useRef(false)
  const selectAll = selectsOnFocus(type, props.inputMode)

  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/20 border-input flex h-10 w-full min-w-0 rounded-md border bg-card px-3 py-1.5 text-base shadow-xs transition-[color,box-shadow,border-color] duration-150 outline-none hover:border-foreground/25 sm:h-9 file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 read-only:bg-muted/50 read-only:hover:border-input md:text-sm",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        className
      )}
      onFocus={(e) => {
        onFocus?.(e)
        if (selectAll && !e.defaultPrevented) {
          e.currentTarget.select()
          justFocused.current = true
        }
      }}
      onMouseUp={(e) => {
        onMouseUp?.(e)
        if (justFocused.current) {
          justFocused.current = false
          e.preventDefault()
        }
      }}
      {...inputProps}
    />
  )
}

export { Input }
