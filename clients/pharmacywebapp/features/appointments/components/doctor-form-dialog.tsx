"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { newIdempotencyKey } from "@/lib/api/idempotency"
import { useCurrency } from "@/lib/contexts/currency-context"
import { useTranslations } from "@/lib/i18n/i18n-provider"
import { cn } from "@/lib/utils"
import type { Doctor, DoctorInput, ShareType } from "@/features/appointments/api-client"
import { useSaveDoctor } from "@/features/appointments/hooks/use-doctors"
import { previewDoctorShare } from "@/features/appointments/lib/timetable"

export const EMPTY_DOCTOR: DoctorInput = {
  name: "",
  nmcNumber: "",
  speciality: "",
  phone: "",
  fee: 0,
  shareType: "Percent",
  shareValue: 0,
}

export function doctorToInput(d: Doctor): DoctorInput {
  return {
    name: d.name,
    nmcNumber: d.nmcNumber ?? "",
    speciality: d.speciality ?? "",
    phone: d.phone ?? "",
    fee: d.fee,
    shareType: d.shareType,
    shareValue: d.shareValue,
  }
}

/** Add or edit a doctor. `onSaved` gets the doctor's id (a new doctor opens on its own page). */
export function DoctorFormDialog({
  editing,
  onClose,
  onSaved,
}: {
  editing: { id: string | null; input: DoctorInput }
  onClose: () => void
  onSaved?: (doctorId: string) => void
}) {
  const t = useTranslations("appointments")
  const { toast } = useToast()
  const { formatCurrency } = useCurrency()
  const save = useSaveDoctor()
  const [form, setForm] = useState<DoctorInput>(editing.input)
  const [idempotencyKey] = useState(() => newIdempotencyKey())
  const set = <K extends keyof DoctorInput>(key: K, value: DoctorInput[K]) => setForm((f) => ({ ...f, [key]: value }))

  const percentTooHigh = form.shareType === "Percent" && form.shareValue > 100
  const fixedTooHigh = form.shareType === "Fixed" && form.shareValue > form.fee
  const invalid = form.name.trim() === "" || form.fee < 0 || form.shareValue < 0 || percentTooHigh || fixedTooHigh
  const doctorShare = previewDoctorShare(form.fee, form.shareType, form.shareValue)

  const submit = () =>
    save.mutate(
      { id: editing.id, input: form, idempotencyKey },
      {
        onSuccess: (doctorId) => {
          toast({ title: editing.id ? t("form.saved") : t("form.added") })
          onClose()
          onSaved?.(doctorId)
        },
        onError: (error) => toast({ title: t("form.saveFailed"), description: apiRequestErrorMessage(error), variant: "destructive" }),
      },
    )

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing.id ? t("form.editTitle") : t("form.addTitle")}</DialogTitle>
          <DialogDescription>{t("form.description")}</DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!invalid && !save.isPending) submit()
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("form.name")} id="doctor-name" className="sm:col-span-2">
              <Input
                id="doctor-name"
                autoFocus
                value={form.name}
                maxLength={200}
                placeholder={t("form.namePlaceholder")}
                onChange={(e) => set("name", e.target.value)}
              />
            </Field>
            <Field label={t("form.nmc")} id="doctor-nmc" hint={t("form.nmcHint")}>
              <Input id="doctor-nmc" value={form.nmcNumber} maxLength={64} onChange={(e) => set("nmcNumber", e.target.value)} />
            </Field>
            <Field label={t("form.speciality")} id="doctor-speciality">
              <Input
                id="doctor-speciality"
                value={form.speciality}
                maxLength={128}
                placeholder={t("form.specialityPlaceholder")}
                onChange={(e) => set("speciality", e.target.value)}
              />
            </Field>
            <Field label={t("form.phone")} id="doctor-phone">
              <Input id="doctor-phone" inputMode="tel" value={form.phone} maxLength={32} onChange={(e) => set("phone", e.target.value)} />
            </Field>
            <Field label={t("form.fee")} id="doctor-fee" hint={t("form.feeHint")}>
              <Input
                id="doctor-fee"
                type="number"
                inputMode="decimal"
                min={0}
                step="1"
                value={Number.isFinite(form.fee) ? form.fee : ""}
                onChange={(e) => set("fee", e.target.value === "" ? 0 : Number(e.target.value))}
              />
            </Field>
          </div>

          <fieldset className="space-y-3 rounded-lg border p-3">
            <legend className="px-1 text-sm font-medium">{t("form.shareType")}</legend>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("form.shareType")}>
              {(["Percent", "Fixed"] as ShareType[]).map((type) => (
                <Button
                  key={type}
                  type="button"
                  role="radio"
                  aria-checked={form.shareType === type}
                  variant={form.shareType === type ? "default" : "outline"}
                  size="sm"
                  onClick={() => set("shareType", type)}
                >
                  {type === "Percent" ? t("form.sharePercent") : t("form.shareFixed")}
                </Button>
              ))}
            </div>
            <Field label={form.shareType === "Percent" ? t("form.shareValuePercent") : t("form.shareValueFixed")} id="doctor-share">
              <Input
                id="doctor-share"
                type="number"
                inputMode="decimal"
                min={0}
                max={form.shareType === "Percent" ? 100 : undefined}
                step="any"
                className="sm:w-48"
                aria-invalid={percentTooHigh || fixedTooHigh}
                value={Number.isFinite(form.shareValue) ? form.shareValue : ""}
                onChange={(e) => set("shareValue", e.target.value === "" ? 0 : Number(e.target.value))}
              />
            </Field>
            {percentTooHigh ? (
              <p className="text-sm text-destructive">{t("form.percentTooHigh")}</p>
            ) : fixedTooHigh ? (
              <p className="text-sm text-destructive">{t("form.shareTooHigh")}</p>
            ) : (
              form.fee > 0 && (
                <p className="text-sm text-muted-foreground">
                  {t("form.sharePreview", {
                    doctor: formatCurrency(doctorShare),
                    pharmacy: formatCurrency(Math.max(form.fee - doctorShare, 0)),
                  })}
                </p>
              )
            )}
          </fieldset>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("form.cancel")}
            </Button>
            <Button type="submit" disabled={invalid || save.isPending}>
              {t("form.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  id,
  hint,
  className,
  children,
}: {
  label: string
  id: string
  hint?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
