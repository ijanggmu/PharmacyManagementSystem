"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { SkeletonTable } from "@/components/ui/skeleton"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { useI18n, useTranslations } from "@/lib/i18n/i18n-provider"
import { cn } from "@/lib/utils"
import { nepalTodayYmd } from "@/lib/utils/date-limits"
import { BranchFilterSelect, useBranchFilter } from "@/features/branches/components/branch-filter"
import type { Timetable, TimetableSession } from "@/features/appointments/api-client"
import { useDayNames } from "@/features/appointments/components/day-names"
import { useTimetable } from "@/features/appointments/hooks/use-doctors"
import { addDaysYmd, dayOfWeekYmd, formatTimeRange, timetableGrid, weekDates, weekStartYmd } from "@/features/appointments/lib/timetable"

/** The doctors' week: doctors down the side, Sunday to Saturday across (one card per day on a phone). */
export function TimetableWeek({ canManage }: { canManage: boolean }) {
  const t = useTranslations("appointments")
  const { formatBsDate } = useI18n()
  const days = useDayNames()
  const filter = useBranchFilter()
  const today = nepalTodayYmd()
  const [weekStart, setWeekStart] = useState(() => weekStartYmd(today))
  const dates = useMemo(() => weekDates(weekStart), [weekStart])
  const timetable = useTimetable({ from: dates[0], to: dates[6], branchId: filter.branchId })
  const data = timetable.data
  const grid = useMemo(() => timetableGrid(data?.sessions ?? [], dates), [data, dates])
  // Several branches on screen at once: each sitting says where it is.
  const branchLabel = (branchId: string) => (filter.showBranchColumn ? filter.branchName(branchId) : undefined)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <BranchFilterSelect filter={filter} />
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" aria-label={t("timetable.previous")} onClick={() => setWeekStart((w) => addDaysYmd(w, -7))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(weekStartYmd(today))} disabled={weekStart === weekStartYmd(today)}>
            {t("timetable.thisWeek")}
          </Button>
          <Button variant="outline" size="icon" aria-label={t("timetable.next")} onClick={() => setWeekStart((w) => addDaysYmd(w, 7))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <span className="text-sm font-medium" aria-live="polite">
          {t("timetable.weekOf", { from: formatBsDate(dates[0], false), to: formatBsDate(dates[6]) })}
        </span>
      </div>

      <Card>
        <CardContent className="p-0">
          {timetable.isLoading ? (
            <SkeletonTable rows={4} cols={8} />
          ) : timetable.isError ? (
            <ErrorState message={apiRequestErrorMessage(timetable.error)} onRetry={() => void timetable.refetch()} />
          ) : grid.length === 0 && (data?.daysOff.length ?? 0) === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title={t("timetable.emptyTitle")}
              description={t("timetable.emptyDescription")}
              action={canManage ? { label: t("timetable.addDoctor"), href: "/dashboard/doctors" } : undefined}
            />
          ) : (
            <>
              <WeekTable grid={grid} dates={dates} daysOff={data?.daysOff ?? []} today={today} dayNames={days.short} branchLabel={branchLabel} />
              <DayCards data={data} dates={dates} today={today} dayNames={days.long} branchLabel={branchLabel} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

type Grid = ReturnType<typeof timetableGrid>

function SessionChip({ session, branchLabel }: { session: TimetableSession; branchLabel?: string }) {
  const t = useTranslations("appointments")
  const { formatNumber } = useI18n()
  return (
    <div className={cn("rounded-md border px-2 py-1 text-xs", session.isExtraDay ? "border-primary/40 bg-primary/5" : "bg-muted/40")}>
      <div className="whitespace-nowrap font-medium tabular-nums">{formatTimeRange(session.startTime, session.endTime)}</div>
      <div className="text-muted-foreground">
        {t("timetable.patientsMax", { count: formatNumber(session.maxTokens) })}
        {session.isExtraDay && ` · ${t("timetable.extra")}`}
      </div>
      {branchLabel && <div className="truncate text-muted-foreground">{branchLabel}</div>}
    </div>
  )
}

function DayOffChip({ note }: { note: string | null }) {
  const t = useTranslations("appointments")
  return (
    <div className="rounded-md border border-dashed px-2 py-1 text-xs text-muted-foreground" title={note ?? undefined}>
      {t("timetable.notComing")}
      {note && <div className="truncate">{note}</div>}
    </div>
  )
}

/** Wide screens: doctors as rows. Doctors who are off all week still get a row so the day off shows. */
function WeekTable({
  grid,
  dates,
  daysOff,
  today,
  dayNames,
  branchLabel,
}: {
  grid: Grid
  dates: string[]
  daysOff: Timetable["daysOff"]
  today: string
  dayNames: string[]
  branchLabel: (branchId: string) => string | undefined
}) {
  const t = useTranslations("appointments")
  const { formatBsDate } = useI18n()
  const rows = useMemo(() => {
    const known = new Set(grid.map((r) => r.doctorId))
    const offOnly = daysOff
      .filter((d) => !known.has(d.doctorId))
      .reduce<Grid>((acc, d) => {
        if (!acc.some((r) => r.doctorId === d.doctorId)) {
          acc.push({ doctorId: d.doctorId, doctorName: d.doctorName, speciality: null, cells: dates.map((date) => ({ date, sessions: [] })) })
        }
        return acc
      }, [])
    return [...grid, ...offOnly].sort((a, b) => a.doctorName.localeCompare(b.doctorName))
  }, [grid, daysOff, dates])

  return (
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full min-w-[56rem] table-fixed border-collapse text-sm">
        <thead>
          <tr className="border-b">
            <th className="w-48 p-3 text-left font-medium">{t("timetable.doctor")}</th>
            {dates.map((date) => (
              <th key={date} className={cn("p-3 text-left font-medium", date === today && "bg-primary/5")}>
                <div>{dayNames[dayOfWeekYmd(date)]}</div>
                <div className="text-xs font-normal text-muted-foreground">
                  {formatBsDate(date, false)}
                  {date === today && ` · ${t("timetable.today")}`}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.doctorId} className="border-b align-top last:border-0">
              <td className="p-3">
                <Link href={`/dashboard/doctors/${row.doctorId}`} className="font-medium hover:underline">
                  {row.doctorName}
                </Link>
                {row.speciality && <div className="text-xs text-muted-foreground">{row.speciality}</div>}
              </td>
              {row.cells.map((cell) => {
                const off = daysOff.find((d) => d.doctorId === row.doctorId && d.date === cell.date)
                return (
                  <td key={cell.date} className={cn("space-y-1 p-2", cell.date === today && "bg-primary/5")}>
                    {off && <DayOffChip note={off.note} />}
                    {cell.sessions.map((s) => (
                      <SessionChip key={`${s.startTime}-${s.branchId}`} session={s} branchLabel={branchLabel(s.branchId)} />
                    ))}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Phones: one card per day listing who comes. Days with nobody are left out. */
function DayCards({
  data,
  dates,
  today,
  dayNames,
  branchLabel,
}: {
  data: Timetable | undefined
  dates: string[]
  today: string
  dayNames: string[]
  branchLabel: (branchId: string) => string | undefined
}) {
  const t = useTranslations("appointments")
  const { formatBsDate } = useI18n()

  return (
    <div className="divide-y md:hidden">
      {dates.map((date) => {
        const sessions = (data?.sessions ?? []).filter((s) => s.date === date)
        const off = (data?.daysOff ?? []).filter((d) => d.date === date)
        if (sessions.length === 0 && off.length === 0) return null
        return (
          <section key={date} className={cn("space-y-2 p-3", date === today && "bg-primary/5")}>
            <h3 className="text-sm font-semibold">
              {dayNames[dayOfWeekYmd(date)]} · {formatBsDate(date, false)}
              {date === today && (
                <Badge variant="secondary" className="ml-2">
                  {t("timetable.today")}
                </Badge>
              )}
            </h3>
            {sessions.map((s) => (
              <div key={`${s.doctorId}-${s.startTime}`} className="flex items-center justify-between gap-2 text-sm">
                <Link href={`/dashboard/doctors/${s.doctorId}`} className="font-medium hover:underline">
                  {s.doctorName}
                </Link>
                <SessionChip session={s} branchLabel={branchLabel(s.branchId)} />
              </div>
            ))}
            {off.map((d) => (
              <div key={`off-${d.doctorId}`} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-muted-foreground">{d.doctorName}</span>
                <DayOffChip note={d.note} />
              </div>
            ))}
          </section>
        )
      })}
    </div>
  )
}
