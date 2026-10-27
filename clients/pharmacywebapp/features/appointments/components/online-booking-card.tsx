"use client"

import { useEffect, useState } from "react"
import { Copy, ExternalLink, Globe, Printer } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/hooks/use-toast"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { useI18n, useTranslations } from "@/lib/i18n/i18n-provider"
import { usePharmacyProfile } from "@/features/accounting/hooks/use-pharmacy-profile"
import { printHtmlDocument } from "@/features/accounting/lib/voucher-print"
import { QrCodeImage } from "@/features/sales/components/payment/qr-code-image"
import type { AppointmentSettings } from "@/features/appointments/api-client"
import { useAppointmentSettings, useSaveAppointmentSettings } from "@/features/appointments/hooks/use-doctors"
import { buildBookingPosterHtml, onlineBookingLink } from "@/features/appointments/lib/online-booking"

const DAYS_AHEAD = [0, 1, 2, 3, 7, 14, 30] as const
const PER_PHONE = [1, 2, 3, 5] as const

/** The owner's switch for the public booking page, with its link, QR and a poster to print for the counter. */
export function OnlineBookingCard({ pharmacyCode, canManage }: { pharmacyCode: string; canManage: boolean }) {
  const t = useTranslations("appointments")
  const { profile } = usePharmacyProfile()
  const { formatNumber } = useI18n()
  const { toast } = useToast()
  const settings = useAppointmentSettings()
  const save = useSaveAppointmentSettings()
  const [origin, setOrigin] = useState("")
  useEffect(() => setOrigin(window.location.origin), [])
  const link = origin ? onlineBookingLink(origin, pharmacyCode) : ""

  const change = (next: Partial<AppointmentSettings>) => {
    if (!settings.data) return
    save.mutate(
      { ...settings.data, ...next },
      {
        onSuccess: () => toast({ title: t("online.saved") }),
        onError: (error) => toast({ title: t("online.failed"), description: apiRequestErrorMessage(error), variant: "destructive" }),
      },
    )
  }

  const copy = () =>
    void navigator.clipboard?.writeText(link).then(
      () => toast({ title: t("online.copied") }),
      () => undefined,
    )

  const printPoster = async () => {
    const { default: QRCode } = await import("qrcode")
    const qrDataUrl = await QRCode.toDataURL(link, { errorCorrectionLevel: "M", margin: 1, width: 800 })
    await printHtmlDocument(
      buildBookingPosterHtml({ pharmacyName: profile.name, title: t("online.posterTitle"), hint: t("online.posterHint"), link, qrDataUrl }),
    )
  }

  const on = settings.data?.onlineBookingEnabled ?? false
  // Keep a saved value that isn't one of the choices (set elsewhere) selectable.
  const daysOptions = [...new Set([...DAYS_AHEAD, settings.data?.bookingDaysAhead ?? 7])].sort((a, b) => a - b)
  const phoneOptions = [...new Set([...PER_PHONE, settings.data?.maxBookingsPerPhonePerDay ?? 2])].sort((a, b) => a - b)

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="flex items-center gap-2 text-base">
          <Globe className="h-4 w-4" /> {t("online.title")}
        </CardTitle>
        <CardDescription>{t("online.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {settings.isLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : settings.isError || !settings.data ? (
          <p className="text-sm text-destructive">{apiRequestErrorMessage(settings.error)}</p>
        ) : (
          <>
            <div className="flex items-start gap-3">
              <Switch
                id="online-booking"
                checked={on}
                disabled={!canManage || save.isPending}
                onCheckedChange={(checked) => change({ onlineBookingEnabled: checked })}
              />
              <div className="space-y-0.5">
                <Label htmlFor="online-booking">{t("online.switchLabel")}</Label>
                <p className="text-sm text-muted-foreground">{on ? t("online.on") : t("online.off")}</p>
              </div>
            </div>

            {on && (
              <div className="grid gap-4 md:grid-cols-[1fr_auto]">
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="online-days">{t("online.daysAhead")}</Label>
                      <Select
                        value={String(settings.data.bookingDaysAhead)}
                        disabled={!canManage || save.isPending}
                        onValueChange={(v) => change({ bookingDaysAhead: Number(v) })}
                      >
                        <SelectTrigger id="online-days">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {daysOptions.map((d) => (
                            <SelectItem key={d} value={String(d)}>
                              {d === 0 ? t("online.todayOnly") : t("online.daysAheadOption", { count: formatNumber(d) })}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="online-per-phone">{t("online.perPhone")}</Label>
                      <Select
                        value={String(settings.data.maxBookingsPerPhonePerDay)}
                        disabled={!canManage || save.isPending}
                        onValueChange={(v) => change({ maxBookingsPerPhonePerDay: Number(v) })}
                      >
                        <SelectTrigger id="online-per-phone">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {phoneOptions.map((n) => (
                            <SelectItem key={n} value={String(n)}>
                              {formatNumber(n)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("online.link")}</Label>
                    <p className="break-all rounded-md bg-muted px-3 py-2 font-mono text-sm">{link}</p>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={copy} disabled={!link}>
                        <Copy className="mr-1 h-4 w-4" /> {t("online.copy")}
                      </Button>
                      <Button asChild variant="outline" size="sm">
                        <a href={link || undefined} target="_blank" rel="noreferrer">
                          <ExternalLink className="mr-1 h-4 w-4" /> {t("online.open")}
                        </a>
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => void printPoster()} disabled={!link}>
                        <Printer className="mr-1 h-4 w-4" /> {t("online.printPoster")}
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Switch
                      id="online-explore"
                      checked={settings.data.listedOnExplore}
                      disabled={!canManage || save.isPending}
                      onCheckedChange={(checked) => change({ listedOnExplore: checked })}
                    />
                    <div className="space-y-0.5">
                      <Label htmlFor="online-explore">{t("online.listOnExplore")}</Label>
                      <p className="text-sm text-muted-foreground">
                        {t("online.listOnExploreHint", { link: origin ? `${origin}/explore` : "/explore" })}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">{t("online.shown")}</p>
                </div>
                {link && <QrCodeImage value={link} label={t("online.posterTitle")} size={160} className="justify-self-center" />}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
