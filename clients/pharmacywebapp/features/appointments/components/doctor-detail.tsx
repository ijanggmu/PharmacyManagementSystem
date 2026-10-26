"use client"

import Link from "next/link"
import { useState } from "react"
import { ArrowLeft, CalendarOff, CalendarPlus, CalendarRange, Pencil, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ErrorState } from "@/components/ui/error-state"
import { LoadingState } from "@/components/ui/loading-state"
import { useToast } from "@/hooks/use-toast"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { useCurrency } from "@/lib/contexts/currency-context"
import { useI18n, useTranslations } from "@/lib/i18n/i18n-provider"
import { nepalTodayYmd } from "@/lib/utils/date-limits"
import { useBranchNames } from "@/features/branches/components/branch-filter"
import type { DayChangeKind, Doctor } from "@/features/appointments/api-client"
import { DayChangeDialog } from "@/features/appointments/components/day-change-dialog"
import { DoctorMoneyCard } from "@/features/appointments/components/doctor-money-card"
import { useDayNames } from "@/features/appointments/components/day-names"
import { DoctorFormDialog, doctorToInput } from "@/features/appointments/components/doctor-form-dialog"
import { WeeklyDaysDialog } from "@/features/appointments/components/weekly-days-dialog"
import { useDoctor, useRemoveDayChange, useSetDoctorActive } from "@/features/appointments/hooks/use-doctors"
import type { DeskAccess } from "@/features/appointments/lib/appointments-permissions"
import { formatTime12 } from "@/features/appointments/lib/timetable"

export function DoctorDetail({ doctorId, canManage, access }: { doctorId: string; canManage: boolean; access: DeskAccess }) {
  const t = useTranslations("appointments")
  const doctor = useDoctor(doctorId)

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/dashboard/doctors">
          <ArrowLeft className="mr-1 h-4 w-4" /> {t("detail.back")}
        </Link>
      </Button>
      {doctor.isLoading ? (
        <LoadingState />
      ) : doctor.isError || !doctor.data ? (
        <ErrorState message={apiRequestErrorMessage(doctor.error)} onRetry={() => void doctor.refetch()} />
      ) : (
        <>
          <DoctorSummaryCard doctor={doctor.data} canManage={canManage} />
          <div className="grid gap-4 lg:grid-cols-2">
            <WeeklyDaysCard doctor={doctor.data} canManage={canManage} />
            <DayChangesCard doctor={doctor.data} canManage={canManage} />
          </div>
          {access.canViewPayouts && <DoctorMoneyCard doctor={doctor.data} canPay={access.canPay} />}
        </>
      )}
    </div>
  )
}

function DoctorSummaryCard({ doctor, canManage }: { doctor: Doctor; canManage: boolean }) {
  const t = useTranslations("appointments")
  const { toast } = useToast()
  const { formatCurrency } = useCurrency()
  const setActive = useSetDoctorActive()
  const [editing, setEditing] = useState(false)
  const [confirmStop, setConfirmStop] = useState(false)

  const changeActive = (isActive: boolean) =>
    setActive.mutate(
      { id: doctor.id, isActive },
      {
        onSuccess: () => {
          toast({ title: isActive ? t("detail.restarted") : t("detail.stopped") })
          setConfirmStop(false)
        },
        onError: (error) => toast({ title: t("detail.changeFailed"), description: apiRequestErrorMessage(error), variant: "destructive" }),
      },
    )

  return (
    <Card>
      <CardContent className="flex flex-wrap items-start gap-4 p-4">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold">{doctor.name}</h2>
            {!doctor.isActive && <Badge variant="outline">{t("doctors.stopped")}</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            {[doctor.speciality, doctor.nmcNumber && `${t("detail.nmc")} ${doctor.nmcNumber}`, doctor.phone && `${t("detail.phone")} ${doctor.phone}`]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold tabular-nums">
            {formatCurrency(doctor.fee)} <span className="text-sm font-normal text-muted-foreground">{t("detail.perPatient")}</span>
          </div>
          <div className="text-sm text-muted-foreground">{t("detail.doctorGetsAmount", { amount: formatCurrency(doctor.doctorShareAmount) })}</div>
        </div>
        {canManage && (
          <div className="flex w-full flex-wrap justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="mr-1 h-4 w-4" /> {t("doctors.edit")}
            </Button>
            {doctor.isActive ? (
              <Button variant="outline" size="sm" onClick={() => setConfirmStop(true)}>
                {t("detail.stop")}
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled={setActive.isPending} onClick={() => changeActive(true)}>
                {t("detail.restart")}
              </Button>
            )}
          </div>
        )}
      </CardContent>

      {editing && <DoctorFormDialog editing={{ id: doctor.id, input: doctorToInput(doctor) }} onClose={() => setEditing(false)} />}
      <ConfirmDialog
        isOpen={confirmStop}
        onClose={() => setConfirmStop(false)}
        onConfirm={() => changeActive(false)}
        title={t("detail.stopTitle")}
        description={t("detail.stopDescription")}
        confirmText={t("detail.stop")}
        cancelText={t("form.cancel")}
        loading={setActive.isPending}
      />
    </Card>
  )
}

function WeeklyDaysCard({ doctor, canManage }: { doctor: Doctor; canManage: boolean }) {
  const t = useTranslations("appointments")
  const { formatNumber } = useI18n()
  const days = useDayNames()
  const { branchName, multiBranch } = useBranchNames()
  const [editing, setEditing] = useState(false)

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base">{t("weekly.title")}</CardTitle>
          <CardDescription>{t("weekly.description")}</CardDescription>
        </div>
        {canManage && (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <CalendarRange className="mr-1 h-4 w-4" /> {t("weekly.edit")}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {doctor.weeklySlots.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("weekly.empty")}</p>
        ) : (
          <ul className="divide-y">
            {doctor.weeklySlots.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="font-medium">{days.long[s.dayOfWeek]}</span>
                <span className="tabular-nums">
                  {formatTime12(s.startTime)} – {formatTime12(s.endTime)}
                </span>
                <span className="text-muted-foreground">
                  {t("weekly.patientsCount", { count: formatNumber(s.maxTokens) })}
                  {multiBranch && ` · ${branchName(s.branchId)}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {editing && <WeeklyDaysDialog doctor={doctor} onClose={() => setEditing(false)} />}
    </Card>
  )
}

function DayChangesCard({ doctor, canManage }: { doctor: Doctor; canManage: boolean }) {
  const t = useTranslations("appointments")
  const { toast } = useToast()
  const { formatBsDate } = useI18n()
  const { branchName, multiBranch } = useBranchNames()
  const remove = useRemoveDayChange()
  const [adding, setAdding] = useState<DayChangeKind | null>(null)
  const today = nepalTodayYmd()
  const upcoming = doctor.dayChanges.filter((c) => c.date >= today)

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="text-base">{t("changes.title")}</CardTitle>
        <CardDescription>{t("changes.description")}</CardDescription>
        {canManage && (
          <div className="flex flex-wrap gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setAdding("DayOff")}>
              <CalendarOff className="mr-1 h-4 w-4" /> {t("changes.addDayOff")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAdding("ExtraDay")}>
              <CalendarPlus className="mr-1 h-4 w-4" /> {t("changes.addExtraDay")}
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("changes.empty")}</p>
        ) : (
          <ul className="divide-y">
            {upcoming.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {formatBsDate(c.date)} <span className="text-xs font-normal text-muted-foreground">({c.date})</span>
                  </div>
                  <div className="text-muted-foreground">
                    {c.kind === "DayOff"
                      ? t("changes.dayOff")
                      : `${t("changes.extraDay")} · ${formatTime12(c.startTime ?? "")} – ${formatTime12(c.endTime ?? "")}${multiBranch ? ` · ${branchName(c.branchId)}` : ""}`}
                    {c.note && ` · ${c.note}`}
                  </div>
                </div>
                <Badge variant={c.kind === "DayOff" ? "outline" : "secondary"}>
                  {c.kind === "DayOff" ? t("changes.dayOff") : t("changes.extraDay")}
                </Badge>
                {canManage && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("changes.remove")}
                    disabled={remove.isPending}
                    onClick={() =>
                      remove.mutate(
                        { id: doctor.id, dayChangeId: c.id },
                        {
                          onSuccess: () => toast({ title: t("changes.removed") }),
                          onError: (error) =>
                            toast({ title: t("changes.failed"), description: apiRequestErrorMessage(error), variant: "destructive" }),
                        },
                      )
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {adding && <DayChangeDialog key={adding} doctor={doctor} kind={adding} onClose={() => setAdding(null)} />}
    </Card>
  )
}
