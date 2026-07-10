/**
 * Record supplier payment (sub-ledger + GL voucher).
 */

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { requireAuth, requireCSRF, requirePermission } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse, Errors } from "@/lib/api/response-utils"
import { logRequest } from "@/lib/api/logger"
import { rateLimit } from "@/app/api/middleware"
import { postSupplierPayment } from "@/lib/server/services/supplier-payment-service"

const bodySchema = z.object({
  supplier_id: z.string().uuid(),
  amount: z.number().positive(),
  payment_method: z.enum(["cash", "bank"]),
  payment_date: z.string().min(1),
  reference_note: z.string().max(500).optional().nullable(),
})

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) return rateLimitResult

  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult

  const perm = await requirePermission(request, "accounting:write")
  if (perm instanceof NextResponse) return perm

  const csrfResult = await requireCSRF(request)
  if (csrfResult) return csrfResult

  const tenantId = perm.user.tenantId
  if (!tenantId) {
    return Errors.FORBIDDEN("Tenant context is required")
  }

  try {
    const body = await request.json()
    const parsed = bodySchema.parse(body)
    const supabase = await createClient()

    const { data, error } = await postSupplierPayment(supabase, tenantId, perm.user.id, {
      supplier_id: parsed.supplier_id,
      amount: parsed.amount,
      payment_method: parsed.payment_method,
      payment_date: parsed.payment_date,
      reference_note: parsed.reference_note ?? undefined,
    })

    if (error) {
      logRequest(request, {
        status: 400,
        duration: Date.now() - startTime,
        userId: perm.user.id,
        error: error.message,
      })
      return errorResponse("PAYMENT_FAILED", error.message, { status: 400 })
    }

    logRequest(request, { status: 201, duration: Date.now() - startTime, userId: perm.user.id })
    return successResponse(data, { message: "Supplier payment recorded", status: 201 })
  } catch (e) {
    if (e instanceof z.ZodError) return Errors.VALIDATION_ERROR(e.errors)
    logRequest(request, {
      status: 500,
      duration: Date.now() - startTime,
      error: e instanceof Error ? e.message : String(e),
    })
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Payment failed")
  }
}
