"use client"

/**
 * "Record VAT payment" dialog (Accounting › Tax & IRD › VAT return). Posts Dr VAT Payable / Cr Cash or Bank
 * through POST /accounting/vat/payments. The VAT return treats these as settlements and leaves them out,
 * so paying last period's VAT never lowers this period's output VAT.
 */

import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
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
import { formatLocalDateYmd } from "@/lib/utils/date"
import { accountingApi } from "@/features/accounting/api-client"
import { ACCOUNTING_ROOT_KEY } from "@/features/accounting/hooks/use-vouchers"
import { PARTY_PAYMENT_METHODS, paymentMethodAccount, type PartyPaymentMethod } from "@/features/accounting/lib/payment-methods"
import { hasVatPaymentErrors, validateVatPaymentForm } from "@/features/accounting/lib/vat-payment-form"

interface RecordVatPaymentVars {
  payment_date: string
  amount: number
  payment_method: PartyPaymentMethod
  reference: string
}

export interface RecordVatPaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Pre-filled amount, e.g. the net VAT payable shown on the return. */
  suggestedAmount?: number | null
}

export function RecordVatPaymentDialog({ open, onOpenChange, suggestedAmount }: RecordVatPaymentDialogProps) {
  const { toast } = useToast()
  const qc = useQueryClient()
  // Mounted fresh each time it opens (the caller renders it only while open), so initial state is the reset.
  const [amount, setAmount] = useState(() => (suggestedAmount && suggestedAmount > 0 ? suggestedAmount.toFixed(2) : ""))
  const [date, setDate] = useState(() => formatLocalDateYmd(new Date()))
  const [method, setMethod] = useState<PartyPaymentMethod>("bank")
  const [reference, setReference] = useState("")
  const [touched, setTouched] = useState(false)

  // Per-call data travels through mutate(vars), never through closed-over state.
  const record = useMutation({
    mutationFn: (v: RecordVatPaymentVars) => accountingApi.recordVatPayment(v),
    onSuccess: () => qc.invalidateQueries({ queryKey: ACCOUNTING_ROOT_KEY }),
  })

  const busy = record.isPending
  const errors = validateVatPaymentForm({ amount, date, reference })
  const show = (message?: string) => (touched ? message : undefined)

  const changeOpen = (next: boolean) => {
    if (busy) return
    onOpenChange(next)
  }

  const submit = () => {
    setTouched(true)
    if (hasVatPaymentErrors(errors)) return
    record.mutate(
      { payment_date: date, amount: Number(amount), payment_method: method, reference: reference.trim() },
      {
        onSuccess: () => {
          toast({ title: "VAT payment recorded", description: "Posted Dr VAT payable / Cr " + paymentMethodAccount(method).name + "." })
          onOpenChange(false)
        },
        onError: (e) => toast({ title: "Couldn't record the VAT payment", description: apiRequestErrorMessage(e), variant: "destructive" }),
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="sm:max-w-md" showCloseButton={!busy}>
        <DialogHeader className="text-left">
          <DialogTitle className="flex items-center gap-2">
            <Landmark className="h-4 w-4 text-primary" aria-hidden />
            Record VAT payment
          </DialogTitle>
          <DialogDescription>
            VAT paid to IRD. It settles VAT payable and is not counted in any period&apos;s VAT return.
          </DialogDescription>
        </DialogHeader>

        <form
          id="record-vat-payment-form"
          className="grid gap-4 sm:grid-cols-2"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="vat-payment-amount">
              Amount <span className="text-destructive" aria-hidden>*</span>
            </Label>
            <Input
              id="vat-payment-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={busy}
              aria-invalid={!!show(errors.amount) || undefined}
              aria-describedby="vat-payment-amount-error"
            />
            <div id="vat-payment-amount-error">
              <FieldError message={show(errors.amount)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="vat-payment-date">
              Payment date <span className="text-destructive" aria-hidden>*</span>
            </Label>
            <DatePicker
              id="vat-payment-date"
              value={date}
              onChange={setDate}
              disabled={busy}
              aria-invalid={!!show(errors.date) || undefined}
              aria-describedby="vat-payment-date-error"
            />
            <div id="vat-payment-date-error">
              <FieldError message={show(errors.date)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="vat-payment-method">Paid by</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as PartyPaymentMethod)} disabled={busy}>
              <SelectTrigger id="vat-payment-method" className="w-full" aria-describedby="vat-payment-method-help">
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
            <p id="vat-payment-method-help" className="text-xs text-muted-foreground">
              Credits {paymentMethodAccount(method).name} ({paymentMethodAccount(method).code}).
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="vat-payment-reference">IRD voucher / reference</Label>
            <Input
              id="vat-payment-reference"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Optional"
              disabled={busy}
              aria-invalid={!!show(errors.reference) || undefined}
              aria-describedby="vat-payment-reference-error"
            />
            <div id="vat-payment-reference-error">
              <FieldError message={show(errors.reference)} />
            </div>
          </div>
        </form>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => changeOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form="record-vat-payment-form" loading={busy} loadingText="Posting…">
            Record payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
