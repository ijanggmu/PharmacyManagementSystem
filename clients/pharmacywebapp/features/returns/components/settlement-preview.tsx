"use client"

import { useQuery } from "@tanstack/react-query"
import { Banknote, CreditCard, UserRound } from "lucide-react"
import { CurrencyDisplay } from "@/components/currency-display"
import { getReversalPreviewOnDotnet, type ReversalPreview, type ReversalSettlement } from "@/lib/api/sales-api"
import { useDebounce } from "@/lib/utils/performance"
import { cn } from "@/lib/utils"

/** The select's legacy "original" value is the API's original_payment. */
export function toApiRefundMethod(method: string): string {
  return method === "original" ? "original_payment" : method
}

/**
 * How a return/refund of `amount` would be paid back, from the server (the on-account part depends on
 * what the sale still owes, which only the server knows). Debounced so typing quantities doesn't spam it.
 */
export function useReversalPreview(saleId: string | null | undefined, amount: number, refundMethod: string) {
  const rounded = Math.round(Math.max(0, amount) * 100) / 100
  const debouncedAmount = useDebounce(rounded, 300)
  const method = toApiRefundMethod(refundMethod)
  return useQuery<ReversalPreview>({
    queryKey: ["sales", saleId, "reversal-preview", debouncedAmount, method],
    queryFn: () => getReversalPreviewOnDotnet(saleId as string, debouncedAmount, method),
    enabled: !!saleId && debouncedAmount > 0,
    retry: false,
    staleTime: 0,
  })
}

interface SettlementBreakdownProps {
  settlement: ReversalSettlement | null | undefined
  isLoading?: boolean
  error?: unknown
  className?: string
}

/** "Hand back Rs X cash / Rs Y to bank / credited Rs Z to the customer's account" before submitting. */
export function SettlementBreakdown({ settlement, isLoading, error, className }: SettlementBreakdownProps) {
  if (error) {
    return (
      <p className={cn("text-sm text-destructive", className)} role="alert">
        {error instanceof Error ? error.message : "Could not work out how the money goes back."}
      </p>
    )
  }
  if (!settlement) {
    return isLoading ? (
      <p className={cn("text-xs text-muted-foreground", className)}>Working out how the money goes back…</p>
    ) : null
  }
  const rows: { key: string; label: string; amount: number; icon: typeof Banknote }[] = [
    { key: "cash", label: "Hand back in cash", amount: settlement.cash, icon: Banknote },
    { key: "bank", label: "Back to card / bank / wallet", amount: settlement.bank, icon: CreditCard },
    { key: "on_account", label: "Credited to customer's account", amount: settlement.on_account, icon: UserRound },
  ]
  const shown = rows.filter((r) => r.amount > 0)
  if (shown.length === 0) return null
  return (
    <ul className={cn("space-y-1 text-sm", className)} aria-label="How the money goes back" aria-live="polite">
      {shown.map(({ key, label, amount, icon: Icon }) => (
        <li key={key} className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {label}
          </span>
          <CurrencyDisplay amount={amount.toFixed(2)} className="num font-medium text-foreground" />
        </li>
      ))}
    </ul>
  )
}
