"use client"

/**
 * "Record TDS payment" dialog (Accounting › Tax & IRD › TDS). Posts Dr TDS Payable / Cr Cash or Bank through
 * POST /accounting/tds/payments. The API refuses a deposit larger than the TDS payable on the payment date, and a
 * date in a locked period.
 */

import { useRef, useState } from "react"
import { Landmark } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FieldError } from "@/components/ui/field-error"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { createIdempotencyKeyTracker } from "@/lib/api/idempotency"
import { formatLocalDateYmd } from "@/lib/utils/date"
import { useRecordTdsPayment } from "@/features/accounting/hooks/use-tds"
import { usePaymentAccountFor } from "@/features/accounting/hooks/use-payment-accounts"
import { PARTY_PAYMENT_METHODS, type PartyPaymentMethod } from "@/features/accounting/lib/payment-methods"
import { hasVatPaymentErrors, validateVatPaymentForm } from "@/features/accounting/lib/vat-payment-form"

export interface RecordTdsPaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Pre-filled amount, e.g. the TDS payable at the period end. */
  suggestedAmount?: number | null
}

export function RecordTdsPaymentDialog({ open, onOpenChange, suggestedAmount }: RecordTdsPaymentDialogProps) {
  const { toast } = useToast()
  // Mounted fresh each time it opens (the caller renders it only while open), so initial state is the reset.
  const [amount, setAmount] = useState(() => (suggestedAmount && suggestedAmount > 0 ? suggestedAmount.toFixed(2) : ""))
  const [date, setDate] = useState(() => formatLocalDateYmd(new Date()))
  const [method, setMethod] = useState<PartyPaymentMethod>("bank")
  const methodAccount = usePaymentAccountFor(method)
  const [reference, setReference] = useState("")
  const [touched, setTouched] = useState(false)
  const paymentKeys = useRef(createIdempotencyKeyTracker())
  const record = useRecordTdsPayment()

  const busy = record.isPending
  // Same rules as a VAT payment: a positive amount with at most 2 decimals, a date, a short reference.
  const errors = validateVatPaymentForm({ amount, date, reference })
  const show = (message?: string) => (touched ? message : undefined)

  const submit = () => {
    setTouched(true)
    if (hasVatPaymentErrors(errors)) return
    const payment = { payment_date: date, amount: Number(amount), payment_method: method, reference: reference.trim() }
    // Per-call data travels through mutate(vars); the key is reused when the same payment is retried.
    record.mutate(
      { ...payment, idempotency_key: paymentKeys.current.keyFor(JSON.stringify(payment)) },
      {
        onSuccess: (_data, vars) => {
          paymentKeys.current.reset()
          toast({ title: "TDS payment recorded", description: `Posted Dr TDS payable / Cr the ${vars.payment_method} payment account.` })
          onOpenChange(false)
        },
        onError: (e) => toast({ title: "Couldn't record the TDS payment", description: apiRequestErrorMessage(e), variant: "destructive" }),
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md" showCloseButton={!busy}>
        <DialogHeader className="text-left">
          <DialogTitle className="flex items-center gap-2">
            <Landmark className="h-4 w-4 text-primary" aria-hidden />
            Record TDS payment
          </DialogTitle>
          <DialogDescription>TDS deposited with IRD. It settles TDS payable; it can&apos;t be more than what is payable.</DialogDescription>
        </DialogHeader>

        <form
          id="record-tds-payment-form"
          className="grid gap-4 sm:grid-cols-2"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="tds-payment-amount">
              Amount <span className="text-destructive" aria-hidden>*</span>
            </Label>
            <Input
              id="tds-payment-amount"
              inputMode="decimal"
              className="num text-right"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={busy}
              aria-invalid={!!show(errors.amount) || undefined}
              aria-describedby="tds-payment-amount-error"
            />
            <div id="tds-payment-amount-error">
              <FieldError message={show(errors.amount)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tds-payment-date">
              Payment date <span className="text-destructive" aria-hidden>*</span>
            </Label>
            <DatePicker
              id="tds-payment-date"
              value={date}
              onChange={setDate}
              disabled={busy}
              aria-invalid={!!show(errors.date) || undefined}
              aria-describedby="tds-payment-date-error"
            />
            <div id="tds-payment-date-error">
              <FieldError message={show(errors.date)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tds-payment-method">Paid by</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as PartyPaymentMethod)} disabled={busy}>
              <SelectTrigger id="tds-payment-method" className="w-full" aria-describedby="tds-payment-method-help">
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
            <p id="tds-payment-method-help" className="text-xs text-muted-foreground">
              Credits {methodAccount.name} ({methodAccount.code}).
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tds-payment-reference">IRD voucher / reference</Label>
            <Input
              id="tds-payment-reference"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Optional"
              disabled={busy}
              aria-invalid={!!show(errors.reference) || undefined}
              aria-describedby="tds-payment-reference-error"
            />
            <div id="tds-payment-reference-error">
              <FieldError message={show(errors.reference)} />
            </div>
          </div>
        </form>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form="record-tds-payment-form" loading={busy} loadingText="Posting…">
            Record payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
