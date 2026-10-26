"use client"

import Link from "next/link"
import { useState } from "react"
import { CalendarDays, CalendarOff, FilePlus2, Plus, Stethoscope } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { DatePicker } from "@/components/ui/date-picker"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Label } from "@/components/ui/label"
import { SkeletonTable } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { useCurrency } from "@/lib/contexts/currency-context"
import { useI18n, useTranslations } from "@/lib/i18n/i18n-provider"
import { cn } from "@/lib/utils"
import { nepalTodayYmd } from "@/lib/utils/date-limits"
import { BranchFilterSelect, useBranchFilter } from "@/features/branches/components/branch-filter"
import type { Appointment, AppointmentStatus, DaySheetSession, PaymentMethod } from "@/features/appointments/api-client"
import { BookTokenDialog } from "@/features/appointments/components/book-token-dialog"
import { ArriveDialog, CancelTokenDialog } from "@/features/appointments/components/token-dialogs"
import { useDaySheet, useMarkNoShow, useMarkSeen } from "@/features/appointments/hooks/use-doctors"
import type { DeskAccess } from "@/features/appointments/lib/appointments-permissions"
import { placesLeft, prescriptionHref, tokenActions } from "@/features/appointments/lib/desk"
import { formatTimeRange } from "@/features/appointments/lib/timetable"

const STATUS_STYLE: Record<AppointmentStatus, string> = {
  Booked: "border-transparent bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  Arrived: "border-transparent bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  Seen: "border-transparent bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  NoShow: "text-muted-foreground",
  Cancelled: "text-muted-foreground line-through",
}

type OpenDialog =
  | { kind: "book"; preset?: { doctorId: string; date: string; startTime: string } }
  | { kind: "arrive"; appointment: Appointment; fee: number }
  | { kind: "cancel"; appointment: Appointment }
  | null

/** The doctors' desk for one date: every sitting with its tokens, in token order. */
export function AppointmentsDesk({ access, initialDate }: { access: DeskAccess; initialDate?: string }) {
  const t = useTranslations("appointments")
  const { formatBsDate } = useI18n()
  const filter = useBranchFilter()
  const today = nepalTodayYmd()
  const [date, setDate] = useState(initialDate || today)
  const sheet = useDaySheet(date, filter.branchId)
  const [dialog, setDialog] = useState<OpenDialog>(null)
  const sessions = sheet.data?.sessions ?? []
  const daysOff = sheet.data?.daysOff ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="desk-date">{t("desk.date")}</Label>
          <DatePicker id="desk-date" value={date} onChange={(v) => v && setDate(v)} allowFuture />
        </div>
        {date !== today && (
          <Button variant="outline" size="sm" className="h-9" onClick={() => setDate(today)}>
            {t("desk.today")}
          </Button>
        )}
        <BranchFilterSelect filter={filter} />
        <span className="text-sm font-medium" aria-live="polite">
          {formatBsDate(date)}
        </span>
        {access.canBook && (
          <Button className="ml-auto" onClick={() => setDialog({ kind: "book" })}>
            <Plus className="mr-1 h-4 w-4" /> {t("desk.bookToken")}
          </Button>
        )}
      </div>

      {daysOff.map((d) => (
        <p key={d.doctorId} className="flex items-center gap-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          <CalendarOff className="h-4 w-4" aria-hidden />
          {t("desk.notComing", { name: d.doctorName })}
          {d.note && ` · ${d.note}`}
        </p>
      ))}

      {sheet.isLoading ? (
        <Card>
          <CardContent className="p-0">
            <SkeletonTable rows={4} cols={5} />
          </CardContent>
        </Card>
      ) : sheet.isError ? (
        <ErrorState message={apiRequestErrorMessage(sheet.error)} onRetry={() => void sheet.refetch()} />
      ) : sessions.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={CalendarDays}
              title={t("desk.emptyTitle")}
              description={t("desk.emptyDescription")}
              action={{ label: t("desk.setDays"), href: "/dashboard/doctors" }}
            />
          </CardContent>
        </Card>
      ) : (
        sessions.map((s) => (
          <SittingCard
            key={`${s.doctorId}-${s.startTime}`}
            session={s}
            access={access}
            branchLabel={filter.showBranchColumn ? filter.branchName(s.branchId) : undefined}
            onBook={() => setDialog({ kind: "book", preset: { doctorId: s.doctorId, date: s.date, startTime: s.startTime } })}
            onArrive={(a) => setDialog({ kind: "arrive", appointment: a, fee: s.fee })}
            onCancel={(a) => setDialog({ kind: "cancel", appointment: a })}
          />
        ))
      )}

      {dialog?.kind === "book" && <BookTokenDialog preset={dialog.preset} branchId={filter.branchId} onClose={() => setDialog(null)} />}
      {dialog?.kind === "arrive" && <ArriveDialog appointment={dialog.appointment} fee={dialog.fee} onClose={() => setDialog(null)} />}
      {dialog?.kind === "cancel" && <CancelTokenDialog appointment={dialog.appointment} onClose={() => setDialog(null)} />}
    </div>
  )
}

function SittingCard({
  session,
  access,
  branchLabel,
  onBook,
  onArrive,
  onCancel,
}: {
  session: DaySheetSession
  access: DeskAccess
  branchLabel?: string
  onBook: () => void
  onArrive: (a: Appointment) => void
  onCancel: (a: Appointment) => void
}) {
  const t = useTranslations("appointments")
  const { formatNumber } = useI18n()
  const full = placesLeft(session) === 0

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center gap-3 space-y-0 pb-3">
        <Stethoscope className="h-5 w-5 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <Link href={`/dashboard/doctors/${session.doctorId}`} className="font-semibold hover:underline">
            {session.doctorName}
          </Link>
          <div className="text-sm text-muted-foreground">
            {[session.speciality, formatTimeRange(session.startTime, session.endTime), branchLabel, session.isExtraDay ? t("desk.extraDay") : null]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
        <Badge variant={full ? "secondary" : "outline"} className="tabular-nums">
          {full ? t("desk.full") : t("desk.tokens", { booked: formatNumber(session.booked), max: formatNumber(session.maxTokens) })}
        </Badge>
        {access.canBook && (
          <Button size="sm" variant="outline" onClick={onBook} disabled={full}>
            <Plus className="mr-1 h-4 w-4" /> {t("desk.bookToken")}
          </Button>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {session.appointments.length === 0 ? (
          <p className="px-6 pb-4 text-sm text-muted-foreground">{t("desk.noTokens")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">{t("desk.token")}</TableHead>
                <TableHead>{t("desk.patient")}</TableHead>
                <TableHead>{t("desk.status")}</TableHead>
                <TableHead className="text-right">{t("desk.fee")}</TableHead>
                <TableHead className="text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {session.appointments.map((a) => (
                <TokenRow
                  key={a.id}
                  appointment={a}
                  nmcNumber={session.nmcNumber}
                  access={access}
                  onArrive={() => onArrive(a)}
                  onCancel={() => onCancel(a)}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

function TokenRow({
  appointment: a,
  nmcNumber,
  access,
  onArrive,
  onCancel,
}: {
  appointment: Appointment
  nmcNumber: string | null
  access: DeskAccess
  onArrive: () => void
  onCancel: () => void
}) {
  const t = useTranslations("appointments")
  const { toast } = useToast()
  const { formatCurrency } = useCurrency()
  const seen = useMarkSeen()
  const noShow = useMarkNoShow()
  const actions = tokenActions(a, access)
  const done = a.status === "Cancelled" || a.status === "NoShow"
  const busy = seen.isPending || noShow.isPending

  const run = (mutation: typeof seen | typeof noShow) =>
    mutation.mutate(
      { id: a.id },
      { onError: (error) => toast({ title: t("desk.failed"), description: apiRequestErrorMessage(error), variant: "destructive" }) },
    )

  return (
    <TableRow className={cn(done && "opacity-60")}>
      <TableCell className="text-lg font-semibold tabular-nums">{a.tokenNo}</TableCell>
      <TableCell>
        <div className="font-medium">
          {a.patientName}
          {a.source === "Online" && (
            <Badge variant="outline" className="ml-2">
              {t("desk.online")}
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {a.patientPhone && (
            <a href={`tel:${a.patientPhone}`} className="hover:underline">
              {a.patientPhone}
            </a>
          )}
          {a.note && ` · ${a.note}`}
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="outline" className={STATUS_STYLE[a.status]}>
          {t(`status.${a.status}`)}
        </Badge>
      </TableCell>
      <TableCell className="text-right text-sm tabular-nums">
        {a.feeRefundedAtUtc ? (
          <span className="text-muted-foreground">{t("desk.refunded")}</span>
        ) : a.feePaidAtUtc && a.feeAmount != null ? (
          <>
            {formatCurrency(a.feeAmount)}
            <div className="text-xs text-muted-foreground">{a.paymentMethod ? t(`methods.${a.paymentMethod as PaymentMethod}`) : ""}</div>
          </>
        ) : a.arrivedAtUtc ? (
          <span className="text-muted-foreground">{t("desk.free")}</span>
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex flex-wrap justify-end gap-1.5">
          {actions.arrive && (
            <Button size="sm" onClick={onArrive} disabled={busy}>
              {t("desk.arrived")}
            </Button>
          )}
          {actions.prescribe && (
            <Button size="sm" variant="outline" asChild>
              <Link href={prescriptionHref(a, nmcNumber)}>
                <FilePlus2 className="mr-1 h-4 w-4" /> {t("desk.writePrescription")}
              </Link>
            </Button>
          )}
          {actions.seen && (
            <Button size="sm" variant="outline" onClick={() => run(seen)} disabled={busy}>
              {t("desk.seen")}
            </Button>
          )}
          {actions.noShow && (
            <Button size="sm" variant="ghost" onClick={() => run(noShow)} disabled={busy}>
              {t("desk.noShow")}
            </Button>
          )}
          {actions.cancel && (
            <Button size="sm" variant="ghost" className="text-destructive" onClick={onCancel} disabled={busy}>
              {t("desk.cancel")}
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  )
}
