/**
 * Inter-branch stock transfer — list and create.
 */

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { requireAuth, requireCSRF, requirePermission } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse, Errors } from "@/lib/api/response-utils"
import { rateLimit } from "../middleware"
import { createStockTransfer, listStockTransfers } from "@/lib/server/services/stock-transfer-service"

const createSchema = z.object({
  from_branch_id: z.string().uuid(),
  to_branch_id: z.string().uuid(),
  notes: z.string().max(500).optional().nullable(),
  items: z
    .array(
      z.object({
        medicine_id: z.string().uuid(),
        quantity: z.number().int().positive(),
      })
    )
    .min(1, "At least one item is required"),
})

export async function GET(request: NextRequest) {
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) return rateLimitResult

  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult
  const perm = await requirePermission(request, "inventory:read")
  if (perm instanceof NextResponse) return perm
  if (!perm.user.tenantId) return Errors.FORBIDDEN("Tenant context required")

  try {
    const { searchParams } = new URL(request.url)
    const supabase = await createClient()
    const data = await listStockTransfers(supabase, perm.user.tenantId, {
      branchId: searchParams.get("branchId") || undefined,
      limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined,
    })
    return successResponse(data)
  } catch (e) {
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Internal server error")
  }
}

export async function POST(request: NextRequest) {
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) return rateLimitResult

  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult
  const perm = await requirePermission(request, "inventory:write")
  if (perm instanceof NextResponse) return perm
  if (!perm.user.tenantId) return Errors.FORBIDDEN("Tenant context required")

  const csrfResult = await requireCSRF(request)
  if (csrfResult) return csrfResult

  try {
    const body = await request.json()
    const parsed = createSchema.parse(body)
    if (parsed.from_branch_id === parsed.to_branch_id) {
      return errorResponse("VALIDATION_ERROR", "Source and destination branch must differ", { status: 400 })
    }
    const supabase = await createClient()
    const { data, error } = await createStockTransfer(supabase, perm.user.tenantId, perm.user.id, parsed)
    if (error) return errorResponse("TRANSFER_FAILED", error.message, { status: 400 })
    return successResponse(data, { message: "Stock transfer completed", status: 201 })
  } catch (e) {
    if (e instanceof z.ZodError) return Errors.VALIDATION_ERROR(e.errors)
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Internal server error")
  }
}
