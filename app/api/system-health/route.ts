import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireAuth, requirePermission } from "@/lib/api/auth-middleware"
import { rateLimit } from "@/app/api/middleware"
import { logRequest } from "@/lib/api/logger"
import { Errors } from "@/lib/api/response-utils"
import { getSystemHealthForTenant } from "@/lib/server/services/system-diagnostics-service"

export async function GET(request: NextRequest) {
  const startTime = Date.now()

  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) {
    logRequest(request, { status: 429, duration: Date.now() - startTime })
    return rateLimitResult
  }

  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) {
    logRequest(request, { status: 401, duration: Date.now() - startTime })
    return authResult
  }

  // Restrict to users who can view settings/reports (typically admins/managers)
  const permResult = await requirePermission(request, "settings:read")
  if (permResult instanceof NextResponse) {
    logRequest(request, { status: 403, duration: Date.now() - startTime })
    return permResult
  }

  try {
    const supabase = await createClient()
    const { data, error } = await getSystemHealthForTenant(supabase, permResult.user.tenantId)
    if (error) return Errors.INTERNAL_ERROR(error.message)

    logRequest(request, {
      status: 200,
      duration: Date.now() - startTime,
      userId: permResult.user.id,
    })

    return NextResponse.json({ data })
  } catch (error: any) {
    logRequest(request, {
      status: 500,
      duration: Date.now() - startTime,
      userId: permResult.user.id,
      error: error?.message,
    })

    return Errors.INTERNAL_ERROR(error?.message || "Failed to load system health")
  }
}
