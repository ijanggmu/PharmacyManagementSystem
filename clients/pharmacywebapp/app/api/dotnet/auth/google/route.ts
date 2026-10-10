import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { z } from "zod"
import { requireCSRF } from "@/lib/api/auth-middleware"
import { problemToNormalizedError } from "@/lib/api/dotnet-problem"
import { applyTokenCookies, dotnetBaseUrl, dotnetHeaders, isSecureRequest, problem } from "@/lib/api/dotnet-bff"
import {
  ADMIN_APP,
  DASHBOARD_APP,
  ROOT_TENANT,
  isAppBoundaryProblem,
  type DotnetAppName,
  type TokenPair,
} from "@/lib/api/dotnet-session"

const bodySchema = z.object({
  idToken: z.string().min(20).max(8192),
  /** Pharmacy code: from the login form/subdomain, or the pharmacy the user picked. */
  tenant: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]{1,64}$/)
    .optional()
    .nullable(),
  twoFactorCode: z.string().max(16).optional().nullable(),
  recoveryCode: z.string().max(32).optional().nullable(),
})

interface Resolution {
  email: string
  tenants: { tenantId: string; tenantName: string }[]
}

/**
 * Sign in with Google. Without a pharmacy code the BFF first asks .NET which pharmacies this (verified)
 * Google account is connected to: none → GOOGLE_NOT_LINKED; one → sign in there; several → return the list
 * for the user to pick (the browser re-posts the same ID token with the chosen code). Then the ID token is
 * exchanged for tokens with the pharmacy in the tenant header, and the session cookie is set.
 */
export async function POST(request: NextRequest) {
  const csrf = await requireCSRF(request)
  if (csrf) return csrf

  const baseUrl = dotnetBaseUrl()
  if (!baseUrl) return problem(503, "NOT_CONFIGURED", "DOTNET_API_URL is not set")

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return problem(400, "VALIDATION_ERROR", "A Google sign-in token is required")
  const input = parsed.data

  let tenant = input.tenant ?? null
  if (!tenant) {
    const resolveRes = await fetch(`${baseUrl}/api/v1/identity/google/resolve`, {
      method: "POST",
      headers: dotnetHeaders(ROOT_TENANT, { "Content-Type": "application/json" }),
      body: JSON.stringify({ idToken: input.idToken }),
    })
    if (!resolveRes.ok) {
      const body = await resolveRes.json().catch(() => null)
      return NextResponse.json(problemToNormalizedError(resolveRes.status, body), { status: resolveRes.status })
    }
    const resolution = (await resolveRes.json()) as Resolution
    if (resolution.tenants.length === 0) {
      return problem(
        404,
        "GOOGLE_NOT_LINKED",
        "This Google account isn't connected to a pharmacy yet. Sign in with your password and connect Google from your profile, or create a pharmacy.",
      )
    }
    if (resolution.tenants.length > 1) {
      return NextResponse.json({ ok: false, needsPharmacy: true, email: resolution.email, pharmacies: resolution.tenants })
    }
    tenant = resolution.tenants[0].tenantId
  }

  const issue = (tenantCode: string, app: DotnetAppName) =>
    fetch(`${baseUrl}/api/v1/identity/token/google`, {
      method: "POST",
      headers: dotnetHeaders(tenantCode, { "Content-Type": "application/json" }, app),
      body: JSON.stringify({
        idToken: input.idToken,
        twoFactorCode: input.twoFactorCode || null,
        recoveryCode: input.recoveryCode?.trim() || null,
      }),
    })

  let upstream = await issue(tenant, DASHBOARD_APP)
  if (upstream.status === 403) {
    const refusal = await upstream.clone().json().catch(() => null)
    if (isAppBoundaryProblem(refusal)) upstream = await issue(ROOT_TENANT, ADMIN_APP)
  }

  if (!upstream.ok) {
    const body = await upstream.json().catch(() => null)
    return NextResponse.json(problemToNormalizedError(upstream.status, body), { status: upstream.status })
  }

  const body = (await upstream.json()) as { accessToken: string; refreshToken: string; refreshTokenExpiresAt: string }
  const tokens: TokenPair = {
    accessToken: body.accessToken,
    refreshToken: body.refreshToken,
    refreshTokenExpiresAt: new Date(body.refreshTokenExpiresAt),
  }
  return applyTokenCookies(NextResponse.json({ ok: true, tenant }), tokens, isSecureRequest(request))
}
