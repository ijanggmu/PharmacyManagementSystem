import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { problemToNormalizedError } from "@/lib/api/dotnet-problem"
import { dotnetBaseUrl, dotnetHeaders, forwardedForHeaders, problem } from "@/lib/api/dotnet-bff"
import { bookingTenant } from "./tenant"

/**
 * Anonymous BFF for the public booking page (GET /api/v1/appointments/online): the pharmacy's doctors and the
 * sittings patients can book. Not routed through the generic [...path] proxy, which needs a signed-in session.
 * Read-only, so no CSRF token. 404 while the pharmacy has online booking off.
 */
export async function GET(request: NextRequest) {
  const baseUrl = dotnetBaseUrl()
  if (!baseUrl) return problem(503, "NOT_CONFIGURED", "DOTNET_API_URL is not set")

  const tenant = bookingTenant(request, request.nextUrl.searchParams.get("code"))
  if (!tenant) return problem(404, "NOT_FOUND", "Open the booking link your pharmacy gave you.")

  const upstream = await fetch(`${baseUrl}/api/v1/appointments/online`, {
    headers: dotnetHeaders(tenant, forwardedForHeaders(request.headers)),
    cache: "no-store",
  }).catch(() => null)
  if (!upstream) return problem(503, "UNAVAILABLE", "Booking is not available right now. Please try again.")

  const body = await upstream.json().catch(() => null)
  if (!upstream.ok) {
    return NextResponse.json(problemToNormalizedError(upstream.status, body), { status: upstream.status })
  }
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } })
}
