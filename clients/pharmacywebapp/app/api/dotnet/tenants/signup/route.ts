import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { z } from "zod"
import { requireCSRF } from "@/lib/api/auth-middleware"
import { problemToNormalizedError } from "@/lib/api/dotnet-problem"
import { dotnetBaseUrl, dotnetHeaders, forwardedForHeaders, problem } from "@/lib/api/dotnet-bff"
import { ROOT_TENANT } from "@/lib/api/dotnet-session"

const bodySchema = z
  .object({
    pharmacyName: z.string().trim().min(1).max(200),
    slug: z.string().trim().toLowerCase().min(2).max(40),
    adminFirstName: z.string().trim().min(1).max(100),
    adminLastName: z.string().trim().min(1).max(100),
    adminEmail: z.string().trim().email(),
    adminPassword: z.string().max(128).optional().nullable(),
    adminConfirmPassword: z.string().max(128).optional().nullable(),
    phoneNumber: z.string().trim().max(32).optional().nullable(),
    /** Sign up with Google instead of a password. */
    googleIdToken: z.string().min(20).max(8192).optional().nullable(),
  })
  .refine((v) => Boolean(v.googleIdToken) || (Boolean(v.adminPassword) && Boolean(v.adminConfirmPassword)), {
    message: "A password (or Google sign-up) is required",
  })

/**
 * Anonymous self-service tenant signup BFF. Forwards to the .NET anonymous endpoint
 * POST /api/v1/tenants/signup, which wraps CreateTenant: a brand-new visitor creates their own
 * pharmacy tenant and becomes its Admin on the configured free plan — no payment is collected.
 * With a Google ID token instead of a password, .NET connects that Google account to the new admin.
 *
 * Not routed through the generic [...path] proxy — that proxy requires an existing session, and
 * this call happens before any tenant or account exists. There is no tenant to derive from the
 * request host either (the visitor isn't scoped to one yet), so this always talks to the "root"
 * catalog context, same as the operator-facing create-tenant flow in clients/admin.
 */
export async function POST(request: NextRequest) {
  const csrf = await requireCSRF(request)
  if (csrf) return csrf

  const baseUrl = dotnetBaseUrl()
  if (!baseUrl) return problem(503, "NOT_CONFIGURED", "DOTNET_API_URL is not set")

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return problem(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "All required signup fields must be provided")
  }
  const input = parsed.data
  const google = Boolean(input.googleIdToken)

  const upstream = await fetch(`${baseUrl}/api/v1/tenants/signup`, {
    method: "POST",
    headers: dotnetHeaders(ROOT_TENANT, { "Content-Type": "application/json", ...forwardedForHeaders(request.headers) }),
    body: JSON.stringify({
      pharmacyName: input.pharmacyName,
      slug: input.slug,
      adminFirstName: input.adminFirstName,
      adminLastName: input.adminLastName,
      adminEmail: input.adminEmail,
      adminPassword: google ? null : input.adminPassword,
      adminConfirmPassword: google ? null : input.adminConfirmPassword,
      phoneNumber: input.phoneNumber || null,
      googleIdToken: input.googleIdToken || null,
    }),
  })

  if (!upstream.ok) {
    const body = await upstream.json().catch(() => null)
    return NextResponse.json(problemToNormalizedError(upstream.status, body), { status: upstream.status })
  }

  const body = (await upstream.json().catch(() => null)) as {
    tenantId?: string
    provisioningCorrelationId?: string
    status?: string
  } | null

  return NextResponse.json(
    {
      ok: true,
      tenantId: body?.tenantId ?? null,
      provisioningCorrelationId: body?.provisioningCorrelationId ?? null,
      status: body?.status ?? null,
    },
    { status: 201 },
  )
}
