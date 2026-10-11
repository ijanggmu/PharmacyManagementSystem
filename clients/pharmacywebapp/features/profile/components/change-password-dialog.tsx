"use client"

import { useState } from "react"
import { Check, Circle, Eye, EyeOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { changeOwnPassword } from "@/lib/api/profile-api"
import { PASSWORD_RULES, passwordMeetsPolicy } from "@/lib/utils/password-policy"
import { cn } from "@/lib/utils"

const EMPTY = { current: "", next: "", confirm: "" }

/** Change password in place (current + new + confirm), instead of the emailed reset link. */
export function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast()
  const [values, setValues] = useState(EMPTY)
  const [show, setShow] = useState(false)
  const [touched, setTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const mismatch = values.confirm.length > 0 && values.confirm !== values.next
  const reused = values.next.length > 0 && values.next === values.current
  const canSubmit = !!values.current && passwordMeetsPolicy(values.next) && values.confirm === values.next && !reused

  const reset = () => {
    setValues(EMPTY)
    setShow(false)
    setTouched(false)
    setServerError(null)
  }

  const handleOpenChange = (next: boolean) => {
    if (saving) return
    if (!next) reset()
    onOpenChange(next)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (!canSubmit) return
    setSaving(true)
    setServerError(null)
    try {
      await changeOwnPassword({ password: values.current, newPassword: values.next, confirmNewPassword: values.confirm })
      toast({ title: "Password changed", description: "Use your new password the next time you sign in." })
      reset()
      onOpenChange(false)
    } catch (error) {
      setServerError(apiRequestErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  const field = (key: keyof typeof EMPTY) => ({
    value: values[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setValues((prev) => ({ ...prev, [key]: e.target.value })),
    type: show ? "text" : "password",
    disabled: saving,
  })

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription>Enter your current password, then choose a new one.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          {serverError && (
            <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {serverError}
            </p>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="cp-current">Current password</Label>
            <Input
              id="cp-current"
              autoComplete="current-password"
              autoFocus
              aria-invalid={touched && !values.current ? true : undefined}
              aria-describedby={touched && !values.current ? "cp-current-error" : undefined}
              {...field("current")}
            />
            {touched && !values.current && (
              <p id="cp-current-error" role="alert" className="text-xs text-destructive">
                Enter your current password.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="cp-new">New password</Label>
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                aria-pressed={show}
                className="flex cursor-pointer items-center gap-1 rounded text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {show ? <EyeOff className="h-3.5 w-3.5" aria-hidden /> : <Eye className="h-3.5 w-3.5" aria-hidden />}
                {show ? "Hide passwords" : "Show passwords"}
              </button>
            </div>
            <Input
              id="cp-new"
              autoComplete="new-password"
              aria-invalid={touched && (!passwordMeetsPolicy(values.next) || reused) ? true : undefined}
              aria-describedby="cp-rules"
              {...field("next")}
            />
            <ul id="cp-rules" className="grid grid-cols-1 gap-1 pt-1 text-xs sm:grid-cols-2" aria-label="Password requirements">
              {PASSWORD_RULES.map((rule) => {
                const met = rule.test(values.next)
                return (
                  <li key={rule.id} className={cn("flex items-center gap-1.5", met ? "text-success" : "text-muted-foreground")}>
                    {met ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Circle className="h-3 w-3" aria-hidden />}
                    {rule.label}
                    <span className="sr-only">{met ? "(met)" : "(not met)"}</span>
                  </li>
                )
              })}
            </ul>
            {reused && (
              <p role="alert" className="text-xs text-destructive">
                Choose a password different from your current one.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cp-confirm">Confirm new password</Label>
            <Input
              id="cp-confirm"
              autoComplete="new-password"
              aria-invalid={mismatch || undefined}
              aria-describedby={mismatch ? "cp-confirm-error" : undefined}
              {...field("confirm")}
            />
            {mismatch && (
              <p id="cp-confirm-error" role="alert" className="text-xs text-destructive">
                Passwords don&apos;t match.
              </p>
            )}
          </div>
          <DialogFooter className="gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" loading={saving} loadingText="Changing…" disabled={touched && !canSubmit}>
              Change password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
