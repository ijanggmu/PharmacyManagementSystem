import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { requireCSRF } from "@/lib/api/auth-middleware"
import { SESSION_ID_COOKIE } from "@/lib/api/dotnet-session"
import { clearSessionCookie, clientIpFromHeaders, dotnetBaseUrl, problem, tenantForHost } from "@/lib/api/dotnet-bff"
import { forceRefreshSession } from "@/lib/api/dotnet-session-refresh"

export async function POST(request: NextRequest) {
  const csrf = await requireCSRF(request)
  if (csrf) return csrf

  const baseUrl = dotnetBaseUrl()
  if (!baseUrl) return problem(503, "NOT_CONFIGURED", "DOTNET_API_URL is not set")

  const sid = request.cookies.get(SESSION_ID_COOKIE)?.value
  // Single-flight, and always against the session's own tenant (never the SuperAdmin override header).
  const resolved = await forceRefreshSession(sid, {
    baseUrl,
    fallbackTenant: tenantForHost(request.headers.get("host")),
    clientIp: clientIpFromHeaders(request.headers),
  })
  if (resolved.status === "missing") return problem(401, "UNAUTHENTICATED", "No session")
  // The store entry was already removed (only if still unchanged) by forceRefreshSession.
  if (resolved.status === "expired") return clearSessionCookie(problem(401, "UNAUTHENTICATED", "Session expired"))
  if (resolved.status === "unavailable") return problem(503, "UPSTREAM_UNAVAILABLE", "Please retry in a moment")
  // Rotation updates the shared token store in place under the same session id — the browser
  // already holds that id, so there is no cookie to write back.
  return NextResponse.json({ ok: true })
}
