"use client"

import { cn } from "@/lib/utils"
import { useEffect, useState, type FormEvent } from "react"
import { Copy, Eye, EyeOff, KeyRound, Wand2 } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogScrollBody,
  DialogStickyFooter,
  DialogTitle,
  DIALOG_CONTENT_SCROLL_BODY_CLASS,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PasswordStrength } from "@/components/get-started/password-strength"
import { fieldErrorsOf, setPasswordSchema, type SetPasswordForm } from "@/features/users/schemas/user-form"
import { generateStrongPassword } from "@/lib/utils/password-policy"
import { useToast } from "@/hooks/use-toast"

const EMPTY: SetPasswordForm = { password: "", confirmPassword: "" }

/**
 * Admin sets a new password for someone who forgot theirs. `onSubmit` returns an error message (shown in the
 * dialog) or null on success. The user is signed out of every device by the API.
 */
export function SetPasswordDialog({
  userName,
  open,
  onOpenChange,
  onSubmit,
}: {
  userName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (password: string) => Promise<string | null>
}) {
  const { toast } = useToast()
  const [values, setValues] = useState<SetPasswordForm>(EMPTY)
  const [submitted, setSubmitted] = useState(false)
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) return
    setValues(EMPTY)
    setSubmitted(false)
    setShow(false)
    setError(null)
  }, [open])

  const errors = submitted ? fieldErrorsOf(setPasswordSchema, values) : {}

  const generate = () => {
    const password = generateStrongPassword()
    setValues({ password, confirmPassword: password })
    setShow(true)
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(values.password)
      toast({ title: "Password copied" })
    } catch {
      toast({ title: "Couldn't copy", description: "Your browser blocked the clipboard.", variant: "destructive" })
    }
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitted(true)
    setError(null)
    if (!setPasswordSchema.safeParse(values).success) return
    setSaving(true)
    try {
      const failure = await onSubmit(values.password)
      if (failure) {
        setError(failure)
        return
      }
      toast({
        title: "Password changed",
        description: `${userName} was signed out everywhere and must use the new password.`,
      })
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (saving ? null : onOpenChange(next))}>
      <DialogContent className={cn(DIALOG_CONTENT_SCROLL_BODY_CLASS, "sm:max-w-xl")}>
        <DialogHeader className="px-6 pb-2 pt-6">
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>
            Set a new password for <span className="font-medium text-foreground">{userName}</span>. They&apos;ll be signed
            out of every device. Give them the password in person or by phone, and ask them to change it after signing in.
          </DialogDescription>
        </DialogHeader>
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit} noValidate>
          <DialogScrollBody className="space-y-4 py-4">
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="set-password">New password</Label>
                <div className="flex gap-1">
                  {values.password && show ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => void copy()}>
                      <Copy aria-hidden />
                      Copy
                    </Button>
                  ) : null}
                  <Button type="button" variant="ghost" size="sm" onClick={generate}>
                    <Wand2 aria-hidden />
                    Generate
                  </Button>
                </div>
              </div>
              <div className="relative">
                <Input
                  id="set-password"
                  type={show ? "text" : "password"}
                  value={values.password}
                  onChange={(e) => setValues((v) => ({ ...v, password: e.target.value }))}
                  autoComplete="new-password"
                  maxLength={128}
                  className="pr-10 font-mono"
                  aria-invalid={!!errors.password}
                  aria-describedby={errors.password ? "set-password-rules set-password-error" : "set-password-rules"}
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={show ? "Hide password" : "Show password"}
                  aria-pressed={show}
                >
                  {show ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                </button>
              </div>
              <PasswordStrength id="set-password-rules" password={values.password} />
              {errors.password ? (
                <p id="set-password-error" className="text-sm text-destructive">{errors.password}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="set-password-confirm">Confirm new password</Label>
              <Input
                id="set-password-confirm"
                type={show ? "text" : "password"}
                value={values.confirmPassword}
                onChange={(e) => setValues((v) => ({ ...v, confirmPassword: e.target.value }))}
                autoComplete="new-password"
                maxLength={128}
                className="font-mono"
                aria-invalid={!!errors.confirmPassword}
                aria-describedby={errors.confirmPassword ? "set-password-confirm-error" : undefined}
              />
              {errors.confirmPassword ? (
                <p id="set-password-confirm-error" className="text-sm text-destructive">{errors.confirmPassword}</p>
              ) : null}
            </div>
          </DialogScrollBody>
          <DialogStickyFooter className="flex-col-reverse sm:flex-row">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" loading={saving} loadingText="Saving…">
              <KeyRound aria-hidden />
              Set password
            </Button>
          </DialogStickyFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
