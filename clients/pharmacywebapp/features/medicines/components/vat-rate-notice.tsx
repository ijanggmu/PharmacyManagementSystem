"use client"

import Link from "next/link"
import { AlertTriangle } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

/**
 * Shown on stock-entry forms when the pharmacy's VAT rate (Settings → System) is 0%: no input VAT is
 * suggested on purchases and sales charge no output VAT, which is almost always a missed setting.
 */
export function VatRateNotice({ vatRatePercent, isLoading }: { vatRatePercent: number | undefined; isLoading?: boolean }) {
  if (isLoading || vatRatePercent === undefined || vatRatePercent > 0) return null
  return (
    <Alert className="border-amber-500/50 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
      <AlertTriangle className="size-4" aria-hidden />
      <AlertTitle>VAT rate is 0%</AlertTitle>
      <AlertDescription>
        No input VAT will be suggested on this purchase, and sales won&apos;t charge VAT either.{" "}
        <Link href="/dashboard/settings?tab=system" className="font-medium underline underline-offset-2">
          Set the VAT rate in Settings
        </Link>{" "}
        (13% in Nepal).
      </AlertDescription>
    </Alert>
  )
}
