import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { requireCSRF } from "@/lib/api/auth-middleware"
import { clearTokenCookies, dotnetBaseUrl, dotnetHeaders, forwardedForHeaders, tenantForHost } from "@/lib/api/dotnet-bff"
import { SESSION_ID_COOKIE, appForAccessToken, tenantFromAccessToken } from "@/lib/api/dotnet-session"
import { getSession } from "@/lib/api/dotnet-token-store"

const REVOKE_TIMEOUT_MS = 5_000

/**
 * Signs out: revokes the session's refresh token in the API (so a copied/leaked token can no longer be
 * refreshed), then deletes the BFF session and clears the cookie. Revocation is best-effort — the local
 * sign-out always completes, even when the API is unreachable.
 */
export async function POST(request: NextRequest) {
  const csrf = await requireCSRF(request)
  if (csrf) return csrf

  const sid = request.cookies.get(SESSION_ID_COOKIE)?.value
  const session = await getSession(sid)
  const baseUrl = dotnetBaseUrl()
  if (session?.refreshToken && baseUrl) {
    try {
      await fetch(`${baseUrl}/api/v1/identity/token/revoke`, {
        method: "POST",
        headers: dotnetHeaders(
          tenantFromAccessToken(session.accessToken) ?? tenantForHost(request.headers.get("host")),
          { "Content-Type": "application/json", ...forwardedForHeaders(request.headers) },
          appForAccessToken(session.accessToken),
        ),
        body: JSON.stringify({ refreshToken: session.refreshToken }),
        cache: "no-store",
        signal: AbortSignal.timeout(REVOKE_TIMEOUT_MS),
      })
    } catch {
      // Best-effort: the local session is removed below regardless.
    }
  }

  // Pass the session id so the store entry is deleted, not just the cookie.
  return clearTokenCookies(NextResponse.json({ ok: true }), sid)
}
