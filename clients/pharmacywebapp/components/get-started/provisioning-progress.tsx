"use client"

import { useEffect, useRef, useState } from "react"
import { AlertCircle, ArrowRight, CheckCircle2, Circle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { getSignUpStatus, type SignUpStatus } from "@/lib/api/auth-api"
import { PROVISIONING_STEP_LABELS, provisioningPhase, provisioningStepLabel } from "@/lib/onboarding/get-started"

const POLL_MS = 1500
const GIVE_UP_MS = 3 * 60 * 1000
const DEFAULT_STEPS = Object.keys(PROVISIONING_STEP_LABELS)

type Outcome = "provisioning" | "signing-in" | "signed-in" | "sign-in-needed" | "failed"

/**
 * Follows the new pharmacy's real provisioning progress (polling the anonymous sign-up status), then
 * signs the admin in automatically. If the status can't be read or auto sign-in fails, it falls back to
 * a "Sign in" button for the new pharmacy.
 */
export function ProvisioningProgress({
  tenantId,
  correlationId,
  initialStatus,
  pharmacyName,
  autoSignIn,
  onManualSignIn,
}: {
  tenantId: string
  correlationId: string | null
  initialStatus: string | null
  pharmacyName: string
  /** Resolves true when the session was created. */
  autoSignIn: () => Promise<boolean>
  onManualSignIn: () => void
}) {
  const [status, setStatus] = useState<SignUpStatus | null>(null)
  const [outcome, setOutcome] = useState<Outcome>(
    provisioningPhase(initialStatus) === "completed" ? "signing-in" : "provisioning",
  )
  const autoSignInRef = useRef(autoSignIn)
  autoSignInRef.current = autoSignIn
  const startedRef = useRef(false)

  // Poll until Completed/Failed (or give up and offer manual sign-in).
  useEffect(() => {
    if (outcome !== "provisioning") return
    let cancelled = false
    let failures = 0
    const startedAt = Date.now()

    const tick = async () => {
      if (cancelled) return
      if (!correlationId) {
        // Older API without a correlation id: give provisioning a short head start, then sign in.
        setTimeout(() => !cancelled && setOutcome("signing-in"), 2500)
        return
      }
      const next = await getSignUpStatus(tenantId, correlationId).catch(() => null)
      if (cancelled) return
      if (next) {
        failures = 0
        setStatus(next)
        const phase = provisioningPhase(next.status)
        if (phase === "completed") return setOutcome("signing-in")
        if (phase === "failed") return setOutcome("failed")
      } else if (++failures >= 5) {
        return setOutcome("sign-in-needed")
      }
      if (Date.now() - startedAt > GIVE_UP_MS) return setOutcome("sign-in-needed")
      setTimeout(tick, POLL_MS)
    }
    void tick()
    return () => {
      cancelled = true
    }
  }, [outcome, tenantId, correlationId])

  // Provisioned: sign the admin in once.
  useEffect(() => {
    if (outcome !== "signing-in" || startedRef.current) return
    startedRef.current = true
    autoSignInRef
      .current()
      .then((ok) => setOutcome(ok ? "signed-in" : "sign-in-needed"))
      .catch(() => setOutcome("sign-in-needed"))
  }, [outcome])

  const steps = status?.steps.length
    ? status.steps
    : DEFAULT_STEPS.map((step) => ({ step, status: outcome === "provisioning" ? "Pending" : "Completed" }))
  const done = outcome === "signing-in" || outcome === "signed-in" || outcome === "sign-in-needed"

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center py-2 text-center" role="status" aria-live="polite">
      <div
        className={cn(
          "flex h-14 w-14 items-center justify-center rounded-2xl ring-1",
          outcome === "failed" ? "bg-destructive/10 text-destructive ring-destructive/20" : "bg-success/10 text-success ring-success/20",
        )}
      >
        {outcome === "failed" ? (
          <AlertCircle className="h-7 w-7" aria-hidden />
        ) : done ? (
          <CheckCircle2 className="h-7 w-7" aria-hidden />
        ) : (
          <Loader2 className="h-7 w-7 animate-spin" aria-hidden />
        )}
      </div>

      <h2 className="mt-5 font-display text-xl font-bold tracking-tight text-foreground">
        {outcome === "failed"
          ? "Setup didn't finish"
          : outcome === "provisioning"
            ? `Setting up ${pharmacyName}…`
            : outcome === "signing-in"
              ? "Signing you in…"
              : outcome === "signed-in"
                ? "Welcome aboard!"
                : "Your pharmacy is ready"}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {outcome === "failed"
          ? (status?.error ?? "Something went wrong while creating your pharmacy. Please try again in a moment.")
          : outcome === "sign-in-needed"
            ? "Sign in to start using it. We created a Main Branch for you — rename it and add its address under Branches."
            : outcome === "signed-in"
              ? "Opening your dashboard…"
              : "This usually takes a few seconds."}
      </p>

      <ol className="mt-6 w-full space-y-2 text-left">
        {steps.map((s) => {
          const phase = provisioningPhase(s.status)
          return (
            <li key={s.step} className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm">
              {phase === "completed" ? (
                <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
              ) : phase === "running" ? (
                <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-hidden />
              ) : phase === "failed" ? (
                <AlertCircle className="size-4 shrink-0 text-destructive" aria-hidden />
              ) : (
                <Circle className="size-4 shrink-0 text-muted-foreground/50" aria-hidden />
              )}
              <span className={cn(phase === "completed" || phase === "running" ? "text-foreground" : "text-muted-foreground")}>
                {provisioningStepLabel(s.step)}
              </span>
              <span className="sr-only"> — {s.status}</span>
            </li>
          )
        })}
      </ol>

      {(outcome === "sign-in-needed" || outcome === "failed") && (
        <Button type="button" size="lg" onClick={onManualSignIn} className="mt-6 w-full">
          {outcome === "failed" ? "Go to sign in" : `Sign in to ${pharmacyName}`}
          <ArrowRight aria-hidden />
        </Button>
      )}
    </div>
  )
}
