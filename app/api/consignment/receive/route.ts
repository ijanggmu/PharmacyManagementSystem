/**
 * Receive consignment stock — supplier-owned stock placed on the shelf. See
 * lib/server/services/consignment-service.ts. Deliberately separate from
 * /api/purchases: no AP or GL entry is posted here (ownership hasn't
 * transferred), only stock/batch rows.
 */

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { requirePermission, requireCSRF } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse, Errors } from "@/lib/api/response-utils"
import { logRequest } from "@/lib/api/logger"
import { rateLimit } from "../../middleware"
import { receiveConsignmentStock } from "@/lib/server/services/consignment-service"

const bodySchema = z.object({
  medicine_id: z.string().uuid(),
  supplier_id: z.string().uuid(),
  branch_id: z.string().uuid().nullable().optional(),
  quantity: z.number().int().positive(),
  unit_cost: z.number().nonnegative(),
  batch_number: z.string().max(100).nullable().optional(),
  expiry_date: z.string().nullable().optional(),
  rack_location: z.string().max(60).nullable().optional(),
})

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) return rateLimitResult

  const authResult = await requirePermission(request, "inventory:write")
  if (authResult instanceof NextResponse) return authResult
  if (!authResult.user.tenantId) return Errors.FORBIDDEN("Tenant context is required")

  const csrfResult = await requireCSRF(request)
  if (csrfResult) return csrfResult

  try {
    const body = await request.json()
    const parsed = bodySchema.parse(body)

    const supabase = await createClient()
    const { data, error } = await receiveConsignmentStock(supabase, authResult.user.tenantId, authResult.user.id, {
      medicineId: parsed.medicine_id,
      supplierId: parsed.supplier_id,
      branchId: parsed.branch_id,
      quantity: parsed.quantity,
      unitCost: parsed.unit_cost,
      batchNumber: parsed.batch_number,
      expiryDate: parsed.expiry_date,
      rackLocation: parsed.rack_location,
    })
    if (error) return errorResponse("RECEIVE_FAILED", error.message, { status: 400 })

    logRequest(request, { status: 201, duration: Date.now() - startTime, userId: authResult.user.id })
    return successResponse(data, { message: "Consignment stock received", status: 201 })
  } catch (e) {
    if (e instanceof z.ZodError) return Errors.VALIDATION_ERROR(e.errors)
    logRequest(request, { status: 500, duration: Date.now() - startTime, userId: authResult.user.id, error: e instanceof Error ? e.message : String(e) })
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Internal server error")
  }
}
