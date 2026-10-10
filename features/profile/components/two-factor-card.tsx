"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, Check, Copy, KeyRound, ShieldCheck, ShieldOff, Smartphone } from "lucide-react"
import { Badge } from "@/components/ui/badge"
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
import { TotpCodeInput } from "@/components/shared/totp-code-input"
import { QrCodeImage } from "@/features/sales/components/payment/qr-code-image"
import { useToast } from "@/hooks/use-toast"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import {
  disableTwoFactor,
  enrollTwoFactor,
  getTwoFactorStatus,
  regenerateRecoveryCodes,
  verifyTwoFactorEnrollment,
  type TwoFactorEnrollment,
} from "@/lib/api/profile-api"
import { formatSharedKey, isCompleteTotp, isLowOnRecoveryCodes } from "@/lib/api/two-factor"
import { RecoveryCodesPanel } from "./recovery-codes-panel"

const twoFactorStatusKey = ["profile", "two-factor-status"] as const

/** Status row for authenticator sign-in, with the enable, disable and recovery-code flows. */
export function TwoFactorCard({ enabled }: { enabled: boolean }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [isOn, setIsOn] = useState(enabled)
  const [enableOpen, setEnableOpen] = useState(false)
  const [disableOpen, setDisableOpen] = useState(false)
  const [regenerateOpen, setRegenerateOpen] = useState(false)

  const status = useQuery({
    queryKey: twoFactorStatusKey,
    queryFn: getTwoFactorStatus,
    enabled: isOn,
    staleTime: 60 * 1000,
  })
  const codesLeft = isOn && status.data?.enabled ? status.data.recoveryCodesLeft : null

  const refreshStatus = () => void queryClient.invalidateQueries({ queryKey: twoFactorStatusKey })

  const changed = (next: boolean) => {
    setIsOn(next)
    refreshStatus()
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span
          className={
            isOn
              ? "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success ring-1 ring-success/20"
              : "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground ring-1 ring-border"
          }
          aria-hidden
        >
          <Smartphone className="h-[18px] w-[18px]" />
        </span>
        <div>
          <p className="flex flex-wrap items-center gap-2 font-medium text-foreground">
            Two-step verification
            {isOn ? (
              <Badge variant="success">
                <ShieldCheck aria-hidden />
                On
              </Badge>
            ) : (
              <Badge variant="muted">
                <ShieldOff aria-hidden />
                Off
              </Badge>
            )}
          </p>
          <p className="text-sm text-muted-foreground">
            {isOn
              ? "Signing in asks for a code from your authenticator app."
              : "Ask for a code from an authenticator app at every sign-in, so a stolen password isn't enough."}
          </p>
          {codesLeft !== null && (
            <p
              className={
                isLowOnRecoveryCodes(codesLeft)
                  ? "mt-1 flex items-center gap-1.5 text-sm font-medium text-warning"
                  : "mt-1 flex items-center gap-1.5 text-sm text-muted-foreground"
              }
            >
              {isLowOnRecoveryCodes(codesLeft) ? (
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
              ) : (
                <KeyRound className="h-3.5 w-3.5 shrink-0" aria-hidden />
              )}
              {codesLeft === 1 ? "1 recovery code left" : `${codesLeft} recovery codes left`}
              {isLowOnRecoveryCodes(codesLeft) && " — regenerate them soon"}
            </p>
          )}
        </div>
      </div>
      {isOn ? (
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => setRegenerateOpen(true)}>
            <KeyRound aria-hidden />
            Regenerate recovery codes
          </Button>
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => setDisableOpen(true)}>
            Turn off
          </Button>
        </div>
      ) : (
        <Button className="w-full sm:w-auto" onClick={() => setEnableOpen(true)}>
          Turn on
        </Button>
      )}

      <EnableTwoFactorDialog open={enableOpen} onOpenChange={setEnableOpen} onEnabled={() => changed(true)} />
      <DisableTwoFactorDialog open={disableOpen} onOpenChange={setDisableOpen} onDisabled={() => changed(false)} />
      <RegenerateRecoveryCodesDialog open={regenerateOpen} onOpenChange={setRegenerateOpen} onRegenerated={refreshStatus} />
    </div>
  )
}

type EnrollState =
  | { step: "intro" }
  | { step: "loading" }
  | { step: "scan"; enrollment: TwoFactorEnrollment }
  | { step: "error"; message: string }
  | { step: "codes"; codes: string[] }

function EnableTwoFactorDialog({
  open,
  onOpenChange,
  onEnabled,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onEnabled: () => void
}) {
  const { toast } = useToast()
  const [state, setState] = useState<EnrollState>({ step: "intro" })
  const [code, setCode] = useState("")
  const [codeError, setCodeError] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [copied, setCopied] = useState(false)
  const codeRef = useRef<HTMLInputElement>(null)

  const reset = () => {
    setState({ step: "intro" })
    setCode("")
    setCodeError(null)
    setCopied(false)
  }

  const handleOpenChange = (next: boolean) => {
    if (verifying) return
    if (!next) reset()
    onOpenChange(next)
  }

  const start = async () => {
    setState({ step: "loading" })
    try {
      setState({ step: "scan", enrollment: await enrollTwoFactor() })
    } catch (error) {
      setState({ step: "error", message: apiRequestErrorMessage(error) })
    }
  }

  const verify = async (value: string) => {
    if (verifying || !isCompleteTotp(value)) return
    setVerifying(true)
    setCodeError(null)
    try {
      const { recoveryCodes } = await verifyTwoFactorEnrollment(value)
      toast({ title: "Two-step verification is on", description: "You'll be asked for a code at your next sign-in." })
      onEnabled()
      if (recoveryCodes.length > 0) {
        // Keep the dialog open on the one-time recovery-code step.
        setCode("")
        setState({ step: "codes", codes: recoveryCodes })
      } else {
        reset()
        onOpenChange(false)
      }
    } catch (error) {
      setCodeError(`${apiRequestErrorMessage(error)} Check the time on your phone is set automatically, then try the current code.`)
      setCode("")
      codeRef.current?.focus()
    } finally {
      setVerifying(false)
    }
  }

  const copyKey = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast({ title: "Couldn't copy", description: "Select the key and copy it manually.", variant: "destructive" })
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{state.step === "codes" ? "Save your recovery codes" : "Turn on two-step verification"}</DialogTitle>
          <DialogDescription>
            {state.step === "codes"
              ? "Two-step verification is on. Use one of these codes to sign in if you ever lose your phone."
              : state.step === "scan"
                ? "Step 2 of 2 — scan the code, then enter the 6 digits your app shows."
                : "Step 1 of 2 — you'll need an authenticator app on your phone."}
          </DialogDescription>
        </DialogHeader>

        {state.step === "codes" && (
          <div className="space-y-4">
            <RecoveryCodesPanel codes={state.codes} />
            <DialogFooter>
              <Button onClick={() => handleOpenChange(false)}>I&apos;ve saved my codes</Button>
            </DialogFooter>
          </div>
        )}

        {(state.step === "intro" || state.step === "loading" || state.step === "error") && (
          <div className="space-y-4">
            <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
              <li>
                Install an authenticator app such as Google Authenticator, Microsoft Authenticator or Authy.
              </li>
              <li>Scan the QR code we show you, or type the setup key.</li>
              <li>Enter the 6-digit code to confirm.</li>
            </ol>
            {state.step === "error" && (
              <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {state.message}
              </p>
            )}
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={() => void start()} loading={state.step === "loading"} loadingText="Preparing…">
                {state.step === "error" ? "Try again" : "Continue"}
              </Button>
            </DialogFooter>
          </div>
        )}

        {state.step === "scan" && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              void verify(code)
            }}
          >
            <div className="flex flex-col items-center gap-3">
              <QrCodeImage value={state.enrollment.authenticatorUri} label="QR code to add this account to your authenticator app" size={184} />
              <div className="w-full space-y-1.5">
                <p id="tfa-key-label" className="text-xs font-medium text-muted-foreground">
                  Can&apos;t scan? Enter this setup key instead
                </p>
                <div className="flex items-center gap-2">
                  <code
                    aria-labelledby="tfa-key-label"
                    className="min-w-0 flex-1 select-all break-all rounded-md border bg-muted/50 px-3 py-2 font-mono text-sm tracking-wide"
                  >
                    {formatSharedKey(state.enrollment.sharedKey)}
                  </code>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={copied ? "Setup key copied" : "Copy setup key"}
                    onClick={() => void copyKey(state.enrollment.sharedKey)}
                  >
                    {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tfa-code">6-digit code</Label>
              <TotpCodeInput
                ref={codeRef}
                id="tfa-code"
                value={code}
                onChange={setCode}
                onComplete={(value) => void verify(value)}
                invalid={!!codeError}
                disabled={verifying}
                describedBy={codeError ? "tfa-code-error" : undefined}
              />
              {codeError && (
                <p id="tfa-code-error" role="alert" className="text-xs text-destructive">
                  {codeError}
                </p>
              )}
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={verifying}>
                Cancel
              </Button>
              <Button type="submit" loading={verifying} loadingText="Verifying…" disabled={!isCompleteTotp(code)}>
                Verify and turn on
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

function DisableTwoFactorDialog({
  open,
  onOpenChange,
  onDisabled,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDisabled: () => void
}) {
  const { toast } = useToast()
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const handleOpenChange = (next: boolean) => {
    if (saving) return
    if (!next) {
      setPassword("")
      setError(null)
    }
    onOpenChange(next)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password) {
      setError("Enter your current password to confirm.")
      return
    }
    setSaving(true)
    setError(null)
    try {
      await disableTwoFactor(password)
      toast({ title: "Two-step verification is off", description: "Sign-in now only needs your password." })
      setPassword("")
      onOpenChange(false)
      onDisabled()
    } catch (err) {
      setError(apiRequestErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Turn off two-step verification?</DialogTitle>
          <DialogDescription>
            Anyone with your password could then sign in to your account. Your authenticator setup is removed; turning it
            back on means scanning a new code.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="tfa-disable-password">Current password</Label>
            <Input
              id="tfa-disable-password"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={saving}
              aria-invalid={!!error || undefined}
              aria-describedby={error ? "tfa-disable-error" : undefined}
            />
            {error && (
              <p id="tfa-disable-error" role="alert" className="text-xs text-destructive">
                {error}
              </p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>
              Keep it on
            </Button>
            <Button type="submit" variant="destructive" loading={saving} loadingText="Turning off…">
              Turn off
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function RegenerateRecoveryCodesDialog({
  open,
  onOpenChange,
  onRegenerated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onRegenerated: () => void
}) {
  const { toast } = useToast()
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [codes, setCodes] = useState<string[] | null>(null)

  const handleOpenChange = (next: boolean) => {
    if (saving) return
    if (!next) {
      setPassword("")
      setError(null)
      setCodes(null)
    }
    onOpenChange(next)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password) {
      setError("Enter your current password to confirm.")
      return
    }
    setSaving(true)
    setError(null)
    try {
      const next = await regenerateRecoveryCodes(password)
      setPassword("")
      setCodes(next)
      onRegenerated()
      toast({ title: "New recovery codes created", description: "Your old codes no longer work." })
    } catch (err) {
      setError(apiRequestErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{codes ? "Your new recovery codes" : "Regenerate recovery codes?"}</DialogTitle>
          <DialogDescription>
            {codes
              ? "Your previous codes have stopped working. Store these instead."
              : "You'll get 10 new one-time codes and every code you saved before will stop working."}
          </DialogDescription>
        </DialogHeader>

        {codes ? (
          <div className="space-y-4">
            <RecoveryCodesPanel codes={codes} />
            <DialogFooter>
              <Button onClick={() => handleOpenChange(false)}>I&apos;ve saved my codes</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="tfa-regenerate-password">Current password</Label>
              <Input
                id="tfa-regenerate-password"
                type="password"
                autoComplete="current-password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={saving}
                aria-invalid={!!error || undefined}
                aria-describedby={error ? "tfa-regenerate-error" : undefined}
              />
              {error && (
                <p id="tfa-regenerate-error" role="alert" className="text-xs text-destructive">
                  {error}
                </p>
              )}
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" loading={saving} loadingText="Generating…">
                Regenerate codes
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
