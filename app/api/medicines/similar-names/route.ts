/**
 * LASA (look-alike-sound-alike) check — non-blocking name-similarity lookup used by the
 * create/edit medicine forms to warn staff before saving a name that's dangerously close
 * to an existing one (e.g. "Amlodipine" vs "Amlopres").
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requirePermission } from "@/lib/api/auth-middleware"
import { successResponse, Errors } from "@/lib/api/response-utils"
import { rateLimit } from "../../middleware"
import { findSimilarMedicineNames } from "@/lib/server/services/medicine-service"

export async function GET(request: NextRequest) {
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) return rateLimitResult

  const authResult = await requirePermission(request, "inventory:read")
  if (authResult instanceof NextResponse) return authResult
  if (!authResult.user.tenantId) return Errors.FORBIDDEN("Tenant context required")

  const { searchParams } = new URL(request.url)
  const name = searchParams.get("name") || ""
  const excludeId = searchParams.get("excludeId") || undefined

  try {
    const supabase = await createClient()
    const { data, error } = await findSimilarMedicineNames(supabase, authResult.user.tenantId, name, excludeId)
    if (error) return Errors.INTERNAL_ERROR(error.message)
    return successResponse(data)
  } catch (e) {
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Internal server error")
  }
}
