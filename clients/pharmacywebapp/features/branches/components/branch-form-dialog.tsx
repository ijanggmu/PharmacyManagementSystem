"use client"

import { useEffect, useState, type FormEvent } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { Switch } from "@/components/ui/switch"
import {
  branchErrorMessage,
  createBranch,
  updateBranch,
  type Branch,
} from "@/lib/api/branches-api"
import {
  validateBranchForm,
  type BranchFormErrors,
  type BranchFormValues,
} from "@/features/branches/schemas/branch-schema"

const EMPTY_VALUES: BranchFormValues = { name: "", code: "", address: "", phone: "", email: "", isActive: true }

interface BranchFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** null creates a branch; a branch opens the edit form pre-filled. */
  branch: Branch | null
  onSaved: () => void
}

function valuesFromBranch(branch: Branch | null): BranchFormValues {
  if (!branch) return EMPTY_VALUES
  return {
    name: branch.name,
    code: branch.code,
    address: branch.address ?? "",
    phone: branch.phone ?? "",
    email: branch.email ?? "",
    isActive: branch.isActive,
  }
}

export function BranchFormDialog({ open, onOpenChange, branch, onSaved }: BranchFormDialogProps) {
  const [values, setValues] = useState<BranchFormValues>(EMPTY_VALUES)
  const [errors, setErrors] = useState<BranchFormErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()
  const isEdit = branch !== null
  // The server refuses to deactivate the default branch (409); don't offer the switch at all.
  const activeLocked = branch?.isDefault === true && branch.isActive

  useEffect(() => {
    if (open) {
      setValues(valuesFromBranch(branch))
      setErrors({})
      setFormError(null)
    }
  }, [open, branch])

  const setField = <K extends keyof BranchFormValues>(key: K, value: BranchFormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const validation = validateBranchForm(values)
    setErrors(validation)
    if (Object.keys(validation).length > 0) return

    setSaving(true)
    setFormError(null)
    try {
      if (branch) {
        await updateBranch(branch.id, { ...values, isActive: activeLocked ? true : values.isActive })
        toast({ title: "Branch updated", description: `${values.name.trim()} was saved.` })
      } else {
        await createBranch(values)
        toast({ title: "Branch created", description: `${values.name.trim()} was added.` })
      }
      onSaved()
      onOpenChange(false)
    } catch (error) {
      setFormError(branchErrorMessage(error, "Could not save the branch"))
    } finally {
      setSaving(false)
    }
  }

  const fieldError = (key: keyof BranchFormErrors) =>
    errors[key] ? (
      <p id={`branch-${String(key)}-error`} className="text-sm text-destructive">
        {errors[key]}
      </p>
    ) : null

  const describedBy = (key: keyof BranchFormErrors, help?: string) =>
    [errors[key] ? `branch-${String(key)}-error` : null, help].filter(Boolean).join(" ") || undefined

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit branch" : "New branch"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update this branch's details. Fields marked * are required."
              : "Add a location to track its stock, sales and cash separately. Fields marked * are required."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {formError ? (
            <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {formError}
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
            <div className="space-y-1.5">
              <Label htmlFor="branch-name">
                Name <span className="text-destructive" aria-hidden>*</span>
              </Label>
              <Input
                id="branch-name"
                value={values.name}
                onChange={(e) => setField("name", e.target.value)}
                aria-invalid={!!errors.name}
                aria-describedby={describedBy("name")}
                aria-required
                placeholder="e.g. Baneshwor branch"
              />
              {fieldError("name")}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="branch-code">
                Code <span className="text-destructive" aria-hidden>*</span>
              </Label>
              <Input
                id="branch-code"
                value={values.code}
                onChange={(e) => setField("code", e.target.value)}
                aria-invalid={!!errors.code}
                aria-describedby={describedBy("code", "branch-code-help")}
                aria-required
                placeholder="e.g. BNS"
                className="font-mono uppercase"
              />
              <p id="branch-code-help" className="text-xs text-muted-foreground">
                Short unique code used on invoices and transfers.
              </p>
              {fieldError("code")}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="branch-address">Address</Label>
            <Input
              id="branch-address"
              value={values.address}
              onChange={(e) => setField("address", e.target.value)}
              aria-invalid={!!errors.address}
              aria-describedby={describedBy("address")}
            />
            {fieldError("address")}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="branch-phone">Phone</Label>
              <Input
                id="branch-phone"
                type="tel"
                value={values.phone}
                onChange={(e) => setField("phone", e.target.value)}
                aria-invalid={!!errors.phone}
                aria-describedby={describedBy("phone")}
              />
              {fieldError("phone")}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="branch-email">Email</Label>
              <Input
                id="branch-email"
                type="email"
                value={values.email}
                onChange={(e) => setField("email", e.target.value)}
                aria-invalid={!!errors.email}
                aria-describedby={describedBy("email")}
              />
              {fieldError("email")}
            </div>
          </div>

          {isEdit ? (
            <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="branch-active">Active</Label>
                <p id="branch-active-help" className="text-xs text-muted-foreground">
                  {activeLocked
                    ? "This is the default branch, so it can’t be deactivated."
                    : "Inactive branches can’t be selected for sales or stock."}
                </p>
              </div>
              <Switch
                id="branch-active"
                aria-describedby="branch-active-help"
                checked={activeLocked ? true : values.isActive}
                disabled={activeLocked}
                onCheckedChange={(checked) => setField("isActive", checked)}
              />
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" loading={saving} loadingText={isEdit ? "Saving…" : "Creating…"}>
              {isEdit ? "Save changes" : "Create branch"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
