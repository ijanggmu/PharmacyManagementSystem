import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { z } from "zod"
import { problemToNormalizedError } from "@/lib/api/dotnet-problem"
import { dotnetBaseUrl, dotnetHeaders, problem } from "@/lib/api/dotnet-bff"
import { ROOT_TENANT } from "@/lib/api/dotnet-session"

const querySchema = z.object({
  tenantId: z.string().regex(/^[a-z0-9-]{2,64}$/),
  correlationId: z.string().min(1).max(128),
})

/** Anonymous sign-up progress (polled by the Get started form). Read-only, so no CSRF token. */
export async function GET(request: NextRequest) {
  const baseUrl = dotnetBaseUrl()
  if (!baseUrl) return problem(503, "NOT_CONFIGURED", "DOTNET_API_URL is not set")

  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!parsed.success) return problem(400, "VALIDATION_ERROR", "tenantId and correlationId are required")

  const { tenantId, correlationId } = parsed.data
  const upstream = await fetch(
    `${baseUrl}/api/v1/tenants/signup/${encodeURIComponent(tenantId)}/status?correlationId=${encodeURIComponent(correlationId)}`,
    { headers: dotnetHeaders(ROOT_TENANT), cache: "no-store" },
  )
  const body = await upstream.json().catch(() => null)
  if (!upstream.ok) {
    return NextResponse.json(problemToNormalizedError(upstream.status, body), { status: upstream.status })
  }
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } })
}
