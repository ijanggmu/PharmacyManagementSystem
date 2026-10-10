/**
 * Standardized Error State Component
 * States what failed and always offers a way forward (retry, go back, contact).
 */

import { cn } from "@/lib/utils"
import { AlertTriangle, RotateCw } from "lucide-react"
import { Button } from "./button"

interface ErrorStateProps {
  title?: string
  message: string
  action?: {
    label: string
    onClick: () => void
  }
  /** Shortcut for the most common recovery: renders a "Try again" button. */
  onRetry?: () => void
  retrying?: boolean
  size?: "default" | "compact"
  className?: string
}

export function ErrorState({
  title = "We couldn't load this",
  message,
  action,
  onRetry,
  retrying,
  size = "default",
  className,
}: ErrorStateProps) {
  const compact = size === "compact"
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "px-4 py-8" : "px-6 py-14",
        className
      )}
    >
      <div
        className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive ring-1 ring-destructive/20"
        aria-hidden
      >
        <AlertTriangle className="h-5 w-5" />
      </div>
      <h3 className="font-display text-base font-semibold text-foreground sm:text-lg">{title}</h3>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">{message}</p>
      {(onRetry || action) && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {onRetry && (
            <Button variant="outline" onClick={onRetry} loading={retrying}>
              {!retrying && <RotateCw aria-hidden />}
              Try again
            </Button>
          )}
          {action && (
            <Button variant={onRetry ? "ghost" : "outline"} onClick={action.onClick}>
              {action.label}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
