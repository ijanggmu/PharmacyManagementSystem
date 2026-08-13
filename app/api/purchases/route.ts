/**
 * Purchase orders — list and create.
 */

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireAuth, requireCSRF, requirePermission } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse, Errors } from "@/lib/api/response-utils"
import { logRequest } from "@/lib/api/logger"
import { rateLimit } from "../middleware"
import { createClient } from "@/lib/supabase/server"
import { createPurchaseOrder, listPurchaseOrders } from "@/lib/server/services/purchase-service"

const createBodySchema = z.object({
  supplier_id: z.string().uuid(),
  order_date: z.string().min(1),
  expected_delivery_date: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  items: z
    .array(
      z.object({
        medicine_id: z.string().uuid(),
        quantity_ordered: z.number().int().positive(),
        unit_cost: z.string().min(1),
      })
    )
    .default([]),
})

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) return rateLimitResult

  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult

  const perm = await requirePermission(request, "inventory:read")
  if (perm instanceof NextResponse) return perm

  const tenantId = perm.user.tenantId
  if (!tenantId) {
    return Errors.FORBIDDEN("Tenant context is required for purchase orders")
  }

  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status") || undefined
    const supplierId = searchParams.get("supplierId") || undefined
    const page = parseInt(searchParams.get("page") || "1")
    const limit = parseInt(searchParams.get("limit") || "50")

    const result = await listPurchaseOrders(supabase, { status, supplierId, page, limit })

    logRequest(request, { status: 200, duration: Date.now() - startTime, userId: perm.user.id })
    return successResponse(result.data, {
      meta: {
        page: result.page,
        limit: result.limit,
        total: result.count,
        totalPages: result.totalPages,
      },
    })
  } catch (e) {
    logRequest(request, {
      status: 500,
      duration: Date.now() - startTime,
      userId: perm.user.id,
      error: e instanceof Error ? e.message : String(e),
    })
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Internal server error")
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) return rateLimitResult

  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult

  const perm = await requirePermission(request, "inventory:write")
  if (perm instanceof NextResponse) return perm

  const csrfResult = await requireCSRF(request)
  if (csrfResult) return csrfResult

  try {
    const tenantId = perm.user.tenantId
    if (!tenantId) {
      return Errors.FORBIDDEN("Tenant context is required for purchase orders")
    }

    const body = await request.json()
    const parsed = createBodySchema.parse(body)
    const supabase = await createClient()

    const data = await createPurchaseOrder(
      supabase,
      {
        supplier_id: parsed.supplier_id,
        order_date: parsed.order_date,
        expected_delivery_date: parsed.expected_delivery_date ?? undefined,
        notes: parsed.notes ?? undefined,
        items: parsed.items,
      },
      tenantId,
      perm.user.id
    )

    logRequest(request, { status: 201, duration: Date.now() - startTime, userId: perm.user.id })
    return successResponse(data, { message: "Purchase order created", status: 201 })
  } catch (e) {
    if (e instanceof z.ZodError) return Errors.VALIDATION_ERROR(e.errors)
    logRequest(request, {
      status: 400,
      duration: Date.now() - startTime,
      userId: perm.user.id,
      error: e instanceof Error ? e.message : String(e),
    })
    return errorResponse("CREATE_FAILED", e instanceof Error ? e.message : "Create failed", { status: 400 })
  }
}
