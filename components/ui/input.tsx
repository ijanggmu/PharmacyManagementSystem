import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, value, ...props }: React.ComponentProps<"input">) {
  // Ensure value is never undefined to prevent controlled/uncontrolled warnings
  // Only set value prop if it's defined (for controlled inputs)
  // If value is undefined, don't pass it (for uncontrolled inputs)
  const inputProps = value !== undefined 
    ? { ...props, value: value ?? "" }
    : props
  
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1.5 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        className
      )}
      {...inputProps}
    />
  )
}

export { Input }
