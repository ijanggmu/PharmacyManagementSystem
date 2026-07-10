import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/api/auth-middleware"
import { Errors, successResponse } from "@/lib/api/response-utils"
import { logRequest } from "@/lib/api/logger"
import { rateLimit } from "@/app/api/middleware"
import { parseSearchNepalCatalogInput, searchNepalMedicineCatalog } from "@/lib/server/services/medicine-catalog-service"

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) return rateLimitResult

  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult

  try {
    const { searchParams } = new URL(request.url)
    const input = parseSearchNepalCatalogInput(searchParams)

    const supabase = await createClient()
    const { data, error } = await searchNepalMedicineCatalog(supabase, input)
    if (error) return Errors.INTERNAL_ERROR(error.message)

    logRequest(request, { status: 200, duration: Date.now() - startTime, userId: authResult.user.id })
    return successResponse(data)
  } catch (error) {
    logRequest(request, {
      status: 500,
      duration: Date.now() - startTime,
      userId: authResult.user.id,
      error: error instanceof Error ? error.message : "Unknown error",
    })
    return Errors.INTERNAL_ERROR(error instanceof Error ? error.message : "Internal server error")
  }
}
