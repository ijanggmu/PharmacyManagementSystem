import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { requireCSRF } from "@/lib/api/auth-middleware"
import { clearTokenCookies } from "@/lib/api/dotnet-bff"
import { SESSION_ID_COOKIE } from "@/lib/api/dotnet-session"

export async function POST(request: NextRequest) {
  const csrf = await requireCSRF(request)
  if (csrf) return csrf
  // Pass the session id so the store entry is deleted, not just the cookie — otherwise the
  // token pair is orphaned in memory until the server restarts.
  const sid = request.cookies.get(SESSION_ID_COOKIE)?.value
  return clearTokenCookies(NextResponse.json({ ok: true }), sid)
}
