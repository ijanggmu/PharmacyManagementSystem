"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { ChevronRight, Plus, Search, Stethoscope } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SkeletonTable } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { useCurrency } from "@/lib/contexts/currency-context"
import { useTranslations } from "@/lib/i18n/i18n-provider"
import type { Doctor } from "@/features/appointments/api-client"
import { useDayNames } from "@/features/appointments/components/day-names"
import { DoctorFormDialog, EMPTY_DOCTOR } from "@/features/appointments/components/doctor-form-dialog"
import { useDoctors } from "@/features/appointments/hooks/use-doctors"
import { formatTimeRange } from "@/features/appointments/lib/timetable"

/** "Sun, Wed · 4:00–7:00 pm", or each sitting when the times differ. */
function useDaysSummary() {
  const days = useDayNames()
  return (doctor: Doctor): string | null => {
    if (doctor.weeklySlots.length === 0) return null
    const byTime = new Map<string, number[]>()
    for (const s of doctor.weeklySlots) {
      const key = formatTimeRange(s.startTime, s.endTime)
      byTime.set(key, [...(byTime.get(key) ?? []), s.dayOfWeek])
    }
    return [...byTime.entries()]
      .map(([time, dayList]) => `${[...new Set(dayList)].sort().map((d) => days.short[d]).join(", ")} · ${time}`)
      .join("; ")
  }
}

export function DoctorsList({ canManage }: { canManage: boolean }) {
  const t = useTranslations("appointments")
  const router = useRouter()
  const { formatCurrency } = useCurrency()
  const daysSummary = useDaysSummary()
  const [search, setSearch] = useState("")
  const [includeInactive, setIncludeInactive] = useState(false)
  const [adding, setAdding] = useState(false)
  const doctors = useDoctors({ search, includeInactive })
  const items = doctors.data?.items ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="doctor-search">{t("doctors.search")}</Label>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
            <Input
              id="doctor-search"
              className="h-9 w-64 pl-8"
              placeholder={t("doctors.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <label className="flex h-9 items-center gap-2 text-sm">
          <Switch checked={includeInactive} onCheckedChange={setIncludeInactive} aria-label={t("doctors.showStopped")} />
          {t("doctors.showStopped")}
        </label>
        {canManage && (
          <Button className="ml-auto" onClick={() => setAdding(true)}>
            <Plus className="mr-1 h-4 w-4" /> {t("doctors.add")}
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {doctors.isLoading ? (
            <SkeletonTable rows={4} cols={5} />
          ) : doctors.isError ? (
            <ErrorState message={apiRequestErrorMessage(doctors.error)} onRetry={() => void doctors.refetch()} />
          ) : items.length === 0 ? (
            <EmptyState
              icon={Stethoscope}
              title={t("doctors.emptyTitle")}
              description={t("doctors.emptyDescription")}
              action={canManage ? { label: t("doctors.add"), onClick: () => setAdding(true) } : undefined}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("doctors.name")}</TableHead>
                  <TableHead>{t("doctors.days")}</TableHead>
                  <TableHead className="text-right">{t("doctors.fee")}</TableHead>
                  <TableHead className="text-right">{t("doctors.doctorGets")}</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((d) => (
                  <TableRow key={d.id} className="cursor-pointer" onClick={() => router.push(`/dashboard/doctors/${d.id}`)}>
                    <TableCell>
                      <Link href={`/dashboard/doctors/${d.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                        {d.name}
                      </Link>
                      {!d.isActive && (
                        <Badge variant="outline" className="ml-2">
                          {t("doctors.stopped")}
                        </Badge>
                      )}
                      {d.speciality && <div className="text-xs text-muted-foreground">{d.speciality}</div>}
                    </TableCell>
                    <TableCell className="text-sm">
                      {daysSummary(d) ?? <span className="text-muted-foreground">{t("doctors.noDays")}</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(d.fee)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(d.doctorShareAmount)}</TableCell>
                    <TableCell className="text-right">
                      <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" aria-label={t("doctors.open")} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {adding && (
        <DoctorFormDialog
          editing={{ id: null, input: EMPTY_DOCTOR }}
          onClose={() => setAdding(false)}
          onSaved={(doctorId) => router.push(`/dashboard/doctors/${doctorId}`)}
        />
      )}
    </div>
  )
}
