import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { requireCSRF } from "@/lib/api/auth-middleware"
import { SESSION_ID_COOKIE, appForAccessToken } from "@/lib/api/dotnet-session"
import {
  clearSessionCookie,
  clientIpFromHeaders,
  dotnetBaseUrl,
  dotnetHeaders,
  forwardedForHeaders,
  passthroughHeaders,
  problem,
  tenantForHost,
  tenantForRequest,
  upstreamTarget,
} from "@/lib/api/dotnet-bff"
import { resolveSessionTokens } from "@/lib/api/dotnet-session-refresh"

type Context = { params: Promise<{ path: string[] }> }

async function proxy(request: NextRequest, context: Context) {
  const csrf = await requireCSRF(request)
  if (csrf) return csrf

  const baseUrl = dotnetBaseUrl()
  if (!baseUrl) return problem(503, "NOT_CONFIGURED", "DOTNET_API_URL is not set")

  const sid = request.cookies.get(SESSION_ID_COOKIE)?.value
  // Refresh with the session's OWN tenant (from its token) — never the per-call override used below.
  const resolved = await resolveSessionTokens(sid, {
    baseUrl,
    fallbackTenant: tenantForHost(request.headers.get("host")),
    clientIp: clientIpFromHeaders(request.headers),
  })
  if (resolved.status === "missing") return problem(401, "UNAUTHENTICATED", "Sign in required")
  // The store entry was already removed (only if still unchanged) by resolveSessionTokens.
  if (resolved.status === "expired") return clearSessionCookie(problem(401, "UNAUTHENTICATED", "Session expired"))
  if (resolved.status === "unavailable") {
    return problem(503, "UPSTREAM_UNAVAILABLE", "The server is busy. Please retry in a moment.")
  }
  const bearer = resolved.tokens.accessToken

  const { path } = await context.params
  const target = upstreamTarget(baseUrl, path, request.nextUrl.search)
  if (!target) return problem(400, "BAD_REQUEST", "Invalid API path")
  const headers = dotnetHeaders(
    tenantForRequest(request),
    {
      Accept: request.headers.get("accept") ?? "application/json",
      Authorization: `Bearer ${bearer}`,
      ...forwardedForHeaders(request.headers),
    },
    appForAccessToken(bearer),
  )
  const contentType = request.headers.get("content-type")
  if (contentType) headers["Content-Type"] = contentType
  const idempotencyKey = request.headers.get("idempotency-key")
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey
  // Explicit branch override; the API validates it (own branch only unless the caller has Branches.ViewAll).
  const branchId = request.headers.get("x-branch-id")
  if (branchId) headers["X-Branch-Id"] = branchId

  const hasBody = request.method !== "GET" && request.method !== "HEAD"
  // Bytes, not text(): text() re-encodes binary payloads (multipart, octet-stream) as UTF-8.
  const body = hasBody ? await request.arrayBuffer() : undefined
  const upstream = await fetch(target, {
    method: request.method,
    headers,
    body: body && body.byteLength > 0 ? body : undefined,
    cache: "no-store",
  })

  // 204/205/304 must not carry a body: the Response constructor throws even for "", which surfaced as a 500.
  if (upstream.status === 204 || upstream.status === 205 || upstream.status === 304) {
    return new NextResponse(null, { status: upstream.status, headers: passthroughHeaders(upstream.headers) })
  }
  // Stream the body through untouched so binary responses (invoice PDFs, exports) are not corrupted.
  return new NextResponse(upstream.body, { status: upstream.status, headers: passthroughHeaders(upstream.headers) })
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE }
