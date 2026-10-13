"use client"

import { CheckCircle2, CircleAlert, CircleMinus, HandCoins } from "lucide-react"
import { CurrencyDisplay } from "@/components/currency-display"
import { fromPaisa } from "@/features/sales/components/payment/payment-math"
import type { PaymentStatus } from "@/features/sales/components/pos/checkout-math"
import { cn } from "@/lib/utils"
import { useTranslations } from "@/lib/i18n/i18n-provider"

const TONE = {
  covered: "border-success/30 bg-success/10 text-success",
  due: "border-warning/30 bg-warning/10 text-warning",
  over: "border-destructive/30 bg-destructive/10 text-destructive",
} as const

/** Live payment state: icon + words + amount, so it never relies on colour alone. */
export function PaymentStatusBar({ status, id }: { status: PaymentStatus; id?: string }) {
  const Icon = status.kind === "covered" ? CheckCircle2 : status.kind === "over" ? CircleAlert : CircleMinus
  const t = useTranslations("pos")
  const label =
    status.kind === "covered" ? t("payment.fullyCovered") : status.kind === "over" ? t("payment.overBy") : t("payment.remaining")

  return (
    <div
      id={id}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={cn(
        "flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 transition-colors duration-200 ease-out",
        TONE[status.kind],
      )}
    >
      <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
        <Icon className="h-4 w-4 shrink-0" aria-hidden />
        {label}
        {status.kind !== "covered" ? (
          <span className="num font-semibold">
            <CurrencyDisplay amount={fromPaisa(status.amountPaisa)} />
          </span>
        ) : null}
      </span>
      {status.changePaisa > 0 ? (
        <span className="flex shrink-0 items-center gap-1.5 text-sm text-foreground">
          <HandCoins className="h-4 w-4 text-primary" aria-hidden />
          {t("payment.changeDue")}

          <span className="num text-base font-semibold text-primary">
            <CurrencyDisplay amount={fromPaisa(status.changePaisa)} />
          </span>
        </span>
      ) : null}
    </div>
  )
}
