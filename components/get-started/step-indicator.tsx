"use client"

import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { STEPS, type StepId } from "@/lib/onboarding/get-started"

/** Numbered step tracker. Completed steps can be clicked to go back; the current one is announced. */
export function StepIndicator({
  current,
  completed,
  onSelect,
  disabled,
}: {
  current: StepId
  completed: ReadonlySet<StepId>
  onSelect: (step: StepId) => void
  disabled?: boolean
}) {
  const currentIndex = STEPS.findIndex((s) => s.id === current)

  return (
    <nav aria-label="Sign-up progress" className="mb-6">
      <ol className="flex items-start gap-2">
        {STEPS.map((step, index) => {
          const isCurrent = step.id === current
          const isDone = completed.has(step.id) && !isCurrent
          const reachable = !disabled && (isDone || index < currentIndex)
          return (
            <li key={step.id} className="flex min-w-0 flex-1 flex-col gap-2">
              <span
                aria-hidden
                className={cn(
                  "h-1 rounded-full transition-colors duration-300",
                  index <= currentIndex ? "bg-primary" : "bg-border",
                )}
              />
              <button
                type="button"
                disabled={!reachable}
                onClick={() => onSelect(step.id)}
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  "flex min-h-11 min-w-0 items-start gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  reachable ? "cursor-pointer" : "cursor-default",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums",
                    isCurrent && "border-primary bg-primary text-primary-foreground",
                    isDone && "border-primary bg-primary/10 text-primary",
                    !isCurrent && !isDone && "border-border text-muted-foreground",
                  )}
                >
                  {isDone ? <Check className="size-3.5" aria-hidden /> : index + 1}
                </span>
                <span className="min-w-0">
                  <span
                    className={cn(
                      "block truncate text-sm font-medium",
                      isCurrent ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {step.title}
                    {isDone && <span className="sr-only"> (completed)</span>}
                  </span>
                  <span className="hidden truncate text-xs text-muted-foreground sm:block">{step.description}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
