/**
 * Bulk opening stock import for the migration wizard. See
 * lib/server/services/migration-service.ts#importOpeningStock.
 */

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { requirePermission, requireCSRF } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse, Errors } from "@/lib/api/response-utils"
import { logRequest } from "@/lib/api/logger"
import { rateLimit } from "../../middleware"
import { importOpeningStock } from "@/lib/server/services/migration-service"

const bodySchema = z.object({
  branch_id: z.string().uuid(),
  items: z
    .array(
      z.object({
        medicine_id: z.string().uuid(),
        quantity: z.number().int().positive(),
        unit_cost: z.number().nonnegative(),
        batch_number: z.string().max(100).nullable().optional(),
        expiry_date: z.string().nullable().optional(),
      })
    )
    .min(1)
    .max(500),
})

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) return rateLimitResult

  const authResult = await requirePermission(request, "settings:write")
  if (authResult instanceof NextResponse) return authResult
  if (!authResult.user.tenantId) return Errors.FORBIDDEN("Tenant context is required")

  const csrfResult = await requireCSRF(request)
  if (csrfResult) return csrfResult

  try {
    const body = await request.json()
    const parsed = bodySchema.parse(body)

    const supabase = await createClient()
    const { data, error } = await importOpeningStock(
      supabase,
      authResult.user.tenantId,
      authResult.user.id,
      parsed.branch_id,
      parsed.items.map((i) => ({
        medicineId: i.medicine_id,
        quantity: i.quantity,
        unitCost: i.unit_cost,
        batchNumber: i.batch_number,
        expiryDate: i.expiry_date,
      }))
    )
    if (error) return errorResponse("IMPORT_FAILED", error.message, { status: 400 })

    logRequest(request, { status: 200, duration: Date.now() - startTime, userId: authResult.user.id })
    return successResponse(data, { message: `Imported ${data?.imported ?? 0} opening stock line(s)` })
  } catch (e) {
    if (e instanceof z.ZodError) return Errors.VALIDATION_ERROR(e.errors)
    logRequest(request, { status: 500, duration: Date.now() - startTime, userId: authResult.user.id, error: e instanceof Error ? e.message : String(e) })
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Internal server error")
  }
}
