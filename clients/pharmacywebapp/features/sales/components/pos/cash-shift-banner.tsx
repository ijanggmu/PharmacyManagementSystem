"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { Banknote } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { parseInternalControls } from "@/features/settings/lib/internal-controls"
import { useSystemSettings } from "@/features/settings/hooks/use-system-settings"
import { dotnetClient, DotnetApiError } from "@/lib/api/dotnet-client"
import type { DotnetCashShiftDto } from "@/lib/api/cash-shifts-api"
import { CASH_SHIFTS_QUERY_KEY } from "@/lib/hooks/money-movement-queries"
import { useTranslations } from "@/lib/i18n/i18n-provider"

/** The shift open at the caller's branch, or null when none is (the API answers 404). */
async function fetchCurrentShift(): Promise<DotnetCashShiftDto | null> {
  try {
    return await dotnetClient.get<DotnetCashShiftDto>("/sales/cash-shifts/current")
  } catch (error) {
    if (error instanceof DotnetApiError && error.normalized.status === 404) return null
    throw error
  }
}

/**
 * Warns at the till, before anything is rung up, that cash can't be taken because no cash shift is open at this
 * branch (the server refuses such a sale while the pharmacy's "Cash sales need an open shift" control is on).
 */
export function CashShiftBanner({ canOpenShift }: { canOpenShift: boolean }) {
  const t = useTranslations("pos")
  const { data: settingRows, isLoading: settingsLoading } = useSystemSettings()
  const requireOpenShift = parseInternalControls(settingRows).requireOpenShift
  const shift = useQuery({
    queryKey: [...CASH_SHIFTS_QUERY_KEY, "current"],
    queryFn: fetchCurrentShift,
    enabled: !settingsLoading && requireOpenShift,
    staleTime: 0,
    refetchOnWindowFocus: true,
  })

  // Unknown (still loading, or the read failed): stay quiet rather than block the cashier with a guess.
  if (settingsLoading || !requireOpenShift || shift.isLoading || shift.isError || shift.data) return null

  return (
    <Alert variant="warning" className="mb-4">
      <Banknote aria-hidden />
      <AlertTitle>{t("shift.noShiftTitle")}</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
        <span>{canOpenShift ? t("shift.noShiftBody") : t("shift.askToOpen")}</span>
        {canOpenShift && (
          <Button asChild size="sm">
            <Link href="/dashboard/cashier">{t("shift.openShift")}</Link>
          </Button>
        )}
      </AlertDescription>
    </Alert>
  )
}
