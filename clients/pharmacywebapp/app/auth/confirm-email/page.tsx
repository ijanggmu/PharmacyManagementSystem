import type { Metadata } from "next"
import Link from "next/link"
import { headers } from "next/headers"
import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react"
import { dotnetBaseUrl, dotnetHeaders, forwardedForHeaders, tenantForHost } from "@/lib/api/dotnet-bff"

/**
 * Email-confirmation landing page. The backend emails `${OriginUrl}/auth/confirm-email?userId=…&code=…&tenant=…`
 * (UserRegistrationService.GetEmailVerificationUriAsync) — the configured web-app origin, never the API
 * request's Host header. This Server Component calls the API's anonymous confirm endpoint server-side and
 * shows the outcome, so the user never lands on raw JSON from the API host.
 */

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Confirm email",
  robots: { index: false, follow: false },
  // The URL carries the one-time confirmation code: never leak it to another origin via Referer.
  referrer: "no-referrer",
}

type Outcome = "confirmed" | "invalid" | "unavailable"

const TENANT_PATTERN = /^[a-z0-9-]{1,64}$/

function single(value: string | string[] | undefined): string {
  return typeof value === "string" ? value.trim() : ""
}

async function confirmEmail(userId: string, code: string, tenantParam: string): Promise<Outcome> {
  const baseUrl = dotnetBaseUrl()
  if (!baseUrl) return "unavailable"
  if (!userId || !code) return "invalid"

  const requestHeaders = await headers()
  const pharmacyCode = tenantParam.toLowerCase()
  const tenant = TENANT_PATTERN.test(pharmacyCode) ? pharmacyCode : tenantForHost(requestHeaders.get("host"))

  const query = new URLSearchParams({ userId, code, tenant })
  try {
    const upstream = await fetch(`${baseUrl}/api/v1/identity/confirm-email?${query.toString()}`, {
      method: "GET",
      headers: dotnetHeaders(tenant, { Accept: "application/json", ...forwardedForHeaders(requestHeaders) }),
      cache: "no-store",
    })
    if (upstream.ok) return "confirmed"
    return upstream.status >= 500 || upstream.status === 429 ? "unavailable" : "invalid"
  } catch {
    return "unavailable"
  }
}

const CONTENT: Record<Outcome, { title: string; body: string }> = {
  confirmed: { title: "Email confirmed", body: "Your email address is confirmed. You can now sign in." },
  invalid: {
    title: "This link is invalid or has expired",
    body: "Ask your pharmacy administrator to resend the confirmation email, then use the newest link.",
  },
  unavailable: { title: "We couldn't confirm your email right now", body: "Please try the link again in a moment." },
}

export default async function ConfirmEmailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const tenant = single(params.tenant)
  const outcome = await confirmEmail(single(params.userId), single(params.code), tenant)
  const { title, body } = CONTENT[outcome]
  const signInHref = tenant && TENANT_PATTERN.test(tenant.toLowerCase())
    ? `/?auth=signin&code=${encodeURIComponent(tenant.toLowerCase())}`
    : "/?auth=signin"

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <div className="mb-4 flex justify-center" aria-hidden>
          {outcome === "confirmed" ? (
            <CheckCircle2 className="h-10 w-10 text-success" />
          ) : outcome === "invalid" ? (
            <XCircle className="h-10 w-10 text-destructive" />
          ) : (
            <AlertTriangle className="h-10 w-10 text-warning" />
          )}
        </div>
        <h1 className="text-xl font-semibold text-foreground">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground" role={outcome === "confirmed" ? "status" : "alert"}>
          {body}
        </p>
        <Link
          href={signInHref}
          className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-md bg-teal-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-teal-700"
        >
          Go to sign in
        </Link>
      </div>
    </div>
  )
}
