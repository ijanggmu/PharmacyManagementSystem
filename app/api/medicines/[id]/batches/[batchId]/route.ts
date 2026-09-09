/** Update a batch's shelf/rack/bin location. */

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { requirePermission, requireCSRF } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse, Errors } from "@/lib/api/response-utils"
import { rateLimit } from "../../../../middleware"
import { updateBatchRackLocation } from "@/lib/server/services/medicine-service"

const bodySchema = z.object({
  rack_location: z.string().max(60).nullable(),
})

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string; batchId: string }> }) {
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) return rateLimitResult

  const authResult = await requirePermission(request, "inventory:write")
  if (authResult instanceof NextResponse) return authResult
  if (!authResult.user.tenantId) return Errors.FORBIDDEN("Tenant context required")

  const csrfResult = await requireCSRF(request)
  if (csrfResult) return csrfResult

  try {
    const { batchId } = await context.params
    const body = await request.json()
    const parsed = bodySchema.parse(body)

    const supabase = await createClient()
    const { error } = await updateBatchRackLocation(supabase, authResult.user.tenantId, batchId, parsed.rack_location?.trim() || null)
    if (error) return errorResponse("UPDATE_FAILED", error.message, { status: 400 })

    return successResponse({ updated: true })
  } catch (e) {
    if (e instanceof z.ZodError) return Errors.VALIDATION_ERROR(e.errors)
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Internal server error")
  }
}
