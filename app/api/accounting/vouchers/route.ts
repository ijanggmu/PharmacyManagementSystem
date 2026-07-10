import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireAuth, requirePermission, requireCSRF } from "@/lib/api/auth-middleware"
import { successResponse, Errors, errorResponse } from "@/lib/api/response-utils"
import { logRequest } from "@/lib/api/logger"
import { rateLimit } from "@/app/api/middleware"
import { createManualDraftVoucher, listVouchers } from "@/lib/server/services/accounting-service"
import { z } from "zod"

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) return rateLimitResult

  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult

  const perm = await requirePermission(request, "accounting:read")
  if (perm instanceof NextResponse) return perm

  if (!authResult.user.tenantId) {
    return Errors.FORBIDDEN("Tenant context required")
  }

  try {
    const { searchParams } = new URL(request.url)
    const supabase = await createClient()
    const { data, count, error } = await listVouchers(supabase, authResult.user.tenantId, {
      dateFrom: searchParams.get("dateFrom"),
      dateTo: searchParams.get("dateTo"),
      status: searchParams.get("status"),
      voucherType: searchParams.get("voucherType"),
      branchId: searchParams.get("branchId"),
      limit: parseInt(searchParams.get("limit") || "50", 10),
      offset: parseInt(searchParams.get("offset") || "0", 10),
    })
    if (error) {
      logRequest(request, { status: 500, duration: Date.now() - startTime, userId: authResult.user.id, error: error.message })
      return Errors.INTERNAL_ERROR(error.message)
    }
    logRequest(request, { status: 200, duration: Date.now() - startTime, userId: authResult.user.id })
    return successResponse(data, {
      meta: {
        total: count,
        page: Math.floor(parseInt(searchParams.get("offset") || "0", 10) / Math.max(1, parseInt(searchParams.get("limit") || "50", 10))) + 1,
        limit: parseInt(searchParams.get("limit") || "50", 10),
        totalPages: Math.ceil(count / Math.max(1, parseInt(searchParams.get("limit") || "50", 10))),
      },
    })
  } catch (e) {
    logRequest(request, { status: 500, duration: Date.now() - startTime, userId: authResult.user.id, error: String(e) })
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Failed to list vouchers")
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) return rateLimitResult

  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult

  const perm = await requirePermission(request, "accounting:write")
  if (perm instanceof NextResponse) return perm

  const csrf = await requireCSRF(request)
  if (csrf) return csrf

  if (!authResult.user.tenantId) {
    return Errors.FORBIDDEN("Tenant context required")
  }

  try {
    const body = await request.json()
    const supabase = await createClient()
    const { data, error } = await createManualDraftVoucher(
      supabase,
      authResult.user.tenantId,
      authResult.user.id,
      body
    )
    if (error || !data) {
      const msg = error?.message || "Create failed"
      logRequest(request, { status: 400, duration: Date.now() - startTime, userId: authResult.user.id, error: msg })
      return errorResponse("CREATE_FAILED", msg, { status: 400 })
    }
    logRequest(request, { status: 201, duration: Date.now() - startTime, userId: authResult.user.id })
    return successResponse(data, { status: 201, message: "Draft voucher created" })
  } catch (e) {
    if (e instanceof z.ZodError) {
      return Errors.VALIDATION_ERROR(e.errors)
    }
    logRequest(request, { status: 500, duration: Date.now() - startTime, userId: authResult.user.id, error: String(e) })
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Failed to create voucher")
  }
}
