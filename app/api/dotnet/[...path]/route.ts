import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { requireCSRF } from "@/lib/api/auth-middleware"
import { SESSION_ID_COOKIE, appForAccessToken, needsRefresh, refreshTokens } from "@/lib/api/dotnet-session"
import {
  clearTokenCookies,
  dotnetBaseUrl,
  dotnetHeaders,
  problem,
  tenantForRequest,
} from "@/lib/api/dotnet-bff"
import { getSession, updateSession } from "@/lib/api/dotnet-token-store"

type Context = { params: Promise<{ path: string[] }> }

async function proxy(request: NextRequest, context: Context) {
  const csrf = await requireCSRF(request)
  if (csrf) return csrf

  const baseUrl = dotnetBaseUrl()
  if (!baseUrl) return problem(503, "NOT_CONFIGURED", "DOTNET_API_URL is not set")

  const tenant = tenantForRequest(request)
  const sid = request.cookies.get(SESSION_ID_COOKIE)?.value
  const session = getSession(sid)
  if (!session) return problem(401, "UNAUTHENTICATED", "Sign in required")

  let bearer = session.accessToken
  if (!bearer || needsRefresh(bearer)) {
    if (!session.refreshToken) return problem(401, "UNAUTHENTICATED", "Sign in required")
    const rotated = await refreshTokens(
      { baseUrl, tenant, app: appForAccessToken(bearer) },
      { accessToken: bearer ?? "", refreshToken: session.refreshToken },
    )
    if (!rotated) return clearTokenCookies(problem(401, "UNAUTHENTICATED", "Session expired"), sid)
    updateSession(sid as string, rotated)
    bearer = rotated.accessToken
  }

  const { path } = await context.params
  const target = `${baseUrl}/api/v1/${path.map(encodeURIComponent).join("/")}${request.nextUrl.search}`
  const headers = dotnetHeaders(
    tenant,
    { Accept: "application/json", Authorization: `Bearer ${bearer}` },
    appForAccessToken(bearer),
  )
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

  // Rotation (above) already updated the shared token store in place under the same session id,
  // so there is nothing left to write back into the response.
  // 204/205/304 must not carry a body: the Response constructor throws even for "", which surfaced as a 500.
  if (upstream.status === 204 || upstream.status === 205 || upstream.status === 304) {
    return new NextResponse(null, { status: upstream.status })
  }
  return new NextResponse(await upstream.text(), {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json" },
  })
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE }
