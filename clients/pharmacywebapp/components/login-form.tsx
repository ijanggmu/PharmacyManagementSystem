"use client"

import { BrandMark } from "@/components/brand/brand-mark"

import { useRef, useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Building2, Mail, Lock, Eye, EyeOff, ShieldCheck, ArrowLeft, KeyRound, ChevronRight, Store } from "lucide-react"
import { useRouter } from "next/navigation"
import { useToast } from "@/hooks/use-toast"
import { AuthDialogLink } from "@/components/auth-dialog/auth-dialog-trigger"
import { TotpCodeInput } from "@/components/shared/totp-code-input"
import { useAuthDialog } from "@/lib/contexts/auth-dialog-context"
import { signInWithDotnet, signInWithGoogle, type GooglePharmacyChoice } from "@/lib/api/auth-api"
import { AuthDivider, GoogleButton } from "@/components/auth/google-button"
import { peekGoogleCredential } from "@/lib/google/google-identity"
import {
  RECOVERY_CODE_MAX_INPUT,
  isCompleteRecoveryCode,
  isCompleteTotp,
  normalizeRecoveryCode,
  stripTwoFactorPrefix,
  twoFactorSignInState,
} from "@/lib/api/two-factor"
import { getPharmacyNameByCode } from "@/lib/api/tenant-lookup-api"

interface DemoAccount {
  label: string
  email: string
  password: string
  /** Blank for superadmin (root tenant). */
  tenant: string
}

/**
 * One-click sign-in for the seeded demo accounts, shown only outside production. This is a local
 * testing convenience, never a production feature — gated on NODE_ENV so it cannot ship live.
 */
const DEMO_ACCOUNTS: DemoAccount[] = [
  { label: "Superadmin", email: "admin@root.com", password: "Password123!", tenant: "" },
  { label: "Pharmacy Admin", email: "admin@demo-pharmacy.test", password: "Password123!", tenant: "demo-pharmacy" },
  { label: "Manager", email: "manager@demo-pharmacy.test", password: "Password123!", tenant: "demo-pharmacy" },
  { label: "Pharmacist", email: "pharmacist@demo-pharmacy.test", password: "Password123!", tenant: "demo-pharmacy" },
  { label: "Cashier", email: "cashier@demo-pharmacy.test", password: "Password123!", tenant: "demo-pharmacy" },
  { label: "Staff", email: "staff@demo-pharmacy.test", password: "Password123!", tenant: "demo-pharmacy" },
]

const SHOW_DEMO_LOGINS = process.env.NODE_ENV !== "production"

/** Messages for a refused Google sign-in. */
function googleAuthError(code: string, message: string): string {
  if (code === "GOOGLE_NOT_LINKED" || /external_login_not_linked/i.test(message)) {
    return "This Google account isn't connected to a pharmacy yet. Sign in with your password and connect Google from your profile, or create a pharmacy."
  }
  if (/google_token_invalid/i.test(message)) {
    return "We couldn't verify your Google sign-in. Please try again."
  }
  if (/not configured/i.test(message)) {
    return "Google sign-in isn't available right now. Use your email and password."
  }
  return friendlyAuthError(message)
}

function friendlyAuthError(message: string): string {
  if (/email.*not.*confirmed/i.test(message)) {
    return "We couldn't verify your account. Please contact your pharmacy admin for access."
  }
  if (/invalid.*credentials|invalid login/i.test(message)) {
    return "Incorrect email or password. Please try again."
  }
  return message
}

interface LoginFormProps {
  /** Pre-filled pharmacy code (slug) e.g. from /t/[slug]/login or tenant subdomain */
  initialPharmacyCode?: string
  /** When true, pharmacy code field is read-only (tenant URL / subdomain) */
  lockPharmacyCode?: boolean
}

export default function LoginForm({ initialPharmacyCode, lockPharmacyCode }: LoginFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const { close, openForgotPassword } = useAuthDialog()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pharmacyCode, setPharmacyCode] = useState(initialPharmacyCode ?? "")
  const [pharmacyName, setPharmacyName] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  // Second step: the password was accepted and the account needs an authenticator code. Credentials
  // stay in memory only for this step and are dropped on "Back" or success.
  // For a Google sign-in the "credentials" are the Google ID token (kept in memory for this step only).
  const [twoFactor, setTwoFactor] = useState<
    | { kind: "password"; email: string; password: string; tenant: string }
    | { kind: "google"; email: string; idToken: string; tenant: string }
    | null
  >(null)
  // Google account connected to several pharmacies: the user picks one (same ID token is re-posted).
  const [pharmacyChoice, setPharmacyChoice] = useState<{ idToken: string; email: string; pharmacies: GooglePharmacyChoice[] } | null>(null)
  const [googleBusy, setGoogleBusy] = useState(false)
  const [totp, setTotp] = useState("")
  // Lost-authenticator path: a one-time recovery code instead of the 6-digit TOTP.
  const [useRecovery, setUseRecovery] = useState(false)
  const [recoveryCode, setRecoveryCode] = useState("")
  const totpRef = useRef<HTMLInputElement>(null)
  const recoveryRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const errorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setPharmacyCode((prev) => initialPharmacyCode ?? prev)
  }, [initialPharmacyCode])

  useEffect(() => {
    if (error) errorRef.current?.focus()
  }, [error])

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => {
      getPharmacyNameByCode(pharmacyCode)
        .then((name) => {
          if (!cancelled) setPharmacyName(name)
        })
        .catch(() => {
          if (!cancelled) setPharmacyName(null)
        })
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [pharmacyCode])

  const finishSignIn = () => {
    toast({
      title: "Signed in",
      description: "Redirecting to dashboard…",
      variant: "default",
    })

    // Full navigation avoids a race between dialog close (router.replace) and client push to /dashboard.
    setTimeout(() => {
      if (typeof window !== "undefined") {
        window.location.assign("/dashboard")
      } else {
        close()
        router.push("/dashboard")
        router.refresh()
      }
    }, 400)
  }

  const performLogin = async (
    email: string,
    password: string,
    tenant: string,
    second?: { twoFactorCode?: string; recoveryCode?: string },
  ) => {
    const twoFactorCode = second?.twoFactorCode
    const usedRecovery = !!second?.recoveryCode
    setIsLoading(true)
    setError(null)
    try {
      const result = await signInWithDotnet({
        email,
        password,
        tenant: tenant.trim() || undefined,
        twoFactorCode,
        recoveryCode: second?.recoveryCode,
      })
      if (!result.ok) {
        const step = twoFactorSignInState(result.message)
        if (step === "required" && !twoFactorCode && !usedRecovery) {
          setTwoFactor({ kind: "password", email, password, tenant })
          setTotp("")
          setRecoveryCode("")
          setUseRecovery(false)
          return
        }
        if (step && usedRecovery) {
          setError(
            step === "invalid"
              ? "That recovery code didn't work. Check for typos — each code can be used only once."
              : stripTwoFactorPrefix(result.message),
          )
          recoveryRef.current?.focus()
          return
        }
        if (step) {
          setError(
            step === "invalid"
              ? "That code didn't work. Codes change every 30 seconds — enter the one showing now."
              : stripTwoFactorPrefix(result.message),
          )
          setTotp("")
          totpRef.current?.focus()
          return
        }
        setError(friendlyAuthError(result.message))
        if (usedRecovery) recoveryRef.current?.focus()
        else if (twoFactorCode) totpRef.current?.focus()
        else passwordRef.current?.focus()
        return
      }
      setTwoFactor(null)
      finishSignIn()
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  /** Sign in with a Google ID token; `tenant` is the pharmacy code if known (typed, from the link, or picked). */
  const performGoogleLogin = async (
    idToken: string,
    tenant: string,
    second?: { twoFactorCode?: string; recoveryCode?: string },
  ) => {
    const email = peekGoogleCredential(idToken).email ?? "your Google account"
    const usedRecovery = !!second?.recoveryCode
    setGoogleBusy(true)
    setIsLoading(true)
    setError(null)
    try {
      const result = await signInWithGoogle({
        idToken,
        tenant: tenant.trim() || undefined,
        twoFactorCode: second?.twoFactorCode,
        recoveryCode: second?.recoveryCode,
      })
      if (result.ok) {
        setTwoFactor(null)
        setPharmacyChoice(null)
        finishSignIn()
        return
      }
      if (result.needsPharmacy) {
        setPharmacyChoice({ idToken, email: result.email || email, pharmacies: result.pharmacies })
        return
      }
      const step = twoFactorSignInState(result.message)
      if (step === "required" && !second) {
        setPharmacyChoice(null)
        setTwoFactor({ kind: "google", email, idToken, tenant })
        setTotp("")
        setRecoveryCode("")
        setUseRecovery(false)
        return
      }
      if (step) {
        setError(
          step === "invalid"
            ? usedRecovery
              ? "That recovery code didn't work. Check for typos — each code can be used only once."
              : "That code didn't work. Codes change every 30 seconds — enter the one showing now."
            : stripTwoFactorPrefix(result.message),
        )
        if (usedRecovery) recoveryRef.current?.focus()
        else {
          setTotp("")
          totpRef.current?.focus()
        }
        return
      }
      setError(googleAuthError(result.code, result.message))
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setGoogleBusy(false)
      setIsLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const email = formData.get("email") as string
    const password = formData.get("password") as string
    await performLogin(email, password, pharmacyCode)
  }

  const handleDemoLogin = (account: DemoAccount) => {
    setPharmacyCode(account.tenant)
    if (emailRef.current) emailRef.current.value = account.email
    if (passwordRef.current) passwordRef.current.value = account.password
    void performLogin(account.email, account.password, account.tenant)
  }

  const submitSecondStep = (second: { twoFactorCode?: string; recoveryCode?: string }) => {
    if (!twoFactor) return
    if (twoFactor.kind === "google") void performGoogleLogin(twoFactor.idToken, twoFactor.tenant, second)
    else void performLogin(twoFactor.email, twoFactor.password, twoFactor.tenant, second)
  }

  const submitTotp = (code: string) => {
    if (!twoFactor || isLoading || !isCompleteTotp(code)) return
    submitSecondStep({ twoFactorCode: code })
  }

  const submitRecoveryCode = (value: string) => {
    if (!twoFactor || isLoading || !isCompleteRecoveryCode(value)) return
    submitSecondStep({ recoveryCode: normalizeRecoveryCode(value) })
  }

  const toggleRecovery = () => {
    setUseRecovery((prev) => !prev)
    setTotp("")
    setRecoveryCode("")
    setError(null)
  }

  const leaveTwoFactor = () => {
    setTwoFactor(null)
    setTotp("")
    setRecoveryCode("")
    setUseRecovery(false)
    setError(null)
  }

  if (pharmacyChoice) {
    return (
      <div className="w-full">
        <header className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15">
            <Store className="h-7 w-7" aria-hidden />
          </div>
          <h2 className="font-display text-xl font-bold tracking-tight text-foreground">Choose a pharmacy</h2>
          <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{pharmacyChoice.email}</span> is connected to more than one
            pharmacy. Which one do you want to open?
          </p>
        </header>

        {error && (
          <div
            ref={errorRef}
            role="alert"
            aria-live="assertive"
            tabIndex={-1}
            className="mb-4 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm text-destructive outline-none"
          >
            {error}
          </div>
        )}

        <ul className="space-y-2" aria-label="Your pharmacies">
          {pharmacyChoice.pharmacies.map((pharmacy) => (
            <li key={pharmacy.tenantId}>
              <button
                type="button"
                disabled={isLoading}
                onClick={() => void performGoogleLogin(pharmacyChoice.idToken, pharmacy.tenantId)}
                className="flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Building2 className="size-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-foreground">{pharmacy.tenantName}</span>
                  <span className="block truncate font-mono text-xs text-muted-foreground">{pharmacy.tenantId}</span>
                </span>
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
              </button>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={() => {
            setPharmacyChoice(null)
            setError(null)
          }}
          disabled={isLoading}
          className="mx-auto mt-5 flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to sign in
        </button>
      </div>
    )
  }

  if (twoFactor) {
    return (
      <div className="w-full">
        <header className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15">
            <ShieldCheck className="h-7 w-7" aria-hidden />
          </div>
          <h2 className="font-display text-xl font-bold tracking-tight text-foreground">Two-step verification</h2>
          <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
            {useRecovery
              ? "Enter one of the recovery codes you saved for "
              : "Enter the 6-digit code from your authenticator app for "}
            <span className="font-medium text-foreground">{twoFactor.email}</span>.
          </p>
        </header>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (useRecovery) submitRecoveryCode(recoveryCode)
            else submitTotp(totp)
          }}
        >
          {error && (
            <div
              ref={errorRef}
              id="totp-error"
              role="alert"
              aria-live="assertive"
              tabIndex={-1}
              className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm text-destructive outline-none"
            >
              {error}
            </div>
          )}

          {useRecovery ? (
            <div className="space-y-2">
              <label htmlFor="recovery-code" className="text-sm font-medium text-foreground">
                Recovery code
              </label>
              <div className="relative">
                <KeyRound
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  ref={recoveryRef}
                  id="recovery-code"
                  name="recovery-code"
                  type="text"
                  autoComplete="one-time-code"
                  autoCapitalize="characters"
                  spellCheck={false}
                  placeholder="XXXXX-XXXXX"
                  maxLength={RECOVERY_CODE_MAX_INPUT}
                  value={recoveryCode}
                  onChange={(e) => setRecoveryCode(e.target.value)}
                  disabled={isLoading}
                  autoFocus
                  aria-invalid={!!error}
                  aria-describedby={error ? "totp-error recovery-help" : "recovery-help"}
                  className="h-11 bg-muted/30 pl-9 font-mono uppercase tracking-wider"
                />
              </div>
              <p id="recovery-help" className="text-xs text-muted-foreground">
                Each recovery code works once. Once you&apos;re in, set up your authenticator again or create new
                codes from your profile.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <label htmlFor="totp" className="text-sm font-medium text-foreground">
                Authentication code
              </label>
              <TotpCodeInput
                ref={totpRef}
                id="totp"
                value={totp}
                onChange={setTotp}
                onComplete={submitTotp}
                invalid={!!error}
                disabled={isLoading}
                autoFocus
                describedBy={error ? "totp-error totp-help" : "totp-help"}
              />
              <p id="totp-help" className="text-xs text-muted-foreground">
                Open Google Authenticator, Microsoft Authenticator or a similar app. Lost your phone and your recovery
                codes? Ask your pharmacy admin to reset two-step verification for your account.
              </p>
            </div>
          )}

          <Button
            type="submit"
            loading={isLoading}
            loadingText="Verifying…"
            disabled={useRecovery ? !isCompleteRecoveryCode(recoveryCode) : !isCompleteTotp(totp)}
            className="h-11 w-full font-semibold"
          >
            Verify and sign in
          </Button>

          <button
            type="button"
            onClick={toggleRecovery}
            disabled={isLoading}
            className="mx-auto flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-primary underline-offset-2 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            {useRecovery ? (
              <>
                <ShieldCheck className="h-4 w-4" aria-hidden />
                Use your authenticator app instead
              </>
            ) : (
              <>
                <KeyRound className="h-4 w-4" aria-hidden />
                Use a recovery code instead
              </>
            )}
          </button>

          <button
            type="button"
            onClick={leaveTwoFactor}
            disabled={isLoading}
            className="mx-auto flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Use a different account
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="w-full">
      <header className="mb-6 flex flex-col items-center text-center">
        <BrandMark className="mb-5 size-12 drop-shadow-sm" />
        <h2 className="font-display text-xl font-bold tracking-tight text-foreground">Welcome back</h2>
        <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
          Sign in to your pharmacy workspace
        </p>
      </header>

      {SHOW_DEMO_LOGINS && (
        <div className="mb-6 rounded-lg border border-dashed border-amber-400/50 bg-amber-50/50 p-3 dark:bg-amber-950/20">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
            Demo accounts (dev only)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.email}
                type="button"
                disabled={isLoading}
                onClick={() => handleDemoLogin(account)}
                className="cursor-pointer rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium text-amber-900 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-900/50"
              >
                {account.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <GoogleButton
        text="signin_with"
        context="signin"
        busy={googleBusy}
        onCredential={(idToken) => void performGoogleLogin(idToken, pharmacyCode)}
        className="mb-4"
      />
      <AuthDivider label="or sign in with email" />

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        {error && (
          <div
            ref={errorRef}
            role="alert"
            aria-live="assertive"
            tabIndex={-1}
            className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm text-destructive outline-none animate-in fade-in slide-in-from-top-1 duration-200"
          >
            {error}
          </div>
        )}

        <div className="space-y-2">
          <label htmlFor="pharmacyCode" className="text-sm font-medium text-foreground">
            Pharmacy code{" "}
            <span className="font-normal text-muted-foreground">
              {lockPharmacyCode ? "(from your login link)" : "(required for pharmacy staff)"}
            </span>
          </label>
          <div className="relative">
            <Building2
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              id="pharmacyCode"
              name="pharmacyCode"
              type="text"
              placeholder="e.g. acme-pharmacy"
              value={pharmacyCode}
              onChange={(e) => !lockPharmacyCode && setPharmacyCode(e.target.value)}
              readOnly={lockPharmacyCode}
              className="h-11 bg-muted/30 pl-9 read-only:opacity-90"
              autoComplete="organization"
            />
          </div>
          {pharmacyName && (
            <p className="text-xs font-medium text-foreground">Signing in to {pharmacyName}</p>
          )}
          {!lockPharmacyCode && (
            <p className="text-xs text-muted-foreground">
              Superadmin can leave this blank. Pharmacy users must use <span className="font-mono">/t/your-code/login</span>{" "}
              or enter their code.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium text-foreground">
            Email
          </label>
          <div className="relative">
            <Mail
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              ref={emailRef}
              id="email"
              name="email"
              type="email"
              placeholder="you@example.com"
              required
              aria-invalid={!!error}
              className="h-11 bg-muted/30 pl-9"
              autoComplete="email"
              autoFocus
            />
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium text-foreground">
            Password
          </label>
          <div className="relative">
            <Lock
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              ref={passwordRef}
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              required
              aria-invalid={!!error}
              className="h-11 bg-muted/30 pl-9 pr-10"
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              {showPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={() => openForgotPassword()}
            className="cursor-pointer text-sm font-medium text-primary hover:underline"
          >
            Forgot password?
          </button>
        </div>

        <Button
          type="submit"
          loading={isLoading}
          loadingText="Signing in…"
          className="h-11 w-full font-semibold"
        >
          Sign in
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          New pharmacy?{" "}
          <AuthDialogLink mode="onboarding" className="font-medium text-primary hover:underline">
            Create your pharmacy
          </AuthDialogLink>
        </p>
      </form>
    </div>
  )
}
