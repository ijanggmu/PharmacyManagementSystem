import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { z } from "zod"
import { requireCSRF } from "@/lib/api/auth-middleware"
import { problemToNormalizedError } from "@/lib/api/dotnet-problem"
import { dotnetBaseUrl, dotnetHeaders, problem } from "@/lib/api/dotnet-bff"
import { ROOT_TENANT } from "@/lib/api/dotnet-session"

const bodySchema = z.object({ idToken: z.string().min(20).max(8192) })

/** Verifies a Google account for pharmacy sign-up and returns its name/email to prefill the form. */
export async function POST(request: NextRequest) {
  const csrf = await requireCSRF(request)
  if (csrf) return csrf

  const baseUrl = dotnetBaseUrl()
  if (!baseUrl) return problem(503, "NOT_CONFIGURED", "DOTNET_API_URL is not set")

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return problem(400, "VALIDATION_ERROR", "A Google sign-in token is required")

  const upstream = await fetch(`${baseUrl}/api/v1/identity/google/verify-signup`, {
    method: "POST",
    headers: dotnetHeaders(ROOT_TENANT, { "Content-Type": "application/json" }),
    body: JSON.stringify({ idToken: parsed.data.idToken }),
  })
  const body = await upstream.json().catch(() => null)
  if (!upstream.ok) {
    return NextResponse.json(problemToNormalizedError(upstream.status, body), { status: upstream.status })
  }
  return NextResponse.json(body)
}
