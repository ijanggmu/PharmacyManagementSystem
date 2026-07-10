import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/api/auth-middleware"
import { successResponse, Errors } from "@/lib/api/response-utils"
import { getReportsOverviewData } from "@/lib/server/services/reports-service"

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult

  const { searchParams } = new URL(request.url)
  const from = searchParams.get("from")
  const to = searchParams.get("to")
  if (!from || !to) return Errors.BAD_REQUEST("from and to are required")

  try {
    const supabase = await createClient()
    const tenantId = authResult.user.tenantId
    if (!tenantId) return Errors.FORBIDDEN("Tenant required")

    const overview = await getReportsOverviewData(supabase, tenantId, from, to)

    return successResponse({
      ...overview,
      exportedBy: authResult.user.email,
    })
  } catch (error) {
    return Errors.INTERNAL_ERROR(error instanceof Error ? error.message : "Failed to load reports")
  }
}
