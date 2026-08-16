/**
 * Restore an archived medicine (is_active = false -> true). See DELETE on
 * app/api/medicines/[id]/route.ts, which archives instead of hard-deleting
 * whenever the medicine has transaction history.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requirePermission, requireCSRF } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse } from "@/lib/api/response-utils"
import { logRequest } from "@/lib/api/logger"
import { rateLimit } from "../../../middleware"
import { unarchiveMedicine } from "@/lib/server/services/medicine-service"
import { createAuditLog } from "@/lib/security/audit"

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now()
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) return rateLimitResult

  const authResult = await requirePermission(request, "inventory:delete")
  if (authResult instanceof NextResponse) return authResult

  const csrfResult = await requireCSRF(request)
  if (csrfResult) return csrfResult

  const tenantId = authResult.user.tenantId
  if (!tenantId) {
    return errorResponse("FORBIDDEN", "Tenant context is required for medicines", { status: 403 })
  }

  const { id } = await context.params

  try {
    const supabase = await createClient()
    const { error } = await unarchiveMedicine(supabase, tenantId, id)
    if (error) {
      logRequest(request, { status: 400, duration: Date.now() - startTime, userId: authResult.user.id, error: error.message })
      return errorResponse("UNARCHIVE_FAILED", error.message, { status: 400 })
    }

    await createAuditLog({
      tenant_id: tenantId,
      table_name: "medicines",
      record_id: id,
      action: "UPDATE",
      new_data: { is_active: true },
    })

    logRequest(request, { status: 200, duration: Date.now() - startTime, userId: authResult.user.id })
    return successResponse({ id }, { message: "Medicine restored" })
  } catch (e) {
    logRequest(request, { status: 500, duration: Date.now() - startTime, userId: authResult.user.id, error: String(e) })
    return errorResponse("INTERNAL_ERROR", e instanceof Error ? e.message : "Internal server error", { status: 500 })
  }
}
