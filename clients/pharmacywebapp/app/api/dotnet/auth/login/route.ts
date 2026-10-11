import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { requireCSRF } from "@/lib/api/auth-middleware"
import { problemToNormalizedError } from "@/lib/api/dotnet-problem"
import { applyTokenCookies, dotnetBaseUrl, dotnetHeaders, isSecureRequest, problem, tenantForRequest } from "@/lib/api/dotnet-bff"
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
  const tenant = pharmacyCode && /^[a-z0-9-]{1,64}$/.test(pharmacyCode) ? pharmacyCode : tenantForRequest(request)

  const issue = (tenantCode: string, app: DotnetAppName) =>
    fetch(`${baseUrl}/api/v1/identity/token/issue`, {
      method: "POST",
      headers: dotnetHeaders(tenantCode, { "Content-Type": "application/json" }, app),
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
  return applyTokenCookies(NextResponse.json({ ok: true }), tokens, isSecureRequest(request))
}
