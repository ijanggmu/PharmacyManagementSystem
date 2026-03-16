"use client"

import { cn } from "@/lib/utils"

type Billing = "monthly" | "annual"

interface PricingToggleProps {
  value: Billing
  onValueChange: (value: Billing) => void
  className?: string
}

export function PricingToggle({ value, onValueChange, className }: PricingToggleProps) {
  const isAnnual = value === "annual"

  return (
    <div
      className={cn(
        "inline-flex items-center gap-3 rounded-full border border-slate-200 bg-white px-1 py-1 shadow-sm",
        className
      )}
      role="group"
      aria-label="Billing period"
    >
      <button
        type="button"
        onClick={() => onValueChange("monthly")}
        className={cn(
          "rounded-full px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2",
          !isAnnual ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900"
        )}
        aria-pressed={!isAnnual}
      >
        Monthly
      </button>
      <button
        type="button"
        onClick={() => onValueChange("annual")}
        className={cn(
          "rounded-full px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2",
          isAnnual ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900"
        )}
        aria-pressed={isAnnual}
      >
        Annual
      </button>
      <span className="hidden rounded-full bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-700 sm:inline">
        Save 17%
      </span>
    </div>
  )
}
