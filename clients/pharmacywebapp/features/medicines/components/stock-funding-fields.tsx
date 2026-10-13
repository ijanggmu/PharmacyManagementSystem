"use client"

import { Banknote, Landmark, PackageCheck } from "lucide-react"
import { FieldError } from "@/components/ui/field-error"
import { cn } from "@/lib/utils"
import {
  STOCK_FUNDING_OPTIONS,
  stockFundingPostingHint,
  type StockFunding,
  type StockFundingChoice,
} from "@/features/medicines/lib/stock-funding"

const ICONS: Record<StockFunding, typeof Banknote> = {
  opening_stock: PackageCheck,
  cash: Banknote,
  bank: Landmark,
}

/**
 * "How was this stock paid for?" for stock entered without a supplier: opening stock (Owner's Equity),
 * paid in cash (Cash) or paid by bank / wallet (Bank). Same radio-card look as the bill payment choice.
 */
export function StockFundingFields({
  idPrefix,
  value,
  onChange,
  error,
  disabled,
}: {
  idPrefix: string
  value: StockFundingChoice
  onChange: (next: StockFunding) => void
  error?: string | null
  disabled?: boolean
}) {
  const helpId = `${idPrefix}-funding-help`
  return (
    <fieldset className="space-y-3 rounded-lg border bg-muted/20 p-3" disabled={disabled}>
      <legend className="px-1 text-xs font-medium text-muted-foreground">
        How was this stock paid for? <span className="text-destructive" aria-hidden>*</span>
      </legend>
      <div
        role="radiogroup"
        aria-label="How was this stock paid for?"
        aria-required
        aria-invalid={!!error || undefined}
        aria-describedby={helpId}
        className="grid gap-2 sm:grid-cols-3"
      >
        {STOCK_FUNDING_OPTIONS.map((opt) => {
          const active = value === opt.value
          const Icon = ICONS[opt.value]
          return (
            <button
              key={opt.value}
              id={`${idPrefix}-funding-${opt.value}`}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(opt.value)}
              className={cn(
                "flex min-h-11 items-start gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active ? "border-primary bg-primary/5 text-foreground" : "bg-background text-muted-foreground hover:bg-accent",
              )}
            >
              <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", active && "text-primary")} aria-hidden />
              <span>
                <span className="block font-medium text-foreground">{opt.label}</span>
                <span className="block text-xs">{opt.hint}</span>
              </span>
            </button>
          )
        })}
      </div>
      <p id={helpId} className="text-xs text-muted-foreground">
        {stockFundingPostingHint(value)} Bought on a supplier&apos;s bill? Choose the supplier above instead.
      </p>
      <FieldError message={error ?? undefined} />
    </fieldset>
  )
}
