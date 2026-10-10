import { cn } from "@/lib/utils"
import { BrandMark } from "./brand-mark"

/**
 * Branded wait state for page-level loads with no known shape (first load, auth hand-off).
 * Prefer skeletons when the layout of the incoming content is known.
 */
export function BrandLoader({
  label = "Loading",
  fullscreen = false,
  className,
}: {
  label?: string
  fullscreen?: boolean
  className?: string
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex flex-col items-center justify-center gap-6 animate-fade-in",
        fullscreen ? "fixed inset-0 z-50 bg-background" : "min-h-[40vh] w-full",
        className
      )}
    >
      <div className="relative">
        <span className="absolute inset-0 rounded-[28%] bg-primary/40 animate-brand-ring" aria-hidden />
        <BrandMark className="relative size-11 animate-brand-breathe drop-shadow-sm" />
      </div>
      <div className="h-[3px] w-24 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="h-full w-1/3 rounded-full bg-primary animate-indeterminate" />
      </div>
      <span className="sr-only">{label}…</span>
    </div>
  )
}
