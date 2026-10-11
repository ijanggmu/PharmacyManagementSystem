"use client"

import { Banknote, CreditCard } from "lucide-react"
import { CurrencyDisplay } from "@/components/currency-display"
import { DatePicker } from "@/components/ui/date-picker"
import { FieldError } from "@/components/ui/field-error"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { PARTY_PAYMENT_METHODS, paymentMethodAccount, type PartyPaymentMethod } from "@/features/accounting/lib/payment-methods"
import type { BillPaymentState } from "@/features/medicines/lib/bill-payment"

/**
 * "On credit / Paid now" for one supplier bill. Paid now records a payment against the bill when it is
 * saved (Dr Accounts Payable / Cr Cash or Bank), so the bill shows as paid in Payables.
 */
export function BillPaymentFields({
  idPrefix,
  value,
  onChange,
  total,
  receiptDate,
  error,
  disabled,
}: {
  idPrefix: string
  value: BillPaymentState
  onChange: (next: BillPaymentState) => void
  /** Bill total including VAT. */
  total: number
  /** Default payment date. */
  receiptDate?: string
  error?: string | null
  disabled?: boolean
}) {
  const set = (patch: Partial<BillPaymentState>) => onChange({ ...value, ...patch })
  const account = paymentMethodAccount(value.method)

  return (
    <fieldset className="space-y-3 rounded-lg border bg-muted/20 p-3" disabled={disabled}>
      <legend className="px-1 text-xs font-medium text-muted-foreground">Payment</legend>
      <div role="radiogroup" aria-label="Payment status" className="grid grid-cols-2 gap-2">
        {[
          { paid: false, label: "On credit", hint: "Pay later from Payables", icon: CreditCard },
          { paid: true, label: "Paid now", hint: "Record the payment with the bill", icon: Banknote },
        ].map((opt) => {
          const active = value.paid === opt.paid
          return (
            <button
              key={opt.label}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => set({ paid: opt.paid })}
              className={cn(
                "flex min-h-11 items-start gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active ? "border-primary bg-primary/5 text-foreground" : "bg-background text-muted-foreground hover:bg-accent",
              )}
            >
              <opt.icon className={cn("mt-0.5 h-4 w-4 shrink-0", active && "text-primary")} aria-hidden />
              <span>
                <span className="block font-medium text-foreground">{opt.label}</span>
                <span className="block text-xs">{opt.hint}</span>
              </span>
            </button>
          )
        })}
      </div>

      {value.paid && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-pay-method`} className="text-xs">
              Paid by <span className="text-destructive" aria-hidden>*</span>
            </Label>
            <Select value={value.method} onValueChange={(v) => set({ method: v as PartyPaymentMethod })}>
              <SelectTrigger id={`${idPrefix}-pay-method`} className="w-full" aria-describedby={`${idPrefix}-pay-method-help`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PARTY_PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p id={`${idPrefix}-pay-method-help`} className="text-xs text-muted-foreground">
              Posts to {account.name} ({account.code}).
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-pay-amount`} className="text-xs">
              Amount paid
            </Label>
            <Input
              id={`${idPrefix}-pay-amount`}
              inputMode="decimal"
              autoComplete="off"
              className="num text-right"
              placeholder={total > 0 ? total.toFixed(2) : "0.00"}
              value={value.amount}
              onChange={(e) => set({ amount: e.target.value })}
              aria-invalid={!!error || undefined}
              aria-describedby={`${idPrefix}-pay-amount-help`}
            />
            <p id={`${idPrefix}-pay-amount-help`} className="text-xs text-muted-foreground">
              Bill total <CurrencyDisplay amount={total} />. Leave blank to pay it in full.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-pay-ref`} className="text-xs">
              Reference
            </Label>
            <Input
              id={`${idPrefix}-pay-ref`}
              value={value.reference}
              onChange={(e) => set({ reference: e.target.value })}
              placeholder="Cheque / transfer no."
              maxLength={100}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-pay-date`} className="text-xs">
              Payment date
            </Label>
            <DatePicker
              id={`${idPrefix}-pay-date`}
              value={value.date || receiptDate || ""}
              onChange={(d) => set({ date: d })}
            />
          </div>
        </div>
      )}
      <FieldError message={error ?? undefined} />
    </fieldset>
  )
}
