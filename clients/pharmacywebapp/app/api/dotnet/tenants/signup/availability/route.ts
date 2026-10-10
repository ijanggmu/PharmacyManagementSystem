import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { z } from "zod"
import { problemToNormalizedError } from "@/lib/api/dotnet-problem"
import { dotnetBaseUrl, dotnetHeaders, problem } from "@/lib/api/dotnet-bff"
import { ROOT_TENANT } from "@/lib/api/dotnet-session"

const querySchema = z.object({
  slug: z.string().trim().max(64).optional(),
  name: z.string().trim().max(200).optional(),
})

/** Anonymous live check that a pharmacy code and name are free. Read-only, so no CSRF token. */
export async function GET(request: NextRequest) {
  const baseUrl = dotnetBaseUrl()
  if (!baseUrl) return problem(503, "NOT_CONFIGURED", "DOTNET_API_URL is not set")

  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!parsed.success) return problem(400, "VALIDATION_ERROR", "Invalid availability query")

  const params = new URLSearchParams()
  if (parsed.data.slug) params.set("slug", parsed.data.slug)
  if (parsed.data.name) params.set("name", parsed.data.name)

  const upstream = await fetch(`${baseUrl}/api/v1/tenants/signup/availability?${params}`, {
    headers: dotnetHeaders(ROOT_TENANT),
    cache: "no-store",
  })
  const body = await upstream.json().catch(() => null)
  if (!upstream.ok) {
    return NextResponse.json(problemToNormalizedError(upstream.status, body), { status: upstream.status })
  }
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } })
}
