/**
 * Dispose an expired batch — writes off its remaining quantity (stock decrement +
 * inventory_transactions + GL shrinkage voucher). See disposeExpiredBatch,
 * lib/server/services/medicine-service.ts. Item 10 of the domain audit.
 */

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { requirePermission, requireCSRF } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse, Errors } from "@/lib/api/response-utils"
import { rateLimit } from "../../../../middleware"
import { disposeExpiredBatch } from "@/lib/server/services/medicine-service"
import { createAuditLog } from "@/lib/security/audit"

const bodySchema = z.object({
  reason: z.string().max(500).nullable().optional(),
})

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) return rateLimitResult

  const authResult = await requirePermission(request, "inventory:write")
  if (authResult instanceof NextResponse) return authResult
  if (!authResult.user.tenantId) return Errors.FORBIDDEN("Tenant context required")

  const csrfResult = await requireCSRF(request)
  if (csrfResult) return csrfResult

  const { id } = await context.params

  try {
    const body = await request.json().catch(() => ({}))
    const { reason } = bodySchema.parse(body)

    const supabase = await createClient()
    const { error } = await disposeExpiredBatch(supabase, authResult.user.tenantId, authResult.user.id, id, reason ?? null)
    if (error) return errorResponse("DISPOSE_FAILED", error.message, { status: 400 })

    await createAuditLog({
      tenant_id: authResult.user.tenantId,
      table_name: "medicine_batches",
      record_id: id,
      action: "UPDATE",
      new_data: { disposed: true, reason },
    })

    return successResponse({ id }, { message: "Batch disposed and written off" })
  } catch (e) {
    if (e instanceof z.ZodError) return Errors.VALIDATION_ERROR(e.errors)
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Internal server error")
  }
}
