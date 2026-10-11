"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { BadgeCheck, CalendarClock, FileBadge2, Loader2, MoreHorizontal, Pencil, Plus, ShieldAlert, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DatePicker } from "@/components/ui/date-picker"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { FieldError } from "@/components/ui/field-error"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { stockErrorMessage } from "@/lib/api/stock-dotnet"
import {
  LICENSE_EXPIRING_WITHIN_DAYS,
  LICENSE_TYPES,
  licenseDueText,
  licensesApi,
  type PharmacyLicense,
  type PharmacyLicenseInput,
} from "@/lib/api/licenses-api"

interface FormState {
  licenseType: string
  title: string
  number: string
  holderName: string
  issuedOn: string
  expiresOn: string
  notes: string
}

const EMPTY: FormState = { licenseType: "dda_pharmacy", title: "", number: "", holderName: "", issuedOn: "", expiresOn: "", notes: "" }

const TONE = {
  valid: { badge: "success" as const, ring: "text-success", label: "Valid", icon: BadgeCheck },
  expiring: { badge: "warning" as const, ring: "text-warning", label: "Renew soon", icon: CalendarClock },
  expired: { badge: "danger" as const, ring: "text-destructive", label: "Expired", icon: ShieldAlert },
}

/** Ring that empties as the renewal window runs out (full at 60+ days, empty at expiry). */
function ExpiryRing({ daysLeft, status }: { daysLeft: number; status: PharmacyLicense["status"] }) {
  const fraction = Math.max(0, Math.min(1, daysLeft / LICENSE_EXPIRING_WITHIN_DAYS))
  const r = 18
  const c = 2 * Math.PI * r
  return (
    <div className={cn("relative grid size-12 shrink-0 place-items-center", TONE[status].ring)} aria-hidden>
      <svg viewBox="0 0 44 44" className="absolute inset-0 -rotate-90">
        <circle cx="22" cy="22" r={r} fill="none" stroke="currentColor" strokeOpacity={0.15} strokeWidth="4" />
        <circle
          cx="22"
          cy="22"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - fraction)}
          className="transition-[stroke-dashoffset] duration-500 ease-out motion-reduce:transition-none"
        />
      </svg>
      <span className="num text-[11px] font-semibold text-foreground">{daysLeft < 0 ? "!" : daysLeft > 999 ? "999+" : daysLeft}</span>
    </div>
  )
}

/**
 * Settings → Pharmacy profile → Licenses & registrations: what the pharmacy must keep renewed, with
 * days left at a glance. The daily check sends bell reminders 60/30/14/7/3/1 days before expiry and
 * weekly after; renewing (a new expiry date) starts them over.
 */
export function LicensesSettings() {
  const { toast } = useToast()
  const [licenses, setLicenses] = useState<PharmacyLicense[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [editing, setEditing] = useState<PharmacyLicense | "new" | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<PharmacyLicense | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setLicenses(await licensesApi.list())
      setLoadError(null)
    } catch (error) {
      setLoadError(stockErrorMessage(error, "Couldn't load licenses"))
      setLicenses([])
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const openEditor = (license: PharmacyLicense | "new") => {
    setEditing(license)
    setErrors({})
    setForm(
      license === "new"
        ? EMPTY
        : {
            licenseType: license.licenseType,
            title: license.title ?? "",
            number: license.number,
            holderName: license.holderName ?? "",
            issuedOn: license.issuedOn ?? "",
            expiresOn: license.expiresOn,
            notes: license.notes ?? "",
          },
    )
  }

  const validate = (): boolean => {
    const next: typeof errors = {}
    if (!form.number.trim()) next.number = "Enter the license or registration number."
    if (!form.expiresOn) next.expiresOn = "Enter the expiry date."
    if (form.licenseType === "other" && !form.title.trim()) next.title = "Name the license."
    if (form.issuedOn && form.expiresOn && form.issuedOn > form.expiresOn) next.expiresOn = "Expiry can't be before the issue date."
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const save = async () => {
    if (!validate() || editing === null) return
    const input: PharmacyLicenseInput = {
      licenseType: form.licenseType,
      number: form.number.trim(),
      expiresOn: form.expiresOn,
      title: form.licenseType === "other" ? form.title.trim() : null,
      holderName: form.holderName.trim() || null,
      issuedOn: form.issuedOn || null,
      notes: form.notes.trim() || null,
    }
    setSaving(true)
    try {
      if (editing === "new") await licensesApi.create(input)
      else await licensesApi.update(editing.id, input)
      toast({ title: editing === "new" ? "License added" : "License updated" })
      setEditing(null)
      await load()
    } catch (error) {
      toast({ title: "Couldn't save the license", description: stockErrorMessage(error, "Save failed"), variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleting) return
    setDeleteBusy(true)
    try {
      await licensesApi.remove(deleting.id)
      toast({ title: "License removed" })
      setDeleting(null)
      await load()
    } catch (error) {
      toast({ title: "Couldn't remove the license", description: stockErrorMessage(error, "Delete failed"), variant: "destructive" })
    } finally {
      setDeleteBusy(false)
    }
  }

  const attention = useMemo(() => (licenses ?? []).filter((l) => l.status !== "valid").length, [licenses])
  const typeHint = LICENSE_TYPES.find((t) => t.value === form.licenseType)?.hint

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {licenses === null
            ? "Loading…"
            : licenses.length === 0
              ? "Add your DDA license and pharmacist registration to get renewal reminders."
              : attention > 0
                ? `${attention} need${attention === 1 ? "s" : ""} renewing soon.`
                : "Everything is current."}
        </p>
        <Button type="button" size="sm" onClick={() => openEditor("new")} className="min-h-9">
          <Plus className="mr-1.5 size-4" aria-hidden />
          Add license
        </Button>
      </div>

      {loadError && <p className="text-sm text-destructive">{loadError}</p>}

      {licenses === null ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
      ) : licenses.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center">
          <FileBadge2 className="size-8 text-muted-foreground" aria-hidden />
          <p className="font-medium">No licenses recorded</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            We&apos;ll remind you before each one expires, so the pharmacy never trades on a lapsed license.
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {licenses.map((license) => {
            const tone = TONE[license.status]
            return (
              <li
                key={license.id}
                className={cn(
                  "flex items-start gap-3 rounded-xl border bg-card p-4 transition-shadow duration-200 hover:shadow-sm",
                  license.status === "expired" && "border-destructive/30 bg-destructive/[0.03]",
                  license.status === "expiring" && "border-warning/30 bg-warning/[0.04]",
                )}
              >
                <ExpiryRing daysLeft={license.daysLeft} status={license.status} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate font-medium" title={license.label}>
                      {license.label}
                    </p>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="-mr-2 -mt-1 size-9" aria-label={`Actions for ${license.label}`}>
                          <MoreHorizontal className="size-4" aria-hidden />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEditor(license)}>
                          <Pencil className="mr-2 size-4" aria-hidden />
                          Edit or renew
                        </DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onClick={() => setDeleting(license)}>
                          <Trash2 className="mr-2 size-4" aria-hidden />
                          Remove
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <p className="truncate font-mono text-sm text-muted-foreground">{license.number}</p>
                  {license.holderName && <p className="truncate text-xs text-muted-foreground">{license.holderName}</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge variant={tone.badge} className="gap-1">
                      <tone.icon className="size-3" aria-hidden />
                      {tone.label}
                    </Badge>
                    <span className="num text-xs text-muted-foreground">
                      {licenseDueText(license.daysLeft)} · {license.expiresOn}
                    </span>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && !saving && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "Add license" : "Edit or renew license"}</DialogTitle>
            <DialogDescription>
              {editing !== "new" && editing !== null
                ? "Renewed? Enter the new expiry date — reminders start over for it."
                : "Reminders go to everyone who can manage settings, 60 days before expiry and closer."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="license-type">Type</Label>
              <Select value={form.licenseType} onValueChange={(licenseType) => setForm({ ...form, licenseType })}>
                <SelectTrigger id="license-type" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LICENSE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {typeHint && <p className="mt-1 text-xs text-muted-foreground">{typeHint}</p>}
            </div>
            {form.licenseType === "other" && (
              <div>
                <Label htmlFor="license-title">Name</Label>
                <Input id="license-title" value={form.title} maxLength={120} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mt-1" aria-invalid={!!errors.title} />
                <FieldError message={errors.title} />
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="license-number">Number</Label>
                <Input
                  id="license-number"
                  value={form.number}
                  maxLength={80}
                  onChange={(e) => setForm({ ...form, number: e.target.value })}
                  className="mt-1 font-mono"
                  aria-invalid={!!errors.number}
                />
                <FieldError message={errors.number} />
              </div>
              <div>
                <Label htmlFor="license-holder">Holder</Label>
                <Input
                  id="license-holder"
                  value={form.holderName}
                  maxLength={160}
                  placeholder="Pharmacist / owner"
                  onChange={(e) => setForm({ ...form, holderName: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="license-issued">Issued on</Label>
                <div className="mt-1">
                  <DatePicker id="license-issued" value={form.issuedOn} onChange={(issuedOn) => setForm({ ...form, issuedOn })} clearable />
                </div>
              </div>
              <div>
                <Label htmlFor="license-expires">Expires on</Label>
                <div className="mt-1">
                  <DatePicker
                    id="license-expires"
                    value={form.expiresOn}
                    onChange={(expiresOn) => setForm({ ...form, expiresOn })}
                    allowFuture
                    aria-invalid={!!errors.expiresOn}
                  />
                </div>
                <FieldError message={errors.expiresOn} />
              </div>
            </div>
            <div>
              <Label htmlFor="license-notes">Notes</Label>
              <Textarea
                id="license-notes"
                rows={2}
                maxLength={1000}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Renewal office, fee, documents needed…"
                className="mt-1 resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditing(null)} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void save()} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        isOpen={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
        title="Remove this license?"
        description={deleting ? `${deleting.label} (${deleting.number}) and its reminders will be removed.` : ""}
        confirmText="Remove"
        variant="destructive"
        loading={deleteBusy}
      />
    </div>
  )
}
