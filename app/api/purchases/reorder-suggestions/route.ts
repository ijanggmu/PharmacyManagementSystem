/**
 * Reorder suggestions — medicines at/below minimum stock, or on track to run out
 * before a new order could arrive given recent sales velocity. Advisory only; see
 * getReorderSuggestions in lib/server/services/purchase-service.ts.
 */

import { NextRequest, NextResponse } from "next/server"
import { requirePermission } from "@/lib/api/auth-middleware"
import { successResponse, Errors } from "@/lib/api/response-utils"
import { rateLimit } from "../../middleware"
import { createClient } from "@/lib/supabase/server"
import { getReorderSuggestions } from "@/lib/server/services/purchase-service"

export async function GET(request: NextRequest) {
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) return rateLimitResult

  const authResult = await requirePermission(request, "inventory:read")
  if (authResult instanceof NextResponse) return authResult
  if (!authResult.user.tenantId) return Errors.FORBIDDEN("Tenant context required")

  try {
    const supabase = await createClient()
    const { data, error } = await getReorderSuggestions(supabase, authResult.user.tenantId)
    if (error) return Errors.INTERNAL_ERROR(error.message)
    return successResponse(data)
  } catch (e) {
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Internal server error")
  }
}
