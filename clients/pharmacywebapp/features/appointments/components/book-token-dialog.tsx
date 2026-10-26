"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Check, Printer } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { newIdempotencyKey } from "@/lib/api/idempotency"
import { useI18n, useTranslations } from "@/lib/i18n/i18n-provider"
import { nepalTodayYmd } from "@/lib/utils/date-limits"
import { printHtmlDocument } from "@/features/accounting/lib/voucher-print"
import { usePharmacyProfile } from "@/features/accounting/hooks/use-pharmacy-profile"
import { customersApi } from "@/features/customers/api-client"
import type { Appointment, BookTokenInput } from "@/features/appointments/api-client"
import { useDayNames } from "@/features/appointments/components/day-names"
import { useBookToken, useDoctors, useTimetable } from "@/features/appointments/hooks/use-doctors"
import { bookableSittings, buildTokenSlipHtml, nepalTimeHHmm, slipTime } from "@/features/appointments/lib/desk"
import { addDaysYmd, dayOfWeekYmd, formatTimeRange } from "@/features/appointments/lib/timetable"

/** How far ahead the booking form lists sittings. */
const DAYS_AHEAD = 14

const sittingKey = (date: string, startTime: string) => `${date}|${startTime}`

/**
 * Books a token: doctor → one of the doctor's coming sittings → patient (typing the phone finds an existing customer).
 * Shows the token number when booked, with a slip to print.
 */
export function BookTokenDialog({
  onClose,
  preset,
  branchId,
}: {
  onClose: () => void
  preset?: { doctorId: string; date: string; startTime: string }
  branchId?: string
}) {
  const t = useTranslations("appointments")
  const { toast } = useToast()
  const { formatBsDate } = useI18n()
  const days = useDayNames()
  const book = useBookToken()
  const today = nepalTodayYmd()
  const doctors = useDoctors({})
  const timetable = useTimetable({ from: today, to: addDaysYmd(today, DAYS_AHEAD - 1), branchId })
  const [idempotencyKey] = useState(() => newIdempotencyKey())
  const [booked, setBooked] = useState<Appointment | null>(null)
  const [form, setForm] = useState<BookTokenInput>({
    doctorId: preset?.doctorId ?? "",
    date: preset?.date ?? "",
    startTime: preset?.startTime ?? "",
    patientName: "",
    patientPhone: "",
    customerId: null,
    note: "",
  })
  const set = <K extends keyof BookTokenInput>(key: K, value: BookTokenInput[K]) => setForm((f) => ({ ...f, [key]: value }))

  const sittings = useMemo(
    () => (form.doctorId ? bookableSittings(timetable.data?.sessions ?? [], form.doctorId, today, nepalTimeHHmm()) : []),
    [timetable.data, form.doctorId, today],
  )

  // Typing a phone number finds customers the pharmacy already has; picking one links the token to them.
  const phoneDigits = form.patientPhone.replace(/\D/g, "")
  const matches = useQuery({
    queryKey: ["appointments", "patient-lookup", phoneDigits],
    queryFn: () => customersApi.getCustomers({ search: phoneDigits, limit: 5 }),
    enabled: phoneDigits.length >= 6 && !form.customerId,
    staleTime: 60_000,
  })
  const customers = (matches.data?.data ?? []).slice(0, 5)

  const sittingLabel = (date: string, start: string, end: string) =>
    `${days.short[dayOfWeekYmd(date)]} ${formatBsDate(date, false)} · ${formatTimeRange(start, end)}`

  const invalid = !form.doctorId || !form.date || !form.startTime || form.patientName.trim() === ""

  const submit = () =>
    book.mutate(
      { input: form, idempotencyKey },
      {
        onSuccess: (appointment) => {
          toast({ title: t("book.booked") })
          setBooked(appointment)
        },
        onError: (error) => toast({ title: t("book.failed"), description: apiRequestErrorMessage(error), variant: "destructive" }),
      },
    )

  if (booked) {
    return <TokenSlip appointment={booked} onClose={onClose} />
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("book.title")}</DialogTitle>
          <DialogDescription>{t("book.description")}</DialogDescription>
        </DialogHeader>

        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (!invalid && !book.isPending) submit()
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="book-doctor">{t("book.doctor")}</Label>
            <Select
              value={form.doctorId}
              onValueChange={(v) => setForm((f) => ({ ...f, doctorId: v, date: "", startTime: "" }))}
            >
              <SelectTrigger id="book-doctor">
                <SelectValue placeholder={t("book.pickDoctor")} />
              </SelectTrigger>
              <SelectContent>
                {(doctors.data?.items ?? []).map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                    {d.speciality ? ` · ${d.speciality}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {form.doctorId && (
            <div className="space-y-1.5">
              <Label htmlFor="book-sitting">{t("book.sitting")}</Label>
              {sittings.length === 0 && !timetable.isLoading ? (
                <p className="text-sm text-muted-foreground">{t("book.noSittings")}</p>
              ) : (
                <Select
                  value={form.date ? sittingKey(form.date, form.startTime) : ""}
                  onValueChange={(v) => {
                    const [date, startTime] = v.split("|")
                    setForm((f) => ({ ...f, date, startTime }))
                  }}
                >
                  <SelectTrigger id="book-sitting">
                    <SelectValue placeholder={t("book.pickSitting")} />
                  </SelectTrigger>
                  <SelectContent>
                    {sittings.map((s) => (
                      <SelectItem key={sittingKey(s.date, s.startTime)} value={sittingKey(s.date, s.startTime)}>
                        {sittingLabel(s.date, s.startTime, s.endTime)} — {t("book.spaces", { left: s.maxTokens - s.booked })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="book-phone">{t("book.phone")}</Label>
              <Input
                id="book-phone"
                inputMode="tel"
                maxLength={32}
                value={form.patientPhone}
                onChange={(e) => setForm((f) => ({ ...f, patientPhone: e.target.value, customerId: null }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="book-name">{t("book.name")}</Label>
              <Input id="book-name" maxLength={200} value={form.patientName} onChange={(e) => set("patientName", e.target.value)} />
            </div>
          </div>
          {form.customerId ? (
            <p className="flex items-center gap-1 text-sm text-emerald-700 dark:text-emerald-400">
              <Check className="h-4 w-4" aria-hidden /> {t("book.found", { name: form.patientName })}
            </p>
          ) : customers.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {customers.map((c) => {
                const name = `${c.first_name} ${c.last_name}`.trim()
                return (
                  <Button
                    key={c.id}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setForm((f) => ({ ...f, customerId: c.id, patientName: name, patientPhone: c.phone ?? f.patientPhone }))}
                  >
                    {name} · {c.phone}
                  </Button>
                )
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{t("book.phoneHint")}</p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="book-note">{t("book.note")}</Label>
            <Input
              id="book-note"
              maxLength={500}
              placeholder={t("book.notePlaceholder")}
              value={form.note}
              onChange={(e) => set("note", e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("form.cancel")}
            </Button>
            <Button type="submit" disabled={invalid || book.isPending}>
              {t("book.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** The booked token, big enough to read out, with a slip to print. */
function TokenSlip({ appointment, onClose }: { appointment: Appointment; onClose: () => void }) {
  const t = useTranslations("appointments")
  const { formatBsDate, formatNumber } = useI18n()
  const { profile } = usePharmacyProfile()
  const when = t("slip.when", { date: formatBsDate(appointment.date), from: slipTime(appointment.startTime) })
  const withDoctor = t("slip.with", { doctor: appointment.doctorName })

  const print = () =>
    void printHtmlDocument(
      buildTokenSlipHtml({
        pharmacyName: profile.name,
        doctorName: appointment.doctorName,
        tokenNo: appointment.tokenNo,
        patientName: appointment.patientName,
        dateLabel: formatBsDate(appointment.date),
        startTime: appointment.startTime,
        labels: { token: t("slip.tokenNo"), with: withDoctor, when },
      }),
    )

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("slip.title")}</DialogTitle>
          <DialogDescription>{appointment.patientName}</DialogDescription>
        </DialogHeader>
        <div className="py-2 text-center">
          <div className="text-sm uppercase tracking-wide text-muted-foreground">{t("slip.tokenNo")}</div>
          <div className="text-6xl font-bold tabular-nums">{formatNumber(appointment.tokenNo)}</div>
          <div className="mt-2 text-sm">{withDoctor}</div>
          <div className="text-sm text-muted-foreground">{when}</div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={print}>
            <Printer className="mr-1 h-4 w-4" /> {t("slip.print")}
          </Button>
          <Button onClick={onClose}>{t("slip.done")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
