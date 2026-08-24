/**
 * Void a received goods receipt — reverses stock and the supplier payable via a
 * full supplier return for every line (see voidGoodsReceipt,
 * lib/server/services/supplier-return-service.ts). Item 3 of the domain audit.
 */

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { requirePermission, requireCSRF } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse, Errors } from "@/lib/api/response-utils"
import { rateLimit } from "../../../../middleware"
import { voidGoodsReceipt } from "@/lib/server/services/supplier-return-service"
import { createAuditLog } from "@/lib/security/audit"

const bodySchema = z.object({
  reason: z.string().trim().min(1, "A reason is required").max(500),
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
    const { reason } = bodySchema.parse(body)

    const supabase = await createClient()
    const { error } = await voidGoodsReceipt(supabase, authResult.user.tenantId, authResult.user.id, id, reason)
    if (error) return errorResponse("VOID_FAILED", error.message, { status: 400 })

    await createAuditLog({
      tenant_id: authResult.user.tenantId,
      table_name: "goods_receipts",
      record_id: id,
      action: "UPDATE",
      new_data: { status: "cancelled", void_reason: reason },
    })

    return successResponse({ id }, { message: "Receipt voided — stock and payable were reversed" })
  } catch (e) {
    if (e instanceof z.ZodError) return Errors.VALIDATION_ERROR(e.errors)
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Internal server error")
  }
}
