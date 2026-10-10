import { NextResponse, type NextRequest } from "next/server"
import { SESSION_ID_COOKIE } from "@/lib/api/dotnet-session"
import { dotnetBaseUrl, problem } from "@/lib/api/dotnet-bff"
import { getSession } from "@/lib/api/dotnet-token-store"
import { getDotnetSession } from "@/lib/api/dotnet-server-session"
import { isDotnetRootUser } from "@/lib/api/dotnet-permissions"
import { redactHealthForTenant } from "@/lib/api/system-health-redact"

const PROBES = ["live", "ready"] as const
type Probe = (typeof PROBES)[number]
const TIMEOUT_MS = 8_000

/**
 * Same-origin proxy for the API's ASP.NET health probes (/health/live, /health/ready). They sit
 * outside /api/v1, so the generic /api/dotnet/[...path] BFF can't reach them. The probes are
 * anonymous upstream, but this route still requires a signed-in session — check names and details
 * describe infrastructure and shouldn't be served to the public internet from our origin.
 *
 * Readiness returns 503 with the same JSON body when any check fails; that body is passed through
 * with its status so the UI can show *which* dependency is down.
 *
 * Tenant isolation: the probes describe the whole platform — "db:tenants-migrations" lists every
 * tenant's migration state, and check details can name other tenants. Only platform operators
 * (root / Permissions.Tenants.View) get the raw result; everyone else (e.g. a tenant admin who opens
 * System Health for the IRD queue) gets platform-wide checks removed, details stripped, and the overall
 * status recomputed from what remains.
 */

export async function GET(request: NextRequest) {
  const session = getSession(request.cookies.get(SESSION_ID_COOKIE)?.value)
  if (!session) return problem(401, "UNAUTHENTICATED", "Sign in required")

  const baseUrl = dotnetBaseUrl()
  if (!baseUrl) return problem(503, "NOT_CONFIGURED", "DOTNET_API_URL is not set")

  const requested = request.nextUrl.searchParams.get("probe") ?? "ready"
  if (!PROBES.includes(requested as Probe)) return problem(400, "BAD_REQUEST", "probe must be live or ready")

  const started = Date.now()
  try {
    const upstream = await fetch(`${baseUrl}/health/${requested}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const raw: unknown = await upstream.json().catch(() => null)
    const permissions = (await getDotnetSession())?.user.permissions ?? []
    const isPlatform = isDotnetRootUser(permissions) || permissions.includes("Permissions.Tenants.View")
    const body = isPlatform ? raw : redactHealthForTenant(raw)
    // A tenant-scoped view must not report 503 because of another tenant's state.
    const httpStatus = isPlatform ? upstream.status : (body as { status?: string } | null)?.status === "Unhealthy" ? 503 : 200
    return NextResponse.json(
      { httpStatus, roundTripMs: Date.now() - started, result: body },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    // API unreachable or timed out — report it as a failed probe rather than a route error.
    const reason = error instanceof Error && error.name === "TimeoutError" ? "timed out" : "unreachable"
    return NextResponse.json(
      { httpStatus: 0, roundTripMs: Date.now() - started, result: null, error: `API ${reason}` },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    )
  }
}
