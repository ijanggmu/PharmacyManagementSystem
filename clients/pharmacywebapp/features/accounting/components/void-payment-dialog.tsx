"use client"

import { useEffect, useState } from "react"
import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { FieldError } from "@/components/ui/field-error"
import { CurrencyDisplay } from "@/components/currency-display"
import { useToast } from "@/hooks/use-toast"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { useVoidPartyPayment } from "@/features/accounting/hooks/use-payment-parties"
import type { PaymentKind } from "@/features/accounting/lib/payment-form"
import { VOID_REASON_MAX, voidReasonError } from "@/features/accounting/lib/payment-void"

/** The payment row being voided. */
export interface VoidPaymentTarget {
  id: string
  /** RCP-… / bill number shown in the title; null when the payment has none. */
  documentNumber: string | null
  amount: number
  date: string
}

export interface VoidPaymentDialogProps {
  kind: PaymentKind
  partyId: string
  /** Null closes the dialog. */
  payment: VoidPaymentTarget | null
  onClose: () => void
  onVoided?: () => void
}

/**
 * Reason dialog for voiding a customer receipt or supplier payment. The payment stays on the ledger, flagged
 * voided, with a reversing entry; Accounting reverses its GL voucher dated today (the first open day if today is
 * in a locked period).
 */
export function VoidPaymentDialog({ kind, partyId, payment, onClose, onVoided }: VoidPaymentDialogProps) {
  const { toast } = useToast()
  const voidPayment = useVoidPartyPayment()
  const [reason, setReason] = useState("")
  const [reasonError, setReasonError] = useState<string | undefined>()
  // One key per payment the dialog opens for, reused when the same void is retried.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID())
  const busy = voidPayment.isPending
  const noun = kind === "receipt" ? "receipt" : "payment"

  useEffect(() => {
    if (!payment) return
    setReason("")
    setReasonError(undefined)
    setIdempotencyKey(crypto.randomUUID())
  }, [payment])

  const close = () => {
    if (!busy) onClose()
  }

  const confirm = async () => {
    if (!payment) return
    const error = voidReasonError(reason)
    if (error) {
      setReasonError(error)
      return
    }
    try {
      await voidPayment.mutateAsync({ kind, partyId, paymentId: payment.id, reason: reason.trim(), idempotencyKey })
      toast({
        title: kind === "receipt" ? "Receipt voided" : "Payment voided",
        description: `${payment.documentNumber ?? "The " + noun} was reversed on the ledger and in the GL.`,
      })
      onClose()
      onVoided?.()
    } catch (e) {
      toast({ title: "Void failed", description: apiRequestErrorMessage(e), variant: "destructive" })
    }
  }

  return (
    <Dialog open={!!payment} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-md" showCloseButton={!busy}>
        <DialogHeader className="text-left">
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden />
            Void {noun}
            {payment?.documentNumber ? ` ${payment.documentNumber}` : ""}?
          </DialogTitle>
          <DialogDescription>
            {payment && (
              <>
                The <CurrencyDisplay amount={payment.amount} /> {noun} of {payment.date} stays on the ledger marked
                voided, and a reversing entry puts the amount back on the{" "}
                {kind === "receipt" ? "customer's balance" : "supplier's balance (the bill it paid is open again)"}. Its
                GL voucher is reversed today. This cannot be undone.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault()
            void confirm()
          }}
        >
          <Label htmlFor="void-payment-reason">
            Reason <span className="text-destructive" aria-hidden>*</span>
          </Label>
          <Textarea
            id="void-payment-reason"
            value={reason}
            onChange={(e) => {
              setReason(e.target.value)
              if (reasonError) setReasonError(undefined)
            }}
            rows={3}
            maxLength={VOID_REASON_MAX}
            placeholder={kind === "receipt" ? "e.g. Keyed twice; same receipt as RCP-…" : "e.g. Paid to the wrong supplier"}
            aria-invalid={!!reasonError}
            aria-describedby={reasonError ? "void-payment-reason-error" : undefined}
            disabled={busy}
          />
          <div id="void-payment-reason-error">
            <FieldError message={reasonError} />
          </div>
          <DialogFooter className="gap-2 pt-2">
            <Button type="button" variant="outline" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" loading={busy}>
              Void {noun}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
