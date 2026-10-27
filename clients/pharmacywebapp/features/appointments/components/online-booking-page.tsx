"use client"

import { useState } from "react"
import Link from "next/link"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertCircle, ArrowLeft, CalendarDays, Check, Stethoscope, Ticket } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { useI18n, useTranslations } from "@/lib/i18n/i18n-provider"
import { nepalTodayYmd } from "@/lib/utils/date-limits"
import { useDayNames } from "@/features/appointments/components/day-names"
import { PublicTopBar } from "@/features/appointments/components/public-top-bar"
import { formatTimeRange } from "@/features/appointments/lib/timetable"
import { normalizeNepaliMobile, showsBranches, sittingsByDate } from "@/features/appointments/lib/online-booking"
import {
  OnlineBookingError,
  onlineBookingApi,
  type OnlineBookingInput,
  type OnlineBookingPage as PageData,
  type OnlineDoctor,
  type OnlineSitting,
  type OnlineToken,
} from "@/features/appointments/online-api"

const weekday = (ymd: string) => new Date(`${ymd}T00:00:00Z`).getUTCDay()

/** 404 = this pharmacy has online booking off (or the link names no pharmacy). */
const isOff = (error: Error) => error instanceof OnlineBookingError && error.status === 404

/**
 * The public page a patient opens from the pharmacy's link or QR: choose a doctor, a day, type a name and mobile
 * number, and get a token number. Mobile-first, Nepali unless the visitor picked English. No sign-in.
 * From "Find a doctor" the doctor comes already chosen (`doctorId`) and a link leads back to the list.
 */
export function OnlineBookingPage({
  code,
  doctorId = null,
  fromExplore = false,
}: {
  code: string | null
  doctorId?: string | null
  fromExplore?: boolean
}) {
  const t = useTranslations("appointments")
  const page = useQuery<PageData, Error>({
    queryKey: ["online-booking", code],
    queryFn: () => onlineBookingApi.getPage(code),
    retry: (count, error) => !(error instanceof OnlineBookingError && error.status < 500) && count < 2,
  })
  const [token, setToken] = useState<OnlineToken | null>(null)

  return (
    <div className="min-h-dvh bg-background">
      <PublicTopBar />
      <main className="mx-auto w-full max-w-lg space-y-5 px-4 py-6">
        {fromExplore && (
          <Link
            href="/explore"
            onClick={(e) => {
              // Back keeps the patient's search and filters; a fresh tab has nothing to go back to.
              if (window.history.length > 1) {
                e.preventDefault()
                window.history.back()
              }
            }}
            className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> {t("explore.allDoctors")}
          </Link>
        )}
        <header className="min-w-0 space-y-1">
          {page.data ? (
            <h1 className="text-balance font-display text-2xl font-bold tracking-tight">{page.data.pharmacyName}</h1>
          ) : (
            page.isLoading && <Skeleton className="h-8 w-48" />
          )}
          <p className="text-muted-foreground">{t("publicBook.title")}</p>
        </header>

        {page.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : page.isError ? (
          isOff(page.error) ? (
            <Notice title={t("publicBook.off")} hint={t("publicBook.offHint")} />
          ) : (
            <Notice title={t("publicBook.loadFailed")} onRetry={() => void page.refetch()} />
          )
        ) : !page.data || page.data.doctors.length === 0 ? (
          <Notice title={t("publicBook.noDoctors")} hint={t("publicBook.offHint")} />
        ) : token ? (
          <TokenCard token={token} onAgain={() => setToken(null)} />
        ) : (
          <BookingSteps page={page.data} code={code} preselected={doctorId} onBooked={setToken} />
        )}
      </main>
    </div>
  )
}

function Notice({ title, hint, onRetry }: { title: string; hint?: string; onRetry?: () => void }) {
  const t = useTranslations("appointments")
  return (
    <Card>
      <CardContent className="space-y-3 p-6 text-center">
        <AlertCircle className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="text-lg font-medium">{title}</p>
        {hint && <p className="text-muted-foreground">{hint}</p>}
        {onRetry && (
          <Button variant="outline" onClick={onRetry}>
            {t("publicBook.retry")}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

function BookingSteps({
  page,
  code,
  preselected,
  onBooked,
}: {
  page: PageData
  code: string | null
  preselected: string | null
  onBooked: (token: OnlineToken) => void
}) {
  const t = useTranslations("appointments")
  const { formatNumber } = useI18n()
  const queryClient = useQueryClient()
  const [doctorId, setDoctorId] = useState<string | null>(
    page.doctors.find((d) => d.id === preselected)?.id ?? (page.doctors.length === 1 ? page.doctors[0].id : null),
  )
  const [sitting, setSitting] = useState<OnlineSitting | null>(null)
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [touched, setTouched] = useState(false)
  const doctor = page.doctors.find((d) => d.id === doctorId) ?? null

  const book = useMutation<OnlineToken, Error, OnlineBookingInput>({
    mutationFn: (input) => onlineBookingApi.book(input, code),
    onSuccess: (token) => {
      void queryClient.invalidateQueries({
        queryKey: ["online-booking", code],
      })
      onBooked(token)
    },
  })

  const nameError = touched && name.trim() === "" ? t("publicBook.nameRequired") : null
  const phoneError = touched && normalizeNepaliMobile(phone) === null ? t("publicBook.phoneInvalid") : null

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (!sitting || name.trim() === "" || normalizeNepaliMobile(phone) === null) return
    book.mutate({
      doctorId: sitting.doctorId,
      date: sitting.date,
      startTime: sitting.startTime,
      patientName: name,
      patientPhone: phone,
    })
  }

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <StepTitle done={!!doctor}>{t("publicBook.pickDoctor")}</StepTitle>
        {doctor ? (
          <Chosen
            onChange={
              page.doctors.length > 1
                ? () => {
                    setDoctorId(null)
                    setSitting(null)
                  }
                : undefined
            }
            title={doctor.name}
            subtitle={doctorLine(doctor, t("publicBook.fee", { amount: formatNumber(doctor.fee) }))}
          />
        ) : (
          <div className="space-y-2">
            {page.doctors.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setDoctorId(d.id)}
                className="flex w-full items-center gap-3 rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent"
              >
                <Stethoscope className="h-6 w-6 shrink-0 text-primary" />
                <span className="min-w-0">
                  <span className="block font-medium">{d.name}</span>
                  <span className="block text-sm text-muted-foreground">
                    {doctorLine(d, t("publicBook.fee", { amount: formatNumber(d.fee) }))}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {doctor && (
        <section className="space-y-2">
          <StepTitle done={!!sitting}>{t("publicBook.pickDay")}</StepTitle>
          {sitting ? (
            <Chosen
              onChange={() => setSitting(null)}
              title={<SittingDate date={sitting.date} />}
              subtitle={<SittingLine sitting={sitting} page={page} />}
            />
          ) : (
            <SittingPicker page={page} doctorId={doctor.id} onPick={setSitting} />
          )}
        </section>
      )}

      {sitting && (
        <form className="space-y-3" onSubmit={submit} noValidate>
          <StepTitle done={false}>{t("publicBook.details")}</StepTitle>
          <div className="space-y-1.5">
            <Label htmlFor="patient-name">{t("publicBook.name")}</Label>
            <Input
              id="patient-name"
              autoComplete="name"
              maxLength={200}
              className="h-12 text-base"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={!!nameError}
            />
            {nameError && <p className="text-sm text-destructive">{nameError}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="patient-phone">{t("publicBook.phone")}</Label>
            <Input
              id="patient-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={20}
              placeholder="98XXXXXXXX"
              className="h-12 text-base"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              aria-invalid={!!phoneError}
            />
            <p className={cn("text-sm", phoneError ? "text-destructive" : "text-muted-foreground")}>
              {phoneError ?? t("publicBook.phoneHint")}
            </p>
          </div>
          {book.isError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <span className="font-medium">{t("publicBook.failed")}: </span>
                {book.error.message}
              </AlertDescription>
            </Alert>
          )}
          <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={book.isPending}>
            <Ticket className="mr-2 h-5 w-5" />
            {book.isPending ? t("publicBook.submitting") : t("publicBook.submit")}
          </Button>
        </form>
      )}

      <p className="text-center text-sm text-muted-foreground">
        {page.bookingDaysAhead === 0
          ? t("publicBook.todayOnlyNote")
          : t("publicBook.daysAheadNote", {
              count: formatNumber(page.bookingDaysAhead),
            })}
      </p>
    </div>
  )
}

const doctorLine = (d: OnlineDoctor, fee: string) => [d.speciality, d.fee > 0 ? fee : null].filter(Boolean).join(" · ")

function StepTitle({ done, children }: { done: boolean; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 font-semibold">
      {children}
      {done && <Check className="h-4 w-4 text-primary" />}
    </h2>
  )
}

function Chosen({ title, subtitle, onChange }: { title: React.ReactNode; subtitle: React.ReactNode; onChange?: () => void }) {
  const t = useTranslations("appointments")
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-3">
      <div className="min-w-0 flex-1">
        <div className="font-medium">{title}</div>
        {subtitle && <div className="text-sm text-muted-foreground">{subtitle}</div>}
      </div>
      {onChange && (
        <Button type="button" variant="ghost" size="sm" onClick={onChange}>
          {t("publicBook.change")}
        </Button>
      )}
    </div>
  )
}

export function SittingDate({ date }: { date: string }) {
  const t = useTranslations("appointments")
  const { formatBsDate } = useI18n()
  const days = useDayNames()
  const isToday = date === nepalTodayYmd()
  return (
    <span>
      {isToday ? `${t("publicBook.today")} · ` : ""}
      {days.long[weekday(date)]}, {formatBsDate(date)} <span className="text-xs font-normal text-muted-foreground">({date})</span>
    </span>
  )
}

function useSittingLine() {
  const t = useTranslations("appointments")
  const { formatNumber, localizeDigits } = useI18n()
  return (s: OnlineSitting, page: PageData) =>
    [
      localizeDigits(formatTimeRange(s.startTime, s.endTime)),
      showsBranches(page.sittings) && s.branchName ? t("publicBook.where", { branch: s.branchName }) : null,
      s.placesLeft > 0 ? t("publicBook.placesLeft", { count: formatNumber(s.placesLeft) }) : t("publicBook.full"),
    ]
      .filter(Boolean)
      .join(" · ")
}

function SittingLine({ sitting, page }: { sitting: OnlineSitting; page: PageData }) {
  const line = useSittingLine()
  return <>{line(sitting, page)}</>
}

function SittingPicker({ page, doctorId, onPick }: { page: PageData; doctorId: string; onPick: (s: OnlineSitting) => void }) {
  const line = useSittingLine()
  const days = sittingsByDate(page.sittings, doctorId)
  return (
    <div className="space-y-3">
      {days.map((day) => (
        <div key={day.date} className="space-y-1.5">
          <div className="flex items-center gap-2 text-sm font-medium">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <SittingDate date={day.date} />
          </div>
          {day.sittings.map((s) => (
            <button
              key={`${s.date}-${s.startTime}`}
              type="button"
              disabled={s.placesLeft <= 0}
              onClick={() => onPick(s)}
              className="w-full rounded-lg border bg-card p-3 text-left text-base transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              {line(s, page)}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}

function TokenCard({ token, onAgain }: { token: OnlineToken; onAgain: () => void }) {
  const t = useTranslations("appointments")
  const { formatNumber, localizeDigits } = useI18n()
  return (
    <div className="space-y-4">
      <Card className="border-primary">
        <CardContent className="space-y-3 p-6 text-center">
          <p className="text-muted-foreground">{t("publicBook.tokenTitle")}</p>
          <p className="text-7xl font-bold tabular-nums text-primary">{formatNumber(token.tokenNo)}</p>
          {token.alreadyBooked && <p className="text-sm text-muted-foreground">{t("publicBook.alreadyBooked")}</p>}
          <div className="space-y-0.5">
            <p className="text-lg font-medium">{token.doctorName}</p>
            <p>
              <SittingDate date={token.date} />
            </p>
            <p>{localizeDigits(formatTimeRange(token.startTime, token.endTime))}</p>
            {token.branchName && <p className="text-muted-foreground">{t("publicBook.where", { branch: token.branchName })}</p>}
            <p className="text-muted-foreground">{token.patientName}</p>
          </div>
        </CardContent>
      </Card>
      <p className="text-center">{t("publicBook.comeEarly")}</p>
      <p className="text-center text-sm text-muted-foreground">{t("publicBook.screenshot")}</p>
      <Button variant="outline" className="h-12 w-full" onClick={onAgain}>
        {t("publicBook.bookAnother")}
      </Button>
    </div>
  )
}
