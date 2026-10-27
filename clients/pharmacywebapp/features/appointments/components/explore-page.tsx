"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { AlertCircle, BadgeCheck, ChevronRight, MapPin, Search, SearchX, Store, Ticket, UserRoundX, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { useI18n, useTranslations } from "@/lib/i18n/i18n-provider"
import { nepalTodayYmd } from "@/lib/utils/date-limits"
import { useDayNames } from "@/features/appointments/components/day-names"
import { formatTimeRange } from "@/features/appointments/lib/timetable"
import {
  type ExploreDay,
  addDaysYmd,
  filterExplore,
  nextOpenSitting,
  normalizeText,
  specialityChips,
} from "@/features/appointments/lib/explore"
import { type Explore, type ExploreDoctor, exploreApi, exploreBookingHref } from "@/features/appointments/explore-api"
import { PublicTopBar } from "@/features/appointments/components/public-top-bar"

const DAYS: {
  value: ExploreDay
  key: "dayAll" | "dayToday" | "dayTomorrow" | "dayWeek"
}[] = [
  { value: "all", key: "dayAll" },
  { value: "today", key: "dayToday" },
  { value: "tomorrow", key: "dayTomorrow" },
  { value: "week", key: "dayWeek" },
]

const isDay = (v: string | null | undefined): v is ExploreDay => DAYS.some((d) => d.value === v)

/** The state a shared link (or the back button) opens with: ?q=…&speciality=…&day=… */
export interface ExploreInitial {
  q?: string | null
  speciality?: string | null
  day?: string | null
}

/**
 * The public "Find a doctor" page: the doctors of every pharmacy that listed itself, with a search box, speciality
 * and day chips (kept in the address so a search can be shared). "Book token" opens that pharmacy's booking page
 * with the doctor already chosen. No sign-in, mobile-first, large text and 44px touch targets throughout.
 */
export function ExplorePage({ initial = {} }: { initial?: ExploreInitial }) {
  const t = useTranslations("appointments")
  const { formatNumber } = useI18n()
  const explore = useQuery<Explore, Error>({
    queryKey: ["explore"],
    queryFn: () => exploreApi.list(),
    staleTime: 30_000,
  })
  const [text, setText] = useState(initial.q ?? "")
  const [speciality, setSpeciality] = useState<string | null>(initial.speciality ? normalizeText(initial.speciality) : null)
  const [day, setDay] = useState<ExploreDay>(isDay(initial.day) ? initial.day : "all")
  const today = nepalTodayYmd()

  // Keep the search in the address bar (shareable, survives back) without a navigation per keystroke.
  useEffect(() => {
    const params = new URLSearchParams()
    if (text.trim()) params.set("q", text.trim())
    if (speciality) params.set("speciality", speciality)
    if (day !== "all") params.set("day", day)
    const query = params.toString()
    window.history.replaceState(window.history.state, "", query ? `?${query}` : window.location.pathname)
  }, [text, speciality, day])

  const doctors = useMemo(() => explore.data?.doctors ?? [], [explore.data])
  const chips = useMemo(() => specialityChips(doctors), [doctors])
  const shown = useMemo(() => filterExplore(doctors, { text, speciality, day, today }), [doctors, text, speciality, day, today])
  const dayCounts = useMemo(
    () =>
      Object.fromEntries(DAYS.map((d) => [d.value, filterExplore(doctors, { text, speciality, day: d.value, today }).length])),
    [doctors, text, speciality, today],
  )
  const filtered = text.trim() !== "" || speciality !== null || day !== "all"
  const clearAll = () => {
    setText("")
    setSpeciality(null)
    setDay("all")
  }

  return (
    <div className="min-h-dvh bg-background">
      <PublicTopBar />

      <section className="border-b bg-gradient-to-b from-primary/10 to-background">
        <div className="mx-auto w-full max-w-5xl space-y-5 px-4 pb-6 pt-8 sm:pt-12">
          <div className="space-y-2">
            <h1 className="text-balance font-display text-3xl font-bold tracking-tight sm:text-4xl">{t("explore.title")}</h1>
            <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">{t("explore.subtitle")}</p>
          </div>

          <div className="relative max-w-2xl">
            <Search
              className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              type="text"
              inputMode="search"
              enterKeyHint="search"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t("explore.search")}
              aria-label={t("explore.search")}
              disabled={explore.isLoading || explore.isError || doctors.length === 0}
              className="h-14 w-full rounded-xl border bg-card pl-12 pr-12 text-base shadow-sm transition-shadow placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            />
            {text && (
              <button
                type="button"
                onClick={() => setText("")}
                aria-label={t("explore.clearSearch")}
                className="absolute right-2 top-1/2 flex size-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>

          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
            {(["trustFree", "trustPay", "trustNoSignup"] as const).map((k) => (
              <li key={k} className="flex items-center gap-1.5">
                <BadgeCheck className="h-4 w-4 text-success" aria-hidden />
                {t(`explore.${k}`)}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <main className="mx-auto w-full max-w-5xl space-y-5 px-4 py-6">
        {explore.isLoading ? (
          <div className="grid gap-4 md:grid-cols-2" aria-busy="true">
            {[0, 1, 2, 3].map((i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : explore.isError ? (
          <EmptyState icon={AlertCircle} title={t("explore.loadFailed")}>
            <Button variant="outline" className="h-11" onClick={() => void explore.refetch()}>
              {t("publicBook.retry")}
            </Button>
          </EmptyState>
        ) : doctors.length === 0 ? (
          <EmptyState icon={UserRoundX} title={t("explore.none")} hint={t("explore.noneHint")} />
        ) : (
          <>
            <div className="space-y-3">
              {chips.length > 0 && (
                <ChipRow label={t("explore.specialityLabel")}>
                  <Chip pressed={speciality === null} onClick={() => setSpeciality(null)}>
                    {t("explore.allSpecialities")}
                  </Chip>
                  {chips.map((c) => (
                    <Chip
                      key={c.key}
                      pressed={speciality === c.key}
                      onClick={() => setSpeciality(speciality === c.key ? null : c.key)}
                    >
                      {c.label}
                    </Chip>
                  ))}
                </ChipRow>
              )}
              <ChipRow label={t("explore.dayLabel")}>
                {DAYS.map((d) => (
                  <Chip key={d.value} pressed={day === d.value} onClick={() => setDay(d.value)}>
                    {t(`explore.${d.key}`)}
                    <span className={cn("tabular-nums", day === d.value ? "opacity-80" : "text-muted-foreground")}>
                      {formatNumber(dayCounts[d.value] ?? 0)}
                    </span>
                  </Chip>
                ))}
              </ChipRow>
            </div>

            <div className="flex min-h-11 items-center justify-between gap-3">
              <p className="text-sm font-medium text-muted-foreground" aria-live="polite">
                {shown.length === 1
                  ? t("explore.doctorCountOne")
                  : t("explore.doctorCount", {
                      count: formatNumber(shown.length),
                    })}
              </p>
              {filtered && (
                <Button variant="ghost" className="h-11" onClick={clearAll}>
                  <X className="mr-1.5 h-4 w-4" />
                  {t("explore.clearFilters")}
                </Button>
              )}
            </div>

            {shown.length === 0 ? (
              <EmptyState icon={SearchX} title={t("explore.noResults")} hint={t("explore.noResultsHint")}>
                <Button variant="outline" className="h-11" onClick={clearAll}>
                  {t("explore.clearFilters")}
                </Button>
              </EmptyState>
            ) : (
              <ul className="grid gap-4 md:grid-cols-2">
                {shown.map((d) => (
                  <li key={`${d.pharmacyCode}-${d.doctorId}`} className="flex">
                    <DoctorCard doctor={d} day={day} today={today} />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </main>

      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>{t("explore.footerNote")}</p>
          <Link href="/" className="font-medium text-primary underline-offset-4 hover:underline">
            {t("explore.forPharmacies")}
          </Link>
        </div>
      </footer>
    </div>
  )
}

function ChipRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
        {children}
      </div>
    </div>
  )
}

function Chip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-full border px-4 text-sm font-medium transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        pressed
          ? "border-primary bg-primary text-primary-foreground"
          : "bg-card text-foreground hover:border-primary/40 hover:bg-primary/5",
      )}
    >
      {children}
    </button>
  )
}

const initials = (name: string) =>
  name
    .replace(/^dr\.?\s+/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("")

function DoctorCard({ doctor, day, today }: { doctor: ExploreDoctor; day: ExploreDay; today: string }) {
  const t = useTranslations("appointments")
  const { formatNumber, formatBsDate, localizeDigits } = useI18n()
  const days = useDayNames()
  const next = nextOpenSitting(doctor, day, today)
  const where = next ?? doctor.sittings[0]
  const openDates = [...new Set(doctor.sittings.filter((s) => s.placesLeft > 0).map((s) => s.date))]
  const shownDates = openDates.slice(0, 4)
  const dayLabel = (date: string) =>
    date === today
      ? t("publicBook.today")
      : date === addDaysYmd(today, 1)
        ? t("explore.dayTomorrow")
        : `${days.short[new Date(`${date}T00:00:00Z`).getUTCDay()]} ${formatBsDate(date, false)}`

  return (
    <article className="flex w-full flex-col rounded-2xl border bg-card p-5 shadow-sm transition-shadow duration-200 hover:shadow-md">
      <header className="flex items-start gap-4">
        <div
          aria-hidden
          className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 font-display text-base font-bold text-primary"
        >
          {initials(doctor.name) || "Dr"}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-semibold leading-tight">{doctor.name}</h2>
          {doctor.speciality && (
            <p className="mt-1 inline-flex rounded-md bg-muted px-2 py-0.5 text-sm font-medium text-foreground">
              {doctor.speciality}
            </p>
          )}
        </div>
        {doctor.fee > 0 && (
          <div className="shrink-0 text-right">
            <p className="text-xs text-muted-foreground">{t("explore.feeLabel")}</p>
            <p className="font-display text-lg font-bold tabular-nums">
              {t("explore.feeAmount", { amount: formatNumber(doctor.fee) })}
            </p>
          </div>
        )}
      </header>

      <dl className="mt-4 space-y-2 text-base">
        <div className="flex items-start gap-2.5">
          <dt className="sr-only">{t("explore.pharmacyLabel")}</dt>
          <Store className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <dd className="font-medium">{doctor.pharmacyName}</dd>
        </div>
        {where && (where.branchName || where.branchAddress) && (
          <div className="flex items-start gap-2.5">
            <dt className="sr-only">{t("explore.whereLabel")}</dt>
            <MapPin className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <dd className="text-muted-foreground">{[where.branchName, where.branchAddress].filter(Boolean).join(", ")}</dd>
          </div>
        )}
      </dl>

      <div className={cn("mt-4 rounded-xl border p-3", next ? "border-success/30 bg-success/10" : "border-border bg-muted/50")}>
        {next ? (
          <>
            <p className="flex items-center gap-2 text-sm font-semibold text-success">
              <span className="size-2 rounded-full bg-success" aria-hidden />
              {t("explore.nextOpen")}
            </p>
            <p className="mt-1 text-base font-medium">
              {dayLabel(next.date)} · {localizeDigits(formatTimeRange(next.startTime, next.endTime))}
            </p>
            <p className="text-sm text-muted-foreground">
              {t("publicBook.placesLeft", {
                count: formatNumber(next.placesLeft),
              })}
            </p>
          </>
        ) : (
          <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <span className="size-2 rounded-full bg-muted-foreground" aria-hidden />
            {t("explore.allFull")}
          </p>
        )}
      </div>

      {openDates.length > 1 && (
        <div className="mt-3">
          <p className="sr-only">{t("explore.openDays")}</p>
          <ul className="flex flex-wrap gap-1.5">
            {shownDates.map((date) => (
              <li
                key={date}
                className={cn(
                  "rounded-md border px-2 py-1 text-xs font-medium",
                  date === next?.date ? "border-success/40 text-success" : "text-muted-foreground",
                )}
              >
                {dayLabel(date)}
              </li>
            ))}
            {openDates.length > shownDates.length && (
              <li className="px-1 py-1 text-xs text-muted-foreground">
                {t("explore.moreDays", {
                  count: formatNumber(openDates.length - shownDates.length),
                })}
              </li>
            )}
          </ul>
        </div>
      )}

      <div className="mt-auto pt-5">
        <Button asChild size="lg" variant={next ? "default" : "outline"} className="h-12 w-full text-base">
          <Link href={exploreBookingHref(doctor)} aria-label={`${t("explore.book")} — ${doctor.name}, ${doctor.pharmacyName}`}>
            <Ticket className="mr-2 h-5 w-5" aria-hidden />
            {t("explore.book")}
            <ChevronRight className="ml-auto h-5 w-5" aria-hidden />
          </Link>
        </Button>
      </div>
    </article>
  )
}

function CardSkeleton() {
  return (
    <div className="space-y-4 rounded-2xl border bg-card p-5">
      <div className="flex items-center gap-4">
        <Skeleton className="size-12 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      </div>
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-16 w-full rounded-xl" />
      <Skeleton className="h-12 w-full" />
    </div>
  )
}

function EmptyState({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  hint?: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed bg-card px-6 py-12 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-muted">
        <Icon className="h-7 w-7 text-muted-foreground" />
      </div>
      <p className="text-lg font-semibold">{title}</p>
      {hint && <p className="max-w-md text-base text-muted-foreground">{hint}</p>}
      {children}
    </div>
  )
}
