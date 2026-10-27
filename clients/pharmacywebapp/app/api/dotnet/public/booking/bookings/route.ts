import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { z } from "zod"
import { requireCSRF } from "@/lib/api/auth-middleware"
import { problemToNormalizedError } from "@/lib/api/dotnet-problem"
import { dotnetBaseUrl, dotnetHeaders, forwardedForHeaders, problem } from "@/lib/api/dotnet-bff"
import { bookingTenant } from "../tenant"

const bodySchema = z.object({
  code: z.string().max(64).nullish(),
  doctorId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  patientName: z.string().trim().min(1).max(200),
  patientPhone: z.string().trim().min(1).max(32),
})

/**
 * Anonymous BFF for a patient's booking from the public page (POST /api/v1/appointments/online/bookings). Only
 * forwards the booking fields; the API applies the owner's switch and limits and rate-limits by pharmacy and IP,
 * so the patient's IP is passed on.
 */
export async function POST(request: NextRequest) {
  const csrf = await requireCSRF(request)
  if (csrf) return csrf

  const baseUrl = dotnetBaseUrl()
  if (!baseUrl) return problem(503, "NOT_CONFIGURED", "DOTNET_API_URL is not set")

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return problem(400, "VALIDATION_ERROR", "Fill in the patient's name and mobile number.")

  const { code, ...booking } = parsed.data
  const tenant = bookingTenant(request, code)
  if (!tenant) return problem(404, "NOT_FOUND", "Open the booking link your pharmacy gave you.")

  const upstream = await fetch(`${baseUrl}/api/v1/appointments/online/bookings`, {
    method: "POST",
    headers: dotnetHeaders(tenant, { "Content-Type": "application/json", ...forwardedForHeaders(request.headers) }),
    body: JSON.stringify(booking),
    cache: "no-store",
  }).catch(() => null)
  if (!upstream) return problem(503, "UNAVAILABLE", "Booking is not available right now. Please try again.")

  const body = await upstream.json().catch(() => null)
  if (!upstream.ok) {
    return NextResponse.json(problemToNormalizedError(upstream.status, body), { status: upstream.status })
  }
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } })
}
