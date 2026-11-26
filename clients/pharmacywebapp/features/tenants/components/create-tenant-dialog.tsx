"use client"

import { cn } from "@/lib/utils"
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react"
import { CheckCircle2, Copy, Download, Eye, EyeOff, Loader2, Mail, RefreshCw, Wand2, XCircle } from "lucide-react"
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
import { tenantsApi } from "@/features/tenants/api-client"
import { createTenantSchema, type CreateTenantForm } from "@/features/tenants/schemas/create-tenant"
import { downloadWelcomePdf, tenantSignInUrl, welcomeKitRows, welcomeKitText, type WelcomeKitDetails } from "@/features/tenants/lib/welcome-kit"
import type { TenantCodeSuggestion } from "@/features/tenants/types"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { DotnetApiError } from "@/lib/api/dotnet-client"
import { problemFieldErrors } from "@/lib/api/dotnet-problem"
import { generateStrongPassword } from "@/lib/utils/password-policy"
import { useToast } from "@/hooks/use-toast"

type Field = keyof CreateTenantForm
type FieldErrors = Partial<Record<Field, string>>

const EMPTY_FORM: CreateTenantForm = { name: "", adminEmail: "", adminPassword: "", confirmPassword: "" }

function validate(values: CreateTenantForm): FieldErrors {
  const parsed = createTenantSchema.safeParse(values)
  if (parsed.success) return {}
  const errors: FieldErrors = {}
  for (const issue of parsed.error.issues) {
    const field = issue.path[0] as Field
    errors[field] ??= issue.message
  }
  return errors
}

/** Debounced preview of the tenant code the API will generate, plus the name-taken check. */
function useCodeSuggestion(name: string, enabled: boolean) {
  const [state, setState] = useState<{ loading: boolean; data: TenantCodeSuggestion | null; error: boolean }>({
    loading: false,
    data: null,
    error: false,
  })
  useEffect(() => {
    const trimmed = name.trim()
    if (!enabled || trimmed.length < 2) {
      setState({ loading: false, data: null, error: false })
      return
    }
    let cancelled = false
    setState((s) => ({ ...s, loading: true }))
    const timer = setTimeout(() => {
      tenantsApi
        .suggestTenantCode(trimmed)
        .then((data) => !cancelled && setState({ loading: false, data, error: false }))
        .catch(() => !cancelled && setState({ loading: false, data: null, error: true }))
    }, 350)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [name, enabled])
  return state
}

export function CreateTenantDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void | Promise<void>
}) {
  const { toast } = useToast()
  const [values, setValues] = useState<CreateTenantForm>(EMPTY_FORM)
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({})
  const [submitted, setSubmitted] = useState(false)
  const [serverErrors, setServerErrors] = useState<FieldErrors>({})
  const [createError, setCreateError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [created, setCreated] = useState<WelcomeKitDetails | null>(null)
  // One idempotency key per create attempt: a network retry of the same submit can't make two tenants.
  const attemptKey = useRef<string | null>(null)

  const suggestion = useCodeSuggestion(values.name, open && !created)

  useEffect(() => {
    if (open) return
    // Reset on close: the password must not outlive the dialog.
    setValues(EMPTY_FORM)
    setTouched({})
    setSubmitted(false)
    setServerErrors({})
    setCreateError(null)
    setShowPassword(false)
    setCreated(null)
    attemptKey.current = null
  }, [open])

  const clientErrors = validate(values)
  const errorFor = (field: Field): string | undefined =>
    serverErrors[field] ?? (submitted || touched[field] ? clientErrors[field] : undefined)
  const nameTaken = suggestion.data && !suggestion.data.nameAvailable ? suggestion.data.nameMessage ?? "This name is taken" : null

  const update = (field: Field) => (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value
    setValues((current) => ({ ...current, [field]: value }))
    setServerErrors((current) => ({ ...current, [field]: undefined }))
    attemptKey.current = null
  }
  const blur = (field: Field) => () => setTouched((current) => ({ ...current, [field]: true }))

  const generate = () => {
    const password = generateStrongPassword()
    setValues((current) => ({ ...current, adminPassword: password, confirmPassword: password }))
    setShowPassword(true)
    setServerErrors((current) => ({ ...current, adminPassword: undefined, confirmPassword: undefined }))
    attemptKey.current = null
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitted(true)
    setCreateError(null)
    const parsed = createTenantSchema.safeParse(values)
    if (!parsed.success || nameTaken) return

    setSubmitting(true)
    attemptKey.current ??= crypto.randomUUID()
    try {
      const result = await tenantsApi.createTenant(
        { name: parsed.data.name, adminEmail: parsed.data.adminEmail, adminPassword: parsed.data.adminPassword },
        attemptKey.current,
      )
      // Plan and validity come from the status call; the success screen still works without them.
      const status = await tenantsApi.getTenantStatus(result.id).catch(() => null)
      setCreated({
        pharmacyName: status?.name ?? parsed.data.name,
        tenantCode: result.id,
        signInUrl: tenantSignInUrl(window.location.origin, result.id),
        adminEmail: parsed.data.adminEmail,
        adminPassword: parsed.data.adminPassword,
        plan: status?.plan ?? null,
        validUpto: status?.validUpto ?? null,
      })
      void onCreated()
    } catch (err) {
      if (err instanceof DotnetApiError) {
        const fields = problemFieldErrors(err.normalized.details)
        const mapped: FieldErrors = {
          name: fields.name?.[0],
          adminEmail: fields.adminEmail?.[0],
          adminPassword: fields.adminPassword?.[0],
        }
        setServerErrors(mapped)
        const hasFieldError = Object.values(mapped).some(Boolean)
        setCreateError(hasFieldError ? "Fix the highlighted fields and try again." : err.normalized.message)
        // A rejected request is final: the next submit is a new attempt.
        attemptKey.current = null
      } else {
        setCreateError(apiRequestErrorMessage(err))
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (submitting ? null : onOpenChange(next))}>
      <DialogContent className={cn(DIALOG_CONTENT_SCROLL_BODY_CLASS, "sm:max-w-xl")}>
        {created ? (
          <CreatedView details={created} onDone={() => onOpenChange(false)} toast={toast} />
        ) : (
          <>
            <DialogHeader className="px-6 pb-2 pt-6">
              <DialogTitle>New tenant</DialogTitle>
              <DialogDescription>
                Sets up the pharmacy and its first admin account. The pharmacy code is made from the name. Fields marked * are required.
              </DialogDescription>
            </DialogHeader>

            <form className="flex min-h-0 flex-1 flex-col" onSubmit={onSubmit} noValidate>
              <DialogScrollBody className="space-y-4 py-4">
                {createError ? (
                  <Alert variant="destructive">
                    <AlertDescription>{createError}</AlertDescription>
                  </Alert>
                ) : null}

                <fieldset className="space-y-4">
                  <legend className="mb-1 text-sm font-semibold text-foreground">Pharmacy</legend>
                  <div className="space-y-2">
                    <Label htmlFor="tenant-name">
                      Pharmacy name <span className="text-destructive" aria-hidden>*</span>
                    </Label>
                    <Input
                      id="tenant-name"
                      value={values.name}
                      onChange={update("name")}
                      onBlur={blur("name")}
                      maxLength={200}
                      placeholder="Shree Ram Pharmacy"
                      autoComplete="off"
                      aria-invalid={!!(errorFor("name") ?? nameTaken)}
                      aria-describedby="tenant-name-help"
                    />
                    <div id="tenant-name-help" className="min-h-5 text-xs" aria-live="polite">
                      {errorFor("name") ? (
                        <p className="text-destructive">{errorFor("name")}</p>
                      ) : nameTaken ? (
                        <p className="flex items-center gap-1 text-destructive">
                          <XCircle className="size-3.5" aria-hidden />
                          {nameTaken}
                        </p>
                      ) : suggestion.loading ? (
                        <p className="flex items-center gap-1 text-muted-foreground">
                          <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
                          Checking the name…
                        </p>
                      ) : suggestion.data ? (
                        <p className="flex flex-wrap items-center gap-1 text-muted-foreground">
                          <CheckCircle2 className="size-3.5 text-success" aria-hidden />
                          Pharmacy code (used to sign in):
                          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">{suggestion.data.code}</code>
                        </p>
                      ) : suggestion.error ? (
                        <p className="text-muted-foreground">Couldn&apos;t preview the code. It will be made from the name when you create the tenant.</p>
                      ) : (
                        <p className="text-muted-foreground">The pharmacy code is made from this name and is always unique.</p>
                      )}
                    </div>
                  </div>
                </fieldset>

                <fieldset className="space-y-4 border-t pt-4">
                  <legend className="mb-1 text-sm font-semibold text-foreground">First admin account</legend>
                  <div className="space-y-2">
                    <Label htmlFor="tenant-admin-email">
                      Admin email <span className="text-destructive" aria-hidden>*</span>
                    </Label>
                    <Input
                      id="tenant-admin-email"
                      type="email"
                      inputMode="email"
                      value={values.adminEmail}
                      onChange={update("adminEmail")}
                      onBlur={blur("adminEmail")}
                      maxLength={256}
                      placeholder="owner@pharmacy.com"
                      autoComplete="off"
                      aria-invalid={!!errorFor("adminEmail")}
                      aria-describedby={errorFor("adminEmail") ? "tenant-admin-email-error" : undefined}
                    />
                    {errorFor("adminEmail") ? (
                      <p id="tenant-admin-email-error" className="text-sm text-destructive">{errorFor("adminEmail")}</p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor="tenant-admin-password">
                        Temporary password <span className="text-destructive" aria-hidden>*</span>
                      </Label>
                      <Button type="button" variant="ghost" size="sm" onClick={generate}>
                        <Wand2 aria-hidden />
                        Generate
                      </Button>
                    </div>
                    <div className="relative">
                      <Input
                        id="tenant-admin-password"
                        type={showPassword ? "text" : "password"}
                        value={values.adminPassword}
                        onChange={update("adminPassword")}
                        onBlur={blur("adminPassword")}
                        maxLength={128}
                        autoComplete="new-password"
                        className="pr-10 font-mono"
                        aria-invalid={!!errorFor("adminPassword")}
                        aria-describedby={
                          errorFor("adminPassword") ? "tenant-admin-password-rules tenant-admin-password-error" : "tenant-admin-password-rules"
                        }
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        aria-pressed={showPassword}
                      >
                        {showPassword ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                      </button>
                    </div>
                    <PasswordStrength id="tenant-admin-password-rules" password={values.adminPassword} />
                    {errorFor("adminPassword") ? (
                      <p id="tenant-admin-password-error" className="text-sm text-destructive">{errorFor("adminPassword")}</p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="tenant-admin-confirm">
                      Confirm password <span className="text-destructive" aria-hidden>*</span>
                    </Label>
                    <Input
                      id="tenant-admin-confirm"
                      type={showPassword ? "text" : "password"}
                      value={values.confirmPassword}
                      onChange={update("confirmPassword")}
                      onBlur={blur("confirmPassword")}
                      maxLength={128}
                      autoComplete="new-password"
                      className="font-mono"
                      aria-invalid={!!errorFor("confirmPassword")}
                      aria-describedby={errorFor("confirmPassword") ? "tenant-admin-confirm-error" : undefined}
                    />
                    {errorFor("confirmPassword") ? (
                      <p id="tenant-admin-confirm-error" className="text-sm text-destructive">{errorFor("confirmPassword")}</p>
                    ) : null}
                  </div>
                </fieldset>
              </DialogScrollBody>
              <DialogStickyFooter className="flex-col-reverse sm:flex-row">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                  Cancel
                </Button>
                <Button type="submit" loading={submitting} loadingText="Creating…" disabled={!!nameTaken}>
                  Create tenant
                </Button>
              </DialogStickyFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function CreatedView({
  details,
  onDone,
  toast,
}: {
  details: WelcomeKitDetails
  onDone: () => void
  toast: ReturnType<typeof useToast>["toast"]
}) {
  const [emailState, setEmailState] = useState<"idle" | "sending" | "sent">("idle")
  // null while checking. Email stays off until the server has mail settings; PDF and copy always work.
  const [emailAvailable, setEmailAvailable] = useState<boolean | null>(null)
  useEffect(() => {
    let cancelled = false
    tenantsApi
      .getOnboardingOptions()
      .then((options) => !cancelled && setEmailAvailable(options.welcomeEmailAvailable))
      .catch(() => !cancelled && setEmailAvailable(false))
    return () => {
      cancelled = true
    }
  }, [])
  const [downloading, setDownloading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const sendEmail = async () => {
    setEmailState("sending")
    try {
      await tenantsApi.sendWelcomeEmail(details.tenantCode, details.adminPassword)
      setEmailState("sent")
      toast({ title: "Welcome email sent", description: `Sent to ${details.adminEmail}.` })
    } catch (err) {
      setEmailState("idle")
      toast({ title: "Couldn't send the email", description: apiRequestErrorMessage(err), variant: "destructive" })
    }
  }

  const downloadPdf = async () => {
    setDownloading(true)
    try {
      await downloadWelcomePdf(details)
    } catch (err) {
      toast({ title: "Couldn't create the PDF", description: apiRequestErrorMessage(err), variant: "destructive" })
    } finally {
      setDownloading(false)
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(welcomeKitText(details))
      toast({ title: "Details copied" })
    } catch {
      toast({ title: "Couldn't copy", description: "Your browser blocked the clipboard.", variant: "destructive" })
    }
  }

  return (
    <>
      <DialogHeader className="px-6 pb-2 pt-6">
        <DialogTitle className="flex items-center gap-2">
          <CheckCircle2 className="size-5 text-success" aria-hidden />
          {details.pharmacyName} is ready
        </DialogTitle>
        <DialogDescription>
          Send the admin their sign-in details, or download them as a PDF. The password is shown only now and is not saved
          anywhere. Setup can take a few more seconds to finish.
        </DialogDescription>
      </DialogHeader>
      <DialogScrollBody className="space-y-4 py-4">
        <dl className="divide-y rounded-md border bg-muted/40 text-sm">
          {welcomeKitRows(details).map((row) => {
            const isPassword = row.label === "Temporary password"
            return (
              <div key={row.label} className="grid grid-cols-[9.5rem_1fr] gap-2 px-3 py-2">
                <dt className="text-muted-foreground">{row.label}</dt>
                <dd className={`flex min-w-0 items-center gap-2 font-medium ${row.mono ? "font-mono" : ""}`}>
                  <span className="break-all">{isPassword && !showPassword ? "••••••••••••" : row.value}</span>
                  {isPassword ? (
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="shrink-0 rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                    </button>
                  ) : null}
                </dd>
              </div>
            )
          })}
        </dl>
        <div className="grid gap-2 sm:grid-cols-3">
          <Button
            type="button"
            variant={emailAvailable ? "default" : "outline"}
            onClick={() => void sendEmail()}
            loading={emailState === "sending"}
            loadingText="Sending…"
            disabled={emailAvailable !== true}
            aria-describedby={emailAvailable === false ? "welcome-email-off" : undefined}
          >
            {emailState === "sent" ? <RefreshCw aria-hidden /> : <Mail aria-hidden />}
            {emailState === "sent" ? "Send again" : "Send email"}
          </Button>
          <Button
            type="button"
            variant={emailAvailable ? "outline" : "default"}
            onClick={() => void downloadPdf()}
            loading={downloading}
            loadingText="Preparing…"
          >
            <Download aria-hidden />
            Download PDF
          </Button>
          <Button type="button" variant="outline" onClick={() => void copy()}>
            <Copy aria-hidden />
            Copy details
          </Button>
        </div>
        {emailAvailable === false ? (
          <p id="welcome-email-off" className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            Email isn&apos;t set up on this server yet, so the welcome can&apos;t be emailed. Download the PDF or copy the
            details and hand them to the pharmacy. Email turns on here once mail settings are added.
          </p>
        ) : null}
        {emailState === "sent" ? (
          <p className="flex items-center gap-1 text-sm text-success" role="status">
            <CheckCircle2 className="size-4" aria-hidden />
            Welcome email sent to {details.adminEmail}.
          </p>
        ) : null}
      </DialogScrollBody>
      <DialogStickyFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Done
        </Button>
      </DialogStickyFooter>
    </>
  )
}
