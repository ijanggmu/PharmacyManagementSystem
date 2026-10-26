"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { newIdempotencyKey } from "@/lib/api/idempotency"
import { useCurrency } from "@/lib/contexts/currency-context"
import { useTranslations } from "@/lib/i18n/i18n-provider"
import { PAYMENT_METHODS, type Appointment, type PaymentMethod } from "@/features/appointments/api-client"
import { useCancelAppointment, useDoctor, useMarkArrived } from "@/features/appointments/hooks/use-doctors"
import { previewDoctorShare } from "@/features/appointments/lib/timetable"

/** Picks how money was paid; one tap per method, cash first. */
export function PaymentMethodPicker({
  value,
  onChange,
  id,
  methods = PAYMENT_METHODS,
}: {
  value: PaymentMethod
  onChange: (m: PaymentMethod) => void
  id: string
  methods?: readonly PaymentMethod[]
}) {
  const t = useTranslations("appointments")
  return (
    <div id={id} role="radiogroup" className="flex flex-wrap gap-2">
      {methods.map((m) => (
        <Button key={m} type="button" role="radio" aria-checked={value === m} size="sm" variant={value === m ? "default" : "outline"} onClick={() => onChange(m)}>
          {t(`methods.${m}`)}
        </Button>
      ))}
    </div>
  )
}

/** The patient came: take the fee (the doctor's usual fee, changeable; 0 = free) and mark them arrived. */
export function ArriveDialog({ appointment, fee, onClose }: { appointment: Appointment; fee: number; onClose: () => void }) {
  const t = useTranslations("appointments")
  const { toast } = useToast()
  const { formatCurrency } = useCurrency()
  const doctor = useDoctor(appointment.doctorId)
  const arrive = useMarkArrived()
  const [amount, setAmount] = useState(fee)
  const [method, setMethod] = useState<PaymentMethod>("cash")
  const [idempotencyKey] = useState(() => newIdempotencyKey())
  const free = !(amount > 0)
  const share = doctor.data ? previewDoctorShare(amount, doctor.data.shareType, doctor.data.shareValue) : null

  const submit = () =>
    arrive.mutate(
      { id: appointment.id, fee: free ? 0 : amount, paymentMethod: method, idempotencyKey },
      {
        onSuccess: () => {
          toast({ title: t("desk.changed") })
          onClose()
        },
        onError: (error) => toast({ title: t("desk.failed"), description: apiRequestErrorMessage(error), variant: "destructive" }),
      },
    )

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("arrive.title")} · {t("desk.token")} {appointment.tokenNo}
          </DialogTitle>
          <DialogDescription>
            {appointment.patientName} — {t("arrive.description")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="arrive-fee">{t("arrive.fee")}</Label>
            <Input
              id="arrive-fee"
              type="number"
              inputMode="decimal"
              min={0}
              value={Number.isFinite(amount) ? amount : ""}
              onChange={(e) => setAmount(e.target.value === "" ? 0 : Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">{t("arrive.feeHint")}</p>
          </div>
          {!free && (
            <div className="space-y-1.5">
              <Label htmlFor="arrive-method">{t("arrive.method")}</Label>
              <PaymentMethodPicker id="arrive-method" value={method} onChange={setMethod} />
            </div>
          )}
          {!free && share != null && (
            <p className="text-sm text-muted-foreground">{t("arrive.doctorGets", { amount: formatCurrency(share) })}</p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("form.cancel")}
          </Button>
          <Button onClick={submit} disabled={amount < 0 || arrive.isPending}>
            {free ? t("arrive.submitFree") : t("arrive.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Cancels a token with a reason; says plainly when a taken fee will be given back. */
export function CancelTokenDialog({ appointment, onClose }: { appointment: Appointment; onClose: () => void }) {
  const t = useTranslations("appointments")
  const { toast } = useToast()
  const { formatCurrency } = useCurrency()
  const cancel = useCancelAppointment()
  const [reason, setReason] = useState("")
  const [idempotencyKey] = useState(() => newIdempotencyKey())
  const feeTaken = appointment.feePaidAtUtc != null && appointment.feeRefundedAtUtc == null && (appointment.feeAmount ?? 0) > 0

  const submit = () =>
    cancel.mutate(
      { id: appointment.id, reason, idempotencyKey },
      {
        onSuccess: () => {
          toast({ title: t("desk.changed") })
          onClose()
        },
        onError: (error) => toast({ title: t("desk.failed"), description: apiRequestErrorMessage(error), variant: "destructive" }),
      },
    )

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("cancelDialog.title")}</DialogTitle>
          <DialogDescription>
            {t("desk.token")} {appointment.tokenNo} · {appointment.patientName}. {t("cancelDialog.description")}
          </DialogDescription>
        </DialogHeader>
        {feeTaken && (
          <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            {t("cancelDialog.refund", {
              amount: formatCurrency(appointment.feeAmount ?? 0),
              method: appointment.paymentMethod ? t(`methods.${appointment.paymentMethod as PaymentMethod}`) : "",
            })}
          </p>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="cancel-reason">{t("cancelDialog.reason")}</Label>
          <Textarea
            id="cancel-reason"
            maxLength={256}
            placeholder={t("cancelDialog.reasonPlaceholder")}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("cancelDialog.keep")}
          </Button>
          <Button variant="destructive" onClick={submit} disabled={reason.trim() === "" || cancel.isPending}>
            {t("cancelDialog.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
