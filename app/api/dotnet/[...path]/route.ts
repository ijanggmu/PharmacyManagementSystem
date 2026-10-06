import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { requireCSRF } from "@/lib/api/auth-middleware"
import { ACCESS_COOKIE, REFRESH_COOKIE, needsRefresh, refreshTokens, type TokenPair } from "@/lib/api/dotnet-session"
import {
  applyTokenCookies,
  clearTokenCookies,
  dotnetBaseUrl,
  dotnetHeaders,
  isSecureRequest,
  problem,
  tenantForRequest,
} from "@/lib/api/dotnet-bff"

type Context = { params: Promise<{ path: string[] }> }

async function proxy(request: NextRequest, context: Context) {
  const csrf = await requireCSRF(request)
  if (csrf) return csrf

  const baseUrl = dotnetBaseUrl()
  if (!baseUrl) return problem(503, "NOT_CONFIGURED", "DOTNET_API_URL is not set")

  const tenant = tenantForRequest(request)
  const access = request.cookies.get(ACCESS_COOKIE)?.value
  const refresh = request.cookies.get(REFRESH_COOKIE)?.value

  let rotated: TokenPair | null = null
  let bearer = access
  if (!access || needsRefresh(access)) {
    if (!refresh) return problem(401, "UNAUTHENTICATED", "Sign in required")
    rotated = await refreshTokens({ baseUrl, tenant }, { accessToken: access ?? "", refreshToken: refresh })
    if (!rotated) return clearTokenCookies(problem(401, "UNAUTHENTICATED", "Session expired"))
    bearer = rotated.accessToken
  }

  const { path } = await context.params
  const target = `${baseUrl}/api/v1/${path.map(encodeURIComponent).join("/")}${request.nextUrl.search}`
  const headers = dotnetHeaders(tenant, { Accept: "application/json", Authorization: `Bearer ${bearer}` })
  const contentType = request.headers.get("content-type")
  if (contentType) headers["Content-Type"] = contentType
  const idempotencyKey = request.headers.get("idempotency-key")
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey

  const hasBody = request.method !== "GET" && request.method !== "HEAD"
  const upstream = await fetch(target, {
    method: request.method,
    headers,
    body: hasBody ? await request.text() : undefined,
    cache: "no-store",
  })

  const response = new NextResponse(await upstream.text(), {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json" },
  })
  return rotated ? applyTokenCookies(response, rotated, isSecureRequest(request)) : response
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE }
