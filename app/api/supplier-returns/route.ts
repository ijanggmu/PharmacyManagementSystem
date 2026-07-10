import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { requireAuth, requireCSRF } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse, Errors } from "@/lib/api/response-utils"
import { logRequest } from "@/lib/api/logger"
import { rateLimit } from "../middleware"
import { createSupplierReturnForTenant } from "@/lib/server/services/supplier-return-service"

const createItemSchema = z.object({
  medicine_id: z.string().uuid(),
  quantity: z.number().int().positive(),
  unit_cost: z.number().nonnegative(),
  return_reason: z.string().min(1),
  notes: z.string().optional().nullable(),
})

const createSchema = z.object({
  supplier_id: z.string().uuid(),
  notes: z.string().optional().nullable(),
  items: z.array(createItemSchema).min(1),
})

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) return rateLimitResult

  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult

  const csrfResult = await requireCSRF(request)
  if (csrfResult) return csrfResult

  const tenantId = authResult.user.tenantId
  if (!tenantId) return Errors.FORBIDDEN("Tenant context required")

  try {
    const body = await request.json()
    const input = createSchema.parse(body)
    const supabase = await createClient()

    const { data: returnHeader, error } = await createSupplierReturnForTenant(
      supabase,
      tenantId,
      authResult.user.id,
      input
    )

    if (error || !returnHeader) {
      return errorResponse("CREATE_FAILED", error?.message || "Failed to create supplier return", {
        status: 400,
      })
    }

    logRequest(request, { status: 201, duration: Date.now() - startTime, userId: authResult.user.id })
    return successResponse(returnHeader, { status: 201, message: "Supplier return created" })
  } catch (e) {
    if (e instanceof z.ZodError) return Errors.VALIDATION_ERROR(e.errors)
    logRequest(request, { status: 500, duration: Date.now() - startTime, userId: authResult.user.id, error: String(e) })
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Internal server error")
  }
}
