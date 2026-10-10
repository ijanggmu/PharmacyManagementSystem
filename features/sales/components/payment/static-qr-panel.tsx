"use client"

import Link from "next/link"
import { Info, Landmark } from "lucide-react"
import { CurrencyDisplay } from "@/components/currency-display"
import type { PaymentSettings } from "@/lib/api/payment-settings-api"

interface StaticQrPanelProps {
  settings: PaymentSettings
  amount: number
}

/** The pharmacy's own bank/Fonepay merchant QR (printed standee style). Cashier confirms manually. */
export function StaticQrPanel({ settings, amount }: StaticQrPanelProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border p-3 sm:flex-row sm:items-start">
      {settings.bankQrImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- tenant-uploaded data URL
        <img
          src={settings.bankQrImage}
          alt={`Payment QR for ${settings.accountName ?? settings.bankName ?? "the pharmacy's account"}`}
          className="h-40 w-40 shrink-0 rounded-lg bg-white object-contain p-1 ring-1 ring-border"
        />
      ) : null}
      <dl className="w-full min-w-0 space-y-1.5 text-sm">
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Ask the customer to pay</dt>
          <dd className="num font-semibold">
            <CurrencyDisplay amount={amount} />
          </dd>
        </div>
        {settings.bankName ? (
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Bank</dt>
            <dd className="min-w-0 truncate text-right font-medium">{settings.bankName}</dd>
          </div>
        ) : null}
        {settings.accountName ? (
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Account name</dt>
            <dd className="min-w-0 truncate text-right font-medium">{settings.accountName}</dd>
          </div>
        ) : null}
        {settings.accountNumber ? (
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Account no.</dt>
            <dd className="num min-w-0 truncate text-right font-mono text-xs">{settings.accountNumber}</dd>
          </div>
        ) : null}
        <p className="flex items-start gap-1.5 pt-1 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          Check the payment alert on your phone, then enter the transaction ID below.
        </p>
      </dl>
    </div>
  )
}

export function QrNotConfiguredHint({ method, canConfigure = true }: { method: string; canConfigure?: boolean }) {
  return (
    <p className="flex items-start gap-1.5 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
      <Landmark className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>
        No {method} QR is set up for this pharmacy.{" "}
        {canConfigure ? (
          <Link href="/dashboard/settings?tab=payments" className="font-medium text-primary underline-offset-2 hover:underline">
            Set it up in Settings → Payments
          </Link>
        ) : (
          "Ask an admin to add it in Settings → Payments."
        )}
      </span>
    </p>
  )
}
