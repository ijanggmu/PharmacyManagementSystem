"use client"

import { useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { useTranslations } from "@/lib/i18n/i18n-provider"
import { cn } from "@/lib/utils"
import { useBranchAccess } from "@/features/branches/hooks/use-branch-access"
import type { Doctor, WeeklySlotInput } from "@/features/appointments/api-client"
import { useDayNames } from "@/features/appointments/components/day-names"
import { useSetWeeklySlots } from "@/features/appointments/hooks/use-doctors"
import { weeklySlotProblems } from "@/features/appointments/lib/timetable"

/** Edits every weekly sitting at once; saving replaces the doctor's whole set. */
export function WeeklyDaysDialog({ doctor, onClose }: { doctor: Doctor; onClose: () => void }) {
  const t = useTranslations("appointments")
  const { toast } = useToast()
  const days = useDayNames()
  const access = useBranchAccess()
  const save = useSetWeeklySlots()
  const defaultBranch = access.ownBranchId ?? access.branches[0]?.id ?? ""
  const showBranch = access.branches.length > 1
  const [rows, setRows] = useState<WeeklySlotInput[]>(() =>
    doctor.weeklySlots.map((s) => ({
      branchId: s.branchId,
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
      maxTokens: s.maxTokens,
    })),
  )

  const withBranch = rows.map((r) => ({ ...r, branchId: r.branchId || defaultBranch }))
  const { invalidRows, overlappingRows } = weeklySlotProblems(withBranch)
  const update = (i: number, patch: Partial<WeeklySlotInput>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const addRow = () => {
    const last = rows.at(-1)
    setRows((rs) => [
      ...rs,
      {
        branchId: last?.branchId ?? defaultBranch,
        dayOfWeek: last ? (last.dayOfWeek + 1) % 7 : 0,
        startTime: last?.startTime ?? "16:00",
        endTime: last?.endTime ?? "19:00",
        maxTokens: last?.maxTokens ?? 20,
      },
    ])
  }

  const submit = () =>
    save.mutate(
      { id: doctor.id, slots: withBranch },
      {
        onSuccess: () => {
          toast({ title: t("weekly.saved") })
          onClose()
        },
        onError: (error) => toast({ title: t("weekly.saveFailed"), description: apiRequestErrorMessage(error), variant: "destructive" }),
      },
    )

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="overflow-x-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("weekly.title")}</DialogTitle>
          <DialogDescription>{t("weekly.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {rows.length === 0 && <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">{t("weekly.empty")}</p>}
          {rows.map((row, i) => {
            const flagged = invalidRows.includes(i) || overlappingRows.includes(i)
            return (
              <div
                key={i}
                className={cn(
                  // Fixed column widths so every row lines up, whatever day or branch name it shows.
                  "grid grid-cols-2 gap-2 rounded-lg border p-3 sm:items-end",
                  showBranch
                    ? "sm:grid-cols-[8.5rem_minmax(0,1fr)_7.5rem_7.5rem_5rem_2.25rem]"
                    : "sm:grid-cols-[minmax(0,1fr)_7.5rem_7.5rem_5rem_2.25rem]",
                  flagged && "border-destructive/60",
                )}
              >
                <div className="space-y-1">
                  <Label htmlFor={`slot-day-${i}`}>{t("weekly.day")}</Label>
                  <Select value={String(row.dayOfWeek)} onValueChange={(v) => update(i, { dayOfWeek: Number(v) })}>
                    <SelectTrigger id={`slot-day-${i}`} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {days.long.map((name, d) => (
                        <SelectItem key={d} value={String(d)}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {showBranch && (
                  <div className="space-y-1">
                    <Label htmlFor={`slot-branch-${i}`}>{t("weekly.branch")}</Label>
                    <Select value={row.branchId || defaultBranch} onValueChange={(v) => update(i, { branchId: v })}>
                      <SelectTrigger id={`slot-branch-${i}`} className="w-full min-w-0">
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
                <div className="space-y-1">
                  <Label htmlFor={`slot-from-${i}`}>{t("weekly.from")}</Label>
                  <Input id={`slot-from-${i}`} type="time" value={row.startTime} onChange={(e) => update(i, { startTime: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`slot-to-${i}`}>{t("weekly.to")}</Label>
                  <Input id={`slot-to-${i}`} type="time" value={row.endTime} onChange={(e) => update(i, { endTime: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`slot-tokens-${i}`} title={t("weekly.patientsHint")}>
                    {t("weekly.patients")}
                  </Label>
                  <Input
                    id={`slot-tokens-${i}`}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={500}
                    value={Number.isFinite(row.maxTokens) ? row.maxTokens : ""}
                    onChange={(e) => update(i, { maxTokens: e.target.value === "" ? 0 : Number(e.target.value) })}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="justify-self-end"
                  aria-label={t("weekly.remove")}
                  onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )
          })}

          <Button type="button" variant="outline" size="sm" onClick={addRow}>
            <Plus className="mr-1 h-4 w-4" /> {t("weekly.add")}
          </Button>
          <p className="text-xs text-muted-foreground">{t("weekly.patientsHint")}</p>

          {invalidRows.length > 0 && <p className="text-sm text-destructive">{t("weekly.rowInvalid")}</p>}
          {overlappingRows.length > 0 && <p className="text-sm text-destructive">{t("weekly.rowsOverlap")}</p>}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("form.cancel")}
          </Button>
          <Button onClick={submit} disabled={invalidRows.length > 0 || overlappingRows.length > 0 || save.isPending}>
            {t("weekly.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
