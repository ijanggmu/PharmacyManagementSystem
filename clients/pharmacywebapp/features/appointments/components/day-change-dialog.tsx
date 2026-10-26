"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { newIdempotencyKey } from "@/lib/api/idempotency"
import { useTranslations } from "@/lib/i18n/i18n-provider"
import { nepalTodayYmd } from "@/lib/utils/date-limits"
import { useBranchAccess } from "@/features/branches/hooks/use-branch-access"
import type { DayChangeInput, DayChangeKind, Doctor } from "@/features/appointments/api-client"
import { useAddDayChange } from "@/features/appointments/hooks/use-doctors"

/** Marks one date as a day off, or adds an extra sitting on one date. */
export function DayChangeDialog({ doctor, kind, onClose }: { doctor: Doctor; kind: DayChangeKind; onClose: () => void }) {
  const t = useTranslations("appointments")
  const { toast } = useToast()
  const access = useBranchAccess()
  const add = useAddDayChange()
  const today = nepalTodayYmd()
  const extra = kind === "ExtraDay"
  const lastSlot = doctor.weeklySlots.at(-1)
  const [idempotencyKey] = useState(() => newIdempotencyKey())
  const [form, setForm] = useState<DayChangeInput>({
    date: today,
    kind,
    branchId: lastSlot?.branchId ?? access.ownBranchId ?? access.branches[0]?.id ?? "",
    startTime: lastSlot?.startTime ?? "16:00",
    endTime: lastSlot?.endTime ?? "19:00",
    maxTokens: lastSlot?.maxTokens ?? 20,
    note: "",
  })
  const set = <K extends keyof DayChangeInput>(key: K, value: DayChangeInput[K]) => setForm((f) => ({ ...f, [key]: value }))

  const branchId = form.branchId || access.ownBranchId || access.branches[0]?.id || ""
  const invalid =
    !form.date ||
    form.date < today ||
    (extra && (!branchId || !form.startTime || !form.endTime || form.endTime <= form.startTime || !(form.maxTokens >= 1 && form.maxTokens <= 500)))

  const submit = () =>
    add.mutate(
      { id: doctor.id, input: { ...form, branchId }, idempotencyKey },
      {
        onSuccess: () => {
          toast({ title: t("changes.added") })
          onClose()
        },
        onError: (error) => toast({ title: t("changes.failed"), description: apiRequestErrorMessage(error), variant: "destructive" }),
      },
    )

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{extra ? t("changes.extraDayTitle") : t("changes.dayOffTitle")}</DialogTitle>
          <DialogDescription>{extra ? t("changes.extraDayDescription") : t("changes.dayOffDescription")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="day-change-date">{t("changes.date")}</Label>
            <DatePicker id="day-change-date" value={form.date} onChange={(v) => set("date", v)} min={today} allowFuture />
          </div>

          {extra && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {access.branches.length > 1 && (
                <div className="col-span-2 space-y-1.5 sm:col-span-3">
                  <Label htmlFor="day-change-branch">{t("weekly.branch")}</Label>
                  <Select value={branchId} onValueChange={(v) => set("branchId", v)}>
                    <SelectTrigger id="day-change-branch">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {access.branches
                        .filter((b) => b.isActive)
                        .map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="day-change-from">{t("weekly.from")}</Label>
                <Input id="day-change-from" type="time" value={form.startTime} onChange={(e) => set("startTime", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="day-change-to">{t("weekly.to")}</Label>
                <Input id="day-change-to" type="time" value={form.endTime} onChange={(e) => set("endTime", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="day-change-tokens">{t("weekly.patients")}</Label>
                <Input
                  id="day-change-tokens"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={500}
                  value={Number.isFinite(form.maxTokens) ? form.maxTokens : ""}
                  onChange={(e) => set("maxTokens", e.target.value === "" ? 0 : Number(e.target.value))}
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="day-change-note">{t("changes.note")}</Label>
            <Input
              id="day-change-note"
              value={form.note}
              maxLength={256}
              placeholder={t("changes.notePlaceholder")}
              onChange={(e) => set("note", e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("form.cancel")}
          </Button>
          <Button onClick={submit} disabled={invalid || add.isPending}>
            {t("form.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
