"use client"

import { useState } from "react"
import { Wallet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/hooks/use-toast"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { newIdempotencyKey } from "@/lib/api/idempotency"
import { useCurrency } from "@/lib/contexts/currency-context"
import { useI18n, useTranslations } from "@/lib/i18n/i18n-provider"
import { PAYMENT_METHODS, type Doctor, type DoctorBalance, type PaymentMethod } from "@/features/appointments/api-client"

/** A doctor is paid in cash, to the bank or by wallet; a card payment only ever comes in from patients. */
const PAYOUT_METHODS = PAYMENT_METHODS.filter((m) => m !== "card")
import { PaymentMethodPicker } from "@/features/appointments/components/token-dialogs"
import { useDoctorBalance, useDoctorPayouts, usePayDoctor } from "@/features/appointments/hooks/use-doctors"

/** What the pharmacy owes the doctor from the fees it took, a button to pay it, and past payments. */
export function DoctorMoneyCard({ doctor, canPay }: { doctor: Doctor; canPay: boolean }) {
  const t = useTranslations("appointments")
  const { formatCurrency } = useCurrency()
  const { formatBsDate, formatNumber } = useI18n()
  const balance = useDoctorBalance(doctor.id)
  const payouts = useDoctorPayouts(doctor.id)
  const [paying, setPaying] = useState(false)
  const owed = balance.data?.amountOwed ?? 0

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base">{t("payouts.title")}</CardTitle>
          <CardDescription>{t("payouts.description")}</CardDescription>
        </div>
        {canPay && owed > 0 && (
          <Button size="sm" onClick={() => setPaying(true)}>
            <Wallet className="mr-1 h-4 w-4" /> {t("payouts.pay")}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {balance.isLoading ? (
          <Skeleton className="h-12 w-48" />
        ) : balance.isError ? (
          <p className="text-sm text-destructive">{apiRequestErrorMessage(balance.error)}</p>
        ) : owed > 0 && balance.data ? (
          <div>
            <div className="text-sm text-muted-foreground">{t("payouts.owed")}</div>
            <div className="text-2xl font-semibold tabular-nums">{formatCurrency(owed)}</div>
            <div className="text-sm text-muted-foreground">
              {t("payouts.owedVisits", {
                count: formatNumber(balance.data.visitCount),
                date: balance.data.oldestVisitDate ? formatBsDate(balance.data.oldestVisitDate) : "",
              })}
              {" · "}
              {t("payouts.feesTaken", { amount: formatCurrency(balance.data.feesCollected) })}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("payouts.nothingOwed")}</p>
        )}

        <div>
          <h3 className="mb-1 text-sm font-medium">{t("payouts.history")}</h3>
          {(payouts.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("payouts.noHistory")}</p>
          ) : (
            <ul className="divide-y text-sm">
              {(payouts.data ?? []).map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    {formatBsDate(p.paidAtUtc)} · {t(`methods.${p.paymentMethod as PaymentMethod}`)}
                    {p.paidBy && <span className="text-muted-foreground"> · {t("payouts.by", { name: p.paidBy })}</span>}
                    {p.note && <span className="text-muted-foreground"> · {p.note}</span>}
                  </span>
                  <span className="font-medium tabular-nums">{formatCurrency(p.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
      {paying && balance.data && <PayDoctorDialog doctor={doctor} balance={balance.data} onClose={() => setPaying(false)} />}
    </Card>
  )
}

function PayDoctorDialog({ doctor, balance, onClose }: { doctor: Doctor; balance: DoctorBalance; onClose: () => void }) {
  const t = useTranslations("appointments")
  const { toast } = useToast()
  const { formatCurrency } = useCurrency()
  const { formatNumber } = useI18n()
  const pay = usePayDoctor()
  const [method, setMethod] = useState<PaymentMethod>("cash")
  const [note, setNote] = useState("")
  const [idempotencyKey] = useState(() => newIdempotencyKey())
  const amount = formatCurrency(balance.amountOwed)

  const submit = () =>
    pay.mutate(
      { doctorId: doctor.id, paymentMethod: method, note, idempotencyKey },
      {
        onSuccess: () => {
          toast({ title: t("payouts.paid") })
          onClose()
        },
        onError: (error) => toast({ title: t("payouts.failed"), description: apiRequestErrorMessage(error), variant: "destructive" }),
      },
    )

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("payouts.payTitle", { name: doctor.name })}</DialogTitle>
          <DialogDescription>
            {t("payouts.payDescription", { amount, count: formatNumber(balance.visitCount) })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="pay-method">{t("payouts.method")}</Label>
            <PaymentMethodPicker id="pay-method" value={method} onChange={setMethod} methods={PAYOUT_METHODS} />
            {method === "cash" && <p className="text-xs text-muted-foreground">{t("payouts.payFromCash")}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pay-note">{t("payouts.note")}</Label>
            <Input id="pay-note" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("form.cancel")}
          </Button>
          <Button onClick={submit} disabled={pay.isPending}>
            {t("payouts.submit", { amount })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
