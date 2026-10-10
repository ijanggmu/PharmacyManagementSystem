"use client"

/**
 * Onboarding — "Create your pharmacy".
 *
 * Three steps (account → pharmacy → review), then live provisioning progress and automatic sign-in.
 * The account can be created with Google (name and verified email come from Google, no password) or with
 * email and password. Calls the .NET anonymous self-service signup (POST /api/v1/tenants/signup via the
 * /api/dotnet/tenants/signup BFF), which wraps CreateTenant: the visitor becomes the new pharmacy's Admin
 * on the default free plan. Validation mirrors the server (lib/onboarding/get-started.ts).
 */

import { useEffect, useRef, useState } from "react"
import { ArrowLeft, ArrowRight, Building2, CheckCircle2, Eye, EyeOff, Loader2, Mail, Pencil, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { useAuthDialog } from "@/lib/contexts/auth-dialog-context"
import {
  checkSignUpAvailability,
  signInWithDotnet,
  signInWithGoogle,
  signUpTenantWithDotnet,
  verifyGoogleSignUp,
  type GoogleSignUpProfile,
} from "@/lib/api/auth-api"
import { AuthDivider, GoogleButton } from "@/components/auth/google-button"
import { StepIndicator } from "@/components/get-started/step-indicator"
import { PasswordStrength } from "@/components/get-started/password-strength"
import { ProvisioningProgress } from "@/components/get-started/provisioning-progress"
import {
  DRAFT_FIELDS,
  INITIAL_DATA,
  STEP_FIELDS,
  slugify,
  validateAll,
  validateStep,
  type FieldErrors,
  type FieldName,
  type GetStartedData,
  type StepId,
} from "@/lib/onboarding/get-started"

const DRAFT_KEY = "pharmacare:onboarding-draft"

type Availability = { state: "idle" | "checking" | "available" | "taken" | "unknown"; message?: string }

interface GoogleAccount extends GoogleSignUpProfile {
  idToken: string
}

interface Created {
  tenantId: string
  correlationId: string | null
  status: string | null
  pharmacyName: string
  /** Kept in memory only, for the automatic sign-in after provisioning. */
  credentials: { kind: "password"; email: string; password: string } | { kind: "google"; idToken: string }
}

export function GetStartedForm() {
  const { openSignIn } = useAuthDialog()

  const [step, setStep] = useState<StepId>("account")
  const [completed, setCompleted] = useState<Set<StepId>>(new Set())
  const [data, setData] = useState<GetStartedData>(INITIAL_DATA)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({})
  const [slugEdited, setSlugEdited] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [google, setGoogle] = useState<GoogleAccount | null>(null)
  const [googleBusy, setGoogleBusy] = useState(false)
  const [slugCheck, setSlugCheck] = useState<Availability>({ state: "idle" })
  const [nameCheck, setNameCheck] = useState<Availability>({ state: "idle" })
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [created, setCreated] = useState<Created | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const errorRef = useRef<HTMLDivElement>(null)

  const withGoogle = google !== null
  const derivedSlug = data.slug || slugify(data.pharmacyName)

  // Restore a non-sensitive draft.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY)
      if (!raw) return
      const draft = JSON.parse(raw) as Partial<Record<FieldName, string>> & { _slugEdited?: boolean }
      const restored: Partial<GetStartedData> = {}
      for (const field of DRAFT_FIELDS) if (typeof draft[field] === "string") restored[field] = draft[field]
      setData((prev) => ({ ...prev, ...restored }))
      if (draft._slugEdited) setSlugEdited(true)
    } catch {
      // Storage unavailable or corrupt draft — start fresh.
    }
  }, [])

  // Save the draft (never passwords or the Google token).
  useEffect(() => {
    if (created) return
    try {
      const draft: Record<string, string | boolean> = { _slugEdited: slugEdited }
      for (const field of DRAFT_FIELDS) draft[field] = data[field]
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    } catch {
      // Ignore — draft saving is a convenience.
    }
  }, [data, slugEdited, created])

  // Live availability of the pharmacy code (debounced).
  useEffect(() => {
    if (step !== "pharmacy" || !derivedSlug || validateStep("pharmacy", { ...data, slug: derivedSlug }, withGoogle).slug) {
      setSlugCheck({ state: "idle" })
      return
    }
    const controller = new AbortController()
    setSlugCheck({ state: "checking" })
    const timer = setTimeout(async () => {
      const result = await checkSignUpAvailability({ slug: derivedSlug }, fetch, controller.signal)
      if (controller.signal.aborted) return
      if (!result || result.slugAvailable === null) setSlugCheck({ state: "unknown" })
      else setSlugCheck(result.slugAvailable ? { state: "available" } : { state: "taken", message: result.slugMessage ?? "This code is already taken." })
    }, 400)
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [derivedSlug, step])

  // Live availability of the pharmacy name (debounced).
  useEffect(() => {
    const name = data.pharmacyName.trim()
    if (step !== "pharmacy" || name.length < 2) {
      setNameCheck({ state: "idle" })
      return
    }
    const controller = new AbortController()
    setNameCheck({ state: "checking" })
    const timer = setTimeout(async () => {
      const result = await checkSignUpAvailability({ name }, fetch, controller.signal)
      if (controller.signal.aborted) return
      if (!result || result.nameAvailable === null) setNameCheck({ state: "unknown" })
      else setNameCheck(result.nameAvailable ? { state: "available" } : { state: "taken", message: result.nameMessage ?? "Name already registered." })
    }, 500)
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [data.pharmacyName, step])

  useEffect(() => {
    if (formError) errorRef.current?.focus()
  }, [formError])

  const update = <K extends FieldName>(field: K, value: GetStartedData[K]) => {
    setData((prev) => {
      const next = { ...prev, [field]: value }
      if (field === "pharmacyName" && !slugEdited) next.slug = slugify(String(value))
      return next
    })
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }))
    if (formError) setFormError(null)
  }

  const blur = (field: FieldName) => {
    setTouched((prev) => ({ ...prev, [field]: true }))
    const scope: Exclude<StepId, "review"> = STEP_FIELDS.account.includes(field) ? "account" : "pharmacy"
    const stepErrors = validateStep(scope, { ...data, slug: derivedSlug }, withGoogle)
    setErrors((prev) => ({ ...prev, [field]: stepErrors[field] }))
  }

  const fieldError = (f: FieldName) => (touched[f] ? errors[f] : undefined)

  const focusField = (field: FieldName) =>
    requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>(`#ob-${field}`)?.focus())

  const goTo = (next: StepId) => {
    setStep(next)
    setFormError(null)
    requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>("h3")?.focus())
  }

  /** Validate the current step; on success mark it done and move on. */
  const next = () => {
    if (step === "review") return
    const candidate = { ...data, slug: derivedSlug }
    const stepErrors = validateStep(step, candidate, withGoogle)
    if (step === "pharmacy" && slugCheck.state === "taken") stepErrors.slug = slugCheck.message
    if (step === "pharmacy" && nameCheck.state === "taken") stepErrors.pharmacyName = nameCheck.message
    const fields = STEP_FIELDS[step]
    setTouched((prev) => ({ ...prev, ...Object.fromEntries(fields.map((f) => [f, true])) }))
    setErrors((prev) => ({ ...prev, ...Object.fromEntries(fields.map((f) => [f, stepErrors[f]])) }))
    const firstInvalid = fields.find((f) => stepErrors[f])
    if (firstInvalid) {
      focusField(firstInvalid)
      return
    }
    setData(candidate)
    setCompleted((prev) => new Set(prev).add(step))
    goTo(step === "account" ? "pharmacy" : "review")
  }

  const handleGoogleCredential = async (idToken: string) => {
    setGoogleBusy(true)
    setFormError(null)
    try {
      const result = await verifyGoogleSignUp(idToken)
      if (!result.ok) {
        setFormError(
          /unverified/i.test(result.message)
            ? "This Google account's email isn't verified. Verify it with Google or sign up with email instead."
            : result.message || "We couldn't verify your Google account. Please try again.",
        )
        return
      }
      const profile = result.profile
      setGoogle({ ...profile, idToken })
      setData((prev) => ({
        ...prev,
        adminEmail: profile.email,
        adminFirstName: prev.adminFirstName || profile.firstName || "",
        adminLastName: prev.adminLastName || profile.lastName || "",
        adminPassword: "",
        adminConfirmPassword: "",
      }))
      setErrors({})
    } catch {
      setFormError("Network error — please check your connection and try again.")
    } finally {
      setGoogleBusy(false)
    }
  }

  const useEmailInstead = () => {
    setGoogle(null)
    setData((prev) => ({ ...prev, adminEmail: "" }))
    setCompleted((prev) => {
      const nextSet = new Set(prev)
      nextSet.delete("account")
      return nextSet
    })
  }

  const handleCreate = async () => {
    const candidate = { ...data, slug: derivedSlug }
    const { errors: allErrors, firstInvalidStep } = validateAll(candidate, withGoogle)
    if (firstInvalidStep) {
      setErrors(allErrors)
      setTouched(Object.fromEntries(Object.keys(INITIAL_DATA).map((f) => [f, true])))
      goTo(firstInvalidStep)
      return
    }

    setSubmitting(true)
    setFormError(null)
    try {
      const outcome = await signUpTenantWithDotnet({
        pharmacyName: candidate.pharmacyName.trim(),
        slug: candidate.slug,
        adminFirstName: candidate.adminFirstName.trim(),
        adminLastName: candidate.adminLastName.trim(),
        adminEmail: candidate.adminEmail.trim(),
        ...(google
          ? { googleIdToken: google.idToken }
          : { adminPassword: candidate.adminPassword, adminConfirmPassword: candidate.adminConfirmPassword }),
        phoneNumber: candidate.phoneNumber.trim() || undefined,
      })

      if (!outcome.ok) {
        const message = outcome.message || "Something went wrong creating your pharmacy. Please try again."
        // Send the user to the step with the problem when the server names one.
        if (/slug|code|already exists|tenant id/i.test(message)) {
          setErrors((prev) => ({ ...prev, slug: message }))
          setTouched((prev) => ({ ...prev, slug: true }))
          goTo("pharmacy")
          focusField("slug")
        } else if (/name/i.test(message) && !/first|last/i.test(message)) {
          setErrors((prev) => ({ ...prev, pharmacyName: message }))
          setTouched((prev) => ({ ...prev, pharmacyName: true }))
          goTo("pharmacy")
          focusField("pharmacyName")
        } else if (/google/i.test(message)) {
          setFormError(`${message} Use "Sign up with email" instead if this keeps happening.`)
        } else {
          setFormError(message)
        }
        return
      }

      setCreated({
        tenantId: outcome.tenantId,
        correlationId: outcome.provisioningCorrelationId,
        status: outcome.status,
        pharmacyName: candidate.pharmacyName.trim(),
        credentials: google
          ? { kind: "google", idToken: google.idToken }
          : { kind: "password", email: candidate.adminEmail.trim(), password: candidate.adminPassword },
      })
      try {
        sessionStorage.removeItem(DRAFT_KEY)
      } catch {
        // ignore
      }
    } catch {
      setFormError("Network error — please check your connection and try again.")
    } finally {
      setSubmitting(false)
    }
  }

  if (created) {
    const autoSignIn = async () => {
      const credentials = created.credentials
      const result =
        credentials.kind === "google"
          ? await signInWithGoogle({ idToken: credentials.idToken, tenant: created.tenantId })
          : await signInWithDotnet({ email: credentials.email, password: credentials.password, tenant: created.tenantId })
      if (!result.ok) return false
      setTimeout(() => window.location.assign("/dashboard"), 600)
      return true
    }
    return (
      <ProvisioningProgress
        tenantId={created.tenantId}
        correlationId={created.correlationId}
        initialStatus={created.status}
        pharmacyName={created.pharmacyName}
        autoSignIn={autoSignIn}
        onManualSignIn={() => openSignIn(created.tenantId)}
      />
    )
  }

  return (
    <div className="mx-auto w-full max-w-lg">
      <header className="mb-5 text-center">
        <span
          className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15"
          aria-hidden
        >
          <Building2 className="h-5 w-5" />
        </span>
        <h2 className="mt-3 font-display text-xl font-bold tracking-tight text-foreground">Create your pharmacy</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Free to start. You&rsquo;ll be the Admin — ready in a few seconds.
        </p>
      </header>

      <StepIndicator current={step} completed={completed} onSelect={goTo} disabled={submitting} />

      {formError && (
        <div
          ref={errorRef}
          role="alert"
          tabIndex={-1}
          className="mb-4 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm text-destructive outline-none"
        >
          {formError}
        </div>
      )}

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          if (step === "review") void handleCreate()
          else next()
        }}
      >
        <div ref={panelRef} className="space-y-5">
          {step === "account" && (
            <section aria-labelledby="ob-step-account" className="space-y-5">
              <StepHeading id="ob-step-account" title="Your account" description="You'll use this to sign in as the pharmacy's Admin." />

              {google ? (
                <div className="flex items-center gap-3 rounded-lg border border-success/30 bg-success/5 p-3">
                  {google.picture ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={google.picture} alt="" className="size-10 rounded-full" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="flex size-10 items-center justify-center rounded-full bg-success/15 text-success">
                      <CheckCircle2 className="size-5" aria-hidden />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">Signing up with Google</p>
                    <p className="truncate text-xs text-muted-foreground">{google.email}</p>
                  </div>
                  <Button type="button" variant="ghost" size="sm" onClick={useEmailInstead}>
                    Use email instead
                  </Button>
                </div>
              ) : (
                <>
                  <GoogleButton text="signup_with" context="signup" busy={googleBusy} onCredential={(t) => void handleGoogleCredential(t)} />
                  <AuthDivider label="or sign up with email" />
                </>
              )}

              <div className="grid gap-5 sm:grid-cols-2">
                <Field id="adminFirstName" label="First name" required error={fieldError("adminFirstName")}>
                  <Input
                    id="ob-adminFirstName"
                    value={data.adminFirstName}
                    onChange={(e) => update("adminFirstName", e.target.value)}
                    onBlur={() => blur("adminFirstName")}
                    autoComplete="given-name"
                    aria-invalid={!!fieldError("adminFirstName")}
                    aria-describedby={fieldError("adminFirstName") ? "ob-adminFirstName-error" : undefined}
                    className="h-11"
                  />
                </Field>
                <Field id="adminLastName" label="Last name" required error={fieldError("adminLastName")}>
                  <Input
                    id="ob-adminLastName"
                    value={data.adminLastName}
                    onChange={(e) => update("adminLastName", e.target.value)}
                    onBlur={() => blur("adminLastName")}
                    autoComplete="family-name"
                    aria-invalid={!!fieldError("adminLastName")}
                    aria-describedby={fieldError("adminLastName") ? "ob-adminLastName-error" : undefined}
                    className="h-11"
                  />
                </Field>
              </div>

              <Field
                id="adminEmail"
                label="Email"
                required
                error={fieldError("adminEmail")}
                hint={google ? "Verified by Google — this is your admin sign-in." : "This is your admin sign-in email."}
              >
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input
                    id="ob-adminEmail"
                    type="email"
                    inputMode="email"
                    value={data.adminEmail}
                    onChange={(e) => !google && update("adminEmail", e.target.value)}
                    onBlur={() => blur("adminEmail")}
                    readOnly={!!google}
                    autoComplete="email"
                    placeholder="owner@yourpharmacy.com"
                    aria-invalid={!!fieldError("adminEmail")}
                    aria-describedby={fieldError("adminEmail") ? "ob-adminEmail-error" : "ob-adminEmail-hint"}
                    className="h-11 pl-9 read-only:bg-muted/50 read-only:text-muted-foreground"
                  />
                </div>
              </Field>

              {!google && (
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field id="adminPassword" label="Password" required error={fieldError("adminPassword")}>
                    <div className="relative">
                      <Input
                        id="ob-adminPassword"
                        type={showPassword ? "text" : "password"}
                        value={data.adminPassword}
                        onChange={(e) => update("adminPassword", e.target.value)}
                        onBlur={() => blur("adminPassword")}
                        autoComplete="new-password"
                        aria-invalid={!!fieldError("adminPassword")}
                        aria-describedby={cn("ob-password-strength", fieldError("adminPassword") && "ob-adminPassword-error")}
                        className="h-11 pr-11"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        aria-pressed={showPassword}
                        className="absolute right-1 top-1/2 flex size-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                      >
                        {showPassword ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                      </button>
                    </div>
                  </Field>
                  <Field id="adminConfirmPassword" label="Confirm password" required error={fieldError("adminConfirmPassword")}>
                    <Input
                      id="ob-adminConfirmPassword"
                      type={showPassword ? "text" : "password"}
                      value={data.adminConfirmPassword}
                      onChange={(e) => update("adminConfirmPassword", e.target.value)}
                      onBlur={() => blur("adminConfirmPassword")}
                      autoComplete="new-password"
                      aria-invalid={!!fieldError("adminConfirmPassword")}
                      aria-describedby={fieldError("adminConfirmPassword") ? "ob-adminConfirmPassword-error" : undefined}
                      className="h-11"
                    />
                  </Field>
                  <div className="sm:col-span-2">
                    <PasswordStrength id="ob-password-strength" password={data.adminPassword} />
                  </div>
                </div>
              )}
            </section>
          )}

          {step === "pharmacy" && (
            <section aria-labelledby="ob-step-pharmacy" className="space-y-5">
              <StepHeading id="ob-step-pharmacy" title="Your pharmacy" description="How your pharmacy appears, and the code your staff use to sign in." />

              <Field
                id="pharmacyName"
                label="Pharmacy name"
                required
                error={fieldError("pharmacyName") ?? (nameCheck.state === "taken" ? nameCheck.message : undefined)}
                status={<AvailabilityBadge check={nameCheck} />}
              >
                <Input
                  id="ob-pharmacyName"
                  value={data.pharmacyName}
                  onChange={(e) => update("pharmacyName", e.target.value)}
                  onBlur={() => blur("pharmacyName")}
                  placeholder="Sunrise Pharmacy"
                  autoComplete="organization"
                  aria-invalid={!!fieldError("pharmacyName") || nameCheck.state === "taken"}
                  aria-describedby="ob-pharmacyName-error"
                  className="h-11"
                />
              </Field>

              <Field
                id="slug"
                label="Pharmacy code"
                required
                error={fieldError("slug") ?? (slugCheck.state === "taken" ? slugCheck.message : undefined)}
                status={<AvailabilityBadge check={slugCheck} />}
                hint={
                  <>
                    Staff sign in at <span className="break-all font-mono text-foreground">/t/{derivedSlug || "your-code"}/login</span>.
                    It can&rsquo;t be changed later.
                  </>
                }
              >
                <Input
                  id="ob-slug"
                  value={derivedSlug}
                  onChange={(e) => {
                    setSlugEdited(true)
                    update("slug", e.target.value.toLowerCase())
                  }}
                  onBlur={() => blur("slug")}
                  placeholder="sunrise-pharmacy"
                  autoCapitalize="none"
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={!!fieldError("slug") || slugCheck.state === "taken"}
                  aria-describedby="ob-slug-error ob-slug-hint"
                  className="h-11 font-mono"
                />
              </Field>

              <Field id="phoneNumber" label="Phone" optional error={fieldError("phoneNumber")} hint="So we can reach you about your account.">
                <Input
                  id="ob-phoneNumber"
                  type="tel"
                  inputMode="tel"
                  value={data.phoneNumber}
                  onChange={(e) => update("phoneNumber", e.target.value)}
                  onBlur={() => blur("phoneNumber")}
                  autoComplete="tel"
                  placeholder="+977 98XXXXXXXX"
                  aria-invalid={!!fieldError("phoneNumber")}
                  aria-describedby="ob-phoneNumber-error ob-phoneNumber-hint"
                  className="h-11"
                />
              </Field>
            </section>
          )}

          {step === "review" && (
            <section aria-labelledby="ob-step-review" className="space-y-4">
              <StepHeading id="ob-step-review" title="Review and create" description="Check the details below. You can change your name and phone later from your profile." />

              <ReviewCard title="Account" onEdit={() => goTo("account")} disabled={submitting}>
                <ReviewRow label="Name" value={`${data.adminFirstName} ${data.adminLastName}`.trim()} />
                <ReviewRow label="Email" value={data.adminEmail} />
                <ReviewRow label="Sign-in" value={withGoogle ? "Google" : "Email and password"} />
              </ReviewCard>
              <ReviewCard title="Pharmacy" onEdit={() => goTo("pharmacy")} disabled={submitting}>
                <ReviewRow label="Name" value={data.pharmacyName} />
                <ReviewRow label="Code" value={derivedSlug} mono />
                <ReviewRow label="Phone" value={data.phoneNumber || "—"} />
              </ReviewCard>

              <p className="text-xs leading-relaxed text-muted-foreground">
                We&rsquo;ll create a <span className="font-medium text-foreground">Main Branch</span> for you on the free plan — no
                payment needed. By creating a pharmacy you agree to our{" "}
                <a href="/terms" className="font-medium text-primary underline-offset-2 hover:underline">Terms</a> and{" "}
                <a href="/privacy" className="font-medium text-primary underline-offset-2 hover:underline">Privacy Policy</a>.
              </p>
            </section>
          )}
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
          {step === "account" ? (
            <p className="text-center text-sm text-muted-foreground sm:text-left">
              Already have an account?{" "}
              <button type="button" className="cursor-pointer font-medium text-primary hover:underline" onClick={() => openSignIn()}>
                Sign in
              </button>
            </p>
          ) : (
            <Button
              type="button"
              variant="ghost"
              disabled={submitting}
              onClick={() => goTo(step === "review" ? "pharmacy" : "account")}
              className="h-11"
            >
              <ArrowLeft aria-hidden />
              Back
            </Button>
          )}
          <Button type="submit" size="lg" className="h-11 sm:min-w-44" disabled={submitting || googleBusy}>
            {step === "review" ? (
              submitting ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden />
                  Creating…
                </>
              ) : (
                <>
                  Create pharmacy
                  <ArrowRight aria-hidden />
                </>
              )
            ) : (
              <>
                Continue
                <ArrowRight aria-hidden />
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}

function StepHeading({ id, title, description }: { id: string; title: string; description: string }) {
  return (
    <div>
      <h3 id={id} tabIndex={-1} className="text-base font-semibold text-foreground outline-none">
        {title}
      </h3>
      <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
    </div>
  )
}

function Field({
  id,
  label,
  required,
  optional,
  hint,
  error,
  status,
  children,
}: {
  id: FieldName
  label: string
  required?: boolean
  optional?: boolean
  hint?: React.ReactNode
  error?: string
  status?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={`ob-${id}`} className="text-sm font-medium text-foreground">
          {label}
          {required && (
            <>
              <span className="text-destructive" aria-hidden>
                {" "}*
              </span>
              <span className="sr-only"> (required)</span>
            </>
          )}
          {optional && <span className="font-normal text-muted-foreground"> (optional)</span>}
        </Label>
        {status}
      </div>
      {children}
      {error && (
        <p id={`ob-${id}-error`} role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={`ob-${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  )
}

function AvailabilityBadge({ check }: { check: Availability }) {
  if (check.state === "checking") {
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground" aria-live="polite">
        <Loader2 className="size-3 animate-spin" aria-hidden />
        Checking…
      </span>
    )
  }
  if (check.state === "available") {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-success" aria-live="polite">
        <CheckCircle2 className="size-3.5" aria-hidden />
        Available
      </span>
    )
  }
  if (check.state === "taken") {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-destructive" aria-live="polite">
        <XCircle className="size-3.5" aria-hidden />
        Unavailable
      </span>
    )
  }
  return null
}

function ReviewCard({
  title,
  onEdit,
  disabled,
  children,
}: {
  title: string
  onEdit: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border bg-muted/30 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        <Button type="button" variant="ghost" size="sm" onClick={onEdit} disabled={disabled} aria-label={`Edit ${title.toLowerCase()}`}>
          <Pencil aria-hidden />
          Edit
        </Button>
      </div>
      <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[7rem_1fr]">{children}</dl>
    </div>
  )
}

function ReviewRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("min-w-0 break-words text-foreground", mono && "font-mono")}>{value}</dd>
    </>
  )
}
