import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { requireCSRF } from "@/lib/api/auth-middleware"
import { problemToNormalizedError } from "@/lib/api/dotnet-problem"
import {
  applyTokenCookies,
  dotnetBaseUrl,
  dotnetHeaders,
  forwardedForHeaders,
  isSecureRequest,
  problem,
  tenantForAnonymousRequest,
} from "@/lib/api/dotnet-bff"
import {
  ADMIN_APP,
  DASHBOARD_APP,
  ROOT_TENANT,
  isAppBoundaryProblem,
  type DotnetAppName,
  type TokenPair,
} from "@/lib/api/dotnet-session"

export async function POST(request: NextRequest) {
  const csrf = await requireCSRF(request)
  if (csrf) return csrf

  const baseUrl = dotnetBaseUrl()
  if (!baseUrl) return problem(503, "NOT_CONFIGURED", "DOTNET_API_URL is not set")

  const input = (await request.json().catch(() => null)) as {
    email?: string
    password?: string
    twoFactorCode?: string
    recoveryCode?: string
    tenant?: string
  } | null
  if (!input?.email || !input.password) return problem(400, "VALIDATION_ERROR", "Email and password are required")

  const pharmacyCode = input.tenant?.trim().toLowerCase()
  let tenant = pharmacyCode && /^[a-z0-9-]{1,64}$/.test(pharmacyCode) ? pharmacyCode : tenantForAnonymousRequest(request)

  // No pharmacy code and no pharmacy address: ask .NET which pharmacies these credentials open. It lists only
  // those where the password is right (a SuperAdmin's comes back as the root workspace). None → the same
  // "authentication failed" a wrong password gets; one → sign in there; several → the user picks.
  if (!pharmacyCode && tenant === ROOT_TENANT) {
    const resolveRes = await fetch(`${baseUrl}/api/v1/identity/token/resolve`, {
      method: "POST",
      headers: dotnetHeaders(ROOT_TENANT, { "Content-Type": "application/json", ...forwardedForHeaders(request.headers) }),
      body: JSON.stringify({ email: input.email, password: input.password }),
    })
    if (!resolveRes.ok) {
      const body = await resolveRes.json().catch(() => null)
      return NextResponse.json(problemToNormalizedError(resolveRes.status, body), { status: resolveRes.status })
    }
    const { tenants } = (await resolveRes.json()) as { tenants: { tenantId: string; tenantName: string }[] }
    if (tenants.length === 0) return problem(401, "Unauthorized", "Authentication failed.")
    if (tenants.length > 1) return NextResponse.json({ ok: false, needsPharmacy: true, pharmacies: tenants })
    tenant = tenants[0].tenantId
  }

  const issue = (tenantCode: string, app: DotnetAppName) =>
    fetch(`${baseUrl}/api/v1/identity/token/issue`, {
      method: "POST",
      headers: dotnetHeaders(tenantCode, { "Content-Type": "application/json", ...forwardedForHeaders(request.headers) }, app),
      body: JSON.stringify({
        email: input.email,
        password: input.password,
        twoFactorCode: input.twoFactorCode ?? null,
        recoveryCode: typeof input.recoveryCode === "string" ? input.recoveryCode.trim().slice(0, 32) || null : null,
      }),
    })

  // Dashboard first. The API refuses a SuperAdmin (root tenant) token issued with the dashboard header
  // with a 403 "App boundary" before it checks the credentials. Retry the same credentials in the admin app.
  let upstream = await issue(tenant, DASHBOARD_APP)
  if (upstream.status === 403) {
    const refusal = await upstream.clone().json().catch(() => null)
    if (isAppBoundaryProblem(refusal)) upstream = await issue(ROOT_TENANT, ADMIN_APP)
  }

  if (!upstream.ok) {
    const body = await upstream.json().catch(() => null)
    return NextResponse.json(problemToNormalizedError(upstream.status, body), { status: upstream.status })
  }

  const body = (await upstream.json()) as {
    accessToken: string
    refreshToken: string
    refreshTokenExpiresAt: string
  }
  const tokens: TokenPair = {
    accessToken: body.accessToken,
    refreshToken: body.refreshToken,
    refreshTokenExpiresAt: new Date(body.refreshTokenExpiresAt),
  }
  return await applyTokenCookies(NextResponse.json({ ok: true }), tokens, isSecureRequest(request))
}
