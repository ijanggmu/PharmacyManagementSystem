import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { requireCSRF } from "@/lib/api/auth-middleware"
import { SESSION_ID_COOKIE, appForAccessToken, refreshTokens } from "@/lib/api/dotnet-session"
import { clearTokenCookies, dotnetBaseUrl, problem, tenantForRequest } from "@/lib/api/dotnet-bff"
import { getSession, updateSession } from "@/lib/api/dotnet-token-store"

export async function POST(request: NextRequest) {
  const csrf = await requireCSRF(request)
  if (csrf) return csrf

  const baseUrl = dotnetBaseUrl()
  if (!baseUrl) return problem(503, "NOT_CONFIGURED", "DOTNET_API_URL is not set")

  const sid = request.cookies.get(SESSION_ID_COOKIE)?.value
  const session = getSession(sid)
  if (!session) return problem(401, "UNAUTHENTICATED", "No session")

  const tokens = await refreshTokens(
    { baseUrl, tenant: tenantForRequest(request), app: appForAccessToken(session.accessToken) },
    session,
  )
  if (!tokens) return clearTokenCookies(problem(401, "UNAUTHENTICATED", "Session expired"), sid)
  // Rotation updates the shared token store in place under the same session id — the browser
  // already holds that id, so there is no cookie to write back.
  updateSession(sid as string, tokens)
  return NextResponse.json({ ok: true })
}
