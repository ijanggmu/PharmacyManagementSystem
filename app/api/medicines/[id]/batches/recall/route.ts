/**
 * Recall a batch (lot) — flags every row of this batch_number across all branches as
 * recalled, blocking it from FEFO sale everywhere it exists. See scripts/85-inventory-safety-controls.sql.
 */

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { requirePermission, requireCSRF } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse, Errors } from "@/lib/api/response-utils"
import { rateLimit } from "../../../../middleware"
import { recallMedicineBatch } from "@/lib/server/services/medicine-service"
import { createAuditLog } from "@/lib/security/audit"

const recallSchema = z.object({
  batch_number: z.string().min(1).max(100),
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
    const body = await request.json()
    const { batch_number, reason } = recallSchema.parse(body)

    const supabase = await createClient()
    const { affected, error } = await recallMedicineBatch(
      supabase,
      authResult.user.tenantId,
      id,
      batch_number,
      authResult.user.id,
      reason ?? null
    )

    if (error) return errorResponse("RECALL_FAILED", error.message, { status: 400 })
    if (affected === 0) {
      return errorResponse("NOT_FOUND", "No active batch rows found for that batch number.", { status: 404 })
    }

    await createAuditLog({
      tenant_id: authResult.user.tenantId,
      table_name: "medicine_batches",
      record_id: id,
      action: "UPDATE",
      new_data: { batch_number, recalled: true, reason, affected_rows: affected },
    })

    return successResponse({ affected }, { message: `Recalled ${affected} batch row(s)` })
  } catch (e) {
    if (e instanceof z.ZodError) return Errors.VALIDATION_ERROR(e.errors)
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Internal server error")
  }
}
