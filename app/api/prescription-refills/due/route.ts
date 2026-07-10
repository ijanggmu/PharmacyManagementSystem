import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/api/auth-middleware"
import { successResponse, Errors } from "@/lib/api/response-utils"
import { logRequest } from "@/lib/api/logger"
import { rateLimit } from "../../middleware"

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) return rateLimitResult
  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult
  if (!authResult.user.tenantId) return Errors.FORBIDDEN("Tenant context required")

  try {
    const { searchParams } = new URL(request.url)
    const daysAhead = Math.max(0, parseInt(searchParams.get("daysAhead") || "7", 10) || 7)
    // Pure epoch-millis arithmetic — `Date.setDate()` interprets day boundaries in the
    // server process's local timezone before `.toISOString()` converts back to UTC,
    // which can shift the computed date by a day near midnight if the server isn't
    // running in UTC. Adding milliseconds directly sidesteps that entirely.
    const targetDate = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000)
    const dateStr = targetDate.toISOString().split("T")[0]

    const supabase = await createClient()
    const { data, error } = await supabase
      .from("prescription_refills")
      .select(`
        *,
        prescriptions (
          id,
          prescription_number,
          customers (id, first_name, last_name, phone, email)
        )
      `)
      .eq("tenant_id", authResult.user.tenantId)
      .not("next_refill_date", "is", null)
      .lte("next_refill_date", dateStr)
      .neq("status", "cancelled")
      .order("next_refill_date", { ascending: true })

    if (error) return Errors.INTERNAL_ERROR(error.message)
    logRequest(request, { status: 200, duration: Date.now() - startTime, userId: authResult.user.id })
    return successResponse(data || [])
  } catch (e) {
    logRequest(request, { status: 500, duration: Date.now() - startTime, userId: authResult.user.id, error: String(e) })
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Internal server error")
  }
}

