"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FieldError } from "@/components/ui/field-error"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { nepalYmdOf } from "@/lib/utils/nepal-time"
import { useAccountingMoney } from "@/features/accounting/hooks/use-accounting-money"
import { useChequeAction } from "@/features/accounting/hooks/use-cheques"
import { clearancePostingText, type ChequeActionDef, type ChequeRow } from "@/features/accounting/lib/cheques"
import { VOID_REASON_MIN, voidReasonError } from "@/features/accounting/lib/payment-void"

export interface BankAccountOption {
  id: string
  code: string
  name: string
}

export interface ChequeActionDialogProps {
  /** Null closes the dialog. */
  target: { cheque: ChequeRow; def: ChequeActionDef } | null
  bankAccounts: readonly BankAccountOption[]
  /** Bank account to start with when the cheque has none yet (the "cheque" payment account). */
  defaultBankAccountId: string
  onClose: () => void
}

const REASON_MAX = 400

/**
 * Deposit / clear / bounce / cancel one cheque. Deposit and clear take a date and the bank account; a clearance of a
 * post-dated cheque posts a contra voucher (refused in a locked period). Bounce and cancel take a reason and void
 * the receipt / payment the cheque settled.
 */
export function ChequeActionDialog({ target, bankAccounts, defaultBankAccountId, onClose }: ChequeActionDialogProps) {
  const { toast } = useToast()
  const { money } = useAccountingMoney()
  const run = useChequeAction()
  const [date, setDate] = useState("")
  const [bankAccountId, setBankAccountId] = useState("")
  const [note, setNote] = useState("")
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | undefined>()
  // One key per opened action; the same action retried after an error reuses it.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID())
  const busy = run.isPending

  const cheque = target?.cheque
  const def = target?.def
  const datedAction = def?.action === "deposit" || def?.action === "clear"
  const today = nepalYmdOf(new Date())

  useEffect(() => {
    if (!target) return
    const c = target.cheque
    setDate(today)
    setBankAccountId(c.bank_account_id ?? defaultBankAccountId)
    setNote("")
    setReason("")
    setError(undefined)
    setIdempotencyKey(crypto.randomUUID())
  }, [target, defaultBankAccountId, today])

  const minDate = useMemo(() => {
    if (!cheque || !def) return undefined
    if (def.action !== "clear") return cheque.payment_date
    // Not before the payment, the date on the cheque, or its deposit.
    return [cheque.cheque_date, cheque.deposited_date ?? ""].reduce((a, b) => (b > a ? b : a), cheque.payment_date)
  }, [cheque, def])

  const close = () => {
    if (!busy) onClose()
  }

  const submit = () => {
    if (!cheque || !def) return
    if (datedAction) {
      if (!date) return setError("Pick the date")
      if (minDate && date < minDate) {
        return setError(def.action === "clear" && date < cheque.cheque_date ? "A cheque can't clear before the date written on it" : `The date can't be before ${minDate}`)
      }
    } else {
      const reasonError = voidReasonError(reason)
      if (reasonError) return setError(reasonError)
    }
    run.mutate(
      { action: def.action, id: cheque.id, date, bankAccountId: bankAccountId || null, note, reason: reason.trim(), idempotencyKey },
      {
        onSuccess: (row) => {
          toast({
            title: `Cheque ${row.cheque_number}: ${def.label.toLowerCase()}`,
            description: def.voidsPayment
              ? `The ${row.direction === "received" ? "receipt" : "payment"} of ${money(row.amount)} was voided; ${row.party_name}'s balance is back.`
              : `${row.party_name} · ${money(row.amount)}`,
          })
          onClose()
        },
        onError: (e) => toast({ title: `${def.label} failed`, description: apiRequestErrorMessage(e), variant: "destructive" }),
      },
    )
  }

  const received = cheque?.direction === "received"
  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-md" showCloseButton={!busy}>
        <DialogHeader className="text-left">
          <DialogTitle className="flex items-center gap-2">
            {def?.voidsPayment && <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden />}
            {def?.label} — cheque {cheque?.cheque_number}
          </DialogTitle>
          <DialogDescription>
            {cheque && def && (
              <>
                {money(cheque.amount)} {received ? "from" : "to"} {cheque.party_name}
                {cheque.bank_name ? ` · ${cheque.bank_name}` : ""} · dated {cheque.cheque_date}.{" "}
                {def.action === "deposit" &&
                  (received
                    ? "Nothing is posted yet: the money counts as in the bank only once the cheque clears."
                    : "Nothing is posted yet: the money leaves the bank when the cheque clears.")}
                {def.action === "clear" && clearancePostingText(cheque)}
                {def.action === "bounce" &&
                  `The ${received ? "receipt" : "payment"} is voided: ${
                    received ? "the customer owes the amount again" : "the supplier is owed the amount again (the bill re-opens)"
                  } and its voucher is reversed today.${
                    cheque.status === "cleared" && !cheque.posted_to_bank ? " The clearance voucher is reversed too, taking the amount back out of the bank." : ""
                  }`}
                {def.action === "cancel" &&
                  `The cheque never reached the bank. The ${received ? "receipt" : "payment"} is voided and its voucher reversed today.`}
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          {datedAction ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="cheque-action-date">
                  {def?.action === "clear" ? "Cleared on" : received ? "Deposited on" : "Presented on"}
                </Label>
                <DatePicker
                  id="cheque-action-date"
                  value={date}
                  onChange={(v) => {
                    setDate(v)
                    setError(undefined)
                  }}
                  min={minDate}
                  disabled={busy}
                  aria-invalid={!!error || undefined}
                  aria-describedby="cheque-action-error"
                />
              </div>
              {bankAccounts.length > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="cheque-action-bank">{received ? "Bank account" : "Drawn on"}</Label>
                  <Select value={bankAccountId} onValueChange={setBankAccountId} disabled={busy}>
                    <SelectTrigger id="cheque-action-bank" className="w-full">
                      <SelectValue placeholder="Bank account" />
                    </SelectTrigger>
                    <SelectContent>
                      {bankAccounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.code} · {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="cheque-action-note">Note</Label>
                <Input
                  id="cheque-action-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={def?.action === "deposit" ? "e.g. Deposit slip no." : "Optional"}
                  maxLength={500}
                  disabled={busy}
                />
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="cheque-action-reason">
                Reason <span className="text-destructive" aria-hidden>*</span>
              </Label>
              <Textarea
                id="cheque-action-reason"
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value)
                  setError(undefined)
                }}
                rows={3}
                maxLength={REASON_MAX}
                minLength={VOID_REASON_MIN}
                placeholder={def?.action === "bounce" ? "e.g. Insufficient funds (bank memo 1234)" : "e.g. Returned to the customer"}
                aria-invalid={!!error || undefined}
                aria-describedby="cheque-action-error"
                disabled={busy}
              />
            </div>
          )}
          <div id="cheque-action-error">
            <FieldError message={error} />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={close} disabled={busy}>
              Close
            </Button>
            <Button type="submit" variant={def?.voidsPayment ? "destructive" : "default"} loading={busy}>
              {def?.label}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
