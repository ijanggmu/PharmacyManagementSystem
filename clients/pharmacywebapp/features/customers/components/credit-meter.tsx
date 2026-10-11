"use client"

import { CurrencyDisplay } from "@/components/currency-display"
import { cn } from "@/lib/utils"

interface CreditMeterProps {
  /** What the customer owes (positive) or has in advance (negative). */
  balance: number
  /** Null = no limit. */
  creditLimit: number | null | undefined
  className?: string
  /** Compact: one line plus the bar, for tables. */
  compact?: boolean
}

/** Share of the credit limit in use: under 70% calm, 70–100% amber, over the limit red. */
export function creditUsage(balance: number, creditLimit: number | null | undefined): { percent: number; tone: "ok" | "warn" | "over" } | null {
  if (creditLimit == null) return null
  if (creditLimit <= 0) return { percent: balance > 0 ? 100 : 0, tone: balance > 0 ? "over" : "ok" }
  const percent = Math.max(0, (balance / creditLimit) * 100)
  return { percent, tone: percent > 100 ? "over" : percent >= 70 ? "warn" : "ok" }
}

/**
 * Balance owed against the credit limit. The bar shows how much of the limit is used; the label
 * says it in words too ("Over limit", "Rs 2,000 left"), so the state never relies on color alone.
 */
export function CreditMeter({ balance, creditLimit, className, compact }: CreditMeterProps) {
  const usage = creditUsage(balance, creditLimit)
  const available = creditLimit != null ? creditLimit - balance : null

  return (
    <div className={cn("min-w-0", className)}>
      <div className={cn("flex items-baseline justify-between gap-2", compact ? "text-sm" : "text-base")}>
        <span className={cn("num font-semibold", balance > 0 ? "text-foreground" : "text-muted-foreground")}>
          <CurrencyDisplay amount={balance} />
        </span>
        {creditLimit != null && (
          <span className="num text-xs text-muted-foreground">
            of <CurrencyDisplay amount={creditLimit} />
          </span>
        )}
      </div>
      {usage && (
        <>
          <div
            className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted"
            role="meter"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(Math.min(usage.percent, 100))}
            aria-label="Credit limit used"
          >
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-300 ease-out motion-reduce:transition-none",
                usage.tone === "ok" && "bg-primary",
                usage.tone === "warn" && "bg-warning",
                usage.tone === "over" && "bg-destructive",
              )}
              style={{ width: `${Math.min(usage.percent, 100)}%` }}
            />
          </div>
          {!compact && available !== null && (
            <p className={cn("mt-1 text-xs", usage.tone === "over" ? "font-medium text-destructive" : "text-muted-foreground")}>
              {available < 0 ? (
                <>
                  Over limit by <CurrencyDisplay amount={-available} />
                </>
              ) : (
                <>
                  <CurrencyDisplay amount={available} /> credit left
                </>
              )}
            </p>
          )}
          {compact && usage.tone === "over" && <p className="mt-0.5 text-[11px] font-medium text-destructive">Over limit</p>}
        </>
      )}
      {!usage && !compact && <p className="mt-1 text-xs text-muted-foreground">No credit limit</p>}
    </div>
  )
}
