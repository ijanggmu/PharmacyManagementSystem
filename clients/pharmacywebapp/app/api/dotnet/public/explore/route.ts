import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { problemToNormalizedError } from "@/lib/api/dotnet-problem"
import { dotnetBaseUrl, dotnetHeaders, forwardedForHeaders, problem } from "@/lib/api/dotnet-bff"
import { ROOT_TENANT } from "@/lib/api/dotnet-session"

/**
 * Anonymous BFF for the public "Find a doctor" page (GET /api/v1/appointments/explore): the doctors of every pharmacy
 * that chose to be listed. Not one pharmacy's call, so it goes as the root tenant (like the sign-up availability
 * check). Read-only, so no CSRF token; the patient's IP is passed on for the API's rate limit.
 */
export async function GET(request: NextRequest) {
  const baseUrl = dotnetBaseUrl()
  if (!baseUrl) return problem(503, "NOT_CONFIGURED", "DOTNET_API_URL is not set")

  const upstream = await fetch(`${baseUrl}/api/v1/appointments/explore`, {
    headers: dotnetHeaders(ROOT_TENANT, forwardedForHeaders(request.headers)),
    cache: "no-store",
  }).catch(() => null)
  if (!upstream) return problem(503, "UNAVAILABLE", "Doctors can't be shown right now. Please try again.")

  const body = await upstream.json().catch(() => null)
  if (!upstream.ok) {
    return NextResponse.json(problemToNormalizedError(upstream.status, body), { status: upstream.status })
  }
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } })
}
